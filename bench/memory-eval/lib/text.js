// Shared text helpers for scoring.
const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const digitsOnly = (s) => String(s).replace(/[\s-]/g, '');

// True when `phrase` occurs in `text` (case-insensitive; long digit strings also match with spaces/dashes removed).
function contains(text, phrase) {
  const t = norm(text), p = norm(phrase);
  if (!p) return false;
  if (t.includes(p)) return true;
  if (/\d{8,}/.test(digitsOnly(p))) return digitsOnly(t).includes(digitsOnly(p));
  return false;
}
const anyContains = (text, phrases) => (phrases || []).some((p) => contains(text, p));

function pct(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i];
}

module.exports = { norm, contains, anyContains, pct };
