// Isolated-world relay between page scripts (window.postMessage) and the
// service worker (chrome.runtime). Never forwards API keys to the page.
(() => {
  'use strict';
  const ALLOWED = new Set(['transcribe', 'classify']);

  function pageSettings(s) {
    return {
      enabled: s.enabled !== false,
      threshold: typeof s.threshold === 'number' ? s.threshold : 0.5,
      classifier: s.classifier || 'jev',
      hasDeepgram: !!s.deepgramKey,
      hasClassifierKey: s.classifier === 'haiku' ? !!s.anthropicKey : !!s.typesafeKey,
    };
  }

  function pushSettings() {
    chrome.storage.local.get(null, (s) => {
      window.postMessage({ __ss: 'settings', settings: pageSettings(s || {}) }, '*');
    });
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || typeof e.data.__ss !== 'string') return;
    const m = e.data;
    if (m.__ss === 'hello') {
      pushSettings();
    } else if (m.__ss === 'req' && ALLOWED.has(m.type)) {
      chrome.runtime.sendMessage({ type: m.type, payload: m.payload }, (res) => {
        const err = chrome.runtime.lastError;
        window.postMessage({
          __ss: 'res',
          id: m.id,
          ok: !err && !!res && res.ok,
          result: res && res.result,
          error: err ? err.message : res && res.error,
        }, '*');
      });
    } else if (m.__ss === 'stats') {
      chrome.runtime.sendMessage({ type: 'stats', payload: m.delta }, () => void chrome.runtime.lastError);
    } else if (m.__ss === 'error') {
      chrome.runtime.sendMessage({ type: 'error', payload: m.message }, () => void chrome.runtime.lastError);
    }
  });

  chrome.storage.onChanged.addListener(pushSettings);
  pushSettings();
})();
