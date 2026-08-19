// Wires up the mobile hamburger nav dropdown. Defensive about missing
// elements since this same script is shared across every page.
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

// If the viewport grows past the breakpoint (rotation, resize) while the
// mobile dropdown is open, drop the "open" state so it doesn't fight the
// desktop nav-row layout.
window.addEventListener("resize", function () {
  if (window.innerWidth >= MOBILE_BREAKPOINT && navDropdown) navDropdown.close();
});
