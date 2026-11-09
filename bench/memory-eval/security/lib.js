// Test helpers for the memory security suite. Never touches %APPDATA%\desk-board\memory.
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs'), os = require('os'), path = require('path');
const MEM = path.resolve(__dirname, '..', '..', '..', 'memory');
const WORKER = path.join(MEM, 'worker.js');

const mkdir = (tag) => fs.mkdtempSync(path.join(os.tmpdir(), 'memsec-' + tag + '-'));
const rmrf = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} };

class W {
  constructor(dir) {
    this.dir = dir; this.db = path.join(dir, 'memory.db'); this.seq = 0; this.waiting = new Map(); this.buf = ''; this.exited = false; this.stderr = ''; this.crashed = false;
    this.p = spawn(process.execPath, [WORKER, this.db], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.p.stdin.on('error', () => {});
    this.ready = new Promise((res) => { this._ready = res; });
    this.exitP = new Promise((res) => this.p.on('close', (code, sig) => { this.exited = true; this.code = code; this.sig = sig; for (const [, w] of this.waiting) w.reject(new Error('worker exited')); this.waiting.clear(); res(code); this._ready(false); }));
    this.p.stderr.on('data', (d) => { this.stderr += d; });
    this.p.stdout.on('data', (d) => {
      this.buf += d; let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i); this.buf = this.buf.slice(i + 1);
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (m.ready) { this._ready(true); continue; }
        const w = this.waiting.get(m.id); if (!w) continue; this.waiting.delete(m.id);
        m.ok ? w.resolve(m.result) : w.reject(new Error(m.error));
      }
    });
  }
  async send(op, args, ms = 20000) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const id = ++this.seq; const t = setTimeout(() => { this.waiting.delete(id); reject(new Error('TIMEOUT ' + op)); }, ms);
      this.waiting.set(id, { resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } });
      this.p.stdin.write(JSON.stringify({ id, op, args }) + '\n');
    });
  }
  raw(line) { this.p.stdin.write(line + '\n'); }
  kill() { try { this.p.kill('SIGKILL'); } catch {} return this.exitP; }
  async close() { try { this.p.stdin.end(); } catch {} await Promise.race([this.exitP, new Promise((r) => setTimeout(r, 4000))]); if (!this.exited) await this.kill(); }
}

function openRO(dbPath) { return new DatabaseSync(dbPath, { readOnly: true }); }
function openRW(dbPath) { const d = new DatabaseSync(dbPath); d.exec('PRAGMA busy_timeout=5000'); return d; }

// every logical value in every table (incl. fts shadow tables) as a lowercase string, grouped by table.column
function scanTables(dbPath, needles) {
  const d = openRO(dbPath); const hits = [];
  const lc = needles.map((n) => n.toLowerCase());
  const tabs = d.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  for (const t of tabs) {
    let rows; try { rows = d.prepare(`SELECT * FROM "${t}"`).all(); } catch { continue; }
    for (const r of rows) for (const [c, v] of Object.entries(r)) {
      if (v == null) continue;
      const s = (v instanceof Uint8Array ? Buffer.from(v).toString('latin1') : String(v)).toLowerCase();
      lc.forEach((n, i) => { if (s.includes(n)) hits.push(`${t}.${c}:${needles[i]}`); });
    }
  }
  // is it still searchable through either FTS index?
  for (const [i, n] of lc.entries()) for (const ft of ['fact_fts', 'ep_fts']) {
    const tok = n.replace(/[^a-z0-9]/g, ''); if (tok.length < 4) continue;
    try { if (d.prepare(`SELECT rowid FROM ${ft} WHERE ${ft} MATCH ?`).all('"' + tok + '"').length) hits.push(`${ft}.MATCH:${needles[i]}`); } catch {}
  }
  d.close(); return [...new Set(hits)];
}
// raw bytes of db, -wal, -shm
function scanBytes(dir, needles) {
  const hits = [];
  for (const f of fs.readdirSync(dir)) {
    if (!/^memory\.db/.test(f)) continue;
    const s = fs.readFileSync(path.join(dir, f)).toString('latin1').toLowerCase();
    for (const n of needles) if (s.includes(n.toLowerCase())) hits.push(`${f}:${n}`);
  }
  return hits;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (n, set = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') => { let s = ''; for (let i = 0; i < n; i++) s += set[Math.floor(Math.random() * set.length)]; return s; };
// tiny runner: each test returns a string (observation) or throws (finding). Results go to results-<suite>.json
function suite(name) {
  const out = [];
  return {
    async t(id, sev, title, fn) {
      try { const obs = await fn(); out.push({ id, sev, title, ok: true, obs: String(obs || '') }); console.log('PASS', id, title, obs ? '- ' + String(obs).slice(0, 160) : ''); }
      catch (e) { out.push({ id, sev, title, ok: false, obs: String((e && e.message) || e).slice(0, 1500) }); console.log('FAIL', id, `[${sev}]`, title, '-', String((e && e.message) || e).slice(0, 300)); }
    },
    done() { fs.writeFileSync(path.join(__dirname, 'results-' + name + '.json'), JSON.stringify(out, null, 1)); console.log(`\n${name}: ${out.filter((x) => x.ok).length} pass, ${out.filter((x) => !x.ok).length} FAIL`); },
  };
}
module.exports = { W, mkdir, rmrf, openRO, openRW, scanTables, scanBytes, sleep, rnd, suite, MEM, WORKER };
