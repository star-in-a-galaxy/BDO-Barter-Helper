/**
 * State Machine for BDO Bartering Route Optimization
 * 
 * Models the bartering problem as a state graph where:
 * - States = inventory configurations + location
 * - Transitions = actions (trade, move, swap, store, retrieve, sell)
 * - Goal = maximize T7 items produced and sold
 */

// Location types
const LOCATION_TYPES = {
  ILIYA: 'Iliya Island',
  EPHORIA: 'Epheria Sentry Post',
  LEMA: 'Lema Island',
  KUIT: 'Kuit Islands',
  T5_ISLAND: 'T5 Island',
  T6_TRADER: 'T6 Trader',
  T7_TRADER: 'T7 Trader'
};

// Action types
const ACTION_TYPES = {
  MOVE: 'move',
  LOAD: 'load',
  TRADE: 'trade',
  SWAP: 'swap',
  STORE: 'store',
  RETRIEVE: 'retrieve',
  SELL: 'sell'
};

/**
 * State representation
 */
class State {
  constructor(location, shipItems, playerItems, epheriaStorage, ilyaStorage, tradesCompleted, visitCounts = {}, tradesPerformed = {}) {
    this.location = location;
    this.shipItems = { ...shipItems };
    this.playerItems = { ...playerItems };
    this.epheriaStorage = { ...epheriaStorage };
    this.ilyaStorage = { ...ilyaStorage };
    this.tradesCompleted = tradesCompleted;
    this.actionHistory = [];
    this.visitCounts = { ...visitCounts }; // Track how many times each location has been visited
    this.tradesPerformed = { ...tradesPerformed }; // Track how many times each trade has been performed
  }

  clone() {
    const newState = new State(
      this.location,
      this.shipItems,
      this.playerItems,
      this.epheriaStorage,
      this.ilyaStorage,
      this.tradesCompleted,
      this.visitCounts,
      this.tradesPerformed
    );
    newState.actionHistory = [...this.actionHistory];
    return newState;
  }

  /**
   * Record a visit to a location
   */
  recordVisit(location) {
    this.visitCounts[location] = (this.visitCounts[location] || 0) + 1;
  }

  /**
   * Check if we can visit a location (based on visit limits)
   */
  canVisit(location, maxVisits) {
    const currentVisits = this.visitCounts[location] || 0;
    return currentVisits < maxVisits;
  }

  /**
   * Record a trade being performed
   * @param {string} tradeKey - Unique key for the trade (e.g., "T4->T5:ItemName")
   * @param {number} count - Number of items traded
   */
  recordTrade(tradeKey, count) {
    this.tradesPerformed[tradeKey] = (this.tradesPerformed[tradeKey] || 0) + count;
  }

  /**
   * Check if we can perform a trade (max 5 items per trade pair)
   * @param {string} tradeKey - Unique key for the trade
   * @param {number} count - Number of items to trade
   * @returns {boolean}
   */
  canPerformTrade(tradeKey, count) {
    const currentCount = this.tradesPerformed[tradeKey] || 0;
    return (currentCount + count) <= 5;
  }

  /**
   * Generate a unique key for this state (for visited set)
   */
  getKey() {
    return JSON.stringify({
      loc: this.location,
      ship: this.shipItems,
      player: this.playerItems,
      eph: this.epheriaStorage,
      ily: this.ilyaStorage,
      trades: this.tradesCompleted,
      tradesPerformed: this.tradesPerformed
    });
  }

  /**
   * Check if this is a goal state (all trades completed)
   */
  isGoalState(totalTradesNeeded) {
    return this.tradesCompleted >= totalTradesNeeded;
  }

  /**
   * Calculate heuristic for A* search
   * Estimate remaining trades needed
   */
  heuristic(totalTradesNeeded) {
    return totalTradesNeeded - this.tradesCompleted;
  }

  /**
   * Count the number of trade actions performed
   * Used to prefer batching (fewer actions = more efficient)
   */
  countTradeActions() {
    return this.actionHistory.filter(a => a.type === ACTION_TYPES.TRADE).length;
  }
}

/**
 * State Machine - explores all valid state transitions
 */
