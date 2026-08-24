// Endless-runner mini-game for the main page ("Outrun the rug"). Canvas +
// vanilla JS, no dependencies -- same zero-build-step spirit as the rest of
// the site. Space (or tap/click on the canvas) to jump; the run continues
// until you clip an obstacle.
//
// Kept as an external module (not inline) for the same CSP reason as
// wallet-connect.js: no 'unsafe-inline' script-src.

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
  const versionEl = document.getElementById('hoodGameVersion');
  const GAME_VERSION = '1.0.0';

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
    background: { src: 'background.webp' },
    run: { src: 'character-run.webp', frames: 6 },
    jump: { src: 'character-jump.webp', frames: 24 }, // sliced from the user-supplied jump2_anim.gif (24 frames, 60ms each)
    coin: { src: 'coin-spin.webp', frames: 12 },
    candle: { src: 'obstacle-candle.webp', frames: 1 },
    rugged: { src: 'obstacle-rugged.webp', frames: 1 }
  };

  let assetsReady = false;
  // Recomputed from the real sprite sheets once they load. Run and jump
  // frames aren't the same aspect (arms/cape spread wider mid-jump), so the
  // player's box and draw size both track whichever cycle is currently active.
  let runAspect = 0.89;
  let jumpAspect = 0.76;
  // Background draw width + its scroll-scale ratio, computed once the
  // image loads (natural dimensions never change after that) instead of
  // redoing the same division/multiplication in draw() on every single
  // frame -- one more small piece of "keep every frame cheap" alongside
  // the array-compaction/closure-hoisting already done elsewhere here.
  let bgDrawW = 0;
  let bgScaleRatio = 0;
  let bgNaturalW = 0;

  // ---------- game state ----------
  const STATE = { LOADING: 'loading', IDLE: 'idle', PLAYING: 'playing', OVER: 'over' };
  let state = STATE.LOADING;

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

  const COIN_SCORE = 25;

  let obstacles = [];
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
    if (overlayDelayTimer) { clearTimeout(overlayDelayTimer); overlayDelayTimer = null; }
    player.y = GROUND_Y - GROUND_HEIGHT;
    player.vy = 0;
    player.grounded = true;
    player.runFrame = 0;
    player.runTimer = 0;
    player.jumpFrame = 0;
    player.jumpTimer = 0;
    obstacles = [];
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
    const isRugged = elapsed >= RUGGED_MIN_ELAPSED && Math.random() < RUGGED_CHANCE;
    const kind = isRugged ? 'rugged' : 'candle';
    const sprite = SPRITES[kind];
    const aspect = sprite.img.naturalWidth / sprite.img.naturalHeight;
    // Candle variants: mostly a plain grounded candle, but sometimes one
    // drops in from off-screen above, and sometimes one floats at head
    // height -- clear to run under, but a jump carries you straight into it.
    // A close-follow spawn from clustering is always forced to 'ground' --
    // stacking a falling/overhead hazard right on a cluster's heels would
    // compound unfairly.
    const isClusterFollow = pendingClusterFollow;
    pendingClusterFollow = false;
    const variantRoll = (isRugged || isClusterFollow) ? 1 : Math.random();
    const variant = variantRoll < 0.12 ? 'falling' : variantRoll < 0.22 ? 'overhead' : 'ground';
    // Decided up front (before picking a height) so both members of a pair
    // -- the one starting it and its close-follow partner -- stay short.
    const startsPair = !isRugged && variant === 'ground' && !isClusterFollow && clusterChain === 0 && Math.random() < 0.14;
    const isPaired = startsPair || isClusterFollow;
    if (startsPair) clusterChain = 1;
    let h, w;
    if (isRugged) {
      h = GROUND_HEIGHT * 0.66; // rugged reads wide, keep it a touch shorter
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
      // Rugged reads mixed up: sometimes grounded, sometimes floating in
      // the air -- and it's always in motion, either bobbing up/down or
      // drifting left/right in place within a small range.
      if (Math.random() < 0.5) baseY = GROUND_Y - h - (55 + Math.random() * 70);
      if (Math.random() < 0.5) {
        moveType = 'vertical';
        moveAmp = 18 + Math.random() * 14;
        moveSpeed = 0.0028 + Math.random() * 0.0018;
      } else {
        moveType = 'horizontal';
        moveAmp = 22 + Math.random() * 18;
        moveSpeed = 0.0022 + Math.random() * 0.0016;
      }
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

    obstacles.push({ kind, baseX: x, x, baseY, y: startY, w, h, moveType, moveAmp, moveSpeed, moveTimer: 0 });
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
    state = STATE.PLAYING;
    hideOverlay();
    ensureLoopRunning();
    playRandomMusic();
    startRunSfx();
  }

  const OVERLAY_DELAY_MS = 500; // ms after a run ends before the result text appears -- a beat to register the hit
  const RESTART_COOLDOWN = 1000; // ms after the overlay text appears -- avoids an accidental restart from the same tap/key that just lost the run

  let overlayDelayTimer = null;
  let resultShown = false; // true only once the delayed overlay text has actually appeared -- blocks restart input during OVERLAY_DELAY_MS too, not just RESTART_COOLDOWN after

  function endRun() {
    state = STATE.OVER;
    resultShown = false;
    stopMusic();
    stopRunSfx();
    const formatted = Math.floor(score).toLocaleString('en-US');
    const isHighScore = score > best;
    if (isHighScore) {
      best = score;
      try { localStorage.setItem('hoodRunnerBest', String(Math.floor(best))); } catch (err) { /* private mode etc -- best just won't persist */ }
      updateBestLabel();
    }
    if (overlayDelayTimer) clearTimeout(overlayDelayTimer);
    overlayDelayTimer = setTimeout(() => {
      overlayDelayTimer = null;
      resultShown = true;
      overSince = performance.now();
      if (isHighScore) {
        showOverlay('NEW HIGH SCORE!', [
          { text: formatted, cls: 'hood-game-overlay-score' },
          'PRESS SPACE TO RUN AGAIN'
        ]);
      } else {
        showOverlay('RUGGED!', ['You scored ' + formatted + ' points', 'Click or press SPACE to continue']);
      }
    }, OVERLAY_DELAY_MS);
  }

  function jump() {
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
      player.jumpTimer += dt;
      while (player.jumpTimer > 64 && player.jumpFrame < SPRITES.jump.frames - 1) {
        player.jumpTimer -= 64;
        player.jumpFrame++;
      }
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

    // move + cull + animate coins
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      c.x -= dx;
      c.timer += dt;
      if (c.timer > 45) { c.timer = 0; c.frame = (c.frame + 1) % SPRITES.coin.frames; }
      if (c.x + c.w <= -20 || c.taken) coins.splice(i, 1);
    }

    // float + fade the "+score" popups, then drop the finished ones
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.x -= dx;
      p.life += dt;
      if (p.life >= p.dur) popups.splice(i, 1);
    }

    // background parallax
    bgScrollX -= dx * 0.5;
    if (bgScrollX <= -bgNaturalW) bgScrollX += bgNaturalW;

    // collisions -- playerHitBox is the player's box already shrunk by
    // HIT_PAD, computed once here instead of hit() redoing the same a.x/
    // a.w math for every obstacle/coin candidate this frame (see hit()).
    const playerW = GROUND_HEIGHT * (player.grounded ? runAspect : jumpAspect);
    playerHitBox.x = player.x + playerW * HIT_PAD;
    playerHitBox.w = playerW * (1 - HIT_PAD * 2);
    playerHitBox.y = player.y + GROUND_HEIGHT * HIT_PAD;
    playerHitBox.h = GROUND_HEIGHT * (1 - HIT_PAD * 2);
    for (let i = 0; i < obstacles.length; i++) {
      if (hit(obstacles[i])) { playSfx('impact'); endRun(); break; }
    }
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (!c.taken && hit(c)) {
        c.taken = true;
        score += COIN_SCORE;
        popups.push({ x: c.x + c.w / 2, y: c.y, life: 0, dur: 650, text: '+' + COIN_SCORE });
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
  function drawPlayer() {
    const h = GROUND_HEIGHT;
    if (player.grounded) {
      const w = h * runAspect;
      drawFrame(SPRITES.run, player.runFrame, player.x, player.y, w, h);
    } else {
      const w = h * jumpAspect;
      drawFrame(SPRITES.jump, player.jumpFrame, player.x, player.y, w, h);
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

    // background (two copies for seamless horizontal scroll) -- bgDrawW/
    // bgScaleRatio are precomputed once at boot instead of redoing the
    // same natural-dimension division every frame.
    const bg = SPRITES.background.img;
    let x = bgScrollX * bgScaleRatio;
    while (x < CW) {
      ctx.drawImage(bg, x, 0, bgDrawW, GROUND_Y);
      x += bgDrawW;
    }
    ctx.fillStyle = '#1a2916';
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (!c.taken) drawGroundShadow(c.x + c.w / 2, c.w, (GROUND_Y - c.h) - c.y);
    }
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      drawGroundShadow(o.x + o.w / 2, o.w, (GROUND_Y - o.h) - o.y);
    }
    const playerW = GROUND_HEIGHT * (player.grounded ? runAspect : jumpAspect);
    drawGroundShadow(player.x + playerW / 2, playerW * 0.95, (GROUND_Y - GROUND_HEIGHT) - player.y);
    ctx.globalAlpha = 1; // shadows are the only thing that touches this -- reset once instead of per-call

    // coins
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (!c.taken) drawFrame(SPRITES.coin, c.frame, c.x, c.y, c.w, c.h);
    }

    // obstacles
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      ctx.drawImage(SPRITES[o.kind].img, o.x, o.y, o.w, o.h);
    }

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
    if (assetsReady) draw();

    if (state === STATE.PLAYING) {
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
  // Two different engines for two different jobs:
  //  - Music: a single native HTMLAudioElement, streamed/decoded
  //    incrementally by the browser's own media pipeline. Profiling under
  //    CPU throttling (instrumenting decodeAudioData directly) found that
  //    music files -- the only ones big enough to matter, 0.6-3.2MB
  //    compressed -- caused a genuine 400ms-to-nearly-2s main-thread stall
  //    exactly when Web Audio's decodeAudioData resolved, whether that
  //    landed at startRun() (decoding the track just picked) or later via
  //    a background preload of the others: decodeAudioData hands back a
  //    track's ENTIRE decoded PCM in one shot (tens of MB for a
  //    multi-minute file), and materializing that is expensive regardless
  //    of when it's triggered. A streaming <audio> element has no such
  //    one-shot cost.
  //  - Everything else (jump/land/coin/impact SFX + the looping running
  //    footstep track) stays on Web Audio buffers: all well under 300KB,
  //    decoding each in under ~20ms even under heavy throttling in the
  //    same profiling, so none of them have the large-file problem music
  //    does -- buffer-source scheduling stays the cheapest option for those.
  // A single streaming <audio> for music isn't a re-run of the ORIGINAL
  // mobile-stutter bug either -- that came from TWO continuously-streaming
  // HTMLMediaElements (music + running) contending for the same decode
  // pipeline at once. Running now lives on Web Audio, so there's only ever
  // one streaming pipeline active here, same as before that fix landed.
  const MUSIC_BASE = 'sound-effects/';
  const MUSIC_TRACKS = ['1sound.mp3', '2sound.mp3', '3sound.mp3', '5sound.mp3'];
  const FADE_IN_MS = 2500;
  const SFX_FILES = { jump: 'jumping.wav', land: 'landing.mp3', coin: 'coin.wav', impact: 'impact.mp3' };
  const RUN_SFX_FILE = 'running.mp3';

  // User-adjustable via the settings panel (0-1), persisted like the mute
  // flag. SFX default is 30% quieter than music's so it sits underneath it
  // rather than competing, but the two are independent sliders from here.
  function loadStoredVolume(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      const v = parseFloat(raw);
      return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
    } catch (err) { return fallback; }
  }
  let musicVolume = loadStoredVolume('hoodRunnerMusicVol', 0.5);
  let sfxVolume = loadStoredVolume('hoodRunnerSfxVol', 0.35);

  let musicMuted = false;
  try { musicMuted = localStorage.getItem('hoodRunnerMuted') === '1'; } catch (err) { musicMuted = false; }

  let actx = null;
  let sfxGain = null, runGain = null;
  const audioBuffers = Object.create(null); // filename -> AudioBuffer | Promise<AudioBuffer|null>
  let runSource = null;
  let lastTrackIdx = -1;

  function ensureAudioCtx() {
    if (actx) return actx;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    actx = new AudioCtx();
    sfxGain = actx.createGain(); sfxGain.gain.value = sfxVolume; sfxGain.connect(actx.destination);
    runGain = actx.createGain(); runGain.gain.value = sfxVolume; runGain.connect(actx.destination);
    return actx;
  }

  // Music element + its own tiny volume-fade timer. A coarse 60ms-step
  // setInterval (not a per-frame rAF hook) is plenty smooth for a volume
  // ramp and, unlike the large-file decode above, costs nothing worth
  // measuring next to the game loop -- ~40 cheap steps spread across
  // FADE_IN_MS, not a per-frame cost.
  let musicEl = null;
  let musicFadeTimer = null;
  function ensureMusicEl() {
    if (musicEl) return musicEl;
    musicEl = new Audio();
    musicEl.loop = true;
    musicEl.volume = 0;
    return musicEl;
  }
  function fadeMusicTo(target, ms) {
    if (musicFadeTimer) { clearInterval(musicFadeTimer); musicFadeTimer = null; }
    if (!musicEl) return;
    const start = musicEl.volume;
    const startTs = performance.now();
    musicFadeTimer = setInterval(() => {
      const t = Math.min(1, (performance.now() - startTs) / ms);
      musicEl.volume = start + (target - start) * t;
      if (t >= 1) { clearInterval(musicFadeTimer); musicFadeTimer = null; }
    }, 60);
  }

  function setMusicVolume(v) {
    musicVolume = Math.min(1, Math.max(0, v));
    try { localStorage.setItem('hoodRunnerMusicVol', String(musicVolume)); } catch (err) { /* private mode etc */ }
    // Leave an in-progress fade-in alone -- it's already ramping toward the
    // just-updated musicVolume target on its own next tick.
    if (musicEl && !musicMuted && !musicFadeTimer) musicEl.volume = musicVolume;
  }
  function setSfxVolume(v) {
    sfxVolume = Math.min(1, Math.max(0, v));
    try { localStorage.setItem('hoodRunnerSfxVol', String(sfxVolume)); } catch (err) { /* private mode etc */ }
    if (actx && sfxGain && !musicMuted) {
      sfxGain.gain.setTargetAtTime(sfxVolume, actx.currentTime, 0.05);
      runGain.gain.setTargetAtTime(sfxVolume, actx.currentTime, 0.05);
    }
  }

  // Decodes an SFX/running-loop file exactly once regardless of how many
  // times it's requested -- concurrent callers share the same in-flight
  // promise. Music never goes through here -- see the audio section intro
  // above for why.
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

  // Kicks off decoding the running loop + jump/land/coin/impact SFX up
  // front so gameplay never pays a first-use decode cost -- only cheap
  // buffer scheduling happens during an actual run. All five are small
  // (under 300KB) and decode in under ~20ms each even under heavy CPU
  // throttling, chained one-at-a-time rather than fired concurrently
  // (profiling showed serialized was cheaper on the main thread at any
  // given instant than the same five racing in parallel).
  function preloadAudio() {
    if (!ensureAudioCtx()) return;
    const critical = [RUN_SFX_FILE].concat(Object.values(SFX_FILES));
    critical.reduce((p, file) => p.then(() => loadBuffer(file)), Promise.resolve());
  }

  function pickTrackIndex() {
    if (MUSIC_TRACKS.length <= 1) return 0;
    let idx;
    do { idx = (Math.random() * MUSIC_TRACKS.length) | 0; } while (idx === lastTrackIdx);
    return idx;
  }

  function playRandomMusic() {
    if (musicMuted) return;
    const el = ensureMusicEl();
    lastTrackIdx = pickTrackIndex();
    el.src = ASSET_BASE + MUSIC_BASE + MUSIC_TRACKS[lastTrackIdx];
    el.currentTime = 0;
    el.volume = 0;
    const p = el.play();
    if (p && p.catch) p.catch(() => { /* blocked -- no gesture yet, next call will retry */ });
    fadeMusicTo(musicVolume, FADE_IN_MS);
  }

  function stopMusic() {
    if (musicFadeTimer) { clearInterval(musicFadeTimer); musicFadeTimer = null; }
    if (musicEl) musicEl.pause();
  }

  async function playSfx(name) {
    if (musicMuted) return;
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const buf = await loadBuffer(SFX_FILES[name]);
    if (!buf || musicMuted) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(sfxGain);
    src.start(0);
  }

  async function startRunSfx() {
    if (musicMuted || runSource) return; // already looping -- don't restart it from the top
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const buf = await loadBuffer(RUN_SFX_FILE);
    if (!buf || musicMuted || runSource) return;
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

  function setMuted(muted) {
    musicMuted = muted;
    try { localStorage.setItem('hoodRunnerMuted', muted ? '1' : '0'); } catch (err) { /* private mode etc */ }
    if (soundToggle) soundToggle.checked = !muted;
    if (muted) {
      stopMusic();
      stopRunSfx();
    } else if (state === STATE.PLAYING) {
      playRandomMusic();
      if (player.grounded) startRunSfx();
    }
  }

  // ---------- settings panel (top-right "Settings" button, popup centered over the game: music/SFX volume, version) ----------
  if (settingsBtn && settingsPanel) {
    if (soundToggle) soundToggle.checked = !musicMuted;
    if (musicVolInput) musicVolInput.value = String(Math.round(musicVolume * 100));
    if (sfxVolInput) sfxVolInput.value = String(Math.round(sfxVolume * 100));
    if (versionEl) versionEl.textContent = 'Hood Runner v' + GAME_VERSION;

    function closeSettings() {
      settingsPanel.hidden = true;
      settingsBtn.setAttribute('aria-expanded', 'false');
    }
    settingsBtn.addEventListener('click', () => {
      const willOpen = settingsPanel.hidden;
      settingsPanel.hidden = !willOpen;
      settingsBtn.setAttribute('aria-expanded', String(willOpen));
    });
    // Close on any click/tap outside the button+panel -- pointerdown so it
    // doesn't fight with the game's own pointerdown-to-jump listener below.
    document.addEventListener('pointerdown', (e) => {
      if (settingsPanel.hidden) return;
      if (e.target === settingsBtn || settingsBtn.contains(e.target) || settingsPanel.contains(e.target)) return;
      closeSettings();
    });
    if (soundToggle) {
      soundToggle.addEventListener('change', () => setMuted(!soundToggle.checked));
    }
    if (musicVolInput) {
      musicVolInput.addEventListener('input', () => setMusicVolume(musicVolInput.valueAsNumber / 100));
    }
    if (sfxVolInput) {
      sfxVolInput.addEventListener('input', () => setSfxVolume(sfxVolInput.valueAsNumber / 100));
    }
  }

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
    e.preventDefault();
    primeAudio();
    jump();
  });
  // Tap target is the whole section, not just the canvas -- on a small
  // phone screen the canvas itself is a fiddly target mid-run. Real links,
  // buttons, and the settings panel (sliders aren't <button>s) are left
  // alone so they still work normally instead of being hijacked into a jump.
  const gameSection = document.getElementById('game');
  (gameSection || canvas).addEventListener('pointerdown', (e) => {
    if (!assetsReady) return;
    if (e.target.closest('a, button, input, #hoodGameSettingsPanel')) return;
    primeAudio();
    jump();
  });

  // ---------- boot ----------
  showOverlay('HOOD RUN', ['Loading…']);
  Promise.all(
    Object.entries(SPRITES).map(([key, sprite]) =>
      loadImage(sprite.src).then((img) => { sprite.img = img; })
    )
  ).then(() => {
    runAspect = (SPRITES.run.img.naturalWidth / SPRITES.run.frames) / SPRITES.run.img.naturalHeight;
    jumpAspect = (SPRITES.jump.img.naturalWidth / SPRITES.jump.frames) / SPRITES.jump.img.naturalHeight;
    // Precomputed once here instead of on every drawFrame()/draw() call --
    // natural image dimensions never change after load.
    Object.values(SPRITES).forEach((sprite) => {
      if (sprite.frames) { sprite.frameW = sprite.img.naturalWidth / sprite.frames; sprite.frameH = sprite.img.naturalHeight; }
    });
    bgNaturalW = SPRITES.background.img.naturalWidth;
    bgScaleRatio = GROUND_Y / SPRITES.background.img.naturalHeight;
    bgDrawW = bgNaturalW * bgScaleRatio;
    // Audio priming (AudioContext creation + decode) happens on the first
    // real user gesture (see primeAudio() in the input section below), not
    // here -- creating the context this early, before any gesture, is
    // exactly what leaves it stuck unable to unlock on some mobile browsers.
    assetsReady = true;
    state = STATE.IDLE;
    showOverlay('HOOD RUN', ['PRESS SPACE TO START']);
    ensureLoopRunning(); // one draw of the idle screen, then the loop parks itself
  }).catch((err) => {
    console.error('Hood Runner: asset load failed', err);
    showOverlay('HOOD RUN', ['Could not load — try refreshing.']);
  });
}
