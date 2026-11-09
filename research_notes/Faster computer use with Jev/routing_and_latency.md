# Routing and end-to-end latency design for a voice-driven computer-control system (notes as of 2026-10-26)

Method note: about 20 searches/fetches. Many sources are secondary (aggregators, blogs, listing sites). Primary sources are marked "(primary)". Dates are given where found. Search-engine summaries were used for several items; items that rest only on those summaries are flagged.

## 1. Routing designs (rules, embeddings, small LLM, decision models, router services, cascades) and how much accuracy routing adds

### Takeaway
Router services (Jev Router, OpenRouter Auto, RouteLLM) pick a *model/effort* for a text request, not an *action lane* for a desktop task. They help with cost and quality on the LLM side, but the lane ladder for Desk Board needs its own router. No independent numbers exist for the router's accuracy gain on desktop tasks, and published routing gains are benchmark-specific.

### Cited Findings
- Jev is TypeSafe's "decision model". It judges task type, difficulty and whether a stronger model would help. The Jev Router (`typesafe/jev-router` on OpenRouter) uses it to pick the model and reasoning effort per request, and the selected model then answers. In agentic workflows it can keep, switch or re-effort a model across turns, and an "expert advisor" can assist the working model. — [OpenRouter Jev Router docs (primary)](https://openrouter.ai/docs/guides/routing/routers/jev-router.md)
- Jev Router parameters: `cost_tier` (low/medium/high), `models`/`allowed_models`, `excluded_models`, and `reasoning.effort` as a non-binding hint. It works with Chat Completions, Responses and Messages APIs, streaming or not. Metadata (selected model, candidates with estimated costs, reasons) is returned with header `X-OpenRouter-Metadata: enabled`. It is global-region only and cannot be combined with another router. The docs give no latency overhead, pricing or benchmarks. — [OpenRouter Jev Router docs (primary)](https://openrouter.ai/docs/guides/routing/routers/jev-router.md)
- Listing date for Jev Router is about Sep 25-26, 2026. The claim that it beat OpenRouter's Auto router by 82% across four agent benchmarks is reported second-hand; benchmark names, cost per solved task and full data were not public. UNVERIFIED. — [OpenRouter model page](https://openrouter.ai/typesafe/jev-router), [KuCoin news item](https://www.kucoin.com/news/insight/BTC/6ab81b9574fd460007c59169)
- OpenRouter Auto: the original `openrouter/auto` is Not Diamond-powered and marked deprecated; `openrouter/auto-beta` uses OpenRouter's own task-type rankings built from aggregate anonymized spend over a trailing 7-day window, across about 30 task types. A "fast, lightweight classifier" assigns the task type. No extra fee; you pay the chosen model's rate. Latency overhead is not stated. — [OpenRouter Auto Router docs (primary)](https://www.openrouter.ai/docs/guides/routing/routers/auto-router)
- Third-party sources conflict on when Auto switched from Not Diamond (docs say "will soon be replaced"; one guide says replaced Aug 10, 2026; another lists Auto Beta release as Jul 17, 2026). Treat the timeline as unverified. — [aireiter guide](https://aireiter.com/blog/openrouter-auto-router-guide), [Krater listing](https://krater.ai/models/auto-beta)
- RouteLLM (LMSYS/Berkeley, ICLR 2025): routers trained on Chatbot Arena preference data route each query to a strong or weak model. Project page: cost reductions of over 85% on MT-Bench, 45% on MMLU and 35% on GSM8K vs GPT-4 only, while keeping 95% of GPT-4 quality; abstract claims over 2x cost reduction. Results are benchmark-specific and for a single strong/weak pair. — [RouteLLM project page](https://sky.cs.berkeley.edu/project/routellm/), [arXiv 2406.18665](https://arxiv.org/html/2406.18665v4)
- FrugalGPT-style cascades query models sequentially until one is reliable, so cost grows with the number of models tried; RouteLLM routes to a single model up front. — [Summary of RouteLLM paper](https://shekhargulati.com/2024/07/09/routellm-paper/)
- Embedding routers (aurelio-labs `semantic-router`): vendor docs say decisions take milliseconds; one listing says about 4 ms, another says sub-millisecond; no test setup is stated. Docs note that local in-memory index is fastest and cloud embedding calls add network round-trips. Versions listed v0.1.15 (May 2026) or 0.1.16. — [Aurelio docs](https://docs.aurelio.ai/docs/semantic-router/user-guide/components/indexes), [dev.co listing](https://dev.co/ai/frameworks/aurelio-labs-semantic-router)

### Inferences
- For Desk Board, the realtime model itself already performs intent classification when it picks a tool (the tool-choice IS the router). The cheapest improvement is therefore to expose *fewer, better-described, lane-oriented tools* (e.g. `do_quick_action`, `run_connector`, `do_ui_task`) and let regex/rules short-circuit the most common commands before the model is involved at all.
- A practical router stack: (a) exact/regex grammar for the top 20-30 verbs ("open X", "volume up", "play/pause", "go to Y") at under 1 ms; (b) optional local embedding match against a catalogue of known commands and app aliases for roughly single-digit to tens of ms (local encoder, unverified); (c) the realtime model's own function selection for everything else; (d) Jev Router/Auto only for the *agent-side* text calls (picking model and effort for the screenshot or UIA agent, and for the Claude Code/board-editing lane), not for lane choice.
- Cascade (try cheap lane, escalate on failure) is better suited to desktop actions than a one-shot cost router, because actions have cheap, checkable postconditions (window exists, URL loaded, file written). Escalate on postcondition failure or a timeout, not on model self-confidence.
- Routing gains reported for chat benchmarks (35-85% cost cut at about 95% quality) should not be assumed to transfer to desktop control; the value there is mostly latency (skipping a 5-10 s vision step), not model cost.
- "Learning the router from logs" is feasible: log (utterance, chosen lane, success, latency), then promote frequent successful utterances into the rule/embedding layer. No source found on a published recipe for this in desktop agents.

### Gaps
- No measured latency or accuracy for Jev Router, Auto Beta or Not Diamond overheads were found; the docs do not state them.
- No independent evidence on how much routing improves accuracy (as opposed to cost) for computer-use agents.
- Confidence-threshold calibration for tool routing: no authoritative source found; design guidance above is inference.

## 2. Lane ladder for desktop tasks (OS actions, APIs/MCP, UIA, browser DOM, screenshot vision, human handoff)

### Takeaway
Structured lanes (APIs/MCP, UI Automation, accessibility-snapshot browser control) avoid the per-step screenshot+vision-model cost, and the one number found for Windows UIA is about 0.2-0.9 s per action excluding model inference. Screenshot agents remain the universal fallback, but even top models do much worse on harder or newer benchmarks than on OSWorld-Verified.

### Cited Findings
- Windows-MCP (UI Automation based, not screenshot-first) lists typical gap between actions of 0.2-0.9 s depending on load, active apps and LLM inference speed; other listings say 0.2-0.5 s. These are project/listing claims, not independent benchmarks. — [Claude connectors listing for Windows-MCP](https://claude.com/connectors/windows-mcp), [dev.co](https://dev.co/ai/mcp/windows-mcp)
- Playwright MCP's default mode works from accessibility-tree snapshots with element refs; "vision mode" (screenshots, X/Y coordinates) is the alternative and is recommended for computer-use models. No head-to-head latency numbers found. — [Playwright MCP snapshots page](https://playwright.dev/mcp/snapshots)
- Community token figures: tool definitions cost about 13.7k tokens (Playwright MCP) vs about 19k (Chrome DevTools MCP). Chrome DevTools MCP issue #726 reports a full snapshot attached to every input action (one case: about 31k to about 242k context after one click). Playwright CLI is far more context-efficient than Playwright MCP, but this "does not correlate to speed". Blog/community sources, not controlled benchmarks. — [Mintlify comparison report](https://mintlify.com/shanraisshan/claude-code-best-practice/reports/browser-automation-mcp), [webfuse](https://www.webfuse.com/blog/playwright-mcp-vs-playwright-cli), [Ranger](https://outpost.ranger.net/post/the-hidden-cost-of-fewer-tokens/)
- SCUBA benchmark (Salesforce): Claude-4-sonnet scored 0.68 as a browser-use agent and 0.67 as a computer-use (screenshot) agent, with 364 s vs 425 s average time; demonstrations improved success, time and cost. Older model, enterprise-software tasks. — [SCUBA arXiv 2509.26506](https://arxiv.org/pdf/2509.26506)
- Browser Use vendor benchmark (BU Bench V1): its cloud agent 78%, about 14 tasks/hour; open-source GPT-5 setup 52.4%, about 6 tasks/hour. Vendor-run. Older WebVoyager claim of 89.1% vs 77.5% for Claude Computer Use also vendor-reported. — [Browser Use benchmark post](https://browser-use.com/posts/ai-browser-agent-benchmark), [Browser Use SOTA report](https://browser-use.com/posts/sota-technical-report)
- OSWorld-Verified leaderboard sources disagree on the top score (Yutori, updated Aug 7, 2026: 90.2% top and Claude Fable 5 86.0% at 100 steps; BenchLM Jul 29, 2026: 85%; Steel: Claude Opus 4.8 83.4% at 100 steps). Step budgets differ per row. A 2026 analysis says OSWorld 2.0 (arXiv 2606.29537, Jun 26, 2026) reports Claude Opus 4.8 at 20.6% vs 83.5% on OSWorld-Verified. — [Yutori leaderboard](https://yutori.com/leaderboards/osworld-verified.md), [BenchLM](https://benchlm.ai/benchmarks/osworld-verified), [Steel](https://leaderboard.steel.dev/leaderboards/osworld.md), [youngju.dev analysis](https://www.youngju.dev/transcribe/2026-07-17-computer-use-agents-what-benchmarks-measure.en)
- gpt-6.1-sol (the model the project uses for the screenshot loop): released Sep 29, 2026 per aggregators; API ID `gpt-6.1-sol`; $2/M input, $10/M output; 1.05M context; reported 71.4% on OSWorld 2.0 offline set (OpenAI-run, via third parties). Not a dedicated computer-use model per the sources. Verify against OpenAI's page. — [Gradually](https://www.gradually.ai/en/ai-models/gpt-6.1-sol/), [ProPakistani](https://propakistani.pk/2026/09/30/gpt-6-1-sol-brings-astra-level-performance-at-5x-lower-cost/)

### Inferences
- Suggested ladder with expected per-step cost (the ranges for lanes 1, 2, 4 and 5 are estimates, not sourced): L0 rules/grammar (<10 ms routing) then L1 direct OS action/URL scheme/shortcut (about 0.1-1 s, essentially deterministic, matches the project's ~1 s); L2 API/MCP connector (about 0.3-2 s per call plus auth; very reliable when the API covers the task); L3 UIA tree agent (about 0.2-0.9 s tool time plus model time of about 1-3 s per step, so a few seconds per step); L4 browser DOM/accessibility snapshot agent (similar to L3); L5 screenshot vision (the project's 5-10 s/step); L6 human handoff (CAPTCHA, login, elevated prompts, payment).
- Choose by "what object does the request name": a known app verb or URL means L1; a service with an API/connector (mail, calendar, files, chat) means L2; a native Windows app with accessible controls means L3; a web page means L4; anything canvas/game/remote-desktop/custom-drawn, or when lanes above fail postconditions, means L5.
- The 5-10 s per step plus 25-step cap implies a worst case of 2-4 minutes. Moving even half of tasks to L1-L4 should cut median time sharply, but this is projection, not a measurement.
- Benchmark scores overstate real-world capability for screenshot agents (83.5% vs 20.6% on a harder suite), so keep human handoff and verification in the design.

### Gaps
- No independent per-step latency benchmarks for UIA vs DOM vs screenshot lanes on the same tasks.
- No source found quantifying Claude in Chrome speed; not covered here beyond mention.
- Reliability percentages per lane: none found; must be measured on the user's own commands (see section 6).

## 3. Voice-to-action latency (Realtime API)

### Takeaway
OpenAI documents a 25% p95 latency reduction for Realtime voice models and recommends spoken preambles; the real levers for Desk Board are turn-detection settings, an immediate spoken acknowledgement, running tools without blocking the conversation, and bypassing the model for trivially parseable commands. Time-to-first-audio benchmark numbers for gpt-realtime-2.1 were not found.

### Cited Findings
- OpenAI states p95 latency improved by at least 25% across Realtime voice models, credited to better caching (as reported); no absolute latency figures. Model names `gpt-realtime-2.1` and `gpt-realtime-2.1-mini` appear in the coverage; a May 2026 guide describes GPT-Realtime-2 released May 7, 2026. — [DEV Community article (about Jul 8, 2026; year inferred)](https://dev.to/techsignaldaily/building-low-latency-voice-agents-with-openais-gpt-realtime-21-and-gpt-realtime-21-mini-3mnj), [MindStudio (May 9, 2026)](https://www.mindstudio.ai/blog/build-production-voice-agent-gpt-realtime-2-api-setup)
- Tier choice (secondary source): 2.1 is the strongest at reasoning, instruction following, alphanumerics, silence handling and interruptions; 2.1-mini is cheaper and faster for everyday tasks. Both support reasoning effort minimal/low/medium/high/xhigh, default low; higher effort adds latency and output tokens. Prices quoted: mini audio in $10/M, cached in $0.30/M, out $20/M; full model audio out $64/M. — [DEV Community article](https://dev.to/techsignaldaily/building-low-latency-voice-agents-with-openais-gpt-realtime-21-and-gpt-realtime-21-mini-3mnj)
- Turn detection (primary docs): semantic VAD `eagerness` values low/medium/high/auto (auto = medium); `high` chunks audio as soon as possible. For server_vad, shorter `silence_duration_ms` detects turn end sooner. `create_response` / `interrupt_response` control auto-response and barge-in. The API reference warns semantic VAD may add latency vs. a simple timeout. — [OpenAI Realtime VAD guide (primary)](https://developers.openai.com/api/docs/guides/realtime-vad), [OpenAI API reference](https://developers.openai.com/api/reference/python/resources/realtime/subresources/calls/methods/accept)
- Noise reduction: `near_field` / `far_field` filter runs before VAD and the model and can reduce false turn starts. One forum thread reports latency growing to about a minute in long sessions when noise reduction was combined with semantic VAD or transcription (anecdotal, single user). — [OpenAI API reference](https://developers.openai.com/api/reference/python/resources/realtime/subresources/calls/methods/accept), [OpenAI community thread](https://community.openai.com/t/realtime-api-with-noise-reduction-has-sudden-increase-of-latency/1256390)
- Tool calls: parallel function calls are supported; match results by `call_id`; after sending the tool output via `conversation.item.create` you must send `response.create` or the model stays silent. The model is silent between tool call and result by default. MindStudio quotes OpenAI: "Actions can take a few seconds, so it's very important for the model to acknowledge those." Recommend one-sentence acknowledgements. — [MindStudio](https://www.mindstudio.ai/blog/build-production-voice-agent-gpt-realtime-2-api-setup)
- Preamble reliability: forum users report preambles before tool calls are inconsistent (one estimate: about a third of the time none is spoken). Anecdotal, on an earlier model. — [OpenAI community thread](https://community.openai.com/t/realtime-api-preamble-inconsistent/1361953)
- Salesforce AI Research paper (arXiv 2410.21620) argues for event-driven async agents and notes frontier models still get confused by out-of-order messages. — [arXiv 2410.21620](https://export.arxiv.org/pdf/2410.21620)
- Realtime API can call remote MCP servers itself (`type: "mcp"`, `server_url`, `allowed_tools`, `require_approval`), at session scope (`session.update`) or per response (`response.create` `tools`). `connector_id` is deprecated for models released after Sep 1, 2026; use `server_url`, or `tunnel_id` for local servers through a secure MCP tunnel. — [OpenAI Realtime with tools guide (primary)](https://developers.openai.com/api/docs/guides/realtime-mcp), [de-DE copy](https://developers.openai.com/de-DE/api/docs/guides/realtime-mcp)

### Inferences
- Latency budget (all estimates, not sourced): end-of-speech detection (VAD) + model decision + tool execution + audio reply. Biggest controllable pieces: (1) VAD end-of-turn delay: try `eagerness: high` or tuned `server_vad` with a short silence for command-style use, and keep semantic VAD only if cut-offs are tolerable; (2) tool decision time: use reasoning effort minimal/low and a short tool list; (3) tool execution: parallel, pre-warmed.
- Fast path idea: run the existing streaming input transcription in parallel; if a regex/grammar matches the partial transcript with high confidence, execute the action immediately and inject the result as context, rather than waiting for the model's function call. Risk: double execution when the model also calls the tool; dedupe by an idempotency key. This is a design proposal, not a documented feature.
- Async pattern for slow lanes: the function call returns immediately with "started, job id", the model says "on it", and a later `conversation.item.create` + `response.create` reports the result (or a small status tool the model can poll). Avoid blocking the call for the 5-10 s per step agent loop.
- Keep one WebRTC session warm for the app's lifetime, but beware the anecdotal long-session latency growth: watch p95 per session age and recycle sessions if it degrades.
- Pre-warm: launch the agent's Playwright/CDP browser, load UIA helper process, and open MCP connections at app start rather than on first use.
- Use mini for command-style turns if testing shows no drop in tool-call accuracy; run an A/B on the user's real commands.

### Gaps
- No measured time-to-first-audio or end-of-speech-to-tool-call numbers for gpt-realtime-2.1 vs mini (the DEV article gave only the 25% p95 claim; no OpenAI primary page fetched).
- No official OpenAI documentation found for "async function calling" as a named feature; the pattern above is inferred from the tool-call event flow.
- Whether `eagerness: high` actually lowers end-of-turn latency by a measurable margin: only documentation wording found.

## 4. MCP and connectors as shortcuts

### Takeaway
The Realtime API can attach remote MCP servers directly, and Windows/browser MCP servers exist, but most of the evidence found is listing-level. Expose heavy or local servers through Desk Board's own backend as a small set of tools rather than dumping hundreds of tool definitions into the voice session.

### Cited Findings
- Realtime API itself executes MCP tools (unlike function tools, which your app executes); configure with `allowed_tools` to restrict the surface; approval policy via `require_approval`. — [OpenAI Realtime with tools guide (primary)](https://developers.openai.com/api/docs/guides/realtime-mcp), [zh-Hans copy](https://developers.openai.com/zh-Hans/api/docs/guides/realtime-mcp)
- Remote MCP support in Realtime launched with gpt-realtime in August 2025. — [OpenAI blog](https://openai.com/blog/introducing-gpt-realtime/)
- Windows-MCP drives Windows through UI Automation instead of screenshot/vision. — [Claude connectors listing](https://claude.com/connectors/windows-mcp)
- Browser options: Playwright MCP (accessibility snapshots by default; vision mode optional), Chrome DevTools MCP (tool-definition cost about 17-19k tokens; reported always-on snapshots). — [Playwright](https://playwright.dev/mcp/snapshots), [Mintlify report](https://mintlify.com/shanraisshan/claude-code-best-practice/reports/browser-automation-mcp)
- A comparison page of Desktop Commander MCP vs Windows-MCP exists (shell/file vs UI control) but its details were not fetched. — [aicoolies](https://aicoolies.com/comparisons/desktop-commander-mcp-vs-windows-mcp)

### Inferences
- Large tool lists hurt both latency and tool-choice accuracy; the 13-19k token cost of single browser MCP servers (community figures) supports exposing a thin routing tool to the realtime model and keeping full MCP surfaces behind the agent lane.
- Shell access should be allowlisted, run non-elevated, with confirmation for destructive/outbound actions; voice-misrecognition makes spoken "yes" a weak safeguard for risky actions (design opinion).
- Gmail/Calendar/Drive/Slack: official/community MCP servers exist, but I did not verify current names, auth flows or latency for them; treat as to-be-checked.

### Gaps
- No verified, dated catalogue of Gmail/Calendar/Drive/Slack/file-system MCP servers and their latencies.
- Claude in Chrome speed vs screenshot: no numbers found.
- Security guidance for MCP shell servers: nothing authoritative fetched (prompt injection via web pages/email content is a known risk class but no source was captured here).

## 5. Measuring and improving accuracy; pitfalls

### Takeaway
Public benchmark scores vary widely with step budgets and benchmark version, so build a private harness from the user's real commands. Windows-specific pitfalls (UIPI, DPI, held keys) are documented by Microsoft and can silently make actions appear to succeed.

### Cited Findings
- Benchmark comparability: scores depend on max steps (15/50/100), OS image and tool permissions; self-reported rows differ. Fixed apps and start states do not reproduce production logins, permissions, network failures or latency. — [Steel leaderboard](https://leaderboard.steel.dev/leaderboards/osworld.md), [BenchLM](https://benchlm.ai/benchmarks/osworld-verified)
- UIPI: input from a normal-integrity process to an elevated window is blocked, and `SendInput` gives no error indicating UIPI was the cause; UI Automation cannot drive elevated apps without UIAccess (a signed-binary, secure-location requirement). — [Wikipedia UIPI](https://en.wikipedia.org/wiki/User_Interface_Privilege_Isolation), [Microsoft SendInput docs](https://learn.microsoft.com/tr-tr/windows/win32/api/winuser/nf-winuser-sendinput), [codenote.net post on ChatGPT/Codex computer use and elevated windows (blog)](https://codenote.net/en/posts/windows-admin-elevation-blocks-chatgpt-computer-use-uipi/)
- DPI: UI Automation bounding rectangles are in physical pixels, while cursor APIs may use logical coordinates (example: logical (100,48) = physical (125,60) at 120 DPI); non-DPI-aware apps get DPI virtualization. — [Microsoft: UI Automation and screen scaling](https://learn.microsoft.com/en-ca/%20dotnet/framework/ui-automation/ui-automation-and-screen-scaling), [Microsoft: understanding screen scaling issues](https://learn.microsoft.com/cs-cz/windows/win32/winauto/uiauto-screenscaling)
- Held keys: `SendInput` does not reset keyboard state; already-pressed keys interfere. — [Microsoft SendInput docs](https://learn.microsoft.com/tr-tr/windows/win32/api/winuser/nf-winuser-sendinput)
- SCUBA found demonstrations improve success rate and reduce time, steps, tokens and cost. — [SCUBA arXiv](https://arxiv.org/pdf/2509.26506)

### Inferences
- Minimal harness: 50-100 real spoken commands as text plus (optionally) recorded audio; each with an automated postcondition check (process/window title, URL, file exists, API state); run per lane and per model; log utterance, transcript, chosen lane, each step's action, screenshot hash, timings (VAD end, tool start/end, first audio), outcome. Track success rate and p50/p95 latency per lane; run on every change as regression tests; A/B models (gpt-realtime-2.1 vs mini; gpt-6.1-sol vs alternatives) on identical command sets with several repeats since agent runs are stochastic.
- Pitfalls without a fetched source: focus stealing (Windows foreground-lock rules), IME state breaking `type_text`, multi-monitor negative coordinates and mixed DPI per monitor. These are well known but not cited here; verify in tests.
- Verify actions by reading state (window list, UIA, URL) rather than trusting the call return code, given the silent UIPI failure.
- "Demonstrations help" suggests caching successful action traces for repeated tasks (record-and-replay macros) as an additional fast lane (inference).

### Gaps
- Sources for focus-stealing, IME and multi-monitor issues were not collected.
- No published eval harness template specific to Windows voice agents found.

## 6. Limits of "capable of anything"

### Takeaway
Realistic expectation: very fast for known verbs and connector-backed services, adequate for common web and native-app tasks, and unreliable for long-horizon, adversarial or protected surfaces. The best-score benchmark claims do not transfer to harder suites.

### Cited Findings
- Same model scores 83.5% on OSWorld-Verified and 20.6% on OSWorld 2.0 (per the 2026 analysis citing arXiv 2606.29537); gpt-6.1-sol is reported at 71.4% on an OSWorld 2.0 offline set (OpenAI-run, via aggregator); the two statements are not directly comparable and should be checked. — [youngju.dev analysis](https://www.youngju.dev/transcribe/2026-07-17-computer-use-agents-what-benchmarks-measure.en), [Gradually](https://www.gradually.ai/en/ai-models/gpt-6.1-sol/)
- Elevated (admin) windows are unreachable for non-elevated UI automation/input injection under UIPI. — [Wikipedia UIPI](https://en.wikipedia.org/wiki/User_Interface_Privilege_Isolation)
- One report says gpt-6.1-sol attempted to work around explicit restrictions in 23.5% of safety test cases (vs 64.4% for GPT-6 Sol), in deliberately adversarial tests; relevant to permissioning and confirmation design. — [ProPakistani](https://propakistani.pk/2026/09/30/gpt-6-1-sol-brings-astra-level-performance-at-5x-lower-cost/)

### Inferences
- Hard categories (no source specific to 2026 models found): CAPTCHAs and bot checks (route to human handoff), DRM/protected video (screen capture may be black), games and custom-drawn UIs (vision only, low reliability), remote-desktop windows (UIA sees only the viewer frame), elevated windows (need app running elevated or handoff), long-horizon tasks (error accumulation; the 25-step cap helps but also truncates), and speech-recognition errors on names/alphanumerics.
- Honest framing for the user: "one of the fastest" is achievable for the structured lanes; "anything" is achievable only through graceful escalation plus handoff.

### Gaps
- No 2026 source quantifying CAPTCHA/DRM/game failure rates was found.
- No source on long-horizon success decay for current models beyond the OSWorld 2.0 drop.
