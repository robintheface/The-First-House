// Wires up any [data-copy] element to copy its value to the clipboard, with
// brief visual feedback. Three flavors:
// - .copy-btn elements (the 📋 icon button): icon swaps to a check.
// - an element with data-copied-label (e.g. the hero's "Copy contract"
//   button): its whole label swaps to that text.
// - everything else: the text stays put, only a .copied class toggles
//   (styles.css colors it green) — for cases where blanking the label
//   would hide content the user is trying to read/copy.
// All three reset after 1.5s. Works for any element carrying a data-copy
// value, so it's reusable if another copyable value shows up later.
(function () {
  var targets = document.querySelectorAll("[data-copy]");
  if (!targets.length) return;

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

  function copyToClipboard(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).catch(function () {
        fallbackCopy(value);
      });
    } else {
      fallbackCopy(value);
    }
  }

  targets.forEach(function (el) {
    var isIconButton = el.classList.contains("copy-btn");
    var copiedLabel = el.getAttribute("data-copied-label");
    var swapsText = isIconButton || copiedLabel;
    var originalLabel = el.getAttribute("aria-label") || "Copy";
    var originalText = swapsText ? el.textContent : null;
    var resetTimer = null;

    function trigger() {
      var value = el.getAttribute("data-copy");
      if (!value) return;

      copyToClipboard(value);

      if (isIconButton) el.textContent = "✅";
      else if (copiedLabel) el.textContent = copiedLabel;
      el.classList.add("copied");
      el.setAttribute("aria-label", "Copied!");

      clearTimeout(resetTimer);
      resetTimer = setTimeout(function () {
        if (swapsText) el.textContent = originalText;
        el.classList.remove("copied");
        el.setAttribute("aria-label", originalLabel);
      }, 1500);
    }

    el.addEventListener("click", trigger);
  });
})();
