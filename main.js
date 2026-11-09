const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, globalShortcut, shell, desktopCapturer, Notification } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const NOTES = path.join(DATA, 'notes');
const EVENTS = path.join(DATA, 'events.json');
const CONFIG = path.join(DATA, 'config.json');
const LAYOUT = path.join(DATA, 'layout.json');

let win = null;
let appsWin = null; // the Apps strip, always part of the wallpaper
let tray = null;
let chat = null; // running claude process

// ---- Wallpaper behaviour ----
// The board is parented into the desktop itself (Progman), between the wallpaper and the
// desktop icons, so icons and files stay visible on top of it. The icon layer then owns the
// mouse, so "edit mode" pops the board out as a normal window and puts it back when done.
let u32 = null;
try {
  const koffi = require('koffi');
  const lib = koffi.load('user32.dll');
  u32 = {
    FindWindowW: lib.func('intptr_t __stdcall FindWindowW(str16 c, str16 t)'),
    FindWindowExW: lib.func('intptr_t __stdcall FindWindowExW(intptr_t p, intptr_t a, str16 c, str16 t)'),
    SetParent: lib.func('intptr_t __stdcall SetParent(intptr_t child, intptr_t parent)'),
    GetParent: lib.func('intptr_t __stdcall GetParent(intptr_t h)'),
    GetWindowLongPtrW: lib.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t h, int i)'),
    SetWindowLongPtrW: lib.func('intptr_t __stdcall SetWindowLongPtrW(intptr_t h, int i, intptr_t v)'),
    SetWindowPos: lib.func('bool __stdcall SetWindowPos(intptr_t h, intptr_t after, int x, int y, int cx, int cy, uint flags)'),
    SendMessageTimeoutW: lib.func('intptr_t __stdcall SendMessageTimeoutW(intptr_t h, uint m, intptr_t w, intptr_t l, uint f, uint t, _Out_ intptr_t *r)'),
    SetWindowRgn: lib.func('int __stdcall SetWindowRgn(intptr_t h, intptr_t rgn, bool redraw)'),
    CreateRectRgn: koffi.load('gdi32.dll').func('intptr_t __stdcall CreateRectRgn(int l, int t, int r, int b)'),
  };
} catch (e) { console.error('desktop embedding unavailable', e); }

const GWL_STYLE = -16;
const WS_POPUP = 0x80000000, WS_CHILD = 0x40000000, WS_VISIBLE = 0x10000000;
const SWP_NOACTIVATE = 0x10, SWP_SHOWWINDOW = 0x40;
const HWND_TOP = 0;

let embedded = false;
let editing = false;
let editSince = 0;
let popupStyle = null;

const hwndOf = () => Number(win.getNativeWindowHandle().readBigUInt64LE(0));

function findDesktop() {
  const progman = u32.FindWindowW('Progman', null);
  if (!progman) return null;
  u32.SendMessageTimeoutW(progman, 0x052C, 0, 0, 0, 1000, [0]); // make sure the wallpaper layer exists
  const defView = u32.FindWindowExW(progman, 0, 'SHELLDLL_DefView', null);
  return defView ? { progman, defView } : null;
}

// The board's rectangle in physical pixels, relative to the desktop window
function boardRect() {
  const wa = screen.dipToScreenRect(null, screen.getPrimaryDisplay().workArea);
  const origin = screen.getAllDisplays().map((d) => screen.dipToScreenPoint({ x: d.bounds.x, y: d.bounds.y }))
    .reduce((m, p) => ({ x: Math.min(m.x, p.x), y: Math.min(m.y, p.y) }), { x: 1e9, y: 1e9 });
  return { x: wa.x - origin.x, y: wa.y - origin.y, w: wa.width, h: wa.height };
}

// The Apps strip is its own window, permanently embedded, so the desktop icons that live in it
// stay visible while the rest of the board is popped forward for editing.
const BAR_H = 36; // height of the board's top bar, in CSS pixels
const APPS_PAD = 8; // the Apps window starts this far left of the Apps box
const appsHwnd = () => Number(appsWin.getNativeWindowHandle().readBigUInt64LE(0));

function appsRectCss() {
  const a = readJSON(LAYOUT, {}).apps;
  if (a && a.w && a.h) return a;
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.width - 376, y: 16, w: 360, h: wa.height - BAR_H - 32 };
}

function embedApps(desk) {
  if (!appsWin || appsWin.isDestroyed()) return;
  const h = appsHwnd();
  const sf = screen.getPrimaryDisplay().scaleFactor;
  const b = boardRect(), a = appsRectCss();
  appsWin.showInactive();
  u32.SetWindowLongPtrW(h, GWL_STYLE, ((Number(BigInt.asUintN(32, BigInt(u32.GetWindowLongPtrW(h, GWL_STYLE)))) & ~WS_POPUP) | WS_CHILD | WS_VISIBLE) >>> 0);
  u32.SetParent(h, desk.progman);
  // Covers the whole right-hand strip (edge to edge, top to bottom) so no wallpaper peeks through
  const left = Math.round((a.x - APPS_PAD) * sf);
  u32.SetWindowPos(h, desk.defView, b.x + left, b.y, b.w - left, b.h, SWP_NOACTIVATE | SWP_SHOWWINDOW);
}

