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
const dataDir = path.join(root, "data");
const historyDir = path.join(dataDir, "history");
const manifestPath = path.join(dataDir, "manifest.json");
const sourceUrl =
  "https://arsiv.mackolik.com/AjaxHandlers/ProgramDataHandler.ashx";
const finishedStatuses = new Set([
  4, 5, 6, 7, 8, 10,
  12, 13, 14, 15, 16,
  17, 18, 19, 20
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
    value === "-"
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
/*
 * SKOR
 * 0 geçerli bir skordur.
 */
const scoreValue = (value) => {
  const valueText = clean(value);
  if (!/^\d+$/.test(valueText)) {
    return null;
  }
  return valueText;
};
const scoreText = (home, away) => {
  const homeScore = scoreValue(home);
  const awayScore = scoreValue(away);
  if (
    homeScore === null ||
    awayScore === null
  ) {
    return null;
  }
  return `${homeScore}-${awayScore}`;
};
const sameTeam = (left, right) => {
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }
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
  const parts = clean(value).split(".");
  if (parts.length !== 3) {
    return "";
  }
  const [day, month, year] = parts;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};
/*
 * MS / KG / İY / 2.5 sonuçları
 */
function resultValues(row) {
  const home = scoreValue(row[8]);
  const away = scoreValue(row[9]);
  const htHome = scoreValue(row[11]);
  const htAway = scoreValue(row[12]);
  const msResult =
    home === null || away === null
      ? ""
      : Number(home) > Number(away)
        ? "1"
        : Number(home) < Number(away)
          ? "2"
          : "0";
  const kgResult =
    home === null || away === null
      ? ""
      : Number(home) > 0 &&
          Number(away) > 0
        ? "VAR"
        : "YOK";
  const iy15Result =
    htHome === null || htAway === null
      ? ""
      : Number(htHome) + Number(htAway) >= 2
        ? "ÜST"
        : "ALT";
  const over25Result =
    home === null || away === null
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
/*
 * Maçkolik JavaScript cevabını parse eder.
 */
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
/*
 * Güncel maçları Maçkolik'ten al.
 */
async function fetchRows() {
  const now = new Date();
  const day = String(
    now.getDate()
  ).padStart(2, "0");
  const month = String(
    now.getMonth() + 1
  ).padStart(2, "0");
  const today =
    `${day}.${month}.${now.getFullYear()}`;
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
  const url =
    `${sourceUrl}?${params.toString()}`;
  console.log(
    `Maçkolik verisi çekiliyor: ${today}`
  );
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 sistem2-score-updater",
      "Accept": "*/*",
      "Referer":
        "https://arsiv.mackolik.com/"
    }
  });
  if (!response.ok) {
    throw new Error(
      `Maçkolik HTTP ${response.status}`
    );
  }
  const raw = await response.text();
  console.log(
    `Maçkolik cevap uzunluğu: ${raw.length}`
  );
  const parsed = parseSource(raw);
  const rows = (parsed.m ?? []).flatMap(
    (dateGroup) => dateGroup.m ?? []
  );
  console.log(
    `Maçkolik maç sayısı: ${rows.length}`
  );
  return rows;
}
/*
 * Mackolik satırını bizim maç formatımıza çevir.
 */
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
  /*
   * Skorları doğrudan al.
   * Boş gelirse null olur.
   */
  const halfTimeScore =
    scoreText(row[11], row[12]);
  const fullTimeScore =
    scoreText(row[8], row[9]);
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
    /*
     * AÇILIŞ ORANLARI
     * Güncelleme sırasında değiştirilmez.
     */
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
    halfTimeScore,
    fullTimeScore,
    results: finished
      ? resultValues(row)
      : {
          msResult: "",
          kgResult: "",
          iy15Result: "",
          over25Result: ""
        },
    status: finished
      ? "finished"
      : live
        ? "live"
        : "not_started",
    lastUpdated:
      new Date().toISOString()
  };
}
/*
 * Mevcut aylık history dosyalarını yükle.
 */
