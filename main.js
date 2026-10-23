const { app, BrowserWindow, globalShortcut, ipcMain, shell, screen, clipboard, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const STRINGS = require('./i18n');
const fsp = fs.promises;

// ---- Settings -------------------------------------------------------------
const SHORTCUT = 'Alt+Space';   // on macOS, disable the system Spotlight shortcut to use 'Command+Space'
const WIDTH = 680;
const BAR = 64;
// ---------------------------------------------------------------------------

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

let win, tray;
let index = [];
let usage = {};
let scanning = false;
let scanCount = 0;
let lastH = 0;
let lang = 'en';
let settings = { dynamicBar: false, dynamicBarToken: '' };
let settingsWin;
const iconCache = new Map();
const dataFile = (n) => path.join(app.getPath('userData'), n);
const T = () => STRINGS[lang];

// ---- Language and settings --------------------------------------------------
const saveSettings = () =>
  fsp.writeFile(dataFile('settings.json'), JSON.stringify({ lang, ...settings })).catch(() => {});
async function loadSettings() {
  try {
    const s = JSON.parse(await fsp.readFile(dataFile('settings.json'), 'utf8'));
    if (STRINGS[s.lang]) lang = s.lang;
    if (typeof s.dynamicBar === 'boolean') settings.dynamicBar = s.dynamicBar;
    if (typeof s.dynamicBarToken === 'string') settings.dynamicBarToken = s.dynamicBarToken.slice(0, 200);
  } catch {}
}
function setLang(code) {
  lang = code;
  saveSettings();
  if (tray) tray.setToolTip(T().tooltip);
  if (win) win.webContents.send('lang');
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('lang');
}

// ---- Helpers --------------------------------------------------------------
const norm = (s) =>
  s.toLowerCase().replace(/ı/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const EXT = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic', 'tiff'],
  audio: ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'],
  video: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'wmv'],
  doc: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'rtf', 'csv', 'pages', 'numbers', 'key', 'odt'],
};
function kindOf(ext) {
  for (const k in EXT) if (EXT[k].includes(ext)) return k;
  return 'other';
}

// ---- Indexing -------------------------------------------------------------
async function walk(dir, depth, mode, push) {
  let ents;
  try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '$RECYCLE.BIN') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (isMac && e.name.endsWith('.app')) {
        if (mode === 'apps') push({ name: e.name.slice(0, -4), path: p, kind: 'app' });
        continue;
      }
      if (mode === 'files') push({ name: e.name, path: p, kind: 'folder' });
      if (depth > 0) await walk(p, depth - 1, mode, push);
    } else if (e.isFile()) {
      const ext = path.extname(e.name).slice(1).toLowerCase();
      const base = path.basename(e.name, path.extname(e.name));
      if (mode === 'apps') {
        const ok = (isWin && ext === 'lnk') || (!isWin && !isMac && ext === 'desktop');
        if (ok && !/uninstall|readme|license|help/i.test(base)) push({ name: base, path: p, kind: 'app' });
      } else if (ext === 'lnk' || ext === 'url') {
        push({ name: base, path: p, kind: 'app' });   // desktop / game shortcuts
      } else {
        push({ name: e.name, path: p, kind: kindOf(ext) });
      }
    }
  }
}

// Every app shown in the Start menu, including Microsoft Store apps (Windows only)
async function addStartApps(push) {
  const { execFile } = require('child_process');
  const out = await new Promise((res) => execFile('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', 'Get-StartApps | ConvertTo-Json -Compress'],
    { timeout: 20000, maxBuffer: 16e6, windowsHide: true }, (err, so) => res(err ? '' : so)));
  try {
    let arr = JSON.parse(out);
    if (!Array.isArray(arr)) arr = [arr];
    for (const a of arr) {
      if (a && a.Name && a.AppID) push({ name: a.Name, path: 'shell:AppsFolder\\' + a.AppID, kind: 'app' });
    }
  } catch {}
}

