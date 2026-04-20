// ═══════════════════════════════════════════════════════
//  PETPALS  –  app/main.js
// ═══════════════════════════════════════════════════════
const { app, BrowserWindow, screen, ipcMain, shell } = require('electron');
const path   = require('path');
const fs     = require('fs');
const https  = require('https');
const http   = require('http');

const SERVER_URL = 'https://petpals-server.up.railway.app'; // ← cambia por tu URL de Railway

let launcherWin = null;
let petWindows  = [];
let ctxWin      = null;

// ════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════
function dataDir() {
  const d = path.join(app.getPath('userData'), 'PetPals');
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}
function licensePath()   { return path.join(dataDir(), 'license.json'); }
function customPetsDir() {
  const d = path.join(dataDir(), 'custom');
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}
function readLicense() {
  try { return JSON.parse(fs.readFileSync(licensePath(), 'utf8')); } catch { return null; }
}
function saveLicense(data) {
  fs.writeFileSync(licensePath(), JSON.stringify(data, null, 2));
}

function apiGet(endpoint) {
  return new Promise((resolve, reject) => {
    const url = SERVER_URL + endpoint;
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { reject(new Error('parse')); } });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function apiPost(endpoint, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const url  = new URL(SERVER_URL + endpoint);
    const mod  = url.protocol === 'https:' ? https : http;
    const req  = mod.request({
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch { reject(new Error('parse')); } });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

// ════════════════════════════════════════════════
//  WINDOWS
// ════════════════════════════════════════════════
function createLauncher() {
  if (launcherWin && !launcherWin.isDestroyed()) { launcherWin.show(); launcherWin.focus(); return; }

  launcherWin = new BrowserWindow({
    width: 820, height: 620,
    minWidth: 820, minHeight: 620,
    frame: false, resizable: false,
    center: true, show: false,
    backgroundColor: '#09090f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      webSecurity: false,
    }
  });
  launcherWin.loadFile(path.join(__dirname, 'launcher.html'));
  launcherWin.once('ready-to-show', () => launcherWin.show());
  launcherWin.on('closed', () => { launcherWin = null; });
}

function createPetWindow(petData) {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const wx = Math.floor(Math.random() * (width  - 160));
  const wy = Math.floor(Math.random() * (height / 3));

  const win = new BrowserWindow({
    width: 160, height: 160,
    x: wx, y: wy,
    frame: false, transparent: true,
    alwaysOnTop: true, hasShadow: false,
    resizable: false, skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      webSecurity: false,
    }
  });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('init-pet', { ...petData, winId: win.id });
  });
  petWindows.push(win);
  win.on('closed', () => {
    petWindows = petWindows.filter(w => w !== win);
    // Reopen launcher if all pets dismissed and it's gone
    if (petWindows.length === 0 && (!launcherWin || launcherWin.isDestroyed())) {
      createLauncher();
    }
  });
}

// ════════════════════════════════════════════════
//  APP EVENTS
// ════════════════════════════════════════════════
app.whenReady().then(createLauncher);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ════════════════════════════════════════════════
//  IPC — LAUNCHER
// ════════════════════════════════════════════════
ipcMain.on('launch-pet', (_e, data) => {
  // Keep launcher open — user can invoke multiple pets or pick another
  createPetWindow(data);
});

ipcMain.on('close-launcher',    () => { launcherWin?.close(); });
ipcMain.on('minimize-launcher', () => { launcherWin?.minimize(); });
ipcMain.on('open-launcher',     () => createLauncher());