async function loadExisting() {
  try {
    const manifest =
      JSON.parse(
        await fs.readFile(
          manifestPath,
          "utf8"
        )
      );
    const files =
      Object.values(
        manifest.files ?? {}
      );
    const chunks =
      await Promise.all(
        files.map(async (file) => {
          try {
            return JSON.parse(
              await fs.readFile(
                path.join(root, file),
                "utf8"
              )
            );
          } catch {
            console.log(
              `History okunamadı: ${file}`
            );
            return [];
          }
        })
      );
    return chunks.flat();
  } catch {
    try {
      return JSON.parse(
        await fs.readFile(
          dataPath,
          "utf8"
        )
      );
    } catch {
      return [];
    }
  }
}
/*
 * Verileri AY AY history dosyalarına yaz.
 *
 * Örnek:
 * data/history/2026-09.json
 * data/history/2026-10.json
 */
async function writePartitioned(items) {
  const groups = new Map();
  for (const item of items) {
    if (!item.date) {
      continue;
    }
    const month =
      String(item.date).slice(0, 7);
    if (!groups.has(month)) {
      groups.set(month, []);
    }
    groups
      .get(month)
      .push(item);
  }
  await fs.mkdir(
    historyDir,
    {
      recursive: true
    }
  );
  const files = {};
  for (
    const [month, monthItems]
    of groups
  ) {
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
  const dates =
    items
      .map((item) => item.date)
      .filter(Boolean)
      .sort();
  await fs.writeFile(
    manifestPath,
    JSON.stringify({
      files,
      minDate: dates[0] ?? null,
      maxDate: dates.at(-1) ?? null,
      updatedAt:
        new Date().toISOString()
    }),
    "utf8"
  );
}
/*
 * ============================================================
 * MEVCUT VERİ
 * ============================================================
 */
const existing =
  await loadExisting();
if (!Array.isArray(existing)) {
  throw new Error(
    "Mevcut maç verisi dizi olmalı."
  );
}
/*
 * Hızlı eşleştirme tabloları
 */
const byId = new Map();
const byDateTime =
  new Map();
const byDate =
  new Map();
for (const item of existing) {
  if (item.id) {
    byId.set(
      String(item.id),
      item
    );
  }
  const dateTimeKey =
    `${item.date}|${item.time}`;
  if (!byDateTime.has(dateTimeKey)) {
    byDateTime.set(
      dateTimeKey,
      []
    );
  }
  byDateTime
    .get(dateTimeKey)
    .push(item);
  if (!byDate.has(item.date)) {
    byDate.set(
      item.date,
      []
    );
  }
  byDate
    .get(item.date)
    .push(item);
}
const teamMatches =
  (item, match) =>
    sameTeam(
      item.normalizedHomeTeam ||
        normalizeTeam(item.homeTeam),
      match.normalizedHomeTeam
    ) &&
    sameTeam(
      item.normalizedAwayTeam ||
        normalizeTeam(item.awayTeam),
      match.normalizedAwayTeam
    );
const candidatesFor =
  (match) => {
    const exactTime =
      (
        byDateTime.get(
          `${match.date}|${match.time}`
        ) ?? []
      ).filter(
        (item) =>
          teamMatches(
            item,
            match
          )
      );
    if (exactTime.length) {
      return exactTime;
    }
    return (
      byDate.get(
        match.date
      ) ?? []
    ).filter(
      (item) =>
        teamMatches(
          item,
          match
        )
    );
  };
const removeItems =
  new Set();
let added = 0;
let updated = 0;
let halfTimeChanged = 0;
let fullTimeChanged = 0;
let statusChanged = 0;
/*
 * ============================================================
 * SKOR GÜNCELLEME
 * ============================================================
 */
const rows =
  await fetchRows();
for (const row of rows) {
  const incoming =
    toMatch(row);
  if (!incoming.date) {
    continue;
  }
  const candidates =
    candidatesFor(
      incoming
    );
  /*
   * Önce eski ID,
   * sonra Mackolik ID,
   * sonra takım/tarih eşleşmesi.
   */
  const current =
    candidates.find(
      (item) =>
        String(item.id)
          .startsWith("OLD-")
    ) ??
    byId.get(
      incoming.id
    ) ??
    candidates[0];
  /*
   * Maç mevcut değilse yeni kayıt.
   */
  if (!current) {
    existing.push(
      incoming
    );
    byId.set(
      incoming.id,
      incoming
    );
    added++;
    console.log(
      `YENİ MAÇ: ${incoming.homeTeam} - ${incoming.awayTeam}`
    );
    continue;
  }
  /*
   * ==========================================================
   * İY SKORU
   * ==========================================================
   *
   * Mackolik skor gönderiyorsa güncelle.
   *
   * Skor boş/null gelirse eski skor korunur.
   */
  if (
    incoming.halfTimeScore !== null &&
    incoming.halfTimeScore !==
      undefined &&
    incoming.halfTimeScore !== ""
  ) {
    if (
      current.halfTimeScore !==
      incoming.halfTimeScore
    ) {
      current.halfTimeScore =
        incoming.halfTimeScore;
      halfTimeChanged++;
      console.log(
        `İY SKOR: ${current.homeTeam} - ${current.awayTeam} → ${incoming.halfTimeScore}`
      );
    }
  }
  /*
   * ==========================================================
   * MS SKORU
   * ==========================================================
   *
   * Mackolik final skor gönderiyorsa güncelle.
   *
   * Boş/null gelirse eski skor korunur.
   */
  if (
    incoming.fullTimeScore !== null &&
    incoming.fullTimeScore !==
      undefined &&
    incoming.fullTimeScore !== ""
  ) {
    if (
      current.fullTimeScore !==
      incoming.fullTimeScore
    ) {
      current.fullTimeScore =
        incoming.fullTimeScore;
      fullTimeChanged++;
      console.log(
        `MS SKOR: ${current.homeTeam} - ${current.awayTeam} → ${incoming.fullTimeScore}`
      );
    }
  }
  /*
   * ==========================================================
   * MAÇ DURUMU
   * ==========================================================
   */
  if (
    incoming.status &&
    incoming.status !==
      current.status
  ) {
    current.status =
      incoming.status;
    statusChanged++;
    console.log(
      `DURUM: ${current.homeTeam} - ${current.awayTeam} → ${incoming.status}`
    );
  }
  /*
   * Maç bittiyse sonuçları güncelle.
   */
  if (
    incoming.status ===
    "finished"
  ) {
    current.results =
      incoming.results;
  }
  /*
   * Lig boşsa tamamla.
   */
  if (
    !current.league &&
    incoming.league
  ) {
    current.league =
      incoming.league;
  }
  /*
   * Gerçek bir değişiklik olduysa
   * güncelleme zamanını yenile.
   */
  if (
    current.halfTimeScore ===
      incoming.halfTimeScore ||
    current.fullTimeScore ===
      incoming.fullTimeScore ||
    current.status ===
      incoming.status
  ) {
    current.lastUpdated =
      incoming.lastUpdated;
  }
  /*
   * Aynı maça ait mükerrer kayıtları kaldır.
   */
  for (
    const duplicate
    of candidates
  ) {
    if (
      duplicate !== current
    ) {
      removeItems.add(
        duplicate
      );
    }
  }
  updated++;
}
/*
 * ============================================================
 * MÜKERRER KAYITLARI TEMİZLE
 * ============================================================
 */
const merged =
  existing.filter(
    (item) =>
      !removeItems.has(item)
  );
merged.sort((a, b) =>
  `${a.date}${a.time}${a.homeTeam}`
    .localeCompare(
      `${b.date}${b.time}${b.homeTeam}`
    )
);
/*
 * ============================================================
 * AYLIK HISTORY'E YAZ
 * ============================================================
 */
await writePartitioned(
  merged
);
/*
 * ============================================================
 * LOG
 * ============================================================
 */
console.log("");
console.log(
  "======================================"
);
console.log(
  "MAÇKOLİK SKOR GÜNCELLEMESİ TAMAMLANDI"
);
console.log(
  "======================================"
);
console.log(
  `Gelen maç:       ${rows.length}`
);
console.log(
  `Yeni maç:        ${added}`
);
console.log(
  `Güncellenen:     ${updated}`
);
console.log(
  `İY skor değişen: ${halfTimeChanged}`
);
console.log(
  `MS skor değişen: ${fullTimeChanged}`
);
console.log(
  `Durum değişen:   ${statusChanged}`
);
console.log(
  `Kopya temizlenen: ${removeItems.size}`
);
console.log(
  `Toplam kayıt:    ${merged.length}`
);
console.log(
  "Açılış oranları: DEĞİŞTİRİLMEDİ"
);
console.log(
  "History: AYLIK"
);
console.log(
  "======================================"
);
