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


/* =========================================================
   TARİH YARDIMCILARI
========================================================= */

function dateKey(value) {
  if (!value) return "";

  const text = String(value).trim();

  /*
    JSON'da şu formatlardan biri olabilir:

    2026-09-30
    2026-09-30T12:30:00
    2026-09-30T12:30:00.000Z
    2026-09-30 12:30:00

    İlk 10 karakteri kullanıyoruz.
  */

  const match = text.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);

  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  return text.slice(0, 10);
}


function dateObject(value) {
  const key = dateKey(value);

  if (!key) {
    return new Date(NaN);
  }

  const parts = key.split("-").map(Number);

  if (parts.length !== 3) {
    return new Date(NaN);
  }

  return new Date(
    parts[0],
    parts[1] - 1,
    parts[2]
  );
}


function localDateKey(value) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0")
  ].join("-");
}


function todayKey() {
  return localDateKey(new Date());
}


const pct = (value) =>
  value == null
    ? "—"
    : `%${Math.round(value)}`;


const formatOdds = (value) =>
  value == null || value === ""
    ? "—"
    : Number(value).toFixed(2);


const lastItem = (items) =>
  items[items.length - 1];


/* =========================================================
   BINARY SEARCH
========================================================= */

function lowerBound(items, value) {
  let left = 0;
  let right = items.length;

  while (left < right) {
    const middle =
      Math.floor((left + right) / 2);

    if (items[middle].date < value) {
      left = middle + 1;
    } else {
      right = middle;
    }
  }

  return left;
}


/* =========================================================
   GEÇMİŞ VERİLERİ INDEXLE
========================================================= */

function buildHistoryIndexes() {
  historyIndexes = new Map();

  MARKETS.forEach((market) => {

    const marketIndex = new Map();

    matches.forEach((match) => {

      const odds =
        match.openingOdds?.[market.odds];

      const result =
        match.results?.[market.result];

      if (
        match.status !== "finished" ||
        odds == null ||
        result == null ||
        result === ""
      ) {
        return;
      }

      const key =
        String(Number(odds));

      if (!marketIndex.has(key)) {
        marketIndex.set(key, []);
      }

      marketIndex.get(key).push({
        date: dateKey(match.date),
        success:
          String(result).toUpperCase() ===
          String(market.expected).toUpperCase()
            ? 1
            : 0
      });
    });


    marketIndex.forEach((items) => {

      items.sort((a, b) =>
        a.date.localeCompare(b.date)
      );

      let total = 0;

      items.forEach((item) => {
        total += item.success;
        item.total = total;
      });

    });


    historyIndexes.set(
      market.key,
      marketIndex
    );

  });
}


/* =========================================================
   60 GÜNLÜK GEÇMİŞ ANALİZİ
========================================================= */

function getHistory(match, market) {

  const odds =
    match.openingOdds?.[market.odds];

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


  const matchDate =
    dateObject(match.date);

  if (Number.isNaN(matchDate.getTime())) {
    return {
      count: 0,
      successful: 0,
      rate: null
    };
  }


  const start =
    new Date(matchDate);

  start.setDate(
    start.getDate() - WINDOW_DAYS
  );


  const startDate =
    localDateKey(start);

  const currentDate =
    dateKey(match.date);


  const from =
    lowerBound(
      items,
      startDate
    );


  /*
    ÖNEMLİ:

    Mevcut kodda currentDate için lowerBound
    kullanılıyordu.

    Bu nedenle aynı gün içindeki maçların
    geçmiş veri hesabına girmesi engelleniyordu.

    Şimdi yalnızca mevcut maçı dışarıda bırakıyoruz.
  */

  const to =
    lowerBound(
      items,
      currentDate
    );


  const count =
    Math.max(0, to - from);


  const before =
    from > 0
      ? items[from - 1].total
      : 0;


  const successful =
    (to > 0
      ? items[to - 1].total
      : 0) -
    before;


  return {
    count,
    successful,
    rate:
      count
        ? (successful / count) * 100
        : null
  };
}


/* =========================================================
   MAÇ ANALİZİ
========================================================= */

function analyze(match) {

  return MARKETS
    .map((market) => ({
      market,
      ...getHistory(match, market)
    }))
    .filter(
      (item) =>
        item.count > 0
    );
}


/* =========================================================
   ÖNERİLER
========================================================= */

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


/* =========================================================
   MAÇ SONUCU
========================================================= */

