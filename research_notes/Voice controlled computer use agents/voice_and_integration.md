# Voice-controlled computer use: existing systems and integration architecture (for Desk Board, Electron/Windows 11, OpenAI Realtime front end)

Research date: 2026-10-26. Many search results were secondary/aggregator sources; reliability is flagged per item. Documented facts are under "Cited Findings"; my own reasoning is under "Inferences".

## (a) Existing products/projects combining voice with computer control

### Takeaway
The dominant 2026 pattern is the one Desk Board is heading toward: a full-duplex/realtime voice model as conversational front end that delegates to slower agents (OpenAI shipped exactly this in ChatGPT Voice on desktop, 2026-07-23). Classic voice-control tools (Talon, Voice Access, Dragon) are deterministic command systems, not LLM agents. I found no mature open-source "voice + Windows computer use" project; the closest are voice layers wrapped around coding agents.

### Cited Findings
- ChatGPT Voice came to the macOS and Windows desktop apps on 2026-07-23 (global rollout); users control the computer by voice and direct multiple agents in ChatGPT Work or Codex; the model breaks a dictated multi-step command into steps, asks for confirmation when needed, and speaks only when it needs a decision. Runs on "GPT-Live", a full-duplex voice model (listens and speaks simultaneously, gives short acknowledgments). Paid plans only. On macOS an opt-in "Appshots" feature lets it read the foreground window/files. Stated caveat: misheard commands on autonomous actions are costly, need supervision. — [Pasquale Pillitteri summary](https://pasqualepillitteri.it/en/news/8825/chatgpt-voice-desktop-control-ai-agents) (secondary source; the dev.to copy returned 404; I did not find OpenAI's own post)
- Anthropic announced desktop computer use for Claude on 2026-03-23 (research preview, Pro/Max, macOS first, via Claude Code and Cowork); tasks are assigned by text, "Dispatch" spans phone and desktop. Claude's voice mode is a mobile conversational feature. I found no evidence of Claude voice driving desktop computer use as of Oct 2026. — [Kingy.ai](https://kingy.ai/news/claude-gets-computer-use-anthropics-ai-just-became-your-digital-coworker/) (low-medium reliability; page date header inconsistent)
- Duck Talk (open source): a "generic voice layer for any black-box agent", example Claude Code; works with Gemini Live or OpenAI Realtime; streaming TTS reads Claude's output sentence by sentence, first audio about 1 s; a partial transcript arriving while the agent is speaking counts as an interruption, "stop" interrupts; review mode shows transcript before it runs. Coding-focused, not GUI control. — [github.com/dhuynh95/duck_talk](https://github.com/dhuynh95/duck_talk)
- Qwen Audio Agent: realtime full-duplex voice runtime where longer jobs go to a background coding agent without ending the voice session, results flow back into the conversation. — [codekk mirror](https://p.codekk.com/detail/javascript/QwenAudio/qwen-audio-agent) (not verified for GUI control)
- OpenLive: open-source local voice layer for coding agents with barge-in and voice answers to permission prompts. — [themenonlab.blog](https://themenonlab.blog/blog/openlive-voice-ai-agents-local) (unverified status)
- openai-realtime-agents (OpenAI demo): voice front end that escalates complex decisions to a stronger model in the background (supervisor pattern). — [sourcepulse listing](https://www.sourcepulse.org/projects/1803030)
- Talon Voice: free, needs separate/bundled speech engine, optional eye/head tracking for mouse, mouth-pop noise for clicks; steep learning curve, user-definable Python commands. Review material mostly 2018-2021. — [Blake Watson](https://blakewatson.com/journal/speaking-in-code-hands-free-input-with-talon/), [IEEE Spectrum](https://spectrum.ieee.org/programming-by-voice-may-be-the-next-frontier-in-software-development)
- Wispr Flow: cloud dictation with hotkey, Windows tray app, command mode, Pro about $15/month, no offline mode (vendor/review sources). Windows Voice Typing (Win+H) built in, no AI cleanup. — [bossai.tech](https://bossai.tech/blog/wispr-flow-for-windows), [Voicy comparison](https://usevoicy.com/comparisons/wispr-flow-vs-windows-speech-recognition) (vendor-authored)

### Inferences
- Wispr Flow/Voice Access/Dragon/Talon are dictation or fixed-grammar command tools; they do not reason about intent. Desk Board's LLM front end plus agent is a different, more flexible category, but it inherits misrecognition risk, so a confirm-before-act step for destructive actions is warranted.
- A cheap way to cover "type this" is dictation-style typing (direct SendInput of text) rather than involving a vision agent.

### Gaps
- Copilot Voice/Vision/Actions and Windows Voice Access current (2026) capabilities: searches returned nothing usable.
- Gemini Live + Mariner/agent mode: no results on voice-driven computer control. Gemini 3.7 Flash computer use "preview" mentioned by one low-quality article only.
- OpenAI's primary post for GPT-Live/ChatGPT Voice desktop not located. Dragon status not found.
- No practitioner (HN/Reddit) reports found via this search tool.

## (b) Architecture: realtime voice front end plus slow computer-use agent

### Takeaway
Use an async "do_computer_task" tool: acknowledge immediately, run the agent loop in the Electron main process, push short progress and completion events back into the realtime session as conversation items, and expose cancel/status tools. The GA Realtime API explicitly lets the session continue while a function call is pending.

### Cited Findings
- Realtime function-calling flow: tools in session.update; model emits function_call item; read name/arguments/call_id from response.done; send conversation.item.create type function_call_output with same call_id; then send response.create to make the model speak. — [OpenAI realtime-conversations guide](https://developers.openai.com/api/docs/guides/realtime-conversations)
- Unlike the Responses API (which requires a function response immediately), the Realtime API lets the session continue while a function call is pending; downside: the model sometimes hallucinates the content of a function response that doesn't exist yet. Async function calling is supported on the GA realtime model, not beta. OpenAI says GA adds tuned placeholder responses so that, if asked, the model says it is still waiting; enabled automatically for new models. — [OpenAI Developer notes on the Realtime API](https://developers.openai.com/blog/realtime-api)
- Interruption: on WebRTC/SIP the server tracks the output audio buffer and truncates unplayed audio automatically when the user interrupts; on WebSocket the client must send conversation.item.truncate. Server emits input_audio_buffer.speech_started and cancels the in-progress response. The guide does not cover how interruption affects a pending tool call. — [OpenAI realtime-conversations guide](https://developers.openai.com/api/docs/guides/realtime-conversations)
- Community workaround when blocking is wanted: mute the mic from function-call arguments start until the result is submitted (client-side). — [OpenAI forum](https://community.openai.com/t/disabling-asynchronous-tool-calling-with-gpt-realtime/1360261)
- LiveKit-community recommended pattern: start asyncio background task, return an immediate acknowledgment, write result into chat context when done; caveats: result not auto-linked to original call, context must be updated for the LLM to speak, error handling is yours, repeated context updates may proliferate messages. — [LiveKit community](https://community.livekit.io/t/how-to-handle-long-running-async-tool-calls-with-openai-realtime-api/208)
- Responses-API (not Realtime) async tools: `async: true` on a tool definition, supported by "GPT-6 Astra and later"; app runs the job, returns output later on the original call_id; suggested task_handle registry plus an app-defined wait_for_tasks tool. The page does not mention Realtime. — [OpenAI async tool calling](https://developers.openai.com/api/docs/guides/async-tool-calling)
- Gemini Live equivalent: NON_BLOCKING function behavior with response scheduling INTERRUPT / WHEN_IDLE / SILENT; one article says Gemini 3.1 Flash Live is synchronous-only, 2.5 Flash Live supports non-blocking (verify). — [digitalapplied](https://www.digitalapplied.com/blog/when-a-tool-call-takes-ten-minutes), [Google docs](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api/asynchronous-function-calling)
- Portable fallback: "ticket then poll" (fast start result plus a status tool). — [digitalapplied](https://www.digitalapplied.com/blog/when-a-tool-call-takes-ten-minutes)
- Computer-use agent side: Anthropic's `computer_toolset_20260801` is GA (no beta header) on the Claude API for Claude Fable 5/5.1, Mythos, Opus 5/5.5, Sonnet 5/5.5, Opus 4.8, Haiku 5.5; older `computer_20251124` beta on Bedrock etc. Supports batching multiple actions per turn (stop at first failure, end batch with a screenshot to save a round trip) and a `zoom` action. Reference implementation is Linux/Docker; no Windows guidance. Security: prompt-injection risk, confirm consequential actions. — [Anthropic computer use docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
- Windows-MCP (CursorTouch): Python MCP server for UI Automation, file ops, app control, works with any LLM without fine-tuned vision models; README claims 0.2-0.5 s between actions (excluding LLM inference); needs Python 3.13+ and uv; v0.8.5 bounded snapshot/tree capture to avoid hangs. — [mcpservers.org listing](https://mcpservers.org/id/servers/CursorTouch/Windows-MCP), [releases](https://github.com/CursorTouch/Windows-MCP/releases)

### Inferences (proposed design)
1. Tools on the realtime model: `computer_task(goal)` returns instantly with `{task_id, status:"started"}`; `computer_status(task_id)`; `computer_cancel(task_id)`; optionally `computer_answer(task_id, text)` for agent questions.
2. In main process, run agent (Claude via API with computer toolset, or existing claude -p with a Windows MCP server) off the audio path. Emit throttled progress (every step or about 3 s, max one spoken update per ~5 s) as `conversation.item.create` system/user-role text items. Only call `response.create` for milestones (done, error, needs confirmation); for silent progress, add items without response.create so the model can answer "what are you doing?" accurately.
3. Final result: send function_call_output for the original call_id (if still pending) or a new text item, then response.create with brief instructions ("say one sentence").
4. Cancel: semantic VAD interruption only stops speech, not the agent; the model must call computer_cancel on "stop/cancel", and the main process should also kill the agent loop on a hard hotkey. Prompt the model to never claim completion before a result arrives (hallucinated-result risk is documented).
5. Fast path first (routing tiers): deterministic tools (launch app, open URL, keystrokes, window focus, clipboard type) called directly by the realtime model in under 1 s; UIA/MCP agent second; screenshot vision agent only as fallback. "Open Chrome and search for X" can be a single `open_url("https://www.google.com/search?q=...")` or Win+R/Start-Process, no vision agent needed.
6. Keep realtime context small: long tool outputs and screenshots must not go into the realtime session; summarize to a sentence.

### Gaps
- No documentation on how a pending tool call interacts with barge-in; test empirically on gpt-realtime-2.1.
- Whether `async: true` (Responses API) works in Realtime: not stated in docs I could read.

## (c) Latency budgets

### Takeaway
No reliable first-party per-step numbers found. Vision-loop steps are seconds each, so a 5-15 step task takes tens of seconds to minutes; direct tools and UIA are sub-second to a few seconds.

### Cited Findings
- Third-party blog estimate: 2-5 s per computer-use step (unbenchmarked). — [TokenMix](https://tokenmix.ai/blog/claude-computer-use-api-2026) (low reliability)
- ICML 2025 OSWorld-Gold: later steps in a long task can take about 3x longer than early steps (context growth). — [ICML](https://icml.cc/virtual/2025/49774)
- Contra Collective (2026-08-24): production workflows frequently 20-50 steps; at 98% per-step accuracy, 5/20/50-step success is about 90%/67%/36% (illustrative math). — [Contra Collective](https://contracollective.com/blog/computer-use-agents-production-reliability-cost-2026)
- One secondary article reports OpenAI OSWorld 2.0 results at roughly 40 minutes per task (vs about 75 min for another model); unverified. — [letsdatascience](https://letsdatascience.com/news/gpt-6-astra-automates-legacy-bank-screen-tasks-34f82ad5)
- Anthropic: add about 500 ms wait after actions for apps to update; batching actions cuts round trips; recommended screenshot size 1024x768 to 1280x720, avoid above 1920x1080; each screenshot about 1,000-1,800 input tokens; visual tokens = ceil(w/28) x ceil(h/28). — [Anthropic docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
- Duck Talk: first audio about 1 s via streaming TTS; relay overhead about 1 ms. — [duck_talk](https://github.com/dhuynh95/duck_talk)
- Windows-MCP: 0.2-0.5 s between actions (vendor claim). — see above

### Inferences (my estimates, not measured)
- Open app via Start-Process/URL: 0.3-1.5 s. Web search via URL: 1-3 s. Vision-loop open-and-search: 4-8 steps x 3-6 s = 15-45 s. Form fill: 8-20 steps = 30-120 s (UIA/DOM-aware tools much faster).
- Speed-ups: batched actions; keyboard shortcuts (Win key, Ctrl+L, Ctrl+T) instead of clicks; UIA tree/MCP before screenshots; downscale to 1280x720; Haiku 5.5 or other small model for simple steps, escalate to Sonnet 5.5 on failure; prompt caching with stable prefix; prune old screenshots in batches (docs advise keeping last ~3, prune every ~25 turns to preserve cache); speak acknowledgment instantly while agent starts.

### Gaps
- No measured per-step latency for Claude 5.x, OpenAI CUA, or Gemini computer use from primary sources. Measure on your machine.

## (d) Cost per task

### Takeaway
At Sonnet 5.5 prices a typical 10-step vision task is roughly a few cents to about 25 cents depending on caching; Haiku 5.5 is about 20x cheaper. The realtime voice session itself likely dominates cost for short tasks.

### Cited Findings
- Claude API prices per MTok (input / output / cache hit): Haiku 5.5 $0.10 / $0.50 / $0.01 (prompts up to 100k; $0.50/$2.50 above); Sonnet 5.5 $2 / $10 / $0.10 (docs footnote says 0.05x base, i.e. $0.10); Opus 5.5 $4 / $20 / $0.20; Fable 5.1 $10 / $50 / $0.25. Batch halves prices. Computer use billed at standard tool-use rates; screenshots about 1,000-1,800 tokens. — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing), [computer use docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
- OpenAI GPT-5.5 text pricing per a secondary guide: $5 in / $0.50 cached / $30 out per MTok. Screenshot token cost for OpenAI computer use not confirmed. — [puter pricing tutorial](https://developer.puter.com/tutorials/openai-api-pricing/) (low reliability)
- Realtime: gpt-realtime-2(.1) audio $32 in / $0.40 cached / $64 out per MTok; text $4 in / $24 out; mini audio $10 / $0.30 / $20. Planning estimate $0.06-$0.11 per minute with caching on flagship, $0.02-$0.05 mini, up to $0.46/min uncached long calls; function definitions and tool results re-sent each turn. gpt-realtime and gpt-realtime-mini shut down 2027-01-20. — [Forasoft, updated 2026-10-09](https://www.forasoft.com/blog/article/openai-realtime-api-pricing), [OpenAI pricing](https://openai.com/api/pricing/)
- No Gemini computer-use pricing found.

### Inferences (my arithmetic)
- 10-step task, about 3k fixed tokens plus about 1.5k added per step: roughly 110k cumulative input tokens uncached plus about 1.5k output. Sonnet 5.5 about $0.24 uncached, perhaps $0.03-0.08 with caching. Haiku 5.5 about $0.012 uncached. Opus 5.5 about double Sonnet. 30-step task roughly 8x input (quadratic growth) so prune screenshots.
- UIA text-only agent steps are far cheaper (no image tokens).

### Gaps
- OpenAI CUA and Gemini screenshot token counts and per-task cost: not found from primary sources.

## (e) Electron / Windows specifics

### Takeaway
Input injection works from the main process but is constrained by UIPI, foreground-lock rules and DPI mismatches. The wallpaper-layer (Progman child) board is a special case: it is not a normal activatable top-level window.

### Cited Findings
- SendInput is subject to UIPI: can only inject into apps at equal or lower integrity; failures return 0 with no distinguishing error (so an elevated target such as an admin app or Task Manager silently ignores Desk Board). Injected events are serialized and not interleaved with other input; held keys can interfere, check GetAsyncKeyState. — [Microsoft SendInput docs](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput)
- SetForegroundWindow succeeds only if e.g. the process received the last input event, is/was started by the foreground process, the foreground lock timeout expired, or no foreground window exists; otherwise the taskbar button flashes. AllowSetForegroundWindow can delegate. — [Microsoft SetForegroundWindow docs](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow)
- Wallpaper layer technique: send undocumented message 0x052C to Progman to spawn a WorkerW, then SetParent; choose the WorkerW that is not the one containing SHELLDLL_DefView; reported working on Windows 11 24H2 in a forum post. — [Processing forum](https://discourse.processing.org/t/windows-11-moving-wallpaper/47235), [AutoHotkey forum](https://www.autohotkey.com/boards/viewtopic.php?p=425051)
- nut.js/libnut: an issue reports Windows moveMouse drifting when fed getMousePos coordinates. — [libnut-core #126](https://github.com/nut-tree/libnut-core/issues/126)
- Anthropic: API does not downscale for you; resize screenshots and divide returned coordinates by the scale factor before clicking; toolset coordinates are always in screenshot pixel space. — [Anthropic docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)

### Inferences
- DPI: make the process per-monitor DPI aware; Electron's screen.getAllDisplays() reports DIP bounds and scaleFactor, desktopCapturer thumbnails are scaled by size you request, while SendInput absolute coordinates are normalized 0-65535 over the virtual desktop (use MOUSEEVENTF_VIRTUALDESK for multi-monitor). Keep one coordinate pipeline: capture per monitor in physical pixels, downscale, and map back = (x/scale + monitor.originPhysical). Negative coordinates occur for monitors left of/above primary.
- Screenshots of the board: since the board sits in the wallpaper layer, desktopCapturer/BitBlt of the screen may include or exclude it depending on method; the agent should usually see real application windows, and the board should be treated as non-interactive background (clicks on empty desktop reach the icons/Progman, not the board). Verify empirically.
- Focus: before typing, activate the target with a robust method (Alt-key tap trick, AttachThreadInput, or UIA SetFocus); simplest reliable path is to launch apps with Start-Process (new process gets foreground via parent rule) or to use UIA InvokePattern/ValuePattern, which need no focus.
- Prefer a dedicated helper (PowerShell/.NET UIA or Windows-MCP, or koffi to user32) in a child process so a hang can be killed on cancel; nut.js is simpler but has DPI quirks.
- Run the agent loop in main process/child process, never in the renderer holding the WebRTC peer, so CPU spikes do not glitch audio.

### Gaps
- No source specific to Electron + Progman child windows with SendInput/screenshots; no confirmation of Electron desktopCapturer behavior for wallpaper-layer windows. Needs hands-on test.
- Windows 11 26300-series (this machine's build) behavior of the 0x052C trick not verified.
