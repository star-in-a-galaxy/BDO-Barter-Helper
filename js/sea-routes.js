// Rule-based sea-route distances.
//
// Straight-line distances are wrong when the segment crosses the Margoria
// landmass, so a few "preceding-node" waypoints route around the big outliers.
// Each port's `exit` chain lists the waypoints to pass when leaving the port
// (reversed when arriving). Two routes merge at their first shared waypoint,
// so a shared lane (e.g. Arehaza and Hakoven) is only traversed once. Ports
// without a chain, and pairs that don't need routing, stay straight-line.
//
// Synthetic waypoints (named points with explicit game coordinates) are the
// only coordinates stored here; real ports resolve from barterPorts.json.

const SYNTHETIC = {
  // Same longitude as Iliya Island, latitude of Marlene Island.
  'Iliya South': [153562, -265813],
  // Same longitude as Teyamal Island, latitude midway between Epheria and Teyamal.
  'Grandiha Gap': [-524725, -46379.35],
  // Same longitude as Sanctuary Coastal Outpost, latitude of Iliya Island.
  'Hakoven Gap': [495582, -289760]
};

// Each port lists only its *immediate* next waypoint; chains expand recursively.
const EXIT = {
  'Arehaza': ['Hakoven Island'],
  'Hakoven Island': ['Hakoven Gap'],
  'Starry Midnight Port': ['Grandiha'],
  'Grandiha': ['Grandiha Gap'],
  'Iliya Island': ['Iliya South']
};

function normalize(s) {
  return String(s || '').toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const EXIT_KEYS = new Map(Object.keys(EXIT).map(k => [normalize(k), k]));

function exitChain(name) {
  const canonical = EXIT_KEYS.get(normalize(name));
  return canonical ? EXIT[canonical] : [];
}

function coordsOf(name, ports) {
  return seaNodeCoords(name, ports);
}

// Resolve a waypoint's game coordinates: synthetic points from SYNTHETIC,
// otherwise the named port from `ports` (array or keyed object).
export function seaNodeCoords(name, ports) {
  if (SYNTHETIC[name]) return SYNTHETIC[name];
  const q = normalize(name);
  const list = Array.isArray(ports) ? ports : Object.values(ports || {});
  for (const p of list) {
    if (p && Array.isArray(p.coordinates) && normalize(p.name) === q) return p.coordinates;
  }
  return null;
}

// Expand a port's full exit path by following each node's immediate exit chain
// recursively (cycle-protected). E.g. Arehaza -> [Arehaza, Hakoven Island,
// Hakoven Gap].
function expandPath(start) {
  const out = [];
  const seen = new Set();
  const walk = (name) => {
    const key = normalize(name);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(name);
    for (const nxt of exitChain(name)) walk(nxt);
  };
  walk(start);
  return out;
}

// Sea-aware route between two ports. Returns { distance, path } where `path` is
// the ordered list of waypoints to sail through, or null if it can't be
// resolved (callers fall back to a straight line).
export function seaPath(a, b, ports) {
  if (!a || !b) return null;

  const pathA = expandPath(a);
  const pathB = expandPath(b);

  const setB = new Set(pathB.map(normalize));
  let shared = null;
  for (const n of pathA) {
    if (setB.has(normalize(n))) { shared = n; break; }
  }

  let nodes;
  if (shared) {
    const iA = pathA.findIndex(n => normalize(n) === normalize(shared));
    const iB = pathB.findIndex(n => normalize(n) === normalize(shared));
    nodes = [...pathA.slice(0, iA + 1), ...pathB.slice(0, iB).reverse()];
  } else {
    // pathB.slice(1) = B's exit chain (outermost first); approach B through it.
    nodes = [...pathA, ...pathB.slice(1), b];
  }

  const pts = nodes.map(n => coordsOf(n, ports));
  if (pts.some(p => !p)) return null;

  let distance = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    distance += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  }
  return { distance, path: nodes };
}
