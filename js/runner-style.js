// Canvas candle illustration; collision geometry stays in dino-game.js.
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