function outcome(
  match,
  recommendations
) {

  if (
    match.status !== "finished" ||
    !recommendations.length
  ) {
    return "pending";
  }


  const won =
    recommendations.every(
      ({ market }) =>
        String(
          match.results?.[market.result]
        ).toUpperCase() ===
        String(
          market.expected
        ).toUpperCase()
    );


  return won
    ? "won"
    : "lost";
}


/* =========================================================
   İSTATİSTİKLER
========================================================= */

function renderStats(
  selected,
  dayMatches
) {

  const settled =
    dayMatches.flatMap(
      (match) => {

        const recs =
          recommendationFor(match);

        if (
          recs.length &&
          match.status === "finished"
        ) {

          return [{
            won:
              outcome(
                match,
                recs
              ) === "won"
          }];

        }

        return [];
      }
    );


  const selectedDate =
    dateObject(selected);


  const windowStart =
    new Date(selectedDate);

  windowStart.setDate(
    windowStart.getDate() -
    WINDOW_DAYS
  );


  const overall =
    matches
      .filter((match) => {

        const matchDate =
          dateObject(match.date);

        return (
          matchDate >= windowStart &&
          matchDate <= selectedDate
        );

      })
      .flatMap((match) => {

        const recs =
          recommendationFor(match);

        const primary =
          recs[0];

        if (
          !primary ||
          match.status !== "finished"
        ) {
          return [];
        }

        return [{
          won:
            String(
              match.results?.[
                primary.market.result
              ]
            ).toUpperCase() ===
            String(
              primary.market.expected
            ).toUpperCase()
        }];

      });


  const ratio = (list) =>
    list.length
      ? (
          list.filter(
            (item) => item.won
          ).length /
          list.length
        ) * 100
      : null;


  if ($("daySuccess")) {
    $("daySuccess").textContent =
      pct(ratio(settled));
  }


  if ($("daySuccessMeta")) {
    $("daySuccessMeta").textContent =
      settled.length
        ? `${settled.length} tamamlanan öneri`
        : "Tamamlanan öneri yok";
  }


  if ($("overallSuccess")) {
    $("overallSuccess").textContent =
      pct(ratio(overall));
  }


  if ($("overallSuccessMeta")) {
    $("overallSuccessMeta").textContent =
      overall.length
        ? `Son ${WINDOW_DAYS} gündeki ${overall.length} öneri`
        : `Son ${WINDOW_DAYS} günde tamamlanan öneri yok`;
  }


  if ($("matchCount")) {
    $("matchCount").textContent =
      dayMatches.length;
  }


  const dates =
    matches
      .map((item) =>
        dateKey(item.date)
      )
      .filter(Boolean)
      .sort();


  if ($("dataRange")) {
    $("dataRange").textContent =
      dates.length
        ? `${dates[0]} – ${lastItem(dates)}`
        : "—";
  }


  const updated =
    matches
      .map((item) =>
        item.lastUpdated
      )
      .filter(Boolean)
      .sort();


  if ($("lastUpdated")) {

    if (updated.length) {

      const latest =
        lastItem(updated);

      const parsed =
        new Date(latest);


      $("lastUpdated").textContent =
        `Veri güncelleme zamanı: ${
          Number.isNaN(
            parsed.getTime()
          )
            ? latest
            : parsed.toLocaleString(
                "tr-TR"
              )
        }`;

    } else {

      $("lastUpdated").textContent =
        "Veri güncelleme zamanı: —";

    }
  }
}


/* =========================================================
   DETAYLAR
========================================================= */

