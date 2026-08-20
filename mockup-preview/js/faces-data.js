/* Shared face data — 12 faces revealed so far (of the eventual 25).
   Mirrors the mockup's NAMES/HELD tables. Rarity colors are CSS custom
   properties from /css/styles.css so the palette stays in one place. */
(function (global) {
  "use strict";

  var NAMES = [
    ["OG", "Common", "Nothing has happened yet.", "Genesis"],
    ["Green Day", "Common", "Everything is fine and it will stay fine forever.", "+8% candle"],
    ["Ngoring", "Uncommon", "Sideways for eleven hours. Attention gone.", "Flat chart"],
    ["Bullish", "Common", "Has told four people about this today.", "Breakout"],
    ["Ape In", "Uncommon", "Read zero of it. Bought all of it.", "New listing"],
    ["Diamond Hands", "Rare", "Down 60% and still typing ‘accumulating’.", "-60% unrealised"],
    ["3AM Watch", "Rare", "Awake for no reason a chart could justify.", "3:00 AM"],
    ["DYOR", "Uncommon", "Has a spreadsheet. Ignores the spreadsheet.", "Someone's call"],
    ["Copium", "Rare", "The thesis is intact. The thesis is always intact.", "Red week"],
    ["Rekt", "Epic", "No words left, just the face.", "-40% wick"],
    ["Rugged", "Epic", "Learned something. Will not apply it.", "LP pulled"],
    ["Paper Hands", "Legendary", "Sold the bottom, watched the top, said nothing.", "Panic sell"]
  ];
  var HELD = ["18.2%", "14.9%", "11.4%", "9.8%", "8.6%", "7.1%", "6.4%", "5.9%", "5.2%", "4.4%", "3.1%", "1.8%"];
  var RARITY_COLOR = {
    Common: "var(--forest-400)",
    Uncommon: "var(--forest-300)",
    Rare: "var(--gold-300)",
    Epic: "var(--gold-400)",
    Legendary: "var(--gold-200)"
  };
  var TOTAL_FACES = 25;

  var FACES = NAMES.map(function (n, i) {
    var id = String(i + 1).padStart(2, "0");
    return {
      i: i,
      id: id,
      img: "/mockup-preview/images/face-" + id + ".webp",
      name: n[0],
      rarity: n[1],
      blurb: n[2],
      trigger: n[3],
      held: HELD[i]
    };
  });

  global.RTF_FACES = FACES;
  global.RTF_RARITY_COLOR = RARITY_COLOR;
  global.RTF_TOTAL_FACES = TOTAL_FACES;
})(window);
