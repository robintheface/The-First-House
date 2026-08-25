// Accepts a finished run and writes it to the boards if it earns a place.
const { cmd, isConfigured } = require('./_store.js');
const {
  TOP_N, MIN_RUN_MS, MAX_SUBMITS_PER_HOUR,
  clientIp, sanitizeNickname, maxPlausibleScore, dayKey, readBody, json
} = require('./_util.js');


module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  // In-memory fallback is per-instance, so accepting writes without a real
  // store would silently drop most of them. Better to say so than to look
  // like it worked.
  if (!isConfigured()) return json(res, 503, { error: 'store_not_configured' });

  try {
    const body = await readBody(req);
    const score = Math.floor(Number(body.score));
    const nickname = sanitizeNickname(body.nickname);
    const token = typeof body.token === 'string' ? body.token : '';

    if (!nickname) return json(res, 400, { error: 'bad_nickname' });
    if (!Number.isFinite(score) || score <= 0) return json(res, 400, { error: 'bad_score' });
    if (!/^[a-f0-9]{32}$/.test(token)) return json(res, 400, { error: 'bad_token' });

    // Rate limit before touching the run token, so hammering this endpoint
    // cannot burn through tokens.
    const ip = clientIp(req);
    const rlKey = 'rl:' + ip + ':' + Math.floor(Date.now() / 3600000);
    const hits = Number(await cmd(['INCR', rlKey]));
    if (hits === 1) await cmd(['EXPIRE', rlKey, '3600']);
    if (hits > MAX_SUBMITS_PER_HOUR) return json(res, 429, { error: 'rate_limited' });

    const runKey = 'run:' + token;
    const issuedAt = Number(await cmd(['GET', runKey]));
    // Spend the token whatever happens next -- a rejected attempt must not
    // leave it available for a second, better-tuned guess.
    await cmd(['DEL', runKey]);
    if (!issuedAt) return json(res, 400, { error: 'token_unknown_or_used' });

    const runMs = Date.now() - issuedAt;
    if (runMs < MIN_RUN_MS) return json(res, 400, { error: 'run_too_short' });
    if (score > maxPlausibleScore(runMs)) return json(res, 400, { error: 'score_implausible' });

    // GT keeps a player's best rather than their latest, and keying by
    // nickname means one row per name instead of one person filling the
    // whole board with ten runs.
    const today = 'lb:day:' + dayKey();
    await cmd(['ZADD', 'lb:all', 'GT', String(score), nickname]);
    await cmd(['ZADD', today, 'GT', String(score), nickname]);
    await cmd(['EXPIRE', today, String(60 * 60 * 48)]);

    const board = await cmd(['ZREVRANGE', 'lb:all', '0', String(TOP_N - 1), 'WITHSCORES']);
    const names = [];
    for (let i = 0; i < board.length; i += 2) names.push(board[i]);
    const rank = names.indexOf(nickname);

    return json(res, 200, { ok: true, nickname, score, rank: rank === -1 ? null : rank + 1 });
  } catch (err) {
    console.error('score submit failed', err);
    return json(res, 503, { error: 'store_unavailable' });
  }
};
