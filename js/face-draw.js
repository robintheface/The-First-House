// Face of the Day opens a centered dialog immediately. The existing reel
// moves into that dialog for the draw, then returns to its homepage slot.
import { randomJoke } from "./face-jokes.js";
import { rarityFor } from "./face-rarity.js";

const RARITY_CLASSES = ["rarity-legendary", "rarity-mythic", "rarity-silver", "rarity-bronze"]; // "normal" gets none

const overlay = document.getElementById('faceDrawOverlay');
const drawStage = overlay?.querySelector('.face-draw-stage');
const cardEl = document.getElementById('faceDrawCard');
const cardInner = cardEl ? cardEl.querySelector('.face-draw-card-inner') : null;
const imgEl = document.getElementById('faceDrawImg');
const labelEl = document.getElementById('faceDrawLabel');
const jokeEl = document.getElementById('faceDrawJoke');
const shareBtn = document.getElementById('faceDrawShareBtn');
const fodBtn = document.getElementById('faceOfDayBtn');
const fodMessage = document.getElementById('fodMessage');
const galleryWrap = document.querySelector('.gallery-wrap');
const galleryTrack = document.querySelector('.gallery-track');
// The real 24, not the aria-hidden duplicates that pad the marquee loop --
// Face of the Day picks a winner from this set.
const reel = document.getElementById('faceDrawReel');
const drawStatus = document.getElementById('faceDrawStatus');
const spinBtn = document.getElementById('faceDrawSpinBtn');
const galleryHome = galleryWrap?.parentNode;
const galleryNext = galleryWrap?.nextSibling;
let drawId = 0;
let previousOverflow = '';

const realCards = [...document.querySelectorAll('.face-card')].filter((c) => c.getAttribute('aria-hidden') !== 'true');

