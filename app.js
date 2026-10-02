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
   YARDIMCI
========================= */

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
  const da = dateObject(a);
  const db = dateObject(b);

  if (!da || !db) return Infinity;

  return Math.abs(
    (da.getTime() - db.getTime()) / 86400000
  );
}


/* =========================
   SKORLAR
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
   MAÇ SONUCU
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


function getMsResult(match) {
  if (!isFinished(match)) return null;

  const score = getFullTimeScore(match);

  if (!score) return null;

  const parts = score.split("-").map(Number);

  if (parts.length !== 2) return null;

  const home = parts[0];
  const away = parts[1];

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

  return (
    parts[0] > 0 &&
    parts[1] > 0
  )
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


/* =========================
   GEÇMİŞ İNDEKSİ
========================= */

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

      if (
        odds === null ||
        result === null
      ) {
        continue;
      }

      if (
        !historyIndexes[market.key].has(odds)
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
  const odds = number(market.odds(match));

  if (odds === null) {
    return null;
  }

  const records =
    historyIndexes[market.key]?.get(odds) || [];

  const currentDate = dateKey(match.date);

  const previous = records.filter(item => {
    if (!item.date) return false;

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

  if (previous.length < MIN_SAMPLES) {
    return {
      odds,
      samples: previous.length,
      successRate: null,
      enough: false
    };
  }

  const successCount =
    previous.filter(
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


/*
   SADECE:
   %70+
   VE
   en az 5 geçmiş maç
*/

function getRecommendations(match) {
  return MARKETS
    .map(market => {
      const analysis =
        analyzeMarket(match, market);

      if (!analysis) {
        return null;
      }

      if (
        analysis.samples < MIN_SAMPLES
      ) {
        return null;
      }

      if (
        analysis.successRate === null ||
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


/* =========================
   ÖNERİNİN GERÇEK MAÇTA
   SONUCU
========================= */

function getRecommendationStatus(
  match,
  recommendation
) {
  /*
     Maç henüz bitmediyse
     sarı.
  */

  if (!isFinished(match)) {
    return "pending";
  }

  /*
     İlgili marketin gerçek
     sonucu hesaplanıyor.
  */

  const won =
    recommendation.result(match);

  /*
     true  = yeşil
     false = kırmızı
  */

  return won
    ? "won"
    : "lost";
}


/* =========================
   MAÇ KARTI DURUMU
========================= */

function getMatchCardStatus(
  match,
  recommendations
) {
  /*
     Öneri yoksa sarı.
  */

  if (!recommendations.length) {
    return "pending";
  }

  /*
     Maç bitmediyse sarı.
  */

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

  /*
     Hepsi tuttuysa yeşil
  */

  if (
    statuses.every(
      status => status === "won"
    )
  ) {
    return "won";
  }

  /*
     Hepsi kaybettiyse kırmızı
  */

  if (
    statuses.every(
      status => status === "lost"
    )
  ) {
    return "lost";
  }

  /*
     Birden fazla öneride
     biri tuttu biri tutmadıysa
     sarı bırakıyoruz.
  */

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

  const html =
    recommendations
      .map(item => {
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
      })
      .join("");

  return `
    <div class="details-section">
      <strong>
        Öneriler
      </strong>

      ${html}
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
    fragment.querySelector(
      ".match-card"
    );

  const league =
    fragment.querySelector(
      ".league"
    );

  const time =
    fragment.querySelector(
      ".time"
    );

  const home =
    fragment.querySelector(
      ".home"
    );

  const away =
    fragment.querySelector(
      ".away"
    );

  const htScore =
    fragment.querySelector(
      ".ht-score"
    );

  const ftScore =
    fragment.querySelector(
      ".ft-score"
    );

  const recommendation =
    fragment.querySelector(
      ".recommendation"
    );

  const expand =
    fragment.querySelector(
      ".expand"
    );

  const details =
    fragment.querySelector(
      ".details"
    );

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
    getHalfTimeScore(match) ||
    "—";

  ftScore.textContent =
    getFullTimeScore(match) ||
    "—";


  /*
     SADECE uygun öneriler
  */

  const recommendations =
    getRecommendations(match);


  /*
     Kart durumu
  */

  const cardStatus =
    getMatchCardStatus(
      match,
      recommendations
    );

  card.classList.remove(
    "status-won",
    "status-lost",
    "status-pending"
  );

  card.classList.add(
    `status-${cardStatus}`
  );


  /*
     ÖNERİLER
  */

  if (recommendations.length) {

    recommendation.innerHTML =
      recommendations
        .map(item => {
          const status =
            getRecommendationStatus(
              match,
              item
            );

          let icon = "🟡";

          if (status === "won") {
            icon = "🟢";
          }

          if (status === "lost") {
            icon = "🔴";
          }

          return `
            <span class="recommendation-item ${status}">
              <span>
                ${icon}
                ${item.label}
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
        })
        .join("");

  } else {

    recommendation.innerHTML = `
      <span class="no-recommendation">
        Bu maç için %70+ ve 5+ geçmiş
        şartını sağlayan öneri yok
      </span>
    `;
  }


  /*
     + BUTONU:
     SADECE ÖNERİLERİ GÖSTER
  */

  details.innerHTML =
    renderRecommendationDetails(
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

  const recommendations =
    dayMatches.flatMap(
      match =>
        getRecommendations(match)
    );

  const totalRecommendations =
    recommendations.length;

  const completedRecommendations =
    recommendations.filter(
      recommendation =>
        dayMatches.some(match =>
          getRecommendations(match)
            .includes(recommendation)
        )
    );

  let won = 0;
  let lost = 0;

  for (const match of dayMatches) {

    const recs =
      getRecommendations(match);

    for (const rec of recs) {

      const status =
        getRecommendationStatus(
          match,
          rec
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

  const daySuccess =
    completed
      ? (won / completed) * 100
      : null;


  if ($("daySuccess")) {
    $("daySuccess").textContent =
      formatPercent(
        daySuccess
      );
  }


  if ($("daySuccessMeta")) {
    $("daySuccessMeta").textContent =
      completed
        ? `${won} tuttu / ${lost} tutmadı`
        : totalRecommendations
          ? `${totalRecommendations} öneri bekliyor`
          : "Öneri yok";
  }


  /*
     GENEL BAŞARI
  */

  let overallWon = 0;
  let overallLost = 0;

  for (
    const match of matches
  ) {

    const recs =
      getRecommendations(match);

    for (const rec of recs) {

      const status =
        getRecommendationStatus(
          match,
          rec
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

  const overall =
    overallCompleted
      ? (
          overallWon /
          overallCompleted
        ) * 100
      : null;


  if ($("overallSuccess")) {
    $("overallSuccess")
      .textContent =
      formatPercent(
        overall
      );
  }


  if ($("overallSuccessMeta")) {
    $("overallSuccessMeta")
      .textContent =
      overallCompleted
        ? `${overallWon} tuttu / ${overallLost} tutmadı`
        : "Sonuçlanmış öneri yok";
  }


  /*
     MAÇ SAYISI
  */

  if ($("matchCount")) {
    $("matchCount").textContent =
      dayMatches.length;
  }


  /*
     VERİ ARALIĞI
  */

  if ($("dataRange")) {

    const dates =
      matches
        .map(
          m =>
            dateKey(m.date)
        )
        .filter(Boolean)
        .sort();

    $("dataRange").textContent =
      dates.length
        ? `${dates[0]} → ${dates[dates.length - 1]}`
        : "—";
  }
}


/* =========================
   RENDER
========================= */

function render() {

  const input =
    $("dateInput");

  if (!input) {
    return;
  }

  let selected =
    input.value;


  /*
     Tarih seçili değilse
     en güncel tarihi kullan
  */

  if (!selected) {

    const dates =
      [
        ...new Set(
          matches
            .map(
              m =>
                dateKey(m.date)
            )
            .filter(Boolean)
        )
      ].sort();

    if (dates.length) {

      selected =
        dates[
          dates.length - 1
        ];

      input.value =
        selected;
    }
  }


  const dayMatches =
    matches.filter(
      match =>
        dateKey(
          match.date
        ) === selected
    );


  const container =
    $("matches");

  if (!container) {
    return;
  }

  container.innerHTML = "";


  if (!dayMatches.length) {

    container.innerHTML = `
      <div class="empty">
        Bu tarihte maç bulunamadı.
      </div>
    `;

    renderStats([]);

    if ($("resultSummary")) {
      $("resultSummary")
        .textContent =
        "Bu tarihte maç bulunamadı";
    }

    return;
  }


  const fragment =
    document.createDocumentFragment();


  for (
    const match of dayMatches
  ) {

    const card =
      renderMatch(match);

    if (card) {
      fragment.appendChild(card);
    }
  }


  container.appendChild(
    fragment
  );


  renderStats(
    dayMatches
  );


  if ($("resultSummary")) {
    $("resultSummary")
      .textContent =
      `${dayMatches.length} maç listeleniyor`;
  }
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
      new Date(
        data.updatedAt
      );

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


/* =========================
   VERİYİ YÜKLE
========================= */

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


  if (Array.isArray(data)) {

    matches = data;

  } else if (
    data &&
    Array.isArray(
      data.matches
    )
  ) {

    matches =
      data.matches;

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


/* =========================
   BAŞLANGIÇ TARİHİ
========================= */

function setDefaultDate() {

  const input =
    $("dateInput");

  if (!input) {
    return;
  }


  const dates =
    [
      ...new Set(
        matches
          .map(
            m =>
              dateKey(
                m.date
              )
          )
          .filter(Boolean)
      )
    ].sort();


  if (!dates.length) {

    input.value = "";

    return;
  }


  const today =
    new Date()
      .toISOString()
      .slice(0, 10);


  if (
    dates.includes(today)
  ) {

    input.value =
      today;

    return;
  }


  const futureDate =
    dates.find(
      date =>
        date >= today
    );


  if (futureDate) {

    input.value =
      futureDate;

    return;
  }


  input.value =
    dates[
      dates.length - 1
    ];
}


/* =========================
   INIT
========================= */

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

      $("resultSummary")
        .textContent =
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
      $("dateInput")?.value ||
      "";

    await loadData();


    const availableDates =
      [
        ...new Set(
          matches
            .map(
              m =>
                dateKey(
                  m.date
                )
            )
            .filter(Boolean)
        )
      ];


    if (
      selected &&
      availableDates.includes(
        selected
      )
    ) {

      $("dateInput").value =
        selected;

    } else {

      setDefaultDate();
    }


    render();


    console.log(
      "Veriler yenilendi:",
      new Date()
        .toLocaleTimeString(
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
