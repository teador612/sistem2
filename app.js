const THRESHOLD = 70;
const WINDOW_DAYS = 60;
const MIN_SAMPLES = 5;

const $ = id => document.getElementById(id);

let matches = [];
let historyIndexes = new Map();
let recommendationCache = new Map();

const MARKETS = [
  {
    key: "ms1",
    label: "MS 1",
    odds: m => m.openingOdds?.ms1,
    result: m => getMsResult(m) === "1"
  },
  {
    key: "msX",
    label: "MS 0",
    odds: m => m.openingOdds?.msX,
    result: m => getMsResult(m) === "0"
  },
  {
    key: "ms2",
    label: "MS 2",
    odds: m => m.openingOdds?.ms2,
    result: m => getMsResult(m) === "2"
  },
  {
    key: "iy15Ust",
    label: "İY 1.5 Üst",
    odds: m => m.openingOdds?.iy15Ust,
    result: m => getIy15Result(m) === "ÜST"
  },
  {
    key: "iy15Alt",
    label: "İY 1.5 Alt",
    odds: m => m.openingOdds?.iy15Alt,
    result: m => getIy15Result(m) === "ALT"
  },
  {
    key: "kgVar",
    label: "KG Var",
    odds: m => m.openingOdds?.kgVar,
    result: m => getKgResult(m) === "VAR"
  },
  {
    key: "kgYok",
    label: "KG Yok",
    odds: m => m.openingOdds?.kgYok,
    result: m => getKgResult(m) === "YOK"
  },
  {
    key: "au25Ust",
    label: "2.5 Üst",
    odds: m => m.openingOdds?.au25Ust,
    result: m => get25Result(m) === "ÜST"
  },
  {
    key: "au25Alt",
    label: "2.5 Alt",
    odds: m => m.openingOdds?.au25Alt,
    result: m => get25Result(m) === "ALT"
  }
];

/* =========================================================
   GENEL YARDIMCILAR
========================================================= */

function number(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const n = Number(
    String(value).replace(",", ".")
  );

  return Number.isFinite(n) ? n : null;
}

function dateKey(value) {
  if (!value) return "";

  const text = String(value).trim();

  let m = text.match(
    /^(\d{4})[-/](\d{2})[-/](\d{2})/
  );

  if (m) {
    return `${m[1]}-${m[2]}-${m[3]}`;
  }

  m = text.match(
    /^(\d{2})[./-](\d{2})[./-](\d{4})/
  );

  if (m) {
    return `${m[3]}-${m[2]}-${m[1]}`;
  }

  return text.slice(0, 10);
}

function dayNumber(value) {
  const key = dateKey(value);

  if (!key) return NaN;

  const p = key.split("-");

  if (p.length !== 3) return NaN;

  const y = Number(p[0]);
  const m = Number(p[1]);
  const d = Number(p[2]);

  if (
    !Number.isFinite(y) ||
    !Number.isFinite(m) ||
    !Number.isFinite(d)
  ) {
    return NaN;
  }

  return Math.floor(
    Date.UTC(y, m - 1, d) / 86400000
  );
}

function getToday() {
  const d = new Date();

  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0")
  ].join("-");
}

function formatPercent(value) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return `%${Math.round(value)}`;
}

/* =========================================================
   SKOR
========================================================= */

function parseScore(score) {
  if (!score) return null;

  if (typeof score === "object") {
    const home = score.home;
    const away = score.away;

    if (
      home !== null &&
      home !== undefined &&
      away !== null &&
      away !== undefined &&
      home !== "" &&
      away !== ""
    ) {
      return `${home}-${away}`;
    }

    return null;
  }

  const text = String(score).trim();

  if (
    !text ||
    text === "-" ||
    text === "null" ||
    text === "undefined"
  ) {
    return null;
  }

  return text;
}

function getFullTimeScore(match) {
  return parseScore(
    match.score ??
    match.fullTimeScore
  );
}

function getHalfTimeScore(match) {
  return parseScore(
    match.halfTimeScore ??
    match.htScore
  );
}

/* =========================================================
   MAÇ DURUMU
========================================================= */

function isFinished(match) {
  const status = Number(match.status);

  if (status > 0) {
    return true;
  }

  const score = getFullTimeScore(match);

  if (!score) {
    return false;
  }

  return /^\d+\s*-\s*\d+$/.test(score);
}

