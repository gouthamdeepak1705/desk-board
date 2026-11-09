# Build a thin SQLite memory core, bake off the rest

**Recommendation: build a small memory core of your own on one SQLite file, and borrow the best ideas from the open-source systems instead of adopting any of them wholesale.** The core is an append-only ledger of raw episodes, a bi-temporal fact table (the Graphiti idea: facts are closed with an end date, never deleted), an entity-edge table for one-hop graph expansion, FTS5 plus sqlite-vec for hybrid search, and a nightly consolidation job run through Claude Code. Three published facts drive this. First, no independent party has confirmed that a commercial memory store beats a competent baseline ([beri.net](https://www.beri.net/article/zep-vs-mem0-vs-postgres-agent-memory-store-buy-last-2026)). Second, benchmark numbers drift badly on reproduction: Redis's Sep 2026 LongMemEval rerun found Mem0 at 49.0% against Mem0's own 94.4% claim for its managed platform ([Redis](https://redis.io/resources/agent-memory-benchmark-report/), [Mem0](https://github.com/mem0ai/mem0)). Third, a single user's memory is about 10^3 to 10^5 items, which brute-force search handles in tens of milliseconds. The shortlist to test against your own data is Graphiti (best temporal model, Python sidecar), Mem0 OSS (easiest Node integration), Cognee (local no-key mode, TypeScript SDK), and your home-grown baseline as the control. Store structured events and derived, source-linked facts; keep raw screen and email content short-lived; never store credentials. Log everything needed for later training from day one, but expect only small classifiers, not reinforcement-learned managers, to be realistic on your laptop. Treat all email- and web-derived memory as untrusted, because poisoning attacks on agent memory are demonstrated and reach 98.2% injection success in research ([MINJA](https://arxiv.org/html/2503.03704v5)). Almost nothing here was tested on Windows 11 or on your data; the bake-off in section 5 exists to close that gap.

## Short answers to your questions

**Adopt or build?** Build the core, adopt ideas. The Node-friendly systems (Mem0, Supermemory, Cognee, Letta, Mastra) each have caveats, and Graphiti, the best temporal design, is Python-only and needs Neo4j or FalkorDB, which on Windows means Docker or WSL ([Graphiti](https://github.com/getzep/graphiti)). Zep Community Edition is dead ([Zep](https://help.getzep.com/ce-deprecation-notice)), and Kuzu was archived in Oct 2025 ([Register](https://www.theregister.com/2025/10/14/kuzudb_abandoned/)). The advice from the one independent source is to build a baseline first and adopt a system only for a capability you can name, such as temporal fact invalidation ([beri.net](https://www.beri.net/article/zep-vs-mem0-vs-postgres-agent-memory-store-buy-last-2026)). Your data volume makes that baseline cheap. Letta's plain-files agent scored 74.0% on LoCoMo against 68.5% for Mem0's best graph variant, and a full-context baseline scored about 73% ([Letta](https://www.letta.com/blog/benchmarking-ai-agent-memory), [Zep](https://www.getzep.com/blog/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/)). Caveat: Letta itself calls its comparison apples-to-oranges.

**What to store.** Store these: personal facts and preferences (with source and confidence), product and codebase facts (decisions, architecture, open problems, not code copies), clients and people (name, role, commitments, last contact), email-derived commitments and follow-ups (summary plus a pointer to the message), daily activity as coarse events (app, repo, commit, calendar, task), and trading as executed trades, theses and P&L. Store these only as daily aggregates and kept local: health, mood, sleep, food, and spending as categorized transactions. Never store passwords, API keys, tokens, card or bank numbers, government IDs, private keys or 2FA codes, and do not keep bulk third-party sensitive details. This split is design judgment from the privacy notes; the sources support the principle (tag lineage at ingestion, keep sensitive domains minimal) but no source gives a per-category scheme ([tianpan.co](https://tianpan.co/blog/2026/04/20/gdpr-llm-memory-erasure-vector-database)).

**Store everything done on the computer?** No. Record structured events and extracted text, not pixels. Microsoft Recall was redesigned after backlash over plaintext screenshots of everything, and its sensitive-data filter still missed credentials unless obvious markers like "password" were on screen ([Windows Central](https://www.windowscentral.com/software-apps/windows-11/microsoft-addresses-windows-recall-backlash-promises-to-fix-security-issues-and-make-it-opt-in?mid=1), [Windows Report](https://windowsreport.com/?p=1465724)). Screenpipe-style capture costs roughly 5-20 GB per month (sources conflict) ([Screenpipe](https://screenpi.pe/about)). Use app and site allowlists, not content filters, and expire raw text in days to weeks.

**Log for custom models later, and are write-gate models realistic?** Log yes, now; it is cheap and cannot be recovered later. A small classifier (logistic regression or gradient-boosted trees on frozen embeddings plus hand features) predicting "worth storing" is realistic on CPU with a few thousand labels. Distilling an LLM gate into a 1.5-3B model via LoRA is plausible on a rented GPU for a few hours (MemLoRA does this, but its test set was only two conversations) ([MemLoRA](https://arxiv.org/html/2512.04763v1)). Reinforcement-learned managers are not realistic: Memory-R1 used 4 to 8 H100s ([Memory-R1](https://arxiv.org/html/2508.19828v5)), and no paper trains on one user's noisy real data.

**What to load per question.** Always load a small cached core profile (a few hundred to about 1k tokens). Add pre-fetched open threads and recent episodes at session start. Fetch the rest on demand with hybrid search, injecting about 1-2k tokens, which matches the 1.6-3.6k tokens that tested systems used ([Zep paper](https://arxiv.org/html/2501.13956), [Mem0 paper](https://arxiv.org/html/2504.19413)).

**Graph hopping.** One hop from the entities in the top hits, plus recency seeds, in SQL. Skip PageRank, community summaries and LightRAG in the live path unless your own eval shows multi-hop gaps.

**Privacy, security, poisoning.** Provenance on every fact, trust tiers (user-confirmed versus quarantined), memory rendered as data not instructions, no memory writes in turns that processed untrusted content without confirmation, and no unconfirmed outbound email.

**Proactive behaviour.** Start with scheduled digests, then pause-point coding help, then email drafts (never auto-send). Add an explicit "should I speak now" gate. No auto-trading.

## What is proven, experimental or unverified

The evidence base is lopsided, so the report separates three tiers.

**Reasonably established:** The extract-then-reconcile pattern (LLM turns messages into atomic facts and compares them against existing ones) is the dominant design ([Mem0 paper](https://arxiv.org/abs/2504.19413)). Non-destructive updates have converged from two directions: Graphiti's bi-temporal validity windows ([Zep paper](https://arxiv.org/html/2501.13956)) and Mem0's April 2026 move to ADD-only extraction because overwriting discarded history ([Mem0 blog](https://mem0.ai/blog/mem0-the-token-efficient-memory-algorithm)). Indexing facts alongside raw text is the best-supported cheap retrieval gain: fact-augmented keys raised LongMemEval recall about 9.4% and QA 5.4% ([LongMemEval](https://arxiv.org/html/2410.10813)). Dense retrieval beats BM25 by about 10 F1 on a multi-hop set with a strong embedder ([HippoRAG 2](https://arxiv.org/html/2502.14802v2)). Memory poisoning is demonstrated, not theoretical: MINJA reports 98.2% injection success, AgentPoison over 80% at under 0.1% poison rate, and researchers planted persistent instructions in ChatGPT memory ([AgentPoison](https://arxiv.org/html/2407.12784v1), [TechSpot](https://www.techspot.com/news/104881-chatgpt-vulnerability-allows-hackers-record-sessions-indefinitely.html)).

**Experimental:** Learned memory managers (Memory-R1, Mem-alpha, AgeMem) show gains only on benchmarks with clean answers ([Mem-alpha](https://arxiv.org/html/2509.25911v1), [AgeMem](https://arxiv.org/html/2601.01885v1)), and their baseline was the older Mem0 design, so the gain over the newer ADD-only design is unknown. Decay formulas (Weibull, Ebbinghaus) are hand-set and unvalidated ([SSGM](https://arxiv.org/html/2603.11768v1)). Graph retrieval is mixed: HippoRAG 2 beats the best dense baseline by only 2.8 F1 on average, with the gain concentrated in 2Wiki (61.5 to 71.0) and near zero on HotpotQA; Mem0's graph variant gained 1.6 J overall on LoCoMo but lost on single-hop and multi-hop ([HippoRAG 2](https://arxiv.org/html/2502.14802v2), [Mem0 paper](https://arxiv.org/html/2504.19413)). Proactive timing is hard: the best zero-shot LLM reached 64.4% on timing and 37.1% on intention in ProAgentBench ([ProAgentBench](https://arxiv.org/html/2602.04482v1)).

**Unverified or contested:** Every headline benchmark above 90% (Mem0, Mastra, Agent Zero) is vendor-reported. The Zep-versus-Mem0 LoCoMo dispute has Zep at 65.99% or 75.14% depending on who ran it, and Mem0's co-founder reportedly disputed Zep's correction (not read directly) ([Zep](https://www.getzep.com/blog/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/)). LoCoMo itself has audit problems: 99 score-corrupting errors in 1,540 questions, reported secondhand ([beri.net](https://www.beri.net/article/zep-vs-mem0-vs-postgres-agent-memory-store-buy-last-2026)). The claim that 97.8% of 10,134 Mem0 entries were junk comes from a user audit seen only through secondary write-ups ([mem0-vigil](https://github.kxpsado.workers.dev/jamebobob/mem0-vigil)). No source gives CPU latency for any embedding model on a laptop like yours, no one has tested the shortlist on Windows 11, and the quality of small local models for fact extraction is unresearched. That last item is the largest unknown for both cost and privacy. Several 2026 arXiv items (for example the cognitively grounded value model and the write-gate papers) were seen only as search excerpts and are not relied on here.

## The shortlist and what to borrow

Table of candidates, with the honest status of each:

| System | Fit for Desk Board | Main caveat |
|---|---|---|
| Graphiti (Apache-2.0, ~32k stars) | Best temporal model; runs locally with FalkorDB or Neo4j and OpenAI-compatible local LLMs; ships an MCP server ([Graphiti](https://github.com/getzep/graphiti)) | Python-only, Docker or WSL on Windows, an LLM call per episode (cost unmeasured), reference MCP has no auth; Zep's own LongMemEval score is 71.2% (vendor) |
| Mem0 OSS (Apache-2.0, ~68k stars) | Node/TS SDK, simplest integration ([Mem0](https://github.com/mem0ai/mem0)) | Headline numbers are managed-platform; defaults to OpenAI; reports of memory junk and scope errors are thin evidence |
| Cognee (Apache-2.0, v1.6.1 Sep 2026) | TypeScript SDK, MCP server, Claude Code plugin, claimed no-key local mode ([Cognee](https://github.com/topoteretes/cognee)) | Windows behaviour and graph-store default unverified |
| Supermemory (MIT) | `npx supermemory local` on port 6767, Ollama allowed ([Supermemory](https://github.com/supermemoryai/supermemory)) | Needs an API key even on localhost; not fully offline; self-claimed rankings |
| Mastra Observational Memory | Text-only observer and reflector, no database, cache-friendly; 84.2% reproduced by Redis ([Redis](https://redis.io/resources/agent-memory-benchmark-report/)) | 4.12 s query latency and $0.365 per session in that test: a background or pre-session design, not inline voice |
| Letta | Sleep-time consolidation and file-based memory ideas ([Letta](https://github.com/letta-ai/letta)) | Development moved to the letta-code harness; storage details not read |

Skip LangMem (tied to LangGraph), Zep Community Edition (dead), LightRAG and Microsoft GraphRAG (document corpora, 10+ s per query in the HippoRAG 2 setup) ([HippoRAG 2](https://arxiv.org/html/2502.14802v2)). Borrow from Generative Agents (recency, importance and relevance scoring), A-MEM (note linking), MemoryOS (tiering) and HippoRAG (only if document recall matters). Treat these as ideas to copy, since each is small or research-grade.

On storage, SQLite is the lowest-risk core. Use better-sqlite3 (or its multiple-ciphers fork for encryption, with the key held through Electron `safeStorage`; DPAPI behaviour was not verified) rather than `node:sqlite`, which is only a release candidate and has no built-in encryption ([Node.js](https://nodejs.org/api/sqlite.html), [codenote](https://codenote.net/en/posts/electron-encrypted-sqlite-libraries-prototyping-macos-windows/)). sqlite-vec is pre-v1 and was dormant before March 2026, with v0.1.9 the stable release; its ANN indexes are alpha, so use brute force and keep embeddings in a plain BLOB column so it is replaceable ([sqlite-vec](https://github.com/asg017/sqlite-vec/releases)). Skip embedded graph databases: FalkorDBLite does not support native Windows, Cozo looks abandoned, and Kuzu's fork LadybugDB is young ([FalkorDB](https://docs.falkordb.com/operations/falkordblite/falkordblite-ts), [DBDB.io](https://dbdb.io/db/cozodb)). For embeddings, test bge-small-en-v1.5 (384 dimensions) and EmbeddingGemma-300M (768 dimensions, truncatable to 256 by Matryoshka, ONNX builds for transformers.js) locally; OpenAI text-embedding-3-small at $0.02 per million tokens is an opt-in fallback that sends memory off-device ([Hugging Face](https://huggingface.co/blog/embeddinggemma), [costbench](https://www.costbench.com/software/embedding-apis/openai-embeddings/)). Store the model name and dimension per row, because a model change forces re-embedding everything.

## Write-gating, training logs and security

**Why a gate matters.** Over-storing is the best-documented failure. The same audit that found junk also found 808 hallucinated "User prefers Vim" entries that were recalled and re-extracted as new facts, and the junk rate stayed at 89.6% even with a frontier extractor ([mem0-vigil](https://github.kxpsado.workers.dev/jamebobob/mem0-vigil)); treat the numbers as anecdotal, but the loop mechanism is credible. Wrong operations are the second failure: a vanilla manager treated "I adopted a second dog" as a contradiction and deleted the first ([Memory-R1](https://arxiv.org/html/2508.19828v5)). The design below responds with provenance tagging, a rule that retrieved memories are never re-extracted, and supersede-only updates. No controlled ablation compares rule filters, importance scoring and LLM gating, so the gate order is a judgment to be tested.

**Training logs.** No published logging spec exists; the schema in section 4 follows from what the training approaches need (outcome rewards, operation labels, teacher outputs, an append-only ledger). Implicit labels (user said "remember this", corrected a memory, ignored a suggestion) are noisy; keep a monthly hand-labelled audit of about 50 stored and 50 rejected candidates as a clean eval set. Fine-tuning on personal logs raises a deletion problem: removing influence from trained weights is unsolved ([tianpan.co](https://tianpan.co/blog/2026/07/05/the-user-you-cannot-delete-right-to-be-forgotten-in-ai)), so version training sets and keep raw logs separable. Effort-to-value order: log everything, strong-LLM gate plus rules, small distilled classifier, fine-tuned extractor, RL last or never.

**Security.** The relevant incidents: ChatGPT memory carried injected instructions that exfiltrated data across sessions; Gemini memory was written by delayed tool invocation after summarizing an untrusted document; EchoLeak (CVE-2025-32711, CVSS 9.3) pulled private data out of M365 Copilot with a single crafted email and no user interaction ([TechSpot](https://www.techspot.com/news/104881-chatgpt-vulnerability-allows-hackers-record-sessions-indefinitely.html), [Embrace The Red](https://embracethered.com/blog/posts/2025/gemini-memory-persistence-prompt-injection), [The Hacker News](https://thehackernews.com/2025/06/zero-click-ai-vulnerability-exposes.html)). Desk Board ingests email and research content, so it holds all three legs of Willison's lethal trifecta: private data, untrusted content, and an outbound channel ([Willison](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/)). The fix is structural: remove a leg (no auto-sent email, no auto-rendered links, allowlisted egress). The effectiveness of quarantine and provenance defenses against MINJA-class attacks has not been measured, so they reduce risk without eliminating it. Treat embeddings as personal data, since one practitioner blog reports about 40% of sensitive content recoverable from sentence-length embeddings (original research unverified) ([tianpan.co](https://tianpan.co/blog/2026/04/20/gdpr-llm-memory-erasure-vector-database)). Anthropic's API deletes inputs within 30 days by default; zero-data-retention is an agreement whose availability to individuals was not confirmed ([Anthropic](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-data)). True deletion needs lineage: HNSW-style indexes often only tombstone, so cascade deletes by source ID, VACUUM, and rotate backups.

## Concrete architecture, schema and algorithms

### 4.1 Architecture

Desk Board (Electron main process) owns one encrypted SQLite file. A worker or utility process runs the local embedder. The OpenAI Realtime session gets a cached core profile in its instructions and a `recall(query, time_range?)` tool; Claude Code, running as the background "sleep-time" agent, extracts facts and consolidates, following Letta's pattern of background editing by a stronger model ([Letta tutorial](https://learn.traeai.com/t/ai-engineering/phases/14-agent-engineering/08-memory-blocks-sleep-time-compute.html)). Keep the live path free of LLM calls. Realtime tool use works through `session.update` and function-call outputs, and the model can speak a preamble while a tool runs; a guide cites about 800 ms as the natural response target (third-party, unverified) ([DEV](https://dev.to/techsignaldaily/building-low-latency-voice-agents-with-openais-gpt-realtime-21-and-gpt-realtime-21-mini-3mnj)).

### 4.2 Data schema (SQLite)

```sql
-- Layer 0: append-only ledger. Never mutated. Raw expires by TTL, metadata stays.
episode(id, ts, source_type,          -- user_voice|user_typed|assistant|git|calendar|email|web|screen_text|trade|health
        source_ref, domain,           -- startup|client:<id>|finance|health|personal|research
        trust,                        -- trusted|untrusted
        sensitivity,                  -- 0 normal | 1 private | 2 sensitive(local-only)
        raw_text, raw_expires_at, content_hash)

-- Layer 1: bi-temporal facts (Graphiti-style). Close, never delete.
fact(id, subject_entity, predicate, object_text, object_entity,
     valid_from, valid_to,            -- event time
     recorded_at, expired_at,         -- system time
     superseded_by, kind,             -- profile|preference|project|decision|commitment|routine|event
     provenance,                      -- user_said|user_confirmed|observed|inferred|assistant_said|external
     confidence, mention_count, last_confirmed, last_used,
     status,                          -- active|quarantined|archived|forgotten
     sensitivity, domain, pinned, embed_model, embedding BLOB, key_text)

fact_source(fact_id, episode_id, quote_span)   -- mandatory: no source, no fact
entity(id, type, name, aliases, summary, embedding BLOB)   -- person|org|repo|project|ticker|topic
edge(src, dst, rel, valid_from, valid_to, weight, fact_id)
task(id, text, due, status, entity_id, fact_id)            -- follow-ups and commitments

-- Training and audit ledger (log from day one)
candidate_log(id, episode_id, span, candidate_fact, extractor, prompt_hash,
              gate_scores_json, decision, reason, compared_to_ids)
memory_op(id, ts, op, fact_id, before, after, actor)       -- ADD|SUPERSEDE|ARCHIVE|CONFIRM|FORGET
retrieval_log(id, ts, query, candidates_json, injected_ids, used_in_reply, user_correction)
feedback(id, ts, kind, fact_id, response_id)               -- explicit and implicit
suggestion_log(id, ts, category, trigger, fact_ids, propensity, shown, outcome, latency)
```

`key_text` is the fact text concatenated with the original quote, because fact-augmented keys were the best-supported recall gain ([LongMemEval](https://arxiv.org/html/2410.10813)). Provenance, scope and sensitivity borrow the per-item axes (authority, scope, provenance, recoverability, actionability) proposed in an always-on-agents survey ([arXiv 2606.30306](https://arxiv.org/abs/2606.30306)); the schema itself is my synthesis, not a tested design. Separate `domain` values mirror Claude's project-scoped memory, which prevents client leakage ([Anthropic](https://www.anthropic.com/news/memory)).

### 4.3 Write-gate algorithm

Run asynchronously after each session, and on a schedule for email and git events. Never in the voice turn.

1. **Capture.** Append every input to `episode` with source_type, trust and sensitivity. Run a secret scanner (regex plus entropy) and app and site allow and deny lists before persisting; redact matches.
2. **Hard pre-filters (rules, zero cost).** Drop chit-chat, pure questions, tool output, and any span that is a retrieved memory echoed back (this blocks the self-reinforcing Vim loop). Drop assistant-originated claims unless the user confirmed them.
3. **Extract.** Claude Code (or a strong model) extracts atomic candidate facts, each with a verbatim quote span, kind and entities. Log every candidate to `candidate_log`, including rejected ones, as future negatives.
4. **Verify grounding.** The quote must exist in the episode, and an entailment or quote-match check must pass; otherwise reject. Assign provenance (user_said, observed, inferred, external).
5. **Score.** Compute importance (LLM rating 1-10 from the Generative Agents idea, or a small classifier once trained), novelty (embedding distance to the nearest active fact, an inference rather than a proven gate), and an explicit-intent flag ("remember this" bypasses scoring).
6. **Reconcile.** Search existing facts on the same entity and predicate. If the same attribute has an incompatible value, supersede: set the old fact's `valid_to` and `expired_at`, link `superseded_by`. If the fact is complementary (a second dog), ADD. If near-duplicate, increment `mention_count` and add a `fact_source` row. This follows Memory-R1's finding that vanilla managers mishandle complementary facts ([Memory-R1](https://arxiv.org/html/2508.19828v5)).
7. **Trust routing.** Candidates from untrusted sources (email, web, third parties) go to `status=quarantined`, never become preferences or instructions, and appear in a review digest until the user confirms. The memory-write tool is blocked in any turn that processed untrusted content without confirmation.
8. **Sensitivity routing.** Sensitivity 2 facts (health, finance details) are summarized by a local model or stored as aggregates, and excluded from cloud calls by default. Log every outbound payload.
9. **Commit.** Write the fact, embedding and edges in one transaction and log `memory_op`.
10. **Nightly consolidation.** Merge near-duplicates into a canonical fact pointing to its sources, demote unconfirmed facts not retrieved in a long window to `archived` (a rank demotion, never deletion), regenerate summaries from raw episodes and not from prior summaries to avoid drift, and expire `raw_text` past its TTL (screen text 7-30 days, email bodies 30-90 days; these TTLs are suggestions, not sourced).

Thresholds start conservative (store only user_said, user_confirmed, or importance at or above a cutoff) and are tuned using the audit sample.

### 4.4 Retrieval algorithm

**Preload (session start).** Core profile (pinned active profile and preference facts, about 500-1,000 tokens, placed first so prompt caching holds), open tasks and commitments due soon, last session's open threads. Put volatile snippets after the stable prefix. Realtime cache rules were not verified in primary docs.

**Per question** (target 50-150 ms; an estimate from component numbers, to be measured):

1. **Parse time.** Resolve "last week" and "yesterday" deterministically with a date parser against today's date into a `[t0,t1]` window. LongMemEval found small LLMs hallucinate or miss temporal cues here, while GPT-4o parsing helped 7-11% recall ([LongMemEval](https://arxiv.org/html/2410.10813)).
2. **Route.** A tiny rule set decides if the question needs memory at all (small talk skips retrieval) and which `domain` scopes apply; sensitivity 2 facts are only eligible if the question is clearly about that domain.
3. **Embed.** Embed the query locally (about 10-50 ms for a small model; one data point, estimated).
4. **Search.** FTS5 top 30 plus sqlite-vec top 30 on `active` facts (and episodes for recall of exact wording), filtered by window, domain and sensitivity. Fuse with reciprocal rank fusion, the default in Graphiti ([Graphiti docs](https://help.getzep.com/graphiti/working-with-data/searching)). On one reported setup, hybrid p50 was 23.5 ms at 100k vectors (Apple silicon, synthetic data) ([Recall PR](https://github.com/edheltzel/Recall/pull/225)); your CPU needs its own number.
5. **Rescore.** Multiply by a mild recency decay, a pinned boost, a confidence factor, and an importance factor (Generative Agents style; no benchmark supports particular weights, so tune them in the bake-off).
6. **Hop.** Take entities in the top 5 hits plus the 2 most recently active entities; fetch their active neighbouring facts through `edge` in one SQL join, one hop, capped at 10 facts, with each ranked by the parent's score times edge weight. Add a second hop only for questions flagged relational ("who at client X is waiting on me") and only if the bake-off shows it helps.
7. **Budget and format.** Keep the top results to about 1-2k tokens, grouped by entity, each with a date and a source tag, rendered inside delimiters labelled as untrusted data. Quarantined facts appear only as "unconfirmed". If nothing clears a score floor, return "nothing recorded" so the model does not invent.
8. **Voice timing.** Prefetch from partial transcripts and discard if the topic shifts, following the speculative-retrieval idea of VoiceAgentRAG and Streaming RAG (both authors' own results; hit rates for personal memory are unmeasured) ([arXiv 2603.02206](https://arxiv.org/html/2603.02206v2)). If the tool path is used, have the model say a short preamble while it runs.
9. **Log.** Write `retrieval_log` with candidates, injected ids and later whether the reply used them.

Add a cross-encoder reranker only if the bake-off shows a gap; published CPU numbers vary from 45 ms to 8.6 s across blogs, so it cannot be assumed to fit the live path ([DEV](https://dev.to/gabrielanhaia/rerankers-and-the-latency-budget-when-cross-encoders-are-worth-it-3efc)).

### 4.5 Proactive layer

Rank features by evidence and reversibility. First, a morning and evening digest on a schedule you set (calendar, open PRs and tasks, emails needing a reply, watched AI-news topics), the pattern shipped by ChatGPT Pulse and Google's CC, though neither has published outcome data ([Tom's Guide](https://www.tomsguide.com/ai/google-just-launched-a-new-ai-agent-that-runs-your-inbox-heres-what-cc-actually-does)). Second, pause-point coding help ("where you left off") after a failed test, at commit, or on returning to a repo; proactive coding agents raise efficiency but disrupt workflow unless they show presence and context ([Codellaborator](https://arxiv.org/abs/2502.18658)). Third, email triage and drafts for review, never auto-send. Fourth, a ranked reading list steered by topic feedback. Fifth, user-defined rule-based trading alerts with thesis notes from memory, suggest-only and with quiet hours; no study supports LLM-proactive trading. Each item must clear a gate: confidence above a per-category threshold, benefit minus interruption cost above zero, outside focus blocks and quiet hours, and not recently dismissed. Show the "why" (the memory that triggered it); this is untested for its effect on perceived creepiness. Use a Thompson-sampling bandit over show, delay and stay silent per category, the standard method in mobile-health trials ([arXiv 2511.08719](https://arxiv.org/html/2511.08719v1)), with a randomised fraction of decisions so propensities are logged and offline evaluation is possible. Keep an autonomy ladder per category (suggest, ask, act with undo), and never promote sending, trading or deleting. Keep health, finance and relationship facts out of unsolicited messages unless you opt in per category. A 450-person study found intermediate autonomy kept trust higher than none or full autonomy, though it studied agents acting for users, not proactive initiation ([arXiv 2510.04465](https://arxiv.org/abs/2510.04465)).

## Phased build plan and bake-off on your own data

### 5.1 Phases

**Phase 0 (about 1 week): ledger and controls.** Encrypted SQLite, the `episode` table, secret scanning, app allowlists, a pause switch and a visible "what is stored" view. Start logging everything the training schema lists. Success: nothing sensitive in the ledger on a one-week audit.

**Phase 1 (2 weeks): baseline memory.** `fact`, FTS5, sqlite-vec, local embeddings, the write gate steps 1-9 run through Claude Code, a core profile block, and a `recall` tool for the Realtime session. Include "remember this", "forget that" and "why did you say that" commands with source display.

**Phase 2 (2 weeks): evaluation harness and bake-off** (below). Decide whether to keep the baseline or adopt a candidate for the extraction, graph or temporal layer.

**Phase 3 (2-3 weeks): temporal graph and consolidation.** Supersede logic, entity and edge tables, one-hop expansion, nightly consolidation, a weekly review digest of quarantined and changed memories, and deletion cascade by source ID.

**Phase 4 (ongoing): proactivity.** Digest first, then coding pause points, email drafts, reading list. Log propensities from the first suggestion.

**Phase 5 (after 2-3 months of data): learned components.** Train the "worth storing" classifier on candidate_log and feedback labels, and compare it with the LLM gate on the audit set. Consider a distilled small extractor only if LLM cost or privacy forces it. Do not attempt RL.

Timelines are my estimates, not sourced.

### 5.2 Bake-off design

Published benchmarks disagree (LoCoMo errors, vendor-tuned numbers, a 28-point reproduction gap), so judge candidates on your own transcripts, using the public benchmarks only to sanity-check the harness ([Redis](https://redis.io/resources/agent-memory-benchmark-report/)).

**Contestants:** (A) the home-grown baseline; (B) Graphiti with FalkorDB or Neo4j; (C) Mem0 OSS; (D) Cognee, or Supermemory local if Cognee fails the Windows install test. Optionally add a full-context control (recent months of transcripts in one prompt) and a Mastra-style observer log. Do a one-hour install test on Windows 11 first; drop any candidate that cannot run locally.

**Test set:** Build 100-150 questions from your own history, with answers verified by you. Cover single-fact recall, preference lookup, knowledge updates ("what is my current X", where the answer changed), temporal ("what did I decide last week"), multi-hop ("which client asked about the feature I shipped last Tuesday"), cross-domain scoping (should not leak client A into client B), abstention (nothing recorded), and adversarial or poisoned items (an email containing an instruction to remember something false). Hold out the most recent month for time-forward testing and keep a fixed subset hidden until the end.

**Same inputs, same answer model, same judge:** Feed each system the identical episodes. Use a fixed answerer, and score with exact checks where possible and one LLM judge otherwise, spot-checked by hand, since judges accepted 62.81% of deliberately wrong answers in one LoCoMo audit (secondhand) ([beri.net](https://www.beri.net/article/zep-vs-mem0-vs-postgres-agent-memory-store-buy-last-2026)).

**Metrics:**

| Dimension | Measure | Pass bar (my suggestion) |
|---|---|---|
| Accuracy | Correct answers by question type | Within 3 points of best; above full-context control |
| Latency | p50 and p95 retrieval on your laptop, cold and warm | p95 under 300 ms for the inline path; slower systems must work as background |
| Memory quality | Precision of stored facts on 100 sampled entries (HaluMem-style: fabrication, error, conflict, omission) | At least 90% correct, 0 fabricated facts on sensitive domains |
| Update handling | Old value superseded and still retrievable as history | All knowledge-update items correct |
| Cost | LLM tokens and dollars per ingested day | Fits your budget; measure, since no source prices local Graphiti |
| Ops | Install friction, RAM at idle and under ingest on 13.8 GB, crash count, Windows quirks | Idle under about 1 GB extra; no Docker unless it earns its keep |
| Security | Poisoned-item rate stored as trusted; deletion cascade completeness | 0 poisoned items trusted; deletion verified by search |
| Local-only | Does it work with no cloud call, and what does quality drop to with a small local extractor | Report the gap |

Run each configuration three times to separate noise from effect, and report confidence intervals; with 100-150 questions, differences under about 5 points are probably noise (a rough rule, not a power calculation). Decision rule: adopt a candidate only if it beats the baseline on a named capability (for example Graphiti on knowledge updates and temporal questions) by more than the noise band without breaking the latency, RAM or security bars. Otherwise keep the baseline and copy the idea. Repeat the bake-off after 3 months, because the question mix changes as the corpus grows.

## Conclusion

The research changes the question from "which memory system" to "which capability is worth a dependency". The most defensible assets are not a vendor's retrieval score but the ledger, the provenance fields and the evaluation set you build yourself: they survive any later swap of Graphiti, Mem0 or an in-house gate, and they are the only way to resolve a literature where the same system scores 49% or 94%. The risky parts are also the ones with the least evidence: small-model extraction quality on your laptop, Windows installs of the sidecar candidates, and whether proactive suggestions earn acceptance rather than annoyance.

The security finding matters more for Desk Board than for most memory users. An assistant that reads your email, browses research and could send messages carries all three legs of the lethal trifecta, so the safest early investment is not a smarter retriever but a trust boundary: untrusted content can propose memories, only you can ratify them, and nothing in memory can trigger an outbound action by itself. Build that boundary in Phase 0 and 1, when it is cheap, because retrofitting provenance onto a populated store is not.
