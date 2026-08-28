// The "SPIN" button below the gallery (index.html, #faces) is the only way
// into the reveal card -- gallery face cards are decorative only, not
// clickable. Clicking it spins the gallery's own live marquee,
// CS:GO-case-opening style: it races past the dead center of the gallery
// (no fixed marker -- whichever card is actually passing through center
// lights up live, tracked every frame) and decelerates to a stop, and
// whichever face is lit when it lands flips (tap to reveal) to show its
// joke, with a Share on X control. Backdrop click / Escape only close once
// the joke's actually revealed, so a stray tap outside can't lose the
// draw before it gets there. Kept as an external module, same CSP reason
// as wallet-connect.js: script-src has no 'unsafe-inline'.
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
const realCards = [...document.querySelectorAll('.face-card')].filter((c) => c.getAttribute('aria-hidden') !== 'true');

if (overlay && cardEl && cardInner && imgEl && labelEl && jokeEl && realCards.length) {
  let currentMood = '';
  let currentJoke = '';

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
  const CLONE_LOOPS = 2;         // extra full 24-card loops appended for spin room
  const LAND_LOOP = CLONE_LOOPS; // land in the last appended loop -- maximum room to travel
  // 3 acts: ~2s winding up, a fast confident middle, ~2s decelerating back
  // down into the landing -- 7s total. A single cubic-bezier can't express
  // three literal, separately-timed phases, but a strong symmetric
  // ease-in-out (near-flat close to both ends, steep through the middle)
  // reads as exactly that: a real ~2s ramp on each side of a fast middle,
  // for a curve this extreme.
  const GALLERY_SPIN_MS = 7000;
  const GALLERY_SPIN_EASE = 'cubic-bezier(.83,0,.17,1)';
  let gallerySpinCleanup = null; // non-null only while a spin (or its post-landing pause) is in flight
  let galleryRafId = null;
  let litCard = null;
  let glowActive = true; // spin always starts slow, so it starts lit

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
  // The fast cruise whips past many cards a second -- lighting every one
  // of them, each with its own glow/scale pop, reads as a strobe rather
  // than a highlight. Gating it to the slow start and the decelerating
  // tail keeps the glow meaningful without the flicker. The tick sound
  // above is deliberately NOT gated by this -- it fires on every real
  // crossing so it stays audibly synced to the actual spin speed.
  const GLOW_SPEED_RATIO = 0.18;
  // Empirically measured against this exact easing curve: peak
  // instantaneous speed during a spin ≈ (travel distance / duration) *
  // this factor -- recomputed fresh each spin from the real distance/
  // duration (see spinGallery) rather than hardcoded, so the glow gate
  // above stays calibrated if either changes again later.
  const SPIN_PEAK_FACTOR = 5.95;

  let spinPeakSpeed = 1;
  let lastTrackX = 0;
  let lastTrackT = 0;
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
    const dt = now - lastTrackT;
    const speed = dt > 0 ? Math.abs(trackX - lastTrackX) / dt : 0;
    lastTrackX = trackX;
    lastTrackT = now;

    const centerInTrack = centerX - trackX;
    const idx = Math.max(0, Math.min(totalCount - 1, Math.round((centerInTrack - cardWidth / 2) / step)));
    const centerCard = galleryTrack.children[idx];

    // Tick on every real center-crossing, independent of the glow gate --
    // this is what keeps the sound synced to the actual spin speed even
    // while the visual stays dark during the fast cruise. Tracked via its
    // own reference (not litCard) since litCard is deliberately left
    // stale/dark while the gate is closed, but the center card keeps moving.
    if (centerCard !== lastCenterCard) {
      lastCenterCard = centerCard;
      playSpinTick(lastTickAt ? now - lastTickAt : 40);
      lastTickAt = now;
    }

    // Hysteresis around the threshold -- crossing a single speed value
    // right at the boundary between the fast cruise and the slow tail lets
    // measurement noise flicker glowActive on/off several times in as many
    // frames. A gap between the "turn off" and "turn on" speeds keeps that
    // crossing a single, clean transition instead of a mini strobe burst.
    const threshold = spinPeakSpeed * GLOW_SPEED_RATIO;
    if (glowActive) {
      if (speed > threshold * 1.3) glowActive = false;
    } else if (speed <= threshold * 0.75) {
      glowActive = true;
    }
    if (glowActive) {
      setLitCard(centerCard);
    } else if (litCard) {
      // Too fast to track by eye right now -- go dark rather than strobe.
      litCard.classList.remove('is-lit');
      litCard = null;
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
    lastTrackX = currentX;
    lastTrackT = performance.now();
    lastCenterCard = null;
    lastTickAt = 0;
    glowActive = true;
    spinPeakSpeed = (Math.abs(targetX - currentX) / GALLERY_SPIN_MS) * SPIN_PEAK_FACTOR;
    trackLitCard(step, cardWidth, centerX, galleryTrack.children.length);

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
    // (set above, before the allowance check), so a second spin can't
    // start before this one lands and fight it for control of the track.
    // Two beats after landing: 1s with the winner card lit and sitting
    // still in the gallery -> overlay backdrop appears (card still
    // hidden) -> 0.5s later the card fades in showing the mood, with a
    // "tap to reveal" prompt -- the joke flip is now a tap, not a timer.
    spinGallery(winnerIdx, (addedClones) => {
      const overlayDelay = setTimeout(() => {
        cleanupGallerySpin(addedClones);
        overlay.hidden = false;
        document.body.style.overflow = 'hidden';
        cardEl.hidden = true;

        const fadeDelay = setTimeout(() => {
          setCardContent(winnerMood, winnerJoke, winnerImgSrc);
          resetCardToFront();
          cardEl.hidden = false;
          cardEl.classList.add('is-revealing');
          void cardEl.offsetWidth; // force a reflow so the class removal below actually transitions
          cardEl.classList.remove('is-revealing');
        }, 500);
        // Overlay's already up and the gallery's already restored at this
        // point -- closing mid-fade just needs to cancel the pending reveal.
        gallerySpinCleanup = () => { clearTimeout(fadeDelay); };
      }, 1000);
      gallerySpinCleanup = () => { clearTimeout(overlayDelay); cleanupGallerySpin(addedClones); };
    });
  }

  // ---------- shared: close / share ----------
  function closeDraw(){
    overlay.hidden = true;
    document.body.style.overflow = '';
    cardInner.removeEventListener('transitionend', onFlipEnd);
    // Closing mid-spin (or during the post-landing pause, before the
    // overlay even opened) needs the gallery put back exactly as much as
    // closing after the joke's already showing does.
    if (gallerySpinCleanup) gallerySpinCleanup();
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

  // Tap to reveal -- the joke flip used to fire on a timer; now it's the
  // user's own tap, any time after the mood's shown. Guarded by is-flipped
  // so a tap on the back (e.g. missing the Share button) can't re-trigger it.
  function tapToReveal(){
    if (cardInner.classList.contains('is-flipped')) return;
    triggerFlip();
  }

  if (fodBtn) fodBtn.addEventListener('click', openFaceOfTheDay);
  if (cardEl) cardEl.addEventListener('click', tapToReveal);
  // Backdrop click / Escape only actually close once the joke's been
  // revealed (is-flipped) -- before that, a stray tap outside the card or
  // an accidental Escape would dismiss the whole draw before the joke
  // ever showed, losing the reveal entirely.
  overlay.querySelectorAll('[data-draw-close]').forEach((el) => {
    el.addEventListener('click', () => {
      if (cardInner.classList.contains('is-flipped')) closeDraw();
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden && cardInner.classList.contains('is-flipped')) closeDraw();
  });
  if (shareBtn) shareBtn.addEventListener('click', shareOnX);
}