function embed() {
  if (!win || win.isDestroyed() || !u32) return;
  const desk = findDesktop();
  if (!desk) return;
  editing = false;
  const h = hwndOf();
  u32.SetWindowRgn(h, 0, false); // drop the popup's cut-out
  if (popupStyle === null) popupStyle = Number(BigInt.asUintN(32, BigInt(u32.GetWindowLongPtrW(h, GWL_STYLE))));
  embedApps(desk);
  win.showInactive();
  u32.SetWindowLongPtrW(h, GWL_STYLE, ((popupStyle & ~WS_POPUP) | WS_CHILD | WS_VISIBLE) >>> 0);
  u32.SetParent(h, desk.progman);
  const r = boardRect();
  // Sit just below the Apps strip and the icon layer, above the wallpaper
  const after = appsWin && !appsWin.isDestroyed() ? appsHwnd() : desk.defView;
  u32.SetWindowPos(h, after, r.x, r.y, r.w, r.h, SWP_NOACTIVATE | SWP_SHOWWINDOW);
  embedded = true;
}

function editBoard() {
  if (!win || win.isDestroyed()) return;
  if (embedded && u32) {
    const h = hwndOf();
    u32.SetParent(h, 0);
    u32.SetWindowLongPtrW(h, GWL_STYLE, (popupStyle | WS_VISIBLE) >>> 0);
    const r = screen.dipToScreenRect(null, screen.getPrimaryDisplay().workArea);
    const sf = screen.getPrimaryDisplay().scaleFactor;
    const width = Math.min(r.width, Math.round((appsRectCss().x - APPS_PAD) * sf));
    // Keep the window the same size as when embedded (so nothing reflows) and cut the Apps strip
    // out of it, letting the always-on-desktop Apps window and the icons show through
    u32.SetWindowPos(h, HWND_TOP, r.x, r.y, r.width, r.height, SWP_SHOWWINDOW);
    u32.SetWindowRgn(h, u32.CreateRectRgn(0, 0, width, r.height), true);
    embedded = false;
  }
  editing = true;
  editSince = Date.now();
  win.show();
  win.focus();
}

function toggleEdit() { if (editing) embed(); else editBoard(); }

