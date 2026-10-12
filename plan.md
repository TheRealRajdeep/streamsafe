# Plan: Earmuffs — smart Twitch profanity censor (4-hour hackathon build)

## Context
Kids watch Twitch streamers who swear constantly. Existing tools only work from captions (which live streams lack) and use dumb word lists. We proved in a feasibility spike (folder since removed; its code now lives in `chrome-extension/`) that we can:
- capture Twitch HLS chunks from the player's worker before they play (85/85, MPEG-TS, AAC audio),
- decode them in ~13ms,
- map chunk PTS → `video.currentTime` with a stable offset (MAD ≈ 5ms, via envelope cross-correlation),
- force a ~5.4s head start by stripping `#EXT-X-TWITCH-PREFETCH` from playlists (works even with Twitch low-latency ON).

Goal: a live demo on a real Twitch stream where profanity in the streamer's audio gets **beeped** and chat profanity gets masked, decided **in context** (not a plain word list).

## Decisions (from interview)
- Hackathon demo, **4 hours, solo**. No backend; API keys pasted into the popup.
- **Live streams only**.
- Scope: **profanity only, moderate + severe**: ass, bitch, shit, f-word, dick/cock/pussy (vulgar sense), bastard, motherf-, etc. + variants and censored/disguised forms (`f***`, `fvck`, `sh1t`, cut-off `son of a b—`). **Not blocked:** damn, hell, crap, piss, oh my god, stupid, sucks, shut up. No presets, no other categories (slurs/sexual/bullying/self-harm → future scope).
- Audio action: **beep**.
- Chat: blur while checking (~1s), then show or mask profane words.
- Failure: **fail-open + word-list safety net** (late classifier → word list decides; STT failure → chunk plays unfiltered, badge warns).
- UI: **on-player live badge** + popup (on/off, keys, counters).
- **Native Twitch chat only**; demo in a clean Chrome profile without 7TV.
- STT: **Deepgram** `nova-3` (word timestamps).
- Classifier: **TypeSafe Jev** (primary) — see below; Claude Haiku kept as a drop-in fallback behind the same function.

## Why Jev, and how it fits
From docs.typesafe.ai: Jev is a "System One" classifier. `POST https://api.typesafe.ai/v1/systemone` with `Authorization: Bearer <key>`, body `{state, model: "jev-latest", questions: {id: {type: "noul"|"choice"|"score", instructions, criteria?}}}`. Returns typed answers (`noul` = probability 0–1) — no text parsing. All questions in a call are **evaluated in parallel**, so many questions ≈ one question's latency.
- Fits well: our decision is a narrow yes/no per word, with calibrated probability we can threshold.
- Limits that shape the design: it **cannot extract spans/positions** and **doesn't count reliably** (docs: use regex/code for candidates, let Jev decide). Text only. No published latency numbers, max questions, or CORS notes.
- Design: **code picks candidate words, Jev judges each one** (one `noul` per candidate, all in one call). The candidate is identified by quoting a short snippet with the word marked (`…what the >>hell<< is that…`) in the question — never by index.
- CORS is irrelevant: calls go from the extension service worker with `host_permissions`.
- **Gate:** first 15 min of the build is a latency/accuracy benchmark. If Jev p50 > ~1.5s or it fails the test sentences, swap to Haiku (same `classifyWords()` interface).

## Architecture (plain JS, MV3, no build step)
```
page world (MAIN, document_start)          isolated world         service worker
 hook.js   Worker/fetch hook, strip prefetch
 audio.js  TS demux → ADTS + PTS ─────────► bridge.js ──────────► background.js
 sync.js   offset calibration + beep sched   (postMessage ⇄       Deepgram /v1/listen (audio/aac)
 chat.js   MutationObserver, blur/mask        chrome.runtime;     Jev /v1/systemone (Haiku fallback)
 badge.js  live block badge                   settings relay)
 main.js   orchestration
```
- API calls go through the service worker (page CSP would block them; keys stay out of the page). ADTS bytes sent base64.
- Settings in `chrome.storage.local`, relayed to the page by `bridge.js`.

