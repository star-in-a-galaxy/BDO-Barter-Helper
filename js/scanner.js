// Client-side barter-screenshot scanner (tesseract.js):
// OCRs T4→T5 / T5→T6 / T6→T7 screenshots and produces trade-table rows plus the
// T6→T7 region mapping. Runs entirely in the browser so it works on GitHub Pages.
//
// Layout is resolution-independent: screenshots are normalized to a reference
// width before OCR and all coordinates are used as fractions of the image size.
//
// Near-twin items (e.g. "Marine Knights' Helm" vs "Spear") are flagged with a
// warning so the user can resolve them manually (see app.js resolution modal).
import { loadBarterGoods, loadBarterTierPorts } from './catalog.js';

const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

// Reference layout (the verify/ screenshots). Column splits + row spacing are
// expressed as fractions of the image width/height so any screenshot size works.
const REF_W = 953;
const REF_H = 537;
const COL_LEFT = 260 / REF_W;   // x0 < this = left (anchor) column
const COL_MID = 640 / REF_W;    // left <= x0 < this = middle (T4/T5/T6)
                                // x0 >= this = right (T5/T6/T7)
const TARGET_W = 2860;          // OCR width (3x reference: 2x misreads T5 names/items)
const ANCHOR_PAD = 14 / REF_H;  // row band starts slightly above the anchor box
const LAST_ROW_PAD = 70 / REF_H; // last row's band height (no next anchor)
const ANCHOR_MERGE = 6 / REF_H; // merge left-column boxes on the same line

// --- string helpers ---------------------------------------------------------

function norm(s) {
  return String(s || '').toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '') // drop accents (Grándiha -> grandiha)
    .replace(/[^a-z0-9]/g, '');
}

function namePart(s) {
  // [Level], [Level 5], level5, etc. - tolerate a missing tier number (tesseract
  // sometimes drops it).
  return norm(s).replace(/\[?\s*level\s*\d*\s*\]?\s*/gi, '').replace(/^\d+/, '');
}

// Case/diacritic-insensitive key for comparing location names.
function nameKey(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
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
  // Dedup repeated words: the anchor merge can produce run-on fragments like
  // "Pujara Island Pujara Island ujara Islan", which would otherwise dilute the
  // similarity below the match threshold.
  return (String(s || '').toLowerCase().match(/[a-z][a-z]*/g) || [])
    .filter(w => w.length >= 3 && !STOPWORDS.has(w))
    .filter((w, i, arr) => arr.indexOf(w) === i);
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
    // lcsRatio catches letter-level OCR noise; wordBagScore catches word-order
    // transpositions ("Island Baremi" vs "Baremi Island").
    const ratio = Math.max(lcsRatio(f, n), wordBagScore(fragment, name));
    if (ratio > bestRatio) { bestRatio = ratio; best = name; }
  }
  return bestRatio >= 0.55 ? best : null;
}

// --- catalog matching -----------------------------------------------------

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

function commonPrefixLen(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

// Same-tier items that share a long prefix with `name` but differ in the tail
// (e.g. "Marine Knights' Helm" ↔ "Marine Knights' Spear"). OCR can easily
// misread the last word, so these get flagged for manual verification.
export function findNearTwins(name, catalog) {
  // namePart strips the "[Level N]" prefix so the shared prefix reflects the
  // item name itself, not the tier label.
  const n = namePart(name);
  if (n.length < 8) return [];
  const tier = catalog.find(it => it.name === name)?.tier;
  if (!tier) return [];
  const twins = [];
  for (const it of catalog) {
    if (it.tier !== tier || it.name === name) continue;
    const m = namePart(it.name);
    if (!m) continue;
    const shorter = Math.min(n.length, m.length);
    const p = commonPrefixLen(n, m);
    if (p >= shorter * 0.6 && p < shorter) {
      twins.push(it.name);
    }
  }
  return twins;
}

// --- layout parsing ---------------------------------------------------------

function colWords(words, side) {
  if (side === 'left') return words.filter(w => w.x0 < COL_LEFT);
  if (side === 'mid') return words.filter(w => w.x0 >= COL_LEFT && w.x0 < COL_MID);
  return words.filter(w => w.x0 >= COL_MID);
}

function colText(words, side) {
  return colWords(words, side).sort((a, b) => a.x0 - b.x0).map(w => w.text).join(' ');
}

// Left-column row markers (island / trader / port names). Any name-like
// left-column text becomes a row, so a garbled name still yields a row (its
// items are what matter). Tesseract emits noisy fragments (icons -> "A"/"6",
// header/info lines), so boxes are filtered to real names: enough letters and
// no info keywords.
function anchorWords(boxes) {
  const info = /(exchang|xchang|parley|parles|barters?|total|grades?|lv\.|left|right|required)/i;
  const nameLike = (t) => {
    const letters = (t.match(/[a-z]/gi) || []).length;
    return letters >= 4 && !info.test(t);
  };
  const anchors = boxes
    .filter(b => b.x0 < COL_LEFT && nameLike(b.text))
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const merged = [];
  for (const b of anchors) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(b.y0 - last.y0) < ANCHOR_MERGE) last.text += ' ' + b.text;
    else merged.push({ ...b });
  }
  return merged;
}

