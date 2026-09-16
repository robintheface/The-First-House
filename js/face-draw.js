// Face of the Day opens a centered dialog immediately. The existing reel
// moves into that dialog for the draw, then returns to its homepage slot.
import { randomJoke } from "./face-jokes.js";
import { rarityFor } from "./face-rarity.js";

const RARITY_CLASSES = ["rarity-legendary", "rarity-mythic", "rarity-silver", "rarity-bronze"]; // "normal" gets none

const overlay = document.getElementById('faceDrawOverlay');
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
  // True from the moment the joke's first shown until the next draw starts.
  // Separate from is-flipped (which now just tracks which face is up, see
  // tapToReveal below) so the backdrop/Escape close gate stays satisfied
  // even after the user's flipped back to the front to look at the mood
  // again -- otherwise closing would be impossible until they happened to
  // land back on the joke side.
  let hasRevealed = false;

  function setCardContent(mood, joke, imgSrc){
    currentMood = mood;
    currentJoke = joke;
    hasRevealed = false;
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
    hasRevealed = true;
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
  const CLONE_LOOPS = 1;
  const LAND_LOOP = CLONE_LOOPS;
  const GALLERY_SPIN_MS = 7200;
  const GALLERY_SPIN_EASE = 'cubic-bezier(.18,.45,.2,1)';
  let gallerySpinCleanup = null; // non-null only while a spin (or its post-landing pause) is in flight
  let galleryRafId = null;
  let litCard = null;
  let imagesReady = Promise.resolve();

  function readTranslateX(el){
    const m = getComputedStyle(el).transform;
    if (!m || m === 'none') return 0;
    const match = m.match(/matrix\(([^)]+)\)/);
    return match ? (parseFloat(match[1].split(',')[4]) || 0) : 0;
  }

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
    const ctx = ensureSpinAudio();
    if (!ctx) return;
    if (ctx.state !== 'running') ctx.resume();
    const unlock = ctx.createBufferSource();
    unlock.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    unlock.connect(ctx.destination);
    unlock.start(0);
  }
  function playSpinTick(gapMs){
    const ctx = spinAudioCtx;
    if (!ctx || !spinClickBuffer) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = spinClickBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = Math.max(1600, Math.min(4000, 3000 - (gapMs - 40) * 10));
    filter.Q.value = 3.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.0945, now + 0.001); // sharp attack -- a click, not a swell (0.063 + 50%)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02); // short decay, like a pawl clacking a gear
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
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

  function trackLitCard(step, cardWidth, centerX, totalCount){
    const trackX = readTranslateX(galleryTrack);
    const now = performance.now();
    const centerInTrack = centerX - trackX;
    const idx = Math.max(0, Math.min(totalCount - 1, Math.round((centerInTrack - cardWidth / 2) / step)));
    const centerCard = galleryTrack.children[idx];

    // Track sound only while moving. The winner gets its glow after landing,
    // avoiding repeated filter repaints on the fast-moving image strip.
    if (centerCard !== lastCenterCard) {
      lastCenterCard = centerCard;
      playSpinTick(lastTickAt ? now - lastTickAt : 40);
      lastTickAt = now;
    }

    galleryRafId = requestAnimationFrame(() => trackLitCard(step, cardWidth, centerX, totalCount));
  }

  function stopLitTracking(){
    if (galleryRafId) { cancelAnimationFrame(galleryRafId); galleryRafId = null; }
  }

  // Removes the temporary clones and hands the track back to its normal
  // CSS-driven marquee -- called whether a spin finished, or the user
  // closed out mid-spin/mid-reveal.
  function cleanupGallerySpin(addedClones){
    stopLitTracking();
    if (litCard) { litCard.classList.remove('is-lit'); litCard = null; }
    stopSpinSound();
    addedClones.forEach((c) => c.remove());
    galleryTrack.style.transition = '';
    galleryTrack.style.transform = '';
    galleryTrack.style.animation = '';
    galleryTrack.style.willChange = '';
    gallerySpinCleanup = null;
  }

  function spinGallery(winnerIdx, onDone){
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onDone([]);
      return;
    }
    const currentX = readTranslateX(galleryTrack);
    galleryTrack.style.willChange = 'transform';
    // Freeze the marquee exactly where it visually is right now, then
    // switch it from CSS-keyframe-driven to a plain transform this
    // function fully controls -- no jump, since the frozen value is the
    // same one the animation was already showing.
    galleryTrack.style.animation = 'none';
    galleryTrack.style.transform = `translateX(${currentX}px)`;
    void galleryTrack.offsetWidth;

    const addedClones = [];
    for (let loop = 0; loop < CLONE_LOOPS; loop++) {
      realCards.forEach((card) => {
        const clone = card.cloneNode(true);
        clone.removeAttribute('id');
        clone.setAttribute('aria-hidden', 'true');
        galleryTrack.appendChild(clone);
        addedClones.push(clone);
      });
    }
    const winnerClone = addedClones[(LAND_LOOP - 1) * realCards.length + winnerIdx];

    const card0 = galleryTrack.children[0];
    const card1 = galleryTrack.children[1];
    const step = card1.getBoundingClientRect().left - card0.getBoundingClientRect().left; // card width + gap, measured rather than assumed
    const cardWidth = card0.getBoundingClientRect().width;
    const wrapRect = galleryWrap.getBoundingClientRect();
    const centerX = wrapRect.left + wrapRect.width / 2;
    const winnerRect = winnerClone.getBoundingClientRect();
    const winnerCenter = winnerRect.left + winnerRect.width / 2;
    // A little jitter so it doesn't land dead-center every single time,
    // same touch real case-opening reels use -- still well inside the
    // card, nowhere near its edge.
    const jitter = (Math.random() - 0.5) * winnerRect.width * 0.25;
    const targetX = currentX + (centerX - winnerCenter) + jitter;

    stopLitTracking();
    lastCenterCard = null;
    lastTickAt = 0;
    const localCenter = centerX - galleryTrack.getBoundingClientRect().left + currentX;
    trackLitCard(step, cardWidth, localCenter, galleryTrack.children.length);

    galleryTrack.style.transition = `transform ${GALLERY_SPIN_MS}ms ${GALLERY_SPIN_EASE}`;
    galleryTrack.style.transform = `translateX(${targetX}px)`;

    function onEnd(e){
      if (e.target !== galleryTrack || e.propertyName !== 'transform') return;
      galleryTrack.removeEventListener('transitionend', onEnd);
      clearTimeout(fallback);
      stopLitTracking();
      // The live rAF tracking should already have landed here, but pin it
      // explicitly -- rounding across many frames of a multi-lap spin is
      // the kind of thing that's cheap to just guarantee outright.
      setLitCard(winnerClone);
      onDone(addedClones);
    }
    galleryTrack.addEventListener('transitionend', onEnd);
    const fallback = setTimeout(() => onEnd({ target: galleryTrack, propertyName: 'transform' }), GALLERY_SPIN_MS + 100);
    gallerySpinCleanup = () => {
      galleryTrack.removeEventListener('transitionend', onEnd);
      clearTimeout(fallback);
      cleanupGallerySpin(addedClones);
    };
  }

  function showFodMessage(text){
    if (!fodMessage) return;
    fodMessage.textContent = text;
    fodMessage.hidden = !text;
  }

  function restoreGallery() {
    if (galleryHome && galleryWrap.parentNode !== galleryHome) {
      galleryHome.insertBefore(galleryWrap, galleryNext);
    }
  }

  function openFaceOfTheDay(){
    if (!realCards.length || !fodBtn || fodBtn.disabled || !galleryTrack || !reel) return;
    ++drawId;
    overlay.classList.remove('is-spinning', 'is-winner');
    galleryTrack.querySelectorAll('.face-card').forEach(card => {
      const mood = card.querySelector('.face-label')?.textContent.trim() || '';
      card.dataset.rarity = rarityFor(mood);
      card.dataset.tierLabel = card.dataset.rarity === 'normal' ? 'Everyday' : card.dataset.rarity;
    });
    imagesReady = Promise.all([...galleryTrack.querySelectorAll('img')].map(img => {
      img.loading = 'eager';
      return img.decode ? img.decode().catch(() => {}) : Promise.resolve();
    }));
    fodBtn.disabled = true;
    hasRevealed = false;
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
    overlay.hidden = false;
    overlay.showModal();
    spinBtn.focus({ preventScroll: true });
  }

  async function startDraw(){
    if (overlay.hidden || !overlay.open || spinBtn.disabled || spinBtn.hidden) return;
    spinBtn.disabled = true;
    primeSpinSound();
    const thisDraw = ++drawId;
    drawStatus.textContent = 'Preparing your cards…';
    await imagesReady;
    // A closed or replaced dialog must never restart an old request.
    if (thisDraw !== drawId || overlay.hidden) return;
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
    realCards.forEach(card => { card.querySelector('img').loading = 'eager'; });
    spinGallery(winnerIdx, (addedClones) => {
      overlay.classList.remove('is-spinning');
      overlay.classList.add('is-winner');
      const revealDelay = setTimeout(() => {
        if (thisDraw !== drawId) return;
        cleanupGallerySpin(addedClones);
        restoreGallery();
        reel.hidden = true;
        spinBtn.hidden = true;
        setCardContent(winnerMood, winnerJoke, winnerImgSrc);
        resetCardToFront();
        cardEl.hidden = false;
        drawStatus.textContent = 'Your face has arrived. Tap the card to reveal its story.';
        cardEl.focus({ preventScroll: true });
      }, 1100);
      gallerySpinCleanup = () => { clearTimeout(revealDelay); cleanupGallerySpin(addedClones); };
    });
  }

  function closeDraw(){
    ++drawId;
    if (gallerySpinCleanup) gallerySpinCleanup();
    restoreGallery();
    reel.classList.remove('is-ready');
    overlay.classList.remove('is-spinning', 'is-winner');
    overlay.close();
    overlay.hidden = true;
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

  // Tap anywhere on the card flips it -- to the joke the first time, and
  // back and forth between joke/mood on every tap after that. Share lives
  // on the back face; it must only ever share, never also flip the card
  // back to the front underneath the same tap.
  function tapToReveal(e){
    if (e.target.closest('#faceDrawShareBtn')) return;
    if (cardInner.classList.contains('is-flipped')) resetCardToFront();
    else triggerFlip();
  }

  if (fodBtn) fodBtn.addEventListener('click', openFaceOfTheDay);
  if (spinBtn) spinBtn.addEventListener('click', startDraw);
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
