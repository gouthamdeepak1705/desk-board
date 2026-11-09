# Computer-use offerings from Anthropic, OpenAI and Google (as of 2026-10-26)

Note: only a limited number of fetches were made. Press/aggregator sources are flagged. Where a page was summarised by the fetch tool rather than read verbatim, exact strings (e.g. header names) are only quoted if they appeared in the output.

## Anthropic: API computer use tool, models, pricing, safety

### Takeaway
Anthropic's API tool is client-side: your code takes screenshots and executes actions. The current version is `computer_toolset_20260801` (GA, no beta header). Screenshots cost roughly 1,000-1,800 input tokens each, plus about 4,500 tokens of tool overhead per request.

### Cited Findings
- Current tool is `computer_toolset_20260801`: GA on Claude API and Claude Models on Google Cloud (Google managed); beta on Bedrock, Claude Platform on AWS and Microsoft Foundry; no beta header. — [Computer use tool docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) (fetched 2026-10-26)
- Toolset-supported models: claude-fable-5-1, claude-mythos-5-1, claude-fable-5, claude-mythos-5, claude-opus-5-5, claude-opus-5, claude-sonnet-5-5, claude-sonnet-5, claude-opus-4-8, claude-haiku-5-5. — same docs page
- Earlier versions: `computer_20251124` (beta header `computer-use-2025-11-24`) for Opus 4.7/4.6, Sonnet 4.6, Opus 4.5 (and the 5.x/Fable/Mythos models on some platforms); `computer_20250124` (header `computer-use-2025-01-24`) for Sonnet 4.5, Haiku 4.5, and others. Claude 5.5+ models on the Claude API and Google managed platform error on the two older versions. On Bedrock, Opus/Sonnet/Haiku 5.5 accept `computer_20251124`. — same docs page
- The toolset exposes 17 member tools: screenshot, zoom (region [x0,y0,x1,y1], full resolution scaled to usual screenshot dimensions), left/right/middle/double/triple click, left_click_drag, mouse_move, left_mouse_down/up, cursor_position, scroll, type, key (repeat 1-100), hold_key (up to 300 s), wait (up to 300 s). Zoom is on by default and can be disabled via `configs`. Batched tool_use blocks per turn are possible; every block must get a tool_result. — same docs page
- Screenshot sizing: toolset models accept up to 2,576 px on the long edge and 4,784 visual tokens (about 3.75 MP); earlier models 1,568 px long edge, about 1.15 MP. Recommended 1024x768 or 1280x720 for general use, 1280x800 or 1366x768 for web, avoid above 1920x1080. Oversized images are rejected, not downscaled. Over 20 images in a request limits each to 2,000 px per side. Developer must scale coordinates back. — same docs page
- Token cost: about 1,000-1,800 input tokens per screenshot; the toolset adds about 4,500 input tokens per request (about 410 less if zoom is disabled); earlier versions add 466-499 system-prompt tokens plus about 735 per tool definition. Advice: prune old screenshots in batches (keep last three, prune every 25 turns) to keep the cache stable. — same docs page
- Model prices (per MTok, input / cache hit / output): Fable 5.1 $10 / $0.25 / $50; Opus 5.5 $4 / $0.20 / $20; Opus 5 and 4.8 $5 / $0.50 / $25; Sonnet 5.5 $2 / $0.10 / $10; Sonnet 5 $2 / $0.20 / $10; Sonnet 4.6 $3 / $0.30 / $15; Haiku 5.5 $0.10 / $0.01 / $0.50 for prompts up to 100K tokens ($0.50 / $0.05 / $2.50 above); Haiku 4.5 $1 / $0.10 / $5. Mythos 5.1 is $10 / $50 but limited availability. Batch is half price. — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Computer use has no separate fee; it follows standard tool-use pricing, with screenshots billed as image input. — computer-use docs, Pricing section
- Reference implementation: `anthropics/anthropic-quickstarts` `computer-use-demo` (Docker, Linux Xvfb/Mutter/Tint2, Firefox and LibreOffice, `loop.py`, web UI). It is Linux-only, not Windows. — [quickstart](https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo)
- The docs also point to SDK computer-toolset helpers (partner drivers, SDK runs the loop and approval callback), and a separate "browser use tool" for webpage-only tasks. — computer-use docs "Next steps" and constraints
- Not available in Claude Managed Agents. — computer-use docs
- Data retention: computer use is client-side; screenshots, inputs and files are stored in your environment. Anthropic processes them in real time; retention follows API retention policy; ZDR eligible. — computer-use docs, Data retention
- Safety guidance: dedicated VM/container with minimal privileges, no sensitive data/credentials, domain allowlist, human confirmation for consequential actions, prompt-injection classifiers run on screenshots (opt-out via support), get user consent. — computer-use docs
- Known limitations (docs): latency too slow for human-speed interaction; coordinate/tool hallucination; scroll unreliability; spreadsheets need fine mouse control; limited account creation/social platforms; jailbreak and prompt injection exposure. — computer-use docs, Limitations
- Developer note: I found no Windows-specific section in the fetched docs; the loop runs wherever your code runs (the docs' macOS Retina scaling example shows scaling is your job). Rate limits were not retrieved (see Gaps).

### Inferences
- Rough cost per 30-step task on Sonnet 5.5 with prompt caching (my own estimate, not an official figure): about 4.5k tool overhead plus roughly 2k new tokens per turn, about $0.10 cache reads, $0.15 cache writes, $0.09 output, so about $0.30-0.40 per task. Haiku 5.5 would be roughly 20x cheaper at list price; Opus 5.5 roughly 2x. Without caching or pruning, cost rises sharply.
- From an Electron/Node app on Windows 11, you would call the Messages API with the toolset, capture screenshots yourself (e.g. Electron `desktopCapturer`), resize to at most about 1280x720, and execute clicks/keys with something like nut.js or Win32 SendInput. All execution is your code, locally.

### Gaps
- Per-plan API rate limits not retrieved.
- Whether the Node SDK's computer toolset helper has a Windows driver was not checked.

## Anthropic: Claude in Chrome, Cowork, desktop computer use

### Takeaway
Consumer products are Cowork (desktop, web, mobile, Chrome side panel) with computer use in beta/research preview for Pro and Max, and it works on Windows. Claude in Chrome side panel became a Cowork session on 2026-08-12.

### Cited Findings
- 2026-08-12: Claude in Chrome side panel is now Claude Cowork. Launched for Max and Team, Pro rolling out; Enterprise off by default (admin can enable and limit to approved domains); not on other Chromium browsers or mobile. Acts with the user's existing logins (click, type, navigate, fill forms). A separate check reviews consequential actions against the original request; it still asks before irreversible/costly actions such as purchases. — [Anthropic blog](https://claude.com/blog/cowork-chrome-side-panel)
- Cowork support page: desktop (macOS, Windows, Linux) beta on all paid plans; Chrome side panel on all paid plans; computer use (click, type, navigate screen) is beta for Pro and Max and requires the Desktop app open. From 2026-10-06 new Pro/Max Cowork tasks run in the cloud and "Only on your computer" was removed. — [Support: Use Claude Cowork](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile)
- Computer use in Cowork and Claude Code in Claude Desktop on macOS and Windows, beta, Pro and Max only (no Team/Enterprise). Order of preference: connectors, then built-in/Chrome browser, then screen interaction. Per-app permission prompts; investment/trading/crypto apps blocked by default; blocklist configurable; prompt-injection scanning. Quote: "Computer use has no sandbox between Claude and your applications." Computer must be awake and app open. Background-window behavior is documented for macOS 15+, not Windows. — [Support: Computer use safety](https://support.claude.com/en/articles/14128542-computer-use-safety)
- Windows arrived about a week after the Mac launch, with no setup. — [Thurrott](https://www.thurrott.com/a-i/anthropic/334498/anthropic-brings-claude-computer-use-to-windows) (press)
- Late August 2026: desktop app gained a built-in Chromium-based browser in Cowork. — [The New Stack](https://thenewstack.io/claude-built-in-browser-cowork/) (press, via search snippet, not fetched in full)
- One aggregator claims Chrome extension GA on all paid plans on 2026-08-26 with auto-approve of safe actions; this conflicts mildly with the Aug 12 Max/Team launch wording and the official Cowork page ("all paid plans"). — [ai-toolbox](https://www.ai-toolbox.co/claude-management-and-productivity/claude-for-chrome-setup-limits-2026) (low-quality aggregator)

### Inferences
- The consumer apps are not a developer API for controlling your own app; for a custom Electron app, the API tool is the relevant path.

### Gaps
- Claude Code's own computer use specifics beyond the desktop-app support page, and usage limits per plan, were not retrieved.

## OpenAI

### Takeaway
OpenAI's API loop is also client-executed (Responses API `computer` tool; you run the actions). The agent products have changed: Atlas was retired 2026-08-09, per secondary sources. Note that I could not verify Operator/CUA/ChatGPT agent status from official pages.

### Cited Findings
- Docs name `gpt-6.1-sol` (used in computer-tool examples) and `gpt-6-astra` (recommended for code execution). Computer tool: model returns a `computer_call` with an ordered action list; your app performs them and returns a `computer_screenshot` in `computer_call_output`, continuing with `previous_response_id`. Alternative pattern: code-execution function tool (`exec_py`/`exec_js`) run in your persistent browser/desktop. — [OpenAI computer use guide](https://developers.openai.com/api/docs/guides/tools-computer-use)
- Your application executes all actions; session state is yours. Safety checks can pause runs; recommended: restrict sites, treat screen content as untrusted, confirm consequential actions, bound runs. `store: false` does not remove every form of retention. Examples: 1440x900 or 1024x768 viewports, Playwright (Python 1.61.0, Node 1.61.1), Node 22.6+, Windows tips (`py -3`, `.venv\Scripts\python.exe`). Hosted environments listed: Browserbase (Stagehand), Browser Use, Daytona, E2B Desktop; OpenAI's own hosted browser is in a separate Agents API guide. Rate limits not stated. — same page
- Pricing (standard, short context up to 272K, per 1M tokens): gpt-6.1-sol $2.00 input / $0.10 cached / $10.00 output; gpt-6-astra $10.00 / $1.00 / $50.00. No computer tool or hosted browser fee listed; screenshots billed as image input at model rates. Container pricing (Hosted Shell/Code Interpreter) $0.03 (1 GB) to $1.92 (64 GB) per 20-minute session. — [OpenAI pricing](https://developers.openai.com/api/docs/pricing)
- Atlas (macOS only, launched 2025-10-21) deprecation announced 2026-07-09, stops working 2026-08-09; replaced by the ChatGPT desktop app (built-in browser; macOS and Windows, Linux preview; agentic browsing via "ChatGPT Work") and a browser extension for Chrome/Edge/Brave/Opera/Vivaldi. Windows Atlas never shipped. — [ai-toolbox](https://www.ai-toolbox.co/chatgpt-management-and-productivity/chatgpt-atlas-browser-guide-2026) (vendor aggregator, not verified against OpenAI; another search summary also says ChatGPT agent mode was superseded by ChatGPT Work)

### Inferences
- Gpt-6.1-sol at $2/$10 is priced identically to Claude Sonnet 5.5 at $2/$10 (cache $0.10 as well), so per-task API cost should be broadly similar, depending on screenshot token counts (not documented).
- Same Electron/Node pattern as Anthropic: your code captures the screen, calls Responses API, executes actions locally (or in Playwright / a hosted sandbox).

### Gaps
- Original CUA model / Operator status, ChatGPT agent plan limits, ChatGPT Work pricing/limits, and any official OpenAI announcement of the Atlas shutdown could not be verified (pricing page on openai.com returned 403; a domain-filtered search errored).
- API rate limits and per-screenshot token cost for OpenAI not found.

## Google

### Takeaway
Gemini API computer use is a Preview capability with client-side execution; it is charged as ordinary tokens. Consumer agents are Chrome auto browse and Gemini Spark. Project Mariner's current status is unknown.

### Cited Findings
- Computer use models: `gemini-4-argon`, `gemini-3.8-flash` (recommended), `gemini-3.5-flash-lite`, `gemini-3-flash-preview`. Environments: browser, mobile, desktop (OS-level cursor/keyboard). Coordinates normalised to a 0-999 grid; the client scales them (examples use 1440x900). Client executes everything (e.g. Playwright); responses may carry a `safety_decision` (allowed / `require_confirmation` / blocked) and you return `safety_acknowledgement`. Labeled Preview: "may contain errors and security vulnerabilities". — [Gemini computer use docs](https://ai.google.dev/gemini-api/docs/computer-use)
- Pricing (standard paid, per 1M tokens, now to a later date): gemini-3.8-flash $0.75 in / $3.75 out, rising to $1.50 / $7.50 from 2027-01-01; gemini-3.5-flash-lite $0.30 / $2.50; gemini-4-argon $2.00 / $10.00, rising to $4.00 / $20.00 from 2026-12-01; gemini-3-flash-preview $0.50 / $3.00. Computer use not on free tier; on paid tier "Charged as regular tokens per model pricing". — [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- Rate limits: tiers require billing (Tier 1: billing linked, $250 cap; Tier 2: $100 paid + 3 days, $2,000 cap; Tier 3: $1,000 + 30 days). Per-model RPM/TPM not published on the page (view in AI Studio). — [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- Consumer: Chrome auto browse launched 2026-01-28 on desktop for US AI Pro ($19.99/mo) and AI Ultra ($249.99/mo) on Windows, macOS, Chromebook Plus (aggregator figures); Android US rollout 2026-08-18; Gemini Spark gained desktop Chrome use on 2026-07-30 (opt-in, uses logged-in accounts). — [9to5Google](https://9to5google.com/2026/07/30/gemini-spark-chrome-auto-browse/), [9to5Google Android](https://9to5google.com/2026/08/18/gemini-chrome-android-us/) (press, from search snippets), prices from [aithinkerlab-type aggregators; unverified]

### Inferences
- Cheapest per task: gemini-3.5-flash-lite at $0.30/$2.50. Note Gemini prices rise 2026-12 / 2027-01 for some models, so budget accordingly.
- Windows 11 Electron app: same client-execution pattern; the Gemini docs' desktop environment makes OS-level control possible, but you write the executor.

### Gaps
- Project Mariner current status not found. Gemini screenshot token cost not retrieved. Data-use terms for paid vs free API not retrieved. Auto browse page from Google was not fetched directly.

## Production-readiness summary

### Takeaway
Anthropic's API tool is GA on the Claude API, but its consumer computer use is beta/research preview. OpenAI's API tool is supported but without a labelled maturity in the fetched docs. Google's is explicitly Preview.

### Cited Findings
- Anthropic: API toolset GA (Claude API); beta on Bedrock/AWS/Foundry; Cowork desktop beta; computer use beta Pro/Max. — sources above
- Google: Preview, close supervision recommended. — [Gemini docs](https://ai.google.dev/gemini-api/docs/computer-use)
- OpenAI: the `computer` tool "remains supported" while code execution is recommended for GPT-6 Astra; no beta label seen. — [OpenAI guide](https://developers.openai.com/api/docs/guides/tools-computer-use)

### Inferences
- For a voice-controlled Windows 11 agent, all three require your own local executor and screenshot loop; none of the consumer agents expose an API to drive your PC. All share prompt-injection risk, so keep confirmations and allowlists.

### Gaps
- No benchmark comparison (OSWorld etc.) was gathered.