// Rows are defined by the left-column anchor boxes - one row per anchor, no
// assumptions about how many rows a screenshot shows. Each row's items come
// from the vertical band between consecutive anchors, so item text may sit on
// any line within the row. The anchor is canonicalized against known names on
// a best-effort basis; trades are matched by item, so an unreadable name never
// drops the row.
function parseRows(boxes, catalog, opts) {
  const anchors = anchorWords(boxes);
  const rows = [];
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const lo = a.y0 - ANCHOR_PAD;
    const hi = i + 1 < anchors.length ? anchors[i + 1].y0 - ANCHOR_PAD : a.y0 + LAST_ROW_PAD;
    const inBand = (b) => {
      const cy = (b.y0 + b.y1) / 2;
      return cy >= lo && cy < hi;
    };
    const noNoise = (b) => !/(exchanges|parley|barters|required)/i.test(b.text);
    const midText = boxes
      .filter(b => b.x0 >= COL_LEFT && b.x0 < COL_MID && inBand(b) && noNoise(b))
      .sort((p, q) => p.x0 - q.x0)
      .map(b => b.text)
      .join(' ');
    const rightText = boxes
      .filter(b => b.x0 >= COL_MID && inBand(b) && noNoise(b))
      .sort((p, q) => p.x0 - q.x0)
      .map(b => b.text)
      .join(' ');
    const anchor = matchName(a.text, opts.anchors) || a.text.trim();
    const midItem = matchItem(midText, catalog, opts.midTier);
    const rightItem = matchItem(rightText, catalog, opts.rightTier);

    const row = {
      [opts.anchorKey]: anchor,
      [opts.midKey]: midItem,
      [opts.rightKey]: rightItem
    };
    // Only T4/T5 items can be genuinely ambiguous (the island doesn't pin down
    // the exact item). T6/T7 are port-specific, so a near-twin there is never a
    // real choice - no warning is generated for them.
    const warnable = (tier) => tier === 'level_4' || tier === 'level_5';
    const warnings = [];
    if (midItem && warnable(opts.midTier)) {
      const twins = findNearTwins(midItem, catalog);
      if (twins.length) warnings.push({ field: opts.midKey, item: midItem, read: midText, alternatives: twins });
    }
    if (rightItem && warnable(opts.rightTier)) {
      const twins = findNearTwins(rightItem, catalog);
      if (twins.length) warnings.push({ field: opts.rightKey, item: rightItem, read: rightText, alternatives: twins });
    }
    if (warnings.length) row.warnings = warnings;
    rows.push(row);
  }
  return rows;
}

// Ports that barter *to* the given tier (their `target_tier`). Because each
// port has exactly one source/target tier pair (static game data), this
// restricts anchor candidates to the ports that can actually appear in a given
// screenshot: a T4→T5 shot only shows ports producing T5, a T5→T6 shot only T6,
// etc. A wrong-but-real port from another tier (e.g. "Boa Island", target
// level_2) can never win a name match in the wrong screenshot.
function portsByTarget(ports, tier) {
  return Object.values(ports)
    .filter(p => p.target_tier === tier)
    .map(p => p.name);
}

export function parseT4t5(boxes, catalog, ports) {
  return parseRows(boxes, catalog, {
    anchors: portsByTarget(ports, 'level_5'),
    anchorKey: 'island', midTier: 'level_4', rightTier: 'level_5', midKey: 't4', rightKey: 't5'
  });
}

export function parseT5t6(boxes, catalog, ports) {
  return parseRows(boxes, catalog, {
    anchors: portsByTarget(ports, 'level_6'),
    anchorKey: 'trader', midTier: 'level_5', rightTier: 'level_6', midKey: 't5', rightKey: 't6'
  });
}

