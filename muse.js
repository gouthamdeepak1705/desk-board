// Muse bridge: keeps a hidden WhatsApp Web session (this app's own, signed in once by scanning a QR code)
// and exposes only the Muse conversation to the board: read the messages, send a message, press one of
// Muse's approval buttons. Nothing from any other chat is ever read out of the page or stored.
// Every action first checks that the open chat really is the Muse chat.
const WA_URL = 'https://web.whatsapp.com/';
const POLL_MS = 1500;
const SAME = `const same = (t) => String(t).replace(/[\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069\\ufeff]/g, '').trim().toLowerCase() === name;`;
const PRE = `${SAME}
  const main = document.querySelector('#main'), header = main && main.querySelector('header');
  const titleOf = () => header ? ((header.querySelector('span[title]') || {}).title || header.innerText.split('\\n')[0] || '') : '';`;

// Runs inside the WhatsApp page. `name` is the Muse contact name (lower case).
const SNAPSHOT = (name) => `(() => {
  const name = ${JSON.stringify(name)};
  ${PRE}
  const out = { phase: 'loading', title: document.title };
  const side = document.querySelector('#pane-side');
  if (!side) {
    const qr = document.querySelector('[data-ref] canvas') || [...document.querySelectorAll('canvas')].find((c) => c.width >= 100);
    if (qr) { try { out.phase = 'qr'; out.qr = qr.toDataURL(); } catch {} }
    return out;
  }
  const title = titleOf();
  if (!main || !same(title)) {
    // open the Muse chat from the list; only the title is compared, nothing else is read
    for (const s of side.querySelectorAll('span[title]')) {
      if (same(s.title)) {
        const row = s.closest('[role="listitem"],[role="row"],[data-testid="cell-frame-container"]') || s;
        for (const t of ['mousedown', 'mouseup', 'click']) row.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
        out.phase = 'opening'; return out;
      }
    }
    out.phase = 'no_chat'; out.dbg = { main: !!main, header: !!header, titleLen: title.length }; return out;
  }
  out.phase = 'ready'; out.chat = title;
  const reviewBtn = [...main.querySelectorAll('footer button')].find((b) => (b.innerText || '').trim().toLowerCase() === 'review');
  if (reviewBtn) out.approval = true; // something is waiting for the user's approval
  const rows = [...main.querySelectorAll('[data-id]')].filter((e) => e.querySelector('[data-testid="msg-container"]')).slice(-40);
  const mr = main.getBoundingClientRect(), centre = mr.left + mr.width / 2;
  out.messages = rows.map((r) => {
    const id = r.getAttribute('data-id');
    const box = r.querySelector('[data-testid="msg-container"]');
    const metaEl = r.querySelector('[data-testid="msg-meta"]');
    // who sent it: WhatsApp marks the bubble tail (out = you, in = Muse); inside a run of messages, use which side the text sits on
    const probe = r.querySelector('span.selectable-text, [data-testid="selectable-text"]') || box;
    const pr = probe.getBoundingClientRect();
    const mine = r.querySelector('[data-testid="tail-out"]') ? true : r.querySelector('[data-testid="tail-in"]') ? false : (mr.right - pr.right) < (pr.left - mr.left);
    const buttons = [...box.querySelectorAll('button, [role="button"]')].filter((b) => !b.closest('[data-testid="msg-meta"]'))
      .map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim())
      .filter((t, i, a) => t && t.length <= 40 && a.indexOf(t) === i && !/^(reply|forward|react|menu|more|play|download|pause)/i.test(t));
    // the text: everything in the bubble except the time stamp and the buttons
    let lines = (box.innerText || '').split('\\n').map((l) => l.trim());
    const stamp = metaEl ? (metaEl.innerText || '').split('\\n').map((l) => l.trim()).filter(Boolean) : [];
    lines = lines.filter((l) => l && !stamp.includes(l) && !buttons.includes(l));
    const media = !!box.querySelector('img[src^="blob:"], video, [data-icon*="audio"], [data-icon*="document"]');
    const body = lines.join('\\n');
    return { id, out: mine, text: body || (media ? '[attachment]' : ''), time: stamp[0] || '', buttons };
  }).filter((m) => m.text || m.buttons.length);
  return out;
})()`;


// Check the Muse chat is the open one, then type into the composer and press send.
const SEND = (name, text) => `(() => {
  const name = ${JSON.stringify(name)}, text = ${JSON.stringify(text)};
  ${PRE}
  if (!same(titleOf())) return { error: 'the Muse chat is not open' };
  const box = main.querySelector('footer [contenteditable="true"]');
  if (!box) return { error: 'could not find the message box' };
  box.focus();
  document.execCommand('selectAll', false); document.execCommand('delete', false);
  document.execCommand('insertText', false, text);
  return { ok: true };
})()`;
const PRESS_SEND = `(() => {
  const b = document.querySelector('#main footer button[aria-label="Send"], #main footer [data-icon="send"], #main footer span[data-icon="wds-ic-send-filled"]');
  if (!b) return false;
  (b.closest('button') || b).click(); return true;
})()`;

