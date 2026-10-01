const THRESHOLD = 70;
const WINDOW_DAYS = 60;

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
const dateKey = (value) => value.slice(0, 10);
const dateObject = (value) => new Date(`${value}T00:00:00`);
const daysBetween = (a, b) => Math.round((dateObject(a) - dateObject(b)) / 86400000);
const pct = (value) => value == null ? "—" : `%${Math.round(value)}`;
const lastItem = (items) => items[items.length - 1];

function lowerBound(items, value) {
  let left = 0;
  let right = items.length;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (items[middle].date < value) left = middle + 1;
    else right = middle;
  }
  return left;
}

function buildHistoryIndexes() {
  historyIndexes = new Map();
  MARKETS.forEach((market) => {
    const marketIndex = new Map();
    matches.forEach((match) => {
      const odds = match.openingOdds?.[market.odds];
      const result = match.results?.[market.result];
      if (odds == null || result == null || result === "") return;
      const key = String(Number(odds));
      if (!marketIndex.has(key)) marketIndex.set(key, []);
      marketIndex.get(key).push({ date: match.date, success: result === market.expected ? 1 : 0 });
    });
    marketIndex.forEach((items) => {
      items.sort((a, b) => a.date.localeCompare(b.date));
      let total = 0;
      items.forEach((item) => {
        total += item.success;
        item.total = total;
      });
    });
    historyIndexes.set(market.key, marketIndex);
  });
}

function getHistory(match, market) {
  const odds = match.openingOdds?.[market.odds];
  if (odds == null) return { count: 0, successful: 0, rate: null };
  const items = historyIndexes.get(market.key)?.get(String(Number(odds))) || [];
  const start = new Date(dateObject(match.date));
  start.setDate(start.getDate() - WINDOW_DAYS);
  const startDate = start.toISOString().slice(0, 10);
  const from = lowerBound(items, startDate);
  const to = lowerBound(items, match.date);
  const count = to - from;
  const before = from ? items[from - 1].total : 0;
  const successful = (to ? items[to - 1].total : 0) - before;
  return { count, successful, rate: count ? successful / count * 100 : null };
}

function analyze(match) {
  return MARKETS.map((market) => ({ market, ...getHistory(match, market) })).filter((item) => item.count > 0);
}

function recommendationFor(match) {
  return analyze(match).filter((item) => item.rate >= THRESHOLD).sort((a, b) => b.rate - a.rate || b.count - a.count);
}

function outcome(match, recommendations) {
  if (match.status !== "finished" || !recommendations.length) return "pending";
  const won = recommendations.every(({ market }) => match.results?.[market.result] === market.expected);
  return won ? "won" : "lost";
}

function renderStats(selected, dayMatches) {
  const settled = dayMatches.flatMap((match) => {
    const recs = recommendationFor(match);
    return recs.length && match.status === "finished" ? [{ won: outcome(match, recs) === "won" }] : [];
  });
  const overall = matches.flatMap((match) => {
    const recs = recommendationFor(match);
    return recs.length && match.status === "finished" ? [{ won: outcome(match, recs) === "won" }] : [];
  });
  const ratio = (list) => list.length ? list.filter((item) => item.won).length / list.length * 100 : null;
  $("daySuccess").textContent = pct(ratio(settled));
  $("daySuccessMeta").textContent = settled.length ? `${settled.length} tamamlanan öneri` : "Tamamlanan öneri yok";
  $("overallSuccess").textContent = pct(ratio(overall));
  $("overallSuccessMeta").textContent = overall.length ? `${overall.length} tamamlanan öneri` : "Tamamlanan öneri yok";
  $("matchCount").textContent = dayMatches.length;
  const dates = matches.map((item) => item.date).sort();
  $("dataRange").textContent = dates.length ? `${dates[0]} – ${lastItem(dates)}` : "—";
}

function detailMarkup(analysis) {
  if (!analysis.length) return `<p class="muted">Son 60 günde aynı açılış oranıyla eşleşen veri bulunamadı.</p>`;
  return `<div class="detail-grid">${analysis.sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1)).map(({ market, count, rate }) => `
    <div class="detail-item ${rate >= THRESHOLD ? "good" : ""}"><span>${market.label}</span><b>${pct(rate)} <small>(${count} maç)</small></b></div>`).join("")}</div>`;
}

function renderMatches(dayMatches) {
  const container = $("matches");
  container.innerHTML = "";
  if (!dayMatches.length) {
    container.innerHTML = `<div class="empty">Bu tarihte kayıtlı maç bulunamadı.</div>`;
    return;
  }
  dayMatches.forEach((match) => {
    const fragment = $("matchTemplate").content.cloneNode(true);
    const card = fragment.querySelector(".match-card");
    const recs = recommendationFor(match);
    card.classList.add(outcome(match, recs));
    fragment.querySelector(".league").textContent = match.league || "Lig bilgisi yok";
    fragment.querySelector(".time").textContent = match.time || "—";
    fragment.querySelector(".home").textContent = match.homeTeam;
    fragment.querySelector(".away").textContent = match.awayTeam;
    fragment.querySelector(".ht-score").textContent = match.halfTimeScore || "—";
    fragment.querySelector(".ft-score").textContent = match.fullTimeScore || "—";
    fragment.querySelector(".recommendation").innerHTML = recs.length
      ? recs.map(({ market, rate, count }) => `<span class="pill">${market.label} <b>${pct(rate)}</b> <small>${count} eşleşme</small></span>`).join("")
      : `<span class="no-recommendation">%70 üzerinde eşleşen tek oran bulunamadı</span>`;
    const button = fragment.querySelector(".expand");
    const details = fragment.querySelector(".details");
    details.innerHTML = detailMarkup(analyze(match));
    button.addEventListener("click", () => {
      const open = !details.hidden;
      details.hidden = open;
      button.setAttribute("aria-expanded", String(!open));
      button.textContent = open ? "+" : "−";
    });
    container.appendChild(fragment);
  });
}

function render() {
  const selected = $("dateInput").value;
  const dayMatches = matches.filter((match) => dateKey(match.date) === selected);
  renderStats(selected, dayMatches);
  $("resultSummary").textContent = `${selected} tarihinde ${dayMatches.length} maç listelendi.`;
  renderMatches(dayMatches);
}

async function init() {
  try {
    const response = await fetch("data/matches.json");
    matches = await response.json();
    matches.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    buildHistoryIndexes();
    const dates = matches.map((item) => item.date).sort();
    $("dateInput").min = dates[0];
    $("dateInput").max = lastItem(dates);
    $("dateInput").value = lastItem(dates) || "";
    $("dateInput").addEventListener("change", render);
    render();
  } catch (error) {
    $("matches").innerHTML = `<div class="empty">Veri dosyası yüklenemedi. Önce veri dönüştürme scriptini çalıştırın.</div>`;
    console.error(error);
  }
}

init();
