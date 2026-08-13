// Map overlay: calibrated barter-port markers, tier toggles and the numbered
// route for the solved plan. Coordinates in assets/barterPorts.json are BDO
// game coordinates (x = east/west, y = north/south). They are projected onto
// the Leaflet CRS.Simple map with an affine transform that the user calibrates
// once by clicking three known ports (Iliya, Lema, Epheria). The solved
// transform is persisted in localStorage.
import { loadBarterPorts } from './catalog.js';
import { seaPath, seaNodeCoords } from './sea-routes.js';

const STORAGE_KEY = 'barter-map-calibration';

// Anchor ports used for calibration (game coordinates from barterPorts.json).
const CALIB_PORTS = [
  { name: 'Iliya Island', coords: [153562, -289760] },
  { name: 'Lema Island', coords: [-56891.3, -397108] },
  { name: 'Epheria Sentry Post', coords: [-369289, -26636.3] }
];

// Fallback transform used before calibration (user-calibrated via clicking
// Iliya/Lema/Epheria). lng = a*x + b*y + c, lat = d*x + e*y + f.
const FALLBACK = { a: 2.341e-7, b: -2.269e-13, c: 0.5002, d: -2.670e-9, e: 2.278e-7, f: 0.4987 };

const TIER_COLORS = {
  t5: '#4ade80',
  t6: '#fbbf24',
  t7: '#f87171',
  other: '#94a3b8'
};

const TIER_LABELS = { t5: 'T5', t6: 'T6', t7: 'T7', other: 'Other' };

// T6 traders and T7 region ports are known by name; T5 are the remaining
// "Island" ports; everything else (wharfs, shipwrecks, rafts, outposts) is Other.
const T6_NAMES = ['Haemo Island', 'Dallae Pier', 'Grándiha', 'Starry Midnight Port', 'Hakoven Island', 'Arehaza'];
const T7_NAMES = ['Sanctuary Coastal Outpost', 'Sausan Garrison Wharf', 'Iliya Island', 'Lema Island', 'Olvia Coast', 'Epheria Sentry Post'];

let transform = loadSavedTransform() || { ...FALLBACK };
let mapInstance = null;
let portGroups = null;       // { t5, t6, t7, other } layer groups
let portMarkers = [];        // { tier, marker, port }
let routeLayer = null;       // L.layerGroup for the solved route
let routeSegments = [];      // { step, line, label } per segment
let activeStep = null;       // current walkthrough step (colors the matching segment)
let routeVisible = true;
let lastDrawnStops = null;
let portsCache = null;

function loadSavedTransform() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw);
    if (['a', 'b', 'c', 'd', 'e', 'f'].every(k => typeof t[k] === 'number' && isFinite(t[k]))) return t;
  } catch (e) { /* ignore corrupt saved calibration */ }
  return null;
}

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

// Simple Levenshtein distance for fuzzy fallback name matching.
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

function tierOf(name) {
  const n = normalize(name);
  if (T6_NAMES.some(p => normalize(p) === n)) return 't6';
  if (T7_NAMES.some(p => normalize(p) === n)) return 't7';
  if (name.includes('Island')) return 't5';
  return 'other';
}

function findPort(name) {
  if (!portsCache) return null;
  const q = normalize(name);
  let exact = null;
  for (const p of portsCache) {
    if (normalize(p.name) === q) { exact = p; break; }
  }
  if (exact) return exact;
  let best = null, bestDist = Infinity;
  for (const p of portsCache) {
    const d = levenshtein(q, normalize(p.name));
    const maxLen = Math.max(q.length, normalize(p.name).length);
    if (d <= Math.max(1, Math.floor(maxLen * 0.2)) && d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

export function projectToLatLng(x, y) {
  const t = transform;
  return [t.d * x + t.e * y + t.f, t.a * x + t.b * y + t.c]; // [lat, lng]
}

async function loadPorts() {
  if (portsCache) return portsCache;
  const all = await loadBarterPorts();
  portsCache = Object.values(all).filter(p => p && Array.isArray(p.coordinates) && p.coordinates.length >= 2);
  return portsCache;
}

function rebuildPortMarkers() {
  if (!mapInstance || !portGroups) return;
  Object.values(portGroups).forEach(g => g.clearLayers());
  portMarkers.forEach(({ marker }) => mapInstance.removeLayer(marker));
  portMarkers = [];

  portsCache.forEach(p => {
    const tier = tierOf(p.name);
    const [lat, lng] = projectToLatLng(p.coordinates[0], p.coordinates[1]);
    const marker = L.circleMarker([lat, lng], {
      radius: 8,
      color: '#111',
      weight: 1.5,
      fillColor: TIER_COLORS[tier],
      fillOpacity: 0.9
    });
    marker.bindTooltip(`${p.name} (${TIER_LABELS[tier]})`, { direction: 'top', offset: [0, -4] });
    portGroups[tier].addLayer(marker);
    portMarkers.push({ tier, marker, port: p });
  });
}

function wireToggles() {
  const bind = (id, group) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      if (el.checked) mapInstance.addLayer(group);
      else mapInstance.removeLayer(group);
    });
  };
  bind('tgl-t5', portGroups.t5);
  bind('tgl-t6', portGroups.t6);
  bind('tgl-t7', portGroups.t7);
  bind('tgl-other', portGroups.other);
  const routeToggle = document.getElementById('tgl-route');
  if (routeToggle) {
    routeToggle.addEventListener('change', () => {
      routeVisible = routeToggle.checked;
      if (routeLayer) {
        if (routeVisible) mapInstance.addLayer(routeLayer);
        else mapInstance.removeLayer(routeLayer);
      }
    });
  }
}

