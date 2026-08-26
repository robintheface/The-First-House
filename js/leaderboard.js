// Client half of the Hood Runner leaderboard.
//
// Every call here is best-effort and non-blocking: the game must play
// exactly the same whether the API is reachable, unreachable, or not
// provisioned at all. Nothing in this module ever throws at the caller and
// nothing it does is on the critical path of a frame.
//
// available() reports whether the leaderboard should exist in the UI at
// all. Until Vercel KV is provisioned the endpoints answer
// {configured:false}, and the game simply shows no leaderboard rather than
// showing one that cannot work.

const API = '/api';

// The player's identity, kept in this browser only. The name is claimed once
// on the server; the secret is what proves, on every run after that, that the
// score belongs to whoever holds the name. Losing it (cleared storage, a
// different browser) means claiming a new name -- there is no account here,
// and nothing worth stealing if it leaks.
const ID_NAME = 'hoodRunnerName';
const ID_SECRET = 'hoodRunnerSecret';

function readStore(key) {
  try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
}

export function identity() {
  const name = readStore(ID_NAME);
  return name ? { name, secret: readStore(ID_SECRET) } : null;
}

export function hasIdentity() {
  const id = identity();
  return Boolean(id && id.secret);
}

// 128 bits from the platform CSPRNG. Generated once and reused, so the same
// browser keeps proving the same claim.
function ensureSecret() {
  let s = readStore(ID_SECRET);
  if (!/^[a-f0-9]{32,64}$/.test(s)) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    s = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem(ID_SECRET, s); } catch (e) { /* private mode */ }
  }
  return s;
}

function rememberName(name) {
  try { localStorage.setItem(ID_NAME, name); } catch (e) { /* private mode */ }
}

let runToken = null;
let available = null;       // null = not probed yet
const boardCache = new Map(); // which -> { at, entries }
let boardSize = 5;          // replaced by whatever /api/leaderboard reports
const CACHE_MS = 15000;

async function req(path, opts) {
  const res = await fetch(API + path, opts);
  if (!res.ok) {
    const err = new Error('http_' + res.status);
    err.status = res.status;
    try { err.body = await res.json(); } catch (e) { err.body = null; }
    throw err;
  }
  return res.json();
}

export function isAvailable() { return available === true; }

// Called as a run begins. The server timestamps the run so a score can
// later be checked against how long it really took -- see api/score.js.
// Fire-and-forget: a failure here just means this run cannot be submitted.
export function startRun() {
  runToken = null;
  return req('/run-start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    // Deliberately does not touch `available`: only /api/leaderboard reports
    // whether the store is configured, and a run-start that succeeded for
    // some other reason must not be able to advertise a board that cannot
    // accept a score.
    .then((d) => { runToken = d && d.token ? d.token : null; })
    .catch(() => { runToken = null; });
}

export async function getBoard(which = 'all') {
  const hit = boardCache.get(which);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.entries;
  try {
    const d = await req('/leaderboard?board=' + encodeURIComponent(which));
    available = d.configured !== false;
    if (Number.isFinite(d.size)) boardSize = d.size;
    const entries = Array.isArray(d.entries) ? d.entries : [];
    boardCache.set(which, { at: Date.now(), entries });
    return entries;
  } catch (e) {
    if (available === null) available = false;
    return hit ? hit.entries : [];
  }
}

// A run is worth offering to save if the board has room or the score beats
// the last place on it. The size comes from the server, so the two can
// never disagree about how many places there are. The server remains the
// authority; this only decides whether to bother the player with a prompt.
export function qualifies(score, entries) {
  if (!Number.isFinite(score) || score <= 0) return false;
  if (entries.length < boardSize) return true;
  return score > entries[entries.length - 1].score;
}

export function canSubmit() { return Boolean(runToken); }

// Is this name still free? Advisory only -- /api/score checks again and
// decides. A failure answers "don't know" so a flaky network never talks a
// player out of a name that would have worked.
export async function checkName(name) {
  try {
    const d = await req('/name-check?name=' + encodeURIComponent(name));
    return { known: true, nickname: d.nickname, valid: d.valid, taken: d.taken };
  } catch (e) {
    return { known: false };
  }
}

// nickname null means "let the server name this one" -- it answers with
// Anonymous#1, Anonymous#2, and so on. Pass undefined to submit under the
// name this browser already holds.
//
// `carried` submits a best score from before the leaderboard existed. There
// is no run behind it, so no token is sent and the server takes it on trust
// within its own limits -- see api/_util.js.
export async function submit(nickname, score, carried) {
  if (!carried && !runToken) return { ok: false, error: 'no_token' };
  const token = carried ? '' : runToken;
  const secret = ensureSecret();
  const named = nickname === null ? { anonymous: true }
    : { nickname: nickname === undefined ? readStore(ID_NAME) : nickname };
  if (!named.anonymous && !named.nickname) return { ok: false, error: 'no_identity' };
  try {
    const d = await req('/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ token, score, secret }, named, carried ? { carried: true } : null))
    });
    if (!carried) runToken = null; // one run, one submission -- the server's own rule
    boardCache.clear(); // the board just changed
    // The server is the authority on the final name (it numbers anonymous
    // ones), so that is what gets remembered.
    if (d.nickname) rememberName(d.nickname);
    return { ok: true, rank: d.rank, nickname: d.nickname, improved: d.improved, best: d.best };
  } catch (err) {
    const error = (err.body && err.body.error) || err.message;
    // A taken name is refused before the server spends the token, so the run
    // survives and the player can try another. Every other rejection spent
    // it, and a network failure might have -- both give the token up.
    if (!carried && error !== 'name_taken') runToken = null;
    return { ok: false, error, retry: error === 'name_taken' };
  }
}
