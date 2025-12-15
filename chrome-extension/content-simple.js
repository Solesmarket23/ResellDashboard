// Simple StockX Price Tracker Content Script
console.log('🔍 Simple StockX Price Tracker loaded');

// --- Buying-page tracking extractor (StockX -> FedEx tracknumbers) ---
function isBuyingOrderDetailPage() {
  try {
    // Only treat /buying/<numericId> as a detail page. (NOT /buying/history)
    if (!window.location.hostname.includes('stockx.com')) return false;
    const id = getBuyingIdFromUrl();
    return !!(id && /^[0-9]{10,25}$/.test(id));
  } catch {
    return false;
  }
}

function getBuyingIdFromUrl() {
  try {
    const parts = window.location.pathname.split('/').filter(Boolean);
    if (parts[0] === 'buying' && parts[1]) return parts[1];
  } catch {}
  return null;
}

function parseTrackingFromFedexUrl(href) {
  try {
    const u = new URL(href);
    const tn = u.searchParams.get('tracknumbers') || u.searchParams.get('tracknumber') || u.searchParams.get('trknbr');
    if (tn && /^[0-9]{10,22}$/.test(tn)) return tn;
  } catch {
    // fallthrough
  }
  const m = String(href || '').match(/tracknumbers?[=%3D]([0-9]{10,22})/i);
  return m && m[1] ? m[1] : null;
}