// ---- Input forwarding ----
// The board never leaves the wallpaper layer. The icon layer above it swallows the mouse, so a
// global mouse hook notices pointer activity over the board's panels (on bare desktop only, never
// over the Apps strip, an app window or the taskbar) and replays it into the board. Keystrokes are
// replayed the same way, but only while a text box on the board has focus and the desktop itself is
// the foreground window, so no other app ever loses its keys.
let panelRects = []; // physical screen pixels
async function refreshPanelRects() {
  if (!win || win.isDestroyed() || !embedded) return;
  try {
    const wa = screen.dipToScreenRect(null, screen.getPrimaryDisplay().workArea);
    const sf = screen.getPrimaryDisplay().scaleFactor;
    const list = await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('.panel')].filter(e => e.id !== 'p-apps').map(e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })`);
    panelRects = list.map(([x, y, w, h]) => ({ x: wa.x + x * sf, y: wa.y + y * sf, w: w * sf, h: h * sf }));
  } catch {}
}
setInterval(refreshPanelRects, 1500);

const DESKTOP_CLASSES = new Set(['Progman', 'WorkerW', 'SHELLDLL_DefView', 'SysListView32']);
const NAMED_KEYS = { 0x08: 'Backspace', 0x09: 'Tab', 0x0D: 'Return', 0x1B: 'Escape', 0x21: 'PageUp', 0x22: 'PageDown', 0x23: 'End', 0x24: 'Home',
  0x25: 'Left', 0x26: 'Up', 0x27: 'Right', 0x28: 'Down', 0x2E: 'Delete' };
const MODIFIER_VKS = new Set([0x10, 0x11, 0x12, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5, 0x5B, 0x5C, 0x14]);

let boardFocus = false; // a text box on the board is focused and should receive typing
const editableJS = `(() => { const a = document.activeElement; return !!a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT' || a.isContentEditable); })()`;
async function syncFocus() {
  try { boardFocus = !!(win && !win.isDestroyed() && await win.webContents.executeJavaScript(editableJS)); } catch { boardFocus = false; }
}

let hooks = null;
function installInputHooks() {
  if (!u32 || hooks) return;
  try {
    const koffi = require('koffi');
    const lib = koffi.load('user32.dll');
    const Point = koffi.struct('POINT', { x: 'int32', y: 'int32' });
    const MouseHook = koffi.struct('MSLLHOOKSTRUCT', { pt: Point, mouseData: 'uint32', flags: 'uint32', time: 'uint32', extra: 'uintptr_t' });
    const KeyHook = koffi.struct('KBDLLHOOKSTRUCT', { vk: 'uint32', scan: 'uint32', flags: 'uint32', time: 'uint32', extra: 'uintptr_t' });
    const Proc = koffi.proto('intptr_t __stdcall HookProc(int code, uintptr_t wParam, intptr_t lParam)');
    const CallNext = lib.func('intptr_t __stdcall CallNextHookEx(intptr_t h, int code, uintptr_t w, intptr_t l)');
    const SetHook = lib.func('intptr_t __stdcall SetWindowsHookExW(int id, HookProc *fn, intptr_t mod, uint tid)');
    const WindowFromPoint = lib.func('intptr_t __stdcall WindowFromPoint(POINT p)');
    const GetForegroundWindow = lib.func('intptr_t __stdcall GetForegroundWindow()');
    const GetClassNameW = lib.func('int __stdcall GetClassNameW(intptr_t h, _Out_ uint16_t *s, int n)');
    const GetAsyncKeyState = lib.func('int16_t __stdcall GetAsyncKeyState(int vk)');
    const GetKeyState = lib.func('int16_t __stdcall GetKeyState(int vk)');
    const GetKeyboardLayout = lib.func('intptr_t __stdcall GetKeyboardLayout(uint tid)');
    const ToUnicodeEx = lib.func('int __stdcall ToUnicodeEx(uint vk, uint scan, const uint8_t *state, _Out_ uint16_t *buf, int n, uint flags, intptr_t hkl)');
    const className = (h) => { const b = new Uint16Array(64); return String.fromCharCode(...b.slice(0, GetClassNameW(h, b, 64))); };
    const down = (vk) => (GetAsyncKeyState(vk) & 0x8000) !== 0;

    const overPanel = (pt) => panelRects.some((r) => pt.x >= r.x && pt.x < r.x + r.w && pt.y >= r.y && pt.y < r.y + r.h);
    const active = () => embedded && !editing && win && !win.isDestroyed();
    const toLocal = (pt) => {
      const sf = screen.getPrimaryDisplay().scaleFactor;
      const wa = screen.dipToScreenRect(null, screen.getPrimaryDisplay().workArea);
      return { x: Math.round((pt.x - wa.x) / sf), y: Math.round((pt.y - wa.y) / sf) };
    };
    const forward = (ev) => setImmediate(() => { if (win && !win.isDestroyed()) win.webContents.sendInputEvent(ev); });

    let grabbed = false;   // a press started on the board; keep forwarding until it is released
    let lastDown = { t: 0, x: 0, y: 0, n: 0 };
    let hovering = false;

    const onMouse = (code, wParam, lParam) => {
      if (code >= 0 && computer.isRunning() && (wParam === 0x201 || wParam === 0x204)) { // a real click while the agent works = the user took over
        try { if (!(koffi.decode(lParam, MouseHook).flags & 1)) computer.userInput(); } catch {}
      }
      if (code >= 0 && active()) {
        try {
          const { pt, mouseData, flags } = koffi.decode(lParam, MouseHook);
          if (flags & 1) return CallNext(0, code, wParam, lParam); // injected by the agent, not the user
          if (wParam === 0x200) { // move
            if (grabbed || overPanel(pt)) {
              if (grabbed || DESKTOP_CLASSES.has(className(WindowFromPoint(pt)))) { hovering = true; forward({ type: 'mouseMove', ...toLocal(pt), button: grabbed ? 'left' : undefined }); }
            } else if (hovering) { hovering = false; forward({ type: 'mouseLeave', x: 0, y: 0 }); }
          } else if (wParam === 0x201) { // left down
            if (overPanel(pt) && DESKTOP_CLASSES.has(className(WindowFromPoint(pt)))) {
              grabbed = true;
              const now = Date.now();
              lastDown.n = (now - lastDown.t < 450 && Math.abs(pt.x - lastDown.x) < 6 && Math.abs(pt.y - lastDown.y) < 6) ? lastDown.n + 1 : 1;
              lastDown = { t: now, x: pt.x, y: pt.y, n: lastDown.n };
              forward({ type: 'mouseDown', ...toLocal(pt), button: 'left', clickCount: lastDown.n });            } else if (boardFocus) { // clicked somewhere else: the board's text box loses focus
              boardFocus = false;
              if (win) win.webContents.executeJavaScript('document.activeElement && document.activeElement.blur()').catch(() => {});
            }
          } else if (wParam === 0x202 && grabbed) { // left up
            grabbed = false;
            forward({ type: 'mouseUp', ...toLocal(pt), button: 'left', clickCount: lastDown.n });
            setTimeout(syncFocus, 80);
          } else if (wParam === 0x20A && overPanel(pt) && DESKTOP_CLASSES.has(className(WindowFromPoint(pt)))) { // wheel
            const delta = (mouseData >> 16) << 16 >> 16;
            forward({ type: 'mouseWheel', ...toLocal(pt), deltaX: 0, deltaY: delta, canScroll: true });
          }
        } catch (e) { console.error('mouse hook', e); }
      }
      return CallNext(0, code, wParam, lParam);
    };

    const onKey = (code, wParam, lParam) => {
      if (code >= 0 && computer.isRunning() && (wParam === 0x100 || wParam === 0x104)) { // a real key press while the agent works = the user took over
        try { if (!(koffi.decode(lParam, KeyHook).flags & 0x10)) computer.userInput(); } catch {}
      }
      if (code >= 0 && boardFocus && active()) {
        try {
          const k = koffi.decode(lParam, KeyHook);
          const isDown = wParam === 0x100 || wParam === 0x104, isUp = wParam === 0x101 || wParam === 0x105;
          const alt = down(0x12), win_ = down(0x5B) || down(0x5C), ctrl = down(0x11), shift = down(0x10);
          // Only take keys while the desktop itself is in front, and never shortcuts or modifier presses
          if ((isDown || isUp) && !MODIFIER_VKS.has(k.vk) && !alt && !win_ && DESKTOP_CLASSES.has(className(GetForegroundWindow()))) {
            const mods = [ctrl && 'control', shift && 'shift'].filter(Boolean);
            const wc = win.webContents;
            const edit = { 0x41: 'selectAll', 0x43: 'copy', 0x58: 'cut', 0x56: 'paste', 0x5A: 'undo', 0x59: 'redo' }[k.vk];
            if (ctrl) {
              if (!edit) return CallNext(0, code, wParam, lParam);
              if (isDown) setImmediate(() => wc[edit]());
              return 1;
            }
            if (k.vk === 0x1B) { boardFocus = false; return CallNext(0, code, wParam, lParam); } // Escape also reaches the desktop
            const named = NAMED_KEYS[k.vk];
            let ch = '';
            if (!named) {
              const state = new Uint8Array(256);
              if (shift) state[0x10] = 0x80;
              if (GetKeyState(0x14) & 1) state[0x14] = 1;
              const buf = new Uint16Array(8);
              const n = ToUnicodeEx(k.vk, k.scan, state, buf, 8, 0x4, GetKeyboardLayout(0));
              if (n > 0) ch = String.fromCharCode(...buf.slice(0, n));
            }
            if (named || ch) {
              const keyCode = named || ch;
              if (isDown) {
                forward({ type: 'keyDown', keyCode, modifiers: mods });
                if (ch) forward({ type: 'char', keyCode: ch, modifiers: mods });
                else if (named === 'Return') forward({ type: 'char', keyCode: '\r' });
                else if (named === 'Backspace') forward({ type: 'char', keyCode: '\b' });
                else if (named === 'Tab') forward({ type: 'char', keyCode: '\t' });
              } else forward({ type: 'keyUp', keyCode, modifiers: mods });
              return 1; // handled; the desktop doesn't see it
            }
          }
        } catch (e) { console.error('key hook', e); }
      }
      return CallNext(0, code, wParam, lParam);
    };

    hooks = { mouse: koffi.register(onMouse, koffi.pointer(Proc)), key: koffi.register(onKey, koffi.pointer(Proc)) };
    if (!SetHook(14, hooks.mouse, 0, 0)) console.error('mouse hook failed');   // WH_MOUSE_LL
    if (!SetHook(13, hooks.key, 0, 0)) console.error('keyboard hook failed');  // WH_KEYBOARD_LL
  } catch (e) { console.error('input hooks unavailable', e); }
}

const loginArgs = { path: process.execPath, args: [ROOT] };
function setupTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(ROOT, 'assets', 'tray.png')));
  tray.setToolTip('Desk Board (Ctrl+Alt+B to edit)');
  const build = () => Menu.buildFromTemplate([
    { label: 'Talk to the board  (Ctrl+Alt+V)', click: toggleVoice },
    { label: 'Edit board  (Ctrl+Alt+B)', click: toggleEdit },
    { label: 'Start with Windows', type: 'checkbox', checked: app.getLoginItemSettings(loginArgs).openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, ...loginArgs }) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(build());
  tray.on('click', toggleEdit);
}

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function loadBoard() {
  const notes = [];
  for (const f of fs.existsSync(NOTES) ? fs.readdirSync(NOTES) : []) {
    if (!f.endsWith('.json')) continue;
    const n = readJSON(path.join(NOTES, f), null);
    if (n && typeof n === 'object') notes.push({ ...n, id: n.id || f.replace(/\.json$/, '') });
  }
  notes.sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9));
  return {
    notes,
    events: readJSON(EVENTS, []),
    layout: readJSON(LAYOUT, {}),
    config: { ...readJSON(CONFIG, {}) },
  };
}

