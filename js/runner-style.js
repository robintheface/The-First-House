// Canvas candle illustration; collision geometry stays in dino-game.js.
export function drawCandle(ctx,o,time){
  ctx.save();ctx.translate(o.x,o.y);
  const w=o.w,h=o.h,bodyTop=h*.14,bodyH=h*.72;
  ctx.strokeStyle='#92202b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(w*.5,0);ctx.lineTo(w*.5,h);ctx.stroke();
  const fill=ctx.createLinearGradient(0,0,w,0);fill.addColorStop(0,'#b51929');fill.addColorStop(.45,'#ed3440');fill.addColorStop(1,'#951323');
  ctx.fillStyle=fill;ctx.strokeStyle='#4b1c20';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(w*.1,bodyTop,w*.8,bodyH,Math.min(5,w*.15));ctx.fill();ctx.stroke();
  // A stable expression per obstacle, scaled to fit even short candles.
  ctx.save();
  ctx.translate(w * .5, bodyTop + bodyH * .46);
  const faceScale = Math.min(w * .7 / 28, bodyH * .72 / 28);
  ctx.scale(faceScale, faceScale);
  ctx.strokeStyle = '#351b1c'; ctx.fillStyle = '#ffe8c3';
  ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  const mood = o.expression || 'angry';
  const curve = (x1,y1,cx,cy,x2,y2) => {
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.quadraticCurveTo(cx,cy,x2,y2); ctx.stroke();
  };
  for (const side of [-1,1]) {
    const x = side * 7;
    if (mood === 'sleepy' || (mood === 'smug' && side === 1)) {
      curve(x-3,-2,x,1,x+3,-2);
    } else {
      ctx.fillStyle = '#ffe8c3'; ctx.beginPath();
      ctx.ellipse(x,-2,mood === 'shocked' ? 4 : 3.3,mood === 'shocked' ? 5 : 4,0,0,Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#351b1c'; ctx.beginPath();
      ctx.ellipse(x+(mood === 'confused' ? 1 : 0),-1,1.5,2,0,0,Math.PI*2); ctx.fill();
    }
    if (mood === 'angry') curve(x-side*4,-9,x,-8,x+side*3,-6);
    else if (mood === 'sad') curve(x-side*3,-9,x,-8,x+side*4,-6);
    else if (mood === 'shocked') curve(x-3,-10,x,-13,x+3,-10);
    else if (mood === 'confused') curve(x-3,side === -1 ? -11 : -7,x,-9,x+3,-8);
  }
  ctx.fillStyle = '#351b1c';
  if (mood === 'shocked') {
    ctx.beginPath(); ctx.ellipse(0,9,3.5,5,0,0,Math.PI*2); ctx.fill();
  } else if (mood === 'smug') curve(-5,7,1,13,7,4);
  else if (mood === 'sleepy') curve(-3,9,0,7,3,9);
  else if (mood === 'confused') curve(-4,9,0,11,5,8);
  else curve(-6,11,0,mood === 'sad' ? 3 : 5,6,11);
  if (mood === 'sad') {
    ctx.fillStyle = '#a9e2ec'; ctx.beginPath();
    ctx.ellipse(10,6,2,3.5,-.2,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle='#ffc16c';ctx.beginPath();ctx.moveTo(w*.5,-7-Math.sin(time*.014+o.baseX)*2);ctx.quadraticCurveTo(w*.75,2,w*.5,4);ctx.quadraticCurveTo(w*.28,2,w*.5,-7);ctx.fill();ctx.restore();
}