async function copyToClipboard(text) {
  // Try modern clipboard API first
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // Fallback to execCommand
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function safeCell(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  // Avoid breaking TSV/CSV pastes
  return s.replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
}

function getExtensionMode() {
  try {
    const v = localStorage.getItem('stockxExtensionMode');
    if (v === 'tracking' || v === 'export') return v;
  } catch {}
  return 'export';
}

function setExtensionMode(mode) {
  try {
    localStorage.setItem('stockxExtensionMode', mode);
  } catch {}
}

function parseMoney(text) {
  const s = String(text || '');
  const m = s.match(/\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/);
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function formatMoney(n) {
  if (!Number.isFinite(n)) return '';
  return `$${n.toFixed(2)}`;
}

function extractOrderDetailsFromBuyingPage() {
  const details = {
    buyingId: getBuyingIdFromUrl(),
    productName: '',
    size: '',
    orderNumber: '',
    orderDate: '',
    total: '',
    credit: '',
    totalBeforeCredit: '',
    trackingNumber: '',
    fedexUrl: ''
  };

  // Product name (your snippet: <a class="chakra-link ...">adidas Yeezy Slide Flax</a>)
  const cleanupLinkText = (s) =>
    String(s || '')
      .replace(/\s+/g, ' ')
      .replace(/\bopens in new tab\b/gi, '')
      .trim();

  const isVisibleEl = (el) => {
    try {
      if (!el) return false;
      const r = el.getClientRects?.();
      if (r && r.length > 0) return true;
      const b = el.getBoundingClientRect?.();
      return !!(b && b.width > 0 && b.height > 0);
    } catch {
      return false;
    }
  };

  const isLikelyProductHref = (href) => {
    const h = String(href || '');
    if (!h.startsWith('/')) return false;
    // Exclude common non-product routes
    if (/^\/(buying|selling|search|help|settings|about|privacy|terms|jobs|accessibility|professional-tools)\b/i.test(h))
      return false;
    return h.length > 3;
  };

  const findOrderRoot = () => {
    const orderEl = document.querySelector('[data-testid="order-number"]');
    const seed = orderEl || document.querySelector('a[data-testid="TrackButton"]') || document.body;
    const chain = [];
    let cur = seed;
    for (let i = 0; i < 10 && cur; i++) {
      chain.push(cur);
      cur = cur.parentElement;
    }
    const scored = chain
      .map((el) => {
        let score = 0;
        try {
          if (el.querySelector?.('[data-testid="order-number"]')) score += 3;
          if (el.querySelector?.('a[data-testid="TrackButton"]')) score += 2;
          const hasSize = !!Array.from(el.querySelectorAll?.('p') || []).find(
            (p) => (p.textContent || '').trim().toLowerCase() === 'size:'
          );
          if (hasSize) score += 2;
          const hasTotal = !!Array.from(el.querySelectorAll?.('dt') || []).find(
            (dt) => (dt.textContent || '').trim().toLowerCase() === 'total'
          );
          if (hasTotal) score += 2;
          const hasProductLink = !!Array.from(el.querySelectorAll?.('a.chakra-link[href]') || []).find((a) =>
            isLikelyProductHref(a.getAttribute('href') || '')
          );
          if (hasProductLink) score += 2;
        } catch {}
        return { el, score };
      })
      .sort((a, b) => b.score - a.score);
    return scored[0]?.el || document.body;
  };

  const root = findOrderRoot();

  // (1) Best: a filtered internal product link within the order section (your snippet)
  try {
    const anchors = Array.from(root.querySelectorAll('a.chakra-link[href]'));
    const best = anchors
      .map((a) => {
        const href = a.getAttribute('href') || '';
        const text = cleanupLinkText(a.textContent || '');
        return { a, href, text };
      })
      .filter((x) => x.text.length >= 5)
      .filter((x) => isVisibleEl(x.a))
      .filter((x) => isLikelyProductHref(x.href))
      .filter((x) => !/stockx|professional tools/i.test(x.text))
      .sort((x, y) => y.text.length - x.text.length)[0];
    if (best?.text) details.productName = best.text;
  } catch {}

  // (2) Product image alt text, but ONLY within the order section
  if (!details.productName) {
    try {
      const imgs = Array.from(root.querySelectorAll('img[alt]'));
      const candidates = imgs
        .map((img) => cleanupLinkText(img.getAttribute('alt') || ''))
        .filter((t) => t && t.length >= 8)
        .filter((t) => !/stockx|logo|icon|facebook|instagram|twitter|youtube|discord/i.test(t));
      candidates.sort((a, b) => b.length - a.length);
      if (candidates[0]) details.productName = candidates[0];
    } catch {}
  }

  // (3) Common “product name” testids/classes (scoped)
  if (!details.productName) {
    try {
      const el =
        root.querySelector('[data-testid*="product"][data-testid*="name"]') ||
        root.querySelector('[data-testid="product-name"]') ||
        root.querySelector('[data-testid="product-title"]');
      const txt = cleanupLinkText(el?.textContent || '');
      if (txt) details.productName = txt;
    } catch {}
  }

  if (!details.productName) {
    try {
      const h1 = document.querySelector('h1');
      if (h1?.textContent) details.productName = cleanupLinkText(h1.textContent);
    } catch {}
  }

  // Size (your snippet: <p>Size:</p><p>US M 12</p>)
  try {
    const ps = Array.from(document.querySelectorAll('p'));
    const label = ps.find(p => (p.textContent || '').trim().toLowerCase() === 'size:');
    const value = label?.nextElementSibling;
    const txt = (value?.textContent || '').trim();
    if (txt) details.size = txt;
  } catch {}
  if (!details.size) {
    // Fallback: any "Size:" text in body
    try {
      const m = (document.body?.innerText || '').match(/\bSize:\s*([A-Z]{1,3}\s*[MW]?\s*\d{1,2}(?:\.\d)?)\b/i);
      if (m?.[1]) details.size = m[1].trim();
    } catch {}
  }

  // Order number (stable: data-testid="order-number")
  try {
    const el = document.querySelector('[data-testid="order-number"]');
    const txt = (el?.textContent || '').trim();
    const m = txt.match(/Order\s*#\s*([A-Z0-9-]+)/i);
    if (m?.[1]) details.orderNumber = m[1].trim();
  } catch {}
  if (!details.orderNumber) {
    // Fallback: "Order number: 03-XXXX"
    try {
      const m = (document.body?.innerText || '').match(/\bOrder\s*(?:number|#)\s*[:#]?\s*(\d{2}-[A-Z0-9]{5,})\b/i);
      if (m?.[1]) details.orderNumber = m[1].trim();
    } catch {}
  }

  // Order date (your snippet: "Dec 1, 2025")
  // Try to find a date near the order number element first.
  const dateRe = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\b/;
  try {
    const orderEl = document.querySelector('[data-testid="order-number"]');
    const container = orderEl?.closest('section, div') || orderEl?.parentElement;
    const text = (container?.innerText || '').replace(/\s+/g, ' ').trim();
    const m = text.match(dateRe);
    if (m?.[0]) details.orderDate = m[0];
  } catch {}
  if (!details.orderDate) {
    // Fallback: first date-like string on page (less reliable, but better than blank)
    try {
      const text = (document.body?.innerText || '').replace(/\s+/g, ' ');
      const m = text.match(dateRe);
      if (m?.[0]) details.orderDate = m[0];
    } catch {}
  }

  // Total (your snippet: <dt>Total</dt><dd>$141.92</dd>)
  try {
    const dts = Array.from(document.querySelectorAll('dt'));
    const totalDt = dts.find(dt => (dt.textContent || '').trim().toLowerCase() === 'total');
    const dd = totalDt?.nextElementSibling;
    const txt = (dd?.textContent || '').trim();
    if (txt) details.total = txt;
  } catch {}
  if (!details.total) {
    try {
      const m = (document.body?.innerText || '').match(/\bTotal\s*\$?(\d+(?:\.\d{2})?)\b/i);
      if (m?.[1]) details.total = `$${m[1]}`;
    } catch {}
  }

  // Credit (your snippet: <p>Credit:</p> ... <p>$1.85</p>)
  try {
    const ps = Array.from(document.querySelectorAll('p'));
    const creditLabel = ps.find(p => (p.textContent || '').trim().toLowerCase() === 'credit:');
    if (creditLabel) {
      // Look for a nearby $ value (next siblings / parent siblings)
      const candidates = [];
      const next = creditLabel.parentElement?.nextElementSibling || creditLabel.nextElementSibling;
      if (next?.textContent) candidates.push(next.textContent);
      if (creditLabel.parentElement?.textContent) candidates.push(creditLabel.parentElement.textContent);
      if (creditLabel.closest('div')?.textContent) candidates.push(creditLabel.closest('div').textContent);
      if (creditLabel.parentElement?.parentElement?.textContent) candidates.push(creditLabel.parentElement.parentElement.textContent);
      const joined = candidates.join(' ');
      const creditVal = parseMoney(joined);
      if (creditVal !== null) details.credit = formatMoney(creditVal);
    }
  } catch {}
  if (!details.credit) {
    // Fallback: regex scan for "Credit: $X.XX"
    try {
      const text = (document.body?.innerText || '').replace(/\s+/g, ' ');
      const m = text.match(/\bCredit:\s*\$?\s*([0-9]+(?:\.[0-9]{2})?)\b/i);
      if (m?.[1]) details.credit = formatMoney(Number(m[1]));
    } catch {}
  }

  // If credit exists, compute net total
  const totalNum = parseMoney(details.total);
  const creditNum = parseMoney(details.credit);
  if (totalNum !== null) {
    details.totalBeforeCredit = formatMoney(totalNum);
    if (creditNum !== null && creditNum > 0) {
      const net = Math.max(0, totalNum - creditNum);
      details.total = formatMoney(net);
    }
  }

  // Tracking from TrackButton if present
  try {
    const a = document.querySelector('a[data-testid="TrackButton"][href]');
    const href = a?.getAttribute('href') || '';
    if (href) {
      details.fedexUrl = href;
      const tn = parseTrackingFromFedexUrl(href);
      if (tn) details.trackingNumber = tn;
    }
  } catch {}

  return details;
}

function removeTrackingWidget() {
  const existing = document.getElementById('stockx-tracking-widget');
  if (existing) existing.remove();
}

function updateModeToggleStyles(widget) {
  const mode = getExtensionMode();
  const btns = Array.from(widget.querySelectorAll('[data-role="mode-toggle-btn"]'));
  btns.forEach((b) => {
    const m = b.getAttribute('data-mode');
    const active = m === mode;
    b.style.background = active ? '#6366f1' : 'rgba(255,255,255,0.06)';
    b.style.borderColor = active ? 'rgba(99,102,241,0.9)' : 'rgba(255,255,255,0.10)';
    b.style.color = active ? '#0b1020' : 'rgba(255,255,255,0.9)';
  });
}

function applyModeToWidget(widget) {
  const mode = getExtensionMode();
  const metaEl = widget.querySelector('[data-role="meta"]');
  const copyRowBtn = widget.querySelector('[data-role="copy-row"]');
  const copyTrackingBtn = widget.querySelector('[data-role="copy-tracking"]');
  const titleEl = widget.querySelector('[data-role="title"]');

  if (titleEl) titleEl.textContent = mode === 'tracking' ? 'Tracking' : 'Export';
  if (metaEl) metaEl.style.display = mode === 'export' ? '' : 'none';
  if (copyRowBtn) copyRowBtn.style.display = mode === 'export' ? '' : 'none';
  if (copyTrackingBtn) copyTrackingBtn.style.display = mode === 'tracking' ? '' : 'none';

  updateModeToggleStyles(widget);
}

function ensureTrackingWidget(trackingNumber, fedexUrl) {
  const buyingId = getBuyingIdFromUrl();
  const details = extractOrderDetailsFromBuyingPage();

  // Prefer passed-in tracking
  if (trackingNumber) details.trackingNumber = trackingNumber;
  if (fedexUrl) details.fedexUrl = fedexUrl;
  // Cache the latest extracted details so Copy Row can't drift from what's shown in the widget.
  try {
    window.__stockxLastBuyingId = buyingId || null;
    window.__stockxLastOrderDetails = details;
  } catch {}

  const existing = document.getElementById('stockx-tracking-widget');
  // If we navigated to a different purchase, reset the widget.
  if (existing) {
    const prevBuyingId = existing.getAttribute('data-buying-id');
    if (prevBuyingId && buyingId && prevBuyingId !== buyingId) {
      existing.remove();
    }
  }

  const existingAfter = document.getElementById('stockx-tracking-widget');
  if (existingAfter) {
    // Update contents instead of keeping stale tracking number.
    const tnEl = existingAfter.querySelector('[data-role="tracking-number"]');
    if (tnEl) tnEl.textContent = details.trackingNumber || '—';
    const linkEl = existingAfter.querySelector('[data-role="fedex-link"]');
    if (linkEl && details.fedexUrl) {
      linkEl.setAttribute('href', details.fedexUrl);
      linkEl.style.display = '';
    } else if (linkEl) {
      linkEl.style.display = 'none';
    }

    const metaEl = existingAfter.querySelector('[data-role="meta"]');
    if (metaEl) {
      const creditLine = details.credit ? `<div><span style="opacity:.7">Credit:</span> ${safeCell(details.credit)}</div>` : '';
      const totalLabel = details.credit ? 'Total (net):' : 'Total:';
      metaEl.innerHTML = `
        <div><span style="opacity:.7">Product:</span> ${safeCell(details.productName) || '—'}</div>
        <div><span style="opacity:.7">Size:</span> ${safeCell(details.size) || '—'}</div>
        <div><span style="opacity:.7">Order #:</span> ${safeCell(details.orderNumber) || '—'}</div>
        <div><span style="opacity:.7">Order date:</span> ${safeCell(details.orderDate) || '—'}</div>
        ${creditLine}
        <div><span style="opacity:.7">${totalLabel}</span> ${safeCell(details.total) || '—'}</div>
      `;
    }

    const lastCopiedEl = existingAfter.querySelector('[data-role="last-copied"]');
    if (lastCopiedEl) {
      // Keep whatever was last copied; don't overwrite on refresh.
    }

    // Ensure correct visibility per mode
    applyModeToWidget(existingAfter);
    return;
  }

  const widget = document.createElement('div');
  widget.id = 'stockx-tracking-widget';
  if (buyingId) widget.setAttribute('data-buying-id', buyingId);
  widget.style.cssText = `
    position: fixed;
    bottom: 16px;
    right: 16px;
    background: rgba(17, 24, 39, 0.95);
    color: #fff;
    padding: 12px 12px;
    border-radius: 12px;
    font-family: Arial, sans-serif;
    font-size: 13px;
    z-index: 2147483647;
    box-shadow: 0 12px 30px rgba(0,0,0,0.35);
    border: 1px solid rgba(99,102,241,0.35);
    max-width: 320px;
  `;

  const title = document.createElement('div');
  title.setAttribute('data-role', 'title');
  title.textContent = 'Export';
  title.style.cssText = 'font-weight: 700; margin-bottom: 8px; color: #c7d2fe;';

  const row = document.createElement('div');
  row.style.cssText = 'display:flex; gap:10px; align-items:center; justify-content: space-between;';

  const tn = document.createElement('div');
  tn.setAttribute('data-role', 'tracking-number');
  tn.textContent = details.trackingNumber ? details.trackingNumber : '—';
  tn.style.cssText = 'font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; word-break: break-all;';

  const link = document.createElement('a');
  link.setAttribute('data-role', 'fedex-link');
  link.href = details.fedexUrl || '#';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Open FedEx';
  link.style.cssText = 'display:inline-block; margin-top: 8px; color: #93c5fd; text-decoration: underline;';
  if (!details.fedexUrl) link.style.display = 'none';

  const meta = document.createElement('div');
  meta.setAttribute('data-role', 'meta');
  meta.style.cssText = 'margin-top: 10px; font-size: 12px; color: rgba(255,255,255,0.85); line-height: 1.35;';
  const creditLine = details.credit ? `<div><span style="opacity:.7">Credit:</span> ${safeCell(details.credit)}</div>` : '';
  const totalLabel = details.credit ? 'Total (net):' : 'Total:';
  meta.innerHTML = `
    <div><span style="opacity:.7">Product:</span> ${safeCell(details.productName) || '—'}</div>
    <div><span style="opacity:.7">Size:</span> ${safeCell(details.size) || '—'}</div>
    <div><span style="opacity:.7">Order #:</span> ${safeCell(details.orderNumber) || '—'}</div>
    <div><span style="opacity:.7">Order date:</span> ${safeCell(details.orderDate) || '—'}</div>
    ${creditLine}
    <div><span style="opacity:.7">${totalLabel}</span> ${safeCell(details.total) || '—'}</div>
  `;

  const copyRow = document.createElement('button');
  copyRow.setAttribute('data-role', 'copy-row');
  copyRow.textContent = 'Copy Row';
  copyRow.style.cssText = `
    margin-top: 10px;
    width: 100%;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12);
    color: white;
    padding: 9px 10px;
    border-radius: 10px;
    cursor: pointer;
    font-weight: 800;
  `;
  copyRow.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Use cached details (what the widget is currently showing) to avoid mismatches.
    let d = null;
    try {
      const cached = window.__stockxLastOrderDetails;
      const cachedBuyingId = window.__stockxLastBuyingId;
      if (cached && (!cachedBuyingId || cachedBuyingId === getBuyingIdFromUrl())) d = cached;
    } catch {}
    if (!d) d = extractOrderDetailsFromBuyingPage();
    const rowTsv = [
      safeCell(d.productName),
      safeCell(d.orderNumber),
      safeCell(d.trackingNumber),
      safeCell(d.size),
      safeCell(d.orderDate),
      safeCell(d.total)
    ].join('\t');
    const ok = await copyToClipboard(rowTsv);
    copyRow.textContent = ok ? `Copied (${safeCell(d.orderNumber) || 'row'})` : 'Copy failed';
    setTimeout(() => (copyRow.textContent = 'Copy Row'), 2000);

    const lastCopied = widget.querySelector('[data-role="last-copied"]');
    if (lastCopied) {
      lastCopied.textContent = ok
        ? `Copied to clipboard: ${safeCell(d.orderNumber) || 'row'}`
        : 'Copy failed — clipboard unchanged';
    }
  });

  const copyTracking = document.createElement('button');
  copyTracking.setAttribute('data-role', 'copy-tracking');
  copyTracking.textContent = 'Copy Tracking';
  copyTracking.style.cssText = `
    margin-top: 10px;
    width: 100%;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12);
    color: white;
    padding: 9px 10px;
    border-radius: 10px;
    cursor: pointer;
    font-weight: 800;
  `;
  copyTracking.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    let d = null;
    try {
      const cached = window.__stockxLastOrderDetails;
      const cachedBuyingId = window.__stockxLastBuyingId;
      if (cached && (!cachedBuyingId || cachedBuyingId === getBuyingIdFromUrl())) d = cached;
    } catch {}
    if (!d) d = extractOrderDetailsFromBuyingPage();
    const ok = await copyToClipboard(safeCell(d.trackingNumber));
    copyTracking.textContent = ok ? 'Copied Tracking' : 'Copy failed';
    setTimeout(() => (copyTracking.textContent = 'Copy Tracking'), 2000);

    const lastCopied = widget.querySelector('[data-role="last-copied"]');
    if (lastCopied) {
      lastCopied.textContent = ok ? 'Copied tracking to clipboard' : 'Copy failed — clipboard unchanged';
    }
  });

  const toggleWrap = document.createElement('div');
  toggleWrap.style.cssText = 'display:flex; gap:6px; margin-top: 10px;';

  const mkModeBtn = (label, mode) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.setAttribute('data-role', 'mode-toggle-btn');
    b.setAttribute('data-mode', mode);
    b.style.cssText = `
      flex: 1;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.10);
      color: rgba(255,255,255,0.9);
      padding: 7px 8px;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 800;
      font-size: 12px;
    `;
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setExtensionMode(mode);
      applyModeToWidget(widget);
    });
    return b;
  };

  toggleWrap.appendChild(mkModeBtn('Export', 'export'));
  toggleWrap.appendChild(mkModeBtn('Tracking', 'tracking'));

  const close = document.createElement('button');
  close.textContent = '×';
  close.style.cssText = `
    position:absolute;
    top:6px;
    right:8px;
    background: transparent;
    border: none;
    color: rgba(255,255,255,0.7);
    font-size: 18px;
    cursor: pointer;
  `;
  close.addEventListener('click', () => widget.remove());

  row.appendChild(tn);
  widget.appendChild(close);
  widget.appendChild(title);
  widget.appendChild(row);
  widget.appendChild(meta);
  widget.appendChild(copyRow);
  widget.appendChild(copyTracking);
  widget.appendChild(link);
  widget.appendChild(toggleWrap);

  const lastCopied = document.createElement('div');
  lastCopied.setAttribute('data-role', 'last-copied');
  lastCopied.style.cssText = 'margin-top: 8px; font-size: 11px; color: rgba(255,255,255,0.65);';
  lastCopied.textContent = '';
  widget.appendChild(lastCopied);

  document.body.appendChild(widget);

  // Apply initial mode (default export)
  applyModeToWidget(widget);
}

