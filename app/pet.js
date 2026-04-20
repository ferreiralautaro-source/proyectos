// ═══════════════════════════════════════════════════════
//  PETPALS  –  pet.js
// ═══════════════════════════════════════════════════════

const petEl    = document.getElementById('pet');
const bubbleEl = document.getElementById('bubble');

// ── Pet identity ────────────────────────────────
let petType  = 'emoji';
let petValue = '🐱';
let petName  = 'Mascota';
let petId    = 'cat_basic';

// ── Screen & window coords ──────────────────────
const WIN = 160;
let screenW = 1920, screenH = 1080;
let winX = 0, winY = 0;

// ── Physics constants ───────────────────────────
const GRAVITY   = 0.58;
const WALK_SPD  = 2.2;
const CLIMB_SPD = 1.8;
const BOUNCE    = 0.15;
const MAX_VEL   = 24;

// ── Physics state ───────────────────────────────
let velX = 0, velY = 0;
let onGround = false;
let wallSide = null;   // null | 'left' | 'right'
let climbDir = 1;      // 1=up, -1=down

// ── Behaviour state ─────────────────────────────
let state      = 'fall';
let stateTimer = 0;
let facing     = 1;
let followMode = false;
let specialCooldown = 0;

const STATE_DUR = {
  walk:  () => 2000 + Math.random() * 3500,
  idle:  () => 1500 + Math.random() * 2200,
  sleep: () => 4000 + Math.random() * 5000,
  climb: () => 1800 + Math.random() * 2500,
};

const SPECIALS = {
  ghost_pixel:  ghostBehavior,
  ninja_pixel:  ninjaBehavior,
  dragon_pixel: dragonBehavior,
  cat_witch:    witchBehavior,
  robot_pet:    robotBehavior,
};

// ── Drag sampling ───────────────────────────────
const SAMPLES = 6;
let velBuffer      = [];
let dragging       = false;
let dragAnchorScrX = 0, dragAnchorScrY = 0;
let dragAnchorWinX = 0, dragAnchorWinY = 0;

// ── Phrases ─────────────────────────────────────
const PH = {
  idle:   ['(=^ω^=)', '...', '♪♫', '¡Hola!', '(・ω・)'],
  sleep:  ['zzZzZ', '💤', '(-.-)Zzz', 'mmm...'],
  climb:  ['¡Weee!', '↑↑↑', '¡Yo puedo!', '¡Soy Spiderman!'],
  walk:   ['*sniff*', '¿Qué hay aquí?', '(=ↀωↀ=)', '...'],
  thrown: ['¡¡AHHH!!', '😱', 'Wooosh~', '¡Vueloooo!'],
  drag:   ['¡Sostenme!', 'Eeeeh~', '(*´▽｀*)', '¡Cuidado!'],
};

// ── Init ─────────────────────────────────────────
let lastTime = performance.now();

async function init() {
  const b = await window.api.getScreenBounds();
  screenW = b.width;
  screenH = b.height;

  const p = await window.api.getWinPosition();
  winX = p.x;
  winY = p.y;

  window.api.onInit(data => {
    petType  = data.type  || 'emoji';
    petValue = data.value || '🐱';
    petName  = data.name  || 'Mascota';
    petId    = data.id    || 'cat_basic';
    applyVisual();
  });

  // Commands relayed from the floating ctx menu window
  window.api.onCtxCommand(cmd => handleCtxCommand(cmd));

  changeState('fall');
  requestAnimationFrame(loop);
}

function applyVisual() {
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
}

// ── Context menu commands ────────────────────────
function handleCtxCommand(cmd) {
  switch (cmd) {
    case 'follow':
      followMode = !followMode;
      if (!followMode) { state = 'fall'; onGround = false; }
      break;
    case 'clone':
      window.api.spawnClone({ type: petType, value: petValue, name: petName, id: petId });
      showBubble('✨ ¡Me copié!');
      break;
    case 'new':
      window.api.openLauncher();
      break;
    case 'dismiss':
      window.api.dismissPet();
      break;
    case 'dismiss-all':
      window.api.dismissAll();
      break;
  }
}

// ── State machine ────────────────────────────────
function changeState(s) {
  state = s;
  stateTimer = STATE_DUR[s] ? STATE_DUR[s]() : 99999;
  petEl.classList.toggle('sleeping', s === 'sleep');

  if (s === 'walk') {
    facing   = Math.random() < 0.5 ? 1 : -1;
    velX     = facing * WALK_SPD;
    velY     = 0;
    wallSide = null;
  }
  if (s === 'idle' || s === 'sleep') {
    velX = 0; velY = 0;
  }
  if (s === 'climb') {
    velX     = 0;
    climbDir = (winY < 80) ? -1 : 1;
    velY     = -climbDir * CLIMB_SPD;
  }
}

