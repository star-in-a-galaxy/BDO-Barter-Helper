import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const barterGoods = JSON.parse(
  readFileSync(join(process.cwd(), 'assets', 'barterGoods.json'), 'utf-8')
);

const barterPorts = JSON.parse(
  readFileSync(join(process.cwd(), 'assets', 'barterPorts.json'), 'utf-8')
);

vi.mock('../js/catalog.js', () => ({
  getCatalog: () => Promise.resolve({
    t4Items: barterGoods.filter(item => item.tier === 'level_4'),
    t5Items: barterGoods.filter(item => item.tier === 'level_5'),
    t6Items: barterGoods.filter(item => item.tier === 'level_6'),
    t7Items: barterGoods.filter(item => item.tier === 'level_7'),
    t5Islands: Object.values(barterPorts).filter(p => p.name.includes('Island')).map(p => p.name),
    t6ByRegion: {
      'North': ['Haemo Island', 'Dallae Pier'],
      'South': ['Grándiha', 'Starry Midnight Port'],
      'East': ['Hakoven Island', 'Arehaza']
    },
    t7ByRegion: {
      'A': ['Sanctuary Coastal Outpost', 'Sausan Garrison Wharf'],
      'B': ['Iliya Island', 'Lema Island'],
      'C': ['Olvia Coast', 'Epheria Sentry Post']
    },
    chainOptions: [
      'North - Haemo Island',
      'North - Dallae Pier',
      'South - Grándiha',
      'South - Starry Midnight Port',
      'East - Hakoven Island',
      'East - Arehaza'
    ],
    ports: barterPorts,
    goods: barterGoods
  }),
  loadBarterPorts: () => Promise.resolve(barterPorts),
  loadBarterGoods: () => Promise.resolve(barterGoods)
}));

const { planRoute } = await import('../js/planner.js');
const { optimizeRoute } = await import('../js/optimizer.js');

