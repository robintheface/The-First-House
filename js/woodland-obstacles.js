// Draw and collide from the same normalized silhouettes.
const overlap = (p,o,r) => p.x < o.x+(r[0]+r[2])*o.w && p.x+p.w > o.x+r[0]*o.w
  && p.y < o.y+(r[1]+r[3])*o.h && p.y+p.h > o.y+r[1]*o.h;
export function breathPhase(o,time) { return Math.max(0,time-o.born)%2400; }
export function obstacleBoxes(o,time) {
  if(o.kind==='candle') return [[.08,.1,.84,.88]];
  return [[.13,.26,.42,.29],[.29,.52,.45,.35],[.23,.84,.55,.13]];
}
export function hitsWoodland(p,o,time) { return obstacleBoxes(o,time).some(r=>overlap(p,o,r)); }
export function drawWoodland(ctx,o,time) {
  ctx.save();ctx.translate(o.x,o.y);ctx.scale(o.w,o.h);ctx.lineJoin='round';ctx.lineCap='round';ctx.lineWidth=.025;
  if(o.kind==='candle') {
    const stump=o.woodType==='stump';
    const bark=ctx.createLinearGradient(0,0,0,1);bark.addColorStop(0,'#ae7744');bark.addColorStop(.5,'#805232');bark.addColorStop(1,'#503a28');
    ctx.fillStyle=bark;ctx.strokeStyle='#483524';
    ctx.beginPath();ctx.roundRect(.08,.1,.84,.87,stump?.06:.16);ctx.fill();ctx.stroke();
    ctx.strokeStyle='#c58e52';ctx.lineWidth=.016;
    for(let i=0;i<4;i++){const y=.27+i*.15;ctx.beginPath();ctx.moveTo(.2,y);ctx.bezierCurveTo(.4,y-.06,.65,y+.06,.86,y-.02);ctx.stroke();}
    ctx.fillStyle='#d9ad70';ctx.strokeStyle='#62422b';ctx.lineWidth=.025;
    ctx.beginPath();ctx.ellipse(stump?.5:.2,stump?.16:.54,stump?.4:.12,stump?.12:.41,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.strokeStyle='#a77543';ctx.lineWidth=.012;
    for(const k of [.4,.7]){ctx.beginPath();ctx.ellipse(stump?.5:.2,stump?.16:.54,(stump?.4:.12)*k,(stump?.12:.41)*k,0,0,Math.PI*2);ctx.stroke();}
    ctx.fillStyle='#667648';ctx.beginPath();ctx.moveTo(.32,.11);ctx.quadraticCurveTo(.47,.04,.62,.11);ctx.lineTo(.84,.12);ctx.lineTo(.78,.2);ctx.lineTo(.57,.17);ctx.lineTo(.46,.23);ctx.closePath();ctx.fill();
  }
  ctx.restore();
}
