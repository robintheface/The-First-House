// "Draw a card" interaction for the homepage gallery (index.html, #faces) --
// clicking any face card spins it up to the center of the page like a gacha
// pull, then flips it to reveal a random joke for that mood on the back.
// Kept as an external module, same CSP reason as wallet-connect.js:
// script-src has no 'unsafe-inline'.
import { jokeOfTheDay, nextJoke } from "./face-jokes.js";

const overlay = document.getElementById('faceDrawOverlay');
const cardEl = document.getElementById('faceDrawCard');
const cardInner = cardEl ? cardEl.querySelector('.face-draw-card-inner') : null;
const imgEl = document.getElementById('faceDrawImg');
const labelEl = document.getElementById('faceDrawLabel');
const jokeEl = document.getElementById('faceDrawJoke');
const againBtn = document.getElementById('faceDrawAgainBtn');
const cards = document.querySelectorAll('.face-card');

if (overlay && cardEl && cardInner && imgEl && labelEl && jokeEl && cards.length) {
  let currentMood = '';
  let currentJoke = '';
  // Odd = back (joke) showing, even = front (face) showing. Only ever
  // climbs -- "Draw again" always spins the same direction rather than
  // snapping back to 0, so every reroll reads as forward motion.
  let flipTurns = 0;

  function loadCard(card) {
    const img = card.querySelector('.face-img');
    const label = card.querySelector('.face-label');
    currentMood = label ? label.textContent.trim() : '';
    // The default reveal is "joke of the day" -- same for every visitor
    // drawing this mood today, rotates tomorrow. Draw again (below) is the
    // one that's actually random.
    currentJoke = jokeOfTheDay(currentMood);
    imgEl.src = img ? img.src : '';
    imgEl.alt = '';
    labelEl.textContent = currentMood;
    jokeEl.textContent = currentJoke;
  }

  // Shared by the initial reveal flip and every "Draw again" reroll --
  // re-enabling the button here (rather than the moment the flip starts)
  // means it can't be clicked again mid-flip, which matters since a reroll
  // mid-flight would restart a fresh 500ms transition on top of one that
  // never got to finish.
  function onFlipEnd(e){
    if (e.target !== cardInner || e.propertyName !== 'transform') return;
    cardInner.removeEventListener('transitionend', onFlipEnd);
    jokeEl.textContent = currentJoke;
    if (againBtn) againBtn.disabled = false;
  }

  function onSpinInEnd(e){
    if (e.target !== cardEl) return;
    cardEl.removeEventListener('animationend', onSpinInEnd);
    flipTurns = 1;
    cardInner.classList.add('is-flipped');
    cardInner.removeEventListener('transitionend', onFlipEnd);
    cardInner.style.transform = 'rotateY(180deg)';
    cardInner.addEventListener('transitionend', onFlipEnd);
  }

  function openDraw(card){
    loadCard(card);

    // Fly in from wherever the clicked card actually sits on screen, rather
    // than always popping in dead center -- reads as pulling this exact
    // card out of the gallery, not a generic dialog opening.
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

    flipTurns = 0;
    cardInner.classList.remove('is-flipped');
    cardInner.removeEventListener('transitionend', onFlipEnd);
    cardInner.style.transform = 'rotateY(0deg)';
    if (againBtn) { againBtn.disabled = true; againBtn.textContent = 'Draw again ↻'; }

    cardEl.removeEventListener('animationend', onSpinInEnd);
    cardEl.classList.remove('is-spinning');
    void cardEl.offsetWidth; // restart the animation even on a second draw
    cardEl.classList.add('is-spinning');
    cardEl.addEventListener('animationend', onSpinInEnd);
  }

  function closeDraw(){
    overlay.hidden = true;
    document.body.style.overflow = '';
    cardEl.classList.remove('is-spinning');
    cardEl.removeEventListener('animationend', onSpinInEnd);
    cardInner.removeEventListener('transitionend', onFlipEnd);
  }

  function drawAgain(){
    if (!currentMood || (againBtn && againBtn.disabled)) return;
    currentJoke = nextJoke(currentMood, currentJoke);
    if (againBtn) againBtn.disabled = true;
    flipTurns += 2; // stays on an odd multiple -- back still faces forward
    cardInner.removeEventListener('transitionend', onFlipEnd);
    cardInner.style.transform = `rotateY(${flipTurns * 180}deg)`;
    cardInner.addEventListener('transitionend', onFlipEnd);
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

  overlay.querySelectorAll('[data-draw-close]').forEach((el) => {
    el.addEventListener('click', closeDraw);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) closeDraw();
  });
  if (againBtn) againBtn.addEventListener('click', drawAgain);
}