class StateMachine {
  constructor(config, trades, regionMapping, shipCapacity, playerCapacity, ports = null) {
    this.config = config;
    this.trades = trades;
    this.regionMapping = regionMapping;
    this.shipCapacity = shipCapacity;
    this.playerCapacity = playerCapacity;
    this.ports = ports;
    
    // Build location maps
    this.locations = this.buildLocationMap();
    this.tradesByRegion = this.groupTradesByRegion();
    
    // Calculate total trades needed
    this.totalTradesNeeded = trades.length * 3; // T4→T5, T5→T6, T6→T7 for each trade
  }

  /**
   * Build location map with coordinates
   */
  buildLocationMap() {
    const locations = {};
    
    if (this.ports) {
      for (const [id, port] of Object.entries(this.ports)) {
        locations[port.name] = {
          name: port.name,
          coordinates: port.coordinates,
          barterer: port.barterer
        };
      }
    }
    
    // Add key locations
    const keyLocations = [
      'Iliya Island',
      'Epheria Sentry Post',
      'Lema Island',
      'Kuit Islands',
      'Sanctuary Coastal Outpost',
      'Sausan Garrison Wharf',
      'Olvia Coast',
      'Haemo Island',
      'Dallae Pier',
      'Grándiha',
      'Starry Midnight Port',
      'Hakoven Island',
      'Arehaza',
      'Ajir Island',
      'Baremi Island',
      'Orffs Island',
      'Narvo Island',
      'Padix Island',
      'Oben Island'
    ];
    
    for (const loc of keyLocations) {
      if (!locations[loc]) {
        locations[loc] = { name: loc, coordinates: null };
      }
    }
    
    return locations;
  }

  /**
   * Group trades by region
   */
  groupTradesByRegion() {
    const grouped = {
      north: [],
      south: [],
      east: []
    };

    for (const trade of this.trades) {
      const region = trade.region.toLowerCase();
      if (grouped[region]) {
        grouped[region].push(trade);
      }
    }

    return grouped;
  }

  /**
   * Calculate weight of items
   */
  calculateWeight(items) {
    let total = 0;
    for (const [name, count] of Object.entries(items)) {
      const tier = this.getItemTier(name);
      const weight = tier <= 5 ? 1000 : 2000;
      total += count * weight;
    }
    return total;
  }

  /**
   * Get item tier from name
   */
  getItemTier(itemName) {
    if (itemName.includes('Level 4')) return 4;
    if (itemName.includes('Level 5')) return 5;
    if (itemName.includes('Level 6')) return 6;
    if (itemName.includes('Level 7')) return 7;
    return 0;
  }

  /**
   * Generate all valid transitions from a state
   */
  generateTransitions(state) {
    const transitions = [];

    // 1. Move to adjacent locations
    transitions.push(...this.generateMoveTransitions(state));

    // 2. Trade at current location (if applicable)
    transitions.push(...this.generateTradeTransitions(state));

    // 3. Swap items at wharf (if at wharf)
    if (this.isWharf(state.location)) {
      transitions.push(...this.generateSwapTransitions(state));
    }

    // 4. Store items (if at storage location)
    if (this.isStorageLocation(state.location)) {
      transitions.push(...this.generateStoreTransitions(state));
    }

    // 5. Retrieve items (if at storage location)
    if (this.isStorageLocation(state.location)) {
      transitions.push(...this.generateRetrieveTransitions(state));
    }

    // 6. Sell T7 items (if at T7 trader)
    if (this.isT7Trader(state.location)) {
      transitions.push(...this.generateSellTransitions(state));
    }

    return transitions;
  }

  /**
   * Get maximum visits allowed for a location
   */
  getMaxVisits(location) {
    // T5 islands: Visit once (trade T4→T5)
    if (this.isT5Island(location)) return 1;
    
    // T6 traders: Visit once (trade T5→T6)
    if (this.isT6Trader(location)) return 1;
    
    // T7 traders: Visit twice (trade T6→T7, then sell)
    if (this.isT7Trader(location)) return 2;
    
    // Storage locations: Visit multiple times (load, store, retrieve)
    if (location === 'Iliya Island' || location === 'Epheria Sentry Post') return 3;
    
    // Swap locations: Visit once or twice
    if (location === 'Lema Island' || location === 'Kuit Islands') return 2;
    
    // Default: Visit once
    return 1;
  }

