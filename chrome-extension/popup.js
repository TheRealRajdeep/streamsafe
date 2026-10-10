const KEYS = ['deepgramKey', 'typesafeKey', 'anthropicKey'];
const STATS = ['beeped', 'chatMasked', 'jevAdded', 'jevCleared', 'chunks', 'sttFail', 'classifierLate'];
const $ = (id) => document.getElementById(id);
const chips = [...document.querySelectorAll('[data-classifier]')];

let shown = {}; // last rendered stat values, to animate changes

function setEnabled(on) {
  $('enabled').setAttribute('aria-checked', String(on));
  $('status').dataset.on = String(on);
  $('status').textContent = on ? 'on duty — keeping twitch clean' : 'off — swears get through';
}

function setClassifier(value) {
  for (const c of chips) c.setAttribute('aria-checked', String(c.dataset.classifier === value));
}

function setThreshold(t) {
  $('threshold').value = t;
  $('thresholdValue').textContent = Number(t).toFixed(2);
}

function renderKeys(s) {
  const classifierKey = (s.classifier === 'haiku') ? s.anthropicKey : s.typesafeKey;
  const ok = !!s.deepgramKey && !!classifierKey;
  $('keysOk').dataset.ok = String(ok);
  $('keysOk').textContent = ok ? 'keys set ✓' : 'keys missing!';
  if (!ok) $('settings').open = true;
}

function renderStats(s) {
  const stats = s.stats || {};
  for (const k of STATS) {
    const v = stats[k] || 0;
    const el = $(k);
    el.textContent = v;
    if (shown[k] !== undefined && v > shown[k] && el.classList.contains('num')) {
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
    shown[k] = v;
  }
  $('lastError').textContent = s.lastError ? 'last error: ' + s.lastError : '';
}

function render(s) {
  setEnabled(s.enabled !== false);
  setClassifier(s.classifier || 'jev');
  setThreshold(typeof s.threshold === 'number' ? s.threshold : 0.5);
  for (const k of KEYS) if (document.activeElement !== $(k)) $(k).value = s[k] || '';
  renderKeys(s);
  renderStats(s);
}

chrome.storage.local.get(null, render);
chrome.storage.onChanged.addListener(() => chrome.storage.local.get(null, renderStats));

$('enabled').addEventListener('click', () => {
  const on = $('enabled').getAttribute('aria-checked') !== 'true';
  setEnabled(on);
  chrome.storage.local.set({ enabled: on });
});

for (const c of chips) c.addEventListener('click', () => setClassifier(c.dataset.classifier));
$('threshold').addEventListener('input', () => setThreshold($('threshold').value));

$('save').addEventListener('click', async () => {
  const t = parseFloat($('threshold').value);
  const next = {
    classifier: chips.find((c) => c.getAttribute('aria-checked') === 'true').dataset.classifier,
    threshold: Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0.5,
  };
  for (const k of KEYS) next[k] = $(k).value.trim();
  await chrome.storage.local.set(next);
  chrome.storage.local.get(null, renderKeys);
  $('saved').textContent = 'saved!';
  setTimeout(() => ($('saved').textContent = ''), 1500);
});

$('reset').addEventListener('click', () => {
  shown = {};
  chrome.storage.local.set({ stats: {}, lastError: '' });
});
