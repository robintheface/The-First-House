// Shared helpers for the leaderboard endpoints.
const crypto = require('crypto');

// Score ceiling used to reject impossible submissions. Derived from the
// game's own numbers rather than guessed (js/dino-game.js):
//   distance  score += dt * speed * 0.05, speed caps at MAX_SPEED 0.75
//             -> 0.0375/ms = 37.5 points per second
//   coins     25 base + up to 10 combo bonus, and scheduleNextCoin() is elapsed + 1000 +
//             random*1400, so at the very best one per second = 35/s
// A perfect run therefore tops out near 72.5/s. The cap is set well above
// that so no honest player is ever refused; it exists to stop a hand-made
// POST claiming a million, not to police the last few points.
const MAX_POINTS_PER_SEC = 80;
const FLAT_HEADROOM = 150;

// A run cannot finish faster than the spawn flicker (SPAWN_DURATION_MS
// 1000) plus a moment of play, and a token older than this is stale.
const MIN_RUN_MS = 1200;
const TOKEN_TTL_SEC = 30 * 60;

// Every finished run submits now, so this has to sit above what an evening
// of short runs produces. A submission still costs a run token, and those
// are capped in turn, so this is a backstop rather than the real limit.
const MAX_SUBMITS_PER_HOUR = 150;
// run-start and name-check are unauthenticated and each costs a store call,
// so they are capped too -- generously, since a real player triggers many of
// both. These bound a flood, they do not police normal play.
const MAX_RUN_STARTS_PER_HOUR = 200;
const MAX_NAME_CHECKS_PER_HOUR = 300;
const HOUR_SEC = 3600;
// Bodies are tiny; anything larger is not a player.
const MAX_BODY_BYTES = 4096;
// Returned in place of a parsed body when the cap is hit, so the handler can
// answer 413 rather than puzzling over an empty object.
const TOO_BIG = Object.freeze({ __oversize: true });

// How many places the board keeps. Ten, so a decent run still earns a
// spot -- the popup does not try to show them all at once: its list is
// capped at five rows and scrolls, which is what kept the panel inside the
// 450px canvas on a phone held upright (see .hood-game-ranks-list).
const TOP_N = 10;

const NICK_MAX = 12;
// Skipping the name prompt still keeps the place, under a numbered name the
// server hands out: Anonymous#1, Anonymous#2, and so on.
const ANON_PREFIX = 'Anonymous#';
const ANON_COUNTER = 'lb:anon';
// Names are first come, first served, and claimed for good: owner:<name>
// holds a hash of the secret the claiming browser generated. Later runs from
// that browser present the same secret, which is what lets a score be
// updated in place without anyone else being able to overwrite it.
const BOARD_KEY = 'lb:all';
const OWNER_PREFIX = 'owner:';
// 32 hex characters, matching what the client generates.
const SECRET_RE = /^[a-f0-9]{32,64}$/;

// A best score carried over from before the leaderboard existed has no run
// behind it -- no token, no elapsed time, nothing to check it against. It is
// accepted on trust, so the only thing standing behind it is these two
// limits: a per-IP daily cap on how many can be claimed, and a ceiling no
// honest carried-over score would reach. Neither is verification.
//
// The cap is deliberately loose. Addresses are shared -- a household, an
// office, a whole mobile carrier behind one NAT -- and each player carries a
// score exactly once, on the run where they first pick a name. A tight cap
// turns "several people on the same wifi" into "the fourth one is refused",
// which is the far likelier event. What actually keeps the board honest is
// that a name can only be claimed once.
const MAX_CARRIED_PER_DAY = 25;
const MAX_CARRIED_SCORE = 50000;
// Kept intentionally small and obvious: a blocklist can never be complete,
// and an aggressive one mangles innocent names. This catches the lazy case;
// anything past it is a moderation problem, not a regex problem.
const BLOCKED = ['nigger', 'faggot', 'retard', 'rape', 'cunt'];