function startBuyingTrackingWatcher() {
  if (!isBuyingOrderDetailPage()) return;
  console.log('📦 StockX buying order page detected – watching for TrackButton...');

  // Clean up any previous watchers (SPA route changes)
  try {
    if (window.__stockxBuyingWatcher?.mo) window.__stockxBuyingWatcher.mo.disconnect();
  } catch {}
  try {
    if (window.__stockxBuyingWatcher?.interval) clearInterval(window.__stockxBuyingWatcher.interval);
  } catch {}

  const tryFind = () => {
    const a = document.querySelector('a[data-testid="TrackButton"][href]');
    const href = a && a.getAttribute('href');
    if (!href) return false;
    const trackingNumber = parseTrackingFromFedexUrl(href);
    if (!trackingNumber) return false;
    console.log('✅ Found TrackButton tracking:', trackingNumber);
    ensureTrackingWidget(trackingNumber, href);
    return true;
  };

  // Create a lightweight widget once when entering a detail page (and refresh it on interval).
  ensureTrackingWidget(null, null);
  if (tryFind()) return;

  // Watch SPA mutations
  let lastMutationRun = 0;
  const mo = new MutationObserver(() => {
    const now = Date.now();
    // Throttle expensive checks on heavy pages.
    if (now - lastMutationRun < 500) return;
    lastMutationRun = now;
    if (tryFind()) {
      try { mo.disconnect(); } catch {}
    }
  });
  mo.observe(document.documentElement || document.body, { subtree: true, childList: true });

  // Also retry a few times in case of delayed hydration
  let attempts = 0;
  const interval = setInterval(() => {
    attempts += 1;
    // Keep meta fields refreshed even before tracking appears, but only once per tick.
    ensureTrackingWidget(null, null);
    if (tryFind() || attempts > 30) {
      clearInterval(interval);
      try { mo.disconnect(); } catch {}
    }
  }, 1000);

  // Track so we can clean up on next navigation.
  window.__stockxBuyingWatcher = { mo, interval };
}

