import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { findNearTwins, buildTrades } from '../js/scanner.js';

const goods = JSON.parse(
  readFileSync(join(process.cwd(), 'assets', 'barterGoods.json'), 'utf-8')
);

describe('scanner near-twin warnings', () => {
  it('flags Marine Knights Helm / Spear (same-tier, shared prefix)', () => {
    const twins = findNearTwins("[Level 4] Marine Knights' Helm", goods);
    expect(twins).toContain("[Level 4] Marine Knights' Spear");
  });

  it('does not flag same-tier items that only share a short prefix', () => {
    const twins = findNearTwins('[Level 6] Golden Cactus Bouquet', goods);
    expect(twins).not.toContain('[Level 6] Golden Sand Ring');
  });

  it('does not flag items from other tiers', () => {
    // "Golden Sand" is a level-1 item, not a twin of a level-5 item
    const twins = findNearTwins('[Level 5] Golden Fish Scale', goods);
    expect(twins.some(t => t.includes('Golden Sand'))).toBe(false);
  });

  it('propagates warnings through buildTrades', () => {
    const rows = [{
      island: 'Baremi Island',
      t4: "[Level 4] Marine Knights' Helm",
      t5: '[Level 5] Mysterious Rock',
      warnings: [{
        field: 't4',
        item: "[Level 4] Marine Knights' Helm",
        read: 'Marine Knights Helm',
        alternatives: ["[Level 4] Marine Knights' Spear"]
      }]
    }];
    const t5t6 = [{ trader: 'Haemo Island', t5: '[Level 5] Mysterious Rock', t6: null }];
    const trades = buildTrades(rows, t5t6, []);
    expect(trades).toHaveLength(1);
    expect(trades[0].warnings).toHaveLength(1);
    expect(trades[0].warnings[0].alternatives).toContain("[Level 4] Marine Knights' Spear");
  });

  it('resolves T6 ambiguity from the port list (no warning)', () => {
    const tierPorts = JSON.parse(
      readFileSync(join(process.cwd(), 'assets', 'barterTierPorts.json'), 'utf-8')
    );
    const rows = [{ island: 'Orffs Island', t4: '[Level 4] X', t5: '[Level 5] Luxury Patterned Fabric' }];
    const t5t6 = [{
      trader: 'Grandiha',
      t5: '[Level 5] Luxury Patterned Fabric',
      t6: "[Level 6] Moonlit Crystal Shard",
      warnings: [{
        field: 't6',
        item: "[Level 6] Moonlit Crystal Shard",
        read: 'Moonlit Crystal',
        alternatives: ["[Level 6] Moonlit Crystal Lamp"]
      }]
    }];
    const trades = buildTrades(rows, t5t6, [], tierPorts);
    expect(trades[0].t6).toBe("[Level 6] Moonlit Crystal Lamp"); // Grandiha's item
    expect(trades[0].warnings).toBeUndefined();
  });
});
