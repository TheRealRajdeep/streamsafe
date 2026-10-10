// Status sticker pinned to the top-left of the player, plus a yellow "BEEP"
// pop for each censored word. Styles live in page.css (landing/ look).
(() => {
  'use strict';
  const ss = window.__ss;
  const S = ss.sync;
  const SVG = 'http://www.w3.org/2000/svg';

  let root = null, badge = null, sub = null, beep = null, beepWord = null;
  let warning = null;
  let beepTimer = null;

  function shield() {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('viewBox', '0 0 32 32');
    const body = document.createElementNS(SVG, 'path');
    body.setAttribute('d', 'M16 3 5 7v8c0 6.8 4.6 11.9 11 14 6.4-2.1 11-7.2 11-14V7L16 3Z');
    body.setAttribute('fill', '#2fa66a');
    body.setAttribute('stroke', '#1f1b16');
    body.setAttribute('stroke-width', '2');
    body.setAttribute('stroke-linejoin', 'round');
    const tick = document.createElementNS(SVG, 'path');
    tick.setAttribute('d', 'm11 16 3.4 3.4L21.5 12');
    tick.setAttribute('fill', 'none');
    tick.setAttribute('stroke', '#fff');
    tick.setAttribute('stroke-width', '3');
    tick.setAttribute('stroke-linecap', 'round');
    tick.setAttribute('stroke-linejoin', 'round');
    svg.append(body, tick);
    return svg;
  }

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  };

  function mount() {
    root = el('div', 'ss-ui');
    badge = el('div', 'ss-badge');
    const row = el('div', 'ss-badge-row');
    row.append(shield(), el('span', '', 'streamsafe'), el('span', 'ss-dot'));
    sub = el('div', 'ss-badge-sub');
    badge.append(row, sub);

    beep = el('div', 'ss-beep');
    beepWord = el('div', 'ss-beep-word');
    beep.append(beepWord, el('div', 'ss-beep-label', 'beeped!'));
    beep.style.marginTop = '10px';

    root.append(badge, beep);
    document.body.appendChild(root);
    setInterval(render, 500);
  }

  function render() {
    const video = S.video || S.findPlayerVideo();
    const r = video && video.getBoundingClientRect();
    const show = ss.settings.enabled && r && r.width >= 200;
    badge.dataset.show = String(!!show);
    if (!show) { beep.dataset.show = 'false'; return; }
    root.style.left = Math.round(r.left + 12) + 'px';
    root.style.top = Math.round(r.top + 48) + 'px';

    let state, line;
    if (S.stale) { state = 'stale'; line = 'reload the page to keep filtering'; }
    else if (!S.ctx) { state = 'idle'; line = 'click the page to start'; }
    else if (!S.calibrated) { state = 'syncing'; line = 'syncing with the stream…'; }
    else { state = 'on'; line = ''; }
    badge.dataset.state = state;

    if (warning) {
      sub.textContent = warning;
      sub.classList.add('ss-badge-warn');
    } else {
      sub.textContent = line;
      sub.classList.remove('ss-badge-warn');
    }
  }

  const masked = (w) => {
    const s = String(w || '').replace(/[^\w*']/g, '');
    return s.length <= 1 ? '***' : s[0] + '*'.repeat(s.length - 1);
  };

  ss.badge = {
    warn(msg) { warning = msg; },
    flash(word) {
      if (!beep) return;
      beepWord.textContent = masked(word);
      // Restart the pop animation for back-to-back beeps.
      beep.dataset.show = 'false';
      void beep.offsetWidth;
      beep.dataset.show = 'true';
      clearTimeout(beepTimer);
      beepTimer = setTimeout(() => { beep.dataset.show = 'false'; }, 1500);
    },
  };

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
