# Data scope, privacy, security and poisoning risks for a single-user personal AI assistant (as of Oct 2026)

Method note: ~16 web searches (snippet-level; few full-page fetches). Many items are secondary coverage. Items I could not source are in Gaps. Several sources are vendor blogs, flagged inline.

## 1. Lessons from lifelogging and screen-recording products (Recall, Rewind/Limitless, Screenpipe, Humane, Rabbit, vendor memory)

### Takeaway
Raw "record everything" products were rejected or killed when they were centralized, plaintext, opt-out, or vendor-dependent. What survived or was accepted is opt-in, local, encrypted, user-controllable memory with scoping, and open-source/local tools whose data the user owns. Raw capture is feasible, but its cost (storage, secrets, third-party data, attack surface) argues for structured events plus derived facts, with raw capture limited and short-lived.

### Cited Findings
- Microsoft Recall was redesigned in 2024 after criticism that it stored screenshots and a large plaintext database of everything users did. The redesign made it opt-in, encrypted data with TPM-backed keys tied to Windows Hello, required user presence to access, added site filters, retention and disk limits, a tray icon and pause. — [Windows Central](https://www.windowscentral.com/software-apps/windows-11/microsoft-addresses-windows-recall-backlash-promises-to-fix-security-issues-and-make-it-opt-in?mid=1), [Computing](https://computing.co.uk/news/4319952/microsoft-overhauls-recall-makes-opt), [heise](https://heise.de/-9956532)
- In 2025 testing reported by The Register (via Windows Report), Recall's sensitive-data filter only caught content when obvious markers such as "password" or "pay" were on screen; it still captured credentials/card data in some cases. — [Windows Report](https://windowsreport.com/?p=1465724)
- Signal (DRM flag), Brave (v1.81, blocks Recall by default via SetInputScope IS_PRIVATE) and AdGuard blocked Recall from capturing their windows. Signal's DRM approach can break accessibility tools. This shows third-party apps and their users treat screen capture as hostile. — [TechSpot](https://www.techspot.com/news/108817-privacy-apps-signal-brave-adguard-push-back-against.html), [CyberInsider](https://cyberinsider.com/brave-browser-now-blocks-microsoft-recall-by-default/)
- Meta acquired Limitless (formerly Rewind) in Dec 2025. Pendant sales stopped; Rewind Mac app discontinued, with all screen and audio capture disabled from Dec 19, 2025; support continues for at least a year except in regions including the EU and UK; users can export or delete data. — [9to5Mac](https://9to5mac.com/2025/12/05/rewind-limitless-meta-acquisition/), [Neowin](https://www.neowin.net/news/meta-acquires-ai-startup-limitless-ending-sales-of-its-popular-pendant-wearable)
- Humane: HP bought most of Humane for $116M (Feb 2025); AI Pins stopped working Feb 28, 2025; Humane said customer data would be deleted from servers and urged users to download files. — [PetaPixel](https://petapixel.com/2025/02/19/humanes-ai-pin-is-dead-and-all-devices-will-stop-working-in-10-days), [Biometric Update](https://www.biometricupdate.com/202502/humane-is-bricking-ai-pins-following-116m-hp-buyout)
- Rabbit R1: the Rabbitude group reported hardcoded third-party API keys (ElevenLabs, Azure TTS, Yelp, Google Maps) that could expose users' stored responses. This is the group's claim as reported by press, not an independent audit. — [Neowin forum summary](https://www.neowin.net/forum/topic/1443145-rabbit-r1-has-a-huge-security-flaw-that-leaves-private-responses-accessible-to-everyone/)
- Screenpipe (open source, MIT) stores screen, audio, OCR text and transcripts in a local SQLite DB with nothing sent to servers. Storage estimates conflict: ~300 MB per 8h day (docs, event-driven capture), 5-10 GB/month (About page), ~20 GB/month (README), ~2 GB/day (marketing blog). Realistic range is roughly 5-20 GB/month. — [Screenpipe docs](https://mintlify.com/screenpipe/screenpipe/introduction), [About](https://screenpi.pe/about), [GitHub mirror](https://github.com/Colwilso/screenpipe), [blog](https://screenpi.pe/blog/ai-that-watches-your-screen-2026)
- Claude memory: off until enabled, user can view and edit the memory summary, each Project has separate memory (prevents cross-client leakage), and Incognito chats are excluded from history and memory. Anthropic says it tested memory on sensitive wellbeing topics. — [Anthropic](https://www.anthropic.com/news/memory), [VentureBeat](https://venturebeat.com/ai/anthropic-adds-memory-to-claude-team-and-enterprise-incognito-for-all), [TechRadar](https://www.techradar.com/ai-platforms-assistants/claude/you-have-to-pay-claude-to-remember-you-but-the-ai-will-forget-your-conversations-for-free)

### Inferences
- Vendor shutdown (Rewind/Limitless, Humane) is a data-longevity risk: a lifelog is only valuable if the user owns it locally and in open formats. Local-first, exportable storage addresses this.
- Content-based sensitivity filters are unreliable (Recall). Allowlist/denylist by app/window/site plus secret scanning on text is more dependable than relying on a filter to spot sensitivity on screen.
- Project-scoped memory (Claude) maps well to separating startup, client, finance, and health domains.
- Event-driven capture (Screenpipe's ~90% saving claim) plus text extraction suggests storing OCR/text and window metadata rather than video; raw pixels are the costliest and riskiest layer. This is my synthesis, not a finding from a source.

### Gaps
- No reliable sourced details found on Pieces, Personal.ai, or ChatGPT memory's user acceptance/rejection (search did not cover them). No user-survey data on what people accept versus reject.
- Recall's current (late 2026) state not verified; sources are 2024-2025.
- No hard retrieval-quality data comparing raw screen archives vs structured events.

## 2. Data categories: raw vs summarized vs not at all; retention

### Takeaway
No source gave a definitive per-category scheme; this is mostly design reasoning. Sourced support: deletion is hard once data is spread across derivatives, so decide scope and lineage at ingestion. Recommended default (inference): keep raw only for low-sensitivity, re-derivable event logs; store derived facts for sensitive domains; never store credentials.

### Cited Findings
- Practitioner guidance: tag every record with its subject/source ID at ingestion and propagate the tag to every derived artifact (chunks, embeddings, summaries), so deletion is a fan-out rather than an investigation. — [tianpan.co on GDPR/LLM memory](https://tianpan.co/blog/2026/04/20/gdpr-llm-memory-erasure-vector-database), [dataandmore](https://dataandmore.com/en/blog/delete-personal-data-from-rag-pipeline) (practitioner blogs)
- Anthropic standard API retention deletes inputs/outputs within 30 days; zero-data-retention (ZDR) is an arrangement where data is not stored at rest after the response (exceptions: law, misuse). — [Anthropic privacy center](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-data), [API data retention docs](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)

### Inferences (proposed scheme, unsourced design judgment)
- Store raw (append-only, local, encrypted, with retention): own commands/app-usage events, git/commit activity, calendar, task/commitment events, email metadata, own notes. Raw event logs allow re-derivation as extraction improves and are the natural dataset for later fine-tuning; keep a manifest of source IDs.
- Derived facts only (raw discarded after short window, e.g. days to weeks): screen OCR text, email body (keep summary + commitments + link/ID back to the mail), audio (transcript only), chat transcripts older than N days.
- Store at coarse granularity or only locally, excluded from cloud LLM calls by default: health/mood/sleep/food (daily aggregates), spending (categorized transactions, not account numbers), trading (executed trades/PnL, not broker credentials).
- Do not store: passwords, API keys, tokens, card/bank numbers, government IDs, private keys, 2FA codes; one-time secrets visible in screen text; third-party sensitive details not needed for a commitment (clients' health/financial data).
- Retention: tiered TTLs with promotion (raw screen text 7-30 days; email bodies 30-90 days; facts persist until contradicted or reviewed; trading/finance records follow tax-record needs, which depend on jurisdiction and I did not research).

### Gaps
- No sourced guidance on fine-tuning on personal logs and its privacy implications (memorization, unlearning from weights is hard per the machine-unlearning discussions, below).
- Jurisdiction-specific retention (tax records, trading records) not researched.

## 3. Sensitive data handling (health, finance, credentials, third-party data, encryption, LLM exposure)

### Takeaway
Treat embeddings and summaries as personal data, redact secrets before anything is stored or sent, keep sensitive domains local or behind ZDR, and prefer Recall-style at-rest protection (key tied to user authentication). Sourced coverage here is thin outside Recall and Anthropic retention docs.

### Cited Findings
- Recall's redesign tied encryption keys to the TPM and Windows Hello and decrypts just-in-time on authentication. — [Windows Central](https://www.windowscentral.com/software-apps/windows-11/microsoft-addresses-windows-recall-backlash-promises-to-fix-security-issues-and-make-it-opt-in?mid=1)
- Reported claims that embeddings can be inverted: ~40% of sensitive data recoverable from sentence-length embeddings, ~70% for shorter texts; so embeddings should be treated as personal data. Cited by a practitioner blog, original research not verified. — [tianpan.co](https://tianpan.co/blog/2026/04/20/gdpr-llm-memory-erasure-vector-database)
- Anthropic API: 30-day auto-deletion by default; ZDR available by agreement (typically enterprise arrangement; I did not confirm eligibility for individuals). — [Anthropic privacy center](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-data)
- Recall filter shortcomings (above) show secret detection on screen content is unreliable. — [Windows Report](https://windowsreport.com/?p=1465724)

### Inferences
- Run regex/entropy-based secret scanners (and an allow/deny list of apps such as password managers, banking tabs) before persisting any text, and again before sending context to an API.
- Use a local model for sensitive-domain summarization (health, finance), cloud models only on redacted, minimized context; log every outbound payload for audit.
- Third-party data (clients, email correspondents): store only what the user needs (name, role, commitment), not bulk copies; GDPR-style principles (purpose limitation, data minimization, storage limitation) still make good engineering defaults even though a purely personal use is largely outside GDPR (household exemption, which I did not source; if client data is processed for the startup, GDPR may apply to the business).
- Use full-disk or per-DB encryption with key in OS keystore/TPM; encrypt backups.

### Gaps
- No source reviewed for GDPR household exemption or special-category handling for health data; no sourced HIPAA/GDPR-specific guidance for personal tools.
- ZDR eligibility/terms for individuals and other providers (OpenAI, Google) not verified.
- No sourced tool comparison for secret redaction (e.g., gitleaks, Presidio).

## 4. User control: view, edit, delete, pin, explain recall, true deletion

### Takeaway
Industry baseline (Claude): memory is opt-in, viewable, editable, scoped per project, with an incognito mode. True deletion is harder than UI deletion because vector indexes tombstone rather than erase, and derived summaries/embeddings persist unless lineage is tracked.

### Cited Findings
- Claude memory: view/edit the summary, per-project separation, incognito excluded from memory. — [Anthropic](https://www.anthropic.com/news/memory)
- HNSW-based vector stores often flag deletion rather than remove vectors; deleted vectors may be recoverable from index files; FAISS has no native delete (rebuild or blocklist); heavy deletion ratios degrade quality until reindex. Legal sufficiency of tombstoning under GDPR Art. 17 is contested. — [tianpan.co](https://tianpan.co/blog/2026/04/20/gdpr-llm-memory-erasure-vector-database), [petronellatech](https://petronellatech.com/blog/?p=24226) (practitioner blogs)
- Removing influence from trained model weights (machine unlearning) is an unsettled, expensive area; the choice is framed as true deletion vs compliance theater. — [tianpan.co](https://tianpan.co/blog/2026/07/05/the-user-you-cannot-delete-right-to-be-forgotten-in-ai)

### Inferences
- "Forget this" design: every memory/embedding/summary carries source IDs; deleting a source cascades to all derived items; memories built from multiple sources are re-derived or deleted; physically remove vectors (compact/rebuild index, VACUUM SQLite, rotate backups) and keep a tombstone containing only a hash to prevent re-ingestion.
- Do not fine-tune on data that may need deletion unless the training set is versioned and retrainable; keep raw logs separable so a model can be retrained without the forgotten items.
- Each recall should show the source facts and timestamps ("why was this recalled"); allow pin, edit, expire, and "never remember" rules.

### Gaps
- No product documentation reviewed on ChatGPT's "why recalled" or pinning features; the UI patterns above are design recommendations, not sourced.

## 5. Security: memory poisoning and indirect prompt injection

### Takeaway
Poisoning of persistent agent memory is a demonstrated, high-success-rate attack class in research and has been shown against ChatGPT and Gemini memory. For an assistant that ingests email and web content, treat all memory writes derived from untrusted content as untrusted, never execute instructions from memory, and break the lethal trifecta (private data + untrusted content + outbound channel).

### Cited Findings
- MINJA: attacker poisons agent memory using only normal queries and outputs (no direct memory access); reported average injection success 98.2% across agents; published at NeurIPS 2025. — [arXiv 2503.03704](https://arxiv.org/html/2503.03704v5), [NeurIPS 2025](https://neurips.cc/virtual/2025/poster/118152)
- AgentPoison (NeurIPS 2024): backdoors agents by poisoning memory or RAG knowledge base; >80% average attack success with <0.1% poison rate and <1% benign performance impact; trigger resists perplexity and rephrasing defenses (per the authors). — [arXiv 2407.12784](https://arxiv.org/html/2407.12784v1), [NeurIPS](https://nips.cc/virtual/2024/poster/94715)
- ChatGPT memory: Rehberger's "SpAIware" planted instructions into long-term memory so conversation data was exfiltrated to an attacker server across sessions (macOS app; OpenAI partially fixed the exfiltration path). He also planted false memories via indirect injection from documents/web pages. OpenAI initially treated the report as model safety rather than security. — [TechSpot](https://www.techspot.com/news/104881-chatgpt-vulnerability-allows-hackers-record-sessions-indefinitely.html), [TechRadar](https://www.techradar.com/pro/hacker-creates-false-memories-in-chatgpt-to-steal-victim-data-but-it-might-not-be-as-bad-as-it-sounds) (secondary coverage; original Embrace The Red write-up not fetched)
- Gemini memory (Feb 2025): "delayed tool invocation" tricks Gemini into writing persistent false memories after summarizing an untrusted document; Google rated the risk low, noting users are notified of memory additions; the markdown-link exfiltration path was limited, but the underlying issue was not otherwise addressed. — [Embrace The Red](https://embracethered.com/blog/posts/2025/gemini-memory-persistence-prompt-injection), [Techzine](https://www.techzine.eu/news/security/128653/a-new-hack-corrupts-geminis-long-term-memory/)
- EchoLeak (CVE-2025-32711, CVSS 9.3, M365 Copilot): a crafted email, with no user interaction, caused private data to be pulled into context and exfiltrated; bypassed the XPIA classifier, link redaction, and CSP via a Teams proxy; fixed server-side May 2025; no known in-the-wild exploitation. — [The Hacker News](https://thehackernews.com/2025/06/zero-click-ai-vulnerability-exposes.html), [arXiv 2509.10540](https://arxiv.org/pdf/2509.10540v1)
- OWASP Top 10 for Agentic Applications (published Dec 2025) lists Memory & Context Poisoning as ASI06; suggested controls: treat persistent memory as an untrusted input surface, provenance tracking, write validation, behavioral monitoring. Numbering varies across secondary sources; verify against the official OWASP GenAI project page. — [Giskard summary](https://www.giskard.ai/knowledge/owasp-top-10-for-agentic-application-2026), [Vectorize ASI06](https://vectorize.io/articles/owasp-asi06), [WorkOS](https://workos.com/blog/ai-agent-memory-poisoning)
- Willison's lethal trifecta (Jun 2025): private data access + untrusted content + external communication = exfiltration risk; mitigation is removing a leg structurally, not filtering. — [Simon Willison](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/)
- An April 2026 arXiv survey (2604.16548) reportedly argues agents should trust only memories attributable to a verified source; I only saw this via a secondary page. — [lab write-up](https://vcn-33-total-recall.vercel.app/lab/memory-poison)

### Inferences (mitigations to adopt)
- Provenance on every memory: source type (user-typed, own device, email from known sender, web, third-party), source ID, timestamp, extractor/model version.
- Trust tiers: only user-authored or user-confirmed content can create "trusted" facts or preferences; facts from emails/web go to quarantine (shown as unconfirmed, excluded from decisions and never injected as instructions) until the user confirms.
- Memory is data, not instructions: render recalled items inside delimiters, labeled as untrusted data; no tool call or policy change may be triggered solely by memory content.
- The memory-write tool must not be callable in a turn that processed untrusted content without user confirmation (counters delayed tool invocation).
- Remove an exfiltration leg: no auto-rendered images/links, allowlist network egress, require confirmation for sending email or any outbound action involving private data.
- Allow-listed senders for email ingestion; log and diff memory changes; weekly review digest.

### Gaps
- Did not find 2026 real-world (non-research) incidents with Claude memory specifically; none confirmed.
- Did not verify effectiveness of provenance/quarantine defenses against MINJA/AgentPoison with empirical numbers.
- Official OWASP page not fetched directly.

## 6. Hallucinated memories and grounding

### Takeaway
Memory systems hallucinate (fabrication, errors, conflicts, omissions) and some discard source linkage when updating facts. Ground every stored fact in a retrievable source span and keep original wording.

### Cited Findings
- HaluMem (arXiv 2511.03506, updated Jan 2026) is an operation-level benchmark of hallucinations in agent memory (fabrication, errors, conflicts, omissions); authors are affiliated with MemTensor (makes MemOS), possible bias. — [arXiv](https://arxiv.org/html/2511.03506v3)
- One preprint (arXiv 2608.29606, "Agent Zero Memory"; unverified, and the ID looks odd) characterizes Mem0 as storing flat extracted facts that overwrite on update (losing original wording) and Zep as a bi-temporal graph keeping episode links. Treat with caution. — [arXiv](https://arxiv.org/pdf/2608.29606)
- A practitioner opinion piece argues Mem0/Zep-style stores lack expiry or re-verification, so stale facts are served confidently. — [DEV Community](https://dev.to/ac12644/your-ai-agent-is-confidently-lying-and-its-your-memory-systems-fault-4d82)
- Reported LongMemEval figures (Zep 63.8%, Mem0 49.0%) come from a vendor-adjacent blog and are unverified. — [memnode](https://memnode.pages.dev/articles/why-ai-memory-layers-recall-the-wrong-thing)

### Inferences
- Rules: a fact cannot be written without at least one source pointer (message/email ID + quote span); an extraction is verified against the span (entailment check or quote match) before commit; facts carry a confidence, a valid-from/valid-to (bi-temporal), and a last-verified date; conflicting facts are versioned, not overwritten; answers cite sources and say "not recorded" when nothing is found; low-confidence inferences (e.g., mood) are labeled as inferred and kept separate from stated facts.

### Gaps
- No verified primary evaluation of grounding techniques' effect on hallucination rates in personal-memory settings.
