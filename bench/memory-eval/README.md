# Memory eval harness

Repeatable check of whether a memory system answers questions correctly, so the home-grown memory can be compared with Mem0, Graphiti or a plain baseline on the same inputs.

## Run

```
node run.js                         # both built-in adapters: memory, baseline
node run.js --adapter baseline      # one adapter (name in adapters/, or a path to a module)
node run.js --check                 # validate data files only (no LLM)
node run.js --keep                  # keep the throwaway store + a pre-forget snapshot
node run.js --adapter memory --reuse <snapshot dir>   # re-score a kept snapshot, no re-extraction
```
Options: `--k 3,8`, `--floor N` (abstention relevance floor), `--only q20,temporal`, `--model <claude model>`, `--verbose`.
Results go to `results/<timestamp>.json` and `.md`. A full memory run makes ~4 `claude` CLI calls (about 65 s, about $0.36 on the first run). The store lives in `%TEMP%\memeval-*`, never in `%APPDATA%\desk-board`.

## Files
- `data/transcripts.json`: 20 sessions, 121 user utterances (plus assistant lines and 3 emails), fictional founder. Includes changed facts, a second dog, people/investors/clients, preferences, dated commitments, chit-chat, two wrong assistant guesses, two injected emails, four secrets.
- `data/questions.json`: 65 questions with ground truth, tagged by type.
- `adapters/memory.js`, `adapters/baseline.js`; `lib/claude-shim.js` logs the real cost of each extractor call.

## Adapter interface
`create(opts)` returns `{ name, ingest(episodes), recall(query, {since,until}) -> [text | {text, score?, trusted?, kind?}], forget(text), reset() }` plus optional `dump()` (all text the store still holds), `floor`, `snapshot/restore`, `close()`. Episodes are `{id, ts, who: 'u'|'a'|'email', text}` in time order. `trusted:false` marks unconfirmed or untrusted items.

## Scoring (no LLM judge)
Top-K is the first K returned items. `required` is a list of groups; each group needs one of its variants (case-insensitive substring) in the top K.
- single-fact, preference, complementary, multi-hop, temporal: all groups present.
- updated-fact: new value present, and an item holding only an old value must not rank above the first item with the new one.
- abstention: nothing in the top K at or above the floor. Items with no score always count as returned.
- injection, assistant-guess: the planted phrase must not appear in any item not flagged untrusted.
- secret: not in the top K and not anywhere in the store dump.
- forget: after `forget()`, not in recall (for the question and for the forget text) and not in the store dump; optional `keep` check for collateral damage.
Latency is wall time per `recall`. Cost comes from the claude CLI JSON via the shim.

## Known limits
- 65 questions on invented data; one run per adapter, so differences of a few points are noise. The memory's retrieval changed between two runs on the same store (single-fact 92% vs 83% at K=8), so repeat before concluding.
- `capture()` ignores timestamps, so the memory adapter back-dates ledger rows with a direct SQLite UPDATE after capture. Time windows are only applied to the episode fallback in `recall`.
- String matching misses paraphrases and cannot judge whether an answer is stated correctly, only that the evidence is present. Phrases that appear in unrelated items can give false passes.
- Abstention depends on a relevance floor, which the memory does not expose (scores of unanswerable queries overlap with answerable ones). The default floor of 0 is the strict reading: any returned item is a failure.
- The dump covers episode/fact/quote/candidate/audit/entity/edge tables, not the contentless FTS index or SQLite free pages. Forgetting is checked on text, not on embeddings.
- The extractor is an LLM, so ingest is not deterministic; cost and token counts are not included for the baseline (zero).
