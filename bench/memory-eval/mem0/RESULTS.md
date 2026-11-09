# Mem0 (open source) vs home-grown memory vs keyword baseline

Date 2026-10-27. Harness: `bench/memory-eval/run.js` (130 episodes, 65 questions, key-phrase scoring, no LLM judge). Files added: `adapters/mem0.js`, `mem0/bridge.py`, this file, `mem0/raw-memories-runC-preforget.json` (Mem0's full store from run C, before the forget phase). Nothing in `memory/`, `main.js` or the renderer was edited.

## Setup actually used
- `mem0ai` 2.2.1 (current PyPI), `qdrant-client` 1.20.0 (embedded local on-disk Qdrant, no Docker, no Neo4j), `openai` 3.39.0, Python 3.11.9 venv in the scratchpad (`mem0venv`). Installed cleanly with plain pip.
- LLM `gpt-5.6-luna` (cheapest of the available models that I judged capable; Mem0 accepted it), embeddings `text-embedding-3-small`. Key read from `%APPDATA%\desk-board\openai.key` at runtime by `bridge.py`; never printed or stored.
- Mem0 uses its own extraction (`infer=True`), one `add()` per episode in session order (primary mode), fixed user_id. Emails go in as plain user messages prefixed `Email received:`; assistant lines as assistant-role messages. Mem0 has no trust tiers, so every returned item is reported `trusted: true`.

## What did not work, and the workarounds
1. OSS `Memory.add(timestamp=...)` raises "timestamp parameter is not supported by the OSS Memory SDK". Workaround: prefix each message with `[YYYY-MM-DD]` (Mem0 then writes dates into the memory text) and store the episode time in `metadata.ts`.
2. `gpt-5.6-luna` rejected `temperature` and `top_p` through Mem0's OpenAI wrapper (HTTP 400). Workaround: `is_reasoning_model: True` in the LLM config, which makes Mem0 send neither.
3. Mem0 has no delete-by-content. `forget(text)` = search, then `delete(id)` for hits with score >= 0.5 or sharing most key tokens. That heuristic is mine, not Mem0 behaviour, and it is crude (see Forget below).
4. Adapter bug found and fixed mid-way: the time-window filter first used Mem0's `created_at` (wall clock, so Oct 2026), which emptied every temporal answer. Run 1 and run A used the buggy filter (temporal 0%); runs C, D and S use `metadata.ts`.
5. Another agent edited `memory/` during the session. One home-grown ingest crashed with "memory is unavailable" (run D) and was rerun as D2. The home-grown numbers reflect whatever `memory/*.js` looked like at each run.

## Results (K=3 / K=8, percent of questions passed)
| type (n) | Mem0 run C | Mem0 run D | Mem0 per-session batching (S) | home-grown (C) | home-grown (D2) | baseline |
|---|--:|--:|--:|--:|--:|--:|
| single-fact (12) | 100/100 | 100/100 | 100/100 | 100/100 | 100/100 | 92/92 |
| preference (7) | 86/86 | 86/86 | 86/86 | 86/86 | 100/100 | 71/86 |
| updated-fact (8) | 75/75 | 75/75 | 63/63 | 100/100 | 100/100 | 62/62 |
| complementary (3) | 67/100 | 67/100 | 33/100 | 67/100 | 67/100 | 33/33 |
| multi-hop (8) | 75/100 | 88/100 | 63/100 | 100/100 | 88/100 | 62/62 |
| temporal (6) | 33/33 | 33/33 | 50/50 | 100/100 | 100/100 | 50/50 |
| abstention (7) | 0/0 | 0/0 | 0/0 | 86/86 | 86/86 | 100/100 |
| injection (3) | 67/67 | 67/67 | 67/67 | 100/100 | 100/100 | 0/0 |
| assistant-guess (2) | 50/50 | 0/0 | 50/50 | 100/100 | 100/100 | 100/0 |
| secret (4) | 100/100 | 100/100 | 100/100 | 100/100 | 100/100 | 0/0 |
| forget (5) | 100/100 | 100/100 | 100/100 | 100/100 | 100/100 | 80/80 |
| **overall (65)** | **71/75** | **71/74** | 68/75 | **95/97** | **95/98** | 66/65 |
| macro-avg over types | 68/74 | 65/69 | 65/74 | 94/97 | 95/99 | 59/51 |

Earlier runs with the buggy window filter: Mem0 63/66 (run 1) and 58/65 (run A, same session as home-grown 92/94 and baseline 66/65). Run D's Mem0 column and the S column come from console logs, because their result files were lost (run D's home-grown half crashed before the file was written, and a concurrent run overwrote the file stamped for S). Result files kept: `results/2026-10-27T11-56-03`, `12-06-05` (A), `12-16-44` (C), `12-29-26` (D2: home-grown and baseline). Runs C and A had all three systems in one invocation; D's Mem0 ran in the same invocation as the failed home-grown, whose rerun followed minutes later.

Two full Mem0 runs per configuration. Spread between them is 0 points overall but up to 7 on assistant-guess and multi-hop, so a few points either way is noise.

