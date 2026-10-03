const MIN_SAMPLES = 5;
let data = { matches: [] };
const $ = selector => document.querySelector(selector);

function iso(match) {
  const parts = String(match.date || '').split('.');
  return parts.length === 3 ? parts.reverse().join('-') : String(match.date || '').slice(0, 10);
}

function numeric(value) {
  const number = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function marketValue(match, field) {
  return numeric((match.openingOdds || {})[field]);
}

function result(match) {
  const score = match.score || {};
  if (score.home === '' || score.away === '' || score.home == null || score.away == null) return null;
  return Number(score.home) > Number(score.away) ? '1' : Number(score.home) < Number(score.away) ? '2' : 'X';
}

function analyze(match) {
  const markets = [['1', 'ms1'], ['X', 'msX'], ['2', 'ms2']];
  const counts = { 1: 0, X: 0, 2: 0 };
  let samples = 0;
  for (const [, field] of markets) {
    const opening = marketValue(match, field);
    if (opening === null) continue;
    for (const previous of data.matches) {
      if (previous === match || marketValue(previous, field) !== opening) continue;
      const finishedResult = result(previous);
      if (!finishedResult) continue;
      counts[finishedResult]++;
      samples++;
    }
  }
  if (!samples) return { samples: 0 };
  const pick = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const odds = match.openingOdds || {};
  return { samples, pick, confidence: counts[pick] / samples * 100, odds: `${odds.ms1 ?? '—'} / ${odds.msX ?? '—'} / ${odds.ms2 ?? '—'}` };
}

function draw() {
  const selectedDate = $('#date').value;
  const rows = data.matches.filter(match => iso(match) === selectedDate);
  let decisions = 0, pending = 0, confidenceTotal = 0;
  $('#list').innerHTML = rows.map(match => {
    const analysis = analyze(match), ready = analysis?.pick && analysis.samples >= MIN_SAMPLES;
    let state = 'pending', label = 'Bekliyor';
    if (ready) {
      decisions++;
      confidenceTotal += analysis.confidence;
      const actual = result(match);
      state = actual ? (actual === analysis.pick ? 'won' : 'lost') : 'pending';
      label = actual ? (state === 'won' ? '✓ Tuttu' : '× Tutmadı') : '… Bekliyor';
    } else pending++;
    const odds = match.openingOdds || {};
    return `<article class="match"><div class="teams">${match.home || '?'}<small>vs</small>${match.away || '?'}</div><div class="odds"><span class="odd ${analysis?.pick === '1' ? 'selected' : ''}">1 ${odds.ms1 ?? '—'}</span><span class="odd ${analysis?.pick === 'X' ? 'selected' : ''}">X ${odds.msX ?? '—'}</span><span class="odd ${analysis?.pick === '2' ? 'selected' : ''}">2 ${odds.ms2 ?? '—'}</span></div><div>${ready ? `<span class="pick">MS ${analysis.pick} · %${Math.round(analysis.confidence)}</span><br><small>${analysis.samples} geçmiş eşleşme · ${analysis.odds}</small>` : '<span class="pending">Yeterli geçmiş eşleşmesi yok</span>'}</div><div class="status ${state}">${label}</div></article>`;
  }).join('') || '<div class="panel">Bu tarihte maç yok.</div>';
  $('#count').textContent = rows.length;
  $('#decisions').textContent = decisions;
  $('#pending').textContent = pending;
  $('#confidence').textContent = decisions ? `%${Math.round(confidenceTotal / decisions)}` : '—';
}

function init() {
  const dates = [...new Set(data.matches.map(iso))].sort();
  $('#date').innerHTML = dates.map(date => `<option value="${date}">${date}</option>`).join('');
  const today = new Date().toISOString().slice(0, 10);
  $('#date').value = dates.find(date => date >= today) || dates.at(-1) || '';
  draw();
}

async function load() {
  try {
    const response = await fetch('../data/matches.json?' + Date.now());
    if (!response.ok) throw Error(response.status);
    data = await response.json();
    if (Array.isArray(data)) data = { matches: data };
    init();
  } catch (error) {
    $('#list').innerHTML = '<div class="panel">../data/matches.json yüklenemedi. Dosya yolunu ve GitHub Pages yayınını kontrol et.</div>';
  }
}

$('#date').onchange = draw;
$('#reload').onclick = load;
load();
