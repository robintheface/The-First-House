// Peek encounters enter, fire a spaced volley, then retreat offscreen.
export function stepDinosaurEncounter(o,time,dt,width) {
  if(o.encounter!=='peek') return false;
  const target=width-o.w*.78;
  o.phase ||= 'enter';
  if(o.phase==='enter') {
    o.x=Math.max(target,o.x-dt*.22);
    if(o.x===target) { o.phase='volley';o.chargeAt=time; }
  } else if(o.phase==='volley' && o.retreatAt!=null && time>=o.retreatAt) o.phase='retreat';
  if(o.phase==='retreat') o.x+=dt*.28;
  o.baseX=o.x;o.y=o.baseY;
  return o.phase==='retreat'&&o.x>width+30;
}
export function updateBreath(o,time,viewWidth,playerX) {
  if(o.encounter==='peek' && o.phase!=='volley') return null;
  if(o.fired) {
    if(o.encounter!=='peek' || o.shots>=o.shotLimit || time<o.nextShotAt) return null;
    o.fired=false;o.chargeAt=time;
  }
  if(o.chargeAt == null && o.x < viewWidth-40 && o.x > playerX+280) o.chargeAt=time;
  if(o.chargeAt == null || time-o.chargeAt<700) return null;
  o.fired=true;
  if(o.x<playerX+180) return null; // Never release a shot too close to dodge.
  o.flashUntil=time+180;
  if(o.encounter==='peek') {
    o.shots=(o.shots||0)+1;
    o.nextShotAt=time+650;
    if(o.shots>=o.shotLimit)o.retreatAt=time+400;
  } else o.jumpAt=time+220;
  return {x:o.x+o.w*.17,prevX:o.x+o.w*.17,y:o.y+o.h*.49,r:10,age:0};
}
export function stepFireballs(list,dt,speed) {
  for(let i=list.length-1;i>=0;i--){const f=list[i];f.prevX=f.x;f.x-=(speed+.19)*dt;f.age+=dt;if(f.x+f.r*4<0)list.splice(i,1);}
}
export function hitsFireball(p,f) {
  // Sweep the damaging core across the frame so a dropped frame cannot skip a hit.
  const r=f.r*.72;
  return p.x<Math.max(f.x,f.prevX)+r && p.x+p.w>Math.min(f.x,f.prevX)-r && p.y<f.y+r && p.y+p.h>f.y-r;
}
export function updateDinosaurJump(o,time) {
  if(o.jumpAt == null) { o.y=o.baseY; return; }
  const t=(time-o.jumpAt)/850;
  // One shallow, predictable jump after firing; no change to horizontal speed.
  o.y=o.baseY-(t>0&&t<1 ? 4*t*(1-t)*o.h*.62 : 0);
}
export function drawFireball(ctx,f,time,img) {
  const pulse=1+Math.sin(time*.018)*.045;
  const w=f.r*5*pulse,h=w*675/1270;
  ctx.save();ctx.translate(f.x,f.y);ctx.scale(-1,1);
  // Source faces right. Flip at render time so the bright core leads left.
  ctx.drawImage(img,60,240,1270,675,-w*.82,-h*.59,w,h);
  ctx.restore();
}
export function drawDinosaur(ctx,o,time,img,reducedMotion=false) {
  const charging=o.chargeAt!=null&&!o.fired;
  const charge=charging?Math.min(1,(time-o.chargeAt)/700):0;
  const recoil=time<o.flashUntil&&!reducedMotion?3:0;
  ctx.save();
  ctx.translate(o.x+o.w*.5+recoil,o.y+o.h);
  ctx.scale(1+charge*.025,1-charge*.025);
  ctx.drawImage(img,-o.w*.5,-o.h,o.w,o.h);ctx.restore();
  if(charging||time<o.flashUntil){const x=o.x+o.w*.17,y=o.y+o.h*.49,r=4+charge*7;
    const g=ctx.createRadialGradient(x,y,0,x,y,r*2);g.addColorStop(0,'#fff2a9');g.addColorStop(.4,'#ffc541cc');g.addColorStop(1,'#ff860000');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r*2,0,Math.PI*2);ctx.fill();
  }
}
