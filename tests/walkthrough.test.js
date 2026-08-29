import { describe, it, expect } from 'vitest';
import { generateWalkthrough } from '../js/walkthrough.js';

describe('walkthrough', () => {
  describe('generateWalkthrough', () => {
    it('should generate walkthrough for load_east_stock action', () => {
      const actions = [
        {
          location: 'Iliya Island',
          action: 'load_east_stock',
          items: ['102 Year Old Golden Herb', 'Golden Fish Scale']
        }
      ];

      const walkthrough = generateWalkthrough(actions);
      expect(walkthrough).toContain('Iliya Island');
      expect(walkthrough).toContain('102 Year Old Golden Herb');
      expect(walkthrough).toContain('Golden Fish Scale');
      expect(walkthrough).toContain('Load:');
      expect(walkthrough).toContain('Boat');
    });

    it('should generate walkthrough for trade_t5_to_t6 action', () => {
      const actions = [
        {
          location: 'Arehaza',
          action: 'trade_t5_to_t6',
          items: ['102 Year Old Golden Herb', 'Golden Fish Scale'],
          region: 'East'
        }
      ];

      const walkthrough = generateWalkthrough(actions);
      expect(walkthrough).toContain('Arehaza');
      expect(walkthrough).toContain('Barter:');
      expect(walkthrough).toContain('102 Year Old Golden Herb');
      expect(walkthrough).toContain('Golden Fish Scale');
    });

    it('should generate walkthrough for trade_t6_to_t7 action', () => {
      const actions = [
        {
          location: 'Olvia Coast',
          action: 'trade_t6_to_t7',
          region: 'C'
        }
      ];

      const walkthrough = generateWalkthrough(actions);
      expect(walkthrough).toContain('Olvia Coast');
    });

    it('should generate walkthrough for sell_t7 action', () => {
      const actions = [
        {
          location: 'Epheria Sentry Post',
          action: 'sell_t7'
        }
      ];

      const walkthrough = generateWalkthrough(actions);
      expect(walkthrough).toContain('Epheria Sentry Post');
      expect(walkthrough).toContain('Sell:');
    });

    it('should generate walkthrough for swap_ship_player action', () => {
      const actions = [
        {
          location: 'Lema Island',
          action: 'swap_ship_player',
          playerToShip: ['Panacea', 'Seashell Deco'],
          shipToPlayer: ['Octagonal Box', 'Mysterious Rock']
        }
      ];

      const walkthrough = generateWalkthrough(actions);
      expect(walkthrough).toContain('Lema Island');
      expect(walkthrough).toContain('Swap:');
      expect(walkthrough).toContain('Panacea');
      expect(walkthrough).toContain('Seashell Deco');
      expect(walkthrough).toContain('Octagonal Box');
      expect(walkthrough).toContain('Mysterious Rock');
    });

    it('should generate walkthrough for store_east_t5 action', () => {
      const actions = [
        {
          location: 'Epheria Sentry Post',
          action: 'store_east_t5',
          items: ['102 Year Old Golden Herb', 'Golden Fish Scale']
        }
      ];

      const walkthrough = generateWalkthrough(actions);
      expect(walkthrough).toContain('Epheria Sentry Post');
      expect(walkthrough).toContain('Store:');
      expect(walkthrough).toContain('102 Year Old Golden Herb');
      expect(walkthrough).toContain('Golden Fish Scale');
    });

    it('should generate walkthrough for load_south_t5_and_retrieve_east action', () => {
      const actions = [
        {
          location: 'Epheria Sentry Post',
          action: 'load_south_t5_and_retrieve_east',
          shipItems: ['Luxury Patterned Fabric', 'Portrait of the Ancient'],
          playerItems: ['102 Year Old Golden Herb', 'Golden Fish Scale']
        }
      ];

      const walkthrough = generateWalkthrough(actions);
      expect(walkthrough).toContain('Epheria Sentry Post');
      expect(walkthrough).toContain('Load:');
      expect(walkthrough).toContain('Luxury Patterned Fabric');
      expect(walkthrough).toContain('Portrait of the Ancient');
      expect(walkthrough).toContain('102 Year Old Golden Herb');
      expect(walkthrough).toContain('Golden Fish Scale');
    });

    it('should generate walkthrough for sell_t7_and_restock action', () => {
      const actions = [
        {
          location: 'Iliya Island',
          action: 'sell_t7_and_restock',
          items: ['102 Year Old Golden Herb', 'Golden Fish Scale']
        }
      ];

      const walkthrough = generateWalkthrough(actions);
      expect(walkthrough).toContain('Iliya Island');
      expect(walkthrough).toContain('Sell:');
      expect(walkthrough).toContain('Store:');
      expect(walkthrough).toContain('102 Year Old Golden Herb');
      expect(walkthrough).toContain('Golden Fish Scale');
    });

    it('removes a fromShip sell from the boat inventory (not the player)', () => {
      const actions = [
        { location: 'Olvia Coast', action: 'trade', input: '[Level 6] Fancy Camel Hide', output: '[Level 7] Traditional Balenos Decorative Anchor', count: 5 },
        { location: 'Olvia Coast', action: 'sell', items: [{ name: '[Level 7] Traditional Balenos Decorative Anchor', count: 5 }], fromShip: true }
      ];
      const walkthrough = generateWalkthrough(actions);
      expect(walkthrough).toContain('Sell:');
      // The sold T7 must be gone from the tracked boat inventory - otherwise the
      // ship would look permanently overweight.
      const ships = [...walkthrough.matchAll(/data-inv-ship="([^"]*)"/g)].map(m => m[1].replace(/&quot;/g, '"'));
      const finalShip = JSON.parse(ships[ships.length - 1]);
      expect(finalShip).toEqual({});
    });

    it('keeps a ship-sold item on the boat when the sell is from the player only', () => {
      // A normal `sell` (no fromShip) removes from the player, so the item stays
      // on the boat - used when the T7 was moved to the player first.
      const actions = [
        { location: 'Olvia Coast', action: 'trade', input: '[Level 6] Fancy Camel Hide', output: '[Level 7] Traditional Balenos Decorative Anchor', count: 5 },
        { location: 'Olvia Coast', action: 'sell', items: [{ name: '[Level 7] Traditional Balenos Decorative Anchor', count: 5 }] }
      ];
      const walkthrough = generateWalkthrough(actions);
      const ships = [...walkthrough.matchAll(/data-inv-ship="([^"]*)"/g)].map(m => m[1].replace(/&quot;/g, '"'));
      const finalShip = JSON.parse(ships[ships.length - 1]);
      expect(finalShip['[Level 7] Traditional Balenos Decorative Anchor']).toBe(5);
    });
  });
});
