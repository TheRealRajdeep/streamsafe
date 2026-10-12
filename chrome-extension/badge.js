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

  function headphones() {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('viewBox', '0 0 32 32');
    const node = (tag, attrs) => {
      const e = document.createElementNS(SVG, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      return e;
    };
    const cup = (x) => node('rect', {
      x, y: '15.5', width: '10', height: '14', rx: '4.5',
      fill: '#2fa66a', stroke: '#1f1b16', 'stroke-width': '2',
    });
    svg.append(
      node('path', {
        d: 'M7 18v-3a9 9 0 0 1 18 0v3', fill: 'none',
        stroke: '#1f1b16', 'stroke-width': '3.2', 'stroke-linecap': 'round',
      }),
      cup('2.5'),
      cup('19.5'),
      node('path', {
        d: 'M7.5 20.5v4M24.5 20.5v4',
        stroke: '#fff', 'stroke-width': '2.6', 'stroke-linecap': 'round',
      }),
    );
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
    row.append(headphones(), el('span', '', 'earmuffs'), el('span', 'ss-dot'));
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
