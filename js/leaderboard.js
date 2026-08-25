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

export async function submit(nickname, score) {
  if (!runToken) return { ok: false, error: 'no_token' };
  const token = runToken;
  runToken = null; // one run, one submission -- mirrors the server's own rule
  try {
    const d = await req('/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, score, nickname })
    });
    boardCache.clear(); // the board just changed
    return { ok: true, rank: d.rank, nickname: d.nickname };
  } catch (err) {
    return { ok: false, error: (err.body && err.body.error) || err.message };
  }
}