// ════════════════════════════════════════════════
//  IPC — PET PHYSICS
// ════════════════════════════════════════════════
ipcMain.on('mouse-ignore', (e, v) => {
  BrowserWindow.fromWebContents(e.sender)?.setIgnoreMouseEvents(v, { forward: true });
});
ipcMain.on('move-window', (e, { x, y }) => {
  BrowserWindow.fromWebContents(e.sender)?.setPosition(Math.round(x), Math.round(y));
});
ipcMain.on('spawn-clone',   (_e, data) => createPetWindow(data));
ipcMain.on('dismiss-pet',   (e)        => BrowserWindow.fromWebContents(e.sender)?.close());
ipcMain.on('dismiss-all',   ()         => { [...petWindows].forEach(w => w.close()); });

ipcMain.handle('get-screen-bounds', () => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  return { width, height };
});
ipcMain.handle('get-win-position', e => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return { x: 0, y: 0 };
  const [x, y] = win.getPosition();
  return { x, y };
});

// ════════════════════════════════════════════════
//  IPC — FLOATING CONTEXT MENU
// ════════════════════════════════════════════════
ipcMain.on('show-ctx-menu', (e, data) => {
  // Close existing ctx menu if open
  if (ctxWin && !ctxWin.isDestroyed()) ctxWin.close();

  const menuW = 210;
  const menuH = 230;
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  // Position above the click, clamped to screen
  const mx = Math.min(Math.max(data.screenX - 10, 0), width  - menuW);
  const my = Math.min(Math.max(data.screenY - menuH - 12, 0), height - menuH);

  ctxWin = new BrowserWindow({
    width: menuW, height: menuH,
    x: mx, y: my,
    frame: false, transparent: true,
    alwaysOnTop: true, hasShadow: false,
    resizable: false, skipTaskbar: true,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    }
  });

  const senderWin = BrowserWindow.fromWebContents(e.sender);
  const senderId  = senderWin ? senderWin.id : null;

  ctxWin.loadFile(path.join(__dirname, 'ctxmenu.html'));
  ctxWin.webContents.once('did-finish-load', () => {
    ctxWin.webContents.send('ctx-init', { ...data, senderId });
  });

  // Auto-close when it loses focus
  ctxWin.once('blur', () => { if (ctxWin && !ctxWin.isDestroyed()) ctxWin.close(); });
  ctxWin.on('closed', () => { ctxWin = null; });
});

ipcMain.on('close-ctx-menu', () => {
  if (ctxWin && !ctxWin.isDestroyed()) ctxWin.close();
});

// ctx menu sends a command → relay it to the originating pet window
ipcMain.on('ctx-cmd', (_e, { cmd, senderId }) => {
  if (ctxWin && !ctxWin.isDestroyed()) ctxWin.close();
  if (!senderId) return;
  const target = BrowserWindow.fromId(senderId);
  if (!target || target.isDestroyed()) return;
  target.webContents.send('ctx-command', cmd);
});

// ════════════════════════════════════════════════
//  IPC — LICENSE
// ════════════════════════════════════════════════
ipcMain.handle('read-license', () => readLicense());

ipcMain.handle('verify-license', async (_e, { email, key }) => {
  try {
    const data = await apiGet(`/license/check?email=${encodeURIComponent(email)}&key=${encodeURIComponent(key)}`);
    if (data.valid) saveLicense({ email, key, plan: data.plan, unlocked: data.unlocked, expiresAt: data.expiresAt });
    return data;
  } catch {
    // Offline fallback: check cached license
    const cached = readLicense();
    if (cached?.email === email && cached?.key === key) return { valid: true, ...cached };
    return { valid: false };
  }
});

ipcMain.handle('logout', () => {
  try { fs.unlinkSync(licensePath()); } catch {}
  return true;
});

