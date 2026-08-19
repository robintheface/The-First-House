// Mobile hamburger menu: below the 720px breakpoint the desktop nav row is
// hidden entirely (see .nav-links in styles.css), so this wires up the
// toggle button that reveals it as a dropdown instead. Defensive about
// missing elements since this same script is shared across every page.
(function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".nav-links");
  if (!toggle || !nav) return;

  var MOBILE_BREAKPOINT = 720;

  function closeMenu() {
    nav.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "☰";
  }

  function openMenu() {
    nav.classList.add("open");
    toggle.setAttribute("aria-expanded", "true");
    toggle.textContent = "✕";
  }

  toggle.addEventListener("click", function () {
    if (nav.classList.contains("open")) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  // Tapping a nav link should close the dropdown, not leave it open behind
  // the section it just scrolled to.
  nav.addEventListener("click", function (e) {
    if (e.target.tagName === "A") closeMenu();
  });

  // If the viewport grows past the breakpoint (rotation, resize) while the
  // dropdown is open, drop the "open" state so it doesn't fight the desktop
  // nav-row layout.
  window.addEventListener("resize", function () {
    if (window.innerWidth >= MOBILE_BREAKPOINT) closeMenu();
  });

  // Tapping/clicking anywhere outside the open dropdown (or its toggle)
  // closes it, same as most nav drawers.
  document.addEventListener("click", function (e) {
    if (!nav.classList.contains("open")) return;
    if (nav.contains(e.target) || toggle.contains(e.target)) return;
    closeMenu();
  });

  // Escape closes it too, for keyboard users.
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && nav.classList.contains("open")) closeMenu();
  });
})();
