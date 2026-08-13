import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { seaPath } from '../js/sea-routes.js';

const ports = Object.values(JSON.parse(
  readFileSync(join(process.cwd(), 'assets', 'barterPorts.json'), 'utf-8')
));

const straight = (a, b) => {
  const ca = ports.find(p => p.name === a).coordinates;
  const cb = ports.find(p => p.name === b).coordinates;
  return Math.hypot(cb[0] - ca[0], cb[1] - ca[1]);
};

describe('sea-routes', () => {
  it('routes Starry -> Sausan around the continent via Grandiha and its gap', () => {
    const r = seaPath('Starry Midnight Port', 'Sausan Garrison Wharf', ports);
    expect(r).not.toBeNull();
    expect(r.path[0]).toBe('Starry Midnight Port');
    expect(r.path).toContain('Grandiha');
    expect(r.path).toContain('Grandiha Gap');
    expect(r.path[r.path.length - 1]).toBe('Sausan Garrison Wharf');
    expect(r.distance).toBeGreaterThan(straight('Starry Midnight Port', 'Sausan Garrison Wharf'));
  });

  it('does not overshoot a shared lane (Arehaza -> Hakoven)', () => {
    const r = seaPath('Arehaza', 'Hakoven Island', ports);
    expect(r).not.toBeNull();
    expect(r.path).toEqual(['Arehaza', 'Hakoven Island']);
    expect(r.distance).toBeCloseTo(straight('Arehaza', 'Hakoven Island'), 0);
  });

  it('routes Arehaza -> Sausan via Hakoven and its gap', () => {
    const r = seaPath('Arehaza', 'Sausan Garrison Wharf', ports);
    expect(r).not.toBeNull();
    expect(r.path).toContain('Hakoven Island');
    expect(r.path).toContain('Hakoven Gap');
    expect(r.path).not.toContain('Shirna Island');
    expect(r.path[r.path.length - 1]).toBe('Sausan Garrison Wharf');
  });

  it('leaves unrouted pairs as a straight line', () => {
    const r = seaPath('Haemo Island', 'Dallae Pier', ports);
    expect(r).not.toBeNull();
    expect(r.path).toEqual(['Haemo Island', 'Dallae Pier']);
    expect(r.distance).toBeCloseTo(straight('Haemo Island', 'Dallae Pier'), 0);
  });

  it('routes Iliya via its south waypoint', () => {
    const r = seaPath('Iliya Island', 'Sausan Garrison Wharf', ports);
    expect(r).not.toBeNull();
    expect(r.path).toContain('Iliya South');
    expect(r.path[0]).toBe('Iliya Island');
  });
});
