// Runs the computer-use benchmark inside the app (it needs the agent's screen capture and input code).
// Started by a flag file in the temp folder (see main.js). For every task, size, model and run it:
//   opens a fresh, isolated Chrome (its own empty profile; your own Chrome is never touched) at an exact size,
//   lets the agent do the task, scores the result automatically from what the test page logged,
//   closes that Chrome, and appends one row to results.jsonl and results.csv.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { start } = require('./server');
const { tasks } = require('./tasks');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE = path.join(os.tmpdir(), 'desk-bench-profile');
const SANDBOX = path.join(os.homedir(), 'bench-sandbox', 'files');
const FRACTION = { S100: 1, S60: 0.6, S35: 0.35, S20: 0.2 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ps = (script) => { try { execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore', timeout: 20000 }); } catch {} };

module.exports = async function runBench({ computer, actions, low, spec }) {
  global.__deskBench = true; // silences the finish notifications while testing
  const out = spec.out; fs.mkdirSync(out, { recursive: true });
  const jsonl = path.join(out, 'results.jsonl'), csv = path.join(out, 'results.csv'), progress = path.join(out, 'progress.log');
  const P = (...a) => fs.appendFileSync(progress, `${new Date().toISOString()}  ${a.join(' ')}\n`);
  if (!fs.existsSync(csv)) fs.writeFileSync(csv, 'time,stage,model,task,group,size,run,pass,secs,steps,calls,in_tokens,out_tokens,hedges,detail,answer\n');
  const server = await start();
  const wa = low.workArea(), W = wa.right - wa.left, H = wa.bottom - wa.top;
  const geom = (code) => { const f = FRACTION[code] || 1; const w = Math.round(W * f), h = Math.round(H * f); return { x: wa.left + Math.round((W - w) / 2), y: wa.top + Math.round((H - h) / 2), w, h }; };
  const key = fs.readFileSync(path.join(process.env.APPDATA, 'desk-board', 'openai.key'), 'utf8').trim();

  // Preflight: which of the chosen models accept the computer tool at all (an unsupported one would only produce errors)
  const TINY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  async function supports(model) {
    const call = async (withReasoning) => {
      const body = { model, tools: [{ type: 'computer' }], input: [{ role: 'user', content: [{ type: 'input_text', text: 'Reply with the word ok. Do not use the computer.' }, { type: 'input_image', image_url: TINY, detail: 'low' }] }], ...(withReasoning ? { reasoning: { effort: 'low' } } : {}) };
      const r = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { ok: r.ok, status: r.status, text: await r.text() };
    };
    try {
      let r = await call(true);
      if (!r.ok && /reasoning/i.test(r.text)) r = await call(false);
      if (r.ok || r.status === 429) return { ok: true };
      return { ok: false, msg: r.text.slice(0, 160).replace(/\s+/g, ' ') };
    } catch (e) { return { ok: true }; } // network hiccup: let the real runs decide
  }
  const usable = [];
  for (const m of spec.models) { const s = await supports(m); P(`preflight ${m}: ${s.ok ? 'ok' : 'UNSUPPORTED ' + s.msg}`); if (s.ok) usable.push(m); }
  spec.models = usable;

  // Resume: runs already recorded for this stage are skipped
  const done = new Set();
  if (fs.existsSync(jsonl)) for (const l of fs.readFileSync(jsonl, 'utf8').split('\n')) { if (!l.trim()) continue; try { const r = JSON.parse(l); done.add([r.stage, r.model, r.task, r.size, r.run].join('|')); } catch {} }

  const plan = [];
  const wanted = spec.tasks === 'all' || !spec.tasks ? tasks.map((t) => t.id) : spec.tasks;
  for (const id of wanted) { const t = tasks.find((x) => x.id === id); if (!t) continue; const sizes = (spec.sizes ? t.sizes.filter((s) => spec.sizes.includes(s) || s === '-') : t.sizes); for (const s of sizes) plan.push({ task: t, size: s }); }
  P(`START stage=${spec.stage} models=${spec.models.join(',')} runs=${spec.runs} planned=${plan.length * spec.models.length * spec.runs} (${plan.length} task-size combos)`);

  // ---- helpers ----
  const killBrowser = () => ps(`Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*desk-bench-profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; (New-Object -ComObject Shell.Application).Windows() | Where-Object { $_.LocationURL -like '*bench-sandbox*' } | ForEach-Object { $_.Quit() }`);
  async function waitNewWindow(before, exe, ms = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const w = low.listWindows().find((x) => !before.has(x.h) && low.exeOf(x.h) === exe); if (w) return w.h; await sleep(250); }
    return null;
  }
  async function openBrowser(task, size) {
    killBrowser(); await sleep(600);
    { const sd = 1 + (spec.seedBase || 0) + task.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 0) % 997 + (task._run || 0) * 131 + size.length * 7; if (/127\.0\.0\.1.*\/p\/a\d/.test(task.url) && !/[?&]s=/.test(task.url)) task = { ...task, url: task.url + (task.url.includes('?') ? '&' : '?') + 's=' + sd }; const wa = low.workArea(); low.moveTo(wa.left + Math.floor(Math.random() * 200), wa.bottom - 20 - Math.floor(Math.random() * 100)); }
    try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
    const g = geom(size), before = new Set(low.listWindows().map((w) => w.h));
    spawn(CHROME, [`--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-infobars', '--lang=en-US', '--new-window', `--window-position=${g.x},${g.y}`, `--window-size=${g.w},${g.h}`, task.url], { stdio: 'ignore' }).unref();
    const h = await waitNewWindow(before, 'chrome');
    if (!h) throw new Error('the test browser did not open');
    low.place(h, g.x, g.y, g.w, g.h); await sleep(700); low.place(h, g.x, g.y, g.w, g.h);
    await low.focusHandle(h); await sleep(/google|wikipedia/.test(task.url) ? 4000 : 1800);
  }
  const setupSandbox = () => { fs.mkdirSync(SANDBOX, { recursive: true }); for (const n of ['a.txt', 'b.txt', 'c.txt']) fs.writeFileSync(path.join(SANDBOX, n), 'sandbox ' + n); };
  const sandboxFilesLeft = () => { try { return fs.readdirSync(SANDBOX).length; } catch { return 0; } };
  async function openExplorer(size) {
    killBrowser(); setupSandbox(); await sleep(400);
    const g = geom(size), before = new Set(low.listWindows().map((w) => w.h));
    spawn('explorer.exe', [SANDBOX], { stdio: 'ignore' }).unref();
    const h = await waitNewWindow(before, 'explorer');
    if (!h) throw new Error('File Explorer did not open');
    low.place(h, g.x, g.y, g.w, g.h); await low.focusHandle(h); await sleep(1500);
  }

  // The scraper lane: fetch the page text ourselves and ask the model to summarise it. No screenshots.
  async function scrape(task, model) {
    const t0 = Date.now();
    const html = await (await fetch(task.url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36' } })).text();
    const text = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').slice(0, 60000);
    const body = { model, reasoning: { effort: 'low' }, input: `${task.goal}\n\nARTICLE TEXT:\n${text}` };
    let r = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let raw = await r.text();
    if (!r.ok && /reasoning/i.test(raw)) { delete body.reasoning; r = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); raw = await r.text(); }
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${raw.slice(0, 200)}`);
    const d = JSON.parse(raw);
    const answer = (d.output || []).filter((i) => i.type === 'message').flatMap((i) => i.content || []).map((c) => c.text || '').join(' ');
    return { answer, secs: (Date.now() - t0) / 1000, steps: 0, usage: { calls: 1, inTok: d.usage?.input_tokens || 0, outTok: d.usage?.output_tokens || 0, hedges: 0 } };
  }

  const csvCell = (v) => '"' + String(v ?? '').replace(/"/g, '""').replace(/\s+/g, ' ') + '"';
  let aborted = false;

  for (let run = 1; run <= spec.runs && !aborted; run++) {
    for (const { task, size } of plan) {
      if (aborted) break;
      for (const model of spec.models) {
        if (aborted) break;
        if (done.has([spec.stage, model, task.id, size, run].join('|'))) continue;
        let row = null;
        for (let attempt = 1; attempt <= 3 && !row; attempt++) { // a run the user interrupted is repeated, not counted
          server.events.length = 0;
          try {
            let res;
            if (task.lane === 'scraper') res = await scrape(task, model);
            else {
              if (task.runner === 'explorer') await openExplorer(size); else await openBrowser(task, size);
              await sleep(500);
              const t0 = Date.now();
              const r = await computer.run(task.goal, { model, maxSteps: task.maxSteps, maxSeconds: task.maxSeconds });
              res = { answer: String(r.text || ''), secs: (Date.now() - t0) / 1000, steps: computer.status().step, usage: computer.usage() };
            }
            if (/^Stopped because you took over/.test(res.answer)) { P(`interrupted ${task.id} ${model}; retrying`); await sleep(5000); continue; }
            if (/^Stopped: cancelled by you/.test(res.answer)) { aborted = true; P('ABORTED by the stop hotkey'); break; }
            const detail = task.score(server.events.slice(), res.answer, { sandboxFilesLeft });
            row = { time: new Date().toISOString(), stage: spec.stage, model, task: task.id, group: task.group, size, run, pass: !!detail.pass, secs: +res.secs.toFixed(1), steps: res.steps, calls: res.usage.calls, inTok: res.usage.inTok, outTok: res.usage.outTok, hedges: res.usage.hedges, detail, answer: res.answer.slice(0, 400) };
          } catch (e) {
            row = { time: new Date().toISOString(), stage: spec.stage, model, task: task.id, group: task.group, size, run, pass: false, secs: 0, steps: 0, calls: 0, inTok: 0, outTok: 0, hedges: 0, detail: { error: String(e.message || e).slice(0, 200) }, answer: '' };
          }
        }
        killBrowser();
        if (!row) continue;
        fs.appendFileSync(jsonl, JSON.stringify(row) + '\n');
        fs.appendFileSync(csv, [row.time, row.stage, row.model, row.task, row.group, row.size, row.run, row.pass, row.secs, row.steps, row.calls, row.inTok, row.outTok, row.hedges, JSON.stringify(row.detail), row.answer].map(csvCell).join(',') + '\n');
        P(`${row.pass ? 'PASS' : 'FAIL'} ${row.model.padEnd(13)} ${row.task} ${row.size} run${row.run} ${row.secs}s steps=${row.steps} tok=${row.inTok}/${row.outTok}${row.detail.error ? ' ERROR ' + row.detail.error : ''}`);
        await sleep(1500);
      }
    }
  }
  killBrowser();
  if (task_has_sandbox()) { try { fs.rmSync(path.join(os.homedir(), 'bench-sandbox'), { recursive: true, force: true }); } catch {} }
  P(aborted ? 'STOPPED early' : 'DONE');
  server.close();
  global.__deskBench = false;
  function task_has_sandbox() { return true; }
};
