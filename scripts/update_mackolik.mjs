import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const SITE = "https://arsiv.mackolik.com";
const PAGE = SITE + "/Genis-Iddaa-Programi";
const DATA_PATH = path.resolve("data/matches.json");

function parseJsLiteral(text) {
  const cleanText = text.replace(/^\uFEFF/, "");

  return vm.runInNewContext(
    "(" + cleanText + ")",
    Object.create(null)
  );
}

function numberOrNull(value) {
  if (
    value === "" ||
    value === null ||
    value === undefined ||
    typeof value === "object"
  ) {
    return null;
  }

  const number = Number(
    String(value).replace(",", ".")
  );

  return Number.isFinite(number)
    ? number
    : null;
}

function parseScoreValue(value, status) {
  const normalizedStatus = Number(status);

  if (normalizedStatus === 0) {
    return null;
  }

  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const result = String(value).trim();

  return result === "" ? null : result;
}

async function getCurrentWeek() {
  const response = await fetch(PAGE);

  if (!response.ok) {
    throw new Error(
      "Maçkolik sayfası alınamadı. HTTP " +
        response.status
    );
  }

  const html = await response.text();

  const match = html.match(
    /currentWeek\s*=\s*"(\d+)"/
  );

  if (!match) {
    throw new Error(
      "Maçkolik güncel bülten haftası bulunamadı."
    );
  }

  return Number(match[1]);
}

async function fetchMatches(week) {
  const url =
    SITE +
    "/AjaxHandlers/ProgramDataHandler.ashx" +
    "?type=6" +
    "&sortValue=DATE" +
    "&day=-1" +
    "&sort=-1" +
    "&sortDir=-1" +
    "&groupId=-1" +
    "&np=0" +
    "&sport=1";

  console.log("Maçkolik verisi alınıyor...");
  console.log(url);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      "Maçkolik maç verisi alınamadı. HTTP " +
        response.status
    );
  }

  const text = await response.text();

  const payload = parseJsLiteral(text);

  const matches = [];

  for (const day of payload.m ?? []) {
    for (const row of day.m ?? []) {
      const matchStatus = Number(
        row[5] ?? 0
      );

      matches.push({
        code: String(row[0]),

        week: week,

        date:
          row[7] ||
          day.d ||
          null,

        time:
          row[6] ||
          null,

        league:
          row[26] ||
          "",

        home:
          row[1] ||
          "",

        away:
          row[3] ||
          "",

        mbs:
          numberOrNull(row[13]),

        status:
          matchStatus,

        score: {
          home:
            parseScoreValue(
              row[8],
              matchStatus
            ),

          away:
            parseScoreValue(
              row[9],
              matchStatus
            )
        },

        halfTimeScore: {
          home:
            parseScoreValue(
              row[11],
              matchStatus
            ),

          away:
            parseScoreValue(
              row[12],
              matchStatus
            )
        },

        openingOdds: {
          ms1:
            numberOrNull(row[16]),

          msX:
            numberOrNull(row[17]),

          ms2:
            numberOrNull(row[18]),

          cs1X:
            numberOrNull(row[19]),

          cs12:
            numberOrNull(row[20]),

          csX2:
            numberOrNull(row[21]),

          au25Alt:
            numberOrNull(row[22]),

          au25Ust:
            numberOrNull(row[23]),

          handicap:
            row[14] || null,

          handicap1:
            numberOrNull(row[36]),

          handicapX:
            numberOrNull(row[37]),

          handicap2:
            numberOrNull(row[38]),

          kgVar:
            numberOrNull(row[39]),

          kgYok:
            numberOrNull(row[40]),

          iy15Alt:
            numberOrNull(row[42]),

          iy15Ust:
            numberOrNull(row[43]),

          au15Alt:
            numberOrNull(row[44]),

          au15Ust:
            numberOrNull(row[45]),

          au35Alt:
            numberOrNull(row[46]),

          au35Ust:
            numberOrNull(row[47]),

          gol01:
            numberOrNull(row[29]),

          gol23:
            numberOrNull(row[30]),

          gol46:
            numberOrNull(row[31]),

          gol7:
            numberOrNull(row[32]),

          iy1:
            numberOrNull(row[33]),

          iyX:
            numberOrNull(row[34]),

          iy2:
            numberOrNull(row[35])
        }
      });
    }
  }

  return matches;
}

