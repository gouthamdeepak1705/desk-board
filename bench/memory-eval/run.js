#!/usr/bin/env node
// Memory evaluation harness. See README.md.
//   node run.js                          both built-in adapters (memory, baseline)
//   node run.js --adapter baseline       one adapter (name in adapters/ or a path to a module exporting create(opts))
//   node run.js --check                  validate the data files only (no LLM, no store)
//   node run.js --adapter memory --keep  keep the throwaway store and a pre-forget snapshot for --reuse
//   node run.js --adapter memory --reuse <snapshot dir>   re-score a kept snapshot without re-extracting
const fs = require('fs');
const os = require('os');
const path = require('path');
const { contains, anyContains, pct } = require('./lib/text');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes('--' + n);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const KS = (opt('k', '3,8')).split(',').map(Number);
const verbose = flag('verbose');

// ---------- data ----------
const transcripts = require('./data/transcripts.json');
const questions = require('./data/questions.json').questions;
const only = opt('only') ? new Set(opt('only').split(',')) : null; // question ids or types
const Q = only ? questions.filter((q) => only.has(q.id) || only.has(q.type)) : questions;

function buildEpisodes() {
  const eps = [];
  for (const s of transcripts.sessions) {
    s.turns.forEach(([who, text], i) => eps.push({ id: `${s.id}-${String(i + 1).padStart(2, '0')}`, session: s.id, who, text, ts: Date.parse(s.date + 'T09:00:00Z') + i * 120000 }));
  }
  return eps;
}
const episodes = buildEpisodes();

function validate() {
  const problems = [];
  const all = episodes.map((e) => e.text).join('\n');
  const ids = new Set();
  for (const q of questions) {
    if (ids.has(q.id)) problems.push(`${q.id}: duplicate id`); ids.add(q.id);
    for (const g of q.required || []) if (!g.some((v) => contains(all, v))) problems.push(`${q.id}: no variant of ${JSON.stringify(g)} occurs in the transcripts`);
    if (['injection', 'assistant-guess', 'secret', 'forget'].includes(q.type) && !(q.must_not || []).some((v) => contains(all, v))) problems.push(`${q.id}: must_not phrase is never planted in the transcripts`);
    if (q.type === 'forget' && !q.forget) problems.push(`${q.id}: forget text missing`);
  }
  const users = episodes.filter((e) => e.who === 'u').length;
  return { problems, summary: `${transcripts.sessions.length} sessions, ${episodes.length} episodes (${users} user), ${questions.length} questions` };
}

// ---------- scoring ----------
const FLAGGED = (it) => it.trusted === false;
function scoreOne(q, items, K, ctx) {
  const top = items.slice(0, K);
  const text = top.map((i) => i.text).join('\n');
  switch (q.type) {
    case 'abstention': return top.filter((i) => i.score == null || i.score >= ctx.floor).length === 0;
    case 'injection':
    case 'assistant-guess': return !top.some((i) => !FLAGGED(i) && anyContains(i.text, q.must_not));
    case 'secret':
    case 'forget': return !anyContains(text, q.must_not) && !ctx.dumpHit && (q.type !== 'forget' || ctx.keepOk !== false);
    default: {
      const ok = (q.required || []).every((g) => g.some((v) => contains(text, v)));
      if (!ok || !q.stale || !q.stale.length) return ok;
      // updated-fact: an item holding only the old value must not outrank the first item holding the new value
      const firstNew = top.findIndex((i) => q.required.every((g) => g.some((v) => contains(i.text, v))) || q.required.some((g) => g.some((v) => contains(i.text, v))));
      const firstStaleOnly = top.findIndex((i) => anyContains(i.text, q.stale) && !q.required.some((g) => g.some((v) => contains(i.text, v))));
      return !(firstStaleOnly >= 0 && firstStaleOnly < firstNew);
    }
  }
}

const trunc = (s, n = 140) => String(s).replace(/\s+/g, ' ').slice(0, n);
const toWindow = (q) => (q.window ? { since: Date.parse(q.window.since + 'T00:00:00Z'), until: Date.parse(q.window.until + 'T23:59:59Z') } : {});
const norm1 = (x) => (typeof x === 'string' ? { text: x } : x);

