// ============ DEMOLITION — game.js ============
const { Engine, World, Bodies, Body, Composite, Events, Vector } = Matter;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let W, H, DPR;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// ---------- Engine ----------
const engine = Engine.create();
engine.gravity.y = 1.1;
const world = engine.world;

const COLORS = {
  concrete: ['#8a8a8c', '#7c7c7e', '#96968f'],
  brick: '#b23a2e',
  brickDark: '#8f2e24',
  tnt: '#ff5a1f',
  tntStripe: '#ffd23f',
  ball: '#3a3a3e',
  ballHi: '#5c5c60',
  ground: '#232326'
};

let groundY;
let launchX, launchY; // where shots visually originate (viewer position)
let blocks = [];       // {body, type, w, h, alive, origY, z, vz}
let particles = [];
let firedBalls = [];   // all wrecking balls launched this run (for drawing)
let shake = 0;
let ball = null;         // most recent physics ball; non-null gates new taps until it settles
let flight = null;       // visual-only travel animation before ball lands
const BALL_R = 20;
const Z_DRAG = 0.93;
const Z_SCALE = 0.022;
const Z_MAX = 22;

let shotsLeft = 6;
const MAX_SHOTS = 6;
let timeLeft = 30;
let score = 0;
let state = 'idle'; // idle | playing | ended
let timerHandle = null;

function layout() {
  World.clear(world, false);
  Composite.clear(world, false);
  blocks = [];
  particles = [];
  firedBalls = [];
  ball = null;
  flight = null;

  groundY = H - Math.max(40, H * 0.07);
  launchX = W / 2;
  launchY = H * 1.02;

  const ground = Bodies.rectangle(W / 2, groundY + 40, W * 2, 80, { isStatic: true, friction: 1, render: {} });
  ground.label = 'ground';
  World.add(world, ground);

  // Build a structure: base wall + tower, weighted toward right 60% of screen
  const originX = W * 0.52;
  const blockW = Math.max(30, Math.min(46, W * 0.055));
  const blockH = blockW * 0.62;
  const cols = 5;
  const rows = 6;

  const tntSlots = new Set();
  while (tntSlots.size < 3) {
    tntSlots.add(Math.floor(Math.random() * (cols * rows)));
  }

  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = originX + c * (blockW + 2) - (cols * (blockW + 2)) / 2 + blockW / 2;
      const y = groundY - blockH / 2 - r * (blockH + 2);
      const isTnt = tntSlots.has(i);
      const body = Bodies.rectangle(x, y, blockW * 0.96, blockH * 0.96, {
        friction: 0.6,
        frictionAir: 0.001,
        restitution: 0.05,
        density: isTnt ? 0.0015 : 0.002,
      });
      body.label = isTnt ? 'tnt' : 'block';
      World.add(world, body);
      blocks.push({
        body, type: isTnt ? 'tnt' : 'block',
        w: blockW * 0.96, h: blockH * 0.96,
        origY: y, alive: true, exploded: false,
        colorSeed: Math.floor(Math.random() * COLORS.concrete.length),
        z: 0, vz: 0
      });
      i++;
    }
  }
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

// ---------- Input (tap-to-target) ----------
function getPointer(e) {
  const rect = canvas.getBoundingClientRect();
  const t = e.changedTouches ? e.changedTouches[0] : e;
  return { x: t.clientX - rect.left, y: t.clientY - rect.top };
}

function onTap(e) {
  if (state !== 'playing' || ball || flight || shotsLeft <= 0) return;
  const p = getPointer(e);
  // keep the target inside the playable area, roughly where the structure sits
  const tx = Math.max(20, Math.min(W - 20, p.x));
  const ty = Math.max(H * 0.12, Math.min(groundY - 10, p.y));

  flight = {
    sx: launchX, sy: launchY,
    tx, ty,
    t: 0, dur: 16
  };
  shotsLeft--;
  renderBallsRow();
  e.preventDefault();
}

canvas.addEventListener('mousedown', onTap);
canvas.addEventListener('touchstart', onTap, { passive: false });

function landFlight() {
  const { tx, ty } = flight;
  flight = null;
  const newBall = Bodies.circle(tx, ty, BALL_R, {
    friction: 0.5, restitution: 0.15, density: 0.006
  });
  newBall.label = 'wreckball';
  World.add(world, newBall);
  // arrives already moving fast — it just "hit" the structure at this depth
  Body.setVelocity(newBall, { x: (Math.random() - 0.5) * 3, y: 13 });
  Body.setAngularVelocity(newBall, (Math.random() - 0.5) * 0.3);
  addShake(9);
  spawnParticles(tx, ty, '#c9c9c6', 10, 6);
  firedBalls.push(newBall);
  ball = newBall; // gates input until this shot settles

  setTimeout(() => {
    ball = null;
    if (shotsLeft <= 0) checkEndByShots();
  }, 900);
}

// ---------- Explosions & particles ----------
function addShake(mag) { shake = Math.min(shake + mag, 18); }

