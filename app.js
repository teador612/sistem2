const THRESHOLD = 70;
const WINDOW_DAYS = 60;
const MIN_SAMPLES = 5;
const MARKETS = [
  { key: "ms1", label: "MS 1", odds: "ms1", result: "msResult", expected: "1" },
  { key: "ms0", label: "MS 0", odds: "ms0", result: "msResult", expected: "0" },
  { key: "ms2", label: "MS 2", odds: "ms2", result: "msResult", expected: "2" },
  { key: "iy15Over", label: "İY 1.5 Üst", odds: "iy15Over", result: "iy15Result", expected: "ÜST" },
  { key: "iy15Under", label: "İY 1.5 Alt", odds: "iy15Under", result: "iy15Result", expected: "ALT" },
  { key: "kgYes", label: "KG Var", odds: "kgYes", result: "kgResult", expected: "VAR" },
  { key: "kgNo", label: "KG Yok", odds: "kgNo", result: "kgResult", expected: "YOK" },
  { key: "over25", label: "2.5 Üst", odds: "over25", result: "over25Result", expected: "ÜST" },
  { key: "under25", label: "2.5 Alt", odds: "under25", result: "over25Result", expected: "ALT" }
];
let matches = [];
let historyIndexes = new Map();
const $ = (id) => document.getElementById(id);
const dateKey = (value) => String(value).slice(0, 10);
const dateObject = (value) => {
  return new Date(`${dateKey(value)}T00:00:00`);
};
const localDateKey = (value) => {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
};
const pct = (value) => {
  return value == null ? "—" : `%${Math.round(value)}`;
};
const lastItem = (items) => items[items.length - 1];
const formatOdds = (value) => {
  return value == null ? "—" : Number(value).toFixed(2);
};
function lowerBound(items, value) {
  let left = 0;
  let right = items.length;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (items[middle].date < value) {
      left = middle + 1;
    } else {
      right = middle;
    }
  }
  return left;
}
/* =========================================================
   GEÇMİŞ VERİ İNDEKSİ
   ========================================================= */
function buildHistoryIndexes() {
  historyIndexes = new Map();
  MARKETS.forEach((market) => {
    const marketIndex = new Map();
    matches.forEach((match) => {
      const odds = match.openingOdds?.[market.odds];
      const result = match.results?.[market.result];
      if (
        match.status !== "finished" ||
        odds == null ||
        result == null ||
        result === ""
      ) {
        return;
      }
      const key = String(Number(odds));
      if (!marketIndex.has(key)) {
        marketIndex.set(key, []);
      }
      marketIndex.get(key).push({
        date: dateKey(match.date),
        success: result === market.expected ? 1 : 0
      });
    });
    marketIndex.forEach((items) => {
      items.sort((a, b) => a.date.localeCompare(b.date));
      let total = 0;
      items.forEach((item) => {
        total += item.success;
        item.total = total;
      });
    });
    historyIndexes.set(market.key, marketIndex);
  });
}
/* =========================================================
   ORAN GEÇMİŞ ANALİZİ
   ========================================================= */
function getHistory(match, market) {
  const odds = match.openingOdds?.[market.odds];
  if (odds == null) {
    return {
      count: 0,
      successful: 0,
      rate: null
    };
  }
  const items =
    historyIndexes
      .get(market.key)
      ?.get(String(Number(odds))) || [];
  const start = new Date(dateObject(match.date));
  start.setDate(start.getDate() - WINDOW_DAYS);
  const startDate = localDateKey(start);
  /*
   * Çok önemli:
   * Seçilen maçın kendisini geçmiş analizine dahil etmiyoruz.
   */
  const from = lowerBound(items, startDate);
  const to = lowerBound(items, dateKey(match.date));
  const count = to - from;
  const before = from ? items[from - 1].total : 0;
  const successful =
    (to ? items[to - 1].total : 0) - before;
  return {
    count,
    successful,
    rate: count
      ? successful / count * 100
      : null
  };
}
function analyze(match) {
  return MARKETS
    .map((market) => ({
      market,
      ...getHistory(match, market)
    }))
    .filter((item) => item.count > 0);
}
function recommendationFor(match) {
  return analyze(match)
    .filter(
      (item) =>
        item.count >= MIN_SAMPLES &&
        item.rate >= THRESHOLD
    )
    .sort(
      (a, b) =>
        b.rate - a.rate ||
        b.count - a.count
    );
}
function outcome(match, recommendations) {
  if (
    match.status !== "finished" ||
    !recommendations.length
  ) {
    return "pending";
  }
  const won = recommendations.every(
    ({ market }) =>
      match.results?.[market.result] === market.expected
  );
  return won ? "won" : "lost";
}
/* =========================================================
   İSTATİSTİKLER
   ========================================================= */
