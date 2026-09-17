// Cache the illustrated riverbank once; decorations move with the world, never randomly per frame.
export function prepareTerrain() {
  const tile=document.createElement('canvas'); tile.width=960; tile.height=90;
  const c=tile.getContext('2d');
  c.fillStyle='#907047'; c.fillRect(0,8,960,82);
  c.fillStyle='#b49a65'; c.fillRect(0,10,960,31);
  c.fillStyle='#658044'; c.fillRect(0,6,960,10);
  c.fillStyle='#8d9d50'; c.fillRect(0,6,960,4);
  for(let i=0;i<120;i++) {
    const x=i*8,h=3+(i*7%6);
    c.fillStyle=i%3?'#718847':'#a3af62';
    c.beginPath();c.moveTo(x,10);c.lineTo(x-3,7-h);c.lineTo(x+2,7);c.lineTo(x+5,3-h/2);c.lineTo(x+5,12);c.fill();
  }
  for(let i=0;i<25;i++) {
    const x=(i*137+25)%960,y=21+(i*13%20);
    c.fillStyle=i%2?'#7b795e':'#c3b28a';
    c.beginPath();c.ellipse(x,y,2+i%4,1.5+i%2,-.2,0,Math.PI*2);c.fill();
  }
  c.fillStyle='#789b8b';c.fillRect(0,56,960,34);
  c.fillStyle='#a8bda0';c.fillRect(0,53,960,4);
  for(let i=0;i<24;i++) {
    c.fillStyle=i%2?'#acc7b4':'#628c80';c.fillRect((i*151)%960,62+i%4*7,12+i%5*4,1);
  }
  return tile;
}
export function drawTerrain(ctx,tile,offset,width,ground,time) {
  const start=-((offset%tile.width)+tile.width)%tile.width;
  for(let x=start;x<width;x+=tile.width) ctx.drawImage(tile,x,ground-8,tile.width+.5,tile.height);
  // A small fish occasionally leaps from the stream, below the playable path.
  const phase=time%11000;
  if(phase<8200||phase>9300)return;
  const t=(phase-8200)/1100;
  ctx.save();ctx.translate(width*.7-60+t*110,ground+63-Math.sin(t*Math.PI)*20);
  ctx.rotate((t-.5)*1.2);ctx.fillStyle='#d9aa65';
  ctx.beginPath();ctx.ellipse(0,0,8,3.5,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.moveTo(-6,0);ctx.lineTo(-12,-4);ctx.lineTo(-12,4);ctx.fill();
  ctx.fillStyle='#304d41';ctx.beginPath();ctx.arc(4,-1,1,0,Math.PI*2);ctx.fill();ctx.restore();
}
