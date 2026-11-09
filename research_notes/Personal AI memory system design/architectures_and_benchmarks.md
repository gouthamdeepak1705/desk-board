# Long-term memory architectures and open-source projects (as of Oct 2026)

Method note: about 18 tool calls (searches and page fetches). GitHub README pages were fetched through a summarizing tool, so star counts and "Releases" fields are snapshots and often showed "no release listed". Treat star counts as approximate. Most benchmark numbers are vendor-reported; this is flagged on each one.

## 1. Per-project architecture, license, SDKs, storage, local-run, maintenance, problems

### Takeaway
Only Mem0 (npm `mem0ai`), Supermemory (npm `supermemory`), Cognee (TypeScript SDK), Letta (TypeScript agent SDK) and Mastra (TypeScript-native) have a Node/TS path. Graphiti is Python-only but runs fully local (FalkorDB or Neo4j plus local LLMs via OpenAI-compatible endpoints). Several research projects (A-MEM, MemoryOS, HippoRAG, LangMem) are small, with 1-4k stars or less. Zep Community Edition is dead. Kuzu support in Graphiti is deprecated.

### Cited Findings

**Mem0**
- About 67.9k stars, Apache-2.0. Python `pip install mem0ai` and Node/TS `npm install mem0ai`, plus a CLI. Self-hosted server via Docker Compose. Default LLM and embedder are OpenAI (gpt-5-mini, text-embedding-3-small). Qdrant is the only backend the README names. No fully offline setup is described in the README. — [Mem0 GitHub](https://github.com/mem0ai/mem0)
- The README's April 2026 algorithm claims are LoCoMo 92.5, LongMemEval 94.4, BEAM 1M 64.1, and BEAM 10M 48.6. They are about 6.7-7.0K tokens per retrieval, with p50 latency of 0.88-1.09s. The README says these include proprietary managed-platform optimizations and that open-source users should expect "directionally similar gains but not identical numbers." The eval harness is at mem0ai/memory-benchmarks. — [Mem0 GitHub](https://github.com/mem0ai/mem0)
- Architecture: LLM extracts facts from messages, then add/update/delete decisions against stored memories, with a vector store and optional graph memory. This is the standard design in the Mem0 paper. — [Mem0 paper arXiv 2504.19413](https://www.arxiv.org/pdf/2504.19413)
- Known problems (secondhand, thin evidence): repetitive "memory junk", scope misclassification (user vs session), noisy stores at around 100 fuzzy memories per user. — [Reddit mirror](https://reddit.sentinel-team.org/posts/1snxtw6/snapshots/2026-04-18T02%3A26%3A23.131782Z), [dev.to](https://dev.to/crabtalk/mem0-what-three-memory-scopes-actually-cost-1kpc). A field guide claims the graph pipeline hardcodes `openai_structured`, which gives 401 errors with Anthropic or Groq; this is unverified and the issue was reportedly closed as a duplicate in March 2026. — [theorydelta](https://navigator-3qw.pages.dev/findings/graph-memory-self-hosted-not-production-ready)

**Zep / Graphiti**
- Graphiti: about 32.3k stars, Apache-2.0, Python 3.10+ only. Backends are Neo4j 5.26, FalkorDB 1.1.2, Amazon Neptune (with OpenSearch), and Kuzu 0.11.2 (deprecated because upstream is unmaintained). Self-hosted only. It can use local LLMs through OpenAI-compatible endpoints (Ollama, vLLM, llama.cpp, LM Studio). A reference MCP server is included but has no auth and is labelled reference-only. — [Graphiti GitHub](https://github.com/getzep/graphiti)
- Zep Community Edition is deprecated and unsupported. The code was moved to `legacy/` and users are pointed to Graphiti or Zep Cloud. — [Zep help](https://help.getzep.com/ce-deprecation-notice). One source dates the end of support to April 2025, and the official pages give no date. — [beri.net](https://www.beri.net/article/zep-vs-mem0-vs-postgres-agent-memory-store-buy-last-2026)
- Architecture is a bi-temporal knowledge graph that stores episodes, entities and facts with validity windows. Paper claims: DMR 94.8% vs MemGPT 93.4%, and on LongMemEval "up to 18.5%" higher accuracy with 90% lower latency than baselines. This is vendor-authored. — [arXiv 2501.13956 via HF](https://huggingface.co/papers/2501.13956)
- Hosted pricing at 10k users is about $375/month (Zep Flex Plus). The self-hosted Graphiti cost cannot be priced from public docs. — [beri.net](https://www.beri.net/article/zep-vs-mem0-vs-postgres-agent-memory-store-buy-last-2026)

**Letta (MemGPT)**
- About 25.3k stars, Apache-2.0. Development has moved to the `letta-code` repo (agent harness, TUI, App Server). npm `@letta-ai/letta-code`, and `letta server` runs local or self-hosted agents. A TypeScript Agent SDK exists. The README did not describe a storage backend. — [Letta GitHub](https://github.com/letta-ai/letta)
- The architecture is an LLM-as-OS design with in-context core memory blocks plus archival and recall storage that the agent edits through tool calls. This is background knowledge from the MemGPT paper and is not confirmed in the fetched page. See the Gaps section.
- Letta Cloud is about $1,020/month in the 10k-user scenario, before LLM tokens. — [beri.net](https://www.beri.net/article/zep-vs-mem0-vs-postgres-agent-memory-store-buy-last-2026)
- Letta (Aug 2025) reported 74.0% on LoCoMo with gpt-4o-mini by giving an agent plain files with search tools, vs 68.5% for Mem0's best graph variant. Letta calls the comparison apples-to-oranges and says Mem0 did not respond to its questions. — [Letta blog](https://www.letta.com/blog/benchmarking-ai-agent-memory), [aktagon summary](https://signals.aktagon.com/articles/2026/02/benchmarking-ai-agent-memory-is-a-filesystem-all-you-need/)

**LangMem**
- About 1.7k stars, MIT. It has a core memory API, agent memory tools, and a background memory manager. Storage is pluggable through LangGraph's store (`InMemoryStore` in examples, `AsyncPostgresStore` recommended). It is tied to LangGraph and Python. The README showed no release or last-commit date, so I could not confirm that it is active. — [LangMem GitHub](https://github.com/langchain-ai/langmem)

**Cognee**
- About 32.8k stars, Apache-2.0, latest release v1.6.1 (24 Sep 2026). Python 3.10-3.14, plus a TypeScript SDK, Rust port, REST API, CLI, MCP server, and Claude Code plugin. It claims to run locally with no API key (local GLiNER extraction and local embeddings; answer generation needs an LLM). Postgres can run the whole stack in one instance (labelled a demo feature). A `kuzu` dir exists, but the default graph store is not stated on the page. — [Cognee GitHub](https://github.com/topoteretes/cognee)

**GraphRAG / LightRAG / HippoRAG**
- LightRAG: about 40.4k stars, MIT, 2026.07 news items so it is active. Default stores are in-memory with file persistence ("not suitable for production"). PostgreSQL can serve all four storage types, with Neo4j, Memgraph, Milvus, and Qdrant as options. It has an offline/air-gapped deployment guide. It is a document-RAG system, not a conversational memory. — [LightRAG GitHub](https://github.com/HKUDS/LightRAG)
- HippoRAG: about 4.1k stars, MIT, Python. Local Parquet embeddings by default, with optional Qdrant, Chroma, or Milvus Lite. It has an MCP server and a Claude Code plugin. Indexes must be rebuilt when models change. It is a research-origin RAG system. — [HippoRAG GitHub](https://github.com/OSU-NLP-Group/HippoRAG)
- Microsoft GraphRAG was not fetched; see Gaps.

**A-MEM**
- About 1.0k stars, MIT, only 33 commits, 3 open issues. Zettelkasten-style notes with LLM-generated tags and context, links between related memories, and updates to existing notes. OpenAI, vLLM, and Ollama backends. A research prototype. — [A-mem GitHub](https://github.com/WujiangXu/A-mem)

**MemoryOS (BAI-LAB)**
- About 1.6k stars, Apache-2.0, 272 commits, latest news item Jan 2026. Short-term, mid-term, and long-term persona tiers. ChromaDB, Python package `memoryos-pro`, MCP server, Docker image. Not clearly active since early 2026. — [MemoryOS GitHub](https://github.com/BAI-LAB/MemoryOS)

**MemOS (MemTensor)**
- About 12.1k stars, Apache-2.0, news as recent as 2026-08-17. Graph-structured "memory OS". Self-hosting uses Neo4j and Qdrant. A local plugin (v2.0, SQLite, Node.js) is aimed at specific agent runtimes (DeepSeek Harness, Hermes Agent, OpenClaw). Self-reported results: LoCoMo 88.83, LongMemEval 89.20, BEAM-10M 56.75. — [MemOS GitHub](https://github.com/MemTensor/MemOS)

**Supermemory**
- About 31.4k stars, MIT. Memory engine, user profiles, hybrid search, connectors. `npx supermemory local` runs a server at localhost:6767, with data in `~/.supermemory`. npm and pip SDKs. A local embedding model is the default and you can use Ollama. An API key is still required on localhost, and URL ingestion relies on a hosted reader, so it is not fully offline. It self-claims #1 on LongMemEval, LoCoMo, and ConvoMem. — [Supermemory GitHub](https://github.com/supermemoryai/supermemory)

**Mastra Observational Memory** (not on the original list, but TypeScript-native)
- An Observer agent compresses conversation into timestamped notes, and a Reflector periodically reorganizes them. It is text-only, needs no vector or graph DB, and the append-only design keeps prompt caches valid. Self-reported LongMemEval is 94.87% (gpt-5-mini) and 84.23% (gpt-4o). — [Mastra](https://mastra.ai/research/observational-memory), [The Decoder](https://the-decoder.com/mastras-open-source-ai-memory-uses-traffic-light-emojis-for-more-efficient-compression/)

**ChatGPT and Claude memory features**
- One 2026 comparison says ChatGPT's current system ("Dreaming") merged saved memories and chat-history reference into one background process. It says Claude builds categorized memory entries updated in real time, with project-scoped isolation, and has separate toggles for "search chats" and "generate memory". This comes from single secondary sources, so verify against official help pages. — [MemoryPlugin](https://blog.memoryplugin.com/claude-vs-chatgpt-vs-gemini-memory/), [MindStudio](https://www.mindstudio.ai/blog/claude-memory-vs-chatgpt-memory-comparison)

### Inferences
- For a Node/Electron app with Claude Code as the backend, the practical integration paths are (a) a local HTTP or MCP service (Graphiti MCP, Cognee MCP, Supermemory local, Mem0 self-host) or (b) a library you implement yourself in TS. Python-only projects need a sidecar process on Windows.
- Windows 11 matters: Kuzu is deprecated, and Neo4j or FalkorDB need Docker or WSL. Cognee's Postgres-only option and the SQLite-based MemOS plugin are lighter. This is my inference; I did not test Windows installs.
- Mem0's headline numbers come from its managed platform, so the open-source SDK should be expected to score lower.

### Gaps
- Exact last-release dates and commit recency for Mem0, Graphiti, Letta, LangMem, and A-MEM (the README pages showed none). Check the GitHub releases pages.
- Microsoft GraphRAG, Generative Agents (Park et al. 2023, memory stream with recency/importance/relevance scoring), and the Letta/MemGPT architecture were not researched from sources in this pass.
- No primary OpenAI or Anthropic help pages were read for the ChatGPT and Claude memory features.
- No Hacker News threads were found for real-world experience.

## 2. Benchmarks: accuracy, latency, cost; vendor vs independent; disputes

### Takeaway
The only controlled multi-system comparison I found is Redis's Sep 2026 LongMemEval rerun, and it shows large drift between published and reproduced numbers (+3 to -28 points). LoCoMo is widely criticized as too short and error-ridden (a full-context baseline scores about 73%). Vendor claims above 90% (Mem0, Mastra, Agent Zero, OMEGA) should be treated as unverified.

### Cited Findings
- Redis reran LongMemEval (500 questions, official GPT-4o judge, gpt-4o answerer) in Sep 2026. Redis evaluates its own products too, so it is not neutral. — [Redis report](https://redis.io/resources/agent-memory-benchmark-report/)

| System | Reported | Reproduced | Query latency | Cost per session |
|---|---|---|---|---|
| Mastra OM | 84.2% | 84.2% | 4.12s | $0.365 |
| Supermemory | 81.6% | not reproduced | <300ms / ~6s | >$0.0257 |
| Bedrock AgentCore | 73.6% | 77.0% | 1.99s | $0.0229 |
| Zep/Graphiti (gpt-4o) | 71.2% | not reproduced | 2.58s | >$0.0205 |
| Vertex Memory Bank | ~70% | 42.4% | 1.35s | $0.0202 |
| Mem0 | 49.0% | not reproduced | n/a | n/a |

  The report gives no p50 or p95 (a single query-latency value per system). Its appendix has table anomalies (e.g., a 95.4% entry in every column), so treat details with caution. — [Redis report](https://redis.io/resources/agent-memory-benchmark-report/)
- The Mem0 49.0% LongMemEval figure sits against Mem0's own 94.4% claim for its April 2026 managed algorithm. Different algorithm versions and setups probably explain part of it; the cause is unconfirmed. — [Mem0 GitHub](https://github.com/mem0ai/mem0), [Redis report](https://redis.io/resources/agent-memory-benchmark-report/)
- Zep vs Mem0 dispute (2025). Mem0's paper reported Zep at 65.99% on LoCoMo. Zep said Mem0 misconfigured it (both speakers as "user", timestamps in message text, sequential search) and reported 75.14% (±0.17), vs Mem0 Graph at 68.44%. Zep's p95 search latency was 0.632s concurrent. — [Zep blog](https://www.getzep.com/blog/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/). Mem0's co-founder replied in a GitHub issue that Zep included the adversarial category in its score and that the corrected figure is 58.44%. — [secondary summary, via search](https://mem0.ai/blog/ai-memory-benchmarks). Neither side's original numbers are independently verified; I did not read the GitHub issue directly.
- Zep's critique of LoCoMo: conversations of about 16-26k tokens, a full-context baseline (about 73%) beats Mem0's best (about 68%), no knowledge-update questions, and data quality issues. — [Zep blog](https://www.getzep.com/blog/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/)
- An audit by Penfield Labs found 99 score-corrupting errors in 1,540 LoCoMo questions, and its judge accepted 62.81% of deliberately wrong answers (reported secondhand). HaluMem found extraction recall below 60% and correct update rates below 26%. — [beri.net](https://www.beri.net/article/zep-vs-mem0-vs-postgres-agent-memory-store-buy-last-2026)
- Zep's own LongMemEval figure for gpt-4o is 71.2% at 2.58s vs full context at 60.2% / 28.9s. — [aktagon](https://signals.aktagon.com/articles/2026/07/zep-a-temporal-knowledge-graph-architecture-for-agent-memory/) (third-party write-up, unverified against the paper)
- Other self-reported 2026 LongMemEval numbers: Agent Zero 95.6%, Mastra 94.87%, Hindsight 91.4%, Supermemory 85.2% in one preprint's table, and MemOS 89.20. — [arXiv 2608.29606](https://arxiv.org/pdf/2608.29606), [MemOS](https://github.com/MemTensor/MemOS). All are self-reported and use different backbones.
- A baseline-first view: no independent party has confirmed that a commercial memory store beats a competent baseline. — [beri.net](https://www.beri.net/article/zep-vs-mem0-vs-postgres-agent-memory-store-buy-last-2026)
- Mem0's token cost is about 7K tokens per retrieval, with Supermemory claiming about 720 tokens of added context. Both are vendor-reported. — [Mem0](https://github.com/mem0ai/mem0), [Supermemory](https://github.com/supermemoryai/supermemory)

### Inferences
- A single-user assistant with a modest data volume (months of voice conversations) is well within what a full-context or file-based baseline handles. Letta's filesystem result and the 73% full-context LoCoMo baseline both point to this.
- Latency differences matter for voice. Memory retrieval must run before or alongside a realtime voice turn, so only sub-second retrieval (about 0.2-1s p50 claims) fits inline. Slower systems such as Mastra (4.1s) are better as background or pre-session context.

### Gaps
- No independent p50/p95 for any system. No DMR reproduction found. No 2025-26 benchmarks beyond BEAM, HaluMem, ConvoMem, and PersonaMem were investigated in depth.
- LongMemEval v2 appeared in search results but was not read.

## 3. Production vs research prototype

### Takeaway
Production-oriented with hosted products: Mem0, Zep (cloud), Letta, Supermemory, Cognee. Research-origin and small: A-MEM, MemoryOS, HippoRAG, LangMem. Direct evidence of production use is thin; mostly it is star counts and vendor pricing pages.

### Cited Findings
- Hosted plans with published pricing exist for Zep, Mem0, and Letta Cloud. — [beri.net](https://www.beri.net/article/zep-vs-mem0-vs-postgres-agent-memory-store-buy-last-2026). Zep has SOC 2 Type II, with the report and BAA Enterprise-only (same source).
- The Mem0 paper title claims "production-ready", and the repo is the most starred (67.9k). — [arXiv 2504.19413](https://www.arxiv.org/pdf/2504.19413)
- A-MEM, MemoryOS, and HippoRAG have 1-4k stars and few commits each. — GitHub pages above.
- A third-party field guide argues self-hosted graph memory is not production-ready. — [theorydelta](https://navigator-3qw.pages.dev/findings/graph-memory-self-hosted-not-production-ready) (low-confidence source; I did not read the full text)

### Inferences
- Stars measure popularity, not proof. No customer case studies were verified.

### Gaps
- No verified named production deployments for any project.

## 4. Shortlist and borrow-vs-adopt for this use case

### Takeaway
Shortlist for a bake-off: (1) Graphiti with FalkorDB or Neo4j via a sidecar/MCP (best temporal-fact model, fully local-capable), (2) Mem0 OSS (Node SDK, simplest integration, but verify its local-LLM story), and (3) a simple baseline of markdown/SQLite notes with Mastra-style observation/reflection or the Letta-style file approach. Borrow ideas from Generative Agents, A-MEM, MemoryOS, HippoRAG, and Mastra OM rather than adopting them. This is my judgement based on the findings above, not a verified result.

### Cited Findings
- Graphiti is the only candidate with explicit bi-temporal facts, a free local path (FalkorDB in Docker, local LLMs), and an MCP server. — [Graphiti GitHub](https://github.com/getzep/graphiti)
- Mem0 has a Node/TS SDK and the largest community, but its best numbers are from the managed platform. — [Mem0 GitHub](https://github.com/mem0ai/mem0)
- Cognee has a local no-key mode, a TS SDK, and a Claude Code plugin, and is active (v1.6.1, Sep 2026). — [Cognee GitHub](https://github.com/topoteretes/cognee)
- Mastra's append-only observation log is built for prompt-cache stability and needs no database. — [Mastra](https://mastra.ai/research/observational-memory)
- Letta's file-based result suggests a plain files-plus-search baseline is competitive. — [Letta blog](https://www.letta.com/blog/benchmarking-ai-agent-memory)
- The independent advice is to build a baseline on Postgres or similar first and buy or adopt a memory system only for a capability you can name (e.g., temporal fact invalidation). — [beri.net](https://www.beri.net/article/zep-vs-mem0-vs-postgres-agent-memory-store-buy-last-2026)

### Inferences
- Bake-off slot 1, Graphiti: matches "learn everything about the user over time" because changing facts (job, address) are invalidated, not overwritten. Cost: Python sidecar, Docker or WSL, and an LLM call per episode ingested (cost unmeasured).
- Bake-off slot 2, Mem0 OSS or Cognee: Mem0 for lowest integration effort in Node; Cognee as an alternative if its local mode works on Windows. Pick one after a quick install test.
- Bake-off slot 3, home-grown baseline (markdown profile plus SQLite/FTS or embeddings, with a background Observer/Reflector run by Claude Code). It is the control. If it ties the others on your own eval set, skip the dependencies.
- Borrow only: Generative Agents scoring (recency x importance x relevance), A-MEM note linking, MemoryOS tiering, HippoRAG for document-heavy recall, and MemOS's tiering ideas. Skip LangMem (LangGraph-bound) and Zep CE (dead). LightRAG and GraphRAG are for document corpora, not conversation memory.
- Evaluate on a small personal question set from your own transcripts, since public benchmarks conflict and are contaminated by vendor tuning.

### Gaps
- None of the shortlist was tested on Windows 11 by me. Local-LLM quality for extraction (small models vs OpenAI/Claude) was not researched and is the main unknown for cost and privacy.
