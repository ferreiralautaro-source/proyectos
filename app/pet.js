// ═══════════════════════════════════════════════════════
//  PETPALS  –  pet.js  (física + comportamientos)
// ═══════════════════════════════════════════════════════

const petEl    = document.getElementById('pet');
const bubbleEl = document.getElementById('bubble');
const ctxMenu  = document.getElementById('ctx-menu');

// ── Pet identity ────────────────────────────────
let petType  = 'emoji';
let petValue = '🐱';
let petName  = 'Mascota';
let petId    = 'cat_basic';

// ── Screen & window coords ──────────────────────
const WIN = 160;
let screenW = 1920, screenH = 1080;
let winX = 0, winY = 0;

// ── Physics ─────────────────────────────────────
const GRAVITY    = 0.58;
const WALK_SPD   = 2.2;
const CLIMB_SPD  = 1.5;
const BOUNCE     = 0.18;
const MAX_VEL    = 24;

let velX = 0, velY = 0;
let onGround = false;
let wallSide = null;   // null | 'left' | 'right'
let climbDir = 1;

// ── State machine ───────────────────────────────
// states: fall | walk | idle | sleep | climb | thrown | follow | special
let state      = 'fall';
let stateTimer = 0;
let facing     = 1;
let followMode = false;
let specialCooldown = 0;

const STATE_DUR = {
  walk:  () => 2200 + Math.random() * 3800,
  idle:  () => 1600 + Math.random() * 2400,
  sleep: () => 4000 + Math.random() * 6000,
  climb: () => 1500 + Math.random() * 2500,
};

// ── Special behaviors per pet ───────────────────
const SPECIALS = {
  ghost_pixel:  ghostBehavior,
  ninja_pixel:  ninjaBehavior,
  dragon_pixel: dragonBehavior,
  cat_witch:    witchBehavior,
  robot_pet:    robotBehavior,
};

// ── Drag velocity sampling ──────────────────────
const SAMPLES   = 6;
let velBuffer   = [];
let dragging    = false;
let dragAnchorScreenX = 0;
let dragAnchorScreenY = 0;
let dragAnchorWinX    = 0;
let dragAnchorWinY    = 0;

// ── Phrases ─────────────────────────────────────
const PH = {
  idle:   ['(=^ω^=)', '...', '♪♫', '¡Hola!', '(・ω・)'],
  sleep:  ['zzZzZ', '💤', '(-.-)Zzz', 'mmm...'],
  climb:  ['¡Weee!', '↑↑↑', '¡Yo puedo!'],
  walk:   ['*sniff*', '¿Qué hay aquí?', '(=ↀωↀ=)'],
  thrown: ['¡¡AHHH!!', '😱', 'Wooosh~', '¡Vueloooo!'],
  drag:   ['¡Sostenme!', 'Eeeeh~', '(*´▽｀*)'],
};

// ── Init ─────────────────────────────────────────
let lastTime = performance.now();

async function init() {
  const b = await window.api.getScreenBounds();
  screenW = b.width; screenH = b.height;
  const p = await window.api.getWinPosition();
  winX = p.x; winY = p.y;

  window.api.onInit(data => {
    petType  = data.type  || 'emoji';
    petValue = data.value || '🐱';
    petName  = data.name  || 'Mascota';
    petId    = data.id    || 'cat_basic';
    applyVisual();
  });

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
    img.src = petValue; img.draggable = false;
    petEl.appendChild(img);
  }
  // ctx menu
  const cv = document.getElementById('ctx-visual');
  cv.innerHTML = '';
  if (petType === 'emoji') cv.textContent = petValue;
  else { const i = document.createElement('img'); i.src = petValue; cv.appendChild(i); }
  document.getElementById('ctx-name').textContent = petName;
}

// ── State ────────────────────────────────────────
function changeState(s) {
  state = s;
  stateTimer = STATE_DUR[s] ? STATE_DUR[s]() : 99999;
  petEl.classList.toggle('sleeping', s === 'sleep');
  document.getElementById('ctx-state').textContent = stateLabel(s);

  if (s === 'walk')  { facing = Math.random() < 0.5 ? 1 : -1; velX = facing * WALK_SPD; velY = 0; wallSide = null; }
  if (s === 'idle' || s === 'sleep') { velX = 0; velY = 0; }
  if (s === 'climb') { velX = 0; climbDir = Math.random() < 0.5 ? 1 : -1; }
}

function stateLabel(s) {
  return { fall:'cayendo', walk:'caminando', idle:'descansando', sleep:'durmiendo',
           climb:'escalando', thrown:'¡volando!', follow:'siguiendo cursor', special:'¡especial!' }[s] || s;
}