describe('planner', () => {
  const samplePayload = {
    trades: [
      { region: 'North', chain: 'North - Dallae Pier', t5: '[Level 5] Octagonal Box', t4: '[Level 4] Stolen Pirate Dagger', island: 'Ajir Island' },
      { region: 'North', chain: 'North - Haemo Island', t5: '[Level 5] Mysterious Rock', t4: '[Level 4] Marine Knights\' Helm', island: 'Baremi Island' },
      { region: 'South', chain: 'South - Starry Midnight Port', t5: '[Level 5] Luxury Patterned Fabric', t4: '[Level 4] Pirate\'s Key', island: 'Orffs Island' },
      { region: 'South', chain: 'South - Grandiha', t5: '[Level 5] Portrait of the Ancient', t4: '[Level 4] Headless Dragon Figurine', island: 'Narvo Island' },
      { region: 'East', chain: 'East - Arehaza', t5: '[Level 5] 102 Year Old Golden Herb', t4: '[Level 4] Panacea', island: 'Padix Island' },
      { region: 'East', chain: 'East - Hakoven Island', t5: '[Level 5] Golden Fish Scale', t4: '[Level 4] Seashell Deco', island: 'Oben Island' }
    ],
    region_mapping: { north: 'C', south: 'B', east: 'A' },
    ilya_stock: { east: true, north: false, south: false },
    config: {
      base_parley: 1000000,
      parley_per_trade: 11000,
      ship_weight: 22450,
      char_weight: 5000
    }
  };

  describe('planRoute', () => {
    it('should return status ok', async () => {
      const result = await planRoute(samplePayload);
      expect(result.status).toBe('ok');
    });

    it('should generate walkthrough text', async () => {
      const result = await planRoute(samplePayload);
      expect(result.walkthrough).toBeDefined();
      expect(typeof result.walkthrough).toBe('string');
      expect(result.walkthrough.length).toBeGreaterThan(0);
      expect(result.walkthrough).toContain('Barter:');
    });

    it('should generate route array', async () => {
      const result = await planRoute(samplePayload);
      expect(result.route).toBeDefined();
      expect(Array.isArray(result.route)).toBe(true);
      expect(result.route.length).toBeGreaterThan(0);
      expect(result.route[0]).toBe('Iliya Island');
    });

    it('should calculate total distance', async () => {
      const result = await planRoute(samplePayload);
      expect(result.total_distance).toBeDefined();
      expect(typeof result.total_distance).toBe('number');
      expect(result.total_distance).toBeGreaterThan(0);
    });

    it('should track trades done', async () => {
      const result = await planRoute(samplePayload);
      expect(result.trades_done).toBeDefined();
      expect(typeof result.trades_done).toBe('number');
    });

    it('should track parley used', async () => {
      const result = await planRoute(samplePayload);
      expect(result.parley_used).toBeDefined();
      expect(typeof result.parley_used).toBe('number');
    });

    it('should handle default config values', async () => {
      const payload = {
        trades: samplePayload.trades,
        region_mapping: samplePayload.region_mapping,
        ilya_stock: samplePayload.ilya_stock
      };
      const result = await planRoute(payload);
      expect(result.status).toBe('ok');
    });

    it('should handle empty trades', async () => {
      const payload = {
        trades: [],
        region_mapping: { north: 'C', south: 'B', east: 'C' },
        ilya_stock: { east: false, north: false, south: false }
      };
      const result = await planRoute(payload);
      expect(result.status).toBe('ok');
      expect(result.route).toBeDefined();
    });

    it('should handle different region mappings', async () => {
      const payload1 = {
        ...samplePayload,
        region_mapping: { north: 'A', south: 'B', east: 'C' }
      };
      const payload2 = {
        ...samplePayload,
        region_mapping: { north: 'B', south: 'A', east: 'C' }
      };

      const result1 = await planRoute(payload1);
      const result2 = await planRoute(payload2);

      expect(result1.status).toBe('ok');
      expect(result2.status).toBe('ok');
      // Both should generate valid walkthroughs
      expect(result1.walkthrough.length).toBeGreaterThan(0);
      expect(result2.walkthrough.length).toBeGreaterThan(0);
    });
  });

  describe('T5→T6 trader alignment', () => {
    // The sample trade table lists North as Dallae Pier before Haemo Island,
    // while the optimizer's T6 trader list is Haemo first. Each T5 must still be
    // bartered at its OWN trader (no index-based cross-trader swap), and East
    // must barter Hakoven before Arehaza.
    const run = async () => {
      const result = await optimizeRoute(
        samplePayload.trades,
        { north: 'C', south: 'B', east: 'A' },
        { east: true, north: false, south: false },
        22450, 5000, 150, true, false
      );
      expect(result.error).toBeUndefined();
      return result.actions.filter(a => a.action === 'trade' && a.output && a.output.includes('Level 6'));
    };

    it('barters each T5 at its own trader', async () => {
      const t5toT6 = await run();
      expect(t5toT6.length).toBeGreaterThanOrEqual(6);

      const byInput = {};
      for (const a of t5toT6) byInput[a.input] = a.location;

      // North (table order: Dallae, Haemo)
      expect(byInput['[Level 5] Octagonal Box']).toBe('Dallae Pier');
      expect(byInput['[Level 5] Mysterious Rock']).toBe('Haemo Island');
      // South (table order: Starry, Grandiha)
      expect(byInput['[Level 5] Luxury Patterned Fabric']).toBe('Starry Midnight Port');
      expect(byInput['[Level 5] Portrait of the Ancient']).toBe('Grándiha');
      // East (table order: Arehaza, Hakoven) — each at its own trader
      expect(byInput['[Level 5] 102 Year Old Golden Herb']).toBe('Arehaza');
      expect(byInput['[Level 5] Golden Fish Scale']).toBe('Hakoven Island');
    });

    it('visits East traders in Hakoven-before-Arehaza order', async () => {
      const t5toT6 = await run();
      const eastTrades = t5toT6.filter(a => a.location === 'Hakoven Island' || a.location === 'Arehaza');
      const order = eastTrades.map(a => a.location);
      expect(order).toEqual(['Hakoven Island', 'Arehaza']);
    });
  });
});
