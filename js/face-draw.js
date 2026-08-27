// Two ways into the same reveal card (index.html, #faces):
//
// 1. Clicking a gallery face card flies that card's own image from its
//    on-screen position up to center stage, then flips it to reveal a joke.
// 2. The "Face of the Day" button below the gallery spins a CS:GO-style
//    case-opening reel -- a strip of faces races past a fixed center
//    marker and decelerates to a stop, and whichever face lands on the
//    marker is the one that flips to reveal its joke.
//
// Either way lands on the same #faceDrawCard/back-face joke reveal, with
// the same Draw again / Share / close controls. Kept as an external
// module, same CSP reason as wallet-connect.js: script-src has no
// 'unsafe-inline'.
import { jokeOfTheDay, randomJoke, nextJoke } from "./face-jokes.js";

const overlay = document.getElementById('faceDrawOverlay');
const cardEl = document.getElementById('faceDrawCard');
const cardInner = cardEl ? cardEl.querySelector('.face-draw-card-inner') : null;
const imgEl = document.getElementById('faceDrawImg');
const labelEl = document.getElementById('faceDrawLabel');
const jokeEl = document.getElementById('faceDrawJoke');
const againBtn = document.getElementById('faceDrawAgainBtn');
const shareBtn = document.getElementById('faceDrawShareBtn');
const fodBtn = document.getElementById('faceOfDayBtn');
const reelEl = document.getElementById('faceDrawReel');
const reelTrackEl = document.getElementById('faceDrawReelTrack');
const cards = document.querySelectorAll('.face-card');
// The real 24, not the aria-hidden duplicates that pad the marquee loop --
// both the reel and a plain click pick faces from this set.
const realCards = [...cards].filter((c) => c.getAttribute('aria-hidden') !== 'true');

