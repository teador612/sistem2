import fs from "node:fs/promises";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = process.env.MATCHES_PATH ? path.resolve(process.env.MATCHES_PATH) : path.join(root, "data", "matches.json");
const sourceUrl = "https://arsiv.mackolik.com/AjaxHandlers/ProgramDataHandler.ashx";
const finishedStatuses = new Set([4, 5, 6, 7, 8, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
const specialStatuses = new Set([9, 11, 21, 22, 23]);

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const normalizeTeam = (value) => clean(value).replaceAll("�", "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "");
const number = (value) => {
  if (value == null || value === "" || value === "-" || value === "0" || value === "0,00") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};
const scoreValue = (value) => /^\d+$/.test(clean(value)) ? clean(value) : null;
const scoreText = (home, away) => scoreValue(home) != null && scoreValue(away) != null ? `${scoreValue(home)}-${scoreValue(away)}` : null;
const sameTeam = (left, right) => {
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length < 5 || right.length < 5) return false;
  return left.startsWith(right) || right.startsWith(left);
};
const isoDate = (value) => {
  const [day, month, year] = clean(value).split(".");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};

function resultValues(row) {
  const home = scoreValue(row[8]);
  const away = scoreValue(row[9]);
  const htHome = scoreValue(row[11]);
  const htAway = scoreValue(row[12]);
  const msResult = home == null || away == null ? "" : Number(home) > Number(away) ? "1" : Number(home) < Number(away) ? "2" : "0";
  const kgResult = home == null || away == null ? "" : Number(home) > 0 && Number(away) > 0 ? "VAR" : "YOK";
  const iy15Result = htHome == null || htAway == null ? "" : Number(htHome) + Number(htAway) >= 2 ? "ÜST" : "ALT";
  const over25Result = home == null || away == null ? "" : Number(home) + Number(away) >= 3 ? "ÜST" : "ALT";
  return { msResult, kgResult, iy15Result, over25Result };
}

function parseSource(raw) {
  if (!/^\s*\{m:/.test(raw)) throw new Error("Maçkolik cevabı beklenen {m:[...]} formatında değil.");
  // Endpoint bir JavaScript veri literal'i döndürüyor; yalnızca boş sandbox'ta veri olarak parse edilir.
  return vm.runInNewContext(`(${raw})`, Object.create(null), { timeout: 5000 });
}

async function fetchRows() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const today = `${day}.${month}.${now.getFullYear()}`;
  const params = new URLSearchParams({ type: "6", sortValue: "DATE", day: today, sort: "-1", sortDir: "-1", groupId: "-1", np: "0", sport: "1" });
  const response = await fetch(`${sourceUrl}?${params}`, { headers: { "User-Agent": "Mozilla/5.0 oran-analiz-updater" } });
  if (!response.ok) throw new Error(`Maçkolik HTTP ${response.status}`);
  const parsed = parseSource(await response.text());
  return (parsed.m ?? []).flatMap((dateGroup) => dateGroup.m ?? []);
}

function toMatch(row) {
  const status = Number(row[5]);
  const home = clean(row[1]);
  const away = clean(row[3]);
  const finished = finishedStatuses.has(status) && !specialStatuses.has(status);
  return {
    id: `mackolik-${row[0]}`,
    date: isoDate(row[7]), time: clean(row[6]), league: clean(row[26]),
    homeTeam: home, awayTeam: away,
    normalizedHomeTeam: normalizeTeam(home), normalizedAwayTeam: normalizeTeam(away),
    openingOdds: {
      ms1: number(row[16]), ms0: number(row[17]), ms2: number(row[18]),
      kgYes: number(row[39]), kgNo: number(row[40]),
      iy15Under: number(row[42]), iy15Over: number(row[43]),
      under25: number(row[22]), over25: number(row[23]),
    },
    halfTimeScore: finished ? scoreText(row[11], row[12]) : null,
    fullTimeScore: finished ? scoreText(row[8], row[9]) : null,
    results: finished ? resultValues(row) : { msResult: "", kgResult: "", iy15Result: "", over25Result: "" },
    status: finished ? "finished" : "not_started",
    lastUpdated: new Date().toISOString(),
  };
}

const existing = JSON.parse(await fs.readFile(dataPath, "utf8"));
if (!Array.isArray(existing)) throw new Error("data/matches.json bir dizi olmalı.");
const byId = new Map(existing.map((item) => [String(item.id), item]));
const byDateTime = new Map();
const byDate = new Map();
for (const item of existing) {
  const key = `${item.date}|${item.time}`;
  if (!byDateTime.has(key)) byDateTime.set(key, []);
  byDateTime.get(key).push(item);
  if (!byDate.has(item.date)) byDate.set(item.date, []);
  byDate.get(item.date).push(item);
}
const teamMatches = (item, match) => sameTeam(item.normalizedHomeTeam, match.normalizedHomeTeam) && sameTeam(item.normalizedAwayTeam, match.normalizedAwayTeam);
const candidatesFor = (match) => {
  const exactTime = (byDateTime.get(`${match.date}|${match.time}`) ?? []).filter((item) => teamMatches(item, match));
  if (exactTime.length) return exactTime;
  return (byDate.get(match.date) ?? []).filter((item) => teamMatches(item, match));
};
const removeItems = new Set();
let added = 0;
let updated = 0;

for (const row of await fetchRows()) {
  const incoming = toMatch(row);
  const candidates = candidatesFor(incoming);
  const current = candidates.find((item) => String(item.id).startsWith("OLD-")) ?? byId.get(incoming.id) ?? candidates[0];
  if (!current) {
    existing.push(incoming);
    byId.set(incoming.id, incoming);
    const bucketKey = `${incoming.date}|${incoming.time}`;
    if (!byDateTime.has(bucketKey)) byDateTime.set(bucketKey, []);
    byDateTime.get(bucketKey).push(incoming);
    if (!byDate.has(incoming.date)) byDate.set(incoming.date, []);
    byDate.get(incoming.date).push(incoming);
    added++;
    continue;
  }
  // Açılış oranlarına dokunulmaz. Yalnızca skor, sonuç, durum ve güncelleme zamanı yenilenir.
  current.halfTimeScore = incoming.halfTimeScore;
  current.fullTimeScore = incoming.fullTimeScore;
  current.results = incoming.results;
  current.status = incoming.status;
  current.lastUpdated = incoming.lastUpdated;
  if (!current.league) current.league = incoming.league;
  for (const duplicate of candidates) {
    if (duplicate !== current) removeItems.add(duplicate);
  }
  updated++;
}

const merged = existing.filter((item) => !removeItems.has(item));
merged.sort((a, b) => `${a.date}${a.time}${a.homeTeam}`.localeCompare(`${b.date}${b.time}${b.homeTeam}`));
await fs.writeFile(dataPath, JSON.stringify(merged), "utf8");
console.log(`Maçkolik satırı: ${added} yeni, ${updated} güncellenen kayıt, ${removeItems.size} kopya birleştirildi`);
console.log(`Toplam kayıt: ${merged.length}`);
