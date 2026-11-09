const assert = require('assert');
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const { W, mkdir, rmrf, openRO, openRW, scanTables, sleep, rnd, suite, MEM } = require('./lib');
const S = suite('robust');
const rows = (db, sql, ...a) => { const d = openRO(db); try { return d.prepare(sql).all(...a); } finally { d.close(); } };
const createMemory = require('../../../memory/index.js');
const uncaught = []; process.on('uncaughtException', (e) => uncaught.push(String((e && e.message) || e)));
const ALIVE = async (w, ms = 3000) => { const r = await w.send('stats', {}, ms); return r; };

(async () => {
  await S.t('R1', 'high', 'malformed / odd JSON lines never crash the worker (null, [], 123, "str", truncated, huge nesting, unknown op, __proto__ ops)', async () => {
    const w = new W(mkdir('r1'));
    try {
      await ALIVE(w);
      const bad = ['{"op":', 'not json', '[]', '123', '"str"', 'true', '{}', '{"id":1}', '{"op":"stats"}', '{"id":2,"op":"__proto__"}', '{"id":3,"op":"constructor","args":{"a":1}}', '{"id":4,"op":"hasOwnProperty"}', '{"id":5,"op":"stats","args":5}', '{"id":6,"op":"recall","args":"str"}', '[' .repeat(5000) + ']'.repeat(5000), '\u0000\u0001', ''];
      const died = [];
      for (const l of bad) { w.raw(l); await sleep(60); if (w.exited) { died.push(JSON.stringify(l).slice(0, 40)); break; } }
      w.raw('null'); await sleep(300);
      assert(!w.exited, `worker process EXITED (code ${w.code}) on input line: ${died[0] || 'null'}; stderr: ${w.stderr.slice(0, 200).replace(/\n/g, ' ')}`);
      await ALIVE(w);
    } finally { await w.close(); rmrf(w.dir); }
  });
  await S.t('R1b', 'high', 'the JSON line "null" specifically (m=null -> TypeError thrown inside catch)', async () => {
    const w = new W(mkdir('r1b'));
    try { await ALIVE(w); w.raw('null'); await sleep(500); assert(!w.exited, `worker exited code=${w.code} on line "null": ${w.stderr.split('\n').find((l) => /TypeError/.test(l)) || ''}`); }
    finally { await w.close(); rmrf(w.dir); }
  });

  await S.t('R2', 'high', 'op fuzz: every op x wrong-typed args answers (ok or error) in <3s and the worker stays alive', async () => {
    const w = new W(mkdir('r2'));
    try {
      await w.send('remember', { text: 'seed fact about Quuxville gardening' });
      const OPS = ['capture', 'remember', 'forget', 'recall', 'addFacts', 'needEmbed', 'setEmbeddings', 'known', 'pending', 'markProcessed', 'why', 'confirm', 'pin', 'feedback', 'logSuggestion', 'list', 'profile', 'graph', 'entityFacts', 'stats', 'setPaused', 'maintain'];
      const ARGS = [null, [], 'x', 5, {}, { id: null }, { id: [1] }, { id: {} }, { id: '1' }, { id: -1 }, { id: 1e300 }, { query: null }, { query: ['a', 'b'] }, { query: {} }, { query: 'x'.repeat(100000) }, { text: {} }, { text: [] }, { text: null }, { source_type: {}, text: 'abc' }, { source_type: '__proto__', text: 'abc def' }, { limit: 'abc' }, { limit: -5 }, { limit: 1e12 }, { since: 'abc' }, { until: {} }, { qvec: 'x' }, { qvec: [null, 'a', {}] }, { qvec: new Array(5000).fill(0.1) },
        { candidates: 'str' }, { candidates: [null] }, { candidates: [5] }, { candidates: [{}] }, { episode_id: 1, candidates: [{ object: 'x', predicate: {}, quote: 'seed', importance: 9 }] }, { episode_id: 1, candidates: [{ object: 'xx', predicate: 'p', quote: 'seed', importance: 9, replaces: 'abc', entities: 'zzz', cardinality: 'one' }] }, { episode_id: 1, candidates: [{ object: 'xx', predicate: 'p', quote: 'seed', importance: 9, replaces: [{}, null, 1e99], entities: [null, 5, { name: {} }] }] },
        { items: 'x' }, { items: [null] }, { items: [{ id: 1, vec: 'x' }] }, { items: [{ id: 1, vec: [NaN] }] }, { ids: 'abc' }, { ids: [{}] }, { on: 'yes' }, { name: {} }, { status: {} }, { kind: {}, id: 1 }, { s: 1, category: {} }, { maxChars: -1 }, { maxChars: 'a' }];
      const bad = [];
      for (const op of OPS) for (const a of ARGS) {
        if (op === 'setPaused') continue;
        const t0 = Date.now();
        try { await w.send(op, a, 3000); } catch (e) { if (/TIMEOUT|worker exited/.test(e.message)) bad.push(`${op}(${JSON.stringify(a).slice(0, 40)}) -> ${e.message}`); }
        if (w.exited) { bad.push(`WORKER DIED on ${op}(${JSON.stringify(a).slice(0, 60)})`); break; }
      }
      assert(!bad.length, bad.slice(0, 5).join(' | '));
      await ALIVE(w); return `${OPS.length * ARGS.length} calls survived`;
    } finally { await w.close(); rmrf(w.dir); }
  });

  await S.t('R3', 'high', 'SQL injection strings and FTS5 query syntax (quotes, NEAR, *, col:, parens, ^, -) in every text arg: tables intact, no error, no exfil', async () => {
    const w = new W(mkdir('r3'));
    try {
      await w.send('remember', { text: 'canary memory about Quuxville' });
      const P = ["'; DROP TABLE fact;--", '" OR 1=1 --', "x') UNION SELECT raw_text FROM episode--", '"unterminated', 'NEAR(a b, 2)', 'key_text:Quuxville', '* OR *', '(((', ')))', '^Quuxville', '-Quuxville', 'a AND NOT b', '{key_text}: x', 'Quuxville*', '\\', '%', '_', "\u0000", '𝔘𝔫𝔦𝔠𝔬𝔡𝔢 ‮RTL‬ 😀'.repeat(50), '\\x00'];
      const bad = [];
      for (const p of P) {
        const calls = [['capture', { source_type: p, text: p + ' padding text' }], ['capture', { source_type: 'user_typed', text: p + ' padding', source_ref: p, domain: p }], ['remember', { text: p + ' padding', subject: p, predicate: p, kind: p, domain: p }],
          ['recall', { query: p, domain: p }], ['recall', { query: p, since: p, until: p }], ['forget', { query: p }], ['why', { query: p }], ['entityFacts', { name: p }], ['list', { status: p }], ['feedback', { kind: p, detail: p }], ['logSuggestion', { category: p, trigger: p, outcome: p }], ['needEmbed', { model: p }],
          ['addFacts', { episode_id: 1, extractor: p, candidates: [{ subject: p, predicate: p, object: p + ' obj', quote: 'canary', importance: 9, kind: p, entities: [{ name: p, type: p, aliases: [p] }] }] }]];
        for (const [op, a] of calls) { try { const r = await w.send(op, a, 4000); } catch (e) { if (/TIMEOUT|exited|syntax|malformed/i.test(e.message)) bad.push(`${op}(${p.slice(0, 20)}): ${e.message}`); } }
      }
      const tabs = rows(w.db, "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('fact','episode','fact_fts','memory_op')").length;
      const canary = rows(w.db, "SELECT COUNT(*) n FROM fact WHERE object_text LIKE '%canary memory%'")[0].n;
      assert(!w.exited && tabs === 4 && canary === 1, `tables=${tabs} canary=${canary} exited=${w.exited}`);
      assert(!bad.length, 'errors: ' + bad.slice(0, 5).join(' | '));
      const e1 = await w.send('recall', { query: 'x', since: 'abc' }).catch((e) => e.message);
      return 'recall(since:"abc") -> ' + (typeof e1 === 'string' ? e1 : 'ok');
    } finally { await w.close(); rmrf(w.dir); }
  });

  await S.t('R4', 'high', 'SIGKILL mid-batch (pipelined remember/addFacts txs): integrity_check ok, fts/fact/episode counts consistent, restart works', async () => {
    const dir = mkdir('r4'); let w = new W(dir);
    try {
      await ALIVE(w);
      for (let i = 0; i < 4000; i++) w.raw(JSON.stringify({ id: 1000 + i, op: 'remember', args: { text: 'batch memory number ' + i + ' about Quuxville pottery ' + rnd(10) } }));
      await sleep(150); await w.kill();
      const d = openRW(w.db);
      const ic = d.prepare('PRAGMA integrity_check').all()[0].integrity_check;
      const nf = d.prepare("SELECT COUNT(*) n FROM fact").get().n, nfts = d.prepare('SELECT COUNT(*) n FROM fact_fts_docsize').get().n;
      const ne = d.prepare('SELECT COUNT(*) n FROM episode').get().n, nefts = d.prepare('SELECT COUNT(*) n FROM ep_fts_docsize').get().n;
      const nfs = d.prepare('SELECT COUNT(*) n FROM fact_source').get().n, nops = d.prepare('SELECT COUNT(*) n FROM memory_op').get().n;
      d.close();
      assert(ic === 'ok', 'integrity_check: ' + ic);
      assert(nf === nfts && ne === nefts && nf === nfs && nf === nops && nf > 0, `inconsistent: facts=${nf} fact_fts=${nfts} episodes=${ne} ep_fts=${nefts} sources=${nfs} ops=${nops}`);
      w = new W(dir); const st = await ALIVE(w, 8000);
      return `killed after ${nf}/4000 facts; consistent; restart stats.facts=${st.facts}`;
    } finally { await w.close(); rmrf(dir); }
  });

  await S.t('R5', 'high', 'index.js: killing the worker -> pending calls reject quickly, auto-restart within ~4s, no uncaught EPIPE in the host', async () => {
    const dir = mkdir('r5'); const mem = createMemory({ dataDir: dir, embedFn: async () => { throw new Error('off'); }, log: () => {}, settings: () => ({ memoryEmbeddings: false }) });
    try {
      await mem.call('remember', { text: 'persisted before kill about Quuxville' });
      const pid = () => { try { const o = execFileSync('powershell', ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*${path.basename(dir)}*' } | Select-Object -First 1).ProcessId`], { encoding: 'utf8' }).trim(); return +o; } catch { return 0; } };
      const p = pid(); assert(p > 0, 'could not find worker pid');
      uncaught.length = 0;
      process.kill(p, 'SIGKILL');
      const errs = []; const t0 = Date.now();
      // hammer calls during the dead window
      for (let i = 0; i < 40; i++) { mem.call('stats').catch((e) => errs.push(e.message)); await sleep(5); }
      let up = null; for (let i = 0; i < 40; i++) { await sleep(250); try { up = await mem.call('stats'); break; } catch {} }
      assert(up, 'worker never came back');
      const rec = await mem.call('recall', { query: 'Quuxville' });
      assert(rec.facts.length === 1, 'data lost after restart');
      assert(!uncaught.length, 'uncaughtException in host: ' + uncaught.join(' | '));
      return `restarted in ${Date.now() - t0}ms; ${errs.length} of 40 in-flight calls rejected (${[...new Set(errs)].join(' / ')})`;
    } finally { mem.stop(); await sleep(400); rmrf(dir); }
  });

  await S.t('R6', 'medium', 'two clients/workers on the same DB interleaving writes: no SQLITE_BUSY errors surface', async () => {
    const dir = mkdir('r6'); const a = new W(dir); let b;
    try {
      await ALIVE(a); b = new W(dir); await Promise.race([b.ready, sleep(4000)]); assert(!b.exited, 'second worker on the same db crashed at startup: ' + (b.stderr.match(/database is locked/) ? 'database is locked' : b.stderr.slice(0, 100))); await ALIVE(b);
      const errs = [];
      const run = async (w, tag) => { for (let i = 0; i < 150; i++) { try { await w.send(i % 3 ? 'remember' : 'capture', i % 3 ? { text: `${tag} memory ${i} about ${rnd(8)}` } : { source_type: 'user_voice', text: `${tag} capture ${i} ${rnd(12)}` }); } catch (e) { errs.push(e.message); } } };
      await Promise.all([run(a, 'A'), run(b, 'B')]);
      const ic = rows(a.db, 'PRAGMA integrity_check')[0].integrity_check;
      assert(ic === 'ok');
      assert(!errs.length, `${errs.length} errors out of 300, e.g. "${errs[0]}" (no busy_timeout set on the connection)`);
    } finally { await a.close(); await b.close(); rmrf(dir); }
  });

  await S.t('R7a', 'medium', '1 MB capture + adversarial 1 MB regex inputs complete fast (ReDoS) and do not block the worker', async () => {
    const w = new W(mkdir('r7a'));
    try {
      const inputs = { words: ('lorem ipsum dolor sit amet ' ).repeat(40000), digits: '1 '.repeat(500000), digitsNoSpace: '7'.repeat(1000000), pins: 'pin '.repeat(250000), pwspaces: 'password' + ' '.repeat(1000000) + 'x', keyblocks: '-----BEGIN PRIVATE KEY-----'.repeat(40000), b64: 'aB3'.repeat(333333), dashes: '4111-'.repeat(200000), unicode: '😀مرحبا‮'.repeat(150000) };
      const times = [];
      for (const [k, v] of Object.entries(inputs)) { const t0 = Date.now(); await w.send('capture', { source_type: 'user_typed', text: v }, 60000).catch((e) => times.push(k + ' ERR ' + e.message)); times.push(`${k}:${Date.now() - t0}ms`); }
      const slow = times.filter((t) => /ERR/.test(t) || +t.split(':')[1].replace('ms', '') > 3000);
      const sz = fs.statSync(w.db).size + (fs.existsSync(w.db + '-wal') ? fs.statSync(w.db + '-wal').size : 0);
      assert(!slow.length, 'slow/err: ' + slow.join(', '));
      return times.join(' ') + ` ; db+wal=${(sz / 1e6).toFixed(0)}MB for 9 MB input (no per-episode size cap)`;
    } finally { await w.close(); rmrf(w.dir); }
  });
  await S.t('R7b', 'medium', '10,000 captures: throughput, worker stays responsive, recall latency', async () => {
    const w = new W(mkdir('r7b'));
    try {
      const t0 = Date.now(); const P = [];
      for (let i = 0; i < 10000; i++) P.push(w.send('capture', { source_type: 'user_voice', text: `capture ${i} ` + rnd(30) + ' pottery wheel ' + (i % 50) }, 120000));
      await Promise.all(P); const dt = Date.now() - t0;
      const t1 = Date.now(); const r = await w.send('recall', { query: 'pottery wheel 7' }); const rt = Date.now() - t1;
      const st = await w.send('stats'); const pend = await w.send('pending', { limit: 100 });
      assert(dt < 60000, `10k captures took ${dt}ms`);
      return `10k captures ${dt}ms (${(dt / 10).toFixed(2)}ms each), recall ${rt}ms, episodes=${st.episodes}, pending() returns ${pend.length}`;
    } finally { await w.close(); rmrf(w.dir); }
  });

  await S.t('R8', 'high', 'pause semantics: nothing stored while paused (capture/remember/addFacts/recall logging), recall still works, resume works', async () => {
    const w = new W(mkdir('r8'));
    try {
      const a = await w.send('remember', { text: 'before pause I like Quuxville tea' });
      const ep = (await w.send('capture', { source_type: 'user_voice', text: 'pending item before pause: my dog is Rex' })).id;
      await w.send('setPaused', { on: true });
      const c = await w.send('capture', { source_type: 'user_voice', text: 'said while paused SECRETPAUSEWORD' });
      const r = await w.send('remember', { text: 'remember while paused SECRETPAUSEWORD' });
      const f = await w.send('addFacts', { episode_id: ep, candidates: [{ subject: 'user', predicate: 'dog', object: 'dog is Rex', quote: 'my dog is Rex', importance: 8 }] });
      const logsBefore = rows(w.db, 'SELECT COUNT(*) n FROM retrieval_log')[0].n;
      const rec = await w.send('recall', { query: 'SECRETPAUSEWORD Quuxville tea' });
      const logsAfter = rows(w.db, 'SELECT COUNT(*) n FROM retrieval_log')[0].n;
      const problems = [];
      if (!(c.skipped && r.error)) problems.push('capture/remember not blocked');
      if (!rec.facts.length) problems.push('recall blocked while paused (acceptable?)');
      if (f.added) problems.push('addFacts still writes new facts while paused (an extraction that started before pausing, or any direct call)');
      if (logsAfter > logsBefore) problems.push('recall still writes the query to retrieval_log while paused');
      if (scanTables(w.db, ['SECRETPAUSEWORD']).length) problems.push('paused-time text found in db: ' + scanTables(w.db, ['SECRETPAUSEWORD']).join(','));
      await w.send('setPaused', { on: false });
      const c2 = await w.send('capture', { source_type: 'user_voice', text: 'after resume works fine' });
      assert(c2.id, 'resume failed');
      assert(!problems.length, problems.join('; '));
    } finally { await w.close(); rmrf(w.dir); }
  });
  await S.t('R8b', 'medium', 'pause via index.js: extractNow while paused skips (no claude call)', async () => {
    const dir = mkdir('r8b'); const mem = createMemory({ dataDir: dir, embedFn: async () => { throw new Error('x'); }, log: () => {}, settings: () => ({}) });
    try { await mem.call('capture', { source_type: 'user_voice', text: 'hello there world' }); await mem.call('setPaused', { on: true }); const r = await mem.extractNow(); assert(r.skipped === 'paused', JSON.stringify(r)); } finally { mem.stop(); await sleep(300); rmrf(dir); }
  });

  // ---- embed.js against a stubbed fetch ----
  const embedLib = require('../../../memory/embed.js');
  const realFetch = global.fetch; const appdata = mkdir('appdata'); const keyDir = path.join(appdata, 'desk-board'); fs.mkdirSync(keyDir, { recursive: true });
  const DUMMYKEY = 'sk-dummy-' + rnd(30); process.env.APPDATA = appdata;
  const withFetch = async (impl, fn) => { global.fetch = impl; try { return await fn(); } finally { global.fetch = realFetch; } };
  const okResp = (n) => ({ ok: true, status: 200, json: async () => ({ data: Array.from({ length: n }, (_, i) => ({ index: i, embedding: [1, 2, 3, 4] })) }) });
  await S.t('E1', 'low', 'embed.js: key file missing -> clean error, no key in message', async () => {
    try { await embedLib.embed(['hi']); assert.fail('should throw'); } catch (e) { assert(/no embedding key/.test(e.message), e.message); }
  });
  fs.writeFileSync(path.join(keyDir, 'openai.key'), DUMMYKEY + '\n');
  for (const [name, impl, rx] of [
    ['401', async () => ({ ok: false, status: 401 }), /http 401/], ['429', async () => ({ ok: false, status: 429 }), /http 429/], ['500', async () => ({ ok: false, status: 500 }), /http 500/],
    ['bad json body', async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token < in JSON'); } }), /./],
    ['wrong count', async () => okResp(0), /count mismatch/], ['missing embedding field', async () => ({ ok: true, json: async () => ({ data: [{ index: 0 }] }) }), /./],
    ['network error echoing headers', async (u, o) => { throw new TypeError('fetch failed ' + o.headers.Authorization); }, /request failed/],
  ]) await S.t('E2:' + name, 'medium', `embed.js: API ${name} -> rejects cleanly, message never contains the key`, async () => {
    fs.writeFileSync(path.join(keyDir, 'openai.key'), DUMMYKEY);
    await withFetch(impl, async () => { try { await embedLib.embed(['hi']); assert.fail('did not reject'); } catch (e) { assert(rx.test(e.message), e.message); assert(!e.message.includes(DUMMYKEY), 'KEY IN ERROR MESSAGE'); } });
  });
  await S.t('E3', 'medium', 'embed.js: slow API honours timeoutMs (abort)', async () => {
    const t0 = Date.now();
    await withFetch((u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'TimeoutError' })))), async () => { try { await embedLib.embed(['x'], { timeoutMs: 300 }); assert.fail('no throw'); } catch (e) { assert(/timed out/.test(e.message), e.message); } });
    return 'aborted after ' + (Date.now() - t0) + 'ms';
  });
  await S.t('E4', 'medium', 'embed.js: a key with an illegal header char (real fetch) fails without echoing the key', async () => {
    fs.writeFileSync(path.join(keyDir, 'openai.key'), 'sk-badĀkey' + rnd(10)); const k = fs.readFileSync(path.join(keyDir, 'openai.key'), 'utf8');
    // module caches the key: force reload
    delete require.cache[require.resolve('../../../memory/embed.js')]; const fresh = require('../../../memory/embed.js');
    try { await fresh.embed(['x']); assert.fail('no throw'); } catch (e) { assert(!e.message.includes(k) && !e.message.includes('sk-bad'), 'KEY IN MESSAGE: ' + e.message); }
  });
  await S.t('E5', 'medium', 'embed.js: caches a stale key forever except on 401; re-reading the file after rotate', async () => {
    delete require.cache[require.resolve('../../../memory/embed.js')]; const fresh = require('../../../memory/embed.js');
    fs.writeFileSync(path.join(keyDir, 'openai.key'), 'sk-old-' + rnd(20)); const seen = [];
    await withFetch(async (u, o) => { seen.push(o.headers.Authorization); return okResp(1); }, async () => { await fresh.embed(['a']); fs.writeFileSync(path.join(keyDir, 'openai.key'), 'sk-new-' + rnd(20)); await fresh.embed(['b']); });
    return seen[0] !== seen[1] ? 'picked up' : 'rotated key file NOT picked up until a 401 (cache); info only';
  });
  await S.t('E6', 'medium', 'index.js recall with a hung/slow embedder: bounded latency and no pile-up (query vector failures never trip the 3-strike pause)', async () => {
    delete require.cache[require.resolve('../../../memory/embed.js')];
    const dir = mkdir('e6'); let calls = 0;
    const mem = createMemory({ dataDir: dir, embedFn: (t, o) => { calls++; return new Promise((_, rej) => setTimeout(() => rej(new Error('embedding timed out')), o.timeoutMs)); }, log: () => {}, settings: () => ({}) });
    try {
      await mem.call('remember', { text: 'Quuxville note' }); const times = [];
      for (let i = 0; i < 6; i++) { const t0 = Date.now(); await mem.call('recall', { query: 'Quuxville ' + i }); times.push(Date.now() - t0); }
      const worst = Math.max(...times);
      assert(worst < 1500, 'slow: ' + times.join(','));
      assert(calls <= 4, `every recall pays the full ${Math.min(...times)}ms embed timeout and re-hits the API (${calls} embed attempts in 6 recalls; no backoff for query vectors): ${times.join(',')}ms`);
    } finally { mem.stop(); await sleep(300); rmrf(dir); }
  });
  await S.t('E7', 'low', 'index.js: wrong-dimension vector from setEmbeddings wipes the whole in-memory vector index', async () => {
    const w = new W(mkdir('e7'));
    try {
      const ids = []; for (const t of ['alpha note one', 'beta note two', 'gamma note three']) ids.push((await w.send('remember', { text: t })).id);
      await w.send('setEmbeddings', { model: 'm', items: ids.map((id, i) => ({ id, vec: [i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0, 0] })) });
      const ok = await w.send('recall', { query: 'zzzz', qvec: [1, 0, 0, 0] }); assert(ok.facts.some((f) => f.id === ids[0]), 'setup');
      await w.send('setEmbeddings', { model: 'm', items: [{ id: ids[2], vec: [1, 2, 3] }] }); // one bad row
      const after = await w.send('recall', { query: 'zzzz', qvec: [0, 1, 0, 0] });
      assert(after.facts.some((f) => f.id === ids[1]), 'one wrong-dim vector (3 vs 4) silently dropped every other embedding from the live index until restart; found=' + JSON.stringify(after.facts.map((f) => f.id)));
    } finally { await w.close(); rmrf(w.dir); }
  });
  rmrf(appdata);
  S.done(); process.exit(0);
})();