function safeId(id) { return String(id).replace(/[^a-zA-Z0-9_-]/g, ''); }

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    x: workArea.x, y: workArea.y, width: workArea.width, height: workArea.height,
    frame: false, resizable: false, backgroundColor: '#0b1020', title: 'Desk Board',
    skipTaskbar: true, show: false, minimizable: false, maximizable: false,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(ROOT, 'renderer', 'index.html'));
  win.once('ready-to-show', embed);
  // Clicking away from the board in edit mode puts it back on the desktop
  win.on('blur', () => { // ignore focus churn while popping up, but don't get stuck if focus never returns
    if (!editing) return;
    if (Date.now() - editSince > 600) embed();
    else setTimeout(() => { if (editing && !win.isFocused()) embed(); }, 700);
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') win.webContents.toggleDevTools();
  });

  appsWin = new BrowserWindow({
    x: workArea.x, y: workArea.y, width: 360, height: 360,
    frame: false, resizable: false, focusable: false, backgroundColor: '#0b1020', title: 'Desk Board Apps',
    skipTaskbar: true, show: false, minimizable: false, maximizable: false,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true },
  });
  appsWin.setMenuBarVisibility(false);
  appsWin.loadFile(path.join(ROOT, 'renderer', 'index.html'), { query: { view: 'apps' } });
  appsWin.once('ready-to-show', embed);
}

