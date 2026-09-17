export function updateBreath(o,time,viewWidth,playerX) {
  if(o.fired) return null;
  if(o.chargeAt == null && o.x < viewWidth-40 && o.x > playerX+280) o.chargeAt=time;
  if(o.chargeAt == null || time-o.chargeAt<700) return null;
  o.fired=true;
  if(o.x<playerX+180) return null; // Never release a shot too close to dodge.
  o.flashUntil=time+180;
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
export function drawFireball(ctx,f,time) {
  const r=f.r,flutter=Math.sin(time*.025)*r*.2;
  ctx.save();ctx.translate(f.x,f.y);
  ctx.fillStyle='#f36d20';ctx.beginPath();ctx.moveTo(-r,0);ctx.quadraticCurveTo(0,-r*1.3,r*3,-r*.7+flutter);ctx.lineTo(r*1.8,0);ctx.lineTo(r*3,r*.7+flutter);ctx.quadraticCurveTo(0,r*1.3,-r,0);ctx.fill();
  const glow=ctx.createRadialGradient(0,0,0,0,0,r*1.6);glow.addColorStop(0,'#fff9cd');glow.addColorStop(.45,'#ffd54e');glow.addColorStop(.75,'#ff8b22');glow.addColorStop(1,'#ff6a0000');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,r*1.6,0,Math.PI*2);ctx.fill();ctx.restore();
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
