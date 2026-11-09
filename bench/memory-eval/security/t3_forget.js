const assert = require('assert');
const fs = require('fs'), path = require('path');
const { W, mkdir, rmrf, openRO, openRW, scanTables, scanBytes, sleep, suite } = require('./lib');
const S = suite('forget');
const rows = (w, sql, ...a) => { const d = openRO(w.db); try { return d.prepare(sql).all(...a); } finally { d.close(); } };
const cleanup = async (w) => { await w.close(); rmrf(w.dir); };
const nw = (t) => new W(mkdir(t));

(async () => {
  await S.t('F1', 'high', 'forget (remember path): forgotten text absent from every table, fts index, and fts shadow tables', async () => {
    const w = nw('f1');
    try {
      await w.send('remember', { text: 'My dentist is Dr Zorblaxian at Quuxville Clinic' });
      await w.send('remember', { text: 'I like green tea in the morning' });
      await w.send('recall', { query: 'who is my dentist Zorblaxian' });
      const r = await w.send('forget', { query: 'dentist Zorblaxian' });
      assert(r.forgotten === 1, JSON.stringify(r));
      const hits = scanTables(w.db, ['zorblaxian', 'quuxville']);
      assert(!hits.length, 'residue in: ' + hits.join(', '));
      return 'tables clean (includes retrieval_log query? see F1b)';
    } finally { await cleanup(w); }
  });

  await S.t('F1b', 'high', 'forget also scrubs retrieval_log.query / feedback / suggestion_log text that quotes the forgotten memory', async () => {
    const w = nw('f1b');
    try {
      await w.send('remember', { text: 'My dentist is Dr Zorblaxian at Quuxville Clinic' });
      await w.send('recall', { query: 'when is my appointment with Dr Zorblaxian' });
      await w.send('feedback', { kind: 'wrong', detail: 'Zorblaxian is not my dentist' });
      await w.send('logSuggestion', { category: 'x', trigger: 'Zorblaxian reminder' });
      await w.send('forget', { query: 'dentist Zorblaxian' });
      const hits = scanTables(w.db, ['zorblaxian']);
      assert(!hits.length, 'residue in: ' + hits.join(', '));
    } finally { await cleanup(w); }
  });

  await S.t('F2', 'high', 'forget: raw sqlite bytes (db, -wal, free pages) no longer contain the forgotten text', async () => {
    const w = nw('f2');
    try {
      for (let i = 0; i < 30; i++) await w.send('remember', { text: 'filler memory number ' + i + ' about gardening tools' });
      await w.send('remember', { text: 'My secret hideout is the Quuxville lighthouse basement' });
      await w.send('forget', { query: 'hideout Quuxville lighthouse' });
      const live = scanBytes(w.dir, ['quuxville']);
      // best case for the app: after a clean close (checkpoint)
      await w.close();
      const closed = scanBytes(w.dir, ['quuxville']);
      // does VACUUM fix it? (nothing in the app runs VACUUM)
      const d = openRW(w.db); d.exec('PRAGMA wal_checkpoint(TRUNCATE)'); const afterCkpt = scanBytes(w.dir, ['quuxville']); d.exec('VACUUM'); d.exec('PRAGMA wal_checkpoint(TRUNCATE)'); d.close();
      const afterVac = scanBytes(w.dir, ['quuxville']);
      const msg = `while running: [${live}] | after close: [${closed}] | after checkpoint: [${afterCkpt}] | after VACUUM: [${afterVac}]`;
      assert(!live.length && !closed.length, 'forgotten text recoverable from file bytes. ' + msg);
      return msg;
    } finally { await cleanup(w); }
  });

  await S.t('F3', 'high', 'forget leaves no residue in fact row metadata (subject/predicate/entities/aliases) of the tombstone', async () => {
    const w = nw('f3');
    try {
      const ep = (await w.send('capture', { source_type: 'user_voice', text: 'I was diagnosed with Zorbitis last year by Dr Quillfeather' })).id;
      await w.send('addFacts', { episode_id: ep, candidates: [{ subject: 'user', predicate: 'diagnosed_with_zorbitis', object: 'The user has Zorbitis', quote: 'diagnosed with Zorbitis', importance: 8, entities: [{ name: 'Quillfeather', type: 'person', aliases: ['my zorbitis doctor'] }] }] });
      const f = rows(w, "SELECT id FROM fact WHERE status='active'")[0];
      await w.send('forget', { id: f.id });
      const hits = scanTables(w.db, ['zorbitis', 'quillfeather']);
      assert(!hits.length, 'residue in: ' + hits.join(', '));
    } finally { await cleanup(w); }
  });

  await S.t('F4', 'high', 'supersede + forget: forgetting the NEW fact removes its text from memory_op (SUPERSEDE row is keyed on the old id)', async () => {
    const w = nw('f4');
    try {
      const e1 = (await w.send('capture', { source_type: 'user_voice', text: 'I live in Lisbon these days' })).id;
      await w.send('addFacts', { episode_id: e1, candidates: [{ subject: 'user', predicate: 'city', object: 'Lives in Lisbon', quote: 'live in Lisbon', importance: 7, cardinality: 'one' }] });
      const e2 = (await w.send('capture', { source_type: 'user_voice', text: 'I moved to Zanzibarq last week' })).id;
      const r = await w.send('addFacts', { episode_id: e2, candidates: [{ subject: 'user', predicate: 'city', object: 'Lives in Zanzibarq', quote: 'moved to Zanzibarq', importance: 7, cardinality: 'one' }] });
      assert(r.superseded === 1, 'setup: ' + JSON.stringify(r));
      const nf = rows(w, "SELECT id FROM fact WHERE object_text LIKE '%Zanzibarq%'")[0];
      await w.send('forget', { id: nf.id });
      const hits = scanTables(w.db, ['zanzibarq']);
      assert(!hits.length, 'residue in: ' + hits.join(', '));
    } finally { await cleanup(w); }
  });

  await S.t('F4b', 'medium', 'supersede + forget: forgetting the NEW fact leaves the old one archived with superseded_by -> dangling id; old city stays archived (not restored)', async () => {
    const w = nw('f4b');
    try {
      const e1 = (await w.send('capture', { source_type: 'user_voice', text: 'I live in Lisbon these days' })).id;
      await w.send('addFacts', { episode_id: e1, candidates: [{ subject: 'user', predicate: 'city', object: 'Lives in Lisbon', quote: 'live in Lisbon', importance: 7 }] });
      const e2 = (await w.send('capture', { source_type: 'user_voice', text: 'I moved to Zanzibarq last week' })).id;
      await w.send('addFacts', { episode_id: e2, candidates: [{ subject: 'user', predicate: 'city', object: 'Lives in Zanzibarq', quote: 'moved to Zanzibarq', importance: 7, cardinality: 'one' }] });
      await w.send('forget', { query: 'Zanzibarq' });
      const old = rows(w, "SELECT status,superseded_by,valid_to FROM fact WHERE object_text LIKE '%Lisbon%'")[0];
      const rec = await w.send('recall', { query: 'where do I live' });
      assert(old.status === 'active', `after forgetting the wrong/newer fact the previous fact is ${old.status} (superseded_by=${old.superseded_by}); recall("where do I live") => ${JSON.stringify(rec.facts.map((x) => x.text))}`);
    } finally { await cleanup(w); }
  });

  await S.t('F5', 'high', 'forget of a fact whose source episode also supports other facts: forgotten text must not survive in that episode raw_text', async () => {
    const w = nw('f5');
    try {
      const ep = (await w.send('capture', { source_type: 'user_voice', text: 'My sister Marzipana lives in Oslo and I am allergic to Quillnuts' })).id;
      await w.send('addFacts', { episode_id: ep, candidates: [
        { subject: 'marzipana', predicate: 'lives_in', object: 'Marzipana lives in Oslo', quote: 'Marzipana lives in Oslo', importance: 7 },
        { subject: 'user', predicate: 'allergy', object: 'Allergic to Quillnuts', quote: 'allergic to Quillnuts', importance: 8 }] });
      await w.send('forget', { query: 'allergic Quillnuts' });
      const hits = scanTables(w.db, ['quillnuts']);
      assert(!hits.length, 'forgotten allergy still in: ' + hits.join(', '));
    } finally { await cleanup(w); }
  });

  await S.t('F5b', 'high', 'forget BY ID of a fact whose source episode also supports another fact: forgotten text must not survive in the shared episode raw_text / quote', async () => {
    const w = nw('f5b');
    try {
      const ep = (await w.send('capture', { source_type: 'user_voice', text: 'My sister Marzipana lives in Oslo and I am allergic to Quillnuts' })).id;
      await w.send('addFacts', { episode_id: ep, candidates: [
        { subject: 'marzipana', predicate: 'lives_in', object: 'Marzipana lives in Oslo', quote: 'Marzipana lives in Oslo', importance: 7 },
        { subject: 'user', predicate: 'allergy', object: 'Allergic to Quillnuts', quote: 'allergic to Quillnuts', importance: 8 }] });
      const f = rows(w, "SELECT id FROM fact WHERE object_text LIKE '%Quillnuts%'")[0];
      await w.send('forget', { id: f.id });
      const hits = scanTables(w.db, ['quillnuts']);
      assert(!hits.length, 'forgotten allergy still in: ' + hits.join(', '));
    } finally { await cleanup(w); }
  });

  await S.t('F6', 'high', 'forget does not delete unrelated facts or erase unrelated episodes (the 2-word AND sweep over ep_fts)', async () => {
    const w = nw('f6');
    try {
      const e1 = (await w.send('capture', { source_type: 'user_voice', text: 'my dentist appointment is on Tuesday' })).id;
      await w.send('addFacts', { episode_id: e1, candidates: [{ subject: 'user', predicate: 'dentist', object: 'Dentist appointment is on Tuesday', quote: 'dentist appointment is on Tuesday', importance: 6 }] });
      const e2 = (await w.send('capture', { source_type: 'user_voice', text: 'Priya asked me to move the dentist appointment reminder into the shared quarterly planning doc' })).id;
      await w.send('addFacts', { episode_id: e2, candidates: [{ subject: 'priya', predicate: 'owns', object: 'Priya owns the shared quarterly planning doc', quote: 'shared quarterly planning doc', importance: 7 }] });
      await w.send('capture', { source_type: 'user_voice', text: 'unprocessed: remember the dentist appointment form is in the blue folder' });
      await w.send('forget', { query: 'dentist appointment' });
      const e2raw = rows(w, 'SELECT raw_text FROM episode WHERE id=?', e2)[0].raw_text;
      const pri = rows(w, "SELECT status FROM fact WHERE subject='priya'")[0].status;
      const erased = rows(w, 'SELECT COUNT(*) n FROM episode WHERE raw_text IS NULL')[0].n;
      assert(e2raw !== null, `episode ${e2} (source of the still-active Priya fact, status=${pri}) had its raw_text erased by an unrelated forget; ${erased} episodes erased total, so "why" quote/audit trail is broken`);
    } finally { await cleanup(w); }
  });

  await S.t('F7', 'high', 'forget by ambiguous query refuses and deletes nothing', async () => {
    const w = nw('f7');
    try {
      await w.send('remember', { text: 'My cat is called Miso and she is grey' });
      await w.send('remember', { text: 'My cat Mochi is the black one' });
      const r = await w.send('forget', { query: 'my cat' });
      const n = rows(w, "SELECT COUNT(*) n FROM fact WHERE status='active'")[0].n;
      assert(r.ambiguous && n === 2, `result=${JSON.stringify(r).slice(0, 200)} active=${n}`);
      const r2 = await w.send('forget', { query: '' }); const r3 = await w.send('forget', {}); const r4 = await w.send('forget', { query: 'the a an' });
      assert(r2.forgotten === 0 && r3.forgotten === 0 && r4.forgotten === 0, 'empty/stopword queries: ' + JSON.stringify([r2, r3, r4]));
      return 'ambiguous refused; empty / stopword-only queries delete nothing';
    } finally { await cleanup(w); }
  });

  await S.t('F7b', 'medium', 'forget with one generic word matching exactly one fact deletes it without confirmation (single-token query)', async () => {
    const w = nw('f7b');
    try {
      await w.send('remember', { text: 'My mortgage is with Halcyon Bank, 3.1 percent fixed' });
      await w.send('remember', { text: 'I like tea' });
      const r = await w.send('forget', { query: 'bank' });
      assert(!r.forgotten, 'single-word query "bank" erased: ' + JSON.stringify(r.was) + ' (no confirmation step; the voice model chooses the query)');
    } finally { await cleanup(w); }
  });

  await S.t('F8', 'high', 'forget removes the embedding (db + in-memory index) and a late setEmbeddings cannot resurrect it', async () => {
    const w = nw('f8');
    try {
      const a = (await w.send('remember', { text: 'My locker code is stored under Quuxvillian rock' })).id;
      const b = (await w.send('remember', { text: 'I like jazz' })).id;
      await w.send('setEmbeddings', { model: 'm', items: [{ id: a, vec: [1, 0, 0, 0] }, { id: b, vec: [0, 1, 0, 0] }] });
      const before = await w.send('recall', { query: 'zzzz', qvec: [1, 0, 0, 0] });
      assert(before.facts.some((f) => f.id === a), 'setup: vector recall should find fact a: ' + JSON.stringify(before.facts));
      await w.send('forget', { id: a });
      const late = await w.send('setEmbeddings', { model: 'm', items: [{ id: a, vec: [1, 0, 0, 0] }] });
      const after = await w.send('recall', { query: 'zzzz', qvec: [1, 0, 0, 0] });
      const blob = rows(w, 'SELECT embedding FROM fact WHERE id=?', a)[0].embedding;
      assert(!after.facts.some((f) => f.id === a) && blob === null && late.stored === 0, `late.stored=${late.stored} blob=${blob && 'present'} recall=${JSON.stringify(after.facts.map((f) => f.id))}`);
      const need = await w.send('needEmbed', { limit: 50, model: 'other' });
      assert(!need.some((n) => n.id === a), 'needEmbed offers forgotten fact');
    } finally { await cleanup(w); }
  });

  await S.t('F9', 'medium', 'orphaned entities are removed; entities shared with other facts keep their rows but not the forgotten fact\'s aliases', async () => {
    const w = nw('f9');
    try {
      const ep = (await w.send('capture', { source_type: 'user_voice', text: 'Priya has Zorbitis and Priya runs the Atlas project' })).id;
      await w.send('addFacts', { episode_id: ep, candidates: [
        { subject: 'priya', predicate: 'health', object: 'Priya has Zorbitis', quote: 'Priya has Zorbitis', importance: 8, entities: [{ name: 'Priya', type: 'person', aliases: ['my zorbitis friend'] }, { name: 'Zorbitis Clinic', type: 'org' }] },
        { subject: 'priya', predicate: 'runs', object: 'Priya runs the Atlas project', quote: 'Priya runs the Atlas project', importance: 7, entities: [{ name: 'Priya', type: 'person' }, { name: 'Atlas', type: 'project' }] }] });
      await w.send('forget', { query: 'Priya Zorbitis' });
      const ents = rows(w, 'SELECT name,aliases FROM entity').map((e) => e.name + '|' + e.aliases);
      assert(!ents.some((e) => /zorbitis/i.test(e)), 'entities still mention forgotten text: ' + ents.join(' ; '));
      return 'entities: ' + ents.join(' ; ');
    } finally { await cleanup(w); }
  });

  await S.t('F10', 'high', 'forgotten fact cannot be resurrected by confirm / pin / list', async () => {
    const w = nw('f10');
    try {
      const a = (await w.send('remember', { text: 'The vault code hint is Quillfeather' })).id;
      await w.send('forget', { id: a });
      await w.send('confirm', { id: a }); await w.send('pin', { id: a });
      const f = rows(w, 'SELECT status,object_text,key_text FROM fact WHERE id=?', a)[0];
      assert(f.status === 'forgotten', `confirm() on a forgotten id flipped status to '${f.status}' (text=${f.object_text}); resurrected tombstone with NULL text now appears in recall/list/stats`);
    } finally { await cleanup(w); }
  });

  await S.t('F11', 'medium', 'forget before extraction: the same statement sitting in an unprocessed episode is not re-extracted after a 1-word forget', async () => {
    const w = nw('f11');
    try {
      const ep = (await w.send('capture', { source_type: 'user_voice', text: 'My dentist is Dr Zorblaxian' })).id;
      await w.send('forget', { query: 'Zorblaxian' });
      const ep2 = rows(w, 'SELECT raw_text FROM episode WHERE id=?', ep)[0];
      assert(ep2.raw_text === null, 'forget("Zorblaxian") (single token) ignored the not-yet-extracted episode; extractor will later create the fact the user just asked to forget. Pending: ' + JSON.stringify(await w.send('pending', {})).slice(0, 120));
    } finally { await cleanup(w); }
  });

  await S.t('F12', 'medium', 'forget with id on already-forgotten / nonexistent / weird ids', async () => {
    const w = nw('f12');
    try {
      const a = (await w.send('remember', { text: 'Some memory about Quuxville' })).id;
      const r1 = await w.send('forget', { id: a }); const r2 = await w.send('forget', { id: a }); const r3 = await w.send('forget', { id: 99999 });
      const r4 = await w.send('forget', { id: '1 OR 1=1' }).catch((e) => ({ err: e.message })); const r5 = await w.send('forget', { id: [1] }).catch((e) => ({ err: e.message }));
      assert(r1.forgotten === 1 && r2.forgotten === 0 && r3.forgotten === 0, JSON.stringify([r1, r2, r3]));
      return JSON.stringify([r4, r5]);
    } finally { await cleanup(w); }
  });
  S.done(); process.exit(0);
})();
