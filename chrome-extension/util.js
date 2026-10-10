// Shared page-world helpers and the RPC channel to bridge.js.
// All page scripts share the window.__ss namespace (same MAIN world, loaded in order).
(() => {
  'use strict';
  const ss = (window.__ss = window.__ss || {});

  ss.log = (...a) => console.log('[streamsafe]', ...a);
  ss.warn = (...a) => console.warn('[streamsafe]', ...a);

  ss.concatBytes = (parts) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  };
  ss.concatFloat = (parts) => {
    const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  };
  ss.median = (a) => {
    if (!a.length) return NaN;
    const s = [...a].sort((x, y) => x - y);
    return s[s.length >> 1];
  };
  ss.toBase64 = (bytes) => {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };

  // Settings pushed by bridge.js (never contains API keys).
  ss.settings = { enabled: true, threshold: 0.5, classifier: 'jev', hasDeepgram: false, hasClassifierKey: false };
  ss.settingsListeners = [];

  const waiting = new Map();
  let nextId = 1;
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || typeof e.data.__ss !== 'string') return;
    const m = e.data;
    if (m.__ss === 'res') {
      const w = waiting.get(m.id);
      if (!w) return;
      waiting.delete(m.id);
      if (m.ok) w.resolve(m.result);
      else w.reject(new Error(m.error || 'request failed'));
    } else if (m.__ss === 'settings') {
      Object.assign(ss.settings, m.settings);
      for (const fn of ss.settingsListeners) fn(ss.settings);
    }
  });

  /** Request to the service worker via bridge.js. Rejects on timeout. */
  ss.rpc = (type, payload, timeoutMs) => new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve, reject });
    window.postMessage({ __ss: 'req', id, type, payload }, '*');
    if (timeoutMs) {
      setTimeout(() => {
        if (waiting.delete(id)) reject(new Error(type + ' timeout after ' + timeoutMs + 'ms'));
      }, timeoutMs);
    }
  });

  ss.stat = (delta) => window.postMessage({ __ss: 'stats', delta }, '*');
  ss.reportError = (message) => window.postMessage({ __ss: 'error', message: String(message) }, '*');

  window.postMessage({ __ss: 'hello' }, '*'); // ask bridge for settings
})();
