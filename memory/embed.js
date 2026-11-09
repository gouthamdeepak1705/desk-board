// Embeddings for semantic recall. Runs in the main process (the OpenAI key lives there, the SQLite worker never sees it).
// Only fact text is ever sent, never raw episodes. The key is read from disk on demand and is never logged.
const fs = require('fs');
const path = require('path');

const MODEL = 'text-embedding-3-small';
const DIM = 256;
const keyFile = () => path.join(process.env.APPDATA || '', 'desk-board', 'openai.key');

let key = null;
function getKey() {
  if (key) return key;
  try { key = fs.readFileSync(keyFile(), 'utf8').trim(); } catch { key = null; }
  return key;
}

const unit = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i]; s = Math.sqrt(s) || 1; for (let i = 0; i < a.length; i++) a[i] /= s; return a; };

// texts[] -> Float32Array[] (unit length). Throws on any failure; the message never contains the key.
async function embed(texts, { timeoutMs = 15000 } = {}) {
  const k = getKey();
  if (!k) throw new Error('no embedding key');
  const input = texts.map((t) => String(t || '').slice(0, 2000));
  if (!input.length) return [];
  let res;
  try {
    res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + k },
      body: JSON.stringify({ model: MODEL, input, dimensions: DIM }), signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) { throw new Error(e && e.name === 'TimeoutError' ? 'embedding timed out' : 'embedding request failed'); }
  if (!res.ok) { if (res.status === 401) key = null; throw new Error('embedding http ' + res.status); }
  const j = await res.json();
  const data = (j.data || []).slice().sort((a, b) => a.index - b.index);
  if (data.length !== input.length) throw new Error('embedding count mismatch');
  return data.map((d) => unit(Float32Array.from(d.embedding)));
}

module.exports = { embed, MODEL, DIM };
