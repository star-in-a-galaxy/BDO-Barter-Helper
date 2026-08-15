import { loadBarterPorts } from './catalog.js';
import { Simulator } from './simulator.js';
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
function traderOf(trade) {
  return String((trade && trade.chain) || '').split(' - ').pop().trim();
}

// Case/diacritic-insensitive key for comparing location names (matches
// "Grándiha" with the unaccented "Grandiha" a scanned/typed chain may carry).
function nameKey(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

// The T6 trader (from t6Traders) that a trade's chain refers to, or undefined.
function findTrader(tradeData, t6Traders) {
  const key = nameKey(traderOf(tradeData));
  return (t6Traders || []).find(t => nameKey(t) === key);
}

// The trade in regionTrades whose island matches, or undefined.
function findTradeByIsland(regionTrades, island) {
  const key = nameKey(island);
  return regionTrades.find(t => nameKey(t.island) === key);
}

const T5_ISLANDS = {
  "North": ["Ajir Island", "Baremi Island"],
  "South": ["Orffs Island", "Narvo Island"],
  "East": ["Padix Island", "Oben Island"]
};

function normName(name) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getDistance(loc1, loc2, ports) {
  // Sea-aware distance first: routes around the landmass via "preceding-node"
  // waypoints where the straight line would cross land.
  const sea = seaPath(loc1, loc2, ports);
  if (sea) return sea.distance;

  // Fall back to a straight line for unrouted / unresolvable pairs.
  const key1 = normName(loc1);
  const key2 = normName(loc2);
  
  const port1 = Object.values(ports).find(p => normName(p.name) === key1);
  const port2 = Object.values(ports).find(p => normName(p.name) === key2);
  
  if (!port1 || !port2 || !port1.coordinates || !port2.coordinates) return 0;
  
  const [x1, y1] = port1.coordinates;
  const [x2, y2] = port2.coordinates;
  
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function calculateRouteDistance(route, ports) {
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

/**
 * Build optimized route.
 *
 * Strategy: process one region's full barter chain at a time.
 *  - The Ilya stock region (if any) is processed first using its pre-stocked T5.
 *  - Each remaining region is loaded with T4 at Iliya, then T4→T5 → T5→T6 → T6→T7.
 *  - T7 items are staged to the player one trade (5x) at a time and sold immediately,
 *    so the player inventory is only used transiently while selling.
 *
 * This is always feasible whenever a single region's chain fits in the ship
 * (10 T4/T5 items = 10,000lt; 10 T6/T7 items = 20,000lt for a 2-trade region).
 */
function buildOptimizedRoute(config, trades, regionMapping, shipCapacity = 22450, characterBaseWeight = 5400, characterUsedWeight = 150, ports = null) {
  const { ilyaStockRegion, t6Orders, t5Orders, t7Orders, chainOrder } = config;
  
  const route = [];
  const actions = [];
  const shipItems = {};
  const playerItems = {};
  const tierMap = {};
  
  // Player inventory threshold: (baseWeight × 1.7) - usedWeight.
  // Items can be added to the player only while current weight is below this threshold.
  const playerThreshold = (characterBaseWeight * 1.7) - characterUsedWeight;
  
  // Build tier map
  trades.forEach(t => {
    tierMap[t.t4] = 4;
    tierMap[t.t5] = 5;
    tierMap[t6Name(t)] = 6;
    tierMap[t7Name(t)] = 7;
  });
  
  const itemWeight = (name) => ((tierMap[name] || 4) <= 5 ? 1000 : 2000);
  const calcWeight = (items) => Object.entries(items).reduce((sum, [item, count]) => sum + count * itemWeight(item), 0);
  const shipWeight = () => calcWeight(shipItems);
  const playerWeight = () => calcWeight(playerItems);
  const shipFree = () => shipCapacity - shipWeight();
  
  const fail = (msg) => ({ error: msg, feasible: false });
  
  // Track location and append to route only when the location actually changes
  let currentLocation = null;
  const goTo = (location) => {
    if (currentLocation !== location) {
      route.push(location);
      currentLocation = location;
    }
  };
  
  // Load items into the ship (mirrors Simulator.ship.add)
  const loadShip = (items, location) => {
    for (const item of items) {
      const weight = item.count * itemWeight(item.name);
      if (weight > shipFree()) {
        return fail(`Cannot load ${item.count}x ${item.name} at ${location}: insufficient ship capacity (${weight}lt > ${shipFree()}lt free)`);
      }
      shipItems[item.name] = (shipItems[item.name] || 0) + item.count;
    }
    actions.push({ location, action: "load_ship", items });
    return { success: true };
  };
  
  // Trade input→output in the ship (mirrors Simulator.trade)
  const trade = (input, output, count, location, region) => {
    if ((shipItems[input] || 0) < count) {
      return fail(`Cannot trade at ${location}: ship lacks ${count}x ${input}`);
    }
    const netWeight = count * (itemWeight(output) - itemWeight(input));
    if (netWeight > 0 && netWeight > shipFree()) {
      return fail(`Trade failed at ${location}: insufficient ship capacity (${netWeight}lt needed, ${shipFree()}lt free)`);
    }
    shipItems[input] -= count;
    if (shipItems[input] === 0) delete shipItems[input];
    shipItems[output] = (shipItems[output] || 0) + count;
    actions.push({ location, action: "trade", input, output, count, region });
    return { success: true };
  };
  
  // Move items from ship to player (mirrors Simulator move_to_player)
  const moveToPlayer = (items, location) => {
    for (const item of items) {
      if ((shipItems[item.name] || 0) < item.count) {
        return fail(`Cannot move ${item.count}x ${item.name} to player at ${location}: not on ship`);
      }
      if (playerWeight() >= playerThreshold) {
        return fail(`Cannot move ${item.count}x ${item.name} to player at ${location}: player inventory is full`);
      }
      shipItems[item.name] -= item.count;
      if (shipItems[item.name] === 0) delete shipItems[item.name];
      playerItems[item.name] = (playerItems[item.name] || 0) + item.count;
    }
    actions.push({ location, action: "move_to_player", items });
    return { success: true };
  };
  
  // Sell items from the player inventory (mirrors Simulator sell)
  const sell = (items, location) => {
    for (const item of items) {
      if ((playerItems[item.name] || 0) < item.count) {
        return fail(`Cannot sell ${item.count}x ${item.name} at ${location}: not in player inventory`);
      }
      playerItems[item.name] -= item.count;
      if (playerItems[item.name] === 0) delete playerItems[item.name];
    }
    actions.push({ location, action: "sell", items });
    return { success: true };
  };
  
  // Store items from the ship into Iliya storage (mirrors Simulator store)
  const storeIlya = (items, location) => {
    for (const item of items) {
      if ((shipItems[item.name] || 0) < item.count) {
        return fail(`Cannot store ${item.count}x ${item.name} at ${location}: not on ship`);
      }
      shipItems[item.name] -= item.count;
      if (shipItems[item.name] === 0) delete shipItems[item.name];
    }
    actions.push({ location, action: "store_ilya", items });
    return { success: true };
  };
  
  // Trade a region's T6→T7 sets. With region-based T6 names, trades that share
  // the same "[Level 6] {Region} → [Level 7] {Region}" barter must be spread one
  // per T7 trader - a port only accepts one 5x set of a given barter line.
  const tradeRegionT6toT7 = (regionTrades, t7Traders, regionKey) => {
    const groups = new Map();
    for (const tradeData of regionTrades) {
      const t6Item = t6Name(tradeData);
      if (!groups.has(t6Item)) groups.set(t6Item, []);
      groups.get(t6Item).push(tradeData);
    }
    for (const [t6Item, tradesGroup] of groups) {
      if (tradesGroup.length > t7Traders.length) {
        return fail(`Not enough T7 traders to run ${tradesGroup.length} identical ${t6Item} barters in ${regionKey}`);
      }
      for (let i = 0; i < tradesGroup.length; i++) {
        const t7Loc = tradesGroup[i].t7Port || t7Traders[i];
        goTo(t7Loc);
        const tradeResult = trade(t6Item, t7Name(tradesGroup[i]), 5, t7Loc, regionKey);
        if (!tradeResult.success) return tradeResult;
      }
    }
    return { success: true };
  };
  
  // Process a region's full chain.
  // source === 't5' means the region uses Iliya stock (T5 loaded directly).
  // source === 't4' means T4 must be loaded at Iliya and traded up through T5.
  const processRegionChain = (region, source) => {
    const regionTrades = trades.filter(t => t.region.toLowerCase() === region);
    if (regionTrades.length === 0) return { success: true };
    
    const regionKey = region.charAt(0).toUpperCase() + region.slice(1);
    const islands = t5Orders[region] || [];
    const t6Traders = t6Orders[region] || [];
    const t7Traders = t7Orders[region] || [];
    const t7TradeLoc = t7Traders[0];
    const t7SellLoc = t7Traders[t7Traders.length - 1];
    
    if (!t7TradeLoc || !t7SellLoc) {
      return fail(`No T7 traders configured for ${regionKey}`);
    }
    
    // Small-ship support: if the region's combined T6 output (n × 5 × 2000lt)
    // exceeds the ship, split it into one mini-chain per trade, each returning
    // to Iliya. This keeps routes feasible on ships too small for a full region.
    const regionT6Weight = regionTrades.length * 5 * 2000;
    if (regionT6Weight > shipCapacity) {
      for (let i = 0; i < regionTrades.length; i++) {
        const tradeData = regionTrades[i];
        const island = tradeData.island;
        const trader = findTrader(tradeData, t6Traders);
        if (source === 't4' && !island) {
          return fail(`No T5 island configured for ${regionKey} trade ${i + 1}`);
        }
        if (!trader) {
          return fail(`No T6 trader configured for ${regionKey} trade ${i + 1}`);
        }
        
        goTo("Iliya Island");
        if (source === 't5') {
          const loadResult = loadShip([{ name: tradeData.t5, count: 5 }], "Iliya Island");
          if (!loadResult.success) return loadResult;
        } else {
          const loadResult = loadShip([{ name: tradeData.t4, count: 5 }], "Iliya Island");
          if (!loadResult.success) return loadResult;
        }
        
        if (source === 't4') {
          goTo(island);
          const barterResult = trade(tradeData.t4, tradeData.t5, 5, island, regionKey);
          if (!barterResult.success) return barterResult;
        }
        
        const t6Item = t6Name(tradeData);
        goTo(trader);
        const t5t6Result = trade(tradeData.t5, t6Item, 5, trader, regionKey);
        if (!t5t6Result.success) return t5t6Result;
        
        const t7Item = t7Name(tradeData);
        const t7Loc = tradeData.t7Port || t7Traders[i];
        if (!t7Loc) {
          return fail(`No T7 trader for ${regionKey} trade ${i + 1}`);
        }
        goTo(t7Loc);
        const t6t7Result = trade(t6Item, t7Item, 5, t7Loc, regionKey);
        if (!t6t7Result.success) return t6t7Result;
        
        const sellLoc = tradeData.t7Port || t7SellLoc;
        goTo(sellLoc);
        const moveResult = moveToPlayer([{ name: t7Item, count: 5 }], sellLoc);
        if (!moveResult.success) return moveResult;
        const sellResult = sell([{ name: t7Item, count: 5 }], sellLoc);
        if (!sellResult.success) return sellResult;
      }
      return { success: true };
    }
    
    // Load stock at Iliya
    if (source === 't5') {
      const t5Items = regionTrades.map(t => ({ name: t.t5, count: 5 }));
      const loadResult = loadShip(t5Items, "Iliya Island");
      if (!loadResult.success) return loadResult;
    } else {
      const t4Items = regionTrades.map(t => ({ name: t.t4, count: 5 }));
      const loadResult = loadShip(t4Items, "Iliya Island");
      if (!loadResult.success) return loadResult;
    }
    
    // T4→T5 at T5 islands (skip for Ilya stock, which is already T5)
    if (source === 't4') {
      for (const island of islands) {
        const tradeData = findTradeByIsland(regionTrades, island);
        if (!tradeData) {
          return fail(`No T5 island configured for ${regionKey} (${island})`);
        }
        goTo(island);
        const tradeResult = trade(tradeData.t4, tradeData.t5, 5, island, regionKey);
        if (!tradeResult.success) return tradeResult;
      }
    }
    
    // T5→T6 at T6 traders (each trade bartered at its own trader)
    for (const trader of t6Traders) {
      const key = nameKey(trader);
      const tradeData = regionTrades.find(t => nameKey(traderOf(t)) === key);
      if (!tradeData) {
        return fail(`No trade configured for ${regionKey} T6 trader ${trader}`);
      }
      const t6Item = t6Name(tradeData);
      goTo(trader);
      const tradeResult = trade(tradeData.t5, t6Item, 5, trader, regionKey);
      if (!tradeResult.success) return tradeResult;
    }
    
    // T6→T7 (spread identical region-based barters across the T7 traders)
    const t6t7Result = tradeRegionT6toT7(regionTrades, t7Traders, regionKey);
    if (!t6t7Result.success) return t6t7Result;
    
    // Sell T7: stage each 5x stack to the player, then sell it immediately.
    // Selling one stack at a time keeps the player inventory within threshold.
    for (const tradeData of regionTrades) {
      const sellLoc = tradeData.t7Port || t7SellLoc;
      goTo(sellLoc);
      const t7Item = t7Name(tradeData);
      const moveResult = moveToPlayer([{ name: t7Item, count: 5 }], sellLoc);
      if (!moveResult.success) return moveResult;
      const sellResult = sell([{ name: t7Item, count: 5 }], sellLoc);
      if (!sellResult.success) return sellResult;
    }
    
    return { success: true };
  };
  
  // Re-barter a stocked region's T4→T5 at its islands and return the produced
  // T5s to Iliya storage, keeping Ilya stock zero-sum (per plan.md).
  const restockRegion = (region) => {
    const regionTrades = trades.filter(t => t.region.toLowerCase() === region);
    if (regionTrades.length === 0) return { success: true };
    
    const regionKey = region.charAt(0).toUpperCase() + region.slice(1);
    const islands = t5Orders[region] || [];
    
    goTo("Iliya Island");
    const loadResult = loadShip(regionTrades.map(t => ({ name: t.t4, count: 5 })), "Iliya Island");
    if (!loadResult.success) return loadResult;
    
    for (const island of islands) {
      const tradeData = findTradeByIsland(regionTrades, island);
      if (!tradeData) {
        return fail(`No T5 island configured for ${regionKey} (${island})`);
      }
      goTo(island);
      const tradeResult = trade(tradeData.t4, tradeData.t5, 5, island, regionKey);
      if (!tradeResult.success) return tradeResult;
    }
    
    goTo("Iliya Island");
    const storeResult = storeIlya(regionTrades.map(t => ({ name: t.t5, count: 5 })), "Iliya Island");
    if (!storeResult.success) return storeResult;
    
    return { success: true };
  };
  
  // Regions using Ilya T5 stock (pre-loaded, then restocked to keep zero-sum)
  const stockRegions = config.stockRegions || (config.allStock ? chainOrder.slice() : (ilyaStockRegion ? [ilyaStockRegion] : []));
  
  // Route starts at Iliya Island
  goTo("Iliya Island");
  
  // Process every region in order: T5-stock regions run their T5 chain,
  // the rest load T4 at Iliya and barter it up to T5.
  for (const region of chainOrder) {
    goTo("Iliya Island");
    const source = stockRegions.includes(region) ? 't5' : 't4';
    const result = processRegionChain(region, source);
    if (!result.success) return result;
  }
  
  // Restock every stocked region so Ilya stock stays zero-sum
  for (const region of stockRegions) {
    const result = restockRegion(region);
    if (!result.success) return result;
  }
  
  return { route, actions, feasible: true };
}

/**
 * Build route using inventory weight juggling (overstacking) to batch trips.
 *
 * Strategy: load T4 for ALL non-Ilya regions at once, barter every T4→T5 in a
 * single loop, then process each region's T5→T6 → T6→T7 → sell chain. Items
 * belonging to regions that are processed later are held in the player
 * inventory (overstacked, allowed in batches) to free ship space, then
 * returned to the ship when their region's turn comes.
 *
 * Feasibility: a region's T6 output (5 × trades × 2000lt) plus the few
 * "other" T5 items left on the ship must fit within the ship capacity.
 */
function buildJugglingRoute(config, trades, regionMapping, shipCapacity = 22450, characterBaseWeight = 5400, characterUsedWeight = 150, ports = null) {
  const { ilyaStockRegion, t6Orders, t5Orders, t7Orders, chainOrder } = config;
  
  const route = [];
  const actions = [];
  const shipItems = {};
  const playerItems = {};
  const tierMap = {};
  
  // Player inventory threshold: (baseWeight × 1.7) - usedWeight.
  // Batches can be added only while current weight is below this threshold.
  const playerThreshold = (characterBaseWeight * 1.7) - characterUsedWeight;
  
  // Build tier map
  trades.forEach(t => {
    tierMap[t.t4] = 4;
    tierMap[t.t5] = 5;
    tierMap[t6Name(t)] = 6;
    tierMap[t7Name(t)] = 7;
  });
  
  const itemWeight = (name) => ((tierMap[name] || 4) <= 5 ? 1000 : 2000);
  const calcWeight = (items) => Object.entries(items).reduce((sum, [item, count]) => sum + count * itemWeight(item), 0);
  const shipWeight = () => calcWeight(shipItems);
  const playerWeight = () => calcWeight(playerItems);
  const shipFree = () => shipCapacity - shipWeight();
  
  const fail = (msg) => ({ error: msg, feasible: false });
  
  // Track location and append to route only when the location actually changes
  let currentLocation = null;
  const goTo = (location) => {
    if (currentLocation !== location) {
      route.push(location);
      currentLocation = location;
    }
  };
  
  // Load items into the ship (mirrors Simulator.ship.add)
  const loadShip = (items, location) => {
    for (const item of items) {
      const weight = item.count * itemWeight(item.name);
      if (weight > shipFree()) {
        return fail(`Cannot load ${item.count}x ${item.name} at ${location}: insufficient ship capacity (${weight}lt > ${shipFree()}lt free)`);
      }
      shipItems[item.name] = (shipItems[item.name] || 0) + item.count;
    }
    actions.push({ location, action: "load_ship", items });
    return { success: true };
  };
  
  // Trade input→output in the ship (mirrors Simulator.trade)
  const trade = (input, output, count, location, region) => {
    if ((shipItems[input] || 0) < count) {
      return fail(`Cannot trade at ${location}: ship lacks ${count}x ${input}`);
    }
    const netWeight = count * (itemWeight(output) - itemWeight(input));
    if (netWeight > 0 && netWeight > shipFree()) {
      return fail(`Trade failed at ${location}: insufficient ship capacity (${netWeight}lt needed, ${shipFree()}lt free)`);
    }
    shipItems[input] -= count;
    if (shipItems[input] === 0) delete shipItems[input];
    shipItems[output] = (shipItems[output] || 0) + count;
    actions.push({ location, action: "trade", input, output, count, region });
    return { success: true };
  };
  
  // Move items from ship to player (mirrors Simulator move_to_player)
  const moveToPlayer = (items, location) => {
    for (const item of items) {
      if ((shipItems[item.name] || 0) < item.count) {
        return fail(`Cannot move ${item.count}x ${item.name} to player at ${location}: not on ship`);
      }
      if (playerWeight() >= playerThreshold) {
        return fail(`Cannot move ${item.count}x ${item.name} to player at ${location}: player inventory is full`);
      }
      shipItems[item.name] -= item.count;
      if (shipItems[item.name] === 0) delete shipItems[item.name];
      playerItems[item.name] = (playerItems[item.name] || 0) + item.count;
    }
    actions.push({ location, action: "move_to_player", items });
    return { success: true };
  };
  
  // Move items from player to ship (mirrors Simulator move_to_ship)
  const moveToShip = (items, location) => {
    for (const item of items) {
      if ((playerItems[item.name] || 0) < item.count) {
        return fail(`Cannot move ${item.count}x ${item.name} to ship at ${location}: not in player inventory`);
      }
      const weight = item.count * itemWeight(item.name);
      if (weight > shipFree()) {
        return fail(`Cannot move ${item.count}x ${item.name} to ship at ${location}: insufficient ship capacity (${weight}lt > ${shipFree()}lt free)`);
      }
      playerItems[item.name] -= item.count;
      if (playerItems[item.name] === 0) delete playerItems[item.name];
      shipItems[item.name] = (shipItems[item.name] || 0) + item.count;
    }
    actions.push({ location, action: "move_to_ship", items });
    return { success: true };
  };
  
  // Load items directly into the player inventory (from Iliya, mirrors
  // Simulator load_player)
  const loadPlayer = (items, location) => {
    for (const item of items) {
      if (playerWeight() >= playerThreshold) {
        return fail(`Cannot load ${item.count}x ${item.name} to player at ${location}: player inventory is full`);
      }
      playerItems[item.name] = (playerItems[item.name] || 0) + item.count;
    }
    actions.push({ location, action: "load_player", items });
    return { success: true };
  };
  
  // Swap items between ship and player in one batch (mirrors Simulator swap:
  // remove from both, then add to both - used for the Lema-style shuffle).
  const swapShipPlayer = (playerToShip, shipToPlayer, location) => {
    for (const item of playerToShip) {
      if ((playerItems[item.name] || 0) < item.count) {
        return fail(`Cannot swap at ${location}: player lacks ${item.count}x ${item.name}`);
      }
    }
    for (const item of shipToPlayer) {
      if ((shipItems[item.name] || 0) < item.count) {
        return fail(`Cannot swap at ${location}: ship lacks ${item.count}x ${item.name}`);
      }
    }
    // Simulate the remove-then-add ordering before mutating anything
    const shipAfterRemove = shipWeight() - shipToPlayer.reduce((s, i) => s + i.count * itemWeight(i.name), 0);
    const playerAfterRemove = playerWeight() - playerToShip.reduce((s, i) => s + i.count * itemWeight(i.name), 0);
    const shipAdd = playerToShip.reduce((s, i) => s + i.count * itemWeight(i.name), 0);
    if (shipAfterRemove + shipAdd > shipCapacity) {
      return fail(`Cannot swap at ${location}: ship lacks space for items from player`);
    }
    if (playerAfterRemove >= playerThreshold) {
      return fail(`Cannot swap at ${location}: player lacks space for items from ship`);
    }
    for (const item of shipToPlayer) {
      shipItems[item.name] -= item.count;
      if (shipItems[item.name] === 0) delete shipItems[item.name];
    }
    for (const item of playerToShip) {
      playerItems[item.name] -= item.count;
      if (playerItems[item.name] === 0) delete playerItems[item.name];
    }
    for (const item of playerToShip) {
      shipItems[item.name] = (shipItems[item.name] || 0) + item.count;
    }
    for (const item of shipToPlayer) {
      playerItems[item.name] = (playerItems[item.name] || 0) + item.count;
    }
    actions.push({ location, action: "swap", playerToShip, shipToPlayer });
    return { success: true };
  };
  
  // Sell items from the player inventory (mirrors Simulator sell)
  const sell = (items, location) => {
    for (const item of items) {
      if ((playerItems[item.name] || 0) < item.count) {
        return fail(`Cannot sell ${item.count}x ${item.name} at ${location}: not in player inventory`);
      }
      playerItems[item.name] -= item.count;
      if (playerItems[item.name] === 0) delete playerItems[item.name];
    }
    actions.push({ location, action: "sell", items });
    return { success: true };
  };
  
  // Sell items directly from the ship (a barter port's trade NPC accepts cargo
  // from the boat). Used by the overstack handoff, where the player is holding
  // the overstacked T6 and the freshly bartered T7 stays on the ship.
  const sellShip = (items, location) => {
    for (const item of items) {
      if ((shipItems[item.name] || 0) < item.count) {
        return fail(`Cannot sell ${item.count}x ${item.name} at ${location}: not in ship inventory`);
      }
      shipItems[item.name] -= item.count;
      if (shipItems[item.name] === 0) delete shipItems[item.name];
    }
    actions.push({ location, action: "sell", items, fromShip: true });
    return { success: true };
  };
  
  // Store items from the ship into Iliya storage (mirrors Simulator store)
  const storeIlya = (items, location) => {
    for (const item of items) {
      if ((shipItems[item.name] || 0) < item.count) {
        return fail(`Cannot store ${item.count}x ${item.name} at ${location}: not on ship`);
      }
      shipItems[item.name] -= item.count;
      if (shipItems[item.name] === 0) delete shipItems[item.name];
    }
    actions.push({ location, action: "store_ilya", items });
    return { success: true };
  };
  
  // Storage pool tracking for mid-route storage (Epheria or Ilya - the
  // simulator treats storage as a single pool). Used to return restock T5s to
  // Ilya at the end when they were temporarily stored at Epheria.
  const storedItems = {};
  
  const storeToStorage = (items, location, actionType) => {
    for (const item of items) {
      if ((shipItems[item.name] || 0) < item.count) {
        return fail(`Cannot store ${item.count}x ${item.name} at ${location}: not on ship`);
      }
      shipItems[item.name] -= item.count;
      if (shipItems[item.name] === 0) delete shipItems[item.name];
      storedItems[item.name] = (storedItems[item.name] || 0) + item.count;
    }
    actions.push({ location, action: actionType, items });
    return { success: true };
  };
  
  const retrieveFromStorage = (items, location, actionType) => {
    for (const item of items) {
      if ((storedItems[item.name] || 0) < item.count) {
        return fail(`Cannot retrieve ${item.count}x ${item.name} from storage at ${location}: not stored`);
      }
      const weight = item.count * itemWeight(item.name);
      if (weight > shipFree()) {
        return fail(`Cannot retrieve ${item.count}x ${item.name} from storage at ${location}: insufficient ship capacity`);
      }
      storedItems[item.name] -= item.count;
      if (storedItems[item.name] === 0) delete storedItems[item.name];
      shipItems[item.name] = (shipItems[item.name] || 0) + item.count;
    }
    actions.push({ location, action: actionType, items });
    return { success: true };
  };
  
  // Sell a region's T7s. The player may already hold other regions' T5s, so
  // each 5x T7 stack is staged to the player only while below the threshold.
  const sellT7s = (regionTrades, regionKey, t7SellLoc) => {
    for (const tradeData of regionTrades) {
      const sellLoc = tradeData.t7Port || t7SellLoc;
      goTo(sellLoc);
      const t7Item = t7Name(tradeData);
      const moveResult = moveToPlayer([{ name: t7Item, count: 5 }], sellLoc);
      if (!moveResult.success) return moveResult;
      const sellResult = sell([{ name: t7Item, count: 5 }], sellLoc);
      if (!sellResult.success) return sellResult;
    }
    return { success: true };
  };
  
  // Trade a region's T6→T7 sets. With region-based T6 names, trades that share
  // the same "[Level 6] {Region} → [Level 7] {Region}" barter must be spread one
  // per T7 trader - a port only accepts one 5x set of a given barter line.
  const tradeRegionT6toT7 = (regionTrades, t7Traders, regionKey) => {
    const groups = new Map();
    for (const tradeData of regionTrades) {
      const t6Item = t6Name(tradeData);
      if (!groups.has(t6Item)) groups.set(t6Item, []);
      groups.get(t6Item).push(tradeData);
    }
    for (const [t6Item, tradesGroup] of groups) {
      if (tradesGroup.length > t7Traders.length) {
        return fail(`Not enough T7 traders to run ${tradesGroup.length} identical ${t6Item} barters in ${regionKey}`);
      }
      for (let i = 0; i < tradesGroup.length; i++) {
        const t7Loc = tradesGroup[i].t7Port || t7Traders[i];
        goTo(t7Loc);
        const tradeResult = trade(t6Item, t7Name(tradesGroup[i]), 5, t7Loc, regionKey);
        if (!tradeResult.success) return tradeResult;
      }
    }
    return { success: true };
  };
  
  // Process a region's full chain (used for the Ilya stock region).
  // source === 't5' means the region uses Iliya stock (T5 loaded directly).
  // source === 't4' means T4 must be loaded at Iliya and traded up through T5.
  const processRegionChain = (region, source) => {
    const regionTrades = trades.filter(t => t.region.toLowerCase() === region);
    if (regionTrades.length === 0) return { success: true };
    
    const regionKey = region.charAt(0).toUpperCase() + region.slice(1);
    const islands = t5Orders[region] || [];
    const t6Traders = t6Orders[region] || [];
    const t7Traders = t7Orders[region] || [];
    const t7TradeLoc = t7Traders[0];
    const t7SellLoc = t7Traders[t7Traders.length - 1];
    
    if (!t7TradeLoc || !t7SellLoc) {
      return fail(`No T7 traders configured for ${regionKey}`);
    }
    
    // Small-ship support: split a region into per-trade mini-chains when the
    // combined T6 output exceeds the ship capacity.
    const regionT6Weight = regionTrades.length * 5 * 2000;
    if (regionT6Weight > shipCapacity) {
      for (let i = 0; i < regionTrades.length; i++) {
        const tradeData = regionTrades[i];
        const island = tradeData.island;
        const trader = findTrader(tradeData, t6Traders);
        if (source === 't4' && !island) {
          return fail(`No T5 island configured for ${regionKey} trade ${i + 1}`);
        }
        if (!trader) {
          return fail(`No T6 trader configured for ${regionKey} trade ${i + 1}`);
        }
        
        goTo("Iliya Island");
        if (source === 't5') {
          const loadResult = loadShip([{ name: tradeData.t5, count: 5 }], "Iliya Island");
          if (!loadResult.success) return loadResult;
        } else {
          const loadResult = loadShip([{ name: tradeData.t4, count: 5 }], "Iliya Island");
          if (!loadResult.success) return loadResult;
        }
        
        if (source === 't4') {
          goTo(island);
          const barterResult = trade(tradeData.t4, tradeData.t5, 5, island, regionKey);
          if (!barterResult.success) return barterResult;
        }
        
        const t6Item = t6Name(tradeData);
        goTo(trader);
        const t5t6Result = trade(tradeData.t5, t6Item, 5, trader, regionKey);
        if (!t5t6Result.success) return t5t6Result;
        
        const t7Item = t7Name(tradeData);
        const t7Loc = tradeData.t7Port || t7Traders[i];
        if (!t7Loc) {
          return fail(`No T7 trader for ${regionKey} trade ${i + 1}`);
        }
        goTo(t7Loc);
        const t6t7Result = trade(t6Item, t7Item, 5, t7Loc, regionKey);
        if (!t6t7Result.success) return t6t7Result;
        
        const sellResult = sellT7s([tradeData], regionKey, t7SellLoc);
        if (!sellResult.success) return sellResult;
      }
      return { success: true };
    }
    
    if (source === 't5') {
      const loadResult = loadShip(regionTrades.map(t => ({ name: t.t5, count: 5 })), "Iliya Island");
      if (!loadResult.success) return loadResult;
    } else {
      const loadResult = loadShip(regionTrades.map(t => ({ name: t.t4, count: 5 })), "Iliya Island");
      if (!loadResult.success) return loadResult;
    }
    
    if (source === 't4') {
      for (const island of islands) {
        const tradeData = findTradeByIsland(regionTrades, island);
        if (!tradeData) {
          return fail(`No T5 island configured for ${regionKey} (${island})`);
        }
        goTo(island);
        const tradeResult = trade(tradeData.t4, tradeData.t5, 5, island, regionKey);
        if (!tradeResult.success) return tradeResult;
      }
    }
    
    for (const trader of t6Traders) {
      const key = nameKey(trader);
      const tradeData = regionTrades.find(t => nameKey(traderOf(t)) === key);
      if (!tradeData) {
        return fail(`No trade configured for ${regionKey} T6 trader ${trader}`);
      }
      goTo(trader);
      const tradeResult = trade(tradeData.t5, t6Name(tradeData), 5, trader, regionKey);
      if (!tradeResult.success) return tradeResult;
    }
    
    const t6t7Result = tradeRegionT6toT7(regionTrades, t7Traders, regionKey);
    if (!t6t7Result.success) return t6t7Result;
    
    return sellT7s(regionTrades, regionKey, t7SellLoc);
  };
  
  // Re-barter a stocked region's T4→T5 at its islands and return the produced
  // T5s to Iliya storage, keeping Ilya stock zero-sum (per plan.md).
  const restockRegion = (region) => {
    const regionTrades = trades.filter(t => t.region.toLowerCase() === region);
    if (regionTrades.length === 0) return { success: true };
    
    const regionKey = region.charAt(0).toUpperCase() + region.slice(1);
    const islands = t5Orders[region] || [];
    
    goTo("Iliya Island");
    const loadResult = loadShip(regionTrades.map(t => ({ name: t.t4, count: 5 })), "Iliya Island");
    if (!loadResult.success) return loadResult;
    
    for (const island of islands) {
      const tradeData = findTradeByIsland(regionTrades, island);
      if (!tradeData) {
        return fail(`No T5 island configured for ${regionKey} (${island})`);
      }
      goTo(island);
      const tradeResult = trade(tradeData.t4, tradeData.t5, 5, island, regionKey);
      if (!tradeResult.success) return tradeResult;
    }
    
    goTo("Iliya Island");
    const storeResult = storeIlya(regionTrades.map(t => ({ name: t.t5, count: 5 })), "Iliya Island");
    if (!storeResult.success) return storeResult;
    
    return { success: true };
  };
  
  // Retrieve a region's T5s from the player back to the ship, and offload other
  // regions' T5s to the player so this region's T6 output (n × 5 × 2000lt) fits
  // alongside at most maxOtherOnShip other T5s. Shared by the plain batched
  // region flow and the overstack handoff.
  const prepareRegionChain = (region, regionTrades, regionKey, t6Traders) => {
    const rT5Names = new Set(regionTrades.map(t => t.t5));
    
    const toRetrieve = Object.entries(playerItems)
      .filter(([name, count]) => rT5Names.has(name) && count > 0)
      .map(([name, count]) => ({ name, count }));
    
    if (toRetrieve.length > 0) {
      const loc = t6Traders[0];
      goTo(loc);
      const retrieveResult = moveToShip(toRetrieve, loc);
      if (!retrieveResult.success) return retrieveResult;
    }
    
    const rT6Weight = regionTrades.length * 5 * 2000;
    const maxOtherOnShip = Math.max(0, Math.floor((shipCapacity - rT6Weight) / 1000));
    
    const otherOnShip = Object.entries(shipItems)
      .filter(([name, count]) => !rT5Names.has(name) && tierMap[name] === 5 && count > 0);
    
    const otherCount = otherOnShip.reduce((sum, [, count]) => sum + count, 0);
    if (otherCount > maxOtherOnShip) {
      const toMove = otherCount - maxOtherOnShip;
      const moves = [];
      let remaining = toMove;
      for (const [name, count] of otherOnShip) {
        if (remaining <= 0) break;
        const take = Math.min(count, remaining);
        moves.push({ name, count: take });
        remaining -= take;
      }
      if (remaining > 0) {
        return fail(`Cannot batch ${regionKey}: cannot offload enough other-region T5 items`);
      }
      const loc = t6Traders[0];
      goTo(loc);
      const moveResult = moveToPlayer(moves, loc);
      if (!moveResult.success) return moveResult;
    }
    return { success: true };
  };
  
  // Run a region's T5→T6 → T6→T7 → sell chain with the ship already holding the
  // region's T5s (used by processBatchedRegions and the overstack handoff).
  const runRegionChain = (region, regionTrades, regionKey, t6Traders, t7Traders) => {
    for (const trader of t6Traders) {
      const key = nameKey(trader);
      const tradeData = regionTrades.find(t => nameKey(traderOf(t)) === key);
      if (!tradeData) {
        return fail(`No trade configured for ${regionKey} T6 trader ${trader}`);
      }
      goTo(trader);
      const tradeResult = trade(tradeData.t5, t6Name(tradeData), 5, trader, regionKey);
      if (!tradeResult.success) return tradeResult;
    }
    
    const t6t7Result = tradeRegionT6toT7(regionTrades, t7Traders, regionKey);
    if (!t6t7Result.success) return t6t7Result;
    
    return sellT7s(regionTrades, regionKey, t7Traders[t7Traders.length - 1]);
  };
  
  // Process a batch of regions sharing one ship load. For each region in
  // order: retrieve its T5s from the player, offload other regions' T5s to the
  // player so this region's T6 output fits the ship, then run the region's
  // T5→T6 → T6→T7 → sell chain.
  const processBatchedRegions = (regions, batchedTrades) => {
    for (const region of regions) {
      const regionTrades = batchedTrades.filter(t => t.region.toLowerCase() === region);
      if (regionTrades.length === 0) continue;
      
      const regionKey = region.charAt(0).toUpperCase() + region.slice(1);
      const t6Traders = t6Orders[region] || [];
      const t7Traders = t7Orders[region] || [];
      const t7TradeLoc = t7Traders[0];
      const t7SellLoc = t7Traders[t7Traders.length - 1];
      
      if (!t7TradeLoc || !t7SellLoc) {
        return fail(`No T7 traders configured for ${regionKey}`);
      }
      
      const prep = prepareRegionChain(region, regionTrades, regionKey, t6Traders);
      if (!prep.success) return prep;
      
      const chainResult = runRegionChain(region, regionTrades, regionKey, t6Traders, t7Traders);
      if (!chainResult.success) return chainResult;
    }
    return { success: true };
  };
  
  // Combined Iliya-overstack handoff. When region A is the last region of a
  // non-stock batch group and another batch group B follows, detour to Iliya
  // after A's T5→T6: overstack A's last T6 stack into the player (only one T6
  // stack fits the player; with a single trade the T6 stays on the ship), load
  // B's T4s into the freed space, then run A's T6→T7 + sell interleaved with
  // B's island T4→T5 sweep. This avoids a separate return trip to Iliya to load
  // B's T4s.
  const processOverstackHandoff = (A, A_trades, B_regions, B_trades) => {
    const regionKey = A.charAt(0).toUpperCase() + A.slice(1);
    const t6Traders = t6Orders[A] || [];
    const t7Traders = t7Orders[A] || [];
    if (t6Traders.length === 0 || t7Traders.length === 0) return fail(`No traders for ${regionKey}`);
    if (A_trades.length < 1) return fail(`Overstack handoff for ${regionKey} needs at least one trade`);
    
    // The player can overstack a single T6 stack (1000lt below the threshold is
    // still accepted). With ≥2 trades, move the last one to the player to free
    // space for B's T4s; with a single trade the T6 stays on the ship.
    const overstacked = A_trades.length >= 2 ? 1 : 0;
    const bT4Weight = B_trades.length * 5 * 1000;
    if ((A_trades.length - overstacked) * 10000 + bT4Weight > shipCapacity) {
      return fail(`Overstack handoff for ${regionKey}: ship can't hold B T4s alongside the remaining T6s`);
    }
    
    const prep = prepareRegionChain(A, A_trades, regionKey, t6Traders);
    if (!prep.success) return prep;
    // The player must be empty after retrieving A's T5s so it can accept the
    // overstacked T6 stack.
    if (overstacked > 0 && playerWeight() !== 0) return fail(`Overstack handoff for ${regionKey}: player inventory not empty`);
    
    for (const trader of t6Traders) {
      const key = nameKey(trader);
      const tradeData = A_trades.find(t => nameKey(traderOf(t)) === key);
      if (!tradeData) return fail(`No trade configured for ${regionKey} T6 trader ${trader}`);
      goTo(trader);
      const tradeResult = trade(tradeData.t5, t6Name(tradeData), 5, trader, regionKey);
      if (!tradeResult.success) return tradeResult;
    }
    
    // Detour to Iliya: overstack A's last T6 (if any), load B's T4s.
    const lastA = overstacked > 0 ? A_trades[A_trades.length - 1] : null;
    const lastT6 = lastA ? t6Name(lastA) : null;
    const onBoatA = lastA ? A_trades.filter(t => t6Name(t) !== lastT6) : A_trades;
    goTo("Iliya Island");
    if (lastA) {
      const overResult = moveToPlayer([{ name: lastT6, count: 5 }], "Iliya Island");
      if (!overResult.success) return overResult;
    }
    const loadResult = loadShip(B_trades.map(t => ({ name: t.t4, count: 5 })), "Iliya Island");
    if (!loadResult.success) return loadResult;
    
    // Barter A's on-boat T6s at their ports and sell each.
    for (let i = 0; i < onBoatA.length; i++) {
      const tradeData = onBoatA[i];
      const loc = tradeData.t7Port || t7Traders[i];
      goTo(loc);
      const t6Item = t6Name(tradeData);
      const barterResult = trade(t6Item, t7Name(tradeData), 5, loc, regionKey);
      if (!barterResult.success) return barterResult;
      const sellResult = sellShip([{ name: t7Name(tradeData), count: 5 }], loc);
      if (!sellResult.success) return sellResult;
    }
    
    // Sweep B's islands (T4→T5) while travelling toward A's last T7 port.
    const bSweep = [];
    for (const region of B_regions) {
      const regionTrades = B_trades.filter(t => t.region.toLowerCase() === region);
      for (const tradeData of regionTrades) {
        bSweep.push({ island: tradeData.island, t4: tradeData.t4, t5: tradeData.t5, regionKey: region.charAt(0).toUpperCase() + region.slice(1) });
      }
    }
    const sweepResult = sweepIslands(bSweep);
    if (!sweepResult.success) return sweepResult;
    
    // Barter the overstacked A T6 (if any) at its port and sell.
    if (lastA) {
      const lastLoc = lastA.t7Port || t7Traders[onBoatA.length];
      goTo(lastLoc);
      const backResult = moveToShip([{ name: lastT6, count: 5 }], lastLoc);
      if (!backResult.success) return backResult;
      const barterResult = trade(lastT6, t7Name(lastA), 5, lastLoc, regionKey);
      if (!barterResult.success) return barterResult;
      const sellResult = sellShip([{ name: t7Name(lastA), count: 5 }], lastLoc);
      if (!sellResult.success) return sellResult;
    }
    
    return { success: true };
  };
  
  // Visit a list of { island, t4, t5, regionKey } barter stops in nearest-neighbor
  // order from the current location, then barter each T4→T5. Straight-line
  // distance is a rough proxy, but the T6 travel order is fixed by T6_ORDER so
  // this only reorders the T5 island sweep.
  const sweepIslands = (items) => {
    const remaining = items.slice();
    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestD = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = getDistance(currentLocation, remaining[i].island, ports);
        if (d < bestD) { bestD = d; bestIdx = i; }
      }
      const item = remaining.splice(bestIdx, 1)[0];
      if (!item.island) {
        return fail(`No T5 island configured for ${item.regionKey} trade`);
      }
      goTo(item.island);
      const tradeResult = trade(item.t4, item.t5, 5, item.island, item.regionKey);
      if (!tradeResult.success) return tradeResult;
    }
    return { success: true };
  };
  
  // Regions using Ilya T5 stock (pre-loaded, then restocked to keep zero-sum)
  const stockRegions = config.stockRegions || (config.allStock ? chainOrder.slice() : (ilyaStockRegion ? [ilyaStockRegion] : []));
  const nonStockRegions = chainOrder.filter(r => !stockRegions.includes(r));
  
  // Route starts at Iliya Island
  goTo("Iliya Island");
  
  // Process stock regions first (pre-loaded T5 chains, batched when feasible)
  if (stockRegions.length > 0) {
    const stockTrades = trades.filter(t => stockRegions.includes(t.region.toLowerCase()));
    let batchedOk = false;
    if (stockTrades.length > 0) {
      const loadResult = loadShip(stockTrades.map(t => ({ name: t.t5, count: 5 })), "Iliya Island");
      if (loadResult.success) {
        const batchResult = processBatchedRegions(stockRegions, stockTrades);
        if (batchResult.success) {
          batchedOk = true;
        }
      }
    }
    if (!batchedOk) {
      for (const region of stockRegions) {
        goTo("Iliya Island");
        const result = processRegionChain(region, 't5');
        if (!result.success) return result;
      }
    }
  }
  
  // Combined single-stock sweep (reference-style): with exactly one stocked
  // region, carry its restock T4s in the player while bartering the non-stock
  // islands, then swap the restock T4s onto the ship (exchanging an equal weight
  // of non-stock T5s to the player) so the restock islands are visited in the
  // same trip. This avoids a separate Ilya round-trip for restocking.
  let combinedEnd = null;      // snapshot of the end state if the combined sweep succeeded
  let combinedDist = Infinity;
  
  if (stockRegions.length === 1 && nonStockRegions.length > 0) {
    const sRegion = stockRegions[0];
    const sTrades = trades.filter(t => t.region.toLowerCase() === sRegion);
    const sIslands = t5Orders[sRegion] || [];
    const nonStockTrades = trades.filter(t => nonStockRegions.includes(t.region.toLowerCase()));
    // Swap the FIRST non-stock region's T5s into the player. processBatchedRegions
    // processes that region first, retrieving its T5s from the player (freeing the
    // player) before any selling happens.
    const swapTargetRegion = nonStockRegions[0];
    const swapTargetT5Names = new Set(trades.filter(t => t.region.toLowerCase() === swapTargetRegion).map(t => t.t5));
    
    const combinedFlow = () => {
      goTo("Iliya Island");
      const loadResult = loadShip(nonStockTrades.map(t => ({ name: t.t4, count: 5 })), "Iliya Island");
      if (!loadResult.success) return loadResult;
      // Carry the stock region's restock T4s in the player (from Ilya)
      const loadPlayerResult = loadPlayer(sTrades.map(t => ({ name: t.t4, count: 5 })), "Iliya Island");
      if (!loadPlayerResult.success) return loadPlayerResult;
      
      // Non-stock island sweep (nearest-first)
      const sweepItems = [];
      for (const region of nonStockRegions) {
        const regionTrades = nonStockTrades.filter(t => t.region.toLowerCase() === region);
        const islands = t5Orders[region] || [];
        for (const tradeData of regionTrades) {
          sweepItems.push({ island: tradeData.island, t4: tradeData.t4, t5: tradeData.t5, regionKey: region.charAt(0).toUpperCase() + region.slice(1) });
        }
      }
      const sweepResult = sweepIslands(sweepItems);
      if (!sweepResult.success) return sweepResult;
      
      // Swap: move S restock T4s to the ship, exchanging an equal weight of
      // non-stock T5s (preferring the first region) to the player.
      const sT4Items = sTrades.map(t => ({ name: t.t4, count: 5 }));
      const sT4Weight = sT4Items.reduce((sum, i) => sum + i.count * 1000, 0);
      const t5OnShip = Object.entries(shipItems)
        .filter(([name, count]) => tierMap[name] === 5 && count > 0 && !sTrades.some(t => t.t5 === name));
      const orderedT5 = [
        ...t5OnShip.filter(([name]) => swapTargetT5Names.has(name)),
        ...t5OnShip.filter(([name]) => !swapTargetT5Names.has(name))
      ];
      const swapOutItems = [];
      let outWeight = 0;
      for (const [name, count] of orderedT5) {
        if (outWeight >= sT4Weight) break;
        const take = Math.min(count, Math.ceil((sT4Weight - outWeight) / 1000));
        swapOutItems.push({ name, count: take });
        outWeight += take * 1000;
      }
      if (outWeight < sT4Weight) {
        return fail(`Cannot sweep ${sRegion}: not enough non-stock T5s to swap for restock T4s`);
      }
      const swapResult = swapShipPlayer(sT4Items, swapOutItems, currentLocation);
      if (!swapResult.success) return swapResult;
      
      // S restock islands (nearest-first)
      const sSweepItems = sTrades.map(t => ({
        island: t.island, t4: t.t4, t5: t.t5, regionKey: sRegion.charAt(0).toUpperCase() + sRegion.slice(1)
      }));
      const sSweepResult = sweepIslands(sSweepItems);
      if (!sSweepResult.success) return sSweepResult;
      
      // Store S restock T5s at the CLOSER of Epheria/Ilya to free the ship for
      // the chains; if stored at Epheria they are returned to Ilya at the end.
      const restockT5s = sTrades.map(t => ({ name: t.t5, count: 5 }));
      const dEph = getDistance(currentLocation, "Epheria Sentry Post", ports);
      const dIlya = getDistance(currentLocation, "Iliya Island", ports);
      const restockStoreLoc = dEph <= dIlya ? "Epheria Sentry Post" : "Iliya Island";
      const restockStoreAction = restockStoreLoc === "Epheria Sentry Post" ? "store_epheria" : "store_ilya";
      goTo(restockStoreLoc);
      const storeResult = storeToStorage(restockT5s, restockStoreLoc, restockStoreAction);
      if (!storeResult.success) return storeResult;
      
      // Non-stock chains (processBatchedRegions handles T5s split ship/player)
      const batchResult = processBatchedRegions(nonStockRegions, nonStockTrades);
      if (!batchResult.success) return batchResult;
      
      // Return restock T5s to Ilya if they were temporarily stored at Epheria.
      // The retrieve happens at the current location (storage is a single pool).
      if (restockStoreLoc === "Epheria Sentry Post") {
        const retrieveResult = retrieveFromStorage(restockT5s, currentLocation, "retrieve_epheria");
        if (!retrieveResult.success) return retrieveResult;
        goTo("Iliya Island");
        const finalStoreResult = storeIlya(restockT5s, "Iliya Island");
        if (!finalStoreResult.success) return finalStoreResult;
      }
      
      return { success: true };
    };
    
    // Snapshot the state after the stock chains, try the combined sweep, then
    // restore so the non-combined flow can also be built for comparison.
    const baseRoute = route.slice();
    const baseActions = actions.slice();
    const baseShip = { ...shipItems };
    const basePlayer = { ...playerItems };
    const baseStored = { ...storedItems };
    const baseLoc = currentLocation;
    
    const c = combinedFlow();
    if (c.success) {
      combinedEnd = {
        route: route.slice(), actions: actions.slice(),
        ship: { ...shipItems }, player: { ...playerItems }, stored: { ...storedItems }, loc: currentLocation
      };
      combinedDist = calculateRouteDistance(route, ports);
    }
    route.length = 0; route.push(...baseRoute);
    actions.length = 0; actions.push(...baseActions);
    Object.keys(shipItems).forEach(k => delete shipItems[k]); Object.assign(shipItems, baseShip);
    Object.keys(playerItems).forEach(k => delete playerItems[k]); Object.assign(playerItems, basePlayer);
    Object.keys(storedItems).forEach(k => delete storedItems[k]); Object.assign(storedItems, baseStored);
    currentLocation = baseLoc;
  }
  
  // Non-combined flow: non-stock regions (T4 → islands → chains, batched), with
  // the island sweep ordered nearest-first. If all the non-stock T4s don't fit
  // the ship at once, batch the largest capacity-fitting subsets (partialBatch)
  // so smaller ships still get some batching benefit. As the ship grows (e.g.
  // 30,000lt) more regions batch together automatically.
  if (nonStockRegions.length > 0) {
    // Partition non-stock regions into groups whose combined T4 weight fits the ship
    const groups = [];
    let current = [];
    let currentWeight = 0;
    for (const region of nonStockRegions) {
      const regionWeight = trades.filter(t => t.region.toLowerCase() === region).length * 5 * 1000;
      if (current.length > 0 && currentWeight + regionWeight > shipCapacity) {
        groups.push(current);
        current = [];
        currentWeight = 0;
      }
      current.push(region);
      currentWeight += regionWeight;
    }
    if (current.length > 0) groups.push(current);
    
    let handoffGroupIndex = -1;
    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi];
      const groupTrades = trades.filter(t => group.includes(t.region.toLowerCase()));
      
      // A previous group's overstack handoff already loaded this group's T4s and
      // swept its islands - just run the T5→T6 → T6→T7 → sell chains.
      if (gi === handoffGroupIndex) {
        const batchResult = processBatchedRegions(group, groupTrades);
        if (!batchResult.success) return batchResult;
        continue;
      }
      
      goTo("Iliya Island");
      const loadResult = loadShip(groupTrades.map(t => ({ name: t.t4, count: 5 })), "Iliya Island");
      if (!loadResult.success) return loadResult;
      
      // Build the island sweep list (region by region, but visited nearest-first)
      const sweepItems = [];
      for (const region of group) {
        const regionTrades = groupTrades.filter(t => t.region.toLowerCase() === region);
        for (const tradeData of regionTrades) {
          sweepItems.push({
            island: tradeData.island,
            t4: tradeData.t4,
            t5: tradeData.t5,
            regionKey: region.charAt(0).toUpperCase() + region.slice(1)
          });
        }
      }
      const sweepResult = sweepIslands(sweepItems);
      if (!sweepResult.success) return sweepResult;
      
      // If the next group exists, try the overstack handoff for this group's
      // last region (interleaves its T6→T7 with the next group's load, skipping
      // a return trip to Iliya). It stays an option: fall back to the plain
      // flow when it's infeasible, and the caller picks the shortest route.
      const nextGroup = groups[gi + 1];
      const lastRegion = group[group.length - 1];
      const lastRegionTrades = groupTrades.filter(t => t.region.toLowerCase() === lastRegion);
      const nextGroupTrades = nextGroup ? trades.filter(t => nextGroup.includes(t.region.toLowerCase())) : null;
      
      if (nextGroup && nextGroupTrades && lastRegionTrades.length >= 1) {
        const baseRoute = route.slice();
        const baseActions = actions.slice();
        const baseShip = { ...shipItems };
        const basePlayer = { ...playerItems };
        const baseLoc = currentLocation;
        
        let handoffOk = false;
        const prepResult = processBatchedRegions(group.slice(0, -1), groupTrades);
        if (prepResult.success) {
          const hf = processOverstackHandoff(lastRegion, lastRegionTrades, nextGroup, nextGroupTrades);
          handoffOk = hf.success;
        }
        if (handoffOk) {
          handoffGroupIndex = gi + 1;
          continue;
        }
        
        // Restore state and use the plain flow for the whole group.
        route.length = 0; route.push(...baseRoute);
        actions.length = 0; actions.push(...baseActions);
        Object.keys(shipItems).forEach(k => delete shipItems[k]); Object.assign(shipItems, baseShip);
        Object.keys(playerItems).forEach(k => delete playerItems[k]); Object.assign(playerItems, basePlayer);
        currentLocation = baseLoc;
        
        const batchResult = processBatchedRegions(group, groupTrades);
        if (!batchResult.success) return batchResult;
      } else {
        // Process each region's T5→T6 → T6→T7 → sell
        const batchResult = processBatchedRegions(group, groupTrades);
        if (!batchResult.success) return batchResult;
      }
    }
  }
  
  // Restock every stocked region so Ilya stock stays zero-sum
  for (const region of stockRegions) {
    const restockResult = restockRegion(region);
    if (!restockResult.success) return restockResult;
  }
  
  // If the combined single-stock sweep produced a shorter route, use it.
  if (combinedEnd && combinedDist < calculateRouteDistance(route, ports)) {
    route.length = 0; route.push(...combinedEnd.route);
    actions.length = 0; actions.push(...combinedEnd.actions);
    Object.keys(shipItems).forEach(k => delete shipItems[k]); Object.assign(shipItems, combinedEnd.ship);
    Object.keys(playerItems).forEach(k => delete playerItems[k]); Object.assign(playerItems, combinedEnd.player);
    Object.keys(storedItems).forEach(k => delete storedItems[k]); Object.assign(storedItems, combinedEnd.stored || {});
    currentLocation = combinedEnd.loc;
  }
  
  return { route, actions, feasible: true };
}


