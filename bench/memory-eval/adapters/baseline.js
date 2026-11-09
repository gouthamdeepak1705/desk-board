// Control adapter: plain keyword search over raw episodes. No extraction, no redaction, no trust handling,
// no supersede. Anything a better system does beyond this has to be worth its cost.
const { norm } = require('../lib/text');

const STOP = new Set('the a an and or of to in on for with is are was were be been it this that i you my me we our your at by from as about what who when where how do does did have has had not no yes which whose can should'.split(' '));
const stem = (w) => w.replace(/(ing|ed|es|s)$/, '');
const tokens = (s) => [...new Set(norm(s).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(' ').filter((w) => w.length > 1 && !STOP.has(w)).map(stem))];

function create() {
  let docs = [];
  return {
    name: 'baseline-keyword',
    floor: 0.5, // fraction of the query's (idf-weighted) terms that a document must match to count as "returned"
    async ingest(episodes) {
      docs = episodes.map((e) => ({ id: e.id, ts: e.ts, who: e.who, text: e.text, toks: new Set(tokens(e.text)) }));
      return { episodes: docs.length, extractMs: 0, extractCalls: 0, costUsd: 0 };
    },
    async recall(query, opts = {}) {
      const pool = docs.filter((d) => (!opts.since || d.ts >= opts.since) && (!opts.until || d.ts <= opts.until));
      const qt = tokens(query);
      if (!qt.length) return [];
      const N = docs.length || 1;
      const idf = (t) => Math.log(1 + N / (1 + docs.filter((d) => d.toks.has(t)).length));
      const total = qt.reduce((a, t) => a + idf(t), 0) || 1;
      return pool.map((d) => ({ d, score: qt.reduce((a, t) => a + (d.toks.has(t) ? idf(t) : 0), 0) / total }))
        .filter((x) => x.score > 0).sort((a, b) => b.score - a.score || b.d.ts - a.d.ts).slice(0, 8)
        .map((x) => ({ text: `[${new Date(x.d.ts).toISOString().slice(0, 10)}] (${x.d.who}) ${x.d.text}`, score: +x.score.toFixed(3), trusted: true, kind: 'episode' }));
    },
    // Naive forget: delete the episodes that best match the text.
    async forget(text) {
      const hits = await this.recall(text);
      const strong = hits.filter((h) => h.score >= 0.6).slice(0, 5);
      const gone = new Set(strong.map((h) => h.text));
      const before = docs.length;
      docs = docs.filter((d) => !gone.has(`[${new Date(d.ts).toISOString().slice(0, 10)}] (${d.who}) ${d.text}`));
      return { removed: before - docs.length };
    },
    async dump() { return docs.map((d) => d.text); },
    async reset() { docs = []; },
    async close() {},
  };
}
module.exports = { create };
