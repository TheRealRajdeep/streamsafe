# StreamSafe — Implementation Checklist

Handoff document. A fresh agent should be able to pick up the work from this file plus the code in `chrome-extension/`. Full design rationale: `plan.md`. Work top to bottom. Tick a build item when it's implemented; tick a step's **Acceptance** box only after that check actually passes. Record results where the checklist asks.

---

## 0. Context (read first)

**What we're building:** a Chrome extension (MV3) that, on **Twitch live streams**, **beeps profanity in the streamer's audio** before the viewer hears it, and **masks profanity in Twitch chat**. Profanity is judged **in context** by an AI classifier (TypeSafe **Jev**), with a word list only as a fallback. Hackathon demo, 4-hour budget.

**What's already proven (by a feasibility spike on live Twitch; the spike folder has since been removed and its code lives on in `chrome-extension/`):**
| Fact | Measured |
|---|---|
| Hooking the player's Web Worker `fetch` captures every media segment before it plays | 85/85 segments |
| Segments are MPEG-TS, AAC audio (ADTS, stream type `0x0F`), ~2s each (playlist says target 6s — ignore that) | 0 decode failures |
| Decode time per segment | ~13ms |
| `video.currentTime − segmentPTS` is a constant offset per session (found by loudness cross-correlation) | MAD ≈ 5ms |
| The offset **differs every session** (seen −11702s, −8098s, −8665s) → must calibrate each page load | — |
| Head start (download → heard) with low-latency OFF | ~3.3s |
| Head start with Twitch low-latency ON | **−1.25s (unusable)** |
| Head start with low-latency ON **and `#EXT-X-TWITCH-PREFETCH` lines stripped** from playlists | **~5.4s** ✅ |

**Scope decisions (do not expand):**
- Twitch **live** only, `https://www.twitch.tv/*`. Native Twitch chat only (7TV unsupported).
- **Profanity only, moderate + severe:** ass, asshole, bitch, bastard, shit, bullshit, fuck (all forms), motherf-, dick / cock / pussy (vulgar sense), cunt, prick, twat, wanker, slut, whore, jackass, dumbass — plus disguised/censored forms (`f***`, `fvck`, `sh1t`, `a$$`, spaced letters) and cut-off swears (`son of a b—`).
- **Not blocked:** damn, hell, crap, piss, "oh my god", stupid, sucks, shut up, idiot.
- Audio action: **beep** (1 kHz tone, stream muted under it). Chat action: **mask word as `****`** (never remove whole messages).
- Failure policy: **fail-open with word-list safety net.** Classifier late/failed → word list decides. STT failed → chunk plays unfiltered, badge warns.
- No presets, no other categories, no parental lock, no VOD support, no backend.

**Out of scope — do not build:** presets/strictness levels, slurs/sexual/bullying/self-harm categories, 7TV/BTTV support, VODs/clips, YouTube/Kick, PIN/anti-uninstall, on-device models, accounts/backend, Web Store packaging.

---

## 1. Ground rules

- Plain JavaScript, Manifest V3, **no build step, no npm deps** in the extension.
- Extension lives in a new folder: `chrome-extension/`. The original spike is gone; don't recreate it.
- API keys are entered in the popup and stored in `chrome.storage.local`. **Never hard-code or commit keys.**
- All network calls to Deepgram / TypeSafe / Anthropic happen in the **service worker** (`background.js`), never in the page (Twitch CSP blocks them, and keys must stay out of the page).
- Page-world code cannot use `chrome.*`. It talks to `bridge.js` (isolated world) via `window.postMessage`; the bridge relays to the service worker via `chrome.runtime.sendMessage`.
- Every page-world log line starts with `[streamsafe]`.
- Run `node --check <file>` on every JS file you touch.

