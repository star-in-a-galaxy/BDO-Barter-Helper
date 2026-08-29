import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const barterPorts = JSON.parse(
  readFileSync(join(process.cwd(), 'assets', 'barterPorts.json'), 'utf-8')
);

const barterTierPorts = JSON.parse(
  readFileSync(join(process.cwd(), 'assets', 'barterTierPorts.json'), 'utf-8')
);

const barterT6T7Ports = JSON.parse(
  readFileSync(join(process.cwd(), 'assets', 't6T7Ports.json'), 'utf-8')
);

vi.mock('../js/catalog.js', () => ({
  loadBarterPorts: () => Promise.resolve(barterPorts),
  loadBarterTierPorts: () => Promise.resolve(barterTierPorts),
  loadT6T7Ports: () => Promise.resolve(barterT6T7Ports)
}));

const { optimizeRoute, ensureCompleteT7Ports } = await import('../js/optimizer.js');
const { buildTrades } = await import('../js/scanner.js');

describe('T7 barter location', () => {
  it('buildTrades attaches the actual T7 port from the T6→T7 scan', () => {
    const rows = [{
      island: 'Orffs Island',
      t4: "[Level 4] Pirate's Key",
      t5: '[Level 5] Luxury Patterned Fabric'
    }];
    const t5t6 = [{
      trader: 'Grándiha',
      t5: '[Level 5] Luxury Patterned Fabric',
      t6: '[Level 6] Moonlit Crystal Lamp'
    }];
    const t6t7 = [{
      port: 'Sausan Garrison Wharf',
      t6: '[Level 6] Moonlit Crystal Lamp',
      t7: '[Level 7] Omar Lava Powder'
    }];
    const trades = buildTrades(rows, t5t6, t6t7, []);
    expect(trades).toHaveLength(1);
    expect(trades[0].t7Port).toBe('Sausan Garrison Wharf');
  });

  it('barters and sells each region T6→T7 at the trade\'s actual T7 port', async () => {
    const trades = [
      {
        region: 'South', chain: 'South - Grándiha', island: 'Orffs Island',
        t4: "[Level 4] Pirate's Key", t5: '[Level 5] Luxury Patterned Fabric',
        t6: '[Level 6] Moonlit Crystal Lamp', t7: '[Level 7] Omar Lava Powder',
        t7Port: 'Sausan Garrison Wharf'
      },
      {
        region: 'South', chain: 'South - Starry Midnight Port', island: 'Narvo Island',
        t4: '[Level 4] Headless Dragon Figurine', t5: '[Level 5] Portrait of the Ancient',
        t6: '[Level 6] Moonshade Aged Wine', t7: '[Level 7] Top-Quality Hakinza Perfume',
        t7Port: 'Sanctuary Coastal Outpost'
      }
    ];

    const result = await optimizeRoute(trades, { north: 'A', south: 'C', east: 'B' }, false, 22450, 5400, 150);
    expect(result.error).toBeUndefined();
    expect(result.route).toBeTruthy();

    // Each T6→T7 barter happens at the offering port, not at an arbitrary port
    // of the mapped region (the old behaviour collapsed both onto one port).
    const barterByInput = {};
    for (const a of result.actions) {
      if (a.action === 'trade' && a.output && a.output.includes('Level 7')) {
        barterByInput[a.input] = a.location;
      }
    }
    expect(barterByInput['[Level 6] Moonlit Crystal Lamp']).toBe('Sausan Garrison Wharf');
    expect(barterByInput['[Level 6] Moonshade Aged Wine']).toBe('Sanctuary Coastal Outpost');

    // T7 sells are deferred: after bartering all of a region's T6→T7s (ship
    // weight is unchanged), the T7s are sold at the last T6→T7 port.
    const sellByItem = {};
    for (const a of result.actions) {
      if (a.action === 'sell') {
        for (const it of a.items) sellByItem[it.name] = a.location;
      }
    }
    expect(sellByItem['[Level 7] Omar Lava Powder']).toBe('Sanctuary Coastal Outpost');
    expect(sellByItem['[Level 7] Top-Quality Hakinza Perfume']).toBe('Sanctuary Coastal Outpost');
  });

  it('never swaps ship↔player outside swap-capable ports', async () => {
    // East uses Ilya T5 stock, so the combined single-stock sweep is attempted
    // and performs its swap at the current location - which must be a swap port
    // (Iliya / Lema / Kuit / T6 trader / T7 trader), never a remote T4→T5 island.
    const trades = [
      { region: 'North', chain: 'North - Dallae Pier', t5: '[Level 5] Octagonal Box', t4: '[Level 4] Stolen Pirate Dagger', island: 'Ajir Island' },
      { region: 'North', chain: 'North - Haemo Island', t5: '[Level 5] Mysterious Rock', t4: "[Level 4] Marine Knights' Helm", island: 'Baremi Island' },
      { region: 'South', chain: 'South - Starry Midnight Port', t5: '[Level 5] Luxury Patterned Fabric', t4: "[Level 4] Pirate's Key", island: 'Orffs Island' },
      { region: 'South', chain: 'South - Grandiha', t5: '[Level 5] Portrait of the Ancient', t4: '[Level 4] Headless Dragon Figurine', island: 'Narvo Island' },
      { region: 'East', chain: 'East - Arehaza', t5: '[Level 5] 102 Year Old Golden Herb', t4: '[Level 4] Panacea', island: 'Padix Island' },
      { region: 'East', chain: 'East - Hakoven Island', t5: '[Level 5] Golden Fish Scale', t4: '[Level 4] Seashell Deco', island: 'Oben Island' }
    ];

    const allowed = new Set([
      'Iliya Island', 'Lema Island', 'Kuit Islands',
      'Haemo Island', 'Dallae Pier', 'Grándiha', 'Starry Midnight Port', 'Hakoven Island', 'Arehaza',
      'Olvia Coast', 'Epheria Sentry Post', 'Sanctuary Coastal Outpost', 'Sausan Garrison Wharf'
    ]);

    const result = await optimizeRoute(trades, { north: 'A', south: 'B', east: 'C' }, { east: true }, 22450, 5000, 150);
    expect(result.error).toBeUndefined();
    for (const a of result.actions) {
      if (a.action === 'swap') {
        expect(allowed.has(a.location)).toBe(true);
      }
    }
  });

  describe('ensureCompleteT7Ports (all 6 ports in the route)', () => {
    it('reassigns a duplicated T7 port to its region partner', () => {
      // Both South trades were OCR-read at Sausan; the C pair (Sausan +
      // Sanctuary) must both appear in the route.
      const trades = [
        { region: 'South', chain: 'South - Grándiha', t5: '[Level 5] Luxury Patterned Fabric', t6: '[Level 6] Moonlit Crystal Lamp', t7: undefined, t7Port: 'Sausan Garrison Wharf' },
        { region: 'South', chain: 'South - Starry Midnight Port', t5: '[Level 5] Portrait of the Ancient', t6: '[Level 6] Moonshade Aged Wine', t7: undefined, t7Port: 'Sausan Garrison Wharf' }
      ];
      ensureCompleteT7Ports(trades, { north: 'A', south: 'C', east: 'B' }, barterTierPorts, barterT6T7Ports);
      const ports = trades.map(t => t.t7Port);
      expect(ports).toContain('Sausan Garrison Wharf');
      expect(ports).toContain('Sanctuary Coastal Outpost');
    });

    it('a real T7 item pins its authoritative port, overriding a duplicated read', () => {
      const trades = [
        { region: 'South', chain: 'South - Grándiha', t5: '[Level 5] Luxury Patterned Fabric', t6: '[Level 6] Moonlit Crystal Lamp', t7: '[Level 7] Omar Lava Powder', t7Port: 'Sausan Garrison Wharf' },
        { region: 'South', chain: 'South - Starry Midnight Port', t5: '[Level 5] Portrait of the Ancient', t6: '[Level 6] Moonshade Aged Wine', t7: '[Level 7] Top-Quality Hakinza Perfume', t7Port: 'Sausan Garrison Wharf' }
      ];
      ensureCompleteT7Ports(trades, { north: 'A', south: 'C', east: 'B' }, barterTierPorts, barterT6T7Ports);
      expect(trades[0].t7Port).toBe('Sausan Garrison Wharf');   // Omar Lava Powder -> Sausan
      expect(trades[1].t7Port).toBe('Sanctuary Coastal Outpost'); // Hakinza Perfume -> Sanctuary
    });

    it('replaces a read T7 that belongs to the wrong port with the port real item', () => {
      // A trade read as Sausan's item but pinned to Sanctuary (via its real T6)
      // must not keep the Sausan item - it becomes a real Sanctuary item from
      // the port's T6→T7 pairings.
      const trades = [
        { region: 'South', chain: 'South - Grándiha', t5: '[Level 5] Luxury Patterned Fabric', t6: '[Level 6] Moonlit Crystal Lamp', t7: '[Level 7] Omar Lava Powder', t7Port: 'Sausan Garrison Wharf' },
        { region: 'South', chain: 'South - Starry Midnight Port', t5: '[Level 5] Portrait of the Ancient', t6: '[Level 6] Moonshade Aged Wine', t7: '[Level 7] Omar Lava Powder', t7Port: 'Sausan Garrison Wharf' }
      ];
      ensureCompleteT7Ports(trades, { north: 'A', south: 'C', east: 'B' }, barterTierPorts, barterT6T7Ports);
      const starry = trades.find(t => t.chain === 'South - Starry Midnight Port');
      expect(starry.t7Port).toBe('Sanctuary Coastal Outpost');
      expect(starry.t7).toBe("[Level 7] Rusalka's Thorny Bouquet"); // a real Sanctuary item
    });

    it('pins the exact port from a real T6 item and fills a real received T7', () => {
      // Both T7s unread and both ports duplicate; the real T6 items determine
      // the exact ports (Moonshade -> Sanctuary, Moonlit Lamp -> Sausan) and the
      // received T7 items are filled from the ports' pairings.
      const trades = [
        { region: 'South', chain: 'South - Grándiha', t5: '[Level 5] Luxury Patterned Fabric', t6: '[Level 6] Moonlit Crystal Lamp', t7: undefined, t7Port: 'Sausan Garrison Wharf' },
        { region: 'South', chain: 'South - Starry Midnight Port', t5: '[Level 5] Portrait of the Ancient', t6: '[Level 6] Moonshade Aged Wine', t7: undefined, t7Port: 'Sausan Garrison Wharf' }
      ];
      ensureCompleteT7Ports(trades, { north: 'A', south: 'C', east: 'B' }, barterTierPorts, barterT6T7Ports);
      const grandiha = trades.find(t => t.chain === 'South - Grándiha');
      const starry = trades.find(t => t.chain === 'South - Starry Midnight Port');
      expect(grandiha.t7Port).toBe('Sausan Garrison Wharf');
      expect(starry.t7Port).toBe('Sanctuary Coastal Outpost');
      expect(grandiha.t7).toBe('[Level 7] Sausan Military Supply');
      expect(starry.t7).toBe("[Level 7] Rusalka's Thorny Bouquet");
    });

    it('routes both ports of a duplicated region in the final walkthrough', async () => {
      const trades = [
        {
          region: 'South', chain: 'South - Grándiha', island: 'Orffs Island',
          t4: "[Level 4] Pirate's Key", t5: '[Level 5] Luxury Patterned Fabric',
          t6: '[Level 6] Moonlit Crystal Lamp', t7: undefined, t7Port: 'Sausan Garrison Wharf'
        },
        {
          region: 'South', chain: 'South - Starry Midnight Port', island: 'Narvo Island',
          t4: '[Level 4] Headless Dragon Figurine', t5: '[Level 5] Portrait of the Ancient',
          t6: '[Level 6] Moonshade Aged Wine', t7: undefined, t7Port: 'Sausan Garrison Wharf'
        }
      ];
      const result = await optimizeRoute(trades, { north: 'A', south: 'C', east: 'B' }, false, 22450, 5400, 150);
      expect(result.error).toBeUndefined();
      const locs = new Set();
      for (const a of result.actions) {
        if (a.action === 'trade' && a.output && a.output.includes('Level 7')) locs.add(a.location);
      }
      expect(locs.has('Sausan Garrison Wharf')).toBe(true);
      expect(locs.has('Sanctuary Coastal Outpost')).toBe(true);
    });
  });
});
