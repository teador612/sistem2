```javascript
const THRESHOLD = 70;
const MIN_SAMPLES = 5;
const WINDOW_DAYS = 60;

const $ = id => document.getElementById(id);

let matches = [];
let historyIndexes = new Map();
let recommendationCache = new Map();

/* =========================================================
   PAZARLAR
========================================================= */

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
   SAYI
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

  return Number.isFinite(n)
    ? n
    : null;
}

/* =========================================================
   TARİH
========================================================= */

function dateKey(value) {
  if (!value) return "";

  const text =
    String(value).trim();

  let m =
    text.match(
      /^(\d{4})[-/](\d{2})[-/](\d{2})/
    );

  if (m) {
    return `${m[1]}-${m[2]}-${m[3]}`;
  }

  m =
    text.match(
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

  const parts =
    key.split("-").map(Number);

  if (parts.length !== 3) {
    return NaN;
  }

  return Date.UTC(
    parts[0],
    parts[1] - 1,
    parts[2]
  ) / 86400000;
}

/* =========================================================
   SKOR
========================================================= */

function parseScore(score) {
  if (!score) return null;

  if (
    typeof score === "object"
  ) {
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

  const text =
    String(score).trim();

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
   MAÇ BİTMİŞ Mİ?
========================================================= */

function isFinished(match) {
  const score =
    getFullTimeScore(match);

  if (!score) {
    return false;
  }

  return /^\d+\s*-\s*\d+$/.test(
    score
  );
}

/* =========================================================
   MS SONUCU
========================================================= */

function getMsResult(match) {
  const score =
    getFullTimeScore(match);

  if (!score) return null;

  const parts =
    score.split("-").map(Number);

  if (parts.length !== 2) {
    return null;
  }

  if (
    !Number.isFinite(parts[0]) ||
    !Number.isFinite(parts[1])
  ) {
    return null;
  }

  if (parts[0] > parts[1]) {
    return "1";
  }

  if (parts[0] === parts[1]) {
    return "0";
  }

  return "2";
}

/* =========================================================
   İY 1.5
========================================================= */

function getIy15Result(match) {
  const score =
    getHalfTimeScore(match);

  if (!score) return null;

  const parts =
    score.split("-").map(Number);

  if (parts.length !== 2) {
    return null;
  }

  const total =
    parts[0] + parts[1];

  return total >= 2
    ? "ÜST"
    : "ALT";
}

/* =========================================================
   KG
========================================================= */

function getKgResult(match) {
  const score =
    getFullTimeScore(match);

  if (!score) return null;

  const parts =
    score.split("-").map(Number);

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

/* =========================================================
   2.5
========================================================= */

function get25Result(match) {
  const score =
    getFullTimeScore(match);

  if (!score) return null;

  const parts =
    score.split("-").map(Number);

  if (parts.length !== 2) {
    return null;
  }

  const total =
    parts[0] + parts[1];

  return total >= 3
    ? "ÜST"
    : "ALT";
}

/* =========================================================
   GEÇMİŞ İNDEKSİ
=========================================================

   Eski sistem:
   Her maç → bütün geçmiş maçlar

   Yeni sistem:
   Bütün geçmiş maçlar → 1 kez indeks

   Böylece tahmin hesabında tekrar
   bütün JSON taranmıyor.
========================================================= */

function buildHistoryIndex() {

  historyIndexes =
    new Map();

  for (
    const market of MARKETS
  ) {

    historyIndexes.set(
      market.key,
      new Map()
    );
  }

  for (
    const match of matches
  ) {

    if (!isFinished(match)) {
      continue;
    }

    const date =
      dateKey(match.date);

    const day =
      dayNumber(match.date);

    if (!date || !Number.isFinite(day)) {
      continue;
    }

    for (
      const market of MARKETS
    ) {

      const odds =
        number(
          market.odds(match)
        );

      if (odds === null) {
        continue;
      }

      const result =
        market.result(match);

      if (result === null) {
        continue;
      }

      const marketIndex =
        historyIndexes.get(
          market.key
        );

      if (
        !marketIndex.has(odds)
      ) {

        marketIndex.set(
          odds,
          []
        );
      }

      marketIndex
        .get(odds)
        .push({
          day,
          success: result
        });
    }
  }
}

/* =========================================================
   TEK MARKET ANALİZİ
========================================================= */

function analyzeMarket(
  match,
  market
) {

  const odds =
    number(
      market.odds(match)
    );

  if (odds === null) {
    return null;
  }

  const marketIndex =
    historyIndexes.get(
      market.key
    );

  if (!marketIndex) {
    return null;
  }

  const records =
    marketIndex.get(odds);

  if (!records?.length) {
    return null;
  }

  const currentDay =
    dayNumber(match.date);

  if (!Number.isFinite(currentDay)) {
    return null;
  }

  let samples = 0;
  let success = 0;

  for (
    const record of records
  ) {

    if (
      Math.abs(
        currentDay -
        record.day
      ) > WINDOW_DAYS
    ) {
      continue;
    }

    /*
       Aynı günün kayıtlarını
       geçmiş örneğe katma.
    */

    if (
      currentDay ===
      record.day
    ) {
      continue;
    }

    samples++;

    if (record.success) {
      success++;
    }
  }

  if (
    samples < MIN_SAMPLES
  ) {
    return null;
  }

  const successRate =
    success /
    samples *
    100;

  if (
    successRate < THRESHOLD
  ) {
    return null;
  }

  return {
    ...market,
    odds,
    samples,
    successRate
  };
}

/* =========================================================
   ÖNERİLER
========================================================= */

function getRecommendations(match) {

  const id =
    match.code ??
    match.id ??
    `${dateKey(match.date)}|${match.time}|${match.home}|${match.away}`;

  if (
    recommendationCache.has(id)
  ) {
    return recommendationCache.get(id);
  }

  const recommendations = [];

  for (
    const market of MARKETS
  ) {

    const result =
      analyzeMarket(
        match,
        market
      );

    if (result) {
      recommendations.push(
        result
      );
    }
  }

  recommendations.sort(
    (a, b) =>
      b.successRate -
      a.successRate
  );

  recommendationCache.set(
    id,
    recommendations
  );

  return recommendations;
}

/* =========================================================
   ÖNERİ DURUMU
========================================================= */

function getRecommendationStatus(
  match,
  recommendation
) {

  if (!isFinished(match)) {
    return "pending";
  }

  return recommendation.result(
    match
  )
    ? "won"
    : "lost";
}

/* =========================================================
   YÜZDE
========================================================= */

function formatPercent(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return "—";
  }

  return `%${Math.round(value)}`;
}

/* =========================================================
   DETAY
========================================================= */

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

      ${recommendations.map(
        item => {

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

          const statusText =
            status === "won"
              ? "Tuttu"
              : status === "lost"
                ? "Tutmadı"
                : "Bekliyor";

          return `
            <div class="recommendation-detail-card">

              <div class="recommendation-detail-top">

                <strong>
                  ${icon}
                  ${item.label}
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
        }
      ).join("")}

    </div>
  `;
}

/* =========================================================
   MAÇ KARTI
========================================================= */

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

  const ht =
    fragment.querySelector(
      ".ht-score"
    );

  const ft =
    fragment.querySelector(
      ".ft-score"
    );

  if (league) {
    league.textContent =
      match.league || "Lig";
  }

  if (time) {
    time.textContent =
      match.time || "";
  }

  if (home) {
    home.textContent =
      match.home ||
      match.homeTeam ||
      "";
  }

  if (away) {
    away.textContent =
      match.away ||
      match.awayTeam ||
      "";
  }

  if (ht) {
    ht.textContent =
      getHalfTimeScore(match) ||
      "—";
  }

  if (ft) {
    ft.textContent =
      getFullTimeScore(match) ||
      "—";
  }

  const recommendations =
    getRecommendations(match);

  /*
     Tahmini olmayan maç
     gösterilmiyor.
  */

  if (!recommendations.length) {
    return null;
  }

  const statuses =
    recommendations.map(
      item =>
        getRecommendationStatus(
          match,
          item
        )
    );

  let cardStatus =
    "pending";

  if (
    isFinished(match) &&
    statuses.every(
      s => s === "won"
    )
  ) {
    cardStatus = "won";
  }

  if (
    isFinished(match) &&
    statuses.every(
      s => s === "lost"
    )
  ) {
    cardStatus = "lost";
  }

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
      recommendations.map(
        item => {

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
        }
      ).join("");
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

  if (
    expand &&
    details
  ) {

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
          opened
            ? "+"
            : "−";

        details.hidden =
          opened;
      }
    );
  }

  return card;
}

/* =========================================================
   BUGÜN
========================================================= */

function getToday() {

  const now =
    new Date();

  return (
    `${now.getFullYear()}-` +
    `${String(
      now.getMonth() + 1
    ).padStart(2, "0")}-` +
    `${String(
      now.getDate()
    ).padStart(2, "0")}`
  );
}

/* =========================================================
   İSTATİSTİK
========================================================= */

function renderStats(
  dayMatches
) {

  let won = 0;
  let lost = 0;
  let total = 0;

  for (
    const match of dayMatches
  ) {

    const recommendations =
      getRecommendations(match);

    for (
      const item of recommendations
    ) {

      total++;

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
  }

  const completed =
    won + lost;

  const success =
    completed
      ? won / completed * 100
      : null;

  if ($("daySuccess")) {

    $("daySuccess").textContent =
      formatPercent(success);
  }

  if ($("daySuccessMeta")) {

    $("daySuccessMeta").textContent =
      completed
        ? `${won} tuttu / ${lost} tutmadı`
        : total
          ? `${total} öneri bekliyor`
          : "Öneri yok";
  }

  if ($("matchCount")) {

    $("matchCount").textContent =
      dayMatches.length;
  }
}

/* =========================================================
   ANA RENDER
========================================================= */

function render() {

  const input =
    $("dateInput");

  const container =
    $("matches");

  if (
    !input ||
    !container
  ) {
    return;
  }

  let selected =
    input.value;

  if (!selected) {

    selected =
      getToday();

    input.value =
      selected;
  }

  const dayMatches =
    matches.filter(
      match =>
        dateKey(match.date) ===
        selected
    );

  /*
     Tahminleri sadece bir kez
     hesapla.
  */

  const predictedMatches =
    [];

  for (
    const match of dayMatches
  ) {

    const recommendations =
      getRecommendations(match);

    if (
      recommendations.length
    ) {
      predictedMatches.push(
        match
      );
    }
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
      $("resultSummary").textContent =
        "Bu tarihte maç bulunamadı";
    }

    return;
  }

  if (!predictedMatches.length) {

    container.innerHTML = `
      <div class="empty">
        Bu tarihte %70 ve üzeri
        başarı oranına sahip
        tahmin bulunan maç yok.
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

  for (
    const match of predictedMatches
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
    predictedMatches
  );

  if ($("matchCount")) {

    $("matchCount").textContent =
      predictedMatches.length;
  }

  if ($("resultSummary")) {

    $("resultSummary").textContent =
      `${predictedMatches.length} tahminli maç`;
  }
}

