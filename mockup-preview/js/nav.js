/* Mobile hamburger toggle — shared across every page. */
(function () {
  "use strict";
  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.querySelector(".rt-menu-btn");
    var page = document.querySelector(".rt-page");
    if (!btn || !page) return;
    btn.addEventListener("click", function () {
      var open = page.classList.toggle("nav-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.textContent = open ? "✕" : "☰";
    });
  });
})();
