// Joke pools shown on the back of a "drawn" card from the homepage gallery
// (index.html, #faces). One entry per mood label already printed under each
// face card there, keyed by that exact text -- a new mood just needs a new
// key here, no other wiring.
export const FACE_JOKES = {
  "OG": [
    "Here since before the whitepaper had typos.",
    "Called a top once. Still brings it up unprompted.",
    "Remembers when gas fees meant actual gasoline.",
    "Seen four bear markets. Still checks the chart first thing."
  ],
  "Green Day": [
    "Checked the portfolio forty times today. On purpose, every time.",
    "Told the group chat about gains nobody asked about.",
    "Screenshotted it once just to look at it again later.",
    "Suddenly an expert in market structure."
  ],
  "Ngoring": [
    "Staring at the candle like it'll turn green if you don't blink.",
    "Brain buffering. Chart still loading. Hope still pending.",
    "Not blinking. Not thinking. Just watching.",
    "Eyes on the screen. Everything else, somewhere else."
  ],
  "Bullish": [
    "Drew a trendline with a ruler on a chart with no trend.",
    "Called the bottom. Again. Definitely this time.",
    "Convinced the next candle changes everything. It's always the next one.",
    "Sold the car. Bought the dip. No regrets yet."
  ],
  "Ape In": [
    "Read the contract address. Didn't read anything else.",
    "Bought first. Asked questions during the crash.",
    "Tokenomics unclear. Vibes immaculate. Sent it anyway.",
    "Fingers moved faster than the brain could catch up."
  ],
  "Diamond Hands": [
    "Down 80%. Still holding. Mostly still smiling.",
    "Sold the top once. Learned nothing. Would do it again.",
    "Wallet's been sealed shut since the last bull run.",
    "Watched it dump and said 'more for me,' out loud, alone."
  ],
  "3AM Watch": [
    "Told myself just one more candle. That was six hours ago.",
    "Awake for the pump, awake for the dump, just generally awake.",
    "Room's dark. Chart's the only light. This is fine.",
    "Alarm's set for work. Eyes are set on the one-minute chart."
  ],
  "DYOR": [
    "Read the whitepaper twice. Still don't get the tokenomics.",
    "Fifteen tabs open. Zero conclusions reached.",
    "Cross-referenced three Twitter threads and a gut feeling.",
    "Did the research. The research did not help."
  ],
  "Copium": [
    "'It's just a dip.' Seventh week of the dip.",
    "Zoomed out on the chart until the loss looked smaller.",
    "Fundamentals haven't changed. Neither has the red candle.",
    "Deep breaths. It's just a number. It's just a number."
  ],
  "Rekt": [
    "Liquidated at 3am. Found out at 3:01.",
    "Checked the portfolio once. Regretted it instantly.",
    "The chart didn't dip. It filed for divorce.",
    "Turned the phone off. The loss stayed on."
  ],
  "Rugged": [
    "Dev wallet dumped. Discord went quiet. Lesson: expensive.",
    "'Locked liquidity,' they said. The lock was decorative.",
    "Moonshot one minute, museum piece the next.",
    "Trusted the roadmap. It led off a cliff."
  ],
  "Paper Hands": [
    "Sold at the exact bottom. A gift, honestly, to whoever bought it.",
    "Panic sold. Watched it 10x by lunch. Told no one.",
    "Set a stop-loss so tight it stopped the dream too.",
    "Folded before the chart even finished forming."
  ]
};

// djb2 -- small, dependency-free string hash. Only needs to spread mood+day
// combinations across a pool index well, not resist attack, so this is
// plenty; not used anywhere security-sensitive.
function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0; // unsigned, so the modulo below is never negative
}

/**
 * The "joke of the day" for a mood -- same mood + same calendar day (in the
 * visitor's local time) always lands on the same joke, so everyone drawing
 * that mood on a given day sees the same default line, and it rotates the
 * next day. Hashed rather than a plain day-number modulo so different moods
 * don't all happen to land on "joke #0" on the same days as each other.
 * @param {string} mood
 * @param {Date} date
 * @returns {string} a joke, or "" if the mood has no pool
 */
export function jokeOfTheDay(mood, date = new Date()) {
  const pool = FACE_JOKES[mood];
  if (!pool || pool.length === 0) return "";
  const dayKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  const idx = hashString(mood + "|" + dayKey) % pool.length;
  return pool[idx];
}

/**
 * A fresh random joke for a mood, independent of the day-of calendar pick
 * above -- used by the "Face of the Day" button (a real reroll every click)
 * and as the seed pick for a reroll chain. rng is injectable (defaults to
 * Math.random) so a test can drive it deterministically.
 * @param {string} mood
 * @param {() => number} rng
 * @returns {string} a joke, or "" if the mood has no pool
 */
export function randomJoke(mood, rng = Math.random) {
  const pool = FACE_JOKES[mood];
  if (!pool || pool.length === 0) return "";
  const idx = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[idx];
}

/**
 * Pick a random joke different from the one last shown (when the pool has
 * more than one option), so hitting "Draw again" doesn't have a 1-in-N
 * chance of silently reshowing the same line.
 * @param {string} mood
 * @param {string} previous
 * @param {() => number} rng
 * @returns {string} a joke, or "" if the mood has no pool
 */
export function nextJoke(mood, previous, rng = Math.random) {
  const pool = FACE_JOKES[mood];
  if (!pool || pool.length === 0) return "";
  if (pool.length === 1) return pool[0];
  const others = pool.filter((j) => j !== previous);
  const idx = Math.min(others.length - 1, Math.floor(rng() * others.length));
  return others[idx];
}
