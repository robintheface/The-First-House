// With the arcade and draw now side by side, keep a draw from interrupting
// a live run (the old tabs supplied this guard by preventing navigation).
const gameOverlay = document.getElementById('hoodGameOverlay');
const drawButton = document.getElementById('faceOfDayBtn');
const drawNote = document.getElementById('drawAvailability');
const startButton = document.querySelector('[data-start-run]');

function syncRunState() {
  const playing = gameOverlay.hidden;
  drawButton.disabled = playing;
  drawNote.textContent = playing ? 'Finish your run, then reveal your face.' : 'Unlimited spins. Let the hood decide.';
}
if (gameOverlay && drawButton) {
  new MutationObserver(syncRunState).observe(gameOverlay, { attributes: true, attributeFilter: ['hidden'] });
  syncRunState();
}
if (startButton && gameOverlay) {
  const syncStart = () => {
    const drawing = Boolean(drawButton?.disabled && !gameOverlay.hidden);
    startButton.disabled = drawing;
    startButton.title = drawing ? 'Finish revealing your face first' : '';
  };
  if (drawButton) new MutationObserver(syncStart).observe(drawButton, { attributes: true, attributeFilter: ['disabled'] });
  startButton.addEventListener('click', () => {
    document.getElementById('hoodGameWrap').focus({ preventScroll: true });
    document.dispatchEvent(new Event('hood-runner-start'));
  });
}

// Compact information panels still open when reached through a deep link.
function openLinkedDetails() {
  const target = document.getElementById(window.location.hash.slice(1));
  const details = target?.classList.contains('home-about-column') && target.querySelector('details');
  if (details) details.open = true;
}
window.addEventListener('hashchange', openLinkedDetails);
openLinkedDetails();

// Mirror the existing HUD without moving controls out of the fullscreen canvas.
for (const [sourceId, targetId] of [['hoodGameScore', 'runnerScoreDisplay'], ['hoodGameBest', 'runnerBestDisplay']]) {
  const source = document.getElementById(sourceId);
  const target = document.getElementById(targetId);
  if (!source || !target) continue;
  const sync = () => { target.textContent = source.textContent.replace(/^Best:\s*/i, ''); };
  new MutationObserver(sync).observe(source, { childList: true, characterData: true, subtree: true });
  sync();
}
