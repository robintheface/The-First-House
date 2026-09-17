import { wrapBackground, prepareBackground, drawBackground } from './runner-background.js?v=1';
import { stepDinosaurEncounter, updateBreath, updateDinosaurJump, stepFireballs, hitsFireball, drawFireball, drawDinosaur } from './dinosaur-fire.js?v=3';
// Endless-runner mini-game for the main page ("Outrun the rug"). Canvas +
// vanilla JS, no dependencies -- same zero-build-step spirit as the rest of
// the site. Space (or tap/click on the canvas) to jump; the run continues
// until you clip an obstacle.
//
// Kept as an external module (not inline) for the same CSP reason as
// wallet-connect.js: no 'unsafe-inline' script-src.

import * as lb from './leaderboard.js';
import { drawWoodland, hitsWoodland, LOG_VARIANTS, logSize } from './woodland-obstacles.js?v=3';

const canvas = document.getElementById('hoodGameCanvas');
if (canvas) {
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('hoodGameScore');
  const bestEl = document.getElementById('hoodGameBest');
  const overlay = document.getElementById('hoodGameOverlay');
  const overlayTitle = document.getElementById('hoodGameOverlayTitle');
  const overlayLines = document.getElementById('hoodGameOverlayLines');
  const fullscreenBtn = document.getElementById('hoodGameFullscreenBtn');
  const settingsBtn = document.getElementById('hoodGameSettingsBtn');
  const settingsPanel = document.getElementById('hoodGameSettingsPanel');
  const soundToggle = document.getElementById('hoodGameSoundToggle');
  const musicVolInput = document.getElementById('hoodGameMusicVol');
  const sfxVolInput = document.getElementById('hoodGameSfxVol');
  const saveSettingsBtn = document.getElementById('hoodGameSettingsSaveBtn');
  const versionEl = document.getElementById('hoodGameVersion');
  const versionBadgeEl = document.getElementById('hoodGameVersionBadge');
  const ranksBtn = document.getElementById('hoodGameRanksBtn');
  const ranksPanel = document.getElementById('hoodGameRanksPanel');
  const ranksList = document.getElementById('hoodGameRanksList');
  const ranksEmpty = document.getElementById('hoodGameRanksEmpty');
  const ranksClose = document.getElementById('hoodGameRanksClose');
  const saveScoreForm = document.getElementById('hoodGameSaveScore');
  const nickInput = document.getElementById('hoodGameNick');
  const nickSaveBtn = document.getElementById('hoodGameNickSave');
  const saveMsg = document.getElementById('hoodGameSaveMsg');
  const nickSkipBtn = document.getElementById('hoodGameNickSkip');
  const nickField = document.querySelector('.hood-game-save-field');
  const nickState = document.getElementById('hoodGameNickState');
  const GAME_VERSION = '1.2.1';
  if (versionBadgeEl) versionBadgeEl.textContent = 'v' + GAME_VERSION;

  const CW = canvas.width;   // 800
  const CH = canvas.height;  // 450
  const GROUND_Y = Math.round(CH * (250 / 300)); // keep the original ground/sky ratio at the taller size

  // ---------- assets ----------
  const ASSET_BASE = '/game/';
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = ASSET_BASE + src;
    });
  }

  const SPRITES = {
    background: { src: 'background-parchment.webp' },
    stand: { src: 'character-stand-aligned.webp', frames: 1 }, // static pose shown only during the SPAWN flicker -- the run cycle doesn't start until real movement (PLAYING) begins
    run: { src: 'character-run-aligned.webp', frames: 6 },
    jump: { src: 'character-jump-aligned.webp', frames: 5 }, // five poses follow takeoff, ascent, apex, descent and landing
    coin: { src: 'coin-spin.webp', frames: 12 },
    candle: { src: 'obstacle-candle.webp', frames: 1 },
    rugged: { src: 'dinosaur-hood.webp', frames: 1 },
    fireball: { src: 'fireball.webp' },
    log: { src: 'log-moss.webp' }
  };

  let assetsReady = false;
  // Recomputed from the real sprite sheets once they load. Run and jump
  // frames aren't the same aspect (arms/cape spread wider mid-jump), so the
  // player's box and draw size both track whichever cycle is currently active.
  let standAspect = 0.63;
  let runAspect = 0.89;
  let jumpAspect = 0.85;
  // Background draw width + its scroll-scale ratio, computed once the
  // image loads (natural dimensions never change after that) instead of
  // redoing the same division/multiplication in draw() on every single
  // frame -- one more small piece of "keep every frame cheap" alongside
  // the array-compaction/closure-hoisting already done elsewhere here.
  let backgroundTile = null;

  // ---------- game state ----------
  // SPAWN is a brief beat at the start of every run -- the world sits
  // frozen (background static, nothing spawning) while the player flickers
  // in place like they've just respawned, before real gameplay begins. The
  // same flicker plays in reverse right after a collision (see endRun()/
  // updateHitBlink()) -- the player blinks out instead of in, then is gone
  // entirely for the rest of STATE.OVER.
  const STATE = { LOADING: 'loading', IDLE: 'idle', SPAWN: 'spawn', PLAYING: 'playing', OVER: 'over' };
  let state = STATE.LOADING;
  const BLINK_TOGGLE_MS = 100; // on/off period shared by the spawn-in and hit-out flickers
  const SPAWN_DURATION_MS = 1000; // matches OVERLAY_DELAY_MS -- spawn-in and hit-out flickers run for the same length
  let spawnTimer = 0;
  let spawnBlinkOn = true;

  const GROUND_HEIGHT = 90;      // character/obstacle/coin display height
  const GRAVITY = 0.0022;        // px/ms^2
  const JUMP_VELOCITY = -0.9;    // px/ms
  const BASE_SPEED = 0.32;       // px/ms
  const MAX_SPEED = 0.75;
  const SPEED_RAMP = 0.000006;   // speed gained per ms survived

  const player = {
    x: 90,
    y: GROUND_Y - GROUND_HEIGHT,
    vy: 0,
    grounded: true,
    runFrame: 0,
    runTimer: 0,
    jumpFrame: 0,
    jumpTimer: 0
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let obstacles = [];
  let fireballs = [];
  let coins = [];
  let popups = []; // floating "+score" text shown when a coin is grabbed
  let lastDisplayedScore = -1;
  let speed = BASE_SPEED;
  let elapsed = 0;
  let score = 0;
  let best = 0;
  try { best = parseInt(localStorage.getItem('hoodRunnerBest') || '0', 10) || 0; } catch (err) { best = 0; }
  let nextObstacleAt = 0;
  let nextCoinAt = 0;
  let bgScrollX = 0;
  let lastTs = 0;
  let overSince = 0; // timestamp a run ended -- restart input is ignored for a short cooldown after

  function updateBestLabel() {
    if (bestEl) bestEl.textContent = 'Best: ' + Math.floor(best);
  }
  updateBestLabel();

  function resetRun() {
    showResult = null; // drop any pending hit-blink result callback from a run that never finished blinking out
    player.y = GROUND_Y - GROUND_HEIGHT;
    player.vy = 0;
    player.grounded = true;
    player.runFrame = 0;
    player.runTimer = 0;
    player.jumpFrame = 0;
    player.jumpTimer = 0;
    obstacles = [];
    fireballs = [];
    coins = [];
    popups = [];
    speed = BASE_SPEED;
    elapsed = 0;
    score = 0;
    lastDisplayedScore = -1;
    nextObstacleAt = 900;
    nextCoinAt = 1400;
    bgScrollX = 0;
  }

  let clusterChain = 0; // remaining close-follow spawns queued after this one
  let pendingClusterFollow = false; // true while the *next* spawn is one of those close-follows
  function scheduleNextObstacle() {
    if (clusterChain > 0) {
      clusterChain--;
      pendingClusterFollow = true;
      // Tight enough to clearly read as a paired-up candle, but still
      // enough room to clear both -- one longer jump, or land and hop the
      // second. Both members of a pair are always short candles (see
      // spawnObstacle), so a tighter gap here still stays fair. Scales
      // down toward the floor as speed rises like the normal gap does.
      //
      // Early in a run (speed still at/near BASE_SPEED) that gap read as
      // too spread out to clearly land as "one paired obstacle" -- packed
      // 50% tighter at run start, ramping back up to the untouched
      // original value by the time speed finishes ramping to MAX_SPEED
      // (both the floor and the raw formula scale together, so the "which
      // one wins" relationship -- and therefore late-run behavior -- is
      // unchanged once fully ramped).
      const speedProgress = Math.min(1, Math.max(0, (speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED)));
      const earlyPairScale = 0.5 + 0.5 * speedProgress;
      const followBase = Math.max(260 * earlyPairScale, (620 - speed * 550) * earlyPairScale);
      nextObstacleAt = elapsed + followBase + Math.random() * 80;
      return;
    }
    pendingClusterFollow = false;
    // Gap shrinks as speed rises but never gets unfair -- floor keeps a
    // minimum reaction window even at max speed.
    const base = Math.max(650, 1500 - speed * 900);
    nextObstacleAt = elapsed + base + Math.random() * base * 0.6;
  }
  function scheduleNextCoin() {
    nextCoinAt = elapsed + 1000 + Math.random() * 1400;
  }

  // Candle body width stays constant across heights (like a real candlestick
  // chart) -- only the wick/body length varies, short to tall. The two
  // tallest entries are still comfortably clearable: max jump height is
  // ~184px (JUMP_VELOCITY^2 / 2*GRAVITY) against a 144px obstacle top.
  const CANDLE_HEIGHT_RATIOS = [0.5, 0.72, 0.95, 1.2, 1.4, 1.6];
  const PAIRED_CANDLE_RATIOS = [0.5, 0.72]; // both members of a close pair stay short
  const RUGGED_CHANCE = 1 / 21; // candles:rugged spawn ratio is 20:1
  const RUGGED_MIN_ELAPSED = 10000; // never in the first 10s of a run
  const FALL_SPEED = 0.6; // px/ms -- how fast a "falling" candle drops in

  function spawnObstacle() {
    // Give a stationary volley its own clear lane.
    if(obstacles.some(o=>o.encounter==='peek')) { nextObstacleAt=elapsed+600;return; }
    const isRugged = !pendingClusterFollow && elapsed >= RUGGED_MIN_ELAPSED && !obstacles.some(o=>o.kind==='rugged') && Math.random() < RUGGED_CHANCE;
    const kind = isRugged ? 'rugged' : 'candle';
    const sprite = SPRITES[kind];
    const aspect = isRugged ? sprite.img.naturalWidth / sprite.img.naturalHeight : .7;
    // Candle variants: mostly a plain grounded candle, but sometimes one
    // drops in from off-screen above, and sometimes one floats at head
    // height -- clear to run under, but a jump carries you straight into it.
    // A close-follow spawn from clustering is always forced to 'ground' --
    // stacking a falling/overhead hazard right on a cluster's heels would
    // compound unfairly.
    const isClusterFollow = pendingClusterFollow;
    pendingClusterFollow = false;
    const variantRoll = 1; // Woodland obstacles stay rooted on the path.
    const variant = variantRoll < 0.12 ? 'falling' : variantRoll < 0.22 ? 'overhead' : 'ground';
    // Decided up front (before picking a height) so both members of a pair
    // -- the one starting it and its close-follow partner -- stay short.
    const startsPair = !isRugged && variant === 'ground' && !isClusterFollow && clusterChain === 0 && Math.random() < 0.14;
    const isPaired = startsPair || isClusterFollow;
    if (startsPair) clusterChain = 1;
    let h, w;
    if (isRugged) {
      h = GROUND_HEIGHT * .85; // Compact enough to jump, with readable sprite details
      w = h * aspect;
    } else if (variant === 'overhead') {
      h = GROUND_HEIGHT * 0.55; // shorter bar reads clearly as "floating", not "tall candle"
      w = GROUND_HEIGHT * aspect;
    } else {
      const ratios = isPaired ? PAIRED_CANDLE_RATIOS : CANDLE_HEIGHT_RATIOS;
      const ratio = ratios[(Math.random() * ratios.length) | 0];
      // Falling candles land on the ground -- cap their height so a fresh
      // drop-in never lands as a full tall wall with no warning.
      h = GROUND_HEIGHT * (variant === 'falling' ? Math.min(ratio, 0.95) : ratio);
      w = GROUND_HEIGHT * aspect;
    }
    // Never land on top of a coin that's already in flight -- push spawn
    // past it so the two never overlap (they move at identical speed, so
    // clearing it here keeps them clear for the rest of the run). Rugged
    // obstacles can also drift sideways in place (see below), so give them
    // extra clearance up front.
    let x = CW + 20;
    const pad = isRugged ? 60 : 36;
    coins.forEach((c) => {
      if (x < c.x + c.w + pad && x + w > c.x - pad) x = c.x + c.w + pad;
    });

    let baseY = GROUND_Y - h;
    let moveType = 'none', moveAmp = 0, moveSpeed = 0;
    let startY = baseY;
    if (isRugged) {
      startY = baseY;
    } else if (variant === 'falling') {
      moveType = 'falling';
      startY = -h - 40 - Math.random() * 60; // starts off-screen above, falls into place
    } else if (variant === 'overhead') {
      // Bottom edge sits a fixed margin above where a standing player's
      // head is -- clear while grounded, but a jump reaches straight into it.
      baseY = GROUND_Y - GROUND_HEIGHT - h - (10 + Math.random() * 20);
      startY = baseY;
    }

    const expression = ['angry', 'shocked', 'smug', 'sad', 'confused', 'sleepy'][Math.floor(Math.random() * 6)];
    // Only short upright logs may form a close pair; horizontal logs are singles.
    const woodType = isPaired ? 'vertical-short' : LOG_VARIANTS[Math.floor(Math.random()*LOG_VARIANTS.length)];
    if(!isRugged) {
      // Scale the artwork and collision bounds together; both paired logs stay low.
      ({w,h}=logSize(woodType,GROUND_HEIGHT * (isPaired ? .5 : .78)));
      baseY=startY=GROUND_Y-h;
    }
    const encounter=isRugged && Math.random()<.55 ? 'peek' : 'charge';
    obstacles.push({ encounter, shotLimit:2+Math.floor(Math.random()*2), kind, expression, woodType, born: elapsed, baseX: x, x, baseY, y: startY, w, h, moveType, moveAmp, moveSpeed, moveTimer: 0 });
    scheduleNextObstacle();
  }

  function spawnCoin() {
    const sprite = SPRITES.coin;
    const h = 46;
    const w = h * (sprite.img.naturalWidth / sprite.frames / sprite.img.naturalHeight);
    // Some coins sit low (grab while running), some hover at jump height.
    const hover = Math.random() < 0.55;
    const y = hover ? GROUND_Y - GROUND_HEIGHT - 70 - Math.random() * 30 : GROUND_Y - h - 6;
    // Coins always steer clear of obstacles -- same logic as above, mirrored.
    // Extra padding against rugged obstacles since those can drift sideways.
    let x = CW + 20;
    obstacles.forEach((o) => {
      const pad = o.kind === 'rugged' ? 60 : 40;
      if (x < o.x + o.w + pad && x + w > o.x - pad) x = o.x + o.w + pad;
    });
    coins.push({ x, y, w, h, frame: (Math.random() * sprite.frames) | 0, timer: 0, taken: false });
    scheduleNextCoin();
  }

  function startRun() {
    resetRun();
    state = STATE.SPAWN;
    spawnTimer = 0;
    spawnBlinkOn = true;
    hideOverlay();
    ensureLoopRunning();
    lb.startRun(); // fire-and-forget: the run plays the same either way
    // Starts playback (silently) right here, synchronously inside the
    // gesture that called jump() -> startRun() -- see startMusicPlayback().
    // Run-sfx + obstacle spawning still wait for updateSpawn() to hand off
    // to STATE.PLAYING -- the world sits still through the flicker; music
    // is already playing under it by then, just silent until faded in.
    startMusicPlayback();
  }

  function updateSpawn(dt) {
    spawnTimer += dt;
    spawnBlinkOn = Math.floor(spawnTimer / BLINK_TOGGLE_MS) % 2 === 0;
    if (spawnTimer >= SPAWN_DURATION_MS) {
      state = STATE.PLAYING;
      fadeMusicIn(FADE_IN_MS);
      startRunSfx();
    }
  }

  const OVERLAY_DELAY_MS = 1000; // ms after a run ends before the result text appears -- also how long the hit-blink runs before the player is fully gone; matches SPAWN_DURATION_MS
  const RESTART_COOLDOWN = 1000; // ms after the overlay text appears -- avoids an accidental restart from the same tap/key that just lost the run

  let hitTimer = 0;
  let hitBlinkOn = true;
  let resultShown = false; // true only once the delayed overlay text has actually appeared -- blocks restart input during OVERLAY_DELAY_MS too, not just RESTART_COOLDOWN after
  let showResult = null; // set by endRun(), called once by updateHitBlink() when the blink-out finishes

  function endRun() {
    state = STATE.OVER;
    resultShown = false;
    hitTimer = 0;
    hitBlinkOn = true;
    stopMusic();
    stopRunSfx();
    const formatted = Math.floor(score).toLocaleString('en-US');
    const isHighScore = score > best;
    if (isHighScore) {
      best = score;
      try { localStorage.setItem('hoodRunnerBest', String(Math.floor(best))); } catch (err) { /* private mode etc -- best just won't persist */ }
      updateBestLabel();
    }
    showResult = () => {
      resultShown = true;
      overSince = performance.now();
      if (isHighScore) {
        showOverlay('NEW HIGH SCORE!', [
          { text: formatted, cls: 'hood-game-overlay-score' },
          'Just a healthy correction…',
          { text: 'PRESS SPACE TO RUN AGAIN', cls: 'hood-game-overlay-continue' }
        ]);
      } else {
        showOverlay('RUGGED!', [
          'You scored ' + formatted + ' points',
          ['Just a healthy correction…', 'Bought the dip. Met the floor.', 'The candle had other plans.'][(Math.random()*3)|0],
          { text: 'Click or press SPACE to continue', cls: 'hood-game-overlay-continue' }
        ]);
      }
      offerScoreSave(Math.floor(score));
    };
  }

  // Plays the same on/off flicker as the spawn-in, but in reverse -- the
  // player blinks a few times right where they got hit, then is gone
  // entirely (no draw at all) for the rest of STATE.OVER, right as the
  // result text appears.
  function updateHitBlink(dt) {
    hitTimer += dt;
    if (hitTimer >= OVERLAY_DELAY_MS) {
      hitBlinkOn = false;
      if (showResult) { showResult(); showResult = null; }
      return;
    }
    hitBlinkOn = Math.floor(hitTimer / BLINK_TOGGLE_MS) % 2 === 0;
  }

  function jump() {
    // Both experiences are visible on the homepage. Finish a face reveal
    // before starting a run; an existing run can still accept jumps.
    if (state !== STATE.PLAYING && document.body.classList.contains('homepage') && document.getElementById('faceOfDayBtn')?.disabled) return;
    // A name prompt is open and unanswered -- from a qualifying run, or from
    // the best carried over on the idle screen. Starting a run now would
    // throw that place away, and the prompt itself invites a keypress, so
    // Space belongs to the name field until Save or Skip settles it.
    if (awaitingSave) return;
    if (state === STATE.IDLE) { startRun(); return; }
    if (state === STATE.OVER) {
      if (!resultShown) return; // still in the pre-text beat -- ignore input entirely
      if (performance.now() - overSince < RESTART_COOLDOWN) return;
      startRun();
      return;
    }
    if (state !== STATE.PLAYING) return;
    if (!player.grounded) return;
    player.vy = JUMP_VELOCITY;
    player.grounded = false;
    player.jumpFrame = 0;
    player.jumpTimer = 0;
    playSfx('jump');
    stopRunSfx();
  }

  let overlayHideTimer = null;
  function showOverlay(title, lines) {
    if (!overlay) return;
    if (overlayHideTimer) { clearTimeout(overlayHideTimer); overlayHideTimer = null; }
    if (overlayTitle) {
      overlayTitle.textContent = title;
      overlayTitle.classList.toggle('hood-game-overlay-title-sm', title === 'RUGGED!');
    }
    if (overlayLines) {
      overlayLines.innerHTML = '';
      lines.forEach((line) => {
        const p = document.createElement('p');
        if (typeof line === 'string') {
          p.textContent = line;
        } else {
          p.textContent = line.text;
          if (line.cls) p.className = line.cls;
        }
        overlayLines.appendChild(p);
      });
    }
    if (saveScoreForm) saveScoreForm.hidden = true;
    overlay.hidden = false;
    // Force a reflow so the opacity transition below actually animates
    // from 0 instead of snapping straight to 1 in the same paint.
    void overlay.offsetWidth;
    overlay.classList.add('is-visible');
  }
  function hideOverlay() {
    if (!overlay) return;
    overlay.classList.remove('is-visible');
    overlayHideTimer = setTimeout(() => { overlay.hidden = true; overlayHideTimer = null; }, 260);
  }

  // ---------- collision ----------
  const HIT_PAD = 0.16; // shrink both boxes a bit so near-misses feel fair rather than punishing on sprite-padding alone
  // Player's own shrunk box, recomputed once per frame (see update()) and
  // reused for every obstacle/coin check that frame instead of hit()
  // redoing the exact same a.x/a.w math once per candidate -- with several
  // obstacles and coins on screen at once that was the same arithmetic
  // repeated needlessly every single time.
  const playerHitBox = { x: 0, y: 0, w: 0, h: 0 };
  function hit(b) {
    if (b.kind === 'candle' || b.kind === 'rugged') return hitsWoodland(playerHitBox, b, elapsed);
    const bx = b.x + b.w * HIT_PAD, bw = b.w * (1 - HIT_PAD * 2);
    const by = b.y + b.h * HIT_PAD, bh = b.h * (1 - HIT_PAD * 2);
    return playerHitBox.x < bx + bw && playerHitBox.x + playerHitBox.w > bx
      && playerHitBox.y < by + bh && playerHitBox.y + playerHitBox.h > by;
  }

  // ---------- update ----------
  function update(dt) {
    elapsed += dt;
    speed = Math.min(MAX_SPEED, BASE_SPEED + elapsed * SPEED_RAMP);
    score += dt * speed * 0.05;

    // player physics
    if (!player.grounded) {
      player.vy += GRAVITY * dt;
      player.y += player.vy * dt;
      if (player.y >= GROUND_Y - GROUND_HEIGHT) {
        player.y = GROUND_Y - GROUND_HEIGHT;
        player.vy = 0;
        player.grounded = true;
        playSfx('land');
        startRunSfx();
      }
    }

    // Advance whichever cycle is currently active. Run-frame pace scales
    // with speed so the legs visibly hurry as the run speeds up; jump plays
    // once through at a fixed pace and holds its last frame if still
    // airborne (a long hang time shouldn't loop the cycle mid-air).
    if (player.grounded) {
      player.runTimer += dt * speed;
      while (player.runTimer > 28) {
        player.runTimer -= 28;
        player.runFrame = (player.runFrame + 1) % SPRITES.run.frames;
      }
    } else {
      const jumpProgress = (player.vy - JUMP_VELOCITY) / (-2 * JUMP_VELOCITY);
      player.jumpFrame = Math.min(SPRITES.jump.frames - 1, Math.max(0, Math.floor(jumpProgress * SPRITES.jump.frames)));
    }

    // spawns
    if (elapsed >= nextObstacleAt) spawnObstacle();
    if (elapsed >= nextCoinAt) spawnCoin();

    // move + cull obstacles (baseX/baseY scroll with the world; moveType
    // layers a small bob or side-to-side drift on top for rugged obstacles).
    // Compacted in place (index-walk + splice from the tail) instead of
    // forEach+filter, which would otherwise allocate a new closure and a
    // new array every single frame -- a steady source of GC churn that
    // reads as stutter under sustained play.
    const dx = speed * dt;
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      if(o.encounter==='peek') {
        if(stepDinosaurEncounter(o,elapsed,dt,CW))obstacles.splice(i,1);
        continue;
      }
      o.baseX -= dx;
      o.moveTimer += dt;
      if (o.moveType === 'vertical') {
        o.x = o.baseX;
        o.y = o.baseY + Math.sin(o.moveTimer * o.moveSpeed) * o.moveAmp;
      } else if (o.moveType === 'horizontal') {
        o.x = o.baseX + Math.sin(o.moveTimer * o.moveSpeed) * o.moveAmp;
        o.y = o.baseY;
      } else if (o.moveType === 'falling') {
        o.x = o.baseX;
        o.y += FALL_SPEED * dt;
        if (o.y >= o.baseY) { o.y = o.baseY; o.moveType = 'none'; } // landed -- behaves as grounded from here on
      } else {
        o.x = o.baseX;
        o.y = o.baseY;
      }
      if (o.baseX + o.w <= -20) obstacles.splice(i, 1);
    }

    stepFireballs(fireballs,dt,speed);
    for(const o of obstacles) if(o.kind==='rugged') {
      updateDinosaurJump(o,elapsed);
      const shot=updateBreath(o,elapsed,CW,player.x);
      if(shot) fireballs.push(shot);
    }

    // move + cull + animate coins
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      c.x -= dx;
      c.timer += dt;
      if (c.timer > 45) { c.timer = 0; c.frame = (c.frame + 1) % SPRITES.coin.frames; }
      if (c.x + c.w <= -20 || c.taken) {
        coins.splice(i, 1);
      }
    }

    // float + fade the "+score" popups, then drop the finished ones
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.x -= dx;
      p.life += dt;
      if (p.life >= p.dur) popups.splice(i, 1);
    }

    // background parallax
    bgScrollX = wrapBackground(bgScrollX, dx * .18, backgroundTile.width);

    // collisions -- playerHitBox is the player's box already shrunk by
    // HIT_PAD, computed once here instead of hit() redoing the same a.x/
    // a.w math for every obstacle/coin candidate this frame (see hit()).
    const playerW = GROUND_HEIGHT * (player.grounded ? runAspect : jumpAspect);
    playerHitBox.x = player.x + playerW * HIT_PAD;
    playerHitBox.w = playerW * (1 - HIT_PAD * 2);
    playerHitBox.y = player.y + GROUND_HEIGHT * HIT_PAD;
    playerHitBox.h = GROUND_HEIGHT * (1 - HIT_PAD * 2);
    for(const f of fireballs) if(hitsFireball(playerHitBox,f)){playSfx('impact');endRun();return;}
    for (let i = 0; i < obstacles.length; i++) {
      if (hit(obstacles[i])) { playSfx('impact'); endRun(); return; }
    }
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (!c.taken && hit(c)) {
        c.taken = true;
        const reward = 25;
        score += reward;
        popups.push({ x: c.x + c.w / 2, y: c.y, life: 0, dur: 800, text: '+' + reward });
        playSfx('coin');
      }
    }
  }

  // ---------- draw ----------
  function drawFrame(sprite, frameIndex, x, y, w, h) {
    const img = sprite.img;
    // sprite.frameW/frameH are precomputed once at boot (see below) instead
    // of redoing the same division here on every single draw call.
    ctx.drawImage(img, frameIndex * sprite.frameW, 0, sprite.frameW, sprite.frameH, x, y, w, h);
  }

  // Player draw box tracks whichever cycle is active -- run frames and jump
  // frames aren't the same aspect (arms/cape spread wider mid-jump).
  // Single source of truth for "is there a player to draw (and shadow)
  // this frame" -- shared by drawPlayer() and the shadow sizing in draw()
  // so the two can't drift out of sync.
  //  - LOADING/IDLE: no player at all, just the overlay text + background.
  //  - SPAWN: blinks in (see updateSpawn()).
  //  - OVER: blinks out after collision.
  //  - PLAYING: always visible.
  function playerVisible() {
    if (state === STATE.LOADING || state === STATE.IDLE) return false;
    if (state === STATE.SPAWN) return spawnBlinkOn;
    if (state === STATE.OVER) return !resultShown && hitBlinkOn;
    return true;
  }

  function drawPlayer() {
    if (!playerVisible()) return;
    const h = GROUND_HEIGHT;
    if (state === STATE.SPAWN) {
      drawFrame(SPRITES.stand, 0, player.x, player.y, h * standAspect, h);
    } else if (player.grounded) {
      drawFrame(SPRITES.run, player.runFrame, player.x, player.y, h * runAspect, h);
    } else {
      drawFrame(SPRITES.jump, player.jumpFrame, player.x, player.y, h * jumpAspect, h);
    }
  }

  // Soft contact shadows, drawn before any sprite -- a flat cutout with
  // nothing grounding it visually is the other half of why the scene reads
  // flat. Airborne things (a jump, a floating rugged obstacle, a hovering
  // coin) get a smaller, fainter shadow the higher they are. Hoisted to a
  // real top-level function instead of an arrow function re-created inside
  // draw() every frame -- that was allocating a fresh closure 60+ times a
  // second, exactly the GC churn the array-compaction pass elsewhere in
  // this file was written to avoid (mobile CPUs feel this kind of thing as
  // stutter much more than desktop does).
  // No save()/restore() here (each was pushing/popping the whole canvas
  // state -- transform, clip, every style, not just the two properties
  // this actually touches) -- fillStyle is set once by the caller before
  // any of these run since it's always the same color, and draw() resets
  // globalAlpha back to 1 right after the last shadow of the frame instead
  // of every call cleaning up after itself individually.
  function drawGroundShadow(cx, w, lift) {
    const t = Math.min(1, Math.max(0, lift) / 140);
    const alpha = 0.24 * (1 - t * 0.75);
    if (alpha < 0.02) return;
    const sw = w * (1 - t * 0.3);
    const sh = 9 * (1 - t * 0.4);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.ellipse(cx, GROUND_Y + 3, Math.max(1, sw / 2), Math.max(1, sh / 2), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    ctx.clearRect(0, 0, CW, CH);

    drawBackground(ctx,backgroundTile,bgScrollX,CW,GROUND_Y);
    ctx.fillStyle = '#d8c598';
    ctx.fillRect(0, GROUND_Y, CW, CH - GROUND_Y);
    ctx.fillStyle = '#6a704a';
    ctx.fillRect(0, GROUND_Y, CW, 2);
    ctx.fillStyle = '#34472b';
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (!c.taken) drawGroundShadow(c.x + c.w / 2, c.w, (GROUND_Y - c.h) - c.y);
    }
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      drawGroundShadow(o.x + o.w / 2, o.w, (GROUND_Y - o.h) - o.y);
    }
    if (playerVisible()) {
      const playerW = GROUND_HEIGHT * (state === STATE.SPAWN ? standAspect : player.grounded ? runAspect : jumpAspect);
      drawGroundShadow(player.x + playerW / 2, playerW * 0.95, (GROUND_Y - GROUND_HEIGHT) - player.y);
    }
    ctx.globalAlpha = 1; // shadows are the only thing that touches this -- reset once instead of per-call

    // coins
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (!c.taken) drawFrame(SPRITES.coin, c.frame, c.x, c.y, c.w, c.h);
    }

    // obstacles
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if(o.kind==='rugged') drawDinosaur(ctx,o,elapsed,SPRITES.rugged.img,reducedMotion.matches);
      else drawWoodland(ctx,o,elapsed,SPRITES.log.img);
    }

    for(const f of fireballs) drawFireball(ctx,f,reducedMotion.matches?0:elapsed,SPRITES.fireball.img);

    // player -- run/jump sprite sheets, current frame picked in update()
    drawPlayer();

    // "+score" popups float up and fade out over their lifetime
    if (popups.length) {
      ctx.save();
      ctx.font = "700 20px 'IBM Plex Mono', monospace";
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e0b23a';
      for (let i = 0; i < popups.length; i++) {
        const p = popups[i];
        const t = p.life / p.dur;
        ctx.globalAlpha = Math.max(0, 1 - t);
        ctx.fillText(p.text, p.x, p.y - t * 42);
      }
      ctx.restore();
    }

    // Only touch the DOM when the displayed integer actually changes --
    // writing textContent every frame forces a layout/paint for no visual
    // difference most of the time.
    const shownScore = Math.floor(score);
    if (scoreEl && shownScore !== lastDisplayedScore) {
      lastDisplayedScore = shownScore;
      scoreEl.textContent = String(shownScore);
    }
  }

  // ---------- loop ----------
  // requestAnimationFrame already syncs to the display's own refresh rate
  // (60Hz, 120Hz, whatever) with no artificial cap here -- the actual fix
  // for jank is keeping every frame cheap (see the in-place array
  // compaction above) and not rendering frames nobody will ever see: the
  // idle/game-over screen is completely static, so the loop stops
  // scheduling itself once a run ends and only wakes back up when one
  // starts, instead of redrawing an unchanging frame forever.
  let loopScheduled = false;
  function loop(ts) {
    if (!lastTs) lastTs = ts;
    const dt = Math.min(48, ts - lastTs); // clamp so a dropped/backgrounded tab doesn't jump-teleport the run
    lastTs = ts;

    if (state === STATE.PLAYING) update(dt);
    else if (state === STATE.SPAWN) updateSpawn(dt);
    else if (state === STATE.OVER && !resultShown) updateHitBlink(dt);
    if (assetsReady) draw();

    if (state === STATE.PLAYING || state === STATE.SPAWN || (state === STATE.OVER && !resultShown)) {
      requestAnimationFrame(loop);
    } else {
      loopScheduled = false;
    }
  }
  function ensureLoopRunning() {
    if (loopScheduled || !assetsReady) return;
    loopScheduled = true;
    lastTs = 0;
    requestAnimationFrame(loop);
  }

  // ---------- audio ----------
  // One signal path, identical on every platform:
  //
  //   <audio> (streamed music) ---> musicGain --+
  //   one-shot SFX buffers ------> sfxGain -----+--> masterGain --> destination
  //   looping footstep buffer ---> runGain -----+
  //
  // Music stays on a streaming HTMLAudioElement rather than a decoded Web
  // Audio buffer: decodeAudioData hands back a whole multi-minute track's
  // PCM in one shot, which profiling under CPU throttling measured as a
  // 400ms-to-nearly-2s main-thread stall. The small SFX files (all under
  // 300KB, ~20ms each) have no such problem, so those stay on buffers.
  //
  // What changed in this rewrite: music VOLUME no longer lives on the
  // element. HTMLMediaElement.volume is permanently read-only on iOS --
  // assignments are silently dropped and it always reads back 1 -- which is
  // what killed both the Music slider and the fade-in there while desktop
  // looked fine. Everything now rides GainNodes, whose .gain is scriptable
  // everywhere, so mobile and desktop run the same code instead of two
  // paths that drift apart. The element's own .volume is set once and never
  // touched again (except on the no-Web-Audio fallback below).
  //
  // masterGain carries the Sound switch, so muting is an instant, click-free
  // gain change instead of tearing playback down: unmuting resumes the same
  // track where it left off rather than restarting on a fresh random one.
  // It also means the Music and SFX gains stay meaningful while muted, so a
  // slider dragged during mute is already correct when sound comes back.
  const MUSIC_BASE = 'sound-effects/';
  const MUSIC_TRACKS = ['1sound.mp3', '2sound.mp3', '3sound.mp3', '5sound.mp3'];
  const FADE_IN_MS = 2500;
  const SFX_FILES = { jump: 'jumping.mp3', land: 'landing.mp3', coin: 'coin.mp3', impact: 'impact.mp3' };
  const RUN_SFX_FILE = 'running.mp3';
  // setTargetAtTime time constant -- rounds off slider jumps and the fade's
  // 60ms steps so neither zippers, without audibly lagging behind either.
  const GAIN_SMOOTH = 0.03;

  const STORE = { music: 'hoodRunnerMusicVol', sfx: 'hoodRunnerSfxVol', muted: 'hoodRunnerMuted' };
  function loadStoredVolume(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      const v = parseFloat(raw);
      return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
    } catch (err) { return fallback; }
  }
  function clamp01(v) { return Math.min(1, Math.max(0, v)); }

  // `live` is what you are hearing right now -- slider drags write straight
  // here so a preview is audible immediately. `saved` is the last committed
  // state, which is what a close-without-Save falls back to. Two plain
  // objects rather than six parallel variables, so preview / commit / revert
  // are each a one-line copy and cannot fall out of step.
  // SFX defaults 30% under music so it sits beneath the track rather than
  // competing; from there the two sliders are independent.
  const live = {
    music: loadStoredVolume(STORE.music, 0.5),
    sfx: loadStoredVolume(STORE.sfx, 0.35),
    muted: (() => { try { return localStorage.getItem(STORE.muted) === '1'; } catch (err) { return false; } })()
  };
  const saved = { music: live.music, sfx: live.sfx, muted: live.muted };

  let actx = null;
  let masterGain = null, musicGain = null, sfxGain = null, runGain = null;
  const audioBuffers = Object.create(null); // filename -> AudioBuffer | Promise<AudioBuffer|null>
  let runSource = null;
  let lastTrackIdx = -1;

  function ensureAudioCtx() {
    if (actx) return actx;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    actx = new AudioCtx();
    masterGain = actx.createGain(); masterGain.connect(actx.destination);
    musicGain = actx.createGain(); musicGain.connect(masterGain);
    sfxGain = actx.createGain(); sfxGain.connect(masterGain);
    runGain = actx.createGain(); runGain.connect(masterGain);
    musicGain.gain.value = 0; // every run fades up from silence
    sfxGain.gain.value = live.sfx;
    runGain.gain.value = live.sfx;
    masterGain.gain.value = live.muted ? 0 : 1;
    return actx;
  }
  // Mobile browsers hand out an already-suspended context unless it is
  // resumed from inside a user gesture; nothing routed through the graph
  // (music included, now that it is) makes a sound while it is suspended.
  function resumeCtx() { if (actx && actx.state === 'suspended') actx.resume(); }

  function rampGain(param, value, immediate) {
    if (!param || !actx) return;
    if (immediate) {
      param.cancelScheduledValues(actx.currentTime);
      param.setValueAtTime(value, actx.currentTime);
    } else {
      param.setTargetAtTime(value, actx.currentTime, GAIN_SMOOTH);
    }
  }

  let musicEl = null;
  let musicRouted = false;  // false only where Web Audio is missing entirely
  let musicFadeTimer = null;
  let musicAudible = false; // element is actually emitting sound, not just buffering
  let pendingFadeMs = 0;

  function ensureMusicEl() {
    if (musicEl) return musicEl;
    musicEl = new Audio();
    musicEl.loop = true;
    musicEl.preload = 'auto';
    musicEl.volume = 1; // musicGain owns the level from here
    const ctx = ensureAudioCtx();
    if (ctx && ctx.createMediaElementSource) {
      try {
        ctx.createMediaElementSource(musicEl).connect(musicGain);
        musicRouted = true;
      } catch (err) {
        musicRouted = false; // element already routed, or the call is unsupported
      }
    }
    // Last-resort path for a browser with no Web Audio at all. Not the iOS
    // case -- iOS has Web Audio, it just has a read-only element volume --
    // so this is a genuine fallback rather than a second maintained path.
    if (!musicRouted) musicEl.volume = 0;
    musicEl.addEventListener('playing', onMusicPlaying);
    return musicEl;
  }

  // Every "make the music this loud" goes through here, so the fade, the
  // slider and the silent pre-roll can never disagree about the level.
  function setMusicLevel(v, immediate) {
    const level = clamp01(v);
    if (musicRouted) rampGain(musicGain && musicGain.gain, level, immediate);
    else if (musicEl) musicEl.volume = level;
  }
  function musicLevel() {
    if (musicRouted) return musicGain ? musicGain.gain.value : 0;
    return musicEl ? musicEl.volume : 0;
  }

  // The ramp is measured from when the track is genuinely AUDIBLE, not from
  // a wall clock. play() resolves long before a 0.2-1.2MB track has buffered
  // on mobile data, so a timer started at play() would spend its whole
  // FADE_IN_MS ramping silence and already sit at full level by the first
  // note -- exactly the reported "no fade-in on mobile", which desktop never
  // showed because it loads instantly. Each tick re-reads live.music, so
  // dragging the slider mid-fade retargets the ramp instead of being
  // overwritten when it lands.
  function beginFade(ms) {
    if (musicFadeTimer) { clearInterval(musicFadeTimer); musicFadeTimer = null; }
    const from = musicLevel();
    const startTs = performance.now();
    musicFadeTimer = setInterval(() => {
      const t = Math.min(1, (performance.now() - startTs) / ms);
      setMusicLevel(from + (live.music - from) * t);
      if (t >= 1) { clearInterval(musicFadeTimer); musicFadeTimer = null; }
    }, 60);
  }
  function fadeMusicIn(ms) {
    if (!musicEl) return;
    if (!musicAudible) { pendingFadeMs = ms; return; } // onMusicPlaying() picks it up
    beginFade(ms);
  }
  function onMusicPlaying() {
    musicAudible = true;
    if (pendingFadeMs) { const ms = pendingFadeMs; pendingFadeMs = 0; beginFade(ms); }
  }

  function pickTrackIndex() {
    if (MUSIC_TRACKS.length <= 1) return 0;
    let idx;
    do { idx = (Math.random() * MUSIC_TRACKS.length) | 0; } while (idx === lastTrackIdx);
    return idx;
  }
  function playMusicEl() {
    if (!musicEl) return;
    const p = musicEl.play();
    if (p && p.catch) p.catch(() => { /* autoplay blocked -- a later gesture retries */ });
  }

  // Called synchronously inside the gesture that starts a run: mobile
  // autoplay policy ties play()'s permission to that gesture, and the 1s
  // spawn flicker that follows would put it out of reach. The track is
  // started silent; fadeMusicIn() takes it up once it is actually audible.
  function startMusicPlayback() {
    const el = ensureMusicEl();
    resumeCtx();
    if (musicFadeTimer) { clearInterval(musicFadeTimer); musicFadeTimer = null; }
    musicAudible = false; // a new src restarts buffering
    pendingFadeMs = 0;
    lastTrackIdx = pickTrackIndex();
    el.src = ASSET_BASE + MUSIC_BASE + MUSIC_TRACKS[lastTrackIdx];
    el.currentTime = 0;
    setMusicLevel(0, true);
    if (live.muted) return; // armed but not playing -- flipping Sound on starts it
    playMusicEl();
  }

  function stopMusic() {
    if (musicFadeTimer) { clearInterval(musicFadeTimer); musicFadeTimer = null; }
    pendingFadeMs = 0;
    musicAudible = false;
    // Belt-and-suspenders on top of pause() below: some mobile browsers
    // keep audio already queued in the <audio> element's own hardware
    // pipeline, which can keep trailing on audibly for a couple seconds
    // after game over even though pause() was called right away.
    // Zeroing the Web Audio gain (or the element's own volume, when
    // routed doesn't apply) cuts the actual output at the graph level
    // immediately, independent of whatever the element itself is still
    // doing internally.
    setMusicLevel(0, true);
    if (musicEl) musicEl.pause();
  }

  function loadBuffer(file) {
    if (audioBuffers[file]) return audioBuffers[file];
    const ctx = ensureAudioCtx();
    if (!ctx) return Promise.resolve(null);
    const p = fetch(ASSET_BASE + MUSIC_BASE + file)
      .then((r) => r.arrayBuffer())
      .then((ab) => ctx.decodeAudioData(ab))
      .catch((err) => { console.warn('Hood Runner: audio load failed', file, err); return null; });
    audioBuffers[file] = p;
    return p;
  }

  // Decodes the running loop + jump/land/coin/impact up front so gameplay
  // never pays a first-use decode cost. Chained one at a time rather than
  // fired concurrently -- profiling showed serialized was cheaper on the
  // main thread at any given instant than the same five racing.
  function preloadAudio() {
    if (!ensureAudioCtx()) return;
    const critical = [RUN_SFX_FILE].concat(Object.values(SFX_FILES));
    critical.reduce((p, file) => p.then(() => loadBuffer(file)), Promise.resolve());
  }

  async function playSfx(name, rate = 1) {
    if (live.muted) return;
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    resumeCtx();
    const buf = await loadBuffer(SFX_FILES[name]);
    if (!buf || live.muted) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.connect(sfxGain);
    src.start(0);
  }

  async function startRunSfx() {
    if (live.muted || runSource) return; // already looping -- don't restart from the top
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    resumeCtx();
    const buf = await loadBuffer(RUN_SFX_FILE);
    // Re-check state after the await, not just mute/runSource: a run that
    // ends (or a jump that lifts off) while this buffer was still loading
    // must not have the loop start anyway once it resolves -- endRun()'s
    // stopRunSfx() already ran and won't run again, so a source started
    // here would loop forever with nothing left to stop it.
    if (!buf || live.muted || runSource || state !== STATE.PLAYING || !player.grounded) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(runGain);
    src.start(0);
    runSource = src;
  }
  function stopRunSfx() {
    if (runSource) { try { runSource.stop(); } catch (err) { /* already stopped */ } runSource = null; }
  }

  // ----- the three user-facing controls -----
  // All three are live preview only: they change what you hear immediately
  // but do not persist. persistSettings()/revertSettings() in the settings
  // panel below are the Save-gated commit and undo.
  function setMusicVolume(v) {
    live.music = clamp01(v);
    // A fade in flight re-reads live.music every tick, so let it keep
    // steering rather than jump-cutting the level out from under it.
    if (!musicFadeTimer) setMusicLevel(live.music);
  }
  function setSfxVolume(v) {
    live.sfx = clamp01(v);
    // Independent of the master mute, so a drag while muted is already
    // correct the moment sound comes back on.
    rampGain(sfxGain && sfxGain.gain, live.sfx, false);
    rampGain(runGain && runGain.gain, live.sfx, false);
  }
  function setMuted(muted) {
    live.muted = !!muted;
    if (soundToggle) soundToggle.checked = !live.muted;
    rampGain(masterGain && masterGain.gain, live.muted ? 0 : 1, false);
    if (live.muted) {
      // Pause the stream too -- a muted run should not quietly burn mobile
      // data. Position is kept, so unmuting picks the same track back up.
      if (musicEl) musicEl.pause();
      stopRunSfx();
    } else {
      resumeCtx();
      if (musicEl && musicEl.src && (state === STATE.SPAWN || state === STATE.PLAYING)) playMusicEl();
      if (state === STATE.PLAYING && player.grounded) startRunSfx();
    }
  }

  // ---------- settings panel (top-right "Settings" button, popup centered over the game: music/SFX volume, version) ----------
  if (settingsBtn && settingsPanel) {
    if (versionEl) versionEl.textContent = 'Hood Runner v' + GAME_VERSION;
    syncControls();
    refreshSaveBtn();

    // Pushes `live` back out to the three controls -- used at boot and after
    // a revert, so the widgets always show what is actually in effect.
    function syncControls() {
      if (soundToggle) soundToggle.checked = !live.muted;
      if (musicVolInput) musicVolInput.value = String(Math.round(live.music * 100));
      if (sfxVolInput) sfxVolInput.value = String(Math.round(live.sfx * 100));
    }
    function isDirty() {
      return live.music !== saved.music || live.sfx !== saved.sfx || live.muted !== saved.muted;
    }
    // Marks the Save button while there are unsaved changes. Closing the
    // panel any other way discards them by design, so the button has to show
    // that there is something to lose rather than looking inert.
    function refreshSaveBtn() {
      if (!saveSettingsBtn || saveSettingsBtn.disabled) return;
      saveSettingsBtn.classList.toggle('is-dirty', isDirty());
    }

    function persistSettings() {
      try {
        localStorage.setItem(STORE.music, String(live.music));
        localStorage.setItem(STORE.sfx, String(live.sfx));
        localStorage.setItem(STORE.muted, live.muted ? '1' : '0');
      } catch (err) { /* private mode etc -- settings just won't persist */ }
      saved.music = live.music;
      saved.sfx = live.sfx;
      saved.muted = live.muted;
    }
    // Undoes a live-but-unsaved preview: reapplies the committed values to
    // both the audio graph and the widgets.
    function revertSettings() {
      setMusicVolume(saved.music);
      setSfxVolume(saved.sfx);
      setMuted(saved.muted);
      syncControls();
      refreshSaveBtn();
    }

    function closeSettings() {
      settingsPanel.hidden = true;
      settingsBtn.setAttribute('aria-expanded', 'false');
    }
    function closeSettingsDiscarding() {
      revertSettings();
      closeSettings();
    }
    settingsBtn.addEventListener('click', () => {
      if (settingsPanel.hidden) {
        settingsPanel.hidden = false;
        settingsBtn.setAttribute('aria-expanded', 'true');
        refreshSaveBtn();
      } else {
        closeSettingsDiscarding();
      }
    });
    // Close on any click/tap outside the button+panel -- pointerdown so it
    // doesn't fight with the game's own pointerdown-to-jump listener below.
    document.addEventListener('pointerdown', (e) => {
      if (settingsPanel.hidden) return;
      if (e.target === settingsBtn || settingsBtn.contains(e.target) || settingsPanel.contains(e.target)) return;
      closeSettingsDiscarding();
    });
    if (soundToggle) {
      soundToggle.addEventListener('change', () => { setMuted(!soundToggle.checked); refreshSaveBtn(); });
    }
    if (musicVolInput) {
      musicVolInput.addEventListener('input', () => { setMusicVolume(musicVolInput.valueAsNumber / 100); refreshSaveBtn(); });
    }
    if (sfxVolInput) {
      sfxVolInput.addEventListener('input', () => { setSfxVolume(sfxVolInput.valueAsNumber / 100); refreshSaveBtn(); });
    }
    if (saveSettingsBtn) {
      let saveFeedbackTimer = null;
      saveSettingsBtn.addEventListener('click', () => {
        persistSettings();
        // Brief "Saved!" acknowledgement before the panel closes -- the whole
        // point of a Save button is confirming the change took, so closing
        // instantly with no feedback would defeat it.
        if (saveFeedbackTimer) clearTimeout(saveFeedbackTimer);
        saveSettingsBtn.classList.remove('is-dirty');
        saveSettingsBtn.textContent = 'Saved!';
        saveSettingsBtn.disabled = true;
        saveFeedbackTimer = setTimeout(() => {
          saveFeedbackTimer = null;
          saveSettingsBtn.textContent = 'Save';
          saveSettingsBtn.disabled = false;
          closeSettings();
        }, 450);
      });
    }
  }
  // ---------- leaderboard ----------
  // Every part of this is optional at runtime. Until the store is
  // provisioned the endpoints answer {configured:false}, lb.isAvailable()
  // stays false, and none of this UI is ever shown -- the game plays
  // exactly as it did before rather than offering a board that cannot work.
  let ranksBoard = 'all';
  let lastSavedNick = '';
  // True from the moment a qualifying run opens the name prompt until Save
  // or Skip settles it. jump() honours this so the run cannot be restarted
  // out from under an unsaved place.
  let awaitingSave = false;
  // Set while the prompt is offering a best score carried over from before
  // the leaderboard existed, rather than a run that just ended.
  let carriedOffer = false;
  // The highest score this browser has actually got onto the board. A run
  // that cannot beat it has nothing to add -- the server would take the
  // write and discard it against its own GT -- so it is never sent.
  //
  // Kept apart from `best`, which is the local record and moves whether or
  // not the send worked. If a submission fails this stays where it was, and
  // the next run good enough to beat it tries again, instead of the board
  // being stuck one score behind for good.
  const SYNCED_KEY = 'hoodRunnerSynced';
  let syncedBest = (() => {
    try { return parseInt(localStorage.getItem(SYNCED_KEY) || '0', 10) || 0; } catch (err) { return 0; }
  })();
  function rememberSynced(v) {
    if (!(v > syncedBest)) return;
    syncedBest = Math.floor(v);
    try { localStorage.setItem(SYNCED_KEY, String(syncedBest)); } catch (err) { /* private mode */ }
  }
  // The server's rules are the authority on what a save may do; this only
  // puts a readable sentence on whichever one it enforced.
  const SAVE_ERRORS = {
    rate_limited: 'Too many saves — try later',
    bad_nickname: 'Pick another name',
    store_not_configured: 'Leaderboard is offline',
    store_unavailable: 'Leaderboard is unreachable',
    no_token: 'No finished run to save',
    bad_secret: 'Could not save',
    no_identity: 'Could not save',
    name_taken: 'That name is taken',
    carried_limit: 'Too many carried scores today',
    token_unknown_or_used: 'This run was already saved',
    score_implausible: 'Run could not be verified',
    run_too_short: 'Run could not be verified'
  };
  const ranksTabs = document.querySelectorAll('.hood-game-ranks-tab');
  // Long enough that a normal typist is not checked on every keystroke,
  // short enough that the verdict is there before they reach for Save.
  const NAME_CHECK_DEBOUNCE_MS = 300;
  let nameCheckTimer = null;
  let nameCheckSeq = 0;

  // Shows whether the typed name is still free. Advisory: /api/score checks
  // again on submit, so a stale "free" costs nothing but a second try.
  function setNameState(kind, text) {
    if (nickField) {
      nickField.classList.toggle('is-free', kind === 'free');
      nickField.classList.toggle('is-taken', kind === 'taken');
    }
    if (nickState) {
      nickState.hidden = !text;
      nickState.classList.toggle('is-error', kind === 'taken');
      nickState.textContent = text || '';
    }
    // Only a name known to be taken blocks Save. An unchecked or unknown one
    // goes through and lets the server answer -- a flaky check must never be
    // the reason a player cannot save.
    if (nickSaveBtn) nickSaveBtn.disabled = kind === 'taken';
  }

  function scheduleNameCheck() {
    if (nameCheckTimer) clearTimeout(nameCheckTimer);
    const typed = (nickInput && nickInput.value || '').trim();
    const seq = ++nameCheckSeq;       // stale replies are dropped
    if (!typed) { setNameState('none', ''); return; }
    setNameState('none', '');
    nameCheckTimer = setTimeout(async () => {
      const r = await lb.checkName(typed);
      if (seq !== nameCheckSeq) return;
      if (!r.known || !r.valid) return setNameState('none', '');
      setNameState(r.taken ? 'taken' : 'free', r.taken ? 'Already used' : 'Available');
    }, NAME_CHECK_DEBOUNCE_MS);
  }

  if (nickInput) nickInput.addEventListener('input', scheduleNameCheck);


  // The overlay is rebuilt on every game over, so the continue line has to
  // be found again each time rather than held onto.
  function showContinueLine(on) {
    const cont = overlay && overlay.querySelector('.hood-game-overlay-continue');
    if (cont) cont.hidden = !on;
  }

  function renderRanks(entries) {
    if (!ranksList) return;
    ranksList.replaceChildren();
    if (ranksEmpty) ranksEmpty.hidden = entries.length > 0;
    entries.forEach((e) => {
      const li = document.createElement('li');
      li.className = 'hood-game-ranks-row' + (e.name === lastSavedNick ? ' is-you' : '');
      const num = document.createElement('span');
      num.className = 'hood-game-ranks-num';
      num.textContent = String(e.rank).padStart(2, '0');
      const name = document.createElement('span');
      name.className = 'hood-game-ranks-name';
      // Names are written by other players: inserted as text, never markup.
      name.textContent = e.name;
      const sc = document.createElement('span');
      sc.className = 'hood-game-ranks-score';
      sc.textContent = e.score.toLocaleString('en-US');
      li.append(num, name, sc);
      ranksList.appendChild(li);
    });
  }

  async function showRanks(which) {
    ranksBoard = which;
    ranksTabs.forEach((t) => {
      const on = t.dataset.board === which;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    });
    renderRanks(await lb.getBoard(which));
  }

  function openRanks() {
    if (!ranksPanel) return;
    if (settingsPanel) settingsPanel.hidden = true;
    if (settingsBtn) settingsBtn.setAttribute('aria-expanded', 'false');
    ranksPanel.hidden = false;
    showRanks(ranksBoard);
  }
  function closeRanks() { if (ranksPanel) ranksPanel.hidden = true; }

  if (ranksBtn) ranksBtn.addEventListener('click', openRanks);
  if (ranksClose) ranksClose.addEventListener('click', closeRanks);
  ranksTabs.forEach((t) => {
    t.addEventListener('click', () => showRanks(t.dataset.board));
  });
  document.addEventListener('pointerdown', (e) => {
    if (!ranksPanel || ranksPanel.hidden) return;
    if (ranksPanel.contains(e.target) || (ranksBtn && ranksBtn.contains(e.target))) return;
    closeRanks();
  });

  // Called once the game-over text is on screen.
  //
  // The name is asked for exactly once. After that this browser holds a name
  // on the server and every finished run is sent under it without a word --
  // the board keeps the best of them, so there is nothing left to decide.
  async function offerScoreSave(finalScore) {
    if (!saveScoreForm || !lb.isAvailable() || !lb.canSubmit()) return;
    if (lb.hasIdentity()) { autoSubmit(finalScore); return; }
    // Not named yet: ask, and offer the whole best rather than just this run,
    // so a player who was here before the board keeps what they already had.
    openSavePrompt(Math.max(Math.floor(best), finalScore), Math.floor(best) > finalScore);
  }

  // Silent from here on. A failure is not worth interrupting a game over for:
  // the score is already on screen and the next run will submit again.
  async function autoSubmit(finalScore) {
    if (finalScore <= syncedBest) return;   // nothing the board does not already have
    const res = await lb.submit(undefined, finalScore, false);
    if (!res.ok) return;
    // The server's own figure, which can be higher than this run if a better
    // one already stands under this name.
    rememberSynced(Number.isFinite(res.best) ? res.best : finalScore);
    if (!res.improved) return;
    showSaveNote(res.rank ? 'New best — #' + res.rank : 'New best saved');
  }

  // A one-line note under the game-over text. Not a prompt: nothing to answer
  // and nothing held back waiting for it.
  function showSaveNote(text) {
    if (!saveScoreForm || !saveMsg) return;
    saveScoreForm.classList.add('is-done');
    saveScoreForm.hidden = false;
    saveMsg.hidden = false;
    saveMsg.classList.remove('is-error');
    saveMsg.textContent = text;
  }

  function openSavePrompt(finalScore, carried) {
    carriedOffer = carried;
    if (saveMsg) { saveMsg.hidden = true; saveMsg.classList.remove('is-error'); }
    // Deliberately blank: prefilling last run's name means clearing it by
    // hand every single time, which is worse than typing it again.
    if (nickInput) { nickInput.value = ''; nickInput.disabled = false; }
    if (nickSaveBtn) nickSaveBtn.disabled = false;
    if (nickSkipBtn) { nickSkipBtn.hidden = false; nickSkipBtn.disabled = false; }
    saveScoreForm.classList.remove('is-done');
    nameCheckSeq++;                   // abandon any check from the last run
    setNameState('none', '');
    saveScoreForm.hidden = false;
    saveScoreForm.dataset.score = String(finalScore);
    // Hold back the "press space" invite: showing it next to a name field
    // is what made a qualifying run one stray keypress away from being lost.
    awaitingSave = true;
    if (overlay) overlay.classList.add('is-naming');
    showContinueLine(false);
  }

  // Hands the run back: the prompt closes, the continue line returns, and
  // Space means restart again.
  function finishSave() {
    awaitingSave = false;
    if (nickSkipBtn) nickSkipBtn.hidden = true;
    if (overlay) overlay.classList.remove('is-naming');
    showContinueLine(true);
  }

  // The one-time naming. Save sends what was typed, Skip passes null and
  // lets the server number it (Anonymous#1, Anonymous#2...). Either way the
  // browser comes away holding a name, and every run after this submits
  // under it on its own.
  async function submitScore(nick) {
    if (!saveScoreForm) return;
    if (nickSaveBtn) nickSaveBtn.disabled = true;
    if (nickSkipBtn) nickSkipBtn.disabled = true;
    const res = await lb.submit(nick, Number(saveScoreForm.dataset.score || 0), carriedOffer);
    if (res.retry) {
      // The name was refused before the run token was spent, so the run is
      // still there to save -- reopen the prompt instead of retiring it.
      setNameState('taken', 'Already used');
      if (nickSkipBtn) nickSkipBtn.disabled = false;
      return;
    }
    if (res.ok) {
      // Named now, so this is the last time the prompt appears. What stays on
      // screen is the confirmation, not a form.
      lastSavedNick = res.nickname || '';
      rememberSynced(Number.isFinite(res.best) ? res.best : Number(saveScoreForm.dataset.score || 0));
      saveScoreForm.classList.add('is-done');
      if (saveMsg) {
        saveMsg.hidden = false;
        saveMsg.classList.remove('is-error');
        saveMsg.textContent = 'Playing as ' + lastSavedNick + (res.rank ? ' — #' + res.rank : '');
      }
    } else if (saveMsg) {
      // A failure is worth a word -- the run token is spent either way, so
      // the prompt still retires, but the reason stays on screen.
      saveScoreForm.classList.add('is-done');
      saveMsg.hidden = false;
      saveMsg.classList.add('is-error');
      saveMsg.textContent = SAVE_ERRORS[res.error] || 'Could not save';
    }
    finishSave();
  }

  if (nickSkipBtn) nickSkipBtn.addEventListener('click', () => submitScore(null));

  if (saveScoreForm) {
    saveScoreForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const nick = (nickInput && nickInput.value || '').trim();
      if (!nick) return;
      submitScore(nick);
    });
  }

  // One probe at boot decides whether the board exists in this deployment.
  lb.getBoard('all').then(() => {
    if (lb.isAvailable() && ranksBtn) ranksBtn.hidden = false;
  });

  // ---------- fullscreen ----------
  // The wrap element itself goes fullscreen (not the whole page) -- see the
  // :fullscreen CSS for how the canvas letterboxes to fill the screen at
  // its native 16:9. Screen Orientation lock only succeeds while an
  // element is fullscreen on the browsers that support it at all (it's a
  // no-op on iOS Safari, which has never implemented orientation lock --
  // fullscreen alone still works fine there, it just won't force landscape).
  const wrapEl = document.getElementById('hoodGameWrap');
  // iOS Safari has never implemented the Fullscreen API for ordinary
  // elements (only <video> gets a fullscreen affordance, via a separate
  // non-standard API) -- wrapEl.requestFullscreen/webkitRequestFullscreen
  // is simply undefined there, on every iOS version. Rather than leave the
  // button silently doing nothing on iPhones, fall back to a CSS-only
  // "pseudo fullscreen": fix the wrap to cover the viewport and let it hit
  // the exact same :fullscreen-scaled CSS via the .is-pseudo-fullscreen
  // class (see styles.css). Real fullscreen is always tried first and used
  // whenever the browser actually supports it.
  let pseudoFullscreenActive = false;
  let scrollYBeforePseudoFullscreen = 0;
  function isFullscreen() {
    return pseudoFullscreenActive || !!(document.fullscreenElement || document.webkitFullscreenElement);
  }
  function enterPseudoFullscreen() {
    if (!wrapEl || pseudoFullscreenActive) return;
    pseudoFullscreenActive = true;
    // Fixing <body> in place (see the .hood-game-scroll-locked CSS) needs
    // its own scroll offset undone via `top` or the page visibly jumps to
    // the top the instant it locks -- restored again on exit below.
    scrollYBeforePseudoFullscreen = window.scrollY;
    document.body.style.top = -scrollYBeforePseudoFullscreen + 'px';
    wrapEl.classList.add('is-pseudo-fullscreen');
    document.documentElement.classList.add('hood-game-scroll-locked');
    handleFullscreenChange();
  }
  function exitPseudoFullscreen() {
    if (!pseudoFullscreenActive) return;
    pseudoFullscreenActive = false;
    if (wrapEl) wrapEl.classList.remove('is-pseudo-fullscreen');
    document.documentElement.classList.remove('hood-game-scroll-locked');
    document.body.style.top = '';
    // The site sets html{scroll-behavior:smooth} globally (for the nav's
    // anchor links) -- that applies to *every* programmatic scrollTo(),
    // this one included, unless a call explicitly overrides it. Left
    // smooth, restoring scrollY here animates over several hundred ms, and
    // that window is exactly when exiting the fixed-position lock is still
    // settling the rest of the page's layout -- the two fight and it can
    // land partway to the target instead of fully restoring it. Forcing
    // behavior:'instant' makes this one jump, no animation to interrupt.
    window.scrollTo({ top: scrollYBeforePseudoFullscreen, left: 0, behavior: 'instant' });
    handleFullscreenChange();
  }
  function enterFullscreen() {
    if (!wrapEl) return;
    const req = wrapEl.requestFullscreen || wrapEl.webkitRequestFullscreen;
    if (!req || document.fullscreenEnabled === false) { enterPseudoFullscreen(); return; }
    const r = req.call(wrapEl);
    if (r && r.catch) r.catch(() => enterPseudoFullscreen()); // request rejected -- fall back instead of doing nothing
  }
  function exitFullscreen() {
    if (pseudoFullscreenActive) { exitPseudoFullscreen(); return; }
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) { const r = exit.call(document); if (r && r.catch) r.catch(() => { /* already exited */ }); }
  }
  // Software fallback for devices where screen.orientation.lock() either
  // doesn't exist (iOS Safari, always) or is attempted but rejected/
  // unsupported -- see the .hood-game-force-landscape CSS for how the
  // actual rotate happens. Only ever applied on a touch device that's
  // genuinely still in portrait while fullscreen is active; never touches
  // desktop, where a portrait-shaped window is just how the user sized it.
  function isPortraitNow() {
    return !!(window.matchMedia && window.matchMedia('(orientation: portrait)').matches);
  }
  function isCoarsePointer() {
    return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }
  function updateForceLandscape() {
    if (!wrapEl) return;
    const shouldForce = isFullscreen() && isCoarsePointer() && isPortraitNow();
    wrapEl.classList.toggle('hood-game-force-landscape', shouldForce);
  }
  window.addEventListener('resize', updateForceLandscape);
  if (window.screen && window.screen.orientation) {
    window.screen.orientation.addEventListener('change', updateForceLandscape);
  }

  function handleFullscreenChange() {
    const active = isFullscreen();
    if (fullscreenBtn) {
      fullscreenBtn.classList.toggle('is-active', active);
      fullscreenBtn.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Play fullscreen');
    }
    if (active && screen.orientation && screen.orientation.lock) {
      // Only let the CSS fallback answer once the real lock has settled --
      // otherwise it'd flash on for the brief moment before a *successful*
      // lock's own orientationchange event arrives and clears it again.
      screen.orientation.lock('landscape').then(updateForceLandscape, updateForceLandscape);
    } else {
      updateForceLandscape();
    }
    if (!active && screen.orientation && screen.orientation.unlock) {
      try { screen.orientation.unlock(); } catch (err) { /* ignore */ }
    }
  }
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
      if (isFullscreen()) exitFullscreen(); else enterFullscreen();
    });
  }

  // ---------- input ----------
  // The AudioContext is created (and, if needed, resumed) here -- as the
  // very first thing done inside a real user-gesture handler -- rather
  // than eagerly at boot. Creating it before any gesture leaves it
  // 'suspended' on mobile browsers, and calling resume() *later* from
  // inside a gesture isn't reliably enough to unlock it on some of them
  // (notably iOS Safari): the activation has to be tied to the context's
  // own creation/first-resume, not just any resume() call downstream.
  // preloadAudio()'s decode work is safe to kick off from here too --
  // loadBuffer() dedupes, so this is a no-op on every gesture after the
  // first.
  let audioPrimed = false;
  function primeAudio() {
    if (audioPrimed) return;
    audioPrimed = true;
    const ctx = ensureAudioCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    preloadAudio();
  }

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.key !== ' ') return;
    if (!assetsReady) return;
    // Let Space do its normal job (toggling the Sound switch, activating a
    // focused button/link) instead of hijacking it into a jump when focus
    // is on one of the settings panel's own controls.
    if (e.target && e.target.closest && e.target.closest('input, button, a')) return;
    if (document.body.classList.contains('homepage')) {
      const r = wrapEl.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= window.innerHeight || document.getElementById('faceDrawOverlay')?.hidden === false) return;
    }
    e.preventDefault();
    primeAudio();
    jump();
  });
  document.addEventListener('hood-runner-start', () => {
    if (!assetsReady) return;
    primeAudio();
    jump();
  });
  // Tap target is the whole section, not just the canvas -- on a small
  // phone screen the canvas itself is a fiddly target mid-run. Real links,
  // buttons, and the settings panel (sliders aren't <button>s) are left
  // alone so they still work normally instead of being hijacked into a jump.
  const gameSection = document.getElementById('game');
  function handleGameTap(e) {
    if (!assetsReady) return;
    // .nav-links/.nav-more/.topbar-right only ever matter for the document-
    // level fallback below (nothing inside #game carries those classes),
    // but living in one shared list is what lets that fallback stay a
    // generic relay instead of a second, topbar-specific copy of this
    // exclusion check.
    if (e.target.closest('a, button, input, #hoodGameSettingsPanel, #hoodGameRanksPanel, #hoodGameSaveScore, .nav-links, .nav-more, .topbar-right')) return;
    // Starting -- or restarting -- a run is the one action here worth
    // gating: from IDLE or OVER, a tap anywhere in the wide zone below
    // would start a run, and it's easy to catch by accident (scrolling
    // past the section-head text, or the document-level relay below) with
    // no way to tell beforehand that it's about to happen. Once a run is
    // actually live, that same wide zone is what makes "jump" reachable
    // without fighting the canvas as a fiddly target, so only the start
    // itself requires a tap that lands on the visible frame.
    const inFrame = !!(wrapEl && wrapEl.contains(e.target));
    if (!inFrame && (state === STATE.IDLE || state === STATE.OVER)) return;
    primeAudio();
    jump();
  }
  (gameSection || canvas).addEventListener('pointerdown', handleGameTap);

  // A tap that lands on something painted above #game -- the sticky
  // topbar's own dead space, once the page is scrolled far enough that
  // #game's tap zone runs up under it, which is roughly where the frame
  // sits nicely near the top of the screen to play -- never reaches the
  // listener above at all: pointerdown only bubbles through whatever the
  // browser's hit-test actually picked, and anything stacked on top of
  // #game without being its descendant isn't in that path. Catching that
  // generically (by position, not by naming .topbar specifically) means
  // this keeps working for whatever else ever ends up layered over #game,
  // not just today's one known case, and it costs nothing on every other
  // tap: gameSection.contains(e.target) is a plain tree-structure check,
  // no layout read, and it's what skips straight past the common case --
  // a tap already inside #game, already handled above -- before the one
  // getBoundingClientRect() call below ever runs.
  document.addEventListener('pointerdown', (e) => {
    if (!gameSection || gameSection.contains(e.target)) return;
    const r = gameSection.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    handleGameTap(e);
  });

  // ---------- boot ----------
  showOverlay('HOOD RUN', ['Loading…']);
  Promise.all(
    Object.entries(SPRITES).map(([key, sprite]) =>
      loadImage(sprite.src).then((img) => { sprite.img = img; })
    )
  ).then(() => {
    standAspect = (SPRITES.stand.img.naturalWidth / SPRITES.stand.frames) / SPRITES.stand.img.naturalHeight;
    runAspect = (SPRITES.run.img.naturalWidth / SPRITES.run.frames) / SPRITES.run.img.naturalHeight;
    jumpAspect = (SPRITES.jump.img.naturalWidth / SPRITES.jump.frames) / SPRITES.jump.img.naturalHeight;
    // Precomputed once here instead of on every drawFrame()/draw() call --
    // natural image dimensions never change after load.
    Object.values(SPRITES).forEach((sprite) => {
      if (sprite.frames) { sprite.frameW = sprite.img.naturalWidth / sprite.frames; sprite.frameH = sprite.img.naturalHeight; }
    });
    backgroundTile = prepareBackground(SPRITES.background.img,GROUND_Y);
    // Audio priming (AudioContext creation + decode) happens on the first
    // real user gesture (see primeAudio() in the input section below), not
    // here -- creating the context this early, before any gesture, is
    // exactly what leaves it stuck unable to unlock on some mobile browsers.
    assetsReady = true;
    state = STATE.IDLE;
    showOverlay('HOOD RUN', [{ text: 'PRESS SPACE TO START', cls: 'hood-game-overlay-continue' }]);
    ensureLoopRunning(); // one draw of the idle screen, then the loop parks itself
  }).catch((err) => {
    console.error('Hood Runner: asset load failed', err);
    showOverlay('HOOD RUN', ['Could not load — try refreshing.']);
  });
}
