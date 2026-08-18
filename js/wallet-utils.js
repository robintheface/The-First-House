// Pure helper functions used by functions/wallet.html.
// Kept in their own ES module (rather than inline in the page) so they can
// be imported by the page's <script type="module"> and unit tested with
// Vitest without spinning up a browser.

/**
 * Map a token balance to its hood rank/tier label.
 * @param {number} balanceNum
 * @returns {string}
 */
export function tierFor(balanceNum) {
  if (balanceNum >= 10000000) return "🐋 Whale";
  if (balanceNum >= 1000000) return "💎 Diamond Hood";
  if (balanceNum >= 100000) return "🧢 Hood Member";
  if (balanceNum > 0) return "🌱 Fresh Face";
  return "👀 Not holding yet";
}

/**
 * Shorten a wallet address to `0x1234…abcd` form.
 * @param {string} a
 * @returns {string}
 */
export function shortAddr(a) {
  return a.slice(0, 6) + "…" + a.slice(-4);
}
