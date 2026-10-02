import fs from "node:fs/promises";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const dataDir = path.join(root, "data");
const dataPath = process.env.MATCHES_PATH
  ? path.resolve(process.env.MATCHES_PATH)
  : path.join(dataDir, "matches.json");

const historyDir = path.join(dataDir, "history");
const manifestPath = path.join(dataDir, "manifest.json");

const sourceUrl =
  "https://arsiv.mackolik.com/AjaxHandlers/ProgramDataHandler.ashx";

const RETENTION_DAYS = 60;

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

  const parsed = Number(String(value).replace(",", "."));

  return Number.isFinite(parsed) ? parsed : null;
};

const scoreValue = (value) =>
  /^\d+$/.test(clean(value)) ? clean(value) : null;

const scoreText = (home, away) =>
  scoreValue(home) != null && scoreValue(away) != null
    ? `${scoreValue(home)}-${scoreValue(away)}`
    : null;

const sameTeam = (left, right) => {
  if (!left || !right) return false;

  if (left === right) return true;

  if (left.length < 5 || right.length < 5) {
    return false;
  }

  return left.startsWith(right) || right.startsWith(left);
};

const isoDate = (value) => {
  const [day, month, year] = clean(value).split(".");

  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};

function getTurkeyToday() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return `${values.day}.${values.month}.${values.year}`;
}

function getTurkeyDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return `${values.year}-${values.month}-${values.day}`;
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
      : Number(home) > 0 && Number(away) > 0
        ? "VAR"
        : "YOK";

  const iy15Result =
    htHome == null || htAway == null
      ? ""
      : Number(htHome) + Number(htAway) >= 2
        ? "ÜST"
        : "ALT";

  const over25Result =
    home == null || away == null
      ? ""
      : Number(home) + Number(away) >= 3
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
      "Maçkolik cevabı beklenen {m:[...]} formatında değil."
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

  const url = `${sourceUrl}?${params}`;

  console.log("Maçkolik verisi alınıyor:", url);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 oran-analiz-updater"
    }
  });

  if (!response.ok) {
    throw new Error(`Maçkolik HTTP ${response.status}`);
  }

  const parsed = parseSource(await response.text());

  return (parsed.m ?? []).flatMap(
    (dateGroup) => dateGroup.m ?? []
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

    normalizedHomeTeam: normalizeTeam(home),
    normalizedAwayTeam: normalizeTeam(away),

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

    lastUpdated: new Date().toISOString()
  };
}

async function loadExisting() {
  try {
    const manifest = JSON.parse(
      await fs.readFile(manifestPath, "utf8")
    );

    const files = Object.values(manifest.files ?? {});

    if (files.length) {
      const chunks = await Promise.all(
        files.map(async (file) => {
          const filePath = path.join(root, file);

          try {
            return JSON.parse(
              await fs.readFile(filePath, "utf8")
            );
          } catch {
            return [];
          }
        })
      );

      return chunks.flat();
    }
  } catch {
    // manifest yoksa matches.json kullanılacak
  }

  try {
    return JSON.parse(
      await fs.readFile(dataPath, "utf8")
    );
  } catch {
    return [];
  }
}

function getCutoffDate() {
  const now = new Date();

  now.setDate(
    now.getDate() - RETENTION_DAYS
  );

  return getTurkeyDateKey(now);
}

function filterRetention(items) {
  const cutoff = getCutoffDate();

  return items.filter(
    (item) => String(item.date) >= cutoff
  );
}

async function writeData(items) {
  await fs.mkdir(dataDir, {
    recursive: true
  });

  await fs.mkdir(historyDir, {
    recursive: true
  });

  /*
   * EN ÖNEMLİ KISIM:
   *
   * Site doğrudan data/matches.json okuyor.
   * Bu nedenle her güncellemede bu dosyayı da yazıyoruz.
   */
  await fs.writeFile(
    dataPath,
    JSON.stringify(items),
    "utf8"
  );

  /*
   * Aylık history dosyaları da korunuyor.
   */
  const groups = new Map();

  for (const item of items) {
    const month = String(item.date).slice(0, 7);

    if (!groups.has(month)) {
      groups.set(month, []);
    }

    groups.get(month).push(item);
  }

  const files = {};

  for (const [month, monthItems] of groups) {
    monthItems.sort((a, b) =>
      `${a.date}${a.time}${a.homeTeam}`
        .localeCompare(
          `${b.date}${b.time}${b.homeTeam}`
        )
    );

    const relative =
      `data/history/${month}.json`;

    await fs.writeFile(
      path.join(root, relative),
      JSON.stringify(monthItems),
      "utf8"
    );

    files[month] = relative;
  }

  const dates = items
    .map((item) => item.date)
    .filter(Boolean)
    .sort();

  const manifest = {
    files,
    minDate: dates[0] ?? null,
    maxDate: dates.at(-1) ?? null,
    updatedAt: new Date().toISOString()
  };

  await fs.writeFile(
    manifestPath,
    JSON.stringify(manifest),
    "utf8"
  );

  console.log(
    `matches.json yazıldı: ${items.length} kayıt`
  );

  console.log(
    `Manifest güncellendi: ${manifest.updatedAt}`
  );
}

