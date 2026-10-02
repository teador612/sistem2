import fs from "node:fs/promises";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const dataPath = process.env.MATCHES_PATH
  ? path.resolve(process.env.MATCHES_PATH)
  : path.join(root, "data", "matches.json");

const sourceUrl =
  "https://arsiv.mackolik.com/AjaxHandlers/ProgramDataHandler.ashx";

const finishedStatuses = new Set([
  4, 5, 6, 7, 8, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20
]);

const specialStatuses = new Set([
  9, 11, 21, 22, 23
]);

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function number(value) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function normalizeTeam(value) {
  return clean(value)
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isoDate(value) {
  const text = clean(value);

  let match = text.match(
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/
  );

  if (match) {
    const [, day, month, year] = match;

    return `${year}-${String(month).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
  }

  match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  return text.slice(0, 10);
}

function scoreText(home, away) {
  const h = clean(home);
  const a = clean(away);

  if (h === "" || a === "") {
    return null;
  }

  return `${h}-${a}`;
}

function resultValues(row) {
  const homeScore = Number(row[8]);
  const awayScore = Number(row[9]);

  if (
    !Number.isFinite(homeScore) ||
    !Number.isFinite(awayScore)
  ) {
    return {
      msResult: "",
      kgResult: "",
      iy15Result: "",
      over25Result: ""
    };
  }

  let msResult = "";

  if (homeScore > awayScore) {
    msResult = "1";
  } else if (homeScore === awayScore) {
    msResult = "0";
  } else {
    msResult = "2";
  }

  const kgResult =
    homeScore > 0 && awayScore > 0
      ? "VAR"
      : "YOK";

  const total = homeScore + awayScore;

  const over25Result =
    total >= 3
      ? "ÜST"
      : "ALT";

  const halfHome = Number(row[11]);
  const halfAway = Number(row[12]);

  let iy15Result = "";

  if (
    Number.isFinite(halfHome) &&
    Number.isFinite(halfAway)
  ) {
    iy15Result =
      halfHome + halfAway >= 2
        ? "ÜST"
        : "ALT";
  }

  return {
    msResult,
    kgResult,
    iy15Result,
    over25Result
  };
}

function parseSource(text) {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {}

  const sandbox = {};

  vm.createContext(sandbox);

  vm.runInContext(
    `
      var result;
      ${trimmed}
    `,
    sandbox
  );

  if (sandbox.result) {
    return sandbox.result;
  }

  throw new Error("Maçkolik verisi çözülemedi.");
}

async function fetchRows() {
  const now = new Date();

  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();

  const today = `${day}.${month}.${year}`;

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

  console.log("Maçkolik verisi alınıyor...");
  console.log(url);

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 oran-analiz-updater"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Maçkolik HTTP ${response.status}`
    );
  }

  const text = await response.text();

  const parsed = parseSource(text);

  return (parsed.m ?? []).flatMap(
    dateGroup => dateGroup.m ?? []
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

/*
 * MEVCUT matches.json DOSYASINI OKU
 *
 * Desteklenen yapı:
 *
 * {
 *   source: "...",
 *   week: 12345,
 *   updatedAt: "...",
 *   matches: [...]
 * }
 *
 * Ayrıca doğrudan [...] formatını da destekler.
 */
async function loadMatches() {
  try {
    const raw = await fs.readFile(
      dataPath,
      "utf8"
    );

    const data = JSON.parse(raw);

    if (Array.isArray(data)) {
      return {
        meta: {},
        matches: data
      };
    }

    if (
      data &&
      Array.isArray(data.matches)
    ) {
      return {
        meta: data,
        matches: data.matches
      };
    }

    throw new Error(
      "data/matches.json içinde matches dizisi bulunamadı."
    );
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        meta: {},
        matches: []
      };
    }

    throw error;
  }
}

function sameMatch(a, b) {
  if (
    a.id &&
    b.id &&
    a.id === b.id
  ) {
    return true;
  }

  if (
    a.date &&
    b.date &&
    a.time &&
    b.time &&
    a.normalizedHomeTeam &&
    b.normalizedHomeTeam &&
    a.normalizedAwayTeam &&
    b.normalizedAwayTeam
  ) {
    return (
      a.date === b.date &&
      a.time === b.time &&
      a.normalizedHomeTeam ===
        b.normalizedHomeTeam &&
      a.normalizedAwayTeam ===
        b.normalizedAwayTeam
    );
  }

  return false;
}

async function saveMatches(meta, matches) {
  matches.sort((a, b) => {
    const aa =
      `${a.date ?? ""}${a.time ?? ""}${a.homeTeam ?? ""}`;

    const bb =
      `${b.date ?? ""}${b.time ?? ""}${b.homeTeam ?? ""}`;

    return aa.localeCompare(bb);
  });

  const output = {
    ...meta,

    source:
      meta.source ??
      "https://arsiv.mackolik.com/Genis-Iddaa-Programi",

    updatedAt:
      new Date().toISOString(),

    matches
  };

  await fs.mkdir(
    path.dirname(dataPath),
    { recursive: true }
  );

  await fs.writeFile(
    dataPath,
    JSON.stringify(output, null, 2),
    "utf8"
  );

  console.log(
    `data/matches.json yazıldı: ${matches.length} maç`
  );
}

async function main() {
  console.log("================================");
  console.log("Maçkolik veri güncellemesi");
  console.log("================================");

  const loaded =
    await loadMatches();

  const existing =
    loaded.matches;

  console.log(
    `Mevcut maç sayısı: ${existing.length}`
  );

  const rows =
    await fetchRows();

  console.log(
    `Maçkolik'ten gelen maç sayısı: ${rows.length}`
  );

  const incomingMatches =
    rows.map(toMatch);

  let added = 0;
  let updated = 0;

  for (const incoming of incomingMatches) {
    const index =
      existing.findIndex(
        current =>
          sameMatch(
            current,
            incoming
          )
      );

    if (index === -1) {
      existing.push(incoming);
      added++;
      continue;
    }

    const current =
      existing[index];

    /*
     * AÇILIŞ ORANLARINI KORUYORUZ.
     *
     * Sadece canlı durum,
     * skor, sonuç ve güncelleme zamanı
     * yenileniyor.
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

    if (!current.time) {
      current.time =
        incoming.time;
    }

    if (!current.homeTeam) {
      current.homeTeam =
        incoming.homeTeam;
    }

    if (!current.awayTeam) {
      current.awayTeam =
        incoming.awayTeam;
    }

    updated++;
  }

  await saveMatches(
    loaded.meta,
    existing
  );

  console.log("");
  console.log("Güncelleme tamamlandı.");
  console.log(`Yeni maç: ${added}`);
  console.log(`Güncellenen maç: ${updated}`);
  console.log(
    `Toplam maç: ${existing.length}`
  );
}

main().catch(error => {
  console.error("");
  console.error(
    "GÜNCELLEME HATASI:"
  );
  console.error(error);
  process.exit(1);
});
