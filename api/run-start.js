// Hands out a single-use token at the moment a run begins.
//
// This is the whole basis of the anti-cheat: the server, not the client,
// decides when a run started, so /api/score can check the claimed points
// against how long the run actually took. A token is deleted the first
// time it is spent, so one run can post exactly one score.
const crypto = require('crypto');
const { cmd, isConfigured } = require('./_store.js');
const {
  TOKEN_TTL_SEC, MAX_RUN_STARTS_PER_HOUR, HOUR_SEC, clientIp, overRateLimit, json
} = require('./_util.js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  // Without a real store this would hand out a token backed by per-instance
  // memory that /api/score will refuse to spend -- the player would be
  // invited to name their run and then told it could not be saved. Refusing
  // here keeps every endpoint agreeing about whether the board exists.
  if (!isConfigured()) return json(res, 503, { error: 'store_not_configured' });
  try {
    // Unauthenticated and it writes a key every time, so a loop here would
    // fill the store for free. The cap is far above what playing produces.
    if (await overRateLimit(cmd, 'start', clientIp(req), MAX_RUN_STARTS_PER_HOUR, HOUR_SEC)) {
      return json(res, 429, { error: 'rate_limited' });
    }
    const token = crypto.randomBytes(16).toString('hex');
    // One round trip, not two: this sits at the start of every run, so the
    // TTL rides along with the write rather than costing a second call.
    await cmd(['SET', 'run:' + token, String(Date.now()), 'EX', String(TOKEN_TTL_SEC)]);
    return json(res, 200, { token });
  } catch (err) {
    console.error('run-start failed', err);
    return json(res, 503, { error: 'store_unavailable' });
  }
};
