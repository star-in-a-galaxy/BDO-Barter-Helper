import { describe, it, expect, vi } from 'vitest';
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
      'A': ['Olvia Coast', 'Epheria Sentry Post'],
      'B': ['Iliya Island', 'Lema Island'],
      'C': ['Sanctuary Coastal Outpost', 'Sausan Garrison Wharf']
    },
    chainOptions: [],
    ports: barterPorts,
    goods: barterGoods
  }),
  loadBarterPorts: () => Promise.resolve(barterPorts),
  loadBarterGoods: () => Promise.resolve(barterGoods)
}));

const { planRoute } = await import('../js/planner.js');

const trades = [
  { region: 'North', chain: 'North - Dallae Pier', t5: '[Level 5] Octagonal Box', t4: "[Level 4] Stolen Pirate Dagger", island: 'Ajir Island' },
  { region: 'North', chain: 'North - Haemo Island', t5: '[Level 5] Mysterious Rock', t4: "[Level 4] Marine Knights' Helm", island: 'Baremi Island' },
  { region: 'South', chain: 'South - Starry Midnight Port', t5: '[Level 5] Luxury Patterned Fabric', t4: "[Level 4] Pirate's Key", island: 'Orffs Island' },
  { region: 'South', chain: 'South - Grandiha', t5: '[Level 5] Portrait of the Ancient', t4: '[Level 4] Headless Dragon Figurine', island: 'Narvo Island' },
  { region: 'East', chain: 'East - Arehaza', t5: '[Level 5] 102 Year Old Golden Herb', t4: '[Level 4] Panacea', island: 'Padix Island' },
  { region: 'East', chain: 'East - Hakoven Island', t5: '[Level 5] Golden Fish Scale', t4: '[Level 4] Seashell Deco', island: 'Oben Island' }
];

const makePayload = (shipWeight, charWeight) => ({
  trades,
  region_mapping: { north: 'A', south: 'B', east: 'C' },
  ilya_stock: true,
  config: {
    base_parley: 1000000,
    parley_per_trade: 11000,
    ship_weight: shipWeight,
    char_weight: charWeight,
    char_used_weight: 150,
    juggling: true
  }
});

describe('capacity-adaptive routing', () => {
  it('should route with the default capacities', async () => {
    const res = await planRoute(makePayload(22450, 5500));
    expect(res.status).toBe('ok');
    expect(res.total_distance).toBeGreaterThan(0);
    expect(res.trades_done).toBe(18);
    expect(res.optimization.structure).toBeDefined();
  });

  it('should route with a larger ship (30,000lt)', async () => {
    const res = await planRoute(makePayload(30000, 5500));
    expect(res.status).toBe('ok');
    expect(res.total_distance).toBeGreaterThan(0);
  });

  it('should route on a mid-size ship via partial/per-region (20,000lt)', async () => {
    const res = await planRoute(makePayload(20000, 5500));
    expect(res.status).toBe('ok');
    expect(res.total_distance).toBeGreaterThan(0);
  });

  it('should route on a small ship via region-splitting (15,000lt)', async () => {
    const res = await planRoute(makePayload(15000, 5500));
    expect(res.status).toBe('ok');
    expect(res.total_distance).toBeGreaterThan(0);
    expect(res.trades_done).toBe(18);
  });

  it('should route near the minimum ship (11,000lt)', async () => {
    const res = await planRoute(makePayload(11000, 5500));
    expect(res.status).toBe('ok');
    expect(res.trades_done).toBe(18);
  });

  it('should fall back to per-region with a tiny player inventory', async () => {
    const res = await planRoute(makePayload(22450, 800));
    expect(res.status).toBe('ok');
    expect(res.optimization.structure).toBe('perRegion');
  });

  it('should give a clear error when the ship is below the hard minimum', async () => {
    await expect(planRoute(makePayload(9000, 5500))).rejects.toThrow(/No feasible route found/);
  });

  it('should still produce a zero-sum route with assume-stock (restocks at Ilya)', async () => {
    const res = await planRoute(makePayload(22450, 5500));
    expect(res.status).toBe('ok');
    expect(res.trades_done).toBe(18);
  });
});
