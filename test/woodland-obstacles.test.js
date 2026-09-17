import {it,expect} from 'vitest';
import {hitsWoodland,obstacleBoxes} from '../js/woodland-obstacles.js';
const d={kind:'rugged',x:100,y:100,w:100,h:100,born:5000};
it('warns before fire can collide and stops damage when the flame ends',()=>{
 const p={x:110,y:128,w:5,h:5};
 expect(hitsWoodland(p,d,5500)).toBe(false);
 expect(hitsWoodland(p,d,6000)).toBe(true);
 expect(hitsWoodland(p,d,6700)).toBe(false);
});
it('leaves empty space above logs safe but collides with their visible body',()=>{
 const o={kind:'candle',x:100,y:100,w:80,h:40};
 expect(hitsWoodland({x:125,y:85,w:10,h:10},o,0)).toBe(false);
 expect(hitsWoodland({x:125,y:115,w:10,h:10},o,0)).toBe(true);
});
it('keeps all collision regions within the obstacle bounds',()=>{
 for(const t of [0,5500,6000,6700])for(const r of obstacleBoxes(d,t)){
 expect(r[0]).toBeGreaterThanOrEqual(0);expect(r[1]).toBeGreaterThanOrEqual(0);
 expect(r[0]+r[2]).toBeLessThanOrEqual(1);expect(r[1]+r[3]).toBeLessThanOrEqual(1);
 }
});
