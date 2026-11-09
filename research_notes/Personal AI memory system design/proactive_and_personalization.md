# Proactive and adaptive assistant behaviour built on personal memory (as of Oct 2026)

Method note: about 16 searches and fetches. Several product claims come from secondary sources and are flagged. Meta Muse, Astra, Apple Intelligence, Rabbit and Microsoft Copilot proactivity were not verified from primary sources; see Gaps.

## 1. Routine and habit detection, preference learning, next-need prediction

### Takeaway
Classical routine mining (sequential patterns, co-occurrence rules, time-of-day segmentation) is old but still the right low-cost baseline. The 2026 benchmarks show that LLMs are mediocre at deciding *when* to help (about 64% zero-shot) and worse at *what* to offer (about 37%). Structured long-term memory (a knowledge graph) and real, non-synthetic user data give the largest measured gains. For "which suggestion to show when", the evidence base is the contextual-bandit / Thompson-sampling literature from mobile health.

### Cited Findings
- Sequential pattern mining on smartphone app logs: sessionise raw logs first, then mine patterns with a max time-gap constraint. A 2014 study did this on months of logs from several users. — [NCCU thesis](https://ah.lib.nccu.edu.tw/bitstream/140.119/84107/1/1-11.pdf)
- Plain sequential-pattern methods can fail on phone logs. A 2015 Korean paper's fix was to split logs into segments for different parts of the day. — [KoreaScience](https://koreascience.kr/article/JAKO201532073077905.pdf)
- MobileMiner (UbiComp 2014) mines frequent co-occurrences among context events on-device and offers a prediction engine for near-future context. Its data came from 106 users over 1-3 months. — [MobileMiner](https://www.winlab.rutgers.edu/~lendlice/paper/Srinivasan_MobileMiner_UbiComp14.pdf)
- A Brazilian dissertation on sequential-pattern activity forecasting reported accuracy up to 84.4%, and adding context data raised accuracy by up to 17.97% in its scenario. This is a single-scenario thesis result. — [UFAM](https://tedehomologacao.ufam.edu.br/items/309c4abc-0521-4c0a-9c41-19abcfddf1c7)
- ProAgentBench (arXiv Feb 2026) is built from 28,528 events over 500+ hours of real screen-activity sessions. It splits the task into "when to assist" (a binary timing call) and "how to assist". — [arXiv 2602.04482](https://arxiv.org/html/2602.04482v1)
  - Best zero-shot timing accuracy is 64.4% (DeepSeek-V3.2). Best intention accuracy is 37.1%.
  - Knowledge-graph memory is the biggest gain, raising timing accuracy from 0.537 to 0.601 and intention accuracy from 0.312 to 0.396. RAG memory gives a smaller gain.
  - A 5-minute history window balances context and cost.
  - Fine-tuning an 8B model on real data reached 74.0% vs 62.1% with synthetic data, with 741 instances per training set.
  - Real human interaction timing is bursty (B = 0.787), while LLM-synthesised data is not (B = 0.166).
- Agent "ProactiveBench" (Tsinghua, arXiv 2410.12361) has 6,790 events. A reward model trained on human accept/reject labels acts as an automatic judge of proactiveness. A fine-tuned model reached F1 66.47% on proactively offering assistance. — [arXiv](https://arxiv.org/abs/2410.12361)
- VitaBench 2.0 (arXiv May 2026) covers 56 users, over 2,000 curated preferences and 66 tools. It finds proactive tasks harder than standard personalization tasks, with preference-related failures the dominant bottleneck. This comes from a search summary, not a full read. — [arXiv 2605.27141](https://arxiv.org/abs/2605.27141)
- Contextual bandits with Thompson sampling are the standard approach for adaptive notification content and timing in mHealth. Thompson sampling is the most common choice in digital intervention trials, and its stochasticity allows post-hoc inference. — [arXiv 2511.08719](https://arxiv.org/html/2511.08719v1)
- A 2023 mHealth bandit paper lists four properties these algorithms need: time-varying outcomes, nonlinear state-outcome relationships, habituation to interventions, and similarity between participants. It concludes no existing method handles all four. Habituation matters because suggestion fatigue is real. — [arXiv 2311.14359](https://arxiv.org/pdf/2311.14359v2)
- Thompson sampling with zero-inflated count models improved engagement in the Drink Less trial. Relevant when most decision points yield zero interactions. — [arXiv 2311.14359](https://arxiv.org/html/2311.14359v2)

### Inferences
- A practical stack for one user is: (a) cheap time-segmented frequency and co-occurrence tables for routines; (b) an LLM only to phrase and rank candidates; (c) a Thompson-sampling bandit over a small action set (show / delay / stay silent, per category). Zero-inflated reward models fit well because most suggestions get no response.
- Because users are bursty and non-stationary, use sliding windows or discounting in the bandit. This follows from the habituation and time-varying findings above.
- Timing is the more tractable problem, so invest in a "should I speak now" gate before investing in content generation.
- Treat explicit signals (thumbs, dismissals, "don't suggest this") as higher-weight than implicit ones. I found no source that measures this weighting directly, so it is a design judgement.

### Gaps
- No 2025-2026 paper found on routine mining specifically for LLM-assistant memory. The mining literature found is 2014-2019 smartphone work.
- No head-to-head comparison found of bandit vs. LLM-judged suggestion scheduling for a single user.
- The prospective-memory benchmark (spontaneous recall is far harder than query-driven recall) appeared only in a survey summary; not verified.
- ETAPP (Hao et al., 2025), which tests whether tool agents apply user history proactively, was not read.

## 2. Proactive AI products and research 2025-2026

### Takeaway
Launched proactive products are conservative: asynchronous digests (Pulse, Google CC) rather than live interruptions. Independent evidence of user satisfaction is thin; most coverage is launch-day. Meta's Muse (Sept 2026) is the most autonomous consumer example, but its details come only from secondary sources. Research consistently finds that timing drives acceptance, and that proactivity helps efficiency but disrupts workflow unless presence and context are shown.

### Cited Findings
- ChatGPT Pulse launched as a preview for Pro users on mobile, with plans to extend to Plus and then everyone. Users give thumbs up/down and can review or delete feedback history. OpenAI concedes it may be outdated or off-target. — [OpenAI](https://openai.com/blog/introducing-chatgpt-pulse) (page could not be fetched directly, 403; details via [The Decoder](https://the-decoder.com/openais-new-pulse-feature-lets-chatgpt-start-the-conversation/) and [Fone Arena](https://www.fonearena.com/blog/465459/openai-chatgpt-pulse-features.html))
- OpenAI reported its student testers found Pulse more useful once they steered it with preferences and requests. This is an OpenAI-reported claim, not independent. — [Fone Arena](https://www.fonearena.com/blog/465459/openai-chatgpt-pulse-features.html)
- Some commentary says proactive notifications feel intrusive and that privacy concerns dominated discussion. This is a weak secondary source. — [Sentisight](https://www.sentisight.ai/?p=71114)
- Google Labs launched "CC" on 16 Dec 2025, an experimental Gemini agent. It emails a "Your Day Ahead" briefing built from Gmail, Calendar and Drive, with replies and preference teaching by email. It is US/Canada only, starting with AI Ultra and paid subscribers. Google says data is not used to train foundation models. — [Tom's Guide](https://www.tomsguide.com/ai/google-just-launched-a-new-ai-agent-that-runs-your-inbox-heres-what-cc-actually-does), [eWeek](https://www.eweek.com/news/google-launches-cc-ai-agent/)
- Meta "Muse" personal agent, introduced 8 Sept 2026 per secondary sources. It can message users unprompted (user can dial proactivity up, down or off) and can send emails, book travel, fill forms and make purchases. Sources disagree on model version (Spark 1.1 vs 1.3). Verify against Meta's own post. — [RZLT](https://www.rzlt.io/blog/meta-muse-marketing-guide-muse-spark), [Orca Router](https://www.orcarouter.ai/es/blog/meta-muse-agent-launch)
- Meta acquired Limitless (the Rewind/pendant maker) in early Dec 2025. It stopped selling the pendant, promised at least a year of support, and is winding down some services. Coverage notes always-listening wearables raise security and data-protection concerns. Humane's AI Pin was abandoned over performance problems. — [BetaNews](https://betanews.com/2025/12/08/meta-has-acquired-limitless-a-startup-that-produces-ai-powered-wearables/)
- Codellaborator (CHI-style study, N=18): proactive agents increase efficiency over prompt-only, but cause workflow disruption. Presence indicators and interaction context reduced the disruption. The authors argue proactivity should adapt to the programming process. — [arXiv 2502.18658](https://arxiv.org/abs/2502.18658)
- ProMemAssist (smart glasses, N=12): a working-memory model feeds a timing predictor that weighs benefit against interruption cost. It gave more selective help and higher engagement than an LLM-only baseline. A "32.7% timing accuracy gain" appears only on a secondary site. — [arXiv 2507.21378](https://arxiv.org/abs/2507.21378v1), [summary](https://aitopics.org/doc/arxivorg:EB807A55)
- CHI 2026 survey-help study (N=32, physiological sensing): support triggered when the user's state called for it improved response accuracy by 21% and cut false negatives from 50.9% to 22.9%, versus misaligned or random timing. Domain is online surveys, so transfer is limited. — [arXiv 2602.00880](https://arxiv.org/abs/2602.00880)
- A 2026 peer-support paper (Com-Peer, 18 users, two weeks) is reported to find timing explained 40% of variance in acceptance and the same suggestion was accepted about 3x more often at moments users saw as appropriate. This was seen only second-hand through a search summary. — [search summary of arXiv 2602.00880-related citations](https://arxiv.org/pdf/2602.00880)
- CUI 2022 voice-assistant study (15 participants): benefits of proactivity for urgent or critical issues, but concerns about interference with social activities, loss of agency and intrusiveness. — [UCL](https://discovery.ucl.ac.uk/10157949/1/Proactivity-Dilemma-CUI-2022-Accepted-Author-Version.pdf)
- Coding suggestions: GitHub telemetry on 934,533 users found about 30% of Copilot suggestions are accepted immediately, rising with use. A small self-run SitePoint test reported 38% for Copilot and 44% for Claude Code. Treat the latter as weak. — [ITPro](https://www.itpro.com/technology/artificial-intelligence/github-30-of-copilot-coding-suggestions-are-accepted), [SitePoint](https://www.sitepoint.com/github-copilot-vs-claude-code-accuracy-speed-2026/)
- Copilot next-edit suggestions can now propose follow-up edits anywhere in the active file, behind an opt-in setting (June 2026). — [GitHub changelog](https://github.blog/changelog/2026-07-14-github-copilot-in-visual-studio-june-update/)

### Inferences
- Digest-style, user-scheduled proactivity (Pulse, CC) is the lowest-risk pattern and the one with a real shipped precedent. Mid-task interruptions need much stronger context and timing models.
- Acceptance numbers are not comparable across domains. Around 30% for code completions is the only large-scale telemetry figure found; no published acceptance rate exists for digest-style cards.

### Gaps
- No primary-source evidence found for Apple Intelligence, Project Astra, Microsoft Copilot proactive features, or Rabbit's lessons. Searches returned nothing usable.
- No independent user study or satisfaction survey of Pulse or CC found.
- No measured acceptance rates for Pulse cards, CC briefings or Muse messages.

## 3. Design patterns to avoid wrong or creepy actions

### Takeaway
The best experimental evidence supports intermediate autonomy and risk-contingent hand-back of control. Presence and context cues cut disruption, and timing models that trade benefit against interruption cost beat naive triggers. Persistent-state governance (provenance, recoverability, audit) is an under-researched area but gives a usable checklist.

### Cited Findings
- A 450-participant, 3x3 between-subjects study (COLM 2026) found personalization that ignores privacy preferences raised privacy concern and lowered trust and willingness to use. Intermediate autonomy weakened that negative effect compared with none or full autonomy. An agent that returns control when it detects potential privacy leakage raised perceived control. — [arXiv 2510.04465](https://arxiv.org/abs/2510.04465), [COLM version](https://www.alphaxiv.org/abs/2510.04465.md)
  - Caveat: it studies agents acting on behalf of users, not proactive initiation specifically.
- Always-on agents survey (arXiv June 2026): treats agent state as persistent-state systems and scores each item on authority, scope, mutability, provenance, recoverability and actionability. Lifecycle: write, validate, organise, retrieve, act, update, forget, audit, roll back. Across 435 coded works, there is more research on accumulating and retrieving state than on governing, recovering or relinquishing it. It proposes the AOEP-v0 pilot protocol, which scores state mutation and recovery obligations. — [arXiv 2606.30306](https://arxiv.org/abs/2606.30306)
- Codellaborator: presence indicators and context shown with the proactive agent reduced disruption and improved awareness of AI processes; trade-offs remain for control, ownership and code understanding. — [arXiv 2502.18658](https://arxiv.org/abs/2502.18658)
- ProMemAssist models benefit versus interruption cost explicitly. — [arXiv 2507.21378](https://arxiv.org/abs/2507.21378v1)
- Muse reportedly lets users dial proactivity up, down or off, and Pulse offers feedback and history deletion. — see Section 2 sources.

### Inferences
These are design synthesis, not directly measured as a bundle.
- Autonomy ladder per category: suggest, then ask, then act-with-undo, then (rarely) act. Promote a category only after sustained acceptance, and never promote irreversible actions (sending email, trades, purchases, deletes). The 450-person study supports staying at intermediate autonomy; the always-on survey supports tagging actions by recoverability.
- Gate each proactive item on: confidence above a per-category threshold, expected value minus interruption cost above zero, outside quiet hours and focus blocks, and not recently dismissed (habituation).
- Show "why" with every item (the memory or evidence that triggered it). This addresses the creepiness driver of unexplained personalization; no source tested "why" labels directly, so it is untested here.
- Make dismissal one tap, with a reason ("not now", "never for this topic", "wrong"), and feed it to the bandit and to the memory store as a negative preference.
- Keep sensitive memory categories (health, finances, relationships) out of unsolicited messages by default; require opt-in per category.

### Gaps
- No controlled study found of "explain why" labels on acceptance or perceived creepiness.
- No standard quantitative definition of "creepy" was found.

## 4. Evaluating memory-driven personalization honestly

### Takeaway
Use offline replay of the user's own history with counterfactual estimators, but expect high variance for a single user. Use ProAgentBench-style timing and intention splits, and real (not synthetic) data. Confirm with an online A/B or interleaving on acceptance, and track regret and harm metrics. Judge on held-out time periods, not random splits.

### Cited Findings
- Inverse propensity scoring (IPS) is the baseline for off-policy evaluation from logged bandit feedback. It is inaccurate when the logging policy rarely picks some actions and degrades as the action set grows. — [arXiv 2305.03954](https://arxiv.org/html/2305.03954v2)
- Self-normalised IPS (SNIPS) is less sensitive to weight variation than IPS in a MIND news recommendation comparison. The venue metadata looked unusual, so treat with caution. — [EUDL](https://eudl.eu/pdf/10.4108/eai.22-5-2026.2365082)
- Surrogate/maximum-likelihood propensities (Xie et al., ICLR 2019) report lower MSE than IPS. — [MLAnthology](https://mlanthology.org/iclr/2019/xie2019iclr-offpolicy)
- Slate estimators (Swaminathan et al.) need far fewer logged samples than IPS for multi-item selection, under an additive-decomposition assumption. — [arXiv 1605.04812](https://arxiv.org/pdf/1605.04812.pdf)
- Real vs synthetic data matter: models trained on real interaction data beat synthetic-trained ones (74.0% vs 62.1%), and synthetic data fails to reproduce bursty human timing. So evaluation should replay real logs. — [ProAgentBench](https://arxiv.org/html/2602.04482v1)
- Human accept/reject labels can train a reward model to serve as a scalable judge of proactiveness. — [arXiv 2410.12361](https://arxiv.org/abs/2410.12361)
- Thompson-sampling trials preserve the ability to do statistical inference afterwards, supporting honest evaluation. — [arXiv 2511.08719](https://arxiv.org/html/2511.08719v1)
- The always-on survey argues evaluation should score state mutation and recovery, not only answer quality. — [arXiv 2606.30306](https://arxiv.org/abs/2606.30306)

### Inferences
- For a single user, logged data is small, so log propensities from day one (randomise some fraction of show/hold decisions) so that later counterfactual evaluation is possible. A deterministic policy cannot be evaluated off-policy.
- Suggested metrics (my synthesis): acceptance rate per category with confidence intervals; dismissal and "never" rate; time-to-act saved; regret versus an oracle that picks the best logged option; a "wrong action" count that should be zero for irreversible categories; interruption cost (suggestions shown during focus blocks).
- Evaluate on time-forward splits to avoid leaking future routine into the past; compare against trivial baselines (most-frequent-by-hour, no-memory LLM). ProAgentBench shows even strong LLMs sit near 64% on timing, so baselines are informative.
- Acceptance rate alone is gameable (show only obvious items). Pair it with coverage, and with a periodic user rating of usefulness.

### Gaps
- No standard benchmark for a single-user, long-horizon, proactive memory assistant. VitaBench 2.0 and ProAgentBench are the closest.
- No published guidance on minimum sample size for a one-user A/B; would need power calculation.

## 5. Proactive features for a founder/developer (coding, email, research, AI news, trading)

### Takeaway
Direct evidence is strongest for coding-context assistance (large-scale telemetry plus lab studies) and for digest-style briefings (shipped products, but no measured outcomes). Evidence for proactive email actions, news curation and trading is thin. These recommendations are therefore mostly inference.

### Cited Findings
- Coding: Copilot suggestions are accepted about 30% of the time at large scale. Proactive coding agents improve efficiency but disrupt workflow unless they show presence and context. — [ITPro](https://www.itpro.com/technology/artificial-intelligence/github-30-of-copilot-coding-suggestions-are-accepted), [arXiv 2502.18658](https://arxiv.org/abs/2502.18658)
- Daily briefing (calendar, email, tasks, flagged bills/appointments) is the headline feature of Google CC. Pulse is similar in news/interest curation. Neither has published outcome data. — [Tom's Guide](https://www.tomsguide.com/ai/google-just-launched-a-new-ai-agent-that-runs-your-inbox-heres-what-cc-actually-does)
- Copilot code review reportedly passed 60 million reviews (secondary write-up of a GitHub post; not verified). — [hotnews mirror](https://hotnews-sitemirror-store.pages.dev/60-million-copilot-code-reviews-and-counting/)
- Preference steering helped: Pulse testers found it more useful once they guided it. — [Fone Arena](https://www.fonearena.com/blog/465459/openai-chatgpt-pulse-features.html)

### Inferences
Ranked by evidence and risk (my judgement):
1. Morning/evening digest on a schedule the user sets: today's calendar, open PRs and tasks, email needing a reply, watched AI-news topics. Highest evidence (shipped precedents), lowest interruption cost.
2. Coding: pause-point help only (after test failure, at commit, on returning to a repo), with resume-context ("where you left off") drawn from memory. Evidence says timing at natural pauses matters.
3. Email: triage and draft replies for review; never auto-send. Drafts are reversible, sends are not.
4. AI news and research: ranked reading list using explicit topic feedback and a bandit over topics. Low risk, quick feedback signal.
5. Trading: alerts that are user-defined and rule-based plus context from memory (positions, thesis notes). No auto-execution. I found no evidence supporting LLM-proactive trading actions; keep to the "suggest" rung with strict quiet hours.

### Gaps
- No studies found on proactive email assistants, AI-news curation, or trading assistants for developers/founders.
- No measured time saved for digest products.

## 6. Memory-based user model structures used in practice

### Takeaway
Practice converges on typed memory: core profile facts, episodic events with timestamps, semantic knowledge, and procedural rules, with a temporal knowledge graph where facts change over time. Knowledge-graph memory also gave the best proactive-timing gain in ProAgentBench. Most descriptions found are vendor or blog material.

### Cited Findings
- The semantic / episodic / procedural taxonomy comes from cognitive science and was popularised in agent tooling by LangMem; sources are third-party blogs. — [Mem0 blog](https://mem0.ai/blog/semantic-vs-episodic-vs-procedural-memory-in-ai-agents-a-complete-comparison)
- Mem0 extracts facts (stated preferences are the baseline case) and stores episodic memories as dated events retrieved by similarity and recency. Zep/Graphiti uses a temporal knowledge graph with time as first-class. Letta (MemGPT) has tiered memory with core memory for user facts, recent conversation, archival storage, self-editing, and background "sleep-time" consolidation. — [Maidul Haque comparison](https://maidul-haque.vercel.app/blog/agent-memory-architectures-2026/), [Mem0](https://mem0.ai/library/agent-memory/semantic-vs-episodic-vs-procedural-memory)
- The always-on survey's per-item axes (authority, scope, mutability, provenance, recoverability, actionability) offer a schema for any memory record that can trigger action. — [arXiv 2606.30306](https://arxiv.org/abs/2606.30306)
- Knowledge-graph memory beat RAG for proactive timing and intention prediction. — [ProAgentBench](https://arxiv.org/html/2602.04482v1)

### Inferences
Suggested schema for this project (my synthesis, not from a single source):
- Profile: stable facts, with source and confidence.
- Preferences: explicit (user said) vs inferred (observed), each with evidence count, last-confirmed date, and scope (category / context).
- Routines: pattern, time-of-day / day-of-week condition, context conditions, support and confidence, last seen, decay.
- Goals / projects: active goals with status, linked tasks and entities.
- Relationships: people and organisations, with roles and interaction recency.
- Feedback ledger: every suggestion shown, context, action taken (accepted / dismissed / ignored / "never"), propensity. This feeds both the bandit and offline evaluation.
- Per-record metadata: provenance, sensitivity class, permitted action level, and undo / retention rules.

### Gaps
- No peer-reviewed comparison of user-profile schemas. Vendor claims about Mem0, Zep and Letta are unverified marketing and may be biased.
- LoCoMo is cited as the only common benchmark for episodic memory; none was found for procedural or routine memory.