const existing = await loadExisting();

if (!Array.isArray(existing)) {
  throw new Error(
    "Mevcut veri bir JSON dizisi olmalı."
  );
}

console.log(
  `Mevcut kayıt sayısı: ${existing.length}`
);

const byId = new Map(
  existing.map((item) => [
    String(item.id),
    item
  ])
);

const byDateTime = new Map();
const byDate = new Map();

for (const item of existing) {
  const key =
    `${item.date}|${item.time}`;

  if (!byDateTime.has(key)) {
    byDateTime.set(key, []);
  }

  byDateTime
    .get(key)
    .push(item);

  if (!byDate.has(item.date)) {
    byDate.set(item.date, []);
  }

  byDate
    .get(item.date)
    .push(item);
}

const teamMatches = (item, match) =>
  sameTeam(
    item.normalizedHomeTeam,
    match.normalizedHomeTeam
  ) &&
  sameTeam(
    item.normalizedAwayTeam,
    match.normalizedAwayTeam
  );

const candidatesFor = (match) => {
  const exactTime =
    (
      byDateTime.get(
        `${match.date}|${match.time}`
      ) ?? []
    ).filter((item) =>
      teamMatches(item, match)
    );

  if (exactTime.length) {
    return exactTime;
  }

  return (
    byDate.get(match.date) ?? []
  ).filter((item) =>
    teamMatches(item, match)
  );
};

const removeItems = new Set();

let added = 0;
let updated = 0;

const rows = await fetchRows();

console.log(
  `Maçkolik'ten ${rows.length} satır alındı.`
);

for (const row of rows) {
  const incoming = toMatch(row);

  const candidates =
    candidatesFor(incoming);

  const current =
    candidates.find((item) =>
      String(item.id).startsWith("OLD-")
    ) ??
    byId.get(incoming.id) ??
    candidates[0];

  /*
   * Yeni maç
   */
  if (!current) {
    existing.push(incoming);

    byId.set(
      incoming.id,
      incoming
    );

    const bucketKey =
      `${incoming.date}|${incoming.time}`;

    if (!byDateTime.has(bucketKey)) {
      byDateTime.set(bucketKey, []);
    }

    byDateTime
      .get(bucketKey)
      .push(incoming);

    if (!byDate.has(incoming.date)) {
      byDate.set(
        incoming.date,
        []
      );
    }

    byDate
      .get(incoming.date)
      .push(incoming);

    added++;

    continue;
  }

  /*
   * AÇILIŞ ORANLARINA DOKUNMUYORUZ.
   *
   * Sadece canlı değişebilecek alanlar yenileniyor.
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

  /*
   * Aynı maça ait eski/kopya kayıtları temizle.
   */
  for (const duplicate of candidates) {
    if (duplicate !== current) {
      removeItems.add(duplicate);
    }
  }

  updated++;
}

/*
 * Kopyaları çıkar
 */
let merged = existing.filter(
  (item) =>
    !removeItems.has(item)
);

/*
 * Sadece son 60 günü tut
 */
merged = filterRetention(merged);

/*
 * Tarihe göre sırala
 */
merged.sort((a, b) =>
  `${a.date}${a.time}${a.homeTeam}`
    .localeCompare(
      `${b.date}${b.time}${b.homeTeam}`
    )
);

/*
 * HER ŞEYDEN SONRA:
 *
 * data/matches.json
 * data/history/*
 * data/manifest.json
 *
 * birlikte güncelleniyor.
 */
await writeData(merged);

console.log("");
console.log(
  "======================================"
);
console.log(
  "MAÇKOLİK GÜNCELLEME TAMAMLANDI"
);
console.log(
  "======================================"
);
console.log(
  `Yeni maç: ${added}`
);
console.log(
  `Güncellenen maç: ${updated}`
);
console.log(
  `Birleştirilen kopya: ${removeItems.size}`
);
console.log(
  `Toplam kayıt: ${merged.length}`
);
console.log(
  `Son ${RETENTION_DAYS} gün tutuluyor.`
);
console.log(
  `Veri dosyası: ${dataPath}`
);
console.log(
  "======================================"
);
