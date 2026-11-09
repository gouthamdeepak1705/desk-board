# Memory write-gating, extraction, consolidation, and learned memory managers (state as of Oct 2026)

Research depth note: about 15 tool calls. Most sources are arXiv abstracts or HTML pages and search summaries. Items marked "unverified" were not checked against primary text. Vendor benchmark numbers are self-reported. Several 2026 arXiv IDs (26xx.xxxxx) were seen only as search-result excerpts.

## 1. What to store: proven approaches and their failure modes

### Takeaway
The dominant production pattern is an LLM extraction pass that turns turns into atomic facts and then reconciles them against existing memories. Mem0 originally used ADD/UPDATE/DELETE/NOOP and in April 2026 moved to single-pass ADD-only extraction because overwriting and deleting lost history. Documented failure modes are over-storing (junk), hallucinated memories that get re-extracted, and incorrect DELETE/UPDATE on complementary facts. Importance scoring (Generative Agents) and rule filters are cheap complements. There is no strong evidence that surprise/novelty scoring beats these.

### Cited Findings
- Mem0 paper (Apr 2025): memory-centric architecture with an extraction phase and an update phase, where each new fact is compared to existing memories via vector similarity search. It also has a graph variant, Mem0g. — [arXiv 2504.19413](https://arxiv.org/abs/2504.19413), [review summary](https://www.themoonlight.io/review/mem0-building-production-ready-ai-agents-with-scalable-long-term-memory)
- Mem0's April 2026 algorithm replaced two-pass extract-then-reconcile (ADD/UPDATE/DELETE) with one LLM call that only adds. Its stated reason is that overwriting and deleting discarded useful history, so a changed fact is stored alongside the old one. Agent-stated facts are stored with the same weight as user statements. Retrieval fuses semantic, keyword and entity signals with entity linking. — [Mem0 blog](https://mem0.ai/blog/mem0-the-token-efficient-memory-algorithm), [PyPI 2.0.0](https://pypi.org/project/mem0ai/2.0.0/)
- Mem0's reported LongMemEval score is 93.4 or 94.4 depending on the page, and the PyPI page says it reflects managed-platform optimizations. These are vendor numbers. Mem0's own docs warn that LoCoMo and LongMemEval can be inflated by aggressive retrieval, large context windows or frontier models. — [Mem0 research](https://mem0.ai/research), [research-3](https://mem0.ai/research-3), [PyPI 2.0.16](https://pypi.org/project/mem0ai/2.0.16/), [Mem0 docs](https://docs.mem0.ai/core-concepts/memory-evaluation)
- Failure mode, over-storing and hallucinated memories: a user self-audit (Mem0 GitHub issue #4573, per secondary accounts only) found 97.8% of 10,134 entries were junk (duplicates, trivia, one-off chatter, dead states) over 32 days. One example was 808 entries claiming "User prefers Vim" that the model hallucinated, then recalled and re-extracted as new. The extractor was gemma2:2b for 20 days, then Claude Sonnet 4.6. The junk rate was 89.6% in the frontier-model batch, so the problem is not only a weak extractor. I could not open the issue itself; the maintainer reportedly shipped changes in April 2026 (unverified). — [mem0-vigil write-up](https://github.kxpsado.workers.dev/jamebobob/mem0-vigil), [theneuralbase](https://theneuralbase.com/mem0/learn/advanced/memory-precision-and-recall/)
- Failure mode, wrong operation choice: a vanilla in-context Memory Manager treated "I adopted a second dog" as a contradiction and issued DELETE+ADD, fragmenting memory. In another example it deleted emotional context and treated a specific allergy as conflicting with a general liking. — [Memory-R1](https://arxiv.org/html/2508.19828v5)
- Generative Agents (Park et al. 2023): the retrieval score combines recency, importance (an LLM rates 1-10) and relevance, and periodic reflection synthesizes higher-level insights. The weights are hand-set. I could not verify the original ablation numbers. — [secondary summary](https://memx.app/glossary/generative-agents/), [critique/notes](https://jeffliulab.github.io/ai-notes/en/AI_Agents/07_Virtual_Embodied_Agents/%E8%AE%B0%E5%BF%86%E6%B5%81%E4%B8%8E%E5%8F%8D%E6%80%9D%E6%9C%BA%E5%88%B6/)
- Hallucinated/poisoned memory and drift as stated risks: the agent can store fabricated content as fact, errors compound in evolving memory (unlike static RAG), and repeated lossy summarization drifts. The SSGM paper proposes a write validation gate that checks candidate updates against protected core facts (e.g. NLI contradiction test) and an append-only ledger of raw observations for reconciliation. This is a conceptual paper with no empirical results. — [SSGM, arXiv 2603.11768](https://arxiv.org/html/2603.11768v1)
- A 2026 survey frames agent memory as a write-manage-read loop and lists learned forgetting as an open challenge. — [arXiv 2603.07670](https://arxiv.org/pdf/2603.07670) (excerpt only)
- A "cognitively grounded multi-factor value model" for what to remember exists (Chen and Cheng, 2026, cites Ebbinghaus, CMA-ES, LongMemEval). I could not read its content, so its method and results are unverified. — [arXiv 2606.12945](https://arxiv.org/pdf/2606.12945)

### Inferences
- Proven practice is: atomic-fact extraction with a strong model, a dedup step against existing memories, and no destructive overwrites. Keep raw episodes as ground truth so extraction errors are recoverable.
- Cheap pre-gates (rule filters: skip chit-chat, tool output, questions; require a user-stated or user-confirmed source) address the over-storing evidence, but I found no controlled ablation of rule filters versus LLM gating.
- I found no solid 2025-2026 source showing surprise/novelty scoring as a standalone gate; treat it as unproven. Embedding-distance-to-nearest-existing-memory is a practical novelty proxy (inference).
- Storing facts from the agent's own output without a source tag risks the Vim-style self-reinforcing loop. Tag provenance (user-said vs assistant-said vs inferred) and never let retrieved memories be re-extracted as new facts (inference from the audit anecdote).

### Gaps
- No primary-source ablation comparing rule filters, importance scoring and LLM gating on precision of stored memories.
- The Mem0 issue #4573 audit was not opened directly; the numbers are second-hand.
- Original Generative Agents ablation numbers were not verified.

## 2. Dedup, contradiction, temporal validity, confidence, provenance

### Takeaway
Zep/Graphiti's bi-temporal graph is the reference design: facts carry validity periods and are invalidated rather than deleted. Mem0 independently moved to the same non-destructive philosophy. Evidence on how well LLMs detect true contradictions versus complementary facts is weak, and Memory-R1 shows vanilla LLMs get it wrong.

### Cited Findings
- Zep (arXiv 2501.13956) is built on Graphiti, a temporally aware knowledge graph with a bi-temporal model: one timeline T for chronological order of events and one timeline T' for transactional order of ingestion. It records validity periods and updates "in a non-lossy manner". The graph has episodic, semantic and community subgraphs (raw data, entities, summaries). Reported results (self-reported): DMR 94.8% vs MemGPT 93.4%, and on LongMemEval up to 18.5% accuracy gain and 90% latency reduction. — [Zep paper](https://arxiv.org/html/2501.13956), [Zep blog](https://blog.getzep.com/zep-a-temporal-knowledge-graph-architecture-for-agent-memory), [KGC summary](https://watch.knowledgegraph.tech/videos/zep-a-temporal-knowledge-graph-architecture-for-agent-memory-720p)
- Mem0 now links entity mentions across memories (entity linking) as a retrieval signal rather than relying on destructive merge. — [PyPI 2.0.0](https://pypi.org/project/mem0ai/2.0.0/)
- SSGM proposes provenance checks on the read side (e.g. signatures on memory units), temporal-obsolescence handling, and an append-only ledger for reconciliation. Conceptual only. — [arXiv 2603.11768](https://arxiv.org/html/2603.11768v1)
- Memory-R1 trains the manager to issue UPDATE (merge) instead of DELETE+ADD for complementary facts, using answer correctness as reward. — [Memory-R1](https://arxiv.org/html/2508.19828v5)

### Inferences
- Recommended schema (inference): per fact store text, entity ids, valid_from/valid_to (event time), recorded_at/expired_at (system time), superseded_by, source episode ids, source type, extractor model and version, confidence. Supersede by closing valid_to and linking, never by deleting.
- Contradiction resolution: only treat as contradiction if same entity and attribute and incompatible values; otherwise add. This is the exact failure the Memory-R1 paper shows.
- Confidence is not well established in the literature I found; a practical proxy is count of independent mentions plus explicit user confirmation (inference).

### Gaps
- No independent evaluation of Graphiti's invalidation accuracy found.
- No source on calibrated confidence for memory entries.

## 3. Forgetting, decay, consolidation, sleep-time

### Takeaway
Decay is mostly hand-set (Ebbinghaus/Weibull-style on time since last successful use) and unvalidated at scale. Consolidation is best done off the critical path with a stronger model (Letta). Lossy repeated summarization causes drift, so keep raw data and re-derive.

### Cited Findings
- SSGM formalises decay as a Weibull function w = exp(-(dt/eta)^kappa), where dt is time since last successful use, and archives items below a freshness threshold. It also gives a proof sketch that unreconciled drift grows O(T*eps) while periodic reconciliation bounds it. Not empirically tested. — [arXiv 2603.11768](https://arxiv.org/html/2603.11768v1)
- MemoryBank applies Ebbinghaus-style decay where memories fade unless reinforced (hand-set dynamics). I could not retrieve the formula or evaluation. — [secondary summaries](https://agentic-ai.readthedocs.io/en/latest/AgentMemory/research-papers/)
- Letta sleep-time compute (arXiv 2504.13171): a sleep-time agent edits core and archival memory in the background, possibly with a stronger model, while the primary agent handles live conversation. Paper reports about 5x less test-time compute at equal accuracy and up to 13-18% accuracy gains on modified reasoning benchmarks; this is about pre-computing answers rather than memory quality per se. Details on forgetting in Letta not found. — [search summaries](https://summify.io/discover/sleep-time-compute-letta-ai-charles-packer-charlie-snell-kev-1UTo51), [Letta tutorial](https://learn.traeai.com/t/ai-engineering/phases/14-agent-engineering/08-memory-blocks-sleep-time-compute.html)
- A-Mem (NeurIPS 2025): new memories create structured notes (description, keywords, tags), link to related notes, and can trigger updates to older notes' attributes (memory evolution). Reported improvements over baselines across six models; specific numbers not retrieved. — [NeurIPS page](https://proceedings.neurips.cc/paper_files/paper/2025/hash/19909c36f51abc4856b4560aff3d36d6-Abstract-Conference.html)
- A 2026 paper on graph-based "selective forgetting" exists but I did not read it. — [arXiv 2608.28978](https://arxiv.org/pdf/2608.28978)

### Inferences
- A sensible laptop-scale design (inference): nightly batch job that dedups, merges near-duplicates into a canonical fact with pointers to sources, expires facts not retrieved or confirmed after a long window by lowering retrieval rank (archive, not delete), and regenerates summaries from raw episodes rather than from prior summaries.
- Forgetting is safest as demotion in retrieval ranking plus archiving; hard deletion should be reserved for user requests and privacy.

### Gaps
- No rigorous ablation of decay schemes on a long-horizon benchmark found.
- Letta's concrete consolidation prompts and forgetting policy not verified.

## 4. Learned memory managers (experimental research) and feasibility for one developer

### Takeaway
RL for memory operations works in papers with surprisingly little data (Memory-R1: 152 QA pairs), but the reward is downstream QA correctness and training used multiple H100s, so it is not realistic on a Ryzen 5 laptop. The realistic path is distilling an LLM extractor/gate into a small model with LoRA, or API fine-tuning, using labels derived from user feedback. All of this is experimental; nothing here is established best practice.

### Cited Findings
- Memory-R1 (ACL 2026): Memory Manager (ADD/UPDATE/DELETE/NOOP) plus Answer Agent trained with PPO/GRPO; reward is exact match of a frozen Answer Agent's answer after applying the operations, so no operation labels are needed. Trained on 152 QA pairs; base models LLaMA-3.1-8B and Qwen2.5 3B/7B/14B; mostly 4x H100 80GB (8 for 14B), VERL framework. Overall LoCoMo (LLaMA-3.1-8B) GRPO F1 45.02 vs Mem0 30.41, LLM-judge 62.74 vs 45.68 (the fetch's calculations from Table 1). Manager and answer agent trained separately for stability. Evaluated only on dialogue datasets (LoCoMo, MSC, LongMemEval). — [arXiv 2508.19828v5](https://arxiv.org/html/2508.19828v5), [ACL](https://aclanthology.org/2026.acl-long.583/)
- Mem-alpha (arXiv 2509.25911): RL trains agents to write to core, episodic and semantic memory via tools; reward from downstream QA over the full history, plus content and compression rewards. Trained on up to 30k-token sequences, generalizes to 400k+; about 50% smaller memory footprint than long-context baselines. Ablation: memory content reward is critical, compression reward is task-dependent. — [arXiv 2509.25911](https://arxiv.org/html/2509.25911v1), [HF](https://huggingface.co/papers/2509.25911)
- AgeMem (arXiv 2601.01885): one agent learns LTM tools (Add, Update, Delete) and STM tools (Retrieve, Summary, Filter) with three-stage training and step-wise GRPO (terminal reward broadcast to earlier steps). Qwen2.5-7B and Qwen3-4B; trained on HotpotQA only; average gain 4.82 points over best baseline (Mem0) for 7B, 8.57 over A-Mem for 4B; RL adds about 8.5 points over non-RL variant. Compute not reported. — [arXiv 2601.01885](https://arxiv.org/html/2601.01885v1)
- MemGen (ICLR 2026): RL-trained memory trigger decides when to invoke memory and a weaver generates latent-token memory; reports up to 38.22% over external-memory systems (ExpeL, AWM) on 8 benchmarks. It is latent/parametric-style, aimed at reasoning agents, not a user-fact store. — [ICLR 2026](https://proceedings.iclr.cc/paper_files/paper/2026/hash/26407588dfb08e48c459c074ab6adb7d-Abstract-Conference.html), [arXiv 2509.24704](https://arxiv.org/abs/2509.24704v2)
- Others seen only as search excerpts (unverified): Verifiable Memory with operation-level and trajectory-level verifier signals ([2608.03137](https://arxiv.org/pdf/2608.03137)); a learned write gate plus retrieval gate trained with cost-aware group-relative objective for multi-agent systems ([2609.00237](https://arxiv.org/html/2609.00237v1)); AutoMem ([2607.01224](https://arxiv.org/pdf/2607.01224)).
- MemLoRA (arXiv 2512.04763, under review NeurIPS 2026): distills per-operation LoRA adapters (extraction, update, generation) on top of Mem0 into small models (Qwen2.5-1.5B, Gemma2-2B; 0.5B and 3B in ablation) from teacher outputs (Gemma2-27B or GPT-OSS-120B) filtered/cleaned. Data are LoCoMo conversations, 70/10/20 split. Claims it beats 10x larger baselines and is comparable to 60x larger, and runs 15-35x faster. Caveats: test set is only two conversations, judge is another LLM, gains shrink as student size grows; example counts and hardware not seen. — [arXiv 2512.04763](https://arxiv.org/html/2512.04763v1), [NeurIPS listing](https://neurips.cc/virtual/2026/171277)
- A community 350M "memory extractor" (LFM2.5-350M) trained on 64K synthetic examples outputs JSON with confidence; no benchmark numbers, unvalidated. — [model page](https://featherless.ai/models/Jepoxy/LFM2.5-350M-Memory-Extractor)
- OpenAI fine-tuning price sources disagree (GPT-4.1 mini training quoted at $0.80/1M by third-party sites; one site lists $25/1M for full GPT-4.1). Could not verify on the official page; check before budgeting. — [taxheal](https://www.taxheal.com/?p=130298), [costbench](https://costbench.com/software/fine-tuning-apis/openai-fine-tuning/)

### Inferences
- Feasibility on Ryzen 5 6600H, 13 GB RAM, no strong GPU (inference, not sourced): RL (GRPO/PPO) of 3B-14B models is out of reach locally. Using a cloud GPU rental for a few hours for a 1.5-3B LoRA is plausible. Locally, the practical learned component is a small classifier (logistic regression / gradient-boosted trees on frozen sentence embeddings plus hand features) predicting "worth storing", and a cross-encoder or NLI model for contradiction/duplicate checks. Both train in seconds-minutes on CPU with a few thousand labels.
- Memory-R1's 152 examples suggests few labelled outcomes can suffice when the reward is outcome-based, but that was on a benchmark with clean QA ground truth and big GPUs; personal data lacks a clean QA reward, so a proxy reward is needed (e.g. was the retrieved memory used and not corrected).
- Distillation recipe supported by MemLoRA: use a strong LLM to label/extract, filter its outputs, train a small model on them. Student quality is capped by teacher quality, and a few thousand examples is in the range such work uses (MemLoRA's counts were not seen, so this is uncertain).
- API fine-tuning (OpenAI SFT) of a small model on a few thousand extraction/gate examples is cheap and feasible (a few million training tokens), but it is supervised imitation, not RL, and you depend on a hosted model; verify current prices.
- Labels from implicit feedback (inference): positive for store: "remember this", user confirmation, later retrieval that is used in a response the user accepts. Negative: "that's wrong", "I never said that", user edit/delete of a memory, memory retrieved but response corrected, memory never retrieved over a long window. Supersession: user states a new value for the same attribute. These are noisy; use them as weak labels and spot-check by hand.
- Rank of effort-to-value: (1) log everything, (2) strong-LLM gate with rules, (3) small classifier distilled from LLM gate plus feedback labels, (4) only then consider fine-tuned extractor; RL last or never.

### Gaps
- No paper found that trains a memory manager on a single user's real, noisy data; all results use LoCoMo/LongMemEval/HotpotQA-style benchmarks with clean answers.
- Hardware and example counts for MemLoRA not seen; CPU-only LoRA training times were not researched.
- Memory-R1 and similar papers' gains are against older vanilla Mem0 (the pre-April 2026 ADD/UPDATE/DELETE version), so improvement over the newer ADD-only design is unknown.

## 5. What to log now for later training

### Takeaway
No source gives a canonical logging spec; the list below is my design inference from what the training approaches above need (outcome reward, operation labels, provenance, teacher outputs). The key principle supported by SSGM is keeping an append-only ledger of raw observations.

### Cited Findings
- Outcome-based memory RL needs downstream task outcomes tied to memory states (Memory-R1 reward is answer correctness after applying operations; Mem-alpha reward is QA accuracy over full history). — [Memory-R1](https://arxiv.org/html/2508.19828v5), [Mem-alpha](https://arxiv.org/html/2509.25911v1)
- MemLoRA-style distillation needs teacher inputs and outputs that can be filtered. — [arXiv 2512.04763](https://arxiv.org/html/2512.04763v1)
- An append-only raw-observation ledger is the proposed correction source for drift. — [SSGM](https://arxiv.org/html/2603.11768v1)

### Inferences (proposed log schema)
- Raw episodes: full turns with timestamps, never mutated.
- Every extraction candidate (including rejected and NOOP ones): input span, candidate fact, extractor model/version/prompt hash, gate score(s), decision, reason, and the existing memories it was compared against. Rejected candidates are needed as negatives.
- Every memory operation: ADD/UPDATE/SUPERSEDE/ARCHIVE with before/after, actor (auto, user, nightly job), valid_from/valid_to, recorded_at.
- Every retrieval: query, candidate list with scores, what was injected into context, rank positions, and whether the response referenced it.
- Feedback events: explicit ("remember this", "forget that", "that's wrong", thumbs), implicit (user rephrases or corrects after a memory-conditioned answer, edits or deletes a memory, ignores or accepts a proactive suggestion), each linked to the memory ids and response id involved.
- Proactive suggestions: trigger, content, memory ids used, shown/accepted/dismissed/snoozed, latency to action.
- Context features for classifiers: conversation id, topic/tag, user-turn vs assistant-turn source, time since last mention, mention count.
- Periodic human-labelled audit sample (e.g. 50 stored and 50 rejected candidates a month) as a clean eval set, since implicit labels are noisy.

### Gaps
- No published logging schemas for personal-assistant memory training were found; this section is design reasoning, not sourced best practice.
