// Compatibility endpoint for older clients. Draws are now unlimited.
const { json } = require('./_util.js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  return json(res, 200, { ok: true, remaining: null, limit: null, unlimited: true });
};
