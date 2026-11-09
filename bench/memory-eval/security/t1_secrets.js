const assert = require('assert');
const { W, mkdir, rmrf, scanTables, scanBytes, sleep, rnd, suite } = require('./lib');
const createMemory = require('../../../memory/index.js');
const S = suite('secrets');

// [label, () => [text to capture, substrings that must never be stored]]
const R = (n) => rnd(n);
const cases = [
  ['openai sk-proj', () => { const k = 'sk-proj-' + R(48); return [`here is my key ${k} please save it`, [k]]; }],
  ['openai sk- legacy', () => { const k = 'sk-' + R(48); return [`OPENAI_API_KEY=${k}`, [k]]; }],
  ['github ghp_', () => { const k = 'ghp_' + R(36); return [`token ${k} for the repo`, [k]]; }],
  ['aws AKIA', () => { const k = 'AKIA' + R(16).toUpperCase().replace(/[^A-Z0-9]/g, 'A'); return [`aws id ${k} and nothing else`, [k]]; }],
  ['aws secret access key (40 b64)', () => { const k = R(40); return [`aws secret access key is ${k}`, [k]]; }],
  ['stripe sk_live_', () => { const k = 'sk_live_' + R(24); return [`stripe key ${k} for payments`, [k]]; }],
  ['stripe whsec_', () => { const k = 'whsec_' + R(32); return [`webhook signing secret ${k} thanks`, [k]]; }],
  ['jwt', () => { const k = 'eyJhbGciOiJIUzI1NiJ9.' + 'eyJzdWIiOiIxMjM0NTY3ODkwIn0.' + R(43); return [`Authorization: Bearer ${k}`, [k.split('.')[1], k.split('.')[2]]]; }],
  ['private key block', () => { const b = R(64); return [`-----BEGIN RSA PRIVATE KEY-----\n${b}\n${b}\n-----END RSA PRIVATE KEY-----`, [b]]; }],
  ['private key block truncated', () => { const b = R(64); return [`-----BEGIN OPENSSH PRIVATE KEY-----\n${b}`, [b]]; }],
  ['card spaces', () => ['my visa is 4111 1111 1111 1111 exp 12/27', ['4111 1111 1111 1111', '4111111111111111']]],
  ['card dashes', () => ['card 5500-0000-0000-0004 please', ['5500-0000-0000-0004', '5500000000000004']]],
  ['card amex 4-6-5', () => ['amex 3782 822463 10005 cvv 1234', ['3782 822463 10005', '378282246310005']]],
  ['card en-dash / NBSP separators', () => ['card 4111–1111–1111–1111 and 4111 1111 1111 1111', ['4111–1111–1111–1111', '4111 1111 1111 1111']]],
  ['card fails Luhn (typo, still sensitive)', () => ['card 4111 1111 1111 1112', ['4111 1111 1111 1112']]],
  ['card spoken in words', () => ['my card is four one one one one one one one one one one one one one one one', ['four one one one one one']]],
  ['ssn dashed', () => ['my ssn is 078-05-1120', ['078-05-1120']]],
  ['ssn spaced', () => ['social security number 219 09 9999', ['219 09 9999']]],
  ['ssn bare', () => ['SSN: 219099999', ['219099999']]],
  ['pw: "my password for X is"', () => ['my password for netflix is Tr0ub4dor&3pw', ['Tr0ub4dor&3pw']]],
  ['pw: plain "password is"', () => ['my password is Hunter2Hunter2!', ['Hunter2Hunter2']]],
  ['pw: multi-word passphrase', () => ['my passphrase is correct horse battery staple', ['horse battery staple']]],
  ['pw: "login is .. pw .."', () => ['login is bob@example.com pw swordfish77', ['swordfish77']]],
  ['pw: "pw:" abbreviation', () => ['pw: swordfish78', ['swordfish78']]],
  ['pw: "password for X: ..."', () => ['the password for the vpn: Zx9!qLm2ww', ['Zx9!qLm2ww']]],
  ['pw: "use X as the password"', () => ['use Blue-Falcon-1937 as the password', ['Blue-Falcon-1937']]],
  ['pw: "it\'s ..." follow-up', () => ['the password is hidden; it\'s Zebra-Maple-4412', ['Zebra-Maple-4412']]],
  ['code: "the code is 4821"', () => ['the code is 4821', ['4821']]],
  ['code: door/alarm', () => ['the alarm code is 7391 and the door code is 5520', ['7391', '5520']]],
  ['pin without verb', () => ['my bank pin 4821', ['4821']]],
  ['cvv', () => ['cvv 913', ['cvv 913']]],
  ['wifi: "wifi key is"', () => ['the wifi key is Kd8sLq2mZp', ['Kd8sLq2mZp']]],
  ['wifi: "wifi password: words"', () => ['wifi password: correct horse battery staple', ['horse battery staple']]],
  ['wifi: "network X, key Y"', () => ['wifi network HomeNet, key abc123def456', ['abc123def456']]],
  ['recovery phrase 12 words (labelled)', () => ['my recovery phrase: abandon ability able about above absent absorb abstract absurd abuse access accident', ['absorb abstract absurd abuse']]],
  ['seed words (unlabelled)', () => ['write this down: witch collapse practice feed shame open despair creek road again ice least', ['practice feed shame open']]],
  ['url with creds', () => ['clone https://deploy:Pa55w0rdXyz@git.example.com/repo.git', ['Pa55w0rdXyz']]],
  ['db url', () => ['DATABASE_URL=postgres://app:s3cretPw99@db.internal:5432/prod', ['s3cretPw99']]],
  ['bearer short opaque', () => ['curl -H "Authorization: Bearer abc123def456ghi789" x', ['abc123def456ghi789']]],
  ['slack token', () => { const k = 'xoxb-' + R(12) + '-' + R(24); return [`slack ${k}`, [k]]; }],
  ['google api key AIza', () => { const k = 'AIza' + R(35); return [`maps key ${k}`, [k]]; }],
  ['zero-width char splits a key', () => { const a = 'sk-' + R(24), b = R(24); return [`key ${a}​${b}`, [b]]; }],
  ['homoglyph (cyrillic a) in "password"', () => ['my pаssword is Ghost-Rider-8812', ['Ghost-Rider-8812']]],
];

