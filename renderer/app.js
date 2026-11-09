const HEX = { gray: '#8b949e', blue: '#58a6ff', teal: '#39c5cf', green: '#3fb950', yellow: '#d29922', orange: '#db6d28', red: '#f85149', purple: '#bc8cff', pink: '#f778ba' };
const ALIAS = { slate: 'gray', amber: 'yellow', rose: 'red' };
const COLORS = Object.keys(HEX);
const BORDERS = ['solid', 'dashed', 'accent', 'none'];
const BORDER_ALIAS = { left: 'accent', glow: 'accent' };
const OLD_SIZES = { small: [340, 160], medium: [340, 240], tall: [340, 420], wide: [700, 240], large: [700, 420] };
const GRID = 8, GAP = 16, MIN_W = 180, MIN_H = 90;

const $ = (id) => document.getElementById(id);
const state = { notes: [], events: [], layout: {}, month: new Date(), selected: null, query: '', busy: false };
let editing = 0, dragging = false, zTop = 10;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const colorName = (c) => { c = ALIAS[c] || c; return HEX[c] ? c : 'blue'; };
const colorOf = (c) => HEX[ALIAS[c] || c] || (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : HEX.blue);
const snap = (v) => Math.round(v / GRID) * GRID;

// ---------- tiny markdown ----------
function inline(s) {
  return esc(s).replace(/!\[([^\]]*)\]\(images\/([\w.-]+)\)/g, '<img class="nimg" data-file="$2" alt="$1">').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|\W)\*([^*]+)\*/g, '$1<i>$2</i>');
}
function md(text) {
  let html = '', list = false;
  const close = () => { if (list) { html += '</ul>'; list = false; } };
  String(text ?? '').split('\n').forEach((ln, i) => {
    let m;
    if ((m = ln.match(/^\s*- \[( |x|X)\] (.*)$/))) {
      close(); const done = m[1].toLowerCase() === 'x';
      html += `<label class="chk ${done ? 'done' : ''}" data-line="${i}"><input type="checkbox" ${done ? 'checked' : ''}><span>${inline(m[2])}</span></label>`;
    } else if ((m = ln.match(/^\s*[-*] (.*)$/))) { if (!list) { html += '<ul>'; list = true; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = ln.match(/^#{1,3} (.*)$/))) { close(); html += `<h2>${inline(m[1])}</h2>`; }
    else if (!ln.trim()) close();
    else { close(); html += `<p>${inline(ln)}</p>`; }
  });
  close(); return html;
}

// ---------- layout / geometry ----------
// The Apps strip runs as its own window (?view=apps) that shows only the apps panel
if (new URLSearchParams(location.search).get('view') === 'apps') document.body.classList.add('apps-only');
const cv = () => $('canvas');
const SYS = ['calendar', 'agenda', 'apps', 'chat', 'muse', 'memory'];
function defaultSys() {
  const W = cv().clientWidth, H = cv().clientHeight;
  const cw = 360, calH = 392, left = 16 + cw + GAP;
  const chatW = Math.min(920, W - left - GAP), chatH = 340;
  return {
    calendar: { x: 16, y: 16, w: cw, h: calH },
    agenda: { x: 16, y: 16 + calH + GAP, w: cw, h: Math.max(160, H - (16 + calH + GAP) - 16) },
    apps: { x: snap(W - cw - 16), y: 16, w: cw, h: H - 32 },
    chat: { x: snap(left + (W - left - GAP - chatW) / 2), y: snap(H - chatH - 16), w: chatW, h: chatH },
    muse: { x: snap(W - cw * 2 - 32), y: 16, w: cw, h: Math.min(720, H - 32) },
    memory: { x: snap(W - cw * 3 - 48), y: 16, w: cw, h: Math.min(720, H - chatH - 48) }, // left of Muse, above the chat
  };
}
function sysRect(k) { return state.layout[k]; }
function applyRect(el, r) {
  el.style.left = r.x + 'px'; el.style.top = r.y + 'px'; el.style.width = r.w + 'px';
  if (!el.classList.contains('collapsed')) el.style.height = r.h + 'px';
  if (r.z) el.style.zIndex = r.z;
}
let layoutTimer;
const saveLayout = () => { clearTimeout(layoutTimer); layoutTimer = setTimeout(() => window.board.saveLayout(state.layout), 200); };
const saveNote = (n) => window.board.saveNote(n);

const overlaps = (a, b, gap = GAP) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
function obstacles(except) {
  const r = SYS.map((k) => state.layout[k]).filter(Boolean);
  for (const n of state.notes) if (n !== except && typeof n.x === 'number' && typeof n.y === 'number') r.push({ x: n.x, y: n.y, w: n.w, h: n.h });
  return r;
}
function place(n) {
  if (!n.w || !n.h) { const s = OLD_SIZES[n.size] || [360, 240]; n.w = n.w || s[0]; n.h = n.h || s[1]; }
  const W = cv().clientWidth, H = cv().clientHeight, obs = obstacles(n);
  // scan top-to-bottom, left-to-right for the first free spot
  for (let y = 16; y + n.h <= H - 8; y += GRID)
    for (let x = 16; x + n.w <= W - 8; x += GRID)
      if (!obs.some((o) => overlaps({ x, y, w: n.w, h: n.h }, o))) { n.x = x; n.y = y; return; }
  n.x = snap(40 + (state.notes.indexOf(n) % 10) * 24); n.y = snap(40 + (state.notes.indexOf(n) % 10) * 24); // nothing free: cascade
}
function ensureLayout() {
  const d = defaultSys();
  for (const k of SYS) if (!state.layout[k] || typeof state.layout[k].x !== 'number') state.layout[k] = { ...d[k] };
}
function placeMissing() {
  for (const n of state.notes) {
    if (typeof n.x !== 'number' || typeof n.y !== 'number' || !n.w || !n.h) { place(n); saveNote(n); }
    n.z = n.z || 1; zTop = Math.max(zTop, n.z);
  }
  for (const k of SYS) zTop = Math.max(zTop, state.layout[k].z || 0);
}

// generic drag / resize / raise
function bindPanel(el, header, get, commit) {
  const rect = () => get();
  el.addEventListener('pointerdown', () => {
    document.querySelectorAll('.pop').forEach((p) => p.remove());
    const r = rect(); if ((r.z || 0) < zTop) { r.z = ++zTop; el.style.zIndex = r.z; commit(false); }
  }, true);
  header.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button, input, textarea, .sq')) return;
    const r = rect(), sx = e.clientX, sy = e.clientY, ox = r.x, oy = r.y;
    dragging = true; el.classList.add('drag'); header.setPointerCapture(e.pointerId);
    const mv = (ev) => {
      const W = cv().clientWidth, H = cv().clientHeight;
      r.x = Math.min(W - 80, Math.max(80 - r.w, snap(ox + ev.clientX - sx)));
      r.y = Math.min(H - 30, Math.max(0, snap(oy + ev.clientY - sy)));
      applyRect(el, r);
    };
    const up = () => { header.removeEventListener('pointermove', mv); header.removeEventListener('pointerup', up); dragging = false; el.classList.remove('drag'); commit(true); };
    header.addEventListener('pointermove', mv); header.addEventListener('pointerup', up);
  });
  const rz = el.querySelector('.rz');
  rz.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const r = rect(), sx = e.clientX, sy = e.clientY, ow = r.w, oh = r.h;
    dragging = true; rz.setPointerCapture(e.pointerId);
    const mv = (ev) => { r.w = Math.max(MIN_W, snap(ow + ev.clientX - sx)); r.h = Math.max(MIN_H, snap(oh + ev.clientY - sy)); applyRect(el, r); };
    const up = () => { rz.removeEventListener('pointermove', mv); rz.removeEventListener('pointerup', up); dragging = false; commit(true); };
    rz.addEventListener('pointermove', mv); rz.addEventListener('pointerup', up);
  });
}

