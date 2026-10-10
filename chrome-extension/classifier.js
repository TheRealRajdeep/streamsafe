// Network calls to speech-to-text and the profanity classifiers.
// ES module shared by background.js (service worker) and bench/jev-bench.mjs (Node).

export const JEV_URL = 'https://api.typesafe.ai/v1/systemone';
export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const DEEPGRAM_URL =
  'https://api.deepgram.com/v1/listen?model=nova-3&punctuate=true&profanity_filter=false&language=en';
export const HAIKU_MODEL = 'claude-haiku-5-5';

const DEFINITION =
  'Is the marked word profanity: a swear word or vulgar term (e.g. ass, bitch, shit, fuck, dick, pussy, cunt, bastard), ' +
  'or a censored/disguised/cut-off version of one (e.g. f***, fvck, sh1t, "son of a b-")? ' +
  'Mild words (damn, hell, crap, piss), insults that aren\'t swears (stupid, idiot), names, places, food, ' +
  'game terms, and normal words that merely contain or resemble a swear ' +
  '(class, assassin, Scunthorpe, cocktail, shiitake, Dick as a name, cock meaning a rooster) are NOT profanity.';

// Jev can't locate words or count, so each candidate is identified by a
// snippet with the word wrapped in >>…<<, never by position.
export function jevInstruction(snippet) {
  return 'In this snippet: "' + snippet + '"\n' + DEFINITION;
}

async function fetchJson(url, init, timeoutMs) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(res.status + ' ' + text.slice(0, 200));
    return JSON.parse(text);
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('timeout after ' + timeoutMs + 'ms');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** @returns {Promise<Array<{word, punctuated_word, start, end, confidence}>>} */
export async function transcribeDeepgram({ key, bytes, timeoutMs = 5000 }) {
  const res = await fetchJson(DEEPGRAM_URL, {
    method: 'POST',
    headers: { Authorization: 'Token ' + key, 'Content-Type': 'audio/aac' },
    body: bytes,
  }, timeoutMs);
  const alt = res.results && res.results.channels && res.results.channels[0] &&
    res.results.channels[0].alternatives && res.results.channels[0].alternatives[0];
  return (alt && alt.words) || [];
}

/**
 * candidates: [{ id, snippet }] → { [id]: probability 0..1 | null }
 * One noul question per candidate; Jev evaluates them in parallel.
 */
export async function classifyJev({ key, state, candidates, timeoutMs = 2500 }) {
  const questions = {};
  for (const c of candidates) questions[c.id] = { type: 'noul', instructions: jevInstruction(c.snippet) };
  const res = await fetchJson(JEV_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'jev-latest', state, questions }),
  }, timeoutMs);
  const out = {};
  for (const c of candidates) {
    const a = res.answers && res.answers[c.id];
    out[c.id] = a && typeof a.noul === 'number' ? a.noul : null;
  }
  return out;
}

/** Same contract as classifyJev, backed by Claude Haiku. */
export async function classifyHaiku({ key, state, candidates, timeoutMs = 2500 }) {
  const user =
    'Context:\n' + state + '\n\nCandidates (the marked word is the one to judge):\n' +
    candidates.map((c) => c.id + ': ' + c.snippet).join('\n') +
    '\n\nReply with JSON only, mapping each candidate id to the probability (0-1) that its marked word is profanity. ' +
    'Example: {"w1": 0.97, "w2": 0.02}';
  const res = await fetchJson(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 400,
      system: 'You judge whether marked words in Twitch speech or chat are profanity. ' + DEFINITION,
      messages: [{ role: 'user', content: user }],
    }),
  }, timeoutMs);
  const text = (res.content || []).map((b) => b.text || '').join('');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Haiku returned no JSON');
  const parsed = JSON.parse(m[0]);
  const out = {};
  for (const c of candidates) out[c.id] = typeof parsed[c.id] === 'number' ? parsed[c.id] : null;
  return out;
}