// ════════════════════════════════════════════════
//  IPC — CATALOG & STORE
// ════════════════════════════════════════════════
ipcMain.handle('get-catalog', async () => {
  try {
    const serverCatalog = await apiGet('/catalog');
    if (Array.isArray(serverCatalog) && serverCatalog.length > 0) return serverCatalog;
  } catch { /* fall through to local */ }
  // Local fallback — full catalog so the app works without a server
  return [
    { id:'cat_basic',    name:'Gatito',       tier:'free',    price:0,   emoji:'🐱', description:'El clásico infaltable',              behaviors:['walk','idle','sleep'] },
    { id:'dog_basic',    name:'Perrito',       tier:'free',    price:0,   emoji:'🐶', description:'Fiel compañero',                     behaviors:['walk','idle','sleep'] },
    { id:'frog_basic',   name:'Ranita',        tier:'free',    price:0,   emoji:'🐸', description:'Salta y trepa',                      behaviors:['walk','idle','sleep'] },
    { id:'ghost_pixel',  name:'Ghost.exe',     tier:'premium', price:199, emoji:'👻', description:'Aparece y desaparece por la pantalla', behaviors:['float','glitch','haunt'] },
    { id:'dragon_pixel', name:'Dragón Pixel',  tier:'premium', price:199, emoji:'🐲', description:'Lanza fuego al hacer doble clic',     behaviors:['walk','fire','fly'] },
    { id:'ninja_pixel',  name:'Ninja',         tier:'premium', price:199, emoji:'🥷', description:'Se lanza a velocidad extrema',        behaviors:['walk','dash','idle'] },
    { id:'cat_witch',    name:'Gata Bruja',    tier:'premium', price:199, emoji:'🧙‍♀️', description:'Lanza hechizos y salta alto',       behaviors:['walk','spell','broom'] },
    { id:'robot_pet',    name:'RoboMascota',   tier:'premium', price:249, emoji:'🤖', description:'Te muestra la hora y calcula',        behaviors:['walk','compute','scan'] },
    { id:'unicorn_pp',   name:'Unicornio',     tier:'petpass', price:0,   emoji:'🦄', description:'Exclusivo PetPass',                  behaviors:['walk','rainbow','idle'] },
    { id:'alien_pp',     name:'Alien',         tier:'petpass', price:0,   emoji:'👾', description:'Exclusivo PetPass',                  behaviors:['walk','scan','idle'] },
  ];
});

ipcMain.handle('checkout-single', async (_e, { petId, email }) => {
  try {
    const data = await apiPost('/checkout/single', { petId, email });
    if (data.url) shell.openExternal(data.url);
    return data;
  } catch (err) {
    return { error: 'servidor_no_disponible', message: err.message };
  }
});

ipcMain.handle('checkout-petpass', async (_e, { interval, email }) => {
  try {
    const data = await apiPost('/checkout/petpass', { interval, email });
    if (data.url) shell.openExternal(data.url);
    return data;
  } catch (err) {
    return { error: 'servidor_no_disponible', message: err.message };
  }
});

ipcMain.handle('poll-session', async (_e, { sessionId }) => {
  try {
    const data = await apiGet(`/poll/${sessionId}`);
    if (data.ready && data.email && data.key) {
      saveLicense({ email: data.email, key: data.key, plan: data.plan, unlocked: data.unlocked });
    }
    return data;
  } catch { return { ready: false }; }
});

// ════════════════════════════════════════════════
//  IPC — CUSTOM IMAGES
// ════════════════════════════════════════════════
ipcMain.handle('save-custom-image', async (_e, { name, base64, mimeType }) => {
  const ext  = (mimeType.split('/')[1] || 'png').replace('jpeg', 'jpg');
  const safe = name.replace(/[^a-z0-9._-]/gi, '_');
  const file = path.join(customPetsDir(), `${Date.now()}-${safe}.${ext}`);
  fs.writeFileSync(file, Buffer.from(base64, 'base64'));
  return 'file://' + file;
});

ipcMain.handle('list-custom-images', () => {
  const dir = customPetsDir();
  return fs.readdirSync(dir)
    .filter(f => /\.(png|jpe?g|gif|webp)$/i.test(f))
    .map(f => ({ name: f.replace(/^\d+-/, '').replace(/_/g, ' '), src: 'file://' + path.join(dir, f) }));
});