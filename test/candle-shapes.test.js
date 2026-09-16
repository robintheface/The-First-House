import { it, expect } from 'vitest';
import { CANDLE_TYPES, candleGeometry, hitsCandle } from '../js/runner-style.js';
it('keeps every silhouette within its obstacle bounds', () => {
  for (const candleType of CANDLE_TYPES) {
    const body = candleGeometry({w:40,h:90,candleType});
    expect(body.y).toBeGreaterThanOrEqual(0);
    expect(body.y+body.h).toBeLessThanOrEqual(90);
  }
});
it('hammer collides with its body and wick but not the empty sides', () => {
  const o = {x:100,y:100,w:40,h:100,candleType:'hammer'};
  expect(hitsCandle({x:105,y:112,w:8,h:8},o)).toBe(true);
  expect(hitsCandle({x:117,y:160,w:6,h:8},o)).toBe(true);
  expect(hitsCandle({x:105,y:160,w:8,h:8},o)).toBe(false);
});
it('inverted hammer puts the body at the lower end', () => {
  const o = {x:100,y:100,w:40,h:100,candleType:'inverted'};
  expect(hitsCandle({x:105,y:112,w:8,h:8},o)).toBe(false);
  expect(hitsCandle({x:105,y:170,w:8,h:8},o)).toBe(true);
});