// Add a visible indicator that the extension is loaded
const indicator = document.createElement('div');
indicator.id = 'stockx-extension-loaded';
indicator.style.cssText = `
  position: fixed;
  top: 10px;
  right: 10px;
  background: #00ff00;
  color: black;
  padding: 5px 10px;
  border-radius: 5px;
  font-size: 12px;
  z-index: 10000;
  font-family: Arial, sans-serif;
`;
indicator.textContent = 'StockX Extension Loaded';
document.body.appendChild(indicator);

// Remove indicator after 3 seconds
setTimeout(() => {
  if (indicator.parentNode) {
    indicator.parentNode.removeChild(indicator);
  }
}, 3000);

// Simple function to check if we're on a StockX product page
function isProductPage() {
  const url = window.location.href;
  const isStockX = url.includes('stockx.com');
  const isNotSearchPage = !url.includes('/search') && !url.includes('/sell') && !url.includes('/buy');
  const hasProductIndicators = document.querySelector('h1') || document.querySelector('button');
  
  console.log('🔍 Product page detection:', {
    isStockX,
    isNotSearchPage,
    hasProductIndicators,
    url: url
  });
  
  return isStockX && isNotSearchPage && hasProductIndicators;
}

// Simple function to scrape pricing data
function scrapePricingData() {
  console.log('🔍 Scraping pricing data...');
  
  const buttons = document.querySelectorAll('button');
  const prices = [];
  
  buttons.forEach(button => {
    const text = button.textContent || '';
    const priceMatch = text.match(/\$?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
    
    if (priceMatch) {
      const price = parseFloat(priceMatch[1].replace(/[$,]/g, ''));
      if (price > 10 && price < 10000) {
        prices.push(price);
        console.log(`💰 Found price: $${price} in "${text}"`);
      }
    }
  });
  
  if (prices.length > 0) {
    prices.sort((a, b) => a - b);
    const minPrice = prices[0];
    const maxPrice = prices[prices.length - 1];
    const avgPrice = Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length);
    
    return {
      averagePrice: avgPrice,
      lastSale: avgPrice,
      highestBid: minPrice,
      lowestAsk: maxPrice,
      scrapedFromPage: true
    };
  }
  
  return null;
}