  /**
   * Generate move transitions
   */
  generateMoveTransitions(state) {
    const transitions = [];
    const adjacentLocations = this.getAdjacentLocations(state.location);

    for (const dest of adjacentLocations) {
      // Check if we can visit this location
      const maxVisits = this.getMaxVisits(dest);
      if (!state.canVisit(dest, maxVisits)) {
        continue; // Skip if we've visited too many times
      }

      const newState = state.clone();
      newState.location = dest;
      newState.recordVisit(dest);
      newState.actionHistory.push({
        type: ACTION_TYPES.MOVE,
        from: state.location,
        to: dest
      });
      transitions.push(newState);
    }

    return transitions;
  }

  /**
   * Generate trade transitions
   */
  generateTradeTransitions(state) {
    const transitions = [];
    const location = state.location;

    // T4→T5 trades at T5 islands
    if (this.isT5Island(location)) {
      const region = this.getRegionForT5Island(location);
      const regionTrades = this.tradesByRegion[region] || [];
      
      for (const trade of regionTrades) {
        if (trade.t5Island === location) {
          const tradeKey = `T4->T5:${trade.t4Item}`;
          const alreadyTraded = state.tradesPerformed[tradeKey] || 0;
          const remainingAllowed = 5 - alreadyTraded;
          
          if (remainingAllowed <= 0) continue; // Already did all 5
          
          const available = state.shipItems[trade.t4Item] || 0;
          if (available === 0) continue; // No items to trade
          
          // Try different batch sizes: 5 (optimal), then 4, 3, 2, 1
          const maxBatch = Math.min(remainingAllowed, available);
          for (let batchSize = maxBatch; batchSize >= 1; batchSize--) {
            const newState = state.clone();
            
            // Remove T4 items
            newState.shipItems[trade.t4Item] -= batchSize;
            if (newState.shipItems[trade.t4Item] === 0) {
              delete newState.shipItems[trade.t4Item];
            }
            
            // Add T5 items
            newState.shipItems[trade.t5Item] = (newState.shipItems[trade.t5Item] || 0) + batchSize;
            
            // Check capacity
            if (this.calculateWeight(newState.shipItems) <= this.shipCapacity) {
              newState.tradesCompleted += 1;
              newState.recordTrade(tradeKey, batchSize);
              newState.actionHistory.push({
                type: ACTION_TYPES.TRADE,
                input: trade.t4Item,
                output: trade.t5Item,
                count: batchSize,
                location
              });
              transitions.push(newState);
            }
          }
        }
      }
    }

    // T5→T6 trades at T6 traders
    if (this.isT6Trader(location)) {
      const region = this.getRegionForT6Trader(location);
      const regionTrades = this.tradesByRegion[region] || [];
      
      for (const trade of regionTrades) {
        if (trade.t6Trader === location) {
          const tradeKey = `T5->T6:${trade.t5Item}`;
          const alreadyTraded = state.tradesPerformed[tradeKey] || 0;
          const remainingAllowed = 5 - alreadyTraded;
          
          if (remainingAllowed <= 0) continue;
          
          const available = state.shipItems[trade.t5Item] || 0;
          if (available === 0) continue;
          
          const maxBatch = Math.min(remainingAllowed, available);
          for (let batchSize = maxBatch; batchSize >= 1; batchSize--) {
            const newState = state.clone();
            
            newState.shipItems[trade.t5Item] -= batchSize;
            if (newState.shipItems[trade.t5Item] === 0) {
              delete newState.shipItems[trade.t5Item];
            }
            
            newState.shipItems[trade.t6Item] = (newState.shipItems[trade.t6Item] || 0) + batchSize;
            
            if (this.calculateWeight(newState.shipItems) <= this.shipCapacity) {
              newState.tradesCompleted += 1;
              newState.recordTrade(tradeKey, batchSize);
              newState.actionHistory.push({
                type: ACTION_TYPES.TRADE,
                input: trade.t5Item,
                output: trade.t6Item,
                count: batchSize,
                location
              });
              transitions.push(newState);
            }
          }
        }
      }
    }

    // T6→T7 trades at T7 traders
    if (this.isT7Trader(location)) {
      const region = this.getRegionForT7Trader(location);
      const regionTrades = this.tradesByRegion[region] || [];
      
      for (const trade of regionTrades) {
        if (trade.t7Trader === location) {
          const tradeKey = `T6->T7:${trade.t6Item}`;
          const alreadyTraded = state.tradesPerformed[tradeKey] || 0;
          const remainingAllowed = 5 - alreadyTraded;
          
          if (remainingAllowed <= 0) continue;
          
          const available = state.shipItems[trade.t6Item] || 0;
          if (available === 0) continue;
          
          const maxBatch = Math.min(remainingAllowed, available);
          for (let batchSize = maxBatch; batchSize >= 1; batchSize--) {
            const newState = state.clone();
            
            newState.shipItems[trade.t6Item] -= batchSize;
            if (newState.shipItems[trade.t6Item] === 0) {
              delete newState.shipItems[trade.t6Item];
            }
            
            newState.shipItems[trade.t7Item] = (newState.shipItems[trade.t7Item] || 0) + batchSize;
            
            if (this.calculateWeight(newState.shipItems) <= this.shipCapacity) {
              newState.tradesCompleted += 1;
              newState.recordTrade(tradeKey, batchSize);
              newState.actionHistory.push({
                type: ACTION_TYPES.TRADE,
                input: trade.t6Item,
                output: trade.t7Item,
                count: batchSize,
                location
              });
              transitions.push(newState);
            }
          }
        }
      }
    }

    return transitions;
  }

