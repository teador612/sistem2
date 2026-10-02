const THRESHOLD = 70;
const WINDOW_DAYS = 60;
const MIN_SAMPLES = 5;
const REFRESH_INTERVAL = 60 * 1000;

const $ = id => document.getElementById(id);

let matches = [];
let historyIndexes = {};

/* =========================
   PAZARLAR
========================= */

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

/* =========================
   SAYI
========================= */

function number(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const result = Number(
    String(value).replace(",", ".")
  );

  return Number.isFinite(result)
    ? result
    : null;
}

/* =========================
   TARİH
========================= */

function dateKey(value) {
  if (!value) return "";

  const text = String(value).trim();

  let match = text.match(
    /^(\d{4})[-/](\d{2})[-/](\d{2})/
  );

  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  match = text.match(
    /^(\d{2})[./-](\d{2})[./-](\d{4})/
  );

  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  return text.slice(0, 10);
}

function dateObject(value) {
  const key = dateKey(value);

  if (!key) return null;

  const date = new Date(`${key}T00:00:00`);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function daysBetween(a, b) {
  const first = dateObject(a);
  const second = dateObject(b);

  if (!first || !second) {
    return Infinity;
  }

  return Math.abs(
    (first.getTime() - second.getTime()) /
      86400000
  );
}

/* =========================
   SKOR
========================= */

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

/* =========================
   MAÇ DURUMU
========================= */

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

/* =========================
   SONUÇLAR
========================= */

function getMsResult(match) {
  if (!isFinished(match)) {
    return null;
  }

  const score = getFullTimeScore(match);

  if (!score) {
    return null;
  }

  const parts = score.split("-").map(Number);

  if (parts.length !== 2) {
    return null;
  }

  if (parts[0] > parts[1]) return "1";
  if (parts[0] === parts[1]) return "0";

  return "2";
}

function getIy15Result(match) {
  const score = getHalfTimeScore(match);

  if (!score) {
    return null;
  }

  const parts = score.split("-").map(Number);

  if (parts.length !== 2) {
    return null;
  }

  const total = parts[0] + parts[1];

  return total >= 2
    ? "ÜST"
    : "ALT";
}

function getKgResult(match) {
  const score = getFullTimeScore(match);

  if (!score) {
    return null;
  }

  const parts = score.split("-").map(Number);

  if (parts.length !== 2) {
    return null;
  }

  return (
    parts[0] > 0 &&
    parts[1] > 0
  )
    ? "VAR"
    : "YOK";
}

function get25Result(match) {
  const score = getFullTimeScore(match);

  if (!score) {
    return null;
  }

  const parts = score.split("-").map(Number);

  if (parts.length !== 2) {
    return null;
  }

  const total = parts[0] + parts[1];

  return total >= 3
    ? "ÜST"
    : "ALT";
}

/* =========================
   GEÇMİŞ İNDEKSİ
========================= */

function buildHistoryIndexes() {
  historyIndexes = {};

  for (const market of MARKETS) {
    historyIndexes[market.key] = new Map();
  }

  for (const match of matches.filter(isFinished)) {

    const matchDate =
      dateKey(match.date);

    if (!matchDate) {
      continue;
    }

    for (const market of MARKETS) {

      const odds =
        number(market.odds(match));

      const result =
        market.result(match);

      if (
        odds === null ||
        result === null
      ) {
        continue;
      }

      if (
        !historyIndexes[market.key].has(
          odds
        )
      ) {
        historyIndexes[market.key].set(
          odds,
          []
        );
      }

      historyIndexes[market.key]
        .get(odds)
        .push({
          date: matchDate,
          success: result
        });
    }
  }
}

/* =========================
   ORAN ANALİZİ
========================= */

function analyzeMarket(match, market) {

  const odds =
    number(market.odds(match));

  if (odds === null) {
    return null;
  }

  const records =
    historyIndexes[market.key]?.get(
      odds
    ) || [];

  const currentDate =
    dateKey(match.date);

  const previous =
    records.filter(item => {

      if (!item.date) {
        return false;
      }

      if (item.date === currentDate) {
        return false;
      }

      return (
        daysBetween(
          currentDate,
          item.date
        ) <= WINDOW_DAYS
      );
    });

  if (
    previous.length < MIN_SAMPLES
  ) {
    return {
      odds,
      samples: previous.length,
      successRate: null
    };
  }

  const successCount =
    previous.filter(
      item => item.success
    ).length;

  const successRate =
    (
      successCount /
      previous.length
    ) * 100;

  return {
    odds,
    samples: previous.length,
    successRate
  };
}

/* =========================
   ÖNERİLER
========================= */

function getRecommendations(match) {

  return MARKETS
    .map(market => {

      const analysis =
        analyzeMarket(
          match,
          market
        );

      if (!analysis) {
        return null;
      }

      if (
        analysis.samples <
        MIN_SAMPLES
      ) {
        return null;
      }

      if (
        analysis.successRate === null ||
        analysis.successRate <
          THRESHOLD
      ) {
        return null;
      }

      return {
        ...market,
        ...analysis
      };
    })
    .filter(Boolean);
}

/* =========================
   ÖNERİ SONUCU
========================= */

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

/* =========================
   KART DURUMU
========================= */

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

  const statuses =
    recommendations.map(
      recommendation =>
        getRecommendationStatus(
          match,
          recommendation
        )
    );

  if (
    statuses.every(
      status => status === "won"
    )
  ) {
    return "won";
  }

  if (
    statuses.every(
      status => status === "lost"
    )
  ) {
    return "lost";
  }

  return "pending";
}

