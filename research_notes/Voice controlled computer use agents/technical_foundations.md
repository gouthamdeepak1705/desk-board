# Technical foundations of computer-use agents and their reliability (as of 2026-10-26)

Method note: about 10 searches/fetches. Several model and leaderboard names below (for example "Claude Fable 5", "GPT-6 Astra") come only from aggregator and leaderboard pages that I could not cross-check against vendor primary pages. They are reported as the sources state them. Aggregators disagree with each other in places, and I flag this where it matters.

## 1. Basic loop, coordinates/scaling/DPI, action space, context growth

### Takeaway
The loop is screenshot, then model, then structured action (click/type/key/scroll...), then a new screenshot. The model works in the pixel space of the image you send it, so the harness must keep screenshot size within model limits and map coordinates back to real screen pixels. Each screenshot costs about 1-1.8k tokens, so context grows fast and history must be pruned.

### Cited Findings
- Anthropic's current computer-use toolset (`computer_toolset_20260801`, GA, required for Claude 5.5+ on the Claude API and Google Cloud) has 17 member tools. Per Anthropic's docs: screenshot, zoom, left/right/middle/double/triple click, left_click_drag, mouse_move, left_mouse_down/up, cursor_position, scroll, type, key (with repeat 1-100), hold_key, wait (up to 300 s). Earlier versions are `computer_20251124` (beta; Opus 4.5-4.7, Sonnet 4.6) and `computer_20250124`. Docs checked 2026-10-26. — [Anthropic computer use tool docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
- Coordinates are in the pixel space of the screenshots the harness returns, origin top-left. If you downscale, you must scale the model's coordinates back up before clicking. Zoom images do not change the coordinate space. — [Anthropic docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
- Image limits: Opus 4.7 and later (and all 20260801 toolset models) accept up to 2,576 px on the long edge and 4,784 visual tokens (~3.75 MP). Earlier models accept 1,568 px on the long edge and ~1.15 MP. Oversized images are rejected, not downscaled. Visual tokens = ceil(w/28) x ceil(h/28). — [Anthropic docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
- Recommended resolutions are 1024x768 or 1280x720 for desktop, and 1280x800 or 1366x768 for web. Avoid anything above 1920x1080. On macOS Retina, screenshots are 2x and coordinates must be halved or downscaled. Anthropic's example scale factor is min(1, 1568/long_edge, sqrt(1.15M/pixels)). This is the DPI/scaling trap: on Windows at 125-150% display scaling, the harness must reconcile logical and physical pixels itself. Anthropic's page only documents the Retina case, so the Windows case is my inference. — [Anthropic docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
- Zoom captures a region `[x0,y0,x1,y1]` at full resolution, for small text and dense UI. Claude still reports coordinates in full-screenshot space. It is on by default. One third-party MCP implementation crops from a fresh full-resolution capture rather than upscaling. — [Anthropic docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool); third-party, lower confidence: [search result summary of an MCP project](https://www.remoteopenclaw.com/mcp/sidebutton/plugin-computer-use)
- Cost and context: each screenshot is about 1,000-1,800 input tokens. Past 20 images in a request, a stricter 2,000 px per-side limit applies, so prune history to 20 or fewer images. Docs advise keeping the prefix stable for prompt caching and pruning in batches (for example keep the last 3, prune every 25 turns). The model can return several actions per turn, and batches halt at the first failure. — [Anthropic docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
- Anthropic says click precision varies by model: Sonnet 4.6 was more precise than Opus 4.6, and Opus 4.7 is roughly comparable to Sonnet 4.6 (vendor statement). — [Anthropic docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
- Vendor schemas differ: Anthropic emits actions like `left_click` with `coordinate: [x,y]`, while OpenAI's CUA uses a `type` field with separate x and y. — [search summary of an adapter](https://autocontrol.readthedocs.io/en/latest/Eng/doc/new_features/v151_features_doc.html), low confidence
- Security guidance from the vendor: use a dedicated VM or container, allowlist domains, keep a human in the loop for consequential actions, and expect prompt injection from page and screenshot content. Anthropic runs classifiers on tool-returned screenshots. — [Anthropic docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)

### Inferences
- A voice-controlled agent should capture at the model's preferred resolution, keep one scale factor (physical to model space), and apply it in both directions. Multi-monitor setups need a monitor-origin offset. Neither is covered in the vendor docs I read.
- At about 1-1.8k tokens per screenshot, a 100-step task is 100-180k tokens of images unless pruned. This matters for cost.

### Gaps
- I did not read the last ~19k characters of the Anthropic page (latency section). I did not retrieve OpenAI's or Google's equivalent official docs, so their action spaces and limits are not covered. Windows-specific DPI and multi-monitor guidance from vendors was not found.

## 2. Vision-only vs accessibility-tree vs hybrid

### Takeaway
Vision-only is the most general but slowest, most token-heavy, and prone to grounding errors on small or dense UI. Accessibility, UIA and DOM approaches are faster and more precise where they exist, but trees can be noisy, huge or stale, and are missing for canvas, games, remote desktops and many custom apps. Current tooling advice is to route per call, using structure first and vision as fallback.

### Cited Findings
- Screen2AX (arXiv, July 2025, so older than 12 months): OmniParser V2 reached 31.9% click success on ScreenSpot versus 6.9% for screenshots alone. On Screen2AX-Task, the built-in macOS accessibility representation scored 16.9%, OmniParser V2 28.0%, and the paper's method 33.7%. These are measurements by the paper authors on small models in a macOS setting. — [Screen2AX](https://arxiv.org/html/2507.16704v1) (via search summary; I did not open the paper)
- Qualitative tradeoffs: accessibility trees can be noisy, large and lag the real screen. Screenshots are general but costlier in tokens and prone to recognition errors. — [search summary citing 2026 papers incl. the blind-user study](https://arxiv.org/pdf/2609.00524)
- Hybrid designs: Terminator defaults to the UI tree and falls back to OCR, OmniParser or vision. LUMOS (2026 arXiv) uses structure where available and vision only when semantic APIs fail. — [t8r.tech comparison (vendor blog)](https://t8r.tech/alternative/compare/accessibility-tree-vs-screenshot-automation); [LUMOS](https://arxiv.org/pdf/2606.30697)
- A vendor blog claims the accessibility path is "~100x faster" than screenshot grounding. This is unverified marketing and I would not use it as a number. — [t8r.tech](https://t8r.tech/alternative/compare/accessibility-tree-vs-screenshot-automation)
- OSWorld-Human (June 2025, revised May 2026) measured how perception mode affects latency in Agent S2 (screenshot-only vs screenshot plus a11y tree), but I could not retrieve the numbers. — [OSWorld-Human](https://arxiv.org/abs/2506.16042)
- A 2026 smartphone study compares screentext (structured text) with screenshots as inputs. I only saw the title. — [arXiv 2604.17817](https://arxiv.org/pdf/2604.17817)

### Inferences
- For Windows, UIA is a good first layer for standard Win32, WPF, UWP and Office controls, and DOM or Playwright for browsers. Pixels are the fallback for Electron canvas content, remote desktops, games and apps with poor accessibility. This matches the sources' routing advice, but I found no head-to-head Windows UIA vs vision benchmark.

### Gaps
- No independent head-to-head latency or cost benchmark of UIA vs vision vs OmniParser on Windows. No primary OmniParser numbers beyond the Screen2AX secondary result. MSAA-specific evidence was not found.

## 3. Benchmarks and measured reliability

### Takeaway
On the short-task OSWorld-Verified benchmark, top agents now exceed the 72.4% human baseline (official board top ~90%, July 2026). On much longer, more realistic workflows (OSWorld 2.0) the best binary completion is under half, and run-to-run reliability is poor. Everyday short desktop tasks are mostly feasible. Long multi-app workflows, repeated reliability and unattended operation are not.

### Cited Findings
**OSWorld-Verified (369 tasks, 100-step limit, human 72.36%)**
- Official board as relayed by an aggregator (status around 2026-10-01 to 10-13): Intelligence-Indeed Agent 90.19% (2026-07-25), Claude Fable 5 85.96% (2026-08-01), Pointer Agent with Opus 4.7 83.64% (2026-05-21), Claude Opus 5 83.39%, Coasty CUA v1 82.81%. All exceed the human baseline. Task counts and the baseline are from OSWorld/XLANG. The ranked list is from the aggregator and I could not open the official board (the os-world.github.io redirect to osworld-v1.xlang.ai was not followed). — [Presenc AI](https://presenc.ai/research/osworld-computer-use-leaderboard-2026); matching top entry in [DecodeTheFuture](https://decodethefuture.org/en/ai-agent-benchmarks-2026/)
- Model-reported tables show Qwen3.8 Max at 86.1% (Alibaba self-report, August 2026), Claude Fable 5 and Mythos 5 at about 85%. Steel notes some harness settings are unstated. These are vendor-reported and not comparable with the official board. — [Steel leaderboard](https://leaderboard.steel.dev/leaderboards/osworld/), [BenchLM](https://benchlm.ai/benchmarks/osworld-verified)
- Benchmark saturation: Desktop-Delta Bench (July 2026) says frontier agents exceed 85% on OSWorld-Verified. — [arXiv 2607.26041](https://arxiv.org/pdf/2607.26041)
- Historical context (older than 12 months, and from a secondary article with no primary citation): Claude's first computer-use release scored 14.9% on OSWorld in October 2024. — [Harcourt Substack](https://marissaharcourt.substack.com/p/computer-using-agents-are-production)

**OSWorld 2.0 (released 2026-06-26; 108 long workflows across 31 self-hosted sites and pro apps; ~318 tool calls per task; 500-step limit; median human time ~1.6 h)**
- Official board v2.1 (updated 2026-09-17): Claude Opus 5 at max effort 77.67% partial, 44.33% binary. At low effort 18.81% binary. — [Presenc AI](https://presenc.ai/research/osworld-computer-use-leaderboard-2026)
- Vendor-reported (Anthropic, 2026-09-22): Claude Opus 5.5 81.8% partial / 48.7% binary, Claude Fable 5 80.7% partial. Anthropic's own run of Opus 5 gave 74.0% partial versus 77.67% on the official board. — [Presenc AI](https://presenc.ai/research/osworld-computer-use-leaderboard-2026)
- Release changes move scores: Opus 5 went from 31.43% binary (v2026.08.08) to 44.33% (v2.1) with no model change. GPT-5.6 Sol (max) scored 62.72% partial / 27.34% binary on the official board at v2026.08.08. The original paper reported Claude Opus 4.8 at 54.8% partial / 20.6% binary (v2026.06.24). — [Presenc AI](https://presenc.ai/research/osworld-computer-use-leaderboard-2026)
- Partial credit (checkpoints) is much higher than binary completion, so headline partial scores overstate end-to-end success.

**Other benchmarks (aggregator data; treat as unreconciled)**
- Windows Agent Arena (Microsoft, Sept 2024, so older than 12 months): 150+ Windows tasks, Navi agent 19.5% versus 74.5% unassisted human, parallelizable in Azure to a full run in ~20 min. A 2026 paper says the original lacked VM state reset between tasks and proposes WindowsAgentArena-V2 with 141 tasks over 11 apps. I found no current WAA top score. — [WAA arXiv](https://arxiv.org/abs/2409.08264); [Computer Agent Arena, ICLR 2026](https://proceedings.iclr.cc/paper_files/paper/2026/file/5f1d328711b162e1cf9896c7d6aaecdd-Paper-Conference.pdf) (via search summary)
- ScreenSpot-Pro (grounding on professional high-res UIs): GPT-6 Astra leads at 92.7%, with Opus 4.8 around 87.9% and GPT-5.4 85.4% per one board. Another board lists GPT-5.2 at 86.3%. These are provider self-reports. — [BenchLM](https://benchlm.ai/benchmarks/screenspot-pro)
- WebVoyager: sources conflict. One reports 99.19% (Om Labs, browser-control Fable 5), a field guide says high 90s, BenchLM shows Microsoft Fara1.5-27B leading at 89.3%. WebVoyager is widely considered saturated and has weaker verification. — [benchmarklist](https://benchmarklist.com/benchmarks/webvoyager/), [serp.fast](https://serp.fast/guides/ai-web-agent-benchmarks), [BenchLM](https://benchlm.ai/benchmarks/webvoyager)
- WebArena: top listed 74.3% (WebTactix with DeepSeek V3.2) against a human reference of 78.24%. The field guide puts the stricter WebArena-Verified in the 60-70% range. — [Steel results index](https://leaderboard.steel.dev/results), [serp.fast](https://serp.fast/guides/ai-web-agent-benchmarks)
- BenchLM composite "computer use" ranking (2026-10-25, method not disclosed): Opus 4.8 85.2, Qwen3.8 Max 82.7, GPT-5.4 79.2. Do not rely on it. — [BenchLM](https://benchlm.ai/best/computer-use)

**Speed and steps**
- OSWorld-Human (June 2025, revised May 2026): the best of 16 agents take 2.7-4.3x more steps than the human-annotated trajectories. Each successive step can take up to 3x longer than early steps. Large planning, reflection and judge model calls dominate latency. End-to-end time can be tens of minutes for tasks a human does in minutes. Independent academic measurement. — [OSWorld-Human](https://arxiv.org/abs/2506.16042)
- Secondary article, no primary citations: 2-8 s per action cycle, a 20-step task takes 1-3 min versus ~30 s for a human, Microsoft pricing of ~$0.04 per step. Treat as anecdotal. — [Harcourt Substack](https://marissaharcourt.substack.com/p/computer-using-agents-are-production)
- OSWorld short tasks use ~30 tool calls on average, OSWorld 2.0 ~318. — [Presenc AI](https://presenc.ai/research/osworld-computer-use-leaderboard-2026)

**Repeat-run reliability**
- "On the Reliability of Computer Use Agents" (arXiv 2604.17849, April 2026) re-runs OSWorld tasks and finds that success depends on stochastic execution, task ambiguity and behavior variability, and recommends repeated-run evaluation. This is independent academic work. — [arXiv](https://arxiv.org/abs/2604.17849)
- A secondary article reports from an unnamed ACL-submitted paper that a strong agent succeeded 78% on a single attempt but only 36% across all ten attempts, and that simulated user feedback recovered up to 28 points. I could not verify the original. — [Harcourt Substack](https://marissaharcourt.substack.com/p/computer-using-agents-are-production)

### Inferences
- OSWorld-Verified above human level does not mean 90% reliable on your own desktop. Tasks are short, in a clean VM, scored by the benchmark's own checker, and often reported at best-of-run or high effort. OSWorld 2.0 binary scores of ~45% on long workflows, plus the ~36% all-ten-runs figure, suggest simple 1-10 step tasks are usually fine but long unattended workflows need verification and human checkpoints.
- Voice use implies interactive, short tasks, where per-step latency of seconds (and tens of seconds for large reasoning models) matters more than benchmark accuracy.

### Gaps
- I could not open the official OSWorld leaderboard, so all board rankings are via aggregators. Model names such as Fable, Mythos, Astra and Sol could not be checked against vendor pages. No independent per-step latency measurements for 2026 models were found. No current WAA top score was found. No measured effect of the speed of newer "fast" agent modes was found.

## 4. Failure modes

### Takeaway
Documented failures are: silent false completion, repeated-action loops, small-text and grounding errors, mid-load or dynamic UI, login and CAPTCHA barriers, environment noise, and long-horizon drift or lost constraints. Verification is the weakest link.

### Cited Findings
- ERPBench (2026): agents can save a form in most runs while writing the correct value in very few, which is a silent state error. — [arXiv 2609.17885](https://arxiv.org/html/2609.17885) (via search summary)
- Recurring failure categories in a 2026 reliability study: lost constraints, missed mid-task information, skipped verification, hidden-state recovery. — [search summary](https://arxiv.org/pdf/2604.17849), not directly confirmed in the abstract
- Secondary article ranks: (1) false completion, (2) repetitive looping (VLAA-GUI added a "Loop Breaker"; loops of ~50 steps cited), (3) OCR misreads on small, low-contrast, canvas, PDF and legacy text ("Subnit" for "Submit"), (4) acting on half-loaded pages, (5) authentication (CAPTCHA, 2FA). Rankings are the author's estimate. — [Harcourt Substack](https://marissaharcourt.substack.com/p/computer-using-agents-are-production)
- AgentHijack benchmark: nine kinds of ordinary desktop noise (pop-ups, resolution changes, focus stealing) caused substantial performance drops; no figures found. — via same article
- The WAA original lacked VM reset between tasks, so state leaks affected results. — [search summary of ICLR-adjacent paper](https://proceedings.iclr.cc/paper_files/paper/2026/file/5f1d328711b162e1cf9896c7d6aaecdd-Paper-Conference.pdf)
- Anthropic's docs warn about prompt injection via web pages and screenshots, and advise human confirmation for consequential actions and no credentials in the session. — [Anthropic docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
- Diagnostic benchmarks exist for attributing failures to planning, grounding or state tracking (CUADebug, ComponentBench). — [CUADebug](https://arxiv.org/pdf/2608.02643), [ComponentBench](https://arxiv.org/pdf/2608.18307)

### Inferences
- DPI and multi-monitor mis-clicks are a harness bug class (coordinate mapping) rather than a model limitation, and they were not quantified in any source I found.
- Most numbers on login walls, CAPTCHAs and loops come from a weak secondary source and should not be quoted as measurements.

### Gaps
- No quantified rates for DPI or multi-monitor errors, slow-UI timeouts or popup interruptions from primary sources. Login success figures (76%, Mariner 92.9%) are unattributed claims in a blog and are left out as findings.

## 5. Hybrid best practice: APIs, CLI, MCP and shortcuts first, vision as fallback

### Takeaway
Sources converge on routing: use structured interfaces (APIs, CLI, MCP, DOM, UIA, keyboard shortcuts) where available, and use pixels only when nothing structured exists. I found little rigorous measurement of the gains.

### Cited Findings
- Tools that default to the UI tree and fall back to OCR, OmniParser or vision, and the "router, not binary choice" framing. — [t8r.tech](https://t8r.tech/alternative/compare/accessibility-tree-vs-screenshot-automation), [LUMOS](https://arxiv.org/pdf/2606.30697)
- Anthropic's docs support batching multiple actions per turn and the `key` action with modifier combos (for example `ctrl+s`) to cut round trips and cost. — [Anthropic docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
- Secondary claim: agent-for-navigation plus API-for-extraction pipelines cut cost ~70% (unnamed teams, unverified). — [Harcourt Substack](https://marissaharcourt.substack.com/p/computer-using-agents-are-production)
- Because step count and per-step latency dominate time (OSWorld-Human), fewer model round trips is the main speed lever. — [OSWorld-Human](https://arxiv.org/abs/2506.16042)

### Inferences
- For a voice agent: intent maps to a tool call (MCP/API/CLI/app-specific shortcut) first, then UIA or DOM actions, then screenshot-based clicking, with a verification step (read back state or a screenshot) before telling the user it is done.
- Mitigate false completion with explicit post-condition checks, and require confirmation for destructive or financial actions.

### Gaps
- No controlled study measuring API-first vs vision-first speed or reliability on the same tasks. The 70% figure is unverified. MCP-specific desktop automation benchmarks were not found.
