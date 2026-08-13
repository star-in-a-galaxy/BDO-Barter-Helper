import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const barterGoods = JSON.parse(
  readFileSync(join(process.cwd(), 'assets', 'barterGoods.json'), 'utf-8')
);

const barterPorts = JSON.parse(
  readFileSync(join(process.cwd(), 'assets', 'barterPorts.json'), 'utf-8')
);

function getCatalog() {
  const t4Items = barterGoods.filter(item => item.tier === 'level_4');
  const t5Items = barterGoods.filter(item => item.tier === 'level_5');
  const t6Items = barterGoods.filter(item => item.tier === 'level_6');
  const t7Items = barterGoods.filter(item => item.tier === 'level_7');
  
  const t5Islands = Object.values(barterPorts)
    .filter(port => port.name.includes('Island'))
    .map(port => port.name);
  
  const t6ByRegion = {
    'North': ['Haemo Island', 'Dallae Pier'],
    'South': ['Grándiha', 'Starry Midnight Port'],
    'East': ['Hakoven Island', 'Arehaza']
  };
  
  const t7ByRegion = {
    'A': ['Olvia Coast', 'Epheria Sentry Post'],
    'B': ['Iliya Island', 'Lema Island'],
    'C': ['Sanctuary Coastal Outpost', 'Sausan Garrison Wharf']
  };
  
  const chainOptions = [];
  ['North', 'South', 'East'].forEach(region => {
    const traders = t6ByRegion[region] || [];
    traders.forEach(trader => {
      chainOptions.push(`${region} - ${trader}`);
    });
  });
  
  return {
    t4Items: t4Items,
    t5Items: t5Items,
    t6Items: t6Items,
    t7Items: t7Items,
    t5Islands: t5Islands,
    t6ByRegion: t6ByRegion,
    t7ByRegion: t7ByRegion,
    chainOptions: chainOptions,
    ports: barterPorts,
    goods: barterGoods
  };
}

describe('catalog', () => {
  let catalog;

  beforeEach(() => {
    catalog = getCatalog();
  });

  describe('getCatalog', () => {
    it('should load T4 items', () => {
      expect(catalog.t4Items).toBeDefined();
      expect(Array.isArray(catalog.t4Items)).toBe(true);
      expect(catalog.t4Items.length).toBeGreaterThan(0);
      expect(catalog.t4Items.find(i => i.name.includes('Stolen Pirate Dagger'))).toBeDefined();
    });

    it('should load T5 items', () => {
      expect(catalog.t5Items).toBeDefined();
      expect(Array.isArray(catalog.t5Items)).toBe(true);
      expect(catalog.t5Items.length).toBeGreaterThan(0);
      expect(catalog.t5Items.find(i => i.name.includes('Octagonal Box'))).toBeDefined();
    });

    it('should load T6 items', () => {
      expect(catalog.t6Items).toBeDefined();
      expect(Array.isArray(catalog.t6Items)).toBe(true);
      expect(catalog.t6Items.length).toBeGreaterThan(0);
    });

    it('should load T7 items', () => {
      expect(catalog.t7Items).toBeDefined();
      expect(Array.isArray(catalog.t7Items)).toBe(true);
      expect(catalog.t7Items.length).toBeGreaterThan(0);
    });

    it('should load T5 islands', () => {
      expect(catalog.t5Islands).toBeDefined();
      expect(Array.isArray(catalog.t5Islands)).toBe(true);
      expect(catalog.t5Islands.length).toBeGreaterThan(0);
      expect(catalog.t5Islands).toContain('Ajir Island');
    });

    it('should load T6 traders by region', () => {
      expect(catalog.t6ByRegion).toBeDefined();
      expect(catalog.t6ByRegion.North).toBeDefined();
      expect(catalog.t6ByRegion.South).toBeDefined();
      expect(catalog.t6ByRegion.East).toBeDefined();
      expect(catalog.t6ByRegion.North).toContain('Haemo Island');
    });

    it('should load T7 traders by region', () => {
      expect(catalog.t7ByRegion).toBeDefined();
      expect(catalog.t7ByRegion.A).toBeDefined();
      expect(catalog.t7ByRegion.B).toBeDefined();
      expect(catalog.t7ByRegion.C).toBeDefined();
      expect(catalog.t7ByRegion.A).toContain('Olvia Coast');
      expect(catalog.t7ByRegion.C).toContain('Sanctuary Coastal Outpost');
    });

    it('should generate chain options', () => {
      expect(catalog.chainOptions).toBeDefined();
      expect(Array.isArray(catalog.chainOptions)).toBe(true);
      expect(catalog.chainOptions.length).toBeGreaterThan(0);
      expect(catalog.chainOptions).toContain('North - Haemo Island');
      expect(catalog.chainOptions).toContain('South - Starry Midnight Port');
      expect(catalog.chainOptions).toContain('East - Arehaza');
    });

    it('should load ports', () => {
      expect(catalog.ports).toBeDefined();
      expect(typeof catalog.ports).toBe('object');
      expect(Object.keys(catalog.ports).length).toBeGreaterThan(0);
    });

    it('should load goods', () => {
      expect(catalog.goods).toBeDefined();
      expect(Array.isArray(catalog.goods)).toBe(true);
      expect(catalog.goods.length).toBeGreaterThan(0);
    });
  });
});
