// Client-side barter-screenshot scanner (tesseract.js). Port of scanner.py:
// OCRs T4→T5 / T5→T6 / T6→T7 screenshots and produces trade-table rows plus the
// T6→T7 region mapping. Runs entirely in the browser so it works on GitHub
// Pages (the Python /api/scan remains a local fallback).
//
// Layout is resolution-independent: screenshots are normalized to a reference
// width before OCR and all coordinates are used as fractions of the image size.
import { loadBarterGoods } from './catalog.js';

const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

// Reference layout (the verify/ screenshots). Column splits + row spacing are
// expressed as fractions of the image width/height so any screenshot size works.
const REF_W = 953;
const REF_H = 537;
const COL_LEFT = 260 / REF_W;   // x0 < this = left (anchor) column
const COL_MID = 640 / REF_W;    // left <= x0 < this = middle (T4/T5/T6)
                                // x0 >= this = right (T5/T6/T7)
const LINE_TOL = 9 / REF_H;     // y-center clustering tolerance (fraction of height)
const TARGET_W = 1906;          // OCR width (2x reference for better small-text reads)

// --- string helpers ---------------------------------------------------------

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function namePart(s) {
  // [Level], [Level 5], level5, etc. — tolerate a missing tier number (tesseract
  // sometimes drops it).
  return norm(s).replace(/\[?\s*level\s*\d*\s*\]?\s*/gi, '').replace(/^\d+/, '');
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[m][n];
}