// Every rate limit here is only as good as the address it counts against.
//
// x-forwarded-for is written by whoever sent the request, and its LEFTMOST
// entry is the sender's own claim -- reading that let one machine rotate
// through a fresh limit bucket per request just by changing a header, which
// defeated both the hourly cap and the carried-score cap outright.
//
// x-vercel-forwarded-for is set by Vercel's edge and cannot be supplied from
// outside, so it is trusted first. Failing that, the RIGHTMOST entry of
// x-forwarded-for is the one the nearest proxy appended, which is the only
// part of that header a client cannot choose.
function clientIp(req) {
  const h = req.headers || {};
  const socket = req.socket && req.socket.remoteAddress;
  if (process.env.VERCEL) {
    // Vercel's edge writes x-vercel-forwarded-for itself and strips any the
    // client sent, so it is the one header here that cannot be chosen from
    // outside. Plain x-forwarded-for is ignored on purpose: trusting it is
    // what let a single machine mint a fresh rate-limit bucket per request.
    const edge = h['x-vercel-forwarded-for'];
    return boundIp(typeof edge === 'string' && edge.trim() ? edge.split(',')[0] : socket);
  }
  // Off Vercel: the rightmost entry is the one the nearest proxy appended,
  // the only part of the header a client cannot write. With no proxy at all
  // there is nothing to trust but the socket.
  const xff = h['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) return boundIp(xff.split(',').pop());
  return boundIp(socket);
}

// The address becomes part of a Redis key, so it is bounded and stripped to
// the characters an address can actually contain.
function boundIp(raw) {
  const v = String(raw || '').trim().replace(/[^0-9a-fA-F.:]/g, '').slice(0, 45);
  return v || 'unknown';
}

// Shared fixed-window limiter. `cmd` is passed in so this file stays free of
// the store, which the unconfigured-deployment test depends on.
async function overRateLimit(cmd, bucket, ip, max, windowSec) {
  const key = 'rl:' + bucket + ':' + ip + ':' + Math.floor(Date.now() / (windowSec * 1000));
  const hits = Number(await cmd(['INCR', key]));
  if (hits === 1) await cmd(['EXPIRE', key, String(windowSec)]);
  return hits > max;
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

// The secret never reaches the store in the clear: what is kept is a hash,
// so a store dump does not hand over anyone's name.
function hashSecret(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest('hex');
}

// Compared without leaking where two hashes start to differ.
function sameHash(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
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
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    req.on('data', (c) => {
      if (raw.length > MAX_BODY_BYTES) return; // stop growing, keep draining
      raw += c;
      // Answered here rather than by destroying the stream. req.destroy()
      // emits neither 'end' nor 'error', so a promise left to those alone
      // never settles and the request hangs until the platform times it out;
      // it also resets the connection, so the caller gets no answer at all.
      if (raw.length > MAX_BODY_BYTES) finish(TOO_BIG);
    });
    req.on('end', () => { try { finish(JSON.parse(raw || '{}')); } catch (err) { finish({}); } });
    req.on('error', () => finish({}));
    req.on('aborted', () => finish({}));
    req.on('close', () => finish({}));
  });
}

// `cache` is for public read-only answers: it lets the CDN serve repeats
// instead of forwarding every one to the store, which is what stops an
// unauthenticated GET from being an easy way to burn the store's quota.
function json(res, status, payload, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.end(JSON.stringify(payload));
}

module.exports = {
  TOP_N, MIN_RUN_MS, TOKEN_TTL_SEC, MAX_SUBMITS_PER_HOUR, NICK_MAX,
  ANON_PREFIX, ANON_COUNTER, BOARD_KEY, OWNER_PREFIX, SECRET_RE,
  MAX_CARRIED_PER_DAY, MAX_CARRIED_SCORE,
  MAX_RUN_STARTS_PER_HOUR, MAX_NAME_CHECKS_PER_HOUR, HOUR_SEC, MAX_BODY_BYTES, TOO_BIG,
  clientIp, boundIp, overRateLimit, sanitizeNickname, hashSecret, sameHash,
  maxPlausibleScore, dayKey, readBody, json
};