export function drawRoute(stops) {
  if (!mapInstance) return;
  lastDrawnStops = stops;
  if (routeLayer) mapInstance.removeLayer(routeLayer);
  routeLayer = L.layerGroup();
  routeSegments = [];

  let prev = null; // { latlng, name }
  for (const stop of stops) {
    const port = findPort(stop.location);
    if (!port) {
      console.warn('Route stop not found in barterPorts.json:', stop.location);
      prev = null;
      continue;
    }
    const ll = projectToLatLng(port.coordinates[0], port.coordinates[1]);
    const marker = L.circleMarker(ll, { radius: 6, color: '#0ea5e9', weight: 2, fillColor: '#38bdf8', fillOpacity: 1 });
    marker.bindTooltip(`${stop.step}. ${stop.location}`, { direction: 'top', offset: [0, -4] });
    routeLayer.addLayer(marker);

    if (prev) {
      // Sea-aware leg: polyline through the sea-route waypoints (real ports AND
      // synthetic waypoints like "Iliya South" / "Teyamal Gap") instead of a
      // straight line (which can cut across the landmass).
      const route = seaPath(prev.name, stop.location, portsCache) || { path: [prev.name, stop.location] };
      const pts = route.path
        .map(n => {
          const c = seaNodeCoords(n, portsCache);
          return c ? projectToLatLng(c[0], c[1]) : null;
        })
        .filter(Boolean);
      const line = L.polyline(pts, { color: '#38bdf8', weight: 3, opacity: 0.85 });
      routeLayer.addLayer(line);
      const mid = polylineMidpoint(line);
      const numIcon = L.divIcon({
        className: 'route-num',
        html: `<span>${stop.step}</span>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      });
      const label = L.marker(mid, { icon: numIcon, interactive: false });
      routeLayer.addLayer(label);
      routeSegments.push({ step: stop.step, line, label });
    }
    prev = { latlng: ll, name: stop.location };
  }

  if (routeVisible) routeLayer.addTo(mapInstance);
  applyActiveStep();
}

// Point roughly halfway along a polyline (by cumulative leg length).
function polylineMidpoint(line) {
  const latlngs = line.getLatLngs();
  let total = 0;
  const cum = [0];
  for (let i = 0; i < latlngs.length - 1; i++) {
    total += latlngs[i].distanceTo(latlngs[i + 1]);
    cum.push(total);
  }
  if (total === 0) return latlngs[0] || [0, 0];
  const target = total / 2;
  for (let i = 0; i < cum.length - 1; i++) {
    if (target >= cum[i] && target <= cum[i + 1]) {
      const f = (target - cum[i]) / (cum[i + 1] - cum[i]);
      const a = latlngs[i], b = latlngs[i + 1];
      return [a.lat + (b.lat - a.lat) * f, a.lng + (b.lng - a.lng) * f];
    }
  }
  return latlngs[latlngs.length - 1] || [0, 0];
}

// Color the route segments for the current walkthrough step plus the next one;
// gray out everything further ahead.
export function setActiveStep(step) {
  activeStep = step;
  applyActiveStep();
}

function applyActiveStep() {
  routeSegments.forEach(seg => {
    const on = activeStep != null && seg.step >= activeStep && seg.step <= activeStep + 1;
    seg.line.setStyle({
      color: on ? '#facc15' : '#6b7280',
      weight: on ? 5 : 2.5,
      opacity: on ? 0.95 : 0.45
    });
    const el = seg.label.getElement();
    if (el) el.style.opacity = on ? '1' : '0.35';
  });
}

export function clearRoute() {
  if (routeLayer && mapInstance) mapInstance.removeLayer(routeLayer);
  routeLayer = null;
}

// --- Calibration -----------------------------------------------------------

function solveAffine(points) {
  // points: [{ x, y, lng, lat }]  (3 non-collinear anchors)
  // lng = a*x + b*y + c ; lat = d*x + e*y + f
  const [[x1, y1], [x2, y2], [x3, y3]] = points.map(p => p.coords);
  const [l1, l2, l3] = points.map(p => p.lng);
  const [t1, t2, t3] = points.map(p => p.lat);

  const M = [
    [x1, y1, 1],
    [x2, y2, 1],
    [x3, y3, 1]
  ];
  const inv = invert3(M);
  const ab = mul3(inv, [l1, l2, l3]);
  const de = mul3(inv, [t1, t2, t3]);
  return { a: ab[0], b: ab[1], c: ab[2], d: de[0], e: de[1], f: de[2] };
}

function invert3(m) {
  const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) throw new Error('Calibration points are collinear');
  const inv = [
    [(e * i - f * h), (c * h - b * i), (b * f - c * e)],
    [(f * g - d * i), (a * i - c * g), (c * d - a * f)],
    [(d * h - e * g), (b * g - a * h), (a * e - b * d)]
  ].map(row => row.map(v => v / det));
  return inv;
}

function mul3(m, v) {
  return m.map(row => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
}

let calibration = null; // { index, points, tempMarkers }
let calibClickHandler = null;

function setCalibStatus(text) {
  const el = document.getElementById('calib-status');
  if (el) el.textContent = text || '';
}

function cancelCalibrationListener() {
  if (calibClickHandler) {
    mapInstance.off('click', calibClickHandler);
    calibClickHandler = null;
  }
}

function startCalibration() {
  if (!mapInstance) return;
  cancelCalibrationListener();
  if (calibration) calibration.tempMarkers.forEach(m => mapInstance.removeLayer(m));
  calibration = { index: 0, points: [], tempMarkers: [] };
  promptCalibrationStep();
}

function promptCalibrationStep() {
  const p = CALIB_PORTS[calibration.index];
  setCalibStatus(`Click on ${p.name}`);
  cancelCalibrationListener();
  calibClickHandler = (e) => {
    const latlng = [e.latlng.lat, e.latlng.lng];
    const temp = L.circleMarker(latlng, { radius: 8, color: '#fef08a', weight: 2, fillColor: '#facc15', fillOpacity: 0.6 });
    temp.bindTooltip(p.name, { permanent: true, direction: 'top', offset: [0, -8] });
    temp.addTo(mapInstance);
    calibration.tempMarkers.push(temp);
    calibration.points.push({ name: p.name, coords: p.coords, lat: e.latlng.lat, lng: e.latlng.lng });

    calibration.index++;
    if (calibration.index < CALIB_PORTS.length) {
      promptCalibrationStep();
    } else {
      finishCalibration();
    }
  };
  mapInstance.on('click', calibClickHandler);
}

function finishCalibration() {
  cancelCalibrationListener();
  const points = calibration.points;
  calibration.tempMarkers.forEach(m => mapInstance.removeLayer(m));
  calibration.tempMarkers = [];
  try {
    const t = solveAffine(points);
    transform = t;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
    rebuildPortMarkers();
    if (lastDrawnStops) drawRoute(lastDrawnStops);
    const res = calibrationResidual(points, t);
    setCalibStatus(`Calibrated ✓ residual ${res.toFixed(4)}`);
    const details = document.getElementById('calib-details');
    if (details) {
      details.textContent = `a=${fmt(t.a)} b=${fmt(t.b)} c=${fmt(t.c)}\nd=${fmt(t.d)} e=${fmt(t.e)} f=${fmt(t.f)}`;
    }
  } catch (err) {
    setCalibStatus(`Calibration failed: ${err.message}`);
  }
}

function calibrationResidual(points, t) {
  let max = 0;
  for (const p of points) {
    const [lat, lng] = projectToLatLng(p.coords[0], p.coords[1]);
    const err = Math.hypot(lat - p.lat, lng - p.lng);
    max = Math.max(max, err);
  }
  return max;
}

function fmt(n) {
  return n.toExponential(3);
}

export async function initMapOverlay(map) {
  mapInstance = map;
  await loadPorts();

  portGroups = {
    t5: L.layerGroup(),
    t6: L.layerGroup(),
    t7: L.layerGroup(),
    other: L.layerGroup()
  };
  rebuildPortMarkers();
  Object.values(portGroups).forEach(g => g.addTo(map));
  wireToggles();

  const btn = document.getElementById('calibrate-btn');
  if (btn) btn.addEventListener('click', startCalibration);
}
