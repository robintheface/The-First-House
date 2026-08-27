// The "SPIN" button below the gallery (index.html, #faces) is the only way
// into the reveal card -- gallery face cards are decorative only, not
// clickable. Clicking it spins the gallery's own live marquee,
// CS:GO-case-opening style: it races past the dead center of the gallery
// (no fixed marker -- whichever card is actually passing through center
// lights up live, tracked every frame) and decelerates to a stop, and
// whichever face is lit when it lands flips to reveal its joke, with Draw
// again / Share / close controls. Kept as an external module, same CSP
// reason as wallet-connect.js: script-src has no 'unsafe-inline'.
import { randomJoke, nextJoke } from "./face-jokes.js";
import { rarityFor } from "./face-rarity.js";

const RARITY_CLASSES = ["rarity-legendary", "rarity-mythic", "rarity-silver", "rarity-bronze"]; // "normal" gets none

const overlay = document.getElementById('faceDrawOverlay');
const cardEl = document.getElementById('faceDrawCard');
const cardInner = cardEl ? cardEl.querySelector('.face-draw-card-inner') : null;
const imgEl = document.getElementById('faceDrawImg');
const labelEl = document.getElementById('faceDrawLabel');
const jokeEl = document.getElementById('faceDrawJoke');
const againBtn = document.getElementById('faceDrawAgainBtn');
const shareBtn = document.getElementById('faceDrawShareBtn');
const fodBtn = document.getElementById('faceOfDayBtn');
const fodMessage = document.getElementById('fodMessage');
const galleryWrap = document.querySelector('.gallery-wrap');
const galleryTrack = document.querySelector('.gallery-track');
// The real 24, not the aria-hidden duplicates that pad the marquee loop --
// Face of the Day picks a winner from this set.
const realCards = [...document.querySelectorAll('.face-card')].filter((c) => c.getAttribute('aria-hidden') !== 'true');

