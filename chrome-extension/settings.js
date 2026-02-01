const SETTINGS_KEY = 'stockxScanSettings';

function defaultSettings() {
  return {
    minSales30d: 4,
    minProfit: 15,
    minRoiPct: 0,
    feeSum: 21,
    excludeRecentReleaseDays: 30,
    excludeSponsored: true,
    skipOneSize: false,
    includeCategories: ['sneakers', 'streetwear', 'collectibles', 'electronics', 'trading-cards', 'handbags', 'watches']
  };
}

function clampInt(v, { min = 0, max = 9999 } = {}) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

function clampFloat(v, { min = 0, max = 9999 } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

async function loadSettings() {
  return await new Promise((resolve) => {
    try {
      chrome.storage.local.get([SETTINGS_KEY], (res) => {
        void chrome.runtime.lastError;
        const cur = res?.[SETTINGS_KEY] && typeof res[SETTINGS_KEY] === 'object' ? res[SETTINGS_KEY] : null;
        resolve({ ...defaultSettings(), ...(cur || {}) });
      });
    } catch {
      resolve(defaultSettings());
    }
  });
}

async function saveSettings(next) {
  return await new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [SETTINGS_KEY]: next }, () => {
        void chrome.runtime.lastError;
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}

function setToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg || '';
}

function readForm() {
  const minSales30d = clampInt(document.getElementById('minSales30d')?.value, { min: 0, max: 999 });
  const minProfit = clampInt(document.getElementById('minProfit')?.value, { min: 0, max: 9999 });
  const minRoiPct = clampFloat(document.getElementById('minRoiPct')?.value, { min: 0, max: 999 });
  const feeSum = clampInt(document.getElementById('feeSum')?.value, { min: 0, max: 9999 });
  const excludeRecentReleaseDays = clampInt(document.getElementById('excludeRecentReleaseDays')?.value, { min: 0, max: 3650 });
  const excludeSponsored = !!document.getElementById('excludeSponsored')?.checked;
  const skipOneSize = !!document.getElementById('skipOneSize')?.checked;

  const includeCategories = Array.from(document.querySelectorAll('input[data-cat]'))
    .filter((el) => el.checked)
    .map((el) => String(el.getAttribute('data-cat') || '').trim())
    .filter(Boolean);

  return {
    minSales30d: minSales30d ?? defaultSettings().minSales30d,
    minProfit: minProfit ?? defaultSettings().minProfit,
    minRoiPct: minRoiPct ?? defaultSettings().minRoiPct,
    feeSum: feeSum ?? defaultSettings().feeSum,
    excludeRecentReleaseDays: excludeRecentReleaseDays ?? defaultSettings().excludeRecentReleaseDays,
    excludeSponsored,
    skipOneSize,
    includeCategories: includeCategories.length ? includeCategories : defaultSettings().includeCategories
  };
}

function writeForm(s) {
  document.getElementById('minSales30d').value = String(s.minSales30d ?? '');
  document.getElementById('minProfit').value = String(s.minProfit ?? '');
  document.getElementById('minRoiPct').value = String(s.minRoiPct ?? '');
  document.getElementById('feeSum').value = String(s.feeSum ?? '');
  document.getElementById('excludeRecentReleaseDays').value = String(s.excludeRecentReleaseDays ?? '');
  document.getElementById('excludeSponsored').checked = !!s.excludeSponsored;
  document.getElementById('skipOneSize').checked = !!s.skipOneSize;

  const set = new Set(Array.isArray(s.includeCategories) ? s.includeCategories : []);
  Array.from(document.querySelectorAll('input[data-cat]')).forEach((el) => {
    const k = String(el.getAttribute('data-cat') || '').trim();
    el.checked = set.has(k);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');

  const cur = await loadSettings();
  writeForm(cur);
  setToast('');

  saveBtn?.addEventListener('click', async () => {
    setToast('Saving…');
    const next = readForm();
    const ok = await saveSettings(next);
    setToast(ok ? 'Saved.' : 'Failed to save.');
  });

  resetBtn?.addEventListener('click', async () => {
    const d = defaultSettings();
    writeForm(d);
    setToast('Reset to defaults (not saved yet).');
  });
});