// ---------- header ----------
function tick() {
  const d = new Date();
  $('clock').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}  ${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}`;
}
function renderStat() {
  const today = ymd(new Date()), n = state.events.filter((e) => e.date === today).length;
  $('stat').textContent = `${state.notes.length} note${state.notes.length === 1 ? '' : 's'} · ${n} event${n === 1 ? '' : 's'} today`;
}

// ---------- calendar ----------
const eventsOn = (d) => state.events.filter((e) => e.date === d).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
function renderCal() {
  const m = state.month, y = m.getFullYear(), mo = m.getMonth();
  $('calTitle').textContent = m.toLocaleDateString([], { month: 'short', year: 'numeric' }).toLowerCase();
  $('calDow').innerHTML = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'].map((d) => `<div>${d}</div>`).join('');
  const start = new Date(y, mo, 1 - new Date(y, mo, 1).getDay()), today = ymd(new Date());
  let html = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const k = ymd(d), evs = eventsOn(k);
    html += `<div class="cd ${d.getMonth() !== mo ? 'dim' : ''} ${k === today ? 'today' : ''} ${k === state.selected ? 'sel' : ''}" data-d="${k}">${d.getDate()}${evs.length ? `<span class="dots">${evs.slice(0, 3).map((e) => `<i style="--ec:${colorOf(e.color)}"></i>`).join('')}</span>` : ''}</div>`;
  }
  $('calGrid').innerHTML = html;
}
const evHTML = (e) => `<div class="ev" style="--ec:${colorOf(e.color)}"><span class="t">${esc(e.start || 'all day')}</span><span>${esc(e.title)}</span><button class="x" data-id="${esc(e.id)}" title="Remove">×</button></div>`;
function renderAgenda() {
  const list = $('agendaList'), today = ymd(new Date());
  if (state.selected) {
    const evs = eventsOn(state.selected);
    $('agendaTitle').textContent = state.selected;
    list.innerHTML = evs.length ? evs.map(evHTML).join('') : '<div class="empty">nothing planned</div>';
    return;
  }
  $('agendaTitle').textContent = 'upcoming';
  const up = state.events.filter((e) => e.date >= today).sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || ''))).slice(0, 40);
  if (!up.length) { list.innerHTML = '<div class="empty">no upcoming events</div>'; return; }
  let html = '', last = '';
  for (const e of up) {
    if (e.date !== last) { last = e.date; html += `<div class="ag-day">${e.date === today ? 'today' : new Date(e.date + 'T00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</div>`; }
    html += evHTML(e);
  }
  list.innerHTML = html;
}

