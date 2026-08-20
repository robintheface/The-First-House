/* Face gallery + detail — filter the grid, click a face to load it into the
   detail panel. Grid + default detail are server-rendered in the HTML so
   the page still reads fine with JS disabled; this only layers interaction
   on top. */
(function () {
  "use strict";

  var RARE_PLUS = ["Rare", "Epic", "Legendary"];
  var EVERYDAY = ["Common", "Uncommon"];

  document.addEventListener("DOMContentLoaded", function () {
    var root = document.querySelector("[data-face-gallery]");
    if (!root) return;

    var FACES = window.RTF_FACES;
    var cards = root.querySelectorAll("[data-face-card]");
    var filterBtns = root.querySelectorAll("[data-filter]");
    var detail = {
      img: root.querySelector("[data-detail-img]"),
      name: root.querySelector("[data-detail-name]"),
      rarity: root.querySelector("[data-detail-rarity]"),
      blurb: root.querySelector("[data-detail-blurb]"),
      trigger: root.querySelector("[data-detail-trigger]"),
      held: root.querySelector("[data-detail-held]")
    };

    function selectFace(index) {
      var face = FACES[index];
      if (!face) return;
      detail.img.src = face.img;
      detail.img.alt = face.name;
      detail.name.textContent = face.name;
      detail.rarity.textContent = face.rarity;
      detail.blurb.textContent = face.blurb;
      detail.trigger.textContent = face.trigger;
      detail.held.textContent = face.held + " of holders";
      cards.forEach(function (c) {
        c.classList.toggle("is-active", Number(c.dataset.faceCard) === index);
      });
    }

    function applyFilter(name) {
      cards.forEach(function (c) {
        var rarity = c.dataset.rarity;
        var show =
          name === "All" ||
          (name === "Rare+" && RARE_PLUS.indexOf(rarity) > -1) ||
          (name === "Everyday" && EVERYDAY.indexOf(rarity) > -1);
        c.hidden = !show;
      });
      filterBtns.forEach(function (b) {
        b.classList.toggle("is-active", b.dataset.filter === name);
      });
    }

    cards.forEach(function (card) {
      card.addEventListener("click", function () {
        selectFace(Number(card.dataset.faceCard));
      });
    });

    filterBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyFilter(btn.dataset.filter);
      });
    });
  });
})();
