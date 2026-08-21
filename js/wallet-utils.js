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
  return "👀 Not in the hood — yet";
}

/**
 * Shorten a wallet address to `0x1234…abcd` form.
 * @param {string} a
 * @returns {string}
 */
export function shortAddr(a) {
  return a.slice(0, 6) + "…" + a.slice(-4);
}

// Same thresholds as tierFor() above, in climbing order -- kept separate
// (rather than deriving one from the other) since tierFor's early-return
// ladder and this ascending list read clearest each in their own shape.
const NEXT_TIERS = [
  { name: "Hood Member", min: 100000 },
  { name: "Diamond Hood", min: 1000000 },
  { name: "Whale", min: 10000000 }
];

/**
 * How close a balance is to the next tier up.
 * @param {number} balanceNum
 * @returns {{name: string, threshold: number, remaining: number, progress: number} | null}
 *   null when the balance has already cleared the top tier (nothing left to climb toward).
 */
export function nextTierInfo(balanceNum) {
  const next = NEXT_TIERS.find((t) => balanceNum < t.min);
  if (!next) return null;
  return {
    name: next.name,
    threshold: next.min,
    remaining: next.min - balanceNum,
    progress: Math.max(0, Math.min(1, balanceNum / next.min))
  };
}
