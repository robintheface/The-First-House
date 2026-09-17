import {it,expect} from 'vitest';
import {hitsWoodland,obstacleBoxes,LOG_VARIANTS,logSize} from '../js/woodland-obstacles.js';
const d={kind:'rugged',x:100,y:100,w:100,h:100,born:5000};
it('leaves empty space above logs safe but collides with their visible body',()=>{
 const o={kind:'candle',woodType:'horizontal-short',x:100,y:100,w:80,h:40};
 expect(hitsWoodland({x:125,y:85,w:10,h:10},o,0)).toBe(false);
 expect(hitsWoodland({x:125,y:115,w:10,h:10},o,0)).toBe(true);
});
it('keeps all collision regions within the obstacle bounds',()=>{
 for(const t of [0,5500,6000,6700])for(const r of obstacleBoxes(d,t)){
 expect(r[0]).toBeGreaterThanOrEqual(0);expect(r[1]).toBeGreaterThanOrEqual(0);
 expect(r[0]+r[2]).toBeLessThanOrEqual(1);expect(r[1]+r[3]).toBeLessThanOrEqual(1);
 }
});

it('offers four proportional shapes with safe transparent corners',()=>{
 for(const type of LOG_VARIANTS){
  const size=logSize(type);const o={kind:'candle',woodType:type,x:0,y:0,...size};
  expect(hitsWoodland({x:0,y:0,w:1,h:1},o,0)).toBe(false);
  expect(hitsWoodland({x:size.w*.5,y:size.h*.5,w:3,h:3},o,0)).toBe(true);
  expect(Math.max(size.w,size.h)/Math.min(size.w,size.h)).toBeCloseTo(2.4);
 }
 expect(logSize('horizontal-long').w).toBeGreaterThan(logSize('horizontal-short').w);
 expect(logSize('vertical-long').h).toBeGreaterThan(logSize('vertical-short').h);
});
