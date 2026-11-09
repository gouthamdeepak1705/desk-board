// node run_all.js  -> runs every suite in a fresh process; results-*.json written next to this file
const { spawnSync } = require('child_process');
for (const f of ['t1_secrets', 't2_injection', 't3_forget', 't4_robust', 't5_lifecycle']) spawnSync(process.execPath, [__dirname + '/' + f + '.js'], { stdio: 'inherit' });
