// Audio graph, PTS→video-time calibration, and the beep scheduler.
// Calibration ported from the feasibility spike: the loudness envelope of each
// decoded segment is cross-correlated with what the player actually outputs,
// giving offset = video.currentTime − segment PTS (stable to ~5ms per session).
(() => {
  'use strict';
  const ss = window.__ss;

  const FRAME = 512;          // live envelope frame (samples), divides 4096
  const MAX_FRAMES = 6000;    // ~64s of live envelope history
  const MIN_SCORE = 0.9;      // spike showed false matches below this
  const PAD = 0.08;           // seconds of beep padding around each word
  const LOOKAHEAD = 0.6;      // schedule blocks this close to playback
  const BEEP_VOL = 0.15;

  const S = ss.sync = {
    ctx: null,
    video: null,
    offset: NaN,
    calibrated: false,
    stale: false,          // player <video> was replaced (reload needed)
    onBeep: null,          // (block) => void, called when a beep starts
  };

  const live = { frameDur: 0.01, env: [], ct: [] };
  const pending = [];
  const offsets = [];
  let censorGain = null, beepGain = null;
  let blocks = [];
  let nextBlockId = 1;
  let lastEnd = null;      // AudioContext time the last scheduled censor ends
  let segCount = 0;

  function findPlayerVideo() {
    const vids = [...document.querySelectorAll('video')].filter((v) => v.readyState > 0);
    const area = (v) => { const r = v.getBoundingClientRect(); return r.width * r.height; };
    return vids.sort((a, b) => area(b) - area(a))[0] || null;
  }
  S.findPlayerVideo = findPlayerVideo;

  // ---------------------------------------------------------------- start
  let starting = false;
  async function start() {
    if (S.ctx || starting || !ss.settings.enabled) return;
    const video = findPlayerVideo();
    if (!video) return;
    starting = true;
    try {
      const ctx = new AudioContext();
      await ctx.resume();
      // A suspended context would silence the stream once we reroute it.
      if (ctx.state !== 'running') { ctx.close(); return; }
      const src = ctx.createMediaElementSource(video);
      censorGain = ctx.createGain();
      src.connect(censorGain).connect(ctx.destination);

      // Calibration tap sits before the censor gain so beeps don't affect it.
      const sp = ctx.createScriptProcessor(4096, 1, 1);
      const sink = ctx.createGain();
      sink.gain.value = 0;
      src.connect(sp);
      sp.connect(sink).connect(ctx.destination);
      live.frameDur = FRAME / ctx.sampleRate;
      sp.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        const ct = video.currentTime;
        const n = data.length / FRAME;
        for (let i = 0; i < n; i++) {
          let s = 0;
          for (let j = i * FRAME; j < (i + 1) * FRAME; j++) s += data[j] * data[j];
          live.env.push(Math.log(1e-6 + Math.sqrt(s / FRAME)));
          live.ct.push(ct - (n - i) * live.frameDur);
        }
        const extra = live.env.length - MAX_FRAMES;
        if (extra > 0) { live.env.splice(0, extra); live.ct.splice(0, extra); }
      };

      const osc = ctx.createOscillator();
      osc.frequency.value = 1000;
      beepGain = ctx.createGain();
      beepGain.gain.value = 0;
      osc.connect(beepGain).connect(ctx.destination);
      osc.start();

      for (const ev of ['pause', 'seeking', 'ratechange']) video.addEventListener(ev, resetSchedule);
      S.ctx = ctx;
      S.video = video;
      setInterval(tryMatch, 1000);
      setInterval(tick, 100);
      ss.log('audio graph ready', ctx.sampleRate + 'Hz');
    } catch (e) {
      ss.warn('audio start failed', e);
      ss.reportError('audio start failed: ' + e.message);
    } finally {
      starting = false;
    }
  }
  S.start = start;

  // AudioContext needs a user gesture. Capture-phase so Twitch can't swallow it.
  window.addEventListener('pointerdown', () => start(), true);
  window.addEventListener('keydown', () => start(), true);
  setInterval(() => {
    if (!S.ctx && navigator.userActivation && navigator.userActivation.hasBeenActive) start();
    if (S.video && findPlayerVideo() && findPlayerVideo() !== S.video) S.stale = true;
  }, 1000);

  // ---------------------------------------------------------- calibration
  function envelope(pcm, frameLen) {
    const n = Math.floor(pcm.length / frameLen);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.round(i * frameLen), z = Math.round((i + 1) * frameLen);
      let s = 0;
      for (let j = a; j < z; j++) s += pcm[j] * pcm[j];
      out[i] = Math.log(1e-6 + Math.sqrt(s / (z - a)));
    }
    return out;
  }

  function meanStd(a, from = 0, len = a.length) {
    let s = 0, s2 = 0;
    for (let i = from; i < from + len; i++) { s += a[i]; s2 += a[i] * a[i]; }
    const m = s / len;
    return [m, Math.sqrt(Math.max(0, s2 / len - m * m))];
  }

  /** Queue a decoded segment for matching against the live output. */
  S.addSegment = (pcm, sampleRate, ptsSec) => {
    if (!S.ctx) return;
    // Once calibrated, only re-check every 3rd segment (keeps CPU low).
    if (S.calibrated && segCount++ % 3 !== 0) return;
    pending.push({ env: envelope(pcm, sampleRate * live.frameDur), ptsSec, added: Date.now() });
  };

  function tryMatch() {
    const env = live.env, n = env.length;
    for (let k = pending.length - 1; k >= 0; k--) {
      const seg = pending[k];
      const m = seg.env.length;
      const [sm, sd] = meanStd(seg.env);
      if (m < 50 || sd < 0.3 || Date.now() - seg.added > 40000) { pending.splice(k, 1); continue; }
      if (n < m) continue;

      let best = -2, bestLag = -1;
      for (let lag = 0; lag + m <= n; lag++) {
        const [lm, ls] = meanStd(env, lag, m);
        if (ls < 1e-3) continue;
        let c = 0;
        for (let i = 0; i < m; i++) c += (seg.env[i] - sm) * (env[lag + i] - lm);
        c /= m * sd * ls;
        if (c > best) { best = c; bestLag = lag; }
      }
      // Wait until the whole segment has played before trusting a match.
      if (best < MIN_SCORE || bestLag + m > n - 5) continue;
      pending.splice(k, 1);
      addOffset(live.ct[bestLag] - seg.ptsSec);
    }
  }

  function addOffset(o) {
    // A run of 3 offsets far from the current median means the timeline
    // jumped (ad break, channel change): start over from those.
    if (offsets.length >= 3 && Math.abs(o - S.offset) > 0.3) {
      const recent = offsets.slice(-2);
      if (recent.every((x) => Math.abs(x - o) < 0.1)) {
        offsets.length = 0;
        offsets.push(...recent);
      }
    }
    offsets.push(o);
    if (offsets.length > 8) offsets.shift();
    const med = ss.median(offsets);
    const agreeing = offsets.filter((x) => Math.abs(x - med) < 0.05).length;
    const was = S.calibrated;
    if (agreeing >= 2) { S.offset = med; S.calibrated = true; }
    if (!was && S.calibrated) ss.log('calibrated, offset', S.offset.toFixed(3) + 's');
  }

  /** Video time when a PTS will be heard (NaN until calibrated). */
  S.toVideoTime = (pts) => pts + S.offset;

  // -------------------------------------------------------------- blocks
  /** Register a word to beep. Times are absolute PTS seconds. */
  S.addBlock = (ptsStart, ptsEnd, info) => {
    const b = { id: nextBlockId++, ptsStart, ptsEnd, info, state: 'pending' };
    blocks.push(b);
    return b;
  };

  /** Cancel a block if it hasn't been handed to the audio graph yet. */
  S.removeBlock = (b) => {
    if (b.state !== 'pending') return false;
    b.state = 'removed';
    return true;
  };

  function resetSchedule() {
    if (!S.ctx) return;
    const t = S.ctx.currentTime;
    censorGain.gain.cancelScheduledValues(0);
    beepGain.gain.cancelScheduledValues(0);
    censorGain.gain.setValueAtTime(1, t);
    beepGain.gain.setValueAtTime(0, t);
    lastEnd = null;
    for (const b of blocks) if (b.state === 'scheduled') b.state = 'pending';
  }

  function tick() {
    const v = S.video;
    if (!S.calibrated || !v || v.paused) return;
    if (!ss.settings.enabled) { blocks = []; return; }
    const ctx = S.ctx, now = v.currentTime, rate = v.playbackRate || 1;

    const due = [];
    for (const b of blocks) {
      if (b.state !== 'pending') continue;
      const vs = S.toVideoTime(b.ptsStart) - PAD;
      const ve = S.toVideoTime(b.ptsEnd) + PAD;
      if (ve <= now) { b.state = 'missed'; ss.warn('missed block (too late)', b.info && b.info.text); continue; }
      if (vs - now < LOOKAHEAD) due.push({ b, vs, ve });
    }
    due.sort((x, y) => x.vs - y.vs);

    for (const { b, vs, ve } of due) {
      let t0 = ctx.currentTime + Math.max(0, (vs - now) / rate);
      let t1 = ctx.currentTime + (ve - now) / rate;
      if (lastEnd !== null && t0 <= lastEnd + 0.02) {
        // Overlaps the previous beep: drop its restore point and extend.
        censorGain.gain.cancelScheduledValues(lastEnd);
        beepGain.gain.cancelScheduledValues(lastEnd);
        t1 = Math.max(t1, lastEnd);
      } else {
        censorGain.gain.setValueAtTime(0, t0);
        beepGain.gain.setValueAtTime(BEEP_VOL, t0);
      }
      censorGain.gain.setValueAtTime(1, t1);
      beepGain.gain.setValueAtTime(0, t1);
      lastEnd = t1;
      b.state = 'scheduled';
      setTimeout(() => { if (S.onBeep) S.onBeep(b); }, Math.max(0, (t0 - ctx.currentTime) * 1000));
    }

    // Forget blocks that are finished.
    blocks = blocks.filter((b) => b.state === 'pending' ||
      (b.state === 'scheduled' && S.toVideoTime(b.ptsEnd) + PAD > now - 1));
  }
})();