### Gotchas learned in the spike
- The Worker hook **must** run in the MAIN world at `document_start`, or Twitch creates its worker first. Some workers fail to hook (`blob:… ERR_FILE_NOT_FOUND` in console) — harmless, the video worker hooks fine.
- Twitch/7TV swallow normal `click`s on injected UI. Handle UI clicks with a **`window` capture-phase `pointerdown`** listener registered at `document_start` (see spike `mountHud` / the `window.addEventListener('pointerdown', …, true)` block).
- `createMediaElementSource(video)` reroutes all audio through the AudioContext. If the context is **suspended**, the stream goes **silent**. Only attach after a user gesture and confirm `ctx.state === 'running'`.
- Cross-correlation produces occasional false matches (low score, wildly wrong lead). Only trust matches with **score ≥ 0.9** and use the **median** of recent offsets.
- Pick the player video with `findPlayerVideo()` (largest `<video>` with `readyState > 0`), not `querySelector('video')`.

### Where the spike code lives now
| Function / block | File |
|---|---|
| `forwardSegment`, `stripPrefetch`, `workerPrelude`, `HookedWorker`, main-world `fetch` patch | `hook.js` |
| `isTs`, `demuxTs`, `readPts`, `splitAdts`, `decodeAdts` (+ WebCodecs fallback), `buildWindow` (overlap) | `audio.js` |
| `envelope`, `meanStd`, `tryMatch`, `findPlayerVideo`, calibration tap, beep scheduler | `sync.js` |
| `concatBytes`, `concatFloat`, `median`, `toBase64`, `rpc` | `util.js` |

---|---|---|
| `forwardResponse` | ~51 | `hook.js` |
| `workerPrelude` (incl. prefetch stripping) | ~71 | `hook.js` (make stripping unconditional) |
| `readSync`, `HookedWorker`, main-world `fetch` patch | ~98–145 | `hook.js` |
| `sniff` | ~191 | `audio.js` |
| `demuxTs`, `readPts` | ~249, ~295 | `audio.js` |
| `decodeAdts`, `decodeContainer`, `decodeAdtsWebCodecs`, `AAC_RATES` | ~300–355 | `audio.js` |
| `envelope`, `meanStd`, `tryMatch`, live capture in `startMeasuring` | ~416–535 | `sync.js` |
| `findPlayerVideo` | ~435 | `sync.js` |
| `concatBytes`, `concatFloat` | ~681 | shared utils |

---

## 2. Architecture

```
PAGE (MAIN world, document_start)              ISOLATED world        SERVICE WORKER
 hook.js     Worker+fetch hook, strip prefetch
 util.js     concatBytes, concatFloat, log
 wordlist.js normalize(), isProfane(), STOPWORDS
 audio.js    sniff, demuxTs → {adts, pts}, overlap, decode
 sync.js     AudioContext graph, calibration, beep scheduler
 chat.js     chat observer, blur/mask
 badge.js    on-player overlay
 main.js     orchestration  ──postMessage──►  bridge.js ──runtime──►  background.js
                            ◄──────────────             ◄──────────   transcribe / classify / settings
```

### Page ⇄ bridge message protocol
Page → bridge: `window.postMessage({ __ss: 'req', id, type, payload }, '*')`
Bridge → page: `window.postMessage({ __ss: 'res', id, ok, result | error }, '*')`
Bridge → page (push): `{ __ss: 'settings', settings }` on load and on `chrome.storage.onChanged`.
Page → bridge (fire-and-forget): `{ __ss: 'stats', delta }` → bridge adds to counters in storage.

`type` values: `transcribe` (payload `{ adtsB64 }`), `classify` (payload `{ state, candidates: [{ id, word, snippet }] }`).
Bridge forwards to `chrome.runtime.sendMessage({ type, payload })`; background replies via `sendResponse` (return `true` from the listener for async).

### Settings (`chrome.storage.local`)
`{ enabled: true, deepgramKey, typesafeKey, anthropicKey, classifier: 'jev' | 'haiku', threshold: 0.5, stats: { beeped, chatMasked, chunks, sttFail, classifierLate } , lastError }`

---

## 3. Steps

