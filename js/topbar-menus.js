// Wires up the topbar's two dropdowns: the mobile hamburger nav, and the
// "More" menu nested inside it. Defensive about missing elements since
// this same script is shared across every page.
import { setupDropdown } from "./dropdown.js";

var MOBILE_BREAKPOINT = 720;

var navToggle = document.querySelector(".nav-toggle");
var nav = document.querySelector(".nav-links");
var navDropdown = setupDropdown({
  trigger: navToggle,
  panel: nav,
  onToggle: function (open) {
    if (navToggle) navToggle.textContent = open ? "✕" : "☰";
  }
});

var moreTrigger = document.querySelector(".nav-more-trigger");
var morePanel = document.querySelector(".nav-more-panel");
var moreDropdown = setupDropdown({ trigger: moreTrigger, panel: morePanel });

// If the viewport grows past the breakpoint (rotation, resize) while a
// dropdown is open, drop its "open" state so it doesn't fight the desktop
// layout.
window.addEventListener("resize", function () {
  if (window.innerWidth < MOBILE_BREAKPOINT) return;
  if (navDropdown) navDropdown.close();
  if (moreDropdown) moreDropdown.close();
});
