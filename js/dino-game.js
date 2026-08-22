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
    jump: { src: 'character-jump.webp', frames: 20 },
    coin: { src: 'coin-spin.webp', frames: 12 },
    candle: { src: 'obstacle-candle.webp', frames: 1 },
    rugged: { src: 'obstacle-rugged.webp', frames: 1 }
  };

  let assetsReady = false;

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

  function scheduleNextObstacle() {
    // Gap shrinks as speed rises but never gets unfair -- floor keeps a
    // minimum reaction window even at max speed.
    const base = Math.max(650, 1500 - speed * 900);
    nextObstacleAt = elapsed + base + Math.random() * base * 0.6;
  }
  function scheduleNextCoin() {
    nextCoinAt = elapsed + 1000 + Math.random() * 1400;
  }

  // Candle body width stays constant across heights (like a real candlestick
  // chart) -- only the wick/body length varies, short to tall.
  const CANDLE_HEIGHT_RATIOS = [0.5, 0.72, 0.95, 1.2];
  const RUGGED_CHANCE = 1 / 21; // candles:rugged spawn ratio is 20:1
  const RUGGED_MIN_ELAPSED = 10000; // never in the first 10s of a run

  function spawnObstacle() {
    const isRugged = elapsed >= RUGGED_MIN_ELAPSED && Math.random() < RUGGED_CHANCE;
    const kind = isRugged ? 'rugged' : 'candle';
    const sprite = SPRITES[kind];
    const aspect = sprite.img.naturalWidth / sprite.img.naturalHeight;
    let h, w;
    if (isRugged) {
      h = GROUND_HEIGHT * 0.66; // rugged reads wide, keep it a touch shorter
      w = h * aspect;
    } else {
      const ratio = CANDLE_HEIGHT_RATIOS[(Math.random() * CANDLE_HEIGHT_RATIOS.length) | 0];
      h = GROUND_HEIGHT * ratio;
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
    }

    obstacles.push({ kind, baseX: x, x, baseY, y: baseY, w, h, moveType, moveAmp, moveSpeed, moveTimer: 0 });
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
  }

  const RESTART_COOLDOWN = 2000; // ms -- avoids an accidental restart from the same tap/key that just lost the run

  function endRun() {
    state = STATE.OVER;
    overSince = performance.now();
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
  }

  let overlayHideTimer = null;
  function showOverlay(title, lines) {
    if (!overlay) return;
    if (overlayHideTimer) { clearTimeout(overlayHideTimer); overlayHideTimer = null; }
    if (overlayTitle) overlayTitle.textContent = title;
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
      }
    }

    // animation timers
    if (player.grounded) {
      player.runTimer += dt;
      if (player.runTimer > 90) { player.runTimer = 0; player.runFrame = (player.runFrame + 1) % SPRITES.run.frames; }
    } else {
      player.jumpTimer += dt;
      if (player.jumpTimer > 55) { player.jumpTimer = 0; player.jumpFrame = Math.min(SPRITES.jump.frames - 1, player.jumpFrame + 1); }
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
    playerBox.w = GROUND_HEIGHT * 0.9; playerBox.h = GROUND_HEIGHT;
    for (const o of obstacles) {
      if (hit(playerBox, o)) { endRun(); break; }
    }
    for (const c of coins) {
      if (!c.taken && hit(playerBox, c)) {
        c.taken = true;
        score += COIN_SCORE;
        popups.push({ x: c.x + c.w / 2, y: c.y, life: 0, dur: 650, text: '+' + COIN_SCORE });
      }
    }
  }

  // ---------- draw ----------
  function drawFrame(sprite, frameIndex, x, y, w, h) {
    const img = sprite.img;
    const fw = img.naturalWidth / sprite.frames;
    ctx.drawImage(img, frameIndex * fw, 0, fw, img.naturalHeight, x, y, w, h);
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

    // The background photo already has its own lighting, floor perspective
    // and depth-of-field blur, so no extra vignette/ground-line overlay is
    // needed here the way the old flat chart-grid backdrop needed one.

    // Soft contact shadows, drawn before any sprite -- a flat cutout with
    // nothing grounding it visually is the other half of why the scene
    // reads flat. Airborne things (a jump, a floating rugged obstacle, a
    // hovering coin) get a smaller, fainter shadow the higher they are.
    const drawGroundShadow = (cx, w, lift) => {
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
    };
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (!c.taken) drawGroundShadow(c.x + c.w / 2, c.w, (GROUND_Y - c.h) - c.y);
    }
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      drawGroundShadow(o.x + o.w / 2, o.w, (GROUND_Y - o.h) - o.y);
    }
    drawGroundShadow(player.x + GROUND_HEIGHT * 0.45, GROUND_HEIGHT * 0.85, (GROUND_Y - GROUND_HEIGHT) - player.y);

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

    // player
    if (player.grounded) {
      drawFrame(SPRITES.run, state === STATE.PLAYING ? player.runFrame : 0, player.x, player.y, GROUND_HEIGHT * (122 / 160), GROUND_HEIGHT);
    } else {
      drawFrame(SPRITES.jump, player.jumpFrame, player.x, player.y, GROUND_HEIGHT * (155 / 160), GROUND_HEIGHT);
    }

    // "+score" popups float up and fade out over their lifetime
    if (popups.length) {
      ctx.save();
      ctx.font = "700 20px 'IBM Plex Mono', monospace";
      ctx.textAlign = 'center';
      ctx.fillStyle = '#8a6a16';
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

  // ---------- input ----------
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.key !== ' ') return;
    if (!assetsReady) return;
    e.preventDefault();
    jump();
  });
  // Tap target is the whole section, not just the canvas -- on a small
  // phone screen the canvas itself is a fiddly target mid-run. Real links
  // or buttons (none currently live inside #game, but stay defensive) are
  // left alone so they still work normally instead of being hijacked.
  const gameSection = document.getElementById('game');
  (gameSection || canvas).addEventListener('pointerdown', (e) => {
    if (!assetsReady) return;
    if (e.target.closest('a, button')) return;
    jump();
  });

  // ---------- boot ----------
  showOverlay('HOOD RUN', ['Loading…']);
  Promise.all(
    Object.entries(SPRITES).map(([key, sprite]) =>
      loadImage(sprite.src).then((img) => { sprite.img = img; })
    )
  ).then(() => {
    assetsReady = true;
    state = STATE.IDLE;
    showOverlay('HOOD RUN', ['PRESS SPACE TO START']);
    ensureLoopRunning(); // one draw of the idle screen, then the loop parks itself
  }).catch((err) => {
    console.error('Hood Runner: asset load failed', err);
    showOverlay('HOOD RUN', ['Could not load — try refreshing.']);
  });
}
