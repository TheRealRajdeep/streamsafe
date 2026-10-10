// Chat filter for native Twitch chat. Messages with suspicious tokens are
// blurred, judged in one batched classifier call, then profane words are masked.
// Clean messages are never delayed.
(() => {
  'use strict';
  const ss = window.__ss;

  const BATCH_MS = 700;
  const TIMEOUT_MS = 3500; // > background timeout, so real errors arrive first
  const MAX_QUESTIONS = 40;

  let queue = [];   // messages waiting for a verdict
  let nextMsg = 1;
  let observed = null;

  function tokenize(text) {
    const out = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(text))) out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
    return out;
  }

  function prepare(line) {
    if (line.dataset.ssDone) return;
    line.dataset.ssDone = '1';
    if (!ss.settings.enabled) return;
    const spans = [...line.querySelectorAll('.text-fragment')];
    if (!spans.length) return;

    const id = nextMsg++;
    const frags = spans.map((span) => ({ span, text: span.textContent, tokens: tokenize(span.textContent) }));
    const cands = [];
    frags.forEach((f, fi) => {
      f.tokens.forEach((t, ti) => {
        if (ss.isSuspicious(t.text)) cands.push({ refs: [[fi, ti]], word: t.text });
      });
      // Spaced-out letters ("f u c k") → one candidate covering the run.
      let run = [];
      const flush = () => {
        if (run.length >= 3) {
          const word = run.map(([, ti]) => f.tokens[ti].text).join('');
          if (ss.isSuspicious(word)) cands.push({ refs: run.slice(), word });
        }
        run = [];
      };
      f.tokens.forEach((t, ti) => (t.text.length === 1 ? run.push([fi, ti]) : flush()));
      flush();
    });
    if (!cands.length) return;

    const fullText = frags.map((f) => f.text).join(' ');
    cands.forEach((c, ci) => {
      c.id = 'm' + id + '_' + ci;
      c.wordList = ss.isProfane(c.word);
      c.snippet = c.refs.length === 1
        ? fullText.replace(c.word, '>>' + c.word + '<<')
        : fullText + ' (spelled out: >>' + c.word + '<<)';
    });
    for (const f of frags) f.span.style.filter = 'blur(4px)';
    queue.push({ frags, cands, text: fullText });
  }

  function mask(msg, flaggedCands) {
    for (const [fi, f] of msg.frags.entries()) {
      const hits = flaggedCands.flatMap((c) => c.refs).filter(([x]) => x === fi).map(([, ti]) => f.tokens[ti]);
      if (hits.length) {
        let s = f.text;
        for (const t of hits.sort((a, b) => b.start - a.start)) {
          s = s.slice(0, t.start) + '*'.repeat(t.end - t.start) + s.slice(t.end);
        }
        f.span.textContent = s;
      }
      f.span.style.filter = '';
    }
    const n = flaggedCands.length;
    if (n) ss.stat({ chatMasked: n });
  }

  async function flush() {
    if (!queue.length) return;
    const batch = queue;
    queue = [];
    const cands = batch.flatMap((m) => m.cands);
    const useClassifier = ss.settings.hasClassifierKey && cands.length <= MAX_QUESTIONS;
    let probs = null;
    if (useClassifier) {
      try {
        probs = await ss.rpc('classify', {
          state: batch.map((m) => m.text).join('\n'),
          candidates: cands.map((c) => ({ id: c.id, snippet: c.snippet })),
        }, TIMEOUT_MS);
      } catch (e) {
        ss.stat({ classifierLate: 1 });
        ss.warn('chat classifier:', e.message);
      }
    }
    const thr = ss.settings.threshold;
    let added = 0, cleared = 0;
    for (const m of batch) {
      const flagged = m.cands.filter((c) => {
        const p = probs && probs[c.id];
        if (typeof p !== 'number') return c.wordList;
        // Count where the classifier overruled the word list.
        if (p >= thr && !c.wordList) added++;
        if (p < thr && c.wordList) cleared++;
        return p >= thr;
      });
      mask(m, flagged);
    }
    if (added || cleared) ss.stat({ jevAdded: added, jevCleared: cleared });
  }

  function scan(root) {
    if (!(root instanceof Element)) return;
    if (root.matches('.chat-line__message')) prepare(root);
    root.querySelectorAll('.chat-line__message').forEach(prepare);
  }

  // Twitch re-renders chat on navigation; re-attach whenever the container changes.
  setInterval(() => {
    const container = document.querySelector('.chat-scrollable-area__message-container');
    if (!container || container === observed) return;
    observed = container;
    scan(container);
    new MutationObserver((muts) => {
      for (const mu of muts) mu.addedNodes.forEach(scan);
    }).observe(container, { childList: true, subtree: true });
    ss.log('chat filter attached');
  }, 2000);

  setInterval(() => { flush().catch((e) => ss.warn('chat flush', e)); }, BATCH_MS);
})();
