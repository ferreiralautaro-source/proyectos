// ═══════════════════════════════════════════════
//  MASCOTA SHIMEJI  –  script.js
// ═══════════════════════════════════════════════

const petEl    = document.getElementById('pet');
const bubbleEl = document.getElementById('bubble');
const ctxMenu  = document.getElementById('ctx-menu');

// ── Pet data (filled on init) ──────────────────
let petType  = 'emoji';  // 'emoji' | 'img'
let petValue = '🐱';
let petName  = 'Mascota';

// ── Physics ────────────────────────────────────
const WIN_SIZE    = 160;
const PET_SIZE    = 100;
const MARGIN      = (WIN_SIZE - PET_SIZE) / 2;   // 30px
const GRAVITY     = 0.6;
const WALK_SPEED  = 2.0;
const CLIMB_SPEED = 1.6;

let screenW = 1920;
let screenH = 1080;
let winX    = 0;
let winY    = 0;
let velX    = 0;
let velY    = 0;

// ── State machine ──────────────────────────────
// states: fall | walk | idle | sleep | climb | thrown | follow
let state      = 'fall';
let stateTimer = 0;
let facing     = 1;      // 1=right -1=left
let onGround   = false;
let wallSide   = null;   // null | 'left' | 'right'
let climbDir   = 1;      // 1=up -1=down
let followMode = false;

// ── Dragging state ─────────────────────────────
let dragging      = false;
let dragStartX    = 0;
let dragStartY    = 0;
let dragWinStartX = 0;
let dragWinStartY = 0;

// We track velocity ourselves using a ring buffer of recent mouse positions
const VEL_SAMPLES = 5;
let velSamples = [];   // [{x,y,t}, ...]

// ── Bubble ─────────────────────────────────────
let bubbleTimer = null;

const PHRASES = {
  idle:   ['(=^ω^=)', 'zzz...', '¡Hola!', '(・ω・)', '♪♫'],
  sleep:  ['zzZzZ...', '💤', '(-.-)Zzz'],
  climb:  ['¡Weee!', '↑↑', '¡Yo puedo!'],
  walk:   ['*sniff*', '...', '(=ↀωↀ=)'],
  thrown: ['¡¡AHHH!!', '😱', '¡Vuela!', 'Wooosh~'],
  drag:   ['¡Sostenme!', 'Eeeh~', '(*´▽｀*)'],
};

