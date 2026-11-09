// Adapter for open-source Mem0 (python, local Qdrant, OpenAI LLM+embeddings) via mem0/bridge.py (JSON lines over stdio).
// Env: MEM0_PYTHON (venv python), MEM0_LLM, MEM0_MODE=episode|session (default episode), MEM0_PRICE="in,out,emb" USD per 1M tokens.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const DEFAULT_PY = 'C:\\Users\\gouth\\AppData\\Local\\Temp\\claude\\C--Users-gouth\\518d173a-07b3-4796-b979-715cb996c6a8\\scratchpad\\mem0venv\\Scripts\\python.exe';
const PRICE = (process.env.MEM0_PRICE || '0.20,1.20,0.02').split(',').map(Number); // assumption, only for the cost estimate

function create(opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mem0eval-'));
  const py = process.env.MEM0_PYTHON || DEFAULT_PY;
  const mode = process.env.MEM0_MODE || 'episode';
  const child = spawn(py, ['-u', path.join(__dirname, '..', 'mem0', 'bridge.py')], { env: { ...process.env, MEM0_DIR: path.join(root, 'store'), PYTHONIOENCODING: 'utf-8' }, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map(); let seq = 0; const errLog = [];
  readline.createInterface({ input: child.stdout }).on('line', (l) => { try { const r = JSON.parse(l); const p = pending.get(r.id); if (p) { pending.delete(r.id); r.ok ? p.res(r.result) : p.rej(new Error(r.error)); } } catch {} });
  child.stderr.on('data', (d) => { errLog.push(String(d).slice(0, 300)); if (errLog.length > 20) errLog.shift(); });
  child.on('exit', () => { for (const p of pending.values()) p.rej(new Error('bridge exited: ' + errLog.join(' | ').slice(-400))); pending.clear(); });
  const call = (op, args) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); child.stdin.write(JSON.stringify({ id, op, args }) + '\n'); });
  const iso = (ts) => new Date(ts).toISOString();
  const day = (s) => (s || '').slice(0, 10);

  return {
    name: 'mem0-oss-' + mode,
    floor: 0, // any memory Mem0 returns (its own 0.1 threshold applies) counts as returned
    root,
    async ingest(episodes) {
      const t0 = Date.now(); let calls = 0; const errors = [];
      const send = async (msgs, ts, meta) => {
        calls++;
        try { await call('add', { messages: msgs, metadata: meta }); }
        catch (e) { errors.push(String(e.message).slice(0, 200)); }
      };
      // OSS Mem0 rejects the timestamp param, so the session date is prefixed to the message text instead.
      // Mem0 has no trust tiers: emails go in as plain user messages, assistant lines as assistant-role messages.
      const msg = (e) => ({ role: e.who === 'a' ? 'assistant' : 'user', content: `[${iso(e.ts).slice(0, 10)}] ` + (e.who === 'email' ? 'Email received: ' + e.text : e.text) });
      if (mode === 'session') {
        const by = new Map();
        for (const e of episodes) { if (!by.has(e.session)) by.set(e.session, []); by.get(e.session).push(e); }
        for (const [sid, es] of by) await send(es.map(msg), es[0].ts, { session: sid });
      } else {
        for (const e of episodes) await send([msg(e)], e.ts, { episode: e.id, who: e.who, ts: iso(e.ts) });
      }
      const u = await call('usage', {});
      const costUsd = (u.llm_in * PRICE[0] + u.llm_out * PRICE[1] + u.emb_in * PRICE[2]) / 1e6;
      const all = await call('all', {});
      return { episodes: episodes.length, addCalls: calls, addErrors: errors.length, errorSamples: errors.slice(0, 3), extractMs: Date.now() - t0, memoriesStored: all.length, usage: u, costUsd: +costUsd.toFixed(4), priceAssumptionPer1M: PRICE };
    },
    async recall(query, o = {}) {
      const r = await call('search', { query, limit: 8 });
      let items = r; // window filter uses the episode time stored in metadata.ts (created_at is wall-clock now)
      if (o.since || o.until) items = r.filter((x) => { const t = Date.parse((x.metadata && x.metadata.ts) || ''); return isNaN(t) || ((!o.since || t >= o.since) && (!o.until || t <= o.until)); });
      return items.map((x) => ({ text: x.text, score: x.score, trusted: true, kind: 'fact' }));
    },
    async forget(text) { const pf = process.env.MEM0_DUMP && process.env.MEM0_DUMP.replace(/\.json$/, '') + '.preforget.json'; if (pf && !fs.existsSync(pf)) { try { fs.writeFileSync(process.env.MEM0_DUMP.replace(/\.json$/, '') + '.preforget.json', JSON.stringify(await call('all', {}), null, 1)); } catch {} } return call('delete_text', { text }); },
    async dump() { return (await call('all', {})).map((x) => x.text); },
    async rawMemories() { return call('all', {}); },
    async usage() { return call('usage', {}); },
    async reset() { await call('reset', {}); },
    async close() { if (process.env.MEM0_DUMP) { try { fs.writeFileSync(process.env.MEM0_DUMP, JSON.stringify(await call('all', {}), null, 1)); } catch {} } try { await call('close', {}); } catch {} try { child.kill(); } catch {} await new Promise((r) => setTimeout(r, 1000)); if (!opts.keep) try { fs.rmSync(root, { recursive: true, force: true }); } catch {} },
  };
}
module.exports = { create };
