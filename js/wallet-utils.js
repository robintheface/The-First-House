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

/**
 * Split a tierFor() label into its leading emoji and the rest of the name,
 * so the UI can put the glyph in its own icon ring instead of inline with
 * the text. The emoji is always the first space-separated token, however
 * many words follow it ("Not in the hood — yet" included).
 * @param {string} tierLabel
 * @returns {{icon: string, name: string}}
 */
export function splitTierLabel(tierLabel) {
  const spaceAt = tierLabel.indexOf(" ");
  if (spaceAt === -1) return { icon: tierLabel, name: "" };
  return { icon: tierLabel.slice(0, spaceAt), name: tierLabel.slice(spaceAt + 1) };
}

/**
 * Which theme color a tier's badge/ring should use -- the same color
 * already assigned to each row of the ladder page (explore/wallet/ladder),
 * so a connected wallet's result reads as the same rank system rather than
 * a different one that happens to share the tier names. Same boundaries as
 * tierFor(), kept as their own ladder rather than derived from it: parsing
 * a color back out of an emoji-prefixed label is more fragile than just
 * repeating five numbers.
 * @param {number} balanceNum
 * @returns {string} a `var(--token)` reference, ready to drop into inline style
 */
export function tierColorVar(balanceNum) {
  if (balanceNum >= 10000000) return "var(--gold)";
  if (balanceNum >= 1000000) return "var(--green-bright)";
  if (balanceNum >= 100000) return "var(--bronze)";
  if (balanceNum > 0) return "var(--cream2)";
  return "var(--ink-dim)";
}

/**
 * A line of tier flavor text -- the exact same one already printed next to
 * each row of the ladder page (explore/wallet/ladder). Copied here rather
 * than scraped from that page's static HTML, so a connected wallet reads as
 * a verdict on the same five-tier philosophy the ladder lays out, not a
 * second, separately-worded one that happens to use the same tier names.
 * Same boundaries as tierFor(), same reasoning as tierColorVar() for
 * keeping its own copy of them.
 * @param {number} balanceNum
 * @returns {string}
 */
export function tierBlurb(balanceNum) {
  if (balanceNum >= 10000000) return "The tide doesn't move without you. Green days, you did that.";
  if (balanceNum >= 1000000) return "Been through every dip and never once looked away.";
  if (balanceNum >= 100000) return "Not new, not soft. You know how this goes by now.";
  if (balanceNum > 0) return "First candle's always the hardest. Welcome to the hood.";
  return "Still watching from outside. There's room for one more.";
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