/* =========================================================
   SONUÇLAR
========================================================= */

function getMsResult(match) {
  if (!isFinished(match)) {
    return null;
  }

  const score = getFullTimeScore(match);

  if (!score) return null;

  const p = score.split("-").map(Number);

  if (p.length !== 2) {
    return null;
  }

  if (p[0] > p[1]) return "1";
  if (p[0] === p[1]) return "0";

  return "2";
}

function getIy15Result(match) {
  const score = getHalfTimeScore(match);

  if (!score) return null;

  const p = score.split("-").map(Number);

  if (p.length !== 2) {
    return null;
  }

  return p[0] + p[1] >= 2
    ? "ÜST"
    : "ALT";
}

function getKgResult(match) {
  const score = getFullTimeScore(match);

  if (!score) return null;

  const p = score.split("-").map(Number);

  if (p.length !== 2) {
    return null;
  }

  return (
    p[0] > 0 &&
    p[1] > 0
  )
    ? "VAR"
    : "YOK";
}

function get25Result(match) {
  const score = getFullTimeScore(match);

  if (!score) return null;

  const p = score.split("-").map(Number);

  if (p.length !== 2) {
    return null;
  }

  return p[0] + p[1] >= 3
    ? "ÜST"
    : "ALT";
}

/* =========================================================
   GEÇMİŞ İNDEKSİ
=========================================================

   Eski sistem:
   market -> oran -> [yüzlerce kayıt]

   Yeni sistem:
   market -> oran -> gün -> {
      total,
      success
   }

   Böylece tahmin sırasında geçmiş maçların
   tamamını tekrar dolaşmak gerekmiyor.
========================================================= */

function buildHistoryIndexes() {
  historyIndexes.clear();

  for (const match of matches) {
    if (!isFinished(match)) {
      continue;
    }

    const day = dayNumber(match.date);

    if (!Number.isFinite(day)) {
      continue;
    }

    for (const market of MARKETS) {
      const odds = number(
        market.odds(match)
      );

      if (odds === null) {
        continue;
      }

      const result = market.result(match);

      if (result === null) {
        continue;
      }

      const key =
        `${market.key}|${odds.toFixed(2)}`;

      let dayMap =
        historyIndexes.get(key);

      if (!dayMap) {
        dayMap = new Map();
        historyIndexes.set(key, dayMap);
      }

      let stats =
        dayMap.get(day);

      if (!stats) {
        stats = {
          total: 0,
          success: 0
        };

        dayMap.set(day, stats);
      }

      stats.total++;

      if (result) {
        stats.success++;
      }
    }
  }
}

/* =========================================================
   ORAN ANALİZİ
========================================================= */

function analyzeMarket(match, market) {
  const odds = number(
    market.odds(match)
  );

  if (odds === null) {
    return null;
  }

  const currentDay =
    dayNumber(match.date);

  if (!Number.isFinite(currentDay)) {
    return null;
  }

  const key =
    `${market.key}|${odds.toFixed(2)}`;

  const dayMap =
    historyIndexes.get(key);

  if (!dayMap) {
    return {
      odds,
      samples: 0,
      successRate: null
    };
  }

  let samples = 0;
  let successCount = 0;

  const firstDay =
    currentDay - WINDOW_DAYS;

  for (
    let day = firstDay;
    day < currentDay;
    day++
  ) {
    const stats =
      dayMap.get(day);

    if (!stats) {
      continue;
    }

    samples += stats.total;
    successCount += stats.success;
  }

  if (samples < MIN_SAMPLES) {
    return {
      odds,
      samples,
      successRate: null
    };
  }

  return {
    odds,
    samples,
    successRate:
      (successCount / samples) * 100
  };
}

/* =========================================================
   TAHMİN CACHE
========================================================= */

function getMatchId(match) {
  return String(
    match.code ??
    match.id ??
    `${dateKey(match.date)}|${match.time}|${match.home}|${match.away}`
  );
}

