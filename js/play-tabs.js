// Tab switcher for the #play section, which folds the game and the gacha
// gallery into one module instead of two separate full-height sections.
// Purely a visibility toggle -- neither #game nor #faces changes internally,
// so js/dino-game.js and js/face-draw.js need no changes at all; they keep
// querying the same #game/#faces ids they always have.
(function () {
  var tabs = [].slice.call(document.querySelectorAll(".tabs .tab-btn"));
  if (!tabs.length) return;

  function panelFor(btn) {
    return document.getElementById(btn.getAttribute("aria-controls"));
  }

  function activate(btn) {
    tabs.forEach(function (b) {
      var active = b === btn;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-selected", String(active));
      var panel = panelFor(b);
      if (panel) panel.hidden = !active;
    });
  }

  tabs.forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (btn.disabled) return;
      activate(btn);
    });
  });

  // Switching away doesn't pause either module -- the game's run loop and
  // the gacha spin both keep going while their panel is hidden (see
  // dino-game.js's loop(), which has no visibility check). Losing a run
  // or missing a landing off-screen would be a real bug, not just a
  // cosmetic one, so the tabs that would cause it are disabled for as
  // long as that's true, rather than trying to pause two already-tricky
  // state machines from the outside.
  //
  // Both signals are read-only observations of markup the two modules
  // already drive themselves -- no changes to dino-game.js or
  // face-draw.js needed:
  //   - #hoodGameOverlay is hidden exactly while a run is live -- idle
  //     and game-over both show it again, so overlay.hidden === true is
  //     the one state actually unsafe to switch away from.
  //   - #faceOfDayBtn is disabled from the moment a spin starts until its
  //     reveal card is closed.
  var runTab = document.getElementById("playTabRun");
  var spinTab = document.getElementById("playTabSpin");
  var overlay = document.getElementById("hoodGameOverlay");
  var fodBtn = document.getElementById("faceOfDayBtn");

  var pendingFaces = false;

  function openFaces() {
    if (!spinTab) return;
    // Keep a live run visible; honor the navigation as soon as it finishes.
    pendingFaces = spinTab.disabled;
    if (!pendingFaces) activate(spinTab);
    var navToggle = document.querySelector('.nav-toggle');
    if (navToggle && navToggle.getAttribute('aria-expanded') === 'true') navToggle.click();
    requestAnimationFrame(function () {
      var target = document.querySelector('.tabs');
      if (!target) return;
      var header = document.querySelector('.topbar');
      var offset = (header ? header.getBoundingClientRect().height : 72) + 20;
      window.scrollTo({
        top: Math.max(0, window.scrollY + target.getBoundingClientRect().top - offset),
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
      });
    });
  }

  document.querySelectorAll('a[href="#faces"]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (window.location.hash !== '#faces') history.pushState(null, '', '#faces');
      openFaces();
    });
  });
  window.addEventListener('hashchange', function () {
    if (window.location.hash === '#faces') openFaces();
  });

  function guard(tabBtn, isBusy, busyReason) {
    if (!tabBtn) return;
    tabBtn.disabled = isBusy;
    tabBtn.title = isBusy ? busyReason : "";
  }

  if (spinTab && overlay) {
    var syncSpinTab = function () {
      guard(spinTab, overlay.hidden, "Finish your run first");
      if (pendingFaces && !spinTab.disabled) openFaces();
    };
    new MutationObserver(syncSpinTab).observe(overlay, { attributes: true, attributeFilter: ["hidden"] });
    syncSpinTab();
  }

  if (runTab && fodBtn) {
    var syncRunTab = function () {
      guard(runTab, fodBtn.disabled, "Wait for the reel to land");
    };
    new MutationObserver(syncRunTab).observe(fodBtn, { attributes: true, attributeFilter: ["disabled"] });
    syncRunTab();
  }
  if (window.location.hash === "#faces") openFaces();
})();