function detailMarkup(
  analysis
) {

  const eligible =
    analysis.filter(
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


  eligible.sort(
    (a, b) =>
      (b.rate ?? -1) -
      (a.rate ?? -1)
  );


  return `
    <div class="detail-grid">

      ${eligible
        .map(
          ({
            market,
            count,
            rate
          }) => `
            <div class="detail-item good">

              <span>
                ${market.label}
              </span>

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
   MAÇLARI EKRANA BAS
========================================================= */

function renderMatches(
  dayMatches
) {

  const container =
    $("matches");

  if (!container) return;


  container.innerHTML = "";


  if (!dayMatches.length) {

    container.innerHTML = `
      <div class="empty">
        Bu tarihte kayıtlı maç bulunamadı.
      </div>
    `;

    return;
  }


  const template =
    $("matchTemplate");


  if (!template) {

    container.innerHTML = `
      <div class="empty">
        matchTemplate bulunamadı.
      </div>
    `;

    return;
  }


  dayMatches.forEach(
    (match) => {

      const fragment =
        template.content.cloneNode(
          true
        );


      const card =
        fragment.querySelector(
          ".match-card"
        );


      const recs =
        recommendationFor(match);


      if (card) {

        card.classList.add(
          outcome(
            match,
            recs
          )
        );

      }


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


      if (league) {
        league.textContent =
          match.league ||
          "Lig bilgisi yok";
      }


      if (time) {
        time.textContent =
          match.time || "—";
      }


      if (home) {
        home.textContent =
          match.homeTeam || "—";
      }


      if (away) {
        away.textContent =
          match.awayTeam || "—";
      }


      if (htScore) {

        htScore.textContent =
          [
            "finished",
            "live"
          ].includes(
            match.status
          )
            ? match.halfTimeScore ||
              "—"
            : "—";

      }


      if (ftScore) {

        ftScore.textContent =
          match.status ===
          "finished"
            ? match.fullTimeScore ||
              "—"
            : "—";

      }


      if (recommendation) {

        recommendation.innerHTML =
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
                          match
                            .openingOdds?.[
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
                ${MIN_SAMPLES} geçmiş eşleşmesi
                olan oran bulunamadı
              </span>
            `;

      }


      const button =
        fragment.querySelector(
          ".expand"
        );


      const details =
        fragment.querySelector(
          ".details"
        );


      if (details) {

        details.innerHTML =
          detailMarkup(
            analyze(match)
          );

      }


      if (
        button &&
        details
      ) {

        button.addEventListener(
          "click",
          () => {

            const open =
              !details.hidden;

            details.hidden =
              open;

            button.setAttribute(
              "aria-expanded",
              String(!open)
            );

            button.textContent =
              open
                ? "+"
                : "−";

          }
        );

      }


      container.appendChild(
        fragment
      );

    }
  );
}


/* =========================================================
   SAYFAYI RENDER ET
========================================================= */

function render() {

  const input =
    $("dateInput");

  if (!input) return;


  const selected =
    dateKey(input.value);


  /*
    Tarih seçimindeki asıl kritik nokta:

    JSON tarihini de input tarihini de
    dateKey() üzerinden normalize ediyoruz.
  */

  const dayMatches =
    matches.filter(
      (match) =>
        dateKey(match.date) ===
        selected
    );


  renderStats(
    selected,
    dayMatches
  );


  if ($("resultSummary")) {

    $("resultSummary").textContent =
      `${selected} tarihinde ${dayMatches.length} maç listelendi.`;

  }


  renderMatches(
    dayMatches
  );
}


/* =========================================================
   MATCHES.JSON YÜKLE
========================================================= */

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
      "data/matches.json yüklenemedi"
    );

  }


  const data =
    await response.json();


  if (!Array.isArray(data)) {

    throw new Error(
      "data/matches.json bir JSON array olmalıdır"
    );

  }


  matches =
    data;


  /*
    Tarihleri normalize ederek sırala.
  */

  matches.sort(
    (a, b) => {

      const dateA =
        dateKey(a.date);

      const dateB =
        dateKey(b.date);

      return (
        `${dateA}${a.time || ""}${a.homeTeam || ""}`
      ).localeCompare(
        `${dateB}${b.time || ""}${b.homeTeam || ""}`
      );

    }
  );


  buildHistoryIndexes();
}


/* =========================================================
   BAŞLAT
========================================================= */

async function init() {

  try {

    await loadData();


    const dates =
      matches
        .map((item) =>
          dateKey(item.date)
        )
        .filter(Boolean)
        .sort();


    const input =
      $("dateInput");


    if (!input) {

      throw new Error(
        "dateInput bulunamadı"
      );

    }


    if (dates.length) {

      input.min =
        dates[0];

      input.max =
        lastItem(dates);


      const today =
        todayKey();


      /*
        Bugün varsa bugün.
        Yoksa veri içerisindeki son tarih.
      */

      input.value =
        dates.includes(today)
          ? today
          : lastItem(dates);

    }


    input.addEventListener(
      "change",
      render
    );


    render();


  } catch (error) {

    console.error(
      "Uygulama başlatılamadı:",
      error
    );


    if ($("matches")) {

      $("matches").innerHTML = `
        <div class="empty">

          Veri dosyası yüklenemedi.

          <br>

          <small>
            data/matches.json dosyasını kontrol edin.
          </small>

        </div>
      `;

    }

  }

}


init();