function stateLabel(s) {
  return { fall:'cayendo', walk:'caminando', idle:'descansando',
           sleep:'durmiendo', climb:'escalando', thrown:'¡volando!',
           follow:'siguiendo cursor' }[s] || s;
}

function pickNext() {
  if (!onGround) return;

  specialCooldown--;
  if (specialCooldown <= 0 && SPECIALS[petId] && Math.random() < 0.18) {
    specialCooldown = 10;
    SPECIALS[petId]();
    return;
  }

  if (wallSide && Math.random() < 0.35) { changeState('climb'); return; }

  const r = Math.random();
  if      (r < 0.55) changeState('walk');
  else if (r < 0.80) changeState('idle');
  else               changeState('sleep');
}

// ── Special behaviors ───────────────────────────
function ghostBehavior() {
  showBubble('👻 Boo!');
  petEl.style.transition = 'opacity 0.5s';
  petEl.style.opacity = '0';
  setTimeout(() => {
    winX = 50 + Math.random() * (screenW - WIN - 100);
    winY = 50 + Math.random() * (screenH - WIN - 100);
    window.api.moveWindow(winX, winY);
    petEl.style.opacity = '1';
    petEl.style.transition = '';
    changeState('idle');
  }, 600);
}
function ninjaBehavior() {
  showBubble('🥷 ¡Shuriken!');
  velX = facing * 18; velY = -7;
  state = 'thrown'; onGround = false;
}
function dragonBehavior() {
  showBubble('🔥 ¡Fuego!');
  velY = -12; velX = facing * 4;
  state = 'thrown'; onGround = false;
}
function witchBehavior() {
  showBubble('✨ ¡Abracadabra!');
  velY = -15; velX = facing * 3;
  state = 'thrown'; onGround = false;
}
function robotBehavior() {
  const now = new Date();
  showBubble(`🤖 ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`, 3000);
  changeState('idle');
}

// ── Main loop ────────────────────────────────────
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
      velX *= 0.994;
      break;

    case 'walk':
      velY += GRAVITY;
      velX = facing * WALK_SPD;
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

    case 'climb': {
      // Pin to wall, suppress gravity
      velX = (wallSide === 'right') ? 1 : -1;
      velY = -climbDir * CLIMB_SPD;

      if (winY <= 4) {
        // Reached top → jump off
        velX = (wallSide === 'right' ? -1 : 1) * 6;
        velY = -10;
        wallSide = null;
        changeState('thrown');
        break;
      }
      if (onGround && climbDir === -1) {
        // Climbed back down, landed
        wallSide = null;
        pickNext();
        break;
      }
      if (stateTimer <= 0) {
        if (climbDir === 1) {
          // Reverse: go back down
          climbDir = -1;
          velY = CLIMB_SPD;
          stateTimer = STATE_DUR.climb();
        } else {
          wallSide = null;
          pickNext();
        }
      }
      break;
    }
  }

  winX += velX;
  winY += velY;
  resolveCollisions();
  window.api.moveWindow(winX, winY);
  renderVisual();
}

// ── Collision resolution ─────────────────────────
function resolveCollisions() {
  const maxX = screenW - WIN;
  const maxY = screenH - WIN;

  // Floor
  if (winY >= maxY) {
    winY = maxY;
    const wasAirborne = !onGround;
    onGround = true;
    if (velY > 3) velY = -velY * BOUNCE;
    else          velY = 0;
    if (wasAirborne && state !== 'climb') {
      if (winX > 2 && winX < maxX - 2) wallSide = null;
      pickNext();
    }
  } else {
    onGround = false;
  }

  // Ceiling
  if (winY < 0) { winY = 0; if (velY < 0) velY = 0; }

  // Right wall
  if (winX >= maxX) {
    winX = maxX;
    if (velX > 0) velX = 0;
    if (state !== 'climb') {
      wallSide = 'right';
      facing   = -1;
      if (Math.random() < 0.65) changeState('climb');
      else { velX = -WALK_SPD; wallSide = null; if (onGround) changeState('walk'); }
    }
  } else if (wallSide === 'right' && winX < maxX - 8 && state !== 'climb') {
    wallSide = null;
  }

  // Left wall
  if (winX <= 0) {
    winX = 0;
    if (velX < 0) velX = 0;
    if (state !== 'climb') {
      wallSide = 'left';
      facing   = 1;
      if (Math.random() < 0.65) changeState('climb');
      else { velX = WALK_SPD; wallSide = null; if (onGround) changeState('walk'); }
    }
  } else if (wallSide === 'left' && winX > 8 && state !== 'climb') {
    wallSide = null;
  }
}

