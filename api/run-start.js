// Hands out a single-use token at the moment a run begins.
//
// This is the whole basis of the anti-cheat: the server, not the client,
// decides when a run started, so /api/score can check the claimed points
// against how long the run actually took. A token is deleted the first
// time it is spent, so one run can post exactly one score.
const crypto = require('crypto');
const { cmd } = require('./_store.js');
const { TOKEN_TTL_SEC, json } = require('./_util.js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  try {
    const token = crypto.randomBytes(16).toString('hex');
    await cmd(['SET', 'run:' + token, String(Date.now())]);
    await cmd(['EXPIRE', 'run:' + token, String(TOKEN_TTL_SEC)]);
    return json(res, 200, { token });
  } catch (err) {
    console.error('run-start failed', err);
    return json(res, 503, { error: 'store_unavailable' });
  }
};
