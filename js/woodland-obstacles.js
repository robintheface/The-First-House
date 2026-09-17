// Draw and collide from the same normalized silhouettes.
const overlap = (p,o,r) => p.x < o.x+(r[0]+r[2])*o.w && p.x+p.w > o.x+r[0]*o.w
  && p.y < o.y+(r[1]+r[3])*o.h && p.y+p.h > o.y+r[1]*o.h;
export function breathPhase(o,time) { return Math.max(0,time-o.born)%2400; }
export function obstacleBoxes(o,time) {
  if(o.kind==='candle') return [[.08,.1,.84,.88]];
  const boxes=[[.34,.08,.31,.33],[.49,.36,.34,.51],[.5,.82,.32,.16]];
  if(breathPhase(o,time)>=900 && breathPhase(o,time)<1650) boxes.push([.02,.23,.33,.17]);
  return boxes;
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
  } else {
    const phase=breathPhase(o,time), warning=phase>=350&&phase<900, fire=phase>=900&&phase<1650;
    // Flame stays inside the reserved obstacle width, with a visible inhale first.
    if(fire){ctx.fillStyle='#e87530';ctx.beginPath();ctx.moveTo(.36,.25);ctx.lineTo(.14,.18);ctx.lineTo(.2,.27);ctx.lineTo(.01,.29);ctx.lineTo(.14,.35);ctx.lineTo(.08,.43);ctx.lineTo(.37,.38);ctx.closePath();ctx.fill();ctx.fillStyle='#ffe19a';ctx.beginPath();ctx.moveTo(.36,.29);ctx.lineTo(.1,.3);ctx.lineTo(.23,.35);ctx.lineTo(.36,.35);ctx.fill();}
    ctx.fillStyle='#b65f45';ctx.strokeStyle='#643a30';ctx.lineWidth=.024;
    ctx.beginPath();ctx.moveTo(.7,.53);ctx.quadraticCurveTo(.87,.62,.97,.43);ctx.quadraticCurveTo(.94,.85,.73,.8);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.ellipse(.66,.62,.19,.28,-.12,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle='#e4bd82';ctx.beginPath();ctx.ellipse(.59,.65,.095,.2,-.1,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#b65f45';ctx.beginPath();ctx.roundRect(.49,.77,.12,.2,.04);ctx.roundRect(.72,.79,.12,.19,.04);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(.55,.49);ctx.lineTo(.49,.3);ctx.lineTo(.41,.29);ctx.quadraticCurveTo(.3,.29,.34,.15);ctx.quadraticCurveTo(.36,.04,.53,.08);ctx.quadraticCurveTo(.68,.09,.65,.31);ctx.lineTo(.7,.48);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#f0d49c';for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(.64+i*.025,.28+i*.105);ctx.lineTo(.74+i*.025,.31+i*.105);ctx.lineTo(.67+i*.025,.36+i*.105);ctx.fill();}
    ctx.fillStyle=warning?'#ffdc71':'#fff3d4';ctx.beginPath();ctx.ellipse(.47,.17,.045,.063,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#352a24';ctx.beginPath();ctx.ellipse(.452,.17,.015,.035,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#643a30';ctx.beginPath();ctx.moveTo(.34,.29);ctx.lineTo(.48,.31);ctx.stroke();ctx.beginPath();ctx.moveTo(.56,.48);ctx.lineTo(.47,.55);ctx.lineTo(.43,.52);ctx.stroke();
    if(warning){ctx.strokeStyle='#bc7831';ctx.lineWidth=.018;for(let i=0;i<2;i++){ctx.beginPath();ctx.moveTo(.18,.19+i*.1);ctx.lineTo(.28,.22+i*.08);ctx.stroke();}}
  }
  ctx.restore();
}
