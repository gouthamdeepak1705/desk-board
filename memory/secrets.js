// Secret scanner, shared by the store (before anything is written) and the client (before a question is logged or sent out).
// It errs on the side of redacting: a missed secret is worse than a mangled sentence.
const luhn = (d) => { let s = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; } return s % 10 === 0; };
const entropy = (s) => { const f = {}; for (const c of s) f[c] = (f[c] || 0) + 1; return -Object.values(f).reduce((a, n) => a + (n / s.length) * Math.log2(n / s.length), 0); };

// Cyrillic / Greek look-alikes folded to Latin so "pаssword" is still "password"
const CONFUSABLES = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ѕ': 's', 'ј': 'j', 'ο': 'o', 'α': 'a', 'ε': 'e' };
const fold = (t) => t.replace(/[аеорсухіѕјοαε]/g, (c) => CONFUSABLES[c]);
const WORD = '(?:password|passphrase|passcode|passwd|pass|pwd|pw|pin|otp|cvv|cvc|secret|api[ _-]?key|access[ _-]?key|token|credentials?|login|wi-?fi(?:[ _-]?(?:key|password|pass))?)';
const SECRET_RES = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, 'private key'],
  [/\b(?:sk|rk|pk)[-_](?:live|test|proj|ant)?[-_]?[A-Za-z0-9_-]{16,}\b/g, 'api key'], [/\bAKIA[0-9A-Z]{16}\b/g, 'aws key'], [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, 'github token'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, 'slack token'], [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, 'jwt'],
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s:@\/]+:[^\s@\/]+@/gi, 'url credentials'],
  [/\b(?:seed|recovery|backup|mnemonic)\s+(?:phrase|words?|seed)\b[^\n]*/gi, 'recovery phrase'],
  [/\b\d{3}-\d{2}-\d{4}\b/g, 'ssn'],
  // "my password for gmail is hunter2", "pw: x", "wifi key is x", "pin = 1234"
  [new RegExp('\\b' + WORD + '\\b(?:\\s+(?:for|to|on|of|at)\\s+[\\w.@/-]+(?:\\s+[\\w.@/-]+)?)?\\s*(?:is|are|was|will be|=|:)\\s*["\']?[^\\s.;,\\n]+(?:[ \\t]+(?!and\\b|but\\b|or\\b|then\\b|so\\b)[^\\s.;,\\n]+){0,5}', 'gi'), 'credential'],
  // "pin 4821", "cvv 913", "pw swordfish77", "key abc123": a keyword straight followed by a token with a digit in it
  [/\b(?:pin|cvv|cvc|otp|pw|pwd|pass|password|passcode|key)\s+["']?[^\s]*\d[^\s]*/gi, 'credential'],
  [/\buse\s+\S+(?=\s+as\s+(?:the|my|your)\s+(?:password|passcode|pin|passphrase))/gi, 'credential'],
  [/\bbearer\s+\S{8,}/gi, 'bearer token'], [/\bauthorization\s*:\s*\S+(?:\s+\S+)?/gi, 'authorization header'],
  [/\bwi-?fi\b[^.\n]{0,60}\bkey\b\W+\S+/gi, 'wifi key'],
  [/\b(?:ssn|social security(?: number)?|passport(?: number)?|account(?: number)?|routing(?: number)?|iban|sin)\b\W{0,4}[A-Z0-9][A-Z0-9 -]{5,}/gi, 'identifier'],
  [/\b\d{3} \d{2} \d{4}\b/g, 'ssn'],
  // "login is dana, pw is x" / "login dana pw x"
  [new RegExp('\\blogin\\b[^.\\n]{0,40}\\b(?:pw|pass(?:word)?)\\b\\W*\\S+', 'gi'), 'credential'],
  // "the door code is 4821", "verification code: 123456"
  [/\b(?:verification|security|access|door|gate|unlock|entry|confirmation|one[- ]time)?\s*code\s*(?:is|are|:|=)\s*\d{4,10}\b/gi, 'code'],
];
// separators allowed inside a card number: space, hyphen, en/em dash, no-break space
const CARD_GROUPS = /(?<![\d])\d{4}[ \-\u2010-\u2015\u00a0]\d{4}[ \-\u2010-\u2015\u00a0]\d{4}[ \-\u2010-\u2015\u00a0]\d{1,7}(?![\d])/g;
const CARD = /(?<![\d])(?:\d[ \-‐-― ]?){13,19}(?![\d])/g;

function redact(text) {
  // fold look-alike characters and drop zero-width ones so they cannot hide a secret
  let t = String(text ?? '').normalize('NFKC').replace(/[​-‏⁠﻿­]/g, ''), hits = 0;
  t = fold(t);
  t = t.replace(CARD_GROUPS, () => { hits++; return '[redacted card number]'; }); // grouped like a card: redacted even if the check digit is wrong
  for (const [re, label] of SECRET_RES) t = t.replace(re, () => { hits++; return `[redacted ${label}]`; });
  t = t.replace(CARD, (m) => { const d = m.replace(/\D/g, ''); if (d.length >= 13 && d.length <= 19 && luhn(d)) { hits++; return '[redacted card number]'; } return m; });
  t = t.replace(/\b[A-Za-z0-9+/_=-]{32,}\b/g, (m) => { if (entropy(m) > 4.2 && /\d/.test(m) && /[A-Za-z]/.test(m)) { hits++; return '[redacted secret]'; } return m; });
  return { text: t, hits };
}

module.exports = { redact };