function lcsLength(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

// Order-insensitive similarity (tolerates "Port Midnight Starry" vs
// "Starry Midnight Port" and OCR transpositions).
function lcsRatio(a, b) {
  if (!a.length || !b.length) return 0;
  return (2 * lcsLength(a, b)) / (a.length + b.length);
}

// UI label words that appear next to item names but are not part of them.
const STOPWORDS = new Set(['required', 'parley', 'parleys', 'exchanges', 'exchange', 'exchanged', 'left', 'total', 'barters', 'grade', 'grades', 'lv']);

function extractWords(s) {
  return (String(s || '').toLowerCase().match(/[a-z][a-z]*/g) || [])
    .filter(w => w.length >= 3 && !STOPWORDS.has(w));
}

function wordSimilar(a, b) {
  if (a === b) return 1;
  if (a.startsWith(b) || b.startsWith(a)) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

// Dice coefficient between the fragment's words and the item name's words.
// Tolerant of OCR word-order jumbling ("Orname Shadow" vs "Shadow Ornament").
function wordBagScore(fragment, itemName) {
  const fw = extractWords(fragment);
  const iw = extractWords(itemName);
  if (!fw.length || !iw.length) return 0;
  let matched = 0;
  for (const iword of iw) {
    if (fw.some(f => wordSimilar(f, iword) >= 0.66)) matched++;
  }
  return (2 * matched) / (fw.length + iw.length);
}

// Match a left-column fragment against a list of known names. Returns the best
// name or null. Names are normalized before matching.
function matchName(fragment, names) {
  const f = norm(fragment);
  if (f.length < 3) return null;
  let best = null, bestRatio = 0;
  for (const name of names) {
    const n = norm(name);
    const ratio = lcsRatio(f, n);
    if (ratio > bestRatio) { bestRatio = ratio; best = name; }
  }
  return bestRatio >= 0.55 ? best : null;
}

// --- catalog matching (mirror of scanner.py match_item) ---------------------

function matchItem(fragment, catalog, tier) {
  const target = namePart(fragment);
  if (target.length < 3) return null;
  const candidates = catalog.filter(it => it.tier === tier).map(it => it.name);
  let best = null, bestLen = 0;
  for (const name of candidates) {
    const n = namePart(name);
    if (n.startsWith(target) && target.length > bestLen) {
      bestLen = target.length;
      best = name;
    }
  }
  if (best) return best;
  let bestScore = 0, bestName = null;
  for (const name of candidates) {
    const score = wordBagScore(fragment, name);
    if (score > bestScore) { bestScore = score; bestName = name; }
  }
  return bestScore >= 0.5 ? bestName : null;
}

// --- layout parsing ---------------------------------------------------------

function clusterLines(boxes) {
  const words = boxes.filter(b => /[a-z0-9]/i.test(b.text));
  words.sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  const lines = [];
  for (const w of words) {
    const cy = (w.y0 + w.y1) / 2;
    let line = null;
    for (const l of lines) if (Math.abs(l.cy - cy) <= LINE_TOL) { line = l; break; }
    if (!line) { line = { cy, y0: w.y0, y1: w.y1, words: [] }; lines.push(line); }
    line.words.push(w);
    line.cy = (line.cy * (line.words.length - 1) + cy) / line.words.length;
    line.y0 = Math.min(line.y0, w.y0);
    line.y1 = Math.max(line.y1, w.y1);
  }
  lines.sort((a, b) => a.cy - b.cy);
  return lines;
}

function colWords(words, side) {
  if (side === 'left') return words.filter(w => w.x0 < COL_LEFT);
  if (side === 'mid') return words.filter(w => w.x0 >= COL_LEFT && w.x0 < COL_MID);
  return words.filter(w => w.x0 >= COL_MID);
}

function colText(words, side) {
  return colWords(words, side).sort((a, b) => a.x0 - b.x0).map(w => w.text).join(' ');
}

// Generic row parser. Rows are detected by matching the left-column text to a
// list of known anchors (islands / traders / ports); each row's items are
// collected from its line plus the following lines until the next anchor line.
function parseRows(boxes, catalog, opts) {
  const lines = clusterLines(boxes);
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const leftText = colText(lines[i].words, 'left');
    const anchor = matchName(leftText, opts.anchors);
    if (!anchor) continue;

    const bandWords = [...lines[i].words];
    let j = i + 1;
    while (j < lines.length) {
      const subLeft = colText(lines[j].words, 'left');
      if (matchName(subLeft, opts.anchors)) break;
      bandWords.push(...lines[j].words);
      j++;
    }
    i = j - 1; // skip consumed lines

    rows.push({
      [opts.anchorKey]: anchor,
      [opts.midKey]: matchItem(colText(bandWords, 'mid'), catalog, opts.midTier),
      [opts.rightKey]: matchItem(colText(bandWords, 'right'), catalog, opts.rightTier)
    });
  }
  return rows;
}

// T5 islands (names containing "Island") used as T4→T5 row anchors.
function islandAnchors(ports) {
  return Object.values(ports)
    .filter(p => p.name.includes('Island'))
    .map(p => p.name);
}

export function parseT4t5(boxes, catalog, ports) {
  return parseRows(boxes, catalog, {
    anchors: islandAnchors(ports),
    anchorKey: 'island', midTier: 'level_4', rightTier: 'level_5', midKey: 't4', rightKey: 't5'
  });
}

export function parseT5t6(boxes, catalog) {
  return parseRows(boxes, catalog, {
    anchors: Object.values(CHAIN_MAP).map(([, name]) => name),
    anchorKey: 'trader', midTier: 'level_5', rightTier: 'level_6', midKey: 't5', rightKey: 't6'
  });
}

export function parseT6t7(boxes, catalog) {
  return parseRows(boxes, catalog, {
    anchors: PORT_TO_REGION.map(([, , name]) => name),
    anchorKey: 'port', midTier: 'level_6', rightTier: 'level_7', midKey: 't6', rightKey: 't7'
  });
}

const CHAIN_MAP = {
  'starrymidnightport': ['South', 'Starry Midnight Port'],
  'grandiha': ['South', 'Grandiha'],
  'arehaza': ['East', 'Arehaza'],
  'hakovenisland': ['East', 'Hakoven Island'],
  'dallaepier': ['North', 'Dallae Pier'],
  'haemoisland': ['North', 'Haemo Island']
};

const PORT_TO_REGION = [
  ['sanctuarycoastaloutpost', 'A', 'Sanctuary Coastal Outpost'],
  ['sausangarrisonwharf', 'A', 'Sausan Garrison Wharf'],
  ['iliyaisland', 'B', 'Iliya Island'],
  ['lemaisland', 'B', 'Lema Island'],
  ['olviacoast', 'C', 'Olvia Coast'],
  ['epheriasentrypost', 'C', 'Epheria Sentry Post']
];

function portRegion(port) {
  const n = norm(port);
  for (const [key, region] of PORT_TO_REGION) {
    if (key.startsWith(n) || n.startsWith(key)) return region;
  }
  return null;
}

export function buildTrades(t4t5Rows, t5t6Rows, t6t7Rows) {
  const byT5 = {};
  for (const r of t5t6Rows) {
    if (r.t5) (byT5[r.t5] = byT5[r.t5] || []).push(r);
  }
  const t6toT7 = {};
  if (t6t7Rows) {
    for (const r of t6t7Rows) {
      if (r.t6 && r.t7) t6toT7[norm(r.t6)] = r.t7;
    }
  }
  const trades = [];
  const seen = new Set();
  for (const r of t4t5Rows) {
    if (!(r.t4 && r.t5)) continue;
    for (const m of (byT5[r.t5] || [])) {
      const key = norm(r.t5) + '|' + norm(m.trader);
      if (seen.has(key)) continue;
      seen.add(key);
      const chain = CHAIN_MAP[norm(m.trader)];
      if (!chain) continue;
      trades.push({
        region: chain[0],
        chain: chain[1],
        t5: r.t5,
        t4: r.t4,
        island: r.island,
        t6: m.t6,
        t7: m.t6 ? t6toT7[norm(m.t6)] : null
      });
    }
  }
  return trades;
}

export function scanMapping(t5t6Rows, t6t7Rows) {
  const t6ToRegion = {};
  for (const r of t6t7Rows) {
    const region = portRegion(r.port || '');
    if (region && r.t6) t6ToRegion[norm(r.t6)] = region;
  }
  const result = {};
  for (const r of t5t6Rows) {
    const chain = CHAIN_MAP[norm(r.trader || '')];
    if (!chain || !r.t6) continue;
    const mapping = t6ToRegion[norm(r.t6)];
    if (!mapping) continue;
    const key = chain[0].toLowerCase();
    if (result[key] === undefined) result[key] = mapping;
    else if (result[key] !== mapping) result[key] = null;
  }
  return Object.fromEntries(Object.entries(result).filter(([, v]) => v));
}

// --- OCR (tesseract.js) -----------------------------------------------------

let workerPromise = null;

async function getTesseract() {
  if (typeof Tesseract !== 'undefined') return Tesseract;
  const mod = await import(TESSERACT_CDN);
  return mod.default;
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const T = await getTesseract();
      const w = await T.createWorker('eng');
      return w;
    })();
  }
  return workerPromise;
}

