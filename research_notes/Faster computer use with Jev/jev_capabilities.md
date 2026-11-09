# Jev (TypeSafe AI System One model): capabilities as of 2026-10-26, focus on computer-use agents

Research date: 2026-10-26. Primary sources are docs.typesafe.ai pages fetched on that date. All claims below are as of that date unless a different date is given.

## What is Jev, and what is the input/output format?

### Takeaway
Jev is a non-generative "System One" model. You send a state plus typed questions (choice, score, noul, and now box) and get typed answers with calibrated probabilities in one parallel pass. It is a classifier/decision model, not a chat LLM.

### Cited Findings
- TypeSafe describes System One as models that make fast structured decisions software can use directly. "System One models do not write replies, produce code, or generate explanations of their reasoning." Jev is the flagship and first System One model. — [docs System One](https://docs.typesafe.ai/concepts/system-one.md)
- Question types are Choice (returns choice, probabilities, confidence), Score (score, probabilities, confidence, legend) and Noul (a 0-1 true/false value). Multiple questions can go in one call and are evaluated in parallel and independently against the same state. — [docs home](https://docs.typesafe.ai), [quickstart](https://docs.typesafe.ai/introduction/quickstart.md)
- The vendor site says you can set thresholds for when software acts autonomously versus asks for review. — [typesafe.ai](https://typesafe.ai)
- Architecture: TypeSafe says it uses a parallel sampler that produces all outputs in one query, trained with "RLCD" (Reinforcement Learning for Calibrated Decisions). — [DataCamp](https://www.datacamp.com/blog/system-one-models-jev). Per TechCrunch (as relayed by DigitalOcean) it was trained on synthetic data over two years. The architecture is undisclosed and outside observers only suspect a transformer on an open-weight LLM, which is unconfirmed. — [DigitalOcean](https://www.digitalocean.com/resources/articles/what-is-jev)
- Initial early access release was 2026-09-15. — [DigitalOcean](https://www.digitalocean.com/resources/articles/what-is-jev), [DataCamp](https://www.datacamp.com/blog/system-one-models-jev)
- Calibration is measured across groups of predictions and does not guarantee any single answer is right. Output is always validly typed but can be confidently wrong. — [docs System One](https://docs.typesafe.ai/concepts/system-one.md), [DigitalOcean](https://www.digitalocean.com/resources/articles/what-is-jev)
- Design guidance: ask one well-scoped question at a time and combine answers in your code. — [docs home](https://docs.typesafe.ai)
- Question shape: `questions` is an object keyed by your IDs; each has `type`, `instructions`, and `criteria` (object of option labels to descriptions for choice; array of rubric levels for score; none for noul). — [quickstart](https://docs.typesafe.ai/introduction/quickstart.md)

### Inferences
- Jev maps well to "classify this state" and badly to anything open-ended. It is closer to a fast, prompt-defined classifier than to an LLM or VLM.

### Gaps
- Architecture is not officially disclosed. Parameter count unknown.

## Versions, release notes, and whether the user's "new abilities" claims hold

### Takeaway
The user's claims are largely correct but need caveats. Jev 1.14 (2026-10-14) adds a Box (bounding box) question type, experimental image input, and opt-in 262k context. All three are officially "not production-ready" and sit behind "danger zone" headers. "Ability to choose" is NOT new: Choice has existed since launch. "More context" is only available by opt-in, with a slower and less accurate warning.

### Cited Findings
- Current models: Jev 1.14 (`jev-1.14.0`) and Jev 1.13 (`jev-1.13.0`), both $0.042 per Mtok input. `jev-latest` and `jev-preview` both alias `jev-1.14.0`. 1.14 is available from 2026-10-14. — [docs Models](https://docs.typesafe.ai/models)
- Jev 1.14.0 was released 2026-10-14 with composable image inputs, a bounding-box type called `box`, and longer context behind opt-in API headers aimed at "dreamers", not production builders. — [runtimewire summary via search](https://runtimewire.com/article/typesafe-jev-1-14-danger-zone-experiments) (search snippet only; not fully fetched), [Pasquale Pillitteri 2026-10](https://pasqualepillitteri.it/en/news/26048/jev-1-14-image-input-box-typesafe-warns)
- Image input: PNG/JPEG still images, enabled by sending `TypeSafe-Danger-Zone-Images: true` on every request containing an image or Box question. Jev 1.13 and 1.14 both accept images; Box requires 1.14. — [docs Images](https://docs.typesafe.ai/images)
- The docs Models table still lists input as "Text" for both models, which conflicts with the Images page. Third-party write-up notes the docs disagree and the Images page is more specific. — [docs Models](https://docs.typesafe.ai/models), [docs System One](https://docs.typesafe.ai/concepts/system-one.md) (says "Images, audio, and video are not supported yet", likely stale), [madewithjev](https://madewithjev.com/jev-images)
- Whether images existed in 1.13.0 or arrived in 1.14 is contradicted across sources: docs Images page says 1.13 and 1.14 both accept images; MarkTechPost-style coverage presented it as new in 1.14 ([search summary](https://www.marktechpost.com/2026/10/14/typesafe-ai-jev-1-14-images-box-long-context/); page returned 403, not verified).
- TypeSafe says the model performs worse on images than on text alone and recommends against production use. — [Pasquale Pillitteri](https://pasqualepillitteri.it/en/news/26048/jev-1-14-image-input-box-typesafe-warns)
- Choice questions are not new: launch coverage on 2026-10-01 already lists Choice, Score and Noul. — [InfoQ 2026-10-01](https://infoq.com/news/2026/10/typesafe-ai-jev-released)
- Deprecation windows reported: 60 days for 1.13.0, 30 days for 1.14.0. — [Pasquale Pillitteri](https://pasqualepillitteri.it/en/news/26048/jev-1-14-image-input-box-typesafe-warns) (secondary)
- SDK changelogs exist at docs.typesafe.ai/sdk/python/changelog and /sdk/javascript/changelog (not fetched). A .NET SDK 0.7.0 community port has experimental images and Box ([daily.dev](https://daily.dev/posts/typesafe-jev-net-sdk-0-7-0-experimental-images-and-bounding-boxes-2iam0t7fa), search result only).

### Claim verdicts
- "More context": Partially true. Default 64k per request / 32k per question for both 1.13 and 1.14; opt-in header `TypeSafe-Danger-Zone-Long-Context: true` raises to 262k, slower and less accurate. — [docs Models](https://docs.typesafe.ai/models). Launch coverage on 2026-10-01 had said 32k context, so the default is larger than at launch. — [InfoQ](https://infoq.com/news/2026/10/typesafe-ai-jev-released)
- "Ability to choose": Not new (Choice from launch).
- "Bounding boxes": True, new in 1.14, experimental.
- "Pictures / take input as a picture": True, experimental, behind header.

### Inferences
- The user's claim is accurate in substance, but "new abilities" are labelled by the vendor as unstable. Do not build a hard dependency without a fallback.

### Gaps
- I did not retrieve TypeSafe's own 1.14 release post; version-history details come from the docs and secondary coverage.

## Image and Box specifics (limits, format, limitations)

### Takeaway
Images: PNG/JPEG, 280-1568 px per side, 16 MiB each, billed as ordinary input tokens. Box returns exactly one rectangle (edge fractions 0-1) plus confidence, never says "not found", and can miss small targets in large images. No GUI-grounding benchmark was found.

### Cited Findings
- Image limits: still PNG or JPEG; 16 MiB per image; width and height 280 to 1568 px each; total pixels 78,400 to 2,458,624; request body 32 MiB. Out-of-range images are rejected, not resized; one bad image fails the whole request. — [docs Images](https://docs.typesafe.ai/images). (madewithjev says 256 px minimum; docs say 280, trust docs.)
- Images go in a top-level `assets` map keyed by a reference string, placed in `state`, `instructions` or `criteria`. Asset fields: `type`, `part` (multipart), `data_base64`, `format`. Multipart recommended. — [docs Images](https://docs.typesafe.ai/images)
- Repeated images in instructions are sent once per question, so put shared images in `state`. — [docs Images](https://docs.typesafe.ai/images)
- Images count as input tokens and toward context; no separate image rate limit; guidance on estimating image tokens "forthcoming". — [docs Images](https://docs.typesafe.ai/images)
- EXIF orientation ignored; metadata stripped; rotate pixels first. — [docs Images](https://docs.typesafe.ai/images)
- Box request: `type: "box"`, `instructions` (a phrase is fine), no `criteria`. Response: `box` with `top`, `bottom`, `left`, `right` as fractions 0-1 from the top-left, plus `confidence` 0-1. Multiply by image width/height for pixels. — [docs Box](https://docs.typesafe.ai/primitives/box)
- Box limitations: always returns a box even if target absent; one box per question; small targets in large images can be missed (find region first, then ask on a crop); no recommended confidence threshold; accuracy not guaranteed and will shift with model updates; "Dreamer-ready", format may change. — [docs Box](https://docs.typesafe.ai/primitives/box)
- Recommended mitigation: pair with a Noul presence check, a Choice none/one/several ambiguity check, and edge-cut Noul checks on a crop. On 36 painting crops with part of the target cut off, four edge questions caught 30 cuts, one "all inside?" question 26, drawing the box on the full image and asking 20. — [docs Box](https://docs.typesafe.ai/primitives/box)
- Output is a rectangle, not a point or element ID. No point/click-coordinate output type is documented. — [docs Box](https://docs.typesafe.ai/primitives/box) (absence of mention)
- No ScreenSpot, ScreenSpot-Pro, OSWorld-G or other GUI benchmark found in any source searched (searches 2026-10-26). — see Gaps
- Builder-reported (not benchmarked): doorbell demo found 23 of 23 people versus 14 of 23 with the old pipeline, ~200 ms and ~$0.00008/event; a text-to-screenshot demo moves a crosshair to a named element; a signature-finding demo is described as prototype-only. — [madewithjev](https://madewithjev.com/jev-images)

### Inferences
- Because Box returns edge fractions of the image, a 1568 px cap forces downscaling or cropping of full 4K Windows screenshots, which hurts small UI targets. Tiling/two-stage (Choice over tiles, then Box on a crop) is the documented pattern.

### Gaps
- No quantitative UI/GUI grounding accuracy published by TypeSafe or independents. No image-token-count formula yet. Latency of image/Box calls not published.

## Latency, price, rate limits, availability, API shape

### Takeaway
Text calls are vendor-claimed 70-500 ms end to end, about $0.042/Mtok input with free output. Independent/user figures cluster around 76-300 ms. REST at `POST https://api.typesafe.ai/v1/systemone` with Python and JS SDKs; also on several gateways.

### Cited Findings
- Vendor claim: 70-500 ms end-to-end. Site demo: 0.114 s vs 8.566 s for LLM workflow (193.6x faster, 444.6x cheaper). — [typesafe.ai](https://typesafe.ai), [DataCamp](https://www.datacamp.com/blog/system-one-models-jev)
- Vendor benchmark per case: Jev ~$0.0004 and 0.4 s; GPT-5.6 Terra $0.0304 / 10.1 s; Sol $0.0836 / 23.3 s; Opus 5 $0.1761 / 37.8 s. — [DataCamp](https://www.datacamp.com/blog/system-one-models-jev)
- Independent-ish: an analysis of 12,759 launch tweets (OpenChamber) found median reported speedup 7x (not 193.6x), median cost savings 30x, median latency 76 ms, upper quartile 270 ms. A Vercel engineer found a safety classifier 5-18x faster than the LLM it replaced. — [InfoQ 2026-10-01](https://infoq.com/news/2026/10/typesafe-ai-jev-released). Vercel's CEO reported up to 18x faster at p95 in a security-check step. — [eesel 2026-09-21](https://www.eesel.ai/de/blog/jev-ultraschnell)
- Hacker News critique: speed comparison is apples-to-oranges because Jev skips generation. — [InfoQ](https://infoq.com/news/2026/10/typesafe-ai-jev-released), [eesel](https://www.eesel.ai/de/blog/jev-ultraschnell) (secondary; HN thread not read directly)
- Builder-reported: ~100 ms moderation, ~300 ms voice action, ~150-250 ms structured choice (legends-jev README, no method given), ~90 ms per decision in a computer-use loop with local CoreML/OCR feeding Jev text, 26 sheets in 2.9 s. — [DigitalOcean](https://www.digitalocean.com/resources/articles/what-is-jev), [legends-jev](https://github.com/avalonreset/legends-jev), [madewithjev](https://madewithjev.com/jev-images)
- Pricing: $0.042 per million input tokens (=$42 per billion), output free; no separate image fee. — [docs Models](https://docs.typesafe.ai/models), [docs Images](https://docs.typesafe.ai/images)
- Rate limits: per organization, tokens and requests per second; 429 on exceed; SDKs retry; actual numbers only in the developer console. — [docs Models](https://docs.typesafe.ai/models)
- Request rules: 32 MiB body, UTF-8 JSON, nesting 64 levels, gzip/zstd accepted; status codes 400/401/413/415/422/429/529. — [docs errors](https://docs.typesafe.ai/api/errors)
- API: `POST https://api.typesafe.ai/v1/systemone`, `Authorization: Bearer <key>`, body `{state, model, questions}`, response `{model, answers, usage}`. — [quickstart](https://docs.typesafe.ai/introduction/quickstart.md)
- SDKs: Python `pip install typesafe-sdk` (3.10+), JS/TS `npm install @typesafe-ai/sdk` (Node 20+), `new TypeSafeClient({defaultModel})`, `client.systemOne({state, questions})`; TS infers answer types. Callable from Node/Electron via fetch or the SDK. — [quickstart](https://docs.typesafe.ai/introduction/quickstart.md)
- Availability: early access / waitlist per DataCamp and eesel (Sept 2026); also on DigitalOcean Serverless Inference, Vercel AI Gateway, Netlify, OpenRouter, Cloudflare Workers AI, LangChain integration. — [DataCamp](https://www.datacamp.com/blog/system-one-models-jev), [DigitalOcean](https://www.digitalocean.com/resources/articles/what-is-jev), [InfoQ](https://infoq.com/news/2026/10/typesafe-ai-jev-released), [eesel](https://www.eesel.ai/de/blog/jev-ultraschnell). Current waitlist status as of 2026-10-26 not confirmed; the docs describe self-serve API keys in the console.
- Unverified: a search snippet cites a researcher at 32.8 ms/question on a T4 GPU; unclear which model; treat as unreliable. — search result 2026-10-26

### Inferences
- Realistic text-only latency to plan on is ~100-300 ms network round-trip. Image calls will likely be slower (more tokens, larger upload) but no figure exists.
- Cost is negligible versus VLM calls even for image-heavy use, but image token counts are unknown.

### Gaps
- No independent latency measurement for image or Box calls. No documented max output tokens.

## Known limitations and failure modes; independent evaluations

### Takeaway
Jev is weak on counting, arithmetic, dates, large noisy state, adversarial content, and favors the first choice option. Accuracy on TypeSafe's own benchmark roughly matches a mid-tier LLM. Independent evaluation is thin and mostly anecdotal.

### Cited Findings
- TypeSafe's own list for jev-1.13: literal reading, unreliable counting, hex/RGB/binary harder than semantic equivalents, not a calculator, dates treated as text, double negatives/multi-hop hurt, large state with irrelevant content hurts, adversarial content not treated as hostile, contradictory criteria hurt, tends to favor the first option, cannot generate text. — [docs jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13)
- Vendor four-workflow benchmark: Jev 67.8% agreement with reference answers vs GPT-5.6 Terra 67.9%, Sol 74.1%, Claude Opus 5 73.1%. Benchmarks are TypeSafe-written; references come from OpenAI/Anthropic models; no independent reproduction. — [DataCamp](https://www.datacamp.com/blog/system-one-models-jev)
- No rationale output, cannot audit; does not call tools; only fits tasks where answer space is known; using it to compact a coding agent's context can discard prompt-cache savings. — [DigitalOcean](https://www.digitalocean.com/resources/articles/what-is-jev)
- Bryo AI CTO: Gemini slightly more accurate on email classification but 10-20x more expensive. Armin Ronacher: design shifts hallucination risk to user's threshold choice. — [InfoQ](https://infoq.com/news/2026/10/typesafe-ai-jev-released)
- Image-specific: confidence is a statistic of the answer distribution, not an independent check of the image; misreads upstream can be routed confidently; calibrate thresholds on own labelled cases; test a plain VLM baseline first. — [madewithjev](https://madewithjev.com/jev-images)
- Community tool legends-jev (3 stars, 6 commits) treats image content as untrusted, states thresholds are "pilot review triggers, not calibrated safety guarantees", and does not capture screens or act. Its upstream findings doc was not retrievable. — [legends-jev](https://github.com/avalonreset/legends-jev)
- Vendor says 0% structured-output error rate (type guarantee is mathematically derived, not empirically measured). — [DataCamp](https://www.datacamp.com/blog/system-one-models-jev), [DigitalOcean](https://www.digitalocean.com/resources/articles/what-is-jev)

### Inferences
- Prompt-injection risk is directly relevant to screenshots: web page text can steer Jev's choices.

### Gaps
- No rigorous independent benchmark (no ScreenSpot-style or OSWorld results). Hacker News and Reddit threads were only seen via secondary summaries.

## Related TypeSafe offerings (Jev Router, agent integrations, case studies)

### Takeaway
Jev Router on OpenRouter routes a request to a model and reasoning effort, rather than being a UI-decision tool. Agent-related uses so far are tool-call screening and routing, not pixel-level control.

### Cited Findings
- Jev Router (listed on OpenRouter 2026-09-25) picks the best model and reasoning effort per request, balancing quality, speed and cost; no fixed price (billed at the serving model's price); context up to 1M tokens depending on the routed model; OpenAI-compatible. — [OpenRouter jev-router](https://openrouter.ai/typesafe/jev-router) (via search summary; page not fetched directly)
- A KuCoin flash item claims Jev Router solved 82% more tasks than OpenRouter's Auto Router; low-quality source, unverified. — [KuCoin](https://www.kucoin.com/news/flash/openrouter-integrates-jev-router-to-optimize-model-switching-and-cache-loss)
- LangChain integration includes AutoMode middleware that screens tool calls; pi-warden uses Jev to block unsafe shell commands in coding agents at ~250 ms (secondary). — [InfoQ](https://infoq.com/news/2026/10/typesafe-ai-jev-released)
- Smart home assistant demo exists in docs; Doom demo reacts to game state ~10 Hz. — [docs llms.txt](https://docs.typesafe.ai/llms.txt), [DataCamp](https://www.datacamp.com/blog/system-one-models-jev)

### Gaps
- Jack & Jill case study and any official TypeSafe computer-use demo were not found/checked. Jev Router docs page (openrouter.ai/docs/guides/community/jev) not read.

## Honest assessment for a Windows screenshot-to-action agent

### Takeaway
Jev is a plausible fast replacement for narrow gating/routing decisions, mainly when fed text (OCR, UIA/accessibility tree, detected-element lists). Direct screenshot grounding with Box is experimental, unbenchmarked for GUIs, and returns a forced rectangle. Keep a VLM fallback.

### Cited Findings
- Documented evidence for the pattern "local detection/OCR feeds text to Jev": builder reports ~90 ms per decision in a computer-use loop. — [madewithjev](https://madewithjev.com/jev-images) (self-reported)
- Box docs recommend Noul presence check, Choice for region finding, crop-and-re-ask. — [docs Box](https://docs.typesafe.ai/primitives/box)

### Inferences (my judgment, not sourced)
Good fits (text or small-image state, closed answer set, calibrated threshold, escalate to VLM when low):
- "Which lane/tool handles this request?" (Choice over text; strongest fit).
- "Which of these detected/enumerated UI elements matches the goal?" Give elements as a JSON list (id, role, name, text) from UIA or an element detector; Choice over IDs. Keep lists short (large state and first-option bias are documented weaknesses; shuffle order).
- "Is the page loaded / dialog present / error shown?" as Noul over OCR text or UIA tree, or over a small image. Cheap to ask many in one batched call.
- "Did the action succeed?" Noul with before/after text diffs; avoid raw pixel comparisons.
- Escalation gate: use confidence to decide VLM fallback.

Poor fits:
- Precise click coordinates from a full-resolution screenshot: Box gives one rectangle, no not-found, 1568 px cap, small targets missed, experimental, no GUI benchmark. Use a dedicated detector or UIA bounds, then use Jev only to choose among them.
- Counting, date/time comparison, arithmetic, reading exact numbers or hex colors.
- Anything requiring generation (typing text, planning multi-step), explanation, or tool execution.
- Untrusted page content where injected text could sway decisions without a separate guard.
- Production reliance on image/Box/long context while TypeSafe labels them unsafe for production.

Practical notes: send via fetch to `/v1/systemone`; pin `jev-1.14.0` rather than `jev-latest`; calibrate thresholds on your own labelled screenshots; benchmark against a small VLM baseline before committing.

### Gaps
- No evidence on Windows-specific use, no public OSWorld/ScreenSpot numbers, no measured image-call latency.