if (overlay && cardEl && cardInner && imgEl && labelEl && jokeEl && cards.length) {
  let currentMood = '';
  let currentJoke = '';
  // Odd = back (joke) showing, even = front (face) showing. Only ever
  // climbs -- every reroll/reveal spins the same direction rather than
  // snapping back to 0, so each one reads as forward motion.
  let flipTurns = 0;
  let revealTimer = null;

  // pickJoke defaults to "joke of the day" -- same for every visitor
  // drawing this mood today, rotates tomorrow. Face of the Day and "Draw
  // again" both pass a fresh random pick instead, since their whole point
  // is a genuine reroll.
  function loadCard(card, pickJoke = jokeOfTheDay) {
    const img = card.querySelector('.face-img');
    const label = card.querySelector('.face-label');
    currentMood = label ? label.textContent.trim() : '';
    currentJoke = pickJoke(currentMood);
    imgEl.src = img ? img.src : '';
    imgEl.alt = '';
    labelEl.textContent = currentMood;
    jokeEl.textContent = currentJoke;
  }

  // Shared by every path that lands on the back face (initial reveal flip,
  // post-reel reveal, and every "Draw again" reroll) -- re-enabling the
  // button here (rather than the moment a flip starts) means it can't be
  // clicked again mid-flip, which matters since a reroll mid-flight would
  // restart a fresh transition on top of one that never got to finish.
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

  function onSpinInEnd(e){
    if (e.target !== cardEl) return;
    cardEl.removeEventListener('animationend', onSpinInEnd);
    triggerFlip();
  }

  function resetCardToFront(){
    flipTurns = 0;
    cardInner.classList.remove('is-flipped');
    cardInner.removeEventListener('transitionend', onFlipEnd);
    cardInner.style.transform = 'rotateY(0deg)';
    if (againBtn) { againBtn.disabled = true; againBtn.textContent = 'Draw again ↻'; }
  }

  // ---------- path 1: click a gallery card ----------
  function openDraw(card){
    loadCard(card);
    cardEl.hidden = false;
    if (reelEl) reelEl.hidden = true;
    resetCardToFront();

    // Fly in from wherever the clicked card actually sits on screen,
    // rather than always popping in dead center -- reads as pulling this
    // exact card out of the gallery, not a generic dialog opening.
    const from = card.getBoundingClientRect();
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    const to = cardEl.getBoundingClientRect();
    const fromCenterX = from.left + from.width / 2;
    const fromCenterY = from.top + from.height / 2;
    const toCenterX = to.left + to.width / 2;
    const toCenterY = to.top + to.height / 2;
    cardEl.style.setProperty('--fd-start-x', (fromCenterX - toCenterX) + 'px');
    cardEl.style.setProperty('--fd-start-y', (fromCenterY - toCenterY) + 'px');
    cardEl.style.setProperty('--fd-start-scale', Math.max(0.2, from.width / to.width).toFixed(3));

    cardEl.removeEventListener('animationend', onSpinInEnd);
    cardEl.classList.remove('is-spinning');
    void cardEl.offsetWidth; // restart the animation even on a second draw
    cardEl.classList.add('is-spinning');
    cardEl.addEventListener('animationend', onSpinInEnd);
  }

  // ---------- path 2: the Face of the Day reel ----------
  const REEL_SLOT_COUNT = 36;
  const REEL_WINNER_INDEX = 27; // room to spin up, plus a trailing buffer so the strip doesn't visibly "end" right at the stop
  const REEL_SPIN_MS = 4200;
  let reelEndHandler = null;
  let reelRafId = null;
  let litSlotIndex = -1;

  // No fixed marker line -- instead, whichever slot is actually passing
  // under the (always-visible) center zone gets lit up live as the reel
  // spins, so the highlight itself is what's traveling.
  function setLitSlot(idx){
    if (idx === litSlotIndex) return;
    const slots = reelTrackEl.children;
    if (litSlotIndex >= 0 && slots[litSlotIndex]) slots[litSlotIndex].classList.remove('is-lit');
    litSlotIndex = idx;
    if (idx >= 0 && slots[idx]) slots[idx].classList.add('is-lit');
  }

  function readTranslateX(el){
    const m = getComputedStyle(el).transform;
    if (!m || m === 'none') return 0;
    const match = m.match(/matrix\(([^)]+)\)/);
    return match ? (parseFloat(match[1].split(',')[4]) || 0) : 0;
  }

  function trackLitSlot(step, slotWidth, viewportCenter){
    const centerInTrack = viewportCenter - readTranslateX(reelTrackEl);
    const idx = Math.max(0, Math.min(REEL_SLOT_COUNT - 1, Math.round((centerInTrack - slotWidth / 2) / step)));
    setLitSlot(idx);
    reelRafId = requestAnimationFrame(() => trackLitSlot(step, slotWidth, viewportCenter));
  }

  function stopLitTracking(){
    if (reelRafId) { cancelAnimationFrame(reelRafId); reelRafId = null; }
  }

  function buildReelTrack(winnerCard){
    reelTrackEl.innerHTML = '';
    reelTrackEl.style.transition = 'none';
    reelTrackEl.style.transform = 'translateX(0px)';
    for (let i = 0; i < REEL_SLOT_COUNT; i++) {
      const source = i === REEL_WINNER_INDEX ? winnerCard : realCards[Math.floor(Math.random() * realCards.length)];
      const srcImg = source.querySelector('.face-img');
      const slot = document.createElement('div');
      slot.className = 'face-draw-reel-slot';
      const slotImg = document.createElement('img');
      slotImg.src = srcImg ? srcImg.src : '';
      slotImg.alt = '';
      slot.appendChild(slotImg);
      reelTrackEl.appendChild(slot);
    }
  }

  // Reads real rendered geometry (not an assumed slot-width*index formula)
  // so the landing position stays exact regardless of the responsive slot
  // size/gap actually in effect at this viewport width.
  function spinReel(onDone){
    void reelTrackEl.offsetWidth; // commit the translateX(0) reset from buildReelTrack before measuring
    const slot0 = reelTrackEl.children[0];
    const slot1 = reelTrackEl.children[1];
    const winnerSlot = reelTrackEl.children[REEL_WINNER_INDEX];
    const viewport = reelTrackEl.parentElement;
    const viewportRect = viewport.getBoundingClientRect();
    const slotRect = winnerSlot.getBoundingClientRect();
    const trackRect = reelTrackEl.getBoundingClientRect();
    const step = slot1.getBoundingClientRect().left - slot0.getBoundingClientRect().left; // slot width + gap, measured rather than assumed
    const winnerCenterInTrack = (slotRect.left - trackRect.left) + slotRect.width / 2;
    const viewportCenter = viewportRect.width / 2;
    // A little jitter so it doesn't land dead-center in the slot every
    // single time, same touch real case-opening reels use -- still well
    // inside the slot, nowhere near its edge.
    const jitter = (Math.random() - 0.5) * slotRect.width * 0.3;
    const targetX = viewportCenter - winnerCenterInTrack + jitter;

    litSlotIndex = -1;
    stopLitTracking();
    trackLitSlot(step, slotRect.width, viewportCenter);

    reelTrackEl.style.transition = `transform ${REEL_SPIN_MS}ms cubic-bezier(.1,.86,.15,1)`;
    reelTrackEl.style.transform = `translateX(${targetX}px)`;

    reelEndHandler = (e) => {
      if (e.target !== reelTrackEl || e.propertyName !== 'transform') return;
      reelTrackEl.removeEventListener('transitionend', reelEndHandler);
      reelEndHandler = null;
      stopLitTracking();
      // The live rAF tracking should already have landed here, but pin it
      // explicitly -- rounding across many frames is the kind of thing
      // that's cheap to just guarantee outright instead of trusting.
      setLitSlot(REEL_WINNER_INDEX);
      onDone();
    };
    reelTrackEl.addEventListener('transitionend', reelEndHandler);
  }

  function revealAfterReel(winnerCard){
    if (reelEl) reelEl.hidden = true;
    cardEl.hidden = false;
    loadCard(winnerCard, randomJoke);
    cardEl.classList.remove('is-spinning');
    cardEl.removeEventListener('animationend', onSpinInEnd);
    resetCardToFront();
    // A short beat with the face showing before it turns over -- the reel
    // stopping on it is already the reveal-what-face beat; this is the
    // reveal-the-joke beat.
    clearTimeout(revealTimer);
    revealTimer = setTimeout(triggerFlip, 550);
  }

  function openFaceOfTheDay(){
    if (!realCards.length || !fodBtn || !reelEl || !reelTrackEl) return;
    const winnerCard = realCards[Math.floor(Math.random() * realCards.length)];

    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    cardEl.hidden = true;
    reelEl.hidden = false;

    buildReelTrack(winnerCard);
    spinReel(() => revealAfterReel(winnerCard));
  }

  // ---------- shared: close / reroll / share ----------
  function closeDraw(){
    overlay.hidden = true;
    document.body.style.overflow = '';
    cardEl.classList.remove('is-spinning');
    cardEl.removeEventListener('animationend', onSpinInEnd);
    cardInner.removeEventListener('transitionend', onFlipEnd);
    clearTimeout(revealTimer);
    revealTimer = null;
    if (reelEndHandler) { reelTrackEl.removeEventListener('transitionend', reelEndHandler); reelEndHandler = null; }
    stopLitTracking();
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
    const intent = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text)
      + '&url=' + encodeURIComponent(url) + '&via=robintheface';
    window.open(intent, '_blank', 'noopener,noreferrer,width=600,height=420');
  }

  cards.forEach((card) => {
    if (card.getAttribute('aria-hidden') !== 'true') {
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openDraw(card);
        }
      });
    }
    card.addEventListener('click', () => openDraw(card));
  });

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
