// Service worker: holds the API keys and makes every network call.
import { transcribeDeepgram, classifyJev, classifyHaiku } from './classifier.js';

const EMPTY_STATS = { beeped: 0, chatMasked: 0, chunks: 0, sttFail: 0, classifierLate: 0, jevAdded: 0, jevCleared: 0 };

const getSettings = () => chrome.storage.local.get(null);

function fromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Stats updates arrive constantly; serialize them so increments aren't lost.
let statsChain = Promise.resolve();
function addStats(delta) {
  statsChain = statsChain.then(async () => {
    const { stats } = await chrome.storage.local.get('stats');
    const next = { ...EMPTY_STATS, ...stats };
    for (const [k, v] of Object.entries(delta || {})) next[k] = (next[k] || 0) + v;
    await chrome.storage.local.set({ stats: next });
  }).catch(() => {});
  return statsChain;
}

async function handle({ type, payload }) {
  const s = await getSettings();
  switch (type) {
    case 'transcribe': {
      if (!s.deepgramKey) throw new Error('no Deepgram key');
      return transcribeDeepgram({ key: s.deepgramKey, bytes: fromBase64(payload.adtsB64) });
    }
    case 'classify': {
      const args = { state: payload.state, candidates: payload.candidates, timeoutMs: 2900 };
      if (s.classifier === 'haiku') {
        if (!s.anthropicKey) throw new Error('no Anthropic key');
        return classifyHaiku({ key: s.anthropicKey, ...args });
      }
      if (!s.typesafeKey) throw new Error('no TypeSafe key');
      return classifyJev({ key: s.typesafeKey, ...args });
    }
    case 'stats':
      return addStats(payload);
    case 'error':
      return chrome.storage.local.set({ lastError: new Date().toLocaleTimeString() + ' ' + payload });
    default:
      throw new Error('unknown request ' + type);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const t0 = performance.now();
  const timed = msg.type === 'transcribe' || msg.type === 'classify';
  handle(msg).then(
    (result) => {
      if (timed) console.log('[earmuffs]', msg.type, 'ok', Math.round(performance.now() - t0) + 'ms');
      sendResponse({ ok: true, result });
    },
    (e) => {
      const error = String((e && e.message) || e);
      console.warn('[earmuffs]', msg.type, 'failed', Math.round(performance.now() - t0) + 'ms', error);
      sendResponse({ ok: false, error });
    },
  );
  return true; // async response
});

// Dev convenience: fill any empty key from chrome-extension/.env (loaded unpacked).
const ENV_KEYS = { DEEPGRAM_API_KEY: 'deepgramKey', TYPESAFE_API_KEY: 'typesafeKey', ANTHROPIC_API_KEY: 'anthropicKey' };
async function keysFromEnvFile() {
  try {
    const res = await fetch(chrome.runtime.getURL('.env'));
    if (!res.ok) return {};
    const out = {};
    for (const line of (await res.text()).split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (m && ENV_KEYS[m[1]] && m[2]) out[ENV_KEYS[m[1]]] = m[2].replace(/^["']|["']$/g, '');
    }
    return out;
  } catch (e) {
    return {};
  }
}

async function init() {
  const s = await getSettings();
  const env = await keysFromEnvFile();
  const keys = {};
  for (const k of Object.values(ENV_KEYS)) if (!s[k] && env[k]) keys[k] = env[k];
  await chrome.storage.local.set({
    enabled: s.enabled !== false,
    classifier: s.classifier || 'jev',
    threshold: typeof s.threshold === 'number' ? s.threshold : 0.5,
    stats: { ...EMPTY_STATS, ...s.stats },
    ...keys,
  });
}

chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);