// ---------- notes ----------
function renderNotes() {
  cv().querySelectorAll('.panel:not(.sys)').forEach((e) => e.remove());
  const q = state.query.toLowerCase();
  for (const n of state.notes) cv().appendChild(noteEl(n, q));
}

function noteEl(n, q) {
  const el = document.createElement('article');
  const border = BORDERS.includes(n.border) ? n.border : (BORDER_ALIAS[n.border] || 'solid');
  el.className = `panel b-${border}`; el.dataset.id = n.id;
  el.style.setProperty('--c', colorOf(n.color));
  if (q && !`${n.title} ${n.body} ${n.category || ''}`.toLowerCase().includes(q)) el.classList.add('hidden');
  el.innerHTML = `<div class="ph"><span class="sq" title="Colour, border, delete"></span><input class="n-title" value="${esc(n.title)}" placeholder="untitled" spellcheck="false">${n.category ? `<span class="tag">#${esc(n.category)}</span>` : ''}</div><div class="pb note-body">${md(n.body)}</div><i class="rz"></i>`;
  applyRect(el, n);

  const head = el.querySelector('.ph'), body = el.querySelector('.pb'), title = el.querySelector('.n-title');
  bindPanel(el, head, () => n, (persist) => { saveNote(n); });

  // rename on double-click (single click-drag moves the note)
  head.addEventListener('dblclick', (e) => {
    if (e.target.closest('.sq')) return;
    title.classList.add('editing'); title.focus(); title.select();
  });
  title.addEventListener('focus', () => editing++);
  title.addEventListener('blur', () => { editing--; title.classList.remove('editing'); if (title.value !== n.title) { n.title = title.value; saveNote(n); } });
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') title.blur(); });

  body.addEventListener('click', (e) => {
    const chk = e.target.closest('.chk');
    if (chk) {
      e.preventDefault();
      const lines = n.body.split('\n'), i = +chk.dataset.line;
      lines[i] = /\[ \]/.test(lines[i]) ? lines[i].replace('[ ]', '[x]') : lines[i].replace(/\[[xX]\]/, '[ ]');
      n.body = lines.join('\n'); saveNote(n); body.innerHTML = md(n.body); return;
    }
    if (e.target.closest('img.nimg')) return; // a click on a picture does not open the text editor; double-click does
    startEdit();
  });
  body.addEventListener('dblclick', (e) => { if (e.target.closest('img.nimg')) startEdit(); });
  function startEdit() {
    if (body.querySelector('textarea')) return;
    editing++;
    const ta = document.createElement('textarea');
    ta.className = 'n-edit'; ta.value = n.body || ''; ta.spellcheck = false;
    body.innerHTML = ''; body.appendChild(ta); ta.focus();
    // finishing does not rely on a blur event: on the wallpaper the page may not hold keyboard focus
    let done = false;
    const finish = () => { if (done) return; done = true; editing--; n.body = ta.value; saveNote(n); body.innerHTML = md(n.body); refreshSoon(); };
    ta._finish = finish;
    ta.addEventListener('blur', finish);
    ta.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey))) finish(); });
  }

  el.querySelector('.sq').addEventListener('click', (e) => { e.stopPropagation(); openPop(el, n); });
  return el;
}

document.addEventListener('pointerdown', (e) => {
  const ta = document.querySelector('textarea.n-edit');
  if (ta && !e.target.closest('textarea.n-edit')) ta._finish();
}, true);

function openPop(el, n) {
  document.querySelectorAll('.pop').forEach((p) => p.remove());
  const cur = colorName(n.color), bor = BORDERS.includes(n.border) ? n.border : (BORDER_ALIAS[n.border] || 'solid');
  const p = document.createElement('div'); p.className = 'pop';
  p.innerHTML = `<div class="row"><span class="lbl">colour</span>${COLORS.map((c) => `<i class="cs ${c === cur ? 'on' : ''}" data-c="${c}" style="--c:${HEX[c]}"></i>`).join('')}</div>
    <div class="row"><span class="lbl">border</span>${BORDERS.map((b) => `<button class="opt ${b === bor ? 'on' : ''}" data-b="${b}">${b}</button>`).join('')}</div>
    <div class="row"><button class="del">delete note</button></div>`;
  p.addEventListener('pointerdown', (e) => e.stopPropagation());
  p.addEventListener('click', (e) => {
    const t = e.target;
    if (t.dataset.c) { n.color = t.dataset.c; saveNote(n); renderNotes(); }
    else if (t.dataset.b) { n.border = t.dataset.b; saveNote(n); renderNotes(); }
    else if (t.classList.contains('del')) {
      if (t.dataset.sure) { state.notes = state.notes.filter((x) => x !== n); window.board.deleteNote(n.id); renderNotes(); renderStat(); }
      else { t.dataset.sure = 1; t.textContent = 'click again to confirm'; }
    }
  });
  el.appendChild(p);
}

