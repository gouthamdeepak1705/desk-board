// Adapter for the home-grown memory (memory/index.js + memory/worker.js).
// ingest: capture every episode, back-date the ledger timestamps (capture() always stamps "now"), then run
// extractNow() until nothing is pending. Uses a throwaway data dir; never touches %APPDATA%\desk-board\memory.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const SRC = { u: 'user_voice', a: 'assistant', email: 'email' };

function create(opts = {}) {
  const createMemory = require('../../../memory');
  const root = opts.dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'memeval-'));
  const dataDir = path.join(root, 'memory');
  fs.mkdirSync(dataDir, { recursive: true });
  if (/appdata/i.test(dataDir) && /desk-board/i.test(dataDir)) throw new Error('refusing to use a live data dir');
  const logs = [];
  const log = (m) => { logs.push(m); if (opts.verbose) console.log('    [memory] ' + m); };
  const costLog = path.join(root, 'claude-cost.jsonl');
  let mem = null;
  const dbFile = () => path.join(dataDir, 'memory.db');

  // Put the cost-logging claude shim in front of the real CLI for the child processes memory spawns.
  function installShim() {
    let real = '';
    try { real = execSync('where claude', { encoding: 'utf8' }).split(/\r?\n/).map((s) => s.trim()).filter(Boolean).find((s) => /\.(exe|cmd|bat)$/i.test(s)) || ''; } catch {}
    if (!real) { log('claude CLI not found on PATH; cost will not be measured'); return; }
    const bin = path.join(root, 'bin'); fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(path.join(bin, 'claude.cmd'), `@echo off\r\nnode "${path.join(__dirname, '..', 'lib', 'claude-shim.js')}" %*\r\n`);
    process.env.MEMEVAL_REAL_CLAUDE = real;
    process.env.MEMEVAL_COST_LOG = costLog;
    process.env.PATH = bin + path.delimiter + process.env.PATH;
  }

  const api = {
    name: 'home-grown-memory',
    floor: 0, // facts carry bm25-derived scores of arbitrary scale; episodes/related carry none and always count as returned
    dataDir, root,
    async start() { if (!mem) { mem = createMemory({ dataDir, log, settings: () => (opts.model ? { memoryModel: opts.model } : {}) }); await mem.call('stats'); } return mem; },

    async ingest(episodes) {
      installShim();
      await api.start();
      const ids = [];
      let skipped = 0, redacted = 0;
      for (const e of episodes) {
        const r = await mem.capture(SRC[e.who] || 'user_voice', e.text, { source_ref: e.id });
        if (!r || r.id == null) { skipped++; ids.push(null); continue; }
        if (r.redacted) redacted++;
        ids.push(r.id);
      }
      // capture() stamps Date.now(); back-date so valid_from, recency ranking and time windows reflect the transcript.
      const db = new DatabaseSync(dbFile());
      db.exec('PRAGMA busy_timeout=5000');
      const up = db.prepare('UPDATE episode SET ts=?, raw_expires_at=? WHERE id=?');
      episodes.forEach((e, i) => { if (ids[i] != null) up.run(e.ts, e.ts + 60 * 86400000, ids[i]); });
      db.close();

      const t0 = Date.now();
      let calls = 0, failures = 0, errors = [];
      for (let guard = 0; guard < 40; guard++) {
        const st = await mem.call('stats');
        if (!st.pending) break;
        const tc = Date.now();
        const r = await mem.extractNow(); calls++;
        log(`extract call ${calls}: ${JSON.stringify(r)} (${((Date.now() - tc) / 1000).toFixed(1)}s)`);
        if (r.error) { failures++; errors.push(r.error); if (failures >= 3) break; }
        else if (r.skipped && r.skipped !== 'nothing new') break;
      }
      const extractMs = Date.now() - t0;
      const st = await mem.call('stats');
      let costUsd = null, tokensIn = null, tokensOut = null;
      try {
        const rows = fs.readFileSync(costLog, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
        costUsd = rows.reduce((a, r) => a + (r.cost || 0), 0);
        tokensIn = rows.reduce((a, r) => a + ((r.usage && (r.usage.input_tokens + (r.usage.cache_creation_input_tokens || 0) + (r.usage.cache_read_input_tokens || 0))) || 0), 0);
        tokensOut = rows.reduce((a, r) => a + ((r.usage && r.usage.output_tokens) || 0), 0);
      } catch {}
      return { episodes: episodes.length, captureSkipped: skipped, redactedOnCapture: redacted, extractMs, extractCalls: calls, extractFailures: failures, extractErrors: errors.slice(0, 3), costUsd, tokensIn, tokensOut, store: st };
    },

    async recall(query, o = {}) {
      await api.start();
      const r = await mem.call('recall', { query, limit: 8, since: o.since, until: o.until });
      const items = [];
      for (const f of r.facts || []) items.push({ text: `[${f.date}] ${f.text}`, score: f.score, trusted: f.status === 'confirmed', kind: 'fact' });
      for (const e of r.episodes || []) items.push({ text: `[${e.when}] (${e.who}) ${e.text}`, trusted: !!e.trusted && e.who !== 'assistant', kind: 'episode' });
      for (const x of r.related || []) items.push({ text: `[${x.date}] ${x.text}`, trusted: x.status === 'confirmed', kind: 'related' });
      return items;
    },

    async forget(text) { await api.start(); return mem.call('forget', { query: text }); },

    // Everything the store still holds as text, for the "not retrievable anywhere" checks. FTS shadow tables are
    // contentless and cannot be read back, so token residue there is not covered.
    async dump() { return (await api.dumpTagged()).map((x) => x.text); },
    async dumpTagged() {
      const db = new DatabaseSync(dbFile());
      db.exec('PRAGMA busy_timeout=5000');
      const out = [];
      const grab = (sql) => { const table = (sql.match(/FROM ([a-z_]+)/) || [])[1]; try { for (const r of db.prepare(sql).all()) for (const v of Object.values(r)) if (v != null) out.push({ table, text: String(v) }); } catch {} };
      grab('SELECT raw_text FROM episode');
      grab('SELECT subject, predicate, object_text, key_text FROM fact');
      grab('SELECT quote FROM fact_source');
      grab('SELECT candidate FROM candidate_log');
      grab('SELECT before, after FROM memory_op');
      grab('SELECT name, aliases, summary FROM entity');
      grab('SELECT src, dst FROM edge');
      db.close();
      return out;
    },

    // Copy the store (db + wal) so the destructive forget phase can be re-run without re-extracting.
    async snapshot(dest) {
      fs.mkdirSync(dest, { recursive: true });
      const db = new DatabaseSync(dbFile());
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close();
      for (const f of fs.readdirSync(dataDir)) if (/^memory\.db/.test(f)) fs.copyFileSync(path.join(dataDir, f), path.join(dest, f));
      return dest;
    },
    async restore(src) { for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dataDir, f)); },

    async reset() { if (mem) { mem.stop(); mem = null; } fs.rmSync(dataDir, { recursive: true, force: true }); fs.mkdirSync(dataDir, { recursive: true }); },
    async close() { if (mem) { mem.stop(); mem = null; } if (!opts.keep) { await new Promise((r) => setTimeout(r, 1500)); try { fs.rmSync(root, { recursive: true, force: true }); } catch {} } },
  };
  return api;
}
module.exports = { create };
