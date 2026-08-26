// Top 10 for either board. Read-only and safe to call on every game over.
const { cmd, isConfigured } = require('./_store.js');
const { TOP_N, dayKey, json } = require('./_util.js');


module.exports = async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  if (!isConfigured()) return json(res, 200, { configured: false, board: 'all', size: TOP_N, entries: [] });

  try {
    const url = new URL(req.url, 'http://localhost');
    const which = url.searchParams.get('board') === 'today' ? 'today' : 'all';
    const key = which === 'today' ? 'lb:day:' + dayKey() : 'lb:all';

    const flat = (await cmd(['ZREVRANGE', key, '0', String(TOP_N - 1), 'WITHSCORES'])) || [];
    const entries = [];
    for (let i = 0; i < flat.length; i += 2) {
      entries.push({ rank: entries.length + 1, name: flat[i], score: Math.floor(Number(flat[i + 1])) });
    }
    // s-maxage is for the CDN alone: absorbing repeats there is the point,
    // and five seconds blunts a flood without anyone noticing.
    //
    // The browser is deliberately given nothing to serve from. max-age=0 with
    // must-revalidate, and no stale-while-revalidate: SWR is honoured by
    // browsers too, and it made every board read come back one save behind --
    // a player would open the leaderboard and not find the entry they had
    // just saved.
    return json(res, 200, { configured: true, board: which, size: TOP_N, entries },
      'public, max-age=0, must-revalidate, s-maxage=5');
  } catch (err) {
    console.error('leaderboard read failed', err);
    return json(res, 503, { error: 'store_unavailable' });
  }
};