if (overlay && cardEl && cardInner && imgEl && labelEl && jokeEl && realCards.length) {
  let currentMood = '';
  let currentJoke = '';
  // Keep the result out of the visible card until the user opens the seal.
  let pendingResult = null;

  function setCardContent(mood, joke, imgSrc){
    currentMood = mood;
    currentJoke = joke;

    imgEl.src = imgSrc;
    imgEl.alt = '';
    labelEl.textContent = mood;
    jokeEl.textContent = joke;
    // Legendary/mythic/silver/bronze shine on the front face, matching how
    // "big" this mood reads (see js/face-rarity.js) -- a plain "normal"
    // pull gets none of these classes. The sweep/pause loop itself is pure
    // CSS now (styles.css's fr-sheen-sweep-* keyframes) -- setting the
    // class is all it takes, no JS timer driving it.
    cardEl.classList.remove(...RARITY_CLASSES);
    const tier = rarityFor(mood);
    cardEl.querySelector('.face-draw-front').dataset.tierLabel = tier === 'normal' ? 'Everyday' : tier;
    if (tier !== 'normal') cardEl.classList.add('rarity-' + tier);
  }

  function onFlipEnd(e){
    if (e.target !== cardInner || e.propertyName !== 'transform') return;
    cardInner.removeEventListener('transitionend', onFlipEnd);
    jokeEl.textContent = currentJoke;
  }

  function triggerFlip(){

    cardInner.classList.add('is-flipped');
    cardInner.removeEventListener('transitionend', onFlipEnd);
    cardInner.style.transform = 'rotateY(180deg)';
    cardInner.addEventListener('transitionend', onFlipEnd);
  }

  function resetCardToFront(){
    cardInner.classList.remove('is-flipped');
    cardInner.removeEventListener('transitionend', onFlipEnd);
    cardInner.style.transform = 'rotateY(0deg)';
  }

  // The fixed gold marker selects the card beneath it. A short launch
  // gives way to a long deceleration, leaving time to follow the last cards.
  const GALLERY_SPIN_MS = 7200;
  const GALLERY_SPIN_EASE = 'cubic-bezier(.18,.45,.2,1)';
  let gallerySpinCleanup = null; // non-null only while a spin (or its post-landing pause) is in flight
  let galleryRafId = null;
  let litCard = null;
  let reelAnimation = null;
  const galleryCards = [...galleryTrack.children];

  // ---------- spin tick, synthesized mono 8-bit ----------
  // Synthesized freewheel-click, like a bicycle chain/cassette ratcheting
  // -- one short click per card the spin's center actually crosses, fired
  // on every real crossing regardless of whether that card is currently
  // lit (see the glow gate in trackLitCard below), so the tick rate always
  // genuinely tracks the spin's real speed instead of only ticking during
  // the (now much shorter) lit windows. A real freewheel click is a short
  // broadband transient (the pawl clacking against the ratchet gear), not
  // a pure tone, so this is a burst of noise through a bandpass filter
  // rather than an oscillator -- reads as a mechanical click, not a beep.
  // Tone still follows the real gap since the last tick, the same "rate
  // falls out naturally" idea as before, just shaping the click's timbre
  // now instead of a tone's pitch.
  let spinAudioCtx = null;
  let spinClickBuffer = null;
  let lastTickAt = 0;
  const soundSources = new Set();
  function trackSound(source, nodes) {
    soundSources.add(source);
    source.onended = () => { soundSources.delete(source); source.disconnect(); nodes.forEach(node => node.disconnect()); };
  }
  function stopAllDrawSounds() {
    soundSources.forEach(source => { try { source.stop(); } catch {} });
    soundSources.clear();
  }
  function playChime(notes, spacing = .09, duration = .35) {
    const ctx = spinAudioCtx;
    if (!ctx || ctx.state !== 'running' || document.hidden) return;
    notes.forEach((frequency, index) => {
      const start = ctx.currentTime + index * spacing;
      const tone = ctx.createOscillator();
      const volume = ctx.createGain();
      tone.type = 'sine'; tone.frequency.value = frequency;
      volume.gain.setValueAtTime(.0001, start);
      volume.gain.exponentialRampToValueAtTime(.16, start + .012);
      volume.gain.exponentialRampToValueAtTime(.0001, start + duration);
      tone.connect(volume); volume.connect(ctx.destination);
      trackSound(tone, [volume]); tone.start(start); tone.stop(start + duration + .02);
    });
  }
  function playResultSound(tier) {
    const melodies = {
      normal: [392, 523.25], bronze: [329.63, 392, 523.25],
      silver: [523.25, 659.25, 783.99], mythic: [440, 659.25, 880, 1108.73],
      legendary: [523.25, 659.25, 783.99, 1046.5, 1318.51]
    };
    playChime(melodies[tier] || melodies.normal, .11, .55);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopAllDrawSounds(); });

  function ensureSpinAudio(){
    if (spinAudioCtx) return spinAudioCtx;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    spinAudioCtx = new AudioCtx();
    const len = Math.round(spinAudioCtx.sampleRate * 0.04);
    spinClickBuffer = spinAudioCtx.createBuffer(1, len, spinAudioCtx.sampleRate);
    const data = spinClickBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return spinAudioCtx;
  }
  // Must run synchronously inside the real click handler, before any await
  // -- resuming here unlocks the context on strict browsers (notably
  // Safari/iOS) that would otherwise refuse audio started outside a user
  // gesture. Same reason as js/dino-game.js's primeAudio().
  //
  // resume() alone wasn't enough on mobile: on a *freshly created* context
  // (which this always is -- ensureSpinAudio() only ever makes one, on
  // this very first call), iOS Safari and some Android browsers report
  // resume() as successful but keep actual audio output muted until a
  // real buffer has been started within a user gesture. The spin's first
  // real tick fires a few animation frames later, which some of those
  // browsers no longer count as "within" the gesture -- so the click was
  // silent on the first SPIN press and only ever worked from the second
  // one onward, once the *previous* press's ticks had already unlocked
  // it. Starting an actual (silent, 1-sample) buffer right here forces
  // the unlock immediately, in the same call stack as the tap.
  function primeSpinSound(){
    let ctx;
    try { ctx = ensureSpinAudio(); } catch { return; }
    if (!ctx) return;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    const unlock = ctx.createBufferSource();
    unlock.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    unlock.connect(ctx.destination);
    unlock.start(0);
  }
  function playSpinTick(gapMs){
    const ctx = spinAudioCtx;
    if (document.hidden || !ctx || ctx.state !== 'running' || !spinClickBuffer) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = spinClickBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = Math.max(1600, Math.min(4000, 3000 - (gapMs - 40) * 10));
    filter.Q.value = 3.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.24, now + 0.001); // Clear short attack for the passing-card click.
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02); // short decay, like a pawl clacking a gear
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    trackSound(src, [filter, gain]);
    src.start(now);
    src.stop(now + 0.03);
  }
  function stopSpinSound(){
    lastTickAt = 0;
  }

  // Below this fraction of the spin's peak speed, the passing card
  // actually lights up; at or above it, no card lights (see trackLitCard).
  let lastCenterCard = null; // drives the tick above -- independent of litCard/glowActive

  function setLitCard(el){
    if (el === litCard) return;
    if (litCard) litCard.classList.remove('is-lit');
    litCard = el;
    if (litCard) litCard.classList.add('is-lit');
  }

  // Match the compositor easing without reading computed styles each frame.
  function spinProgress(progress) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 12; i++) {
      const t = (lo + hi) / 2, u = 1 - t;
      const x = 3*u*u*t*.18 + 3*u*t*t*.2 + t*t*t;
      if (x < progress) lo = t; else hi = t;
    }
    const t = (lo + hi) / 2, u = 1 - t;
    return 3*u*u*t*.45 + 3*u*t*t + t*t*t;
  }
  function trackLitCard(step, cardWidth, centerX, totalCount, targetX) {
    if (!reelAnimation) return;
    const progress = Math.min(1, Number(reelAnimation.currentTime || 0) / GALLERY_SPIN_MS);
    const trackX = targetX * spinProgress(progress);
    const now = performance.now();
    const idx = Math.max(0, Math.min(totalCount - 1, Math.round((centerX - trackX - cardWidth / 2) / step)));
    if (idx !== lastCenterCard) {
      lastCenterCard = idx;
      playSpinTick(lastTickAt ? now - lastTickAt : 40);
      lastTickAt = now;
    }
    if (progress < 1) galleryRafId = requestAnimationFrame(() => trackLitCard(step, cardWidth, centerX, totalCount, targetX));
  }

  function stopLitTracking(){
    if (galleryRafId) { cancelAnimationFrame(galleryRafId); galleryRafId = null; }
  }

  // Removes the temporary clones and hands the track back to its normal
  // CSS-driven marquee -- called whether a spin finished, or the user
  // closed out mid-spin/mid-reveal.
  function cleanupGallerySpin(addedClones){
    stopLitTracking();
    if (reelAnimation) { reelAnimation.cancel(); reelAnimation = null; }
    if (litCard) { litCard.classList.remove('is-lit'); litCard = null; }
    stopSpinSound();
    addedClones.forEach((c) => c.remove());
    galleryTrack.style.transition = '';
    galleryTrack.style.transform = '';
    galleryTrack.style.animation = '';
    galleryTrack.style.willChange = '';
    gallerySpinCleanup = null;
  }

  function spinGallery(winnerIdx, onDone) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onDone([]);
      return;
    }
    // All backs are identical; a bounded strip avoids cloning hidden portraits.
    const cards = galleryTrack.children;
    const winnerClone = cards[24];
    const cardWidth = cards[0].getBoundingClientRect().width;
    const step = cards[1].offsetLeft - cards[0].offsetLeft;
    const center = galleryWrap.clientWidth / 2;
    const jitter = (Math.random() - .5) * cardWidth * .25;
    const targetX = center - (winnerClone.offsetLeft + cardWidth / 2) + jitter;
    galleryTrack.style.willChange = 'transform';
    const animation = galleryTrack.animate([
      { transform: 'translate3d(0,0,0)' },
      { transform: `translate3d(${targetX}px,0,0)` }
    ], { duration: GALLERY_SPIN_MS, easing: GALLERY_SPIN_EASE, fill: 'forwards' });
    reelAnimation = animation;
    lastCenterCard = null;
    lastTickAt = 0;
    trackLitCard(step, cardWidth, center, cards.length, targetX);
    animation.finished.then(() => {
      if (reelAnimation !== animation) return;
      stopLitTracking();
      setLitCard(winnerClone);
      onDone([]);
    }).catch(() => {}); // Closing the dialog cancels the animation.
    gallerySpinCleanup = () => cleanupGallerySpin([]);
  }

  function showFodMessage(text){
    if (!fodMessage) return;
    fodMessage.textContent = text;
    fodMessage.hidden = !text;
  }

  function restoreGallery() {
    galleryTrack.replaceChildren(...galleryCards);
    if (galleryHome && galleryWrap.parentNode !== galleryHome) {
      galleryHome.insertBefore(galleryWrap, galleryNext);
    }
  }

  function openFaceOfTheDay(){
    if (!realCards.length || !fodBtn || fodBtn.disabled || !galleryTrack || !reel) return;
    ++drawId;
    overlay.classList.remove('is-spinning', 'is-winner');
    const strip = document.createDocumentFragment();
    for (let i = 0; i < 29; i++) {
      const back = document.createElement('div');
      back.className = 'face-card';
      back.setAttribute('aria-hidden', 'true');
      strip.appendChild(back);
    }
    galleryTrack.replaceChildren(strip);
    galleryTrack.style.animation = 'none';
    galleryTrack.style.transform = 'translate3d(0,0,0)';
    fodBtn.disabled = true;

    pendingResult = null;
    currentMood = '';
    currentJoke = '';
    cardEl.classList.remove(...RARITY_CLASSES, 'is-unsealed');
    cardEl.classList.add('is-sealed');
    cardEl.setAttribute('aria-label', 'Reveal your mystery card');
    cardInner.inert = true;
    cardInner.setAttribute('aria-hidden', 'true');
    labelEl.textContent = '';
    jokeEl.textContent = '';
    cardEl.querySelector('.face-draw-front').removeAttribute('data-tier-label');
    showFodMessage('');
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cardEl.hidden = true;
    reel.hidden = false;
    drawStatus.textContent = 'Ready to find your face? Press Spin to begin.';
    spinBtn.hidden = false;
    spinBtn.disabled = false;
    spinBtn.textContent = 'Spin';
    reel.classList.add('is-ready');
    reel.appendChild(galleryWrap);
    drawStage.style.height = '';
    overlay.hidden = false;
    overlay.showModal();
    // Keep the initial frame height when the reel is replaced by a result.
    drawStage.style.height = `${drawStage.offsetHeight}px`;
    spinBtn.focus({ preventScroll: true });
  }

  async function startDraw(){
    if (overlay.hidden || !overlay.open || spinBtn.disabled || spinBtn.hidden) return;
    spinBtn.disabled = true;
    primeSpinSound();
    const thisDraw = ++drawId;
    drawStatus.textContent = 'Preparing your cards…';

    // A closed or replaced dialog must never restart an old request.
    if (thisDraw !== drawId || overlay.hidden) return;
    playChime([220, 330, 440], .055, .18);
    spinBtn.textContent = 'Spinning…';
    overlay.classList.add('is-spinning');
    drawStatus.textContent = 'The hood is finding your face…';
    const winnerIdx = Math.floor(Math.random() * realCards.length);
    const winnerCard = realCards[winnerIdx];
    const winnerMood = winnerCard.querySelector('.face-label')?.textContent.trim() || '';
    const winnerJoke = randomJoke(winnerMood);
    const winnerImgSrc = winnerCard.querySelector('.face-img')?.src || '';
    // Eager-load the moving cards: off-screen lazy images otherwise only
    // begin loading as the fast reel carries them into view.
    const resultImage = winnerCard.querySelector('img');
    resultImage.loading = 'eager';
    resultImage.decode?.().catch(() => {});
    spinGallery(winnerIdx, (addedClones) => {
      playChime([164.81], 0, .16);
      overlay.classList.remove('is-spinning');
      overlay.classList.add('is-winner');
      const revealDelay = setTimeout(() => {
        if (thisDraw !== drawId) return;
        cleanupGallerySpin(addedClones);
        restoreGallery();
        reel.hidden = true;
        spinBtn.hidden = true;
        pendingResult = { mood: winnerMood, joke: winnerJoke, image: winnerImgSrc };
        resetCardToFront();
        cardEl.hidden = false;
        drawStatus.textContent = 'Your card is sealed. Tap to reveal your face and rarity.';
        cardEl.focus({ preventScroll: true });
      }, 1100);
      gallerySpinCleanup = () => { clearTimeout(revealDelay); cleanupGallerySpin(addedClones); };
    });
  }

  function closeDraw(){
    stopAllDrawSounds();
    ++drawId;
    if (gallerySpinCleanup) gallerySpinCleanup();
    restoreGallery();
    reel.classList.remove('is-ready');
    overlay.classList.remove('is-spinning', 'is-winner');
    overlay.close();
    overlay.hidden = true;
    drawStage.style.height = '';
    document.body.style.overflow = previousOverflow;
    cardInner.removeEventListener('transitionend', onFlipEnd);
    fodBtn.disabled = false;
    fodBtn.focus({ preventScroll: true });
  }

  function shareOnX(){
    if (!currentMood || !currentJoke) return;
    const text = `${currentMood}: "${currentJoke}"`;
    const url = window.location.origin + window.location.pathname;
    const intent = 'https://x.com/intent/tweet?text=' + encodeURIComponent(text)
      + '&url=' + encodeURIComponent(url) + '&via=robintheface';
    // Plain new-tab open, no width/height window features -- those mark it
    // as a "popup" window to the browser (and to ad/popup blockers), which
    // is blocked far more aggressively than a normal target=_blank tab even
    // when it's triggered synchronously from a real click, as this is.
    window.open(intent, '_blank', 'noopener,noreferrer');
  }

  // First open the seal, then allow flipping between face and story.
  function tapToReveal(e){
    if (e.target.closest('#faceDrawShareBtn')) return;
    if (pendingResult) {
      const result = pendingResult;
      pendingResult = null;
      setCardContent(result.mood, result.joke, result.image);
      cardInner.inert = false;
      cardInner.removeAttribute('aria-hidden');
      cardEl.classList.remove('is-sealed');
      cardEl.classList.add('is-unsealed');
      cardEl.setAttribute('aria-label', 'Flip your face card to read its story');
      const tier = rarityFor(result.mood);
      drawStatus.textContent = `${result.mood} · ${tier === 'normal' ? 'Everyday' : tier}. Tap the card for your story.`;
      playResultSound(tier);
      return;
    }
    cardEl.classList.remove('is-unsealed');
    if (cardInner.classList.contains('is-flipped')) resetCardToFront();
    else triggerFlip();
  }

  if (fodBtn) fodBtn.addEventListener('click', openFaceOfTheDay);
  if (spinBtn) spinBtn.addEventListener('click', startDraw);
  cardInner.addEventListener('animationend', () => cardEl.classList.remove('is-unsealed'));
  if (cardEl) cardEl.addEventListener('click', tapToReveal);
  cardEl.addEventListener('keydown', (e) => {
    if (e.target !== cardEl || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    tapToReveal(e);
  });
  overlay.querySelectorAll('[data-draw-close]').forEach((el) => {
    el.addEventListener('click', closeDraw);
  });
  overlay.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeDraw();
  });
  if (shareBtn) shareBtn.addEventListener('click', shareOnX);
}