  /**
   * Generate swap transitions
   */
  generateSwapTransitions(state) {
    const transitions = [];

    // Try moving items from ship to player
    for (const [itemName, count] of Object.entries(state.shipItems)) {
      if (count >= 5) {
        const newState = state.clone();
        
        // Move 5 items from ship to player
        newState.shipItems[itemName] -= 5;
        if (newState.shipItems[itemName] === 0) {
          delete newState.shipItems[itemName];
        }
        newState.playerItems[itemName] = (newState.playerItems[itemName] || 0) + 5;
        
        // Check capacity
        if (this.calculateWeight(newState.playerItems) <= this.playerCapacity) {
          newState.actionHistory.push({
            type: ACTION_TYPES.SWAP,
            from: 'ship',
            to: 'player',
            item: itemName,
            count: 5,
            location: state.location
          });
          transitions.push(newState);
        }
      }
    }

    // Try moving items from player to ship
    for (const [itemName, count] of Object.entries(state.playerItems)) {
      if (count >= 5) {
        const newState = state.clone();
        
        // Move 5 items from player to ship
        newState.playerItems[itemName] -= 5;
        if (newState.playerItems[itemName] === 0) {
          delete newState.playerItems[itemName];
        }
        newState.shipItems[itemName] = (newState.shipItems[itemName] || 0) + 5;
        
        // Check capacity
        if (this.calculateWeight(newState.shipItems) <= this.shipCapacity) {
          newState.actionHistory.push({
            type: ACTION_TYPES.SWAP,
            from: 'player',
            to: 'ship',
            item: itemName,
            count: 5,
            location: state.location
          });
          transitions.push(newState);
        }
      }
    }

    return transitions;
  }

  /**
   * Generate store transitions
   */
  generateStoreTransitions(state) {
    const transitions = [];
    const storageLocation = state.location;

    // Store items from ship
    for (const [itemName, count] of Object.entries(state.shipItems)) {
      if (count >= 5) {
        const newState = state.clone();
        
        // Move 5 items from ship to storage
        newState.shipItems[itemName] -= 5;
        if (newState.shipItems[itemName] === 0) {
          delete newState.shipItems[itemName];
        }
        
        if (storageLocation === 'Epheria Sentry Post') {
          newState.epheriaStorage[itemName] = (newState.epheriaStorage[itemName] || 0) + 5;
        } else if (storageLocation === 'Iliya Island') {
          newState.ilyaStorage[itemName] = (newState.ilyaStorage[itemName] || 0) + 5;
        }
        
        newState.actionHistory.push({
          type: ACTION_TYPES.STORE,
          item: itemName,
          count: 5,
          location: storageLocation
        });
        transitions.push(newState);
      }
    }

    return transitions;
  }

