// Intercepts Twitch's HLS traffic before the player sees it (proven in the feasibility spike):
//  - wraps every classic Web Worker so its fetch() reports media segments to us
//  - strips #EXT-X-TWITCH-PREFETCH from playlists so the player runs at normal
//    latency, giving us ~5s between download and playback
// Must run at document_start in the MAIN world, before Twitch creates its worker.
(() => {
  'use strict';
  const ss = window.__ss;
  const CHANNEL = 'streamsafe-' + Math.random().toString(36).slice(2);

  // Stringified into the worker: keep self-contained, no template literals.
  function forwardSegment(url, resp, post) {
    if (!resp.ok) return;
    if (/\.m3u8(\?|$)/i.test(url)) return;
    if (!(/\.(ts|mp4|m4s)(\?|$)/i.test(url) || /\/segment\//i.test(url) || /ttvnw\.net/i.test(url))) return;
    resp.clone().arrayBuffer().then(function (buf) {
      post({ kind: 'segment', url: url, buf: buf, tDone: Date.now() });
    }).catch(function () {});
  }

  function stripPrefetch(resp) {
    return resp.text().then(function (t) {
      var stripped = t.replace(/^#EXT-X-TWITCH-PREFETCH:.*(\r?\n|$)/gm, '');
      return new Response(stripped, { status: resp.status, statusText: resp.statusText, headers: resp.headers });
    });
  }

  const workerPrelude =
    '(function () {\n' +
    forwardSegment.toString() + '\n' +
    stripPrefetch.toString() + '\n' +
    'var bc = new BroadcastChannel(' + JSON.stringify(CHANNEL) + ');\n' +
    'var post = function (m) { try { bc.postMessage(m); } catch (e) {} };\n' +
    'var realFetch = self.fetch;\n' +
    'self.fetch = function (input, init) {\n' +
    '  var url = typeof input === "string" ? input : (input && input.url) || String(input);\n' +
    '  return realFetch.apply(this, arguments).then(function (resp) {\n' +
    '    try { forwardSegment(url, resp, post); } catch (e) {}\n' +
    '    if (resp.ok && /\\.m3u8(\\?|$)/i.test(url)) return stripPrefetch(resp);\n' +
    '    return resp;\n' +
    '  });\n' +
    '};\n' +
    '})();\n';

  function readSync(url) {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.overrideMimeType('text/javascript');
    xhr.send();
    if (xhr.status !== 200 && xhr.status !== 0) throw new Error('HTTP ' + xhr.status);
    return xhr.responseText;
  }

  const RealWorker = window.Worker;
  class HookedWorker extends RealWorker {
    constructor(url, options) {
      let target = url;
      if (!(options && options.type === 'module')) {
        try {
          const src = readSync(new URL(String(url), location.href).href);
          target = URL.createObjectURL(new Blob([workerPrelude, '\n', src], { type: 'text/javascript' }));
        } catch (e) {
          // Some workers (blob URLs already revoked) can't be read; the video worker can.
        }
      }
      try {
        super(target, options);
      } catch (e) {
        super(url, options);
      }
    }
  }
  window.Worker = HookedWorker;

  // Main-world fetch too, in case segments are ever fetched outside a worker.
  const realFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input);
    return realFetch.apply(this, arguments).then((resp) => {
      try { forwardSegment(url, resp, deliver); } catch (e) {}
      if (resp.ok && /\.m3u8(\?|$)/i.test(url)) return stripPrefetch(resp);
      return resp;
    });
  };

  function deliver(msg) {
    if (msg.kind === 'segment' && ss.onSegment) ss.onSegment(msg);
  }
  new BroadcastChannel(CHANNEL).onmessage = (e) => deliver(e.data);
})();