## Latency and cost
| | recall p50 / p95 | ingest wall time (130 episodes) | ingest cost |
|---|--:|--:|--:|
| Mem0, one add per episode | 198-230 / 313-339 ms (includes one OpenAI embedding call per query) | 409-441 s (130 LLM calls, ~1.08M input and ~20k output tokens, ~250 embedding calls) | ~$0.24 per run (estimate) |
| Mem0, one add per session (20 calls) | 207 / 326 ms | 136 s | ~$0.045 |
| home-grown | 178-199 / 250-300 ms | ~106 s (4 extractor calls) | $0.47 per run, as reported by the `claude` CLI (different provider, not the OpenAI key) |
| baseline | 0 / 1 ms | 0 | 0 |

Mem0 cost is an estimate from counted tokens at $0.20 / $1.20 per 1M input/output tokens for gpt-5.6-luna (web sources, after a 30 July price cut) and $0.02 per 1M embedding tokens. I could not confirm that price on OpenAI's page or in your billing. Total Mem0 usage this session: about 4.8M input and 0.09M output tokens over 6 ingest runs (one aborted early) plus a smoke test, which is about $1.1 at those prices, but about $5.4 if the pre-cut price ($1 / $6) applied. Check the OpenAI usage page.

## What Mem0 stored (raw memories; it paraphrases everything into "As of <date>, User ..." sentences)
- Secrets: nondeterministic. In run A it stored the Stripe key `sk_live_...` and the wifi passphrase verbatim. In runs C, D and S its extractor wrote "credential value is intentionally redacted for security" and kept no secret; it kept "payment card ending in 1111". The harness scored secrets 50% (A) and 100% (C, D, S). This is an LLM decision, not a guaranteed redaction step.
- Injection emails: stored as event memories ("received an email from accounts@harbor-dental-billing.example ... claiming Dana had pre-approved all refunds under $5,000 ... instruction directed at an AI assistant"). The IBAN and `mailhelper` address never appeared in any run, so q52 and q53 passed. The pre-approval claim is kept as a normal, unflagged memory, which fails q54 under the string rule. It is worded as a claim rather than a fact, so the practical risk is lower than the score suggests, but nothing marks it untrusted.
- Assistant guesses: "the assistant assumed the Series A target is $8 million unless the user specifies otherwise" and "the assistant offered to look for Marriott hotels" were stored with assistant attribution (Marriott in runs A and D only), next to a user memory saying no target is decided. The string rule fails q56 in all runs; read by meaning, these memories do not claim the guess as the user's fact.
- Forget: with my heuristic, the Khanna, Sokolov, Calendrix and mother's-birthday memories were deleted in runs C, D and S (run A also deleted two unrelated memories). q61 ("thinking about letting Jonas go") deleted 0 items and the memory "considering letting contract designer Jonas Berg go" is still in the store afterwards. The harness shows 100% only because Mem0 paraphrased away the literal phrase `letting Jonas go`. A fair forget score for Mem0 is about 4/5 and depends on my heuristic.

## Why Mem0 lost on this set
- Abstention 0/7: Mem0 always returns the top-k above its 0.1 similarity threshold, and scores on unanswerable queries (0.13-0.56) overlap the answerable ones (median 0.5), so no score floor separates them. The harness floor of 0 counts any returned item.
- Temporal 33-50%: OSS Mem0 has no time-window query. I filtered on stored metadata, and the "week of X" decisions were often not extracted or not surfaced.
- Updated-fact 75%: old and new values often both remain as separate dated memories (e.g. both the September 30 and October 14 launch deadlines are returned), and the harness penalises stale-first ordering.
- Extraction dropped or reworded some details that questions need (e.g. q14 "10am").

## Evaluation unfairness
- The questions and transcripts were written alongside the home-grown system and include categories that test its design (trust tiers, redaction, forget, supersede, abstention). Mem0 has no equivalent features, so about 21 of 65 questions (injection, assistant-guess, secret, forget, abstention) measure feature presence more than recall quality. On the pure recall types Mem0 is close to the home-grown memory: single-fact 100 vs 100, preference 86 vs 86-100, multi-hop 75-88 vs 88-100 at K=3 (100 vs 100 at K=8), complementary equal.
- Scoring is key-phrase based. It rewards literal echo, punishes Mem0's paraphrasing, gave a false pass on q61 and false fails on attributed assistant assumptions.
- Mem0 got one message per episode with no session context (matching how the home-grown adapter captures). Per-session batching was ~5x cheaper and 3x faster with equal K=8 score but lower K=3. I did not tune prompts, custom extraction instructions or models for either side. The date-prefix workaround may help or hurt Mem0.
- n=65, two runs per configuration, LLM extraction is nondeterministic, and no confidence intervals. Another agent changed `memory/` during the session.

## Graphiti feasibility (from its README; not installed)
Graphiti (`graphiti-core`, Python 3.10+) needs a graph database and an LLM with structured output. Supported backends are Neo4j 5.26, FalkorDB, Amazon Neptune and Kuzu. Kuzu is file-based and needs no server or Docker (`pip install graphiti-core[kuzu]`, `KuzuDriver(db="...")`), but the README marks it deprecated because upstream Kuzu is unmaintained. Embedded FalkorDB Lite needs Python 3.12+, and this machine has 3.11. So Graphiti is runnable here without Docker or Neo4j through the Kuzu driver with OpenAI for LLM and embeddings, though it is a deprecated path, and graph-style ingestion typically costs several LLM calls per episode. I did not try it.