> **Status (2026-10-10):** code for Steps 1–7 is written in `chrome-extension/`; offline checks pass (`npm run check`: syntax, word list, TS demux + overlap windows on ffmpeg segments, prefetch stripping).
> **Live test (2026-10-10):** user confirmed on Twitch — beeps over swears, chat masking, badge/popup/toggle all working (Steps 2, 4, 6, 7 accepted). Still open: 5a (see Jev `changes` in console), 5b (Haiku switch), Step 8, demo-day.
> **How to read the boxes:** `[x]` on a build item = implemented. Each step's **Acceptance** box is ticked only after its live/benchmark check passes. Next: Step 1 gate (`npm run bench` with keys in `.env`), then Step 2 + Step 4 acceptance on Twitch.
>
> **Deviations from the text below:**
> - Chat only blurs messages containing *suspicious* tokens (word-list hit, masked form, or a profanity root inside a word like "class"); clean messages are never delayed. Spaced letters (`f u c k`) become one candidate.
> - AudioContext also auto-starts once the page has had any user interaction (`navigator.userActivation.hasBeenActive`).
> - `hook.js` only forwards segments (no `onPlaylist`); prefetch stripping happens inside the worker.
> - Haiku call uses `max_tokens: 400` and no `temperature`.
> - Overlap/ownership logic lives in `audio.js` `buildWindow()`; per-chunk logs come from `main.js` as `[streamsafe] chunk {stt, classifier, slack, words, beep, changes}`.
> - Page-side timeouts (classify 3.5 s, chat 3.5 s) are longer than the background's (2.9 s) so real errors reach the page; background logs every `transcribe`/`classify` with timing in the service-worker console.
> - Keys can also be loaded from `chrome-extension/.env` (gitignored) on install/startup, filling only empty popup fields.

### Step 0 — Prerequisites (user)
- [x] Deepgram API key (console.deepgram.com).
- [x] TypeSafe API key (for Jev).
- [x] Anthropic API key (Haiku fallback).
- [ ] Separate Chrome profile **without 7TV** (or 7TV disabled).
- [x] Node 20+ installed (`node -v`) — v24.16.0.

### Step 1 — Jev benchmark & go/no-go (≤15 min)
- [x] Create `chrome-extension/bench/jev-bench.mjs` (Node 20, built-in `fetch`, key from `TYPESAFE_API_KEY` env var). Keys load from `chrome-extension/.env`; run `npm run bench`.

API facts (from docs.typesafe.ai):
- `POST https://api.typesafe.ai/v1/systemone`, headers `Authorization: Bearer <key>`, `Content-Type: application/json`.
- Body: `{ "model": "jev-latest", "state": <string>, "questions": { <id>: { "type": "noul", "instructions": <string> } } }`.
- Response: `{ model, answers: { <id>: { type: "noul", noul: <0..1> } }, usage }`. Errors: 401 key, 422 validation, 429 rate limit, 529 overloaded.
- Questions in one call run **in parallel**. Jev **cannot extract spans or count** → identify the candidate word by quoting a snippet with the word wrapped in `>>…<<`, never by index.

Question template (use exactly this wording in the bench and in `background.js`):
```
In this snippet: "<6 words before> >><WORD><< <6 words after>"
Is the marked word profanity — a swear word or vulgar term (e.g. ass, bitch, shit, fuck, dick, pussy, cunt, bastard),
or a censored/disguised/cut-off version of one (e.g. f***, fvck, sh1t, "son of a b-")?
Mild words (damn, hell, crap, piss), insults that aren't swears (stupid, idiot), names, places, food,
game terms, and normal words that merely contain or resemble a swear (class, assassin, Scunthorpe, cocktail, shiitake, Dick as a name)
are NOT profanity.
```
`state`: the sentence/transcript the snippet comes from.

Test set (each row = state, marked word, expected):
| State | Word | Expected |
|---|---|---|
| bro kicked my ass in that round | ass | yes |
| what the fuck was that play | fuck | yes |
| this boss is f***ing hard | f***ing | yes |
| that was so fvcking clean | fvcking | yes |
| oh sh1t he's behind us | sh1t | yes |
| you son of a b | b | yes |
| he's being a dick right now | dick | yes |
| what the hell was that | hell | no |
| damn that was close | damn | no |
| this crap loot again | crap | no |
| I'm reading Dick Grayson comics | Dick | no |
| the assassin hid in the bushes | assassin | no |
| I have class tomorrow | class | no |
| we ordered a cocktail | cocktail | no |
| shiitake mushrooms are great | shiitake | no |
| the rooster, a cock, crowed at dawn | cock | no |

