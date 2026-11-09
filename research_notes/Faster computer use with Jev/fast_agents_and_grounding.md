# Fast and accurate computer-use / GUI agents (state as of 2026-10-26)

Scope note: about 20 tool calls. Many numbers come from search-result summaries or aggregators; those are flagged. Several questions (UI-TARS-2 official tables, ShowUI/OS-Atlas/UGround numbers, Windows-specific UIA vs vision measurements, laptop iGPU latency) could not be verified and are in Gaps.

## 1. Specialist GUI grounding / action models: accuracy, size, speed, laptop viability

### Takeaway
Specialist 3B-9B grounding models reach about 40-59% on ScreenSpot-Pro, while frontier generalist models now report 85%+ (aggregator figures, unverified). Small open models (Holo2-4B/8B, Fara1.5-4B/9B, GUI-Actor-3B/7B, UI-TARS-1.5-7B) are the only plausible local options. I found no measured latency for any of them on an AMD Ryzen 6600H iGPU.

### Cited Findings
- Fara1.5 (Microsoft) comes in 4B, 9B and 27B sizes, built on Qwen3.5 and SFT'd on about 2M FaraGen1.5 samples. Task success: 4B scores 80.8 WebVoyager and 57.3 Online-Mind2Web; 9B scores 86.6 and 63.4; 27B scores 89.3 and 72.3. Previous-generation Fara-7B scored 73.5 and 34.1. Averages over 3 runs; these are vendor numbers and web-only benchmarks, not desktop. The README lists vLLM self-hosting (at least 15k context, temperature 0) and Foundry hosting. It mentions no ONNX, quantized or Copilot+ PC path for Fara1.5; GGUF variants exist only for Fara-7B. — [Fara README](https://cdn.jsdelivr.net/gh/microsoft/fara@main/README.md)
- Fara-7B (the earlier model): a search summary quotes Microsoft's blog as saying it takes about 16 steps per task on average vs about 41 for UI-TARS-1.5-7B. The per-task cost of about $0.025 appears only in secondary sources (Codersera) and was not confirmed in the paper. The paper states that GPT-5 and o3 SoM agents cost more than 10x per task. WebVoyager results: Fara-7B 73.5, computer-use-preview 70.9, UI-TARS-1.5-7B 66.4. — [Microsoft blog](https://www.microsoft.com/en-us/research/blog/fara-7b-an-efficient-agentic-model-for-computer-use), [arXiv](https://arxiv.org/pdf/2511.19663), [Codersera](https://codersera.com/blog/fara-7b-installation-guide-2025-run-ai-agents-locally/amp/)
- Holo2-8B (H Company), a roughly 9B model (BF16) on Qwen3-VL-8B-Thinking: ScreenSpot-Pro 58.9, OSWorld-G 70.1, ScreenSpot-v2 93.2, Apache 2.0. Holo2-4B is also Apache 2.0. Holo2-30B-A3B is research-only. The model card also shows a separate "agentic" ScreenSpot-Pro score of 71.4, which is not comparable with the plain score. Vendor-reported. — [Holo2-8B HF](https://huggingface.co/Hcompany/Holo2-8B)
- A March 2026 BenchLM snapshot has Holo2-235B-A22B at 70.6 on ScreenSpot-Pro. An aggregator lists Holo1.5-72B at about 63.3. Aggregators, unverified. — [BenchLM via search](https://benchlm.ai/benchmarks/screenspot-pro), [LLM Reference](https://www.llmreference.com/benchmark/screenspot-pro)
- GUI-Actor (Microsoft, NeurIPS 2025) is coordinate-free: an action-token attention head over patch tokens, with an optional verifier. ScreenSpot-Pro without the verifier: 3B (Qwen2.5-VL) 42.2, 7B (Qwen2.5-VL) 44.6, 7B (Qwen2-VL) 40.7. It beats UI-TARS-72B (38.1). The action head is about 100M parameters, and training only the head on a frozen backbone is reported to be competitive. Older (2025) vendor numbers. — [GUI-Actor project](https://www.microsoft.com/en-us/research/project/gui-actor-coordinate-free-visual-grounding-for-gui-agents/)
- A February 2026 paper reports a specialist grounding model at 59.9 ScreenSpot-Pro, 66.0 OSWorld-G, 95.7 ScreenSpot-v2 and 49.9 UI-Vision (the model name was not confirmed). — [arXiv 2602.06391](https://arxiv.org/pdf/2602.06391)
- Frontier generalists, per aggregators only: a September 2026 snapshot lists Claude Opus 4.8 at 87.9, GPT-5.4 at 85.4 and Gemini 3.1 Pro at 84.4 on ScreenSpot-Pro. A March 2026 snapshot had Gemini 3 Pro at 72.7. Aggregator notes say scores depend on cropping, zoom and tool use, so they are not like-for-like. The original ScreenSpot-Pro paper had a best model at 18.9 on release. The official leaderboard (gui-agent.github.io/grounding-leaderboard) was not retrieved. — [BenchLM](https://benchlm.ai/benchmarks/screenspot-pro), [ScreenSpot-Pro paper](https://arxiv.org/html/2504.07981v1)
- OmniParser V2 (Microsoft): YOLOv8 icon detector plus Florence-2 captioner. Vendor claim: 0.6 s/frame on an A100 and 0.8 s on an RTX 4090, a 60% latency cut vs V1, and 39.6 average on ScreenSpot-Pro when paired with a model. Hosted Replicate on a T4 is "typically within 3 s" (a second listing says 6 s). No independent verification. It is a screen parser (boxes plus captions), not an action model, and is used by UFO2 as the visual fallback. — [Hugging Face card via search](https://huggingface.co/microsoft/OmniParser-v2.0/blob/refs%2Fpr%2F21/README.md), [Replicate](https://replicate.com/microsoft/omniparser-v2)
- UI-TARS: 1.5 scored 42.5% OSWorld at 100 steps (per the OSWorld-Human table). UI-TARS-2-2509 at 53.1% (100 steps) comes only from an aggregator and is unverified. No UI-TARS ScreenSpot-Pro number was found. — [OSWorld-Human](https://arxiv.org/html/2506.16042v1), [benchmarklist](https://benchmarklist.com/models/ui-tars-2-2509/)
- Local running: UI-TARS-1.5-7B has community GGUFs that work with llama.cpp's multimodal CLI and need a separate mmproj file. No tokens/s or screenshot-prefill figure was found for iGPU or Vulkan. A Debian Intel iGPU example showed a 2B Qwen going from 2.32 t/s (CPU) to 6.07 t/s (Vulkan), which is only a scale reference. — [Mungert GGUF](https://huggingface.co/Mungert/UI-TARS-1.5-7B-GGUF), [dev.to](https://dev.to/ozkanpakdil/accelerating-llms-on-debian-13-setting-up-vulkan-for-llamacpp-f10)

### Inferences
- A 7B VLM on a 6600H iGPU/CPU with a 1k+ token screenshot would likely take many seconds per call (screenshot prefill dominates), so it is probably not faster than a cloud API call. Treat this as a hypothesis to measure with llama-mtmd-cli, not a fact.
- The 4B models (Holo2-4B, Fara1.5-4B, GUI-Actor-3B) are the only sizes plausibly interactive locally. Their grounding accuracy sits well below frontier models on high-resolution screens.
- OmniParser's YOLO detector alone is small and could run on ONNX/DirectML, but the Florence-2 captioning is the slow part. This is inference only; no source confirms it.

### Gaps
- No verified ShowUI, OS-Atlas or UGround numbers (not searched or not returned).
- No ms-per-call for any specialist on consumer hardware. No ONNX/DirectML port was found for any of these models.
- UI-TARS-2 official tables and the official ScreenSpot-Pro/OSWorld-G leaderboards were not retrieved.

## 2. Planner/executor splits, action batching, speculative actions

### Takeaway
Batching several actions per model turn is now a first-class feature of both OpenAI and Anthropic tool APIs. The only quantified saving I found is UFO2's speculative multi-action (up to 51% fewer LLM calls, from a third-party page). OSWorld-Human independently recommends grouping actions.

### Cited Findings
- OpenAI computer tool: a `computer_call` returns an ordered `actions` array (click, double_click, drag, move, scroll, keypress, type, wait, screenshot). Run them in order, then capture the screen. The first call may be just a screenshot. The guide advises sending a screenshot after a short group of actions to verify. Continue with `computer_call_output` plus `previous_response_id`, which does not restore session state. The example uses `reasoning: {effort: "low"}`. There is also a code-execution harness option, recommended for the newest model, where the model writes scripts (PyAutoGUI or Playwright) and variables persist across calls. The guide contains no measured savings figure. — [OpenAI computer use guide](https://developers.openai.com/api/docs/guides/tools-computer-use)
- Anthropic: Claude can return several `tool_use` blocks per response, executed in order. Stop at the first failure and mark later ones "Not executed". Attach a screenshot to the last result of a batch, or prompt Claude to end batches with a screenshot. `disable_parallel_tool_use: true` forces one action per turn. The `key` action accepts `repeat` 1-100. — [Anthropic computer use docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
- UFO2 (Microsoft, Windows): HostAgent plus per-app AppAgents, a unified GUI+API action layer, and speculative multi-action planning (predict several actions in one LLM call, validate each against UIA before running). A third-party page reports up to 51% fewer LLM queries; the arXiv abstract gives no figure. — [arXiv 2504.14603](https://arxiv.org/abs/2504.14603), [summary](https://www.themoonlight.io/en/review/ufo2-the-desktop-agentos)
- OSWorld-Human recommends grouping consecutive actions that need only one screenshot, with the largest gains in document and spreadsheet apps. Human grouped vs single-action step counts: Calc 5.9 vs 13.6, Writer 6.1 vs 9.0, Impress 4.5 vs 8.5, Chrome 5.0 vs 6.8, OS 3.8 vs 4.9. — [OSWorld-Human](https://arxiv.org/html/2506.16042v1)
- No source found with measured planner-big/executor-small splits beyond Agent S2 style hierarchies; see Gaps.

### Inferences
- Since an LLM call costs seconds and local actions cost milliseconds, the saving from batching is roughly proportional to the cut in call count. Batch only when the next UI state is predictable (typing into a focused field, known menu keystrokes), and verify with one screenshot at the end.

### Gaps
- No measured end-to-end saving for OpenAI batched actions.
- No measured planner/executor latency comparison found.
- No source on skipping the screenshot after predictable actions beyond the batching guidance.

## 3. Structure instead of vision (UIA, DOM/CDP, shortcuts, APIs)

### Takeaway
Hybrid UIA plus vision is the design Microsoft's own Windows agent uses, but UIA is not free: OSWorld-Human measured 3-26 s per step to build an accessibility tree in the Linux setup. Keyboard shortcuts are explicitly recommended by Anthropic.

### Cited Findings
- UFO2 combines Windows UI Automation (precise control type and hierarchy, but misses custom controls) with OmniParser-v2 vision parsing, merging detections by bounding-box IoU. — [UFO2 summary](https://www.themoonlight.io/en/review/ufo2-the-desktop-agentos)
- OSWorld-Human: generating the a11y tree took 3-26 s per step and added thousands of prompt tokens. The authors warn against a11y trees in visually dense apps (LibreOffice) but say Set-of-Marks plus the a11y tree reduces steps in several apps. This is a Linux/OSWorld measurement; Windows UIA timing was not measured here. — [OSWorld-Human](https://arxiv.org/html/2506.16042v1)
- Anthropic's docs tell users to prompt Claude to use keyboard shortcuts for dropdowns and scrollbars; `key` supports combos such as `ctrl+s`. — [Anthropic docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
- OpenAI's code-execution harness (Playwright for browsers) lets the model skip pixel-level clicks for web UIs. — [OpenAI guide](https://developers.openai.com/api/docs/guides/tools-computer-use)

### Inferences
- For browsers, CDP/Playwright is the structural route and avoids screenshots entirely for reads; for Windows apps, UIA with a bounded subtree (active window only) avoids the multi-second whole-desktop tree cost. These are engineering inferences.

### Gaps
- No head-to-head measured speed/accuracy of UIA vs vision on Windows 11, and none for COM/Graph APIs or deep links.
- UFO2 success rates were not retrieved (full paper not read).

## 4. Caching, replay, skills, self-healing

### Takeaway
Compile a successful run into a verified state machine and replay it without model calls: PreAct reports 8.5-13x faster replays. Record/replay frameworks (Stagehand, Skyvern, muscle-mem) fall back to the model on a miss.

### Cited Findings
- PreAct (arXiv 2606.17929, June 2026): compiles the first successful trajectory into a state-machine program; replay checks that the screen matches the expected state before each step and hands back to the agent on mismatch. Replays run 8.5-13x faster with no per-step LLM calls. A program is stored only if an independent evaluator confirms it solves the task from a clean state (worth 1.75-2.6 tasks per benchmark). A fallback that explores from scratch matches a strong record-and-replay baseline. Single-author preprint; vendor of its own results. — [arXiv abstract](https://arxiv.org/abs/2606.17929)
- Stagehand caches and replays recorded browser actions without model calls and updates selectors when pages change. Skyvern runs cached code and regenerates it if a page change breaks it. muscle-mem replays on cache hit and hands off to the agent on miss. — [Stagehand docs](https://docs.stagehand.dev/best-practices/deterministic-agent), [Skyvern](https://docs-new.skyvern.com/docs/features/code-caching), [muscle-mem](https://pypi.org/project/muscle-mem/0.0.1/)
- MOBIMEM notes that task-level action caching fails to generalize across tasks sharing sub-procedures and cannot detect environment changes. dagcache documents stale-value replay failures. — [MOBIMEM](https://arxiv.org/pdf/2512.15784)

### Inferences
- The biggest wins for a personal desktop agent come from repeated tasks; parameterize the recorded program (the stale-value risk) and keep a verification check per step.

### Gaps
- PreAct's benchmark task list and per-benchmark success rates were not retrieved.

## 5. Screenshot efficiency, tokens, models by speed

### Takeaway
Keep screenshots at about 1280x720 to 1280x800 and in memory; Anthropic says each costs about 1,000-1,800 tokens. Use zoom or crops for small targets instead of sending full-resolution screens.

### Cited Findings
- Anthropic recommended resolutions: 1024x768 or 1280x720 for general desktop, 1280x800 or 1366x768 for web; avoid above 1920x1080. If accuracy is poor, try 1280x720. Newer models accept up to 2,576 px long edge and 4,784 visual tokens (about 3.75 MP); older models about 1.15 MP / 1,568 px. The API rejects oversized images rather than downscaling. Past 20 images each must be within 2,000 px per side. Prune old screenshots in batches (for example keep the last 3, prune every 25 turns) to avoid invalidating the prompt cache each turn. — [Anthropic docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
- Anthropic zoom action: `region: [x0,y0,x1,y1]` returns that region at full resolution scaled to the normal screenshot size; coordinates stay in full-screenshot space; enabled by default for the current computer toolset. Earlier tool version restricted zoom to Opus 4.5. — [Anthropic docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool), [LangChain ref](https://reference.langchain.com/javascript/interfaces/_langchain_anthropic.Computer20251124Options.html)
- OpenAI: return screenshots with `detail: "original"` to keep resolution; map coordinates back if you downscale; keep screenshots in memory; examples use 1440x900 and 1024x768. — [OpenAI guide](https://developers.openai.com/api/docs/guides/tools-computer-use)
- Anthropic effort guidance: lower effort for high-throughput work on the older tool version; the computer toolset lists a Haiku-tier model (claude-haiku-5-5) as supported. — [Anthropic docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
- OSWorld-Human latency split (Agent S2): planning 49-59% of time, reflection 15-45%, planning plus reflection 75-94%, grounding 3-6%, screenshot and action execution 1-4% each. — [OSWorld-Human](https://arxiv.org/html/2506.16042v1)

### Inferences
- Because screenshot capture and action execution are 1-4% of time, optimizing capture code gives little; reducing LLM call count, reasoning effort and context size is where the time goes.

### Gaps
- No per-model ms/step or time-to-first-token for fast/mini/nano tiers on computer-use tasks.
- Image-diff and streaming/early-action-execution techniques: no source found.
- Prompt-caching hit-rate effects beyond Anthropic's pruning note were not measured.

## 6. Verification, retries, accuracy

### Takeaway
Evidence is thin in what I retrieved. Both vendor APIs advise checking the screen after a short action group; PreAct shows verification matters for cached programs.

### Cited Findings
- OpenAI advises sending a fresh screenshot after a short group of actions so the model can check the result. — [OpenAI guide](https://developers.openai.com/api/docs/guides/tools-computer-use)
- Anthropic's batching protocol stops at the first failed action and returns an error for the remainder, which supports a retry-from-state pattern. — [Anthropic docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
- ScreenSpot-Pro: cropping/search methods raise scores (the paper's ScreenSeekeR reached 48.1 from 18.9 for the best baseline at the time). — [ScreenSpot-Pro paper](https://arxiv.org/html/2504.07981v1)
- GUI-Actor's verifier picks among candidate regions, a built-in confidence/verification step. — [GUI-Actor](https://www.microsoft.com/en-us/research/project/gui-actor-coordinate-free-visual-grounding-for-gui-agents/)
- Fara docs caution about hallucinations and instruction-following errors. — [Decoder summary](https://the-decoder.com/microsoft-unveils-fara-7b-a-compact-model-for-running-ai-driven-computer-control-locally/)

### Inferences
- A reflection call after every step is expensive (15-45% of time in Agent S2); verify cheaply via UIA state or pixel checks and escalate to a model only on mismatch.

### Gaps
- No measured multi-sample voting or reflection benefit/cost numbers found.

## 7. Fastest systems, efficiency findings, realistic expectations

### Takeaway
Agents are slow mainly because of step count and LLM thinking time: OSWorld-Human found tasks take tens of minutes vs seconds to minutes for humans. Top leaderboard scores are high but not speed-ranked.

### Cited Findings
- OSWorld-Human (UCSD, 16 agents): latency is tens of minutes for tasks humans do in minutes; later steps can take 3x longer than early steps. Step inefficiency is reported as 1.4-2.7x in the arXiv html body and 2.7-4.3x in the abstract/MLSys listing (versions conflict; unresolved). One Agent S2 task ran 50 steps for over 40 minutes; a line-spacing edit took 12 minutes vs under 30 seconds for a person. — [arXiv abs](https://arxiv.org/abs/2506.16042), [html](https://arxiv.org/html/2506.16042v1), [MLSys 2026 listing](https://mlsys.org/virtual/2026/oral/3865)
- Weighted efficiency (single-action WES+): UI-TARS-1.5 (100 steps) 23.7 at 42.5% success; Agent S2 with Gemini 2.5 28.2 at 41.4%; Agent S2 with Claude 3.7 20.0 at 34.5%. Old (2025) agents. — [OSWorld-Human](https://arxiv.org/html/2506.16042v1)
- OSWorld-Verified snapshots (aggregators, unverified): Oct 1 2026 claim of 90.19% for "Intelligence-Indeed Agent" (human baseline 72.36%); Aug 2026 BenchLM had Qwen3.8 Max 86.1%, Claude Mythos 5 and Claude Fable 5 at 85%. OSWorld 2.0 is a separate harder track with best about 44.33% (Claude Opus 5 at max effort). Self-reported and independently verified rows are mixed on the board. — [Presenc AI](https://presenc.ai/research/osworld-computer-use-leaderboard-2026), [BenchLM](https://www.benchlm.ai/benchmarks/osworld-verified), [Steel leaderboard](https://leaderboard.steel.dev/leaderboards/osworld/)
- OSWorld-Verified leaderboards report accuracy, not seconds per step; I found no efficiency-ranked leaderboard.

### Inferences
- A hobbyist stack should target: batched actions, cached workflows for repeat tasks, UIA/shortcuts first, a vision model only as fallback. A realistic per-step cost with a cloud frontier model is a few seconds (my estimate, not sourced), with tasks taking tens of seconds to minutes; fully local 7B on an iGPU is likely slower per step.

### Gaps
- No measured seconds-per-step for 2026 frontier computer-use models, and no OSWorld-Human results for them.
- Could not verify the 90.19% claim against the official OSWorld site.