// Apply one action to the Simulator; returns true on success.
// Mirrors the planner's action handling so the 2-opt can replay candidates.
function applyActionToSimulator(sim, a) {
  const loc = a.location;
  try {
    if (a.action === 'load_ship') {
      for (const i of a.items) if (!sim.ship.add(i.name, i.count)) return false;
    } else if (a.action === 'load_player') {
      for (const i of a.items) if (!sim.player.add(i.name, i.count)) return false;
    } else if (a.action === 'trade') {
      const r = sim.trade(a.input, a.output, a.count, loc);
      if (!r.success) return false;
    } else if (a.action === 'move_to_player') {
      for (const i of a.items) if (!(sim.ship.remove(i.name, i.count) && sim.player.add(i.name, i.count))) return false;
    } else if (a.action === 'move_to_ship') {
      for (const i of a.items) if (!(sim.player.remove(i.name, i.count) && sim.ship.add(i.name, i.count))) return false;
    } else if (a.action === 'sell') {
      for (const i of a.items) if (!sim.player.remove(i.name, i.count)) return false;
    } else if (a.action === 'swap') {
      const shipToPlayer = a.shipToPlayer || [];
      const playerToShip = a.playerToShip || [];
      for (const i of shipToPlayer) if (!sim.ship.remove(i.name, i.count)) return false;
      for (const i of playerToShip) if (!sim.player.remove(i.name, i.count)) return false;
      for (const i of playerToShip) if (!sim.ship.add(i.name, i.count)) return false;
      for (const i of shipToPlayer) if (!sim.player.add(i.name, i.count)) return false;
    } else if (a.action === 'store_ilya' || a.action === 'store_epheria') {
      for (const i of a.items) {
        if (!sim.ship.remove(i.name, i.count)) return false;
        sim.storage.add(i.name, i.count);
      }
    } else if (a.action === 'retrieve_epheria') {
      for (const i of a.items) {
        if (!sim.storage.remove(i.name, i.count)) return false;
        if (!sim.ship.add(i.name, i.count)) return false;
      }
    }
    return true;
  } catch (e) {
    return false;
  }
}

