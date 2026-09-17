import {it,expect} from 'vitest';
import {stepDinosaurEncounter,updateBreath,updateDinosaurJump,stepFireballs,hitsFireball} from '../js/dinosaur-fire.js';
it('requires a visible warning and fires once per dinosaur',()=>{
 const o={x:700,y:200,w:100,h:90};
 expect(updateBreath(o,1000,800,100)).toBeNull();
 expect(updateBreath(o,1699,800,100)).toBeNull();
 expect(updateBreath(o,1700,800,100)).not.toBeNull();
 expect(updateBreath(o,3000,800,100)).toBeNull();
});
it('does not shoot from offscreen or too close',()=>{
 const o={x:900,y:0,w:100,h:90};expect(updateBreath(o,0,800,100)).toBeNull();expect(o.chargeAt).toBeUndefined();
 o.x=700;updateBreath(o,1000,800,100);o.x=200;expect(updateBreath(o,1700,800,100)).toBeNull();
});
it('moves independently and sweeps collision without damaging from its tail',()=>{
 const f={x:200,prevX:200,y:100,r:10,age:0};const list=[f];stepFireballs(list,100,.8);
 expect(f.x).toBeCloseTo(101);expect(hitsFireball({x:150,y:95,w:10,h:10},f)).toBe(true);
 expect(hitsFireball({x:220,y:95,w:10,h:10},f)).toBe(false);
 expect(hitsFireball({x:150,y:70,w:10,h:10},f)).toBe(false);
 stepFireballs(list,1000,.8);expect(list).toHaveLength(0);
});

it('jumps after firing and returns to exactly the ground position',()=>{
 const o={baseY:200,y:200,h:80,jumpAt:1000};
 updateDinosaurJump(o,900);expect(o.y).toBe(200);
 updateDinosaurJump(o,1425);expect(o.y).toBeCloseTo(150.4);
 updateDinosaurJump(o,1850);expect(o.y).toBe(200);
 updateDinosaurJump(o,3000);expect(o.y).toBe(200);
});

it('peeks, fires a bounded volley with fresh warnings, and retreats',()=>{
 const o={encounter:'peek',x:820,w:100,h:80,baseY:200,y:200,shotLimit:3};let shots=0;
 for(let time=0;time<7000;time+=20){
  const done=stepDinosaurEncounter(o,time,20,800);
  if(updateBreath(o,time,800,100))shots++;
  if(done)break;
 }
 expect(shots).toBe(3);expect(o.phase).toBe('retreat');expect(o.x).toBeGreaterThan(830);
 expect(o.jumpAt).toBeUndefined();
});
it('does not fire during entry or retreat',()=>{
 for(const phase of ['enter','retreat'])expect(updateBreath({encounter:'peek',phase,x:720,chargeAt:0},2000,800,100)).toBeNull();
});
