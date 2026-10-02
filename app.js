const THRESHOLD = 70;
const WINDOW_DAYS = 60;
const MIN_SAMPLES = 5;
const REFRESH_INTERVAL = 60 * 1000;

const $ = id => document.getElementById(id);

let matches = [];
let historyIndexes = {};

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

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function dateKey(value) {
  if (!value) return "";

  const text = String(value).trim();

  let match = text.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);

  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  match = text.match(/^(\d{2})[./-](\d{2})[./-](\d{4})/);

  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  return text.slice(0, 10);
}

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

  if (!text || text === "-" || text === "null") {
    return null;
  }

  return text;
}

function getFullTimeScore(match) {
  return parseScore(match.score ?? match.fullTimeScore);
}

function getHalfTimeScore(match) {
  return parseScore(
    match.halfTimeScore ??
    match.htScore
  );
}

function isFinished(match) {
  const status = Number(match.status);

  if (status > 0) return true;

  const score = getFullTimeScore(match);

  return !!score && /^\d+\s*-\s*\d+$/.test(score);
}

function getMsResult(match) {
  if (!isFinished(match)) return null;

  const score = getFullTimeScore(match);

  if (!score) return null;

  const parts = score.split("-").map(Number);

  if (parts.length !== 2) return null;

  const [home, away] = parts;

  if (home > away) return "1";
  if (home === away) return "0";

  return "2";
}

function getIy15Result(match) {
  const score = getHalfTimeScore(match);

  if (!score) return null;

  const parts = score.split("-").map(Number);

  if (parts.length !== 2) return null;

  const total = parts[0] + parts[1];

  return total >= 2 ? "ÜST" : "ALT";
}

function getKgResult(match) {
  const score = getFullTimeScore(match);

  if (!score) return null;

  const parts = score.split("-").map(Number);

  if (parts.length !== 2) return null;

  return parts[0] > 0 && parts[1] > 0
    ? "VAR"
    : "YOK";
}

function get25Result(match) {
  const score = getFullTimeScore(match);

  if (!score) return null;

  const parts = score.split("-").map(Number);

  if (parts.length !== 2) return null;

  const total = parts[0] + parts[1];

  return total >= 3 ? "ÜST" : "ALT";
}

function daysBetween(a, b) {
  const da = new Date(`${a}T00:00:00`);
  const db = new Date(`${b}T00:00:00`);

  return Math.abs(
    (da - db) / 86400000
  );
}