function getRecommendations(match) {
  const id = getMatchId(match);

  const cached =
    recommendationCache.get(id);

  if (cached) {
    return cached;
  }

  const recommendations = [];

  for (const market of MARKETS) {
    const analysis =
      analyzeMarket(
        match,
        market
      );

    if (!analysis) {
      continue;
    }

    if (
      analysis.samples <
      MIN_SAMPLES
    ) {
      continue;
    }

    if (
      analysis.successRate === null ||
      analysis.successRate < THRESHOLD
    ) {
      continue;
    }

    recommendations.push({
      ...market,
      ...analysis
    });
  }

  recommendations.sort(
    (a, b) => {
      if (
        b.successRate !==
        a.successRate
      ) {
        return (
          b.successRate -
          a.successRate
        );
      }

      return (
        b.samples -
        a.samples
      );
    }
  );

  recommendationCache.set(
    id,
    recommendations
  );

  return recommendations;
}

/* =========================================================
   TAHMİN SONUCU
========================================================= */

function getRecommendationStatus(
  match,
  recommendation
) {
  if (!isFinished(match)) {
    return "pending";
  }

  return recommendation.result(match)
    ? "won"
    : "lost";
}

/* =========================================================
   KART DURUMU
========================================================= */

function getMatchCardStatus(
  match,
  recommendations
) {
  if (!recommendations.length) {
    return "pending";
  }

  if (!isFinished(match)) {
    return "pending";
  }

  let won = 0;
  let lost = 0;

  for (const item of recommendations) {
    const status =
      getRecommendationStatus(
        match,
        item
      );

    if (status === "won") {
      won++;
    }

    if (status === "lost") {
      lost++;
    }
  }

  if (
    won === recommendations.length
  ) {
    return "won";
  }

  if (
    lost === recommendations.length
  ) {
    return "lost";
  }

  return "pending";
}

/* =========================================================
   DETAY
========================================================= */

function renderRecommendationDetails(
  match,
  recommendations
) {
  return `
    <div class="details-section">
      <strong>Öneriler</strong>

      ${recommendations.map(item => {

        const status =
          getRecommendationStatus(
            match,
            item
          );

        let icon = "🟡";
        let text = "Bekliyor";

        if (status === "won") {
          icon = "🟢";
          text = "Tuttu";
        }

        if (status === "lost") {
          icon = "🔴";
          text = "Tutmadı";
        }

        return `
          <div class="recommendation-detail-card">

            <div class="recommendation-detail-top">
              <strong>
                ${icon} ${item.label}
              </strong>

              <b>
                ${formatPercent(
                  item.successRate
                )}
              </b>
            </div>

            <div class="recommendation-detail-bottom">

              <span>
                Oran: ${item.odds}
              </span>

              <span>
                Geçmiş: ${item.samples} maç
              </span>

              <span>
                ${text}
              </span>

            </div>

          </div>
        `;
      }).join("")}

    </div>
  `;
}

/* =========================================================
   MAÇ KARTI
========================================================= */

function renderMatch(
  match,
  recommendations
) {
  const template =
    $("matchTemplate");

  if (!template) {
    return null;
  }

  /*
    Tahmini olmayan maç burada da
    kesin olarak gizleniyor.
  */
  if (!recommendations.length) {
    return null;
  }

  const fragment =
    template.content.cloneNode(true);

  const card =
    fragment.querySelector(
      ".match-card"
    );

  const league =
    fragment.querySelector(
      ".league"
    );

  if (league) {
    league.textContent =
      match.league || "Lig";
  }

  const time =
    fragment.querySelector(
      ".time"
    );

  if (time) {
    time.textContent =
      match.time || "";
  }

  const home =
    fragment.querySelector(
      ".home"
    );

  if (home) {
    home.textContent =
      match.home ||
      match.homeTeam ||
      "";
  }

  const away =
    fragment.querySelector(
      ".away"
    );

  if (away) {
    away.textContent =
      match.away ||
      match.awayTeam ||
      "";
  }

  const ht =
    fragment.querySelector(
      ".ht-score"
    );

  if (ht) {
    ht.textContent =
      getHalfTimeScore(match) ||
      "—";
  }

  const ft =
    fragment.querySelector(
      ".ft-score"
    );

  if (ft) {
    ft.textContent =
      getFullTimeScore(match) ||
      "—";
  }

  const cardStatus =
    getMatchCardStatus(
      match,
      recommendations
    );

  if (card) {
    card.classList.add(
      `status-${cardStatus}`
    );
  }

  const recommendation =
    fragment.querySelector(
      ".recommendation"
    );

  if (recommendation) {
    recommendation.innerHTML =
      recommendations.map(item => {

        const status =
          getRecommendationStatus(
            match,
            item
          );

        const icon =
          status === "won"
            ? "🟢"
            : status === "lost"
              ? "🔴"
              : "🟡";

        return `
          <span class="recommendation-item ${status}">

            <span>
              ${icon} ${item.label}
            </span>

            <b>
              ${formatPercent(
                item.successRate
              )}
            </b>

            <small>
              ${item.samples} geçmiş
            </small>

          </span>
        `;
      }).join("");
  }

  const details =
    fragment.querySelector(
      ".details"
    );

  if (details) {
    details.innerHTML =
      renderRecommendationDetails(
        match,
        recommendations
      );
  }

  const expand =
    fragment.querySelector(
      ".expand"
    );

  if (expand && details) {
    expand.addEventListener(
      "click",
      () => {
        const opened =
          expand.getAttribute(
            "aria-expanded"
          ) === "true";

        expand.setAttribute(
          "aria-expanded",
          String(!opened)
        );

        expand.textContent =
          opened ? "+" : "−";

        details.hidden =
          opened;
      }
    );
  }

  return card;
}

