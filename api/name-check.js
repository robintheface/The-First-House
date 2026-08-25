// Answers "is this name free?" while the player is still typing.
//
// Read-only and cheap: one ZSCORE. It is a convenience, not a guarantee --
// /api/score does the same check again and holds the final word, because a
// name can be claimed in the moment between the two.
const { cmd, isConfigured } = require('./_store.js');
const { BOARD_KEY, sanitizeNickname, json } = require('./_util.js');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  if (!isConfigured()) return json(res, 503, { error: 'store_not_configured' });

  try {
    const url = new URL(req.url, 'http://localhost');
    // The sanitized form is what would actually be saved, so that is what is
    // checked -- and it goes back in the answer, so the player is told about
    // a name that is free rather than one that was silently rewritten.
    const nickname = sanitizeNickname(url.searchParams.get('name'));
    if (!nickname) return json(res, 200, { nickname: '', valid: false, taken: false });

    const taken = (await cmd(['ZSCORE', BOARD_KEY, nickname])) !== null;
    return json(res, 200, { nickname, valid: true, taken });
  } catch (err) {
    console.error('name check failed', err);
    return json(res, 503, { error: 'store_unavailable' });
  }
};
