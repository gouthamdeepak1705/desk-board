# Microsoft Windows-native agent features and open-source tools for AI control of a Windows 11 PC

Research date: 2026-10-26. GitHub stats were pulled live from the GitHub API on that date (api.github.com/repos/<owner>/<repo>). Where I could not verify something, it is listed under Gaps.

## Microsoft: Windows 11 agentic features (shipped vs preview) and what third parties can use

### Takeaway
Microsoft's agent stack (agent workspace, Copilot Actions, On-Device Agent Registry with MCP) was still labeled experimental/preview in the sources I could find, and I found no official GA announcement. Third parties can build MCP "agent connectors" for it, but it needs an Insider build, an admin toggle and a registered MCP server. It is not a way to let your own Electron app drive arbitrary apps today.

### Cited Findings
- "Experimental agentic features" is off by default, admin-only, and device-wide. Enabling it creates a separate agent account and workspace. Agents run in a separate Windows session, which is lighter than a VM such as Windows Sandbox. The support page calls it experimental/preview: the agent workspace is in private preview for Insiders, and Copilot Actions is rolling out gradually to Insiders in Copilot Labs. Per-agent file controls and connectors need build 26100.7344 or later. — [Microsoft Support](https://support.microsoft.com/en-us/windows/ai/ai-features/experimental-agentic-features)
- Permissions: agents can request read/write on six known folders (Documents, Downloads, Desktop, Music, Pictures, Videos), with per-agent settings "Allow Always / Ask every time / Never allow" under System > AI Components > Agents > Files. Agents use apps installed for all users by default. Connectors run in the workspace and need a grant. — [Microsoft Support](https://support.microsoft.com/en-us/windows/ai/ai-features/experimental-agentic-features)
- Microsoft said that during preview it would keep adding granular security and privacy controls before general availability. The announcement coverage also flags cross-prompt injection as a risk. — [Windows Experience Blog, Securing AI agents on Windows](https://blogs.windows.com/windowsexperience/2025/10/16/securing-ai-agents-on-windows/)
- Copilot Actions is an agent that uses vision and reasoning to click, type and scroll in apps and files. It is available to Insiders via Copilot Labs, disabled by default and opt-in. — [Windows Experience Blog / search summary](https://blogs.windows.com/windowsexperience/2025/10/16/securing-ai-agents-on-windows/), [PCWorld](https://www.pcworld.com/article/2941260/meet-copilot-actions-windows-11s-most-revolutionary-ai-feature-yet.html)
- A Windows Latest article from April 2026 says AI agents are still coming to the Windows 11 taskbar and Microsoft was preparing a public rollout. That implies the agentic taskbar was not broadly shipped at that date. — [Windows Latest](https://www.windowslatest.com/2026/04/18/microsoft-confirms-ai-agents-are-still-coming-to-the-windows-11-taskbar-as-it-prepares-for-public-rollout/)
- MCP on Windows is built around the Windows On-device Agent Registry (ODR). It supports local-app and remote MCP servers. Servers are contained in a separate environment by default, with per-agent user and admin control (Settings, Intune) and audit logging. Windows ships a File Explorer connector, plus a Settings connector. There is a CLI, `odr.exe`, for viewing and managing servers. The page carries a "prereleased product" notice, and the Learn page was updated 2026-06-04. — [Microsoft Learn: MCP on Windows overview](https://learn.microsoft.com/en-us/windows/ai/mcp/overview)
- The ODR was announced at Ignite 2025 as public preview. Traffic goes through a gateway that handles authentication, authorization and auditing. A UAC-style consent prompt appears before sensitive tool calls (per a secondary blog). — [Windows Developer Blog, Ignite 2025](https://blogs.windows.com/windowsdeveloper/2025/11/18/ignite-2025-furthering-windows-as-the-premier-platform-for-developers-governed-by-security), [Glama blog (secondary)](https://glama.ai/blog/2025-07-28-how-windows-11-now-supports-mcp-for-local-agents)
- A setting called "Reducing Protections for Agent Connectors" appeared in build 26220.7344, which loosens the containment for testing. — [GeekRewind](https://geekrewind.com/?p=100348)
- Agent clients known to use ODR/MCP on Windows: Visual Studio and VS Code GitHub Copilot agent mode. The Microsoft Agent Framework can be used to build agents on the ODR. A sample "MCP host on Windows" quickstart exists, so a third-party host app can list and call registered servers. — [Microsoft Learn](https://learn.microsoft.com/en-us/windows/ai/mcp/overview)
- "Hey Copilot" wake word and Copilot Vision: announced October 2025 as opt-in (wake word off by default) and available in Copilot markets. These are consumer features of the Copilot app, not APIs for third parties. — [Windows Experience Blog](https://blogs.windows.com/windowsexperience/2025/10/16/making-every-windows-11-pc-an-ai-pc/), [AlternativeTo](https://alternativeto.net/news/2025/10/microsoft-expands-copilot-on-windows-with-ai-agent-capabilities-vision-and-voice-wake-up)
- Copilot Studio "computer use" lets agents operate Windows desktop and web apps by vision (click, type, navigate menus) without APIs. It was announced as public preview. It runs on a Microsoft-hosted Windows 365 machine or your own machine set up for Power Automate desktop flows. Setup includes credentials in Azure Key Vault and restricting allowed sites and apps. This is an enterprise, licensed, cloud-orchestrated product. — [Microsoft Copilot blog](https://www.microsoft.com/en-us/microsoft-copilot/blog/copilot-studio/computer-use-is-now-in-public-preview-in-microsoft-copilot-studio/), [Inogic](https://www.inogic.com/blog/2025/09/how-to-automate-dynamics-365-using-computer-use-in-copilot-studio/)

### Inferences
- For a personal Electron app, Microsoft's stack is mostly not directly usable. The agent workspace is gated to Insider builds and admin opt-in, Copilot Actions is a closed first-party agent, and Copilot Studio is an enterprise cloud product.
- The one genuinely usable piece is the ODR/MCP side: your app could expose its own functions as an MCP server (an "agent connector"), or host MCP clients via the quickstart. That helps with "agents controlling my app", not "my app controlling Windows".
- Windows UI Automation (UIA) is the stable, shipped, long-standing accessibility API that the open-source tools below use underneath. It needs no Microsoft agent feature.

### Gaps
- No official GA announcement for agent workspace or Copilot Actions was found as of 2026-10-26. Status may have changed since the last sources (July 2026 at the latest), so check the Windows Insider blog.
- I did not verify App Actions (the Learn URL I tried returned 404). Its status and its relation to MCP are unconfirmed.
- No dedicated Learn page on UI Automation was fetched. Its role above is from general knowledge, not a cited source.
- The current status of Copilot Studio computer use (preview vs GA) in late 2026 was not confirmed. The sources are from 2025.
- A CO/AI item dated Aug 2026 says "Hey Copilot" was rolling out to English Insiders worldwide. It conflicts with the Oct 2025 GA announcement and is unreliable, so I did not rely on it.

## Open-source tools: what they do, activity, license, Windows fit, MCP use

### Takeaway
Windows-MCP (CursorTouch, MIT, about 10.4k stars, pushed the day of research) is the most direct fit: an MCP server that works by UIA with optional vision and is easy to call from Claude Code. UFO2/3 is Windows-specific and well documented, but a heavier Python research framework. Pure-vision options (UI-TARS, OmniParser) need a model or GPU. Node automation libraries (nut.js, robotjs) work for raw input but have no semantic understanding.

### Cited Findings
Stats below come from the GitHub API on 2026-10-26.

| Project | Stars | License | Last push | Notes |
|---|---|---|---|---|
| [CursorTouch/Windows-MCP](https://github.com/CursorTouch/Windows-MCP) | 10,418 | MIT | 2026-10-26 | Very active, 29 open issues |
| [microsoft/UFO](https://github.com/microsoft/UFO) | 10,093 | MIT | 2026-10-23 | Active, not archived |
| [bytedance/UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop) | 39,392 | Apache-2.0 | 2026-10-09 | Active |
| [microsoft/OmniParser](https://github.com/microsoft/OmniParser) | 25,554 | CC-BY-4.0 (repo as listed) | 2026-07-20 | Slower, about 3 months since last push |
| [browser-use/browser-use](https://github.com/browser-use/browser-use) | 119,189 | MIT | 2026-10-24 | Very active, browser only |
| [simular-ai/Agent-S](https://github.com/simular-ai/Agent-S) | 12,750 | Apache-2.0 | 2026-10-24 | Latest release v0.3.2 on 2025-12-16 |
| [openinterpreter/open-interpreter](https://github.com/openinterpreter/open-interpreter) | 68,677 | Apache-2.0 | 2026-10-11 | Active |
| [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) | 38,656 | Apache-2.0 | 2026-10-22 | Browser only |
| [wonderwhy-er/DesktopCommanderMCP](https://github.com/wonderwhy-er/DesktopCommanderMCP) | 10,129 | MIT | 2026-10-26 | Terminal and filesystem, not GUI |
| [microsoft/WindowsAgentArena](https://github.com/microsoft/WindowsAgentArena) | 912 | MIT | 2026-04-13 | Benchmark, not a tool |
| [asweigart/pyautogui](https://github.com/asweigart/pyautogui) | 12,739 | BSD-3-Clause | 2024-08-20 | Stale; about 2 years since last push |
| [AutoHotkey/AutoHotkey](https://github.com/AutoHotkey/AutoHotkey) | 13,366 | GPL-2.0 | 2026-10-25 | Active |
| [octalmage/robotjs](https://github.com/octalmage/robotjs) | 12,786 | MIT | 2026-10-24 | Active push, but long reputation for native-module breakage (not verified here) |
| [nut-tree/nut.js](https://github.com/nut-tree/nut.js) | 2,855 | none listed | 2024-05-01 | Stale repo; see npm note below |

Per-project details:
- **Windows-MCP**: 21 tools (Click, Type, Scroll, Move, Shortcut, Wait, WaitFor, Screenshot, Snapshot, App, PowerShell, FileSystem, Scrape, Clipboard, Process, Registry and others). Needs Windows 10/11, Python 3.14+ and uv. Run with `uvx windows-mcp serve`. Vision is optional (`Snapshot` with `use_vision=True`) and it works with any LLM. Typical latency between actions is 0.2 to 0.5 s per the README. Anonymous telemetry is on by default (`ANONYMIZED_TELEMETRY=false` to disable). README warns it has full system access and can do irreversible operations. Setup instructions exist for Claude Desktop, Claude Code, Codex CLI, Gemini CLI and others. It runs locally; the LLM is wherever your client runs it. — [README](https://github.com/CursorTouch/Windows-MCP)
- Windows-MCP security history: versions before 0.7.5 exposed an unauthenticated control plane in certain HTTP modes, allowing arbitrary PowerShell execution (fixed in 0.7.5). Release v0.8.5 fixed stdout pollution of the JSON-RPC channel and added a UIA watchdog for COM failures. — [releasealert CVE listing](https://releasealert.dev/github/CursorTouch/Windows-MCP/cves), [releases](https://github.com/CursorTouch/Windows-MCP/releases) (via search summary)
- Windows-MCP reliability: I found no independent benchmark or review. The Windows-side problems I found were mostly Claude Desktop MCP hangs (tool calls cut off at about 4 min in June 2026, 5 min hangs in Feb 2026) and Microsoft Store (MSIX) Claude Desktop path quirks needing the full path to `uvx.exe`. — [claude-code issue 65643 via claudeissues](https://claudeissues.com/issue/65643-bug-claude-desktop-windows-mcp-tool-calls-hard-terminated-and-bridge-wedge-after), [README](https://github.com/CursorTouch/Windows-MCP)
- **UFO / UFO2 / UFO3 (Microsoft)**: UFO2 is a Windows desktop agent using hybrid detection (UIA, Win32, COM plus vision), marked stable with long-term support since v2.0.0 (Apr 2025). UFO3 "Galaxy" (Nov 2025, arXiv 2511.11332) orchestrates multiple devices and is in active development. Python 3.10/3.11, `pip install -r requirements.txt`. Backends configured for OpenAI/Azure OpenAI, with guides for Qwen, Gemini and Claude. Galaxy device agents are described as MCP-empowered. Reports a 51% reduction in LLM calls from speculative multi-action. — [README](https://github.com/microsoft/UFO)
- **UI-TARS Desktop (ByteDance)**: a native GUI agent desktop app (Windows/macOS/browser) built on UI-TARS and Seed-1.5-VL/1.6 models, with local and remote computer/browser operators. The README advertises "fully local processing", with the UI-TARS-1.5-7B model on Hugging Face, and a cloud deployment guide. Latest desktop release mentioned is v0.2.0 (2025-06-12). Agent TARS, the sibling CLI/Web UI stack, supports MCP (CLI v0.3.0, 2025-11-05). 357 open issues. — [README](https://github.com/bytedance/UI-TARS-desktop)
- **nut.js**: the README says public npm packages were removed; the free route is building from source (including the native `@nut-tree/libnut-core`), and prebuilt packages require a paid subscription with a registry token (pricing at nutjs.dev). Windows is a listed platform. — [README](https://github.com/nut-tree/nut.js)
- **OmniParser**: a screen-parsing tool for vision-only GUI agents (turns screenshots into structured elements). Typically run with a GPU and weights. Not itself an agent. Repo license listed as CC-BY-4.0 per the API (the model weights have their own licenses; I did not verify them). — [GitHub API](https://api.github.com/repos/microsoft/OmniParser)
- **Agent S / Simular**: general computer-use agent framework; Apache-2.0; last release v0.3.2 (2025-12-16), though commits continue. — [GitHub API](https://api.github.com/repos/simular-ai/Agent-S)
- **Playwright MCP** and **browser-use**: browser only (not desktop apps). Both are active and permissively licensed. Playwright MCP is a drop-in MCP server for browser tasks.
- **Desktop Commander MCP**: file, terminal and process control rather than GUI control. Very active.

### Inferences
- Abandoned or stale: pyautogui (last push 2024-08), nut.js repo (last push 2024-05, and the free npm path is gone). The nut.js free route needs a source build; a community fork exists but I could not confirm it (404 on the fork I tried).
- For MCP clients (Claude Code and similar): Windows-MCP, Playwright MCP, Desktop Commander and Agent TARS are directly callable. UFO, UI-TARS Desktop and Agent S are standalone agents, not MCP servers (UFO3 mentions MCP only for tool augmentation inside Galaxy).
- Local vs cloud: the tools themselves run locally. Privacy depends on the model. Windows-MCP, UFO and Agent S send screenshots or UI trees to whichever LLM you configure (cloud by default). UI-TARS-1.5-7B and OmniParser are the realistic local-model options but need a decent GPU.
- UIA-tree-based tools (Windows-MCP, UFO2) are generally cheaper and more deterministic than pure-vision tools, but UIA coverage is weak for Electron/Chromium, games and custom-drawn UIs. That is general knowledge, not cited here.

### Gaps
- No independent reliability benchmarks found for Windows-MCP. WindowsAgentArena/OSWorld numbers for UFO, Agent S and UI-TARS were not retrieved.
- Open Interpreter "OS mode" status and Windows quality were not checked. Only repo activity was.
- No Hacker News / Reddit reliability reports were retrieved.
- Latest Windows-MCP release version and date were not captured (only that v0.7.5 and v0.8.5 exist).
- robotjs prebuild/Electron compatibility on current Electron versions was not verified.

## Recommendation: smallest reliable stack for an Electron app to "open this app, click that, type this" on Windows 11

### Takeaway
Use the Windows-MCP server (stdio) as the action layer and drive it from the Electron main process with the MCP TypeScript client SDK, with an LLM tool-use loop on top. For deterministic steps (launch app, type text, hotkeys), call the same server's tools directly without the LLM, and add vision only as a fallback.

### Cited Findings
- Windows-MCP ships an App launcher, Click/Type/Shortcut tools and UI-tree Snapshot, runs locally via `uvx windows-mcp serve`, and has documented Claude Code setup. — [README](https://github.com/CursorTouch/Windows-MCP)
- Microsoft's own agent path (ODR/agent workspace) requires Insider builds and is preview. — [Microsoft Support](https://support.microsoft.com/en-us/windows/ai/ai-features/experimental-agentic-features)

### Inferences
- Suggested stack, smallest first: (1) Electron main process spawns `uvx windows-mcp serve` over stdio via `@modelcontextprotocol/sdk` (not verified in this research); (2) the LLM (cloud, or local if privacy matters) chooses tools from a Snapshot; (3) a confirmation layer in the Electron app for destructive actions, since Windows-MCP exposes PowerShell, Registry and FileSystem tools and has had a prior RCE-class bug; restrict or exclude those tools.
- Fallback for simple deterministic actions with no LLM: Win32 SendInput via PowerShell, AutoHotkey (GPL-2.0, so ship it as a separate process only), or robotjs (MIT) if native-module builds for your Electron version succeed. Avoid nut.js (paywalled prebuilds) and pyautogui (stale).
- Python 3.14+ is required by Windows-MCP, so uv must manage the runtime. This is the main setup cost.
- Pin the version and disable telemetry. Keep Windows-MCP on a per-user scheduled task or spawn it per session.
- Treat Microsoft's ODR as a later option: registering your own app as an MCP connector so Windows-native agents can drive it.

### Gaps
- I did not test any of this on the target machine, so the stack is a recommendation from documentation, not a verified end-to-end result.
- Whether Windows-MCP works reliably with Electron/Chromium app UIA trees was not found in any source.