/* =========================================================
   İSTATİSTİK
========================================================= */

function renderStats(predicted) {
  let won = 0;
  let lost = 0;
  let recommendationsCount = 0;

  /*
    SADECE ekranda bulunan tahminler.
    Artık bütün matches taranmıyor.
  */
  for (const item of predicted) {
    recommendationsCount +=
      item.recommendations.length;

    for (
      const recommendation
      of item.recommendations
    ) {
      const status =
        getRecommendationStatus(
          item.match,
          recommendation
        );

      if (status === "won") {
        won++;
      }

      if (status === "lost") {
        lost++;
      }
    }
  }

  const completed =
    won + lost;

  const success =
    completed > 0
      ? (won / completed) * 100
      : null;

  if ($("daySuccess")) {
    $("daySuccess").textContent =
      formatPercent(success);
  }

  if ($("daySuccessMeta")) {
    $("daySuccessMeta").textContent =
      completed
        ? `${won} tuttu / ${lost} tutmadı`
        : recommendationsCount
          ? `${recommendationsCount} öneri bekliyor`
          : "Öneri yok";
  }
}

/* =========================================================
   TARİH MAÇLARI
========================================================= */

function getDayMatches(selectedDate) {
  const result = [];

  for (const match of matches) {
    if (
      match._date ===
      selectedDate
    ) {
      result.push(match);
    }
  }

  return result;
}

/* =========================================================
   SADECE TAHMİNLİ MAÇLAR
========================================================= */

function getPredictedMatches(dayMatches) {
  const result = [];

  for (const match of dayMatches) {
    const recommendations =
      getRecommendations(match);

    /*
      ÖNERİ YOKSA MAÇ TAMAMEN
      EKRANDAN ÇIKARILIYOR.
    */
    if (!recommendations.length) {
      continue;
    }

    result.push({
      match,
      recommendations
    });
  }

  return result;
}

/* =========================================================
   VERİ ARALIĞI
========================================================= */

function updateDataRange() {
  if (!$("dataRange")) {
    return;
  }

  let min = "";
  let max = "";

  for (const match of matches) {
    const d = match._date;

    if (!d) continue;

    if (!min || d < min) {
      min = d;
    }

    if (!max || d > max) {
      max = d;
    }
  }

  $("dataRange").textContent =
    min && max
      ? `${min} → ${max}`
      : "—";
}

/* =========================================================
   RENDER
========================================================= */