  /**
   * Generate retrieve transitions
   */
  generateRetrieveTransitions(state) {
    const transitions = [];
    const storageLocation = state.location;
    const storage = storageLocation === 'Epheria Sentry Post' ? state.epheriaStorage : state.ilyaStorage;

    // Retrieve items to ship
    for (const [itemName, count] of Object.entries(storage)) {
      if (count >= 5) {
        const newState = state.clone();
        
        // Move 5 items from storage to ship
        storage[itemName] -= 5;
        if (storage[itemName] === 0) {
          delete storage[itemName];
        }
        newState.shipItems[itemName] = (newState.shipItems[itemName] || 0) + 5;
        
        // Check capacity
        if (this.calculateWeight(newState.shipItems) <= this.shipCapacity) {
          newState.actionHistory.push({
            type: ACTION_TYPES.RETRIEVE,
            item: itemName,
            count: 5,
            location: storageLocation,
            target: 'ship'
          });
          transitions.push(newState);
        }
      }
    }

    // Retrieve items to player
    for (const [itemName, count] of Object.entries(storage)) {
      if (count >= 5) {
        const newState = state.clone();
        
        // Move 5 items from storage to player
        storage[itemName] -= 5;
        if (storage[itemName] === 0) {
          delete storage[itemName];
        }
        newState.playerItems[itemName] = (newState.playerItems[itemName] || 0) + 5;
        
        // Check capacity
        if (this.calculateWeight(newState.playerItems) <= this.playerCapacity) {
          newState.actionHistory.push({
            type: ACTION_TYPES.RETRIEVE,
            item: itemName,
            count: 5,
            location: storageLocation,
            target: 'player'
          });
          transitions.push(newState);
        }
      }
    }

    return transitions;
  }

  /**
   * Generate sell transitions
   */
  generateSellTransitions(state) {
    const transitions = [];

    // Sell T7 items from ship
    for (const [itemName, count] of Object.entries(state.shipItems)) {
      if (this.getItemTier(itemName) === 7 && count >= 5) {
        const newState = state.clone();
        
        // Remove T7 items
        newState.shipItems[itemName] -= 5;
        if (newState.shipItems[itemName] === 0) {
          delete newState.shipItems[itemName];
        }
        
        newState.actionHistory.push({
          type: ACTION_TYPES.SELL,
          item: itemName,
          count: 5,
          location: state.location
        });
        transitions.push(newState);
      }
    }

    return transitions;
  }

  /**
   * Get adjacent locations
   * Returns locations within a reasonable distance threshold
   */
  getAdjacentLocations(location) {
    const MAX_DISTANCE = 50000; // Maximum distance to consider adjacent
    const adjacent = [];
    
    for (const [locName, locData] of Object.entries(this.locations)) {
      if (locName === location) continue;
      
      const distance = this.getDistance(location, locName);
      if (distance <= MAX_DISTANCE) {
        adjacent.push(locName);
      }
    }
    
    // Always include key locations regardless of distance
    const keyLocations = [
      'Iliya Island',
      'Epheria Sentry Post',
      'Lema Island'
    ];
    
    for (const keyLoc of keyLocations) {
      if (keyLoc !== location && !adjacent.includes(keyLoc)) {
        adjacent.push(keyLoc);
      }
    }
    
    return adjacent;
  }

  /**
   * Check if location is a wharf
   */
  isWharf(location) {
    return ['Iliya Island', 'Epheria Sentry Post', 'Lema Island', 'Kuit Islands'].includes(location) ||
           this.isT6Trader(location) ||
           this.isT7Trader(location);
  }

  /**
   * Check if location is a storage location
   */
  isStorageLocation(location) {
    return location === 'Iliya Island' || location === 'Epheria Sentry Post';
  }

  /**
   * Check if location is a T5 island
   */
  isT5Island(location) {
    return this.trades.some(t => t.t5Island === location);
  }

  /**
   * Check if location is a T6 trader
   */
  isT6Trader(location) {
    return this.trades.some(t => t.t6Trader === location);
  }

  /**
   * Check if location is a T7 trader
   */
  isT7Trader(location) {
    return this.trades.some(t => t.t7Trader === location);
  }

