// ═══════════════════════════════════════════════════════
//  PETPALS  –  app/main.js
// ═══════════════════════════════════════════════════════
const { app, BrowserWindow, screen, ipcMain, shell } = require('electron');
const path  = require('path');
const fs    = require('fs');
const https = require('https');
const http  = require('http');
const crypto = require('crypto');

// ── Config ──────────────────────────────────────
const SERVER_URL = 'https://petpals-server.up.railway.app'; // cambia por tu URL
const STORE_KEY  = 'petpals_license_v1';

let launcherWin = null;
let petWindows  = [];

// ── Helpers ─────────────────────────────────────
function dataDir() {
  const d = path.join(app.getPath('userData'), 'PetPals');
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}

function licensePath() { return path.join(dataDir(), 'license.json'); }
function customPetsDir() {
  const d = path.join(dataDir(), 'custom');
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}

function readLicense() {
  try { return JSON.parse(fs.readFileSync(licensePath(), 'utf8')); }
  catch { return null; }
}

function saveLicense(data) {
  fs.writeFileSync(licensePath(), JSON.stringify(data, null, 2));
}

function apiGet(endpoint) {
  return new Promise((resolve, reject) => {
    const url = SERVER_URL + endpoint;
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { reject(new Error('Parse error')); } });
    }).on('error', reject);
  });
}

function apiPost(endpoint, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const url  = new URL(SERVER_URL + endpoint);
    const mod  = url.protocol === 'https:' ? https : http;
    const req  = mod.request({
      hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch { reject(new Error('Parse error')); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Windows ─────────────────────────────────────
function createLauncher() {
  if (launcherWin) { launcherWin.focus(); return; }
  launcherWin = new BrowserWindow({
    width: 820,
    height: 620,
    minWidth: 820,
    minHeight: 620,
    frame: false,
    resizable: false,
    center: true,
    show: false,
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
    if (petWindows.length === 0 && !launcherWin) createLauncher();
  });
}

app.whenReady().then(createLauncher);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ═══════════════════════════════════════════════
//  IPC HANDLERS
// ═══════════════════════════════════════════════

// ── Launcher / pet lifecycle ────────────────────
ipcMain.on('launch-pet', (_e, data) => {
  if (launcherWin) { launcherWin.hide(); }
  createPetWindow(data);
});

ipcMain.on('close-launcher', () => { launcherWin?.close(); });
ipcMain.on('minimize-launcher', () => { launcherWin?.minimize(); });

ipcMain.on('open-launcher', () => {
  if (launcherWin) launcherWin.show(); else createLauncher();
});

// ── Pet physics ─────────────────────────────────
ipcMain.on('mouse-ignore', (e, v) => {
  BrowserWindow.fromWebContents(e.sender)?.setIgnoreMouseEvents(v, { forward: true });
});
ipcMain.on('move-window', (e, { x, y }) => {
  BrowserWindow.fromWebContents(e.sender)?.setPosition(Math.round(x), Math.round(y));
});
ipcMain.on('spawn-clone', (_e, data) => createPetWindow(data));
ipcMain.on('dismiss-pet', (e) => BrowserWindow.fromWebContents(e.sender)?.close());
ipcMain.on('dismiss-all', () => { [...petWindows].forEach(w => w.close()); });

ipcMain.handle('get-screen-bounds', () => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  return { width, height };
});
ipcMain.handle('get-win-position', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return { x: 0, y: 0 };
  const [x, y] = win.getPosition();
  return { x, y };
});

// ── License ─────────────────────────────────────
ipcMain.handle('read-license', () => readLicense());

ipcMain.handle('verify-license', async (_e, { email, key }) => {
  try {
    const data = await apiGet(`/license/check?email=${encodeURIComponent(email)}&key=${encodeURIComponent(key)}`);
    if (data.valid) saveLicense({ email, key, plan: data.plan, unlocked: data.unlocked, expiresAt: data.expiresAt });
    return data;
  } catch (err) {
    // offline fallback
    const cached = readLicense();
    if (cached?.email === email && cached?.key === key) return { valid: true, ...cached };
    return { valid: false };
  }
});

ipcMain.handle('logout', () => {
  try { fs.unlinkSync(licensePath()); } catch {}
  return true;
});

// ── Catalog ─────────────────────────────────────
ipcMain.handle('get-catalog', async () => {
  try { return await apiGet('/catalog'); }
  catch {
    // fallback catálogo offline mínimo
    return [
      { id: 'cat_basic',  name: 'Gatito',  tier: 'free', price: 0, emoji: '🐱', description: 'El clásico' },
      { id: 'dog_basic',  name: 'Perrito', tier: 'free', price: 0, emoji: '🐶', description: 'Fiel compañero' },
      { id: 'frog_basic', name: 'Ranita',  tier: 'free', price: 0, emoji: '🐸', description: 'Salta y trepa' },
    ];
  }
});

// ── Checkout ────────────────────────────────────
ipcMain.handle('checkout-single', async (_e, { petId, email }) => {
  const data = await apiPost('/checkout/single', { petId, email });
  if (data.url) shell.openExternal(data.url);
  return data;
});

ipcMain.handle('checkout-petpass', async (_e, { interval, email }) => {
  const data = await apiPost('/checkout/petpass', { interval, email });
  if (data.url) shell.openExternal(data.url);
  return data;
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

// ── Custom images ───────────────────────────────
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