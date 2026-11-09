// Turns results.jsonl into comparison tables: accuracy, speed and cost per model.
// Usage: node bench/summary.js <results folder>
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const rows = fs.readFileSync(path.join(dir, 'results.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const prices = JSON.parse(fs.readFileSync(path.join(__dirname, 'prices.json'), 'utf8'));
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const cost = (r) => { const p = prices[r.model]; return p ? (r.inTok / 1e6) * p.in + (r.outTok / 1e6) * p.out : 0; };
const pct = (n, d) => (d ? Math.round((100 * n) / d) + '%' : '-');
const money = (v) => (v < 0.01 ? '$' + v.toFixed(4) : '$' + v.toFixed(3));

const models = [...new Set(rows.map((r) => r.model))];
const tasksOf = (arr) => [...new Set(arr.map((r) => r.task + '/' + r.size))];
const out = [];
const table = (head, body) => { out.push('| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|'); body.forEach((b) => out.push('| ' + b.join(' | ') + ' |')); out.push(''); };

out.push(`# Benchmark results: ${path.basename(dir)}`, '', `${rows.length} runs, ${models.length} models. Prices are unverified third-party figures (see prices.json).`, '');

// overall, best first
const overall = models.map((m) => {
  const r = rows.filter((x) => x.model === m), ok = r.filter((x) => x.pass), errs = r.filter((x) => x.detail && x.detail.error);
  const total = r.reduce((s, x) => s + cost(x), 0);
  return { m, n: r.length, ok: ok.length, errs: errs.length, secs: median(r.filter((x) => x.secs).map((x) => x.secs)), steps: mean(r.map((x) => x.steps)), inTok: mean(r.map((x) => x.inTok)), outTok: mean(r.map((x) => x.outTok)), perRun: mean(r.map(cost)), perPass: ok.length ? total / ok.length : Infinity, total };
}).sort((a, b) => b.ok / b.n - a.ok / a.n || a.secs - b.secs);
out.push('## Overall', '');
table(['Model', 'Passed', 'Accuracy', 'Median time', 'Avg steps', 'Avg tokens in/out', 'Cost per run', 'Cost per success', 'Errors'],
  overall.map((o) => [o.m, `${o.ok}/${o.n}`, pct(o.ok, o.n), o.secs.toFixed(1) + ' s', o.steps.toFixed(1), `${Math.round(o.inTok)} / ${Math.round(o.outTok)}`, money(o.perRun), o.perPass === Infinity ? '-' : money(o.perPass), o.errs]));

// by window size
const sizes = [...new Set(rows.map((r) => r.size))].sort();
out.push('## Accuracy by window size', '');
table(['Model', ...sizes], models.map((m) => [m, ...sizes.map((s) => { const r = rows.filter((x) => x.model === m && x.size === s); return r.length ? `${r.filter((x) => x.pass).length}/${r.length} (${pct(r.filter((x) => x.pass).length, r.length)})` : '-'; })]));

// by task group
const groups = [...new Set(rows.map((r) => r.group))].sort();
out.push('## Accuracy by task group', '');
table(['Model', ...groups], models.map((m) => [m, ...groups.map((g) => { const r = rows.filter((x) => x.model === m && x.group === g); return r.length ? `${r.filter((x) => x.pass).length}/${r.length}` : '-'; })]));

// per task grid
const combos = tasksOf(rows).sort();
out.push('## Every task (P = pass, F = fail, E = error)', '');
table(['Task/size', ...models], combos.map((c) => { const [t, s] = c.split('/'); return [c, ...models.map((m) => { const r = rows.filter((x) => x.model === m && x.task === t && x.size === s); if (!r.length) return '-'; return r.map((x) => (x.detail && x.detail.error ? 'E' : x.pass ? 'P' : 'F')).join(''); })]; }));

// click accuracy
const ca = rows.filter((r) => r.group.startsWith('A') && r.detail && r.detail.firstDist !== undefined && r.detail.firstDist !== null);
if (ca.length) {
  out.push('## Click accuracy (tasks A, first click)', '');
  table(['Model', 'First click on target', 'Median miss (px, on a 1:1 page)', 'Extra clicks per run'], models.map((m) => { const r = ca.filter((x) => x.model === m); if (!r.length) return [m, '-', '-', '-']; return [m, pct(r.filter((x) => x.detail.firstHit).length, r.length), median(r.map((x) => x.detail.firstDist)).toFixed(0), mean(r.map((x) => (x.detail.clicks || 1) - 1)).toFixed(1)]; }));
}

// failures with the reason
const fails = rows.filter((r) => !r.pass);
if (fails.length) {
  out.push('## Failures', '');
  table(['Model', 'Task', 'Size', 'Why'], fails.slice(0, 80).map((r) => [r.model, r.task, r.size, (r.detail && r.detail.error ? 'ERROR ' + r.detail.error : JSON.stringify(r.detail) + ' | ' + (r.answer || '').slice(0, 80)).replace(/\|/g, '/')]));
}
const text = out.join('\n');
fs.writeFileSync(path.join(dir, 'summary.md'), text);
console.log(text);