// Convert a tesseract TSV (word rows) into normalized fractional boxes.
function tsvToBoxes(tsv, width, height) {
  const boxes = [];
  if (!tsv) return boxes;
  for (const row of tsv.trim().split('\n')) {
    const c = row.split('\t');
    if (c[0] !== '5') continue;
    const x0 = parseFloat(c[6]);
    const y0 = parseFloat(c[7]);
    const w = parseFloat(c[8]);
    const h = parseFloat(c[9]);
    const text = (c[11] || '').trim();
    if (!text) continue;
    boxes.push({
      x0: x0 / width,
      y0: y0 / height,
      x1: (x0 + w) / width,
      y1: (y0 + h) / height,
      text,
      score: parseFloat(c[10]) || 0
    });
  }
  return boxes;
}

// Draw the image onto a canvas at the OCR width (grayscale, contrast) and return
// the canvas + its dimensions so boxes can be normalized.
async function prepareCanvas(dataUrl) {
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = dataUrl;
  });
  const scale = TARGET_W / img.naturalWidth;
  const canvas = document.createElement('canvas');
  canvas.width = TARGET_W;
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  ctx.filter = 'grayscale(1) contrast(1.1)';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, width: canvas.width, height: canvas.height };
}

export async function ocrBoxes(dataUrl) {
  const worker = await getWorker();
  const { canvas, width, height } = await prepareCanvas(dataUrl);
  const { data } = await worker.recognize(canvas, {}, { text: true, tsv: true });
  return tsvToBoxes(data.tsv, width, height);
}

export async function scanImages(images) {
  const goods = await loadBarterGoods();
  const ports = await (await import('./catalog.js')).loadBarterPorts();
  const t4t5 = [];
  let t5t6 = [];
  let t6t7 = [];
  for (const img of images || []) {
    const mime = img.mime || 'image/png';
    const dataUrl = img.data.startsWith('data:') ? img.data : `data:${mime};base64,${img.data}`;
    const boxes = await ocrBoxes(dataUrl);
    if (img.type === 't4t5') t4t5.push(...parseT4t5(boxes, goods, ports));
    else if (img.type === 't5t6') t5t6 = parseT5t6(boxes, goods);
    else if (img.type === 't6t7') t6t7 = parseT6t7(boxes, goods);
  }
  const mapping = t6t7.length ? scanMapping(t5t6, t6t7) : {};
  return { trades: buildTrades(t4t5, t5t6, t6t7), mapping };
}
