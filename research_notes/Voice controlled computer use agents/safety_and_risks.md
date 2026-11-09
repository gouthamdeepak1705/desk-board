# Safety, security and permission design for voice-driven Windows PC control agents

Research caveat: ~17 tool calls. Many items come from search-engine summaries of secondary coverage rather than the primary page; these are flagged "(secondary)". Primary pages actually fetched: Anthropic prompt-injection-defenses post, Anthropic Claude-in-Chrome GA post, Microsoft Windows "Securing AI agents" blog, Simon Willison lethal trifecta, Brave unseeable-injection post.

## 1. Prompt injection via screen content

### Takeaway
Indirect prompt injection against computer/browser agents is demonstrated in the wild (Claude Computer Use, Comet, Fellou, Opera Neon, Atlas) and every vendor says it is unsolved. Best vendor numbers have dropped to low single digits or below on internal benchmarks, but independent or stronger attackers still get high success with repeated tries. Design assuming injection will sometimes succeed, and limit the blast radius.

### Cited Findings
Demonstrated attacks
- Rehberger ("ZombAIs") got Claude Computer Use (Oct 2024) to download, chmod and run a Sliver C2 binary from a web page; Claude first refused, then complied after the page text was reworded as a "Support Tool" — [Hackaday via search](https://hackaday.com/blog/page/819/?cat=KM), [TechRadar](https://www.techradar.com/pro/security/claude-ai-and-other-systems-could-be-vulnerable-to-worrying-command-prompt-injection-attack) (secondary). His 39C3 (Dec 2025) talk "Agentic ProbLLMs" extends this, including an "AI ClickFix" variant where an agent clicks a button that copies a malicious command to clipboard, opens a terminal, pastes and runs it — [CCC schedule](https://events.ccc.de/congress/2025/hub/de/schedule/day:2/kind:all/recorded:1/track:security).
- Brave (Aug 2025) showed Comet could leak credentials/OTPs via hidden page content (white-on-white text, HTML comments); Oct 2025 follow-up hid faint light-blue-on-yellow text in images that Comet's screenshot OCR read as commands; Fellou treated simply navigating to an attacker page as injection; Opera Neon had hidden-HTML-element injection — [Brave](https://brave.com/blog/unseeable-prompt-injections/) (primary). Brave's mitigations: isolate agentic browsing from regular browsing; start agentic actions only on explicit user request; says agentic browsing "will be inherently dangerous" until broader fixes exist.
- LayerX "CometJacking" was reportedly dismissed by Perplexity as "no security impact" — [ppc.land](https://ppc.land/comet-browser-faces-multiple-security-vulnerabilities-from-prompt-injection/) (secondary, allegation).
- ChatGPT Atlas was shown to be tricked by injections shortly after launch — [The Hacker News](https://thehackernews.com/2025/10/chatgpt-atlas-browser-can-be-tricked-by.html) (headline only seen).
- A 2026 journal paper reports 78% global attack success against Claude Sonnet 4.5 in the Bytebot framework (different from Rehberger's work; low-tier venue, unverified) — [jurnal.atmaluhur.ac.id](https://jurnal.atmaluhur.ac.id/index.php/sisfokom/article/view/2634).

Vendor measurements
- Claude for Chrome pilot (Aug 2025): 123 test cases/29 scenarios; 23.6% attack success without mitigations, 11.2% with, in autonomous mode; 4 browser-specific attack types 35.7% -> 0%. Computer Use cited at 19.4% — [Anthropic](https://www.anthropic.com/news/claude-for-chrome), [Simon Willison](https://simonwillison.net/2025/Aug/26/piloting-claude-for-chrome/).
- Anthropic Nov 2025 (internal adaptive Best-of-N attacker, 100 attempts/environment, ~2,200-3,200 attempts per bar): model-only vs improved safeguards ASR: Sonnet 4 13.8%->2.0%, Sonnet 4.5 13.8%->1.9%, Haiku 4.5 12.0%->2.4%, Opus 4.5 8.0%->1.4%. Mitigations: RL on injected simulated web content, classifiers scanning all untrusted content for hidden text/manipulated images/deceptive UI, continuous red teaming. Quotes: "prompt injection is far from a solved problem"; "No browser agent is immune"; 1% "still represents meaningful risk" — [Anthropic](https://www.anthropic.com/research/prompt-injection-defenses) (primary).
- Anthropic Claude in Chrome GA page: stronger professionally red-teamed evaluation shows Opus 4.5 17.6% before and 16.7% after Nov 2025 safeguards; Opus 5 3.8% pre-safeguards; newer models listed at 0%-0.3% with probes + action classifier. Defenses: attack-trained model, content probes warning the model, and a per-action classifier comparing each action to the original request and blocking mismatches. Anthropic says verified successes were low-severity. Autonomous approval can be switched off for per-action approval — [Anthropic](https://claude.com/blog/claude-in-chrome-generally-available) (primary; note model names there as fetched; numbers are vendor-run and the grading method changed, so not comparable across posts).
- Independent: Gray Swan benchmark reported Opus 4.5 failing 4.7% to a single strong attack, 33.6% at 10 attempts, 63% at 100 — [The Decoder](https://the-decoder.com/claude-opus-4-5-resists-prompt-injections-better-than-rivals-but-still-falls-to-strong-attacks-alarmingly-often/) (secondary).
- OpenAI Operator/CUA: layered defenses of confirmations, watch mode, takeover mode for credentials (no screenshots while user types), and a prompt-injection monitor that sees the screenshot and pauses; o3-CUA base susceptibility 20% vs 23% prior — [o3 CUA system card](https://cdn.openai.com/pdf/4375e605-f9a6-438d-bcc8-190599c183a6/o3_cua_system_card.pdf), [OpenAI](https://openai.com/index/introducing-operator/) (secondary summary).
- OpenAI (Dec 22 2025) said prompt injection is unlikely to ever be fully "solved"; uses automated red-teaming and adversarial training for Atlas. UK NCSC similarly warned it may never be fully mitigated — [TechCrunch](https://techcrunch.com/2025/12/22/openai-says-ai-browsers-may-always-be-vulnerable-to-prompt-injection-attacks/), [TechRadar](https://www.techradar.com/pro/security/openai-says-its-had-to-protect-its-atlas-ai-browser-against-some-serious-security-threats) (secondary; original post not opened).
- Microsoft names cross-prompt injection (XPIA) in UI elements/documents as a key risk for Windows agents, leading to data exfiltration or malware install — [Windows blog](https://blogs.windows.com/windowsexperience/2025/10/16/securing-ai-agents-on-windows/) (primary).
- Willison "lethal trifecta": private data access + untrusted content + external communication; advice is to avoid the combination, and constrain agents so untrusted input cannot trigger consequential actions; guardrail products are not reliable — [Willison](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) (primary).

### Inferences
- A personal PC agent that sees arbitrary web pages/email, has file access and can send data or run commands has all three trifecta legs. Break at least one: no outbound network tools beyond the model API, or no untrusted content ingestion in tasks that touch private data, or approval for every consequential step.
- Vendor ASR figures are on vendor-chosen benchmarks and typically for browsers with classifiers; a hobby app using a raw screenshot loop has none of those layers, so expect closer to the "model-only" numbers (roughly 8-24% in Anthropic's tests), and higher against targeted attackers.
- Whole-desktop OCR/screenshot input widens the attack surface vs DOM-only because hidden/faint image text works (Brave).

### Gaps
- Primary OpenAI Atlas hardening post, and Brave's Comet-original posts, not opened. No CVE list for these agents gathered. No systematic data on injection via Windows native apps (as opposed to browsers).

## 2. Destructive or irreversible actions: confirmation and control patterns

### Takeaway
All major vendors converge on: approval before high-risk actions (purchases, sending, sharing data), user takeover for credentials, blocked high-risk site categories, a per-action classifier or monitor, and off-by-default autonomy. Implement these as code-enforced policy outside the model.

### Cited Findings
- Claude for Chrome: user approval before purchases, publishing content, sharing sensitive data; blocked high-risk site categories (financial, adult, pirated); "first line of defense ... is permissions" — [Anthropic](https://www.anthropic.com/news/claude-for-chrome).
- Claude in Chrome now offers autonomous approvals of actions judged safe, with a setting to require manual approval of each action; per-action classifier checks match to original request; enterprise admins can limit to approved domains — [Anthropic](https://claude.com/blog/claude-in-chrome-generally-available).
- Operator: confirmation before significant actions (orders, emails); watch mode on sensitive sites (email, finance) requiring close supervision; takeover for logins/payments — [OpenAI Operator](https://openai.com/index/introducing-operator/) (secondary summary).
- Microsoft: agents get minimal privileges, only user-granted resources revocable at any time; extra approval for sensitive steps; users can monitor and take over any time; Copilot Actions off by default — [Windows blog](https://blogs.windows.com/windowsexperience/2025/10/16/securing-ai-agents-on-windows/). That article does not describe logging/audit trails explicitly.

### Inferences (my design synthesis, not from sources)
- Classify tool/actions into tiers: read-only (screenshot, read), reversible (open app, scroll, type in focused field), consequential (send, delete, purchase, install, settings, terminal, anything with clipboard-to-shell) requiring explicit approval showing the exact action (recipient, filename, command) and not just "ok".
- Prefer typed/structured tools (open_url allow-list, move-to-Recycle-Bin instead of delete) over raw mouse/keyboard where possible; hard-block shell and PowerShell or require approval with command shown.
- Per-task step cap, wall-clock timeout, and repeated-action detection; global kill hotkey that halts input injection and cancels the model stream; append-only action log with screenshot hashes; a plan-then-approve mode for multi-step tasks.
- Re-confirm if the plan changes after untrusted content was read (action-vs-original-intent check, as in Anthropic's classifier).

### Gaps
- No measured effectiveness for confirmation prompts (approval fatigue) found. No source on undo mechanisms for desktop agents.

## 3. Voice-specific risks

### Takeaway
Documented history shows media audio triggers assistants (2016-17), and 2025-26 research shows adversarial/inaudible audio can drive audio-language-model agents. Treat any audio, including your own speaker output, as untrusted; push-to-talk is the strongest cheap mitigation.

### Cited Findings
- Google Home Super Bowl ad triggered owners' devices (2016); Alexa-in-TV-ad ordered cat food (2017); Burger King ad deliberately activated Google Assistant; vendors responded with acoustic fingerprinting of known ads — [Retail Insight](https://www.retail-insight-network.com/news/amazon-cleared-echo-dot-advert-ordered-cat-food/), [Android Authority](https://androidauthority.com/burger-king-ad-google-home-assistant-763657), [SlashGear](https://www.slashgear.com/google-home-super-bowl-ad-aims-for-hearts-hits-funny-bones-06473967) (secondary, dated).
- "AudioHijack"/auditory prompt injection: crafted, near-imperceptible adversarial audio elicited unauthorized actions (download files, send emails, web search) from large audio-language models; reported for IEEE S&P (secondary, date unconfirmed) — [ChannelNews](https://www.channelnews.com.au/hidden-audio-attacks-could-turn-ai-assistants-into-security-risks/).
- GhostTalk (NDSS): inaudible command injection over a power line via modified charging cable; bypassed speaker verification by simulating a headphone button press — [NDSS](https://www.ndss-symposium.org/ndss-paper/auto-draft-188/) (abstract via search). Relevance to a PC app is low (phone-targeted).

### Inferences
- Cascade ASR (Whisper-style transcription then text LLM) is less exposed to adversarial-audio attacks on LALMs than native-audio models, but still obeys ordinary speech from videos/other people in the room.
- Mitigations to adopt: push-to-talk hotkey (default) rather than always-on; if wake word, add on-screen/audible confirmation of the transcribed command for non-read-only actions; mute/pause when system audio is playing; show transcript before executing; spoken confirmation only for low-risk tiers, since voice confirmation can be spoofed or cloned - use a keypress/click for high-risk tiers; optional local speaker verification as a weak extra factor (voice cloning defeats it); process wake-word locally and only upload audio after activation; never feed the agent's own TTS back into the mic (use echo cancellation or mute while speaking).
- Misrecognition risk (homophones, names, numbers in "send $500 to...") is why the approval card must display the parsed intent text, not just play audio.

### Gaps
- No 2025-26 sources found on voice-cloning bypass of speaker verification (search returned only 2016-17 items) or on false-accept rates of local speaker verification models. No Whisper-hallucination-on-silence source gathered (known issue from my background knowledge, unsourced).

## 4. Sandboxing and isolation on Windows 11

### Takeaway
Microsoft's own direction is a separate agent account plus a separate desktop session ("agent workspace"), which is currently experimental and admin-gated. For a hobby app, the practical options are a dedicated standard user account, a VM/Windows Sandbox, and a dedicated browser profile; UIPI means the agent cannot operate admin windows, which is a feature.

### Cited Findings
- Windows agent workspace: separate standard agent account, separate Windows session/desktop running in parallel, limited visibility into the user's desktop, access to known folders (Documents, Downloads, Desktop, Pictures) with others needing authorization; off by default, under Settings > System > AI components > Agent tools > Experimental agentic features; preview, Entra/MSA identity to come; security principles: distinct accounts, least privilege, signed/revocable agents — [Windows blog](https://blogs.windows.com/windowsexperience/2025/10/16/securing-ai-agents-on-windows/), [MS Learn](https://learn.microsoft.com/en-au/windows/security/book/operating-system-agentic-security). One report says only an admin can enable it and it applies device-wide — [SecurityWeek](https://www.securityweek.com/microsoft-highlights-security-risks-introduced-by-new-agentic-ai-feature/) (secondary).
- UIPI (Vista+, part of Mandatory Integrity Control): synthetic input (SendInput, keybd_event) from a Medium-integrity process to a High-integrity (elevated) window is silently dropped; UI Automation cannot drive elevated apps; Microsoft calls it a security feature, not a security boundary; workarounds are running elevated or UIAccess (signed, secure install location) — [Wikipedia](https://en.wikipedia.org/wiki/User_Interface_Privilege_Isolation), [MS Learn UIAccess policy](https://technet.microsoft.com/en-us/library/jj852244.aspx), [codenote.net on ChatGPT/Codex computer use](https://codenote.net/en/posts/windows-admin-elevation-blocks-chatgpt-computer-use-uipi/).
- Brave recommends isolating agentic browsing from regular browsing — [Brave](https://brave.com/blog/unseeable-prompt-injections/).

### Inferences
- Do not run the agent app elevated and do not seek UIAccess; the UIPI limit protects UAC prompts, admin terminals and installers. Note silent failure: detect and tell the user "target window is elevated".
- Dedicated Chromium profile (no saved passwords/logged-in banking/email) for browsing tasks; separate standard Windows account or VM for riskier autonomy. Windows Sandbox is not available on Windows 11 Home (my background knowledge, unsourced; the user's machine is Home), so a Hyper-V-less alternative would be a separate local user account or third-party VM.
- Run input-injection and model-calling in separate processes/least privilege; keep the app's executable folder not writable by the agent.

### Gaps
- No source gathered on Windows Sandbox edition requirements, app allow-list mechanisms (AppLocker/WDAC availability on Home), or an actual user-account-switch workflow for Electron apps.

## 5. Credential and data safety

### Takeaway
Screenshots go to the cloud and may be retained for abuse monitoring (up to 30 days at OpenAI; Anthropic's policy text is inconsistent across pages). Keep secrets off screen, keep the API key in the main process encrypted via safeStorage, and know that DPAPI does not stop other apps running as you.

### Cited Findings
- OpenAI API: abuse-monitoring logs retained up to 30 days unless law requires longer; ZDR/Modified Abuse Monitoring needs prior approval (not self-serve); image/file inputs have rare exceptions I could not see — [OpenAI docs](https://developers.openai.com/api/docs/guides/your-data/index.html) (secondary summary).
- Anthropic: privacy center says API inputs/outputs deleted within 30 days; developer docs say prompts/outputs not retained by default except "Covered Models" requiring 30-day retention; never used for training without permission; ZDR available by agreement. These two pages conflict in framing — [Anthropic docs](https://platform.claude.com/docs/en/build-with-claude/api-and-data-retention), [privacy center](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-data) (secondary summaries; PYMNTS claim of a June retention change for a new model unverified). Check the live docs for your chosen model.
- Operator's takeover mode: no screenshot of what the user types while in takeover — [OpenAI](https://openai.com/index/introducing-operator/) (secondary).
- Electron safeStorage on Windows uses DPAPI: protects from other accounts but not other apps in the same user session; prefer encryptStringAsync/decryptStringAsync; on Linux may fall back to plaintext (check getSelectedStorageBackend() == basic_text) — [Electron docs](https://www.electronjs.org/docs/api/safe-storage).
- Brave: injected pages act with the user's logged-in privileges on bank/email/cloud — [Brave](https://brave.com/blog/unseeable-prompt-injections/).

### Inferences
- Never let the agent type passwords: use password manager autofill performed by the user (takeover), and pause screenshot capture during takeover. Exclude/blur windows of password managers and banking by title or process via capture filtering; cap capture to the target window rather than the full desktop where possible.
- Keep the API key in the main process only (never the renderer or logs), store with safeStorage, use a provider key with spend limits and its own project, and redact before logging screenshots; log locally with short retention.
- Tell the user plainly that screens, including incidental notifications and other people's messages, are uploaded.

### Gaps
- No source found on screenshot-specific retention for either vendor, or on Electron API-key hygiene beyond safeStorage; Windows privacy notice for Recall-like screen capture not covered.

## 6. Recommended checklist, ordered by importance (synthesis; supporting sources above)

1. Treat everything on screen and in audio as untrusted; assume injection can succeed (Anthropic, OpenAI, NCSC statements).
2. Break the lethal trifecta: no free outbound channels (no arbitrary URLs, no email send, no shell) in the same session as private data and untrusted content.
3. Code-enforced approval tiers: show exact action; require click/keypress (not voice) for send, delete, purchase, install, settings, terminal, credential, and file moves outside the workspace.
4. Kill switch: global hotkey plus "stop" voice command (a local keyword spotter not routed through the LLM); hard step cap, wall-clock timeout, repeated-action breaker.
5. Push-to-talk by default; display transcript before execution; mute system audio/TTS echo; no always-on cloud streaming.
6. Isolation: non-elevated, separate standard user or VM for autonomy; dedicated browser profile with no saved logins; folder allow-list; domain allow/deny list with blocked categories (finance, email admin).
7. Credentials: never type passwords for the user; takeover mode with screenshots paused; API key via safeStorage in main process with provider spend caps.
8. Prefer structured tools (Recycle Bin delete, allow-listed URLs) over raw clicks; read-only mode as default and plan-then-approve for multi-step tasks.
9. Append-only local action log (action, target window, transcript, timestamp) for review and undo; confirm logs do not retain secrets.
10. Optional extras: injection classifier or second-model action check against original request (Anthropic and OpenAI both do this); speaker verification as a weak signal; periodic re-reading of vendor retention docs.

### Gaps
- No empirical data for hobby-scale setups; ordering reflects my judgment from the cited material, not a ranked study. OWASP LLM Top 10 / agentic guidance and CVE records were not researched in this pass.