function render() {
  const input =
    $("dateInput");

  const container =
    $("matches");

  if (!input || !container) {
    return;
  }

  let selected =
    input.value;

  if (!selected) {
    selected = getToday();
    input.value = selected;
  }

  const dayMatches =
    getDayMatches(selected);

  container.innerHTML = "";

  /*
    TARİHTE HİÇ MAÇ YOK.
  */
  if (!dayMatches.length) {
    container.innerHTML = `
      <div class="empty">
        Bu tarihte maç bulunamadı.
      </div>
    `;

    renderStats([]);

    if ($("resultSummary")) {
      $("resultSummary").textContent =
        "Bu tarihte maç bulunamadı";
    }

    if ($("matchCount")) {
      $("matchCount").textContent =
        "0";
    }

    return;
  }

  /*
    SADECE ÖNERİSİ OLAN MAÇLAR.
  */
  const predicted =
    getPredictedMatches(
      dayMatches
    );

  /*
    ÖNERİSİ OLMAYAN TÜM MAÇLAR
    BURADA GİZLENİYOR.
  */
  if (!predicted.length) {
    container.innerHTML = `
      <div class="empty">
        Bu tarihte %70 ve üzeri
        başarı oranına sahip tahmin
        bulunan maç yok.
      </div>
    `;

    renderStats([]);

    if ($("resultSummary")) {
      $("resultSummary").textContent =
        "Tahmin bulunan maç yok";
    }

    if ($("matchCount")) {
      $("matchCount").textContent =
        "0";
    }

    return;
  }

  const fragment =
    document.createDocumentFragment();

  /*
    Tahmin daha önce hesaplandı.
    renderMatch tekrar hesaplamıyor.
  */
  for (const item of predicted) {
    const card =
      renderMatch(
        item.match,
        item.recommendations
      );

    if (card) {
      fragment.appendChild(card);
    }
  }

  container.appendChild(
    fragment
  );

  renderStats(predicted);

  if ($("matchCount")) {
    $("matchCount").textContent =
      predicted.length;
  }

  if ($("resultSummary")) {
    $("resultSummary").textContent =
      `${predicted.length} tahminli maç`;
  }

  updateDataRange();
}

/* =========================================================
   VERİ YÜKLE
========================================================= */

async function loadData() {
  const response =
    await fetch(
      `data/matches.json?ts=${Date.now()}`,
      {
        cache: "no-store"
      }
    );

  if (!response.ok) {
    throw new Error(
      `data/matches.json HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

  if (Array.isArray(data)) {
    matches = data;
  } else if (
    data &&
    Array.isArray(data.matches)
  ) {
    matches = data.matches;
  } else {
    throw new Error(
      "matches dizisi bulunamadı."
    );
  }

  /*
    Tarihleri bir kere hesapla.
    Her render'da dateKey çalıştırılmıyor.
  */
  for (const match of matches) {
    match._date =
      dateKey(match.date);

    match._day =
      dayNumber(match.date);
  }

  /*
    Tarih + saat.
  */
  matches.sort(
    (a, b) => {
      const da =
        `${a._date} ${a.time || ""}`;

      const db =
        `${b._date} ${b.time || ""}`;

      if (da < db) return -1;
      if (da > db) return 1;

      return 0;
    }
  );

  historyIndexes.clear();
  recommendationCache.clear();

  updateLastUpdated(data);
  updateDataRange();

  console.log(
    "Yüklenen maç:",
    matches.length
  );
}

/* =========================================================
   GÜNCELLEME ZAMANI
========================================================= */

function updateLastUpdated(data) {
  const element =
    $("lastUpdated");

  if (!element) {
    return;
  }

  if (data?.updatedAt) {
    const date =
      new Date(data.updatedAt);

    if (
      !Number.isNaN(
        date.getTime()
      )
    ) {
      element.textContent =
        "Veri güncelleme zamanı: " +
        date.toLocaleString(
          "tr-TR"
        );

      return;
    }
  }

  element.textContent =
    "Veri güncelleme zamanı: —";
}

/* =========================================================
   BAŞLANGIÇ
========================================================= */

async function init() {
  try {
    const input =
      $("dateInput");

    /*
      İlk açılışta bugün.
    */
    if (input) {
      input.value =
        getToday();

      input.addEventListener(
        "change",
        () => {
          render();
        }
      );
    }

    /*
      JSON yalnızca bir kere yükleniyor.
    */
    await loadData();

    /*
      Geçmiş indeksini bir kere oluştur.
    */
    console.time(
      "Geçmiş indeks"
    );

    buildHistoryIndexes();

    console.timeEnd(
      "Geçmiş indeks"
    );

    /*
      Artık tahminler hazır.
    */
    render();

    console.log(
      "Sistem hazır."
    );

  } catch (error) {
    console.error(
      "Veri yükleme hatası:",
      error
    );

    const container =
      $("matches");

    if (container) {
      container.innerHTML = `
        <div class="empty error">
          Veri dosyası yüklenemedi.<br>
          <small>
            data/matches.json dosyasını kontrol edin.
          </small>
        </div>
      `;
    }

    if ($("resultSummary")) {
      $("resultSummary").textContent =
        "Veri yüklenemedi";
    }
  }
}

/*
  OTOMATİK YENİLEME YOK.
  setInterval YOK.
  requestIdleCallback YOK.
*/

init();
