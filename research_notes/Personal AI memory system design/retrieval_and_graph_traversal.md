# Retrieval and graph traversal for single-user voice-latency AI memory (as of Oct 2026)

Note on sourcing: numbers marked "primary" were read from the paper's HTML text (via fetch). Numbers marked "secondary" come from search-result summaries, blogs or vendor pages and were not verified against a primary source.

## 1. Hybrid retrieval (BM25/FTS + dense + RRF + reranking): accuracy and latency

### Takeaway
BM25 + dense with RRF is the standard baseline (Graphiti uses exactly this by default). Dense beats BM25 on average, but BM25 is a cheap complement. Reranking is the only stage likely to blow a 100-300 ms budget on CPU; tiny rerankers or none are realistic. For memory specifically, how you index (fact-augmented keys, session vs round granularity) moved recall more than retriever choice in LongMemEval.

### Cited Findings
- HippoRAG 2 paper, passage Recall@5 averaged over 5 datasets (primary): BM25 55.1, Contriever 55.4, GTR 60.7, NV-Embed-v2 73.4, RAPTOR 65.6, HippoRAG 2 78.2. QA F1 average (7 datasets, Llama-3.3-70B reader): BM25 47.7, NV-Embed-v2 57.0, HippoRAG 2 59.8. So dense > BM25 by roughly 10 F1 points on that benchmark, with a strong embedder. — [HippoRAG 2 (arXiv 2502.14802)](https://arxiv.org/html/2502.14802v2)
- LongMemEval (M variant, Stella V5 retriever, primary Table 3): session-level values with K=V gives Recall@5 0.706; adding extracted user facts to the key (K=V+fact) gives 0.732 R@5 and 0.862 R@10 (vs 0.783 for K=V). Round-level K=V: 0.582 R@5, K=V+fact: 0.644. Keyphrase and summary expansion did not help consistently (K=V+keyphrase round-level fell to 0.478). Paper states fact-augmented keys improve recall by 9.4% and downstream QA by 5.4%. — [LongMemEval (arXiv 2410.10813)](https://arxiv.org/html/2410.10813)
- LongMemEval appendix retriever comparison: a secondary summary says dense retrievers (Stella, Contriever) beat BM25 in most settings, but I could not read Appendix E.2 numbers directly. — [summary](https://www.emergentmind.com/topics/longmemeval-dataset)
- A 2026 retrieval-stage study (arXiv 2606.04194) reportedly finds dense late-interaction helps most on multi-hop and temporal LongMemEval questions but trails BM25 on adversarial ones (secondary, unverified). — [arXiv 2606.04194](https://arxiv.org/pdf/2606.04194)
- Graphiti default search is cosine + BM25 fused with RRF; other rerankers: MMR, node-distance, episode-mentions, cross-encoder (OpenAI logprobs default, Gemini, or local BAAI/bge-reranker-v2-m3). 16 prebuilt recipes. Docs make no latency claims. — [Graphiti search docs](https://help.getzep.com/graphiti/working-with-data/searching)
- Zep paper describes the cross-encoder reranker as the most sophisticated option with the highest computational cost. — [Zep paper](https://arxiv.org/html/2501.13956)
- Reranker latency evidence is poor quality: GPU (A10) bge-reranker-v2-m3 about 45 ms p50 for top-25 and about 140 ms for top-100; CPU numbers of unstated hardware range from about 45 ms (FlashRank/TinyBERT, 50 docs) to about 300 ms (MiniLM-L6, 50 docs) to about 1.4 s (bge-v2-m3, 50 docs); one personal project reported 8.6 s for 10 chunks on CPU. Sources are blogs and disagree widely. — [DEV: rerankers and latency budget](https://dev.to/gabrielanhaia/rerankers-and-the-latency-budget-when-cross-encoders-are-worth-it-3efc)
- Local pipeline latency, sqlite-vec + FTS5 + RRF at 100k vectors (Apple Silicon, synthetic vectors, one GitHub PR, secondary): raw KNN k=20 about 185 ms before fix; FTS5 about 2.3 ms; RRF about 2 ms; after normalizing vectors and using L2 the hybrid p50 was 23.5 ms, p95 41.1 ms. — [Recall PR #225](https://github.com/edheltzel/Recall/pull/225)
- sqlite-vec is brute force: 100k x 384-dim float32 full scan about 67.8 ms on M1 Pro (one benchmark); latency scales linearly with row count. A WASM benchmark claims under 5 ms with binary quantization at 384 dims (secondary). — [Bambini on SQLite vector search](https://marcobambini.substack.com/p/the-state-of-vector-search-in-sqlite), [WASM benchmarks](https://ninadpathak.pages.dev/blog/local-wasm-vector-benchmarks/)
- Embedding model CPU latency: one package page reports fastembed ONNX single-sentence p50 about 11.9 ms for a small model (page ambiguous on whether bge-small or MiniLM); ONNX loses at larger batches. EmbeddingGemma-300m has ONNX and Transformers.js (fp32/q8/q4) builds, 768-d truncatable via Matryoshka to 512/256/128, 2K context, "under 200 MB RAM when quantized"; Hugging Face blog gives no latency numbers. — [ggmbed](https://pypi.org/project/ggmbed/), [HF EmbeddingGemma blog](https://huggingface.co/blog/embeddinggemma)
- Personal-scale caveat: the search found no directly comparable CPU timing table for bge-small vs nomic-embed vs EmbeddingGemma vs MiniLM. A paper on EmbeddingGemma reports only GPU throughput. — [arXiv 2509.20354](https://arxiv.org/abs/2509.20354v2)

### Inferences
- A single user's memory is likely 10^3 to 10^5 items, so brute-force sqlite-vec plus FTS5 is well within budget (tens of ms) once the query embedding is computed. The query embedding on CPU (roughly 10-50 ms for a small model, estimated from the one data point) is probably the dominant fixed cost, not the search.
- Cross-encoder reranking is probably optional at personal scale; if used, restrict to top 15-20 candidates with a tiny model, or run it only on the async/slow path. API-based LLM rerank will not fit 100-300 ms.
- Indexing choice (store extracted facts alongside raw text and embed the concatenation) is the best-supported cheap accuracy gain from LongMemEval.

### Gaps
- No verified like-for-like CPU latency table for bge-small / nomic-embed / EmbeddingGemma / MiniLM; must be benchmarked on the target machine.
- LongMemEval Appendix E.2 BM25 vs dense numbers not read directly.
- No credible measured BM25+dense+RRF versus dense-only ablation on a memory benchmark found (only the Graphiti design and general claims).

## 2. Graph traversal (PPR, spreading activation, GraphRAG, LightRAG, Graphiti, Mem0g): does it beat plain hybrid?

### Takeaway
Graph methods help mainly on genuine multi-hop/associative questions (HippoRAG 2: roughly +2.8 F1 average over the best dense baseline, much more on 2Wiki), and only when the graph is built well. Evidence on conversational memory benchmarks (LoCoMo, LongMemEval) shows small or mixed gains from graph variants over a good flat memory, at 2-3x more latency. Community-summary GraphRAG and LightRAG performed poorly on the HippoRAG 2 benchmark.

### Cited Findings
- HippoRAG 2 QA F1 (primary): NV-Embed-v2 57.0 avg vs HippoRAG 2 59.8 avg (+2.8). Per dataset: 2Wiki 61.5 -> 71.0, MuSiQue 45.7 -> 48.6, HotpotQA 75.3 -> 75.5, NQ 61.9 -> 63.3, PopQA 55.7 -> 56.2, LV-Eval 9.8 -> 12.9, NarrativeQA 25.7 -> 25.9. Gains are concentrated on 2Wiki (multi-hop) and are tiny on HotpotQA and simple-fact sets. Retrieval Recall@5 avg 73.4 -> 78.2. — [HippoRAG 2](https://arxiv.org/html/2502.14802v2)
- Same table: GraphRAG avg F1 49.6 and LightRAG avg 6.6 (LightRAG numbers look like a failure in this setup), both worse than plain NV-Embed-v2 (57.0) and BM25 (47.7 for LightRAG far below). Authors state GraphRAG/LightRAG do not output passage retrieval so they are excluded from recall. — [HippoRAG 2](https://arxiv.org/html/2502.14802v2)
- Cost on MuSiQue corpus (11,656 passages, Llama-3.3-70B, 4xH100): NV-Embed-v2 0.3 s/query; HippoRAG 2 1.2 s/query, 99.5 min indexing, 9.2M input/3.0M output tokens; GraphRAG 10.7 s/query, 277 min, 115.5M input tokens; LightRAG 13.3 s/query, 235 min, 68.5M input tokens. The 1.2 s includes LLM triple filtering and QA; the paper gives no separate retrieval-only latency. — [HippoRAG 2](https://arxiv.org/html/2502.14802v2)
- HippoRAG 2 mechanism: Personalized PageRank over a phrase+passage graph, with an LLM filter on retrieved triples (secondary description). — [emergentmind summary](https://www.emergentmind.com/topics/hipporag-2)
- Original HippoRAG reported about +3 and +20 points over RAG on MuSiQue and 2Wiki (secondary). The HippoRAG 2 reproduction shows HippoRAG 1 was worse than dense on NQ (Recall@5 44.4 vs 75.4 for NV-Embed-v2). — [HippoRAG 2](https://arxiv.org/html/2502.14802v2)
- Mem0 paper LoCoMo (primary, authors are the vendor): overall J: Mem0 66.88, Mem0g (graph) 68.44, Zep 65.99, full-context 72.90, best plain RAG 60.97 (k=2, chunk 256), OpenAI memory 52.90. Graph variant gains about +1.6 J overall; it helps temporal (58.13 vs 55.51) and open-domain (75.71 vs 72.93) but hurts single-hop (65.71 vs 67.13) and multi-hop (47.19 vs 51.15). — [Mem0 paper](https://arxiv.org/html/2504.19413)
- Mem0 latency (primary): Mem0 search p50 0.148 s, p95 0.200 s, ~1.8k memory tokens; Mem0g search p95 0.657 s, ~3.6k tokens; Zep search p95 0.778 s, 3.9k tokens; plain RAG search p95 0.6-1.1 s. Full-context total p95 17.1 s. Note these are API-backed hosted-service timings, not local. — [Mem0 paper](https://arxiv.org/html/2504.19413)
- Zep disputes Mem0's Zep result: claims 75.14 +/- 0.17 J on LoCoMo with corrected implementation and 0.632 s p95 search (vendor claim, contradicted by Mem0's 65.99). — [Zep blog](https://blog.getzep.com/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/)
- Zep/Graphiti on LongMemEval (primary, vendor paper): gpt-4o 71.2% vs full-context 60.2%; gpt-4o-mini 63.8% vs 55.4%; average context 1.6k tokens vs 115k; latency 2.58 s vs 28.9 s (end-to-end including LLM). Gains by type for gpt-4o: temporal +38.4%, multi-session +30.7% (relative), single-session-preference +184%, but single-session-assistant -17.7%. The paper's single-session-user rows are identical across two models, a likely copy error. These comparisons are to full-context, not to a plain hybrid RAG baseline, so they do not isolate the graph's contribution. — [Zep paper](https://arxiv.org/html/2501.13956)
- Zep paper retrieval: cosine + BM25 + BFS expansion (n hops, can seed from recent episodes), reranked by RRF/MMR/episode-mentions/node-distance/cross-encoder. — [Zep paper](https://arxiv.org/html/2501.13956)
- GraphRAG-Bench ("When to use graphs in RAG", ICLR 2026): graph helps multi-hop synthesis over non-local evidence; prior work cited shows GraphRAG 13.4% lower accuracy than vanilla RAG on Natural Questions and 16.6% lower on time-sensitive queries, with +4.5% on HotpotQA multi-hop at ~2.3x latency (secondary summary; figures attributed to prior work). — [ICLR 2026 poster](https://iclr.cc/virtual/2026/poster/10007992), [arXiv 2506.05690](https://arxiv.org/html/2506.05690v3)
- 2026 LongMemEval leaderboard claims are mostly vendor-reported or on different judges: e.g., Redis report (Sep 2026) warns published memory results often do not reproduce under one judge; Supermemory claims 97% Recall@20 (retrieval metric, self-reported); other 90%+ claims (Mastra, Hindsight) come from an aggregator page. None provide an isolated hybrid-vs-graph ablation. — [Redis report](https://redis.io/resources/agent-memory-benchmark-report/), [Supermemory](https://supermemory.ai/research.md), [studiomeyer](https://academy.studiomeyer.io/concepts/longmemeval)

### Inferences
- For a single user, an entity-link graph is most useful as a cheap one-hop expansion (neighbors of entities found in the top hits, plus recency seeds) rather than PPR/community summaries. This is a design inference; no source isolates it.
- PPR over a personal-scale graph (thousands of nodes) is cheap computationally, but HippoRAG 2's accuracy gain depends on LLM-extracted triples and a triple filter; at best it matches the +3 F1 average seen on general multi-hop QA. Conversational memory questions are mostly single-session or temporal where graphs did not clearly help in the Mem0 data.
- GraphRAG community summaries and LightRAG dual-level are poorly supported for low-latency personal memory: high index cost, 10+ s query times in the HippoRAG 2 setup, weak accuracy there.

### Gaps
- No measured LightRAG or GraphRAG result on LongMemEval/LoCoMo found. LightRAG's own paper was not read; the HippoRAG 2 LightRAG numbers (6.6 F1) look anomalous and may reflect setup problems, so treat as weak evidence.
- No clean ablation of Graphiti's BFS vs no-BFS on LongMemEval.
- Spreading activation as a ranking method for LLM memory: no benchmark found.

## 3. Temporal, recency and importance weighting; time-aware queries

### Takeaway
The only solidly measured technique is LLM-based time-range extraction from the query to filter/boost retrieval (LongMemEval), helping temporal subsets by about 7-11% recall when a strong LLM does the parsing. Bitemporal edge invalidation (Graphiti) is the main design for knowledge updates. Recency/importance score blending lacks benchmark evidence in my sources.

### Cited Findings
- LongMemEval time-aware query expansion (primary, Table 4, temporal-reasoning subset): session-level K=V Recall@5 0.639 -> 0.654 with GPT-4o expansion; K=V+fact 0.684 -> 0.722; round-level K=V 0.421 -> 0.451. Paper reports avg gains 6.8% (session) and 11.3% (round). Llama 3.1 8B expansion often did not help or hurt (e.g., session K=V 0.624, round K=V 0.384) because it hallucinates or misses temporal cues. — [LongMemEval](https://arxiv.org/html/2410.10813)
- Zep extracts timestamps and invalidates edges (temporal extraction and edge invalidation section); its temporal-reasoning gain over full context was +38.4% (gpt-4o) and +48.2% (gpt-4o-mini), relative. — [Zep paper](https://arxiv.org/html/2501.13956)
- Mem0g (graph) had the best temporal J on LoCoMo (58.13 vs 55.51 Mem0, 49.31 Zep, 21.71 OpenAI). — [Mem0 paper](https://arxiv.org/html/2504.19413)
- Graphiti offers episode-mentions and node-distance rerankers; no recency decay recipe was listed in the docs page I read. — [Graphiti docs](https://help.getzep.com/graphiti/working-with-data/searching)

### Inferences
- Resolve relative dates ("last week") deterministically in code (regex/date parser or a tiny rule set) using the known current date, then apply a SQL timestamp filter; this avoids the small-LLM failure documented by LongMemEval and costs about 0 ms.
- Store event time and ingestion time separately so "what did I decide last week" filters on decision events and "what do I currently believe" uses latest valid edge.
- A small recency boost (e.g., multiplicative decay) as a tiebreaker is a reasonable heuristic; I found no benchmark evidence for specific weights.

### Gaps
- No measured ablation of recency/importance weights (e.g., Generative Agents style scoring) on 2025-2026 memory benchmarks found.

## 4. Context budgeting, core profile, caching, and voice-agent memory patterns

### Takeaway
Retrieved memory contexts of about 1.5-4k tokens were typical in the memory systems tested (Zep 1.6k on LongMemEval, Mem0 1.8k, Mem0g 3.6k on LoCoMo) and beat full context on latency by a large factor. More context is not monotonically better for plain RAG (accuracy dropped at 1-4k tokens for single chunk in Mem0's RAG sweep). Voice-specific evidence on memory is thin; the relevant measured work is on speculative/prefetch retrieval.

### Cited Findings
- Mem0's RAG sweep (primary): overall J varied from 36.8 to 60.97 depending on chunk size and k (best: k=2, 256-token chunks, 60.97); so tuning snippet size/count matters as much as retriever choice. Memory store sizes: Mem0 about 7k tokens per conversation, Mem0g about 14k, raw conversation about 26k, Zep over 600k. — [Mem0 paper](https://arxiv.org/html/2504.19413)
- LongMemEval: reading strategy matters; with oracle retrieval a suboptimal reader format causes up to a 10-point drop for GPT-4o; Chain-of-Note plus structured (JSON) formatting consistently helped. — [LongMemEval](https://arxiv.org/html/2410.10813)
- VoiceAgentRAG (Salesforce AI Research, Mar 2026): a background agent predicts likely follow-up topics and prefetches chunks into an in-memory (FAISS) semantic cache; paper cites typical vector DB round trip of 50-300 ms as consuming much of the voice latency budget. Authors' own evaluation; I did not read hit-rate numbers. — [arXiv 2603.02206](https://arxiv.org/html/2603.02206v2)
- FIT-Voice (Brno, 2026 student poster): speculative generation from a learned end-of-turn forecaster cut latency 1.2 s -> 0.8 s (33%); RAG-augmented latency 1.7 s -> 1.3 s. Authors' own results. — [Excel@FIT poster](https://excel.fit.vutbr.cz/submissions/2026/069/69.pdf)
- Streaming RAG (Arora et al., 2025): fires tool queries from partial utterances with parallel speculative threads and a reflector; cost is discarded premature calls (described via secondary text; I did not read the paper). — [arXiv 2605.13360](https://arxiv.org/html/2605.13360v1)
- OpenAI Realtime: tools configured via session.update; model emits function_call, app returns function_call_output; model can speak a preamble ("I'll check that now") while a tool runs. A guide states about 800 ms natural response target leaving about 300 ms for network, audio processing and VAD. gpt-realtime-2.1 released July 2026 with claimed at least 25% p95 latency cut attributed to caching (third-party reports of an OpenAI announcement, unverified); cached audio input priced far below fresh (mini: $0.30 vs $10.00 per 1M). — [DEV Community guide](https://dev.to/techsignaldaily/building-low-latency-voice-agents-with-openais-gpt-realtime-21-and-gpt-realtime-21-mini-3mnj), [letsdatascience](https://letsdatascience.com/news/openai-releases-gpt-realtime-21-voice-models-with-lower-late-0fd2f599)

### Inferences
- Keep a small, stable "core profile" block (identity, preferences, standing facts, current projects; a few hundred to ~1k tokens) at the start of instructions so it benefits from prompt caching; put volatile retrieved snippets after it (or as a tool result / injected conversation item) so the cached prefix is not invalidated. Cache behavior details for the Realtime API were not verified in primary docs.
- Two access paths: (a) preloaded core profile plus a prefetched "likely relevant" cache refreshed on session start and after each turn, (b) a `recall(query, time_range?)` tool for on-demand fetch, with the model speaking a preamble while it runs. Tool-call round trip adds a model turn, so tool-only memory risks blowing the 300 ms budget; prefetch on partial transcripts hides it.
- Inject about 1-2k tokens of snippets per turn; past that, evidence suggests no accuracy gain and added latency.

### Gaps
- No primary OpenAI documentation read on Realtime prompt caching rules or on memory-via-tools best practice; the found material is third-party.
- No measured numbers for how often partial-transcript prefetch hits for personal memory queries.
- No independent voice-agent memory write-up with measured latency found.

## 5. Decision: simplest pipeline that gets most of the accuracy

### Takeaway
Recommended (inference from the evidence above, not a tested result): SQLite with FTS5 + sqlite-vec (small embedder, normalized vectors), RRF fusion, deterministic date filters, fact-augmented keys, and a one-hop entity-graph expansion as an optional layer; skip PPR, community summaries, LightRAG and a cross-encoder in the live path.

### Cited Findings (supporting)
- Dense beats BM25 by about 10 F1 on a multi-hop benchmark, fact-augmented keys add about 9% recall on LongMemEval, time-aware filtering adds about 7-11% recall on temporal questions (LLM-parsed), PPR adds about 3 F1 average over the best dense retriever at about 4x per-query time, graph variants gave about +1.6 J on LoCoMo overall with 3x p95 search latency, and GraphRAG/LightRAG cost 10+ s per query in the HippoRAG 2 setup. See sections 1-3 for sources.

### Inferences
- Live path (budget): query embedding 10-50 ms (small model, ONNX/CPU; estimate) + FTS5 about 2 ms + vec KNN tens of ms at <=100k rows + RRF about 2 ms + SQL date filter + optional graph neighbor lookup (a few ms in SQLite) = plausibly 50-150 ms total, inside 100-300 ms. Must be verified on the target hardware.
- Preload at session start: core profile, recent episodes/open threads, pinned facts. Fetch on demand: everything else via hybrid search, triggered by partial transcript (speculative) and re-run on final transcript; discard if topic changed.
- Offline/async (not in voice path): LLM fact extraction, entity linking, edge invalidation, summaries, embedding of new items, and optional PPR/graph-based consolidation.
- Add a cross-encoder or graph PPR only if an eval on the user's own queries shows a gap; the published evidence shows the gains are on multi-hop-heavy question sets.

### Gaps
- None of the 2026 leaderboard claims offer an isolated ablation of hybrid vs graph; the decision rests on indirect evidence. Recommend building a small personal eval set (including multi-hop and "last week" queries) to test.