async function runAdapter(spec) {
  const mod = /[\\/]/.test(spec) || spec.endsWith('.js') ? require(path.resolve(spec)) : require(`./adapters/${spec}.js`);
  const adapter = mod.create({ model: opt('model'), keep: flag('keep') || !!opt('reuse'), verbose });
  const floor = opt('floor') != null ? Number(opt('floor')) : (adapter.floor ?? 0);
  console.log(`\n=== adapter: ${adapter.name} ===`);
  const res = { adapter: adapter.name, floor, ingest: null, questions: [], latencyMs: {}, forgetPhase: [] };

  try {
    // ingest
    const t0 = Date.now();
    if (opt('reuse')) {
      if (!adapter.restore) throw new Error('this adapter cannot --reuse');
      await adapter.restore(path.resolve(opt('reuse')));
      res.ingest = { reused: opt('reuse') };
    } else {
      console.log(`ingesting ${episodes.length} episodes...`);
      res.ingest = await adapter.ingest(episodes);
      res.ingest.wallMs = Date.now() - t0;
      console.log('ingest:', JSON.stringify(res.ingest));
    }
    if (flag('keep') && adapter.snapshot) { const snap = path.join(adapter.root || os.tmpdir(), 'snapshot-pre-forget'); await adapter.snapshot(snap); res.snapshot = snap; console.log('pre-forget snapshot:', snap); }

    // answer non-forget questions
    const lat = [];
    const rows = [];
    for (const q of Q.filter((x) => x.type !== 'forget')) {
      const a = Date.now();
      let items = []; let err = null;
      try { items = (await adapter.recall(q.q, toWindow(q))).map(norm1); } catch (e) { err = String(e.message || e); }
      const ms = Date.now() - a; lat.push(ms);
      let dumpHit = false;
      if (q.type === 'secret' && adapter.dump) dumpHit = (await adapter.dump()).some((t) => anyContains(t, q.must_not));
      const row = { id: q.id, type: q.type, q: q.q, answer: q.answer, ms, error: err, returned: items.length, top: items.slice(0, 3).map((i) => trunc(i.text)), scores: items.slice(0, 3).map((i) => i.score ?? null), dumpHit, pass: {} };
      for (const K of KS) row.pass[K] = !err && scoreOne(q, items, K, { floor, dumpHit });
      if (q.type === 'abstention') row.factsOnlyPass = items.slice(0, KS[KS.length - 1]).filter((i) => i.kind !== 'episode' && i.kind !== 'related' && (i.score == null || i.score >= floor)).length === 0;
      rows.push(row);
    }
    lat.sort((x, y) => x - y);
    res.latencyMs = { n: lat.length, p50: pct(lat, 0.5), p95: pct(lat, 0.95), max: lat[lat.length - 1] };

    // forget phase (destructive, always last)
    for (const q of Q.filter((x) => x.type === 'forget')) {
      let fr = null; try { fr = await adapter.forget(q.forget); } catch (e) { fr = { error: String(e.message || e) }; }
      res.forgetPhase.push({ id: q.id, result: fr });
    }
    for (const q of Q.filter((x) => x.type === 'forget')) {
      let items = [], err = null;
      try { items = [...(await adapter.recall(q.q)), ...(await adapter.recall(q.forget))].map(norm1); } catch (e) { err = String(e.message || e); }
      const tagged = adapter.dumpTagged ? await adapter.dumpTagged() : adapter.dump ? (await adapter.dump()).map((t) => ({ table: 'store', text: t })) : [];
      const hitTables = [...new Set(tagged.filter((x) => anyContains(x.text, q.must_not)).map((x) => x.table))];
      const dumpHit = hitTables.length > 0;
      let keepOk = null;
      if (q.keep) { const k = (await adapter.recall(q.keep.q)).map(norm1).slice(0, 8).map((i) => i.text).join('\n'); keepOk = q.keep.required.every((g) => g.some((v) => contains(k, v))); }
      const row = { id: q.id, type: q.type, q: q.q, answer: q.answer, ms: null, error: err, returned: items.length, top: items.slice(0, 3).map((i) => trunc(i.text)), dumpHit, keepOk, pass: {} };
      for (const K of KS) row.pass[K] = !err && scoreOne(q, items, K, { floor, dumpHit, keepOk });
      row.leak = [!items.slice(0, 8).every((i) => !anyContains(i.text, q.must_not)) && 'recall', dumpHit && 'store:' + hitTables.join(',')].filter(Boolean).join('+') || null;
      rows.push(row);
    }
    rows.sort((x, y) => x.id.localeCompare(y.id));
    res.questions = rows;
  } finally {
    try { await adapter.close(); } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  return res;
}

// ---------- reporting ----------
function aggregate(res) {
  const types = [...new Set(res.questions.map((r) => r.type))];
  const by = {};
  for (const t of types.concat('ALL')) {
    const rs = t === 'ALL' ? res.questions : res.questions.filter((r) => r.type === t);
    by[t] = { n: rs.length }; for (const K of KS) by[t]['k' + K] = rs.length ? rs.filter((r) => r.pass[K]).length / rs.length : null;
  }
  const macro = {}; for (const K of KS) macro['k' + K] = types.reduce((a, t) => a + by[t]['k' + K], 0) / (types.length || 1);
  res.byType = by; res.macro = macro;
}
const P = (x) => (x == null ? '-' : (x * 100).toFixed(0) + '%');
function tableText(res) {
  const lines = [['type', 'n', ...KS.map((k) => '@' + k)]];
  for (const [t, v] of Object.entries(res.byType)) lines.push([t, String(v.n), ...KS.map((k) => P(v['k' + k]))]);
  lines.push(['macro-avg over types', '', ...KS.map((k) => P(res.macro['k' + k]))]);
  const w = lines[0].map((_, i) => Math.max(...lines.map((l) => String(l[i]).length)));
  return lines.map((l) => l.map((c, i) => (i === 0 ? String(c).padEnd(w[i]) : String(c).padStart(w[i]))).join('  ')).join('\n');
}
function mdTable(res) {
  const out = [`| type | n | ${KS.map((k) => '@' + k).join(' | ')} |`, `|---|--:|${KS.map(() => '--:').join('|')}|`];
  for (const [t, v] of Object.entries(res.byType)) out.push(`| ${t === 'ALL' ? '**overall**' : t} | ${v.n} | ${KS.map((k) => P(v['k' + k])).join(' | ')} |`);
  out.push(`| macro-avg | | ${KS.map((k) => P(res.macro['k' + k])).join(' | ')} |`);
  return out.join('\n');
}

function markdown(all, meta) {
  const L = [`# Memory eval ${meta.stamp}`, '', `Data: ${meta.summary}. K = ${KS.join(', ')}. Scoring is string-matching, no LLM judge (see README).`, ''];
  for (const r of all) {
    L.push(`## ${r.adapter}`, '', mdTable(r), '');
    L.push(`Recall latency: p50 ${r.latencyMs.p50} ms, p95 ${r.latencyMs.p95} ms, max ${r.latencyMs.max} ms (n=${r.latencyMs.n}).`);
    const ing = r.ingest || {};
    L.push(`Ingest: ${JSON.stringify(ing)}`, '');
    const ab = r.questions.filter((x) => x.type === 'abstention');
    if (ab.length) L.push(`Abstention if episode/related fallbacks are ignored (facts only): ${ab.filter((x) => x.factsOnlyPass).length}/${ab.length}.`, '');
    const fg = r.questions.filter((x) => x.type === 'forget');
    if (fg.length) L.push('Forget leaks: ' + fg.map((x) => `${x.id}=${x.leak || 'none'}${x.keepOk === false ? ' (collateral damage)' : ''}`).join(', '), '');
    const kmax = KS[KS.length - 1];
    const fails = r.questions.filter((x) => !x.pass[kmax]);
    L.push(`### Failures at K=${kmax} (${fails.length})`, '');
    for (const f of fails) L.push(`- **${f.id}** [${f.type}] ${f.q} -> expected: ${f.answer}${f.error ? ' (error: ' + f.error + ')' : ''}${f.dumpHit ? ' (found in raw store)' : ''}${f.leak ? ' (leak: ' + f.leak + ')' : ''}`, `  - top: ${f.top[0] ? f.top.map((t) => '`' + t.replace(/`/g, "'") + '`').join(' | ') : '(nothing returned)'}`);
    L.push('');
  }
  return L.join('\n');
}

(async () => {
  const v = validate();
  console.log('data:', v.summary);
  if (v.problems.length) { console.log('DATA PROBLEMS:\n  ' + v.problems.join('\n  ')); if (flag('check')) process.exit(1); }
  else console.log('data check: ok');
  if (flag('check')) return;

  const specs = opt('adapter', 'memory,baseline').split(',').map((s) => s.trim()).filter(Boolean);
  const all = [];
  for (const s of specs) {
    const r = await runAdapter(s); aggregate(r); all.push(r);
    console.log('\n' + tableText(r));
    console.log(`recall latency p50 ${r.latencyMs.p50} ms, p95 ${r.latencyMs.p95} ms`);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(__dirname, 'results'); fs.mkdirSync(dir, { recursive: true });
  const meta = { stamp, summary: v.summary, ks: KS, argv };
  fs.writeFileSync(path.join(dir, stamp + '.json'), JSON.stringify({ meta, results: all }, null, 2));
  fs.writeFileSync(path.join(dir, stamp + '.md'), markdown(all, meta));
  console.log('\nwrote', path.join(dir, stamp + '.json'), 'and .md');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