/* =========================
   YÜZDE
========================= */

function formatPercent(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "—";
  }

  return `%${Math.round(value)}`;
}

/* =========================
   ÖNERİ DETAYLARI
========================= */

function renderRecommendationDetails(
  match,
  recommendations
) {
  if (!recommendations.length) {
    return `
      <div class="details-section">
        <strong>Öneriler</strong>

        <div class="detail-row">
          <span>Uygun öneri</span>
          <b>Yok</b>
        </div>
      </div>
    `;
  }

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
        let statusText = "Bekliyor";

        if (status === "won") {
          icon = "🟢";
          statusText = "Tuttu";
        }

        if (status === "lost") {
          icon = "🔴";
          statusText = "Tutmadı";
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
                ${statusText}
              </span>

            </div>

          </div>
        `;

      }).join("")}

    </div>
  `;
}

/* =========================
   MAÇ KARTI
========================= */

function renderMatch(match) {

  const template =
    $("matchTemplate");

  if (!template) {
    return null;
  }

  const fragment =
    template.content.cloneNode(true);

  const card =
    fragment.querySelector(".match-card");

  fragment.querySelector(".league")
    .textContent =
    match.league || "Lig";

  fragment.querySelector(".time")
    .textContent =
    match.time || "";

  fragment.querySelector(".home")
    .textContent =
    match.home ||
    match.homeTeam ||
    "";

  fragment.querySelector(".away")
    .textContent =
    match.away ||
    match.awayTeam ||
    "";

  fragment.querySelector(".ht-score")
    .textContent =
    getHalfTimeScore(match) || "—";

  fragment.querySelector(".ft-score")
    .textContent =
    getFullTimeScore(match) || "—";

  const recommendations =
    getRecommendations(match);

  const cardStatus =
    getMatchCardStatus(
      match,
      recommendations
    );

  card.classList.add(
    `status-${cardStatus}`
  );

  const recommendation =
    fragment.querySelector(
      ".recommendation"
    );

  if (recommendations.length) {

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

  } else {

    recommendation.innerHTML = `
      <span class="no-recommendation">
        Bu maç için %70+ ve 5+ geçmiş
        şartını sağlayan öneri yok
      </span>
    `;
  }

  const details =
    fragment.querySelector(".details");

  details.innerHTML =
    renderRecommendationDetails(
      match,
      recommendations
    );

  const expand =
    fragment.querySelector(".expand");

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

  return card;
}

/* =========================
   İSTATİSTİKLER
========================= */

function renderStats(dayMatches) {

  let dayWon = 0;
  let dayLost = 0;
  let dayRecommendations = 0;

  for (const match of dayMatches) {

    const recommendations =
      getRecommendations(match);

    dayRecommendations +=
      recommendations.length;

    for (
      const recommendation
      of recommendations
    ) {

      const status =
        getRecommendationStatus(
          match,
          recommendation
        );

      if (status === "won") {
        dayWon++;
      }

      if (status === "lost") {
        dayLost++;
      }
    }
  }

  const dayCompleted =
    dayWon + dayLost;

  const daySuccess =
    dayCompleted
      ? (
          dayWon /
          dayCompleted
        ) * 100
      : null;

  if ($("daySuccess")) {
    $("daySuccess").textContent =
      formatPercent(daySuccess);
  }

  if ($("daySuccessMeta")) {
    $("daySuccessMeta").textContent =
      dayCompleted
        ? `${dayWon} tuttu / ${dayLost} tutmadı`
        : dayRecommendations
          ? `${dayRecommendations} öneri bekliyor`
          : "Öneri yok";
  }

  let overallWon = 0;
  let overallLost = 0;

  for (const match of matches) {

    for (
      const recommendation
      of getRecommendations(match)
    ) {

      const status =
        getRecommendationStatus(
          match,
          recommendation
        );

      if (status === "won") {
        overallWon++;
      }

      if (status === "lost") {
        overallLost++;
      }
    }
  }

  const overallCompleted =
    overallWon + overallLost;

  const overallSuccess =
    overallCompleted
      ? (
          overallWon /
          overallCompleted
        ) * 100
      : null;

  if ($("overallSuccess")) {
    $("overallSuccess").textContent =
      formatPercent(overallSuccess);
  }

  if ($("overallSuccessMeta")) {
    $("overallSuccessMeta").textContent =
      overallCompleted
        ? `${overallWon} tuttu / ${overallLost} tutmadı`
        : "Sonuçlanmış öneri yok";
  }

  if ($("matchCount")) {
    $("matchCount").textContent =
      dayMatches.length;
  }

  if ($("dataRange")) {

    const dates =
      matches
        .map(m => dateKey(m.date))
        .filter(Boolean)
        .sort();

    $("dataRange").textContent =
      dates.length
        ? `${dates[0]} → ${dates[dates.length - 1]}`
        : "—";
  }
}

/* =========================
   BUGÜNÜN TARİHİ
========================= */

function getToday() {

  const now = new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      now.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/* =========================
   RENDER
========================= */

function render() {

  const input =
    $("dateInput");

  const container =
    $("matches");

  if (!input || !container) {
    return;
  }

  const selected =
    input.value;

  const dayMatches =
    matches.filter(
      match =>
        dateKey(match.date) ===
        selected
    );

  container.innerHTML = "";

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

    return;
  }

  const fragment =
    document.createDocumentFragment();

  for (const match of dayMatches) {

    const card =
      renderMatch(match);

    if (card) {
      fragment.appendChild(card);
    }
  }

  container.appendChild(
    fragment
  );

  renderStats(dayMatches);

  if ($("resultSummary")) {
    $("resultSummary").textContent =
      `${dayMatches.length} maç listeleniyor`;
  }
}

/* =========================
   VERİ YÜKLE
========================= */

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

  matches.sort(
    (a, b) => {

      const first =
        `${dateKey(a.date)} ${a.time || ""}`;

      const second =
        `${dateKey(b.date)} ${b.time || ""}`;

      return first.localeCompare(
        second,
        "tr"
      );
    }
  );

  buildHistoryIndexes();

  updateLastUpdated(data);

  console.log(
    "Yüklenen maç sayısı:",
    matches.length
  );
}