// ── Init ───────────────────────────────────────
async function init() {
  const bounds = await window.electronAPI.getScreenBounds();
  screenW = bounds.width;
  screenH = bounds.height;

  const pos = await window.electronAPI.getWinPosition();
  winX = pos.x;
  winY = pos.y;

  window.electronAPI.onInit((data) => {
    petType  = data.type  || 'emoji';
    petValue = data.value || '🐱';
    petName  = data.name  || 'Mascota';
    applyPetVisual();
  });

  changeState('fall');
  velY = 0;
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function applyPetVisual() {
  petEl.innerHTML = '';
  if (petType === 'emoji') {
    petEl.classList.add('is-emoji');
    petEl.textContent = petValue;
  } else {
    petEl.classList.remove('is-emoji');
    const img = document.createElement('img');
    img.src = petValue;
    img.draggable = false;
    petEl.appendChild(img);
  }

  // context menu header
  const preview = document.getElementById('ctx-preview');
  preview.innerHTML = '';
  if (petType === 'emoji') {
    preview.textContent = petValue;
  } else {
    const img = document.createElement('img');
    img.src = petValue;
    preview.appendChild(img);
  }
  document.getElementById('ctx-pet-name').textContent = petName;
}

// ── State transitions ──────────────────────────
const STATE_DUR = {
  walk:  () => 2500 + Math.random() * 3500,
  idle:  () => 1800 + Math.random() * 2500,
  sleep: () => 4000 + Math.random() * 5000,
  climb: () => 1800 + Math.random() * 2500,
};

function changeState(s) {
  state = s;
  stateTimer = STATE_DUR[s] ? STATE_DUR[s]() : 99999;
  petEl.classList.toggle('sleeping', s === 'sleep');

  if (s === 'walk') {
    facing = Math.random() < 0.5 ? 1 : -1;
    velX = facing * WALK_SPEED;
    velY = 0;
    wallSide = null;
  }
  if (s === 'idle' || s === 'sleep') {
    velX = 0;
    velY = 0;
  }
  if (s === 'climb') {
    velX = 0;
    climbDir = Math.random() < 0.5 ? 1 : -1;
  }
}

function pickNext() {
  if (!onGround) return;
  if (wallSide && Math.random() < 0.35) { changeState('climb'); return; }
  const r = Math.random();
  if (r < 0.55) changeState('walk');
  else if (r < 0.80) changeState('idle');
  else changeState('sleep');
}

// ── Physics loop ───────────────────────────────
let lastTime = performance.now();

function loop(now) {
  const delta = Math.min(now - lastTime, 50);
  lastTime = now;

  if (!dragging && !followMode) tick(delta);

  requestAnimationFrame(loop);
}

function tick(delta) {
  stateTimer -= delta;

  switch (state) {
    case 'fall':
      velY += GRAVITY;
      break;

    case 'thrown':
      velY += GRAVITY;
      velX *= 0.995;
      break;

    case 'walk':
      velY += GRAVITY;
      velX = facing * WALK_SPEED;
      if (stateTimer <= 0) pickNext();
      break;

    case 'idle':
      velY += GRAVITY;
      velX = 0;
      if (stateTimer <= 0) pickNext();
      break;

    case 'sleep':
      velX = 0; velY = 0;
      if (stateTimer <= 0) pickNext();
      break;

    case 'climb':
      velX = 0;
      velY = -climbDir * CLIMB_SPEED;
      if (stateTimer <= 0 || onGround) {
        wallSide = null;
        pickNext();
      }
      // Launch off the top of the wall
      if (winY <= 5 && climbDir === 1) {
        velX = facing * 5;
        velY = -10;
        wallSide = null;
        changeState('thrown');
      }
      break;
  }

  winX += velX;
  winY += velY;
  resolveCollisions();
  applyPosition();
  updateVisual();
}

function resolveCollisions() {
  const maxX = screenW - WIN_SIZE;
  const maxY = screenH - WIN_SIZE;

  // Floor
  if (winY >= maxY) {
    winY = maxY;
    if (velY > 0) {
      // Bounce a tiny bit then land
      if (velY > 8) velY = -velY * 0.25; else velY = 0;
    }
    if (!onGround) {
      onGround = true;
      wallSide = null;
      pickNext();
    }
    onGround = true;
  } else {
    onGround = false;
  }

  // Ceiling
  if (winY < 0) { winY = 0; if (velY < 0) velY = 0; }

  // Right wall
  if (winX >= maxX) {
    winX = maxX;
    if (velX > 0) velX = 0;
    if (state === 'walk' && wallSide !== 'right') {
      wallSide = 'right';
      facing = -1;
      changeState('climb');
    }
  }
  // Left wall
  if (winX <= 0) {
    winX = 0;
    if (velX < 0) velX = 0;
    if (state === 'walk' && wallSide !== 'left') {
      wallSide = 'left';
      facing = 1;
      changeState('climb');
    }
  }
}

function applyPosition() {
  window.electronAPI.moveWindow(winX, winY);
}

function updateVisual() {
  let sx = facing >= 0 ? 1 : -1;
  if (wallSide === 'right') sx = -1;
  if (wallSide === 'left')  sx =  1;

  let rot = 0;
  if (state === 'thrown') rot = Math.max(-45, Math.min(45, velX * 5));
  if (state === 'climb')  rot = (climbDir > 0 ? -20 : 20) * (wallSide === 'right' ? 1 : -1);

  petEl.style.transform = `scaleX(${sx}) rotate(${rot}deg)`;
}

// ── Dragging ───────────────────────────────────
petEl.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  e.stopPropagation();

  dragging = true;
  petEl.classList.add('dragging');
  window.electronAPI.setIgnoreMouse(false);

  dragStartX    = e.screenX;
  dragStartY    = e.screenY;
  dragWinStartX = winX;
  dragWinStartY = winY;

  velSamples = [];
  velX = 0; velY = 0;

  showBubble(rand(PHRASES.drag));
});

window.addEventListener('mousemove', (e) => {
  if (!dragging && !followMode) return;

  if (dragging) {
    // Track velocity with timestamps
    const now = performance.now();
    velSamples.push({ x: e.screenX, y: e.screenY, t: now });
    if (velSamples.length > VEL_SAMPLES) velSamples.shift();

    // Move window relative to drag start
    winX = dragWinStartX + (e.screenX - dragStartX);
    winY = dragWinStartY + (e.screenY - dragStartY);

    // Clamp to screen
    winX = Math.max(0, Math.min(screenW - WIN_SIZE, winX));
    winY = Math.max(0, Math.min(screenH - WIN_SIZE, winY));

    applyPosition();
  }

  if (followMode) {
    const tx = e.screenX - WIN_SIZE / 2;
    const ty = e.screenY - WIN_SIZE / 2;
    winX += (tx - winX) * 0.18;
    winY += (ty - winY) * 0.18;
    applyPosition();
    facing = e.movementX >= 0 ? 1 : -1;
    updateVisual();
  }
});

