import { describe, it, expect } from 'vitest';
import { coinReward } from '../js/runner-style.js';

describe('runner coin combo scoring', () => {
  it('starts at 25 and rewards successive pickups', () => {
    expect([1, 2, 3, 4, 5, 6].map(coinReward)).toEqual([25, 27, 29, 31, 33, 35]);
  });
  it('caps long streaks below the server scoring rate limit', () => {
    expect(coinReward(10000)).toBe(35);
    // Fastest movement yields 37.5 points/s; coins spawn at most once/s.
    expect(37.5 + coinReward(10000)).toBeLessThan(80);
  });
  it('returns to the base reward when a new streak starts', () => {
    coinReward(30);
    expect(coinReward(1)).toBe(25);
  });
});