function spawnParticles(x, y, color, count, power) {
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = (0.5 + Math.random()) * power;
    particles.push({
      x, y,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - power * 0.3,
      life: 1, decay: 0.018 + Math.random() * 0.02,
      size: 2 + Math.random() * 4,
      color
    });
  }
}

function explodeTnt(entry) {
  if (entry.exploded) return;
  entry.exploded = true;
  const pos = entry.body.position;
  addShake(10);
  spawnParticles(pos.x, pos.y, COLORS.tnt, 26, 9);
  spawnParticles(pos.x, pos.y, COLORS.tntStripe, 14, 6);

  const RADIUS = 160;
  blocks.forEach(b => {
    if (!b.alive || b === entry) return;
    const d = dist(b.body.position, pos);
    if (d < RADIUS) {
      const force = (1 - d / RADIUS) * 0.09;
      const dir = Vector.normalise(Vector.sub(b.body.position, pos));
      Body.applyForce(b.body, b.body.position, { x: dir.x * force, y: dir.y * force - force * 0.4 });
      kickZ(b, (1 - d / RADIUS) * (6 + Math.random() * 6));
    }
  });
  killBlock(entry);
  score += 60;
}

// cheap fake depth: nudges a block toward or away from camera, no real z physics
function kickZ(entry, magnitude) {
  entry.vz += (Math.random() * 2 - 1) * magnitude;
}

function killBlock(entry) {
  if (!entry.alive) return;
  entry.alive = false;
  World.remove(world, entry.body);
}

// collision -> chain TNT, dust on hard impacts
Events.on(engine, 'collisionStart', (e) => {
  e.pairs.forEach(pair => {
    const labels = [pair.bodyA.label, pair.bodyB.label];
    const speed = Vector.magnitude(Vector.sub(pair.bodyA.velocity, pair.bodyB.velocity));
    if (speed < 3) return;

    [pair.bodyA, pair.bodyB].forEach(b => {
      if (b.label === 'tnt') {
        const entry = blocks.find(bl => bl.body === b);
        if (entry && speed > 4) explodeTnt(entry);
      }
    });

    if (speed > 5 && labels.includes('block')) {
      const target = pair.bodyA.label === 'block' ? pair.bodyA : pair.bodyB;
      spawnParticles(target.position.x, target.position.y, '#c9c9c6', 5, speed * 0.6);
      addShake(Math.min(speed * 0.25, 5));
      const entry = blocks.find(bl => bl.body === target);
      if (entry) kickZ(entry, Math.min(speed * 0.5, 8));
    }
  });
});

// ---------- Scoring / destroyed check ----------
function updateDestroyed() {
  blocks.forEach(entry => {
    if (!entry.alive) return;
    const b = entry.body;
    const fell = b.position.y > groundY + 60;
    const toppled = Math.abs(entry.origY - b.position.y) > 55 && Math.abs(b.angle) > 0.5;
    if (fell || toppled) {
      killBlock(entry);
      score += 10;
    }
  });
}

function destroyedPct() {
  const total = blocks.length;
  const dead = blocks.filter(b => !b.alive).length;
  return total ? Math.round((dead / total) * 100) : 0;
}

// ---------- HUD ----------
const timeVal = document.getElementById('timeVal');
const timerPill = document.getElementById('timerPill');
const ballsRow = document.getElementById('ballsRow');

function renderBallsRow() {
  ballsRow.innerHTML = '';
  for (let i = 0; i < MAX_SHOTS; i++) {
    const pip = document.createElement('div');
    pip.className = 'ball-pip' + (i < shotsLeft ? '' : ' used');
    ballsRow.appendChild(pip);
  }
}

function tick() {
  if (state !== 'playing') return;
  timeLeft -= 1;
  timeVal.textContent = timeLeft;
  timerPill.classList.toggle('low', timeLeft <= 8);
  if (timeLeft <= 0) endGame();
}

let endScheduled = false;
function checkEndByShots() {
  if (shotsLeft <= 0 && !ball && !flight && state === 'playing' && !endScheduled) {
    endScheduled = true;
    // give physics a moment to settle before ending
    setTimeout(() => { if (state === 'playing') endGame(); }, 1200);
  }
}

// ---------- Game flow ----------
const startOverlay = document.getElementById('startOverlay');
const resultOverlay = document.getElementById('resultOverlay');
const resultPct = document.getElementById('resultPct');
const resultScore = document.getElementById('resultScore');

function startGame() {
  layout();
  shotsLeft = MAX_SHOTS;
  timeLeft = 30;
  score = 0;
  state = 'playing';
  endScheduled = false;
  timeVal.textContent = timeLeft;
  timerPill.classList.remove('low');
  renderBallsRow();
  startOverlay.style.display = 'none';
  resultOverlay.style.display = 'none';
  clearInterval(timerHandle);
  timerHandle = setInterval(tick, 1000);
}