// ── Render ───────────────────────────────────────
function renderVisual() {
  let sx = facing >= 0 ? 1 : -1;
  if (state === 'climb') sx = wallSide === 'right' ? -1 : 1;

  let rot = 0;
  if (state === 'thrown') rot = Math.max(-55, Math.min(55, velX * 4));
  if (state === 'climb')  rot = (climbDir === 1 ? -15 : 15) * (wallSide === 'right' ? 1 : -1);

  petEl.style.transform = `scaleX(${sx}) rotate(${rot}deg)`;
}

// ── Drag ─────────────────────────────────────────
petEl.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  e.stopPropagation();
  dragging = true;
  petEl.classList.add('dragging');
  window.api.setIgnoreMouse(false);
  dragAnchorScrX = e.screenX;
  dragAnchorScrY = e.screenY;
  dragAnchorWinX = winX;
  dragAnchorWinY = winY;
  velBuffer = [];
  velX = 0; velY = 0;
  showBubble(rand(PH.drag));
});

window.addEventListener('mousemove', e => {
  if (dragging) {
    velBuffer.push({ x: e.screenX, y: e.screenY, t: performance.now() });
    if (velBuffer.length > SAMPLES) velBuffer.shift();
    winX = Math.max(0, Math.min(screenW - WIN, dragAnchorWinX + (e.screenX - dragAnchorScrX)));
    winY = Math.max(0, Math.min(screenH - WIN, dragAnchorWinY + (e.screenY - dragAnchorScrY)));
    window.api.moveWindow(winX, winY);
  }
  if (followMode) {
    const tx = e.screenX - WIN / 2;
    const ty = e.screenY - WIN / 2;
    winX += (tx - winX) * 0.16;
    winY += (ty - winY) * 0.16;
    window.api.moveWindow(winX, winY);
    if (Math.abs(e.movementX) > 0.5) facing = e.movementX > 0 ? 1 : -1;
    renderVisual();
  }
});

window.addEventListener('mouseup', () => {
  if (!dragging) return;
  dragging = false;
  petEl.classList.remove('dragging');

  if (velBuffer.length >= 2) {
    const a = velBuffer[0], b = velBuffer[velBuffer.length - 1];
    const dt = Math.max(b.t - a.t, 1);
    velX = ((b.x - a.x) / dt) * 16 * 0.65;
    velY = ((b.y - a.y) / dt) * 16 * 0.65;
  } else {
    velX = 0; velY = 0;
  }

  velX = Math.max(-MAX_VEL, Math.min(MAX_VEL, velX));
  velY = Math.max(-MAX_VEL, Math.min(MAX_VEL, velY));
  onGround = false; wallSide = null;
  const speed = Math.sqrt(velX * velX + velY * velY);
  state = speed > 2 ? 'thrown' : 'fall';
  if (speed > 4) { facing = velX >= 0 ? 1 : -1; showBubble(rand(PH.thrown)); }
  window.api.setIgnoreMouse(true);
});

// ── Hover ────────────────────────────────────────
petEl.addEventListener('mouseenter', () => window.api.setIgnoreMouse(false));
petEl.addEventListener('mouseleave', () => { if (!dragging) window.api.setIgnoreMouse(true); });

// ── Double click ─────────────────────────────────
petEl.addEventListener('dblclick', () => {
  if (SPECIALS[petId]) { SPECIALS[petId](); return; }
  velX = (Math.random() - 0.5) * 18; velY = -14;
  state = 'thrown'; onGround = false; wallSide = null;
  facing = velX >= 0 ? 1 : -1;
  showBubble('¡Weee! 🎉');
});

// ── Context menu — opens floating window ─────────
petEl.addEventListener('contextmenu', async e => {
  e.preventDefault();
  window.api.setIgnoreMouse(false);
  const pos = await window.api.getWinPosition();
  window.api.showCtxMenu({
    screenX:    pos.x + e.clientX,
    screenY:    pos.y + e.clientY,
    petName:    petName,
    petState:   stateLabel(state),
    petEmoji:   petType === 'emoji' ? petValue : null,
    petImg:     petType === 'img'   ? petValue : null,
    followMode: followMode,
  });
});

// ── Bubble ───────────────────────────────────────
let bubbleTimer = null;
function showBubble(text, ms = 2500) {
  clearTimeout(bubbleTimer);
  document.getElementById('bubble-text').textContent = text;
  bubbleEl.classList.add('visible');
  bubbleTimer = setTimeout(() => bubbleEl.classList.remove('visible'), ms);
}

setInterval(() => {
  if (dragging || followMode || Math.random() > 0.3) return;
  showBubble(rand(PH[state] || PH.idle));
}, 9000);

// ── Util ─────────────────────────────────────────
function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

init();