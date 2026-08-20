/* Lucky Draw — mocked client-side spin. Pulls-per-day and prize history
   live only in this tab's memory; wire to a per-wallet backend (see the
   design handoff notes) before this pays out anything real. */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var root = document.querySelector("[data-lucky-draw]");
    if (!root) return;

    var FACES = window.RTF_FACES;
    var reelImg = root.querySelector("[data-reel-img]");
    var reelName = root.querySelector("[data-reel-name]");
    var reelStatus = root.querySelector("[data-reel-status]");
    var pullBtn = root.querySelector("[data-pull-btn]");
    var pullsLeftEl = root.querySelector("[data-pulls-left]");
    var historyRow = root.querySelector("[data-history-row]");

    var state = {
      reel: 5,
      spinning: false,
      landed: true,
      pulls: 2,
      history: [9, 3, 6, 0, 11]
    };
    var spinTimer = null;
    var landTimer = null;

    function renderReel() {
      var face = FACES[state.reel];
      reelImg.src = face.img;
      reelImg.alt = face.name;
      reelImg.style.transform = state.spinning
        ? "scale(1.05) rotate(-6deg)"
        : "scale(1.18) rotate(0deg)";
      reelName.textContent = state.spinning ? "…" : face.name;
      reelStatus.textContent = state.spinning
        ? "Pulling"
        : state.landed
        ? face.rarity + " · added to your faces"
        : face.rarity;
      pullBtn.disabled = state.spinning || state.pulls <= 0;
      pullBtn.textContent = state.spinning
        ? "Pulling…"
        : state.pulls > 0
        ? "Pull"
        : "Back tomorrow";
      pullsLeftEl.textContent =
        state.pulls + " free pull" + (state.pulls === 1 ? "" : "s") + " left today";
    }

    function renderHistory() {
      historyRow.innerHTML = "";
      state.history.forEach(function (idx) {
        var face = FACES[idx];
        var card = document.createElement("div");
        card.className = "history-card";
        card.innerHTML =
          '<img src="' + face.img + '" alt="' + face.name + '">' +
          '<div class="name">' + face.name + "</div>";
        historyRow.appendChild(card);
      });
    }

    function spin() {
      if (state.spinning || state.pulls <= 0) return;
      state.spinning = true;
      state.landed = false;
      renderReel();

      spinTimer = setInterval(function () {
        state.reel = (state.reel + 1) % FACES.length;
        renderReel();
      }, 90);

      landTimer = setTimeout(function () {
        clearInterval(spinTimer);
        var i = Math.floor(Math.random() * FACES.length);
        state.spinning = false;
        state.landed = true;
        state.reel = i;
        state.pulls -= 1;
        state.history = [i].concat(state.history).slice(0, 5);
        renderReel();
        renderHistory();
      }, 1800);
    }

    pullBtn.addEventListener("click", spin);
    renderReel();
    renderHistory();

    window.addEventListener("beforeunload", function () {
      clearInterval(spinTimer);
      clearTimeout(landTimer);
    });
  });
})();