function endGame() {
  state = 'ended';
  clearInterval(timerHandle);
  const pct = destroyedPct();
  const best = Math.max(pct, parseInt(localStorage.getItem('demo_best') || '0', 10));
  localStorage.setItem('demo_best', best);
  resultPct.textContent = pct + '%';
  resultScore.textContent = `DESTROYED · SCORE ${score} · BEST ${best}%`;
  document.getElementById('resultStamp').textContent = pct >= 90 ? 'FULLY CONDEMNED' : pct >= 50 ? 'SITE CLEARED' : 'JOB UNFINISHED';
  setTimeout(() => { resultOverlay.style.display = 'flex'; }, 400);
}

document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('retryBtn').addEventListener('click', startGame);
document.getElementById('shareBtn').addEventListener('click', () => {
  const pct = resultPct.textContent;
  const text = `I just demolished ${pct} of the site in DEMOLITION 🧱💥 Score: ${score}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text);
    const btn = document.getElementById('shareBtn');
    const old = btn.textContent;
    btn.textContent = '✓ COPIED';
    setTimeout(() => btn.textContent = old, 1200);
  }
});

// ---------- Render loop ----------
function drawGround() {
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, groundY, W, H - groundY);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, groundY, W, 4);
}

// depth-sorted so blocks nearer camera (larger z) draw on top
function drawBlocksSorted() {
  const alive = blocks.filter(b => b.alive);
  alive.sort((a, b) => a.z - b.z);
  alive.forEach(entry => {
    entry.vz *= Z_DRAG;
    entry.z += entry.vz * 0.15;
    if (entry.z > Z_MAX) entry.z = Z_MAX;
    if (entry.z < -Z_MAX) entry.z = -Z_MAX;
    drawBlock(entry);
  });
}

function drawBlock(entry) {
  const b = entry.body;
  const scale = 1 + entry.z * Z_SCALE;
  ctx.save();
  ctx.translate(b.position.x, b.position.y);
  ctx.rotate(b.angle);
  ctx.scale(scale, scale);
  const w = entry.w, h = entry.h;
  if (entry.type === 'tnt') {
    ctx.fillStyle = COLORS.tnt;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = COLORS.tntStripe;
    for (let sx = -w / 2; sx < w / 2; sx += 8) {
      ctx.fillRect(sx, -h / 2, 3, h);
    }
    ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
  } else {
    ctx.fillStyle = COLORS.concrete[entry.colorSeed];
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.fillRect(-w / 2, -h / 2, w, h * 0.3);
  }
  ctx.restore();
}

function drawWreckBalls() {
  firedBalls.forEach(b => {
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    const grad = ctx.createRadialGradient(-6, -6, 2, 0, 0, BALL_R);
    grad.addColorStop(0, COLORS.ballHi);
    grad.addColorStop(1, COLORS.ball);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, BALL_R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  });
}

// visual-only ball animating from the viewer toward the tapped point,
// shrinking as it "travels into" the screen before real physics take over
function drawFlight() {
  if (!flight) return;
  flight.t += 1;
  const p = Math.min(flight.t / flight.dur, 1);
  const ease = 1 - Math.pow(1 - p, 2);
  const x = flight.sx + (flight.tx - flight.sx) * ease;
  const y = flight.sy + (flight.ty - flight.sy) * ease - Math.sin(p * Math.PI) * 26;
  const scale = 2.2 - ease * 1.55;
  ctx.save();
  ctx.translate(x, y);
  const grad = ctx.createRadialGradient(-6 * scale, -6 * scale, 2, 0, 0, BALL_R * scale);
  grad.addColorStop(0, COLORS.ballHi);
  grad.addColorStop(1, COLORS.ball);
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(0, 0, BALL_R * scale, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();

  if (flight.t >= flight.dur) landFlight();
}

// cheap perspective cue: floor lines converging toward the structure, so it
// reads as a corridor you're looking straight down rather than a flat side view
function drawTunnel() {
  const vpX = W / 2, vpY = groundY - H * 0.34;
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = -4; i <= 4; i++) {
    if (i === 0) continue;
    const baseX = W / 2 + i * W * 0.16;
    ctx.beginPath();
    ctx.moveTo(baseX, H);
    ctx.lineTo(vpX, vpY);
    ctx.stroke();
  }
}

function drawParticles(dt) {
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.life -= p.decay;
    ctx.globalAlpha = Math.max(p.life, 0);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    ctx.globalAlpha = 1;
  });
}

let lastTime = performance.now();
function render(now) {
  const dt = Math.min((now - lastTime) / 16.67, 2.5);
  lastTime = now;
  if (state === 'playing') Engine.update(engine, 16.67 * dt);

  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    shake *= 0.88;
  } else shake = 0;

  drawGround();
  drawTunnel();
  drawBlocksSorted();
  drawWreckBalls();
  drawFlight();
  drawParticles(dt);

  ctx.restore();

  if (state === 'playing') {
    updateDestroyed();
    checkEndByShots();
  }
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

// ---------- PWA install ----------
let deferredPrompt;
const installBtn = document.getElementById('installBtn');
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.style.display = 'block';
});
installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.style.display = 'none';
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
