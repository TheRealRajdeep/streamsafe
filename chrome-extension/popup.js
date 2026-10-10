const KEYS = ['deepgramKey', 'typesafeKey', 'anthropicKey'];
const STATS = ['beeped', 'chatMasked', 'jevAdded', 'jevCleared', 'chunks', 'sttFail', 'classifierLate'];
const $ = (id) => document.getElementById(id);

function render(s) {
  $('enabled').checked = s.enabled !== false;
  $('classifier').value = s.classifier || 'jev';
  $('threshold').value = typeof s.threshold === 'number' ? s.threshold : 0.5;
  for (const k of KEYS) if (document.activeElement !== $(k)) $(k).value = s[k] || '';
  renderStats(s);
}

function renderStats(s) {
  const stats = s.stats || {};
  for (const k of STATS) $(k).textContent = stats[k] || 0;
  $('lastError').textContent = s.lastError ? 'Last error: ' + s.lastError : '';
}

chrome.storage.local.get(null, render);
chrome.storage.onChanged.addListener(() => chrome.storage.local.get(null, renderStats));

$('enabled').addEventListener('change', () => chrome.storage.local.set({ enabled: $('enabled').checked }));

$('save').addEventListener('click', async () => {
  const t = parseFloat($('threshold').value);
  const next = { classifier: $('classifier').value, threshold: Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0.5 };
  for (const k of KEYS) next[k] = $(k).value.trim();
  await chrome.storage.local.set(next);
  $('saved').textContent = 'Saved ✓';
  setTimeout(() => ($('saved').textContent = ''), 1500);
});

$('reset').addEventListener('click', () => chrome.storage.local.set({ stats: {}, lastError: '' }));
