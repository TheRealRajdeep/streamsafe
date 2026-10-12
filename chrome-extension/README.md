# Earmuffs — Chrome extension

Manifest V3 extension that beeps profanity in **Twitch live** audio and masks it in chat. Plain JavaScript, no build step.

## Install

Earmuffs isn't on the Chrome Web Store, so you load it from source. It takes about five minutes. You don't need Node, npm, or a build step.

### What you need

- **Chrome**, or another Chromium browser such as Edge or Brave, version 111 or newer.
- **A Deepgram API key** (required). It turns stream audio into text. Sign up at [deepgram.com](https://deepgram.com); new accounts get free credit.
- **A TypeSafe API key** (recommended). It powers Jev, the classifier that judges each word in context ("hell" in "what the hell" vs. "Hell's Kitchen"). Get one at [typesafe.ai](https://typesafe.ai). Without it, Earmuffs falls back to the built-in word list.
- **An Anthropic API key** (optional). You only need it if you pick *claude haiku* as the classifier. It's too slow for live use, so most people can skip it.

### 1. Download the code

```bash
git clone https://github.com/TheRealRajdeep/earmuffs.git
```

Or, on the GitHub page, click **Code → Download ZIP** and unzip it. The extension is in the `chrome-extension` folder.

### 2. Load the extension

1. Open `chrome://extensions` in a new tab.
2. Turn on **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select the `chrome-extension` folder. Pick the folder itself, not the repo root and not a file inside it.
4. Earmuffs appears in the list. Click the puzzle-piece icon in the toolbar and pin it so the headphones icon stays visible.

### 3. Add your API keys

1. Click the Earmuffs headphones icon in the toolbar.
2. Open **settings & keys**.
3. Paste your **deepgram key** and **typesafe key** (and the anthropic key, if you have one).
4. Click **save**. The label next to *settings & keys* should read **keys set ✓**. If it says **keys missing!**, the Deepgram key or the key for the selected classifier is empty.

Keys are stored in the extension's local storage and only sent to their own APIs. Twitch pages never see them.

<details>
<summary>Alternative: load keys from a <code>.env</code> file</summary>

Copy `.env.example` to `.env` in the `chrome-extension` folder and fill it in, without quotes:

```
DEEPGRAM_API_KEY=...
TYPESAFE_API_KEY=...
ANTHROPIC_API_KEY=...
```

Then click the reload icon on the Earmuffs card in `chrome://extensions`. The extension copies these into any **empty** key fields when it's installed or reloaded. Keys you've already entered in the popup are kept. `.env` is gitignored.
</details>

### 4. Watch a stream

1. Open any **live** channel on [twitch.tv](https://www.twitch.tv).
2. **Click anywhere on the page once.** Browsers only allow audio processing after you interact with the page.
3. Watch the Earmuffs badge at the top-left of the player: *click the page to start* → *syncing with the stream…* → on. This takes about 10 seconds. Audio in that window isn't filtered yet.

Once it's on, swears in the audio are replaced with a beep and swears in chat are masked. The popup shows running counts, and the switch at the top turns filtering on or off.

### Things to know

- **Turn off 7TV and BetterTTV on Twitch.** They replace Twitch's chat, and the chat filter only works with the native chat. Disable them, or use a separate Chrome profile for Earmuffs.
- **Live streams only.** VODs and clips aren't filtered.
- **The stream runs ~5 s further behind live.** Earmuffs turns off Twitch's low-latency mode so it has time to hear each word before it plays.
- **API usage costs money.** Deepgram and TypeSafe bill per use. Turning Earmuffs off in the popup stops all API calls.

### Updating

Pull the latest code (`git pull`, or download the ZIP again into the same folder). Then click the reload icon on the Earmuffs card in `chrome://extensions` and refresh any open Twitch tabs. Your keys and settings are kept.

### Troubleshooting

| Symptom | Fix |
|---|---|
| Badge stuck on *click the page to start* | Click on the page (not just the video controls). |
| Badge stuck on *syncing with the stream…* | Make sure the stream is live and audio is playing (not muted in the Twitch player). Reload the page. |
| Badge says *reload the page to keep filtering* | Twitch swapped the player (raid, host, ad). Reload the page. |
| Nothing gets beeped | Open the popup: check for **keys missing!** or an error message, and that the switch is on. A rising **stt fails** count means the Deepgram key is wrong or out of credit. |
| Chat isn't masked | Disable 7TV / BetterTTV and reload. |
| Extension errors after updating | Reload it in `chrome://extensions`, then refresh Twitch tabs. |

For deeper debugging, see [Debugging on Twitch](#development) below.

## Architecture

Three Chrome contexts, because each can do something the others can't:

```mermaid
flowchart LR
    subgraph page["Twitch page — MAIN world (document_start)"]
        hook["hook.js<br/>Worker + fetch hook,<br/>strips low-latency prefetch"]
        audio["audio.js<br/>TS demux, ADTS frames,<br/>overlap windows"]
        main["main.js<br/>pipeline + merge"]
        sync["sync.js<br/>Web Audio graph,<br/>calibration, beeps"]
        chat["chat.js<br/>blur → classify → mask"]
        badge["badge.js<br/>on-player status"]
        words["wordlist.js<br/>normalize + match"]
        hook --> main
        main --> audio
        main --> sync
        main --> words
        chat --> words
        sync --> badge
    end
    subgraph iso["Isolated world"]
        bridge["bridge.js<br/>postMessage ⇄ runtime,<br/>settings without keys"]
    end
    subgraph sw["Service worker"]
        bg["background.js<br/>holds keys, stats"]
        cls["classifier.js<br/>Deepgram · Jev · Haiku"]
        bg --> cls
    end
    main <-->|"window.postMessage"| bridge
    chat <-->|"window.postMessage"| bridge
    bridge <-->|"chrome.runtime"| bg
    cls --> dg[("api.deepgram.com")]
    cls --> ts[("api.typesafe.ai")]
    cls --> an[("api.anthropic.com")]
```

- **MAIN world** is the only place that can patch Twitch's `Worker`/`fetch` and reach the `<video>` element, but it can't use `chrome.*` APIs.
- **The service worker** makes all network calls: Twitch's CSP would block them from the page, and the keys never enter the page.
- **The bridge** relays requests and pushes settings to the page — without the keys.

## Life of a chunk

```mermaid
sequenceDiagram
    autonumber
    participant P as Twitch player worker
    participant H as hook.js
    participant M as main.js
    participant B as bridge + service worker
    participant DG as Deepgram
    participant J as Jev
    participant S as sync.js
    P->>H: fetch() 2s MPEG-TS segment
    H->>M: segment bytes (~5.4s before playback)
    M->>M: demux AAC + prepend 1s overlap
    M->>B: transcribe(window)
    B->>DG: POST /v1/listen
    DG-->>B: words + timestamps
    B-->>M: words
    M->>S: word-list hits → beep blocks (instant)
    M->>B: classify(candidate words + snippets)
    B->>J: one noul question per word
    J-->>B: probability per word
    B-->>M: probabilities
    M->>S: add missed swears / cancel false alarms
    S->>S: 0.6s before playback: schedule gain=0 + 1 kHz beep
    Note over S: Word plays → beep instead
```

### Key ideas

| Problem | Solution | Where |
|---|---|---|
| Need audio *before* it plays | Wrap every Web Worker so its `fetch()` reports media segments as they download | `hook.js` |
| Low-latency mode plays chunks while they download (head start −1.25 s) | Strip `#EXT-X-TWITCH-PREFETCH` from playlists → player falls back to normal latency (head start ~5.4 s) | `hook.js` |
| Words cut at chunk boundaries | Each STT window = last 1 s of the previous chunk + this chunk; a window *owns* words starting in `[segStart−0.5, segEnd−0.5)` | `audio.js` `buildWindow` |
| Map chunk timestamps to playback time | Cross-correlate each chunk's loudness envelope with what the player actually outputs → `offset = currentTime − PTS` (stable to ~5 ms) | `sync.js` |
| Classifier can't locate words | Code picks candidate words; Jev answers one yes/no per word, identified by a snippet like `what the >>fuck<< was` | `main.js`, `classifier.js` |
| API slow or down | Word list decides instantly; Jev overrides only if it answers in time (fail-open) | `main.js`, `chat.js` |

## Decision flow per word

```mermaid
flowchart TD
    w["Transcribed word"] --> stop{"Stopword and<br/>not on the list?"}
    stop -->|"yes"| skip["Ignore"]
    stop -->|"no"| wl{"Word list hit?"}
    wl -->|"yes"| blk["Beep scheduled now"]
    wl -->|"no"| cand["Candidate only"]
    blk --> jev{"Jev answered<br/>within 2.9 s?"}
    cand --> jev
    jev -->|"no"| keep["Keep word-list result"]
    jev -->|"yes, p ≥ threshold"| beep["Beep<br/>(counts as 'Jev caught' if the list missed it)"]
    jev -->|"yes, p < threshold"| clear["No beep<br/>(counts as 'Jev cleared' if the list flagged it)"]
```

Chat follows the same rules, but only messages with *suspicious* tokens are blurred and checked (a list hit, a masked form like `f***`, or a swear root inside a word like "class"). Clean messages are never delayed.

## Badge states

```mermaid
stateDiagram-v2
    [*] --> ClickToEnable: page loads
    ClickToEnable --> Syncing: user clicks / page already interacted
    Syncing --> On: 2 chunks matched within 50 ms
    On --> On: beep → flashes the masked word
    On --> Stale: Twitch swapped the video element
    Stale --> [*]: reload page
```

## Files

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest: MAIN-world scripts in load order, isolated `bridge.js`, module service worker |
| `util.js` | Shared `window.__ss` namespace, RPC to the bridge, byte/base64 helpers |
| `hook.js` | Worker + fetch interception, prefetch stripping |
| `wordlist.js` | `normalize` (leetspeak, homoglyphs, repeats), `isProfane`, `isSuspicious`, stopwords |
| `audio.js` | MPEG-TS demux, ADTS framing/decoding, overlapping STT windows |
| `sync.js` | AudioContext graph, offset calibration, beep scheduler |
| `main.js` | Audio pipeline, word-list + Jev merge, per-chunk logs |
| `chat.js` | Chat observer, batching, masking |
| `badge.js` | Status badge over the player |
| `bridge.js` | Isolated-world relay; never exposes keys to the page |
| `background.js` | Service worker: keys, API calls, stats, `.env` import |
| `classifier.js` | Deepgram, Jev and Haiku clients (shared with the bench) |
| `popup.html` / `popup.js` | Keys, classifier, threshold, on/off, stats |
| `popup.css` | Popup styles — paper, ink borders, stickers (matches `landing/`) |
| `page.css` | In-page styles for the badge, beep pop and chat masks; injected via the manifest so Twitch's CSP can't block it |
| `fonts/` | Inter, Instrument Serif, Caveat (bundled, OFL) — same type as the landing page |
| `icons/` | Toolbar/extension icons rendered from the landing page's headphones logo |

## Development

```bash
npm run check   # syntax, word list, TS demux + overlap windows (needs ffmpeg), prefetch stripping
npm run bench   # word list vs Jev vs Haiku on 16 context cases (reads keys from .env)
```

**Debugging on Twitch**

- Page console: one `[earmuffs] chunk {stt, classifier, slack, words, beep, changes}` line per chunk. `slack` must stay positive — it's the time left before that chunk plays. `changes` shows Jev overrides (`+` added, `-` cleared).
- Service worker console (`chrome://extensions` → Earmuffs → *service worker*): every Deepgram/Jev call with its latency or error.
- Popup: counters and the last error.

## Settings

| Setting | Default | Notes |
|---|---|---|
| Classifier | Jev | Haiku is a fallback; it was ~5.5 s per call in the bench, too slow for live use |
| Threshold | 0.5 | Probability at or above which a word is treated as profanity |
| On/off | on | Off = nothing scheduled, chat untouched (the stream hook stays installed) |

## Limitations

- Twitch **live** only; native Twitch chat only (no 7TV/BTTV).
- The first ~8 s after enabling are unfiltered while the timeline syncs.
- The stream plays ~5 s further behind live (the head start is the point).
- Ad breaks or quality switches can trigger a short re-sync.
- A Twitch page script could send requests through the bridge and spend your API quota — fine for a demo, not for a public release.
