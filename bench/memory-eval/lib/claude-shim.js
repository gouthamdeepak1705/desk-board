// Transparent wrapper around the real `claude` CLI. memory/index.js discards the JSON cost fields, so the harness
// puts a claude.cmd that runs this file first on PATH, forwards stdin/stdout/args unchanged, and logs
// total_cost_usd / usage / duration of every call as one JSON line in $MEMEVAL_COST_LOG.
const { spawn } = require('child_process');
const fs = require('fs');

const real = process.env.MEMEVAL_REAL_CLAUDE;
const logFile = process.env.MEMEVAL_COST_LOG;
const q = (a) => (/[\s"&|<>^]/.test(a) ? '"' + a.replace(/"/g, '\\"') + '"' : a);
const p = spawn([q(real), ...process.argv.slice(2).map(q)].join(' '), { shell: true, windowsHide: true, stdio: ['pipe', 'pipe', 'inherit'] });
process.stdin.pipe(p.stdin);
let out = '';
p.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
p.on('close', (code) => {
  try {
    const r = JSON.parse(out);
    const line = { ts: Date.now(), cost: r.total_cost_usd ?? r.cost_usd ?? null, duration_ms: r.duration_ms ?? null, usage: r.usage || null, is_error: !!r.is_error };
    if (logFile) fs.appendFileSync(logFile, JSON.stringify(line) + '\n');
  } catch {}
  process.exit(code == null ? 1 : code);
});