export function parseT6t7(boxes, catalog, ports) {
  return parseRows(boxes, catalog, {
    anchors: portsByTarget(ports, 'level_7'),
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
  ['olviacoast', 'A', 'Olvia Coast'],
  ['epheriasentrypost', 'A', 'Epheria Sentry Post'],
  ['iliyaisland', 'B', 'Iliya Island'],
  ['lemaisland', 'B', 'Lema Island'],
  ['sanctuarycoastaloutpost', 'C', 'Sanctuary Coastal Outpost'],
  ['sausangarrisonwharf', 'C', 'Sausan Garrison Wharf']
];

function portRegion(port) {
  const n = norm(port);
  for (const [key, region] of PORT_TO_REGION) {
    if (key.startsWith(n) || n.startsWith(key)) return region;
  }
  return null;
}

function portItemsFor(tierPorts, tier, portName) {
  const group = tierPorts && tierPorts[tier];
  if (!group || !portName) return null;
  const entry = Object.entries(group).find(([p]) => nameKey(p) === nameKey(portName));
  return entry ? entry[1] : null;
}

// T6/T7 items are port-specific, so if the OCR read the wrong one the true item
// is the candidate that the port actually offers. Returns the resolved item or
// null if the port list can't disambiguate.
function resolveTierItem(item, alternatives, tierPorts, tier, portName) {
  const list = portItemsFor(tierPorts, tier, portName);
  if (!list || !list.length) return null;
  const inList = (name) => list.some(p => namePart(p) === namePart(name));
  if (inList(item)) return item;
  return (alternatives || []).find(a => inList(a)) || null;
}

export function buildTrades(t4t5Rows, t5t6Rows, t6t7Rows, tierPorts) {
  const byT5 = {};
  for (const r of t5t6Rows) {
    if (r.t5) (byT5[r.t5] = byT5[r.t5] || []).push(r);
  }
  const t6toT7 = {};
  const t6toRow = {};
  if (t6t7Rows) {
    for (const r of t6t7Rows) {
      if (r.t6 && r.t7) {
        t6toT7[norm(r.t6)] = r.t7;
        t6toRow[norm(r.t6)] = r;
      }
    }
  }
  const trades = [];
  const seen = new Set();
  const seenRow = new Set();
  for (const r of t4t5Rows) {
    if (!(r.t4 && r.t5)) continue;
    // A T4→T5 island produces exactly one T5→T6 trade, so each island row maps
    // to at most one trader. If the same T5 was read for several traders (an
    // OCR misread, e.g. "102 Year Old Golden Herb" read as "37 Year Old Herbal
    // Wine"), we keep only one trade but flag the ambiguity so the user can pick
    // the correct chain instead of silently guessing.
    const rowKey = norm(r.island) + '|' + norm(r.t4) + '|' + norm(r.t5);
    if (seenRow.has(rowKey)) continue;
    seenRow.add(rowKey);
    const candidates = byT5[r.t5] || [];
    for (const m of candidates) {
      const key = norm(r.t5) + '|' + norm(m.trader);
      if (seen.has(key)) continue;
      seen.add(key);
      const chain = CHAIN_MAP[norm(m.trader)];
      if (!chain) continue;
      const t7Row = m.t6 ? t6toRow[norm(m.t6)] : null;
      const trade = {
        region: chain[0],
        chain: chain[1],
        t5: r.t5,
        t4: r.t4,
        island: r.island,
        t6: m.t6,
        t7: m.t6 ? t6toT7[norm(m.t6)] : null,
        // The specific T7 port that actually offers this T6→T7 trade (from the
        // T6→T7 screenshot) - the optimizer must barter/sell there, not at an
        // arbitrary port of the mapped region.
        t7Port: t7Row ? t7Row.port : null
      };

      const warnings = [
        ...(r.warnings || []).filter(w => w.field === 't4' || w.field === 't5'),
        ...(m.warnings || []).filter(w => w.field === 't6'),
        ...(t7Row && t7Row.warnings ? t7Row.warnings.filter(w => w.field === 't7') : [])
      ];

      // T6/T7 are port-specific and never ambiguous - resolve them from the
      // port's known items instead of asking the user (only T4/T5 go to modal).
      const resolved = new Set();
      for (const w of warnings) {
        if (w.field === 't6') {
          const fixed = resolveTierItem(trade.t6, w.alternatives, tierPorts, 't6', chain[1]);
          if (fixed) { trade.t6 = fixed; resolved.add(w); }
        } else if (w.field === 't7') {
          const fixed = resolveTierItem(trade.t7, w.alternatives, tierPorts, 't7', t7Row && t7Row.port);
          if (fixed) { trade.t7 = fixed; resolved.add(w); }
        }
      }
      const remaining = warnings.filter(w => !resolved.has(w));
      if (remaining.length) trade.warnings = remaining;
      trades.push(trade);

      // The same T5 was read at more than one trader - one of those reads is a
      // misread. Surface the other chains so the user can pick the right one
      // instead of us silently keeping the first.
      if (candidates.length > 1) {
        trade.alternativeTraders = candidates
          .filter(c => c !== m && norm(c.trader) !== norm(m.trader))
          .map(c => {
            const ch = CHAIN_MAP[norm(c.trader)];
            if (!ch) return null;
            const altT7Row = c.t6 ? t6toRow[norm(c.t6)] : null;
            return {
              region: ch[0],
              chain: ch[1],
              t6: c.t6 || null,
              t7: (c.t6 && t6toT7[norm(c.t6)]) || null,
              t7Port: altT7Row ? altT7Row.port : null
            };
          })
          .filter(Boolean);
        if (trade.alternativeTraders.length) {
          trade.warnings = [...(trade.warnings || []), {
            kind: 'trader',
            field: 't5',
            item: trade.t5,
            alternatives: trade.alternativeTraders.map(o => `${o.region} - ${o.chain}`)
          }];
        }
      }
      break; // one T4→T5 island row → one trade
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
      // cacheMethod: 'none' - don't write the OCR engine/language data to the
      // browser's persistent storage (IndexedDB). The worker is reused within a
      // session, and the browser's HTTP cache may still serve the files on later
      // visits without re-downloading.
      const w = await T.createWorker('eng', 1, { cacheMethod: 'none' });
      return w;
    })();
  }
  return workerPromise;
}

// Convert a tesseract TSV (word rows) into normalized fractional boxes. Page
// width/height are read from the TSV's page row (level 1) so the caller doesn't
// need to know the image dimensions.
function tsvToBoxes(tsv) {
  const boxes = [];
  if (!tsv) return boxes;
  const lines = tsv.trim().split('\n');
  if (!lines.length) return boxes;
  const page = lines[0].split('\t');
  const width = parseFloat(page[8]) || 1;
  const height = parseFloat(page[9]) || 1;
  for (const row of lines) {
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

// Decode the screenshot (PNG via UPNG.js) in pure JS, upscale to the OCR width
// and grayscale - no canvas readback, which some browsers block ("no user input
// detected"). Re-encodes to a PNG Blob (the input format tesseract.js handles
// reliably), or returns null if decoding failed.
async function decodePreprocess(dataUrl) {
  if (typeof UPNG === 'undefined') return null;
  const res = await fetch(dataUrl);
  const buf = new Uint8Array(await res.arrayBuffer());
  const png = UPNG.decode(buf);
  if (!png || !png.width || !png.height) return null;
  const src = new Uint8Array(UPNG.toRGBA8(png)[0]);
  if (!src) return null;
  const scale = Math.max(1, TARGET_W / png.width);
  const outW = TARGET_W;
  const outH = Math.max(1, Math.round(png.height * scale));
  const out = new Uint8Array(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    const sy = Math.min(png.height - 1, Math.floor(y / scale));
    const srow = sy * png.width;
    const orow = y * outW;
    for (let x = 0; x < outW; x++) {
      const sx = Math.min(png.width - 1, Math.floor(x / scale));
      const si = (srow + sx) * 4;
      const g = 0.299 * src[si] + 0.587 * src[si + 1] + 0.114 * src[si + 2];
      const di = (orow + x) * 4;
      out[di] = out[di + 1] = out[di + 2] = g;
      out[di + 3] = 255;
    }
  }
  return new Blob([UPNG.encode([out], outW, outH, 0, null, true)], { type: 'image/png' });
}

export async function ocrBoxes(dataUrl) {
  const worker = await getWorker();
  let boxes = [];
  try {
    const pre = await decodePreprocess(dataUrl);
    if (pre) {
      const { data } = await worker.recognize(pre, {}, { text: true, tsv: true });
      boxes = tsvToBoxes(data.tsv);
    }
  } catch (e) {
    console.warn('Preprocessed OCR failed, falling back to original image:', e);
  }
  if (!boxes.length) {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const { data } = await worker.recognize(blob, {}, { text: true, tsv: true });
      boxes = tsvToBoxes(data.tsv);
    } catch (e) {
      console.warn('Original-image OCR failed for this file:', e);
    }
  }
  return boxes;
}

// The island-name column is small text that the full-image OCR often garbles
// (e.g. "Baremi Island" -> "Boa Island", a real but wrong island). Re-OCR just
// the left ~30% of the image at the same upscale for a reliable name read.
// Returns name boxes in full-image fractional coordinates, or [] on failure.
async function ocrIslandNames(dataUrl) {
  if (typeof UPNG === 'undefined') return [];
  const worker = await getWorker();
  const res = await fetch(dataUrl);
  const buf = new Uint8Array(await res.arrayBuffer());
  const png = UPNG.decode(buf);
  const src = new Uint8Array(UPNG.toRGBA8(png)[0]);
  if (!src) return [];
  const w = png.width, h = png.height;
  const cropW = Math.round(w * 0.30);
  const scale = Math.max(1, TARGET_W / w);
  const outW = Math.max(1, Math.round(cropW * scale));
  const outH = Math.max(1, Math.round(h * scale));
  const out = new Uint8Array(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    const sy = Math.min(h - 1, Math.floor(y / scale));
    for (let x = 0; x < outW; x++) {
      const sx = Math.min(cropW - 1, Math.floor(x / scale));
      const si = (sy * w + sx) * 4;
      const g = 0.299 * src[si] + 0.587 * src[si + 1] + 0.114 * src[si + 2];
      const di = (y * outW + x) * 4;
      out[di] = out[di + 1] = out[di + 2] = g;
      out[di + 3] = 255;
    }
  }
  const blob = new Blob([UPNG.encode([out], outW, outH, 0, null, true)], { type: 'image/png' });
  const { data } = await worker.recognize(blob, {}, { text: true, tsv: true });
  const wFrac = cropW / w;
  return tsvToBoxes(data.tsv).map(b => ({
    x0: b.x0 * wFrac,
    x1: b.x1 * wFrac,
    y0: b.y0,
    y1: b.y1,
    text: b.text,
    score: b.score
  }));
}

export async function scanImages(images) {
  const goods = await loadBarterGoods();
  const ports = await (await import('./catalog.js')).loadBarterPorts();
  const tierPorts = await loadBarterTierPorts();
  const t4t5 = [];
  let t5t6 = [];
  let t6t7 = [];
  for (const img of images || []) {
    const mime = img.mime || 'image/png';
    const dataUrl = img.data.startsWith('data:') ? img.data : `data:${mime};base64,${img.data}`;
    let boxes = await ocrBoxes(dataUrl);
    // The name column (island / trader / port) is small text the full-image OCR
    // often garbles, dropping the whole row. Re-OCR the left ~30% and override
    // the full-image names only when the crop read resolves to a real port for
    // this screenshot's target tier - a garbage read never displaces a good one.
    const targetTier = { t4t5: 'level_5', t5t6: 'level_6', t6t7: 'level_7' }[img.type];
    if (targetTier) {
      try {
        const names = await ocrIslandNames(dataUrl);
        if (names.length) {
          const anchors = portsByTarget(ports, targetTier);
          const merged = [];
          for (const n of names.slice().sort((a, b) => a.y0 - b.y0)) {
            const last = merged[merged.length - 1];
            if (last && Math.abs(n.y0 - last.y0) < ANCHOR_MERGE) last.text += ' ' + n.text;
            else merged.push({ ...n });
          }
          for (const n of merged) {
            const canonical = matchName(n.text, anchors);
            if (!canonical) continue;
            const cy = (n.y0 + n.y1) / 2;
            const target = boxes.find(b => b.x0 < COL_LEFT && Math.abs((b.y0 + b.y1) / 2 - cy) < ANCHOR_MERGE * 3);
            if (target) target.text = canonical;
            else boxes.push({ ...n, text: canonical });
          }
        }
      } catch (e) {
        console.warn('Name-column OCR failed, using full-image names:', e);
      }
    }
    if (img.type === 't4t5') t4t5.push(...parseT4t5(boxes, goods, ports));
    else if (img.type === 't5t6') t5t6 = parseT5t6(boxes, goods, ports);
    else if (img.type === 't6t7') t6t7 = parseT6t7(boxes, goods, ports);
  }
  const mapping = t6t7.length ? scanMapping(t5t6, t6t7) : {};
  return { trades: buildTrades(t4t5, t5t6, t6t7, tierPorts), mapping };
}
