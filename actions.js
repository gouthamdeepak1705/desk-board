// Direct computer actions for the voice assistant: no screenshots, no AI vision. Each action is a
// plain Windows call that finishes in about a second. Every function returns a small object the
// voice model reads back ({ ok: true, ... } or { error: '...' }) and never throws.
const koffi = require('koffi');
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

const user32 = koffi.load('user32.dll');
const INPUT = koffi.struct('INPUT', { type: 'uint32', _p0: 'uint32', vk: 'uint16', scan: 'uint16', flags: 'uint32', time: 'uint32', _p1: 'uint32', extra: 'uintptr_t', _p2: 'uint64' });
const kernel32 = koffi.load('kernel32.dll');
const dwmapi = koffi.load('dwmapi.dll');
const RECT = koffi.struct('RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
const EnumProc = koffi.proto('bool __stdcall EnumWinProc(intptr_t h, intptr_t l)');
const api = {
  SendInput: user32.func('uint32 __stdcall SendInput(uint32 n, INPUT *inputs, int size)'),
  GetForegroundWindow: user32.func('intptr_t __stdcall GetForegroundWindow()'),
  SetForegroundWindow: user32.func('bool __stdcall SetForegroundWindow(intptr_t h)'),
  ShowWindow: user32.func('bool __stdcall ShowWindow(intptr_t h, int cmd)'),
  IsIconic: user32.func('bool __stdcall IsIconic(intptr_t h)'),
  IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(intptr_t h)'),
  EnumWindows: user32.func('bool __stdcall EnumWindows(EnumWinProc *f, intptr_t l)'),
  GetWindowTextW: user32.func('int __stdcall GetWindowTextW(intptr_t h, _Out_ uint16_t *s, int n)'),
  GetClassNameW: user32.func('int __stdcall GetClassNameW(intptr_t h, _Out_ uint16_t *s, int n)'),
  SetCursorPos: user32.func('bool __stdcall SetCursorPos(int x, int y)'),
  SetWindowPos: user32.func('bool __stdcall SetWindowPos(intptr_t h, intptr_t after, int x, int y, int w, int h2, uint32 flags)'),
  GetWindowRect: user32.func('bool __stdcall GetWindowRect(intptr_t h, _Out_ RECT *r)'),
  SystemParametersInfoW: user32.func('bool __stdcall SystemParametersInfoW(uint32 a, uint32 b, _Out_ RECT *r, uint32 c)'),
  GetWindowThreadProcessId: user32.func('uint32 __stdcall GetWindowThreadProcessId(intptr_t h, _Out_ uint32 *pid)'),
  OpenProcess: kernel32.func('intptr_t __stdcall OpenProcess(uint32 a, bool inherit, uint32 pid)'),
  CloseHandle: kernel32.func('bool __stdcall CloseHandle(intptr_t h)'),
  QueryFullProcessImageNameW: kernel32.func('bool __stdcall QueryFullProcessImageNameW(intptr_t p, uint32 flags, _Out_ uint16_t *s, _Inout_ uint32 *n)'),
  DwmGetWindowAttribute: dwmapi.func('int __stdcall DwmGetWindowAttribute(intptr_t h, uint32 attr, _Out_ RECT *r, uint32 size)'),
  mouse_event: user32.func('void __stdcall mouse_event(uint32 flags, int dx, int dy, int data, uintptr_t extra)'),
};
if (koffi.sizeof(INPUT) !== 40) console.error('[actions] unexpected INPUT size', koffi.sizeof(INPUT));

const KEYUP = 0x2, UNICODE = 0x4, EXTENDED = 0x1;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const str = (fn, h, n = 256) => { const b = new Uint16Array(n); return String.fromCharCode(...b.slice(0, fn(h, b, n))); };
const classOf = (h) => str(api.GetClassNameW, h, 64);
const titleOf = (h) => str(api.GetWindowTextW, h, 256);

// ---- log: kept outside data/ so writing it doesn't make the board reload ----
let logFile = null;
function log(tool, detail) {
  try { fs.appendFileSync(logFile, `${new Date().toISOString()}  ${tool}  ${detail}\n`); } catch {}
}

// ---- safety rails (stage 2 will add approval prompts; until then these are simply refused) ----
const SHELL_CLASSES = new Set(['ConsoleWindowClass', 'CASCADIA_HOSTING_WINDOW_CLASS', 'PuTTY']); // typing here would run commands
const BLOCKED_APPS = /^(cmd|command prompt|powershell|windows powershell|pwsh|terminal|windows terminal|regedit|registry editor|task scheduler|group policy|gpedit)\b/i;
const BLOCKED_SHORTCUTS = new Set(['alt+f4', 'win+l', 'win+r', 'win+x', 'ctrl+alt+delete', 'ctrl+shift+delete']);
const foregroundIsShell = () => SHELL_CLASSES.has(classOf(api.GetForegroundWindow()));

// Windows the assistant opened itself in this session are safe to type into. Anything else (a
// document the user already had open) needs the user's spoken okay first, passed as confirmed:true.
const openedByUs = new Set();
let getSettings = () => ({});
const EDITING_KEYS = new Set(['delete', 'del', 'backspace', 'enter', 'return', 'insert']);
const EDITING_COMBOS = new Set(['ctrl+a', 'ctrl+x', 'ctrl+v', 'ctrl+z', 'ctrl+y', 'ctrl+s', 'ctrl+shift+s']);
function needsConfirmation(confirmed) {
  if (!getSettings().confirmExisting) return null; // off by default: the user's request is the permission
  const fg = api.GetForegroundWindow();
  if (confirmed || openedByUs.has(fg)) return null;
  return { error: 'needs_confirmation', window: titleOf(fg), message: `That would change "${titleOf(fg)}", which was already open. Ask the user to confirm out loud, and only then call this again with confirmed set to true.` };
}

// ---- keys ----
const NAMED = { enter: 0x0D, return: 0x0D, tab: 0x09, esc: 0x1B, escape: 0x1B, space: 0x20, backspace: 0x08, delete: 0x2E, del: 0x2E, insert: 0x2D,
  home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22, left: 0x25, up: 0x26, right: 0x27, down: 0x28,
  ctrl: 0x11, control: 0x11, shift: 0x10, alt: 0x12, win: 0x5B, windows: 0x5B, '+': 0xBB, plus: 0xBB, minus: 0xBD, '-': 0xBD,
  ',': 0xBC, '.': 0xBE, '/': 0xBF, ';': 0xBA, '`': 0xC0, '[': 0xDB, ']': 0xDD, '\\': 0xDC, "'": 0xDE, '=': 0xBB };
const EXTENDED_VKS = new Set([0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2D, 0x2E, 0x5B]);
const vkOf = (name) => {
  const k = String(name).trim().toLowerCase();
  if (NAMED[k] !== undefined) return NAMED[k];
  if (/^f([1-9]|1[0-2])$/.test(k)) return 0x6F + Number(k.slice(1));
  if (/^[a-z]$/.test(k)) return k.toUpperCase().charCodeAt(0);
  if (/^[0-9]$/.test(k)) return k.charCodeAt(0);
  return null;
};
const key = (vk, up) => ({ type: 1, _p0: 0, vk, scan: 0, flags: (up ? KEYUP : 0) | (EXTENDED_VKS.has(vk) ? EXTENDED : 0), time: 0, _p1: 0, extra: 0, _p2: 0 });
const send = (events) => api.SendInput(events.length, events, koffi.sizeof(INPUT));

// ---- windows ----
function listWindows() {
  const out = [];
  api.EnumWindows((h) => {
    if (!api.IsWindowVisible(h)) return true;
    const t = titleOf(h);
    if (t && t !== 'Program Manager' && !/^Desk Board/.test(t) && !['Windows.UI.Core.CoreWindow', 'Shell_TrayWnd'].includes(classOf(h))) out.push({ h, title: t });
    return true;
  }, 0);
  return out;
}

function exeOf(h) {
  const pid = [0]; api.GetWindowThreadProcessId(h, pid);
  const p = api.OpenProcess(0x1000, false, pid[0]); if (!p) return '';
  const buf = new Uint16Array(520), n = [520];
  const ok = api.QueryFullProcessImageNameW(p, 0, buf, n); api.CloseHandle(p);
  return ok ? String.fromCharCode(...buf.slice(0, n[0])).split('\\').pop().replace(/\.exe$/i, '').toLowerCase() : '';
}
const EXE_HINTS = { chrome: 'chrome', 'google chrome': 'chrome', edge: 'msedge', firefox: 'firefox', code: 'code', 'vs code': 'code', 'visual studio code': 'code', spotify: 'spotify', notepad: 'notepad', calculator: 'calculatorapp', 'file explorer': 'explorer', explorer: 'explorer', discord: 'discord', whatsapp: 'whatsapp', word: 'winword', excel: 'excel', slack: 'slack', teams: 'ms-teams' };
// match by window title first, then by program name (Spotify's title is the song, Chrome's is the page)
function findWindowFor(name) {
  const q = norm(name), want = EXE_HINTS[q];
  const all = listWindows();
  return (all.find((w) => norm(w.title).includes(q)) || all.find((w) => { const e = exeOf(w.h); return e && (want ? e === want : e.includes(q.replace(/\s+/g, ''))); }) || {}).h || null;
}
// move a window to a screen rectangle, correcting for Windows' invisible resize borders
function place(h, x, y, w, ht) {
  api.ShowWindow(h, 9); // restore from maximised/minimised first
  api.SetWindowPos(h, 0, x, y, w, ht, 0x0004 | 0x0040);
  const o = {}, v = {};
  api.GetWindowRect(h, o);
  if (api.DwmGetWindowAttribute(h, 9, v, 16) === 0) {
    const dl = v.left - o.left, dt = v.top - o.top, dr = o.right - v.right, db = o.bottom - v.bottom;
    api.SetWindowPos(h, 0, x - dl, y - dt, w + dl + dr, ht + dt + db, 0x0004 | 0x0040);
  }
}

async function focusHandle(h) {
  if (api.IsIconic(h)) api.ShowWindow(h, 9); // restore
  // Windows only lets the foreground app hand out focus; a key tap makes the request legitimate. Use an
  // unassigned key (0xE8), not Alt: Alt triggers dictation tools like Wispr Flow and opens app menu bars.
  send([key(0xE8, false), key(0xE8, true)]);
  api.SetForegroundWindow(h);
  await sleep(150);
  return api.GetForegroundWindow() === h;
}

// ---- apps ----
const ALIASES = { chrome: 'chrome', 'google chrome': 'chrome', edge: 'msedge', 'microsoft edge': 'msedge', firefox: 'firefox', notepad: 'notepad',
  calculator: 'calc', calc: 'calc', 'file explorer': 'explorer', explorer: 'explorer', files: 'explorer', paint: 'mspaint', settings: 'ms-settings:' };
let startApps = null, startAppsAt = 0;
function loadStartApps() {
  if (startApps && Date.now() - startAppsAt < 300000) return Promise.resolve(startApps);
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-Command', 'Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress'], { windowsHide: true, timeout: 20000 }, (err, stdout) => {
      try { const j = JSON.parse(stdout); startApps = Array.isArray(j) ? j : [j]; startAppsAt = Date.now(); } catch { startApps = startApps || []; }
      resolve(startApps);
    });
  });
}
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function pickApp(apps, name) {
  const q = norm(name);
  const scored = apps.map((a) => { const n = norm(a.Name); return { a, s: n === q ? 3 : n.startsWith(q) ? 2 : n.includes(q) || q.includes(n) ? 1 : 0, len: n.length }; })
    .filter((x) => x.s > 0).sort((x, y) => y.s - x.s || x.len - y.len);
  return scored.length ? scored[0].a : null;
}
const launch = (target) => spawn('cmd.exe', ['/c', 'start', '', target], { windowsHide: true, detached: true, stdio: 'ignore' }).unref();

