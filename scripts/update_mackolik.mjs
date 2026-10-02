import fs from "node:fs/promises";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const dataPath = path.join(
  root,
  "data",
  "matches.json"
);

const sourceUrl =
  "https://arsiv.mackolik.com/AjaxHandlers/ProgramDataHandler.ashx";

const finishedStatuses = new Set([
  4, 5, 6, 7, 8,
  10, 12, 13, 14, 15, 16, 17, 18, 19, 20
]);

const specialStatuses = new Set([
  9, 11, 21, 22, 23
]);

const clean = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeTeam = (value) =>
  clean(value)
    .replaceAll("�", "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "");

const number = (value) => {
  if (
    value == null ||
    value === "" ||
    value === "-" ||
    value === "0" ||
    value === "0,00"
  ) {
    return null;
  }

  const parsed = Number(
    String(value).replace(",", ".")
  );

  return Number.isFinite(parsed)
    ? parsed
    : null;
};

const scoreValue = (value) =>
  /^\d+$/.test(clean(value))
    ? clean(value)
    : null;

const scoreText = (home, away) =>
  scoreValue(home) != null &&
  scoreValue(away) != null
    ? `${scoreValue(home)}-${scoreValue(away)}`
    : null;

const sameTeam = (left, right) => {
  if (!left || !right) return false;

  if (left === right) return true;

  if (
    left.length < 5 ||
    right.length < 5
  ) {
    return false;
  }

  return (
    left.startsWith(right) ||
    right.startsWith(left)
  );
};

const isoDate = (value) => {
  const [day, month, year] =
    clean(value).split(".");

  return `${year}-${month.padStart(
    2,
    "0"
  )}-${day.padStart(2, "0")}`;
};

function getTurkeyToday() {
  const parts = new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  ).formatToParts(new Date());

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return `${values.day}.${values.month}.${values.year}`;
}

function resultValues(row) {
  const home = scoreValue(row[8]);
  const away = scoreValue(row[9]);

  const htHome = scoreValue(row[11]);
  const htAway = scoreValue(row[12]);

  const msResult =
    home == null || away == null
      ? ""
      : Number(home) > Number(away)
        ? "1"
        : Number(home) < Number(away)
          ? "2"
          : "0";

  const kgResult =
    home == null || away == null
      ? ""
      : Number(home) > 0 &&
        Number(away) > 0
        ? "VAR"
        : "YOK";

  const iy15Result =
    htHome == null ||
    htAway == null
      ? ""
      : Number(htHome) +
          Number(htAway) >= 2
        ? "ÜST"
        : "ALT";

  const over25Result =
    home == null || away == null
      ? ""
      : Number(home) +
          Number(away) >= 3
        ? "ÜST"
        : "ALT";

  return {
    msResult,
    kgResult,
    iy15Result,
    over25Result
  };
}

function parseSource(raw) {
  if (!/^\s*\{m:/.test(raw)) {
    throw new Error(
      "Maçkolik cevabı beklenen formatta değil."
    );
  }

  return vm.runInNewContext(
    `(${raw})`,
    Object.create(null),
    {
      timeout: 5000
    }
  );
}

async function fetchRows() {
  const today = getTurkeyToday();

  const params = new URLSearchParams({
    type: "6",
    sortValue: "DATE",
    day: today,
    sort: "-1",
    sortDir: "-1",
    groupId: "-1",
    np: "0",
    sport: "1"
  });

  const response = await fetch(
    `${sourceUrl}?${params}`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 oran-analiz-updater"
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `Maçkolik HTTP ${response.status}`
    );
  }

  const parsed = parseSource(
    await response.text()
  );

  return (parsed.m ?? []).flatMap(
    (group) => group.m ?? []
  );
}

