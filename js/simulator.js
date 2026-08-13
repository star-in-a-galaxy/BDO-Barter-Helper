export class Inventory {
  constructor(capacityLt) {
    this.capacityLt = capacityLt;
    this.items = {};
    this.tierMap = {};
  }
  
  setTierMap(tierMap) {
    this.tierMap = tierMap;
  }
  
  usedLt() {
    let total = 0;
    for (const [name, count] of Object.entries(this.items)) {
      total += count * this._itemLt(name);
    }
    return total;
  }
  
  freeLt() {
    return this.capacityLt - this.usedLt();
  }
  
  _itemLt(name) {
    const tier = this.tierMap[name] || 4;
    return tier <= 5 ? 1000 : 2000;
  }
  
  add(name, count) {
    const needed = count * this._itemLt(name);
    if (needed > this.freeLt()) {
      return false;
    }
    this.items[name] = (this.items[name] || 0) + count;
    return true;
  }
  
  remove(name, count) {
    if ((this.items[name] || 0) < count) {
      return false;
    }
    this.items[name] -= count;
    if (this.items[name] === 0) {
      delete this.items[name];
    }
    return true;
  }
  
  has(name, count) {
    return (this.items[name] || 0) >= count;
  }
}

export class ShipInventory extends Inventory {
  constructor(capacityLt) {
    super(capacityLt);
  }
}

export class PlayerInventory extends Inventory {
  constructor(availableLt, characterUsedWeight = 0) {
    // Player can overstack: threshold is (baseWeight × 1.7) - characterUsedWeight
    // We use a large capacity to allow overstack, but check threshold separately
    super(availableLt * 1.7);
    this.baseAvailable = availableLt;
    this.characterUsedWeight = characterUsedWeight; // Character's base used weight (equipment, etc.)
  }
  
  // Override add to check overstack threshold
  add(name, count) {
    const needed = count * this._itemLt(name);
    // Player can add if current weight is below threshold
    // Threshold = (baseAvailable × 1.7) - characterUsedWeight
    const threshold = (this.baseAvailable * 1.7) - this.characterUsedWeight;
    const currentWeight = this.usedLt();
    
    if (currentWeight >= threshold) {
      // At or above threshold, cannot add
      return false;
    }
    
    // Can add
    this.items[name] = (this.items[name] || 0) + count;
    return true;
  }
  
  // Check if player has free space (considering overstack)
  // Returns true if current weight < threshold
  hasFreeSpace() {
    const threshold = (this.baseAvailable * 1.7) - this.characterUsedWeight;
    const currentWeight = this.usedLt();
    return currentWeight < threshold;
  }
  
  // Get free space considering overstack threshold
  freeLt() {
    const threshold = (this.baseAvailable * 1.7) - this.characterUsedWeight;
    const currentWeight = this.usedLt();
    return Math.max(0, threshold - currentWeight);
  }
}

export class Storage {
  constructor() {
    this.items = {};
  }
  
  add(name, count) {
    this.items[name] = (this.items[name] || 0) + count;
  }
  
  remove(name, count) {
    if ((this.items[name] || 0) < count) {
      return false;
    }
    this.items[name] -= count;
    if (this.items[name] === 0) {
      delete this.items[name];
    }
    return true;
  }
  
  has(name, count) {
    return (this.items[name] || 0) >= count;
  }
}

export class Simulator {
  constructor(shipCapacity = 22450, playerAvailable = 5000, baseParley = 1000000, parleyPerTrade = 11000, characterUsedWeight = 0) {
    this.ship = new ShipInventory(shipCapacity);
    this.player = new PlayerInventory(playerAvailable, characterUsedWeight);
    this.storage = new Storage();
    this.parleyUsed = 0;
    this.baseParley = baseParley;
    this.parleyPerTrade = parleyPerTrade;
    this.tradesDone = 0;
    this.maxTrades = Math.floor(baseParley / parleyPerTrade);
    this.walkthrough = [];
  }
  
  setTierMap(tierMap) {
    this.ship.setTierMap(tierMap);
    this.player.setTierMap(tierMap);
  }
  
  canTrade() {
    return this.tradesDone < this.maxTrades;
  }
  
  trade(inputItem, outputItem, count, location) {
    if (!this.canTrade()) {
      return { success: false, message: "Parley budget exhausted" };
    }
    if (!this.ship.has(inputItem, count)) {
      return { success: false, message: `Ship lacks ${count}x ${inputItem}` };
    }
    
    // Calculate weight change before executing trade
    const inputWeight = count * this.ship._itemLt(inputItem);
    const outputWeight = count * this.ship._itemLt(outputItem);
    const netWeightChange = outputWeight - inputWeight;
    
    // Check if trade will fit in ship capacity
    if (netWeightChange > 0 && this.ship.freeLt() < netWeightChange) {
      return { success: false, message: "Insufficient ship capacity for trade" };
    }
    
    // Now safe to execute trade
    this.ship.remove(inputItem, count);
    this.ship.add(outputItem, count);
    this.parleyUsed += this.parleyPerTrade;
    this.tradesDone += 1;
    this.walkthrough.push(`Trade ${count}x ${inputItem} → ${outputItem} at ${location}`);
    return { success: true, message: "OK" };
  }
}