  /**
   * Get region for T5 island
   */
  getRegionForT5Island(location) {
    const trade = this.trades.find(t => t.t5Island === location);
    return trade ? trade.region.toLowerCase() : null;
  }

  /**
   * Get region for T6 trader
   */
  getRegionForT6Trader(location) {
    const trade = this.trades.find(t => t.t6Trader === location);
    return trade ? trade.region.toLowerCase() : null;
  }

  /**
   * Get region for T7 trader
   */
  getRegionForT7Trader(location) {
    const trade = this.trades.find(t => t.t7Trader === location);
    return trade ? trade.region.toLowerCase() : null;
  }

  /**
   * Find optimal route using beam search
   * Limits the number of states explored at each step to prevent state space explosion
   */
  findOptimalRoute() {
    const initialState = new State(
      'Iliya Island',
      {}, // Start with empty ship
      {}, // Start with empty player inventory
      {}, // Start with empty Epheria storage
      {}, // Start with empty Iliya storage
      0,  // No trades completed
      { 'Iliya Island': 1 } // Record initial visit to Iliya
    );

    const BEAM_WIDTH = 100; // Keep top 100 states at each step
    const MAX_STEPS = 1000; // Maximum number of steps
    const startTime = Date.now();
    const TIMEOUT_MS = 60000; // 1 minute

    let currentBeam = [initialState];
    const visited = new Set();
    let bestState = null;
    let bestDistance = Infinity;

    for (let step = 0; step < MAX_STEPS; step++) {
      // Check timeout
      if (Date.now() - startTime > TIMEOUT_MS) {
        console.warn('State machine timeout reached');
        break;
      }

      if (currentBeam.length === 0) {
        break;
      }

      const nextBeam = [];

      for (const state of currentBeam) {
        const stateKey = state.getKey();

        // Skip if already visited
        if (visited.has(stateKey)) {
          continue;
        }
        visited.add(stateKey);

        // Check if this is a goal state
        if (state.isGoalState(this.totalTradesNeeded)) {
          const distance = this.calculateRouteDistance(state.actionHistory);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestState = state;
          }
          continue; // Don't expand goal states
        }

        // Generate and add all valid transitions
        const transitions = this.generateTransitions(state);
        nextBeam.push(...transitions);
      }

      // Sort by:
      // 1. Primary: fewer remaining trades (heuristic)
      // 2. Secondary: fewer trade actions (prefer batching - 1 trade of 5 > 5 trades of 1)
      nextBeam.sort((a, b) => {
        const aRemaining = a.heuristic(this.totalTradesNeeded);
        const bRemaining = b.heuristic(this.totalTradesNeeded);
        
        // If remaining trades are different, sort by that
        if (aRemaining !== bRemaining) {
          return aRemaining - bRemaining;
        }
        
        // If same remaining trades, prefer fewer trade actions (more batching)
        const aActions = a.countTradeActions();
        const bActions = b.countTradeActions();
        return aActions - bActions;
      });

      currentBeam = nextBeam.slice(0, BEAM_WIDTH);
    }

    return bestState;
  }

  /**
   * Calculate route distance from action history
   */
  calculateRouteDistance(actionHistory) {
    let totalDistance = 0;
    let currentLocation = 'Iliya Island';

    for (const action of actionHistory) {
      if (action.type === ACTION_TYPES.MOVE) {
        // Calculate distance between locations
        const distance = this.getDistance(currentLocation, action.to);
        totalDistance += distance;
        currentLocation = action.to;
      }
    }

    return totalDistance;
  }

  /**
   * Get distance between two locations
   */
  getDistance(from, to) {
    if (!this.ports || !from || !to) return 1000; // Default distance
    
    const fromPort = Object.values(this.ports).find(p => 
      p.name.toLowerCase() === from.toLowerCase()
    );
    const toPort = Object.values(this.ports).find(p => 
      p.name.toLowerCase() === to.toLowerCase()
    );
    
    if (!fromPort || !toPort || !fromPort.coordinates || !toPort.coordinates) {
      return 1000; // Default distance if coordinates not found
    }
    
    const [x1, y1] = fromPort.coordinates;
    const [x2, y2] = toPort.coordinates;
    
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }
}

export { State, StateMachine, ACTION_TYPES, LOCATION_TYPES };