function newNote(x, y) {
  const n = { id: 'note-' + Date.now().toString(36), title: '', body: '', color: COLORS[state.notes.length % COLORS.length], border: 'solid', category: '', w: 360, h: 240, z: ++zTop, order: state.notes.length };
  if (typeof x === 'number') { n.x = Math.max(8, snap(x)); n.y = Math.max(8, snap(y)); } else place(n);
  state.notes.push(n); saveNote(n); renderNotes(); renderStat();
  const t = cv().querySelector(`[data-id="${n.id}"] .n-title`); if (t) { t.classList.add('editing'); t.focus(); }
}

function tidy() {
  const sorted = [...state.notes].sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9));
  sorted.forEach((n) => { delete n.x; delete n.y; });
  sorted.forEach((n) => { place(n); n.order = sorted.indexOf(n); saveNote(n); });
  state.notes = sorted; renderNotes();
}

// ---------- chat (terminal style) ----------
const chat = { botEl: null, botText: '', statusEl: null, collapsed: false, images: [] };
const TOOL_LABEL = (n) => /calendar/i.test(n) ? 'checking google calendar' : /Write|Edit|MultiEdit|NotebookEdit/.test(n) ? 'updating your board' : /Read|Glob|Grep|LS/.test(n) ? 'looking at your board' : /Web/.test(n) ? 'searching the web' : 'working';

function showHint() { $('chatLog').innerHTML = ''; }
const scrollLog = () => { const l = $('chatLog'); l.scrollTop = l.scrollHeight; };
function addMsg(cls, html, who) {
  $('chatLog').querySelector('.hint')?.remove();
  const d = document.createElement('div'); d.className = 'm ' + cls;
  d.innerHTML = `<span class="who">${esc(who)}</span><div class="txt">${html}</div>`;
  $('chatLog').appendChild(d); scrollLog(); return d.querySelector('.txt');
}
function setBusy(b) {
  state.busy = b; $('orb').classList.toggle('busy', b);
  const s = $('chatSend'); s.textContent = b ? 'stop' : 'run'; s.classList.toggle('stop', b);
}
function setStatus(t) {
  if (!chat.statusEl) { chat.statusEl = addMsg('stat', '', '·').parentElement; }
  chat.statusEl.querySelector('.txt').textContent = t; scrollLog();
}
const clearStatus = () => { chat.statusEl?.remove(); chat.statusEl = null; };

function sendChat(text) {
  text = (text ?? $('chatInput').value).trim();
  const imgs = chat.images.splice(0); renderChips();
  if ((!text && !imgs.length) || state.busy) { chat.images.push(...imgs); renderChips(); return; }
  if (!text) text = 'Here is an image.';
  $('chatInput').value = ''; autoGrow();
  addMsg('user', esc(text) + imgs.map((u) => `<img class="nimg-thumb" src="${u}">`).join(''), '>');
  chat.botEl = null; chat.botText = '';
  setBusy(true); setStatus('thinking'); window.board.chatSend(text, imgs);
}
// Pasted or dropped images wait above the chat box until sent; the board saves them and Claude can look at them
function addImageFiles(files) {
  for (const f of files) {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type) || f.size > 15e6 || chat.images.length >= 6) continue;
    const r = new FileReader(); r.onload = () => { chat.images.push(r.result); renderChips(); }; r.readAsDataURL(f);
  }
}
function renderChips() {
  const box = $('chatAttach'); box.textContent = ''; box.hidden = !chat.images.length;
  chat.images.forEach((u, i) => {
    const c = document.createElement('span'); c.className = 'chip';
    const im = document.createElement('img'); im.src = u;
    const x = document.createElement('button'); x.textContent = '×'; x.title = 'Remove';
    x.onclick = () => { chat.images.splice(i, 1); renderChips(); };
    c.append(im, x); box.appendChild(c);
  });
}
// Note images are files in data/images; they are loaded through the main process because the page may only show data: images
const imgCache = new Map();
function hydrateImages() {
  document.querySelectorAll('img.nimg[data-file]:not([src])').forEach(async (im) => {
    const f = im.dataset.file; let u = imgCache.get(f);
    if (!u) { u = await window.board.noteImage(f); if (u) imgCache.set(f, u); }
    if (u) im.src = u;
  });
}
new MutationObserver(hydrateImages).observe(document.documentElement, { childList: true, subtree: true });

