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
  let speed = BASE_SPEED;
  let elapsed = 0;
  let score = 0;
  let best = 0;
  try { best = parseInt(localStorage.getItem('hoodRunnerBest') || '0', 10) || 0; } catch (err) { best = 0; }
  let nextObstacleAt = 0;
  let nextCoinAt = 0;
  let bgScrollX = 0;
  let lastTs = 0;

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

  function spawnObstacle() {
    const isRugged = Math.random() < RUGGED_CHANCE;
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
  }

  function endRun() {
    state = STATE.OVER;
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
    if (state === STATE.OVER) { startRun(); return; }
    if (state !== STATE.PLAYING) return;
    if (!player.grounded) return;
    player.vy = JUMP_VELOCITY;
    player.grounded = false;
    player.jumpFrame = 0;
    player.jumpTimer = 0;
  }

  function showOverlay(title, lines) {
    if (!overlay) return;
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
  }
  function hideOverlay() {
    if (overlay) overlay.hidden = true;
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
    // layers a small bob or side-to-side drift on top for rugged obstacles)
    const dx = speed * dt;
    obstacles.forEach((o) => {
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
    });
    obstacles = obstacles.filter((o) => o.baseX + o.w > -20);

    // move + cull + animate coins
    coins.forEach((c) => {
      c.x -= dx;
      c.timer += dt;
      if (c.timer > 45) { c.timer = 0; c.frame = (c.frame + 1) % SPRITES.coin.frames; }
    });
    coins = coins.filter((c) => c.x + c.w > -20 && !c.taken);

    // float + fade the "+score" popups, then drop the finished ones
    popups.forEach((p) => { p.x -= dx; p.life += dt; });
    popups = popups.filter((p) => p.life < p.dur);

    // background parallax
    bgScrollX -= dx * 0.5;
    const bgW = SPRITES.background.img.naturalWidth;
    if (bgScrollX <= -bgW) bgScrollX += bgW;

    // collisions
    const playerBox = { x: player.x, y: player.y, w: GROUND_HEIGHT * 0.9, h: GROUND_HEIGHT };
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

    // ground line -- dark ink tone so it still reads against the cream backdrop
    ctx.strokeStyle = 'rgba(47,77,43,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y + 1);
    ctx.lineTo(CW, GROUND_Y + 1);
    ctx.stroke();

    // coins
    coins.forEach((c) => { if (!c.taken) drawFrame(SPRITES.coin, c.frame, c.x, c.y, c.w, c.h); });

    // obstacles
    obstacles.forEach((o) => {
      const sprite = SPRITES[o.kind];
      ctx.drawImage(sprite.img, o.x, o.y, o.w, o.h);
    });

    // player
    if (player.grounded) {
      drawFrame(SPRITES.run, state === STATE.PLAYING ? player.runFrame : 0, player.x, player.y, GROUND_HEIGHT * (144 / 160), GROUND_HEIGHT);
    } else {
      drawFrame(SPRITES.jump, player.jumpFrame, player.x, player.y, GROUND_HEIGHT * (157 / 160), GROUND_HEIGHT);
    }

    // "+score" popups float up and fade out over their lifetime
    popups.forEach((p) => {
      const t = p.life / p.dur;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.font = "700 20px 'IBM Plex Mono', monospace";
      ctx.textAlign = 'center';
      ctx.fillStyle = '#8a6a16';
      ctx.fillText(p.text, p.x, p.y - t * 42);
      ctx.restore();
    });

    if (scoreEl) scoreEl.textContent = String(Math.floor(score));
  }

  // ---------- loop ----------
  function loop(ts) {
    if (!lastTs) lastTs = ts;
    const dt = Math.min(48, ts - lastTs); // clamp so a dropped/backgrounded tab doesn't jump-teleport the run
    lastTs = ts;

    if (state === STATE.PLAYING) update(dt);
    if (assetsReady) draw();
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
    requestAnimationFrame(loop);
  }).catch((err) => {
    console.error('Hood Runner: asset load failed', err);
    showOverlay('HOOD RUN', ['Could not load — try refreshing.']);
  });
}
