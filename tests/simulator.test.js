import { describe, it, expect } from 'vitest';
import { Inventory, ShipInventory, PlayerInventory, Storage, Simulator } from '../js/simulator.js';

describe('simulator', () => {
  describe('Inventory', () => {
    it('should track items and capacity', () => {
      const inv = new Inventory(10000);
      inv.setTierMap({ 'Test Item': 4 });
      
      expect(inv.freeLt()).toBe(10000);
      expect(inv.usedLt()).toBe(0);
      
      inv.add('Test Item', 5);
      expect(inv.usedLt()).toBe(5000);
      expect(inv.freeLt()).toBe(5000);
      expect(inv.has('Test Item', 5)).toBe(true);
    });

    it('should prevent adding items when full', () => {
      const inv = new Inventory(5000);
      inv.setTierMap({ 'Test Item': 4 });
      
      const result = inv.add('Test Item', 10);
      expect(result).toBe(false);
      expect(inv.has('Test Item', 10)).toBe(false);
    });

    it('should remove items correctly', () => {
      const inv = new Inventory(10000);
      inv.setTierMap({ 'Test Item': 4 });
      
      inv.add('Test Item', 5);
      expect(inv.has('Test Item', 5)).toBe(true);
      
      const result = inv.remove('Test Item', 3);
      expect(result).toBe(true);
      expect(inv.has('Test Item', 2)).toBe(true);
      expect(inv.has('Test Item', 5)).toBe(false);
    });

    it('should prevent removing more items than available', () => {
      const inv = new Inventory(10000);
      inv.setTierMap({ 'Test Item': 4 });
      
      inv.add('Test Item', 3);
      const result = inv.remove('Test Item', 5);
      expect(result).toBe(false);
      expect(inv.has('Test Item', 3)).toBe(true);
    });

    it('should handle T6/T7 items (2000lt)', () => {
      const inv = new Inventory(10000);
      inv.setTierMap({ 'T6 Item': 6 });
      
      inv.add('T6 Item', 3);
      expect(inv.usedLt()).toBe(6000);
      expect(inv.freeLt()).toBe(4000);
    });
  });

  describe('PlayerInventory', () => {
    it('should have 1.7x capacity (overstack)', () => {
      const player = new PlayerInventory(5000);
      expect(player.capacityLt).toBe(8500);
    });

    it('should allow adding up to 2x base capacity', () => {
      const player = new PlayerInventory(5000);
      player.setTierMap({ 'Test Item': 4 });
      
      const result = player.add('Test Item', 10);
      expect(result).toBe(true);
      expect(player.usedLt()).toBe(10000);
    });
  });

  describe('Storage', () => {
    it('should store and retrieve items', () => {
      const storage = new Storage();
      
      storage.add('Test Item', 5);
      expect(storage.has('Test Item', 5)).toBe(true);
      
      storage.remove('Test Item', 3);
      expect(storage.has('Test Item', 2)).toBe(true);
    });

    it('should prevent removing more than stored', () => {
      const storage = new Storage();
      
      storage.add('Test Item', 3);
      const result = storage.remove('Test Item', 5);
      expect(result).toBe(false);
    });
  });

  describe('Simulator', () => {
    it('should initialize with correct parley budget', () => {
      const sim = new Simulator(22450, 5000, 1000000, 11000);
      expect(sim.maxTrades).toBe(90);
      expect(sim.tradesDone).toBe(0);
      expect(sim.parleyUsed).toBe(0);
    });

    it('should track trades and parley usage', () => {
      const sim = new Simulator(22450, 5000, 1000000, 11000);
      sim.setTierMap({ 'Input': 4, 'Output': 5 });
      
      sim.ship.add('Input', 5);
      const result = sim.trade('Input', 'Output', 5, 'Test Location');
      
      expect(result.success).toBe(true);
      expect(sim.tradesDone).toBe(1);
      expect(sim.parleyUsed).toBe(11000);
      expect(sim.ship.has('Output', 5)).toBe(true);
      expect(sim.ship.has('Input', 5)).toBe(false);
    });

    it('should prevent trading when parley exhausted', () => {
      const sim = new Simulator(22450, 5000, 22000, 11000);
      sim.setTierMap({ 'Input': 4, 'Output': 5 });
      
      sim.ship.add('Input', 10);
      sim.trade('Input', 'Output', 5, 'Location 1');
      sim.trade('Input', 'Output', 5, 'Location 2');
      
      const result = sim.trade('Input', 'Output', 5, 'Location 3');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Parley budget exhausted');
    });

    it('should prevent trading without required items', () => {
      const sim = new Simulator(22450, 5000, 1000000, 11000);
      sim.setTierMap({ 'Input': 4, 'Output': 5 });
      
      const result = sim.trade('Input', 'Output', 5, 'Test Location');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Ship lacks');
    });

    it('should prevent T5→T6 trade when ship capacity insufficient', () => {
      const sim = new Simulator(11000, 5000, 1000000, 11000);
      sim.setTierMap({ 'T5 Item': 5, 'T6 Item': 6 });
      
      // Fill ship with T5 items (11 items × 1000lt = 11000lt)
      sim.ship.add('T5 Item', 11);
      expect(sim.ship.usedLt()).toBe(11000);
      
      // Try to trade 5 T5 → 5 T6 (would need 10000lt for T6, but only have 6000lt free after removing T5)
      const result = sim.trade('T5 Item', 'T6 Item', 5, 'Test Location');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Insufficient ship capacity');
      // Verify state not corrupted - input items still present
      expect(sim.ship.has('T5 Item', 11)).toBe(true);
    });

    it('should allow T5→T6 trade when ship has sufficient capacity', () => {
      const sim = new Simulator(22450, 5000, 1000000, 11000);
      sim.setTierMap({ 'T5 Item': 5, 'T6 Item': 6 });
      
      // Add 5 T5 items (5000lt)
      sim.ship.add('T5 Item', 5);
      expect(sim.ship.usedLt()).toBe(5000);
      
      // Trade 5 T5 → 5 T6 (removes 5000lt, adds 10000lt, net +5000lt)
      const result = sim.trade('T5 Item', 'T6 Item', 5, 'Test Location');
      
      expect(result.success).toBe(true);
      expect(sim.ship.has('T6 Item', 5)).toBe(true);
      expect(sim.ship.has('T5 Item', 1)).toBe(false);
      expect(sim.ship.usedLt()).toBe(10000);
    });

    it('should not corrupt state when trade fails due to capacity', () => {
      const sim = new Simulator(10000, 5000, 1000000, 11000);
      sim.setTierMap({ 'T5 Item': 5, 'T6 Item': 6 });
      
      // Fill ship to capacity with T5 items
      sim.ship.add('T5 Item', 10);
      expect(sim.ship.usedLt()).toBe(10000);
      expect(sim.ship.freeLt()).toBe(0);
      
      // Try to trade - should fail
      const result = sim.trade('T5 Item', 'T6 Item', 5, 'Test Location');
      
      expect(result.success).toBe(false);
      // Verify state preserved - all original items still there
      expect(sim.ship.has('T5 Item', 10)).toBe(true);
      expect(sim.ship.has('T6 Item', 1)).toBe(false);
      expect(sim.ship.usedLt()).toBe(10000);
      expect(sim.tradesDone).toBe(0);
      expect(sim.parleyUsed).toBe(0);
    });
  });
});
