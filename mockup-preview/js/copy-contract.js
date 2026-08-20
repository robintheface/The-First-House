/* Copy-to-clipboard for the contract address box on the landing page. */
(function () {
  "use strict";
  document.addEventListener("DOMContentLoaded", function () {
    var buttons = document.querySelectorAll("[data-copy-contract]");
    buttons.forEach(function (btn) {
      var addr = btn.getAttribute("data-copy-contract");
      var defaultLabel = btn.textContent;
      var timer = null;
      btn.addEventListener("click", function () {
        var done = function () {
          clearTimeout(timer);
          btn.textContent = btn.hasAttribute("data-copied-label")
            ? btn.getAttribute("data-copied-label")
            : "Copied";
          timer = setTimeout(function () { btn.textContent = defaultLabel; }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(addr).then(done, done);
        } else {
          // Fallback for browsers without the async clipboard API.
          var tmp = document.createElement("textarea");
          tmp.value = addr;
          tmp.style.position = "fixed";
          tmp.style.opacity = "0";
          document.body.appendChild(tmp);
          tmp.select();
          try { document.execCommand("copy"); } catch (e) { /* no-op */ }
          document.body.removeChild(tmp);
          done();
        }
      });
    });
  });
})();
