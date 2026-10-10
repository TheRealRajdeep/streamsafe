// Small status badge pinned to the top-left of the player. Flashes each beep.
(() => {
  'use strict';
  const ss = window.__ss;
  const S = ss.sync;

  let el = null, statusEl = null, flashEl = null, warnEl = null;
  let warning = null;
  let flashTimer = null;

  function mount() {
    el = document.createElement('div');
    el.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;display:none;' +
      'font:600 12px/1.4 system-ui,sans-serif;color:#fff;background:rgba(20,20,28,.82);' +
      'border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:6px 10px;max-width:320px;' +
      'box-shadow:0 2px 10px rgba(0,0,0,.4);transition:background .15s';
    statusEl = document.createElement('div');
    flashEl = document.createElement('div');
    flashEl.style.cssText = 'display:none;margin-top:3px;color:#ffd166;font-size:13px';
    warnEl = document.createElement('div');
    warnEl.style.cssText = 'display:none;margin-top:3px;color:#ff8a80;font-weight:500';
    el.append(statusEl, flashEl, warnEl);
    document.body.appendChild(el);
    setInterval(render, 500);
  }

  function render() {
    const video = S.video || S.findPlayerVideo();
    if (!ss.settings.enabled || !video) { el.style.display = 'none'; return; }
    const r = video.getBoundingClientRect();
    if (r.width < 200) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.style.left = Math.round(r.left + 10) + 'px';
    el.style.top = Math.round(r.top + 44) + 'px';

    let status;
    if (S.stale) status = '⚠ StreamSafe — reload the page to keep filtering';
    else if (!S.ctx) status = '🛡 StreamSafe — click the page to enable';
    else if (!S.calibrated) status = '🛡 StreamSafe — syncing…';
    else status = '🛡 StreamSafe on';
    statusEl.textContent = status;

    warnEl.textContent = warning ? '⚠ ' + warning : '';
    warnEl.style.display = warning ? 'block' : 'none';
  }

  const masked = (w) => {
    const s = String(w || '').replace(/[^\w*']/g, '');
    return s.length <= 1 ? '***' : s[0] + '*'.repeat(s.length - 1);
  };

  ss.badge = {
    warn(msg) { warning = msg; },
    flash(word) {
      if (!el) return;
      flashEl.textContent = '🔇 beeped "' + masked(word) + '"';
      flashEl.style.display = 'block';
      el.style.background = 'rgba(160,30,60,.9)';
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        flashEl.style.display = 'none';
        el.style.background = 'rgba(20,20,28,.82)';
      }, 1500);
    },
  };

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
