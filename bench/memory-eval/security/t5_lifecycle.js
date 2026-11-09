const assert = require('assert');
const fs = require('fs'), path = require('path');
const { W, mkdir, rmrf, openRO, openRW, scanTables, scanBytes, sleep, rnd, suite } = require('./lib');
const S = suite('lifecycle');
const q = (w, sql, ...a) => { const d = openRO(w.db); try { return d.prepare(sql).all(...a); } finally { d.close(); } };

(async () => {
  await S.t('L1', 'medium', 'maintain(): expired raw_text is nulled, de-indexed from ep_fts, and absent from the files after checkpoint+close', async () => {
    const w = new W(mkdir('l1'));
    try {
      const e = (await w.send('capture', { source_type: 'web', text: 'Zorblaxian page about Quuxville pottery wheels and glazing' })).id;
      await w.send('addFacts', { episode_id: e, candidates: [{ subject: 'pottery', predicate: 'topic', object: 'Pottery wheels need glazing', quote: 'Quuxville pottery wheels', importance: 6 }] });
      const d = openRW(w.db); d.prepare('UPDATE episode SET raw_expires_at=? WHERE id=?').run(Date.now() - 1000, e); d.close();
      const r = await w.send('maintain');
      const ep = q(w, 'SELECT raw_text,content_hash FROM episode WHERE id=?', e)[0];
      assert(r.expired === 1 && ep.raw_text === null, JSON.stringify(r));
      const rec = await w.send('recall', { query: 'zorblaxian' });
      assert(!rec.episodes.length, 'expired episode still searchable');
      await w.close();
      const hits = scanBytes(w.dir, ['zorblaxian']);
      const kept = [];
      if (ep.content_hash) kept.push('content_hash kept (sha1 of redacted text, dictionary-attackable)');
      if (q(w, 'SELECT quote FROM fact_source WHERE episode_id=?', e)[0].quote) kept.push('fact_source.quote kept verbatim past the TTL (by design)');
      assert(!hits.length, `expired raw text still in file bytes: ${hits.join(',')} (no VACUUM/secure_delete)`);
      return kept.join('; ');
    } finally { await w.close(); rmrf(w.dir); }
  });

  await S.t('L2', 'low', 'TTL table: unknown / odd source types and prototype keys get a finite expiry', async () => {
    const w = new W(mkdir('l2'));
    try {
      const out = {};
      for (const st of ['user_voice', 'screen_text', 'email', 'clipboard', 'constructor', '__proto__', 'toString']) {
        const r = await w.send('capture', { source_type: st, text: 'ttl probe for ' + st }).catch((e) => ({ err: e.message }));
        out[st] = r.id ? (q(w, 'SELECT raw_expires_at x, ts FROM episode WHERE id=?', r.id)[0]) : r.err;
      }
      const days = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v && v.x != null ? Math.round((v.x - v.ts) / 864e5) : (v && v.x === null ? 'NULL(never expires)' : String(v))]));
      const never = Object.entries(days).filter(([, v]) => v === 'NULL(never expires)' || v === 'NaN');
      assert(!never.length, 'source types with no expiry: ' + never.map((x) => x[0]).join(',') + ' all=' + JSON.stringify(days));
      return JSON.stringify(days);
    } finally { await w.close(); rmrf(w.dir); }
  });

  await S.t('L3', 'medium', 'logs have retention: retrieval_log / candidate_log / memory_op do not grow forever and maintain() trims them', async () => {
    const w = new W(mkdir('l3'));
    try {
      await w.send('stats');
      const d = openRW(w.db);
      const ins = d.prepare('INSERT INTO retrieval_log(ts,query,candidates,injected) VALUES(?,?,?,?)');
      for (let i = 0; i < 100; i++) ins.run(Date.now() - 400 * 864e5, 'old query about my salary ' + i, '[]', '[]');
      d.close();
      await w.send('maintain');
      const n = q(w, 'SELECT COUNT(*) n FROM retrieval_log')[0].n;
      assert(n < 100, `${n} 400-day-old retrieval_log rows (verbatim spoken questions) survive maintain(); same for candidate_log.candidate (600 chars of each extracted fact) and memory_op.before/after`);
    } finally { await w.close(); rmrf(w.dir); }
  });

  await S.t('L4', 'medium', 'WAL growth under sustained writes stays bounded; checkpoint state at idle', async () => {
    const w = new W(mkdir('l4'));
    try {
      await w.send('stats');
      for (let i = 0; i < 3000; i++) w.raw(JSON.stringify({ id: 100000 + i, op: 'remember', args: { text: `wal growth memory ${i} about gardening ${rnd(12)} ` + 'filler '.repeat(40) } }));
      const st = await w.send('stats', {}, 60000);
      const wal = () => (fs.existsSync(w.db + '-wal') ? fs.statSync(w.db + '-wal').size : 0);
      const dbs = fs.statSync(w.db).size;
      const peak = wal();
      return `facts=${st.facts}; after 3000 remembers: db=${(dbs / 1e6).toFixed(1)}MB wal=${(peak / 1e6).toFixed(1)}MB (default autocheckpoint 1000 pages; no explicit checkpoint/TRUNCATE ever issued by the app)`;
    } finally { await w.close(); rmrf(w.dir); }
  });

  await S.t('L5', 'high', 'backup feasibility: copying memory.db alone while the worker is running yields an openable, consistent DB (recent commits missing is expected)', async () => {
    const w = new W(mkdir('l5'));
    try {
      for (let i = 0; i < 400; i++) await w.send('remember', { text: `backup memory ${i} about ceramics ${rnd(8)}` });
      const live = q(w, 'SELECT COUNT(*) n FROM fact')[0].n;
      const copy = path.join(w.dir, 'copy-db-only.db'); fs.copyFileSync(w.db, copy);
      const dbOnly = openRO(copy); const n1 = dbOnly.prepare('SELECT COUNT(*) n FROM fact').get().n; const ic1 = dbOnly.prepare('PRAGMA integrity_check').get().integrity_check; dbOnly.close();
      // db+wal copied non-atomically while writing
      const P = []; for (let i = 0; i < 800; i++) P.push(w.send('remember', { text: `during copy ${i} ${rnd(8)}` }));
      const c2 = path.join(w.dir, 'c2'); fs.mkdirSync(c2);
      for (const f of ['memory.db', 'memory.db-wal']) { try { fs.copyFileSync(path.join(w.dir, f), path.join(c2, f)); } catch {} }
      await Promise.all(P);
      let n2 = 'open failed', ic2 = '';
      try { const d2 = openRW(path.join(c2, 'memory.db')); ic2 = d2.prepare('PRAGMA integrity_check').get().integrity_check; n2 = d2.prepare('SELECT COUNT(*) n FROM fact').get().n; d2.close(); } catch (e) { n2 = 'ERR ' + e.message; }
      // the supported way: VACUUM INTO from another connection
      const vi = path.join(w.dir, 'vacuum-into.db'); const d3 = openRW(w.db); d3.exec(`VACUUM INTO '${vi.replace(/'/g, "''")}'`); d3.close();
      const d4 = openRO(vi); const n3 = d4.prepare('SELECT COUNT(*) n FROM fact').get().n, ic3 = d4.prepare('PRAGMA integrity_check').get().integrity_check; d4.close();
      assert(ic1 === 'ok', 'copy not consistent');
      return `db-only copy ${n1}/${live} facts ic=${ic1}; db+wal racy copy -> ${n2} ic=${ic2}; VACUUM INTO ${n3} ic=${ic3} (app has no backup/export op)`;
    } finally { await w.close(); rmrf(w.dir); }
  });
  S.done(); process.exit(0);
})();
