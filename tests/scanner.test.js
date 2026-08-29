import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { findNearTwins, buildTrades, parseT4t5, parseT5t6, parseT6t7, scanMapping } from '../js/scanner.js';

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

  it('resolves T6 ambiguity from the port list (no warning)', () => {    const tierPorts = JSON.parse(
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

  it('keeps the offering port for an alternative even when the T7 item was not read', () => {
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
      { port: 'Iliya Island', t6: '[Level 6] Moonlit Crystal Shard', t7: null }
    ];
    const trades = buildTrades(rows, t5t6, t6t7);
    const alt = trades[0].alternativeTraders[0];
    expect(alt.chain).toBe('Starry Midnight Port');
    expect(alt.t6).toBe('[Level 6] Moonlit Crystal Shard');
    expect(alt.t7).toBeNull();
    expect(alt.t7Port).toBe('Iliya Island');
  });

  it('offers the orphaned T5 so a misread trade can be reassigned to the correct island', () => {
    const rows = [
      { island: 'Balvege Island', t4: "[Level 4] Marine Knights' Spear", t5: '[Level 5] 37 Year Old Herbal Wine' },
      { island: 'Narvo Island', t4: '[Level 4] Stolen Pirate Dagger', t5: '[Level 5] 102 Year Old Golden Herb' }
    ];
    const t5t6 = [
      { trader: 'Grándiha', t5: '[Level 5] 37 Year Old Herbal Wine', t6: '[Level 6] Kamasylvian Sculpture' },
      { trader: 'Starry Midnight Port', t5: '[Level 5] 37 Year Old Herbal Wine', t6: '[Level 6] Moonlit Crystal Shard' }
    ];
    const t6t7 = [
      { port: 'Lema Island', t6: '[Level 6] Kamasylvian Sculpture', t7: '[Level 7] Balenos Rainbow Coral' },
      { port: 'Iliya Island', t6: '[Level 6] Moonlit Crystal Shard', t7: "[Level 7] Balenosian Sailor's Telescope" }
    ];
    const trades = buildTrades(rows, t5t6, t6t7);
    const amb = trades.find(t => t.alternativeTraders);
    expect(amb.orphanT5Options).toHaveLength(1);
    const o = amb.orphanT5Options[0];
    expect(o.t5).toBe('[Level 5] 102 Year Old Golden Herb');
    expect(o.island).toBe('Narvo Island');
    expect(o.t4).toBe('[Level 4] Stolen Pirate Dagger');
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

  it('does not let an unreadable T6→T7 port name through (strict anchor)', () => {
    const boxes = [
      { x0: 0.1, y0: 0.1, y1: 0.14, text: 'IIVERHELT' },
      { x0: 0.4, y0: 0.11, y1: 0.15, text: '[Level 6] Top-Quality Coconut Syrup' },
      { x0: 0.8, y0: 0.11, y1: 0.15, text: "[Level 7] Artisan's Seashell Necklace" }
    ];
    const rows = parseT6t7(boxes, goods, ports);
    expect(rows).toHaveLength(1);
    // A garbled port that matches none of the 6 valid T6→T7 ports is dropped,
    // never passed through as raw OCR text.
    expect(rows[0].port).toBeNull();
    // The T6 item is still read from the same row.
    expect(rows[0].t6).toBe('[Level 6] Top-Quality Coconut Syrup');
  });

  it('infers an unreadable port from its pair partner in the same screenshot', () => {    // Two T6→T7 rows from one region's pair: Lema read confidently, the other
    // (Iliya) garbled -> the garbled row is inferred as Iliya, Lema's partner.
    const boxes = [
      { x0: 0.1, y0: 0.1, y1: 0.14, text: 'Lema Island' },
      { x0: 0.4, y0: 0.11, y1: 0.15, text: '[Level 6] Valencia Sand Shield' },
      { x0: 0.8, y0: 0.11, y1: 0.15, text: '[Level 7] Balenos Rainbow Coral' },
      { x0: 0.1, y0: 0.3, y1: 0.34, text: 'IIVERHELT' },
      { x0: 0.4, y0: 0.31, y1: 0.35, text: '[Level 6] Top-Quality Coconut Syrup' },
      { x0: 0.8, y0: 0.31, y1: 0.35, text: "[Level 7] Artisan's Seashell Necklace" }
    ];
    const rows = parseT6t7(boxes, goods, ports);
    expect(rows).toHaveLength(2);
    expect(rows[0].port).toBe('Lema Island');
    expect(rows[1].port).toBe('Iliya Island');
  });

  it('derives the T6→T7 port from the T7 item (authoritative), overriding OCR', () => {
    const tierPorts = JSON.parse(
      readFileSync(join(process.cwd(), 'assets', 'barterTierPorts.json'), 'utf-8')
    );
    const rows = [{ island: 'Pujara Island', t4: '[Level 4] Panacea', t5: '[Level 5] Portrait of the Ancient' }];
    const t5t6 = [{ trader: 'Dallae Pier', t5: '[Level 5] Portrait of the Ancient', t6: '[Level 6] Top-Quality Blue Underglaze Porcelain Crate' }];
    // OCR misread the port as Lema, but Artisan's Seashell Necklace is actually
    // offered at Iliya - the authoritative item lookup must win.
    const t6t7 = [{ port: 'Lema Island', t6: '[Level 6] Top-Quality Blue Underglaze Porcelain Crate', t7: "[Level 7] Artisan's Seashell Necklace" }];
    const trades = buildTrades(rows, t5t6, t6t7, tierPorts);
    expect(trades).toHaveLength(1);
    expect(trades[0].t7).toBe("[Level 7] Artisan's Seashell Necklace");
    expect(trades[0].t7Port).toBe('Iliya Island');
  });

  it('drops the T7 port warning when the T7 item already determines the port', () => {
    const tierPorts = JSON.parse(
      readFileSync(join(process.cwd(), 'assets', 'barterTierPorts.json'), 'utf-8')
    );
    const rows = [{ island: 'Balvege Island', t4: '[Level 4] X', t5: '[Level 5] 102 Year Old Golden Herb' }];
    const t5t6 = [{ trader: 'Arehaza', t5: '[Level 5] 102 Year Old Golden Herb', t6: '[Level 6] Miniature Arehaza Lighthouse' }];
    // The port label was unreadable (kind:'port' warning), but the T7 item
    // (Balenos Salt Flower -> Iliya) pins the port authoritatively - the user
    // should NOT be asked to resolve a port that the item already determines.
    const t6t7 = [{
      port: null,
      t6: '[Level 6] Miniature Arehaza Lighthouse',
      t7: '[Level 7] Balenos Salt Flower',
      warnings: [{ field: 'port', kind: 'port', read: 'IEMXA', candidates: [{ name: 'Lema Island', score: 0.4 }] }]
    }];
    const trades = buildTrades(rows, t5t6, t6t7, tierPorts);
    expect(trades).toHaveLength(1);
    expect(trades[0].t7Port).toBe('Iliya Island');
    expect(trades[0].warnings || []).toHaveLength(0);
  });

  it('corrects a garbled trader from the T6 item (trader-specific)', () => {
    const tierPorts = JSON.parse(
      readFileSync(join(process.cwd(), 'assets', 'barterTierPorts.json'), 'utf-8')
    );
    const rows = [{ island: 'Theonil Island', t4: "[Level 4] Pirate's Key", t5: '[Level 5] Portrait of the Ancient' }];
    // OCR read the trader as "FACLEVE]" and guessed Dallae Pier, but the T6 item
    // (Miniature Arehaza Lighthouse) is produced only at Arehaza - the trade must
    // land in the East - Arehaza chain so its T7 port pair stays complete.
    const t5t6 = [{
      trader: 'Dallae Pier',
      t5: '[Level 5] Portrait of the Ancient',
      t6: '[Level 6] Miniature Arehaza Lighthouse',
      warnings: [{ field: 'trader', kind: 'port', read: 'FACLEVE]', item: 'Dallae Pier', candidates: [] }]
    }];
    const trades = buildTrades(rows, t5t6, [], tierPorts);
    expect(trades).toHaveLength(1);
    expect(trades[0].region).toBe('East');
    expect(trades[0].chain).toBe('Arehaza');
    expect(trades[0].t6).toBe('[Level 6] Miniature Arehaza Lighthouse');
    // The trader is now authoritative - no port warning remains.
    expect(trades[0].warnings || []).toHaveLength(0);
  });

  it('scanMapping recovers the regions from T6/T7 items despite garbled names', () => {
    const tierPorts = JSON.parse(
      readFileSync(join(process.cwd(), 'assets', 'barterTierPorts.json'), 'utf-8')
    );
    // Arehaza's trader is misread as Dallae (North) and its T6→T7 port label is
    // garbled (null) - the mapping must still come out as a clean bijection.
    const t5t6 = [
      { trader: 'Dallae Pier', t5: '[Level 5] Portrait of the Ancient', t6: '[Level 6] Miniature Arehaza Lighthouse' },
      { trader: 'Haemo Island', t5: '[Level 5] Azure Quartz', t6: '[Level 6] High-quality Ink-scented Box' },
      { trader: 'Grandiha', t5: '[Level 5] Luxury Patterned Fabric', t6: '[Level 6] Moonlit Crystal Lamp' }
    ];
    const t6t7 = [
      { port: null, t6: '[Level 6] Miniature Arehaza Lighthouse', t7: '[Level 7] Balenos Salt Flower' },
      { port: 'Olvia Coast', t6: '[Level 6] High-quality Ink-scented Box', t7: '[Level 7] Traditional Balenos Decorative Anchor' },
      { port: 'Sausan Garrison Wharf', t6: '[Level 6] Moonlit Crystal Lamp', t7: '[Level 7] Sausan Military Supply' }
    ];
    const mapping = scanMapping(t5t6, t6t7, tierPorts);
    expect(mapping).toEqual({ north: 'A', east: 'B', south: 'C' });
  });

  it('never lets raw OCR text through as a port - best-guess real island + port warning', () => {
    // A garbled island read ("SILVERHARD" for Pilava Island) must not land in
    // the table: the anchor becomes a real known port and a `port` warning is
    // recorded so the UI asks the user to pick.
    const boxes = [
      { x0: 0.02, y0: 0.1, y1: 0.14, text: 'SILVERHARD' },
      { x0: 0.35, y0: 0.1, y1: 0.14, text: 'Level 4 Panacea' },
      { x0: 0.7, y0: 0.1, y1: 0.14, text: 'Level 5 Portrait of the Ancient' }
    ];
    const rows = parseT4t5(boxes, goods, ports);
    expect(rows).toHaveLength(1);
    expect(rows[0].island).not.toBe('SILVERHARD');
    const known = Object.values(ports).filter(p => p.target_tier === 'level_5').map(p => p.name);
    expect(known).toContain(rows[0].island);
    expect(rows[0].warnings.some(w => w.kind === 'port' && w.field === 'island')).toBe(true);
    const pw = rows[0].warnings.find(w => w.kind === 'port');
    expect(pw.read).toBe('SILVERHARD');
    expect(pw.candidates.length).toBeGreaterThan(0);
  });

  it('keeps a garbled trader as a real known port + warning (so the row survives)', () => {
    const boxes = [
      { x0: 0.02, y0: 0.1, y1: 0.14, text: 'HARBUGLEC' },
      { x0: 0.35, y0: 0.1, y1: 0.14, text: 'Level 5 Mysterious Rock' },
      { x0: 0.7, y0: 0.1, y1: 0.14, text: 'Level 6 Moonlit Crystal Shard' }
    ];
    const rows = parseT5t6(boxes, goods, ports);
    expect(rows).toHaveLength(1);
    expect(rows[0].trader).not.toBe('HARBUGLEC');
    const known = Object.values(ports).filter(p => p.target_tier === 'level_6').map(p => p.name);
    expect(known).toContain(rows[0].trader);
    expect(rows[0].warnings.some(w => w.kind === 'port' && w.field === 'trader')).toBe(true);
  });

  it('resolves a lightly-garbled trader read (Aerhaza -> Arehaza) so the chain is not dropped', () => {
    // The original "misses East Arehaza" bug: a near-miss OCR read of the
    // trader must still resolve to the real port (no prompt needed) instead of
    // the row being dropped.
    const boxes = [
      { x0: 0.02, y0: 0.1, y1: 0.14, text: 'Aerhaza' },
      { x0: 0.35, y0: 0.1, y1: 0.14, text: 'Level 5 102 Year Old Golden Herb' },
      { x0: 0.7, y0: 0.1, y1: 0.14, text: 'Level 6 Golden Cactus Bouquet' }
    ];
    const rows = parseT5t6(boxes, goods, ports);
    expect(rows).toHaveLength(1);
    expect(rows[0].trader).toBe('Arehaza');
    expect(rows[0].warnings).toBeUndefined();
  });

  it('propagates an unresolved port warning through buildTrades', () => {
    const rows = [{
      island: 'Pilava Island',
      t4: '[Level 4] Panacea',
      t5: '[Level 5] Mysterious Rock',
      warnings: [{ field: 'island', kind: 'port', read: 'SILVERHARD', candidates: [{ name: 'Pilava Island', score: 0.4 }] }]
    }];
    const t5t6 = [{ trader: 'Haemo Island', t5: '[Level 5] Mysterious Rock', t6: null }];
    const trades = buildTrades(rows, t5t6, []);
    expect(trades).toHaveLength(1);
    expect(trades[0].warnings.some(w => w.kind === 'port' && w.field === 'island')).toBe(true);
  });
});
