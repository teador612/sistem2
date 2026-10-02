import fs from "fs/promises";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");
const HISTORY_DIR = path.join(DATA_DIR, "history");
const MANIFEST_PATH = path.join(DATA_DIR, "manifest.json");
const SOURCE =
  "https://arsiv.mackolik.com/AjaxHandlers/ProgramDataHandler.ashx";
const PAGE =
  "https://arsiv.mackolik.com/Genis-Iddaa-Programi";
/*
=========================================================
MACKOLIK DURUMLARI
=========================================================
*/
const FINISHED_STATUSES = new Set([
  4, 5, 6, 7, 8,
  10, 12, 13, 14, 15, 16, 17, 18, 19, 20
]);
const LIVE_STATUSES = new Set([
  9, 11, 21, 22, 23
]);
/*
=========================================================
AÇILIŞ ORANLARI
BUNLARA DOKUNULMAZ
=========================================================
*/
const OPENING_ODDS = [
  "ms1",
  "msX",
  "ms2",
  "iy1",
  "iyX",
  "iy2",
  "cs1X",
  "cs12",
  "csX2",
  "au25Alt",
  "au25Ust",
  "kgVar",
  "kgYok",
  "iy15Alt",
  "iy15Ust",
  "au15Alt",
  "au15Ust",
  "au35Alt",
  "au35Ust",
  "gol01",
  "gol23",
  "gol46",
  "gol7",
  "handicap",
  "handicap1",
  "handicapX",
  "handicap2"
];
/*
=========================================================
YARDIMCI FONKSİYONLAR
=========================================================
*/
const clean = (value) =>
  String(value ?? "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "");
const number = (value) => {
  if (
    value == null ||
    value === "" ||
    value === "-" ||
    value === "0,00"
  ) {
    return null;
  }
  const parsed = Number(
    String(value)
      .replace(",", ".")
      .trim()
  );
  return Number.isFinite(parsed) ? parsed : null;
};
const scoreValue = (value) => {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) {
    return null;
  }
  return text;
};
const scoreText = (home, away) => {
  const h = scoreValue(home);
  const a = scoreValue(away);
  if (h === null || a === null) {
    return null;
  }
  return `${h}-${a}`;
};
const isoDate = (dateText) => {
  const m = String(dateText ?? "").match(
    /^(\d{2})\.(\d{2})\.(\d{4})$/
  );
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
};
/*
=========================================================
TAKIM İSMİ NORMALİZASYONU
Amaç:
Kayman / Cayman / Cayman Islands
Porto Riko / Puerto Rico
gibi isim farklılıklarını genel olarak yakalamak.
=========================================================
*/
const TEAM_ALIASES = new Map([
  ["kayman", "caymanislands"],
  ["cayman", "caymanislands"],
  ["caymanislands", "caymanislands"],
  ["portoriko", "puertorico"],
  ["puertorico", "puertorico"],
  ["puertoricoislands", "puertorico"]
]);
const normalizeTeam = (value) => {
  const raw = clean(value);
  if (!raw) return "";
  return TEAM_ALIASES.get(raw) ?? raw;
};
const sameTeam = (left, right) => {
  const a = normalizeTeam(left);
  const b = normalizeTeam(right);
  if (!a || !b) return false;
  if (a === b) return true;
  /*
  Uzun takım isimlerinde kontrollü prefix eşleşmesi.
  Örneğin:
  "caymanislands" / "cayman"
  */
  if (a.length >= 5 && b.length >= 5) {
    if (a.startsWith(b) || b.startsWith(a)) {
      return true;
    }
  }
  return false;
};
/*
=========================================================
MACKOLIK SONUÇLARI
=========================================================
*/
const resultValues = (row) => {
  const ftHome = scoreValue(row[8]);
  const ftAway = scoreValue(row[9]);
  const htHome = scoreValue(row[11]);
  const htAway = scoreValue(row[12]);
  let msResult = "";
  let kgResult = "";
  let iy15Result = "";
  let over25Result = "";
  if (ftHome !== null && ftAway !== null) {
    const h = Number(ftHome);
    const a = Number(ftAway);
    if (h > a) msResult = "1";
    else if (h < a) msResult = "2";
    else msResult = "X";
    kgResult =
      h > 0 && a > 0
        ? "VAR"
        : "YOK";
    over25Result =
      h + a >= 3
        ? "ÜST"
        : "ALT";
  }
  if (htHome !== null && htAway !== null) {
    const h = Number(htHome);
    const a = Number(htAway);
    iy15Result =
      h + a >= 2
        ? "ÜST"
        : "ALT";
  }
  return {
    msResult,
    kgResult,
    iy15Result,
    over25Result
  };
};
/*
=========================================================
MACKOLIK CEVABINI PARSE ET
=========================================================
*/
const parseSource = (raw) => {
  const text = String(raw ?? "").trim();
  if (!/^\{m:/.test(text)) {
    throw new Error(
      `Beklenmeyen Mackolik cevabı: ${text.slice(0, 300)}`
    );
  }
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(
    `result = (${text});`,
    sandbox
  );
  return sandbox.result;
};
/*
=========================================================
BUGÜNÜN MACKOLIK VERİSİNİ ÇEK
=========================================================
*/
const getTurkeyDate = () => {
  const formatter = new Intl.DateTimeFormat(
    "tr-TR",
    {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  );
  const parts = formatter.formatToParts(new Date());
  const year = parts.find(
    (x) => x.type === "year"
  )?.value;
  const month = parts.find(
    (x) => x.type === "month"
  )?.value;
  const day = parts.find(
    (x) => x.type === "day"
  )?.value;
  return {
    day,
    month,
    year,
    display: `${day}.${month}.${year}`,
    iso: `${year}-${month}-${day}`
  };
};
async function fetchRows() {
  const turkeyDate = getTurkeyDate();
  const params = new URLSearchParams({
    type: "6",
    sortValue: "DATE",
    day: turkeyDate.display,
    sort: "-1",
    sortDir: "-1",
    groupId: "-1",
    np: "0",
    sport: "1"
  });
  const url = `${SOURCE}?${params}`;
  console.log("Mackolik çekiliyor:");
  console.log(turkeyDate.display);
  console.log(url);
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
      Referer: PAGE,
      Accept: "*/*"
    }
  });
  if (!response.ok) {
    throw new Error(
      `Mackolik HTTP ${response.status}`
    );
  }
  const raw = await response.text();
  const parsed = parseSource(raw);
  const rows = Array.isArray(parsed?.m)
    ? parsed.m
    : [];
  console.log(
    `Mackolik satır sayısı: ${rows.length}`
  );
  return rows;
}
/*
=========================================================
MACKOLIK SATIRINI MAÇ NESNESİNE ÇEVİR
=========================================================
*/
const toMatch = (row) => {
  const statusCode = Number(row[5]);
  const date = isoDate(row[7]);
  const finished =
    FINISHED_STATUSES.has(statusCode);
  const live =
    LIVE_STATUSES.has(statusCode);
  const halfTimeScore =
    finished || live
      ? scoreText(row[11], row[12])
      : null;
  const fullTimeScore =
    finished
      ? scoreText(row[8], row[9])
      : null;
  const results =
    finished
      ? resultValues(row)
      : {
          msResult: "",
          kgResult: "",
          iy15Result: "",
          over25Result: ""
        };
  return {
    id: String(row[0]),
    date,
    time: String(row[6] ?? ""),
    league: String(row[26] ?? ""),
    home: String(row[1] ?? ""),
    away: String(row[3] ?? ""),
    /*
    AÇILIŞ ORANLARI
    */
    ms1: number(row[16]),
    msX: number(row[17]),
    ms2: number(row[18]),
    iy1: number(row[19]),
    iyX: number(row[20]),
    iy2: number(row[21]),
    cs1X: number(row[22]),
    cs12: number(row[23]),
    csX2: number(row[24]),
    au25Alt: number(row[39]),
    au25Ust: number(row[40]),
    kgVar: number(row[42]),
    kgYok: number(row[43]),
    iy15Alt: number(row[44]),
    iy15Ust: number(row[45]),
    au15Alt: number(row[46]),
    au15Ust: number(row[47]),
    au35Alt: number(row[48]),
    au35Ust: number(row[49]),
    gol01: number(row[50]),
    gol23: number(row[51]),
    gol46: number(row[52]),
    gol7: number(row[53]),
    handicap: number(row[54]),
    handicap1: number(row[55]),
    handicapX: number(row[56]),
    handicap2: number(row[57]),
    /*
    SKOR / DURUM
    */
    halfTimeScore,
    fullTimeScore,
    results,
    status:
      finished
        ? "finished"
        : live
          ? "live"
          : "not_started",
    statusCode,
    lastUpdated:
      new Date().toISOString()
  };
};
/*
=========================================================
MANIFEST
=========================================================
*/
async function loadManifest() {
  try {
    const raw = await fs.readFile(
      MANIFEST_PATH,
      "utf8"
    );
    return JSON.parse(raw);
  } catch {
    return {
      months: []
    };
  }
}
/*
=========================================================
TÜM AYLIK HISTORY DOSYALARINI YÜKLE
=========================================================
*/
async function loadExisting() {
  const manifest = await loadManifest();
  const result = [];
  const months = Array.isArray(manifest.months)
    ? manifest.months
    : [];
  for (const month of months) {
    const file = path.join(
      ROOT,
      month.file
    );
    try {
      const raw = await fs.readFile(
        file,
        "utf8"
      );
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        result.push(...parsed);
      } else if (
        Array.isArray(parsed?.matches)
      ) {
        result.push(...parsed.matches);
      }
    } catch {
      console.log(
        `History okunamadı: ${month.file}`
      );
    }
  }
  /*
  Eski sistemden kalmış matches.json varsa
  */
  if (result.length === 0) {
    const oldPath = path.join(
      DATA_DIR,
      "matches.json"
    );
    try {
      const raw = await fs.readFile(
        oldPath,
        "utf8"
      );
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        result.push(...parsed);
      } else if (
        Array.isArray(parsed?.matches)
      ) {
        result.push(...parsed.matches);
      }
    } catch {
      // eski dosya yok
    }
  }
  return result;
}
/*
=========================================================
EŞLEŞTİRME
Öncelik:
1. Gerçek Mackolik ID
2. Tarih + saat + iki takım
3. Tarih + iki takım
Böylece sadece takım adına göre yanlış maç
eşleşmesinin önüne geçilir.
=========================================================
*/
function findExistingMatch(
  incoming,
  existing,
  byId
) {
  /*
  1 — ID
  */
  const direct = byId.get(
    String(incoming.id)
  );
  if (direct) {
    return direct;
  }
  /*
  2 — Tarih + saat + takımlar
  */
  let candidate =
    existing.find(
      (item) =>
        item.date === incoming.date &&
        item.time === incoming.time &&
        sameTeam(
          item.home,
          incoming.home
        ) &&
        sameTeam(
          item.away,
          incoming.away
        )
    );
  if (candidate) {
    return candidate;
  }
  /*
  3 — Tarih + takımlar
  */
  candidate =
    existing.find(
      (item) =>
        item.date === incoming.date &&
        sameTeam(
          item.home,
          incoming.home
        ) &&
        sameTeam(
          item.away,
          incoming.away
        )
    );
  if (candidate) {
    return candidate;
  }
  return null;
}
/*
=========================================================
SADECE SKOR / DURUM GÜNCELLE
ÖNEMLİ:
null gelen skor mevcut skoru SİLMEZ.
Açılış oranları değişmez.
=========================================================
*/
function updateMatch(
  current,
  incoming
) {
  /*
  Mackolik ID'sini koru.
  Eski OLD- kayıtlarında da gerçek ID'yi
  kullanmaya çalış.
  */
  if (
    !current.id ||
    String(current.id).startsWith("OLD-")
  ) {
    current.id = incoming.id;
  }
  /*
  TAKIM / TARİH / SAAT
  Eksikse doldur.
  Var olanı gereksiz yere değiştirme.
  */
  if (!current.date) {
    current.date = incoming.date;
  }
  if (!current.time) {
    current.time = incoming.time;
  }
  if (!current.home) {
    current.home = incoming.home;
  }
  if (!current.away) {
    current.away = incoming.away;
  }
  if (!current.league) {
    current.league = incoming.league;
  }
  /*
  =========================================
  İY SKORU
  =========================================
  */
  if (
    incoming.halfTimeScore !== null &&
    incoming.halfTimeScore !== ""
  ) {
    current.halfTimeScore =
      incoming.halfTimeScore;
  }
  /*
  =========================================
  MS SKORU
  Sadece Mackolik gerçekten skor gönderiyorsa
  güncelle.
  =========================================
  */
  if (
    incoming.fullTimeScore !== null &&
    incoming.fullTimeScore !== ""
  ) {
    current.fullTimeScore =
      incoming.fullTimeScore;
  }
  /*
  =========================================
  STATUS
  =========================================
  */
  current.status =
    incoming.status;
  /*
  =========================================
  STATUS CODE
  =========================================
  */
  if (
    incoming.statusCode !== undefined
  ) {
    current.statusCode =
      incoming.statusCode;
  }
  /*
  =========================================
  RESULTS
  Sadece maç tamamlandıysa değiştir.
  Böylece boş results mevcut sonucu silmez.
  =========================================
  */
  if (
    incoming.status === "finished" &&
    incoming.fullTimeScore !== null
  ) {
    current.results = {
      ...incoming.results
    };
  }
  /*
  =========================================
  LAST UPDATED
  =========================================
  */
  current.lastUpdated =
    incoming.lastUpdated;
  return current;
}
/*
=========================================================
AYLIK DOSYALARA YAZ
=========================================================
*/
async function writePartitioned(
  items
) {
  await fs.mkdir(
    HISTORY_DIR,
    {
      recursive: true
    }
  );
  const groups = new Map();
  for (const item of items) {
    if (!item.date) continue;
    const month =
      String(item.date).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) {
      continue;
    }
    if (!groups.has(month)) {
      groups.set(month, []);
    }
    groups.get(month).push(item);
  }
  const months = [];
  const sortedMonths =
    [...groups.keys()].sort();
  for (const month of sortedMonths) {
    const file =
      `data/history/${month}.json`;
    const absolute =
      path.join(ROOT, file);
    const matches =
      groups.get(month);
    matches.sort((a, b) => {
      const da =
        `${a.date} ${a.time ?? ""}`;
      const db =
        `${b.date} ${b.time ?? ""}`;
      return da.localeCompare(db);
    });
    await fs.writeFile(
      absolute,
      JSON.stringify(
        matches,
        null,
        2
      ) + "\n",
      "utf8"
    );
    months.push({
      month,
      file,
      count: matches.length
    });
  }
  const manifest = {
    updatedAt:
      new Date().toISOString(),
    months
  };
  await fs.writeFile(
    MANIFEST_PATH,
    JSON.stringify(
      manifest,
      null,
      2
    ) + "\n",
    "utf8"
  );
}
/*
=========================================================
MAIN
=========================================================
*/
async function main() {
  console.log("");
  console.log("======================================");
  console.log("MACKOLIK GÜNCELLEME BAŞLADI");
  console.log("======================================");
  console.log("");
  const rows =
    await fetchRows();
  const incoming =
    rows
      .map(toMatch)
      .filter(
        (match) =>
          match.date &&
          match.home &&
          match.away
      );
  console.log(
    `İşlenecek Mackolik maçı: ${incoming.length}`
  );
  const existing =
    await loadExisting();
  console.log(
    `History toplam maç: ${existing.length}`
  );
  const byId =
    new Map(
      existing
        .filter(
          (item) =>
            item.id &&
            !String(item.id).startsWith("OLD-")
        )
        .map(
          (item) => [
            String(item.id),
            item
          ]
        )
    );
  let matched = 0;
  let added = 0;
  let scoreChanged = 0;
  for (const incomingMatch of incoming) {
    const current =
      findExistingMatch(
        incomingMatch,
        existing,
        byId
      );
    if (current) {
      const oldFT =
        current.fullTimeScore ?? null;
      const oldHT =
        current.halfTimeScore ?? null;
      const oldStatus =
        current.status;
      updateMatch(
        current,
        incomingMatch
      );
      const newFT =
        current.fullTimeScore ?? null;
      const newHT =
        current.halfTimeScore ?? null;
      const newStatus =
        current.status;
      if (
        oldFT !== newFT ||
        oldHT !== newHT ||
        oldStatus !== newStatus
      ) {
        scoreChanged++;
      }
      matched++;
    } else {
      /*
      Yeni maç.
      Burada opening odds Mackolik'ten ilk kez
      alınır ve history'ye eklenir.
      */
      existing.push(
        incomingMatch
      );
      byId.set(
        String(incomingMatch.id),
        incomingMatch
      );
      added++;
    }
  }
  /*
  =========================================
  ÖNEMLİ:
  History'deki eski maçlar silinmez.
  =========================================
  */
  await writePartitioned(
    existing
  );
  console.log("");
  console.log("======================================");
  console.log("GÜNCELLEME TAMAMLANDI");
  console.log("======================================");
  console.log(
    `Mackolik maçları : ${incoming.length}`
  );
  console.log(
    `Eşleşen maç      : ${matched}`
  );
  console.log(
    `Yeni eklenen     : ${added}`
  );
  console.log(
    `Skor/durum değişen: ${scoreChanged}`
  );
  console.log(
    `Toplam history   : ${existing.length}`
  );
  console.log("");
}
main().catch((error) => {
  console.error("");
  console.error("GÜNCELLEME HATASI:");
  console.error(error);
  console.error("");
  process.exit(1);
});