/* =========================================================
   VERİ YÜKLE
========================================================= */

async function loadData() {

  const response =
    await fetch(
      "data/matches.json",
      {
        cache: "default"
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

    matches =
      data;

  } else if (
    data &&
    Array.isArray(data.matches)
  ) {

    matches =
      data.matches;

  } else {

    throw new Error(
      "matches dizisi bulunamadı."
    );
  }

  /*
     Tarih + saat sıralaması.
  */

  matches.sort(
    (a, b) => {

      const first =
        `${dateKey(a.date)} ${a.time || ""}`;

      const second =
        `${dateKey(b.date)} ${b.time || ""}`;

      return first.localeCompare(
        second
      );
    }
  );

  /*
     Önceki analizleri temizle.
  */

  recommendationCache =
    new Map();

  /*
     Geçmiş oran indeksini
     sadece bir kez oluştur.
  */

  buildHistoryIndex();

  updateLastUpdated(data);

  console.log(
    "Maç sayısı:",
    matches.length
  );
}

/* =========================================================
   SON GÜNCELLEME
========================================================= */

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

/* =========================================================
   BAŞLANGIÇ
========================================================= */

async function init() {

  try {

    const input =
      $("dateInput");

    if (input) {

      input.value =
        getToday();

      input.addEventListener(
        "change",
        render
      );
    }

    /*
       JSON yalnızca 1 kez okunuyor.
    */

    await loadData();

    /*
       Veri + indeks hazır.
       Direkt render.
    */

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

          Veri dosyası yüklenemedi.

          <br><br>

          <small>
            ${error.message}
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

/* =========================================================
   BAŞLAT
========================================================= */

init();
```
