// Segment → audio: MPEG-TS demux, ADTS framing, decode, and overlapping
// windows for speech-to-text. Demux/decode ported from the feasibility spike.
(() => {
  'use strict';
  const ss = window.__ss;

  function isTs(b) {
    return b.length >= 188 && b[0] === 0x47 && (b.length < 377 || b[188] === 0x47);
  }

  // Minimal MPEG-TS demuxer: PAT -> PMT -> AAC (ADTS) PES payloads + first PTS.
  function demuxTs(b) {
    let pmtPid = -1, audioPid = -1, audioType = -1, pts = null;
    const chunks = [];
    for (let p = 0; p + 188 <= b.length; p += 188) {
      if (b[p] !== 0x47) throw new Error('TS sync lost at ' + p);
      const pusi = (b[p + 1] & 0x40) !== 0;
      const pid = ((b[p + 1] & 0x1f) << 8) | b[p + 2];
      const afc = (b[p + 3] >> 4) & 3;
      let off = p + 4;
      if (afc & 2) off += 1 + b[off];
      if (!(afc & 1) || off >= p + 188) continue;

      if (pid === 0) {
        if (pusi) off += 1 + b[off];
        const secLen = ((b[off + 1] & 0x0f) << 8) | b[off + 2];
        const end = off + 3 + secLen - 4;
        for (let q = off + 8; q + 4 <= end; q += 4) {
          if (((b[q] << 8) | b[q + 1]) !== 0) { pmtPid = ((b[q + 2] & 0x1f) << 8) | b[q + 3]; break; }
        }
      } else if (pid === pmtPid) {
        if (pusi) off += 1 + b[off];
        const secLen = ((b[off + 1] & 0x0f) << 8) | b[off + 2];
        const end = off + 3 + secLen - 4;
        const progInfoLen = ((b[off + 10] & 0x0f) << 8) | b[off + 11];
        for (let q = off + 12 + progInfoLen; q + 5 <= end;) {
          const streamType = b[q];
          const esPid = ((b[q + 1] & 0x1f) << 8) | b[q + 2];
          const esInfoLen = ((b[q + 3] & 0x0f) << 8) | b[q + 4];
          if ((streamType === 0x0f || streamType === 0x11) && audioPid < 0) { audioPid = esPid; audioType = streamType; }
          q += 5 + esInfoLen;
        }
      } else if (pid === audioPid) {
        if (pusi && b[off] === 0 && b[off + 1] === 0 && b[off + 2] === 1) {
          const flags = b[off + 7];
          const hdrLen = b[off + 8];
          if (pts === null && (flags & 0x80)) pts = readPts(b, off + 9);
          off += 9 + hdrLen;
        }
        if (off < p + 188) chunks.push(b.subarray(off, p + 188));
      }
    }
    if (audioPid < 0) throw new Error('no AAC stream found in TS');
    if (audioType === 0x11) throw new Error('LATM AAC not supported');
    return { adts: ss.concatBytes(chunks), ptsSec: pts === null ? null : pts / 90000 };
  }

  function readPts(b, o) {
    return ((b[o] >> 1) & 7) * 1073741824 + b[o + 1] * 4194304 +
      (b[o + 2] >> 1) * 32768 + b[o + 3] * 128 + (b[o + 4] >> 1);
  }

  const AAC_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

  // Split an ADTS stream into whole frames (each frame = 1024 samples).
  function splitAdts(adts) {
    const frames = [];
    let cfg = null;
    for (let p = 0; p + 7 <= adts.length;) {
      if (adts[p] !== 0xff || (adts[p + 1] & 0xf0) !== 0xf0) { p++; continue; }
      const len = ((adts[p + 3] & 3) << 11) | (adts[p + 4] << 3) | (adts[p + 5] >> 5);
      if (len < 7 || p + len > adts.length) break;
      if (!cfg) {
        const ch = ((adts[p + 2] & 1) << 2) | (adts[p + 3] >> 6);
        cfg = { sampleRate: AAC_RATES[(adts[p + 2] >> 2) & 0xf], numberOfChannels: ch || 2 };
      }
      frames.push(adts.subarray(p, p + len));
      p += len;
    }
    if (!cfg) throw new Error('no ADTS frames');
    return { frames, ...cfg };
  }

  async function decodeAdts(adts) {
    try {
      return await decodeContainer(adts);
    } catch (e) {
      if (typeof AudioDecoder === 'undefined') throw e;
      return await decodeAdtsWebCodecs(adts);
    }
  }

  async function decodeContainer(bytes) {
    const ctx = new OfflineAudioContext(1, 1, 48000);
    const ab = await ctx.decodeAudioData(bytes.slice().buffer);
    return { pcm: ab.getChannelData(0).slice(), sampleRate: ab.sampleRate };
  }

  async function decodeAdtsWebCodecs(adts) {
    const { frames, sampleRate, numberOfChannels } = splitAdts(adts);
    const out = [];
    let err = null;
    const dec = new AudioDecoder({
      output: (d) => {
        const buf = new Float32Array(d.numberOfFrames);
        d.copyTo(buf, { planeIndex: 0, format: 'f32-planar' });
        out.push(buf);
        d.close();
      },
      error: (e) => { err = e; },
    });
    dec.configure({ codec: 'mp4a.40.2', sampleRate, numberOfChannels });
    let ts = 0;
    for (const f of frames) {
      dec.decode(new EncodedAudioChunk({ type: 'key', timestamp: ts, data: f }));
      ts += (1024 / sampleRate) * 1e6;
    }
    await dec.flush();
    dec.close();
    if (err) throw err;
    return { pcm: ss.concatFloat(out), sampleRate };
  }

  // Overlapping STT windows: prepend the last ~1s of the previous segment so
  // words cut at a segment boundary are heard whole. A window owns the words
  // that start in [segPts - 0.5, segPts + segDur - 0.5); the next window owns
  // the rest. Must be called in segment arrival order.
  const OVERLAP_SEC = 1.0;
  const OWN_SHIFT = 0.5;
  let prev = null; // { tail, endPts, sampleRate }

  function buildWindow(adts, segPts) {
    const { frames, sampleRate } = splitAdts(adts);
    const segDur = (frames.length * 1024) / sampleRate;
    const contiguous = prev && prev.sampleRate === sampleRate && Math.abs(prev.endPts - segPts) < 0.25;
    const overlap = contiguous ? prev.tail : [];
    const overlapDur = (overlap.length * 1024) / sampleRate;
    const tailCount = Math.min(frames.length, Math.round((OVERLAP_SEC * sampleRate) / 1024));
    prev = { tail: frames.slice(frames.length - tailCount), endPts: segPts + segDur, sampleRate };
    return {
      bytes: ss.concatBytes([...overlap, ...frames]),
      startPts: segPts - overlapDur,
      ownFrom: contiguous ? segPts - OWN_SHIFT : segPts,
      ownTo: segPts + segDur - OWN_SHIFT,
      segPts,
      segDur,
    };
  }

  Object.assign(ss, { isTs, demuxTs, splitAdts, decodeAdts, buildWindow });
})();
