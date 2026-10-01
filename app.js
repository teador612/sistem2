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

const $ = (id) => document.getElementById(id);
const dateKey = (value) => value.slice(0, 10);
const dateObject = (value) => new Date(`${value}T00:00:00`);
const daysBetween = (a, b) => Math.round((dateObject(a) - dateObject(b)) / 86400000);
const pct = (value) => value == null ? "—" : `%${Math.round(value)}`;
const lastItem = (items) => items[items.length - 1];

function getHistory(match, market) {
  const start = new Date(dateObject(match.date));
  start.setDate(start.getDate() - WINDOW_DAYS);
  const candidates = matches.filter((item) => {
    const itemDate = dateObject(item.date);
    return itemDate >= start && itemDate < dateObject(match.date) && item.openingOdds?.[market.odds] != null && item.results?.[market.result];
  });
  const sameOdds = candidates.filter((item) => Number(item.openingOdds[market.odds]) === Number(match.openingOdds?.[market.odds]));
  const successful = sameOdds.filter((item) => item.results[market.result] === market.expected).length;
  return { count: sameOdds.length, successful, rate: sameOdds.length ? successful / sameOdds.length * 100 : null };
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
