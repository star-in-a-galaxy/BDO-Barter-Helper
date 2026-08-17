import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const barterPorts = JSON.parse(
  readFileSync(join(process.cwd(), 'assets', 'barterPorts.json'), 'utf-8')
);

vi.mock('../js/catalog.js', () => ({
  loadBarterPorts: () => Promise.resolve(barterPorts)
}));

const { optimizeRoute } = await import('../js/optimizer.js');
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
});