function sameJson(a, b) {
  return (
    JSON.stringify(a) ===
    JSON.stringify(b)
  );
}

let previous = {
  source: PAGE,
  week: null,
  updatedAt: null,
  matches: []
};

try {
  const previousText =
    await fs.readFile(
      DATA_PATH,
      "utf8"
    );

  const parsed =
    JSON.parse(previousText);

  /*
   * Mevcut sistemimiz:
   *
   * {
   *   source: "...",
   *   week: 123,
   *   updatedAt: "...",
   *   matches: [...]
   * }
   */

  if (
    parsed &&
    Array.isArray(parsed.matches)
  ) {
    previous = parsed;
  } else if (
    Array.isArray(parsed)
  ) {
    /*
     * Güvenlik için doğrudan array
     * formatını da destekliyoruz.
     */
    previous = {
      source: PAGE,
      week: null,
      updatedAt: null,
      matches: parsed
    };
  } else {
    throw new Error(
      "data/matches.json geçerli bir maç formatında değil."
    );
  }
} catch (error) {
  if (error.code === "ENOENT") {
    console.log(
      "data/matches.json bulunamadı. Yeni dosya oluşturulacak."
    );
  } else {
    throw error;
  }
}

console.log(
  "Mevcut maç sayısı:",
  previous.matches.length
);

const week =
  await getCurrentWeek();

console.log(
  "Güncel bülten haftası:",
  week
);

const fetched =
  await fetchMatches(week);

console.log(
  "Maçkolik'ten gelen maç sayısı:",
  fetched.length
);

const previousByCode =
  new Map();

for (
  const match of
  previous.matches
) {
  previousByCode.set(
    String(match.code),
    match
  );
}

let changed = false;
let added = 0;
let updated = 0;

for (
  const current of fetched
) {
  const code =
    String(current.code);

  const old =
    previousByCode.get(code);

  /*
   * YENİ MAÇ
   */
  if (!old) {
    previousByCode.set(
      code,
      {
        ...current,

        openingRecordedAt:
          new Date().toISOString()
      }
    );

    changed = true;
    added++;

    continue;
  }

  /*
   * MEVCUT MAÇ
   *
   * Açılış oranları korunur.
   */
  const merged = {
    ...old,

    week:
      current.week,

    date:
      current.date,

    time:
      current.time,

    league:
      current.league,

    home:
      current.home,

    away:
      current.away,

    mbs:
      current.mbs,

    status:
      current.status,

    score:
      current.score,

    halfTimeScore:
      current.halfTimeScore,

    openingOdds:
      old.openingOdds ??
      current.openingOdds,

    openingRecordedAt:
      old.openingRecordedAt ??
      "previous-record"
  };

  if (
    !sameJson(
      old.score,
      current.score
    ) ||
    !sameJson(
      old.halfTimeScore,
      current.halfTimeScore
    ) ||
    Number(old.status) !==
      Number(current.status)
  ) {
    changed = true;
  }

  previousByCode.set(
    code,
    merged
  );

  updated++;
}

/*
 * Eski maçlar korunuyor.
 * Yeni maçlar ekleniyor.
 */
const matches =
  Array.from(
    previousByCode.values()
  );

if (
  matches.length !==
  previous.matches.length
) {
  changed = true;
}

const next = {
  source: PAGE,

  week: week,

  updatedAt:
    changed
      ? new Date().toISOString()
      : previous.updatedAt,

  matches: matches
};

if (
  changed ||
  !previous.matches ||
  previous.matches.length === 0
) {
  await fs.mkdir(
    path.dirname(DATA_PATH),
    {
      recursive: true
    }
  );

  const output =
    JSON.stringify(
      next,
      null,
      2
    ) + "\n";

  await fs.writeFile(
    DATA_PATH,
    output,
    "utf8"
  );

  console.log(
    "data/matches.json güncellendi."
  );
} else {
  console.log(
    "Veride değişiklik yok. Dosya yeniden yazılmadı."
  );
}

console.log("");
console.log("================================");
console.log("GÜNCELLEME TAMAMLANDI");
console.log("================================");
console.log(
  "Hafta:",
  week
);
console.log(
  "Gelen:",
  fetched.length
);
console.log(
  "Yeni:",
  added
);
console.log(
  "Güncellenen:",
  updated
);
console.log(
  "Toplam:",
  matches.length
);