/* =========================
   GÜNCELLEME ZAMANI
========================= */

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
        date.toLocaleString("tr-TR");

      return;
    }
  }

  element.textContent =
    "Veri güncelleme zamanı: —";
}

/* =========================
   BAŞLANGIÇ
========================= */

async function init() {

  try {

    await loadData();

    const input =
      $("dateInput");

    if (input) {

      /*
         AÇILIŞTA DAİMA BUGÜN
      */

      input.value =
        getToday();

      input.addEventListener(
        "change",
        render
      );
    }

    render();

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

/* =========================
   OTOMATİK YENİLEME
========================= */

async function refreshData() {

  try {

    const selected =
      $("dateInput")?.value || "";

    await loadData();

    const today =
      getToday();

    /*
       Kullanıcı tarih seçmişse
       seçtiği tarih korunur.

       Tarih seçmemişse bugün.
    */

    if (
      selected &&
      selected !== ""
    ) {
      $("dateInput").value =
        selected;
    } else {
      $("dateInput").value =
        today;
    }

    render();

  } catch (error) {

    console.error(
      "Otomatik veri güncelleme hatası:",
      error
    );
  }
}

/* =========================
   BAŞLAT
========================= */

async function startApp() {

  await init();

  setInterval(
    refreshData,
    REFRESH_INTERVAL
  );
}

startApp();
