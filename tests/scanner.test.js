import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { findNearTwins, buildTrades, parseT4t5 } from '../js/scanner.js';

const goods = JSON.parse(
  readFileSync(join(process.cwd(), 'assets', 'barterGoods.json'), 'utf-8')
);
const ports = JSON.parse(
  readFileSync(join(process.cwd(), 'assets', 'barterPorts.json'), 'utf-8')
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

  it('resolves a run-on duplicated anchor to the canonical island', () => {
    const boxes = [
      { x0: 0.02, y0: 0.1, y1: 0.14, text: 'Pujara Island Pujara Island ujara Islan' },
      { x0: 0.35, y0: 0.1, y1: 0.14, text: 'Level 4 Panacea' },
      { x0: 0.7, y0: 0.1, y1: 0.14, text: 'Level 5 Portrait of the Ancient' }
    ];
    const rows = parseT4t5(boxes, goods, ports);
    expect(rows).toHaveLength(1);
    expect(rows[0].island).toBe('Pujara Island');
    expect(rows[0].t4).toBe('[Level 4] Panacea');
    expect(rows[0].t5).toBe('[Level 5] Portrait of the Ancient');
  });

  it('does not double a T4→T5 row but flags the ambiguous trader', () => {
    const rows = [{
      island: 'Balvege Island',
      t4: "[Level 4] Marine Knights' Spear",
      t5: '[Level 5] 37 Year Old Herbal Wine'
    }];
    const t5t6 = [
      { trader: 'Grándiha', t5: '[Level 5] 37 Year Old Herbal Wine', t6: '[Level 6] Kamasylvian Sculpture' },
      { trader: 'Starry Midnight Port', t5: '[Level 5] 37 Year Old Herbal Wine', t6: '[Level 6] Moonlit Crystal Shard' }
    ];
    const t6t7 = [
      { port: 'Lema Island', t6: '[Level 6] Kamasylvian Sculpture', t7: '[Level 7] Balenos Rainbow Coral' },
      { port: 'Iliya Island', t6: '[Level 6] Moonlit Crystal Shard', t7: "[Level 7] Balenosian Sailor's Telescope" }
    ];
    const trades = buildTrades(rows, t5t6, t6t7);
    expect(trades).toHaveLength(1);
    // The other trader is surfaced with its own T6→T7 + port so the user can
    // pick the correct chain (and item/port) rather than us silently pruning.
    expect(trades[0].alternativeTraders).toHaveLength(1);
    const alt = trades[0].alternativeTraders[0];
    expect(alt.chain).toBe('Starry Midnight Port');
    expect(alt.t6).toBe('[Level 6] Moonlit Crystal Shard');
    expect(alt.t7).toBe("[Level 7] Balenosian Sailor's Telescope");
    expect(alt.t7Port).toBe('Iliya Island');
    expect(trades[0].warnings.some(w => w.kind === 'trader')).toBe(true);
  });

  it('collapses the same island row seen in both T4→T5 screenshots', () => {
    const rows = [
      { island: 'Balvege Island', t4: "[Level 4] Marine Knights' Spear", t5: '[Level 5] 37 Year Old Herbal Wine' },
      { island: 'Balvege Island', t4: "[Level 4] Marine Knights' Spear", t5: '[Level 5] 37 Year Old Herbal Wine' }
    ];
    const t5t6 = [
      { trader: 'Starry Midnight Port', t5: '[Level 5] 37 Year Old Herbal Wine', t6: '[Level 6] Moonlit Crystal Shard' }
    ];
    const trades = buildTrades(rows, t5t6, []);
    expect(trades).toHaveLength(1);
  });
});