// Live reload when the agent (or you) changes files in data/
let debounce = null;
function watchData() {
  try {
    fs.watch(DATA, { recursive: true }, () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const board = loadBoard();
        for (const w of [win, appsWin]) if (w && !w.isDestroyed()) w.webContents.send('board:changed', board);
      }, 150);
    });
  } catch (e) { console.error('watch failed', e); }
}

// ---- Voice: a live spoken conversation (OpenAI Realtime over WebRTC) ----
// A hidden window owns the microphone and the audio connection; this side holds the API key,
// does the connection handshake and runs the tools the voice can call to change the board.
const KEY_FILE = path.join(app.getPath('appData'), 'desk-board', 'openai.key');
const VOICE_MODEL = 'gpt-realtime-2.1';
let voiceWin = null;
let voiceState = 'off';
const createActions = require('./actions');
const actions = createActions({ shell, logPath: path.join(app.getPath('appData'), 'desk-board', 'actions.log'), settings: () => readJSON(CONFIG, {}) });

// Tell the board (a status word in the top bar) and the voice about the computer agent
function agentStatus({ running, text, step }) {
  if (win && !win.isDestroyed()) win.webContents.send('agent:state', { running, text, step });
  if (!running && !global.__deskBench) {
    if (voiceWin && !voiceWin.isDestroyed()) voiceWin.webContents.send('voice:cmd', { type: 'agent', text });
    try { new Notification({ title: 'Desk Board', body: String(text).slice(0, 200) }).show(); } catch {}
  }
}
// Background research jobs (Claude Code, read-only tools). Finished work lands on the board as a note.
const jobs = require('./jobs')({
  spawn, fs, path, dir: path.join(app.getPath('appData'), 'desk-board', 'jobs'), settings: () => readJSON(CONFIG, {}),
  onChange: (list) => { if (win && !win.isDestroyed()) win.webContents.send('jobs:state', list); },
  onDone: ({ title, status, text, cost }) => {
    if (status === 'done') {
      try {
        fs.mkdirSync(NOTES, { recursive: true });
        const orders = loadBoard().notes.map((n) => n.order ?? 0);
        const id = slug(title) + '-' + Math.random().toString(36).slice(2, 6);
        const note = { id, title, category: 'research', body: text.slice(0, 6000), color: 'purple', border: 'solid', w: 480, h: 400, order: (orders.length ? Math.min(...orders) : 1) - 1, updated: new Date().toISOString() };
        fs.writeFileSync(path.join(NOTES, id + '.json'), JSON.stringify(note, null, 2));
      } catch (e) { console.error('could not save job note', e.message); }
    }
    const say = status === 'done' ? `Background task finished: "${title}". The full result is saved as a purple note on the board. Tell the user in one sentence and give the top pick or two.` : `Background task "${title}" ${status}: ${String(text).slice(0, 160)}`;
    if (voiceWin && !voiceWin.isDestroyed()) voiceWin.webContents.send('voice:cmd', { type: 'agent', text: say });
    try { new Notification({ title: 'Desk Board', body: status === 'done' ? `Done: ${title}` : `${title}: ${status}` }).show(); } catch {}
  },
});
// Long-term memory: SQLite in its own process, sourced facts only, extraction in the background (see memory/).
const memory = require('./memory')({ dataDir: path.join(app.getPath('appData'), 'desk-board', 'memory'), settings: () => readJSON(CONFIG, {}), log: (m) => createActions.low.log('memory', m) });
if (readJSON(CONFIG, {}).memory !== false) setTimeout(() => { memory.start(); refreshProfile(); }, 5000);
let memoryProfile = '';
const refreshProfile = () => memory.call('profile', { maxChars: 1500 }).then((r) => { memoryProfile = r.text || ''; }).catch(() => {});
// Memory panel: the board may only call these ops on the memory process; anything else is refused.
const MEMORY_OPS = new Set(['stats', 'list', 'why', 'forget', 'confirm', 'pin', 'setPaused', 'graph', 'entityFacts', 'remember']);
ipcMain.handle('memory:call', async (_e, op, args) => {
  if (!MEMORY_OPS.has(op)) return { error: 'not allowed' };
  try {
    const r = await memory.call(op, args && typeof args === 'object' ? args : {});
    if (['forget', 'confirm', 'pin', 'remember'].includes(op)) refreshProfile();
    return r;
  } catch (e) { return { error: 'memory is off' }; }
});
ipcMain.on('jobs:cancel', (_e, id) => jobs.cancel(id));
// Muse (Meta's agent) through the user's own WhatsApp Web session; only the Muse chat is exposed to the board.
const muse = require('./muse')({
  BrowserWindow, screen, settings: () => readJSON(CONFIG, {}), logPath: path.join(app.getPath('appData'), 'desk-board', 'muse.log'),
  onState: (st) => { if (win && !win.isDestroyed()) win.webContents.send('muse:state', st); },
  onIncoming: (m) => { try { new Notification({ title: 'Muse', body: (m.buttons.length ? 'Needs your approval: ' : '') + (m.text || 'New message').slice(0, 180) }).show(); } catch {} },
});
ipcMain.handle('muse:state', () => muse.state());
ipcMain.handle('muse:send', (_e, text) => muse.send(text));
ipcMain.handle('muse:press', (_e, id, label) => muse.press(id, label));
ipcMain.handle('muse:review', () => muse.review());
ipcMain.handle('muse:decide', (_e, label) => muse.decide(label));
ipcMain.handle('muse:close-review', () => muse.closeReview());
ipcMain.on('muse:setup', () => (muse.state().setup ? muse.endSetup() : muse.setup()));
setTimeout(() => { if (readJSON(CONFIG, {}).muse !== false) muse.start(); }, 4000);