window.board.onChat((m) => {
  if (m.kind === 'text') {
    clearStatus();
    if (!chat.botEl) { chat.botText = ''; chat.botEl = addMsg('bot', '', ''); }
    chat.botText += m.text; chat.botEl.innerHTML = md(chat.botText); scrollLog();
  } else if (m.kind === 'tool') setStatus(TOOL_LABEL(m.name));
  else if (m.kind === 'break') chat.botEl = null;
  else if (m.kind === 'done') {
    clearStatus();
    if (m.error && m.result) addMsg('err', esc(m.result), '!');
    if (!chat.botEl && !m.error && m.result) addMsg('bot', md(m.result), '');
  } else if (m.kind === 'closed') {
    clearStatus(); setBusy(false); chat.botEl = null;
    if (m.code) addMsg('err', 'something went wrong' + (m.err ? ': ' + esc(m.err) : '') + '. if it keeps happening, click “new”.', '!');
  }
});
// Blinking text cursor for the chat box, drawn by hand (see .fake-caret in style.css)
function setupFakeCaret(inputId = 'chatInput', caretId = 'fakeCaret') {
  const t = $(inputId), c = $(caretId), mirror = document.createElement('div');
  mirror.className = 'caret-mirror'; t.parentNode.appendChild(mirror);
  let last = '';
  function update(restart) {
    const on = document.activeElement === t;
    c.style.display = on ? 'block' : 'none';
    if (!on) { last = ''; return; }
    const cs = getComputedStyle(t);
    for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']) mirror.style[p] = cs[p];
    mirror.style.width = t.clientWidth + 'px';
    mirror.textContent = t.value.slice(0, t.selectionEnd);
    const m = document.createElement('span'); m.textContent = '​'; mirror.appendChild(m);
    const x = t.offsetLeft + m.offsetLeft - t.scrollLeft, y = t.offsetTop + m.offsetTop - t.scrollTop;
    c.style.left = x + 'px'; c.style.top = y + 'px';
    const key = x + ',' + y;
    if (restart || key !== last) { c.style.animation = 'none'; void c.offsetWidth; c.style.animation = ''; } // solid right after moving
    last = key;
  }
  for (const ev of ['input', 'keyup', 'keydown', 'mouseup', 'focus', 'blur', 'scroll']) t.addEventListener(ev, () => requestAnimationFrame(() => update(ev === 'input' || ev === 'keydown')));
  document.addEventListener('selectionchange', () => update());
  setInterval(update, 200); // focus can change without events while the window itself isn't active
}

function autoGrow() { const t = $('chatInput'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 140) + 'px'; }

