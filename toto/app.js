```javascript
const MIN_SAMPLES = 5;

let data = {
  matches: []
};

const $ = selector =>
  document.querySelector(selector);

/* =========================================================
   TARİH
========================================================= */

function iso(match) {
  const value = String(match.date || "").trim();

  if (!value) return "";

  // 24.09.2026
  const parts = value.split(".");

  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  // 2026-09-24
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  // 2026/09/24
  const slash = value.split("/");

  if (slash.length === 3) {
    if (slash[0].length === 4) {
      return `${slash[0]}-${slash[1]}-${slash[2]}`;
    }

    return `${slash[2]}-${slash[1]}-${slash[0]}`;
  }

  return value.slice(0, 10);
}

/* =========================================================
   SAYI
========================================================= */

function numeric(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(
      String(value).replace(",", ".")
    );

  return Number.isFinite(number)
    ? number
    : null;
}

/* =========================================================
   AÇILIŞ ORANI
========================================================= */

function marketValue(match, field) {
  return numeric(
    (match.openingOdds || {})[field]
  );
}

/* =========================================================
   MAÇ SONUCU
========================================================= */

function result(match) {
  const score =
    match.score || {};

  if (
    score.home === "" ||
    score.away === "" ||
    score.home == null ||
    score.away == null
  ) {
    return null;
  }

  const home =
    Number(score.home);

  const away =
    Number(score.away);

  if (
    !Number.isFinite(home) ||
    !Number.isFinite(away)
  ) {
    return null;
  }

  if (home > away) return "1";
  if (home < away) return "2";

  return "X";
}

/* =========================================================
   BİTMİŞ MAÇ MI?
========================================================= */

function isFinished(match) {
  return result(match) !== null;
}

/* =========================================================
   HAFTA
========================================================= */

function getWeek(match) {

  const value =
    match.week ??
    match.weekId ??
    match.weekNumber;

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

/* =========================================================
   SPOR TOTO MAÇLARI
=========================================================

   Eski kod sadece:

   weekId
   league = Spor Toto
   sportoto.gov.tr

   arıyordu.

   Ancak matches.json yapısında haftalık veri
   "week" alanında geliyor.

   Bu nedenle önce haftayı belirliyoruz.
========================================================= */

function sportotoMatches() {

  if (
    !Array.isArray(data.matches)
  ) {
    return [];
  }

  const all =
    data.matches.filter(
      match =>
        match &&
        match.home &&
        match.away
    );

  if (!all.length) {
    return [];
  }

  /*
     Önce week alanlarını bul.
  */

  const weeks =
    all
      .map(getWeek)
      .filter(
        Number.isFinite
      );

  /*
     En güncel hafta.
  */

  if (weeks.length) {

    const latestWeek =
      Math.max(...weeks);

    const latest =
      all.filter(
        match =>
          getWeek(match) ===
          latestWeek
      );

    if (latest.length) {
      return latest;
    }
  }

  /*
     Eğer hafta alanı yoksa
     tüm maçları kullan.
  */

  return all;
}

/* =========================================================
   ANALİZ
========================================================= */

function analyze(match) {

  /*
     Spor Toto için:

     MS 1
     MS X
     MS 2

     açılış oranlarının geçmişte
     hangi sonuçlarla eşleştiğine bakılır.
  */

  const markets = [
    ["1", "ms1"],
    ["X", "msX"],
    ["2", "ms2"]
  ];

  const counts = {
    1: 0,
    X: 0,
    2: 0
  };

  let samples = 0;

  for (
    const [, field]
    of markets
  ) {

    const opening =
      marketValue(
        match,
        field
      );

    if (opening === null) {
      continue;
    }

    for (
      const previous
      of data.matches
    ) {

      /*
         Aynı maçı geçmiş örneğe
         dahil etme.
      */

      if (
        previous === match
      ) {
        continue;
      }

      const previousOpening =
        marketValue(
          previous,
          field
        );

      if (
        previousOpening === null
      ) {
        continue;
      }

      if (
        previousOpening !==
        opening
      ) {
        continue;
      }

      const finishedResult =
        result(previous);

      if (!finishedResult) {
        continue;
      }

      counts[
        finishedResult
      ]++;

      samples++;
    }
  }

  if (!samples) {
    return {
      samples: 0
    };
  }

  const pick =
    Object.keys(counts)
      .sort(
        (a, b) =>
          counts[b] -
          counts[a]
      )[0];

  const confidence =
    counts[pick] /
    samples *
    100;

  const odds =
    match.openingOdds ||
    {};

  return {
    samples,
    pick,
    confidence,
    counts,
    odds:
      `${odds.ms1 ?? "—"} / ` +
      `${odds.msX ?? "—"} / ` +
      `${odds.ms2 ?? "—"}`
  };
}

/* =========================================================
   MAÇ ÇİZ
========================================================= */

function draw() {

  const dateInput =
    $("#date");

  const list =
    $("#list");

  if (
    !dateInput ||
    !list
  ) {
    return;
  }

  const selectedDate =
    dateInput.value;

  const rows =
    sportotoMatches()
      .filter(
        match =>
          iso(match) ===
          selectedDate
      );

  let decisions = 0;
  let pending = 0;
  let confidenceTotal = 0;

  list.innerHTML =
    rows
      .map(match => {

        const analysis =
          analyze(match);

        const ready =
          analysis &&
          analysis.pick &&
          analysis.samples >=
            MIN_SAMPLES;

        let state =
          "pending";

        let label =
          "Bekliyor";

        if (ready) {

          decisions++;

          confidenceTotal +=
            analysis.confidence;

          const actual =
            result(match);

          if (actual) {

            if (
              actual ===
              analysis.pick
            ) {

              state =
                "won";

              label =
                "✓ Tuttu";

            } else {

              state =
                "lost";

              label =
                "× Tutmadı";
            }

          } else {

            state =
              "pending";

            label =
              "… Bekliyor";
          }

        } else {

          pending++;
        }

        const odds =
          match.openingOdds ||
          {};

        const score =
          match.score || {};

        const fullScore =
          result(match) !== null
            ? `${score.home}-${score.away}`
            : "";

        return `
          <article class="match">

            <div class="teams">

              <strong>
                ${match.home || "?"}
              </strong>

              <small>vs</small>

              <strong>
                ${match.away || "?"}
              </strong>

            </div>

            <div class="match-meta">

              <span>
                ${match.time || ""}
              </span>

              ${
                match.league
                  ? `<span>${match.league}</span>`
                  : ""
              }

              ${
                fullScore
                  ? `<span>Skor: ${fullScore}</span>`
                  : ""
              }

            </div>

            <div class="odds">

              <span
                class="odd ${
                  analysis?.pick === "1"
                    ? "selected"
                    : ""
                }"
              >
                1
                ${odds.ms1 ?? "—"}
              </span>

              <span
                class="odd ${
                  analysis?.pick === "X"
                    ? "selected"
                    : ""
                }"
              >
                X
                ${odds.msX ?? "—"}
              </span>

              <span
                class="odd ${
                  analysis?.pick === "2"
                    ? "selected"
                    : ""
                }"
              >
                2
                ${odds.ms2 ?? "—"}
              </span>

            </div>

            <div class="prediction">

              ${
                ready

                  ? `
                    <span class="pick">
                      MS ${analysis.pick}
                      · %${Math.round(
                        analysis.confidence
                      )}
                    </span>

                    <br>

                    <small>
                      ${analysis.samples}
                      geçmiş eşleşme
                    </small>

                    <br>

                    <small>
                      Oranlar:
                      ${analysis.odds}
                    </small>
                  `

                  : `
                    <span class="pending">
                      Yeterli geçmiş eşleşmesi yok
                    </span>
                  `
              }

            </div>

            <div
              class="status ${state}"
            >
              ${label}
            </div>

          </article>
        `;

      })
      .join("")

    ||

    `
      <div class="panel">

        Bu tarihte maç yok.

      </div>
    `;

  if ($("#count")) {
    $("#count").textContent =
      rows.length;
  }

  if ($("#decisions")) {
    $("#decisions").textContent =
      decisions;
  }

  if ($("#pending")) {
    $("#pending").textContent =
      pending;
  }

  if ($("#confidence")) {

    $("#confidence").textContent =
      decisions
        ? `%${Math.round(
            confidenceTotal /
            decisions
          )}`
        : "—";
  }
}

/* =========================================================
   TARİH SEÇİCİYİ DOLDUR
========================================================= */

function init() {

  const official =
    sportotoMatches();

  const dates =
    [
      ...new Set(
        official
          .map(iso)
          .filter(Boolean)
      )
    ]
    .sort();

  const date =
    $("#date");

  if (!date) {
    return;
  }

  date.innerHTML =
    dates
      .map(
        value =>
          `<option value="${value}">
             ${value}
           </option>`
      )
      .join("");

  /*
     Önce gerçek bugünü seç.
  */

  const now =
    new Date();

  const today =
    `${now.getFullYear()}-` +
    `${String(
      now.getMonth() + 1
    ).padStart(2, "0")}-` +
    `${String(
      now.getDate()
    ).padStart(2, "0")}`;

  /*
     Bugün varsa bugün.
     Yoksa bugünden sonraki ilk tarih.
     O da yoksa son tarih.
  */

  date.value =
    dates.includes(today)
      ? today
      : dates.find(
          value =>
            value >= today
        ) ||
        dates.at(-1) ||
        "";

  draw();
}

/* =========================================================
   VERİ YÜKLE
========================================================= */

async function load() {

  const list =
    $("#list");

  try {

    if (list) {

      list.innerHTML = `
        <div class="panel">
          Veriler yükleniyor...
        </div>
      `;
    }

    const response =
      await fetch(
        "../data/matches.json?" +
        Date.now(),
        {
          cache: "no-store"
        }
      );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    let json =
      await response.json();

    /*
       Hem:

       { matches: [...] }

       hem de

       [...]

       formatını destekle.
    */

    if (Array.isArray(json)) {

      data = {
        matches: json
      };

    } else {

      data = json;
    }

    if (
      !Array.isArray(
        data.matches
      )
    ) {

      throw new Error(
        "matches dizisi bulunamadı."
      );
    }

    console.log(
      "TOTO veri sayısı:",
      data.matches.length
    );

    console.log(
      "TOTO haftalar:",
      [
        ...new Set(
          data.matches
            .map(getWeek)
            .filter(
              Number.isFinite
            )
        )
      ]
    );

    console.log(
      "TOTO maç örneği:",
      data.matches[0]
    );

    init();

  } catch (error) {

    console.error(
      "TOTO veri yükleme hatası:",
      error
    );

    if (list) {

      list.innerHTML = `
        <div class="panel">

          <strong>
            Veriler yüklenemedi.
          </strong>

          <br><br>

          ${error.message}

          <br><br>

          <small>
            ../data/matches.json
          </small>

        </div>
      `;
    }
  }
}

/* =========================================================
   OLAYLAR
========================================================= */

const dateElement =
  $("#date");

if (dateElement) {

  dateElement.onchange =
    draw;
}

const reload =
  $("#reload");

if (reload) {

  reload.onclick =
    load;
}

/* =========================================================
   BAŞLAT
========================================================= */

load();
```
