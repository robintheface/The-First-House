import {it,expect} from 'vitest';
import {wrapBackground,drawBackground} from '../js/runner-background.js';
it('preserves overshoot when crossing one or several loop boundaries',()=>{
 expect(wrapBackground(998,5,1000)).toBe(3);
 expect(wrapBackground(998,3005,1000)).toBe(3);
 expect(wrapBackground(0,.18,1000)).toBeCloseTo(.18);
});
it('draws full coverage at both sides of the repeat boundary without gaps',()=>{
 for(const offset of [0,.5,899.9]){
  const spans=[];drawBackground({drawImage:(_,x,y,w)=>spans.push([x,x+w])},{width:900},offset,1600,375);
  expect(spans[0][0]).toBeLessThanOrEqual(0);
  expect(spans.at(-1)[1]).toBeGreaterThanOrEqual(1600);
  for(let i=1;i<spans.length;i++)expect(spans[i][0]).toBeLessThanOrEqual(spans[i-1][1]);
 }
});
