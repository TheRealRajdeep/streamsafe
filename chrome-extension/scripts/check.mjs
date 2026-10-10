// Offline checks: syntax of every script, word list behavior, TS demux and
// overlapping STT windows (needs ffmpeg on PATH), worker playlist rewrite.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const test = async (name, fn) => {
  try { await fn(); console.log('ok   ', name); } catch (e) { failures++; console.log('FAIL ', name, '\n     ', e.message); }
};

// 1. Syntax
for (const f of readdirSync(root).filter((f) => f.endsWith('.js'))) {
  await test('syntax ' + f, () => execFileSync(process.execPath, ['--check', join(root, f)]));
}

// Minimal page globals so the page scripts can load in Node.
globalThis.window = globalThis;
window.addEventListener = () => {};
window.postMessage = () => {};
globalThis.document = { body: null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
globalThis.btoa ??= (s) => Buffer.from(s, 'binary').toString('base64');
await import(pathToFileURL(join(root, 'util.js')).href);
await import(pathToFileURL(join(root, 'wordlist.js')).href);
await import(pathToFileURL(join(root, 'audio.js')).href);
const ss = window.__ss;

// 2. Word list
await test('word list: profane', () => {
  for (const w of ['fuck', 'FUCKING', 'fvck', 'f***', 'f***ing', 's**t', 'sh1t', 'a$$', 'asshole', 'fuuuuck', 'bitch',
    'motherfucker', 'bullshit', 'dickhead', 'wtf', 'ƒuck']) assert.ok(ss.isProfane(w), w);
});
await test('word list: clean', () => {
  for (const w of ['damn', 'hell', 'crap', 'piss', 'class', 'assassin', 'pass', 'cocktail', 'shiitake', 'Scunthorpe',
    'stupid', '****', 'd**n']) assert.ok(!ss.isProfane(w), w);
});
await test('suspicious routes context cases to the classifier', () => {
  for (const w of ['class', 'assassin', 'Dick', 'cocktail', 'fuck']) assert.ok(ss.isSuspicious(w), w);
  for (const w of ['hello', 'gg', 'nice', 'play']) assert.ok(!ss.isSuspicious(w), w);
});

// 3. Demux + overlapping windows on real MPEG-TS segments
await test('demux + windows on consecutive 2s TS segments', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ss-ts-'));
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '6', '-c:v', 'libx264', '-g', '60',
    '-c:a', 'aac', '-output_ts_offset', '10', '-f', 'segment', '-segment_time', '2', '-segment_format', 'mpegts',
    join(dir, 'seg%d.ts')]);
  const segs = readdirSync(dir).filter((f) => f.endsWith('.ts')).sort();
  assert.ok(segs.length >= 3, 'expected 3 segments, got ' + segs.length);
  const wins = segs.map((f) => {
    const b = new Uint8Array(readFileSync(join(dir, f)));
    assert.ok(ss.isTs(b));
    const d = ss.demuxTs(b);
    return ss.buildWindow(d.adts, d.ptsSec);
  });
  // First window has no overlap; later ones start ~1s before their segment.
  assert.equal(wins[0].startPts, wins[0].segPts);
  for (let i = 1; i < wins.length; i++) {
    const overlap = wins[i].segPts - wins[i].startPts;
    assert.ok(overlap > 0.9 && overlap < 1.1, 'overlap ' + overlap);
    // Ownership ranges tile the timeline with no gap or double coverage.
    assert.ok(Math.abs(wins[i].ownFrom - wins[i - 1].ownTo) < 0.05,
      `gap between windows: ${wins[i - 1].ownTo} → ${wins[i].ownFrom}`);
  }
  const b64 = ss.toBase64(wins[1].bytes);
  assert.equal(Buffer.from(b64, 'base64').length, wins[1].bytes.length);
});

// 4. Worker prelude strips low-latency prefetch entries
await test('worker prelude strips #EXT-X-TWITCH-PREFETCH', async () => {
  const src = readFileSync(join(root, 'hook.js'), 'utf8');
  const prelude = src.slice(src.indexOf('function forwardSegment'), src.indexOf('function readSync'));
  let workerPrelude;
  const CHANNEL = 'test';
  eval(prelude.replace('const workerPrelude', 'workerPrelude'));
  const playlist = '#EXTM3U\n#EXTINF:2.000,live\nhttps://x/segment/a.ts\n#EXT-X-TWITCH-PREFETCH:https://x/segment/b.ts\n';
  const fakeSelf = { fetch: async () => new Response(playlist, { status: 200 }) };
  const origBC = globalThis.BroadcastChannel;
  globalThis.BroadcastChannel = class { postMessage() {} };
  try {
    new Function('self', workerPrelude)(fakeSelf);
    const text = await (await fakeSelf.fetch('https://x/v1/playlist/abc.m3u8')).text();
    assert.ok(!text.includes('PREFETCH'), text);
    assert.ok(text.includes('segment/a.ts'));
  } finally {
    globalThis.BroadcastChannel = origBC;
  }
});

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
