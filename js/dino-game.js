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
    jump: { src: 'character-jump.webp', frames: 13 },
    coin: { src: 'coin-spin.webp', frames: 12 },
    candle: { src: 'obstacle-candle.webp', frames: 1 },
    rugged: { src: 'obstacle-rugged.webp', frames: 1 }
  };

  let assetsReady = false;
  // Recomputed from the real sprite sheets once they load. Run and jump
  // frames aren't the same aspect (arms/cape spread wider mid-jump), so the
  // player's box and draw size both track whichever cycle is currently active.
  let runAspect = 0.89;
  let jumpAspect = 1.05;

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
  const playerBox = { x: 0, y: 0, w: 0, h: 0 }; // reused every frame instead of reallocated
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
      const followBase = Math.max(260, 620 - speed * 550);
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

  const RESTART_COOLDOWN = 2000; // ms -- avoids an accidental restart from the same tap/key that just lost the run

  function endRun() {
    state = STATE.OVER;
    overSince = performance.now();
    stopMusic();
    stopRunSfx();
    const formatted = Math.floor(score).toLocaleString('en-US');
    if (score > best) {
      best = score;
      try { localStorage.setItem('hoodRunnerBest', String(Math.floor(best))); } catch (err) { /* private mode etc -- best just won't persist */ }
      updateBestLabel();
      showOverlay('NEW HIGH SCORE!', [
        { text: formatted, cls: 'hood-game-overlay-score' },
        'PRESS SPACE TO RUN AGAIN'
      ]);
    } else {
      showOverlay('RUGGED!', ['You scored ' + formatted + ' points', 'Click or press SPACE to continue']);
    }
  }

  function jump() {
    if (state === STATE.IDLE) { startRun(); return; }
    if (state === STATE.OVER) {
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
  function hit(a, b) {
    // Shrink both boxes a bit so near-misses feel fair rather than
    // punishing on sprite-padding alone.
    const pad = 0.16;
    const ax = a.x + a.w * pad, aw = a.w * (1 - pad * 2);
    const ay = a.y + a.h * pad, ah = a.h * (1 - pad * 2);
    const bx = b.x + b.w * pad, bw = b.w * (1 - pad * 2);
    const by = b.y + b.h * pad, bh = b.h * (1 - pad * 2);
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
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
    const bgW = SPRITES.background.img.naturalWidth;
    if (bgScrollX <= -bgW) bgScrollX += bgW;

    // collisions
    playerBox.x = player.x; playerBox.y = player.y;
    playerBox.w = GROUND_HEIGHT * (player.grounded ? runAspect : jumpAspect);
    playerBox.h = GROUND_HEIGHT;
    for (const o of obstacles) {
      if (hit(playerBox, o)) { playSfx('impact'); endRun(); break; }
    }
    for (const c of coins) {
      if (!c.taken && hit(playerBox, c)) {
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
    const fw = img.naturalWidth / sprite.frames;
    ctx.drawImage(img, frameIndex * fw, 0, fw, img.naturalHeight, x, y, w, h);
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
  function drawGroundShadow(cx, w, lift) {
    const t = Math.min(1, Math.max(0, lift) / 140);
    const alpha = 0.24 * (1 - t * 0.75);
    if (alpha < 0.02) return;
    const sw = w * (1 - t * 0.3);
    const sh = 9 * (1 - t * 0.4);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#1a2916';
    ctx.beginPath();
    ctx.ellipse(cx, GROUND_Y + 3, Math.max(1, sw / 2), Math.max(1, sh / 2), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, CW, CH);

    // background (two copies for seamless horizontal scroll)
    const bg = SPRITES.background.img;
    const bgH = GROUND_Y;
    const bgW = bg.naturalWidth * (bgH / bg.naturalHeight);
    let x = bgScrollX * (bgW / bg.naturalWidth);
    while (x < CW) {
      ctx.drawImage(bg, x, 0, bgW, bgH);
      x += bgW;
    }
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

  // ---------- audio (Web Audio API, buffer-based) ----------
  // Every sound used to be a plain HTMLMediaElement (`new Audio()` /
  // `<audio>`), including two elements looping continuously for the whole
  // run (music + running footsteps). Each one keeps its own live
  // demux/decode/network-buffering pipeline running the entire time it
  // plays -- fine on desktop, but a real source of stutter on mobile with
  // two of those pipelines active simultaneously (confirmed: muting, which
  // stops both, made the game smooth again). Web Audio fixes this at the
  // root: every file is decoded ONCE into an in-memory AudioBuffer, and
  // "playing" it after that is just scheduling a lightweight buffer-source
  // node -- no ongoing decode/streaming cost, looping is sample-accurate
  // with no per-loop re-trigger, and volume/fades are native GainNode
  // ramps instead of a JS timer stepping .volume by hand.
  const MUSIC_BASE = 'sound-effects/';
  const MUSIC_TRACKS = ['1sound.mp3', '2sound.mp3', '3sound.mp3', '5sound.mp3'];
  const FADE_IN_S = 2.5;
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
  let musicGain = null, sfxGain = null, runGain = null;
  const audioBuffers = Object.create(null); // filename -> AudioBuffer | Promise<AudioBuffer|null>
  let musicSource = null;
  let runSource = null;
  let lastTrackIdx = -1;

  function ensureAudioCtx() {
    if (actx) return actx;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    actx = new AudioCtx();
    musicGain = actx.createGain(); musicGain.gain.value = 0; musicGain.connect(actx.destination);
    sfxGain = actx.createGain(); sfxGain.gain.value = sfxVolume; sfxGain.connect(actx.destination);
    runGain = actx.createGain(); runGain.gain.value = sfxVolume; runGain.connect(actx.destination);
    return actx;
  }

  function setMusicVolume(v) {
    musicVolume = Math.min(1, Math.max(0, v));
    try { localStorage.setItem('hoodRunnerMusicVol', String(musicVolume)); } catch (err) { /* private mode etc */ }
    if (actx && musicGain && !musicMuted) musicGain.gain.setTargetAtTime(musicVolume, actx.currentTime, 0.05);
  }
  function setSfxVolume(v) {
    sfxVolume = Math.min(1, Math.max(0, v));
    try { localStorage.setItem('hoodRunnerSfxVol', String(sfxVolume)); } catch (err) { /* private mode etc */ }
    if (actx && sfxGain && !musicMuted) {
      sfxGain.gain.setTargetAtTime(sfxVolume, actx.currentTime, 0.05);
      runGain.gain.setTargetAtTime(sfxVolume, actx.currentTime, 0.05);
    }
  }

  // Decodes a file exactly once regardless of how many times it's
  // requested -- concurrent callers share the same in-flight promise.
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

  // Kicks off decoding everything up front so gameplay never pays a
  // first-use decode cost -- only cheap buffer scheduling happens during an
  // actual run. This used to fire all ~9 fetch+decodeAudioData calls at
  // once, synchronously, from inside primeAudio() -- which runs on the same
  // gesture (and the same tick) as the very first jump/run start. Profiling
  // under CPU throttling confirmed that concurrent decode burst landing
  // right as physics/render kick off was the actual source of the "stutter
  // on jump/start" -- not the game loop itself.
  //
  // Split into two priority tiers instead of one flat list:
  //  - "critical" (running loop + jump/land/coin/impact SFX): small files,
  //    needed within the first couple seconds of any run, so they still
  //    kick off right away -- just chained one-at-a-time instead of fired
  //    concurrently, which was the actual source of the CPU burst (five
  //    small decodes serialized is cheaper on the main thread at any given
  //    instant than the same five racing in parallel).
  //  - the other three music tracks: not remotely time-critical (the one
  //    actually playing this run is loaded separately by playRandomMusic()'s
  //    own direct call), so those are pushed to an idle moment.
  function preloadAudio() {
    if (!ensureAudioCtx()) return;
    const critical = [RUN_SFX_FILE].concat(Object.values(SFX_FILES));
    critical.reduce((p, file) => p.then(() => loadBuffer(file)), Promise.resolve());

    const runIdle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));
    runIdle(() => {
      MUSIC_TRACKS.reduce((p, file) => p.then(() => loadBuffer(file)), Promise.resolve());
    });
  }

  function pickTrackIndex() {
    if (MUSIC_TRACKS.length <= 1) return 0;
    let idx;
    do { idx = (Math.random() * MUSIC_TRACKS.length) | 0; } while (idx === lastTrackIdx);
    return idx;
  }

  async function playRandomMusic() {
    if (musicMuted) return;
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume(); // must be synchronous-ish with the user gesture that triggered this
    lastTrackIdx = pickTrackIndex();
    const buf = await loadBuffer(MUSIC_TRACKS[lastTrackIdx]);
    if (!buf || musicMuted) return; // re-check -- state may have changed while awaiting decode
    if (musicSource) { try { musicSource.stop(); } catch (err) { /* already stopped */ } }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(musicGain);
    const now = ctx.currentTime;
    musicGain.gain.cancelScheduledValues(now);
    musicGain.gain.setValueAtTime(0, now);
    musicGain.gain.linearRampToValueAtTime(musicVolume, now + FADE_IN_S);
    src.start(0);
    musicSource = src;
  }

  function stopMusic() {
    if (musicSource) { try { musicSource.stop(); } catch (err) { /* already stopped */ } musicSource = null; }
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
  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }
  function enterFullscreen() {
    if (!wrapEl) return;
    const req = wrapEl.requestFullscreen || wrapEl.webkitRequestFullscreen;
    if (req) { const r = req.call(wrapEl); if (r && r.catch) r.catch(() => { /* denied / unsupported */ }); }
  }
  function exitFullscreen() {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) { const r = exit.call(document); if (r && r.catch) r.catch(() => { /* already exited */ }); }
  }
  function handleFullscreenChange() {
    const active = isFullscreen();
    if (fullscreenBtn) {
      fullscreenBtn.classList.toggle('is-active', active);
      fullscreenBtn.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Play fullscreen');
    }
    if (active && screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(() => { /* not supported / not allowed -- fine, portrait still works */ });
    } else if (!active && screen.orientation && screen.orientation.unlock) {
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