## Files (new folder `chrome-extension/`)
- `manifest.json` — MV3; MAIN-world content scripts `[hook.js, wordlist.js, audio.js, sync.js, chat.js, badge.js, main.js]` at `document_start` on `https://www.twitch.tv/*`; isolated `bridge.js`; `background.js`; popup; `host_permissions` for `api.deepgram.com`, `api.typesafe.ai`, `api.anthropic.com`.
- `hook.js` — lifted from the spike: `forwardResponse`, `workerPrelude`, `HookedWorker`, main-world fetch patch; prefetch stripping **always on**.
- `audio.js` — reuse spike `demuxTs`, `readPts`, `concatBytes`, `decodeAdts`/`decodeContainer`/`decodeAdtsWebCodecs`. Prepends last ~1s of ADTS frames from the previous chunk (overlap so boundary-cut words are caught; a chunk owns words starting in `[start−0.5s, end−0.5s)`).
- `sync.js` — reuse spike `envelope`, `meanStd`, `tryMatch`, `findPlayerVideo`, live capture (tap `MediaElementSource` *before* the censor gain). Offset = median of recent matches with score ≥ 0.9. Graph: `source → censorGain → destination` + `oscillator(1kHz) → beepGain → destination`. Scheduler (100ms loop): blocks starting < 600ms away get `setValueAtTime` on AudioContext time (stream gain 0, beep 0.3, ±80ms padding). Cancel on `pause`/`seeking`/`ratechange`. AudioContext created on first user `pointerdown`; badge shows "click to enable" until then.
- `wordlist.js` — ~60 profanity roots + normalizer (leetspeak, spacing, repeated letters, unicode homoglyphs, `f***`-style). Also a stopword list to skip obviously clean words.
- `background.js` —
  - `transcribe(adtsB64)` → Deepgram `nova-3`, `punctuate=true`, `profanity_filter=false` → `{word,start,end}[]`.
  - `classifyWords({context, candidates})` → Jev: `state` = recent transcript (~30s, or chat message + a few prior messages); one `noul` per candidate: "In this speech, is the marked word >>X<< in '…snippet…' a swear word, vulgar term, or a disguised/partial version of one? (Not: a normal word that only looks similar, a proper noun, a place, a game term.)" → flag if `noul ≥ 0.5` (tune in benchmark). Haiku fallback implements the same signature.
  - Timeouts: 2.5s audio / 3s chat → word list decides.
- `main.js` — chunk pipeline: segment → demux (+decode for calibration) → transcribe → candidates = non-stopword words → word list flags instantly → Jev verdicts override (add or clear) if in time → PTS→video time → schedule beeps → badge + counters. Logs per chunk: `stt ms, jev ms, slack ms before play`.
- `chat.js` — observe `.chat-scrollable-area__message-container`; blur new `.chat-line__message` text, batch every 700ms (all messages' candidates in one Jev call), mask flagged words as `****`, unblur; timeout → word-list masking.
- `badge.js` — over the player: "🎧 Earmuffs", flashes `🔇 "what the f***"` per beep; warns on STT failure / not calibrated yet / no click yet.
- `popup.html/js` — enable toggle, Deepgram + TypeSafe (+ optional Anthropic) key fields, counters (beeped words, chat words masked), last error.

Known accepted gaps: first ~8s after enabling are unfiltered (calibration); ad breaks rely on rolling-median recalibration; 7TV unsupported.

## Handoff: `checklist.md`
The first deliverable after approval is `C:\Users\rajde\Desktop\streamsafe\checklist.md`, written so a fresh agent with no chat history can build the extension from it alone. Nothing else gets implemented in that step.

Contents:
- **Context block:** the goal, the decisions above, the proven spike numbers, and the key facts about Jev (endpoint, `noul` usage, no extraction/counting, snippet-with-`>>marker<<` rule).
- **Ground rules:** plain JS MV3, no build step; reuse the spike's functions; API keys only via popup/`chrome.storage.local`, never hard-coded; spike folder has since been removed.
- **Numbered steps** matching the build order below. Each step has a `- [ ]` checkbox, files to create/edit, the spike functions to reuse, exact behavior, and an **acceptance check** (command to run or what to see on Twitch) before ticking it.
- **Gate after step 1:** record Jev p50/p95 and test-set accuracy in the checklist, plus the Jev-vs-Haiku decision.
- **Known gaps / out of scope** list, so the agent doesn't wander (presets, other categories, 7TV, VODs, parental lock).
- **Demo-day checklist:** clean Chrome profile without 7TV, keys entered, sweary channel picked, click page once to enable audio.

## Build order (timeboxed)
1. **0:00–0:15** Jev benchmark script (Node, scratchpad): latency p50/p95 for 5 and 20 nouls; accuracy on test sentences. Decide Jev vs Haiku.
2. **0:15–0:45** Scaffold `chrome-extension/`, port spike hook/demux/sync, bridge + background, popup with keys.
3. **0:45–1:45** Audio path with **word list only**: chunk → Deepgram → word list → calibrated beep. *Milestone: live swears get beeped.*
4. **1:45–2:30** Jev classifier + merge.
5. **2:30–3:15** Chat filter.
6. **3:15–3:35** Badge + popup counters.
7. **3:35–4:00** Live testing on a sweary streamer, tune threshold/padding/timeouts.

If behind schedule: chat falls back to word list only (Jev audio is the headline).

## Verification
- Benchmark test set (also the pitch slide): "kick his ass" / "what the fuck" / "son of a b—" → beep; "this boss is f***ing hard" / "fvck" / "sh1t" → mask; "what the hell", "damn", "crap" → **no** (mild); "Dick Grayson", "the rooster (cock) crowed", "my dog had puppies, she's a good bitch"? (judgment—log only), "assassin", "class", "Scunthorpe", "cocktail", "shiitake" → no; "he's a dick" → beep. Report word-list vs Jev accuracy.
- `node --check` all scripts; reuse spike's ffmpeg-generated TS to test demux + overlap.
- Live: load unpacked in clean profile, enter keys, open sweary live channel, click page once. Console per chunk: slack must stay > 0. Beeps align with words; badge flashes; chat swears masked; popup counters increase.
