// Thin Redis layer over Upstash's REST API, reached with plain fetch.
//
// Deliberately not the @vercel/kv package: this repo ships with
// "dependencies": none and no build step, and one npm package for three
// commands would end that. The REST API is a POST with a JSON array body,
// so it costs nothing to call directly.
//
// Vercel KV injects KV_REST_API_*; a bare Upstash integration injects
// UPSTASH_REDIS_REST_*. Both are accepted so either setup works untouched.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

const configured = Boolean(URL_ && TOKEN);

// Dev-only fallback so the endpoints can be exercised locally before the
// store is provisioned. Per-process memory: fine for one local server,
// useless across serverless instances, which is why isConfigured() is
// surfaced and the endpoints refuse to pretend otherwise in production.
const mem = new Map();
function memCmd(args) {
  const [op, key, ...rest] = args;
  const z = () => (mem.get(key) instanceof Map ? mem.get(key) : (mem.set(key, new Map()), mem.get(key)));
  switch (String(op).toUpperCase()) {
    case 'SET': { mem.set(key, rest[0]); return 'OK'; }
    case 'GET': return mem.has(key) ? mem.get(key) : null;
    case 'DEL': { const had = mem.delete(key); return had ? 1 : 0; }
    case 'INCR': { const v = Number(mem.get(key) || 0) + 1; mem.set(key, String(v)); return v; }
    case 'EXPIRE': return 1;
    case 'ZADD': {
      // args: ZADD key GT score member
      const m = z(); const gt = String(rest[0]).toUpperCase() === 'GT';
      const score = Number(gt ? rest[1] : rest[0]);
      const member = String(gt ? rest[2] : rest[1]);
      const prev = m.has(member) ? m.get(member) : -Infinity;
      if (!gt || score > prev) { m.set(member, score); return 1; }
      return 0;
    }
    case 'ZSCORE': { const m = z(); return m.has(String(rest[0])) ? String(m.get(String(rest[0]))) : null; }
    case 'ZREVRANGE': {
      const m = z();
      const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]);
      const slice = sorted.slice(Number(rest[0]), Number(rest[1]) === -1 ? undefined : Number(rest[1]) + 1);
      const withScores = String(rest[2] || '').toUpperCase() === 'WITHSCORES';
      return withScores ? slice.flatMap(([mem_, s]) => [mem_, String(s)]) : slice.map(([mem_]) => mem_);
    }
    default: return null;
  }
}

async function cmd(args) {
  if (!configured) return memCmd(args);
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  if (!r.ok) throw new Error('store ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const out = await r.json();
  if (out && out.error) throw new Error('store: ' + out.error);
  return out ? out.result : null;
}

module.exports = { cmd, isConfigured: () => configured };
