export function wrapBackground(offset,distance,width) {
  return ((offset+distance)%width+width)%width;
}
// Blend the end of the painting into its start once, not on every frame.
// No mirrored scenery: the forest keeps the same direction through the join.
export function prepareBackground(image,height) {
  const width=Math.round(image.naturalWidth/image.naturalHeight*height);
  const blend=Math.round(width*.24),period=width-blend;
  const tile=document.createElement('canvas');tile.width=period;tile.height=height;
  const ctx=tile.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(image,0,0,width,height);
  const edge=document.createElement('canvas');edge.width=blend;edge.height=height;
  const e=edge.getContext('2d');e.drawImage(image,-period,0,width,height);
  e.globalCompositeOperation='destination-in';
  const mask=e.createLinearGradient(0,0,blend,0);mask.addColorStop(0,'#000');mask.addColorStop(1,'#0000');
  e.fillStyle=mask;e.fillRect(0,0,blend,height);ctx.drawImage(edge,0,0);
  return tile;
}
export function drawBackground(ctx,tile,offset,width,height) {
  // Fractional positions retain smooth motion; a subpixel overlap prevents hairline gaps.
  for(let x=-offset;x<width;x+=tile.width)ctx.drawImage(tile,x,0,tile.width+.5,height);
}