window.addEventListener('mouseup', (e) => {
  if (!dragging) return;

  dragging = false;
  petEl.classList.remove('dragging');

  // Calculate throw velocity from recent samples
  if (velSamples.length >= 2) {
    const oldest = velSamples[0];
    const newest = velSamples[velSamples.length - 1];
    const dt = (newest.t - oldest.t) || 1;
    // pixels per millisecond → scale to per-frame units (~16ms)
    velX = ((newest.x - oldest.x) / dt) * 16 * 0.7;
    velY = ((newest.y - oldest.y) / dt) * 16 * 0.7;
  } else {
    velX = 0;
    velY = 0;
  }

  // Clamp throw velocity to reasonable range
  const maxV = 22;
  velX = Math.max(-maxV, Math.min(maxV, velX));
  velY = Math.max(-maxV, Math.min(maxV, velY));

  onGround = false;
  wallSide = null;
  state = (Math.abs(velX) > 3 || Math.abs(velY) > 3) ? 'thrown' : 'fall';

  if (state === 'thrown') {
    showBubble(rand(PHRASES.thrown));
    facing = velX >= 0 ? 1 : -1;
  }

  if (!ctxMenu.classList.contains('visible')) {
    window.electronAPI.setIgnoreMouse(true);
  }
});

// ── Hover ──────────────────────────────────────
petEl.addEventListener('mouseenter', () => {
  window.electronAPI.setIgnoreMouse(false);
});
petEl.addEventListener('mouseleave', () => {
  if (!dragging && !ctxMenu.classList.contains('visible')) {
    window.electronAPI.setIgnoreMouse(true);
  }
});

// ── Double-click excitement ────────────────────
petEl.addEventListener('dblclick', () => {
  velX = (Math.random() - 0.5) * 16;
  velY = -12;
  state = 'thrown';
  onGround = false;
  wallSide = null;
  facing = velX >= 0 ? 1 : -1;
  showBubble('¡Weee! 🎉');
});

// ── Context menu ───────────────────────────────
petEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  ctxMenu.style.left = e.clientX + 'px';
  ctxMenu.style.top  = Math.max(0, e.clientY - ctxMenu.offsetHeight - 8) + 'px';
  ctxMenu.classList.add('visible');
  window.electronAPI.setIgnoreMouse(false);
});

document.addEventListener('click', () => {
  ctxMenu.classList.remove('visible');
  if (!dragging) window.electronAPI.setIgnoreMouse(true);
});
ctxMenu.addEventListener('click', e => e.stopPropagation());

document.getElementById('ctx-follow').addEventListener('click', () => {
  followMode = !followMode;
  document.getElementById('ctx-follow').textContent =
    followMode ? '🖱️ Dejar de seguir' : '🖱️ Seguir cursor';
  if (!followMode) { state = 'fall'; onGround = false; }
  ctxMenu.classList.remove('visible');
  window.electronAPI.setIgnoreMouse(true);
});

document.getElementById('ctx-clone').addEventListener('click', () => {
  window.electronAPI.spawnClone({ type: petType, value: petValue, name: petName });
  showBubble('✨ ¡Me copié!');
  ctxMenu.classList.remove('visible');
});

document.getElementById('ctx-new').addEventListener('click', () => {
  window.electronAPI.openLauncher();
  ctxMenu.classList.remove('visible');
});

document.getElementById('ctx-dismiss').addEventListener('click', () => {
  window.electronAPI.dismissPet();
});

document.getElementById('ctx-dismiss-all').addEventListener('click', () => {
  window.electronAPI.dismissAll();
});

// ── Speech bubble ──────────────────────────────
function showBubble(text, ms = 2500) {
  clearTimeout(bubbleTimer);
  bubbleEl.textContent = text;
  bubbleEl.classList.add('visible');
  bubbleTimer = setTimeout(() => bubbleEl.classList.remove('visible'), ms);
}

setInterval(() => {
  if (dragging || followMode || Math.random() > 0.3) return;
  showBubble(rand(PHRASES[state] || PHRASES.idle));
}, 7000);

// ── Util ───────────────────────────────────────
function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ── Boot ───────────────────────────────────────
init();