function pickNext() {
  if (!onGround) return;

  // occasionally trigger special behavior
  specialCooldown--;
  if (specialCooldown <= 0 && SPECIALS[petId] && Math.random() < 0.2) {
    specialCooldown = 8;
    SPECIALS[petId]();
    return;
  }

  if (wallSide && Math.random() < 0.3) { changeState('climb'); return; }
  const r = Math.random();
  if (r < 0.55) changeState('walk');
  else if (r < 0.80) changeState('idle');
  else changeState('sleep');
}

// ── Special behaviors ───────────────────────────
function ghostBehavior() {
  // Ghost: fades and teleports to random spot
  showBubble('👻 Boo!');
  petEl.style.transition = 'opacity 0.5s';
  petEl.style.opacity = '0';
  setTimeout(() => {
    winX = Math.random() * (screenW - WIN);
    winY = Math.random() * (screenH - WIN);
    window.api.moveWindow(winX, winY);
    petEl.style.opacity = '1';
    changeState('idle');
  }, 600);
}

function ninjaBehavior() {
  // Ninja: dashes horizontally at high speed
  showBubble('🥷 ¡Shuriken!');
  velX = facing * 18;
  velY = -6;
  state = 'thrown';
  onGround = false;
}

function dragonBehavior() {
  showBubble('🔥 ¡Fuego!');
  changeState('idle');
}

function witchBehavior() {
  showBubble('✨ ¡Abracadabra!');
  // Quick vertical jump
  velY = -14;
  velX = facing * 3;
  state = 'thrown';
  onGround = false;
}

function robotBehavior() {
  const now = new Date();
  showBubble(`🤖 ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`, 3000);
  changeState('idle');
}

// ── Loop ────────────────────────────────────────
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
      velX *= 0.993;
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
    case 'climb':
      velX = 0;
      velY = -climbDir * CLIMB_SPD;
      if (stateTimer <= 0 || onGround) { wallSide = null; pickNext(); }
      if (winY <= 4 && climbDir === 1) { // launch off top of wall
        velX = facing * 6; velY = -11;
        wallSide = null; state = 'thrown';
      }
      break;
  }

  winX += velX;
  winY += velY;
  collide();
  window.api.moveWindow(winX, winY);
  render();
}

function collide() {
  const maxX = screenW - WIN;
  const maxY = screenH - WIN;

  if (winY >= maxY) {
    winY = maxY;
    if (velY > 2) velY = -velY * BOUNCE; else velY = 0;
    if (!onGround) { onGround = true; wallSide = null; pickNext(); }
    onGround = true;
  } else { onGround = false; }

  if (winY < 0) { winY = 0; if (velY < 0) velY = 0; }

  if (winX >= maxX) {
    winX = maxX; if (velX > 0) velX = 0;
    if (state === 'walk' && wallSide !== 'right') { wallSide = 'right'; facing = -1; changeState('climb'); }
    else if (state === 'thrown') { velX = -Math.abs(velX) * 0.4; }
  }
  if (winX <= 0) {
    winX = 0; if (velX < 0) velX = 0;
    if (state === 'walk' && wallSide !== 'left') { wallSide = 'left'; facing = 1; changeState('climb'); }
    else if (state === 'thrown') { velX = Math.abs(velX) * 0.4; }
  }
}

function render() {
  let sx = facing >= 0 ? 1 : -1;
  if (wallSide === 'right') sx = -1;
  if (wallSide === 'left')  sx =  1;

  let rot = 0;
  if (state === 'thrown') rot = Math.max(-50, Math.min(50, velX * 4.5));
  if (state === 'climb')  rot = climbDir > 0 ? (wallSide === 'right' ? -20 : 20) : (wallSide === 'right' ? 20 : -20);

  petEl.style.transform = `scaleX(${sx}) rotate(${rot}deg)`;
}

// ── Drag ─────────────────────────────────────────
petEl.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  e.stopPropagation();
  dragging = true;
  petEl.classList.add('dragging');
  window.api.setIgnoreMouse(false);

  dragAnchorScreenX = e.screenX;
  dragAnchorScreenY = e.screenY;
  dragAnchorWinX    = winX;
  dragAnchorWinY    = winY;
  velBuffer = [];
  velX = 0; velY = 0;
  showBubble(rand(PH.drag));
});