function buildHistoryIndexes() {
  historyIndexes = {};

  for (const market of MARKETS) {
    historyIndexes[market.key] = new Map();
  }

  const finished = matches.filter(isFinished);

  for (const match of finished) {
    const matchDate = dateKey(match.date);

    if (!matchDate) continue;

    for (const market of MARKETS) {
      const odds = number(market.odds(match));
      const result = market.result(match);

      if (odds === null || result === null) {
        continue;
      }

      if (!historyIndexes[market.key].has(odds)) {
        historyIndexes[market.key].set(odds, []);
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

function analyzeMarket(match, market) {
  const odds = number(market.odds(match));

  if (odds === null) return null;

  const records =
    historyIndexes[market.key]?.get(odds) || [];

  const currentDate = dateKey(match.date);

  const previous = records.filter(
    item =>
      item.date &&
      item.date !== currentDate &&
      daysBetween(currentDate, item.date) <= WINDOW_DAYS
  );

  if (previous.length < MIN_SAMPLES) {
    return {
      odds,
      samples: previous.length,
      successRate: null,
      enough: false
    };
  }

  const successCount = previous.filter(
    item => item.success
  ).length;

  const successRate =
    (successCount / previous.length) * 100;

  return {
    odds,
    samples: previous.length,
    successRate,
    enough: true,
    success: successRate >= THRESHOLD
  };
}

function getRecommendations(match) {
  return MARKETS
    .map(market => {
      const analysis = analyzeMarket(match, market);

      if (
        !analysis ||
        !analysis.enough ||
        analysis.successRate < THRESHOLD
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

function formatPercent(value) {
  if (value === null || value === undefined) {
    return "—";
  }

  return `%${Math.round(value)}`;
}

function renderDetails(match, recommendations) {
  const odds = match.openingOdds || {};

  const rows = [
    ["MS 1", odds.ms1],
    ["MS 0", odds.msX],
    ["MS 2", odds.ms2],
    ["2.5 Alt", odds.au25Alt],
    ["2.5 Üst", odds.au25Ust],
    ["KG Var", odds.kgVar],
    ["KG Yok", odds.kgYok],
    ["İY 1.5 Alt", odds.iy15Alt],
    ["İY 1.5 Üst", odds.iy15Ust],
    ["İY 1", odds.iy1],
    ["İY X", odds.iyX],
    ["İY 2", odds.iy2]
  ];

  const details = rows
    .map(([label, value]) => {
      if (value === null || value === undefined) {
        return "";
      }

      return `
        <div class="detail-row">
          <span>${label}</span>
          <b>${value}</b>
        </div>
      `;
    })
    .join("");

  const analysis = recommendations.length
    ? recommendations
        .map(item => `
          <div class="detail-row recommendation-detail">
            <span>${item.label} @ ${item.odds}</span>
            <b>
              ${formatPercent(item.successRate)}
              (${item.samples} maç)
            </b>
          </div>
        `)
        .join("")
    : `
      <div class="detail-row">
        <span>Geçmiş eşleşme</span>
        <b>Yok</b>
      </div>
    `;

  return `
    <div class="details-section">
      <strong>Oranlar</strong>
      ${details}
    </div>

    <div class="details-section">
      <strong>Geçmiş istatistik</strong>
      ${analysis}
    </div>
  `;
}

function renderMatch(match) {
  const template = $("matchTemplate");

  if (!template) return null;

  const fragment =
    template.content.cloneNode(true);

  const card =
    fragment.querySelector(".match-card");

  const league =
    fragment.querySelector(".league");

  const time =
    fragment.querySelector(".time");

  const home =
    fragment.querySelector(".home");

  const away =
    fragment.querySelector(".away");

  const htScore =
    fragment.querySelector(".ht-score");

  const ftScore =
    fragment.querySelector(".ft-score");

  const recommendation =
    fragment.querySelector(".recommendation");

  const expand =
    fragment.querySelector(".expand");

  const details =
    fragment.querySelector(".details");

  league.textContent =
    match.league || "Lig";

  time.textContent =
    match.time || "";

  home.textContent =
    match.home ||
    match.homeTeam ||
    "";

  away.textContent =
    match.away ||
    match.awayTeam ||
    "";

  htScore.textContent =
    getHalfTimeScore(match) || "—";

  ftScore.textContent =
    getFullTimeScore(match) || "—";

  const recommendations =
    getRecommendations(match);

  if (recommendations.length) {
    recommendation.innerHTML =
      recommendations
        .map(item => `
          <span class="recommendation-item">
            ${item.label}
            <b>${formatPercent(item.successRate)}</b>
          </span>
        `)
        .join("");
  } else {
    recommendation.innerHTML =
      `<span class="no-recommendation">Yeterli eşleşme yok</span>`;
  }

  details.innerHTML =
    renderDetails(
      match,
      recommendations
    );

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

      details.hidden = opened;
    }
  );

  return card;
}

function renderStats(dayMatches) {
  const completed =
    dayMatches.filter(isFinished);

  const recommendations =
    dayMatches.flatMap(
      match => getRecommendations(match)
    );

  const successful =
    recommendations.filter(
      item => {
        const market =
          MARKETS.find(
            m => m.key === item.key
          );

        return market?.result(
          dayMatches.find(
            m => m === item
          )
        );
      }
    );

  const totalRecommendations =
    recommendations.length;

  const daySuccess =
    totalRecommendations
      ? (
          recommendations.filter(
            r => r.success === true
          ).length /
          totalRecommendations
        ) * 100
      : null;

  if ($("daySuccess")) {
    $("daySuccess").textContent =
      formatPercent(daySuccess);
  }

  if ($("daySuccessMeta")) {
    $("daySuccessMeta").textContent =
      totalRecommendations
        ? `${totalRecommendations} öneri`
        : "Tamamlanan öneri yok";
  }

  const finishedAll =
    matches.filter(isFinished);

  let total = 0;
  let success = 0;

  for (const match of finishedAll) {
    for (const market of MARKETS) {
      const result =
        market.result(match);

      if (result === null) continue;

      const analysis =
        analyzeMarket(match, market);

      if (
        analysis?.enough &&
        analysis.successRate !== null
      ) {
        total++;
        if (analysis.success) {
          success++;
        }
      }
    }
  }

  const overall =
    total
      ? (success / total) * 100
      : null;

  if ($("overallSuccess")) {
    $("overallSuccess").textContent =
      formatPercent(overall);
  }

  if ($("overallSuccessMeta")) {
    $("overallSuccessMeta").textContent =
      total
        ? `${total} analiz`
        : "Veri hazırlanıyor";
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

function render() {
  const input = $("dateInput");

  if (!input) return;

  const selected =
    input.value ||
    new Date().toISOString().slice(0, 10);

  const dayMatches =
    matches.filter(
      match =>
        dateKey(match.date) === selected
    );

  const container =
    $("matches");

  if (!container) return;

  container.innerHTML = "";

  if (!dayMatches.length) {
    container.innerHTML = `
      <div class="empty">
        Bu tarihte maç bulunamadı.
      </div>
    `;

    renderStats([]);
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

  container.appendChild(fragment);

  renderStats(dayMatches);

  if ($("resultSummary")) {
    $("resultSummary").textContent =
      `${dayMatches.length} maç listeleniyor`;
  }
}

function updateLastUpdated(data) {
  const element =
    $("lastUpdated");

  if (!element) return;

  if (data?.updatedAt) {
    const date =
      new Date(data.updatedAt);

    if (!Number.isNaN(date.getTime())) {
      element.textContent =
        "Veri güncelleme zamanı: " +
        date.toLocaleString("tr-TR");

      return;
    }
  }

  element.textContent =
    "Veri güncelleme zamanı: —";
}

async function loadData() {
  const response =
    await fetch(
      "data/matches.json?ts=" +
        Date.now(),
      {
        cache: "no-store"
      }
    );

  if (!response.ok) {
    throw new Error(
      "data/matches.json HTTP " +
      response.status
    );
  }

  const data =
    await response.json();

  /*
   * matches.json şu anda:
   *
   * {
   *   source: "...",
   *   week: 24139,
   *   updatedAt: "...",
   *   matches: [...]
   * }
   */

  if (Array.isArray(data)) {
    matches = data;
  } else if (
    data &&
    Array.isArray(data.matches)
  ) {
    matches = data.matches;
  } else {
    throw new Error(
      "data/matches.json içinde matches dizisi bulunamadı."
    );
  }

  matches.sort(
    (a, b) => {
      const da =
        `${dateKey(a.date)} ${a.time || ""}`;

      const db =
        `${dateKey(b.date)} ${b.time || ""}`;

      return da.localeCompare(
        db,
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

function setDefaultDate() {
  const input = $("dateInput");

  if (!input) return;

  const dates =
    matches
      .map(m => dateKey(m.date))
      .filter(Boolean)
      .sort();

  if (!dates.length) return;

  const today =
    new Date()
      .toISOString()
      .slice(0, 10);

  if (
    dates.includes(today)
  ) {
    input.value = today;
  } else {
    input.value =
      dates[dates.length - 1];
  }
}

async function init() {
  try {
    await loadData();

    setDefaultDate();

    const input =
      $("dateInput");

    if (input) {
      input.addEventListener(
        "change",
        render
      );
    }

    render();

  } catch (error) {
    console.error(error);

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

async function refreshData() {
  try {
    const selected =
      $("dateInput")?.value || "";

    await loadData();

    if ($("dateInput")) {
      $("dateInput").value =
        selected;
    }

    render();

    console.log(
      "Veriler yenilendi:",
      new Date().toLocaleTimeString(
        "tr-TR"
      )
    );

  } catch (error) {
    console.error(
      "Otomatik veri güncelleme hatası:",
      error
    );
  }
}

async function startApp() {
  await init();

  setInterval(
    refreshData,
    REFRESH_INTERVAL
  );
}

startApp();
