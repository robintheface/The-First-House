// Shared helpers for the leaderboard endpoints.

// Score ceiling used to reject impossible submissions. Derived from the
// game's own numbers rather than guessed (js/dino-game.js):
//   distance  score += dt * speed * 0.05, speed caps at MAX_SPEED 0.75
//             -> 0.0375/ms = 37.5 points per second
//   coins     COIN_SCORE 25, and scheduleNextCoin() is elapsed + 1000 +
//             random*1400, so at the very best one per second = 25/s
// A perfect run therefore tops out near 62.5/s. The cap is set well above
// that so no honest player is ever refused; it exists to stop a hand-made
// POST claiming a million, not to police the last few points.
const MAX_POINTS_PER_SEC = 80;
const FLAT_HEADROOM = 150;

// A run cannot finish faster than the spawn flicker (SPAWN_DURATION_MS
// 1000) plus a moment of play, and a token older than this is stale.
const MIN_RUN_MS = 1200;
const TOKEN_TTL_SEC = 30 * 60;

const MAX_SUBMITS_PER_HOUR = 20;

// How many places the board keeps. Ten, so a decent run still earns a
// spot -- the popup does not try to show them all at once: its list is
// capped at five rows and scrolls, which is what kept the panel inside the
// 450px canvas on a phone held upright (see .hood-game-ranks-list).
const TOP_N = 10;

const NICK_MAX = 16;
// Kept intentionally small and obvious: a blocklist can never be complete,
// and an aggressive one mangles innocent names. This catches the lazy case;
// anything past it is a moderation problem, not a regex problem.
const BLOCKED = ['nigger', 'faggot', 'retard', 'rape', 'cunt'];

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff) return xff.split(',')[0].trim();
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}

function sanitizeNickname(raw) {
  if (typeof raw !== 'string') return null;
  // Strip anything that is not a plain letter/digit/space or - _ . so a
  // nickname can never carry markup or control characters into the DOM.
  let n = raw.normalize('NFKC').replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim();
  if (!n) return null;
  n = n.slice(0, NICK_MAX);
  const flat = n.toLowerCase().replace(/[^a-z]/g, '');
  if (BLOCKED.some((w) => flat.includes(w))) return null;
  return n;
}

function maxPlausibleScore(runMs) {
  return Math.ceil((runMs / 1000) * MAX_POINTS_PER_SEC) + FLAT_HEADROOM;
}

// UTC day key, so "today's board" flips at the same instant for everyone
// rather than depending on where the player happens to be.
function dayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 4096) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (err) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

module.exports = {
  TOP_N, MIN_RUN_MS, TOKEN_TTL_SEC, MAX_SUBMITS_PER_HOUR, NICK_MAX,
  clientIp, sanitizeNickname, maxPlausibleScore, dayKey, readBody, json
};