// Simple function to display the widget
function displayWidget(marketData) {
  // Remove existing widget
  const existingWidget = document.getElementById('stockx-price-tracker-widget');
  if (existingWidget) {
    existingWidget.remove();
  }
  
  const widget = document.createElement('div');
  widget.id = 'stockx-price-tracker-widget';
  widget.style.cssText = `
    position: fixed;
    top: 20px;
    left: 20px;
    background: #2d3748;
    color: white;
    padding: 15px;
    border-radius: 8px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    z-index: 10000;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    max-width: 250px;
  `;
  
  widget.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
      <span style="font-weight: bold;">📊 Market Data</span>
      <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: white; cursor: pointer; font-size: 18px;">×</button>
    </div>
    <div style="margin-bottom: 8px;">
      <span>Average Price: </span>
      <span style="color: #4ade80;">$${marketData.averagePrice}</span>
    </div>
    <div style="margin-bottom: 8px;">
      <span>Last Sale: </span>
      <span>$${marketData.lastSale}</span>
    </div>
    <div style="margin-bottom: 8px;">
      <span>Highest Bid: </span>
      <span>$${marketData.highestBid}</span>
    </div>
    <div style="margin-bottom: 8px;">
      <span>Lowest Ask: </span>
      <span>$${marketData.lowestAsk}</span>
    </div>
    <div style="font-size: 12px; color: #a0aec0; text-align: center; margin-top: 10px;">
      ${marketData.scrapedFromPage ? 'Data scraped from page' : 'Mock data'}
    </div>
  `;
  
  document.body.appendChild(widget);
}

// Main function
function init() {
  console.log('🔍 Initializing simple tracker...');
  
  // If this is a buying order page, run tracking watcher (independent of product widget).
  startBuyingTrackingWatcher();

  if (isProductPage()) {
    console.log('📦 StockX product page detected');
    
    // Wait a bit for page to load
    setTimeout(() => {
      const marketData = scrapePricingData();
      
      if (marketData) {
        console.log('✅ Scraped market data:', marketData);
        displayWidget(marketData);
      } else {
        console.log('⚠️ No pricing data found, using mock data');
        displayWidget({
          averagePrice: 95,
          lastSale: 103,
          highestBid: 89,
          lowestAsk: 98,
          scrapedFromPage: false
        });
      }
    }, 2000);
  } else {
    console.log('❌ Not a StockX product page');
  }
}

// Initialize
try {
  init();
} catch (error) {
  console.error('❌ Error initializing simple tracker:', error);
}

// Listen for SPA navigation changes and refresh buying-page tracking widget
let __lastStockxUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url === __lastStockxUrl) return;
  __lastStockxUrl = url;

  // If we navigated to a different buying page, reset widget + restart watcher.
  if (isBuyingOrderDetailPage()) {
    removeTrackingWidget();
    // Give StockX a moment to render new route
    setTimeout(() => startBuyingTrackingWatcher(), 500);
  } else {
    // Leaving a detail page: stop watchers + remove widget.
    removeTrackingWidget();
    try {
      if (window.__stockxBuyingWatcher?.mo) window.__stockxBuyingWatcher.mo.disconnect();
    } catch {}
    try {
      if (window.__stockxBuyingWatcher?.interval) clearInterval(window.__stockxBuyingWatcher.interval);
    } catch {}
  }
}).observe(document, { subtree: true, childList: true });
