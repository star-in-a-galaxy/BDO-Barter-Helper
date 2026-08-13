import { getCatalog } from './catalog.js';
import { optimizeRoute, t6Name, t7Name } from './optimizer.js';
import { generateWalkthrough } from './walkthrough.js';
import { Simulator } from './simulator.js';

export async function planRoute(payload) {
  const trades = payload.trades || [];
  const regionMapping = payload.region_mapping || { north: "A", south: "B", east: "C" };
  // ilya_stock: true means T5 stock is assumed available for ALL regions;
  // an object (e.g. { east: true }) still works for per-region stock.
  // A plain `false` (or missing value) means no T5 stock — do NOT fall back
  // to a default here, otherwise an unticked checkbox would re-enable stock.
  const ilyaStock = payload.ilya_stock === undefined || payload.ilya_stock === null ? false : payload.ilya_stock;
  const allStock = ilyaStock === true;
  const config = payload.config || {
    base_parley: 1000000,
    parley_per_trade: 11000,
    ship_weight: 22450,
    char_weight: 5500,
    char_used_weight: 150,
    juggling: false
  };
  
  const catalog = await getCatalog();
  
  const optimizationResult = await optimizeRoute(
    trades, 
    regionMapping, 
    ilyaStock, 
    config.ship_weight,
    config.char_weight,
    config.char_used_weight || 150,
    config.juggling === true,
    allStock
  );
  
  // Handle optimization errors (e.g., ship capacity too small)
  if (optimizationResult.error) {
    throw new Error(optimizationResult.error);
  }
  
  const { route, actions, distance } = optimizationResult;
  
  const sim = new Simulator(
    config.ship_weight,
    config.char_weight,
    config.base_parley,
    config.parley_per_trade,
    config.char_used_weight || 150
  );
  
  const tierMap = {};
  trades.forEach(trade => {
    tierMap[trade.t4] = 4;
    tierMap[trade.t5] = 5;
    tierMap[t6Name(trade)] = 6;
    tierMap[t7Name(trade)] = 7;
  });
  sim.setTierMap(tierMap);
  
  // Validate actions against simulator
  const validatedActions = [];
  const errors = [];
  
  for (const action of actions) {
    const act = action.action;
    let valid = true;
    
    // Old action types (from old route builders)
    if (act === 'load_east_stock' || act === 'load_all_t4' || act === 'load_t4_for_region') {
      const items = action.items || [];
      for (const item of items) {
        if (!sim.ship.add(item, 5)) {
          errors.push(`Cannot load 5x ${item} at ${action.location}: insufficient ship capacity`);
          valid = false;
        }
      }
    }
    else if (act === 'load_t4_and_player_items') {
      const boatItems = action.t4Items || [];
      const playerItems = action.playerItems || [];
      for (const item of boatItems) {
        if (!sim.ship.add(item, 5)) {
          errors.push(`Cannot load 5x ${item} to boat at ${action.location}: insufficient ship capacity`);
          valid = false;
        }
      }
      for (const item of playerItems) {
        if (!sim.player.add(item, 5)) {
          errors.push(`Cannot load 5x ${item} to player at ${action.location}: insufficient player capacity`);
          valid = false;
        }
      }
    }
    
    // New action types (from buildOptimizedRoute)
    else if (act === 'load_ship') {
      const items = action.items || [];
      for (const item of items) {
        if (!sim.ship.add(item.name, item.count)) {
          errors.push(`Cannot load ${item.count}x ${item.name} at ${action.location}: insufficient ship capacity`);
          valid = false;
        }
      }
    }
    else if (act === 'load_player') {
      const items = action.items || [];
      for (const item of items) {
        if (!sim.player.add(item.name, item.count)) {
          errors.push(`Cannot load ${item.count}x ${item.name} at ${action.location}: insufficient player capacity`);
          valid = false;
        }
      }
    }
    else if (act === 'trade') {
      const result = sim.trade(action.input, action.output, action.count || 5, action.location);
      if (!result.success) {
        errors.push(`Trade failed at ${action.location}: ${result.message}`);
        valid = false;
      }
    }
    else if (act === 'swap') {
      const playerToShip = action.playerToShip || [];
      const shipToPlayer = action.shipToPlayer || [];
      
      for (const item of shipToPlayer) {
        if (!sim.ship.remove(item.name, item.count)) {
          errors.push(`Cannot remove ${item.count}x ${item.name} from ship at ${action.location}`);
          valid = false;
        }
      }
      for (const item of playerToShip) {
        if (!sim.player.remove(item.name, item.count)) {
          errors.push(`Cannot remove ${item.count}x ${item.name} from player at ${action.location}`);
          valid = false;
        }
      }
      for (const item of playerToShip) {
        if (!sim.ship.add(item.name, item.count)) {
          errors.push(`Cannot add ${item.count}x ${item.name} to ship at ${action.location}`);
          valid = false;
        }
      }
      for (const item of shipToPlayer) {
        if (!sim.player.add(item.name, item.count)) {
          errors.push(`Cannot add ${item.count}x ${item.name} to player at ${action.location}`);
          valid = false;
        }
      }
    }
    else if (act === 'store_epheria' || act === 'store_ilya') {
      const items = action.items || [];
      for (const item of items) {
        if (!sim.ship.remove(item.name, item.count)) {
          errors.push(`Cannot store ${item.count}x ${item.name} at ${action.location}`);
          valid = false;
        }
        sim.storage.add(item.name, item.count);
      }
    }
    else if (act === 'retrieve_epheria') {
      const items = action.items || [];
      const target = action.target || 'ship';
      for (const item of items) {
        if (!sim.storage.remove(item.name, item.count)) {
          errors.push(`Cannot retrieve ${item.count}x ${item.name} from storage at ${action.location}`);
          valid = false;
        }
        if (target === 'ship') {
          if (!sim.ship.add(item.name, item.count)) {
            errors.push(`Cannot add ${item.count}x ${item.name} to ship at ${action.location}`);
            valid = false;
          }
        } else {
          if (!sim.player.add(item.name, item.count)) {
            errors.push(`Cannot add ${item.count}x ${item.name} to player at ${action.location}`);
            valid = false;
          }
        }
      }
    }
    else if (act === 'move_to_player') {
      const items = action.items || [];
      for (const item of items) {
        if (!sim.ship.remove(item.name, item.count)) {
          errors.push(`Cannot remove ${item.count}x ${item.name} from ship at ${action.location}`);
          valid = false;
        }
        if (!sim.player.add(item.name, item.count)) {
          errors.push(`Cannot add ${item.count}x ${item.name} to player at ${action.location}`);
          valid = false;
        }
      }
    }
    else if (act === 'move_to_ship') {
      const items = action.items || [];
      for (const item of items) {
        if (!sim.player.remove(item.name, item.count)) {
          errors.push(`Cannot remove ${item.count}x ${item.name} from player at ${action.location}`);
          valid = false;
        }
        if (!sim.ship.add(item.name, item.count)) {
          errors.push(`Cannot add ${item.count}x ${item.name} to ship at ${action.location}`);
          valid = false;
        }
      }
    }
    else if (act === 'sell') {
      const items = action.items || [];
      for (const item of items) {
        if (!sim.player.remove(item.name, item.count)) {
          errors.push(`Cannot sell ${item.count}x ${item.name} at ${action.location}`);
          valid = false;
        }
      }
    }
    
    // Old action types (keep for backward compatibility)
    else if (act === 'trade_t5_to_t6') {
      const items = action.items || [];
      for (const item of items) {
        const outputItem = item.replace('Level 5', 'Level 6').replace(/\[Level 5\]/, '[Level 6]');
        const result = sim.trade(item, outputItem, 5, action.location);
        if (!result.success) {
          errors.push(`Trade failed at ${action.location}: ${result.message}`);
          valid = false;
        }
      }
    }
    else if (act === 'trade_t4_to_t5') {
      const result = sim.trade(action.input, action.output, 5, action.location);
      if (!result.success) {
        errors.push(`Trade failed at ${action.location}: ${result.message}`);
        valid = false;
      }
    }
    else if (act === 'trade_t6_to_t7') {
      // T6→T7 trade: convert all T6 items in ship to T7
      const t6Items = Object.keys(sim.ship.items).filter(name => {
        const tier = sim.ship.tierMap[name];
        return tier === 6 && sim.ship.items[name] >= 5;
      });
      for (const item of t6Items) {
        const outputItem = item.replace('Level 6', 'Level 7').replace(/\[Level 6\]/, '[Level 7]');
        const result = sim.trade(item, outputItem, 5, action.location);
        if (!result.success) {
          errors.push(`Trade failed at ${action.location}: ${result.message}`);
          valid = false;
        }
      }
    }
    else if (act === 'sell_t7') {
      // Sell all T7 items in ship
      const t7Items = Object.keys(sim.ship.items).filter(name => {
        const tier = sim.ship.tierMap[name];
        return tier === 7;
      });
      for (const item of t7Items) {
        const count = sim.ship.items[item];
        if (!sim.ship.remove(item, count)) {
          errors.push(`Cannot sell ${count}x ${item} at ${action.location}`);
          valid = false;
        }
      }
    }
    else if (act === 'swap_ship_player') {
      const playerToShip = action.playerToShip || [];
      const shipToPlayer = action.shipToPlayer || [];
      
      for (const item of shipToPlayer) {
        if (!sim.ship.remove(item, 5)) {
          errors.push(`Cannot remove 5x ${item} from ship at ${action.location}`);
          valid = false;
        }
      }
      for (const item of playerToShip) {
        if (!sim.player.remove(item, 5)) {
          errors.push(`Cannot remove 5x ${item} from player at ${action.location}`);
          valid = false;
        }
      }
      for (const item of playerToShip) {
        if (!sim.ship.add(item, 5)) {
          errors.push(`Cannot add 5x ${item} to ship at ${action.location}`);
          valid = false;
        }
      }
      for (const item of shipToPlayer) {
        if (!sim.player.add(item, 5)) {
          errors.push(`Cannot add 5x ${item} to player at ${action.location}`);
          valid = false;
        }
      }
    }
    else if (act === 'store_east_t5') {
      const items = action.items || [];
      for (const item of items) {
        if (!sim.ship.remove(item, 5)) {
          errors.push(`Cannot store 5x ${item} at ${action.location}`);
          valid = false;
        }
        sim.storage.add(item, 5);
      }
    }
    else if (act === 'load_south_t5_and_retrieve_east') {
      const shipItems = action.shipItems || [];
      const playerItems = action.playerItems || [];
      for (const item of shipItems) {
        if (!sim.ship.add(item, 5)) {
          errors.push(`Cannot load 5x ${item} to boat at ${action.location}`);
          valid = false;
        }
      }
      for (const item of playerItems) {
        if (!sim.storage.remove(item, 5)) {
          errors.push(`Cannot retrieve 5x ${item} from storage at ${action.location}`);
          valid = false;
        }
        if (!sim.player.add(item, 5)) {
          errors.push(`Cannot load 5x ${item} to player at ${action.location}`);
          valid = false;
        }
      }
    }
    else if (act === 'sell_t7_and_restock') {
      const items = action.items || [];
      for (const item of items) {
        sim.storage.add(item, 5);
      }
    }
    
    if (valid) {
      validatedActions.push(action);
    }
  }
  
  if (errors.length > 0) {
    throw new Error(`Route validation failed:\n${errors.join('\n')}`);
  }
  
  const walkthroughText = generateWalkthrough(validatedActions, {
    shipMax: config.ship_weight,
    playerMax: (config.char_weight * 1.7) - (config.char_used_weight || 150),
    playerUsedWeight: config.char_used_weight || 150
  });

  // Ordered route stops with step numbers matching the walkthrough: consecutive
  // actions at the same location collapse into a single step (same grouping as
  // generateWalkthrough).
  const stops = [];
  let lastLoc = null;
  for (const a of validatedActions) {
    if (a.location !== lastLoc) {
      stops.push({ location: a.location, step: stops.length + 1 });
      lastLoc = a.location;
    }
  }
  
  return {
    status: "ok",
    walkthrough: walkthroughText,
    route: route,
    stops: stops,
    total_distance: distance,
    trades_done: sim.tradesDone,
    parley_used: sim.parleyUsed,
    optimization: {
      useIlyaStock: optimizationResult.config.useIlyaStock,
      stockRegions: optimizationResult.config.stockRegions || [],
      chainOrder: optimizationResult.config.chainOrder,
      structure: optimizationResult.structure || null
    }
  };
}
