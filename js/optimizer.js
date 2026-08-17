import { loadBarterPorts } from './catalog.js';
import { seaPath } from './sea-routes.js';

const T7_TRADERS = {
  "A": ["Olvia Coast", "Epheria Sentry Post"],
  "B": ["Iliya Island", "Lema Island"],
  "C": ["Sanctuary Coastal Outpost", "Sausan Garrison Wharf"]
};

const T6_TRADERS = {
  "North": ["Haemo Island", "Dallae Pier"],
  "South": ["Grándiha", "Starry Midnight Port"],
  "East": ["Hakoven Island", "Arehaza"]
};

// Enforced T6 trader travel order per region. Straight-line distances are not a
// reliable proxy for the actual sailing routes, so these orderings are fixed:
// Hakoven before Arehaza (East), Grándiha before Starry Midnight Port (South).
// North is left unconstrained (both Haemo/Dallae orders are explored).
const T6_ORDER = {
  south: ["Grándiha", "Starry Midnight Port"],
  east: ["Hakoven Island", "Arehaza"]
};

// Item name for a tier, keyed by REGION for T6/T7 (e.g. "[Level 6] North").
// T5 and below keep the item's own name. This lets the walkthrough show which
// region a T6/T7 belongs to instead of carrying the T5 item's name forward.
export function tierItem(itemName, tier, region) {
  if (tier <= 5) return itemName;
  const key = String(region || '').charAt(0).toUpperCase() + String(region || '').slice(1);
  return `[Level ${tier}] ${key}`;
}

// Real T6/T7 item names when the trade carries them (from a scanned T6→T7
// screenshot); otherwise fall back to the region-based "[Level N] {Region}".
export function t6Name(trade) {
  return (trade && trade.t6) ? trade.t6 : tierItem(trade && trade.t5, 6, trade && trade.region);
}

export function t7Name(trade) {
  return (trade && trade.t7) ? trade.t7 : tierItem(trade && trade.t5, 7, trade && trade.region);
}

// Trader/chain location name for a trade row. The UI builds chain as
// "<Region> - <Trader>" but it may also be just "<Trader>".
export function traderOf(trade) {
  return String((trade && trade.chain) || '').split(' - ').pop().trim();
}

// Case/diacritic-insensitive key for comparing location names (matches
// "Grándiha" with the unaccented "Grandiha" a scanned/typed chain may carry).
export function nameKey(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function normName(name) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// Memoized sea-aware distance. The config loop and the island sweep query the
// same port pairs repeatedly, so cache them (order-independent).
const distanceCache = new Map();
export function getDistance(loc1, loc2, ports) {
  const k1 = normName(loc1);
  const k2 = normName(loc2);
  const key = k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1;
  const cached = distanceCache.get(key);
  if (cached !== undefined) return cached;
  
  // Sea-aware distance first: routes around the landmass via "preceding-node"
  // waypoints where the straight line would cross land.
  const sea = seaPath(loc1, loc2, ports);
  if (sea) {
    distanceCache.set(key, sea.distance);
    return sea.distance;
  }
  
  // Fall back to a straight line for unrouted / unresolvable pairs.
  const port1 = Object.values(ports).find(p => normName(p.name) === k1);
  const port2 = Object.values(ports).find(p => normName(p.name) === k2);
  
  if (!port1 || !port2 || !port1.coordinates || !port2.coordinates) return 0;
  
  const [x1, y1] = port1.coordinates;
  const [x2, y2] = port2.coordinates;
  
  const d = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  distanceCache.set(key, d);
  return d;
}

export function calculateRouteDistance(route, ports) {
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    total += getDistance(route[i], route[i + 1], ports);
  }
  return total;
}

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    const perms = permutations(rest);
    for (const perm of perms) {
      result.push([arr[i], ...perm]);
    }
  }
  return result;
}

function subsets(arr) {
  const result = [[]];
  for (const item of arr) {
    const len = result.length;
    for (let i = 0; i < len; i++) {
      result.push([...result[i], item]);
    }
  }
  return result;
}