Run: (a) all 16 as one call → latency + accuracy at threshold 0.5; (b) 10 calls with 5 questions; (c) 10 calls with 20 questions. Print p50/p95 latency and confusion counts. Also run the same set through the word list from Step 3 (`wordlist.js`) for the pitch comparison.

- [x] **Acceptance / gate:** record below. Use **Jev** if p50 ≤ 1.5s and ≥ 14/16 correct; otherwise use **Haiku** (Step 5b) and set `classifier: 'haiku'` as the default.

```
Jev p50 (5q): 927 ms   p95: 2378 ms
Jev p50 (20q): 714 ms  p95: 1328 ms
Jev accuracy: 16/16   best threshold: 0.5   (all 16 in one call: 2390 ms)
Haiku: 16/16 but ~5.5 s per call, and a later call returned no JSON → too slow, fallback only
Word list accuracy: 13/16  (misses "son of a b"; false positives "Dick" Grayson, rooster "cock")
Decision: Jev (audio classifier timeout raised 2.5 s → 3 s because of the 2.4 s p95)
```

### Step 2 — Scaffold `chrome-extension/`
- [x] `manifest.json`:
  - `manifest_version: 3`, name "StreamSafe", `permissions: ["storage"]`, `host_permissions: ["https://api.deepgram.com/*", "https://api.typesafe.ai/*", "https://api.anthropic.com/*"]`.
  - `background: { service_worker: "background.js" }`, `action: { default_popup: "popup.html" }`.
  - content script 1: `matches: ["https://www.twitch.tv/*"]`, `world: "MAIN"`, `run_at: "document_start"`, `js: ["util.js", "hook.js", "wordlist.js", "audio.js", "sync.js", "chat.js", "badge.js", "main.js"]` (same world, run in order, share globals via a `window.__ss` namespace object).
  - content script 2: same matches, isolated world, `run_at: "document_start"`, `js: ["bridge.js"]`.
- [x] `hook.js`: port Worker/fetch hook from the spike. Prefetch stripping **always on** (drop the localStorage toggle). Instead of BroadcastChannel→HUD, deliver `{kind:'segment', buf, tDone}` and `{kind:'playlist', text}` to `window.__ss.onSegment` / `onPlaylist`.
- [x] `util.js`: `concatBytes`, `concatFloat`, `log`.
- [x] `bridge.js`, `background.js`, `popup.html`, `popup.js` skeletons with the protocol above. Popup: enable toggle, three key inputs (password type), classifier select (Jev/Haiku), stats display, last error, "Reset stats".

- [x] **Acceptance:** loads unpacked without errors; on a live Twitch page, the StreamSafe badge appears over the player; with a Deepgram key saved, console shows `[streamsafe] chunk {…}` logs (~1 every 2s); popup saves and reloads keys.

### Step 3 — Word list (`wordlist.js`)
- [x] `normalize(token)`: lowercase; strip punctuation at edges; map leetspeak `0→o 1→i 3→e 4→a 5→s 7→t @→a $→s !→i`; map common Unicode homoglyphs (Cyrillic а/е/о/р/с/х, `ƒ→f`, accented vowels → base); collapse 3+ repeated letters to 2 (`fuuuuck→fuuck`), then also test with 1.
- [x] `isProfane(token)`: match normalized token against **roots with allowed suffixes** (whole-token match, never substring — avoids Scunthorpe/assassin/class): `fuck|fuk|fck|fvck` (+ing/in/ed/er/ers/s/off/face/wit), `motherfuck*`, `shit|sh1t` (+ty/s/ting/head/show), `bullshit`, `ass` (exact) `asshole(s)`, `dumbass`, `jackass`, `bitch(es|ing|y)`, `bastard(s)`, `dick(s|head)`, `cock(s|sucker)`, `pussy|pussies`, `cunt(s)`, `prick(s)`, `twat(s)`, `wanker(s)`, `slut(s)`, `whore(s)`.
- [x] Masked forms: token matching `/^[a-z]\*{2,}[a-z]*$/` whose first letter is one of `f s b c d a` → profane (`f***`, `f***ing`, `s**t`).
- [x] `STOPWORDS`: ~150 most common English words (the, a, is, my, in, that, you, …) — skipped as classifier candidates.