if (overlay && cardEl && cardInner && imgEl && labelEl && jokeEl && realCards.length) {
  let currentMood = '';
  let currentJoke = '';
  // Odd = back (joke) showing, even = front (face) showing. Only ever
  // climbs -- every reroll/reveal spins the same direction rather than
  // snapping back to 0, so each one reads as forward motion.
  let flipTurns = 0;
  let revealTimer = null;

  function setCardContent(mood, joke, imgSrc){
    currentMood = mood;
    currentJoke = joke;
    imgEl.src = imgSrc;
    imgEl.alt = '';
    labelEl.textContent = mood;
    jokeEl.textContent = joke;
    // Legendary/mythic/silver/bronze shine on the front face, matching how
    // "big" this mood reads (see js/face-rarity.js) -- a plain "normal"
    // pull gets none of these classes.
    cardEl.classList.remove(...RARITY_CLASSES);
    const tier = rarityFor(mood);
    if (tier !== 'normal') cardEl.classList.add('rarity-' + tier);
  }

  // Shared by every path that lands on the back face (the reveal flip and
  // every "Draw again" reroll) -- re-enabling the button here (rather than
  // the moment a flip starts) means it can't be clicked again mid-flip,
  // which matters since a reroll mid-flight would restart a fresh
  // transition on top of one that never got to finish.
  function onFlipEnd(e){
    if (e.target !== cardInner || e.propertyName !== 'transform') return;
    cardInner.removeEventListener('transitionend', onFlipEnd);
    jokeEl.textContent = currentJoke;
    if (againBtn) againBtn.disabled = false;
  }

  function triggerFlip(){
    flipTurns += flipTurns % 2 === 0 ? 1 : 2; // land on an odd multiple (back showing) either way
    cardInner.classList.add('is-flipped');
    cardInner.removeEventListener('transitionend', onFlipEnd);
    cardInner.style.transform = `rotateY(${flipTurns * 180}deg)`;
    cardInner.addEventListener('transitionend', onFlipEnd);
  }

  function resetCardToFront(){
    flipTurns = 0;
    cardInner.classList.remove('is-flipped');
    cardInner.removeEventListener('transitionend', onFlipEnd);
    cardInner.style.transform = 'rotateY(0deg)';
    if (againBtn) { againBtn.disabled = true; againBtn.textContent = 'Draw again ↻'; }
  }

  // ---------- Face of the Day spins the live gallery itself ----------
  // Rather than a separate popup reel, this hijacks the actual auto-
  // scrolling .gallery-track: freezes it wherever its marquee animation
  // currently is, temporarily appends extra loops of the real 24 cards so
  // there's room to travel several laps in the same leftward direction it
  // was already drifting, then eases it to a stop at the dead center of
  // .gallery-wrap. No fixed marker -- whichever card is actually passing
  // through center gets lit live (tracked every frame) as the spin runs,
  // and whichever one is lit when it lands hands off into the #faceDrawCard
  // flip reveal.
  const CLONE_LOOPS = 3;         // extra full 24-card loops appended for spin room
  const LAND_LOOP = CLONE_LOOPS; // land in the last appended loop -- maximum room to travel
  // Slow to start, fastest through the middle, long decelerating tail to
  // land -- not the instant-top-speed-then-brake curve this had before.
  // The travel distance is fixed by real gallery geometry (see spinGallery
  // below), so for a fixed easing curve, speed at every point in the spin
  // scales as 1/duration -- stretching the duration cuts the peak (mid-
  // spin) speed by the same ratio, same curve shape either way.
  // 5400 (original) -> 7700 (-30% peak) -> 15400 (-50% more on top of
  // that, i.e. ~35% of the original peak speed).
  const GALLERY_SPIN_MS = 15400;
  const GALLERY_SPIN_EASE = 'cubic-bezier(.76,0,.24,1)';
  let gallerySpinCleanup = null; // non-null only while a spin (or its post-landing pause) is in flight
  let galleryRafId = null;
  let litCard = null;

  function readTranslateX(el){
    const m = getComputedStyle(el).transform;
    if (!m || m === 'none') return 0;
    const match = m.match(/matrix\(([^)]+)\)/);
    return match ? (parseFloat(match[1].split(',')[4]) || 0) : 0;
  }

  // ---------- spin sound effect (sound-effects/spin.mp3) ----------
  // A single looped clip whose playbackRate is continuously retuned to the
  // gallery track's live measured speed -- not a fixed pitch -- so it
  // audibly speeds up and slows down together with the actual spin. Same
  // "tempo follows the spin" idea an earlier synthesized tick had, now
  // driven by a real recording instead.
  const SPIN_SOUND_SRC = '/sound-effects/spin.mp3';
  const SPIN_RATE_MIN = 0.55;
  const SPIN_RATE_MAX = 1.7;
  // Empirically measured against this exact easing curve: peak
  // instantaneous speed during a spin ≈ (travel distance / duration) *
  // this factor, fairly consistent across the different durations and
  // travel distances already tested -- recomputed fresh each spin from
  // the real distance/duration below rather than hardcoded, so it stays
  // right if either changes again later.
  const SPIN_SOUND_PEAK_FACTOR = 5.95;

  let spinSoundEl = null;
  let spinSoundPrimed = false;
  let spinSoundPeakSpeed = 1;
  let lastSpeedX = 0;
  let lastSpeedT = 0;

  function ensureSpinSound(){
    if (!spinSoundEl) {
      spinSoundEl = new Audio(SPIN_SOUND_SRC);
      spinSoundEl.loop = true;
      spinSoundEl.volume = 0.55;
    }
    return spinSoundEl;
  }

  // Must run synchronously inside the real click handler, before any await
  // -- play() then an immediate pause() here unlocks later programmatic
  // play() calls on strict browsers (notably Safari/iOS) that would
  // otherwise refuse audio started outside a user gesture. Same reason as
  // js/dino-game.js's primeAudio().
  function primeSpinSound(){
    if (spinSoundPrimed) return;
    spinSoundPrimed = true;
    const el = ensureSpinSound();
    const p = el.play();
    if (p && p.catch) p.catch(() => {});
    el.pause();
    el.currentTime = 0;
  }

  function startSpinSound(peakSpeedPxMs){
    const el = ensureSpinSound();
    spinSoundPeakSpeed = peakSpeedPxMs || 1;
    lastSpeedX = readTranslateX(galleryTrack);
    lastSpeedT = performance.now();
    el.currentTime = 0;
    el.volume = 0.55;
    el.playbackRate = SPIN_RATE_MIN;
    const p = el.play();
    if (p && p.catch) p.catch(() => {});
  }

  function updateSpinSoundRate(x){
    if (!spinSoundEl) return;
    const now = performance.now();
    const dt = now - lastSpeedT;
    if (dt > 0) {
      const speed = Math.abs(x - lastSpeedX) / dt;
      const ratio = Math.min(1, speed / spinSoundPeakSpeed);
      spinSoundEl.playbackRate = SPIN_RATE_MIN + ratio * (SPIN_RATE_MAX - SPIN_RATE_MIN);
    }
    lastSpeedX = x;
    lastSpeedT = now;
  }

  // A quick fade rather than an abrupt cut when the spin stops or the
  // overlay is closed out early.
  function stopSpinSound(){
    const el = spinSoundEl;
    if (!el || el.paused) return;
    const baseVolume = 0.55;
    let steps = 6;
    const fade = setInterval(() => {
      steps--;
      el.volume = Math.max(0, baseVolume * (steps / 6));
      if (steps <= 0) {
        clearInterval(fade);
        el.pause();
        el.volume = baseVolume;
      }
    }, 30);
  }

  function setLitCard(el){
    if (el === litCard) return;
    if (litCard) litCard.classList.remove('is-lit');
    litCard = el;
    if (litCard) litCard.classList.add('is-lit');
  }

  function trackLitCard(step, cardWidth, centerX, totalCount){
    const trackX = readTranslateX(galleryTrack);
    const centerInTrack = centerX - trackX;
    const idx = Math.max(0, Math.min(totalCount - 1, Math.round((centerInTrack - cardWidth / 2) / step)));
    setLitCard(galleryTrack.children[idx]);
    updateSpinSoundRate(trackX);
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
    if (fodBtn) fodBtn.disabled = false;
    gallerySpinCleanup = null;
  }

  function spinGallery(winnerIdx, onDone){
    const currentX = readTranslateX(galleryTrack);
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
    trackLitCard(step, cardWidth, centerX, galleryTrack.children.length);
    startSpinSound((Math.abs(targetX - currentX) / GALLERY_SPIN_MS) * SPIN_SOUND_PEAK_FACTOR);

    galleryTrack.style.transition = `transform ${GALLERY_SPIN_MS}ms ${GALLERY_SPIN_EASE}`;
    galleryTrack.style.transform = `translateX(${targetX}px)`;

    function onEnd(e){
      if (e.target !== galleryTrack || e.propertyName !== 'transform') return;
      galleryTrack.removeEventListener('transitionend', onEnd);
      stopLitTracking();
      // The live rAF tracking should already have landed here, but pin it
      // explicitly -- rounding across many frames of a multi-lap spin is
      // the kind of thing that's cheap to just guarantee outright.
      setLitCard(winnerClone);
      onDone(addedClones);
    }
    galleryTrack.addEventListener('transitionend', onEnd);
    gallerySpinCleanup = () => {
      galleryTrack.removeEventListener('transitionend', onEnd);
      cleanupGallerySpin(addedClones);
    };
  }

  function showFodMessage(text){
    if (!fodMessage) return;
    fodMessage.textContent = text;
    fodMessage.hidden = !text;
  }

  // Server-side cap (api/face-draw.js): 3 draws per IP per UTC day. A
  // client-only counter (localStorage) would be trivially bypassed by
  // clearing storage or an incognito tab, so the real limit lives there --
  // this call is what actually spends one, before anything visual starts.
  async function checkDrawAllowance(){
    try {
      const res = await fetch('/api/face-draw', { method: 'POST' });
      if (res.status === 429) return { allowed: false, message: "Out of draws for today — resets at 00:00 UTC." };
      if (!res.ok) return { allowed: false, message: "Can't check your draws right now. Try again in a moment." };
      return { allowed: true };
    } catch (err) {
      return { allowed: false, message: "Can't reach the server. Check your connection and try again." };
    }
  }

  async function openFaceOfTheDay(){
    if (!realCards.length || !fodBtn || fodBtn.disabled || !galleryTrack) return;
    // Must happen synchronously inside the real click handler, before any
    // await -- checkDrawAllowance() below awaits a fetch, so priming the
    // spin sound after that point risks Safari (and other strict browsers)
    // refusing to ever let it play. See primeSpinSound() above.
    primeSpinSound();
    fodBtn.disabled = true;
    showFodMessage('');
    const allowance = await checkDrawAllowance();
    if (!allowance.allowed) {
      fodBtn.disabled = false;
      showFodMessage(allowance.message);
      return;
    }

    const winnerIdx = Math.floor(Math.random() * realCards.length);
    const winnerCard = realCards[winnerIdx];
    const winnerLabel = winnerCard.querySelector('.face-label');
    const winnerMood = winnerLabel ? winnerLabel.textContent.trim() : '';
    const winnerJoke = randomJoke(winnerMood);
    const winnerImg = winnerCard.querySelector('.face-img');
    const winnerImgSrc = winnerImg ? winnerImg.src : '';

    // No overlay/backdrop yet -- the spin plays out on the page itself, in
    // the actual gallery, not behind a dialog. fodBtn is already disabled
    // (set above, before the allowance check) -- same reason a card
    // mid-flip disables Draw again: a second spin starting before this one
    // lands would fight it for control of the track.
    spinGallery(winnerIdx, (addedClones) => {
      // A beat with the winner card lit and sitting still (the "what face"
      // reveal) before the overlay takes over for the "what joke" reveal.
      const revealDelay = setTimeout(() => {
        cleanupGallerySpin(addedClones);
        overlay.hidden = false;
        document.body.style.overflow = 'hidden';
        cardEl.hidden = false;
        setCardContent(winnerMood, winnerJoke, winnerImgSrc);
        resetCardToFront();
        clearTimeout(revealTimer);
        revealTimer = setTimeout(triggerFlip, 2000);
      }, 700);
      gallerySpinCleanup = () => { clearTimeout(revealDelay); cleanupGallerySpin(addedClones); };
    });
  }

  // ---------- shared: close / reroll / share ----------
  function closeDraw(){
    overlay.hidden = true;
    document.body.style.overflow = '';
    cardInner.removeEventListener('transitionend', onFlipEnd);
    clearTimeout(revealTimer);
    revealTimer = null;
    // Closing mid-spin (or during the post-landing pause, before the
    // overlay even opened) needs the gallery put back exactly as much as
    // closing after the joke's already showing does.
    if (gallerySpinCleanup) gallerySpinCleanup();
  }

  function drawAgain(){
    if (!currentMood || (againBtn && againBtn.disabled)) return;
    currentJoke = nextJoke(currentMood, currentJoke);
    if (againBtn) againBtn.disabled = true;
    triggerFlip();
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

  if (fodBtn) fodBtn.addEventListener('click', openFaceOfTheDay);
  overlay.querySelectorAll('[data-draw-close]').forEach((el) => {
    el.addEventListener('click', closeDraw);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) closeDraw();
  });
  if (againBtn) againBtn.addEventListener('click', drawAgain);
  if (shareBtn) shareBtn.addEventListener('click', shareOnX);
}