function renderStats(selected, dayMatches) {
  const settled = dayMatches.flatMap((match) => {
    const recs = recommendationFor(match);
    return recs.length && match.status === "finished"
      ? [
          {
            won: outcome(match, recs) === "won"
          }
        ]
      : [];
  });
  const selectedDate = dateObject(selected);
  const windowStart = new Date(selectedDate);
  windowStart.setDate(
    windowStart.getDate() - WINDOW_DAYS
  );
  const overall = matches
    .filter((match) => {
      const matchDate = dateObject(match.date);
      return (
        matchDate >= windowStart &&
        matchDate <= selectedDate
      );
    })
    .flatMap((match) => {
      const recs = recommendationFor(match);
      const primary = recs[0];
      if (
        !primary ||
        match.status !== "finished"
      ) {
        return [];
      }
      return [
        {
          won:
            match.results?.[primary.market.result] ===
            primary.market.expected
        }
      ];
    });
  const ratio = (list) =>
    list.length
      ? list.filter((item) => item.won).length /
        list.length *
        100
      : null;
  $("daySuccess").textContent =
    pct(ratio(settled));
  $("daySuccessMeta").textContent =
    settled.length
      ? `${settled.length} tamamlanan öneri`
      : "Tamamlanan öneri yok";
  $("overallSuccess").textContent =
    pct(ratio(overall));
  $("overallSuccessMeta").textContent =
    overall.length
      ? `Son ${WINDOW_DAYS} gündeki ${overall.length} öneri`
      : `Son ${WINDOW_DAYS} günde tamamlanan öneri yok`;
  $("matchCount").textContent =
    dayMatches.length;
  const dates = matches
    .map((item) => dateKey(item.date))
    .sort();
  $("dataRange").textContent =
    dates.length
      ? `${dates[0]} – ${lastItem(dates)}`
      : "—";
  const updated = matches
    .map((item) => item.lastUpdated)
    .filter(Boolean)
    .sort();
  if (updated.length) {
    const parsed = new Date(lastItem(updated));
    $("lastUpdated").textContent =
      `Veri güncelleme zamanı: ${
        Number.isNaN(parsed.getTime())
          ? lastItem(updated)
          : parsed.toLocaleString("tr-TR")
      }`;
  } else {
    $("lastUpdated").textContent = "—";
  }
}
/* =========================================================
   DETAY
   ========================================================= */
function detailMarkup(analysis) {
  const eligible = analysis.filter(
    ({ count, rate }) =>
      count >= MIN_SAMPLES &&
      rate >= THRESHOLD
  );
  if (!eligible.length) {
    return `
      <p class="muted">
        %${THRESHOLD} veya üzeri ve en az
        ${MIN_SAMPLES} geçmiş eşleşmesi olan
        öneri bulunamadı.
      </p>
    `;
  }
  return `
    <div class="detail-grid">
      ${eligible
        .sort(
          (a, b) =>
            (b.rate ?? -1) -
            (a.rate ?? -1)
        )
        .map(
          ({
            market,
            count,
            rate
          }) => `
            <div class="detail-item ${
              rate >= THRESHOLD
                ? "good"
                : ""
            }">
              <span>${market.label}</span>
              <b>
                ${pct(rate)}
                <small>
                  (${count} maç)
                </small>
              </b>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}
/* =========================================================
   MAÇLAR
   ========================================================= */