window.addEventListener('mousemove', e => {
  if (dragging) {
    velBuffer.push({ x: e.screenX, y: e.screenY, t: performance.now() });
    if (velBuffer.length > SAMPLES) velBuffer.shift();

    winX = Math.max(0, Math.min(screenW - WIN, dragAnchorWinX + (e.screenX - dragAnchorScreenX)));
    winY = Math.max(0, Math.min(screenH - WIN, dragAnchorWinY + (e.screenY - dragAnchorScreenY)));
    window.api.moveWindow(winX, winY);
  }

  if (followMode) {
    const tx = e.screenX - WIN / 2;
    const ty = e.screenY - WIN / 2;
    winX += (tx - winX) * 0.16;
    winY += (ty - winY) * 0.16;
    window.api.moveWindow(winX, winY);
    if (Math.abs(e.movementX) > 0.5) facing = e.movementX > 0 ? 1 : -1;
    render();
  }
});

window.addEventListener('mouseup', () => {
  if (!dragging) return;
  dragging = false;
  petEl.classList.remove('dragging');

  // Compute throw velocity from ring buffer
  if (velBuffer.length >= 2) {
    const a = velBuffer[0], b = velBuffer[velBuffer.length - 1];
    const dt = Math.max(b.t - a.t, 1);
    velX = ((b.x - a.x) / dt) * 16 * 0.65;  // scale to ~per-frame @ 60fps
    velY = ((b.y - a.y) / dt) * 16 * 0.65;
  } else {
    velX = 0; velY = 0;
  }

  velX = Math.max(-MAX_VEL, Math.min(MAX_VEL, velX));
  velY = Math.max(-MAX_VEL, Math.min(MAX_VEL, velY));

  onGround = false; wallSide = null;
  const speed = Math.sqrt(velX*velX + velY*velY);
  state = speed > 2 ? 'thrown' : 'fall';

  if (speed > 4) {
    facing = velX >= 0 ? 1 : -1;
    showBubble(rand(PH.thrown));
  }

  if (!ctxMenu.classList.contains('visible')) window.api.setIgnoreMouse(true);
});

// ── Hover ────────────────────────────────────────
petEl.addEventListener('mouseenter', () => window.api.setIgnoreMouse(false));
petEl.addEventListener('mouseleave', () => {
  if (!dragging && !ctxMenu.classList.contains('visible')) window.api.setIgnoreMouse(true);
});

// ── Double click ─────────────────────────────────
petEl.addEventListener('dblclick', () => {
  if (SPECIALS[petId]) { SPECIALS[petId](); return; }
  velX = (Math.random() - 0.5) * 18; velY = -14;
  state = 'thrown'; onGround = false; wallSide = null;
  facing = velX >= 0 ? 1 : -1;
  showBubble('¡Weee! 🎉');
});

// ── Context menu ─────────────────────────────────
petEl.addEventListener('contextmenu', e => {
  e.preventDefault();
  ctxMenu.style.left = e.clientX + 'px';
  ctxMenu.style.top  = Math.max(0, e.clientY - 170) + 'px';
  ctxMenu.classList.add('visible');
  window.api.setIgnoreMouse(false);
});

document.addEventListener('click', () => {
  ctxMenu.classList.remove('visible');
  if (!dragging) window.api.setIgnoreMouse(true);
});
ctxMenu.addEventListener('click', e => e.stopPropagation());

document.getElementById('ctx-follow').onclick = () => {
  followMode = !followMode;
  document.getElementById('ctx-follow').textContent = followMode ? '🖱️ Dejar de seguir' : '🖱️ Seguir cursor';
  if (!followMode) { state = 'fall'; onGround = false; }
  ctxMenu.classList.remove('visible');
  window.api.setIgnoreMouse(true);
};

document.getElementById('ctx-clone').onclick    = () => { window.api.spawnClone({ type:petType, value:petValue, name:petName, id:petId }); showBubble('✨ ¡Me copié!'); ctxMenu.classList.remove('visible'); };
document.getElementById('ctx-new').onclick      = () => { window.api.openLauncher(); ctxMenu.classList.remove('visible'); };
document.getElementById('ctx-dismiss').onclick  = () => window.api.dismissPet();
document.getElementById('ctx-dismiss-all').onclick = () => window.api.dismissAll();

// ── Bubble ───────────────────────────────────────
let bubbleTimer = null;
function showBubble(text, ms = 2500) {
  clearTimeout(bubbleTimer);
  document.getElementById('bubble-text').textContent = text;
  bubbleEl.classList.add('visible');
  bubbleTimer = setTimeout(() => bubbleEl.classList.remove('visible'), ms);
}

setInterval(() => {
  if (dragging || followMode || Math.random() > 0.28) return;
  showBubble(rand(PH[state] || PH.idle));
}, 8000);

// ── Util ─────────────────────────────────────────
function rand(a) { return a[Math.floor(Math.random() * a.length)]; }

init();