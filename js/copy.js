// Wires up any [data-copy] button to copy its value to the clipboard, with
// brief visual feedback (icon swaps to a check, resets after a beat).
// Currently only used for the tokenomics contract address, but works for
// any element carrying the .copy-btn class + a data-copy value.
(function () {
  var buttons = document.querySelectorAll(".copy-btn[data-copy]");
  if (!buttons.length) return;

  function fallbackCopy(value) {
    var ta = document.createElement("textarea");
    ta.value = value;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch (err) {
      // Nothing more we can do — the click still gives visual feedback below,
      // which is the best signal we can offer without clipboard access.
    }
    document.body.removeChild(ta);
  }

  buttons.forEach(function (btn) {
    var originalLabel = btn.getAttribute("aria-label") || "Copy";
    var originalIcon = btn.textContent;
    var resetTimer = null;

    btn.addEventListener("click", function () {
      var value = btn.getAttribute("data-copy");
      if (!value) return;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).catch(function () {
          fallbackCopy(value);
        });
      } else {
        fallbackCopy(value);
      }

      btn.textContent = "✅";
      btn.classList.add("copied");
      btn.setAttribute("aria-label", "Copied!");

      clearTimeout(resetTimer);
      resetTimer = setTimeout(function () {
        btn.textContent = originalIcon;
        btn.classList.remove("copied");
        btn.setAttribute("aria-label", originalLabel);
      }, 1500);
    });
  });
})();