const uiauto = require('./uiauto')({ low: createActions.low });
const computer = require('./computer')({ desktopCapturer, screen, low: createActions.low, keyFile: KEY_FILE, fs, onStatus: agentStatus, settings: () => readJSON(CONFIG, {}) });

function setVoiceState(state, text = '') {
  voiceState = state;
  if (win && !win.isDestroyed()) win.webContents.send('voice:state', { state, text });
}

function toggleVoice() {
  if (!fs.existsSync(KEY_FILE)) { setVoiceState('off'); console.error('No OpenAI key found at', KEY_FILE); return; }
  if (!voiceWin || voiceWin.isDestroyed()) {
    voiceWin = new BrowserWindow({
      show: false, width: 400, height: 300,
      webPreferences: { preload: path.join(ROOT, 'preload-voice.js'), contextIsolation: true, autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false },
    });
    const ses = voiceWin.webContents.session;
    ses.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'media'));
    ses.setPermissionCheckHandler((_wc, perm) => perm === 'media');
    voiceWin.loadFile(path.join(ROOT, 'renderer', 'voice.html'));
    voiceWin.webContents.once('did-finish-load', () => voiceWin.webContents.send('voice:cmd', 'toggle'));
  } else voiceWin.webContents.send('voice:cmd', 'toggle');
}

const { VOICE_TOOLS, voiceInstructions } = require('./voice-config');

