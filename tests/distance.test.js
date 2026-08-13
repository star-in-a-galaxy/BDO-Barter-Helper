import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const barterPorts = JSON.parse(
  readFileSync(join(process.cwd(), 'assets', 'barterPorts.json'), 'utf-8')
);

function normName(name) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getDistance(loc1, loc2) {
  const key1 = normName(loc1);
  const key2 = normName(loc2);
  
  const port1 = Object.values(barterPorts).find(p => normName(p.name) === key1);
  const port2 = Object.values(barterPorts).find(p => normName(p.name) === key2);
  
  if (!port1 || !port2 || !port1.coordinates || !port2.coordinates) return 0;
  
  const [x1, y1] = port1.coordinates;
  const [x2, y2] = port2.coordinates;
  
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function calculateRouteDistance(route) {
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    total += getDistance(route[i], route[i + 1]);
  }
  return total;
}

describe('distance', () => {
  describe('getDistance', () => {
    it('should calculate distance between two locations', () => {
      const dist = getDistance('Iliya Island', 'Lema Island');
      expect(dist).toBeGreaterThan(0);
    });

    it('should handle case-insensitive names', () => {
      const dist = getDistance('iliya island', 'lema island');
      expect(dist).toBeGreaterThan(0);
    });

    it('should return 0 for unknown locations', () => {
      const dist = getDistance('Unknown Island', 'Lema Island');
      expect(dist).toBe(0);
    });

    it('should return 0 for locations without coordinates', () => {
      const dist = getDistance('Iliya Island', 'Unknown Island');
      expect(dist).toBe(0);
    });

    it('should handle Epheria Sentry Post', () => {
      const dist = getDistance('Iliya Island', 'Epheria Sentry Post');
      expect(dist).toBeGreaterThan(0);
    });
  });

  describe('calculateRouteDistance', () => {
    it('should calculate total distance for a route', () => {
      const route = ['Iliya Island', 'Lema Island'];
      const dist = calculateRouteDistance(route);
      expect(dist).toBeGreaterThan(0);
    });

    it('should return 0 for single location route', () => {
      const route = ['Iliya Island'];
      const dist = calculateRouteDistance(route);
      expect(dist).toBe(0);
    });

    it('should return 0 for empty route', () => {
      const route = [];
      const dist = calculateRouteDistance(route);
      expect(dist).toBe(0);
    });

    it('should handle route with unknown locations', () => {
      const route = ['Iliya Island', 'Unknown Island', 'Lema Island'];
      const dist = calculateRouteDistance(route);
      expect(dist).toBe(0);
    });
  });
});
