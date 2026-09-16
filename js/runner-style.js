// Small canvas illustrations; collision geometry stays in dino-game.js.
export function coinReward(streak) { return 25 + Math.min(5, Math.max(0, streak - 1)) * 2; }
export function drawRobin(ctx, x, y, w, h, time, pose, mood) {
  ctx.save(); ctx.translate(x, y); ctx.scale(w / 76, h / 90);
  const run = pose === 'run'; const dead = pose === 'over';
  const stride = run ? Math.sin(time * .018) : 0;
  const bob = run ? Math.abs(stride) * 2 : 0;
  ctx.translate(0, bob + (dead ? 20 : 0));
  if (dead) ctx.scale(1, .77);
  ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.strokeStyle = '#142b21';
  const shape = (color, points) => { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(...points[0]); for (const p of points.slice(1)) ctx.lineTo(...p); ctx.closePath(); ctx.fill(); ctx.stroke(); };
  // Cape, boots, tunic and belt.
  shape('#305b32', [[29,38],[10,48],[4,70+stride*4],[24,65],[39,70],[47,43]]);
  ctx.strokeStyle='#263124'; ctx.lineWidth=9; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(35,68);ctx.lineTo(30+stride*8,83);ctx.lineTo(37+stride*8,84);ctx.stroke();
  ctx.beginPath();ctx.moveTo(48,68);ctx.lineTo(51-stride*8,82);ctx.lineTo(59-stride*8,83);ctx.stroke();
  ctx.lineWidth=2;ctx.strokeStyle='#142b21';
  shape('#5c883c',[[28,39],[52,40],[59,71],[26,71]]);
  ctx.fillStyle='#745035';ctx.fillRect(27,61,29,6);ctx.fillStyle='#e8c778';ctx.fillRect(40,61,6,6);
  // Oversized hood with pointed crown and a cream face.
  shape('#3d7435',[[20,39],[15,23],[23,9],[53,3],[50,12],[63,23],[61,43],[45,50],[27,46]]);
  ctx.fillStyle='#f4dfb4';ctx.beginPath();ctx.ellipse(42,30,17,18,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle='#213329';
  if(dead){ctx.lineWidth=2;for(const ex of [37,48]){ctx.beginPath();ctx.moveTo(ex-2,27);ctx.lineTo(ex+2,31);ctx.moveTo(ex+2,27);ctx.lineTo(ex-2,31);ctx.stroke();}}
  else {for(const ex of [37,49]){ctx.beginPath();ctx.ellipse(ex,28,mood==='panic'?3:2,mood==='panic'?4:2.8,0,0,Math.PI*2);ctx.fill();}}
  ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(32,22);ctx.lineTo(39,23);ctx.moveTo(45,22);ctx.lineTo(52,20);ctx.stroke();
  ctx.beginPath();
  if(mood==='panic'){ctx.ellipse(44,38,3,4,0,0,Math.PI*2);ctx.fill();}
  else {ctx.moveTo(39,37);ctx.quadraticCurveTo(45,mood==='happy'?44:39,50,36);ctx.stroke();}
  ctx.fillStyle='#c8876c66';ctx.beginPath();ctx.ellipse(31,34,3,2,0,0,7);ctx.fill();
  // Hat brim and feather.
  shape('#76a548',[[17,19],[28,10],[55,11],[66,19],[42,17]]);
  shape('#e9c66a',[[25,12],[10,5],[6,9],[23,16]]);
  // Arms cradle the coin bag in the air.
  ctx.strokeStyle='#3d7435';ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(52,48);ctx.lineTo(pose==='jump'?56:60,pose==='jump'?55:59+stride*3);ctx.stroke();
  if(pose==='jump'||dead){ctx.fillStyle='#be9145';ctx.strokeStyle='#594525';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(57,59,10,12,-.2,0,7);ctx.fill();ctx.stroke();ctx.fillStyle='#ffe0a1';ctx.font='bold 12px serif';ctx.fillText('$',53,63);}
  if(mood==='panic'&&!dead){ctx.fillStyle='#abdbea';ctx.beginPath();ctx.ellipse(66,30,3,5,.3,0,7);ctx.fill();}
  ctx.restore();
}
export function drawCandle(ctx,o,time){
  ctx.save();ctx.translate(o.x,o.y);
  const w=o.w,h=o.h,bodyTop=h*.14,bodyH=h*.72;
  ctx.strokeStyle='#712c35';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(w*.5,0);ctx.lineTo(w*.5,h);ctx.stroke();
  const fill=ctx.createLinearGradient(0,0,w,0);fill.addColorStop(0,'#a83549');fill.addColorStop(.45,'#eb6a67');fill.addColorStop(1,'#b44151');
  ctx.fillStyle=fill;ctx.strokeStyle='#572e34';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(w*.1,bodyTop,w*.8,bodyH,Math.min(5,w*.15));ctx.fill();ctx.stroke();
  const eyeY=bodyTop+Math.min(bodyH*.4,25),eyeGap=w*.15;
  ctx.strokeStyle='#40232b';ctx.lineWidth=2;
  for(const side of [-1,1]){const ex=w*.5+eyeGap*side;ctx.beginPath();ctx.moveTo(ex-side*4,eyeY-5);ctx.lineTo(ex+side*3,eyeY-8);ctx.stroke();ctx.fillStyle='#ffe1bb';ctx.fillRect(ex-2,eyeY-2,4,4);}
  ctx.beginPath();ctx.moveTo(w*.4,eyeY+10);ctx.quadraticCurveTo(w*.5,eyeY+6,w*.6,eyeY+10);ctx.stroke();
  ctx.fillStyle='#ffc16c';ctx.beginPath();ctx.moveTo(w*.5,-7-Math.sin(time*.014+o.baseX)*2);ctx.quadraticCurveTo(w*.75,2,w*.5,4);ctx.quadraticCurveTo(w*.28,2,w*.5,-7);ctx.fill();ctx.restore();
}