async function realtimeCall(offerSdp) {
  const key = fs.readFileSync(KEY_FILE, 'utf8').trim();
  const session = {
    type: 'realtime', model: VOICE_MODEL, instructions: voiceInstructions(memoryProfile),
    audio: {
      // semantic VAD judges when you've finished a thought instead of waiting out a fixed silence; 'high' answers soonest
      input: { transcription: { model: 'gpt-4o-mini-transcribe' }, turn_detection: { type: 'semantic_vad', eagerness: 'high', create_response: true, interrupt_response: true } },
      output: { voice: 'marin' },
    },
    tools: VOICE_TOOLS, tool_choice: 'auto',
  };
  const form = new FormData();
  form.set('sdp', offerSdp);
  form.set('session', JSON.stringify(session));
  const r = await fetch('https://api.openai.com/v1/realtime/calls', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 400)}`);
  return r.text();
}

// One-shot run of the board's Claude assistant for the voice's bigger requests
function askBoard(text) {
  return new Promise((resolve) => {
    if (chat) return resolve('The board assistant is busy right now, try again in a moment.');
    const cfg = readJSON(CONFIG, {});
    const args = ['-p', '--dangerously-skip-permissions', '--output-format', 'json'];
    if (cfg.model && /^[a-z0-9.-]+$/i.test(cfg.model)) args.push('--model', cfg.model);
    const today = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });
    const p = spawn('claude', args, { cwd: ROOT, shell: true, windowsHide: true });
    let out = '';
    const timer = setTimeout(() => { spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true }); resolve('That took too long and was stopped.'); }, 120000);
    p.stdout.on('data', (d) => { out += d.toString(); });
    p.on('close', () => { clearTimeout(timer); try { resolve(JSON.parse(out).result || 'Done.'); } catch { resolve('Done.'); } });
    p.stdin.write(`[Context: it is ${today}. This request came by voice, so keep your reply to one short spoken sentence.]\n${text}`);
    p.stdin.end();
  });
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'note';

async function runVoiceTool(name, a = {}) {
  try {
    if (name === 'add_event') {
      const events = readJSON(EVENTS, []);
      const ev = { id: 'evt-' + Date.now(), title: String(a.title), date: a.date, color: a.color || 'blue', source: 'manual' };
      if (a.start) { ev.start = a.start; ev.end = a.end || a.start; }
      events.push(ev);
      fs.writeFileSync(EVENTS, JSON.stringify(events, null, 2));
      return { ok: true, added: ev.title, date: ev.date };
    }
    if (name === 'add_note') {
      fs.mkdirSync(NOTES, { recursive: true });
      const orders = loadBoard().notes.map((n) => n.order ?? 0);
      const id = slug(a.title) + '-' + Math.random().toString(36).slice(2, 6);
      const note = { id, title: a.title, category: a.category || '', body: a.body, color: a.color || 'gray', border: 'solid', w: 360, h: 240, order: (orders.length ? Math.min(...orders) : 1) - 1, updated: new Date().toISOString() };
      fs.writeFileSync(path.join(NOTES, id + '.json'), JSON.stringify(note, null, 2));
      return { ok: true, added: note.title };
    }
    if (name === 'get_schedule') {
      const from = a.from || new Date().toLocaleDateString('en-CA');
      const to = new Date(new Date(from).getTime() + (a.days || 7) * 86400000).toLocaleDateString('en-CA');
      return readJSON(EVENTS, []).filter((e) => e.date >= from && e.date <= to).sort((x, y) => (x.date + (x.start || '')).localeCompare(y.date + (y.start || '')))
        .map((e) => ({ title: e.title, date: e.date, start: e.start, end: e.end }));
    }
    if (name === 'read_notes') return loadBoard().notes.map((n) => ({ title: n.title, body: n.body }));
    if (name === 'board_do') return { result: await askBoard(String(a.request)) };
    if (name === 'computer_task') {
      if (!a.goal) return { error: 'no goal given' };
      if (computer.isRunning()) return { error: 'a computer task is already running; say stop to cancel it first' };
      computer.run(String(a.goal)); // runs in the background; the result comes back as a message
      return { ok: true, started: true, note: 'Running in the background. Tell the user briefly, and keep chatting.' };
    }
    if (name === 'remember') { const r = await memory.call('remember', { text: String(a.text || ''), pin: !!a.pin }); refreshProfile(); return r; }
    if (name === 'recall') return await memory.call('recall', { query: String(a.query || '') });
    if (name === 'forget') { const r = await memory.call('forget', { query: String(a.what || ''), id: Number.isInteger(a.id) ? a.id : undefined }); refreshProfile(); return r; }
    if (name === 'why_remembered') return await memory.call('why', { query: String(a.what || '') });
    if (name === 'memory_pause') return await memory.call('setPaused', { on: !!a.paused });
    if (name === 'muse_send') return await muse.send(a.text);
    if (name === 'muse_read') {
      const st = muse.state();
      if (st.phase !== 'ready') return { error: `Muse is not connected yet (${st.phase}). The user may need to scan the QR code in the Muse box.` };
      return { waiting_for_user_approval: !!st.approval, note: st.approval ? 'Muse is waiting for approval. The user decides by clicking Review in the Muse box on the board; you cannot approve.' : undefined,
        messages: st.messages.slice(-6).map((m) => ({ from: m.out ? 'user' : 'muse', text: m.text, approval_buttons: m.buttons })) };
    }
    if (name === 'delegate_task') return jobs.start({ goal: a.goal, title: a.title });
    if (name === 'list_tasks') return { tasks: jobs.list().map((j) => ({ title: j.title, status: j.status })) };
    if (name === 'cancel_task') return jobs.cancel(a.which);
    if (name === 'show_result') {
      const j = jobs.find(a.which);
      if (!j) return { error: 'no finished background task to show yet' };
      if (a.action === 'open_browser') {
        const links = (j.links || []).slice(0, Math.min(Math.max(Number(a.count) || 3, 1), 6));
        if (!links.length) return { error: 'that result has no links to open' };
        for (const u of links) { await actions.open_url({ url: u, browser: a.browser }); await createActions.low.sleep(250); }
        return { ok: true, opened: links, task: j.title };
      }
      return { task: j.title, result: j.result.slice(0, 3000) };
    }
    if (name === 'computer_cancel') return { ok: computer.cancel('you said stop') };
    if (name.startsWith('ui_') && uiauto[name]) return await uiauto[name](a);
    if (actions[name]) return await actions[name](a);
    return { error: 'unknown tool ' + name };
  } catch (e) { return { error: String(e.message || e) }; }
}

// Benchmark launcher: started by a flag file in the temp folder, runs bench/run-in-app.js (dev tool; does nothing normally)
const BENCH_FLAG = path.join(process.env.TEMP || '', 'desk-bench.flag');
if (fs.existsSync(BENCH_FLAG)) setTimeout(() => {
  let spec; try { spec = JSON.parse(fs.readFileSync(BENCH_FLAG, 'utf8')); fs.unlinkSync(BENCH_FLAG); } catch { return; }
  require('./bench/run-in-app')({ computer, actions, low: createActions.low, spec }).catch((e) => console.error('bench failed', e));
}, 6000);

ipcMain.handle('jobs:list', () => jobs.list());
ipcMain.handle('voice:offer', (_e, sdp) => realtimeCall(sdp));
ipcMain.handle('voice:tool', async (_e, name, args) => {
  const t0 = Date.now();
  const out = await runVoiceTool(name, args);
  createActions.low.log('voice-tool', `${name} ${Date.now() - t0} ms`);
  return out;
});
ipcMain.on('voice:state', (_e, s) => setVoiceState(s.state, s.text));
ipcMain.on('voice:toggle', () => toggleVoice());
ipcMain.on('voice:log', (_e, m) => {
  console.error('[voice]', m);
  const t = String(m);
  if (t.startsWith('you: ')) memory.capture('user_voice', t.slice(5));
  else if (t.startsWith('board: ')) memory.capture('assistant', t.slice(7));
});

ipcMain.handle('board:load', () => loadBoard());

ipcMain.handle('note:save', (_e, note) => {
  const id = safeId(note.id);
  if (!id) return;
  fs.writeFileSync(path.join(NOTES, id + '.json'), JSON.stringify({ ...note, id, updated: new Date().toISOString() }, null, 2));
});

ipcMain.handle('note:delete', (_e, id) => {
  try { fs.unlinkSync(path.join(NOTES, safeId(id) + '.json')); } catch {}
});

ipcMain.handle('event:save', (_e, events) => {
  fs.writeFileSync(EVENTS, JSON.stringify(events, null, 2));
});

ipcMain.handle('layout:save', (_e, layout) => {
  fs.writeFileSync(LAYOUT, JSON.stringify(layout, null, 2));
});

ipcMain.handle('config:save', (_e, patch) => {
  fs.writeFileSync(CONFIG, JSON.stringify({ ...readJSON(CONFIG, {}), ...patch }, null, 2));
});

ipcMain.handle('window:control', (_e, what) => {
  if (!win) return;
  if (what === 'minimize') embed(); // back onto the desktop
  if (what === 'close') app.quit();
});

// ---- Chat: each message runs Claude Code in print mode, streaming JSON back ----
function send(ch, payload) { if (win && !win.isDestroyed()) win.webContents.send(ch, payload); }

// Images pasted into the chat are saved here; notes show them as ![description](images/<file>)
const IMAGES = path.join(DATA, 'images');
const IMG_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
ipcMain.handle('note:image', (_e, name) => {
  const f = String(name || '');
  const ext = (f.split('.').pop() || '').toLowerCase();
  if (!/^[\w.-]+$/.test(f) || f.includes('..') || !IMG_TYPES[ext]) return null;
  try { return `data:${IMG_TYPES[ext]};base64,` + fs.readFileSync(path.join(IMAGES, f)).toString('base64'); } catch { return null; }
});
function saveImages(list) {
  const out = [];
  for (const u of Array.isArray(list) ? list.slice(0, 6) : []) {
    const m = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(u));
    if (!m || m[2].length > 21e6) continue;
    fs.mkdirSync(IMAGES, { recursive: true });
    const file = `img-${Date.now().toString(36)}-${out.length}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    fs.writeFileSync(path.join(IMAGES, file), Buffer.from(m[2], 'base64'));
    out.push(file);
  }
  return out;
}
ipcMain.handle('chat:send', (_e, text, images) => {
  if (chat) return;
  memory.capture('user_typed', String(text || ''));
  const saved = saveImages(images);
  const cfg = readJSON(CONFIG, {});
  const args = ['-p', '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
  if (cfg.model && /^[a-z0-9.-]+$/i.test(cfg.model)) args.push('--model', cfg.model);
  if (cfg.sessionId) args.push('--resume', cfg.sessionId);

  const today = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });
  const imgNote = saved.length
    ? `[The user attached ${saved.length} image(s): ${saved.map((f) => path.join(IMAGES, f)).join(', ')}. Look at them with the Read tool when the request depends on what they show. To keep one on the board as a note, use the image-notes rules in CLAUDE.md with the file name(s) ${saved.join(', ')}.]\n`
    : '';
  const prompt = `[Context: it is ${today}]\n${imgNote}${text}`;

  chat = spawn('claude', args, { cwd: ROOT, shell: true, windowsHide: true });
  chat.stdin.write(prompt);
  chat.stdin.end();

  let buf = '';
  let streamed = false;
  chat.stdout.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.type === 'system' && m.session_id) {
        fs.writeFileSync(CONFIG, JSON.stringify({ ...readJSON(CONFIG, {}), sessionId: m.session_id }, null, 2));
      } else if (m.type === 'stream_event' && m.event?.type === 'content_block_delta' && m.event.delta?.type === 'text_delta') {
        streamed = true;
        send('chat:event', { kind: 'text', text: m.event.delta.text });
      } else if (m.type === 'assistant') {
        for (const c of m.message?.content || []) {
          if (c.type === 'tool_use') send('chat:event', { kind: 'tool', name: c.name });
          if (c.type === 'text' && !streamed) send('chat:event', { kind: 'text', text: c.text });
        }
        streamed = false;
        send('chat:event', { kind: 'break' });
      } else if (m.type === 'result') {
        send('chat:event', { kind: 'done', error: !!m.is_error, result: m.result });
      }
    }
  });
  let err = '';
  chat.stderr.on('data', (d) => { err += d.toString(); });
  chat.on('close', (code) => {
    chat = null;
    send('chat:event', { kind: 'closed', code, err: code ? err.slice(-500) : '' });
  });
});

