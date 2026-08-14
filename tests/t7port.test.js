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

    const result = await optimizeRoute(trades, { north: 'A', south: 'C', east: 'B' }, false, 22450, 5400, 150, true, false);
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

    // The T7 sells happen at the same actual ports.
    const sellByItem = {};
    for (const a of result.actions) {
      if (a.action === 'sell') {
        for (const it of a.items) sellByItem[it.name] = a.location;
      }
    }
    expect(sellByItem['[Level 7] Omar Lava Powder']).toBe('Sausan Garrison Wharf');
    expect(sellByItem['[Level 7] Top-Quality Hakinza Perfume']).toBe('Sanctuary Coastal Outpost');
  });
});