export function generateAllConfigs(trades, ilyaStock, regionMapping, allStock = false) {
  const configs = [];
  
  const regions = ["east", "north", "south"];
  const activeRegions = regions.filter(r => trades.some(t => t.region.toLowerCase() === r));
  
  // Full within-region ordering permutations (2 per region per type) - used for
  // the no-stock baseline so its quality is unchanged.
  const t6Perms = {};
  const t5Perms = {};
  for (const region of activeRegions) {
    const regionUpper = region.charAt(0).toUpperCase() + region.slice(1);
    // T6 trader order is fixed where T6_ORDER is set (actual sailing routes make
    // the reverse invalid); other regions explore both orderings.
    t6Perms[region] = T6_ORDER[region]
      ? [T6_ORDER[region]]
      : permutations(T6_TRADERS[regionUpper] || []);
    t5Perms[region] = permutations(trades.filter(t => t.region.toLowerCase() === region).map(t => t.island));
  }
  const t7Perms = {};
  for (const region of activeRegions) {
    const mappingKey = (regionMapping && regionMapping[region]) || "A";
    t7Perms[region] = permutations(T7_TRADERS[mappingKey] || T7_TRADERS.A);
  }
  
  const pushFullOrdering = (base) => {
    for (const t6East of t6Perms.east || [[]]) {
      for (const t6North of t6Perms.north || [[]]) {
        for (const t6South of t6Perms.south || [[]]) {
          for (const t5East of t5Perms.east || [[]]) {
            for (const t5North of t5Perms.north || [[]]) {
              for (const t5South of t5Perms.south || [[]]) {
                for (const t7East of t7Perms.east || [[]]) {
                  for (const t7North of t7Perms.north || [[]]) {
                    for (const t7South of t7Perms.south || [[]]) {
                      configs.push({
                        ...base,
                        t6Orders: { east: t6East, north: t6North, south: t6South },
                        t5Orders: { east: t5East, north: t5North, south: t5South },
                        t7Orders: { east: t7East, north: t7North, south: t7South }
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  };
  
  // Reduced within-region ordering (natural + reverse as a unit) for the
  // stock-subset configs - bounds the extra search cost while still exploring
  // ordering. The no-stock baseline (full ordering) is always included, so the
  // overall result can never be worse than plain no-stock.
  const reducedOptions = {};
  for (const region of activeRegions) {
    const regionUpper = region.charAt(0).toUpperCase() + region.slice(1);
    const islands = trades.filter(t => t.region.toLowerCase() === region).map(t => t.island);
    const t6s = T6_ORDER[region] ? [T6_ORDER[region]] : permutations(T6_TRADERS[regionUpper] || []);
    const mappingKey = (regionMapping && regionMapping[region]) || "A";
    const t7 = T7_TRADERS[mappingKey] || T7_TRADERS.A;
    const opts = [];
    for (const t6 of t6s) {
      opts.push({ t5: islands, t6, t7 });
      opts.push({ t5: [...islands].reverse(), t6, t7: [...t7].reverse() });
    }
    reducedOptions[region] = opts;
  }
  const pickReduced = (region) => reducedOptions[region] || [null];
  
  const pushReducedOrdering = (base) => {
    for (const oEast of pickReduced('east')) {
      for (const oNorth of pickReduced('north')) {
        for (const oSouth of pickReduced('south')) {
          configs.push({
            ...base,
            t5Orders: { east: oEast ? oEast.t5 : [], north: oNorth ? oNorth.t5 : [], south: oSouth ? oSouth.t5 : [] },
            t6Orders: { east: oEast ? oEast.t6 : [], north: oNorth ? oNorth.t6 : [], south: oSouth ? oSouth.t6 : [] },
            t7Orders: { east: oEast ? oEast.t7 : [], north: oNorth ? oNorth.t7 : [], south: oSouth ? oSouth.t7 : [] }
          });
        }
      }
    }
  };
  
  // No-stock baseline - always generated at full ordering quality
  for (const chainOrder of permutations(activeRegions)) {
    pushFullOrdering({ useIlyaStock: false, stockRegions: [], chainOrder });
  }
  
  // Determine which regions could use Ilya T5 stock.
  // allStock=true → all active regions; an object (e.g. { east: true }) → the
  // enabled regions; otherwise none.
  let availableStockRegions = [];
  if (allStock) {
    availableStockRegions = activeRegions;
  } else if (ilyaStock) {
    availableStockRegions = activeRegions.filter(r => ilyaStock[r]);
  }
  
  // Explore every non-empty subset of stock usage - one, two, or all regions -
  // so Ilya stock is an *option* the optimizer can use wherever it shortens the
  // (zero-sum) route, never a forced constraint.
  for (const stockRegions of subsets(availableStockRegions)) {
    if (stockRegions.length === 0) continue;
    for (const chainOrder of permutations(activeRegions)) {
      pushReducedOrdering({ useIlyaStock: true, stockRegions, chainOrder });
    }
  }
  
  return configs;
}
// optimizer3.js — exhaustive optimizer.
//
// Only heuristic: sea-route distances (`getDistance`, i.e. the directional exit
// chains in sea-routes.js). Everything else is *searched* and compared by total
// route distance:
//   - every feasible region batching,
//   - every region/trader/T7 ordering (from generateAllConfigs),
//   - the exact island order (TSP) within each batch,
//   - the overstack-handoff variant at each group boundary.
// No greedy batching, no greedy sweep, no forced detours.

// Exact shortest order for the islands: start → every island → nextDest.
function bestIslandOrder(items, current, nextDest, ports) {
  const n = items.length;
  if (n <= 1) return items.map((_, i) => i);
  const start = (i) => getDistance(current, items[i].island, ports);
  const pair = (i, j) => getDistance(items[i].island, items[j].island, ports);
  const end = (i) => nextDest ? getDistance(items[i].island, nextDest, ports) : 0;
  let best = null, bestTotal = Infinity;
  const used = new Array(n).fill(false);
  const order = [];
  const dfs = (prev, depth, partial) => {
    if (partial >= bestTotal) return;
    if (depth === n) { const t = partial + end(prev); if (t < bestTotal) { bestTotal = t; best = order.slice(); } return; }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      used[i] = true; order.push(i);
      dfs(i, depth + 1, partial + (prev === null ? start(i) : pair(prev, i)));
      order.pop(); used[i] = false;
    }
  };
  dfs(null, 0, 0);
  return best || items.map((_, i) => i);
}

// Build a route for one config + one grouping. `variant` is 'plain' or 'handoff'
// (use the overstack handoff at each feasible group boundary).
function buildRoute(config, grouping, trades, shipCapacity, baseWeight, usedWeight, ports, variant = 'plain') {
  const { t6Orders, t7Orders, stockRegions } = config;
  const route = [];
  const actions = [];
  const shipItems = {};
  const playerItems = {};
  const tierMap = {};
  trades.forEach(t => { tierMap[t.t4] = 4; tierMap[t.t5] = 5; tierMap[t6Name(t)] = 6; tierMap[t7Name(t)] = 7; });

  // Only real barter ports are valid T6→T7 locations. A trade's t7Port that
  // isn't a known port (garbled OCR, manual typo, stale saved data) is dropped
  // and the region's mapped T7 port is used instead - never a garbage location.
  const validPorts = new Set(Object.values(ports).map(p => nameKey(p.name)));
  const t7LocFor = (td, t7Traders, i) =>
    (td.t7Port && validPorts.has(nameKey(td.t7Port)) ? td.t7Port : (t7Traders[i] || null));

  const itemWeight = (name) => ((tierMap[name] || 4) <= 5 ? 1000 : 2000);
  const calcWeight = (obj) => Object.entries(obj).reduce((s, [n, c]) => s + c * itemWeight(n), 0);
  const shipFree = () => shipCapacity - calcWeight(shipItems);
  const playerThreshold = baseWeight * 1.7 - usedWeight;
  const playerWeight = () => calcWeight(playerItems);
  const fail = (msg) => ({ error: msg, feasible: false });

  let currentLocation = null;
  const goTo = (location) => { if (currentLocation !== location) { route.push(location); currentLocation = location; } };
  const loadShip = (items, location) => {
    for (const it of items) {
      if (it.count * itemWeight(it.name) > shipFree()) return fail(`Cannot load ${it.count}x ${it.name} at ${location}: no space`);
      shipItems[it.name] = (shipItems[it.name] || 0) + it.count;
    }
    actions.push({ location, action: 'load_ship', items });
    return { success: true };
  };
  const moveToPlayer = (items, location) => {
    for (const it of items) {
      if ((shipItems[it.name] || 0) < it.count) return fail(`Cannot move ${it.count}x ${it.name} to player at ${location}`);
      if (playerWeight() >= playerThreshold) return fail(`Cannot move ${it.count}x ${it.name} to player at ${location}: player full`);
      shipItems[it.name] -= it.count; if (!shipItems[it.name]) delete shipItems[it.name];
      playerItems[it.name] = (playerItems[it.name] || 0) + it.count;
    }
    actions.push({ location, action: 'move_to_player', items });
    return { success: true };
  };
  const moveToShip = (items, location) => {
    for (const it of items) {
      if ((playerItems[it.name] || 0) < it.count) return fail(`Cannot move ${it.count}x ${it.name} to ship at ${location}`);
      if (it.count * itemWeight(it.name) > shipFree()) return fail(`Cannot move ${it.count}x ${it.name} to ship at ${location}: no space`);
      playerItems[it.name] -= it.count; if (!playerItems[it.name]) delete playerItems[it.name];
      shipItems[it.name] = (shipItems[it.name] || 0) + it.count;
    }
    actions.push({ location, action: 'move_to_ship', items });
    return { success: true };
  };
  const trade = (input, output, count, location) => {
    if ((shipItems[input] || 0) < count) return fail(`Cannot trade at ${location}: ship lacks ${count}x ${input}`);
    const net = count * (itemWeight(output) - itemWeight(input));
    if (net > 0 && net > shipFree()) return fail(`Trade failed at ${location}: no space`);
    shipItems[input] -= count; if (!shipItems[input]) delete shipItems[input];
    shipItems[output] = (shipItems[output] || 0) + count;
    actions.push({ location, action: 'trade', input, output, count });
    return { success: true };
  };
  const sell = (items, location) => {
    for (const it of items) {
      if ((playerItems[it.name] || 0) < it.count) return fail(`Cannot sell ${it.count}x ${it.name} at ${location}`);
      playerItems[it.name] -= it.count; if (!playerItems[it.name]) delete playerItems[it.name];
    }
    actions.push({ location, action: 'sell', items });
    return { success: true };
  };
  const sellShip = (items, location) => {
    for (const it of items) {
      if ((shipItems[it.name] || 0) < it.count) return fail(`Cannot sell ${it.count}x ${it.name} at ${location}: not on ship`);
      shipItems[it.name] -= it.count; if (!shipItems[it.name]) delete shipItems[it.name];
    }
    actions.push({ location, action: 'sell', items, fromShip: true });
    return { success: true };
  };
  const storeIlya = (items, location) => {
    for (const it of items) {
      if ((shipItems[it.name] || 0) < it.count) return fail(`Cannot store ${it.count}x ${it.name} at ${location}: not on ship`);
      shipItems[it.name] -= it.count; if (!shipItems[it.name]) delete shipItems[it.name];
    }
    actions.push({ location, action: 'store_ilya', items });
    return { success: true };
  };

  // Per-trade mini-chains for small ships: a region whose combined T6 output
  // (n × 5 × 2000lt) exceeds the ship capacity is processed one trade at a time
  // so the ship is never overweight. `source` 't5' means the T5 comes from Ilya
  // stock (no island sweep); 't4' loads the T4 and barters T4→T5 at the island.
  const runMiniChains = (tradesList, t6Traders, t7Traders, source) => {
    for (let i = 0; i < tradesList.length; i++) {
      const td = tradesList[i];
      const trader = t6Traders[i] || t6Traders.find(t => nameKey(traderOf(td)) === nameKey(t));
      if (!trader) return fail(`No T6 trader for trade ${i + 1}`);
      goTo('Iliya Island');
      const l = loadShip([{ name: source === 't5' ? td.t5 : td.t4, count: 5 }], 'Iliya Island');
      if (!l.success) return l;
      if (source === 't4') {
        if (!td.island) return fail(`No T5 island for trade ${i + 1}`);
        goTo(td.island);
        const tr = trade(td.t4, td.t5, 5, td.island);
        if (!tr.success) return tr;
      }
      goTo(trader);
      const t5t6 = trade(td.t5, t6Name(td), 5, trader);
      if (!t5t6.success) return t5t6;
      const loc = t7LocFor(td, t7Traders, i);
      if (!loc) return fail(`No T7 trader for trade ${i + 1}`);
      goTo(loc);
      const t6t7 = trade(t6Name(td), t7Name(td), 5, loc);
      if (!t6t7.success) return t6t7;
      const it = { name: t7Name(td), count: 5 };
      const m = moveToPlayer([it], loc);
      if (!m.success) return m;
      const s = sell([it], loc);
      if (!s.success) return s;
    }
    return { success: true };
  };

  // Refill Ilya stock after using stocked T5s (zero-sum): load the region's T4s,
  // sweep its islands (T4→T5), return to Iliya and store the produced T5s.
  const restockRegion = (region, regionTrades) => {
    goTo('Iliya Island');
    const l = loadShip(regionTrades.map(t => ({ name: t.t4, count: 5 })), 'Iliya Island');
    if (!l.success) return l;
    const sweepItems = regionTrades.map(t => ({ island: t.island, t4: t.t4, t5: t.t5 }));
    const s = sweepIslands(sweepItems, 'Iliya Island');
    if (!s.success) return s;
    goTo('Iliya Island');
    return storeIlya(regionTrades.map(t => ({ name: t.t5, count: 5 })), 'Iliya Island');
  };

  // Sweep a batch's islands in the exact shortest order (start → all → nextDest).
  const sweepIslands = (sweepItems, nextDest) => {
    const order = bestIslandOrder(sweepItems, currentLocation, nextDest, ports);
    for (const i of order) {
      const item = sweepItems[i];
      goTo(item.island);
      const r = trade(item.t4, item.t5, 5, item.island);
      if (!r.success) return r;
    }
    return { success: true };
  };

  const prepareRegion = (region, regionTrades, t6Traders) => {
    const rT5 = new Set(regionTrades.map(t => t.t5));
    const toRetrieve = Object.entries(playerItems)
      .filter(([n, c]) => rT5.has(n) && c > 0)
      .map(([n, c]) => ({ name: n, count: c }));
    const loc = t6Traders[0];
    if (toRetrieve.length) {
      goTo(loc);
      const r = moveToShip(toRetrieve, loc);
      if (!r.success) return r;
    }
    const rT6Weight = regionTrades.length * 5 * 2000;
    const maxOther = Math.max(0, Math.floor((shipCapacity - rT6Weight) / 1000));
    const otherOnShip = Object.entries(shipItems)
      .filter(([n, c]) => !rT5.has(n) && tierMap[n] === 5 && c > 0);
    const otherCount = otherOnShip.reduce((s, [, c]) => s + c, 0);
    if (otherCount > maxOther) {
      const toMove = otherCount - maxOther;
      const moves = [];
      let remaining = toMove;
      for (const [n, c] of otherOnShip) {
        if (remaining <= 0) break;
        const take = Math.min(c, remaining);
        moves.push({ name: n, count: take });
        remaining -= take;
      }
      goTo(loc);
      const r = moveToPlayer(moves, loc);
      if (!r.success) return r;
    }
    return { success: true };
  };

  const runChain = (regionKey, regionTrades, t6Traders, t7Traders) => {
    for (const trader of t6Traders) {
      const key = nameKey(trader);
      const td = regionTrades.find(t => nameKey(traderOf(t)) === key);
      if (!td) return fail(`No trade configured for ${regionKey} T6 trader ${trader}`);
      goTo(trader);
      const r = trade(td.t5, t6Name(td), 5, trader);
      if (!r.success) return r;
    }
    // T6→T7 phase, ordered by the config's t7Orders so the exhaustive search
    // explores both orders of the region's two ports (and which is "last" for
    // the sells) instead of being locked to the table order. Each trade still
    // barters at its own authoritative t7Port.
    const t7Phase = regionTrades.map((td, i) => ({ td, port: t7LocFor(td, t7Traders, i) }));
    for (const p of t7Phase) {
      if (!p.port) return fail(`No T7 trader for ${regionKey} trade`);
    }
    const t7rank = new Map(t7Traders.map((p, i) => [nameKey(p), i]));
    t7Phase.sort((a, b) => {
      const ra = t7rank.has(nameKey(a.port)) ? t7rank.get(nameKey(a.port)) : t7Traders.length;
      const rb = t7rank.has(nameKey(b.port)) ? t7rank.get(nameKey(b.port)) : t7Traders.length;
      return ra - rb;
    });
    for (const { td, port } of t7Phase) {
      goTo(port);
      const r = trade(t6Name(td), t7Name(td), 5, port);
      if (!r.success) return r;
    }
    for (const { td } of t7Phase) {
      const it = { name: t7Name(td), count: 5 };
      const m = moveToPlayer([it], currentLocation);
      if (!m.success) return m;
      const s = sell([it], currentLocation);
      if (!s.success) return s;
    }
    return { success: true };
  };

  // Overstack handoff: process region A (its T5s already on the ship from the
  // batch sweep), detour to Iliya to overstack A's last T6 + load B's T4s, run
  // A's T6→T7s + sells, then sweep B's islands. Only used when it shortens the
  // whole route (the caller compares totals).
  const overstackHandoff = (A, A_trades, B_regions, B_trades) => {
    const regionKey = A.charAt(0).toUpperCase() + A.slice(1);
    const t6Traders = t6Orders[A] || [];
    const t7Traders = t7Orders[A] || [];
    if (!t6Traders.length || !t7Traders.length) return fail(`No traders for ${regionKey}`);
    if (A_trades.length < 1) return fail(`Overstack handoff for ${regionKey} needs at least one trade`);
    const overstacked = A_trades.length >= 2 ? 1 : 0;
    const bT4Weight = B_trades.length * 5 * 1000;
    if ((A_trades.length - overstacked) * 10000 + bT4Weight > shipCapacity) {
      return fail(`Overstack handoff for ${regionKey}: no space for B T4s`);
    }
    const prep = prepareRegion(A, A_trades, t6Traders);
    if (!prep.success) return prep;
    if (overstacked > 0 && playerWeight() !== 0) return fail(`Overstack handoff for ${regionKey}: player not empty`);
    for (const trader of t6Traders) {
      const key = nameKey(trader);
      const td = A_trades.find(t => nameKey(traderOf(t)) === key);
      if (!td) return fail(`No trade configured for ${regionKey} T6 trader ${trader}`);
      goTo(trader);
      const r = trade(td.t5, t6Name(td), 5, trader);
      if (!r.success) return r;
    }
    const lastA = overstacked > 0 ? A_trades[A_trades.length - 1] : null;
    const lastT6 = lastA ? t6Name(lastA) : null;
    const onBoatA = lastA ? A_trades.filter(t => t6Name(t) !== lastT6) : A_trades;
    goTo('Iliya Island');
    if (lastA) {
      const over = moveToPlayer([{ name: lastT6, count: 5 }], 'Iliya Island');
      if (!over.success) return over;
    }
    const load = loadShip(B_trades.map(t => ({ name: t.t4, count: 5 })), 'Iliya Island');
    if (!load.success) return load;
    for (let i = 0; i < onBoatA.length; i++) {
      const td = onBoatA[i];
      const loc = t7LocFor(td, t7Traders, i);
      goTo(loc);
      const barter = trade(t6Name(td), t7Name(td), 5, loc);
      if (!barter.success) return barter;
      const s = sellShip([{ name: t7Name(td), count: 5 }], loc);
      if (!s.success) return s;
    }
    const bSweep = [];
    for (const region of B_regions) {
      for (const td of B_trades.filter(t => t.region.toLowerCase() === region)) {
        bSweep.push({ island: td.island, t4: td.t4, t5: td.t5 });
      }
    }
    const bNext = (t6Orders[B_regions[0]] || [])[0];
    const sweep = sweepIslands(bSweep, bNext);
    if (!sweep.success) return sweep;
    if (lastA) {
      const lastLoc = t7LocFor(lastA, t7Traders, onBoatA.length);
      goTo(lastLoc);
      const back = moveToShip([{ name: lastT6, count: 5 }], lastLoc);
      if (!back.success) return back;
      const barter = trade(lastT6, t7Name(lastA), 5, lastLoc);
      if (!barter.success) return barter;
      const s = sellShip([{ name: t7Name(lastA), count: 5 }], lastLoc);
      if (!s.success) return s;
    }
    return { success: true };
  };

  goTo('Iliya Island');

  // Stock regions: load T5s from Ilya stock, run the chain, then restock the
  // T5s (zero-sum) so Ilya stock is preserved.
  for (const region of stockRegions) {
    const regionTrades = trades.filter(t => t.region.toLowerCase() === region);
    if (!regionTrades.length) continue;
    const regionKey = region.charAt(0).toUpperCase() + region.slice(1);
    const t6Traders = t6Orders[region] || [];
    const t7Traders = t7Orders[region] || [];
    if (regionTrades.length * 5 * 2000 > shipCapacity) {
      const m = runMiniChains(regionTrades, t6Traders, t7Traders, 't5');
      if (!m.success) return m;
    } else {
      goTo('Iliya Island');
      const l = loadShip(regionTrades.map(t => ({ name: t.t5, count: 5 })), 'Iliya Island');
      if (!l.success) return l;
      const prep = prepareRegion(region, regionTrades, t6Traders);
      if (!prep.success) return prep;
      const c = runChain(regionKey, regionTrades, t6Traders, t7Traders);
      if (!c.success) return c;
    }
    const r = restockRegion(region, regionTrades);
    if (!r.success) return r;
  }

  // Non-stock groups (already batched into `grouping`).
  let handoffGroupIndex = -1;
  for (let gi = 0; gi < grouping.length; gi++) {
    const group = grouping[gi];
    const groupTrades = trades.filter(t => group.includes(t.region.toLowerCase()));

    // Small-ship: if any region in this group can't hold its own T6 output on
    // the ship, process the whole group one trade at a time (never overweight).
    const needsMini = group.some(region =>
      groupTrades.filter(t => t.region.toLowerCase() === region).length * 5 * 2000 > shipCapacity);
    if (needsMini) {
      for (const region of group) {
        const rts = groupTrades.filter(t => t.region.toLowerCase() === region);
        const m = runMiniChains(rts, t6Orders[region] || [], t7Orders[region] || [], 't4');
        if (!m.success) return m;
      }
      continue;
    }

    if (gi === handoffGroupIndex) {
      const b = processBatched(group, groupTrades);
      if (!b.success) return b;
      continue;
    }

    goTo('Iliya Island');
    const l = loadShip(groupTrades.map(t => ({ name: t.t4, count: 5 })), 'Iliya Island');
    if (!l.success) return l;

    const sweepItems = [];
    for (const region of group) {
      for (const td of groupTrades.filter(t => t.region.toLowerCase() === region)) {
        sweepItems.push({ island: td.island, t4: td.t4, t5: td.t5 });
      }
    }
    const firstTrader = (t6Orders[group[0]] || [])[0];
    const s = sweepIslands(sweepItems, firstTrader);
    if (!s.success) return s;

    const nextGroup = grouping[gi + 1];
    const lastRegion = group[group.length - 1];
    const lastRegionTrades = groupTrades.filter(t => t.region.toLowerCase() === lastRegion);
    const nextGroupTrades = nextGroup ? trades.filter(t => nextGroup.includes(t.region.toLowerCase())) : null;

    if (variant === 'handoff' && nextGroup && nextGroupTrades && lastRegionTrades.length >= 1) {
      // Try the handoff: process the non-last regions of this group, then the
      // last region's chain via the overstack handoff into the next group.
      const baseRoute = route.slice(), baseActions = actions.slice();
      const baseShip = { ...shipItems }, basePlayer = { ...playerItems }, baseLoc = currentLocation;
      const okNonLast = processGroupChains(group.slice(0, -1), groupTrades);
      let handoffOk = false;
      if (okNonLast.success) {
        const hf = overstackHandoff(lastRegion, lastRegionTrades, nextGroup, nextGroupTrades);
        handoffOk = hf.success;
      }
      if (handoffOk) { handoffGroupIndex = gi + 1; continue; }
      route.length = 0; route.push(...baseRoute);
      actions.length = 0; actions.push(...baseActions);
      Object.keys(shipItems).forEach(k => delete shipItems[k]); Object.assign(shipItems, baseShip);
      Object.keys(playerItems).forEach(k => delete playerItems[k]); Object.assign(playerItems, basePlayer);
      currentLocation = baseLoc;
      const b = processGroupChains(group, groupTrades);
      if (!b.success) return b;
    } else {
      const b = processGroupChains(group, groupTrades);
      if (!b.success) return b;
    }
  }

  function processBatched(group, groupTrades) {
    return processGroupChains(group, groupTrades);
  }

  function processGroupChains(group, groupTrades) {
    for (const region of group) {
      const regionTrades = groupTrades.filter(t => t.region.toLowerCase() === region);
      const regionKey = region.charAt(0).toUpperCase() + region.slice(1);
      const prep = prepareRegion(region, regionTrades, t6Orders[region] || []);
      if (!prep.success) return prep;
      const c = runChain(regionKey, regionTrades, t6Orders[region] || [], t7Orders[region] || []);
      if (!c.success) return c;
    }
    return { success: true };
  }

  return { route, actions, feasible: true };
}

// All ways to split the ordered regions into contiguous capacity-fitting groups.
function feasibleGroupings(regions, trades, shipCapacity) {
  const weight = (r) => trades.filter(t => t.region.toLowerCase() === r).length * 5 * 1000;
  const results = [];
  const rec = (start, acc) => {
    if (start === regions.length) { results.push(acc); return; }
    let w = 0;
    for (let end = start; end < regions.length; end++) {
      w += weight(regions[end]);
      if (w > shipCapacity) break;
      rec(end + 1, acc.concat([regions.slice(start, end + 1)]));
    }
  };
  rec(0, []);
  return results;
}

// Exhaustive optimizer: try every config × every feasible batching × plain and
// overstack-handoff, and return the shortest total sea-aware route.
export async function optimizeRoute(trades, regionMapping, ilyaStock, shipCapacity = 22450, baseWeight = 5400, usedWeight = 150, allStock = false) {
  const ports = await loadBarterPorts();
  const configs = generateAllConfigs(trades, ilyaStock, regionMapping, allStock);
  let best = null;
  for (const config of configs) {
    const nonStock = config.chainOrder.filter(r => !config.stockRegions.includes(r));
    if (!nonStock.length) {
      const r = buildRoute(config, [], trades, shipCapacity, baseWeight, usedWeight, ports, 'plain');
      if (!r.feasible) continue;
      const d = calculateRouteDistance(r.route, ports);
      if (!best || d < best.distance) best = { distance: d, route: r.route, actions: r.actions, config, structure: 'exhaustive' };
      continue;
    }
    for (const grouping of feasibleGroupings(nonStock, trades, shipCapacity)) {
      for (const variant of ['plain', 'handoff']) {
        const r = buildRoute(config, grouping, trades, shipCapacity, baseWeight, usedWeight, ports, variant);
        if (!r.feasible) continue;
        const d = calculateRouteDistance(r.route, ports);
        if (!best || d < best.distance) best = { distance: d, route: r.route, actions: r.actions, config, structure: 'exhaustive' };
      }
    }
  }
  if (!best) return { error: 'No feasible route found with ship capacity ' + shipCapacity + 'lt and player threshold ' + Math.round(baseWeight * 1.7 - usedWeight) + 'lt', route: null, actions: null, distance: null, config: null, structure: null };
  return best;
}