(async () => {
  for (const [label, mk] of cases) {
    await S.t('S1:' + label, 'high', 'secret never stored: ' + label, async () => {
      const dir = mkdir('sec'); const w = new W(dir);
      try {
        const [text, needles] = mk();
        const r = await w.send('capture', { source_type: 'user_voice', text });
        await w.send('capture', { source_type: 'user_typed', text: 'filler so the db has data about cats' });
        const rem = await w.send('remember', { text }).catch((e) => ({ error: String(e.message) }));
        await w.close(); const hits = [...scanTables(w.db, needles), ...scanBytes(dir, needles)];
        assert(!hits.length, `LEAK in ${hits.join(', ')} (capture redacted=${r.redacted}, remember ${JSON.stringify(rem).slice(0, 100)})`);
        return 'redacted hits: ' + (r.redacted || 0);
      } finally { await w.close(); rmrf(dir); }
    });
  }

  await S.t('S2:split', 'medium', 'secret split across two captures ("my password is" / "<value>")', async () => {
    const dir = mkdir('split'); const w = new W(dir);
    try {
      const v = 'Qz7' + rnd(8) + '!';
      await w.send('capture', { source_type: 'user_voice', text: 'my password is' });
      await w.send('capture', { source_type: 'user_voice', text: v });
      await w.close(); const hits = scanTables(w.db, [v]);
      assert(!hits.length, 'split secret stored verbatim in ' + hits.join(','));
    } finally { await w.close(); rmrf(dir); }
  });

  await S.t('S3:recall-query', 'high', 'secret spoken in a recall query is not written to retrieval_log', async () => {
    const dir = mkdir('rq'); const w = new W(dir);
    try {
      const k = 'sk-proj-' + rnd(40), card = '4111 1111 1111 1111', pw = 'Hunter' + rnd(6);
      await w.send('recall', { query: `what did I do with ${k}` });
      await w.send('recall', { query: `is my card ${card} on file` });
      await w.send('recall', { query: `my password is ${pw} do you know it` });
      await w.close(); const hits = scanTables(w.db, [k, card, pw]);
      assert(!hits.length, 'recall queries logged verbatim: ' + hits.join(', '));
    } finally { await w.close(); rmrf(dir); }
  });

  await S.t('S4:embed-payload', 'high', 'text sent to the embedding API contains no secret (recall query + backfill)', async () => {
    const dir = mkdir('emb'); const sent = [];
    const embedFn = async (texts) => { sent.push(...texts); return texts.map((t) => Float32Array.from([1, 0, 0, t.length % 3])); };
    const mem = createMemory({ dataDir: dir, embedFn, log: () => {} });
    try {
      const k = 'sk-proj-' + rnd(40), pw = 'Hunter' + rnd(6), card = '4111 1111 1111 1111';
      await mem.call('recall', { query: `look up ${k}` });
      await mem.call('recall', { query: `my password is ${pw} remind me` });
      await mem.call('recall', { query: `card ${card}` });
      await mem.call('remember', { text: 'I like cats and hot tea' });
      await mem.backfill();
      const joined = sent.join('\n').toLowerCase();
      const leaked = [k, pw, card].filter((s) => joined.includes(s.toLowerCase()));
      assert(!leaked.length, `embedding API would receive ${leaked.length}/3 secrets spoken in recall queries (${sent.length} texts sent)`);
    } finally { mem.stop(); await sleep(400); rmrf(dir); }
  });

  await S.t('S5:extractor-fields', 'high', 'addFacts: secret in object/subject/predicate/entities never stored, incl. candidate_log on rejection', async () => {
    const dir = mkdir('ext'); const w = new W(dir);
    try {
      const pw = 'Zorp' + rnd(8), k1 = 'sk-proj-' + rnd(40), k2 = 'ghp_' + rnd(36);
      const ep = (await w.send('capture', { source_type: 'user_voice', text: 'I told the assistant about my stuff today, nothing special' })).id;
      const r = await w.send('addFacts', { episode_id: ep, candidates: [
        { subject: 'user', predicate: 'wifi', object: 'wifi key is ' + k1, quote: 'my stuff', importance: 8 },
        { subject: k2, predicate: 'pw_' + pw, object: 'has a thing', quote: 'my stuff', importance: 8, entities: [{ name: pw + 'Corp' }] },
      ] });
      await w.close(); const hits = scanTables(w.db, [k1, k2, pw]);
      assert(!hits.length, 'secret persisted via extractor fields: ' + hits.join(', ') + ' result=' + JSON.stringify(r));
    } finally { await w.close(); rmrf(dir); }
  });

  await S.t('S6:capture-meta', 'low', 'secret in source_ref/domain on capture is redacted', async () => {
    const dir = mkdir('meta'); const w = new W(dir);
    try {
      const k = 'sk-proj-' + rnd(40);
      await w.send('capture', { source_type: 'web', text: 'some page text here', source_ref: 'https://x.test/?api_key=' + k, domain: k });
      await w.close(); const hits = scanTables(w.db, [k]);
      assert(!hits.length, 'source_ref/domain stored verbatim: ' + hits.join(','));
    } finally { await w.close(); rmrf(dir); }
  });
  S.done();
  process.exit(0);
})();