// ---------- Muse box ----------
const APPROVE = /approve|yes|confirm|allow|go ahead|send it|book|buy|pay|^ok/i, REJECT = /reject|no\b|cancel|deny|decline|stop|don.t/i;
function setupMuse() {
  let cur = { phase: 'off', messages: [] }, busyMsg = '', rv = null; // rv: the open review screen (its text and choices)
  const body = $('museBody');
  function draw() {
    const stick = body.scrollHeight - body.scrollTop - body.clientHeight < 40;
    const note = (t) => { body.innerHTML = `<div class="m stat"><span class="who">·</span><div class="txt">${t}</div></div>`; };
    $('museStat').textContent = cur.phase === 'ready' ? '● connected' : '';
    $('museSetup').textContent = cur.setup ? 'done' : 'setup';
    $('musePrompt').style.display = cur.phase === 'ready' && !cur.approval ? '' : 'none'; // typing is paused while an approval waits
    if (cur.phase === 'off') return note('muse is off');
    if (cur.phase === 'loading' || cur.phase === 'opening') return note('connecting to whatsapp…');
    if (cur.phase === 'error') return note('could not reach whatsapp web');
    if (cur.phase === 'no_chat') return note('first-time step: click setup, open your PIP chat once in the whatsapp window that appears, then click done. after that it opens by itself.');
    if (cur.phase === 'qr') {
      body.innerHTML = `<div class="qr"><img src="${cur.qr}" alt="QR code"><div>to link: on your phone open whatsapp → settings → linked devices → link a device, then scan this.</div></div>`;
      return;
    }
    const lastIn = [...cur.messages].reverse().find((m) => !m.out);
    body.innerHTML = '';
    for (const m of cur.messages) {
      const d = document.createElement('div');
      const typed = !m.out && !m.buttons.length && m === lastIn ? /(?:say|reply|type|respond with)\s+["“'`]*(approve|yes|confirm|go ahead)\b/i.exec(m.text) : null; // Muse asks for approval in words
      const asks = !m.out && (m.buttons.length > 0 || !!typed);
      d.className = 'm ' + (m.out ? 'user' : 'muse') + (asks ? ' ask' : '');
      d.innerHTML = `<span class="who">${m.out ? '>' : 'm'}</span><div class="txt">${esc(m.text)}</div>`;
      if (asks) {
        const row = document.createElement('div'); row.className = 'ask-btns';
        for (const label of (typed ? [typed[1].toLowerCase(), 'reject'] : m.buttons)) {
          const b = document.createElement('button');
          b.className = 'ab ' + (REJECT.test(label) ? 'no' : APPROVE.test(label) ? 'yes' : '');
          b.textContent = label;
          if (m === lastIn) b.onclick = async () => {
            b.disabled = true;
            const r = typed ? await window.board.museSend(label === 'reject' ? "No, don't do that. Cancel it." : typed[1]) : await window.board.musePress(m.id, label);
            if (r && r.error) { busyMsg = r.error; draw(); }
          };
          else b.disabled = true;
          row.appendChild(b);
        }
        d.querySelector('.txt').appendChild(row);
      }
      body.appendChild(d);
    }
    if (busyMsg) { const e = document.createElement('div'); e.className = 'm err'; e.innerHTML = `<span class="who">!</span><div class="txt">${esc(busyMsg)}</div>`; body.appendChild(e); }
    if (cur.approval) { // PIP is waiting: show what it wants and the real choices. Only a click here decides anything.
      const d = document.createElement('div'); d.className = 'm ask';
      d.innerHTML = '<span class="who">!</span><div class="txt"><b>pip needs your approval</b></div>';
      const t = d.querySelector('.txt'), row = document.createElement('div'); row.className = 'ask-btns';
      if (!rv) {
        const b = document.createElement('button'); b.className = 'ab'; b.textContent = 'review';
        b.onclick = async () => { b.disabled = true; b.textContent = 'opening…'; const r = await window.board.museReview(); if (r && r.error) busyMsg = r.error; else rv = r; draw(); };
        row.appendChild(b);
      } else {
        const p = document.createElement('div'); p.className = 'rv-text'; p.textContent = rv.text; t.appendChild(p);
        for (const label of rv.decisions) {
          const b = document.createElement('button');
          b.className = 'ab ' + (/don.?t|reject|deny|cancel|\bno\b|skip|discard/i.test(label) ? 'no' : 'yes');
          b.textContent = label;
          b.onclick = async () => { row.querySelectorAll('button').forEach((x) => { x.disabled = true; }); const r = await window.board.museDecide(label); rv = null; if (r && r.error) busyMsg = r.error; draw(); };
          row.appendChild(b);
        }
        const c = document.createElement('button'); c.className = 'ab'; c.textContent = 'close';
        c.onclick = async () => { rv = null; await window.board.museCloseReview(); draw(); };
        row.appendChild(c);
      }
      t.appendChild(row); body.appendChild(d);
    }
    if (stick || cur.approval) body.scrollTop = body.scrollHeight;
  }
  async function send() {
    const t = $('museInput'), text = t.value.trim();
    if (!text) return;
    t.value = ''; t.style.height = 'auto'; busyMsg = '';
    const r = await window.board.museSend(text);
    if (r && r.error) { busyMsg = r.error; draw(); }
  }
  $('museSend').onclick = send;
  $('museInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  $('museInput').addEventListener('input', () => { const t = $('museInput'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 100) + 'px'; });
  $('museSetup').onclick = () => window.board.museSetup();
  window.board.onMuse((s) => { cur = s; busyMsg = ''; if (!s.approval) rv = null; draw(); });
  window.board.museState().then((s) => { cur = s; draw(); });
}

// ---------- Memory panel ----------
// Shows what the assistant remembers and lets the user fix it. All text comes from the memory store (it can hold
// email/web content), so it is only ever inserted with textContent.
function setupMemory() {
  let tab = 'known', st = null, off = false, armed = '', ent = null; // armed: the fact whose forget awaits a second click
  const open = new Map(); // fact id -> sources shown under it
  const body = $('memBody');
  const call = async (op, args) => { try { const r = await window.board.memory(op, args || {}); if (r && r.error === 'memory is off') off = true; else off = false; return r; } catch { off = true; return { error: 'memory is off' }; } };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (label, cls, fn) => { const b = el('button', 'ab ' + cls, label); b.onclick = () => fn(b); return b; };
  const note = (t) => body.replaceChildren(el('div', 'empty', t));

  function row(f, mode) {
    const d = el('div', 'mf' + (f.pinned ? ' pinned' : ''));
    d.appendChild(el('div', 'txt', f.text));
    d.appendChild(el('div', 'meta', [f.kind, f.date, f.from && f.from !== 'user' ? 'from ' + f.from : ''].filter(Boolean).join(' · ')));
    const acts = el('div', 'acts');
    if (mode === 'review') acts.appendChild(btn('confirm', 'yes', async () => { await call('confirm', { id: f.id }); refresh(); }));
    acts.appendChild(btn('why', '', async () => {
      if (open.has(f.id)) open.delete(f.id); else { const w = await call('why', { id: f.id }); open.set(f.id, w.error ? [{ when: '', from: '', said: w.error }] : w.sources); }
      draw();
    }));
    if (mode === 'known') acts.appendChild(btn(f.pinned ? 'unpin' : 'pin', '', async () => { await call('pin', { id: f.id, on: !f.pinned }); refresh(); }));
    acts.appendChild(btn(armed === f.id ? 'sure? forget' : 'forget', 'no', async () => {
      if (armed !== f.id) { armed = f.id; draw(); setTimeout(() => { if (armed === f.id) { armed = ''; draw(); } }, 4000); return; }
      armed = ''; open.delete(f.id); await call('forget', { id: f.id }); refresh();
    }));
    d.appendChild(acts);
    if (open.has(f.id)) {
      const srcs = open.get(f.id);
      if (!srcs.length) d.appendChild(el('div', 'src', 'no recorded source (you added it directly)'));
      for (const s of srcs) d.appendChild(el('div', 'src', [s.when, s.from].filter(Boolean).join(' · ') + (s.said ? '\n“' + s.said + '”' : '')));
    }
    return d;
  }

  function draw() {
    const pause = $('memPause');
    $('memTabs').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    if (off || !st || st.error) {
      $('memCount').textContent = ''; pause.style.display = 'none';
      return note('memory is off');
    }
    pause.style.display = ''; pause.textContent = st.paused ? 'resume' : 'pause'; pause.classList.toggle('paused', !!st.paused);
    $('memCount').textContent = `${st.paused ? '⏸ ' : ''}${st.facts} facts · ${st.unconfirmed} to review · ${st.episodes} pieces`;
    const rows = tab === 'review' ? lists.quarantined : tab === 'known' ? lists.active : [];
    if (tab === 'people') {
      if (ent) {
        const back = el('button', 'ib', '← all'); back.onclick = () => { ent = null; draw(); };
        const frag = [back, el('div', 'meta', ent.entity || '')];
        for (const f of ent.facts || []) frag.push(row({ id: f.id, text: f.text, kind: f.kind, date: '', pinned: false }, f.status === 'quarantined' ? 'review' : 'ent'));
        if (!(ent.facts || []).length) frag.push(el('div', 'empty', 'nothing recorded'));
        return body.replaceChildren(...frag);
      }
      if (!lists.entities.length) return note('no people or projects yet');
      return body.replaceChildren(...lists.entities.map((e) => {
        const b = el('span', 'mem-ent', e.name); b.title = e.type || '';
        b.appendChild(el('i', '', String(e.n)));
        b.onclick = async () => { ent = await call('entityFacts', { name: e.name }); if (ent.error) ent = { entity: e.name, facts: [] }; draw(); };
        return b;
      }));
    }
    if (!rows.length) return note(tab === 'review' ? 'nothing waiting for review' : 'nothing remembered yet');
    const keep = body.scrollTop;
    body.replaceChildren(...rows.map((f) => row(f, tab)));
    body.scrollTop = keep;
  }

  let lists = { active: [], quarantined: [], entities: [] };
  async function refresh() {
    st = await call('stats');
    if (off || st.error) return draw();
    const [a, q, g] = await Promise.all([call('list', { status: 'active', limit: 100 }), call('list', { status: 'quarantined', limit: 100 }), call('graph', { limit: 60 })]);
    lists = { active: Array.isArray(a) ? a : [], quarantined: Array.isArray(q) ? q : [], entities: g && g.entities ? g.entities : [] };
    draw();
  }

  $('memTabs').onclick = (e) => { const t = e.target.closest('button')?.dataset.tab; if (!t) return; tab = t; ent = null; draw(); };
  $('memPause').onclick = async () => { await call('setPaused', { on: !st.paused }); refresh(); };
  async function add() {
    const t = $('memInput'), text = t.value.trim(); if (!text) return;
    t.value = ''; const r = await call('remember', { text });
    if (r && r.error) { t.value = text; return note(off ? 'memory is off' : String(r.error)); }
    tab = 'known'; refresh();
  }
  $('memAdd').onclick = add;
  $('memInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  refresh();
  setInterval(() => { if (!document.hidden && !$('p-memory').classList.contains('hidden') && !dragging) refresh(); }, 20000);
}

// ---------- boot ----------
let lastKey = '';
const keyOf = (d) => JSON.stringify([d.notes.map(({ updated, ...n }) => n), d.events, d.layout, d.config]);
function apply(data, force) {
  if (!force && (editing > 0 || dragging)) return;
  const key = keyOf(data);
  if (!force && key === lastKey) return;
  state.notes = data.notes; state.events = data.events; state.config = data.config; state.layout = data.layout || {};
  ensureLayout(); placeMissing();
  lastKey = keyOf({ notes: state.notes, events: state.events, layout: state.layout, config: state.config });
  SYS.forEach((k) => applyRect($('p-' + k), state.layout[k]));
  if (document.body.classList.contains('apps-only')) { // this window starts 8px left of the box and at the screen top
    const r = state.layout.apps, el = $('p-apps');
    el.style.left = '8px'; el.style.top = (36 + r.y) + 'px'; el.style.width = r.w + 'px'; el.style.height = r.h + 'px';
  }
  $('chatModel').value = state.config.model || '';
  renderNotes(); renderCal(); renderAgenda(); renderStat();
}
const refreshSoon = () => setTimeout(() => window.board.load().then((d) => apply(d)), 400);

async function init() {
  tick(); setInterval(tick, 10000); setInterval(renderStat, 60000);
  apply(await window.board.load(), true);
  window.board.onChanged((d) => apply(d));
  const VOICE_LABEL = { connecting: 'connecting…', listening: 'listening', thinking: 'thinking…', speaking: 'speaking', error: 'voice error' };
  window.board.onVoice(({ state }) => {
    const el = $('voiceStat');
    el.className = 'voice ' + state;
    el.textContent = VOICE_LABEL[state] ? '● ' + VOICE_LABEL[state] : '';
    const b = $('chatTalk');
    b.className = 'ib talk ' + state;
    b.textContent = VOICE_LABEL[state] ? VOICE_LABEL[state] + ' (stop)' : 'talk';
  });
  let jobList = [];
  const fmt = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function renderJobs() {
    const now = Date.now(), el = $('jobStat');
    const shown = jobList.filter((j) => j.status === 'running' || now - (j.finished || 0) < 45000);
    el.replaceChildren(...shown.map((j) => {
      const s = document.createElement('span'); s.className = 'job ' + j.status;
      const mark = { running: '●', done: '✓', failed: '!', cancelled: '–', interrupted: '!' }[j.status] || '●';
      s.textContent = `${mark} ${j.title} · ${j.status === 'running' ? fmt(now - j.started) : j.status}`;
      if (j.status === 'running') { const x = document.createElement('b'); x.textContent = ' ×'; x.title = 'Cancel'; x.onclick = () => window.board.jobCancel(j.id); s.appendChild(x); }
      return s;
    }));
  }
  window.board.onJobs((l) => { jobList = l; renderJobs(); });
  window.board.jobsList().then((l) => { jobList = l; renderJobs(); });
  setInterval(renderJobs, 1000);
  $('chatTalk').onclick = () => window.board.voiceToggle();
  window.board.onAgent(({ running, text, step }) => {
    const el = $('agentStat');
    el.className = 'voice' + (running ? ' working' : '');
    el.textContent = running ? '● working' + (step ? ' · step ' + step : '') + ' — ' + text + '  (Ctrl+Shift+X stops)' : '';
  });

  for (const k of SYS) {
    const el = $('p-' + k);
    bindPanel(el, el.querySelector('.ph'), () => state.layout[k], () => saveLayout());
  }
  $('chatToggle').onclick = () => {
    const el = $('p-chat'); chat.collapsed = !chat.collapsed;
    el.classList.toggle('collapsed', chat.collapsed);
    el.style.height = chat.collapsed ? 'auto' : state.layout.chat.h + 'px';
    $('chatToggle').textContent = chat.collapsed ? '+' : '–';
  };
  $('chatModel').onchange = (e) => { state.config.model = e.target.value; window.board.saveConfig({ model: e.target.value }); };
  $('chatNew').onclick = async () => { await window.board.chatReset(); showHint(); };
  setupFakeCaret();
  setupFakeCaret('museInput', 'museCaret');
  setupMuse();
  setupFakeCaret('memInput', 'memCaret');
  setupMemory();
  $('chatInput').addEventListener('input', autoGrow);
  $('chatInput').addEventListener('paste', (e) => {
    const fs = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (fs.length) { e.preventDefault(); addImageFiles(fs); }
  });
  const pc = $('p-chat');
  pc.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
  pc.addEventListener('drop', (e) => { const fs = [...(e.dataTransfer?.files || [])]; if (fs.some((f) => f.type.startsWith('image/'))) { e.preventDefault(); addImageFiles(fs); } });
  $('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } });
  $('chatSend').onclick = () => (state.busy ? window.board.chatStop() : sendChat());

  $('calPrev').onclick = () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); renderCal(); };
  $('calNext').onclick = () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); renderCal(); };
  $('calGrid').addEventListener('click', (e) => { const d = e.target.closest('.cd')?.dataset.d; if (!d) return; state.selected = state.selected === d ? null : d; renderCal(); renderAgenda(); });
  $('agendaList').addEventListener('click', (e) => {
    const id = e.target.closest('.x')?.dataset.id; if (!id) return;
    state.events = state.events.filter((x) => String(x.id) !== id); window.board.saveEvents(state.events); renderCal(); renderAgenda(); renderStat();
  });

  $('addNote').onclick = () => newNote();
  $('tidy').onclick = tidy;
  $('search').oninput = (e) => { state.query = e.target.value; renderNotes(); };
  $('btnMin').onclick = () => window.board.windowControl('minimize');
  $('btnClose').onclick = () => window.board.windowControl('close');
  cv().addEventListener('dblclick', (e) => { if (e.target === cv()) { const r = cv().getBoundingClientRect(); newNote(e.clientX - r.left - 20, e.clientY - r.top - 15); } });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); $('chatInput').focus(); }
  });
}
init();