const CLICK = (name, id, label) => `(() => {
  const name = ${JSON.stringify(name)}, id = ${JSON.stringify(id)}, label = ${JSON.stringify(label)};
  ${PRE}
  if (!same(titleOf())) return { error: 'the Muse chat is not open' };
  const row = [...main.querySelectorAll('[data-id]')].find((e) => e.getAttribute('data-id') === id);
  if (!row) return { error: 'that message is no longer on screen' };
  const b = [...row.querySelectorAll('button, [role="button"]')].find((x) => (x.innerText || x.getAttribute('aria-label') || '').trim() === label);
  if (!b) return { error: 'that button is gone' };
  for (const t of ['mousedown', 'mouseup', 'click']) b.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
  return { ok: true };
})()`;

// When PIP needs approval, WhatsApp swaps the message box for a "Review" button. That opens a screen with
// what is waiting and the real choices (named after the action, for example "Send" and "Don't send").
const REVIEW = (name) => `(async () => {
  const name = ${JSON.stringify(name)};
  ${PRE}
  if (!same(titleOf())) return { error: 'the Muse chat is not open' };
  const b = [...main.querySelectorAll('footer button')].find((x) => (x.innerText || '').trim().toLowerCase() === 'review');
  if (!b) return { error: 'nothing is waiting for approval' };
  for (const t of ['mousedown', 'mouseup', 'click']) b.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const d = document.querySelector('[role="dialog"]');
    if (!d) continue;
    const btns = [...d.querySelectorAll('button')].map((x) => (x.innerText || x.getAttribute('aria-label') || '').trim()).filter(Boolean);
    const labels = new Set(btns);
    const text = (d.innerText || '').split('\\n').map((l) => l.trim()).filter((l) => l && !labels.has(l) && !/^see details/i.test(l)).join('\\n');
    // one-off choices only: standing permissions ("always allow ...") stay in WhatsApp itself
    return { ok: true, text, decisions: btns.filter((t) => !/^(close|see details)/i.test(t) && !/always|don.?t ask|remember|allow all/i.test(t)) };
  }
  return { error: 'the review screen did not open' };
})()`;

const DECIDE = (name, label) => `(() => {
  const name = ${JSON.stringify(name)}, label = ${JSON.stringify(label)};
  ${PRE}
  if (!same(titleOf())) return { error: 'the Muse chat is not open' };
  const d = document.querySelector('[role="dialog"]');
  if (!d) return { error: 'the review screen is not open' };
  if (/^(close|see details)/i.test(label) || /always|don.?t ask|remember|allow all/i.test(label)) return { error: 'that is not a one-off decision' };
  const b = [...d.querySelectorAll('button')].find((x) => (x.innerText || x.getAttribute('aria-label') || '').trim() === label);
  if (!b) return { error: 'that choice is not available' };
  for (const t of ['mousedown', 'mouseup', 'click']) b.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
  return { ok: true };
})()`;

const CLOSE_REVIEW = `(() => {
  const d = document.querySelector('[role="dialog"]');
  const c = d && [...d.querySelectorAll('button')].find((x) => /^close$/i.test((x.innerText || x.getAttribute('aria-label') || '').trim()));
  if (c) c.click(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
  return true;
})()`;

