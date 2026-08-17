// optimizer2.js — a clean, minimal optimizer following optimizer.md.
//
// It assumes it receives a correct trade list (the scanner + resolution UI
// guarantee one trade per island row and that every item is used once). It only
// decides HOW to sail:
//   - batch non-stock regions whose T4 load fits the ship,
//   - sweep the T5 islands, ordered to keep the whole leg short,
//   - T5→T6 at each region's trader(s),
//   - T6→T7 at each trade's actual offering port, selling the batch afterwards,
//   - juggling (ship↔player) only at Iliya and the traders/ports it visits,
//   - compare candidate orderings and keep the shortest sea-aware route.
//
// Deliberately no overstack handoff, no combined-stock sweep, no thresholds.

import { loadBarterPorts } from './catalog.js';
import {
  generateAllConfigs, t6Name, t7Name, nameKey, traderOf, getDistance, calculateRouteDistance
} from './optimizer.js';

// Build a single simple route for one config.
function buildSimpleRoute(config, trades, shipCapacity, baseWeight, usedWeight, ports) {
  const { chainOrder, t6Orders, t7Orders, stockRegions } = config;
  const route = [];
  const actions = [];
  const shipItems = {};
  const playerItems = {};
  const tierMap = {};
  trades.forEach(t => {
    tierMap[t.t4] = 4; tierMap[t.t5] = 5;
    tierMap[t6Name(t)] = 6; tierMap[t7Name(t)] = 7;
  });

  const itemWeight = (name) => ((tierMap[name] || 4) <= 5 ? 1000 : 2000);
  const calcWeight = (obj) => Object.entries(obj).reduce((s, [n, c]) => s + c * itemWeight(n), 0);
  const shipFree = () => shipCapacity - calcWeight(shipItems);
  const playerThreshold = baseWeight * 1.7 - usedWeight;
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
      if (calcWeight(playerItems) >= playerThreshold) return fail(`Cannot move ${it.count}x ${it.name} to player at ${location}: player full`);
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

  // Visit T4→T5 islands nearest-neighbour, ending at the one closest to
  // `nextDest` (the onward destination) so the sweep leads into the next leg.
  const sweepIslands = (items, nextDest) => {
    const remaining = items.slice();
    let last = null;
    if (nextDest && remaining.length > 1) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = getDistance(remaining[i].island, nextDest, ports);
        if (d < bd) { bd = d; bi = i; }
      }
      last = remaining.splice(bi, 1)[0];
    }
    while (remaining.length) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = getDistance(currentLocation, remaining[i].island, ports);
        if (d < bd) { bd = d; bi = i; }
      }
      const item = remaining.splice(bi, 1)[0];
      goTo(item.island);
      const r = trade(item.t4, item.t5, 5, item.island);
      if (!r.success) return r;
    }
    if (last) {
      goTo(last.island);
      return trade(last.t4, last.t5, 5, last.island);
    }
    return { success: true };
  };

  // Free ship space for a region's T6 output: bring its T5s back from the player
  // and offload other regions' T5s to the player. (Juggling at the first trader.)
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

  // T5→T6 at traders, then T6→T7 at each trade's actual port, selling the batch
  // afterwards at the last port (consecutive T6→T7s are net-zero weight).
  const runChain = (regionKey, regionTrades, t6Traders, t7Traders) => {
    for (const trader of t6Traders) {
      const key = nameKey(trader);
      const td = regionTrades.find(t => nameKey(traderOf(t)) === key);
      if (!td) return fail(`No trade configured for ${regionKey} T6 trader ${trader}`);
      goTo(trader);
      const r = trade(td.t5, t6Name(td), 5, trader);
      if (!r.success) return r;
    }
    for (let i = 0; i < regionTrades.length; i++) {
      const td = regionTrades[i];
      const loc = td.t7Port || t7Traders[i];
      if (!loc) return fail(`No T7 trader for ${regionKey} trade ${i + 1}`);
      goTo(loc);
      const r = trade(t6Name(td), t7Name(td), 5, loc);
      if (!r.success) return r;
    }
    for (const td of regionTrades) {
      const it = { name: t7Name(td), count: 5 };
      const m = moveToPlayer([it], currentLocation);
      if (!m.success) return m;
      const s = sell([it], currentLocation);
      if (!s.success) return s;
    }
    return { success: true };
  };

  goTo('Iliya Island');

  // Stock regions: load their T5s from Iliya stock and run the chain.
  for (const region of stockRegions) {
    const regionTrades = trades.filter(t => t.region.toLowerCase() === region);
    if (!regionTrades.length) continue;
    const regionKey = region.charAt(0).toUpperCase() + region.slice(1);
    const l = loadShip(regionTrades.map(t => ({ name: t.t5, count: 5 })), 'Iliya Island');
    if (!l.success) return l;
    const c = runChain(regionKey, regionTrades, t6Orders[region] || [], t7Orders[region] || []);
    if (!c.success) return c;
  }

  // Non-stock regions, batched by ship capacity.
  const nonStock = chainOrder.filter(r => !stockRegions.includes(r));
  const groups = [];
  let cur = [], w = 0;
  for (const region of nonStock) {
    const rw = trades.filter(t => t.region.toLowerCase() === region).length * 5 * 1000;
    if (cur.length && w + rw > shipCapacity) { groups.push(cur); cur = []; w = 0; }
    cur.push(region); w += rw;
  }
  if (cur.length) groups.push(cur);

  for (const group of groups) {
    const groupTrades = trades.filter(t => group.includes(t.region.toLowerCase()));
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

    for (const region of group) {
      const regionTrades = groupTrades.filter(t => t.region.toLowerCase() === region);
      const regionKey = region.charAt(0).toUpperCase() + region.slice(1);
      const prep = prepareRegion(region, regionTrades, t6Orders[region] || []);
      if (!prep.success) return prep;
      const c = runChain(regionKey, regionTrades, t6Orders[region] || [], t7Orders[region] || []);
      if (!c.success) return c;
    }
  }

  return { route, actions, feasible: true };
}

// Try every ordering config and return the shortest feasible simple route.
export async function optimizeRoute2(trades, regionMapping, ilyaStock, shipCapacity = 22450, baseWeight = 5400, usedWeight = 150, allStock = false) {
  const ports = await loadBarterPorts();
  const configs = generateAllConfigs(trades, ilyaStock, regionMapping, allStock);
  let best = null;
  for (const config of configs) {
    const r = buildSimpleRoute(config, trades, shipCapacity, baseWeight, usedWeight, ports);
    if (r.error || !r.feasible) continue;
    const dist = calculateRouteDistance(r.route, ports);
    if (!best || dist < best.distance) {
      best = { distance: dist, route: r.route, actions: r.actions, config, structure: 'simple' };
    }
  }
  if (!best) return { error: 'No feasible route', route: null, actions: null, distance: null, config: null, structure: null };
  return best;
}