// Types any text (any language, emoji) into whatever has keyboard focus
async function typeUnicode(text) {
  for (let i = 0; i < text.length; i += 80) {
    const ev = [];
    for (const ch of text.slice(i, i + 80)) {
      if (ch === '\n') { ev.push(key(0x0D, false), key(0x0D, true)); continue; }
      const c = ch.charCodeAt(0);
      ev.push({ ...key(0, false), scan: c, flags: UNICODE }, { ...key(0, true), scan: c, flags: UNICODE | KEYUP });
    }
    send(ev);
    await sleep(15);
  }
}

// ---- low-level pieces used by the computer agent (screenshot loop) ----
const KEY_ALIASES = { arrowleft: 'left', arrowright: 'right', arrowup: 'up', arrowdown: 'down', meta: 'win', super: 'win', cmd: 'win', command: 'win', option: 'alt', ctrl: 'ctrl', control: 'ctrl', page_up: 'pageup', page_down: 'pagedown' };
const MOUSE = { MOVE: 0x1, LDOWN: 0x2, LUP: 0x4, RDOWN: 0x8, RUP: 0x10, MDOWN: 0x20, MUP: 0x40, WHEEL: 0x800, HWHEEL: 0x1000 };
const low = {
  sleep,
  foregroundTitle: () => titleOf(api.GetForegroundWindow()),
  foregroundIsShell,
  moveTo: (x, y) => api.SetCursorPos(Math.round(x), Math.round(y)),
  mouseButton(button, down) {
    const f = button === 'right' ? (down ? MOUSE.RDOWN : MOUSE.RUP) : button === 'wheel' || button === 'middle' ? (down ? MOUSE.MDOWN : MOUSE.MUP) : (down ? MOUSE.LDOWN : MOUSE.LUP);
    api.mouse_event(f, 0, 0, 0, 0);
  },
  wheel(dx, dy) { // positive dy scrolls down, like a web page's deltaY
    if (dy) api.mouse_event(MOUSE.WHEEL, 0, 0, -Math.round(dy / 100 * 120), 0);
    if (dx) api.mouse_event(MOUSE.HWHEEL, 0, 0, Math.round(dx / 100 * 120), 0);
  },
  modifiers(list, down) { // hold or release modifier keys given as ['ctrl','shift', ...]
    const vks = (list || []).map((k) => vkOf(KEY_ALIASES[String(k).toLowerCase()] || k)).filter((v) => v);
    send(vks.map((v) => key(v, !down)));
  },
  // returns an error string, or null after pressing the combination
  pressKeys(list) {
    const names = (list || []).map((k) => { const l = String(k).toLowerCase(); return KEY_ALIASES[l] || l; });
    const vks = names.map(vkOf);
    if (names.length === 1 && [...names[0]].length === 1 && vks[0] === null) { // a lone symbol such as * ( ) %: type it as text
      const c = names[0].charCodeAt(0);
      send([{ ...key(0, false), scan: c, flags: UNICODE }, { ...key(0, true), scan: c, flags: UNICODE | KEYUP }]);
      return null;
    }
    if (!names.length || vks.includes(null)) return `unknown key combination ${JSON.stringify(list)}`;
    const combo = names.join('+');
    if (BLOCKED_SHORTCUTS.has(combo)) return `${combo} is not allowed`;
    send([...vks.map((v) => key(v, false)), ...vks.slice().reverse().map((v) => key(v, true))]);
    return null;
  },
  typeText: typeUnicode,
  log,
  // window helpers, also used by the benchmark to put a browser at an exact size
  listWindows, place, focusHandle, exeOf, titleOf,
  workArea() { const r = {}; api.SystemParametersInfoW(0x30, 0, r, 0); return r; },
};

