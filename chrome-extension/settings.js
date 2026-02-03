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
    excludeSponsored: true,
    skipOneSize: false,
    excludeUrlSubstrings: [],
    excludeTitleKeywords: [],
    includeCategories: ['sneakers', 'streetwear', 'collectibles', 'electronics', 'trading-cards', 'handbags', 'watches'],
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

async function saveSlackStatus(patch) {
  return await new Promise((resolve) => {
    try {
      const p = patch && typeof patch === 'object' ? patch : {};
      const next = { ...(p || {}), updatedAt: Date.now() };
      chrome.storage.local.set({ [SLACK_STATUS_KEY]: next }, () => {
        void chrome.runtime.lastError;
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}

function renderSlackStatus(status) {
  const el = document.getElementById('slackStatus');
  if (!el) return;
  try {
    if (!status) {
      el.textContent = 'Last Slack send: — (no sends yet)';
      return;
    }
    const ok = status.ok;
    const err = String(status.lastError || '').trim();
    const t = (ts) => (ts ? new Date(Number(ts)).toLocaleString() : '');
    if (ok === true) {
      el.textContent = `Last Slack send: OK (${t(status.lastOkAt || status.updatedAt)})`;
      return;
    }
    if (ok === false) {
      el.textContent = `Last Slack send: FAILED (${t(status.lastErrorAt || status.updatedAt)}) • ${err || 'unknown error'}`;
      return;
    }
    el.textContent = `Last Slack send: pending… (${t(status.lastAttemptAt || status.updatedAt)})${err ? ` • ${err}` : ''}`;
  } catch {
    el.textContent = 'Last Slack send: —';
  }
}

async function sendSlackTest({ webhookUrl, channel, mention } = {}) {
  const url = String(webhookUrl || '').trim();
  if (!url) return { ok: false, error: 'Missing webhook URL.' };
  try {
    const m = String(mention || '').trim();
    const mentionText = m ? `${m} ` : '';
    // Use a realistic example StockX URL so you can verify the formatting end-to-end.
    const example = {
      title: 'Jordan 12 Retro Pearl Pink (GS)',
      sizeLabel: '6Y',
      url: 'https://stockx.com/air-jordan-12-retro-pearl-pink-gs',
      highestBid: 55,
      lowestAsk: 105,
      avg30d: 134,
      profit: 29,
      imageUrl: 'https://images.stockx.com/images/Air-Jordan-12-Retro-Pearl-Pink-GS.jpg'
    };
    // #region agent log (debug-session)
    try {
      fetch('http://127.0.0.1:7242/ingest/80c2e612-47e3-4f28-8d98-15f80c4fae0e', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'debug-session',
          runId: 'post-fix',
          hypothesisId: 'H8',
          location: 'settings.js:sendSlackTest',
          message: 'Sending TEST Slack message with parent-only link (reverted)',
          data: {
            url: String(example.url || '').slice(0, 220)
          },
          timestamp: Date.now()
        })
      }).catch(() => {});
    } catch {}
    // #endregion agent log (debug-session)
    const payload = {
      text: `${mentionText}TEST Opportunity: ${example.title} (${example.sizeLabel}) profit $${example.profit}`,
      link_names: true,
      blocks: [
        ...(m ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: `${m}` }] }] : []),
        { type: 'header', text: { type: 'plain_text', text: 'TEST Opportunity found', emoji: true } },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `<${example.url}|${example.title} (${example.sizeLabel})>`
          },
          ...(example.imageUrl
            ? { accessory: { type: 'image', image_url: example.imageUrl, alt_text: example.title.slice(0, 80) } }
            : {})
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Size*\n${example.sizeLabel}` },
            { type: 'mrkdwn', text: `*Mode*\nbid` },
            { type: 'mrkdwn', text: `*Highest Bid*\n$${example.highestBid}` },
            { type: 'mrkdwn', text: `*Lowest Ask*\n$${example.lowestAsk}` },
            { type: 'mrkdwn', text: `*Avg 30d*\n$${example.avg30d}` },
            { type: 'mrkdwn', text: `*Profit*\n$${example.profit}` }
          ]
        }
      ]
    };
    const ch = String(channel || '').trim();
    if (ch) payload.channel = ch;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const txt = await resp.text().catch(() => '');
    if (!resp.ok) {
      const err = `Slack error ${resp.status}: ${txt || '(no body)'}`;
      try {
        await saveSlackStatus({ ok: false, lastErrorAt: Date.now(), lastError: err });
      } catch {}
      return { ok: false, error: err };
    }
    try {
      await saveSlackStatus({ ok: true, lastOkAt: Date.now(), lastError: '' });
    } catch {}
    return { ok: true, body: txt };
  } catch (e) {
    try {
      await saveSlackStatus({ ok: false, lastErrorAt: Date.now(), lastError: e?.message || String(e) });
    } catch {}
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
  const excludeSponsored = !!document.getElementById('excludeSponsored')?.checked;
  const skipOneSize = !!document.getElementById('skipOneSize')?.checked;
  const excludeUrlSubstrings = parseLineList(document.getElementById('excludeUrlSubstrings')?.value);
  const excludeTitleKeywords = parseLineList(document.getElementById('excludeTitleKeywords')?.value);

  const includeCategories = Array.from(document.querySelectorAll('input[data-cat]'))
    .filter((el) => el.checked)
    .map((el) => String(el.getAttribute('data-cat') || '').trim())
    .filter(Boolean);

  const slackEnabled = !!document.getElementById('slackEnabled')?.checked;
  const slackWebhookUrl = String(document.getElementById('slackWebhookUrl')?.value || '').trim();
  const slackChannel = String(document.getElementById('slackChannel')?.value || '').trim();
  const slackMention = String(document.getElementById('slackMention')?.value || '').trim();

  return {
    minSales30d: minSales30d ?? defaultSettings().minSales30d,
    minProfit: minProfit ?? defaultSettings().minProfit,
    minRoiPct: minRoiPct ?? defaultSettings().minRoiPct,
    avg30dCushionPct: avg30dCushionPct ?? defaultSettings().avg30dCushionPct,
    xpressMinDiscountPct: xpressMinDiscountPct ?? defaultSettings().xpressMinDiscountPct,
    feeSum: feeSum ?? defaultSettings().feeSum,
    excludeRecentReleaseDays: excludeRecentReleaseDays ?? defaultSettings().excludeRecentReleaseDays,
    excludeSponsored,
    skipOneSize,
    excludeUrlSubstrings,
    excludeTitleKeywords,
    includeCategories: includeCategories.length ? includeCategories : defaultSettings().includeCategories,
    slackEnabled,
    slackWebhookUrl,
    slackChannel,
    slackMention
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
  document.getElementById('excludeSponsored').checked = !!s.excludeSponsored;
  document.getElementById('skipOneSize').checked = !!s.skipOneSize;
  document.getElementById('excludeUrlSubstrings').value = formatLineList(s.excludeUrlSubstrings);
  document.getElementById('excludeTitleKeywords').value = formatLineList(s.excludeTitleKeywords);

  const set = new Set(Array.isArray(s.includeCategories) ? s.includeCategories : []);
  Array.from(document.querySelectorAll('input[data-cat]')).forEach((el) => {
    const k = String(el.getAttribute('data-cat') || '').trim();
    el.checked = set.has(k);
  });

  document.getElementById('slackEnabled').checked = !!s.slackEnabled;
  document.getElementById('slackWebhookUrl').value = String(s.slackWebhookUrl || '');
  document.getElementById('slackChannel').value = String(s.slackChannel || '');
  document.getElementById('slackMention').value = String(s.slackMention || '');
}

async function loadSlackLogs() {
  return await new Promise((resolve) => {
    try {
      chrome.storage.local.get([SLACK_LOG_KEY], (res) => {
        void chrome.runtime.lastError;
        const cur = res?.[SLACK_LOG_KEY];
        resolve(Array.isArray(cur) ? cur : []);
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
    const rows = Array.isArray(logs) ? logs : [];
    if (!rows.length) {
      el.textContent = '(no logs yet)';
      return;
    }
    const lines = rows
      .slice(-200)
      .map((r) => {
        const ts = r?.ts ? new Date(Number(r.ts)).toLocaleTimeString() : '';
        const lvl = String(r?.level || 'info').toUpperCase();
        const msg = String(r?.msg || '');
        const meta = r?.meta && typeof r.meta === 'object' ? JSON.stringify(r.meta) : '';
        return `${ts} [${lvl}] ${msg}${meta ? ` ${meta}` : ''}`;
      });
    el.textContent = lines.join('\n');
  } catch {
    el.textContent = '(failed to render logs)';
  }
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
  });

  resetBtn?.addEventListener('click', async () => {
    const d = defaultSettings();
    writeForm(d);
    setToast('Reset to defaults (not saved yet).');
  });

  testSlackBtn?.addEventListener('click', async () => {
    try {
      setToast('Sending test to Slack…');
      try {
        await saveSlackStatus({ ok: null, lastAttemptAt: Date.now(), lastError: '' });
      } catch {}
      const s = readForm();
      const res = await sendSlackTest({ webhookUrl: s.slackWebhookUrl, channel: s.slackChannel, mention: s.slackMention });
      setToast(res.ok ? 'Test sent. Check Slack.' : `Slack test failed: ${res.error || 'unknown error'}`);
      try {
        const st = await loadSlackStatus();
        renderSlackStatus(st);
      } catch {}
      try {
        const logs = await loadSlackLogs();
        renderSlackLogs(logs);
      } catch {}
    } catch (e) {
      setToast(`Slack test failed: ${e?.message || String(e)}`);
    }
  });

  copySlackLogsBtn?.addEventListener('click', async () => {
    try {
      const logs = await loadSlackLogs();
      const text = (Array.isArray(logs) ? logs : [])
        .slice(-200)
        .map((r) => JSON.stringify(r))
        .join('\n');
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setToast('Copied Slack logs to clipboard.');
      } else {
        setToast('Clipboard unavailable. Open DevTools and copy from the Slack logs box.');
      }
    } catch (e) {
      setToast(`Copy logs failed: ${e?.message || String(e)}`);
    }
  });

  clearSlackLogsBtn?.addEventListener('click', async () => {
    try {
      await clearSlackLogs();
      const logs = await loadSlackLogs();
      renderSlackLogs(logs);
      setToast('Cleared Slack logs.');
    } catch (e) {
      setToast(`Clear logs failed: ${e?.message || String(e)}`);
    }
  });
});