function renderMatches(dayMatches) {
  const container = $("matches");
  container.innerHTML = "";
  if (!dayMatches.length) {
    container.innerHTML = `
      <div class="empty">
        Bu tarihte kayıtlı maç bulunamadı.
      </div>
    `;
    return;
  }
  dayMatches.forEach((match) => {
    const fragment =
      $("matchTemplate")
        .content
        .cloneNode(true);
    const card =
      fragment.querySelector(".match-card");
    const recs =
      recommendationFor(match);
    card.classList.add(
      outcome(match, recs)
    );
    fragment.querySelector(".league").textContent =
      match.league ||
      "Lig bilgisi yok";
    fragment.querySelector(".time").textContent =
      match.time || "—";
    fragment.querySelector(".home").textContent =
      match.homeTeam || "—";
    fragment.querySelector(".away").textContent =
      match.awayTeam || "—";
    fragment.querySelector(".ht-score").textContent =
      ["finished", "live"].includes(match.status)
        ? match.halfTimeScore || "—"
        : "—";
    fragment.querySelector(".ft-score").textContent =
      match.status === "finished"
        ? match.fullTimeScore || "—"
        : "—";
    fragment.querySelector(".recommendation").innerHTML =
      recs.length
        ? recs
            .map(
              ({
                market,
                rate,
                count
              }) => `
                <span class="pill">
                  ${market.label}
                  <em>
                    ${formatOdds(
                      match.openingOdds?.[
                        market.odds
                      ]
                    )}
                  </em>
                  <b>
                    ${pct(rate)}
                  </b>
                  <small>
                    ${count} eşleşme
                  </small>
                </span>
              `
            )
            .join("")
        : `
          <span class="no-recommendation">
            %${THRESHOLD} üzerinde ve en az
            ${MIN_SAMPLES}
            geçmiş eşleşmesi olan oran bulunamadı
          </span>
        `;
    const button =
      fragment.querySelector(".expand");
    const details =
      fragment.querySelector(".details");
    details.innerHTML =
      detailMarkup(analyze(match));
    button.addEventListener(
      "click",
      () => {
        const open = !details.hidden;
        details.hidden = open;
        button.setAttribute(
          "aria-expanded",
          String(!open)
        );
        button.textContent =
          open ? "+" : "−";
      }
    );
    container.appendChild(fragment);
  });
}
/* =========================================================
   EKRANI GÜNCELLE
   ========================================================= */
function render() {
  const selected =
    $("dateInput").value;
  const dayMatches =
    matches.filter(
      (match) =>
        dateKey(match.date) === selected
    );
  renderStats(
    selected,
    dayMatches
  );
  $("resultSummary").textContent =
    `${selected} tarihinde ${dayMatches.length} maç listelendi.`;
  renderMatches(dayMatches);
}
/* =========================================================
   TEK DATA DOSYASI
   ========================================================= */
async function loadData() {
  /*
   * Artık manifest yok.
   * Aylık dosya yok.
   *
   * Bütün veriler:
   * data/data.json
   */
  const response =
    await fetch(
      "data/data.json?cache=" +
      Date.now()
    );
  if (!response.ok) {
    throw new Error(
      "data/data.json yüklenemedi"
    );
  }
  const data =
    await response.json();
  if (!Array.isArray(data)) {
    throw new Error(
      "data/data.json bir dizi (array) olmalıdır"
    );
  }
  matches = data;
  matches.sort(
    (a, b) =>
      `${a.date}${a.time || ""}${a.homeTeam || ""}`
        .localeCompare(
          `${b.date}${b.time || ""}${b.homeTeam || ""}`
        )
  );
  buildHistoryIndexes();
}
/* =========================================================
   BAŞLANGIÇ
   ========================================================= */
async function init() {
  try {
    $("resultSummary").textContent =
      "Veriler yükleniyor...";
    await loadData();
    /*
     * Veri içerisindeki en eski ve en yeni
     * tarihleri bul.
     */
    const dates = matches
      .map((item) => dateKey(item.date))
      .filter(Boolean)
      .sort();
    if (dates.length) {
      $("dateInput").min = dates[0];
      $("dateInput").max = dates[dates.length - 1];
    }
    /*
     * Bugünün tarihi.
     */
    const now = new Date();
    const today =
      localDateKey(now);
    /*
     * Eğer bugün veri içerisinde yoksa,
     * veri içerisindeki en son tarihi seç.
     *
     * Böylece veri henüz bugüne ulaşmadığında
     * sayfa boş kalmaz.
     */
    if (
      dates.length &&
      dates.includes(today)
    ) {
      $("dateInput").value =
        today;
    } else if (dates.length) {
      $("dateInput").value =
        dates[dates.length - 1];
    } else {
      $("dateInput").value =
        today;
    }
    /*
     * Tarih değiştiğinde artık herhangi bir
     * dosya yüklenmiyor.
     *
     * Sadece mevcut data.json içerisinden
     * seçilen tarih filtreleniyor.
     */
    $("dateInput").addEventListener(
      "change",
      () => {
        render();
      }
    );
    /*
     * İlk ekran.
     */
    render();
  } catch (error) {
    console.error(error);
    $("matches").innerHTML = `
      <div class="empty">
        Veri dosyası yüklenemedi.
        <br><br>
        <small>
          data/data.json dosyasını kontrol edin.
        </small>
      </div>
    `;
  }
}
/* =========================================================
   BAŞLAT
   ========================================================= */
init();
/* =========================================================
   SERVICE WORKER
   ========================================================= */
if ("serviceWorker" in navigator) {
  window.addEventListener(
    "load",
    () => {
      navigator.serviceWorker
        .register("sw.js")
        .catch(() => {});
    }
  );
}