module.exports = function createMuse({ BrowserWindow, screen, settings, onState, onIncoming, logPath }) {
  const fs = require('fs');
  let lastPhase = '', noChatSince = 0, lastOpen = 0, numberKnown = false, approvalSeen = true; // true at start: only approvals that appear later raise a notification
  const logPhase = (p, extra = '') => { if (p === lastPhase) return; lastPhase = p; try { fs.appendFileSync(logPath, `${new Date().toISOString()}  ${p} ${extra}
`); } catch {} }; // phases only, never message text
  let win = null, timer = null, visible = false;
  let state = { phase: 'off', messages: [] };
  let seen = null; // ids of messages already known, so only genuinely new ones raise a notification

  const nameOf = () => String(settings().museChat || 'Muse').toLowerCase();
  let lastJson = '';
  const push = (s) => { state = s; logPhase(s.phase, s.chat ? '(chat found)' : ''); const j = JSON.stringify(publicState()); if (j === lastJson) return; lastJson = j; onState(publicState()); };
  const publicState = () => ({ phase: state.phase, qr: state.qr, chat: state.chat, messages: state.messages || [], approval: !!state.approval, setup: visible });

  function create(show) {
    visible = !!show;
    const { workArea } = screen.getPrimaryDisplay();
    win = new BrowserWindow({
      width: 1100, height: 780, show: false, skipTaskbar: true, title: 'WhatsApp for Muse',
      webPreferences: { partition: 'persist:muse', backgroundThrottling: false, contextIsolation: true, sandbox: true, offscreen: !show },
    });
    win.setMenuBarVisibility(false);
    const wc = win.webContents;
    // WhatsApp Web only serves recognised browsers
    wc.setUserAgent(`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome.split('.')[0]}.0.0.0 Safari/537.36`);
    const ses = wc.session;
    ses.setPermissionRequestHandler((_w, _p, cb) => cb(false));
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('will-navigate', (e, url) => { if (!/^https:\/\/web\.whatsapp\.com\//.test(url)) e.preventDefault(); });
    if (!show) wc.setFrameRate(2);
    if (show) { win.center(); win.show(); }
    const mine = win;
    win.on('closed', () => {
      if (win !== mine) return; // replaced by a newer window
      win = null;
      if (visible) { visible = false; start(); } // setup window closed: go back to the hidden session
      else { clearInterval(timer); timer = null; push({ phase: 'off', messages: [] }); }
    });
    wc.loadURL(WA_URL).catch(() => push({ phase: 'error', messages: [], error: 'could not reach WhatsApp Web' }));
  }

  const numFile = require('path').join(require('path').dirname(logPath), 'muse-chat.json');
  const savedNumber = () => { try { return JSON.parse(fs.readFileSync(numFile, 'utf8')).number || ''; } catch { return ''; } };
  function learnNumber(msgs) {
    const m = (msgs || []).map((x) => /^(?:true|false)_(\d{6,16})@/.exec(x.id)).find(Boolean);
    if (m) { numberKnown = true; if (savedNumber() !== m[1]) { try { fs.writeFileSync(numFile, JSON.stringify({ number: m[1] })); } catch {} } }
  }

  async function poll() {
    if (!win || win.isDestroyed()) return;
    try {
      const r = await win.webContents.executeJavaScript(SNAPSHOT(nameOf()));
      if (r.phase === 'ready') {
        const msgs = r.messages || [];
        if (seen === null) seen = new Set(msgs.map((m) => m.id)); // first look: everything already there is old
        else for (const m of msgs) if (!seen.has(m.id)) { seen.add(m.id); if (!m.out) onIncoming(m); }
      }
      if (r.phase === 'ready' && !numberKnown) learnNumber(r.messages);
      if (r.phase === 'no_chat') {
        logPhase('no_chat', JSON.stringify(r.dbg || {}));
        noChatSince = noChatSince || Date.now();
        const n = savedNumber();
        // open the remembered Muse chat directly by its number; no chat list is read
        if (n && !visible && Date.now() - lastOpen > 20000) { lastOpen = Date.now(); win.webContents.loadURL(`${WA_URL}send?phone=${n}`).catch(() => {}); }
        if (Date.now() - noChatSince < 25000) r.phase = 'opening';
      } else noChatSince = 0;
      if (r.approval && !approvalSeen) onIncoming({ out: false, text: 'Open the Muse box to review it.', buttons: ['review'] });
      approvalSeen = !!r.approval;
      push({ phase: r.phase, qr: r.qr, chat: r.chat, messages: r.messages || [], approval: !!r.approval });
    } catch (e) { logPhase('poll-error', String(e && e.message || e).slice(0, 120)); }
  }

  function start() {
    if (win && !win.isDestroyed()) return;
    create(false);
    clearInterval(timer); timer = setInterval(poll, POLL_MS);
    push({ phase: 'loading', messages: [] });
  }

  // Show the real WhatsApp window for first-time setup or when the chat cannot be found automatically
  function setup() {
    const old = win; win = null;
    if (old && !old.isDestroyed()) old.destroy();
    create(true);
    clearInterval(timer); timer = setInterval(poll, POLL_MS);
    push({ phase: 'loading', messages: [] });
  }
  function endSetup() { if (win && !win.isDestroyed() && visible) win.close(); }

  async function send(text) {
    if (!win || win.isDestroyed()) return { error: 'Muse is not connected' };
    text = String(text || '').replace(/\r?\n/g, ' ').trim().slice(0, 2000);
    if (!text) return { error: 'nothing to send' };
    const r = await win.webContents.executeJavaScript(SEND(nameOf(), text));
    if (r.error) return r;
    await new Promise((res) => setTimeout(res, 150));
    const ok = await win.webContents.executeJavaScript(PRESS_SEND);
    if (!ok) return { error: 'could not press send' };
    setTimeout(poll, 600);
    return { ok: true };
  }

  async function press(id, label) {
    if (!win || win.isDestroyed()) return { error: 'Muse is not connected' };
    const r = await win.webContents.executeJavaScript(CLICK(nameOf(), String(id), String(label)));
    setTimeout(poll, 600);
    return r;
  }

  // Approval flow: open the review screen and read it, choose one of its options (only ever on the user's click), or close it
  async function review() {
    if (!win || win.isDestroyed()) return { error: 'Muse is not connected' };
    return win.webContents.executeJavaScript(REVIEW(nameOf()));
  }
  async function decide(label) {
    if (!win || win.isDestroyed()) return { error: 'Muse is not connected' };
    const r = await win.webContents.executeJavaScript(DECIDE(nameOf(), String(label)));
    setTimeout(poll, 800);
    return r;
  }
  async function closeReview() {
    if (win && !win.isDestroyed()) await win.webContents.executeJavaScript(CLOSE_REVIEW);
    return { ok: true };
  }

  const stop = () => { clearInterval(timer); timer = null; visible = false; try { win && !win.isDestroyed() && win.destroy(); } catch {} };
  return { start, setup, endSetup, send, press, review, decide, closeReview, stop, state: publicState };
};
