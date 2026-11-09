// Screenshot-free control of apps through Windows UI Automation: read the controls of a window as a
// short text list, then click or fill them by name or number. Each call takes well under a second,
// so the realtime voice model can drive an app directly. Works for native apps and (through Chrome's
// accessibility tree) web pages; custom-drawn apps and games expose nothing, so use computer_task there.
const { spawn } = require('child_process');
const path = require('path');

module.exports = function createUiAuto({ low }) {
  let proc = null, buf = '', seq = 0;
  const pending = new Map();

  function ensure() {
    if (proc) return;
    proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'uia-helper.ps1')], { windowsHide: true });
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        try { const m = JSON.parse(line); const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.t); p.resolve(m); } } catch {}
      }
    });
    proc.on('exit', () => { proc = null; buf = ''; for (const p of pending.values()) { clearTimeout(p.t); p.resolve({ ok: false, error: 'the control reader stopped' }); } pending.clear(); });
  }

  function request(cmd, args = {}, timeout = 12000) {
    ensure();
    return new Promise((resolve) => {
      const id = ++seq;
      const t = setTimeout(() => { pending.delete(id); resolve({ ok: false, error: `${cmd} timed out (the window may be very large or busy)` }); }, timeout);
      pending.set(id, { resolve, t });
      proc.stdin.write(JSON.stringify({ id, cmd, ...args }) + '\n');
    });
  }

  const shellGuard = () => (low.foregroundIsShell() ? 'a terminal window is in front, so I will not operate it' : null);

  async function ui_read({ window, include_text, max } = {}) {
    if (!window) { const e = shellGuard(); if (e) return { error: e }; }
    const t0 = Date.now();
    const r = await request('read', { window, text: include_text !== false, max: max || 60 });
    if (!r.ok) return { error: r.error };
    low.log('ui_read', `${r.window} -> ${r.shown}/${r.total} controls, ${Date.now() - t0} ms`);
    // compact one-line-per-control text keeps the voice model's context small
    const lines = (r.elements || []).map((e) => `${e.i}|${e.type}|${String(e.name || '').slice(0, 70)}${e.enabled ? '' : '|disabled'}`);
    return { window: r.window, controls: lines.join('\n'), shown: r.shown, note: r.shown === 0 ? 'No readable controls here (custom-drawn app, game or canvas). Use computer_task instead.' : 'Format: number|type|name. Click or fill by number or name.' };
  }

  async function click_one({ index, name, window }) {
    const r = await request('click', { index, name, window });
    if (!r.ok) return { error: r.error };
    if (r.method === 'needs_mouse') { // control has no click action of its own: click its centre
      low.moveTo(r.x, r.y); await low.sleep(50); low.mouseButton('left', true); await low.sleep(40); low.mouseButton('left', false);
    }
    low.log('ui_click', `${r.clicked} via ${r.method}`);
    return { ok: true, clicked: r.clicked, method: r.method };
  }

  // One name/number, or several in a row ("names": ["One", "Seven", "Multiply by", ...]) in a single call
  async function ui_click({ index, name, names, window }) {
    if (Array.isArray(names) && names.length) {
      const done = [];
      for (const n of names.slice(0, 40)) {
        const r = await click_one({ name: String(n), window });
        if (r.error) return { error: r.error, clicked_so_far: done };
        done.push(r.clicked);
        await low.sleep(40);
      }
      return { ok: true, clicked: done };
    }
    return click_one({ index, name, window });
  }

  async function ui_type({ index, name, text, submit }) {
    if (text === undefined) return { error: 'no text given' };
    const e = shellGuard(); if (e) return { error: e };
    const r = await request('set', { index, name, text });
    if (!r.ok) return { error: r.error };
    if (r.method === 'needs_typing') { await low.sleep(80); await low.typeText(String(text)); }
    if (submit) { await low.sleep(60); low.pressKeys(['enter']); }
    low.log('ui_type', `${r.set} via ${r.method}${submit ? ' + enter' : ''}`);
    return { ok: true, filled: r.set, method: r.method, submitted: !!submit };
  }

  return { ui_read, ui_click, ui_type, stop: () => { try { proc && proc.kill(); } catch {} } };
};
