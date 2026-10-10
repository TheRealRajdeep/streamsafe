// Audio pipeline: segment → demux → STT window → word list (instant) →
// classifier (context-aware override) → beep blocks on the player timeline.
(() => {
  'use strict';
  const ss = window.__ss;
  const S = ss.sync;

  const STT_TIMEOUT = 6000;
  const CLASSIFY_TIMEOUT = 3500; // > background timeout (2.9s)
  const HISTORY_SEC = 30;
  const SNIPPET_WORDS = 6;

  let history = []; // owned words from earlier windows: { text, raw, start, end }

  function snippet(words, i) {
    const before = words.slice(Math.max(0, i - SNIPPET_WORDS), i).map((w) => w.text);
    const after = words.slice(i + 1, i + 1 + SNIPPET_WORDS).map((w) => w.text);
    return [...before, '>>' + words[i].text + '<<', ...after].join(' ');
  }

  ss.onSegment = (msg) => {
    if (!ss.settings.enabled) return;
    const bytes = new Uint8Array(msg.buf);
    if (!ss.isTs(bytes)) return;
    let d, win;
    try {
      d = ss.demuxTs(bytes);
      if (d.ptsSec === null) return;
      win = ss.buildWindow(d.adts, d.ptsSec); // synchronous: keeps arrival order
    } catch (e) {
      ss.warn('demux failed', e.message);
      return;
    }
    if (S.ctx) {
      ss.decodeAdts(d.adts)
        .then(({ pcm, sampleRate }) => S.addSegment(pcm, sampleRate, d.ptsSec))
        .catch(() => {});
    }
    processWindow(win).catch((e) => ss.warn('pipeline error', e));
  };

  async function processWindow(win) {
    ss.stat({ chunks: 1 });
    if (!ss.settings.hasDeepgram) { ss.badge && ss.badge.warn('add a Deepgram key in the popup'); return; }

    const t0 = performance.now();
    let words;
    try {
      words = await ss.rpc('transcribe', { adtsB64: ss.toBase64(win.bytes) }, STT_TIMEOUT);
    } catch (e) {
      ss.stat({ sttFail: 1 });
      ss.warn('speech-to-text failed after', Math.round(performance.now() - t0) + 'ms:', e.message);
      ss.reportError('speech-to-text: ' + e.message);
      ss.badge && ss.badge.warn('speech-to-text failing');
      return;
    }
    const sttMs = Math.round(performance.now() - t0);
    ss.badge && ss.badge.warn(null);

    const all = words.map((w) => ({
      text: w.punctuated_word || w.word,
      raw: w.word,
      start: win.startPts + w.start,
      end: win.startPts + w.end,
    }));
    const owned = all.filter((w) => w.start >= win.ownFrom && w.start < win.ownTo);

    // Context for snippets: earlier owned words + everything heard in this window.
    const context = history.filter((w) => w.start < (all[0] ? all[0].start : win.startPts)).concat(all);
    history = history.concat(owned).sort((a, b) => a.start - b.start)
      .filter((w) => w.start > win.ownTo - HISTORY_SEC);

    // 1) Word list: instant safety net.
    const blocks = new Map();
    owned.forEach((w, i) => {
      if (ss.isProfane(w.raw)) blocks.set(i, S.addBlock(w.start, w.end, { text: w.text }));
    });

    // 2) Classifier: judge every non-stopword in context.
    const cands = [];
    owned.forEach((w, i) => {
      if (blocks.has(i) || !ss.isStopword(w.raw)) {
        cands.push({ id: 'w' + i, i, snippet: snippet(context, context.indexOf(w)) });
      }
    });

    let clsMs = null;
    const changes = [];
    if (cands.length && ss.settings.hasClassifierKey) {
      const t1 = performance.now();
      try {
        const state = history.map((w) => w.text).join(' ');
        const probs = await ss.rpc('classify', {
          state, candidates: cands.map(({ id, snippet: s }) => ({ id, snippet: s })),
        }, CLASSIFY_TIMEOUT);
        clsMs = Math.round(performance.now() - t1);
        let added = 0, cleared = 0;
        for (const c of cands) {
          const p = probs[c.id];
          if (typeof p !== 'number') continue;
          const w = owned[c.i];
          if (p >= ss.settings.threshold && !blocks.has(c.i)) {
            blocks.set(c.i, S.addBlock(w.start, w.end, { text: w.text }));
            changes.push('+' + w.text + ' (' + p.toFixed(2) + ')');
            added++;
          } else if (p < ss.settings.threshold && blocks.has(c.i)) {
            if (S.removeBlock(blocks.get(c.i))) {
              blocks.delete(c.i);
              changes.push('-' + w.text + ' (' + p.toFixed(2) + ')');
              cleared++;
            }
          }
        }
        if (added || cleared) ss.stat({ jevAdded: added, jevCleared: cleared });
      } catch (e) {
        ss.stat({ classifierLate: 1 });
        ss.badge && ss.badge.warn('classifier slow — using word list');
        ss.warn('classifier:', e.message);
      }
    }

    const slack = S.calibrated && S.video
      ? Math.round((S.toVideoTime(win.segPts) - S.video.currentTime) * 1000) : null;
    ss.log('chunk', {
      stt: sttMs + 'ms',
      classifier: clsMs === null ? '-' : clsMs + 'ms',
      slack: slack === null ? 'uncalibrated' : slack + 'ms',
      words: owned.map((w) => w.text).join(' '),
      beep: [...blocks.keys()].map((i) => owned[i].text),
      changes,
    });
  }

  // Beep feedback: badge flash + counter.
  S.onBeep = (b) => {
    ss.stat({ beeped: 1 });
    if (ss.badge) ss.badge.flash(b.info && b.info.text);
  };
})();
