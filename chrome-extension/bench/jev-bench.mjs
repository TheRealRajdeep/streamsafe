// Step 1 go/no-go: Jev latency + accuracy vs the word list (and Haiku if a key is set).
// Usage (PowerShell):  $env:TYPESAFE_API_KEY="..."; $env:ANTHROPIC_API_KEY="..."; npm run bench
//            (bash):   TYPESAFE_API_KEY=... ANTHROPIC_API_KEY=... npm run bench
import { classifyJev, classifyHaiku } from '../classifier.js';

globalThis.window = globalThis;
await import('../wordlist.js');
const { isProfane } = globalThis.__ss;

// [state, marked word, expected profanity]
const CASES = [
  ['bro kicked my ass in that round', 'ass', true],
  ['what the fuck was that play', 'fuck', true],
  ['this boss is f***ing hard', 'f***ing', true],
  ['that was so fvcking clean', 'fvcking', true],
  ["oh sh1t he's behind us", 'sh1t', true],
  ['you son of a b', 'b', true],
  ["he's being a dick right now", 'dick', true],
  ['what the hell was that', 'hell', false],
  ['damn that was close', 'damn', false],
  ['this crap loot again', 'crap', false],
  ["I'm reading Dick Grayson comics", 'Dick', false],
  ['the assassin hid in the bushes', 'assassin', false],
  ['I have class tomorrow', 'class', false],
  ['we ordered a cocktail', 'cocktail', false],
  ['shiitake mushrooms are great', 'shiitake', false],
  ['the rooster, a cock, crowed at dawn', 'cock', false],
];

function snippetFor(state, word) {
  const words = state.split(' ');
  const i = words.findIndex((w) => w.replace(/[^\w*]/g, '') === word.replace(/[^\w*]/g, ''));
  return [...words.slice(Math.max(0, i - 6), i), '>>' + words[i] + '<<', ...words.slice(i + 1, i + 7)].join(' ');
}

const candidates = CASES.map(([state, word], i) => ({ id: 'c' + i, snippet: snippetFor(state, word) }));
const state = CASES.map((c) => c[0]).join('\n');

const pct = (arr, p) => [...arr].sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(arr.length * p))];

function score(probs, threshold) {
  let correct = 0;
  const wrong = [];
  CASES.forEach(([s, w, expected], i) => {
    const p = probs[i];
    const got = p !== null && p >= threshold;
    if (got === expected) correct++;
    else wrong.push(`${w} (${s}) p=${p === null ? 'null' : p.toFixed(2)}`);
  });
  return { correct, wrong };
}

async function timeCalls(fn, n, size) {
  const times = [];
  for (let k = 0; k < n; k++) {
    const t0 = performance.now();
    // Cycle through the cases to get `size` questions with unique ids.
    await fn(Array.from({ length: size }, (_, j) => ({ ...candidates[j % candidates.length], id: 'q' + j })));
    times.push(performance.now() - t0);
  }
  return { p50: pct(times, 0.5), p95: pct(times, 0.95) };
}

function report(name, probsById) {
  const probs = CASES.map((_, i) => probsById['c' + i]);
  let best = { t: 0.5, ...score(probs, 0.5) };
  for (const t of [0.3, 0.4, 0.5, 0.6, 0.7]) {
    const s = score(probs, t);
    if (s.correct > best.correct) best = { t, ...s };
  }
  const at50 = score(probs, 0.5);
  console.log(`${name} accuracy @0.5: ${at50.correct}/${CASES.length}   best: ${best.correct}/${CASES.length} @${best.t}`);
  for (const w of at50.wrong) console.log('   wrong @0.5:', w);
}

// Word list baseline
const wl = score(CASES.map(([, w]) => (isProfane(w) ? 1 : 0)), 0.5);
console.log(`Word list accuracy: ${wl.correct}/${CASES.length}`);
for (const w of wl.wrong) console.log('   wrong:', w);

const runs = [
  ['Jev', process.env.TYPESAFE_API_KEY, classifyJev],
  ['Haiku', process.env.ANTHROPIC_API_KEY, classifyHaiku],
];
for (const [name, key, fn] of runs) {
  if (!key) { console.log(`\n${name}: skipped (no API key env var)`); continue; }
  console.log(`\n=== ${name} ===`);
  try {
    const call = (cands) => fn({ key, state, candidates: cands, timeoutMs: 15000 });
    const t0 = performance.now();
    const probs = await call(candidates);
    console.log(`all 16 in one call: ${Math.round(performance.now() - t0)} ms`);
    report(name, probs);
    const l5 = await timeCalls(call, 10, 5);
    const l20 = await timeCalls(call, 10, 20);
    console.log(`latency  5q: p50 ${Math.round(l5.p50)} ms  p95 ${Math.round(l5.p95)} ms`);
    console.log(`latency 20q: p50 ${Math.round(l20.p50)} ms  p95 ${Math.round(l20.p95)} ms`);
  } catch (e) {
    console.log(`${name} failed:`, e.message);
  }
}
