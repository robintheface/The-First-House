// Accepts a finished run and writes it to the boards if it earns a place.
const { cmd, isConfigured } = require('./_store.js');
const {
  TOP_N, MIN_RUN_MS, MAX_SUBMITS_PER_HOUR, ANON_PREFIX, ANON_COUNTER, BOARD_KEY,
  OWNER_PREFIX, SECRET_RE, MAX_CARRIED_PER_DAY, MAX_CARRIED_SCORE,
  HOUR_SEC, TOO_BIG,
  clientIp, overRateLimit, sanitizeNickname, hashSecret, sameHash,
  maxPlausibleScore, dayKey, readBody, json
} = require('./_util.js');


module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  // In-memory fallback is per-instance, so accepting writes without a real
  // store would silently drop most of them. Better to say so than to look
  // like it worked.
  if (!isConfigured()) return json(res, 503, { error: 'store_not_configured' });

  try {
    const body = await readBody(req);
    if (body === TOO_BIG) return json(res, 413, { error: 'body_too_large' });
    const score = Math.floor(Number(body.score));
    // An anonymous save asks the server for a name instead of supplying one,
    // so two players skipping at the same moment cannot land on the same row.
    const anonymous = body.anonymous === true;
    const nickname = anonymous ? '' : sanitizeNickname(body.nickname);
    // The browser's own secret. It claims a name the first time and proves
    // ownership of it on every run after that.
    const secret = typeof body.secret === 'string' ? body.secret : '';
    const token = typeof body.token === 'string' ? body.token : '';
    // A best score from before the leaderboard existed: there is no run to
    // point at, so it skips the token rules entirely and answers to the
    // carried-score limits instead. Accepted on trust -- see api/_util.js.
    const carried = body.carried === true;

    if (!anonymous && !nickname) return json(res, 400, { error: 'bad_nickname' });
    if (!SECRET_RE.test(secret)) return json(res, 400, { error: 'bad_secret' });
    if (!Number.isFinite(score) || score <= 0) return json(res, 400, { error: 'bad_score' });
    if (!carried && !/^[a-f0-9]{32}$/.test(token)) return json(res, 400, { error: 'bad_token' });
    if (carried && score > MAX_CARRIED_SCORE) return json(res, 400, { error: 'score_implausible' });

    // Rate limit before touching the run token, so hammering this endpoint
    // cannot burn through tokens.
    const ip = clientIp(req);
    if (await overRateLimit(cmd, 'score', ip, MAX_SUBMITS_PER_HOUR, HOUR_SEC)) {
      return json(res, 429, { error: 'rate_limited' });
    }

    // Checked before the token is spent, and only for a typed name: a name
    // held by someone else is the one rejection a player can actually fix, so
    // it must not cost them the run. Every rule below this line is about the
    // run itself, where a retry would only be a second guess at the limits.
    const mine = hashSecret(secret);
    let owned = false;                 // true once this secret is known to hold the name
    if (!anonymous) {
      const holder = await cmd(['GET', OWNER_PREFIX + nickname]);
      if (holder) {
        if (!sameHash(holder, mine)) return json(res, 409, { error: 'name_taken' });
        owned = true;
      }
    }

    if (carried) {
      // Counted only once the name is known to be free, so a rejected name
      // does not eat one of the player's three.
      const carriedKey = 'carried:' + ip + ':' + dayKey();
      const used = Number(await cmd(['INCR', carriedKey]));
      if (used === 1) await cmd(['EXPIRE', carriedKey, String(60 * 60 * 24)]);
      if (used > MAX_CARRIED_PER_DAY) return json(res, 429, { error: 'carried_limit' });
    } else {
      const runKey = 'run:' + token;
      const issuedAt = Number(await cmd(['GET', runKey]));
      // Spend the token whatever happens next -- a rejected attempt must not
      // leave it available for a second, better-tuned guess.
      await cmd(['DEL', runKey]);
      if (!issuedAt) return json(res, 400, { error: 'token_unknown_or_used' });

      const runMs = Date.now() - issuedAt;
      if (runMs < MIN_RUN_MS) return json(res, 400, { error: 'run_too_short' });
      if (score > maxPlausibleScore(runMs)) return json(res, 400, { error: 'score_implausible' });
    }

    // Numbered only once the run has passed every check, so a rejected
    // attempt cannot burn a number. INCR is atomic, so concurrent skips get
    // distinct names rather than racing for one.
    const name = anonymous ? ANON_PREFIX + (await cmd(['INCR', ANON_COUNTER])) : nickname;

    if (!owned) {
      // First claim. SET NX is what closes the gap between the check above
      // and this write: two browsers reaching for the same free name at the
      // same instant cannot both come away holding it.
      const claimed = await cmd(['SET', OWNER_PREFIX + name, mine, 'NX']);
      if (!claimed) return json(res, 409, { error: 'name_taken' });
    }

    // GT: the board keeps a player's best, not their latest, which is what
    // lets every finished run submit without a losing run undoing a good one.
    // CH reports whether the score actually moved, so the game can say so.
    const improved = Number(await cmd(['ZADD', BOARD_KEY, 'GT', 'CH', String(score), name])) > 0;

    const today = 'lb:day:' + dayKey();
    await cmd(['ZADD', today, 'GT', 'CH', String(score), name]);
    await cmd(['EXPIRE', today, String(60 * 60 * 48)]);

    const board = (await cmd(['ZREVRANGE', BOARD_KEY, '0', String(TOP_N - 1), 'WITHSCORES'])) || [];
    const names = [];
    for (let i = 0; i < board.length; i += 2) names.push(board[i]);
    const rank = names.indexOf(name);

    const bestNow = Number(await cmd(['ZSCORE', BOARD_KEY, name]));
    return json(res, 200, {
      ok: true, nickname: name, score, improved,
      best: Number.isFinite(bestNow) ? bestNow : score,
      rank: rank === -1 ? null : rank + 1
    });
  } catch (err) {
    console.error('score submit failed', err);
    return json(res, 503, { error: 'store_unavailable' });
  }
};
