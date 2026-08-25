// Top 10 for either board. Read-only and safe to call on every game over.
const { cmd, isConfigured } = require('./_store.js');
const { dayKey, json } = require('./_util.js');

const TOP_N = 10;

module.exports = async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  if (!isConfigured()) return json(res, 200, { configured: false, board: 'all', entries: [] });

  try {
    const url = new URL(req.url, 'http://localhost');
    const which = url.searchParams.get('board') === 'today' ? 'today' : 'all';
    const key = which === 'today' ? 'lb:day:' + dayKey() : 'lb:all';

    const flat = (await cmd(['ZREVRANGE', key, '0', String(TOP_N - 1), 'WITHSCORES'])) || [];
    const entries = [];
    for (let i = 0; i < flat.length; i += 2) {
      entries.push({ rank: entries.length + 1, name: flat[i], score: Math.floor(Number(flat[i + 1])) });
    }
    return json(res, 200, { configured: true, board: which, entries });
  } catch (err) {
    console.error('leaderboard read failed', err);
    return json(res, 503, { error: 'store_unavailable' });
  }
};