module.exports = function createActions({ shell, logPath, settings = () => ({}) }) {
  logFile = logPath;
  getSettings = settings;
  setTimeout(loadStartApps, 5000); // warm the installed-apps list in the background

  async function open_app({ name }) {
    if (!name) return { error: 'no app name given' };
    if (BLOCKED_APPS.test(name.trim())) { log('open_app', `BLOCKED ${name}`); return { error: `Opening "${name}" by voice isn't allowed yet; it can run commands.` }; }
    const beforeList = listWindows();
    const before = new Set(beforeList.map((w) => w.h));
    const alias = ALIASES[norm(name)];
    let label = name;
    if (alias) launch(alias);
    else {
      const app = pickApp(await loadStartApps(), name);
      if (!app) { log('open_app', `NOT FOUND ${name}`); return { error: `I couldn't find an app called "${name}".` }; }
      label = app.Name;
      spawn('explorer.exe', [`shell:AppsFolder\\${app.AppID}`], { windowsHide: true, detached: true, stdio: 'ignore' }).unref();
    }
    // give the window a moment to appear; only a window that did not exist before counts as ours
    const q = norm(alias && alias !== label ? name : label).split(' ')[0];
    const hadExisting = beforeList.some((x) => norm(x.title).includes(q)); // already running: don't wait long for a new window
    let focused = false, fresh = false, shown = null;
    for (let i = 0; i < 12 && !focused; i++) {
      await sleep(350);
      const all = listWindows().filter((x) => norm(x.title).includes(q));
      const w = all.find((x) => !before.has(x.h)) || (hadExisting && i >= 3 ? all[0] : null);
      if (w) { fresh = !before.has(w.h); shown = w.title; focused = await focusHandle(w.h); if (focused && fresh) openedByUs.add(w.h); }
    }
    log('open_app', `${label} focused=${focused} new_window=${fresh}`);
    return { ok: true, opened: label, in_front: focused, window: shown, new_window: fresh,
      note: fresh ? undefined : 'This app was already open, so I brought the existing window forward. Typing into it will need the user to confirm.' };
  }

  async function open_url({ url, browser }) {
    let u;
    try { u = new URL(url); } catch { return { error: 'that is not a valid web address' }; }
    if (!/^https?:$/.test(u.protocol)) return { error: 'only normal web addresses (http or https) can be opened' };
    const b = { chrome: 'chrome', edge: 'msedge', firefox: 'firefox' }[norm(browser || '')];
    if (b) spawn('cmd.exe', ['/c', 'start', '', b, u.href], { windowsHide: true, detached: true, stdio: 'ignore' }).unref();
    else await shell.openExternal(u.href);
    log('open_url', `${u.href} browser=${b || 'default'}`);
    return { ok: true, opened: u.href };
  }

  async function web_search({ query, browser }) {
    if (!query) return { error: 'no search words given' };
    return open_url({ url: 'https://www.google.com/search?q=' + encodeURIComponent(query), browser });
  }

  async function press_shortcut({ keys, confirmed }) {
    const names = String(keys || '').toLowerCase().split('+').map((s) => s.trim()).filter(Boolean);
    const vks = names.map(vkOf);
    if (!names.length || vks.includes(null)) return { error: `I don't know the key combination "${keys}".` };
    const combo = names.join('+');
    if (BLOCKED_SHORTCUTS.has(combo)) { log('press_shortcut', `BLOCKED ${combo}`); return { error: `${combo} isn't allowed by voice yet.` }; }
    if (foregroundIsShell()) { log('press_shortcut', `BLOCKED(shell) ${combo}`); return { error: 'a terminal window is in front, so I will not send keys to it.' }; }
    if (names.some((n) => EDITING_KEYS.has(n)) || EDITING_COMBOS.has(combo)) { const gate = needsConfirmation(confirmed); if (gate) { log('press_shortcut', `NEEDS CONFIRMATION ${combo} -> ${gate.window}`); return gate; } }
    send([...vks.map((v) => key(v, false)), ...vks.slice().reverse().map((v) => key(v, true))]);
    log('press_shortcut', combo);
    return { ok: true, pressed: combo };
  }

  async function type_text({ text, confirmed }) {
    if (!text) return { error: 'nothing to type' };
    if (text.length > 2000) return { error: 'that is too much text to type at once' };
    if (foregroundIsShell()) { log('type_text', 'BLOCKED(shell)'); return { error: 'a terminal window is in front, so I will not type into it.' }; }
    const gate = needsConfirmation(confirmed);
    if (gate) { log('type_text', `NEEDS CONFIRMATION -> ${gate.window}`); return gate; }
    await typeUnicode(text);
    log('type_text', `${text.length} chars: ${text.slice(0, 24).replace(/\n/g, ' ')}${text.length > 24 ? '…' : ''}`);
    return { ok: true, typed_characters: text.length };
  }

  async function focus_window({ title }) {
    const q = norm(title || '');
    if (!q) return { error: 'no window name given' };
    const w = listWindows().find((x) => norm(x.title).includes(q));
    if (!w) return { error: `no open window matches "${title}"`, open_windows: listWindows().slice(0, 10).map((x) => x.title) };
    const ok = await focusHandle(w.h);
    log('focus_window', `${w.title} ok=${ok}`);
    return ok ? { ok: true, in_front: w.title } : { error: `Windows would not let me bring "${w.title}" to the front` };
  }

  // Put one app on the left and one on the right (or fill the whole screen). Finishes in milliseconds when the apps are open.
  async function arrange_windows({ left, right, left_percent, fullscreen }) {
    const names = [left, right].filter(Boolean);
    if (!names.length) return { error: 'say which app goes on the left and which on the right' };
    const found = [];
    for (const n of names) {
      let h = findWindowFor(n);
      if (!h) { const r = await open_app({ name: n }); if (r.error) return { error: `${n}: ${r.error}` }; await sleep(300); h = findWindowFor(n); }
      if (!h) return { error: `I couldn't find a window for "${n}"` };
      found.push(h);
    }
    const wa = new Array(1).fill(null).map(() => ({})); api.SystemParametersInfoW(0x30, 0, wa[0], 0); // work area: screen minus taskbar
    const { left: x0, top: y0, right: x1, bottom: y1 } = wa[0];
    const W = x1 - x0, H = y1 - y0;
    if (fullscreen || found.length === 1 && !right) { place(found[0], x0, y0, W, H); log('arrange_windows', `${names[0]} full`); return { ok: true, arranged: { full: titleOf(found[0]) } }; }
    const pct = Math.min(Math.max(Number(left_percent) || 50, 20), 80);
    const lw = Math.round(W * pct / 100);
    place(found[0], x0, y0, lw, H);
    place(found[1], x0 + lw, y0, W - lw, H);
    api.SetForegroundWindow(found[1]);
    log('arrange_windows', `${titleOf(found[0])} | ${titleOf(found[1])} at ${pct}%`);
    return { ok: true, arranged: { left: titleOf(found[0]), right: titleOf(found[1]) }, left_percent: pct };
  }

  async function list_windows() { return { windows: listWindows().slice(0, 30).map((x) => x.title) }; }

  async function media({ action, times }) {
    const map = { volume_up: 0xAF, volume_down: 0xAE, mute: 0xAD, play_pause: 0xB3, next: 0xB0, previous: 0xB1 };
    const vk = map[action];
    if (!vk) return { error: `unknown media action "${action}"` };
    const n = Math.min(Math.max(Number(times) || 1, 1), 20);
    for (let i = 0; i < n; i++) { send([key(vk, false), key(vk, true)]); await sleep(40); }
    log('media', `${action} x${n}`);
    return { ok: true, did: action, times: n };
  }

  return { open_app, open_url, web_search, press_shortcut, type_text, focus_window, arrange_windows, list_windows, media };
};
module.exports.low = low;
