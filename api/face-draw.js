// Server-side gate for the "Face of the Day" draw (js/face-draw.js) -- caps
// each IP to a handful of draws per UTC day, independent of anything the
// client claims. Client-only tracking (localStorage) would be trivially
// bypassed by clearing storage or an incognito tab, so the limit lives
// here instead: the client calls this before it ever starts spinning the
// gallery, and only proceeds on a 200.
const { cmd, isConfigured } = require('./_store.js');
const { clientIp, json } = require('./_util.js');

const MAX_DRAWS_PER_DAY = 3;
const DAY_SEC = 86400;

// A short, explicit carve-out for specific IPs (comma-separated in the env,
// never hardcoded here -- an IP is personal enough that it belongs in
// Vercel's env config, not the public repo) that skip the daily cap
// entirely. Checked before isConfigured() too, on purpose: a whitelisted
// caller is meant to be unrestricted, not merely "unrestricted whenever the
// store happens to be up."
const WHITELIST = (process.env.FOD_WHITELIST_IPS || '')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

// Testing-only lever: any truthy FOD_RATE_LIMIT_DISABLED (Vercel env, e.g.
// "1") turns off the daily cap for every IP, not just the whitelist --
// for exercising the whole draw flow repeatedly while testing without
// tripping the normal 3/day limit. Unset it (or set to "" / "0") to go
// back to normal enforcement -- nothing else about the endpoint changes.
const RATE_LIMIT_DISABLED = !!process.env.FOD_RATE_LIMIT_DISABLED && process.env.FOD_RATE_LIMIT_DISABLED !== '0';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  if (RATE_LIMIT_DISABLED || WHITELIST.includes(clientIp(req).toLowerCase())) {
    return json(res, 200, { ok: true, remaining: MAX_DRAWS_PER_DAY, limit: MAX_DRAWS_PER_DAY, unlimited: true });
  }
  // Without a real store there is nowhere to count against -- refusing
  // here (rather than quietly allowing unlimited draws) keeps this
  // endpoint honest about what it can actually enforce, same call
  // run-start.js makes for the leaderboard.
  if (!isConfigured()) return json(res, 503, { error: 'store_not_configured' });
  try {
    // Fixed window keyed by the epoch day number: Math.floor(now / 1 day)
    // ticks over at exactly 00:00 UTC, since the epoch itself starts at a
    // UTC midnight -- the reset boundary asked for, with no separate
    // day-key/timezone logic needed.
    const key = 'rl:fod:' + clientIp(req) + ':' + Math.floor(Date.now() / (DAY_SEC * 1000));
    const hits = Number(await cmd(['INCR', key]));
    if (hits === 1) await cmd(['EXPIRE', key, String(DAY_SEC)]);
    if (hits > MAX_DRAWS_PER_DAY) {
      return json(res, 429, { error: 'rate_limited', remaining: 0, limit: MAX_DRAWS_PER_DAY });
    }
    return json(res, 200, { ok: true, remaining: MAX_DRAWS_PER_DAY - hits, limit: MAX_DRAWS_PER_DAY });
  } catch (err) {
    console.error('face-draw failed', err);
    return json(res, 503, { error: 'store_unavailable' });
  }
};
