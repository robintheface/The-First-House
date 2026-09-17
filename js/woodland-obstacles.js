// Draw and collide from the same normalized silhouettes.
const overlap = (p,o,r) => p.x < o.x+(r[0]+r[2])*o.w && p.x+p.w > o.x+r[0]*o.w
  && p.y < o.y+(r[1]+r[3])*o.h && p.y+p.h > o.y+r[1]*o.h;
export function breathPhase(o,time) { return Math.max(0,time-o.born)%2400; }
export function obstacleBoxes(o,time) {
  if(o.kind==='candle') {
    const boxes = o.woodType.startsWith('vertical')
      ? [[.23,.04,.71,.91],[.04,.64,.24,.08]]
      : [[.04,.23,.91,.71],[.28,.04,.08,.24]];
    const visible = Number.isFinite(o.groundY) ? (o.groundY-o.y)/o.h : 1;
    return boxes.map(([x,y,w,h])=>[x,y,w,Math.max(0,Math.min(h,visible-y))]).filter(r=>r[3]>0);
  }
  return [[.13,.26,.42,.29],[.29,.52,.45,.35],[.23,.84,.55,.13]];
}
export function hitsWoodland(p,o,time) { return obstacleBoxes(o,time).some(r=>overlap(p,o,r)); }
export const LOG_VARIANTS = ['horizontal-short','horizontal-long','vertical-short','vertical-long'];
export function logSize(type,scale=90) {
  const vertical=type.startsWith('vertical');
  const length=scale*(type.endsWith('long')?1.35:1);
  return vertical ? {w:length/2.4,h:length} : {w:length,h:length/2.4};
}
export function drawWoodland(ctx,o,time,img) {
  ctx.save();
  if (Number.isFinite(o.groundY)) {
    ctx.beginPath(); ctx.rect(o.x,o.y,o.w,Math.max(0,o.groundY-o.y)); ctx.clip();
  }
  ctx.translate(o.x,o.y);
  // Render directly from the supplied artwork; rotate without distorting its grain.
  if(o.woodType.startsWith('vertical')) {
    ctx.translate(0,o.h);ctx.rotate(-Math.PI/2);
    ctx.drawImage(img,153,146,1466,610,0,0,o.h,o.w);
  } else ctx.drawImage(img,153,146,1466,610,0,0,o.w,o.h);
  ctx.restore();
}
