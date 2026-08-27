// Maps each mood (index.html, #faces) to a collectible-card rarity tier --
// gives the Face of the Day reveal card (js/face-draw.js) a shine effect
// that matches how "big" that mood reads. Bullish/positive moods get the
// flashy tiers; the rest stay plain.
export const RARITY_BY_MOOD = {
  "OG": "legendary",
  "Diamond Hands": "legendary",
  "Bullish": "mythic",
  "Green Day": "mythic",
  "Ape In": "silver",
  "DYOR": "silver",
  "3AM Watch": "bronze",
  "Ngoring": "bronze",
  "Copium": "normal",
  "Rekt": "normal",
  "Rugged": "normal",
  "Paper Hands": "normal"
};

/**
 * @param {string} mood
 * @returns {"legendary"|"mythic"|"silver"|"bronze"|"normal"}
 */
export function rarityFor(mood) {
  return RARITY_BY_MOOD[mood] || "normal";
}