ipcMain.handle('chat:stop', () => { if (chat) { spawn('taskkill', ['/pid', String(chat.pid), '/T', '/F'], { windowsHide: true }); } });

ipcMain.handle('chat:reset', () => {
  fs.writeFileSync(CONFIG, JSON.stringify({ ...readJSON(CONFIG, {}), sessionId: null }, null, 2));
});

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', editBoard);
  app.whenReady().then(() => {
    createWindow(); watchData(); setupTray(); installInputHooks();
    if (!globalShortcut.register('Control+Alt+B', toggleEdit)) console.error('Ctrl+Alt+B is already taken by another app');
    if (!globalShortcut.register('Control+Alt+V', toggleVoice)) console.error('Ctrl+Alt+V is already taken by another app');
    if (!globalShortcut.register('Control+Shift+X', () => computer.cancel('stopped with the hotkey'))) console.error('Ctrl+Shift+X is already taken by another app');
    // Start with Windows by default the first time; the tray menu can turn it off
    const cfg = readJSON(CONFIG, {});
    if (!cfg.autostartSet) {
      app.setLoginItemSettings({ openAtLogin: true, ...loginArgs });
      fs.writeFileSync(CONFIG, JSON.stringify({ ...cfg, autostartSet: true }, null, 2));
    }
  });
}
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { uiauto.stop(); jobs.stopAll(); muse.stop(); memory.stop(); });