// 2-opt refinement over the stop sequence, keeping each stop's actions intact.
// Every candidate reorder is replayed through the Simulator, so only valid,
// shorter reorders are accepted. A few bounded passes explore orderings the
// hand-coded builders don't produce.
function refineRoute(route, actions, trades, shipCapacity, characterBaseWeight, characterUsedWeight, ports) {
  const tierMap = {};
  trades.forEach(t => {
    tierMap[t.t4] = 4;
    tierMap[t.t5] = 5;
    tierMap[t6Name(t)] = 6;
    tierMap[t7Name(t)] = 7;
  });
  
  // Group actions into stops (consecutive same-location runs)
  const stops = [];
  for (const a of actions) {
    if (stops.length > 0 && stops[stops.length - 1].location === a.location) {
      stops[stops.length - 1].actions.push(a);
    } else {
      stops.push({ location: a.location, actions: [a] });
    }
  }
  
  const replayValid = (candidateStops) => {
    const sim = new Simulator(shipCapacity, characterBaseWeight, 1000000, 11000, characterUsedWeight);
    sim.setTierMap(tierMap);
    for (const stop of candidateStops) {
      for (const a of stop.actions) {
        if (!applyActionToSimulator(sim, a)) return false;
      }
    }
    return true;
  };

  // The fixed T6 sailing orders (Hakoven→Arehaza East, Grándiha→Starry South)
  // are hard constraints - a 2-opt reorder must never put them out of sequence.
  const preservesT6Order = (candidateStops) => {
    for (const traders of Object.values(T6_ORDER)) {
      const seen = [];
      for (const stop of candidateStops) {
        const idx = traders.findIndex(t => nameKey(t) === nameKey(stop.location));
        if (idx !== -1) seen.push(idx);
      }
      for (let k = 1; k < seen.length; k++) {
        if (seen[k] < seen[k - 1]) return false;
      }
    }
    return true;
  };
  
  const routeDistance = (candidateStops) => {
    let d = 0;
    for (let i = 0; i < candidateStops.length - 1; i++) {
      d += getDistance(candidateStops[i].location, candidateStops[i + 1].location, ports);
    }
    return d;
  };
  
  let current = stops;
  let currentDist = routeDistance(current);
  
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (let i = 1; i < current.length; i++) {   // keep the first stop fixed (route start)
      for (let j = i + 1; j < current.length; j++) {
        const candidate = current.slice(0, i)
          .concat(current.slice(i, j + 1).reverse())
          .concat(current.slice(j + 1));
        if (!replayValid(candidate) || !preservesT6Order(candidate)) continue;
        const d = routeDistance(candidate);
        if (d < currentDist) {
          current = candidate;
          currentDist = d;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  
  if (currentDist >= routeDistance(stops)) {
    return { route, actions };
  }
  
  const newRoute = [];
  for (const stop of current) {
    if (newRoute[newRoute.length - 1] !== stop.location) {
      newRoute.push(stop.location);
    }
  }
  return { route: newRoute, actions: current.flatMap(s => s.actions) };
}

export async function optimizeRoute(trades, regionMapping, ilyaStock, shipCapacity = 22450, characterBaseWeight = 5400, characterUsedWeight = 150, allowJuggling = false, allStock = false) {
  const ports = await loadBarterPorts();
  
  const configs = generateAllConfigs(trades, ilyaStock, regionMapping, allStock);
  
  let bestConfig = null;
  let bestDistance = Infinity;
  let bestRoute = null;
  let bestActions = null;
  let bestStructure = null;
  
  const consider = (result, config, structure) => {
    // Skip invalid configurations (weight validation failed)
    if (result.error || !result.feasible) {
      return;
    }
    
    const { route, actions } = result;
    const distance = calculateRouteDistance(route, ports);
    
    if (distance < bestDistance) {
      bestDistance = distance;
      bestConfig = config;
      bestRoute = route;
      bestActions = actions;
      bestStructure = structure;
    }
  };
  
  for (const config of configs) {
    // Inventory weight juggling (batched overstacking / combined sweep) when enabled
    if (allowJuggling) {
      consider(buildJugglingRoute(config, trades, regionMapping, shipCapacity, characterBaseWeight, characterUsedWeight, ports), config, 'juggled');
    }
    
    // Region-by-region fallback (works on the smallest ships, incl. split chains)
    consider(buildOptimizedRoute(config, trades, regionMapping, shipCapacity, characterBaseWeight, characterUsedWeight, ports), config, 'perRegion');
  }
  
  // If no valid route found, explain why
  if (!bestRoute) {
    const maxRegionT6 = trades.reduce((mx, t) => {
      const cnt = trades.filter(x => x.region === t.region).length;
      return Math.max(mx, cnt * 5 * 2000);
    }, 0);
    const playerThreshold = (characterBaseWeight * 1.7) - characterUsedWeight;
    let reason = `No feasible route found with ship capacity ${shipCapacity}lt and player threshold ${Math.round(playerThreshold)}lt.`;
    if (shipCapacity < maxRegionT6) {
      reason += ` Ship is below the ${maxRegionT6}lt needed to carry a region's T6 output (regions can be split into per-trade chains down to 10,000lt).`;
    } else if (playerThreshold <= 0) {
      reason += ` Player threshold (${Math.round(playerThreshold)}lt) is too small to carry any item.`;
    }
    return {
      error: reason,
      route: null,
      actions: null,
      distance: null,
      config: null,
      structure: null
    };
  }
  
  // Refine the best route with a validity-checked 2-opt pass
  const refined = refineRoute(bestRoute, bestActions, trades, shipCapacity, characterBaseWeight, characterUsedWeight, ports);
  
  return {
    route: refined.route,
    actions: refined.actions,
    distance: refined.route ? calculateRouteDistance(refined.route, ports) : bestDistance,
    config: bestConfig,
    structure: bestStructure
  };
}