- [x] **Acceptance:** `node` one-liner over the Step 1 test set: all "no" rows return false except possibly `cock`/`Dick` (word-list false positives are expected — that's the pitch); all "yes" rows except `b` return true. Record word-list accuracy in Step 1. ✅ Verified by `npm run check` and `npm run bench` (13/16).

### Step 4 — Audio path with word list only (milestone)
- [x] `audio.js`: `sniff`, `demuxTs` → `{ adts, ptsSec }`. Split ADTS into frames (frame length from header, see `decodeAdtsWebCodecs`). Keep the last ~1.0s of frames from the previous segment; send `overlapFrames + currentFrames`. Window start PTS = `ptsSec − overlapDuration` (overlap duration = frames × 1024 / sampleRate). Ownership: this window owns words whose absolute start ∈ `[ptsSec − 0.5, ptsSec + segDur − 0.5)`; the last 0.5s is owned by the next window.
- [x] Also `decodeAdts(currentOnly)` → PCM for calibration (same as spike).
- [x] `background.js` `transcribe`: `POST https://api.deepgram.com/v1/listen?model=nova-3&punctuate=true&profanity_filter=false&language=en`, headers `Authorization: Token <key>`, `Content-Type: audio/aac`, body = ADTS bytes (decode base64). Return `results.channels[0].alternatives[0].words` as `[{ word, punctuated_word, start, end, confidence }]`. 5s timeout via `AbortController`.
- [x] `sync.js`:
  - On first window-capture `pointerdown` (or keydown): create `AudioContext`, `await ctx.resume()`, then `src = createMediaElementSource(findPlayerVideo())`. Graph: `src → censorGain → destination`; `src → ScriptProcessor(4096) → zeroGain → destination` (calibration tap, **before** censorGain); `OscillatorNode(1000 Hz, started once) → beepGain(0) → destination`.
  - Calibration: port `envelope` / `meanStd` / `tryMatch`. Each decoded segment's envelope goes to `pending`. Keep offsets from matches with score ≥ 0.9; `offset = median(last 10)`. Expose `calibrated` once ≥ 2 matches agree within 50ms.
  - `toVideoTime(pts) = pts + offset`.
  - Scheduler every 100ms: for each block `{ vStart, vEnd }` not yet scheduled with `vStart − video.currentTime < 0.6`: `t0 = ctx.currentTime + (vStart − 0.08 − video.currentTime) / video.playbackRate`, `t1 = … (vEnd + 0.08) …`; `censorGain.gain.setValueAtTime(0, t0)`, `beepGain.gain.setValueAtTime(0.3, t0)`, then both back at `t1`. Skip blocks already in the past.
  - On `pause` / `seeking` / `ratechange`: `cancelScheduledValues(ctx.currentTime)`, reset gains to 1/0, mark future blocks unscheduled.
- [x] `main.js`: segment → demux → (parallel) decode for calibration + `transcribe` → owned words → `isProfane` → blocks (`pts = windowStartPts + word.start/end`) → `sync.schedule()`. Log per chunk: `stt ms`, `slack ms` = (video time when the chunk starts playing − now). Increment stats via bridge.

- [x] **Acceptance:** on a sweary live channel, after one click on the page: console shows `calibrated offset …`, `slack` stays positive (expect ~2–4s), and you **hear beeps over swear words**, aligned within ~0.1s. Audio is otherwise unchanged.

### Step 5a — Jev classifier (if chosen in Step 1)
- [x] `background.js` `classify({ state, candidates })` → one Jev call: one `noul` question per candidate, id = candidate id, instructions = Step 1 template with that candidate's snippet. Return `{ [id]: probability }`. Timeout 2.5s.
- [x] `main.js`: candidates = owned words not in `STOPWORDS` (plus any word `isProfane` flagged). `state` = last ~30s of transcript. Snippet = 6 words before + `>>word<<` + 6 after (span chunk boundaries using the transcript history).
- [x] Merge rule: word-list blocks are scheduled **immediately**. When Jev returns in time: `p ≥ threshold` → ensure block exists; `p < threshold` → remove the word-list block if it hasn't started. Late/failed → keep word-list result, `stats.classifierLate++`.
- [x] Log per chunk: `jev ms`, and every word Jev disagreed with the word list on (`+ added`, `− cleared`).
- [x] Popup counters **Jev caught (word list missed)** / **Jev cleared (false alarms)** (`stats.jevAdded` / `jevCleared`), counted for both audio and chat — visible proof for the pitch.

- [ ] **Acceptance:** slack stays positive with Jev in the loop; console shows Jev clearing at least one word-list false positive or adding a swear the list missed during ~10 min of a sweary stream (or reproduce by testing the bench sentences).

### Step 5b — Haiku fallback (same interface)
- [x] `classify` with `classifier === 'haiku'`: `POST https://api.anthropic.com/v1/messages`, headers `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true`, `content-type: application/json`. Model `claude-haiku-5-5`, `max_tokens: 200`, `temperature: 0`. System prompt = the Step 1 definition; user message = state + numbered candidate snippets; ask for **JSON only**: `{"<id>": <0..1>, …}`. Parse defensively (extract first `{…}`); on parse failure treat as late.

- [ ] **Acceptance:** switching the popup classifier to Haiku keeps beeping working with positive slack.

### Step 6 — Chat filter (`chat.js`)
- [x] Observe `.chat-scrollable-area__message-container` (re-attach if Twitch re-renders; poll every 2s for the container).
- [x] For each new `.chat-line__message`: collect its `.text-fragment` spans; immediately set `filter: blur(4px)` on them.
- [x] Batch every 700ms: all pending messages → one `classify` call (candidates = non-stopword tokens + word-list hits, ids `m<msg>_w<i>`, `state` = the message text, snippet = the message with the token marked).
- [x] Apply: replace flagged tokens' text with `*` × length (keep emotes/mentions untouched), unblur. Timeout 3s → mask word-list hits only, unblur. Count `stats.chatMasked`.

- [x] **Acceptance:** in a busy chat, messages blur briefly (<1.5s) then appear; swears (incl. `fvck`, `sh1t`) are masked; "class", "assassin" and "what the hell" are untouched. No chat lag build-up over 5 min.

### Step 7 — Badge & popup polish
- [x] `badge.js`: small overlay in the player's top-left (position relative to `findPlayerVideo()` rect, update on resize). States: `🛡 StreamSafe — click the page to enable` → `calibrating…` → `🛡 StreamSafe on`. On each beep, flash for 1.5s: `🔇 "…what the f*** was…"`. Warnings: `⚠ speech-to-text failing`, `⚠ classifier slow — using word list`.
- [x] Popup shows live stats (beeped words, chat words masked, chunks processed, STT failures, classifier late) and `lastError`; enable toggle actually disables all filtering (hook stays, nothing scheduled, chat untouched).

- [x] **Acceptance:** badge visible and readable over the video; counters move while watching; toggling off stops beeps within one chunk.

### Step 8 — Live tuning (remaining time)
- [ ] Watch 10+ min of 2 sweary streamers. Tune: `threshold`, beep padding (±80ms), Jev timeout, chat batch interval.
- [ ] Check an ad break: calibration recovers (offset median re-stabilizes) within ~20s after.
- [ ] Record the Step 1 table numbers + 2–3 good live examples for the pitch.

---

## 4. Known accepted gaps
- First ~8s after enabling are unfiltered (calibration needs matched chunks).
- Ad breaks / quality switches may cause a brief recalibration window.
- Words cut exactly at a window boundary are mitigated by the 1s overlap, not eliminated.
- Requires one user click per page load (browser autoplay policy for AudioContext).
- Stream is ~5s behind live (prefetch stripping) — intended.

## 5. Demo-day checklist
- [ ] Clean Chrome profile, 7TV off, extension loaded unpacked, keys entered, classifier set per Step 1.
- [ ] 2–3 sweary streamers likely live during the demo slot, tabs pre-opened.
- [ ] Click the page once → badge shows `🛡 StreamSafe on` before presenting.
- [ ] Popup stats reset before the demo; DevTools console open on a second screen showing per-chunk `stt / jev / slack` logs.
- [ ] Pitch slide: word list vs Jev accuracy from Step 1.
