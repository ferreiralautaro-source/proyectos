const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Lifecycle
  launchPet:       (d) => ipcRenderer.send('launch-pet', d),
  closeLauncher:   ()  => ipcRenderer.send('close-launcher'),
  minimizeLauncher:()  => ipcRenderer.send('minimize-launcher'),
  openLauncher:    ()  => ipcRenderer.send('open-launcher'),

  // Pet physics
  setIgnoreMouse:  (v)    => ipcRenderer.send('mouse-ignore', v),
  moveWindow:      (x, y) => ipcRenderer.send('move-window', { x, y }),
  spawnClone:      (d)    => ipcRenderer.send('spawn-clone', d),
  dismissPet:      ()     => ipcRenderer.send('dismiss-pet'),
  dismissAll:      ()     => ipcRenderer.send('dismiss-all'),
  getScreenBounds: ()     => ipcRenderer.invoke('get-screen-bounds'),
  getWinPosition:  ()     => ipcRenderer.invoke('get-win-position'),
  onInit:          (cb)   => ipcRenderer.on('init-pet', (_e, d) => cb(d)),

  // Context menu (floating window)
  showCtxMenu:     (d)    => ipcRenderer.send('show-ctx-menu', d),
  closeCtxMenu:    ()     => ipcRenderer.send('close-ctx-menu'),
  ctxCmd:          (d)    => ipcRenderer.send('ctx-cmd', d),
  onCtxInit:       (cb)   => ipcRenderer.on('ctx-init', (_e, d) => cb(d)),
  onCtxCommand:    (cb)   => ipcRenderer.on('ctx-command', (_e, d) => cb(d)),

  // License
  readLicense:     ()     => ipcRenderer.invoke('read-license'),
  verifyLicense:   (d)    => ipcRenderer.invoke('verify-license', d),
  logout:          ()     => ipcRenderer.invoke('logout'),

  // Store
  getCatalog:      ()     => ipcRenderer.invoke('get-catalog'),
  checkoutSingle:  (d)    => ipcRenderer.invoke('checkout-single', d),
  checkoutPetpass: (d)    => ipcRenderer.invoke('checkout-petpass', d),
  pollSession:     (d)    => ipcRenderer.invoke('poll-session', d),

  // Custom images
  saveCustomImage: (d)    => ipcRenderer.invoke('save-custom-image', d),
  listCustomImages:()     => ipcRenderer.invoke('list-custom-images'),
});