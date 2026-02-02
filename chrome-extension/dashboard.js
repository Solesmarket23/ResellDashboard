const ACTIVE_ID_KEY = 'stockxActiveListingScanId';
const LAST_ID_KEY = 'stockxLastListingScanId';
const HISTORY_KEY = 'stockxScanHistory';
const SCAN_COUNTER_KEY = 'stockxScanCounter';

function $(id) {
  return document.getElementById(id);
}

function safeStr(v) {
  return String(v == null ? '' : v);
}

function fmtInt(n) {
  const x = Number(n);
  return Number.isFinite(x) ? String(Math.round(x)) : '—';
}

function fmtPct(done, total) {
  const d = Number(done);
  const t = Number(total);
  if (!Number.isFinite(d) || !Number.isFinite(t) || t <= 0) return '—';
  return `${Math.max(0, Math.min(100, Math.round((d / t) * 100)))}%`;
}

function fmtDurationMs(ms) {
  const x = Number(ms);
  if (!Number.isFinite(x) || x < 0) return '—';
  const totalSec = Math.floor(x / 1000);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  const pad2 = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

function computeElapsedMeta({ scanId, ids, state, history }) {
  try {
    const startedAtState = Number(state?.startedAt || 0);
    const finishedAtState = Number(state?.finishedAt || 0);
    let startedAt = startedAtState;
    let finishedAt = finishedAtState;

    // Fallback to history timestamps if state is missing them.
    if ((!startedAt || !Number.isFinite(startedAt)) && Array.isArray(history)) {
      const h = history.find((x) => safeStr(x?.scanId || '') === safeStr(scanId));
      const hs = Number(h?.startedAt || 0);
      const hf = Number(h?.finishedAt || 0);
      if (Number.isFinite(hs) && hs > 0) startedAt = hs;
      if (Number.isFinite(hf) && hf > 0) finishedAt = hf;
    }

    const isActiveSelected = !!(ids?.active && scanId && ids.active === scanId);
    const isRunning = isActiveSelected && !finishedAt;
    return { startedAt, finishedAt, isRunning };
  } catch {
    return { startedAt: 0, finishedAt: 0, isRunning: false };
  }
}

function updateElapsedUi(meta) {
  try {
    const el = $('elapsed');
    if (!el) return;
    const startedAt = Number(meta?.startedAt || 0);
    const finishedAt = Number(meta?.finishedAt || 0);
    if (!Number.isFinite(startedAt) || startedAt <= 0) {
      el.textContent = '—';
      return;
    }
    const end = Number.isFinite(finishedAt) && finishedAt > 0 ? finishedAt : Date.now();
    el.textContent = fmtDurationMs(Math.max(0, end - startedAt));
  } catch {}
}

function escapeHtml(s) {
  return safeStr(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function setToast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg ? safeStr(msg) : '';
}

function groupErrorReason(r) {
  try {
    if (!r) return 'unknown';
    if (r.userExcluded) return 'excluded: user rule';
    if (r.releaseFutureExcluded) return 'excluded: future release';
    if (r.releaseExcluded) return 'excluded: recent release';
    if (r.success === false) return 'scan failed';
    const e = safeStr(r.error || '').toLowerCase();
    if (e.includes('timeout')) return 'timeout';
    if (e.includes('market data') && e.includes('open')) return 'market data did not open';
    if (e.includes('parse')) return 'parse error';
    // Re-using an already-open modal isn't an error; don't spam a scary label.
    if (safeStr(r.marketDataOpenDebug?.openedVia || '').includes('already')) return 'market data reused';
    return e ? e.slice(0, 50) : 'no opportunities';
  } catch {
    return 'unknown';
  }
}

function computeOppCount(resultsMap) {
  let c = 0;
  for (const v of Object.values(resultsMap || {})) {
    const opps = Array.isArray(v?.opportunities) ? v.opportunities : [];
    c += opps.length;
  }
  return c;
}

function flattenOpportunities(resultsMap, limit = 80) {
  const out = [];
  for (const v of Object.values(resultsMap || {})) {
    const url = safeStr(v?.url || '');
    const title = safeStr(v?.title || v?.slug || url || '—');
    const opps = Array.isArray(v?.opportunities) ? v.opportunities : [];
    for (const o of opps) {
      const isXpress = String(o?.kind || '').toLowerCase() === 'xpress' || Number.isFinite(Number(o?.discountPct));
      out.push({
        savedAt: Number(v?.savedAt || 0),
        url,
        title,
        sizeLabel: safeStr(o?.sizeLabel || ''),
        sizeParam: safeStr(o?.sizeParam || ''),
        kind: isXpress ? 'xpress' : 'bid',
        buyNow: isXpress ? (o?.lowestAsk ?? null) : null,
        discountPct: isXpress ? (o?.discountPct ?? null) : null,
        edge: isXpress ? (o?.edge ?? null) : null,
        bid: isXpress ? null : (o?.suggestedBid ?? o?.highestBid) ?? null,
        ask: o?.lowestAsk ?? null,
        profit: o?.profit ?? null,
        avg30d: o?.avg30d ?? null,
        roiPct: o?.roiPct ?? null,
        low60d: o?.lowestSold2mo ?? null
      });
    }
  }
  out.sort((a, b) => Number(b?.profit || 0) - Number(a?.profit || 0) || Number(b?.savedAt || 0) - Number(a?.savedAt || 0));
  return out.slice(0, limit);
}

function csvEscape(v) {
  const s = safeStr(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r') || s.includes('\t')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function copyTextToClipboardBestEffort(text) {
  const t = safeStr(text);
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

function downloadTextFile(filename, text, mime = 'text/plain;charset=utf-8') {
  try {
    const data = safeStr(text);
    const name = safeStr(filename) || 'download.txt';
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
        a.remove();
      } catch {}
    }, 800);
    return true;
  } catch {
    return false;
  }
}

function buildOpportunitiesCsv(resultsMap) {
  const rows = flattenOpportunities(resultsMap, 2000);
  const header = ['title', 'size', 'mode', 'bid', 'ask', 'buyNow', 'profit', 'roiPct', 'avg30d', 'discountPct', 'edge', 'url'];
  const lines = [header.map(csvEscape).join(',')];
  for (const r of rows) {
    lines.push(
      [r.title, r.sizeLabel, r.kind, r.bid, r.ask, r.buyNow, r.profit, r.roiPct, r.avg30d, r.discountPct, r.edge, r.url]
        .map(csvEscape)
        .join(',')
    );
  }
  return lines.join('\n');
}

function withSizeParam(url, sizeParam) {
  try {
    const u = new URL(String(url || ''));
    const sp = safeStr(sizeParam);
    if (sp) u.searchParams.set('size', sp);
    return u.toString();
  } catch {
    return safeStr(url || '');
  }
}

function renderOpps(listEl, resultsMap) {
  if (!listEl) return;
  const opps = flattenOpportunities(resultsMap, 120);
  if (!opps.length) {
    listEl.innerHTML = `<div class="muted">No opportunities yet.</div>`;
    return;
  }
  listEl.innerHTML = opps
    .map((o) => {
      const title = escapeHtml(o.title);
      const size = escapeHtml(o.sizeLabel || '—');
      const isXpress = o.kind === 'xpress';
      const bid = o.bid == null ? '—' : escapeHtml(String(o.bid));
      const ask = o.ask == null ? '—' : escapeHtml(String(o.ask));
      const buyNow = o.buyNow == null ? '—' : escapeHtml(String(o.buyNow));
      const discount = o.discountPct == null ? '—' : escapeHtml(String(o.discountPct)) + '%';
      const edge = o.edge == null ? '—' : escapeHtml(String(o.edge));
      const profit = o.profit == null ? '—' : escapeHtml(String(o.profit));
      const avg = o.avg30d == null ? '—' : escapeHtml(String(o.avg30d));
      const roi = o.roiPct == null ? '—' : escapeHtml(String(o.roiPct)) + '%';
      const low = o.low60d == null ? '—' : escapeHtml(String(o.low60d));
      const openUrl = escapeHtml(withSizeParam(o.url, o.sizeParam));
      return `<div class="item">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
          <div class="title">${title}</div>
          <button class="btn-secondary" data-open="${openUrl}" style="padding:6px 10px; border-radius:10px; font-weight:900;">Open</button>
        </div>
        <div class="sub mono">${
          isXpress
            ? `size ${size} • buyNow ${buyNow} • avg30d ${avg} • profit ${profit} • roi ${roi} • discount ${discount} • edge ${edge}`
            : `size ${size} • bid ${bid} • ask ${ask} • profit ${profit} • roi ${roi} • avg30d ${avg} • low60d ${low}`
        }</div>
      </div>`;
    })
    .join('');
}

function latestEntries(resultsMap, limit = 20) {
  const arr = Object.values(resultsMap || {}).filter((x) => x && typeof x === 'object');
  arr.sort((a, b) => Number(b?.savedAt || 0) - Number(a?.savedAt || 0));
  return arr.slice(0, limit);
}

function renderResults(listEl, resultsMap) {
  if (!listEl) return;
  const entries = latestEntries(resultsMap, 24);
  if (!entries.length) {
    listEl.innerHTML = `<div class="muted">No results yet.</div>`;
    return;
  }

  const renderSalesViewLine = (r) => {
    try {
      const v = safeStr(r?.salesView || '');
      const confirmed = typeof r?.sellerViewConfirmed === 'boolean' ? r.sellerViewConfirmed : null;
      const dbg = r?.marketDataViewSwitchDebug && typeof r.marketDataViewSwitchDebug === 'object' ? r.marketDataViewSwitchDebug : null;
      if (!v && !dbg) return '';
      const base = `${v ? `salesView: ${v}` : 'salesView: —'}${confirmed === null ? '' : ` (confirmed=${confirmed ? 'yes' : 'no'})`}`;
      if (!dbg) return `<div class="sub mono" style="opacity:.75;">${escapeHtml(base)}</div>`;
      const bits = [
        `allIn=${dbg.clickedAllInCollapse ? 'yes' : 'no'}`,
        typeof dbg.allInCollapseFound === 'boolean' ? `allInFound=${dbg.allInCollapseFound ? 'yes' : 'no'}` : '',
        typeof dbg.allInCollapseVisible === 'boolean' ? `allInVis=${dbg.allInCollapseVisible ? 'yes' : 'no'}` : '',
        dbg.detectedAllInView ? `detected=${safeStr(dbg.detectedAllInView)}` : '',
        Number.isFinite(Number(dbg.buyerTileScore)) ? `bScore=${safeStr(dbg.buyerTileScore)}` : '',
        Number.isFinite(Number(dbg.sellerTileScore)) ? `sScore=${safeStr(dbg.sellerTileScore)}` : '',
        `chevron=${dbg.clickedChevron ? 'yes' : 'no'}`,
        `menu=${dbg.openedMenu ? 'yes' : 'no'}`,
        `sellerBtn=${dbg.clickedSeller ? 'yes' : 'no'}`,
        dbg.sellerBtnFound ? `found=${dbg.sellerBtnFound ? 'yes' : 'no'}` : '',
        typeof dbg.sellerBtnVisible === 'boolean' ? `visible=${dbg.sellerBtnVisible ? 'yes' : 'no'}` : '',
        typeof dbg.sellerBtnEnabled === 'boolean' ? `enabled=${dbg.sellerBtnEnabled ? 'yes' : 'no'}` : '',
        dbg.error ? `err=${safeStr(dbg.error)}` : ''
      ].filter(Boolean);
      return `<div class="sub mono" style="opacity:.75;">${escapeHtml(base)} • ${escapeHtml(bits.join(' '))}</div>`;
    } catch {
      return '';
    }
  };

  listEl.innerHTML = entries
    .map((r) => {
      const title = escapeHtml(r?.title || r?.slug || r?.url || '—');
      const url = escapeHtml(r?.url || '');
      const ok = r?.success !== false;
      const opps = Array.isArray(r?.opportunities) ? r.opportunities : [];
      const badge = r?.userExcluded || r?.releaseExcluded || r?.releaseFutureExcluded
        ? `<span class="pill">excluded</span>`
        : opps.length
          ? `<span class="pill">opps ${opps.length}</span>`
          : ok
            ? `<span class="pill">none</span>`
            : `<span class="pill">error</span>`;
      const isXpress = safeStr(r?.mode || '').toLowerCase() === 'xpress' || (opps[0] && String(opps[0]?.kind || '').toLowerCase() === 'xpress');
      const bestX = r?.xpressBest && typeof r.xpressBest === 'object' ? r.xpressBest : null;
      const msg = escapeHtml(
        r?.userExcluded
          ? `Excluded by rule: ${(safeStr(r?.userExcludedNeedle || 'rule') || 'rule')}`
          : r?.releaseFutureExcluded
          ? `Release date: ${safeStr(r?.releaseDate || '—')} (future — excluded)`
          : r?.releaseExcluded
          ? `Released: ${safeStr(r?.releaseDate || '—')} (excluded)`
          : r?.success === false
            ? safeStr(r?.error || 'scan failed')
            : isXpress
              ? opps.length
                ? `Deal: ${safeStr(opps[0]?.sizeLabel || '')} buyNow ${safeStr(opps[0]?.lowestAsk ?? '—')} avg30d ${safeStr(opps[0]?.avg30d ?? '—')} discount ${safeStr(opps[0]?.discountPct ?? '—')}%`
                : bestX
                  ? `No deals (best: ${safeStr(bestX?.sizeLabel || '')} buyNow ${safeStr(bestX?.lowestAsk ?? '—')} avg30d ${safeStr(bestX?.avg30d ?? '—')} discount ${safeStr(bestX?.discountPct ?? '—')}%)`
                  : 'No deals (no comparable sales/asks)'
              : opps.length
                ? `Best: ${safeStr(opps[0]?.sizeLabel || '')} bid ${safeStr(opps[0]?.highestBid ?? '—')} ask ${safeStr(opps[0]?.lowestAsk ?? '—')} profit ${safeStr(opps[0]?.profit ?? '—')}`
                : 'No opportunities'
      );
      return `<div class="item">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
          <div class="title">${title}</div>
          ${badge}
        </div>
        <div class="sub mono" style="opacity:.75; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${url || '—'}</div>
        <div class="sub">${msg}</div>
        ${renderSalesViewLine(r)}
      </div>`;
    })
    .join('');
}

function renderErrors(listEl, resultsMap) {
  if (!listEl) return;
  const entries = Object.values(resultsMap || {}).filter((x) => x && typeof x === 'object');
  const buckets = new Map();
  for (const r of entries) {
    const key = groupErrorReason(r);
    const cur = buckets.get(key) || { key, count: 0, latestAt: 0 };
    cur.count += 1;
    cur.latestAt = Math.max(cur.latestAt, Number(r?.savedAt || 0));
    buckets.set(key, cur);
  }
  const rows = Array.from(buckets.values()).filter((b) => b.key !== 'no opportunities');
  rows.sort((a, b) => b.count - a.count || b.latestAt - a.latestAt);
  const top = rows.slice(0, 10);
  if (!top.length) {
    listEl.innerHTML = `<div class="muted">No errors detected.</div>`;
    return;
  }
  listEl.innerHTML = top
    .map((b) => `<div class="item"><div style="display:flex; justify-content:space-between; gap:10px;">
        <div class="title">${escapeHtml(b.key)}</div>
        <span class="pill">${b.count}</span>
      </div></div>`)
    .join('');
}

async function getScanIds() {
  return await new Promise((resolve) => {
    try {
      chrome.storage.local.get([ACTIVE_ID_KEY, LAST_ID_KEY], (res) => {
        void chrome.runtime.lastError;
        const active = safeStr(res?.[ACTIVE_ID_KEY] || '');
        const last = safeStr(res?.[LAST_ID_KEY] || '');
        resolve({ active, last });
      });
    } catch {
      resolve({ active: '', last: '' });
    }
  });
}

async function getHistory() {
  return await new Promise((resolve) => {
    try {
      chrome.storage.local.get([HISTORY_KEY], (res) => {
        void chrome.runtime.lastError;
        const h = Array.isArray(res?.[HISTORY_KEY]) ? res[HISTORY_KEY] : [];
        resolve(h);
      });
    } catch {
      resolve([]);
    }
  });
}

function renderScanSelect(selectEl, history, { activeId, selectedId }) {
  if (!selectEl) return;
  const list = Array.isArray(history) ? history : [];
  const sorted = [...list].sort((a, b) => Number(b?.scanNumber || 0) - Number(a?.scanNumber || 0) || Number(b?.startedAt || 0) - Number(a?.startedAt || 0));
  const opts = [];
  // active marker
  for (const h of sorted) {
    const id = safeStr(h?.scanId || '');
    if (!id) continue;
    const num = Number(h?.scanNumber || 0);
    const name = safeStr(h?.scanName || (num ? `Scan ${num}` : 'Scan'));
    const mode = safeStr(h?.mode || '');
    const activeMark = activeId && id === activeId ? ' (active)' : '';
    opts.push({ id, label: `${name}${mode ? ` • ${mode}` : ''}${activeMark}` });
  }
  // Fallback if history empty
  if (!opts.length && selectedId) {
    opts.push({ id: selectedId, label: selectedId });
  }
  selectEl.innerHTML = opts.map((o) => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.label)}</option>`).join('');
  const want = selectedId && opts.some((o) => o.id === selectedId) ? selectedId : (activeId && opts.some((o) => o.id === activeId) ? activeId : (opts[0]?.id || ''));
  if (want) selectEl.value = want;
}

async function getScanData(scanId) {
  if (!scanId) return { state: null, results: {} };
  const stateKey = `stockxListingScanState:${scanId}`;
  const resultsKey = `stockxListingScanResults:${scanId}`;
  return await new Promise((resolve) => {
    try {
      chrome.storage.local.get([stateKey, resultsKey], (res) => {
        void chrome.runtime.lastError;
        const s = res?.[stateKey] && typeof res[stateKey] === 'object' ? res[stateKey] : null;
        const r = res?.[resultsKey] && typeof res[resultsKey] === 'object' ? res[resultsKey] : {};
        resolve({ state: s, results: r });
      });
    } catch {
      resolve({ state: null, results: {} });
    }
  });
}

function renderPerfLine(perf) {
  try {
    const p = perf && typeof perf === 'object' ? perf : null;
    if (!p) return '—';
    const avg = Number(p.avgItemMs || 0);
    const last = Number(p.lastItemMs || 0);
    const max = Number(p.maxItemMs || 0);
    const eta = Number(p.etaMs || 0);
    const nav = Number(p.lastPageNavMs || 0);
    const collect = Number(p.lastCollectMs || 0);
    const parts = [];
    if (avg > 0) parts.push(`avg ${fmtDurationMs(avg)}`);
    if (last > 0) parts.push(`last ${fmtDurationMs(last)}`);
    if (max > 0) parts.push(`max ${fmtDurationMs(max)}`);
    if (eta > 0) parts.push(`eta ${fmtDurationMs(eta)}`);
    if (nav > 0 || collect > 0) parts.push(`page nav ${fmtDurationMs(nav)} collect ${fmtDurationMs(collect)}`);
    return parts.length ? parts.join(' • ') : '—';
  } catch {
    return '—';
  }
}

function renderLastUpdateLine(state) {
  try {
    const s = state && typeof state === 'object' ? state : null;
    if (!s) return '—';
    const t = Number(s.heartbeatAt || s.updatedAt || 0);
    if (!Number.isFinite(t) || t <= 0) return '—';
    const age = Math.max(0, Date.now() - t);
    return `${fmtDurationMs(age)} ago`;
  } catch {
    return '—';
  }
}

function computeStallNote({ ids, scanId, state }) {
  try {
    const isActive = !!(ids?.active && scanId && ids.active === scanId);
    if (!isActive) return '';
    const stage = safeStr(state?.stage || '').toLowerCase();
    if (!stage) return '';
    if (stage === 'done' || stage === 'stopped') return '';

    const t = Number(state?.heartbeatAt || state?.updatedAt || 0);
    if (!Number.isFinite(t) || t <= 0) return '';
    const ageMs = Math.max(0, Date.now() - t);
    if (ageMs < 45000) return '';

    const parts = [`Possibly stalled (no updates for ${fmtDurationMs(ageMs)})`];
    const lastErr = safeStr(state?.lastError || '');
    const lastErrUrl = safeStr(state?.lastErrorUrl || '');
    if (lastErr) {
      parts.push(`last error: ${lastErr}${lastErrUrl ? ` (${lastErrUrl})` : ''}`);
    } else if (safeStr(state?.heartbeatNote || '')) {
      parts.push(`last step: ${safeStr(state.heartbeatNote)}`);
    } else if (stage.includes('scanning')) {
      parts.push('last step: scanning (likely waiting on Market Data / content script response)');
    } else {
      parts.push(`last stage: ${safeStr(state?.stage || '—')}`);
    }
    parts.push('Check chrome://extensions → your extension → Errors if this persists.');
    return parts.join(' • ');
  } catch {
    return '';
  }
}

async function refresh() {
  const ids = await getScanIds();
  const history = await getHistory();
  const selected = safeStr($('scanSelect')?.value || '');
  const scanId = selected || ids.active || ids.last;
  const hasActive = !!ids.active;

  $('subtitle').textContent = scanId
    ? `${hasActive && ids.active === scanId ? 'Active scan' : 'Selected scan'}: ${scanId}`
    : 'No scan found yet. Start a scan from StockX and this page will update live.';

  // Populate scan dropdown
  renderScanSelect($('scanSelect'), history, { activeId: ids.active, selectedId: scanId });

  $('kpiScanId').textContent = scanId ? scanId.slice(-8) : '—';

  const { state, results } = await getScanData(scanId);
  const completed = Number(state?.completed || 0);
  const total = Number(state?.total || 0);
  $('kpiProgress').textContent = scanId ? `${fmtPct(completed, total)} (${fmtInt(completed)}/${fmtInt(total)})` : '—';
  $('kpiScanned').textContent = scanId ? fmtInt(Object.keys(results || {}).length) : '—';
  $('kpiOpps').textContent = scanId ? fmtInt(computeOppCount(results)) : '—';

  $('stage').textContent = safeStr(state?.stage || '—');
  $('currentUrl').textContent = safeStr(state?.currentUrl || state?.startUrl || '—');
  try {
    const perfEl = $('perfLine');
    if (perfEl) perfEl.textContent = renderPerfLine(state?.perf || null);
  } catch {}
  try {
    const lastEl = $('lastUpdate');
    if (lastEl) lastEl.textContent = renderLastUpdateLine(state);
  } catch {}
  try {
    const stallEl = $('stallNote');
    if (stallEl) stallEl.textContent = computeStallNote({ ids, scanId, state });
  } catch {}

  // Elapsed time (ticks locally; no extra storage reads needed).
  try {
    const meta = computeElapsedMeta({ scanId, ids, state, history });
    window.__stockxDashElapsedMeta = meta;
    updateElapsedUi(meta);
  } catch {}

  // Keep-focus toggle only applies to the active scan.
  try {
    const t = $('keepFocusToggle');
    const isActive = !!(ids.active && scanId && ids.active === scanId);
    if (t) {
      t.disabled = !isActive;
      t.style.opacity = isActive ? '1' : '0.35';
      if (isActive) t.checked = !!state?.keepUserFocus;
      else t.checked = false;
    }
  } catch {}

  renderErrors($('errorsList'), results);
  renderResults($('resultsList'), results);
  renderOpps($('oppsList'), results);

  // Stop button only meaningful if we have an active scan.
  $('stopBtn').disabled = !ids.active;
  $('stopBtn').style.opacity = ids.active ? '1' : '0.35';

  // Resume button: enabled only when no active scan is running and selected scan is stopped+resumable.
  try {
    const resumeBtn = $('resumeBtn');
    const canResume = !!(scanId && state?.canResume && safeStr(state?.stage || '').toLowerCase() === 'stopped');
    const enabled = !!scanId && !ids.active && canResume;
    if (resumeBtn) {
      resumeBtn.disabled = !enabled;
      resumeBtn.style.opacity = enabled ? '1' : '0.35';
    }
  } catch {}

  // Disable clear while a scan is active and selected.
  const isSelectedActive = !!(ids.active && scanId && ids.active === scanId);
  $('clearThisBtn').disabled = isSelectedActive || !scanId;
  $('clearThisBtn').style.opacity = isSelectedActive || !scanId ? '0.35' : '1';
}

async function clearOneScan(scanId) {
  const id = safeStr(scanId);
  if (!id) return false;
  const stateKey = `stockxListingScanState:${id}`;
  const resultsKey = `stockxListingScanResults:${id}`;
  return await new Promise((resolve) => {
    try {
      chrome.storage.local.get([HISTORY_KEY, ACTIVE_ID_KEY, LAST_ID_KEY], (res) => {
        void chrome.runtime.lastError;
        const active = safeStr(res?.[ACTIVE_ID_KEY] || '');
        const last = safeStr(res?.[LAST_ID_KEY] || '');
        if (active && active === id) return resolve(false);
        const hist = Array.isArray(res?.[HISTORY_KEY]) ? res[HISTORY_KEY] : [];
        const nextHist = hist.filter((h) => safeStr(h?.scanId || '') !== id);
        const patch = { [HISTORY_KEY]: nextHist };
        if (last === id) patch[LAST_ID_KEY] = nextHist[0]?.scanId || '';
        chrome.storage.local.set(patch, () => {
          void chrome.runtime.lastError;
          chrome.storage.local.remove([stateKey, resultsKey], () => {
            void chrome.runtime.lastError;
            resolve(true);
          });
        });
      });
    } catch {
      resolve(false);
    }
  });
}

async function clearAllScans() {
  return await new Promise((resolve) => {
    try {
      chrome.storage.local.get([HISTORY_KEY, ACTIVE_ID_KEY], (res) => {
        void chrome.runtime.lastError;
        const active = safeStr(res?.[ACTIVE_ID_KEY] || '');
        if (active) return resolve({ ok: false, reason: `active_scan:${active}` });
        const hist = Array.isArray(res?.[HISTORY_KEY]) ? res[HISTORY_KEY] : [];
        const keysToRemove = [];
        for (const h of hist) {
          const id = safeStr(h?.scanId || '');
          if (!id) continue;
          keysToRemove.push(`stockxListingScanState:${id}`);
          keysToRemove.push(`stockxListingScanResults:${id}`);
        }
        keysToRemove.push(HISTORY_KEY);
        keysToRemove.push(LAST_ID_KEY);
        keysToRemove.push(SCAN_COUNTER_KEY);
        chrome.storage.local.remove(keysToRemove, () => {
          void chrome.runtime.lastError;
          resolve({ ok: true });
        });
      });
    } catch {
      resolve({ ok: false, reason: 'exception' });
    }
  });
}

async function waitForActiveScanToClear(activeId, timeoutMs = 12000) {
  const want = safeStr(activeId || '');
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ids = await getScanIds();
    if (!ids.active) return true;
    if (want && ids.active !== want) return true; // active changed
    await new Promise((r) => setTimeout(r, 450));
  }
  return false;
}

document.addEventListener('DOMContentLoaded', async () => {
  // Local ticking for elapsed display (avoid spamming refresh/storage reads).
  try {
    setInterval(() => {
      try {
        updateElapsedUi(window.__stockxDashElapsedMeta || null);
      } catch {}
    }, 1000);
  } catch {}

  $('refreshBtn')?.addEventListener('click', () => refresh());
  $('scanSelect')?.addEventListener('change', () => refresh());

  $('copyOppsBtn')?.addEventListener('click', async () => {
    try {
      const ids = await getScanIds();
      const scanId = safeStr($('scanSelect')?.value || '') || ids.active || ids.last;
      if (!scanId) return;
      const { results } = await getScanData(scanId);
      const csv = buildOpportunitiesCsv(results || {});
      const file = `stockx-opportunities-${scanId.slice(-8) || 'scan'}.csv`;
      const ok = downloadTextFile(file, csv, 'text/csv;charset=utf-8');
      setToast(ok ? `Downloaded ${file}` : 'Download failed.');
    } catch {
      setToast('Download failed.');
    }
  });

  $('stopBtn')?.addEventListener('click', async () => {
    try {
      const ids = await getScanIds();
      if (!ids.active) return;
      chrome.runtime.sendMessage({ action: 'stopListingBidScan', scanId: ids.active }, () => {
        void chrome.runtime.lastError;
        refresh();
      });
    } catch {}
  });

  $('resumeBtn')?.addEventListener('click', async () => {
    try {
      const id = safeStr($('scanSelect')?.value || '');
      if (!id) return;
      setToast('Resuming…');
      chrome.runtime.sendMessage({ action: 'resumeListingBidScan', scanId: id }, () => {
        void chrome.runtime.lastError;
        refresh();
      });
    } catch {}
  });

  $('keepFocusToggle')?.addEventListener('change', async (e) => {
    try {
      const ids = await getScanIds();
      if (!ids.active) return;
      const keep = !!e?.target?.checked;
      setToast(keep ? 'Background mode enabled (scan will not steal focus).' : 'Foreground mode enabled (more reliable).');
      chrome.runtime.sendMessage({ action: 'setListingScanFocusMode', scanId: ids.active, keepUserFocus: keep }, () => {
        void chrome.runtime.lastError;
        refresh();
      });
    } catch {}
  });

  $('clearThisBtn')?.addEventListener('click', async () => {
    try {
      const id = safeStr($('scanSelect')?.value || '');
      if (!id) return;
      const ok = await clearOneScan(id);
      if (!ok) return;
      await refresh();
    } catch {}
  });

  $('clearAllBtn')?.addEventListener('click', async () => {
    try {
      const ok = window.confirm('Clear ALL scan history/results? This cannot be undone.');
      if (!ok) return;
      setToast('Clearing…');
      const res = await clearAllScans();
      if (!res?.ok) {
        if (String(res?.reason || '').startsWith('active_scan:')) {
          const activeId = String(res.reason.split(':')[1] || '');
          setToast('Cannot clear while a scan is active. Stop the scan first.');
          const stopOk = window.confirm(`A scan is still active (${activeId.slice(-8)}). Stop it now, then clear all?`);
          if (!stopOk) return;
          chrome.runtime.sendMessage({ action: 'stopListingBidScan', scanId: activeId }, async () => {
            void chrome.runtime.lastError;
            try {
              setToast('Stopping scan…');
              const cleared = await waitForActiveScanToClear(activeId, 15000);
              if (!cleared) {
                setToast('Clear failed (still active). Try again in a moment.');
                return;
              }
              setToast('Clearing…');
              const res2 = await clearAllScans();
              if (!res2?.ok) {
                setToast('Clear failed.');
                return;
              }
              setToast('Cleared all scan history/results.');
              await refresh();
            } catch {}
          });
          return;
        }
        setToast('Clear failed.');
        return;
      }
      setToast('Cleared all scan history/results.');
      await refresh();
    } catch {}
  });

  // Delegated open buttons in Opportunities list
  document.addEventListener('click', (e) => {
    try {
      const btn = e?.target?.closest?.('button[data-open]');
      if (!btn) return;
      const url = safeStr(btn.getAttribute('data-open') || '');
      if (!url) return;
      chrome.tabs.create({ url }, () => void chrome.runtime.lastError);
    } catch {}
  });

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const keys = Object.keys(changes || {});
      // Refresh on scan id changes, state changes, or results changes.
      if (
        keys.includes(ACTIVE_ID_KEY) ||
        keys.includes(LAST_ID_KEY) ||
        keys.includes(HISTORY_KEY) ||
        keys.some((k) => k.startsWith('stockxListingScanState:') || k.startsWith('stockxListingScanResults:'))
      ) {
        refresh();
      }
    });
  } catch {}

  await refresh();
});

