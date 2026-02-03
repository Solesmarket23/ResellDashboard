const SETTINGS_KEY = 'stockxScanSettings';
const SLACK_STATUS_KEY = 'stockxSlackLastStatus';
const SLACK_LOG_KEY = 'stockxSlackLogs';

function defaultSettings() {
  return {
    minSales30d: 4,
    minProfit: 15,
    minRoiPct: 0,
    avg30dCushionPct: 15,
    xpressMinDiscountPct: 30,
    feeSum: 21,
    excludeRecentReleaseDays: 30,
    excludeLowAskMax: 69,
    excludeSponsored: true,
    skipOneSize: false,
    excludeUrlSubstrings: [],
    excludeTitleKeywords: [],
    includeCategories: ['sneakers', 'streetwear', 'collectibles', 'electronics', 'trading-cards', 'handbags', 'watches'],

    // Slack (stored in the same settings object so background/content can read it during scans)
    slackEnabled: false,
    slackWebhookUrl: '',
    slackChannel: '',
    slackMention: '@Solesmarket23'
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

function setSlackStatusText(msg) {
  const el = document.getElementById('slackStatus');
  if (!el) return;
  el.textContent = msg ? String(msg) : '';
}

function fmtTime(ts) {
  try {
    const t = Number(ts || 0);
    if (!Number.isFinite(t) || t <= 0) return '—';
    return new Date(t).toLocaleString();
  } catch {
    return '—';
  }
}

async function loadSlackStatus() {
  return await new Promise((resolve) => {
    try {
      chrome.storage.local.get([SLACK_STATUS_KEY], (res) => {
        void chrome.runtime.lastError;
        const cur = res?.[SLACK_STATUS_KEY];
        resolve(cur && typeof cur === 'object' ? cur : null);
      });
    } catch {
      resolve(null);
    }
  });
}

async function loadSlackLogs() {
  return await new Promise((resolve) => {
    try {
      chrome.storage.local.get([SLACK_LOG_KEY], (res) => {
        void chrome.runtime.lastError;
        const cur = Array.isArray(res?.[SLACK_LOG_KEY]) ? res[SLACK_LOG_KEY] : [];
        resolve(cur);
      });
    } catch {
      resolve([]);
    }
  });
}

async function clearSlackLogs() {
  return await new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [SLACK_LOG_KEY]: [] }, () => {
        void chrome.runtime.lastError;
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}

function renderSlackLogs(logs) {
  const el = document.getElementById('slackLogs');
  if (!el) return;
  try {
    const arr = Array.isArray(logs) ? logs : [];
    const lines = arr.slice(-200).map((l) => {
      const ts = fmtTime(l?.ts);
      const level = String(l?.level || 'info').toUpperCase();
      const msg = String(l?.msg || '');
      const meta = l?.meta && typeof l.meta === 'object' ? JSON.stringify(l.meta) : '';
      return `${ts} [${level}] ${msg}${meta ? ` ${meta}` : ''}`;
    });
    el.textContent = lines.join('\n') || '—';
  } catch {
    el.textContent = '—';
  }
}

function renderSlackStatus(status) {
  try {
    if (!status) return setSlackStatusText('Last Slack send: — (no sends yet)');
    const ok = status.ok;
    const err = String(status.lastError || '').trim();
    if (ok === true) return setSlackStatusText(`Last Slack send: OK (${fmtTime(status.lastOkAt || status.updatedAt)})`);
    if (ok === false) return setSlackStatusText(`Last Slack send: FAILED (${fmtTime(status.lastErrorAt || status.updatedAt)}) • ${err || 'unknown error'}`);
    if (ok === null) return setSlackStatusText(`Last Slack send: pending… (${fmtTime(status.lastAttemptAt || status.updatedAt)})${err ? ` • ${err}` : ''}`);
    return setSlackStatusText('Last Slack send: —');
  } catch {
    setSlackStatusText('Last Slack send: —');
  }
}

async function copyTextToClipboardBestEffort(text) {
  const t = String(text || '');
  if (!t) return false;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(t);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return !!ok;
  } catch {
    return false;
  }
}

async function sendSlackTest({ webhookUrl, channel, mention } = {}) {
  const url = String(webhookUrl || '').trim();
  if (!url) return { ok: false, error: 'Missing webhook URL.' };
  try {
    const payload = {
      text: `${String(mention || '').trim() ? `${String(mention || '').trim()} ` : ''}StockX Scanner test message ✅`,
      channel: String(channel || '').trim() || undefined
    };
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { ok: false, error: `Slack error ${res.status}: ${txt || '(no body)'}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function parseLineList(v) {
  try {
    const raw = String(v == null ? '' : v);
    const parts = raw
      .split(/\r?\n|,/g)
      .map((s) => String(s || '').trim())
      .filter(Boolean);
    // De-dupe, keep order
    const seen = new Set();
    const out = [];
    for (const p of parts) {
      const k = p.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
    return out;
  } catch {
    return [];
  }
}

function formatLineList(arr) {
  try {
    const a = Array.isArray(arr) ? arr : [];
    return a.map((x) => String(x || '').trim()).filter(Boolean).join('\n');
  } catch {
    return '';
  }
}

function readForm() {
  const minSales30d = clampInt(document.getElementById('minSales30d')?.value, { min: 0, max: 999 });
  const minProfit = clampInt(document.getElementById('minProfit')?.value, { min: 0, max: 9999 });
  const minRoiPct = clampFloat(document.getElementById('minRoiPct')?.value, { min: 0, max: 999 });
  const avg30dCushionPct = clampFloat(document.getElementById('avg30dCushionPct')?.value, { min: 0, max: 95 });
  const xpressMinDiscountPct = clampFloat(document.getElementById('xpressMinDiscountPct')?.value, { min: 0, max: 95 });
  const feeSum = clampInt(document.getElementById('feeSum')?.value, { min: 0, max: 9999 });
  const excludeRecentReleaseDays = clampInt(document.getElementById('excludeRecentReleaseDays')?.value, { min: 0, max: 3650 });
  const excludeLowAskMax = clampInt(document.getElementById('excludeLowAskMax')?.value, { min: 0, max: 999999 });
  const excludeSponsored = !!document.getElementById('excludeSponsored')?.checked;
  const skipOneSize = !!document.getElementById('skipOneSize')?.checked;
  const excludeUrlSubstrings = parseLineList(document.getElementById('excludeUrlSubstrings')?.value);
  const excludeTitleKeywords = parseLineList(document.getElementById('excludeTitleKeywords')?.value);
  const slackEnabled = !!document.getElementById('slackEnabled')?.checked;
  const slackWebhookUrl = String(document.getElementById('slackWebhookUrl')?.value || '').trim();
  const slackChannel = String(document.getElementById('slackChannel')?.value || '').trim();
  const slackMention = String(document.getElementById('slackMention')?.value || '').trim();

  const includeCategories = Array.from(document.querySelectorAll('input[data-cat]'))
    .filter((el) => el.checked)
    .map((el) => String(el.getAttribute('data-cat') || '').trim())
    .filter(Boolean);

  return {
    minSales30d: minSales30d ?? defaultSettings().minSales30d,
    minProfit: minProfit ?? defaultSettings().minProfit,
    minRoiPct: minRoiPct ?? defaultSettings().minRoiPct,
    avg30dCushionPct: avg30dCushionPct ?? defaultSettings().avg30dCushionPct,
    xpressMinDiscountPct: xpressMinDiscountPct ?? defaultSettings().xpressMinDiscountPct,
    feeSum: feeSum ?? defaultSettings().feeSum,
    excludeRecentReleaseDays: excludeRecentReleaseDays ?? defaultSettings().excludeRecentReleaseDays,
    excludeLowAskMax: excludeLowAskMax ?? defaultSettings().excludeLowAskMax,
    excludeSponsored,
    skipOneSize,
    excludeUrlSubstrings,
    excludeTitleKeywords,
    includeCategories: includeCategories.length ? includeCategories : defaultSettings().includeCategories,

    slackEnabled,
    slackWebhookUrl,
    slackChannel,
    slackMention: slackMention || defaultSettings().slackMention
  };
}

function writeForm(s) {
  document.getElementById('minSales30d').value = String(s.minSales30d ?? '');
  document.getElementById('minProfit').value = String(s.minProfit ?? '');
  document.getElementById('minRoiPct').value = String(s.minRoiPct ?? '');
  document.getElementById('avg30dCushionPct').value = String(s.avg30dCushionPct ?? '');
  document.getElementById('xpressMinDiscountPct').value = String(s.xpressMinDiscountPct ?? '');
  document.getElementById('feeSum').value = String(s.feeSum ?? '');
  document.getElementById('excludeRecentReleaseDays').value = String(s.excludeRecentReleaseDays ?? '');
  document.getElementById('excludeLowAskMax').value = String(s.excludeLowAskMax ?? '');
  document.getElementById('excludeSponsored').checked = !!s.excludeSponsored;
  document.getElementById('skipOneSize').checked = !!s.skipOneSize;
  document.getElementById('excludeUrlSubstrings').value = formatLineList(s.excludeUrlSubstrings);
  document.getElementById('excludeTitleKeywords').value = formatLineList(s.excludeTitleKeywords);
  document.getElementById('slackEnabled').checked = !!s.slackEnabled;
  document.getElementById('slackWebhookUrl').value = String(s.slackWebhookUrl || '');
  document.getElementById('slackChannel').value = String(s.slackChannel || '');
  document.getElementById('slackMention').value = String(s.slackMention || '');

  const set = new Set(Array.isArray(s.includeCategories) ? s.includeCategories : []);
  Array.from(document.querySelectorAll('input[data-cat]')).forEach((el) => {
    const k = String(el.getAttribute('data-cat') || '').trim();
    el.checked = set.has(k);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');
  const testSlackBtn = document.getElementById('testSlackBtn');
  const copySlackLogsBtn = document.getElementById('copySlackLogsBtn');
  const clearSlackLogsBtn = document.getElementById('clearSlackLogsBtn');

  const cur = await loadSettings();
  writeForm(cur);
  setToast('');

  // Slack status/logs (separate keys)
  try {
    const st = await loadSlackStatus();
    renderSlackStatus(st);
  } catch {}
  try {
    const logs = await loadSlackLogs();
    renderSlackLogs(logs);
  } catch {}

  saveBtn?.addEventListener('click', async () => {
    setToast('Saving…');
    const next = readForm();
    const ok = await saveSettings(next);
    setToast(ok ? 'Saved.' : 'Failed to save.');
    try {
      const st = await loadSlackStatus();
      renderSlackStatus(st);
    } catch {}
  });

  resetBtn?.addEventListener('click', async () => {
    const d = defaultSettings();
    writeForm(d);
    setToast('Reset to defaults (not saved yet).');
  });

  testSlackBtn?.addEventListener('click', async () => {
    try {
      setToast('Sending test to Slack…');
      const s = readForm();
      const res = await sendSlackTest({ webhookUrl: s.slackWebhookUrl, channel: s.slackChannel, mention: s.slackMention });
      setToast(res.ok ? 'Test sent. Check Slack.' : `Slack test failed: ${res.error || 'unknown error'}`);
      const st = await loadSlackStatus();
      renderSlackStatus(st);
      const logs = await loadSlackLogs();
      renderSlackLogs(logs);
    } catch (e) {
      setToast(`Slack test failed: ${e?.message || String(e)}`);
    }
  });

  copySlackLogsBtn?.addEventListener('click', async () => {
    try {
      const logs = await loadSlackLogs();
      const txt = (Array.isArray(logs) ? logs : []).map((l) => JSON.stringify(l)).join('\n');
      const ok = await copyTextToClipboardBestEffort(txt);
      setToast(ok ? 'Copied Slack logs to clipboard.' : 'Clipboard unavailable. Open DevTools and copy from the Slack logs box.');
    } catch {
      setToast('Copy failed.');
    }
  });

  clearSlackLogsBtn?.addEventListener('click', async () => {
    try {
      await clearSlackLogs();
      const logs = await loadSlackLogs();
      renderSlackLogs(logs);
      setToast('Cleared Slack logs.');
    } catch {
      setToast('Clear failed.');
    }
  });
});