async function scan() {
  if (scanning) return;
  scanning = true;
  scanCount = 0;
  const items = [];
  const seenApps = new Set();
  let last = 0;
  const send = (phase, done = false) => win && win.webContents.send('scan', { phase, count: scanCount, done });
  const push = (it) => {
    if (it.kind === 'app') {
      const k = norm(it.name);
      if (seenApps.has(k)) return;
      seenApps.add(k);
    }
    it._n = norm(it.name);
    items.push(it);
    scanCount++;
    if (Date.now() - last > 100) { last = Date.now(); index = items; send(it.kind === 'app' ? 'apps' : 'files'); }
  };

  const home = os.homedir();
  const appRoots = isWin
    ? [path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft/Windows/Start Menu/Programs'),
       path.join(process.env.APPDATA || '', 'Microsoft/Windows/Start Menu/Programs')]
    : isMac
      ? ['/Applications', '/System/Applications', '/System/Applications/Utilities', path.join(home, 'Applications')]
      : ['/usr/share/applications', path.join(home, '.local/share/applications')];

  const fileRoots = [];
  for (const n of ['desktop', 'documents', 'downloads', 'pictures', 'music', 'videos']) {
    try { fileRoots.push(app.getPath(n)); } catch {}
  }

  for (const r of appRoots) await walk(r, isMac ? 1 : 5, 'apps', push);
  if (isWin) fileRoots.push(path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop'));
  for (const r of [...new Set(fileRoots)]) await walk(r, 4, 'files', push);
  if (isWin) await addStartApps(push);

  index = items;
  scanning = false;
  send('done', true);
  try {
    await fsp.writeFile(dataFile('index.json'), JSON.stringify(items.map(({ _n, ...r }) => r)));
  } catch {}
}

// ---- Search ---------------------------------------------------------------
function score(n, q) {
  if (n === q) return 100;
  if (n.startsWith(q)) return 90;
  if (n.includes(' ' + q) || n.includes('-' + q) || n.includes('_' + q) || n.includes('.' + q)) return 75;
  if (n.includes(q)) return 60;
  if (q.length >= 2) {
    let i = 0, gaps = 0, prev = -1;
    for (const ch of q) {
      const j = n.indexOf(ch, i);
      if (j < 0) return 0;
      if (prev >= 0 && j !== prev + 1) gaps++;
      prev = j; i = j + 1;
    }
    return Math.max(5, 35 - gaps * 4);
  }
  return 0;
}

function tryCalc(q) {
  if (!/^[\d\s+\-*/().,%^x×÷]+$/.test(q)) return null;
  if (!/[+\-*/^x×÷%]/.test(q.replace(/^\s*-/, ''))) return null;
  const e = q.replace(/,/g, '.').replace(/[x×]/g, '*').replace(/÷/g, '/').replace(/\^/g, '**')
    .replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
  try {
    const v = Function('"use strict";return (' + e + ')')();
    if (typeof v === 'number' && isFinite(v)) return +v.toPrecision(12);
  } catch {}
  return null;
}

// [kind, key in strings.groups, max results]
const GROUPS = [
  ['app', 'apps', 5], ['folder', 'folders', 4], ['doc', 'docs', 4],
  ['image', 'images', 3], ['audio', 'audio', 3], ['video', 'videos', 3], ['other', 'other', 3],
];
const subOf = (i) => (i.kind === 'app' ? undefined : path.dirname(i.path));

function search(q) {
  q = q.trim();
  if (!q) return [];
  const t = T();
  const out = [];
  const nq = norm(q);

  const c = tryCalc(q);
  if (c !== null) out.push({ group: t.groups.calc, kind: 'calc', name: '= ' + c, value: c, sub: t.copyHint });

  if (/^(quit|exit|çık|çıkış|cikis)$/.test(nq)) out.push({ group: t.groups.cmd, kind: 'cmd', name: t.cmdQuit, action: 'quit' });
  if (/^(rescan|scan|yeniden tara|tara)$/.test(nq)) out.push({ group: t.groups.cmd, kind: 'cmd', name: t.cmdRescan, action: 'rescan' });

  const scored = [];
  for (const it of index) {
    const s = score(it._n, nq);
    if (s > 0) scored.push([s + (it.kind === 'app' ? 20 : 0) + Math.min(usage[it.path] || 0, 10) * 2, it]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  const top = scored.slice(0, 120).map((x) => x[1]);

  if (top.length && !out.length) {
    const x = top.shift();
    out.push({ group: t.groups.top, top: true, kind: x.kind, name: x.name, path: x.path, sub: subOf(x) });
  }
  for (const [kind, key, limit] of GROUPS) {
    top.filter((i) => i.kind === kind).slice(0, limit)
      .forEach((i) => out.push({ group: t.groups[key], kind: i.kind, name: i.name, path: i.path, sub: subOf(i) }));
  }
  out.push({ group: t.groups.web, kind: 'web', name: t.webSearch.replace('{q}', q), url: 'https://www.google.com/search?q=' + encodeURIComponent(q) });
  return out;
}

// ---- Window ---------------------------------------------------------------
function createWindow() {
  win = new BrowserWindow({
    width: WIDTH, height: BAR, show: false,
    frame: false, resizable: false, movable: false, skipTaskbar: true,
    alwaysOnTop: true, fullscreenable: false, hasShadow: true,
    transparent: !isWin,
    vibrancy: isMac ? 'hud' : undefined,
    visualEffectState: 'active',
    backgroundMaterial: isWin ? 'acrylic' : undefined,
    backgroundColor: isWin ? '#00000000' : undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, 'renderer/index.html'));
  win.on('blur', () => { if (win.isVisible()) win.hide(); });
}

function showBar() {
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = d.workArea;
  lastH = BAR;
  win.setBounds({ x: Math.round(x + (width - WIDTH) / 2), y: Math.round(y + height * 0.22), width: WIDTH, height: BAR });
  win.show();
  win.focus();
  win.webContents.send('shown');
}

// ---- IPC ------------------------------------------------------------------
const expandEnv = (s) => (s || '').replace(/%([^%]+)%/g, (_, k) => process.env[k] || '');

ipcMain.handle('search', (_, q) => search(q));
ipcMain.handle('state', () => ({ scanning, count: scanCount }));
ipcMain.handle('strings', () => T());
async function getIcon(p) {
  if (iconCache.has(p)) return iconCache.get(p);
  const tries = [];
  if (p.startsWith('shell:')) return '';
  if (isWin && p.toLowerCase().endsWith('.url')) {
    try { const t = fs.readFileSync(p, 'utf8').match(/^IconFile=(.+)$/mi); if (t) tries.push(expandEnv(t[1].trim())); } catch {}
  }
  if (isWin && p.toLowerCase().endsWith('.lnk')) {
    // Start menu shortcuts: the real icon lives in the target program or an icon file
    try {
      const l = shell.readShortcutLink(p);
      const ico = expandEnv(l.icon), tgt = expandEnv(l.target);
      if (ico && /\.(ico|exe)$/i.test(ico)) tries.push(ico);
      if (tgt) tries.push(tgt);
      if (ico && !tries.includes(ico)) tries.push(ico);
    } catch {}
  }
  tries.push(p);
  for (const t of tries) {
    try {
      const img = await app.getFileIcon(t, { size: 'large' });
      if (!img.isEmpty()) {
        const url = img.toDataURL();
        iconCache.set(p, url);
        return url;
      }
    } catch {}
  }
  return '';
}
ipcMain.handle('icon', (_, p) => getIcon(p));
ipcMain.on('resize', (_, h) => {
  h = Math.max(BAR, Math.round(h));
  if (h === lastH) return;
  lastH = h;
  const b = win.getBounds();
  win.setBounds({ x: b.x, y: b.y, width: WIDTH, height: h });
});
ipcMain.on('hide', () => win.hide());
function openResult(r, mode) {
  win.hide();
  if (r.kind === 'calc') clipboard.writeText(String(r.value));
  else if (r.kind === 'web') shell.openExternal(r.url);
  else if (r.kind === 'cmd') { r.action === 'quit' ? app.quit() : scan(); }
  else {
    if (r.path.startsWith('shell:')) {
      require('child_process').spawn('explorer.exe', [r.path], { detached: true, stdio: 'ignore' }).unref();
      return;
    }
    usage[r.path] = (usage[r.path] || 0) + 1;
    fsp.writeFile(dataFile('usage.json'), JSON.stringify(usage)).catch(() => {});
    mode === 'reveal' ? shell.showItemInFolder(r.path) : shell.openPath(r.path);
  }
}
ipcMain.handle('open', (_, r, mode) => openResult(r, mode));

// ---- Dynamic Bar integration -------------------------------------------------
// With the integration on, the hotkey asks Dynamic Bar to open its search pill. Dynamic Bar then uses this
// local API (search / icon / open), so results always come from this app's index. If Dynamic Bar does not
// answer, the normal Spotlight bar opens instead.
const DYNBAR_PORT = 47800;
const LINK_DIR = path.join(os.homedir(), '.dynbar-ecosystem');
const LINK_FILE = path.join(LINK_DIR, 'spotlight.json');
const apiToken = crypto.randomBytes(16).toString('hex');
let apiPort = 0, nextId = 1;
const issued = new Map();   // id -> result handed to Dynamic Bar, so /open never trusts a path from the wire

function remember(r) {
  const id = nextId++;
  issued.set(id, r);
  if (issued.size > 400) issued.delete(issued.keys().next().value);
  return id;
}

function writeLink() {
  try {
    fs.mkdirSync(LINK_DIR, { recursive: true });
    fs.writeFileSync(LINK_FILE, JSON.stringify({ app: 'spotlight-clone', port: apiPort, token: apiToken, pid: process.pid }));
  } catch {}
}
function removeLink() {
  try {
    if (JSON.parse(fs.readFileSync(LINK_FILE, 'utf8')).pid === process.pid) fs.unlinkSync(LINK_FILE);
  } catch {}
}
function syncLink() { settings.dynamicBar && apiPort ? writeLink() : removeLink(); }

function startApi() {
  const server = http.createServer((req, res) => {
    const reply = (code, obj) => {
      res.statusCode = code;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(obj));
    };
    if (req.headers.origin || !/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(req.headers.host || '')) return reply(403, { error: 'forbidden' });
    if (!settings.dynamicBar) return reply(403, { error: 'integration off' });
    if ((req.headers.authorization || '') !== 'Bearer ' + apiToken) return reply(401, { error: 'unauthorized' });
    let u;
    try { u = new URL(req.url, 'http://127.0.0.1'); } catch { return reply(400, { error: 'bad url' }); }

    if (req.method === 'GET' && u.pathname === '/status') {
      const t = T();
      return reply(200, {
        app: 'spotlight-clone', version: app.getVersion(), scanning, count: scanCount,
        strings: { placeholder: t.placeholder, scanning: t.scanning, itemsReady: t.itemsReady, footer: t.footer, locale: t.locale },
      });
    }
    if (req.method === 'GET' && u.pathname === '/search') {
      const t = T();
      const results = search(u.searchParams.get('q') || '').slice(0, 40).map((r) => {
        const id = remember(r);
        return { id, group: r.group, kind: r.kind, kindLabel: t.kinds[r.kind] || '', name: r.name, sub: r.sub, top: !!r.top, icon: !!r.path };
      });
      return reply(200, { results, scanning, count: scanCount });
    }
    if (req.method === 'GET' && u.pathname === '/icon') {
      const r = issued.get(+u.searchParams.get('id'));
      if (!r || !r.path) return reply(404, { error: 'not found' });
      return getIcon(r.path).then((icon) => reply(200, { icon }));
    }
    if (req.method === 'POST' && u.pathname === '/open') {
      let body = '';
      req.on('data', (d) => { if (body.length < 4096) body += d; });
      req.on('end', () => {
        let o = {};
        try { o = JSON.parse(body || '{}'); } catch {}
        const r = issued.get(+o.id);
        if (!r) return reply(404, { error: 'unknown result' });
        openResult(r, o.mode === 'reveal' ? 'reveal' : 'open');
        reply(200, { ok: true });
      });
      return;
    }
    reply(404, { error: 'not found' });
  });
  server.on('error', () => {});
  server.listen(0, '127.0.0.1', () => { apiPort = server.address().port; syncLink(); });
}

// Dynamic Bar publishes its port and key here while its API is on, so no key has to be pasted by hand.
// A key typed into the settings window still wins.
function dynBarLink() {
  try {
    const l = JSON.parse(fs.readFileSync(path.join(LINK_DIR, 'dynamic-bar.json'), 'utf8'));
    return l && l.app === 'dynamic-bar' && Number.isInteger(l.port) ? l : null;
  } catch { return null; }
}

function dynBarRequest(method, pathname, body, timeout = 600) {
  return new Promise((resolve) => {
    const headers = { 'Content-Type': 'application/json' };
    const link = dynBarLink();
    const token = settings.dynamicBarToken || (link && link.token);
    if (token) headers.Authorization = 'Bearer ' + token;
    const req = http.request({ host: '127.0.0.1', port: (link && link.port) || DYNBAR_PORT, path: pathname, method, headers, timeout }, (res) => {
      let data = '';
      res.on('data', (d) => { if (data.length < 4096) data += d; });
      res.on('end', () => resolve({ ok: res.statusCode === 200, body: data }));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve({ ok: false, body: '' }));
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
const dynBarRunning = async () => (await dynBarRequest('GET', '/', null, 500)).body === 'dynamic-bar';

// Hotkey / tray / second launch: Dynamic Bar if it is there, otherwise the normal bar
async function summon() {
  if (win.isVisible()) return win.hide();
  if (settings.dynamicBar && (await dynBarRequest('POST', '/search', { mode: 'toggle' })).ok) return;
  showBar();
}

// ---- Settings window ----------------------------------------------------------
// The search bar and Dynamic Bar sit on the "screen-saver" layer, so a plain focus() can leave this window behind them.
// Pinning it on top for a moment brings it to the front, then it behaves like a normal window again.
function surface(w) {
  if (w.isMinimized()) w.restore();
  w.show();
  w.setAlwaysOnTop(true, 'screen-saver');
  w.focus();
  setTimeout(() => { if (!w.isDestroyed()) w.setAlwaysOnTop(false); }, 300);
}

// Errors go to userData/log.txt so a silent failure can be diagnosed afterwards
const logLine = (...a) => fsp.appendFile(dataFile('log.txt'), new Date().toISOString() + ' ' + a.join(' ') + '\n').catch(() => {});
process.on('uncaughtException', (e) => logLine('uncaughtException', e && e.stack));

function openSettings() {
  logLine('openSettings', settingsWin && !settingsWin.isDestroyed() ? 'existing' : 'new');
  if (settingsWin && !settingsWin.isDestroyed()) return surface(settingsWin);
  settingsWin = new BrowserWindow({
    width: 460, height: 420, show: false, resizable: false, minimizable: false, maximizable: false, autoHideMenuBar: true,
    title: T().settingsTitle,
    webPreferences: { preload: path.join(__dirname, 'preload-settings.js'), contextIsolation: true },
  });
  const w = settingsWin;
  w.setMenu(null);
  w.once('ready-to-show', () => { logLine('settings ready-to-show'); surface(w); });
  w.webContents.on('did-fail-load', (_, code, desc) => logLine('settings load failed', code, desc));
  w.webContents.on('console-message', (_, level, msg, line) => { if (level >= 3) logLine('settings page error:', msg, 'line', line); });
  w.loadFile(path.join(__dirname, 'renderer/settings.html'));
}
ipcMain.handle('cfg:get', () => ({ ...settings, strings: T() }));
ipcMain.handle('cfg:set', (_, p) => {
  if (p && typeof p.dynamicBar === 'boolean') settings.dynamicBar = p.dynamicBar;
  if (p && typeof p.dynamicBarToken === 'string') settings.dynamicBarToken = p.dynamicBarToken.trim().slice(0, 200);
  saveSettings();
  syncLink();
});
ipcMain.handle('cfg:probe', () => dynBarRunning());

// ---- Background: tray icon, launch at startup, language menu ---------------
function trayIcon() {
  const s = 32, buf = Buffer.alloc(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const d = Math.hypot(x - 13, y - 13);
    if ((d >= 8 && d <= 11.5) || (x >= 19 && x <= 28 && Math.abs(x - y) <= 2)) {
      const i = (y * s + x) * 4;
      buf[i] = 255; buf[i + 1] = 122; buf[i + 2] = 10; buf[i + 3] = 255; // BGRA
    }
  }
  return nativeImage.createFromBitmap(buf, { width: s, height: s }).resize({ width: 16, height: 16 });
}
const loginOpts = () => ({ path: process.execPath, args: app.isPackaged ? [] : [app.getAppPath()] });
const autostartOn = () => app.getLoginItemSettings(loginOpts()).openAtLogin;
const setAutostart = (on) => app.setLoginItemSettings({ openAtLogin: on, ...loginOpts() });

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip(T().tooltip);
  const menu = () => {
    const t = T();
    return Menu.buildFromTemplate([
      { label: t.trayOpen.replace('{key}', SHORTCUT), click: summon },
      { label: t.traySettings, click: openSettings },
      { label: t.trayRescan, click: () => scan() },
      { label: t.trayAutostart, type: 'checkbox', checked: autostartOn(), click: (i) => setAutostart(i.checked) },
      { label: t.trayLanguage, submenu: Object.keys(STRINGS).map((code) => ({
          label: STRINGS[code].languageName, type: 'radio', checked: code === lang, click: () => setLang(code),
        })) },
      { type: 'separator' },
      { label: t.trayQuit, click: () => app.quit() },
    ]);
  };
  tray.on('click', summon);
  tray.on('right-click', () => tray.popUpContextMenu(menu()));
}

// ---- App lifecycle --------------------------------------------------------
if (!app.requestSingleInstanceLock()) app.quit();
else app.on('second-instance', summon);

app.whenReady().then(async () => {
  if (isMac) app.dock.hide();
  await loadSettings();
  createWindow();
  createTray();

  let cached = false;
  try {
    index = JSON.parse(await fsp.readFile(dataFile('index.json'), 'utf8')).map((i) => ({ ...i, _n: norm(i.name) }));
    cached = index.length > 0;
  } catch {}
  try { usage = JSON.parse(await fsp.readFile(dataFile('usage.json'), 'utf8')); } catch {}

  if (!cached) setAutostart(true);   // first run: launch at startup (can be turned off in the tray menu)
  if (!globalShortcut.register(SHORTCUT, summon)) globalShortcut.register('Control+Space', summon);
  startApi();

  win.webContents.once('did-finish-load', () => {
    if (!cached) showBar();   // first run: show the bar so the initial scan is visible
    scan();
  });
});

app.on('window-all-closed', (e) => e.preventDefault());
app.on('will-quit', () => { globalShortcut.unregisterAll(); removeLink(); });