function toMatch(row) {
  const status = Number(row[5]);

  const home = clean(row[1]);
  const away = clean(row[3]);

  const finished =
    finishedStatuses.has(status) &&
    !specialStatuses.has(status);

  const live =
    !finished &&
    status >= 2 &&
    !specialStatuses.has(status);

  return {
    id: `mackolik-${row[0]}`,

    date: isoDate(row[7]),
    time: clean(row[6]),
    league: clean(row[26]),

    homeTeam: home,
    awayTeam: away,

    normalizedHomeTeam:
      normalizeTeam(home),

    normalizedAwayTeam:
      normalizeTeam(away),

    openingOdds: {
      ms1: number(row[16]),
      ms0: number(row[17]),
      ms2: number(row[18]),

      kgYes: number(row[39]),
      kgNo: number(row[40]),

      iy15Under: number(row[42]),
      iy15Over: number(row[43]),

      under25: number(row[22]),
      over25: number(row[23])
    },

    halfTimeScore:
      finished || live
        ? scoreText(row[11], row[12])
        : null,

    fullTimeScore:
      finished
        ? scoreText(row[8], row[9])
        : null,

    results:
      finished
        ? resultValues(row)
        : {
            msResult: "",
            kgResult: "",
            iy15Result: "",
            over25Result: ""
          },

    status:
      finished
        ? "finished"
        : live
          ? "live"
          : "not_started",

    lastUpdated:
      new Date().toISOString()
  };
}

async function loadMatches() {
  try {
    const raw = await fs.readFile(
      dataPath,
      "utf8"
    );

    const data = JSON.parse(raw);

    if (!Array.isArray(data)) {
      throw new Error(
        "data/matches.json bir JSON dizisi olmalı."
      );
    }

    return data;
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function findExisting(
  existing,
  incoming
) {
  // Önce doğrudan ID
  const byId = existing.find(
    (item) =>
      String(item.id) ===
      String(incoming.id)
  );

  if (byId) {
    return byId;
  }

  // ID değişmişse takım + tarih + saat
  const exact = existing.find(
    (item) =>
      item.date === incoming.date &&
      item.time === incoming.time &&
      sameTeam(
        item.normalizedHomeTeam,
        incoming.normalizedHomeTeam
      ) &&
      sameTeam(
        item.normalizedAwayTeam,
        incoming.normalizedAwayTeam
      )
  );

  if (exact) {
    return exact;
  }

  // Saat değişmişse takım + tarih
  return existing.find(
    (item) =>
      item.date === incoming.date &&
      sameTeam(
        item.normalizedHomeTeam,
        incoming.normalizedHomeTeam
      ) &&
      sameTeam(
        item.normalizedAwayTeam,
        incoming.normalizedAwayTeam
      )
  );
}

async function saveMatches(matches) {
  matches.sort((a, b) =>
    `${a.date}${a.time}${a.homeTeam}`
      .localeCompare(
        `${b.date}${b.time}${b.homeTeam}`
      )
  );

  await fs.mkdir(
    path.dirname(dataPath),
    {
      recursive: true
    }
  );

  await fs.writeFile(
    dataPath,
    JSON.stringify(matches),
    "utf8"
  );
}

const existing = await loadMatches();

console.log(
  `Mevcut matches.json kayıtları: ${existing.length}`
);

const rows = await fetchRows();

console.log(
  `Maçkolik'ten alınan maç sayısı: ${rows.length}`
);

let added = 0;
let updated = 0;

for (const row of rows) {
  const incoming = toMatch(row);

  const current = findExisting(
    existing,
    incoming
  );

  // Yeni maç
  if (!current) {
    existing.push(incoming);
    added++;
    continue;
  }

  /*
   * AÇILIŞ ORANLARINA DOKUNMA.
   *
   * Sadece canlı değişen alanları güncelle.
   */
  current.halfTimeScore =
    incoming.halfTimeScore;

  current.fullTimeScore =
    incoming.fullTimeScore;

  current.results =
    incoming.results;

  current.status =
    incoming.status;

  current.lastUpdated =
    incoming.lastUpdated;

  if (!current.league) {
    current.league =
      incoming.league;
  }

  if (!current.normalizedHomeTeam) {
    current.normalizedHomeTeam =
      incoming.normalizedHomeTeam;
  }

  if (!current.normalizedAwayTeam) {
    current.normalizedAwayTeam =
      incoming.normalizedAwayTeam;
  }

  updated++;
}

await saveMatches(existing);

console.log("");
console.log("==============================");
console.log("MAÇKOLİK GÜNCELLEME TAMAMLANDI");
console.log("==============================");
console.log(`Yeni maç: ${added}`);
console.log(`Güncellenen maç: ${updated}`);
console.log(`Toplam kayıt: ${existing.length}`);
console.log(
  `Dosya: data/matches.json`
);
console.log("==============================");
