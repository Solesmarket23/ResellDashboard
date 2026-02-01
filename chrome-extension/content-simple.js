// Simple StockX Price Tracker Content Script
console.log('🔍 Simple StockX Price Tracker loaded');

// --- Buying-page tracking extractor (StockX -> carrier tracking numbers) ---
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

function normalizeTrackingCandidate(s) {
  // Remove whitespace and punctuation commonly inserted when copying tracking numbers.
  return String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

function parseUpsTrackingFromText(text) {
  const raw = String(text || '');
  const upper = raw.toUpperCase();

  // Common UPS tracking number format: 1Z + 16 alphanumeric chars (18 total).
  // People often copy/paste with spaces or hyphens (including right after "1Z"),
  // so we locate "1Z" and then normalize a short window.
  let idx = upper.indexOf('1Z');
  while (idx !== -1) {
    // Avoid matching inside longer alphanumeric tokens
    if (idx > 0 && /[0-9A-Z]/.test(upper[idx - 1])) {
      idx = upper.indexOf('1Z', idx + 2);
      continue;
    }

    const slice = raw.slice(idx, idx + 64);
    const n = normalizeTrackingCandidate(slice);
    const m = n.match(/^1Z[0-9A-Z]{16}/);
    if (m?.[0] && /^1Z[0-9A-Z]{16}$/.test(m[0])) return m[0];

    idx = upper.indexOf('1Z', idx + 2);
  }

  return null;
}

function parseFedexTrackingFromUrl(href) {
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

function parseTrackingFromCarrierUrl(href) {
  const url = String(href || '');
  // UPS: try URL params and raw URL text for 1Z format
  try {
    const u = new URL(url);
    // UPS commonly uses "tracknum" but we scan all params defensively
    for (const [, v] of u.searchParams.entries()) {
      const ups = parseUpsTrackingFromText(v);
      if (ups) return { trackingNumber: ups, carrier: 'ups' };
    }
  } catch {
    // ignore
  }
  const upsInUrl = parseUpsTrackingFromText(url);
  if (upsInUrl) return { trackingNumber: upsInUrl, carrier: 'ups' };

  // FedEx fallback
  const fedex = parseFedexTrackingFromUrl(url);
  if (fedex) return { trackingNumber: fedex, carrier: 'fedex' };

  return { trackingNumber: null, carrier: null };
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
    trackingUrl: '',
    trackingCarrier: ''
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
      details.trackingUrl = href;
      const parsed = parseTrackingFromCarrierUrl(href);
      if (parsed?.trackingNumber) details.trackingNumber = parsed.trackingNumber;
      if (parsed?.carrier) details.trackingCarrier = parsed.carrier;
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

function ensureTrackingWidget(trackingNumber, trackingUrl) {
  const buyingId = getBuyingIdFromUrl();
  const details = extractOrderDetailsFromBuyingPage();

  // Prefer passed-in tracking
  if (trackingNumber) details.trackingNumber = trackingNumber;
  if (trackingUrl) details.trackingUrl = trackingUrl;
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
    const linkEl = existingAfter.querySelector('[data-role="tracking-link"]');
    if (linkEl && details.trackingUrl) {
      linkEl.setAttribute('href', details.trackingUrl);
      linkEl.style.display = '';
      const carrier = (details.trackingCarrier || '').toLowerCase();
      const label = carrier === 'ups' ? 'UPS' : carrier === 'fedex' ? 'FedEx' : 'Carrier';
      linkEl.textContent = `Open ${label}`;
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
  link.setAttribute('data-role', 'tracking-link');
  link.href = details.trackingUrl || '#';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  {
    const carrier = (details.trackingCarrier || '').toLowerCase();
    const label = carrier === 'ups' ? 'UPS' : carrier === 'fedex' ? 'FedEx' : 'Carrier';
    link.textContent = `Open ${label}`;
  }
  link.style.cssText = 'display:inline-block; margin-top: 8px; color: #93c5fd; text-decoration: underline;';
  if (!details.trackingUrl) link.style.display = 'none';

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
    const parsed = parseTrackingFromCarrierUrl(href);
    if (!parsed?.trackingNumber) return false;
    console.log('✅ Found TrackButton tracking:', parsed.trackingNumber, parsed.carrier || '');
    ensureTrackingWidget(parsed.trackingNumber, href);
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

// --- Product-page recent sales + bid helper ---
function isStockXProductPage() {
  try {
    const url = window.location.href;
    if (!window.location.hostname.includes('stockx.com')) return false;

    // Exclude common non-product routes
    const path = window.location.pathname.toLowerCase();
    // Explicitly exclude the homepage
    if (path === '/' || path === '') return false;
    const excludedPrefixes = [
      '/category',
      '/search',
      '/sell',
      '/buy',
      '/buying',
      '/selling',
      '/help',
      '/settings',
      '/about',
      '/professional-tools',
      '/accounts',
      '/login',
      '/signup'
    ];
    if (excludedPrefixes.some((p) => path.startsWith(p))) return false;

    // Product pages are typically a single slug segment: /<slug>
    const parts = path.split('/').filter(Boolean);
    if (parts.length !== 1) return false;
    const slug = parts[0];
    if (!slug || slug.length < 6) return false;
    if (!/^[a-z0-9-]+$/.test(slug)) return false;

    // Heuristic: most product pages have an H1 and at least one buy/bid CTA.
    const h1 = document.querySelector('h1');
    const hasCta =
      !!findButtonByText(/place\s+bid|bid/i) ||
      !!findButtonByText(/buy\s+now|buy/i) ||
      !!document.querySelector('[data-testid*="place-bid" i], [data-testid*="buy-now" i]');

    return !!(h1 && h1.textContent?.trim() && hasCta);
  } catch {
    return false;
  }
}

function getProductSlugFromUrl() {
  try {
    const parts = window.location.pathname.split('/').filter(Boolean);
    // StockX product pages are often /<slug>
    return parts.length >= 1 ? parts[0] : null;
  } catch {
    return null;
  }
}

function getSelectedSizeFromUrl() {
  try {
    const u = new URL(window.location.href);
    const s = u.searchParams.get('size');
    return s ? String(s).trim() : '';
  } catch {
    return '';
  }
}

function normalizeSizeKey(size) {
  const s = String(size || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!s) return '';

  // Kids / youth / toddler sizing: preserve suffix so it doesn't collide with adult sizes.
  // Examples: "6Y", "US 6 YOUTH", "US Y 6", "10K", "3C", "5T"
  try {
    const kids = s.match(/\b(\d{1,2}(?:\.\d)?)\s*(K|Y|C|T)\b/i);
    if (kids?.[1] && kids?.[2]) return `${kids[1]}${String(kids[2]).toUpperCase()}`;
  } catch {}
  try {
    const kids2 = s.match(/\b(?:US|UK|EU)\s*(K|Y|C|T)\s*(\d{1,2}(?:\.\d)?)\b/i);
    if (kids2?.[1] && kids2?.[2]) return `${kids2[2]}${String(kids2[1]).toUpperCase()}`;
  } catch {}
  try {
    // StockX sometimes renders "US 6 Youth" (no trailing "Y").
    if (/\bYOUTH\b/i.test(s) || /\bGS\b/i.test(s) || /\bGRADE\s*SCHOOL\b/i.test(s)) {
      const m = s.match(/\b(\d{1,2}(?:\.\d)?)\b/);
      if (m?.[1]) return `${m[1]}Y`;
    }
  } catch {}

  // Adult: numeric part for matching (e.g. "US 9.5" -> "9.5")
  const m = s.match(/(\d{1,2}(?:\.\d)?)/);
  return m?.[1] ? m[1] : s;
}

function getSelectedSizeFromDom() {
  try {
    // Heuristic: StockX size pickers often mark selected options with aria-selected/aria-checked/current
    // and the selected size is usually a short token like "9.5" / "US 9.5".
    const candidates = Array.from(
      document.querySelectorAll(
        '[aria-selected="true"],[aria-checked="true"],[aria-current="true"],[data-state="checked"],[data-state="selected"]'
      )
    ).slice(0, 400);

    const extract = (el) => {
      const t = safeText(el);
      if (!t) return '';
      if (/\$/.test(t)) return ''; // avoid picking price nodes
      // Avoid picking generic labels
      if (t.length > 12) return '';
      const key = normalizeSizeKey(t);
      // plausible size range
      const n = Number(key);
      if (Number.isFinite(n) && n >= 3 && n <= 21) return key;
      return '';
    };

    for (const el of candidates) {
      const key = extract(el);
      if (key) return key;
    }

    // Another common pattern: a visible "Size: 9.5" label somewhere near the trade box
    const text = String(document.body?.innerText || '').replace(/\s+/g, ' ');
    const m = text.match(/\bsize\s*[:\-]?\s*([0-9]{1,2}(?:\.[0-9])?)\b/i);
    if (m?.[1]) return normalizeSizeKey(m[1]);

    return '';
  } catch {
    return '';
  }
}

function getSelectedSizeBestEffort() {
  // 1) URL query param (?size=9.5) is best when present.
  const urlSize = getSelectedSizeFromUrl();
  if (urlSize) return normalizeSizeKey(urlSize);

  // 2) Try to infer from DOM selected option
  const domSize = getSelectedSizeFromDom();
  if (domSize) return normalizeSizeKey(domSize);

  // 2) Try to infer from the visible trade box copy, e.g. "Sell Now for $68..."
  try {
    const candidates = Array.from(document.querySelectorAll('p,div,span')).slice(0, 5000);
    const el = candidates.find((x) => /\bsell\s+now\b/i.test(safeText(x)));
    const txt = safeText(el);
    const m = txt.match(/\bsize\b[^0-9]*([0-9]{1,2}(?:\.[0-9])?)\b/i);
    if (m?.[1]) return normalizeSizeKey(m[1]);
  } catch {}

  // 3) Fall back to the saved preferred size (widget input persists here).
  return normalizeSizeKey(getPreferredSize());
}

function sizeKeyMatches(candidateSizeKey, wantedSizeKey) {
  const c = normalizeSizeKey(candidateSizeKey);
  const w = normalizeSizeKey(wantedSizeKey);
  if (!c || !w) return false;
  if (c === w) return true;
  // allow mild fuzz: "9.5W" / "US 9.5" / etc
  return c.includes(w) || w.includes(c);
}

function safeText(el) {
  return String(el?.textContent || el?.innerText || '').replace(/\s+/g, ' ').trim();
}

function findButtonByText(re) {
  const buttons = Array.from(document.querySelectorAll('button,[role="button"]'));
  for (const b of buttons) {
    const t = safeText(b).toLowerCase();
    if (!t) continue;
    if (re.test(t)) return b;
    const aria = String(b.getAttribute('aria-label') || '').toLowerCase();
    if (aria && re.test(aria)) return b;
  }
  return null;
}

function parsePriceFromText(text) {
  const s = String(text || '');
  const m = s.match(/\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/);
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseBestUsdFromText(text) {
  // Some Market Data rows include multiple numbers (e.g. Quantity + $Price).
  // For bids/asks we want the *price*, which is usually the largest plausible USD number in the row.
  try {
    const s = String(text || '');
    const matches = Array.from(s.matchAll(/\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/g));
    const nums = matches
      .map((m) => {
        const raw = m?.[1];
        if (!raw) return null;
        const n = Number(String(raw).replace(/,/g, ''));
        return Number.isFinite(n) ? n : null;
      })
      .filter((n) => typeof n === 'number' && Number.isFinite(n));
    const plausible = nums.filter((n) => isPlausibleUsd(n));
    if (plausible.length) return Math.max(...plausible);
    // Fallback to the first parsed number (existing behavior)
    return parsePriceFromText(s);
  } catch {
    return parsePriceFromText(text);
  }
}

function stockxSizeParamFromLabel(sizeLabel) {
  // Convert a label like "US M 9.5" or "10K" into StockX's ?size= value.
  try {
    const s = String(sizeLabel || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    if (/one\s*size/i.test(s)) return '';
    const kids = s.match(/\b(\d{1,2}(?:\.\d)?)\s*(K|Y|C|T)\b/i);
    if (kids?.[1] && kids?.[2]) return `${kids[1]}${String(kids[2]).toUpperCase()}`;
    return normalizeSizeKey(s);
  } catch {
    return '';
  }
}

function withSizeParam(url, sizeParam) {
  try {
    const u = new URL(String(url || ''), location.origin);
    const sp = String(sizeParam || '').trim();
    if (sp) u.searchParams.set('size', sp);
    return u.toString();
  } catch {
    return url;
  }
}

// --- Bid history (dedupe) ---
async function loadBidHistoryMap() {
  try {
    if (!chrome?.storage?.local) return {};
    const res = await new Promise((resolve) => chrome.storage.local.get(['stockxBidHistory'], resolve));
    const map = res?.stockxBidHistory;
    return map && typeof map === 'object' ? map : {};
  } catch {
    return {};
  }
}

async function saveBidHistoryMap(map) {
  try {
    if (!chrome?.storage?.local) return false;
    await new Promise((resolve) => chrome.storage.local.set({ stockxBidHistory: map }, resolve));
    return true;
  } catch {
    return false;
  }
}

function bidHistoryKey({ slug, sizeParam }) {
  const s = String(slug || '').trim();
  const sp = String(sizeParam || '').trim();
  if (!s || !sp) return '';
  return `${s}::${sp}`;
}

async function markBidPlaced({ slug, url, sizeLabel, sizeParam, bid, ask }) {
  try {
    const key = bidHistoryKey({ slug, sizeParam });
    if (!key) return false;
    const map = await loadBidHistoryMap();
    map[key] = {
      key,
      slug: String(slug || ''),
      url: String(url || ''),
      sizeLabel: String(sizeLabel || ''),
      sizeParam: String(sizeParam || ''),
      bid: Number.isFinite(Number(bid)) ? Math.round(Number(bid)) : null,
      ask: Number.isFinite(Number(ask)) ? Math.round(Number(ask)) : null,
      placedAt: Date.now()
    };
    await saveBidHistoryMap(map);
    try {
      window.__stockxBidHistoryCache = map;
    } catch {}
    return true;
  } catch {
    return false;
  }
}

async function clearBidHistory() {
  try {
    if (!chrome?.storage?.local) return false;
    await new Promise((resolve) => chrome.storage.local.remove(['stockxBidHistory'], resolve));
    try {
      window.__stockxBidHistoryCache = {};
    } catch {}
    return true;
  } catch {
    return false;
  }
}

// --- Scan settings (persisted) ---
const STOCKX_SCAN_SETTINGS_KEY = 'stockxScanSettings';
const STOCKX_LISTING_WIDGET_POS_KEY = 'stockxListingWidgetPos';

function openExtensionSettingsTab() {
  try {
    if (!chrome?.runtime?.sendMessage) return false;
    const url = chrome?.runtime?.getURL ? chrome.runtime.getURL('settings.html') : '';
    if (!url) return false;
    chrome.runtime.sendMessage({ action: 'openTab', url }, () => void chrome.runtime.lastError);
    return true;
  } catch {
    return false;
  }
}

function openExtensionDashboardTab() {
  try {
    if (!chrome?.runtime?.sendMessage) return false;
    const url = chrome?.runtime?.getURL ? chrome.runtime.getURL('dashboard.html') : '';
    if (!url) return false;
    chrome.runtime.sendMessage({ action: 'openTab', url }, () => void chrome.runtime.lastError);
    return true;
  } catch {
    return false;
  }
}

function openUrlInNewTabBestEffort(url) {
  try {
    const target = String(url || '').trim();
    if (!target) return false;
    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ action: 'openTab', url: target }, () => {
        // If message fails (no receiver / context), fall back.
        const err = chrome.runtime?.lastError;
        if (err) {
          try {
            window.open(target, '_blank', 'noopener,noreferrer');
          } catch {}
        }
      });
      return true;
    }
  } catch {}
  try {
    window.open(String(url || ''), '_blank', 'noopener,noreferrer');
    return true;
  } catch {
    return false;
  }
}

function defaultScanSettings() {
  return {
    minSales30d: 4,
    minProfit: 15,
    feeSum: 21,
    excludeRecentReleaseDays: 30,
    excludeSponsored: true,
    skipOneSize: false,
    includeCategories: ['sneakers', 'streetwear', 'collectibles', 'electronics', 'trading-cards', 'handbags', 'watches']
  };
}

async function loadScanSettings() {
  try {
    if (!chrome?.storage?.local) return defaultScanSettings();
    const res = await new Promise((resolve) => chrome.storage.local.get([STOCKX_SCAN_SETTINGS_KEY], resolve));
    const cur = res?.[STOCKX_SCAN_SETTINGS_KEY] && typeof res[STOCKX_SCAN_SETTINGS_KEY] === 'object' ? res[STOCKX_SCAN_SETTINGS_KEY] : null;
    const merged = { ...defaultScanSettings(), ...(cur || {}) };
    try {
      window.__stockxScanSettingsCache = merged;
    } catch {}
    return merged;
  } catch {
    return defaultScanSettings();
  }
}

function getScanSettingsCached() {
  try {
    const c = window.__stockxScanSettingsCache;
    return c && typeof c === 'object' ? { ...defaultScanSettings(), ...c } : defaultScanSettings();
  } catch {
    return defaultScanSettings();
  }
}

async function loadListingWidgetPos() {
  try {
    if (!chrome?.storage?.local) return null;
    const res = await new Promise((resolve) => chrome.storage.local.get([STOCKX_LISTING_WIDGET_POS_KEY], resolve));
    const cur = res?.[STOCKX_LISTING_WIDGET_POS_KEY];
    const left = Number(cur?.left);
    const top = Number(cur?.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
    const pos = { left: Math.round(left), top: Math.round(top) };
    try {
      window.__stockxListingWidgetPosCache = pos;
    } catch {}
    return pos;
  } catch {
    return null;
  }
}

async function saveListingWidgetPos(pos) {
  try {
    if (!chrome?.storage?.local) return false;
    const left = Number(pos?.left);
    const top = Number(pos?.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) return false;
    const next = { left: Math.round(left), top: Math.round(top) };
    await new Promise((resolve) => chrome.storage.local.set({ [STOCKX_LISTING_WIDGET_POS_KEY]: next }, resolve));
    try {
      window.__stockxListingWidgetPosCache = next;
    } catch {}
    return true;
  } catch {
    return false;
  }
}

function getListingWidgetPosCached() {
  try {
    const c = window.__stockxListingWidgetPosCache;
    const left = Number(c?.left);
    const top = Number(c?.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
    return { left: Math.round(left), top: Math.round(top) };
  } catch {
    return null;
  }
}

try {
  if (chrome?.storage?.onChanged?.addListener) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      try {
        if (areaName !== 'local') return;
        const ch = changes?.[STOCKX_SCAN_SETTINGS_KEY];
        if (!ch) return;
        const next = { ...defaultScanSettings(), ...(ch.newValue || {}) };
        window.__stockxScanSettingsCache = next;
        // Redraw listing widget if present so toggles/labels reflect the latest settings.
        try {
          const w = document.getElementById('stockx-bid-opps-widget');
          if (w && typeof ensureListingBidWidget === 'function') ensureListingBidWidget();
        } catch {}
      } catch {}
    });
  }
} catch {}

function parseDateFromText(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  // Common formats on StockX UI: "Jan 2, 2026" or "1/2/26"
  const monthRe = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2},\s+\d{4}\b/i;
  const m1 = s.match(monthRe);
  if (m1?.[0]) {
    const ms = Date.parse(m1[0]);
    if (Number.isFinite(ms)) return new Date(ms);
  }
  const m2 = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (m2?.[0]) {
    const [mm, dd, yy] = [Number(m2[1]), Number(m2[2]), Number(m2[3])];
    const yyyy = yy < 100 ? 2000 + yy : yy;
    const ms = Date.parse(`${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}T00:00:00.000Z`);
    if (Number.isFinite(ms)) return new Date(ms);
  }
  // Relative times: "2d ago", "3 hours ago", "15m ago"
  const rel = s.match(/\b(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks)\s+ago\b/i);
  if (rel?.[1] && rel?.[2]) {
    const qty = Number(rel[1]);
    const unit = rel[2].toLowerCase();
    if (Number.isFinite(qty) && qty > 0) {
      const now = Date.now();
      const mult =
        unit.startsWith('s') ? 1000 :
        unit.startsWith('m') ? 60 * 1000 :
        unit.startsWith('h') ? 60 * 60 * 1000 :
        unit.startsWith('d') ? 24 * 60 * 60 * 1000 :
        7 * 24 * 60 * 60 * 1000;
      return new Date(now - qty * mult);
    }
  }
  return null;
}

function parseSizeFromText(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  // Prefer explicit size formats to avoid matching random counts like "0", "1", "18" from other UI.
  // NOTE: StockX Market Data rows can concatenate quantity + size like "6US M 8$271" (no word boundary before "US"),
  // so do not rely on \b before region token. Instead capture the region token explicitly.
  // Also allow the token to be preceded by digits (quantity), e.g. "5US M 8$271".
  const m1 = s.match(/(US|UK|EU)\s*([MW]?\s*\d{1,2}(?:\.\d)?)\b/i);
  if (m1?.[1] && m1?.[2]) {
    const region = String(m1[1]).toUpperCase();
    const rest = String(m1[2]).toUpperCase().replace(/\s+/g, ' ').trim();
    return `${region} ${rest}`.trim();
  }

  const m2 = s.match(/\b(?:MEN|WOMEN|M|W)\s*(\d{1,2}(?:\.\d)?)\b/i);
  if (m2?.[0]) return m2[0].toUpperCase().replace(/\s+/g, ' ');

  // Kids / youth / toddler sizing (common on StockX): "10K", "6Y", "3C"
  // Note: digits+letter is NOT a word boundary between them, so we must match the suffix explicitly.
  const mKids = s.match(/\b(\d{1,2}(?:\.\d)?)\s*(K|Y|C|T)\b/i);
  if (mKids?.[1] && mKids?.[2]) return `${mKids[1]}${String(mKids[2]).toUpperCase()}`;

  // Sometimes displayed as "US K 10" / "US Y 6"
  const mKids2 = s.match(/\b(?:US|UK|EU)\s*(K|Y|C|T)\s*(\d{1,2}(?:\.\d)?)\b/i);
  if (mKids2?.[1] && mKids2?.[2]) return `${mKids2[2]}${String(mKids2[1]).toUpperCase()}`;

  // Fallback: plain numeric size, but constrain to realistic shoe size range and avoid common non-size contexts.
  // NOTE: In Market Data tables, the first column is often Quantity, so we avoid treating "5" / "11" etc as sizes.
  // Callers that need stricter behavior should use parseSizeFromTextStrict().
  const m3 = s.match(/\b(\d{1,2}(?:\.\d)?)\b/);
  if (!m3?.[1]) return null;
  const n = Number(m3[1]);
  if (!Number.isFinite(n)) return null;
  if (n < 3 || n > 21) return null;
  const lowered = s.toLowerCase();
  if (/\b(sales|sold|reviews|results|items|views|followers)\b/i.test(lowered)) return null;
  return String(n);
}

function parseSizeFromTextStrict(text) {
  // Strict size parse: do NOT accept plain numeric fallbacks.
  // Use this when parsing Market Data tables so Quantity doesn't get misread as size.
  try {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return null;

    const m1 = s.match(/(US|UK|EU)\s*([MW]?\s*\d{1,2}(?:\.\d)?)\b/i);
    if (m1?.[1] && m1?.[2]) {
      const region = String(m1[1]).toUpperCase();
      const rest = String(m1[2]).toUpperCase().replace(/\s+/g, ' ').trim();
      return `${region} ${rest}`.trim();
    }
    const m2 = s.match(/\b(?:MEN|WOMEN|M|W)\s*(\d{1,2}(?:\.\d)?)\b/i);
    if (m2?.[0]) return m2[0].toUpperCase().replace(/\s+/g, ' ');

    const mKids = s.match(/\b(\d{1,2}(?:\.\d)?)\s*(K|Y|C|T)\b/i);
    if (mKids?.[1] && mKids?.[2]) return `${mKids[1]}${String(mKids[2]).toUpperCase()}`;

    const mKids2 = s.match(/\b(?:US|UK|EU)\s*(K|Y|C|T)\s*(\d{1,2}(?:\.\d)?)\b/i);
    if (mKids2?.[1] && mKids2?.[2]) return `${mKids2[2]}${String(mKids2[1]).toUpperCase()}`;

    return null;
  } catch {
    return null;
  }
}

function toNumberMaybe(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parsePriceFromText(v);
    if (typeof n === 'number' && Number.isFinite(n)) return n;
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    // Common nested amount shapes: { amount: 123 }, { value: 123 }, { usd: 123 }, { cents: 12345 }
    const any = v;
    const direct =
      toNumberMaybe(any.amount) ??
      toNumberMaybe(any.value) ??
      toNumberMaybe(any.usd) ??
      toNumberMaybe(any.localAmount) ??
      toNumberMaybe(any.local_amount) ??
      null;
    if (direct != null) return direct;
    const cents = toNumberMaybe(any.cents) ?? toNumberMaybe(any.amountCents) ?? toNumberMaybe(any.amount_cents) ?? null;
    if (typeof cents === 'number' && Number.isFinite(cents) && cents > 0) return Math.round((cents / 100) * 100) / 100;
  }
  return null;
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function isPlausibleUsd(n) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 20 && n <= 20000;
}

function formatUsdOrDash(n) {
  const num = typeof n === 'string' ? toNumberMaybe(n) : n;
  return isPlausibleUsd(num) ? String(Math.round(num)) : '—';
}

function setLastHelperData(marketData, recentSales) {
  try {
    window.__stockxHelperLastMarketData = marketData;
    window.__stockxHelperLastRecentSales = recentSales;
  } catch {}
}

function getMarketCacheKey() {
  // Key by (product + selected size). This ensures size changes recalculate cleanly.
  try {
    const slug = getProductSlugFromUrl() || location.pathname || 'unknown';
    const sizeKey = getSelectedSizeBestEffort() || 'unknown';
    // If we can't reliably determine size, disable sticky caching (prevents cross-size contamination)
    if (!sizeKey || sizeKey === 'unknown') return '';
    return `${slug}::${sizeKey}`;
  } catch {
    return '';
  }
}

function getCachedMarketData() {
  try {
    const key = getMarketCacheKey();
    if (!key) return null;
    const cache = window.__stockxHelperMarketCache;
    const entry = cache && cache[key];
    if (!entry?.data) return null;
    // Only keep for a short window to avoid stale values across real changes.
    if (typeof entry.ts === 'number' && Date.now() - entry.ts > 60_000) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function setCachedMarketData(data) {
  try {
    const key = getMarketCacheKey();
    if (!key) return;
    if (!window.__stockxHelperMarketCache) window.__stockxHelperMarketCache = {};
    window.__stockxHelperMarketCache[key] = { data, ts: Date.now() };
  } catch {}
}

function resetMarketCacheForCurrentSelection() {
  try {
    const key = getMarketCacheKey();
    if (!key) return;
    if (window.__stockxHelperMarketCache && window.__stockxHelperMarketCache[key]) {
      delete window.__stockxHelperMarketCache[key];
    }
  } catch {}
}

function mergeMarketDataSticky(prev, next) {
  // Prevent flicker caused by duplicate trade boxes: keep best seen values for this URL/size.
  try {
    const p = prev || {};
    const n = next || {};

    const pAsk = toNumberMaybe(p.lowestAsk);
    const nAsk = toNumberMaybe(n.lowestAsk);
    const pBid = toNumberMaybe(p.highestBid);
    const nBid = toNumberMaybe(n.highestBid);

    const merged = { ...n };

    if (isPlausibleUsd(pAsk) && isPlausibleUsd(nAsk)) merged.lowestAsk = Math.min(pAsk, nAsk);
    else if (isPlausibleUsd(pAsk) && !isPlausibleUsd(nAsk)) merged.lowestAsk = pAsk;

    if (isPlausibleUsd(pBid) && isPlausibleUsd(nBid)) merged.highestBid = Math.max(pBid, nBid);
    else if (isPlausibleUsd(pBid) && !isPlausibleUsd(nBid)) merged.highestBid = pBid;

    // If we stabilized from duplicates, keep the newer source but mark it in debug.
    merged._sticky = true;
    return merged;
  } catch {
    return next;
  }
}

function getNextData() {
  try {
    const url = location.href;
    try {
      const cached = window.__stockxNextDataCache;
      if (cached && cached.url === url && cached.data) return cached.data;
    } catch {}

    const el = document.getElementById('__NEXT_DATA__');
    if (!el?.textContent) return null;
    const parsed = JSON.parse(el.textContent);
    try {
      window.__stockxNextDataCache = { url, data: parsed, ts: Date.now() };
    } catch {}
    return parsed;
  } catch {
    return null;
  }
}

function getNextDataSearchRoots(next) {
  try {
    if (!next) return [];
    const roots = [];

    // Typical Next.js shapes
    const pageProps = next?.props?.pageProps;
    if (pageProps) roots.push(pageProps);

    // Common dehydrated stores
    const candidates = [
      pageProps?.apolloState,
      pageProps?.apollo_state,
      pageProps?.initialApolloState,
      pageProps?.initial_apollo_state,
      pageProps?.__APOLLO_STATE__,
      pageProps?.__APOLLO_CACHE__,
      pageProps?.dehydratedState,
      pageProps?.dehydrated_state,
      pageProps?.initialState,
      pageProps?.initial_state
    ];
    for (const c of candidates) if (c) roots.push(c);

    // Some apps put it directly under props
    const propsCandidates = [
      next?.props?.apolloState,
      next?.props?.initialApolloState,
      next?.props?.dehydratedState
    ];
    for (const c of propsCandidates) if (c) roots.push(c);

    // As a last resort search the whole next blob
    if (roots.length === 0) roots.push(next);

    return roots;
  } catch {
    return [next].filter(Boolean);
  }
}

function deepWalk(rootOrRoots, onValue, maxNodes = 150000) {
  const stack = Array.isArray(rootOrRoots) ? [...rootOrRoots] : [rootOrRoots];
  const seen = new Set();
  let nodes = 0;
  while (stack.length > 0) {
    const cur = stack.pop();
    nodes += 1;
    if (nodes > maxNodes) break;
    if (!cur) continue;
    if (typeof cur === 'object') {
      if (seen.has(cur)) continue;
      seen.add(cur);
    }
    try {
      onValue(cur);
    } catch {}
    if (Array.isArray(cur)) {
      for (let i = 0; i < cur.length; i++) stack.push(cur[i]);
    } else if (isPlainObject(cur)) {
      for (const v of Object.values(cur)) stack.push(v);
    }
  }
}

function parseDateFromUnknown(v) {
  try {
    if (v == null) return null;
    if (v instanceof Date && Number.isFinite(v.getTime())) return v;
    if (typeof v === 'number' && Number.isFinite(v)) {
      // seconds or ms
      const ms = v < 2_000_000_000 ? v * 1000 : v;
      const d = new Date(ms);
      return Number.isFinite(d.getTime()) ? d : null;
    }
    const s = String(v).trim();
    if (!s) return null;
    // Common: YYYY-MM-DD
    const m = s.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if (m) {
      const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
      return Number.isFinite(d.getTime()) ? d : null;
    }

    // Common: MM/DD/YYYY (or M/D/YYYY). StockX often uses this in the product details.
    const m2 = s.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
    if (m2) {
      const mm = Math.max(1, Math.min(12, Number(m2[1])));
      const dd = Math.max(1, Math.min(31, Number(m2[2])));
      const yy = Number(m2[3]);
      const d = new Date(Date.UTC(yy, mm - 1, dd, 0, 0, 0, 0));
      return Number.isFinite(d.getTime()) ? d : null;
    }

    const ms = Date.parse(s);
    if (Number.isFinite(ms)) {
      const d = new Date(ms);
      return Number.isFinite(d.getTime()) ? d : null;
    }
    return null;
  } catch {
    return null;
  }
}

function extractReleaseDateBestEffort() {
  try {
    // 1) DOM: look for "Release Date" label near a date value.
    try {
      const nodes = Array.from(document.querySelectorAll('div,span,p,li,dt,dd')).slice(0, 7000);
      const label = nodes.find((n) => /^release\s+date$/i.test(safeText(n).trim()));
      if (label) {
        const container = label.closest('li,div,section,dl') || label.parentElement;
        // Prefer an adjacent/nearby node that is just a date (common StockX markup: <p>07/03/2025</p><span>Release Date</span>)
        let txt = '';
        try {
          const prev = label.previousElementSibling;
          const prevTxt = safeText(prev).trim();
          if (/^\d{1,2}\/\d{1,2}\/20\d{2}$/.test(prevTxt) || /^\b20\d{2}-\d{2}-\d{2}\b$/.test(prevTxt)) {
            txt = prevTxt;
          }
        } catch {}
        if (!txt) txt = safeText(container || label);

        const d = parseDateFromUnknown(txt);
        if (d) return { date: d, source: 'dom_release_date', raw: txt.slice(0, 120) };
      }
    } catch {}

    // 2) __NEXT_DATA__: scan for likely release date fields.
    try {
      const next = getNextData();
      if (next) {
        const roots = getNextDataSearchRoots(next);
        let best = null;
        deepWalk(
          roots,
          (v) => {
            try {
              if (!isPlainObject(v)) return;
              for (const [k, val] of Object.entries(v)) {
                const key = String(k || '');
                if (!key) continue;
                if (!/release.*date|launch.*date|drop.*date/i.test(key)) continue;
                const d = parseDateFromUnknown(val);
                if (!d) continue;
                // Prefer the earliest reasonable date <= now if multiple are present.
                const t = d.getTime();
                if (!Number.isFinite(t)) continue;
                if (!best || t < best.date.getTime()) {
                  best = { date: d, source: `next_data:${key}`, raw: String(val).slice(0, 120) };
                }
              }
            } catch {}
          },
          120000
        );
        if (best) return best;
      }
    } catch {}

    return null;
  } catch {
    return null;
  }
}

function scoreSalesArray(arr) {
  if (!Array.isArray(arr) || arr.length < 2 || arr.length > 80) return 0;
  let score = 0;
  let sampleCount = 0;
  for (const item of arr.slice(0, 20)) {
    if (!isPlainObject(item)) continue;
    sampleCount += 1;

    const price =
      toNumberMaybe(item.price) ??
      toNumberMaybe(item.salePrice) ??
      toNumberMaybe(item.amount) ??
      toNumberMaybe(item.localAmount) ??
      toNumberMaybe(item.value);
    if (isPlausibleUsd(price)) score += 4;

    const size =
      (typeof item.size === 'string' && item.size) ||
      (typeof item.shoeSize === 'string' && item.shoeSize) ||
      (typeof item.localizedSize === 'string' && item.localizedSize) ||
      (typeof item.sizeLabel === 'string' && item.sizeLabel);
    if (size) score += 2; // size is nice-to-have

    const date =
      (typeof item.createdAt === 'string' && item.createdAt) ||
      (typeof item.created_at === 'string' && item.created_at) ||
      (typeof item.soldAt === 'string' && item.soldAt) ||
      (typeof item.timestamp === 'string' && item.timestamp) ||
      (typeof item.date === 'string' && item.date);
    if (date) score += 2;
  }
  if (sampleCount === 0) return 0;
  return score;
}

function normalizeSalesArray(arr, max = 10) {
  const out = [];
  for (const item of Array.isArray(arr) ? arr : []) {
    if (!isPlainObject(item)) continue;
    const price =
      toNumberMaybe(item.price) ??
      toNumberMaybe(item.salePrice) ??
      toNumberMaybe(item.amount) ??
      toNumberMaybe(item.localAmount) ??
      toNumberMaybe(item.value);
    if (!isPlausibleUsd(price)) continue;

    const sizeRaw =
      (typeof item.size === 'string' && item.size) ||
      (typeof item.shoeSize === 'string' && item.shoeSize) ||
      (typeof item.localizedSize === 'string' && item.localizedSize) ||
      (typeof item.sizeLabel === 'string' && item.sizeLabel) ||
      '';

    const dateRaw =
      (typeof item.createdAt === 'string' && item.createdAt) ||
      (typeof item.created_at === 'string' && item.created_at) ||
      (typeof item.soldAt === 'string' && item.soldAt) ||
      (typeof item.timestamp === 'string' && item.timestamp) ||
      (typeof item.date === 'string' && item.date) ||
      '';
    const date = dateRaw ? String(dateRaw).slice(0, 10) : '';

    out.push({ price, size: String(sizeRaw || '').toUpperCase().trim(), date, raw: '' });
    if (out.length >= max) break;
  }
  return out;
}

function extractRecentSalesFromNextData(max = 8) {
  try {
    const next = getNextData();
    if (!next) return [];

    let bestArr = null;
    let bestScore = 0;
    const roots = getNextDataSearchRoots(next);
    deepWalk(roots, (v) => {
      if (!Array.isArray(v)) return;
      const s = scoreSalesArray(v);
      if (s > bestScore) {
        bestScore = s;
        bestArr = v;
      }
    });

    if (!bestArr || bestScore < 8) return [];
    // Only keep entries that include a date; otherwise we get noisy "Sale $120" rows.
    return normalizeSalesArray(bestArr, max).filter((s) => !!s.date);
  } catch {
    return [];
  }
}

function scoreMarketObject(obj) {
  if (!isPlainObject(obj)) return 0;
  const keys = Object.keys(obj).map((k) => k.toLowerCase());
  let score = 0;
  const has = (needle) => keys.some((k) => k === needle || k.includes(needle));
  // Prefer exact-ish matches but allow substrings (StockX often uses *Amount / snake_case)
  if (has('highestbid')) score += 4;
  if (has('lowestask')) score += 4;
  if (has('lastsale')) score += 4;
  if (has('average') || has('avg')) score += 1;
  if (has('bid')) score += 1;
  if (has('ask')) score += 1;
  if (has('sale')) score += 1;

  const vals = Object.values(obj);
  const nums = vals.map(toNumberMaybe).filter((n) => typeof n === 'number');
  const plausible = nums.filter((n) => n > 20 && n < 20000);
  if (plausible.length >= 2) score += 2;
  return score;
}

function getValueByKeyIncludes(obj, needles) {
  if (!isPlainObject(obj)) return null;
  const entries = Object.entries(obj);
  const lowerNeedles = needles.map((n) => n.toLowerCase());
  // Prefer shorter keys (more canonical)
  const sorted = entries
    .map(([k, v]) => ({ k, v, lk: k.toLowerCase() }))
    .filter((x) => lowerNeedles.every((n) => x.lk.includes(n)))
    .sort((a, b) => a.lk.length - b.lk.length);
  for (const x of sorted) {
    const n = toNumberMaybe(x.v);
    if (typeof n === 'number' && Number.isFinite(n)) return n;
  }
  return null;
}

function extractMarketCandidateFromObject(obj) {
  if (!isPlainObject(obj)) return null;
  const highestBid =
    getValueByKeyIncludes(obj, ['highest', 'bid']) ??
    toNumberMaybe(obj.highestBid) ??
    toNumberMaybe(obj.highest_bid) ??
    getValueByKeyIncludes(obj, ['bid']) ??
    null;
  const lowestAsk =
    getValueByKeyIncludes(obj, ['lowest', 'ask']) ??
    toNumberMaybe(obj.lowestAsk) ??
    toNumberMaybe(obj.lowest_ask) ??
    getValueByKeyIncludes(obj, ['ask']) ??
    null;
  const lastSale =
    getValueByKeyIncludes(obj, ['last', 'sale']) ??
    toNumberMaybe(obj.lastSale) ??
    toNumberMaybe(obj.last_sale) ??
    getValueByKeyIncludes(obj, ['sale']) ??
    null;
  const averagePrice =
    getValueByKeyIncludes(obj, ['average']) ??
    getValueByKeyIncludes(obj, ['avg']) ??
    toNumberMaybe(obj.averagePrice) ??
    toNumberMaybe(obj.average_price) ??
    toNumberMaybe(obj.avg) ??
    toNumberMaybe(obj.average) ??
    null;

  const fields = { highestBid, lowestAsk, lastSale, averagePrice };
  const nums = Object.values(fields).filter((n) => typeof n === 'number');
  const plausible = nums.filter((n) => isPlausibleUsd(n));
  if (plausible.length < 2) return null;

  // Score by how many plausible market fields we found.
  const score =
    (isPlausibleUsd(highestBid) ? 3 : 0) +
    (isPlausibleUsd(lowestAsk) ? 3 : 0) +
    (isPlausibleUsd(lastSale) ? 2 : 0) +
    (isPlausibleUsd(averagePrice) ? 1 : 0);

  return { fields, score };
}

function extractVariantMarketCandidateFromObject(obj) {
  if (!isPlainObject(obj)) return null;

  // Try to locate a size label on this object
  const sizeRaw =
    (typeof obj.size === 'string' && obj.size) ||
    (typeof obj.shoeSize === 'string' && obj.shoeSize) ||
    (typeof obj.localizedSize === 'string' && obj.localizedSize) ||
    (typeof obj.sizeLabel === 'string' && obj.sizeLabel) ||
    (typeof obj.displaySize === 'string' && obj.displaySize) ||
    '';
  const sizeKey = normalizeSizeKey(sizeRaw);
  if (!sizeKey) return null;

  // Market fields might be nested under "market" or "marketData"
  const marketObj =
    (isPlainObject(obj.market) && obj.market) ||
    (isPlainObject(obj.marketData) && obj.marketData) ||
    (isPlainObject(obj.market_data) && obj.market_data) ||
    null;

  const src = marketObj || obj;

  const highestBid =
    getValueByKeyIncludes(src, ['highest', 'bid']) ??
    getValueByKeyIncludes(src, ['bid']) ??
    null;
  const lowestAsk =
    getValueByKeyIncludes(src, ['lowest', 'ask']) ??
    getValueByKeyIncludes(src, ['ask']) ??
    null;
  const lastSale =
    getValueByKeyIncludes(src, ['last', 'sale']) ??
    getValueByKeyIncludes(src, ['sale']) ??
    null;

  const plausibleCount = [highestBid, lowestAsk, lastSale].filter((n) => isPlausibleUsd(n)).length;
  if (plausibleCount < 2) return null;

  const score =
    (isPlausibleUsd(highestBid) ? 3 : 0) +
    (isPlausibleUsd(lowestAsk) ? 3 : 0) +
    (isPlausibleUsd(lastSale) ? 1 : 0);

  return {
    sizeKey,
    fields: { highestBid, lowestAsk, lastSale },
    score
  };
}

function getVariantIdFromObject(obj) {
  try {
    if (!isPlainObject(obj)) return null;
    const candidates = [
      obj.variantId,
      obj.variant_id,
      obj.variantID,
      obj.id,
      obj.uuid,
      obj.uid
    ];
    for (const v of candidates) {
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    }
    return null;
  } catch {
    return null;
  }
}

function extractVariantMarketFromNextDataByJoin(size) {
  try {
    const wanted = normalizeSizeKey(size);
    if (!wanted) return null;
    const next = getNextData();
    if (!next) return null;
    const roots = getNextDataSearchRoots(next);

    const variantIdToSize = new Map();
    const marketByVariantId = new Map();

    deepWalk(roots, (v) => {
      if (!isPlainObject(v)) return;

      const variantId = getVariantIdFromObject(v);
      if (!variantId) return;

      // Capture size mapping where present
      const sizeRaw =
        (typeof v.size === 'string' && v.size) ||
        (typeof v.shoeSize === 'string' && v.shoeSize) ||
        (typeof v.localizedSize === 'string' && v.localizedSize) ||
        (typeof v.sizeLabel === 'string' && v.sizeLabel) ||
        (typeof v.displaySize === 'string' && v.displaySize) ||
        (typeof v.size === 'number' ? String(v.size) : '') ||
        '';
      const sizeKey = normalizeSizeKey(sizeRaw);
      if (sizeKey) {
        // Only set if absent to avoid flapping; keys should be stable.
        if (!variantIdToSize.has(variantId)) variantIdToSize.set(variantId, sizeKey);
      }

      // Capture market candidate if it looks like one
      const cand = extractMarketCandidateFromObject(v);
      if (cand && cand.fields) {
        // Prefer higher score for same variantId
        const existing = marketByVariantId.get(variantId);
        if (!existing || (cand.score || 0) > (existing.score || 0)) {
          marketByVariantId.set(variantId, { ...cand, variantId });
        }
      }
    }, 220000);

    // Pick best market for the wanted size via join
    let best = null;
    let bestScore = 0;
    for (const [variantId, sizeKey] of variantIdToSize.entries()) {
      if (!sizeKeyMatches(sizeKey, wanted)) continue;
      const m = marketByVariantId.get(variantId);
      if (!m) continue;
      if ((m.score || 0) > bestScore) {
        bestScore = m.score || 0;
        best = m;
      }
    }

    if (!best) return null;
    const { highestBid, lowestAsk, lastSale, averagePrice } = best.fields || {};

    return {
      highestBid: highestBid ?? '—',
      lowestAsk: lowestAsk ?? '—',
      lastSale: lastSale ?? '—',
      averagePrice: averagePrice ?? (lastSale ?? '—'),
      scrapedFromPage: true,
      source: 'next_data_join',
      size: wanted
    };
  } catch {
    return null;
  }
}

function extractVariantBidAskFromNextDataAll() {
  // Background tabs often fail to render Market Data Bids/Asks (virtualized + throttled).
  // This fallback extracts per-variant market values from __NEXT_DATA__ without opening the modal.
  try {
    const next = getNextData();
    if (!next) return { asks: [], bids: [], debug: { ok: false, reason: 'no_next_data' } };
    const roots = getNextDataSearchRoots(next);

    // We intentionally do NOT require a full "market candidate" (which expects multiple fields).
    // For bids/asks we accept whichever side is present, per size.
    const bestBidBySizeKey = new Map(); // sizeKey -> { sizeLabel, bid }
    const bestAskBySizeKey = new Map(); // sizeKey -> { sizeLabel, ask }
    let seenSizeObjects = 0;
    let seenBid = 0;
    let seenAsk = 0;

    deepWalk(roots, (v) => {
      try {
        if (!isPlainObject(v)) return;

        const sizeRaw =
          (typeof v.size === 'string' && v.size) ||
          (typeof v.shoeSize === 'string' && v.shoeSize) ||
          (typeof v.localizedSize === 'string' && v.localizedSize) ||
          (typeof v.sizeLabel === 'string' && v.sizeLabel) ||
          (typeof v.displaySize === 'string' && v.displaySize) ||
          (typeof v.size === 'number' ? String(v.size) : '') ||
          '';
        if (!sizeRaw) return;
        const sizeKey = normalizeSizeKey(sizeRaw);
        if (!sizeKey) return;
        const sizeLabel = String(sizeRaw).replace(/\s+/g, ' ').trim() || sizeKey;
        seenSizeObjects += 1;

        const marketObj =
          (isPlainObject(v.market) && v.market) ||
          (isPlainObject(v.marketData) && v.marketData) ||
          (isPlainObject(v.market_data) && v.market_data) ||
          v;

        const hb =
          getValueByKeyIncludes(marketObj, ['highest', 'bid']) ??
          getValueByKeyIncludes(marketObj, ['highestbid']) ??
          getValueByKeyIncludes(marketObj, ['bid']) ??
          null;
        const la =
          getValueByKeyIncludes(marketObj, ['lowest', 'ask']) ??
          getValueByKeyIncludes(marketObj, ['lowestask']) ??
          getValueByKeyIncludes(marketObj, ['ask']) ??
          null;

        const hbNum = toNumberMaybe(hb);
        const laNum = toNumberMaybe(la);

        if (isPlausibleUsd(hbNum)) {
          seenBid += 1;
          const cur = bestBidBySizeKey.get(sizeKey);
          if (!cur || hbNum > Number(cur.bid || 0)) bestBidBySizeKey.set(sizeKey, { sizeLabel, bid: hbNum });
        }
        if (isPlausibleUsd(laNum)) {
          seenAsk += 1;
          const cur = bestAskBySizeKey.get(sizeKey);
          if (!cur || laNum < Number(cur.ask || Infinity)) bestAskBySizeKey.set(sizeKey, { sizeLabel, ask: laNum });
        }
      } catch {}
    }, 220000);

    const bids = Array.from(bestBidBySizeKey.values()).map((x) => ({ size: x.sizeLabel, bid: x.bid, raw: 'next_data' }));
    const asks = Array.from(bestAskBySizeKey.values()).map((x) => ({ size: x.sizeLabel, ask: x.ask, raw: 'next_data' }));

    return {
      bids,
      asks,
      debug: {
        ok: true,
        seenSizeObjects,
        seenBid,
        seenAsk,
        bids: bids.length,
        asks: asks.length
      }
    };
  } catch (e) {
    return { asks: [], bids: [], debug: { ok: false, reason: e?.message || String(e) } };
  }
}

function extractVariantMarketFromNextDataForSize(size) {
  try {
    const wanted = normalizeSizeKey(size);
    if (!wanted) return null;
    const next = getNextData();
    if (!next) return null;
    const roots = getNextDataSearchRoots(next);

    // First try: join size mapping ↔ market mapping (more common on StockX)
    const joined = extractVariantMarketFromNextDataByJoin(wanted);
    if (joined) return joined;

    let best = null;
    let bestScore = 0;
    deepWalk(roots, (v) => {
      const cand = extractVariantMarketCandidateFromObject(v);
      if (!cand) return;
      if (!sizeKeyMatches(cand.sizeKey, wanted)) return;
      if (cand.score > bestScore) {
        bestScore = cand.score;
        best = cand;
      }
    });
    if (!best) return null;

    return {
      highestBid: best.fields.highestBid ?? '—',
      lowestAsk: best.fields.lowestAsk ?? '—',
      lastSale: best.fields.lastSale ?? '—',
      averagePrice: best.fields.lastSale ?? '—',
      scrapedFromPage: true,
      source: 'next_data_variant',
      size: wanted
    };
  } catch {
    return null;
  }
}

function extractMarketDataFromNextData() {
  try {
    const next = getNextData();
    if (!next) return null;
    const roots = getNextDataSearchRoots(next);

    // Prefer size-specific market data when URL includes ?size=...
    const selectedSize = getSelectedSizeFromUrl();
    if (selectedSize) {
      const variant = extractVariantMarketFromNextDataForSize(selectedSize);
      if (variant) return variant;
    }

    let best = null;
    let bestScore = 0;
    deepWalk(roots, (v) => {
      const cand = extractMarketCandidateFromObject(v);
      if (!cand) return;
      if (cand.score > bestScore) {
        bestScore = cand.score;
        best = cand;
      }
    });
    if (!best) return null;

    const { highestBid, lowestAsk, lastSale, averagePrice } = best.fields;

    return {
      averagePrice: averagePrice ?? (lastSale ?? '—'),
      lastSale: lastSale ?? '—',
      highestBid: highestBid ?? '—',
      lowestAsk: lowestAsk ?? '—',
      scrapedFromPage: true,
      source: 'next_data'
    };
  } catch {
    return null;
  }
}

function extractRecentSalesFromDom(max = 8) {
  try {
    // Prefer scoping to a section that mentions "Sales" or "Activity"
    const headings = Array.from(document.querySelectorAll('h2,h3,[role="heading"]'));
    const salesHeading = headings.find((h) => /recent\s+sales|sales|activity/i.test(safeText(h)));

    const scope = salesHeading?.closest('section,div') || document.body;
    // Prefer table rows when present (most accurate)
    const tableRows = Array.from(scope.querySelectorAll('tr')).slice(0, 200);
    const rows = tableRows.length ? tableRows : Array.from(scope.querySelectorAll('[role="row"],li,div')).slice(0, 400);

    const out = [];
    for (const row of rows) {
      // If it's a TR, try to parse by cells first.
      let txt = safeText(row);
      let sizeFromCells = '';
      let priceFromCells = null;
      let dateFromCells = null;

      try {
        if (row.tagName === 'TR') {
          const cells = Array.from(row.querySelectorAll('td,th')).map((c) => safeText(c)).filter(Boolean);
          if (cells.length) {
            // Price: first cell that has $
            const priceCell = cells.find((c) => /\$/.test(c));
            priceFromCells = priceCell ? parsePriceFromText(priceCell) : null;
            // Date: first parseable date/relative
            const dateCell = cells.find((c) => parseDateFromText(c));
            dateFromCells = dateCell ? parseDateFromText(dateCell) : null;
            // Size: first cell that looks like a size, excluding price/date cells
            const candidates = cells.filter((c) => c !== priceCell && c !== dateCell);
            const sizeCell = candidates.find((c) => parseSizeFromText(c));
            sizeFromCells = sizeCell ? (parseSizeFromText(sizeCell) || '') : '';
            txt = cells.join(' ');
          }
        }
      } catch {}

      if (!txt || txt.length < 6) continue;
      if (!/\$/.test(txt)) continue;

      const price = priceFromCells ?? parsePriceFromText(txt);
      if (!price) continue;
      // Avoid bogus $1/$0 rows from unrelated widgets
      if (price < 20 || price > 20000) continue;

      const size = sizeFromCells || parseSizeFromText(txt);
      const date = dateFromCells || parseDateFromText(txt);

      // Require a date/relative-time; otherwise we pick up tons of unrelated "$" UI.
      if (!date) continue;

      out.push({
        price,
        size: size || '',
        date: date ? date.toISOString().slice(0, 10) : '',
        raw: txt
      });
      if (out.length >= max) break;
    }

    // De-dupe by (price,size,date) to avoid repeated layout nodes
    const seen = new Set();
    const deduped = [];
    for (const s of out) {
      const key = `${s.price}::${s.size}::${s.date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(s);
    }
    return deduped;
  } catch (e) {
    console.warn('⚠️ extractRecentSalesFromDom failed:', e);
    return [];
  }
}

function parseMarketDataSalesTable(max = 25) {
  try {
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

    const findSalesMarketDialogRoots = () => {
      try {
        // Prefer a visible dialog where the Sales tab is selected
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]'));
        const scored = dialogs
          .map((d) => {
            const selectedTab = d.querySelector?.('[role="tab"][aria-selected="true"]');
            const tabText = safeText(selectedTab).toLowerCase();
            let score = 0;
            if (tabText === 'sales') score += 4;
            const t = safeText(d).toLowerCase();
            if (t.includes('all sales')) score += 2;
            if (t.includes('sale price')) score += 1;
            if (t.includes('date')) score += 1;
            // Some categories (collectibles/accessories) don't have a size column.
            if (t.includes('size')) score += 1;
            if (isVisibleEl(d)) score += 1;
            return { d, score };
          })
          .filter((x) => x.score >= 4)
          .sort((a, b) => b.score - a.score);

        if (scored[0]?.d) return [scored[0].d];

        // Fall back to any market-activity component in the document
        const vma = Array.from(document.querySelectorAll('[data-component="ViewMarketActivity"]'));
        if (vma.length) return vma;

        // Last resort: any element with the view label StockX uses
        const aria = Array.from(document.querySelectorAll('[aria-label]')).filter((el) => {
          const a = String(el.getAttribute('aria-label') || '').toLowerCase();
          return a.includes('sale price') && a.includes('date') && a.includes('size');
        });
        if (aria.length) return aria;

        return [];
      } catch {
        return [];
      }
    };

    const parseRowCells = (tds) => {
      try {
        const cells = Array.from(tds || []);
        if (cells.length < 3) return null;

        // Skip Xpress Ship rows
        if (cells.some((c) => c.querySelector?.('[data-testid="XpressShipTooltipIcon"]'))) return null;

        // Find date cell
        const dateCell = cells.find((td) => parseDateFromText(safeText(td)));
        const priceCell = cells.find((td) => /\$/.test(safeText(td)) && isPlausibleUsd(parsePriceFromText(safeText(td))));
        const sizeCell = cells.find((td) => /US\b/i.test(safeText(td)) || !!parseSizeFromText(safeText(td)));

        const dateText = safeText(dateCell);
        const sizeText = safeText(sizeCell);
        const priceText = safeText(priceCell);

        const dt = parseDateFromText(dateText);
        const price = parsePriceFromText(priceText);
        if (!dt || !isPlausibleUsd(price)) return null;

        return {
          price,
          size: sizeText || '',
          date: dt.toISOString().slice(0, 10),
          raw: `${dateText}\t${sizeText}\t${priceText}`
        };
      } catch {
        return null;
      }
    };

    // Fast path: directly parse StockX's ViewMarketActivity sales table rows.
    // Your snippet: <div data-component="ViewMarketActivity" ...><table>...<tbody><tr>...</tr></tbody></table></div>
    const rootCandidates = findSalesMarketDialogRoots();
    for (const root of rootCandidates) {
      const vmaRows = Array.from(root.querySelectorAll?.('[data-component="ViewMarketActivity"] tbody tr') || []);
      const directRows = vmaRows.length ? vmaRows : Array.from(root.querySelectorAll?.('tbody tr') || []);
      if (!directRows.length) continue;

      const out = [];
      for (const tr of directRows) {
        const tds = tr.querySelectorAll('td,th');
        const parsed = parseRowCells(tds);
        if (!parsed) continue;
        out.push(parsed);
        if (out.length >= max) break;
      }
      if (out.length) return out;
    }

    const roots = (() => {
      // Best: StockX market activity component (your snippet)
      const viewMarketActivityAll = Array.from(document.querySelectorAll('[data-component="ViewMarketActivity"]'));
      const viewMarketActivityVisible = viewMarketActivityAll.filter(isVisibleEl);
      if (viewMarketActivityVisible.length) return viewMarketActivityVisible;
      if (viewMarketActivityAll.length) return viewMarketActivityAll;

      // Next: a visible dialog that includes the sales headers
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]')).filter(isVisibleEl);
      const bestDialog = dialogs.find((d) => {
        const t = safeText(d);
        return /sale\s*price/i.test(t) && /\bdate\b/i.test(t) && /\bsize\b/i.test(t);
      });
      if (bestDialog) return [bestDialog];
      if (dialogs.length) return dialogs;

      // Fallback: the whole document
      return [document];
    })();

    const parseTable = (table) => {
      const headerText = safeText(table.querySelector('thead') || table);
      // Size column is optional for non-sized items.
      if (!/sale\s*price/i.test(headerText) || !/\bdate\b/i.test(headerText)) return [];
      // Map column indices by header labels (StockX sometimes has an extra first icon column)
      const ths = Array.from(table.querySelectorAll('thead th'));
      const colIndex = { date: -1, size: -1, price: -1 };
      ths.forEach((th, idx) => {
        const t = safeText(th).toLowerCase();
        if (!t) return;
        if (t === 'date') colIndex.date = idx;
        else if (t === 'size') colIndex.size = idx;
        else if (t.replace(/\s+/g, ' ') === 'sale price') colIndex.price = idx;
      });
      const rows = Array.from(table.querySelectorAll('tbody tr'));
      const out = [];
      for (const tr of rows) {
        // Exclude Xpress Ship rows (they include a tooltip icon in the first column).
        // Example: <svg data-testid="XpressShipTooltipIcon" ...>
        if (tr.querySelector?.('[data-testid="XpressShipTooltipIcon"]')) continue;

        const tds = Array.from(tr.querySelectorAll('td,th'));
        if (tds.length < 3) continue;
        // Fallback if headers weren't detected (older markup): assume last 3 are date/size/price
        // If "Size" column doesn't exist, assume last 2 are date/price.
        const dateIdx =
          colIndex.date !== -1 ? colIndex.date : colIndex.size === -1 ? Math.max(0, tds.length - 2) : Math.max(0, tds.length - 3);
        const sizeIdx = colIndex.size !== -1 ? colIndex.size : -1;
        const priceIdx = colIndex.price !== -1 ? colIndex.price : Math.max(0, tds.length - 1);

        // First try the mapped indices, then fall back to per-row detection.
        const quick = parseRowCells([tds[dateIdx], sizeIdx >= 0 ? tds[sizeIdx] : null, tds[priceIdx]].filter(Boolean));
        const parsed = quick || parseRowCells(tds);
        if (!parsed) continue;
        out.push(parsed);
        if (out.length >= max) break;
      }
      return out;
    };

    const parseGenericRows = (root) => {
      // Generic fallback: scan visible row-like elements within a root that contains the sales headers.
      const rootText = safeText(root);
      if (!/sale\s*price/i.test(rootText) || !/\bdate\b/i.test(rootText)) return [];

      const candidates = Array.from(root.querySelectorAll('tr,[role="row"],li,div')).slice(0, 2500);
      const out = [];
      for (const el of candidates) {
        if (!isVisibleEl(el)) continue;
        // Skip Xpress Ship rows
        if (el.querySelector?.('[data-testid="XpressShipTooltipIcon"]')) continue;
        const txt = safeText(el);
        if (!txt || txt.length > 140) continue;
        if (!/\$/.test(txt)) continue;
        const dt = parseDateFromText(txt);
        if (!dt) continue;
        const price = parsePriceFromText(txt);
        if (!isPlausibleUsd(price)) continue;
        const size = parseSizeFromText(txt) || '';
        out.push({
          price,
          size,
          date: dt.toISOString().slice(0, 10),
          raw: txt
        });
        if (out.length >= max) break;
      }
      return out;
    };

    for (const root of roots) {
      // 1) Prefer explicit tables
      const tables = Array.from(root.querySelectorAll('table'));
      for (const table of tables) {
        const out = parseTable(table);
        if (out.length) return out;
      }
      // 2) Generic row scan inside the same root
      const generic = parseGenericRows(root);
      if (generic.length) return generic;
    }

    return [];
  } catch {
    return [];
  }
}

function parseMarketDataAsksTable(max = 100, opts = {}) {
  try {
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

    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]')).filter(isVisibleEl);
    const dialog = getMarketDataDialog() || dialogs[0] || null;

    const panel = (() => {
      try {
        // If caller provided an explicit root panel, trust it.
        if (opts?.root && typeof opts.root.querySelector === 'function') return opts.root;
        if (!dialog) return null;

        // Prefer the panel for the expected tab label (avoids selection lag).
        const expected = String(opts?.expectedTabLabel || '').trim().toLowerCase();
        const tabForExpected = expected ? findTabButtonByLabel(dialog, expected) : null;
        const ctlFromExpected = tabForExpected?.getAttribute?.('aria-controls') || '';
        if (ctlFromExpected) {
          const el = document.getElementById(ctlFromExpected);
          if (el) return el;
        }

        // Fall back to the selected tab's panel.
        const selected = dialog.querySelector?.('[role="tab"][aria-selected="true"]') || null;
        const ctl = selected?.getAttribute?.('aria-controls') || '';
        if (ctl) {
          const el = document.getElementById(ctl);
          if (el) return el;
        }
        const panels = Array.from(dialog.querySelectorAll?.('[role="tabpanel"]') || []);
        const vis = panels.find(isVisibleEl);
        return vis || null;
      } catch {
        return null;
      }
    })();

    // IMPORTANT: StockX sometimes lags aria-selected / aria-controls updates.
    // If we scope too narrowly to the "panel", we can miss the actual table even when it's rendered.
    // So try panel first, then dialog, then other visible dialogs, then document.
    const roots = (() => {
      const list = [];
      const push = (x) => {
        try {
          if (!x) return;
          if (list.includes(x)) return;
          list.push(x);
        } catch {}
      };
      push(opts?.root);
      push(panel);
      push(dialog);
      for (const d of dialogs) push(d);
      push(document);
      return list;
    })();
    let table = null;
    for (const root of roots) {
      const vma = root.querySelector?.('[data-component="ViewMarketActivity"]') || root;
      const t = vma?.querySelector?.('table') || null;
      if (!t) continue;
      const headerText = safeText(t.querySelector('thead') || t).toLowerCase();
      // Some pages show "Ask Price" + "Quantity" + "Size"
      const ok = headerText.includes('ask') && (headerText.includes('size') || headerText.includes('quantity'));
      if (ok) {
        table = t;
        break;
      }
    }
    const parseGeneric = (root) => {
      try {
        // Virtualized / div-based UI fallback inside the Market Data modal.
        const candidates = Array.from(root.querySelectorAll('tr,[role="row"],li,div')).slice(0, 4000);
        const out = [];
        for (const el of candidates) {
          const txt = safeText(el);
          if (!txt || txt.length > 260) continue;
          // StockX sometimes renders prices without a "$" glyph (or not in the same text node),
          // so rely on numeric parsing + plausibility instead of requiring "$".
          if (!/\d/.test(txt)) continue;
          const price = parseBestUsdFromText(txt);
          if (!isPlausibleUsd(price)) continue;
          // Some categories have no size column; treat as "ONE SIZE".
          const size = parseSizeFromText(txt) || 'ONE SIZE';
          out.push({ size, ask: price, raw: txt });
          if (out.length >= max) break;
        }
        return out;
      } catch {
        return [];
      }
    };

    if (!table) {
      // Virtualized / div-based fallback
      for (const root of roots) {
        const generic = parseGeneric(root);
        if (generic.length) return generic;
      }
      return [];
    }

    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const out = [];
    for (const tr of rows) {
      const tds = Array.from(tr.querySelectorAll('td,th'));
      if (tds.length < 2) continue;
      const txt = safeText(tr);
      if (!txt) continue;
      // Prefer the best plausible USD in the row (avoids Quantity being misread as price).
      const price = parseBestUsdFromText(txt);
      if (!isPlausibleUsd(price)) continue;
      // Prefer a strict size cell (US/UK/EU/etc). Do NOT accept a bare number from Quantity.
      const cell =
        tds.find((td) => /\b(?:US|UK|EU)\b/i.test(safeText(td))) ||
        tds.find((td) => !!parseSizeFromTextStrict(safeText(td))) ||
        null;
      const size = parseSizeFromTextStrict(safeText(cell || '')) || parseSizeFromTextStrict(txt) || 'ONE SIZE';
      out.push({ size, ask: price, raw: txt });
      if (out.length >= max) break;
    }
    return out;
  } catch {
    return [];
  }
}

function parseMarketDataBidsTable(max = 100, opts = {}) {
  try {
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

    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]')).filter(isVisibleEl);
    const dialog = getMarketDataDialog() || dialogs[0] || null;
    const panel = (() => {
      try {
        // If caller provided an explicit root panel, trust it.
        if (opts?.root && typeof opts.root.querySelector === 'function') return opts.root;
        if (!dialog) return null;

        // Prefer the panel for the expected tab label (avoids selection lag).
        const expected = String(opts?.expectedTabLabel || '').trim().toLowerCase();
        const tabForExpected = expected ? findTabButtonByLabel(dialog, expected) : null;
        const ctlFromExpected = tabForExpected?.getAttribute?.('aria-controls') || '';
        if (ctlFromExpected) {
          const el = document.getElementById(ctlFromExpected);
          if (el) return el;
        }

        // Fall back to the selected tab's panel.
        const selected = dialog.querySelector?.('[role="tab"][aria-selected="true"]') || null;
        const ctl = selected?.getAttribute?.('aria-controls') || '';
        if (ctl) {
          const el = document.getElementById(ctl);
          if (el) return el;
        }
        const panels = Array.from(dialog.querySelectorAll?.('[role="tabpanel"]') || []);
        const vis = panels.find(isVisibleEl);
        return vis || null;
      } catch {
        return null;
      }
    })();

    const roots = (() => {
      const list = [];
      const push = (x) => {
        try {
          if (!x) return;
          if (list.includes(x)) return;
          list.push(x);
        } catch {}
      };
      push(opts?.root);
      push(panel);
      push(dialog);
      for (const d of dialogs) push(d);
      push(document);
      return list;
    })();
    let table = null;
    for (const root of roots) {
      const vma = root.querySelector?.('[data-component="ViewMarketActivity"]') || root;
      const t = vma?.querySelector?.('table') || null;
      if (!t) continue;
      const headerText = safeText(t.querySelector('thead') || t).toLowerCase();
      const ok = headerText.includes('bid') && (headerText.includes('size') || headerText.includes('quantity'));
      if (ok) {
        table = t;
        break;
      }
    }
    const parseGeneric = (root) => {
      try {
        // Virtualized / div-based UI fallback inside the Market Data modal.
        const candidates = Array.from(root.querySelectorAll('tr,[role="row"],li,div')).slice(0, 4000);
        const out = [];
        for (const el of candidates) {
          const txt = safeText(el);
          if (!txt || txt.length > 260) continue;
          if (!/\d/.test(txt)) continue;
          const price = parseBestUsdFromText(txt);
          if (!isPlausibleUsd(price)) continue;
          const size = parseSizeFromText(txt) || 'ONE SIZE';
          out.push({ size, bid: price, raw: txt });
          if (out.length >= max) break;
        }
        return out;
      } catch {
        return [];
      }
    };

    if (!table) {
      // Virtualized / div-based fallback
      for (const root of roots) {
        const generic = parseGeneric(root);
        if (generic.length) return generic;
      }
      return [];
    }

    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const out = [];
    for (const tr of rows) {
      const tds = Array.from(tr.querySelectorAll('td,th'));
      if (tds.length < 2) continue;
      const txt = safeText(tr);
      if (!txt) continue;
      const price = parseBestUsdFromText(txt);
      if (!isPlausibleUsd(price)) continue;
      const cell =
        tds.find((td) => /\b(?:US|UK|EU)\b/i.test(safeText(td))) ||
        tds.find((td) => !!parseSizeFromTextStrict(safeText(td))) ||
        null;
      const size = parseSizeFromTextStrict(safeText(cell || '')) || parseSizeFromTextStrict(txt) || 'ONE SIZE';
      out.push({ size, bid: price, raw: txt });
      if (out.length >= max) break;
    }
    return out;
  } catch {
    return [];
  }
}

function hasRealRecentSalesRows(recentSales) {
  try {
    if (!Array.isArray(recentSales) || recentSales.length === 0) return false;
    return recentSales.some((s) => !!String(s?.date || '').match(/^\d{4}-\d{2}-\d{2}$/));
  } catch {
    return false;
  }
}

function maybeOpenMarketDataOnce() {
  try {
    const key = `marketDataOpen::${getProductSlugFromUrl() || location.pathname}::${getSelectedSizeBestEffort()}`;
    const now = Date.now();
    const last = window.__stockxMarketDataOpenAttempt?.[key] || 0;
    // throttle to at most once per 15s per size
    if (now - last < 15000) return;
    if (!window.__stockxMarketDataOpenAttempt) window.__stockxMarketDataOpenAttempt = {};
    window.__stockxMarketDataOpenAttempt[key] = now;

    // If a market data dialog is already open, do nothing.
    const hasDialog = !!document.querySelector('[role="dialog"], [aria-modal="true"]');
    if (hasDialog) return;

    // Find and click "View Market Data"
    const btn = findButtonByText(/view\s+market\s+data/i);
    if (btn) {
      btn.click();
      return;
    }
  } catch {}
}

async function openMarketDataDialogBestEffort(timeoutMs = 14000, opts = {}) {
  try {
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

    const hasMarketTabs = (root) => {
      try {
        const scope = root || document;
        const tabs = Array.from(scope.querySelectorAll('[role="tab"]'));
        const labels = tabs.map((t) => safeText(t).trim().toLowerCase()).filter(Boolean);
        return labels.includes('asks') || labels.includes('bids') || labels.includes('sales');
      } catch {
        return false;
      }
    };

    const looksLikeMarketDialog = (d) => {
      try {
        if (!d) return false;
        if (hasMarketTabs(d)) return true;
        if (d.querySelector?.('[data-component="ViewMarketActivity"]')) return true;
        const t = safeText(d).toLowerCase();
        if (t.includes('sale price') && t.includes('size') && t.includes('date')) return true;
        return false;
      } catch {
        return false;
      }
    };

    const closeInterferingDialogsBestEffort = () => {
      try {
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]')).filter(isVisibleEl);
        for (const d of dialogs) {
          if (looksLikeMarketDialog(d)) continue;
          const txt = safeText(d).toLowerCase();
          // Common app prompts: "Open ___ App", "Get the app", etc.
          const likelyAppPrompt =
            txt.includes('open') && txt.includes('app') ||
            txt.includes('get the app') ||
            txt.includes('continue in app');

          // Try explicit close buttons first
          const closeBtn =
            d.querySelector?.('button[aria-label="Close"]') ||
            d.querySelector?.('[data-testid*="close" i]') ||
            null;
          if (closeBtn) {
            clickElBestEffort(closeBtn);
            continue;
          }

          // Then try common dismiss actions
          const dismiss = Array.from(d.querySelectorAll('button,a,[role="button"]')).find((el) => {
            const t = safeText(el).trim().toLowerCase();
            return (
              t === 'not now' ||
              t === 'no thanks' ||
              t === 'dismiss' ||
              t === 'close' ||
              t === 'cancel' ||
              t.includes('continue in browser') ||
              t.includes('stay on') ||
              t.includes('use web')
            );
          });
          if (dismiss) {
            clickElBestEffort(dismiss);
            continue;
          }

          // As a last resort, try Escape (works for many lightweight modals)
          try {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
            document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true, cancelable: true }));
          } catch {}

          // If it looks like an app prompt, we already tried our best; do not click random things.
          if (likelyAppPrompt) continue;
        }
      } catch {}
    };

    const isMarketDataActuallyOpen = () => {
      try {
        const dialog = document.querySelector('[role="dialog"], [aria-modal="true"]');
        if (dialog) {
          const tabs = Array.from(dialog.querySelectorAll('[role="tab"]')).map((t) => safeText(t).trim().toLowerCase());
          const hasTabs = tabs.includes('asks') || tabs.includes('bids') || tabs.includes('sales');
          const hasRows = (dialog.querySelectorAll?.('[data-component="ViewMarketActivity"] tbody tr')?.length || 0) > 0;
          if (hasTabs || hasRows) return dialog;
        }
      } catch {}
      try {
        const vma = document.querySelector('[data-component="ViewMarketActivity"]');
        if (!vma) return null;
        // Only treat as open if visible and has market-like structure.
        const r = vma.getClientRects?.();
        const visible = r && r.length > 0;
        const rows = vma.querySelectorAll?.('tbody tr')?.length || 0;
        const tabs = Array.from(document.querySelectorAll('[role="tab"]')).map((t) => safeText(t).trim().toLowerCase());
        const hasTabs = tabs.includes('asks') || tabs.includes('bids') || tabs.includes('sales');
        if (visible && (rows > 0 || hasTabs)) return vma;
      } catch {}
      return null;
    };

    // If a dialog is already open, only treat it as Market Data if it *actually* looks like Market Data.
    // StockX often shows other dialogs (cookie consent, login prompts, app prompts, etc.) that would break tab parsing.
    closeInterferingDialogsBestEffort();
    const alreadyOpen = isMarketDataActuallyOpen();
    if (alreadyOpen) {
      try {
        if (opts?.debug) {
          opts.debug.opened = true;
          opts.debug.openedVia = 'already_open_market';
        }
      } catch {}
      return alreadyOpen;
    }

    const dialogExisting = document.querySelector('[role="dialog"], [aria-modal="true"]');
    if (dialogExisting) {
      // Best-effort close of unrelated dialogs so the "View Market Data" CTA is clickable.
      try {
        const closeBtn = dialogExisting.querySelector?.('button[aria-label="Close"]') || null;
        if (closeBtn) clickElBestEffort(closeBtn);
      } catch {}
      try {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true, cancelable: true }));
      } catch {}
      // Continue; do NOT treat this dialog as Market Data.
    }

    // IMPORTANT: Some pages include a ViewMarketActivity node even when the modal isn't open yet.
    // Only treat it as "already open" if it's visible AND looks like the actual Market Data UI.
    const vmaExisting = document.querySelector('[data-component="ViewMarketActivity"]');
    if (vmaExisting && isVisibleEl(vmaExisting)) {
      const rows = vmaExisting.querySelectorAll?.('tbody tr')?.length || 0;
      if (rows > 0 || hasMarketTabs(document)) {
        try {
          if (opts?.debug) {
            opts.debug.opened = true;
            opts.debug.openedVia = 'already_open_vma';
          }
        } catch {}
        return vmaExisting;
      }
    }

    const isSizePanelOpen = () => {
      try {
        const t = String(document.body?.innerText || '');
        // The grid variant uses this heading.
        if (t.includes('Size and Conversions')) return true;
      } catch {}
      try {
        const trigger = document.querySelector('#menu-button-pdp-size-selector');
        const expanded = String(trigger?.getAttribute?.('aria-expanded') || '') === 'true';
        if (expanded) return true;
      } catch {}
      return false;
    };

    const closeAnyOpenMenus = () => {
      try {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true, cancelable: true }));
      } catch {}
      // If the size selector grid is open, Escape sometimes won't close it; click the trigger to collapse.
      try {
        if (isSizePanelOpen()) {
          const trigger = document.querySelector('#menu-button-pdp-size-selector');
          if (trigger) clickElBestEffort(trigger);
        }
      } catch {}
    };

    const findMarketDataTriggerBtn = () => {
      const textMatches = (t) => {
        const s = String(t || '').trim().toLowerCase();
        if (!s) return false;
        if (s === 'market data') return true;
        if (s === 'view market data') return true;
        if (s === 'view all market data') return true;
        return /(view\s+)?(all\s+)?market\s+data/.test(s);
      };

      const attrMatches = (el) => {
        try {
          const aria = String(el?.getAttribute?.('aria-label') || '').toLowerCase();
          const testid = String(el?.getAttribute?.('data-testid') || '').toLowerCase();
          if (aria.includes('market data')) return true;
          if (testid.includes('market') && testid.includes('data')) return true;
        } catch {}
        return false;
      };

      // Prefer StockX's Chakra button variant when present.
      try {
        const chakraButtons = Array.from(document.querySelectorAll('button.chakra-button'));
        const b1 = chakraButtons.find((el) => textMatches(safeText(el)));
        if (b1) return b1;
      } catch {}

      // Prefer within the trade box (near "Last Sale:") to avoid matching header/footer UI.
      try {
        const nodes = Array.from(document.querySelectorAll('div,section,p,span')).slice(0, 7000);
        const lastSaleNode = nodes.find((n) => /^last\s+sale\s*:/i.test(safeText(n)));
        const tradeBox = lastSaleNode?.closest('section,div') || null;
        if (tradeBox) {
          const btnInTradeBox = Array.from(tradeBox.querySelectorAll('button, a, [role="button"]')).find(
            (el) => textMatches(safeText(el)) || attrMatches(el)
          );
          if (btnInTradeBox) return btnInTradeBox;
        }
      } catch {}

      // Fallback: any button/a/role=button that looks like the trigger.
      try {
        const candidates = Array.from(document.querySelectorAll('button, a, [role="button"]'));
        const b2 = candidates.find((el) => textMatches(safeText(el)) || attrMatches(el));
        if (b2) return b2;
      } catch {}

      // Last fallback: regex match by visible text.
      return findButtonByText(/(view\s+)?(all\s+)?market\s+data/i);
    };

    const start = Date.now();
    let attempts = 0;
    while (Date.now() - start < timeoutMs) {
      attempts += 1;
      closeAnyOpenMenus();

      // If something else opened Market Data (race), stop early.
      const already = isMarketDataActuallyOpen();
      if (already) {
        try {
          if (opts?.debug) {
            opts.debug.opened = true;
            opts.debug.openedVia = 'already_open_detected';
          }
        } catch {}
        return already;
      }

      try {
        const btn = findMarketDataTriggerBtn();
        try {
          opts?.onAttempt?.(attempts, !!btn);
        } catch {}
        try {
          if (opts?.debug) {
            opts.debug.attempts = attempts;
            opts.debug.foundButton = !!btn;
            if (btn) {
              const r = btn.getBoundingClientRect?.();
              opts.debug.button = {
                tag: String(btn.tagName || ''),
                text: safeText(btn).slice(0, 120),
                href: String(btn.getAttribute?.('href') || ''),
                rect: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null
              };
            }
          }
        } catch {}
        if (btn) {
          // Temporarily disable our overlays so they can't steal the click.
          const overlays = [
            document.getElementById('stockx-global-stop-scan'),
            document.getElementById('stockx-ext-scan-status')
          ].filter(Boolean);
          const prevPe = overlays.map((el) => el.style.pointerEvents);
          try {
            overlays.forEach((el) => (el.style.pointerEvents = 'none'));
          } catch {}

          // Ensure the size panel isn't blocking the trade box before clicking.
          closeAnyOpenMenus();
          try {
            // More reliable than scrollIntoView alone when a sticky banner is present.
            const r = btn.getBoundingClientRect?.();
            if (r) window.scrollTo({ top: window.scrollY + r.top - window.innerHeight * 0.35, behavior: 'instant' });
            btn.scrollIntoView?.({ block: 'center', inline: 'center' });
          } catch {}
          try { btn.focus?.(); } catch {}
          try {
            if (opts?.debug && btn.getBoundingClientRect) {
              const r2 = btn.getBoundingClientRect();
              const cx = Math.round(r2.left + r2.width / 2);
              const cy = Math.round(r2.top + r2.height / 2);
              const topEl = document.elementFromPoint?.(cx, cy);
              opts.debug.elementFromPoint = {
                cx,
                cy,
                tag: String(topEl?.tagName || ''),
                text: safeText(topEl).slice(0, 80)
              };
              // If something is on top of the button, try clicking the closest matching button from that element.
              if (topEl && topEl !== btn && !btn.contains(topEl)) {
                const maybeBtn = topEl.closest?.('button,a,[role="button"]');
                if (maybeBtn && safeText(maybeBtn).trim().toLowerCase() === 'view market data') {
                  // Click the element that actually receives the pointer.
                  try { maybeBtn.focus?.(); } catch {}
                  try { maybeBtn.click?.(); } catch {}
                }
              }
            }
          } catch {}
          // Try a real mouse click sequence (some UIs ignore programmatic .click())
          try {
            // Pointer events first (more "realistic" in some UIs)
            try {
              btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
              btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window }));
            } catch {}
            btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
            btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            // Keyboard fallback
            try {
              btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
              btn.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true, cancelable: true }));
            } catch {}
          } catch {
            try { btn.click(); } catch {}
          }
          try {
            if (opts?.debug) opts.debug.clicked = true;
          } catch {}

          // Restore overlay pointer events
          try {
            overlays.forEach((el, i) => (el.style.pointerEvents = prevPe[i] || ''));
          } catch {}
        }
      } catch {}

      const dialog = await waitForElement(() => isMarketDataActuallyOpen(), 2500);
      if (dialog) {
        try {
          if (opts?.debug) {
            opts.debug.opened = true;
            opts.debug.openedVia = 'click';
          }
        } catch {}
        return dialog;
      }

      await new Promise((r) => setTimeout(r, 350));
    }
    try {
      if (opts?.debug) {
        opts.debug.opened = false;
        opts.debug.openedVia = 'timeout';
      }
    } catch {}
    return null;
  } catch {
    return null;
  }
}

function extractRecentSalesBestEffort(maxToParse = 200) {
  // Always try to open Market Data (throttled) so we can parse the real sales table.
  maybeOpenMarketDataOnce();

  // 1) Prefer the actual Market Data sales table when available
  const fromMarketTable = parseMarketDataSalesTable(Math.max(25, maxToParse));
  if (fromMarketTable && fromMarketTable.length) return fromMarketTable;

  // 2) If Next data has usable rows (rare on StockX), use it
  const fromNext = extractRecentSalesFromNextData(Math.min(50, maxToParse));
  if (fromNext && fromNext.length) return fromNext;

  // 3) Otherwise, return empty (avoid noisy DOM scrape that produces wrong "Sale $120" rows).
  return [];
}

function extractMarketDataBestEffort() {
  // 1) Embedded Next.js data (most reliable)
  const fromNext = extractMarketDataFromNextData();
  if (fromNext) return fromNext;
  // 2) Trade-box anchored DOM parse (best for size-specific values)
  const fromTradeBox = extractMarketDataFromTradeBoxUi();
  if (fromTradeBox) return fromTradeBox;
  // 3) Stable StockX testid-based parse (best when available)
  const fromTestIds = extractMarketDataFromDomTestIds();
  if (fromTestIds) return fromTestIds;
  // 4) CTA-based DOM parse (often size-specific: Buy $X / Bid $Y)
  const fromCtas = extractMarketDataFromDomCtas();
  if (fromCtas) return fromCtas;
  // 5) Label-based DOM parse (broad fallback; can be noisy)
  const fromLabels = extractMarketDataFromDomLabels();
  if (fromLabels) return fromLabels;
  // 6) Existing naive DOM button-scan
  const fromDom = scrapePricingData();
  if (fromDom) return { ...fromDom, source: 'dom_buttons' };
  return {
    averagePrice: '—',
    lastSale: '—',
    highestBid: '—',
    lowestAsk: '—',
    scrapedFromPage: false,
    source: 'fallback'
  };
}

function extractMarketDataFromTradeBoxUi() {
  try {
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

    const pickVisibleEl = (selector) => {
      const els = Array.from(document.querySelectorAll(selector));
      const vis = els.filter(isVisibleEl);
      return (vis.length ? vis : els)[0] || null;
    };

    // Anchor: the visible trade box card for the currently selected size.
    const buyAmountEl =
      pickVisibleEl('[data-testid="trade-box-buy-amount"]') ||
      pickVisibleEl('[data-testid*="trade-box"][data-testid*="buy"][data-testid*="amount"]');
    if (!buyAmountEl) return null;

    // Find a containing card around the trade box.
    const tradeBoxRoot =
      buyAmountEl.closest('[data-testid*="trade-box" i]') ||
      buyAmountEl.closest('section,div') ||
      buyAmountEl.parentElement ||
      document;

    const buyText = safeText(buyAmountEl);
    const lowestAsk = parsePriceFromText(buyText);

    // Try to parse "Sell Now for $X" + "Last Sale: $Y" near the trade box.
    const nearestTextMatchToEl = (re, anchorEl) => {
      try {
        const anchors = Array.from(document.querySelectorAll('p,div,span')).filter(isVisibleEl);
        const aRect = anchorEl?.getBoundingClientRect?.();
        if (!aRect) return null;
        let best = null;
        let bestDist = Infinity;
        for (const el of anchors) {
          const t = safeText(el);
          if (!t) continue;
          if (!re.test(t)) continue;
          const r = el.getBoundingClientRect();
          const dist = Math.abs(r.top - aRect.top) + Math.abs(r.left - aRect.left);
          if (dist < bestDist) {
            bestDist = dist;
            best = t;
          }
        }
        return best;
      } catch {
        return null;
      }
    };

    const sellNowText =
      nearestTextMatchToEl(/\bsell\s+now\s+for\s+\$/i, buyAmountEl) ||
      safeText(tradeBoxRoot).match(/\bsell\s+now\s+for\s+\$[^ ]+/i)?.[0] ||
      '';
    const mBid = String(sellNowText).match(/\bsell\s+now\s+for\s+\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)\b/i);
    const highestBid = mBid?.[1] ? Number(mBid[1].replace(/,/g, '')) : null;

    const lastSaleText =
      nearestTextMatchToEl(/\blast\s+sale\s*:\s*\$/i, buyAmountEl) ||
      safeText(tradeBoxRoot).match(/\blast\s+sale\s*:\s*\$[^ ]+/i)?.[0] ||
      '';
    const mLast = String(lastSaleText).match(/\blast\s+sale\s*:\s*\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)\b/i);
    const lastSale = mLast?.[1] ? Number(mLast[1].replace(/,/g, '')) : null;

    const okAsk = isPlausibleUsd(lowestAsk);
    const okBid = isPlausibleUsd(highestBid);
    const okLast = isPlausibleUsd(lastSale);
    if (!okAsk && !okBid && !okLast) return null;

    return {
      averagePrice: '—',
      lastSale: okLast ? lastSale : '—',
      highestBid: okBid ? highestBid : '—',
      lowestAsk: okAsk ? lowestAsk : '—',
      scrapedFromPage: true,
      source: 'trade_box'
    };
  } catch {
    return null;
  }
}

function extractMarketDataFromDomTestIds() {
  try {
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

    const collectPrices = (els) => {
      const out = [];
      for (const el of Array.from(els || [])) {
        const p = parsePriceFromText(safeText(el));
        if (isPlausibleUsd(p)) out.push(p);
      }
      return out;
    };

    // Try to scope to the active trade box by finding the "Sell Now for $X" element
    // and using its closest container as a search root. This helps avoid hidden/duplicate trade boxes.
    const findSellNowContainer = () => {
      const candidates = Array.from(document.querySelectorAll('p,div,span')).slice(0, 5000);
      const el = candidates
        .filter(isVisibleEl)
        .find((x) => /\bsell\s+now\s+for\s+\$/.test(safeText(x).toLowerCase()));
      if (!el) return null;
      return el.closest('section,div') || el.parentElement || null;
    };

    const root = findSellNowContainer() || document;

    // Known StockX "trade box" amounts
    // Example provided by user:
    //   <h2 data-testid="trade-box-buy-amount">$149</h2>
    const buyEls = [
      ...Array.from(root.querySelectorAll?.('[data-testid="trade-box-buy-amount"]') || []),
      ...Array.from(root.querySelectorAll?.('[data-testid*="trade-box"][data-testid*="buy"][data-testid*="amount"]') || [])
    ];
    const bidEls = [
      ...Array.from(root.querySelectorAll?.('[data-testid="trade-box-bid-amount"]') || []),
      ...Array.from(root.querySelectorAll?.('[data-testid="trade-box-sell-amount"]') || []), // sometimes "Sell" equals highest bid
      ...Array.from(root.querySelectorAll?.('[data-testid*="trade-box"][data-testid*="bid"][data-testid*="amount"]') || []),
      ...Array.from(root.querySelectorAll?.('[data-testid*="trade-box"][data-testid*="sell"][data-testid*="amount"]') || [])
    ];

    // Prefer visible elements (StockX often renders multiple hidden variants of the trade box)
    const buyVisible = buyEls.filter(isVisibleEl);
    const bidVisible = bidEls.filter(isVisibleEl);

    const buyPrices = collectPrices(buyVisible.length ? buyVisible : buyEls);
    const bidPrices = collectPrices(bidVisible.length ? bidVisible : bidEls);

    let lowestAsk = buyPrices.length ? Math.min(...buyPrices) : null;
    let highestBid = bidPrices.length ? Math.max(...bidPrices) : null;

    // Fallback: some pages don't expose bid as a dedicated element, but show it as:
    //   "Sell Now for $68 or Ask for More"
    // Parse that string anywhere on the page.
    let highestBidFromText = null;
    if (!isPlausibleUsd(highestBid)) {
      const allText = String(document.body?.innerText || '').replace(/\s+/g, ' ');
      const m = allText.match(/\bsell\s+now\s+for\s+\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)\b/i);
      if (m?.[1]) highestBidFromText = Number(m[1].replace(/,/g, ''));
    }

    // Fallback: parse "Buy Now for $X" text anywhere (sometimes easier than testids)
    let lowestAskFromText = null;
    if (!isPlausibleUsd(lowestAsk)) {
      const allText = String(document.body?.innerText || '').replace(/\s+/g, ' ');
      const m = allText.match(/\bbuy\s+now\s+(?:for\s+)?\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)\b/i);
      if (m?.[1]) lowestAskFromText = Number(m[1].replace(/,/g, ''));
    }

    const okAsk = isPlausibleUsd(lowestAsk) || isPlausibleUsd(lowestAskFromText);
    const okBid = isPlausibleUsd(highestBid) || isPlausibleUsd(highestBidFromText);
    if (!okAsk && !okBid) return null;

    return {
      averagePrice: '—',
      lastSale: '—',
      highestBid: isPlausibleUsd(highestBid) ? highestBid : isPlausibleUsd(highestBidFromText) ? highestBidFromText : '—',
      lowestAsk: isPlausibleUsd(lowestAsk) ? lowestAsk : isPlausibleUsd(lowestAskFromText) ? lowestAskFromText : '—',
      scrapedFromPage: true,
      source: 'dom_testid'
    };
  } catch {
    return null;
  }
}

function extractMarketDataFromDomCtas() {
  try {
    const nodes = Array.from(document.querySelectorAll('button,[role="button"],a')).slice(0, 800);
    const bidCandidates = [];
    const askCandidates = [];

    for (const el of nodes) {
      const t = safeText(el);
      if (!t) continue;
      if (!/\$/.test(t)) continue;

      const price = parsePriceFromText(t);
      if (!isPlausibleUsd(price)) continue;

      const tt = t.toLowerCase();
      const aria = String(el.getAttribute?.('aria-label') || '').toLowerCase();
      const dataTestId = String(el.getAttribute?.('data-testid') || '').toLowerCase();
      const hay = `${tt} ${aria} ${dataTestId}`;

      // Ask/Buy signals
      if (/\bbuy\b/.test(hay) || /buy\s+now/.test(hay) || /lowest\s+ask/.test(hay)) {
        askCandidates.push(price);
        continue;
      }
      // Bid signals
      if (/\bbid\b/.test(hay) || /place\s+bid/.test(hay) || /highest\s+bid/.test(hay)) {
        bidCandidates.push(price);
        continue;
      }
    }

    if (bidCandidates.length === 0 && askCandidates.length === 0) return null;

    const highestBid = bidCandidates.length ? Math.max(...bidCandidates) : null;
    const lowestAsk = askCandidates.length ? Math.min(...askCandidates) : null;

    const fields = [highestBid, lowestAsk].filter((n) => isPlausibleUsd(n));
    if (fields.length < 1) return null;

    return {
      averagePrice: '—',
      lastSale: '—',
      highestBid: highestBid ?? '—',
      lowestAsk: lowestAsk ?? '—',
      scrapedFromPage: true,
      source: 'dom_cta'
    };
  } catch {
    return null;
  }
}

function extractMarketDataFromDomLabels() {
  try {
    const getValueNearLabel = (labelRe) => {
      const candidates = Array.from(document.querySelectorAll('div,span,p,dt,dd')).slice(0, 3000);
      // Find best label match by shortest text content
      const labelEl = candidates
        .map((el) => ({ el, t: safeText(el) }))
        .filter((x) => x.t && x.t.length <= 40 && labelRe.test(x.t))
        .sort((a, b) => a.t.length - b.t.length)[0]?.el;
      if (!labelEl) return null;

      const scanEls = [];
      // Check next sibling and parent container
      if (labelEl.nextElementSibling) scanEls.push(labelEl.nextElementSibling);
      if (labelEl.parentElement) scanEls.push(labelEl.parentElement);
      if (labelEl.parentElement?.nextElementSibling) scanEls.push(labelEl.parentElement.nextElementSibling);
      // Check a slightly wider container (often label/value are in the same row wrapper)
      const row = labelEl.closest('[role="row"], tr, li, section, div');
      if (row) scanEls.push(row);

      for (const el of scanEls) {
        const txt = safeText(el);
        const n = parsePriceFromText(txt);
        if (isPlausibleUsd(n)) return n;
        // Sometimes value is in a nested span
        const nested = Array.from(el.querySelectorAll('span,div,p,dd')).map((e) => safeText(e));
        for (const t of nested) {
          const nn = parsePriceFromText(t);
          if (isPlausibleUsd(nn)) return nn;
        }
      }
      return null;
    };

    // IMPORTANT: only match the explicit "Highest Bid" / "Lowest Ask" labels.
    // StockX's "Pricing Options" tiles contain text like "Good Bid" / "Better Bid" and can
    // otherwise get misinterpreted as the label "Bid", causing wrong values (e.g. $179).
    const highestBid = getValueNearLabel(/highest\s+bid/i);
    const lowestAsk = getValueNearLabel(/lowest\s+ask/i);
    const lastSale = getValueNearLabel(/last\s+sale/i);
    const averagePrice = getValueNearLabel(/average\s+sale\s*price/i) ?? getValueNearLabel(/\bavg\b/i);

    const fields = [highestBid, lowestAsk, lastSale, averagePrice].filter((n) => typeof n === 'number');
    if (fields.length < 2) return null;

    return {
      averagePrice: averagePrice ?? (lastSale ?? '—'),
      lastSale: lastSale ?? '—',
      highestBid: highestBid ?? '—',
      lowestAsk: lowestAsk ?? '—',
      scrapedFromPage: true,
      source: 'dom_labels'
    };
  } catch {
    return null;
  }
}

function computeSuggestedBid({ marketData, recentSales }) {
  const highestBid = toNumberMaybe(marketData?.highestBid);
  const recentPrices = Array.isArray(recentSales) ? recentSales.map((s) => s.price).filter((n) => Number.isFinite(n)) : [];

  // Default: nudge above highest bid if we have it, else use ~92% of median recent sale.
  let base = null;
  if (isPlausibleUsd(highestBid)) base = Math.round(highestBid) + 1;

  if (!base && recentPrices.length > 0) {
    const sorted = [...recentPrices].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    base = Math.max(1, Math.floor(median * 0.92));
  }

  return Number.isFinite(base) ? base : null;
}

function getLatestHelperDataFallback() {
  try {
    const marketData = window.__stockxHelperLastMarketData || null;
    const recentSales = window.__stockxHelperLastRecentSales || null;
    return { marketData, recentSales };
  } catch {
    return { marketData: null, recentSales: null };
  }
}

function computePrefillBidBestEffort({ sizeKey }) {
  // Prefer latest widget-cached data, otherwise scrape again.
  const latest = getLatestHelperDataFallback();
  const marketData = latest.marketData || extractMarketDataBestEffort();
  const recentSales = latest.recentSales || extractRecentSalesBestEffort(200);

  // Always prefill as Highest Bid + $1 when available.
  const highestBid = toNumberMaybe(marketData?.highestBid);
  let bid = isPlausibleUsd(highestBid) ? Math.round(highestBid) + 1 : computeSuggestedBid({ marketData, recentSales });

  return {
    bid,
    highestBid,
    maxBid: null,
    usedSource: marketData?.source || 'unknown'
  };
}

function getPreferredSize() {
  try {
    const v = localStorage.getItem('stockxExtensionPreferredSize');
    const s = v ? String(v).trim() : '';
    if (!s) return '';
    // Ignore incomplete/non-specific values like "US M" with no numeric size.
    if (!/[0-9]/.test(s) && s.toLowerCase() !== 'all') return '';
    return s;
  } catch {
    return '';
  }
}

function setPreferredSize(size) {
  try {
    const s = String(size || '').trim();
    // Avoid persisting incomplete values like "US M" / "US W" (no numeric size).
    if (/^us\s*[mw]$/i.test(s) || /^us$/i.test(s)) {
      localStorage.setItem('stockxExtensionPreferredSize', '');
      return;
    }
    localStorage.setItem('stockxExtensionPreferredSize', s);
  } catch {}
}

function getLastBid() {
  try {
    const v = localStorage.getItem('stockxExtensionLastBid');
    return v ? String(v) : '';
  } catch {
    return '';
  }
}

function setLastBid(bid) {
  try {
    localStorage.setItem('stockxExtensionLastBid', String(bid || ''));
  } catch {}
}

function waitForElement(getEl, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const el = getEl();
      if (el) return resolve(el);
      if (Date.now() - start > timeoutMs) return resolve(null);
      setTimeout(tick, 120);
    };
    tick();
  });
}

function waitForElementFast(getEl, { timeoutMs = 10000, pollMs = 50 } = {}) {
  return new Promise((resolve) => {
    const start = Date.now();
    let done = false;
    let pollTimer = null;
    let obs = null;

    const finish = (v) => {
      if (done) return;
      done = true;
      try {
        if (pollTimer) clearInterval(pollTimer);
      } catch {}
      try {
        obs?.disconnect?.();
      } catch {}
      resolve(v || null);
    };

    const check = () => {
      try {
        const el = getEl();
        if (el) return finish(el);
      } catch {}
      if (Date.now() - start > timeoutMs) return finish(null);
    };

    // Immediate check
    check();
    if (done) return;

    // MutationObserver (fast path)
    try {
      obs = new MutationObserver(() => check());
      obs.observe(document.documentElement || document.body, { childList: true, subtree: true, attributes: true });
    } catch {}

    // Poll fallback (safety net)
    try {
      pollTimer = setInterval(check, Math.max(16, Number(pollMs) || 50));
    } catch {}
  });
}

function waitForUrlChange(oldUrl, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const cur = location.href;
      if (cur !== oldUrl) return resolve(cur);
      if (Date.now() - start > timeoutMs) return resolve(null);
      setTimeout(tick, 100);
    };
    tick();
  });
}

function findOfferCta() {
  // StockX sometimes uses "Make Offer" (anchor) instead of a bid button.
  const byText = (re) => {
    const els = Array.from(document.querySelectorAll('a,button,[role="button"]'));
    const isBadPricingTile = (t) => {
      const s = String(t || '').trim();
      if (!s) return true;
      // Avoid "Pricing Options" tiles like "Good Bid" / "Better Bid" which can overwrite the input value.
      if (/(good|better)\s+bid/i.test(s)) return true;
      if (/buy\s+now/i.test(s)) return true;
      return false;
    };
    return els.find((el) => {
      const t = safeText(el);
      if (isBadPricingTile(t)) return false;
      return re.test(t);
    });
  };

  return (
    document.querySelector('a[href*="/buy/"][href*="defaultBid=true"]') ||
    byText(/make\s+offer/i) ||
    byText(/place\s+bid/i) ||
    // Some pages show a simple "Bid" CTA; match exact text but avoid "Good/Better Bid" tiles.
    byText(/^\s*bid\s*$/i) ||
    null
  );
}

function navigateToOfferHref(href) {
  try {
    const h = String(href || '').trim();
    if (!h) return false;
    const url = h.startsWith('http') ? h : new URL(h, location.origin).toString();
    // Use location.assign to ensure navigation (some SPA handlers can block click-based routing).
    window.location.assign(url);
    return true;
  } catch {
    return false;
  }
}

async function navigateToOfferHrefViaExtension(url) {
  try {
    if (!url) return false;
    if (!chrome?.runtime?.sendMessage) return false;
    const res = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'navigateTo', url }, (resp) => resolve(resp));
    });
    return !!res?.success;
  } catch {
    return false;
  }
}

async function navigateToOfferUrlRobust(url, { timeoutMs = 2500 } = {}) {
  try {
    const target = String(url || '').trim();
    if (!target) return { ok: false, method: 'none' };
    const oldUrl = location.href;

    // 1) Try in-page navigation
    try {
      window.location.assign(target);
    } catch {}

    const changed1 = await waitForUrlChange(oldUrl, Math.min(1200, timeoutMs));
    if (changed1) return { ok: true, method: 'location.assign' };

    // 2) Fallback: background-driven tab navigation
    const bgOk = await navigateToOfferHrefViaExtension(target);
    if (!bgOk) return { ok: false, method: 'background.tabs.update' };

    const changed2 = await waitForUrlChange(oldUrl, Math.max(2500, timeoutMs));
    if (changed2) return { ok: true, method: 'background.tabs.update' };

    return { ok: false, method: 'background.tabs.update' };
  } catch {
    return { ok: false, method: 'error' };
  }
}

async function savePendingOfferRequest(req) {
  try {
    if (!chrome?.storage?.local) return false;
    const payload = {
      id: `offer_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      createdAt: Date.now(),
      ...req
    };
    await new Promise((resolve) => chrome.storage.local.set({ stockxPendingOfferRequest: payload }, resolve));
    console.log('🟦 StockX Helper: saved pending offer request', payload);
    return true;
  } catch (e) {
    console.warn('⚠️ StockX Helper: failed to save pending offer request', e);
    return false;
  }
}

async function loadPendingOfferRequest() {
  try {
    if (!chrome?.storage?.local) return null;
    const res = await new Promise((resolve) => chrome.storage.local.get(['stockxPendingOfferRequest'], resolve));
    return res?.stockxPendingOfferRequest || null;
  } catch {
    return null;
  }
}

async function clearPendingOfferRequest() {
  try {
    if (!chrome?.storage?.local) return false;
    await new Promise((resolve) => chrome.storage.local.remove(['stockxPendingOfferRequest'], resolve));
    console.log('🟦 StockX Helper: cleared pending offer request');
    return true;
  } catch {
    return false;
  }
}

async function savePendingOfferRequestById(id, req) {
  try {
    if (!chrome?.storage?.local) return false;
    const res = await new Promise((resolve) => chrome.storage.local.get(['stockxPendingOfferRequests'], resolve));
    const map = (res?.stockxPendingOfferRequests && typeof res.stockxPendingOfferRequests === 'object')
      ? res.stockxPendingOfferRequests
      : {};
    map[id] = { id, createdAt: Date.now(), ...req };
    await new Promise((resolve) => chrome.storage.local.set({ stockxPendingOfferRequests: map }, resolve));
    console.log('🟦 StockX Helper: saved pending offer request (by id)', { id, req: map[id] });
    return true;
  } catch (e) {
    console.warn('⚠️ StockX Helper: failed to save pending offer request (by id)', e);
    return false;
  }
}

const STOCKX_LAST_BID_RETURN_KEY = 'stockxLastBidReturn';

async function setLastBidReturn(payload) {
  try {
    if (!chrome?.storage?.local) return false;
    const p = payload && typeof payload === 'object' ? payload : null;
    if (!p) return false;
    await new Promise((resolve) => chrome.storage.local.set({ [STOCKX_LAST_BID_RETURN_KEY]: { ...p, savedAt: Date.now() } }, resolve));
    return true;
  } catch {
    return false;
  }
}

async function getLastBidReturn() {
  try {
    if (!chrome?.storage?.local) return null;
    const res = await new Promise((resolve) => chrome.storage.local.get([STOCKX_LAST_BID_RETURN_KEY], resolve));
    const v = res?.[STOCKX_LAST_BID_RETURN_KEY];
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

async function clearLastBidReturnIfMatches(id) {
  try {
    if (!chrome?.storage?.local) return false;
    const cur = await getLastBidReturn();
    if (!cur) return true;
    if (id && String(cur?.id || '') !== String(id || '')) return true;
    await new Promise((resolve) => chrome.storage.local.remove([STOCKX_LAST_BID_RETURN_KEY], resolve));
    return true;
  } catch {
    return false;
  }
}

async function loadPendingOfferRequestById(id) {
  try {
    if (!chrome?.storage?.local) return null;
    const res = await new Promise((resolve) => chrome.storage.local.get(['stockxPendingOfferRequests'], resolve));
    const map = res?.stockxPendingOfferRequests;
    if (!map || typeof map !== 'object') return null;
    return map[id] || null;
  } catch {
    return null;
  }
}

async function deletePendingOfferRequestById(id) {
  try {
    if (!chrome?.storage?.local) return false;
    const res = await new Promise((resolve) => chrome.storage.local.get(['stockxPendingOfferRequests'], resolve));
    const map = res?.stockxPendingOfferRequests;
    if (!map || typeof map !== 'object') return false;
    if (!map[id]) return true;
    delete map[id];
    await new Promise((resolve) => chrome.storage.local.set({ stockxPendingOfferRequests: map }, resolve));
    console.log('🟦 StockX Helper: deleted pending offer request (by id)', { id });
    try {
      await clearLastBidReturnIfMatches(id);
    } catch {}
    return true;
  } catch {
    return false;
  }
}

function getExtBidIdFromUrl() {
  try {
    const u = new URL(location.href);
    return u.searchParams.get('extBidId') || '';
  } catch {
    return '';
  }
}

function isOfferFlowUrl() {
  try {
    if (!location.hostname.includes('stockx.com')) return false;
    if (!location.pathname.startsWith('/buy/')) return false;
    const u = new URL(location.href);
    return u.searchParams.get('defaultBid') === 'true';
  } catch {
    return false;
  }
}

function isBuyFlowPath() {
  try {
    return location.hostname.includes('stockx.com') && location.pathname.startsWith('/buy/');
  } catch {
    return false;
  }
}

function getOfferSlugFromUrl() {
  try {
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'buy') return '';
    return parts[1] || '';
  } catch {
    return '';
  }
}

async function updatePendingOfferRequest(patch) {
  try {
    const cur = await loadPendingOfferRequest();
    if (!cur) return false;
    const next = { ...cur, ...patch, updatedAt: Date.now() };
    await new Promise((resolve) => chrome.storage.local.set({ stockxPendingOfferRequest: next }, resolve));
    return true;
  } catch {
    return false;
  }
}

async function runPendingOfferRequestIfPresent() {
  try {
    // Run on any /buy/<slug> page (defaultBid page + review page).
    if (!isBuyFlowPath()) return;
    console.log('🟦 StockX Helper: buy flow page detected', { url: location.href });
    const extId = getExtBidIdFromUrl();
    // IMPORTANT: request selection order matters.
    // If the user is doing a manual bid (same tab), we store it in the legacy single key.
    // We MUST prefer that over the lastBidReturn fallback (which may reference a previous auto-bid).
    const resolvedReq = await (async () => {
      // 1) Prefer explicit extBidId (auto bid tabs)
      if (extId) return await loadPendingOfferRequestById(extId);

      // 2) Prefer legacy single request (manual flow)
      const legacy = await loadPendingOfferRequest();
      if (legacy) return legacy;

      // 3) Fallback to "last bid return" if StockX dropped extBidId during navigation
      const last = await getLastBidReturn();
      const lastId = String(last?.id || '');
      if (lastId) {
        const byId = await loadPendingOfferRequestById(lastId);
        if (byId) return byId;
      }
      return null;
    })();
    if (!resolvedReq) {
      console.log('🟦 StockX Helper: no pending offer request found in storage');
      return;
    }

    // Ignore stale requests (>10 min)
    if (typeof resolvedReq.createdAt === 'number' && Date.now() - resolvedReq.createdAt > 10 * 60 * 1000) {
      if (extId) await deletePendingOfferRequestById(extId);
      else await clearPendingOfferRequest();
      try { await clearLastBidReturnIfMatches(extId || String((await getLastBidReturn())?.id || '')); } catch {}
      return;
    }

    const slug = getOfferSlugFromUrl();
    const sizeKey = normalizeSizeKey(getSelectedSizeFromUrl());

    const reqSlug = String(resolvedReq.slug || '').trim();
    const reqSize = normalizeSizeKey(resolvedReq.size);
    if (!reqSlug || !slug || reqSlug !== slug) return;
    if (reqSize && sizeKey && !sizeKeyMatches(reqSize, sizeKey)) return;

    // Avoid running twice on the same page load.
    const pageKey = `${resolvedReq.id}::${location.pathname}::${location.search}`;
    if (window.__stockxOfferAutoRanForPageKey === pageKey) return;
    window.__stockxOfferAutoRanForPageKey = pageKey;

    console.log('🟦 StockX Helper: running pending offer request on buy flow page', { slug, sizeKey, bid: resolvedReq.bid, req: resolvedReq });

    const reqMode = String(resolvedReq?.mode || 'auto').toLowerCase(); // 'auto' | 'manual'
    const shouldAutoClose = reqMode !== 'manual' && resolvedReq?.autoClose !== false;

    async function cleanupPending() {
      try {
        const last = await getLastBidReturn();
        const effectiveId = extId || String(last?.id || '');
        if (effectiveId) await deletePendingOfferRequestById(effectiveId);
        else await clearPendingOfferRequest();
        try { await clearLastBidReturnIfMatches(effectiveId); } catch {}
      } catch {}
    }

    async function waitForBidSuccessSignal(timeoutMs = 15000) {
      try {
        const start = Date.now();
        const re = /(bid|offer)\s+(placed|confirmed)|you're\s+all\s+set|thank\s+you|success|order\s+confirmed/i;
        while (Date.now() - start < timeoutMs) {
          try {
            // URL-based success (StockX sometimes routes away from /buy after confirm)
            if (!location.pathname.startsWith('/buy/')) return { ok: true, reason: 'url_changed' };
            const u = new URL(location.href);
            if (u.searchParams.get('defaultBid') !== 'true') return { ok: true, reason: 'defaultBid_removed' };
          } catch {}

          try {
            const txt = (document.body?.innerText || '').slice(0, 20000);
            if (re.test(txt)) return { ok: true, reason: 'success_text' };
          } catch {}

          try {
            // If Confirm button is gone, we may be on a receipt/success view
            const stillHasConfirm = !!findConfirmBidButton(document);
            if (!stillHasConfirm) {
              const reviewBtn = findOfferSubmitButton(document);
              if (!reviewBtn) return { ok: true, reason: 'buttons_gone' };
            }
          } catch {}

          await new Promise((r) => setTimeout(r, 250));
        }
        return { ok: false, reason: 'timeout' };
      } catch {
        return { ok: false, reason: 'error' };
      }
    }

    // Manual mode should NEVER auto-confirm/auto-close. We only prefill and then stop.
    const manualMode = reqMode === 'manual';

    // If we're already on the review screen, just click Confirm Bid.
    const confirmNow = findConfirmBidButton(document);
    if (confirmNow) {
      if (manualMode) {
        console.log('🟦 StockX Helper: manual mode — Confirm Bid is present, not clicking or closing.');
        try {
          confirmNow.scrollIntoView?.({ block: 'center', inline: 'center' });
          confirmNow.style.outline = '3px solid rgba(99,102,241,0.95)';
          confirmNow.style.outlineOffset = '3px';
          setTimeout(() => {
            try {
              confirmNow.style.outline = '';
              confirmNow.style.outlineOffset = '';
            } catch {}
          }, 2500);
        } catch {}
        // Manual mode: DO NOT navigate away from this page.
        // Instead, wait for the user to click Confirm Bid, then detect success and return/cleanup.
        if (!window.__stockxManualConfirmWatcherRunning) {
          window.__stockxManualConfirmWatcherRunning = true;
          (async () => {
            try {
              const signal = await waitForBidSuccessSignal(60000);
              console.log('🟦 StockX Helper: manual confirm success signal', signal);
              if (!signal.ok) return;

              // Success observed => cleanup and return to the prior page (same tab) or focus opener if present.
              const last = await getLastBidReturn();
              const openerTabId = Number(resolvedReq?.openerTabId || last?.openerTabId || 0);
              const returnUrl = String(resolvedReq?.returnUrl || last?.returnUrl || '');

              await cleanupPending();

              // For manual bids (same tab), prefer returning by navigating back to returnUrl.
              if (returnUrl) {
                try {
                  if (location.href !== returnUrl) window.location.assign(returnUrl);
                } catch {}
                return;
              }

              // If we have an openerTabId (rare for manual), use closeSelfAndFocus.
              if (openerTabId) {
                try {
                  chrome.runtime?.sendMessage?.({ action: 'closeSelfAndFocus', openerTabId, returnUrl }, () => void chrome.runtime.lastError);
                } catch {}
              }
            } catch (e) {
              console.warn('⚠️ StockX Helper: manual confirm watcher failed', e);
            } finally {
              try {
                window.__stockxManualConfirmWatcherRunning = false;
              } catch {}
            }
          })();
        }
        return;
      }

      console.log('🟦 StockX Helper: Confirm Bid button found, clicking...');
      try {
        confirmNow.scrollIntoView?.({ block: 'center', inline: 'center' });
      } catch {}
      try {
        confirmNow.click();
      } catch {}

      // Only close/return AFTER we see a success signal (prevents exiting too early).
      const signal = await waitForBidSuccessSignal(18000);
      console.log('🟦 StockX Helper: confirm flow success signal', signal);
      if (signal.ok) {
        const last = await getLastBidReturn();
        // cleanup + return
        await cleanupPending();
        try {
          const openerTabId = Number(resolvedReq?.openerTabId || last?.openerTabId);
          const returnUrl = String(resolvedReq?.returnUrl || last?.returnUrl || '');
          if (shouldAutoClose && (openerTabId || returnUrl)) {
            chrome.runtime?.sendMessage?.({ action: 'closeSelfAndFocus', openerTabId, returnUrl }, () => void chrome.runtime.lastError);
          }
        } catch {}
      } else {
        // Don't close if we couldn't verify success.
        console.warn('⚠️ StockX Helper: could not verify bid success; leaving tab open.');
      }
      return;
    }

    // Wait for bid input
    const bidInput = await waitForElement(
      () => document.querySelector('input[data-testid="bid-input"]') || findOfferAmountInput(document),
      20000
    );
    if (!bidInput) {
      console.warn('⚠️ StockX Helper: bid input not found on offer page');
      return;
    }

    // Set bid
    try {
      bidInput.focus();
      bidInput.value = String(resolvedReq.bid || '').trim();
      bidInput.dispatchEvent(new Event('input', { bubbles: true }));
      bidInput.dispatchEvent(new Event('change', { bubbles: true }));
    } catch {}

    // Set expiration=7
    try {
      const expirationSelect =
        document.querySelector('select[data-testid="expiration-select-list"]') ||
        document.querySelector('select[aria-label*="expiration" i]');
      if (expirationSelect) {
        expirationSelect.value = '7';
        expirationSelect.dispatchEvent(new Event('input', { bubbles: true }));
        expirationSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } catch {}

    // Capture fees automatically (zero extra steps)
    // Don't block on this — it can take a few seconds and makes the flow feel slow.
    try {
      const p = waitForAndCaptureFees({ root: document, timeoutMs: 8000 });
      await Promise.race([p, new Promise((r) => setTimeout(r, 250))]);
    } catch {}

    if (manualMode) {
      console.log('🟦 StockX Helper: manual mode — bid prefilled; not auto-submitting or closing.');
      // Try to highlight the Review button for UX, but don't click it.
      try {
        const review = document.querySelector('button[data-testid="checkout-confirm-button"]') || findOfferSubmitButton(document);
        if (review) {
          review.scrollIntoView?.({ block: 'center', inline: 'center' });
          review.style.outline = '3px solid rgba(99,102,241,0.95)';
          review.style.outlineOffset = '3px';
          setTimeout(() => {
            try {
              review.style.outline = '';
              review.style.outlineOffset = '';
            } catch {}
          }, 2500);
        }
      } catch {}
      // Clear pending so it doesn't auto-run again.
      await cleanupPending();
      return;
    }

    // Click Review Bid then Confirm Bid
    const reviewBtn = await waitForElementFast(
      () => {
        const b = document.querySelector('button[data-testid="checkout-confirm-button"]') || findOfferSubmitButton(document);
        if (b && (b.disabled || b.getAttribute?.('aria-disabled') === 'true')) return null;
        return b;
      },
      { timeoutMs: 15000, pollMs: 40 }
    );
    if (!reviewBtn) {
      console.warn('⚠️ StockX Helper: Review Bid button not found');
      return;
    }
    try {
      console.log('🟦 StockX Helper: clicking Review Bid...');
      reviewBtn.click();
    } catch {}

    // Record stage for debugging.
    try {
      await updatePendingOfferRequest({ stage: 'review_clicked' });
    } catch {}

    // Step 2: Confirm Bid (often appears after review, sometimes without a full navigation).
    const confirmBtn = await waitForElementFast(() => findConfirmBidButton(document), { timeoutMs: 12000, pollMs: 40 });
    if (!confirmBtn) {
      // If review navigates, the next /buy/ page load will hit the confirmNow branch.
      console.warn('⚠️ StockX Helper: Confirm Bid button did not appear yet (may navigate).');
      return;
    }
    try {
      console.log('🟦 StockX Helper: clicking Confirm Bid...');
      confirmBtn.click();
    } catch {}

    // Only close/return AFTER we see a success signal (prevents exiting too early).
    const signal = await waitForBidSuccessSignal(18000);
    console.log('🟦 StockX Helper: confirm flow success signal', signal);
    if (signal.ok) {
      const last = await getLastBidReturn();
      await cleanupPending();
      try {
        const openerTabId = Number(resolvedReq?.openerTabId || last?.openerTabId);
        const returnUrl = String(resolvedReq?.returnUrl || last?.returnUrl || '');
        if (shouldAutoClose && (openerTabId || returnUrl)) {
          chrome.runtime?.sendMessage?.({ action: 'closeSelfAndFocus', openerTabId, returnUrl }, () => void chrome.runtime.lastError);
        }
      } catch {}
    } else {
      console.warn('⚠️ StockX Helper: could not verify bid success; leaving tab open.');
    }
  } catch (e) {
    console.warn('⚠️ runPendingOfferRequestIfPresent failed:', e);
  }
}

async function openBidInNewTab({ slug, sizeKey, bid }) {
  try {
    const id = `extBid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    // Store where we came from so the bid tab can return focus back after confirming.
    const returnUrl = String(location.href || '');
    const ok = await savePendingOfferRequestById(id, { slug, size: sizeKey, bid, returnUrl, mode: 'auto', autoClose: true });
    if (!ok) return { ok: false, error: 'Failed to save bid request' };
    const url = `${location.origin}/buy/${slug}?size=${encodeURIComponent(sizeKey)}&defaultBid=true&extBidId=${encodeURIComponent(id)}`;
    const res = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'openTab', url }, (resp) => resolve(resp));
    });
    if (!res?.success) return { ok: false, error: res?.error || 'Failed to open tab' };
    try {
      if (res?.openerTabId) {
        await savePendingOfferRequestById(id, {
          slug,
          size: sizeKey,
          bid,
          returnUrl,
          openerTabId: res.openerTabId,
          openerUrl: res.openerUrl || '',
          mode: 'auto',
          autoClose: true
        });
        // Also persist a "last return target" in case StockX navigates and drops extBidId from the URL.
        await setLastBidReturn({
          id,
          slug,
          size: sizeKey,
          bid,
          returnUrl,
          openerTabId: res.openerTabId,
          openerUrl: res.openerUrl || '',
          mode: 'auto',
          autoClose: true
        });
      }
    } catch {}
    return { ok: true, tabId: res.tabId || null };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function findOfferAmountInput(root = document) {
  try {
    const scope = root || document;
    const direct =
      scope.querySelector('input[data-testid="bid-input"]') ||
      scope.querySelector('input[data-testid*="offer" i]') ||
      scope.querySelector('input[data-testid*="bid" i]') ||
      scope.querySelector('input[name*="offer" i]') ||
      scope.querySelector('input[name*="bid" i]') ||
      scope.querySelector('input[aria-label*="offer" i]') ||
      scope.querySelector('input[aria-label*="bid" i]') ||
      scope.querySelector('input[placeholder="Enter Bid"]') ||
      scope.querySelector('input[placeholder*="offer" i]') ||
      scope.querySelector('input[placeholder*="bid" i]') ||
      scope.querySelector('input[placeholder*="$" i]') ||
      scope.querySelector('input[inputmode="decimal"]') ||
      scope.querySelector('input[type="number"]');

    if (direct) return direct;

    // Some UIs wrap the input in a container with "Offer" label.
    const labeled = Array.from(scope.querySelectorAll('label,div,span,p'))
      .filter((el) => /offer|bid|amount|price/i.test(safeText(el)))
      .slice(0, 200);
    for (const el of labeled) {
      const container = el.closest('div,section,form') || el.parentElement;
      const inp = container?.querySelector?.('input');
      if (inp) return inp;
    }
    return null;
  } catch {
    return null;
  }
}

function findOfferSubmitButton(root = document) {
  try {
    const scope = root || document;
    const btns = Array.from(scope.querySelectorAll('button,[role="button"],a'));
    return (
      scope.querySelector('button[data-testid="checkout-confirm-button"]') ||
      btns.find((b) => /review\s+(bid|offer)/i.test(safeText(b))) ||
      btns.find((b) => /place\s+(bid|offer)/i.test(safeText(b))) ||
      btns.find((b) => /^submit$/i.test(safeText(b))) ||
      btns.find((b) => /confirm/i.test(safeText(b))) ||
      null
    );
  } catch {
    return null;
  }
}

function findConfirmBidButton(root = document) {
  try {
    const scope = root || document;
    const btns = Array.from(scope.querySelectorAll('button,[role="button"]'));
    return (
      btns.find((b) => safeText(b).trim().toLowerCase() === 'confirm bid') ||
      btns.find((b) => /confirm\s+bid/i.test(safeText(b))) ||
      null
    );
  } catch {
    return null;
  }
}

async function placeBidViaUi({ size, bid }) {
  // Prevent re-entry (can happen due to rapid clicks or SPA re-renders).
  try {
    if (window.__stockxOfferInFlight) {
      return { ok: false, error: 'Offer flow already in progress (try again in a moment).' };
    }
    window.__stockxOfferInFlight = true;
  } catch {}

  try {
  const oldUrl = location.href;
  console.log('🟪 StockX Helper: Place Bid invoked', { url: oldUrl, size, bid });

  // If we're already on the offer page/modal (bid input exists), don't click a CTA again.
  const alreadyOnOfferFlow =
    isOfferFlowUrl() ||
    isBuyFlowPath() ||
    !!document.querySelector('input[data-testid="bid-input"]') ||
    !!document.querySelector('select[data-testid="expiration-select-list"]') ||
    !!document.querySelector('button[data-testid="checkout-confirm-button"]') ||
    !!document.querySelector('[role="dialog"] input[data-testid="bid-input"]') ||
    !!document.querySelector('[role="dialog"] button[data-testid="checkout-confirm-button"]');
  console.log('🟪 StockX Helper: offer flow detection', {
    alreadyOnOfferFlow,
    path: location.pathname,
    search: location.search
  });

  if (!alreadyOnOfferFlow) {
    const cta = findOfferCta();
    console.log('🟪 StockX Helper: offer CTA found?', { found: !!cta });
    // Fallback: construct the offer URL directly (works even if StockX blocks the CTA click)
    if (!cta) {
      const slug = getProductSlugFromUrl();
      const sizeKey = normalizeSizeKey(size || getSelectedSizeBestEffort());
      console.log('🟪 StockX Helper: constructing /buy URL', { slug, sizeKey });
      if (slug && sizeKey) {
        const offerUrl = `${location.origin}/buy/${slug}?size=${encodeURIComponent(sizeKey)}&defaultBid=true`;
        // Save pending request so the offer page can auto-fill and submit.
        const saved = await savePendingOfferRequest({ slug, size: sizeKey, bid, returnUrl: oldUrl, mode: 'manual', autoClose: false });
        console.log('🟪 StockX Helper: pending request save result', { saved, offerUrl });
        if (!saved) return { ok: false, error: 'Could not save pending offer request (storage unavailable).' };
        const nav = await navigateToOfferUrlRobust(offerUrl, { timeoutMs: 9000 });
        console.log('🟪 StockX Helper: navigate result', nav);
        if (!nav.ok) return { ok: false, error: `Could not navigate to offer page (${offerUrl}).` };
        // Navigation will unload this page; offer-page script will continue the flow.
        return { ok: true, pendingNavigation: true };
      } else {
        return { ok: false, error: 'Could not find Make Offer CTA and could not construct /buy URL (missing slug/size).' };
      }
    }

    // Prefer explicit navigation for <a href="/buy/...defaultBid=true">Make Offer</a>
    if (cta) {
      const href = cta.getAttribute?.('href');
      console.log('🟪 StockX Helper: found offer CTA', { tag: cta.tagName, href, text: safeText(cta).slice(0, 80) });
      const isAnchor = (cta.tagName || '').toUpperCase() === 'A';
      const isOfferHref = typeof href === 'string' && href.includes('/buy/') && href.includes('defaultBid=true');
      if (isAnchor && isOfferHref) {
        const url = href.startsWith('http') ? href : new URL(href, location.origin).toString();
        const slug = getProductSlugFromUrl();
        const sizeKey = normalizeSizeKey(size || getSelectedSizeBestEffort());
        console.log('🟪 StockX Helper: using CTA href navigation', { slug, sizeKey, url });
        const saved = await savePendingOfferRequest({ slug, size: sizeKey, bid, returnUrl: oldUrl, mode: 'manual', autoClose: false });
        console.log('🟪 StockX Helper: pending request save result', { saved });
        if (!saved) return { ok: false, error: 'Could not save pending offer request (storage unavailable).' };
        const nav = await navigateToOfferUrlRobust(url, { timeoutMs: 9000 });
        console.log('🟪 StockX Helper: navigate result', nav);
        if (!nav.ok) return { ok: false, error: `Could not navigate to offer page (${url}).` };
        return { ok: true, pendingNavigation: true };
      } else {
        // Clicking this may open a modal OR route to /buy/... (SPA navigation).
        try {
          console.log('🟪 StockX Helper: clicking CTA (non-offer-href)');
          cta.click();
        } catch {
          if (href) {
            const url = href.startsWith('http') ? href : new URL(href, location.origin).toString();
            const nav = await navigateToOfferUrlRobust(url, { timeoutMs: 9000 });
            console.log('🟪 StockX Helper: navigate result', nav);
            if (!nav.ok) return { ok: false, error: `Could not navigate to offer page (${url}).` };
            return { ok: true, pendingNavigation: true };
          }
        }
      }
    }
  }

  // Try to find a modal/dialog container, but also handle routed pages where there's no dialog.
  const dialog = await waitForElement(() => document.querySelector('[role="dialog"], [aria-modal="true"]'), 4500);
  const urlChanged = await waitForUrlChange(oldUrl, 9000);
  const root = dialog || document;

  // If we weren't already on offer flow and nothing changed, fail clearly.
  if (!alreadyOnOfferFlow && !dialog && !urlChanged) {
    return {
      ok: false,
      error: 'Offer flow did not open (no dialog and URL did not change). StockX likely blocked the click; try clicking “Make Offer” on the page once, then retry.'
    };
  }

  // Try to choose size (best-effort). Many sites use a button or select; we attempt both patterns.
  const requestedSizeKey = normalizeSizeKey(size || '');
  const currentSizeKey = normalizeSizeKey(getSelectedSizeBestEffort());
  if (requestedSizeKey && (!currentSizeKey || requestedSizeKey !== currentSizeKey)) {
    const normalized = String(size).trim().toUpperCase();
    // Click a size dropdown/button then choose an option containing the size text.
    const sizeControl =
      root.querySelector('button[aria-haspopup="listbox"], [role="combobox"], select') ||
      Array.from(root.querySelectorAll('button,[role="button"]')).find((b) => /size/i.test(safeText(b)));
    if (sizeControl) {
      try {
        sizeControl.click?.();
      } catch {}
      // Search for option-like elements
      const option =
        Array.from(document.querySelectorAll('[role="option"], option, button, li, div'))
          .filter((el) => {
            const t = safeText(el).toUpperCase();
            return t && t.includes(normalized);
          })
          .slice(0, 50)[0] || null;
      if (option) {
        try {
          option.click?.();
        } catch {}
      }
    }
  }

  // Fill offer/bid price input (modal or routed buy flow)
  let bidInput = findOfferAmountInput(root);
  if (!bidInput && (urlChanged || !dialog)) {
    // Give SPA route a moment to render offer form
    bidInput = await waitForElement(
      () => findOfferAmountInput(document) || document.querySelector('input[data-testid="bid-input"]'),
      15000
    );
  }
  if (!bidInput) {
    return {
      ok: false,
      error: 'Could not find offer/bid amount input. StockX UI likely changed; please send the inspected input element.'
    };
  }

  const bidStr = String(bid || '').trim();
  if (!bidStr || !/^\d+(\.\d+)?$/.test(bidStr)) return { ok: false, error: 'Invalid bid amount.' };

  try {
    bidInput.focus();
    bidInput.value = bidStr;
    bidInput.dispatchEvent(new Event('input', { bubbles: true }));
    bidInput.dispatchEvent(new Event('change', { bubbles: true }));
  } catch (e) {
    return { ok: false, error: `Failed to set bid value: ${String(e?.message || e)}` };
  }

  // Set expiration to 7 days when the expiration select exists.
  try {
    const expirationSelect =
      root.querySelector('select[data-testid="expiration-select-list"]') ||
      root.querySelector('select[data-testid="expiration-select-list"]') ||
      root.querySelector('select[aria-label*="expiration" i]') ||
      document.querySelector('select[data-testid="expiration-select-list"]') ||
      document.querySelector('select[aria-label*="expiration" i]');
    if (expirationSelect) {
      expirationSelect.value = '7';
      expirationSelect.dispatchEvent(new Event('input', { bubbles: true }));
      expirationSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } catch {}

  // Zero extra steps: once the offer flow is open, wait for Shipping/Processing/etc to render and cache them.
  // This powers all size calculations going forward.
  // Don't block the bid flow on fee rendering; it can be slow. Capture in the background.
  try {
    const p = waitForAndCaptureFees({ root, timeoutMs: 8000 });
    await Promise.race([p, new Promise((r) => setTimeout(r, 250))]);
  } catch {}

  // Profit guardrail (30d): only enforce when the selected size has >=4 sales in last 30 days.
  const selectedSizeKey = normalizeSizeKey(size || getSelectedSizeBestEffort());
  const scanner = computeProfitScanner({
    recentSales: window.__stockxHelperLastRecentSales || [],
    days: 30,
    minSales: 4,
    minProfit: 15
  });
  const target = findProfitTargetForSize({ scanner, selectedSizeKey });
  let profitAdjustment = null;
  if (target?.maxAllInBid) {
    profitAdjustment = await adjustOfferToProfitTarget({
      root,
      input: bidInput,
      initialBid: bidInput.value,
      maxAllInTotal: target.maxAllInBid
    });
  }

  // Find review/submit button (often "Review Bid"). We DO NOT click unless user confirms.
  let submitBtn = findOfferSubmitButton(root);
  if (!submitBtn && (urlChanged || !dialog)) submitBtn = findOfferSubmitButton(document);
  if (!submitBtn) return { ok: false, error: 'Could not find bid submit/confirm button in the modal.' };

  const confirmLines = [];
  confirmLines.push(`Place offer for ${size ? `${size} ` : ''}$${String(bidInput.value || bidStr)} on StockX?`);
  if (target?.maxAllInBid) {
    confirmLines.push(``);
    confirmLines.push(`Rule: size has ≥4 sales in last 30d, ensure ≥$15 vs 30d avg`);
    confirmLines.push(`Avg30d≈$${Math.round(target.avg)} (${target.count} sales)`);
    confirmLines.push(`Max all-in total (fees+ship) to keep $15: $${target.maxAllInBid}`);
    if (profitAdjustment?.reason === 'no_total') {
      confirmLines.push(`(Couldn't read checkout Total; not enforced)`);
    } else if (profitAdjustment?.total != null) {
      confirmLines.push(`Checkout Total shown: $${Math.round(profitAdjustment.total)}`);
    }
  }
  confirmLines.push(``);
  confirmLines.push(`This will click the site UI to submit the offer.`);

  const ok = window.confirm(confirmLines.join('\n'));
  if (!ok) return { ok: false, error: 'Cancelled' };

  // Step 1: Review Bid
  try {
    submitBtn.click();
  } catch {
    return { ok: false, error: 'Failed to click Review Bid.' };
  }

  // Step 2: Confirm Bid (some flows require a second click)
  const confirmBtn = await waitForElementFast(() => findConfirmBidButton(document), { timeoutMs: 8000, pollMs: 40 });
  if (!confirmBtn) {
    return { ok: false, error: 'Review Bid clicked, but Confirm Bid button never appeared.' };
  }
  // IMPORTANT: For manual "Place Bid" we STOP here.
  // We do NOT auto-click "Confirm Bid" (user may want to verify totals), and we do NOT auto-return.
  try {
    confirmBtn.scrollIntoView?.({ block: 'center', inline: 'center' });
    confirmBtn.style.outline = '3px solid rgba(99,102,241,0.95)';
    confirmBtn.style.outlineOffset = '3px';
    setTimeout(() => {
      try {
        confirmBtn.style.outline = '';
        confirmBtn.style.outlineOffset = '';
      } catch {}
    }, 2500);
  } catch {}

  return { ok: true, awaitingConfirm: true };
  } finally {
    try {
      window.__stockxOfferInFlight = false;
    } catch {}
  }
}

function renderProductWidget({ marketData, recentSales }) {
  const selectedSizeKey = getSelectedSizeBestEffort();
  const stats30 = computeLastNDaysAverageSale({ recentSales, selectedSizeKey, days: 30 });
  const feeSum = getEffectiveFeeSum();
  const feeBd = getCachedFeeBreakdown();
  // If we have scan results, use them (multi-size). Otherwise targets only reflect current size sales.
  const scan = loadSizeScanResults();
  const allTargetsRaw = scan?.results
    ? computeTargetsFromScanResults({ scanResults: scan.results, feeSum, minSales: 4, minProfit: 15 })
    : computeSizeTargetsLastNDays({ recentSales, days: 30, minSales: 4, minProfit: 15, feeSum });
  // If we only have current-size targets, attach highest bid so Bid button can use HB+1.
  const hb = Number(marketData?.highestBid);
  const allTargets = (!scan?.results && Number.isFinite(hb) && hb > 0)
    ? (allTargetsRaw || []).map((t) => ({ ...t, highestBid: hb }))
    : allTargetsRaw;
  const eligibleTargets = allTargets.filter((t) => t.eligible && Number.isFinite(t.maxAllInBid) && t.maxAllInBid > 0);
  const profitTarget = findProfitTargetForSize({ scanner: eligibleTargets, selectedSizeKey });
  const existing = document.getElementById('stockx-price-tracker-widget');
  if (existing) existing.remove();

  const widget = document.createElement('div');
  widget.id = 'stockx-price-tracker-widget';
  widget.style.cssText = `
    position: fixed;
    top: 20px;
    left: 20px;
    background: rgba(17, 24, 39, 0.95);
    color: white;
    padding: 14px;
    border-radius: 10px;
    font-family: Arial, sans-serif;
    font-size: 13px;
    z-index: 2147483647;
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.25);
    max-width: 340px;
    border: 1px solid rgba(99,102,241,0.35);
  `;

  const suggested = computeSuggestedBid({ marketData, recentSales });
  const preferredSize = getPreferredSize();
  const lastBid = getLastBid();
  const initialBid = suggested != null ? String(suggested) : lastBid;

  const salesHtml = renderRecentSalesHtml(recentSales);
  const targetsHtml = renderBidTargetsHtml(allTargets, { limit: 80, feeSum });
  const initialAllIn = computeAllInEstimate({ offer: Number(initialBid || 0), rootForTotal: null });
  const initialProfit = computeProfitCheck({ avg30d: stats30.avg, allInTotal: initialAllIn.total, minProfit: 15 });

  widget.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px;">
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="font-weight:800; color:#c7d2fe;">StockX Helper</div>
        <button title="Settings" data-role="open-settings" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:rgba(255,255,255,0.9); cursor:pointer; padding:4px 8px; border-radius:10px; font-weight:900; font-size:12px;">⚙</button>
      </div>
      <button data-role="close" title="Close" style="background:none;border:none;color:rgba(255,255,255,0.8);cursor:pointer;font-size:18px;">×</button>
    </div>

    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:10px;">
      <div><div style="opacity:.7;font-size:11px;">Highest Bid</div><div data-role="val-highestBid" style="font-weight:800;">$${formatUsdOrDash(marketData?.highestBid)}</div></div>
      <div><div style="opacity:.7;font-size:11px;">Lowest Ask</div><div data-role="val-lowestAsk" style="font-weight:800;">$${formatUsdOrDash(marketData?.lowestAsk)}</div></div>
      <div><div style="opacity:.7;font-size:11px;">Last Sale</div><div data-role="val-lastSale" style="font-weight:800;">$${formatUsdOrDash(marketData?.lastSale)}</div></div>
      <div><div style="opacity:.7;font-size:11px;">Avg (30d)</div><div data-role="val-monthAvg" style="font-weight:800;">$${stats30.avg != null ? Math.round(stats30.avg) : '—'}</div></div>
    </div>
    <div style="margin-top:-6px; margin-bottom:10px; font-size:11px; color:rgba(255,255,255,0.6);">
      source: <span data-role="meta-source">${String(marketData?.source || 'unknown')}${marketData?.size ? ` • size: ${String(marketData.size)}` : ''}</span>
      • sales: <span data-role="meta-sales-count">${Array.isArray(recentSales) ? recentSales.length : 0}</span>
      • 30d: <span data-role="meta-month-count">${stats30.count || 0}</span>
      • max all-in: <span data-role="meta-maxAllIn">${profitTarget?.maxAllInBid ? `$${profitTarget.maxAllInBid}` : '—'}</span>
      • <a href="#" data-role="debug" style="color:#93c5fd;text-decoration:underline;">debug dump</a>
    </div>

    <div style="margin-bottom:10px;">
      <div style="font-weight:800; margin-bottom:6px;">Recent sales</div>
      <div data-role="sales-list" style="display:flex; flex-direction:column; gap:6px;">${salesHtml}</div>
    </div>

    <div style="margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:6px;">
        <div style="font-weight:800;">Bid targets (30d)</div>
        <div style="opacity:.7; font-size:11px;">≥4 sales • ≥$15 profit</div>
      </div>
      <div style="display:flex; justify-content:space-between; gap:8px; margin-bottom:6px;">
        <button data-role="scan-sizes" style="flex:1; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:white; padding:7px 10px; border-radius:8px; cursor:pointer; font-weight:800;">
          Scan sizes
        </button>
        <button data-role="clear-scan" style="width:110px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.10); color:rgba(255,255,255,0.85); padding:7px 10px; border-radius:8px; cursor:pointer; font-weight:800;">
          Clear
        </button>
      </div>
      <div data-role="targets-list" style="display:flex; flex-direction:column; gap:6px; max-height: 200px; overflow:auto;">
        ${targetsHtml}
      </div>
      <div style="margin-top:6px; font-size:11px; color:rgba(255,255,255,0.65);">
        Fees used: ${
          getCachedFeeSum() != null
            ? `ship ${feeBd?.shipping != null ? `$${feeBd.shipping}` : '—'} + proc ${feeBd?.processingFee != null ? `$${feeBd.processingFee}` : '—'} = ~$${Math.round(feeSum)}`
            : `assumed $${Math.round(feeSum)}`
        } • assumed fees: <input data-role="assumed-fees" value="${String(getAssumedFeeSum())}"
          style="width:64px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:white; padding:2px 6px; border-radius:6px; margin-left:6px;" />
      </div>
    </div>

    <div style="display:flex; gap:8px; margin-bottom:10px;">
      <div style="flex:1; min-width:0;">
        <div style="opacity:.75; font-size:11px; margin-bottom:4px;">Size</div>
        <input data-role="size" aria-label="Size" title="Size" placeholder="e.g. 10 / 9.5 / US M 10"
          value="${(selectedSizeKey || preferredSize) ? String(selectedSizeKey || preferredSize).replace(/"/g, '&quot;') : ''}"
          style="width:100%; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:white; padding:8px 10px; border-radius:8px; cursor:text;" />
      </div>
      <div style="width:110px;">
        <div style="opacity:.75; font-size:11px; margin-bottom:4px;">Bid $</div>
        <input data-role="bid" aria-label="Bid amount" title="Bid amount" placeholder="e.g. 64"
          value="${initialBid ? initialBid.replace(/"/g, '&quot;') : ''}"
          style="width:100%; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:white; padding:8px 10px; border-radius:8px; cursor:text;" />
      </div>
    </div>
    <div data-role="calc" style="margin-top:-2px; margin-bottom:10px; font-size:11px; color:rgba(255,255,255,0.75); line-height:1.35;">
      <div>Bid $<span data-role="calc-bid">${initialBid || '—'}</span> → all‑in <span data-role="calc-allin">${initialAllIn.total != null ? `$${Math.round(initialAllIn.total)}` : '—'}</span> (fees+ship <span data-role="calc-fees">${initialAllIn.feeSum != null ? `$${Math.round(initialAllIn.feeSum)}` : '—'}</span>)</div>
      <div>Avg30d <span data-role="calc-avg">${stats30.avg != null ? `$${Math.round(stats30.avg)}` : '—'}</span> → profit <span data-role="calc-profit">${initialProfit.profit != null ? `$${Math.round(initialProfit.profit)}` : '—'}</span> <span data-role="calc-pass">${initialProfit.ok == null ? '' : initialProfit.ok ? '(meets $15)' : '(below $15)'}</span></div>
      <div style="opacity:.7">Note: fees+ship are from the offer flow (cached) unless a “Total” is visible.</div>
    </div>

    <div style="display:flex; gap:8px;">
      <button data-role="prefill" style="flex:1; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.14); color:white; padding:9px 10px; border-radius:8px; cursor:pointer; font-weight:800;">
        Prefill bid
      </button>
      <button data-role="place" style="flex:1; background:#6366f1; border:1px solid rgba(99,102,241,0.9); color:#0b1020; padding:9px 10px; border-radius:8px; cursor:pointer; font-weight:900;">
        Place Bid
      </button>
    </div>

    <div data-role="status" style="margin-top:8px; font-size:11px; color:rgba(255,255,255,0.7);"></div>
  `;

  widget.querySelector('[data-role="open-settings"]')?.addEventListener('click', (e) => {
    try {
      e.preventDefault();
      e.stopPropagation();
      openExtensionSettingsTab();
    } catch {}
  });
  widget.querySelector('[data-role="close"]')?.addEventListener('click', () => widget.remove());
  widget.querySelector('[data-role="debug"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const nextLen = document.getElementById('__NEXT_DATA__')?.textContent?.length || 0;
      const selectedSize = getSelectedSizeFromUrl();
      const next = getNextData();
      const roots = getNextDataSearchRoots(next);
      const variantJoinProbe = selectedSize ? extractVariantMarketFromNextDataByJoin(selectedSize) : null;
      const marketSalesProbe = parseMarketDataSalesTable(5);
      const currentMarketData = window.__stockxHelperLastMarketData || marketData;
      const currentRecentSales = window.__stockxHelperLastRecentSales || recentSales;
      loadPendingOfferRequest().then((pending) => {
        console.log('🧪 StockX Helper debug dump:', {
        url: location.href,
        nextDataLength: nextLen,
        selectedSize,
        nextDataRoots: roots.map((r) => {
          try {
            if (!r) return 'null';
            if (Array.isArray(r)) return `array(len=${r.length})`;
            if (isPlainObject(r)) return `object(keys=${Object.keys(r).slice(0, 12).join(',')}${Object.keys(r).length > 12 ? ',…' : ''})`;
            return typeof r;
          } catch {
            return 'unknown';
          }
        }),
        variantJoinProbe,
        marketSalesProbe,
        marketAsksProbe: parseMarketDataAsksTable(5),
        pendingOfferRequest: pending,
        marketData: currentMarketData,
        recentSales: currentRecentSales
        });
      });
      alert('Dumped debug info to Console.');
    } catch (err) {
      console.warn('debug dump failed', err);
    }
  });

  setLastHelperData(marketData, recentSales);
  const sizeEl = widget.querySelector('[data-role="size"]');
  const bidEl = widget.querySelector('[data-role="bid"]');
  const statusEl = widget.querySelector('[data-role="status"]');

  // Track when user manually overrides size in the widget input so we don't fight them.
  try {
    window.__stockxHelperUserSizeOverride = false;
  } catch {}
  sizeEl?.addEventListener('input', () => setPreferredSize(sizeEl.value));
  sizeEl?.addEventListener('input', () => {
    try {
      window.__stockxHelperUserSizeOverride = true;
    } catch {}
  });
  bidEl?.addEventListener('input', () => setLastBid(bidEl.value));
  // Make the inputs feel "clickable": click focuses + selects the value for quick edits.
  sizeEl?.addEventListener('click', () => {
    try {
      sizeEl.focus();
      sizeEl.select?.();
    } catch {}
  });
  bidEl?.addEventListener('click', () => {
    try {
      bidEl.focus();
      bidEl.select?.();
    } catch {}
  });
  const calcUpdate = () => {
    try {
      const bidNum = Number(String(bidEl?.value || '').trim());
      const allIn = computeAllInEstimate({ offer: bidNum, rootForTotal: null });
      const profit = computeProfitCheck({ avg30d: stats30.avg, allInTotal: allIn.total, minProfit: 15 });
      const bidOut = widget.querySelector('[data-role="calc-bid"]');
      const allInOut = widget.querySelector('[data-role="calc-allin"]');
      const feesOut = widget.querySelector('[data-role="calc-fees"]');
      const avgOut = widget.querySelector('[data-role="calc-avg"]');
      const profitOut = widget.querySelector('[data-role="calc-profit"]');
      const passOut = widget.querySelector('[data-role="calc-pass"]');
      if (bidOut) bidOut.textContent = Number.isFinite(bidNum) ? String(Math.round(bidNum)) : '—';
      if (allInOut) allInOut.textContent = allIn.total != null ? `$${Math.round(allIn.total)}` : '—';
      if (feesOut) feesOut.textContent = allIn.feeSum != null ? `$${Math.round(allIn.feeSum)}` : '—';
      if (avgOut) avgOut.textContent = stats30.avg != null ? `$${Math.round(stats30.avg)}` : '—';
      if (profitOut) profitOut.textContent = profit.profit != null ? `$${Math.round(profit.profit)}` : '—';
      if (passOut) passOut.textContent = profit.ok == null ? '' : profit.ok ? '(meets $15)' : '(below $15)';
    } catch {}
  };
  bidEl?.addEventListener('input', calcUpdate);
  sizeEl?.addEventListener('input', calcUpdate);

  const assumedFeesEl = widget.querySelector('[data-role="assumed-fees"]');
  assumedFeesEl?.addEventListener('input', () => {
    const n = Number(String(assumedFeesEl.value || '').trim());
    if (!Number.isFinite(n)) return;
    setAssumedFeeSum(n);
    // Force a refresh of targets + calculator with new assumed fees.
    try {
      updateProductWidgetInPlace({ marketData: window.__stockxHelperLastMarketData || marketData, recentSales: window.__stockxHelperLastRecentSales || recentSales });
    } catch {}
  });

  // Multi-size scan controls
  widget.querySelector('[data-role="scan-sizes"]')?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await scanAllSizesForSales({ statusEl, days: 30 });
    // Refresh widget after scan
    try {
      updateProductWidgetInPlace({
        marketData: window.__stockxHelperLastMarketData || marketData,
        recentSales: window.__stockxHelperLastRecentSales || recentSales
      });
    } catch {}
  });
  widget.querySelector('[data-role="clear-scan"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      localStorage.removeItem(getScanKey());
    } catch {}
    if (statusEl) statusEl.textContent = 'Cleared size scan cache.';
    try {
      updateProductWidgetInPlace({
        marketData: window.__stockxHelperLastMarketData || marketData,
        recentSales: window.__stockxHelperLastRecentSales || recentSales
      });
    } catch {}
  });

  // Bind click handlers for bid target rows
  bindTargetsListHandlers(widget, { sizeEl, statusEl });

  widget.querySelector('[data-role="prefill"]')?.addEventListener('click', () => {
    const sizeKey = normalizeSizeKey(sizeEl?.value || getSelectedSizeBestEffort());
    const res = computePrefillBidBestEffort({ sizeKey });
    const next = res.bid;
    if (next == null || !Number.isFinite(Number(next))) {
      if (statusEl) statusEl.textContent = 'Could not compute bid yet — wait for Highest Bid to load (or open Make Offer once).';
      return;
    }
    if (bidEl) {
      bidEl.value = String(next);
      setLastBid(String(next));
      try {
        bidEl.dispatchEvent(new Event('input', { bubbles: true }));
        bidEl.dispatchEvent(new Event('change', { bubbles: true }));
      } catch {}
    }
    if (statusEl) {
      const parts = [];
      if (isPlausibleUsd(res.highestBid)) parts.push(`highestBid+1 → $${Math.round(res.highestBid) + 1}`);
      statusEl.textContent = `Prefilled bid: $${Math.round(Number(next))}${parts.length ? ` (${parts.join(', ')})` : ''}`;
    }
  });

  const placeBtn = widget.querySelector('[data-role="place"]');
  placeBtn?.addEventListener('click', async () => {
    const size = String(sizeEl?.value || '').trim();
    const bid = String(bidEl?.value || '').trim();
    if (statusEl) statusEl.textContent = 'Opening offer flow...';
    try {
      if (placeBtn) {
        placeBtn.disabled = true;
        placeBtn.style.opacity = '0.7';
        placeBtn.style.cursor = 'not-allowed';
      }
    } catch {}

    const res = await placeBidViaUi({ size, bid });
    if (statusEl) {
      if (res?.pendingNavigation) statusEl.textContent = 'Opening offer page… (will auto-fill there)';
      else if (res?.awaitingConfirm) statusEl.textContent = 'Review step complete — click “Confirm Bid” on the page to finalize.';
      else statusEl.textContent = res.ok ? 'Bid flow complete.' : `Bid failed: ${res.error}`;
    }

    try {
      if (placeBtn) {
        placeBtn.disabled = false;
        placeBtn.style.opacity = '';
        placeBtn.style.cursor = 'pointer';
      }
    } catch {}
  });

  document.body.appendChild(widget);
}

function renderRecentSalesHtml(recentSales) {
  return recentSales && recentSales.length
    ? recentSales
        .slice(0, 6)
        .map((s) => {
          const meta = [s.size, s.date].filter(Boolean).join(' • ');
          return `<div style="display:flex; justify-content:space-between; gap:10px;">
            <div style="opacity:.85; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${meta || 'Sale'}</div>
            <div style="font-weight:800;">$${s.price}</div>
          </div>`;
        })
        .join('')
    : `<div style="opacity:.75">Opening “View Market Data”…</div>`;
}

function parseYmdToLocalDate(ymd) {
  if (typeof ymd !== 'string') return null;
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(y, mo, d);
}

function getSaleLocalDateBestEffort(sale) {
  try {
    // Prefer explicit YYYY-MM-DD
    const d1 = parseYmdToLocalDate(sale?.date);
    if (d1) return d1;

    // Fall back to parsing any date-like text in the raw row string (e.g. "01/25/26, 4:23 PM")
    const raw = String(sale?.raw || '');
    const parsed = parseDateFromText(raw);
    if (parsed) return parsed;

    return null;
  } catch {
    return null;
  }
}

function computeLastNDaysAverageSale({ recentSales, selectedSizeKey, days }) {
  try {
    if (!Array.isArray(recentSales) || recentSales.length === 0) return { avg: null, count: 0 };
    const now = new Date();
    const cutoff = now.getTime() - Number(days || 30) * 24 * 60 * 60 * 1000;
    const wanted = normalizeSizeKey(selectedSizeKey);

    const prices = [];
    for (const s of recentSales) {
      const price = typeof s?.price === 'number' ? s.price : toNumberMaybe(s?.price);
      if (!isPlausibleUsd(price)) continue;

      // Filter to selected size when we have a size string.
      const saleSizeKey = normalizeSizeKey(s?.size);
      if (wanted && saleSizeKey && !sizeKeyMatches(saleSizeKey, wanted)) continue;

      // Date stored as YYYY-MM-DD; fall back to parsing raw date strings.
      const d = getSaleLocalDateBestEffort(s);
      if (!d) continue;
      if (d.getTime() < cutoff) continue;

      prices.push(price);
    }

    if (prices.length === 0) return { avg: null, count: 0 };
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    return { avg, count: prices.length };
  } catch {
    return { avg: null, count: 0 };
  }
}

function normalizeSizeLabel(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function computeSizeStatsLastNDays({ recentSales, days }) {
  try {
    const now = new Date();
    const cutoff = now.getTime() - Number(days || 30) * 24 * 60 * 60 * 1000;
    const by = new Map(); // label -> { count, sum }

    for (const sale of Array.isArray(recentSales) ? recentSales : []) {
      const d = getSaleLocalDateBestEffort(sale);
      if (!d || d.getTime() < cutoff) continue;
      const price = typeof sale?.price === 'number' ? sale.price : toNumberMaybe(sale?.price);
      if (!isPlausibleUsd(price)) continue;

      const label = normalizeSizeLabel(sale?.size);
      if (!label) continue;
      const cur = by.get(label) || { count: 0, sum: 0 };
      cur.count += 1;
      cur.sum += price;
      by.set(label, cur);
    }

    const stats = [];
    for (const [sizeLabel, v] of by.entries()) {
      if (!v.count) continue;
      stats.push({
        sizeLabel,
        count: v.count,
        avg: v.sum / v.count
      });
    }
    stats.sort((a, b) => b.count - a.count || b.avg - a.avg);
    return stats;
  } catch {
    return [];
  }
}

function computeSizeTargetsLastNDays({ recentSales, days = 30, minSales = 4, minProfit = 15, feeSum = null }) {
  const stats = computeSizeStatsLastNDays({ recentSales, days });
  const fs = Number(feeSum);

  return stats.map((s) => {
    const avg = Number(s.avg);
    const count = Number(s.count) || 0;
    const maxAllIn = Number.isFinite(avg) ? Math.floor(avg - minProfit) : null;
    const maxBid =
      Number.isFinite(maxAllIn) && maxAllIn > 0 && Number.isFinite(fs)
        ? Math.max(1, Math.floor(maxAllIn - fs))
        : null;
    const eligible = count >= minSales;

    return {
      sizeLabel: s.sizeLabel,
      count,
      avg,
      eligible,
      maxAllInBid: Number.isFinite(maxAllIn) ? maxAllIn : null,
      maxBid
    };
  });
}

function computeProfitScanner({ recentSales, days = 30, minSales = 4, minProfit = 15 }) {
  // Backwards-compatible: only return eligible sizes; used by Place Bid guardrail.
  return computeSizeTargetsLastNDays({ recentSales, days, minSales, minProfit })
    .filter((s) => s.eligible)
    .filter((s) => Number.isFinite(s.maxAllInBid) && s.maxAllInBid > 0);
}

function renderBidTargetsHtml(targets, { limit = 80, feeSum = null } = {}) {
  try {
    const fs = Number(feeSum);
    const base = Array.isArray(targets) ? targets : [];
    // Best→worst sorting:
    // - If we know fees, sort by maxBid desc
    // - Else sort by maxAllIn desc
    // - Tie-break by sales count desc, then avg desc
    const sorted = [...base].sort((a, b) => {
      const aMaxAllIn = Number(a?.maxAllInBid);
      const bMaxAllIn = Number(b?.maxAllInBid);
      const aMaxBid = Number.isFinite(fs) && Number.isFinite(aMaxAllIn) ? aMaxAllIn - fs : null;
      const bMaxBid = Number.isFinite(fs) && Number.isFinite(bMaxAllIn) ? bMaxAllIn - fs : null;

      const aScore = Number.isFinite(aMaxBid) ? aMaxBid : Number.isFinite(aMaxAllIn) ? aMaxAllIn : -Infinity;
      const bScore = Number.isFinite(bMaxBid) ? bMaxBid : Number.isFinite(bMaxAllIn) ? bMaxAllIn : -Infinity;
      // Eligible sizes first
      const aEligible = !!a?.eligible;
      const bEligible = !!b?.eligible;
      if (aEligible !== bEligible) return aEligible ? -1 : 1;

      if (bScore !== aScore) return bScore - aScore;

      const aCount = Number(a?.count) || 0;
      const bCount = Number(b?.count) || 0;
      if (bCount !== aCount) return bCount - aCount;

      const aAvg = Number(a?.avg) || 0;
      const bAvg = Number(b?.avg) || 0;
      return bAvg - aAvg;
    });

    const rows = sorted.slice(0, limit);
    if (rows.length === 0) {
      return `<div style="opacity:.75">No sales in last 30d.</div>`;
    }
    return rows
      .map((s) => {
        const avg = Number.isFinite(s.avg) ? Math.round(s.avg) : null;
        const maxAllIn = Number.isFinite(s.maxAllInBid) ? Math.round(s.maxAllInBid) : null;
        const maxBid =
          Number.isFinite(s.maxBid) ? Math.round(s.maxBid) :
          Number.isFinite(fs) && Number.isFinite(s.maxAllInBid) ? Math.max(1, Math.floor(s.maxAllInBid - fs)) :
          null;
        const count = Number.isFinite(s.count) ? s.count : 0;
        const safeSize = String(s.sizeLabel || '').replace(/"/g, '&quot;');
        const eligible = !!s.eligible;
        const hb = Number.isFinite(Number(s.highestBid)) ? Math.round(Number(s.highestBid)) : null;
        const suggestedBid =
          Number.isFinite(Number(s.suggestedBid)) ? Math.round(Number(s.suggestedBid)) :
          (hb != null ? hb + 1 : null);
        const canBid =
          (typeof s.canBid === 'boolean') ? s.canBid :
          (eligible && suggestedBid != null && maxBid != null && suggestedBid <= maxBid);
        return `
          <div data-role="target-row" data-size="${safeSize}"
            style="width:100%; display:flex; justify-content:space-between; gap:10px; padding:7px 8px; border-radius:8px; border:1px solid rgba(255,255,255,0.10); background:rgba(255,255,255,0.04); color:white;">
            <div style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              <span style="font-weight:900;">${safeSize}</span>
              <span style="opacity:.75;"> • ${count} sales${eligible ? '' : ' (need 4)'}</span>
            </div>
            <div style="text-align:right; white-space:nowrap;">
              <div style="font-weight:900;">max bid ${maxBid != null ? `$${maxBid}` : '—'}</div>
              <div style="opacity:.75; font-size:11px;">all-in ${maxAllIn != null ? `$${maxAllIn}` : '—'} • avg ${avg != null ? `$${avg}` : '—'}${hb != null ? ` • HB $${hb}` : ''}</div>
              <div style="margin-top:6px; display:flex; justify-content:flex-end; gap:8px;">
                <button data-role="target-select" data-size="${safeSize}"
                  style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.10); color:white; padding:4px 8px; border-radius:8px; cursor:pointer; font-weight:800;">
                  Select
                </button>
                <button data-role="target-bid" data-size="${safeSize}" data-bid="${suggestedBid != null ? String(suggestedBid) : ''}" ${canBid ? '' : 'disabled'}
                  style="background:${canBid ? '#22c55e' : 'rgba(255,255,255,0.06)'}; border:1px solid rgba(255,255,255,0.10); color:${canBid ? '#052e14' : 'rgba(255,255,255,0.7)'}; padding:4px 10px; border-radius:8px; cursor:${canBid ? 'pointer' : 'not-allowed'}; font-weight:900;">
                  Bid ${suggestedBid != null ? `$${suggestedBid}` : ''}
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  } catch {
    return `<div style="opacity:.75">No targets.</div>`;
  }
}

function setSizeOnPageBestEffort(sizeLabel) {
  try {
    const sizeKey = normalizeSizeKey(sizeLabel);
    if (!sizeKey) return false;
    const u = new URL(location.href);
    u.searchParams.set('size', sizeKey);
    history.pushState({}, '', u.toString());
    try {
      handleStockxUrlChange('setSizeOnPage');
    } catch {}
    return true;
  } catch {
    return false;
  }
}

function findSizeDropdownTrigger() {
  try {
    // StockX PDP size selector (chakra menu)
    const menuBtn = document.querySelector('#menu-button-pdp-size-selector');
    if (menuBtn) return menuBtn;

    // Heuristic: find a visible "Size:" label and then a nearby button (often a dropdown)
    const labels = Array.from(document.querySelectorAll('div,span,p')).slice(0, 2000);
    const sizeLabelEl = labels.find((el) => safeText(el).trim().toLowerCase() === 'size:');
    if (sizeLabelEl) {
      const container = sizeLabelEl.closest('div,section') || sizeLabelEl.parentElement;
      const btn = container?.querySelector?.('button,[role="button"],[role="combobox"]');
      if (btn) return btn;
    }
    // Fallback: any visible combobox
    const combo = document.querySelector('[role="combobox"]');
    return combo || null;
  } catch {
    return null;
  }
}

function getSizeMenuRoot() {
  try {
    const byId = document.querySelector('#menu-list-pdp-size-selector');
    if (byId) return byId;
    return null;
  } catch {
    return null;
  }
}

async function openSizeMenu() {
  const trigger = findSizeDropdownTrigger();
  if (!trigger) return null;
  try {
    trigger.click();
  } catch {}
  return await waitForElement(() => getSizeMenuRoot(), 2500);
}

function closeSizeMenu() {
  try {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  } catch {}
}

async function getAvailableSizesFromPicker() {
  try {
    const menu = await openSizeMenu();
    if (!menu) return [];

    const items = Array.from(menu.querySelectorAll('[role="menuitemradio"]'));
    if (items.length) {
      const sizes = items
        .map((it) => {
          const labelEl = it.querySelector('[data-testid="selector-label"]');
          return safeText(labelEl || it);
        })
        .map((t) => t.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .filter((t) => t.toLowerCase() !== 'all')
        .filter((t) => /\d/.test(t));
      closeSizeMenu();
      return Array.from(new Set(sizes));
    }

    // Fallback: role=option list
    const opts = document.querySelectorAll('[role="option"]');
    const sizes = Array.from(opts)
      .map((el) => safeText(el))
      .filter(Boolean)
      .map((t) => t.replace(/\s+/g, ' ').trim())
      .filter((t) => t.toLowerCase() !== 'all')
      .filter((t) => /\d/.test(t));
    closeSizeMenu();
    return Array.from(new Set(sizes));
  } catch {
    return [];
  }
}

async function getSizeOptionsFromMenu() {
  try {
    const menu = await openSizeMenu();
    if (!menu) return [];
    const items = Array.from(menu.querySelectorAll('[role="menuitemradio"]'));
    const out = items
      .map((it) => {
        const labelEl = it.querySelector('[data-testid="selector-label"]');
        const secondaryEl = it.querySelector('[data-testid="selector-secondary-label"]');
        const sizeLabel = safeText(labelEl || it).replace(/\s+/g, ' ').trim();
        const secondaryText = safeText(secondaryEl).trim();
        const secondaryPrice = parsePriceFromText(secondaryText);
        return {
          sizeLabel,
          highestBid: isPlausibleUsd(secondaryPrice) ? secondaryPrice : null
        };
      })
      .filter((o) => o.sizeLabel && o.sizeLabel.toLowerCase() !== 'all' && /\d/.test(o.sizeLabel));
    closeSizeMenu();
    // dedupe by label
    const seen = new Set();
    const deduped = [];
    for (const o of out) {
      const k = o.sizeLabel;
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(o);
    }
    return deduped;
  } catch {
    try { closeSizeMenu(); } catch {}
    return [];
  }
}

function computeTargetsFromScanResults({ scanResults, feeSum, minSales = 4, minProfit = 15 }) {
  try {
    const out = [];
    for (const r of scanResults || []) {
      const count = Number(r.count) || 0;
      const avg = Number(r.avg);
      const highestBid = Number(r.highestBid);
      const eligible = count >= minSales && Number.isFinite(avg) && avg > 0;
      const maxAllInBid = eligible ? Math.floor(avg - minProfit) : null;
      const maxBid = eligible && Number.isFinite(feeSum) ? Math.floor(maxAllInBid - feeSum) : (eligible ? null : null);

      // Suggest bid = highestBid + 1 when we have it
      const suggestedBid = Number.isFinite(highestBid) && highestBid > 0 ? Math.floor(highestBid + 1) : null;
      const canBid = eligible && Number.isFinite(maxBid) && Number.isFinite(suggestedBid) && suggestedBid <= maxBid;

      out.push({
        sizeLabel: r.sizeLabel || '',
        count,
        avg: Number.isFinite(avg) ? avg : null,
        highestBid: Number.isFinite(highestBid) ? highestBid : null,
        eligible,
        maxAllInBid: Number.isFinite(maxAllInBid) ? maxAllInBid : null,
        maxBid: Number.isFinite(maxBid) ? maxBid : null,
        suggestedBid,
        canBid
      });
    }

    // best to worst = highest maxBid first
    out.sort((a, b) => (b.maxBid ?? -Infinity) - (a.maxBid ?? -Infinity));
    return out;
  } catch {
    return [];
  }
}

async function selectSizeFromMenu(sizeLabel) {
  try {
    const wanted = String(sizeLabel || '').trim().toLowerCase();
    if (!wanted) return false;
    const menu = await openSizeMenu();
    if (!menu) return false;
    const items = Array.from(menu.querySelectorAll('[role="menuitemradio"]'));
    const match = items.find((it) => {
      const labelEl = it.querySelector('[data-testid="selector-label"]');
      const t = safeText(labelEl || it).trim().toLowerCase();
      return t === wanted;
    });
    if (!match) {
      closeSizeMenu();
      return false;
    }
    try {
      match.click();
    } catch {}
    await new Promise((r) => setTimeout(r, 700));
    return true;
  } catch {
    return false;
  }
}

function getMarketDataDialog() {
  try {
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

    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]'));
    if (!dialogs.length) return null;

    // Prefer the dialog that actually looks like the Market Data modal.
    // IMPORTANT: Do NOT fall back to "any dialog" — StockX often shows unrelated modals (e.g. "Open App")
    // that would break tab detection and cause bids/asks parsing to read 0.
    const scored = dialogs
      .map((d) => {
        let score = 0;
        const tabs = Array.from(d.querySelectorAll('[role="tab"]')).map((t) => safeText(t).trim().toLowerCase());
        const hasTabs = tabs.includes('asks') || tabs.includes('bids') || tabs.includes('sales');
        if (hasTabs) score += 5;
        if (d.querySelector?.('[data-component="ViewMarketActivity"]')) score += 2;
        if ((d.querySelectorAll?.('[data-component="ViewMarketActivity"] tbody tr')?.length || 0) > 0) score += 2;
        const t = safeText(d).toLowerCase();
        if (t.includes('sale price') || t.includes('all sales')) score += 1;
        if (isVisibleEl(d)) score += 1;
        return { d, score };
      })
      .sort((a, b) => b.score - a.score);

    // Only return a dialog if it clears a minimum score threshold.
    // Score>=5 implies it has Market tabs; Score>=3 implies market-ish structure.
    if (Number(scored[0]?.score || 0) >= 3) return scored[0].d;
    return null;
  } catch {
    return null;
  }
}

function findTabButtonByLabel(dialog, labelLower) {
  try {
    const scope = dialog || document;
    const tabs = Array.from(scope.querySelectorAll('[role="tab"]'));
    return tabs.find((b) => safeText(b).trim().toLowerCase() === labelLower) || null;
  } catch {
    return null;
  }
}

function clickElBestEffort(el) {
  try {
    if (!el) return false;
    try {
      el.scrollIntoView?.({ block: 'center', inline: 'center' });
    } catch {}
    try {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return true;
    } catch {
      try {
        el.click();
        return true;
      } catch {
        return false;
      }
    }
  } catch {
    return false;
  }
}

async function ensureMarketDataTabOpen(labelLower) {
  try {
    // Ensure modal is open
    const dialog = (await openMarketDataDialogBestEffort(16000)) || getMarketDataDialog();
    if (!dialog) return null;

    // Click requested tab by text (ids are randomized)
    const tabBtn = findTabButtonByLabel(dialog, labelLower);
    if (tabBtn && tabBtn.getAttribute('aria-selected') !== 'true') {
      clickElBestEffort(tabBtn);
    }

    // Wait for at least some rows to appear under ViewMarketActivity.
    await waitForElement(
      () => (document.querySelectorAll('[data-component="ViewMarketActivity"] tbody tr').length ? true : null),
      9000
    );

    return dialog;
  } catch {
    return null;
  }
}

async function readMarketDataTablesOnce(
  { maxAsks = 250, maxBids = 250, maxSales = 450, openTimeoutMs = 9000, onStage, onAttempt } = {}
) {
  const foundMarketDataButton =
    !!Array.from(document.querySelectorAll('button.chakra-button')).find((b) =>
      /(view\s+)?(all\s+)?market\s+data/i.test(safeText(b).trim())
    ) ||
    !!Array.from(document.querySelectorAll('button, a, [role="button"]')).find((b) => {
      const t = safeText(b).trim();
      const aria = String(b?.getAttribute?.('aria-label') || '');
      const testid = String(b?.getAttribute?.('data-testid') || '');
      return /(view\s+)?(all\s+)?market\s+data/i.test(t) || /market\s+data/i.test(aria) || (/market/i.test(testid) && /data/i.test(testid));
    }) ||
    !!findButtonByText(/(view\s+)?(all\s+)?market\s+data/i);

  const openDebug = { debugVersion: 2, foundMarketDataButton, attempts: 0, foundButton: false, clicked: false, opened: false, openedVia: '' };
  onStage?.('market data', 'opening');
  const opened = await openMarketDataDialogBestEffort(openTimeoutMs, { debug: openDebug, onAttempt });
  // Prefer the handle returned by openMarketDataDialogBestEffort; getMarketDataDialog() can be null
  // (or could otherwise pick up an unrelated modal).
  const dialog = opened || getMarketDataDialog();
  if (!opened) {
    return {
      dialog: null,
      foundMarketDataButton,
      openedMarketData: false,
      openDebug,
      tabDebug: null,
      asks: [],
      bids: [],
      sales: []
    };
  }

  // If Market Data rendered without a role=dialog (rare), still proceed with a doc-scoped tab lookup.
  const tabScope = dialog && (dialog.getAttribute?.('role') === 'dialog' || dialog.getAttribute?.('aria-modal') === 'true') ? dialog : document;

  const getActiveTabLabel = () => {
    try {
      const activeInDialog = tabScope.querySelector?.('[role="tab"][aria-selected="true"]') || null;
      const labelInDialog = safeText(activeInDialog).trim().toLowerCase();
      if (labelInDialog) return labelInDialog;
    } catch {}
    try {
      const activeInDoc = document.querySelector?.('[role="tab"][aria-selected="true"]') || null;
      const labelInDoc = safeText(activeInDoc).trim().toLowerCase();
      if (labelInDoc) return labelInDoc;
    } catch {}
    return '';
  };

  const findTabBtn = (labelLower) => {
    try {
      const inDialog = findTabButtonByLabel(tabScope, labelLower);
      if (inDialog) return inDialog;
    } catch {}
    try {
      return findTabButtonByLabel(document, labelLower);
    } catch {
      return null;
    }
  };

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

  const getTabPanelFor = (labelLower) => {
    try {
      const scope = tabScope || document;
      const tab = findTabBtn(labelLower) || scope.querySelector?.('[role="tab"][aria-selected="true"]') || null;
      const ctl = tab?.getAttribute?.('aria-controls') || '';
      if (ctl) {
        const panel = document.getElementById(ctl);
        if (panel) return panel;
      }
      const panels = Array.from(scope.querySelectorAll?.('[role="tabpanel"]') || []);
      const vis = panels.find(isVisibleEl);
      if (vis) return vis;
      return scope.querySelector?.('[data-component="ViewMarketActivity"]') || scope;
    } catch {
      return tabScope || document;
    }
  };

  const lastClickByTab = {};

  const waitForTabReady = async (labelLower, timeoutMs = 6500) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const activeLabel = getActiveTabLabel();
      if (activeLabel !== labelLower) {
        const tabBtn = findTabBtn(labelLower);
        const last = Number(lastClickByTab[labelLower] || 0);
        if (tabBtn && Date.now() - last > 850) {
          clickElBestEffort(tabBtn);
          lastClickByTab[labelLower] = Date.now();
        }
      }
      const panel = getTabPanelFor(labelLower);
      const sampleText = safeText(panel).toLowerCase().slice(0, 2500);
      // Do NOT require a price to exist (some items have 0 rows). Just detect that the correct tab UI is present.
      const ok =
        labelLower === 'asks'
          ? (sampleText.includes('ask') && (sampleText.includes('size') || sampleText.includes('quantity') || sampleText.includes('ask price')))
          : labelLower === 'bids'
            ? (sampleText.includes('bid') && (sampleText.includes('size') || sampleText.includes('quantity') || sampleText.includes('bid price')))
            : (sampleText.includes('date') && (sampleText.includes('sale price') || sampleText.includes('sale')));
      // If aria-selected is exposed, require it; otherwise accept ok by panel content.
      const activeNow = getActiveTabLabel();
      const activeOk = activeNow ? activeNow === labelLower : true;
      if (ok && activeOk) return true;
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  };

  const waitForRowsToSettle = async (timeoutMs = 4500) => {
    try {
      const start = Date.now();
      let last = -1;
      let stableTicks = 0;
      while (Date.now() - start < timeoutMs) {
        const root = tabScope.querySelector('[data-component="ViewMarketActivity"]') || tabScope;
        const rows = root.querySelectorAll('tbody tr');
        const n = rows ? rows.length : 0;
        if (n > 0) {
          if (n === last) stableTicks += 1;
          else stableTicks = 0;
          last = n;
          // Require two stable polls (helps avoid parsing mid-render)
          if (stableTicks >= 2) return true;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      return false;
    } catch {
      return false;
    }
  };

  // Capture the currently active tab first (common when the modal is already open), then the remaining tabs.
  const active = getActiveTabLabel();
  const allTabs = ['sales', 'bids', 'asks'];
  const order = active && allTabs.includes(active) ? [active, ...allTabs.filter((t) => t !== active)] : ['sales', 'bids', 'asks'];

  const out = { asks: [], bids: [], sales: [] };
  const tabDebug = { activeAtStart: active, order, waits: {}, parsed: {} };

  const findClickableTabLikeEl = (labelLower) => {
    // StockX tab markup changes frequently; fall back to any clickable with matching label text.
    const scope = tabScope || document;
    const candidates = Array.from(scope.querySelectorAll('[role="tab"],button,a,[role="button"]'));
    const exact = candidates.find((el) => safeText(el).trim().toLowerCase() === labelLower);
    if (exact) return exact;
    const loose = candidates.find((el) => safeText(el).trim().toLowerCase().includes(labelLower));
    return loose || null;
  };

  const tryActivateTab = async (labelLower) => {
    try {
      const activeLabel = getActiveTabLabel();
      if (activeLabel === labelLower) return true;
      const tabBtn = findTabBtn(labelLower) || findClickableTabLikeEl(labelLower);
      const last = Number(lastClickByTab[labelLower] || 0);
      if (tabBtn && Date.now() - last > 850) {
        clickElBestEffort(tabBtn);
        lastClickByTab[labelLower] = Date.now();
      }
      // Give StockX a beat to transition/render the panel before parsing.
      await new Promise((r) => setTimeout(r, 650));
      return true;
    } catch {
      return false;
    }
  };

  const parseForTab = (labelLower) => {
    if (labelLower === 'sales') return parseMarketDataSalesTable(maxSales);
    if (labelLower === 'bids') return parseMarketDataBidsTable(maxBids, { expectedTabLabel: 'bids', root: getTabPanelFor('bids') });
    if (labelLower === 'asks') return parseMarketDataAsksTable(maxAsks, { expectedTabLabel: 'asks', root: getTabPanelFor('asks') });
    return [];
  };

  const waitForTabDataBestEffort = async (labelLower, timeoutMs = 8500) => {
    // Poll until the parser can see rows, but avoid parsing mid-transition.
    const start = Date.now();
    let lastLen = -1;
    let stable = 0;
    while (Date.now() - start < timeoutMs) {
      await tryActivateTab(labelLower);
      await waitForTabReady(labelLower, 2200);
      await new Promise((r) => setTimeout(r, 350));
      const rows = parseForTab(labelLower);
      const len = Array.isArray(rows) ? rows.length : 0;
      if (len > 0) return { ok: true, rows };
      if (len === lastLen) stable += 1;
      else stable = 0;
      lastLen = len;

      // Some StockX tabs lazy-render rows in a virtualized scroller. Nudge-scroll to force render.
      try {
        if (labelLower === 'asks' || labelLower === 'bids') {
          const panel = getTabPanelFor(labelLower);
          const scrollers = Array.from(panel?.querySelectorAll?.('*') || []).filter((el) => {
            try {
              if (!el) return false;
              const sh = el.scrollHeight || 0;
              const ch = el.clientHeight || 0;
              if (sh <= ch + 10) return false;
              const cs = window.getComputedStyle?.(el);
              const oy = String(cs?.overflowY || '');
              return oy === 'auto' || oy === 'scroll';
            } catch {
              return false;
            }
          });
          const scroller = scrollers[0] || panel;
          if (scroller && typeof scroller.scrollTop === 'number') {
            scroller.scrollTop = Math.min((scroller.scrollTop || 0) + 420, (scroller.scrollHeight || 0));
            await new Promise((r) => setTimeout(r, 350));
            scroller.scrollTop = Math.max((scroller.scrollTop || 0) - 210, 0);
          }
        }
      } catch {}

      await new Promise((r) => setTimeout(r, stable >= 2 ? 650 : 450));
    }
    return { ok: false, rows: [] };
  };

  for (const tab of order) {
    onStage?.('market data', tab);
    const res = await waitForTabDataBestEffort(tab, tab === 'sales' ? 9000 : 7500);
    tabDebug.waits[tab] = !!res.ok;
    if (tab === 'sales') out.sales = res.rows;
    else if (tab === 'bids') out.bids = res.rows;
    else if (tab === 'asks') out.asks = res.rows;
    tabDebug.parsed[tab] = tab === 'sales' ? out.sales.length : tab === 'bids' ? out.bids.length : out.asks.length;
  }

  const sales = out.sales;
  const bids = out.bids;
  const asks = out.asks;

  try {
    await closeMarketDataDialog(getMarketDataDialog() || dialog);
  } catch {}

  return { dialog, foundMarketDataButton, openedMarketData: true, openDebug, tabDebug, asks, bids, sales };
}

async function ensureMarketDataSalesOpen() {
  try {
    return await ensureMarketDataTabOpen('sales');
  } catch {
    return null;
  }
}

async function ensureMarketDataAsksOpen() {
  try {
    return await ensureMarketDataTabOpen('asks');
  } catch {
    return null;
  }
}

async function ensureMarketDataBidsOpen() {
  try {
    return await ensureMarketDataTabOpen('bids');
  } catch {
    return null;
  }
}

async function closeMarketDataDialog(dialog) {
  try {
    const d = dialog || document.querySelector('[role="dialog"], [aria-modal="true"]');
    if (!d) return;
    const closeBtn = d.querySelector('button[aria-label="Close"]');
    if (closeBtn) {
      try { closeBtn.click(); } catch {}
    }
  } catch {}
}

function getScanKey() {
  const slug = getProductSlugFromUrl();
  return slug ? `stockxScan::${slug}` : 'stockxScan::unknown';
}

function loadSizeScanResults() {
  try {
    const key = getScanKey();
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.results) return null;
    // expire after 30 minutes
    if (typeof parsed.ts === 'number' && Date.now() - parsed.ts > 30 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveSizeScanResults(payload) {
  try {
    const key = getScanKey();
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), ...payload }));
  } catch {}
}

async function scanAllSizesForSales({ statusEl, days = 30 }) {
  if (window.__stockxScanInProgress) return;
  window.__stockxScanInProgress = true;
  try {
    const options = await getSizeOptionsFromMenu();
    const sizes = options.map((o) => o.sizeLabel);
    if (!sizes.length) {
      if (statusEl) statusEl.textContent = 'Could not read size list. Open the size dropdown once, then click Scan sizes again.';
      return;
    }
    const ok = window.confirm(`Scan ${sizes.length} sizes? This will switch sizes and open Market Data repeatedly.`);
    if (!ok) return;

    const results = [];
    for (let i = 0; i < sizes.length; i++) {
      const s = sizes[i];
      const opt = options.find((o) => o.sizeLabel === s);
      if (statusEl) statusEl.textContent = `Scanning size ${s} (${i + 1}/${sizes.length})…`;
      const didSelect = await selectSizeFromMenu(s);
      if (!didSelect) {
        setSizeOnPageBestEffort(s);
        await new Promise((r) => setTimeout(r, 1500));
      } else {
        await new Promise((r) => setTimeout(r, 900));
      }

      const dialog = await ensureMarketDataSalesOpen();
      const sales = parseMarketDataSalesTable(250);
      await closeMarketDataDialog(dialog);

      const stats = computeLastNDaysAverageSale({ recentSales: sales, selectedSizeKey: normalizeSizeKey(s), days });
      results.push({
        sizeLabel: s,
        count: stats.count,
        avg: stats.avg,
        highestBid: opt?.highestBid ?? null
      });
      // brief pause to avoid hammering
      await new Promise((r) => setTimeout(r, 600));
    }

    saveSizeScanResults({ results, days });
    if (statusEl) statusEl.textContent = `Scan complete (${results.length} sizes).`;
  } finally {
    window.__stockxScanInProgress = false;
  }
}

function bindTargetsListHandlers(widget, { sizeEl, statusEl }) {
  try {
    widget.querySelectorAll('[data-role="target-select"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const sizeLabel = btn.getAttribute('data-size') || '';
        if (!sizeLabel) return;
        try { window.__stockxHelperUserSizeOverride = true; } catch {}
        const nextSize = normalizeSizeKey(sizeLabel) || sizeLabel;
        if (sizeEl) sizeEl.value = nextSize;
        setPreferredSize(nextSize);
        setSizeOnPageBestEffort(sizeLabel);
        if (statusEl) statusEl.textContent = `Selected size: ${sizeLabel}`;
      });
    });

    widget.querySelectorAll('[data-role="target-bid"]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const sizeLabel = btn.getAttribute('data-size') || '';
        const bidStr = btn.getAttribute('data-bid') || '';
        const bid = Number(bidStr);
        if (!sizeLabel || !Number.isFinite(bid) || bid <= 0) return;
        const slug = getProductSlugFromUrl();
        const sizeKey = normalizeSizeKey(sizeLabel);
        if (!slug || !sizeKey) return;
        const ok = window.confirm(`Open a new tab and place a bid for size ${sizeLabel} at $${Math.round(bid)}?`);
        if (!ok) return;
        if (statusEl) statusEl.textContent = `Opening bid tab for ${sizeLabel}…`;
        const res = await openBidInNewTab({ slug, sizeKey, bid: Math.round(bid) });
        if (statusEl) statusEl.textContent = res.ok ? `Opened bid tab for ${sizeLabel}.` : `Bid tab failed: ${res.error}`;
      });
    });
  } catch {}
}

function findProfitTargetForSize({ scanner, selectedSizeKey }) {
  try {
    const wanted = normalizeSizeKey(selectedSizeKey);
    if (!wanted) return null;
    for (const s of Array.isArray(scanner) ? scanner : []) {
      const sk = normalizeSizeKey(s.sizeLabel);
      if (sk && sizeKeyMatches(sk, wanted)) return s;
    }
    return null;
  } catch {
    return null;
  }
}

function findAllInTotal(root = document) {
  try {
    const scope = root || document;

    // 1) Look for definition list "Total" -> value
    const dts = Array.from(scope.querySelectorAll('dt'));
    for (const dt of dts) {
      const t = safeText(dt).toLowerCase();
      if (t !== 'total') continue;
      const dd = dt.nextElementSibling;
      const n = parsePriceFromText(safeText(dd));
      if (isPlausibleUsd(n)) return n;
    }

    // 2) Look for an element whose text is exactly "Total" and parse nearby
    const labels = Array.from(scope.querySelectorAll('div,span,p,strong,b')).slice(0, 2500);
    for (const el of labels) {
      const t = safeText(el).toLowerCase();
      if (t !== 'total' && t !== 'total:') continue;
      const sib = el.nextElementSibling;
      const n1 = parsePriceFromText(safeText(sib));
      if (isPlausibleUsd(n1)) return n1;
      const parentText = safeText(el.parentElement);
      const m = parentText.match(/total\s*:?\s*\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i);
      if (m?.[1]) {
        const n2 = Number(m[1].replace(/,/g, ''));
        if (isPlausibleUsd(n2)) return n2;
      }
    }

    // 3) Regex scan
    const text = safeText(scope);
    const m = text.match(/total\s*:?\s*\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i);
    if (m?.[1]) {
      const n = Number(m[1].replace(/,/g, ''));
      if (isPlausibleUsd(n)) return n;
    }
    return null;
  } catch {
    return null;
  }
}

function estimateAllInTotalFromFeeLines(root, offerAmount) {
  try {
    const scope = root || document;
    const offer = Number(offerAmount);
    if (!Number.isFinite(offer) || offer <= 0) return null;

    const feeLabels = [
      'processing fee',
      'shipping',
      'shipping fee',
      'delivery',
      'tax',
      'taxes',
      'authentication',
      'payment processing fee',
      'transaction fee',
      'service fee'
    ];

    const labels = Array.from(scope.querySelectorAll('p,div,span,dt')).slice(0, 4000);
    let feeSum = 0;
    const breakdown = {};

    for (const el of labels) {
      const t = safeText(el).toLowerCase();
      if (!t) continue;
      if (!feeLabels.some((lbl) => t === lbl || t.startsWith(lbl))) continue;

      const container = el.closest('div,section,dl,li') || el.parentElement;
      if (!container) continue;

      // Find the first $ amount in the container excluding the offer itself.
      const prices = Array.from(container.querySelectorAll('p,span,dd,div'))
        .map((x) => parsePriceFromText(safeText(x)))
        .filter((n) => isPlausibleUsd(n));
      if (prices.length === 0) continue;

      // Fee values are usually small; pick the smallest plausible number in the container.
      const fee = Math.min(...prices);
      if (fee > 0 && fee < 200) {
        feeSum += fee;
        // Keep an explicit breakdown for the most common labels.
        if (t === 'shipping' || t.startsWith('shipping')) breakdown.shipping = fee;
        else if (t === 'processing fee') breakdown.processingFee = fee;
        else if (t === 'tax' || t === 'taxes') breakdown.tax = fee;
        else breakdown[t] = fee;
      }
    }

    const total = offer + feeSum;
    if (!isPlausibleUsd(total)) return null;
    try {
      // Cache the latest fee sum so the widget can show "if bid $X then all-in ~$Y"
      window.__stockxLastFeeSum = feeSum;
      window.__stockxLastFeeSumTs = Date.now();
      window.__stockxLastFeeBreakdown = breakdown;
    } catch {}
    return total;
  } catch {
    return null;
  }
}

function getCachedFeeBreakdown(maxAgeMs = 5 * 60 * 1000) {
  try {
    const ts = Number(window.__stockxLastFeeSumTs);
    const bd = window.__stockxLastFeeBreakdown;
    if (!Number.isFinite(ts) || !bd) return null;
    if (Date.now() - ts > maxAgeMs) return null;
    return bd;
  } catch {
    return null;
  }
}

function getCachedFeeSum(maxAgeMs = 5 * 60 * 1000) {
  try {
    const ts = Number(window.__stockxLastFeeSumTs);
    const sum = Number(window.__stockxLastFeeSum);
    if (!Number.isFinite(ts) || !Number.isFinite(sum)) return null;
    if (Date.now() - ts > maxAgeMs) return null;
    return sum;
  } catch {
    return null;
  }
}

function getAssumedFeeSum() {
  try {
    const v = localStorage.getItem('stockxExtensionAssumedFees');
    const n = v == null ? 21 : Number(String(v).trim());
    if (!Number.isFinite(n) || n < 0 || n > 200) return 21;
    return n;
  } catch {
    return 21;
  }
}

function setAssumedFeeSum(n) {
  try {
    const v = Number(n);
    if (!Number.isFinite(v) || v < 0 || v > 200) return;
    localStorage.setItem('stockxExtensionAssumedFees', String(v));
  } catch {}
}

function getEffectiveFeeSum() {
  // Prefer real captured fees, otherwise use assumed fallback.
  const cached = getCachedFeeSum();
  if (Number.isFinite(Number(cached))) return Number(cached);
  return getAssumedFeeSum();
}

function parseFeeBreakdownFromDom(root = document) {
  try {
    const scope = root || document;
    const feeLabels = [
      'processing fee',
      'shipping',
      'shipping fee',
      'delivery',
      'tax',
      'taxes',
      'authentication',
      'payment processing fee',
      'transaction fee',
      'service fee'
    ];

    const breakdown = {};
    let feeSum = 0;

    const labels = Array.from(scope.querySelectorAll('p,div,span,dt')).slice(0, 6000);
    for (const el of labels) {
      const t = safeText(el).toLowerCase();
      if (!t) continue;
      if (!feeLabels.some((lbl) => t === lbl || t.startsWith(lbl))) continue;

      const container = el.closest('div,section,dl,li') || el.parentElement;
      if (!container) continue;

      const prices = Array.from(container.querySelectorAll('p,span,dd,div'))
        .map((x) => parsePriceFromText(safeText(x)))
        .filter((n) => isPlausibleUsd(n));
      if (prices.length === 0) continue;

      const fee = Math.min(...prices);
      if (!(fee > 0 && fee < 200)) continue;

      if (t === 'shipping' || t.startsWith('shipping')) breakdown.shipping = fee;
      else if (t === 'processing fee') breakdown.processingFee = fee;
      else if (t === 'tax' || t === 'taxes') breakdown.tax = fee;
      else breakdown[t] = fee;
    }

    for (const v of Object.values(breakdown)) {
      if (typeof v === 'number' && Number.isFinite(v)) feeSum += v;
    }

    if (!Number.isFinite(feeSum) || feeSum <= 0) return null;
    return { feeSum, breakdown };
  } catch {
    return null;
  }
}

function captureFeesFromPageIfPresent() {
  try {
    const parsed = parseFeeBreakdownFromDom(document);
    if (!parsed) return false;
    window.__stockxLastFeeSum = parsed.feeSum;
    window.__stockxLastFeeSumTs = Date.now();
    window.__stockxLastFeeBreakdown = parsed.breakdown;
    return true;
  } catch {
    return false;
  }
}

async function waitForAndCaptureFees({ root, timeoutMs = 8000 }) {
  try {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      // First try the passed-in root (modal) then document (routed page)
      const parsed = parseFeeBreakdownFromDom(root || document) || parseFeeBreakdownFromDom(document);
      if (parsed?.feeSum) {
        try {
          window.__stockxLastFeeSum = parsed.feeSum;
          window.__stockxLastFeeSumTs = Date.now();
          window.__stockxLastFeeBreakdown = parsed.breakdown;
        } catch {}
        return parsed;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  } catch {
    return null;
  }
}

function computeAllInEstimate({ offer, rootForTotal }) {
  const o = Number(offer);
  if (!Number.isFinite(o) || o <= 0) return { total: null, feeSum: null, source: 'none' };
  const total = rootForTotal ? findAllInTotal(rootForTotal) : null;
  if (isPlausibleUsd(total)) return { total, feeSum: Math.max(0, total - o), source: 'total' };
  // If we can see fee lines on the current page, cache them.
  captureFeesFromPageIfPresent();
  const cachedFeeSum = getCachedFeeSum();
  if (Number.isFinite(cachedFeeSum)) return { total: o + cachedFeeSum, feeSum: cachedFeeSum, source: 'cached_fees' };
  const assumed = getAssumedFeeSum();
  return { total: o + assumed, feeSum: assumed, source: 'assumed_fees' };
}

function computeProfitCheck({ avg30d, allInTotal, minProfit }) {
  const avg = Number(avg30d);
  const total = Number(allInTotal);
  const mp = Number(minProfit);
  if (!Number.isFinite(avg) || !Number.isFinite(total) || !Number.isFinite(mp)) {
    return { profit: null, ok: null };
  }
  const profit = avg - total;
  return { profit, ok: profit >= mp };
}

async function setOfferAmountAndWaitTotal({ root, input, amount }) {
  try {
    input.focus();
    input.value = String(amount);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
  const total = findAllInTotal(root);
  if (total != null) return total;
  return estimateAllInTotalFromFeeLines(root, amount);
}

async function adjustOfferToProfitTarget({ root, input, initialBid, maxAllInTotal }) {
  if (!isPlausibleUsd(maxAllInTotal)) return { adjusted: false, bid: initialBid, total: null, reason: 'no_target' };
  let bid = Math.floor(Number(initialBid));
  if (!Number.isFinite(bid) || bid <= 0) return { adjusted: false, bid: initialBid, total: null, reason: 'bad_bid' };

  let total = await setOfferAmountAndWaitTotal({ root, input, amount: bid });
  if (total == null) return { adjusted: false, bid, total: null, reason: 'no_total' };
  if (total <= maxAllInTotal) return { adjusted: false, bid, total, reason: 'already_ok' };

  for (let i = 0; i < 40 && bid > 1; i++) {
    bid -= 1;
    total = await setOfferAmountAndWaitTotal({ root, input, amount: bid });
    if (total != null && total <= maxAllInTotal) {
      return { adjusted: true, bid, total, reason: 'adjusted' };
    }
  }
  return { adjusted: true, bid, total, reason: 'min_reached' };
}

function updateProductWidgetInPlace({ marketData, recentSales }) {
  const widget = document.getElementById('stockx-price-tracker-widget');
  if (!widget) return false;

  try {
    // During scans we switch the Market Data modal between tabs (Sales/Bids/Asks).
    // When Sales tab is not visible, sales parsing can return an empty array, which makes the UI "blink".
    // Keep the last-good recentSales in that case (same page), so the list stays stable.
    try {
      const last = window.__stockxHelperLastRecentSales;
      const hasIncoming = hasRealRecentSalesRows(recentSales);
      const hasLast = hasRealRecentSalesRows(last);
      if (!hasIncoming && hasLast) {
        recentSales = last;
      }
    } catch {}

    // If the selected size changed, reset sticky cache to force a clean recalculation.
    const currentSizeKey = getSelectedSizeBestEffort();
    const prevSizeKey = String(window.__stockxHelperLastSizeKey || '');
    // If we just learned a size (prev empty) or it changed, reset.
    if (currentSizeKey && currentSizeKey !== prevSizeKey) {
      resetMarketCacheForCurrentSelection();
    }
    window.__stockxHelperLastSizeKey = currentSizeKey;

    // Stabilize market data across rapid re-renders / duplicate trade boxes.
    const cached = getCachedMarketData();
    const mergedMarket = mergeMarketDataSticky(cached, marketData);
    // Only cache when we have a size-scoped key
    if (getMarketCacheKey()) setCachedMarketData(mergedMarket);

    const setVal = (role, value) => {
      const el = widget.querySelector(`[data-role="${role}"]`);
      if (!el) return;
      el.textContent = `$${formatUsdOrDash(value)}`;
    };

    setVal('val-highestBid', mergedMarket?.highestBid);
    setVal('val-lowestAsk', mergedMarket?.lowestAsk);
    setVal('val-lastSale', mergedMarket?.lastSale);
    // Compute 30-day average from recent sales, scoped to the "active" size.
    // Prefer the helper input value (lets you pick a target size even if StockX UI lags), otherwise use page-selected size.
    const sizeInputEl = widget.querySelector('[data-role="size"]');
    const activeSizeKey = normalizeSizeKey(safeText(sizeInputEl) || sizeInputEl?.value || currentSizeKey);
    const stats30 = computeLastNDaysAverageSale({ recentSales, selectedSizeKey: activeSizeKey || currentSizeKey, days: 30 });
    const monthEl = widget.querySelector('[data-role="val-monthAvg"]');
    if (monthEl) {
      monthEl.textContent = stats30.avg != null ? `$${Math.round(stats30.avg)}` : '$—';
    }
    const monthCountEl = widget.querySelector('[data-role="meta-month-count"]');
    if (monthCountEl) monthCountEl.textContent = String(stats30.count || 0);

    // Update max all-in target (>=4 sales in last 30d, +$15 profit)
    const feeSum = getEffectiveFeeSum();
    const allTargets = computeSizeTargetsLastNDays({ recentSales, days: 30, minSales: 4, minProfit: 15, feeSum });
    const eligibleTargets = allTargets.filter((t) => t.eligible && Number.isFinite(t.maxAllInBid) && t.maxAllInBid > 0);
    const target = findProfitTargetForSize({ scanner: eligibleTargets, selectedSizeKey: activeSizeKey || currentSizeKey });
    const maxAllInEl = widget.querySelector('[data-role="meta-maxAllIn"]');
    if (maxAllInEl) maxAllInEl.textContent = target?.maxAllInBid ? `$${target.maxAllInBid}` : '—';

    const metaSource = widget.querySelector('[data-role="meta-source"]');
    if (metaSource) metaSource.textContent = `${String(mergedMarket?.source || 'unknown')}${mergedMarket?.size ? ` • size: ${String(mergedMarket.size)}` : ''}${mergedMarket?._sticky ? ' • sticky' : ''}`;

    const metaSales = widget.querySelector('[data-role="meta-sales-count"]');
    if (metaSales) metaSales.textContent = String(Array.isArray(recentSales) ? recentSales.length : 0);

    const salesList = widget.querySelector('[data-role="sales-list"]');
    if (salesList) salesList.innerHTML = renderRecentSalesHtml(recentSales);

    // Update bid targets list (and re-bind handlers because we're replacing innerHTML)
    const targetsList = widget.querySelector('[data-role="targets-list"]');
    if (targetsList) targetsList.innerHTML = renderBidTargetsHtml(allTargets, { limit: 80, feeSum });
    const sizeEl = widget.querySelector('[data-role="size"]');
    const statusEl = widget.querySelector('[data-role="status"]');
    bindTargetsListHandlers(widget, { sizeEl, statusEl });

    setLastHelperData(mergedMarket, recentSales);

    // Update the "should I bid $X" calculator line using the current bid input + latest avg30d.
    try {
      const bidEl = widget.querySelector('[data-role="bid"]');
      const bidNum = Number(String(bidEl?.value || '').trim());
      const allIn = computeAllInEstimate({ offer: bidNum, rootForTotal: null });
      const profit = computeProfitCheck({ avg30d: stats30.avg, allInTotal: allIn.total, minProfit: 15 });
      const bidOut = widget.querySelector('[data-role="calc-bid"]');
      const allInOut = widget.querySelector('[data-role="calc-allin"]');
      const feesOut = widget.querySelector('[data-role="calc-fees"]');
      const avgOut = widget.querySelector('[data-role="calc-avg"]');
      const profitOut = widget.querySelector('[data-role="calc-profit"]');
      const passOut = widget.querySelector('[data-role="calc-pass"]');
      if (bidOut) bidOut.textContent = Number.isFinite(bidNum) ? String(Math.round(bidNum)) : '—';
      if (allInOut) allInOut.textContent = allIn.total != null ? `$${Math.round(allIn.total)}` : '—';
      if (feesOut) feesOut.textContent = allIn.feeSum != null ? `$${Math.round(allIn.feeSum)}` : '—';
      if (avgOut) avgOut.textContent = stats30.avg != null ? `$${Math.round(stats30.avg)}` : '—';
      if (profitOut) profitOut.textContent = profit.profit != null ? `$${Math.round(profit.profit)}` : '—';
      if (passOut) passOut.textContent = profit.ok == null ? '' : profit.ok ? '(meets $15)' : '(below $15)';
    } catch {}

    // Keep widget size field aligned to selected size (unless user is overriding it)
    try {
      const userOverride = !!window.__stockxHelperUserSizeOverride;
      const sizeInput = widget.querySelector('[data-role="size"]');
      if (!userOverride && sizeInput && currentSizeKey) sizeInput.value = currentSizeKey;
    } catch {}

    return true;
  } catch {
    return false;
  }
}

function getLastHelperUrl() {
  try {
    return String(window.__stockxLastHelperUrl || '');
  } catch {
    return '';
  }
}

function setLastHelperUrl(url) {
  try {
    window.__stockxLastHelperUrl = String(url || '');
  } catch {}
}

function ensureProductHelperOnce(reason) {
  try {
    const url = location.href;
    const hasWidget = !!document.getElementById('stockx-price-tracker-widget');
    const currentSizeKey = getSelectedSizeBestEffort();
    const prevSizeKey = String(window.__stockxHelperLastSizeKey || '');
    if (currentSizeKey && currentSizeKey !== prevSizeKey) {
      // Force recalculation for new size
      resetMarketCacheForCurrentSelection();
    }
    window.__stockxHelperLastSizeKey = currentSizeKey;

    const strictOk = isStockXProductPage();
    if (!strictOk) {
      console.log('🟨 StockX Helper: not a product page (yet)', {
        reason,
        strictOk,
        url
      });
      return false;
    }

    console.log('🟩 StockX Helper: rendering widget', { reason, strictOk, url, slug: getProductSlugFromUrl() });
    const marketData = extractMarketDataBestEffort();
    // Parse more than we display so month averages/counts are correct (e.g. all January rows).
    const recentSales = extractRecentSalesBestEffort(200);
    // If widget exists on same URL, update in place to avoid wiping user inputs.
    if (hasWidget && getLastHelperUrl() === url) {
      updateProductWidgetInPlace({ marketData, recentSales });
    } else {
      renderProductWidget({ marketData, recentSales });
    }
    setLastHelperUrl(url);
    return true;
  } catch (e) {
    console.warn('⚠️ ensureProductHelperOnce failed:', e);
    return false;
  }
}

function startProductHelperWatcher() {
  try {
    // Clean up previous watcher (SPA navigations)
    try {
      if (window.__stockxProductHelperWatcher?.mo) window.__stockxProductHelperWatcher.mo.disconnect();
    } catch {}
    try {
      if (window.__stockxProductHelperWatcher?.interval) clearInterval(window.__stockxProductHelperWatcher.interval);
    } catch {}

    // Initial attempt (immediate + delayed hydration)
    ensureProductHelperOnce('init');
    setTimeout(() => ensureProductHelperOnce('init+1.5s'), 1500);
    setTimeout(() => ensureProductHelperOnce('init+3.5s'), 3500);

    // Observe DOM mutations for late-rendered CTAs/sections
    let lastRun = 0;
    const mo = new MutationObserver(() => {
      const now = Date.now();
      if (now - lastRun < 800) return;
      lastRun = now;
      ensureProductHelperOnce('mutation');
    });
    mo.observe(document.documentElement || document.body, { subtree: true, childList: true });

    // Interval retry for a longer window; only stop once we have real Market Data rows (or time out).
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      const ok = ensureProductHelperOnce(`interval#${attempts}`);
      let latestSales = null;
      try { latestSales = window.__stockxHelperLastRecentSales; } catch {}
      const salesReady = hasRealRecentSalesRows(latestSales);
      // If we rendered OK and have real sales rows, we can stop retrying. Otherwise keep going.
      if ((ok && salesReady) || attempts > 45) {
        clearInterval(interval);
        // Keep the mutation observer for SPA updates, but reduce noise by disconnecting after timeout.
        if (attempts > 45) {
          try { mo.disconnect(); } catch {}
        }
      }
    }, 1000);

    window.__stockxProductHelperWatcher = { mo, interval };
  } catch (e) {
    console.warn('⚠️ startProductHelperWatcher failed:', e);
  }
}

function handleStockxUrlChange(reason) {
  try {
    const url = location.href;
    // Reset helper URL memo so we re-render/update aggressively on navigation.
    try {
      window.__stockxLastHelperUrl = '';
    } catch {}
    // Reset size tracking so cache keys don't accidentally stick across routes.
    try {
      window.__stockxHelperLastSizeKey = '';
    } catch {}
    // Clear cached market data for the new selection (if any).
    try {
      resetMarketCacheForCurrentSelection();
    } catch {}

    console.log('🧭 StockX navigation detected:', { reason, url });

    const isScanTab = (() => {
      try {
        const u = new URL(location.href);
        return u.searchParams.get('extScan') === '1';
      } catch {
        return false;
      }
    })();

    // Restart watchers (product helper + buying tracker)
    try {
      if (!isScanTab) startProductHelperWatcher();
    } catch {}
    try {
      if (!isScanTab) startBuyingTrackingWatcher();
    } catch {}
  } catch {}
}

function installUrlChangeHooks() {
  try {
    if (window.__stockxUrlHookInstalled) return;
    window.__stockxUrlHookInstalled = true;

    let last = location.href;
    const emitIfChanged = (reason) => {
      const cur = location.href;
      if (cur === last) return;
      last = cur;
      handleStockxUrlChange(reason);
    };

    // Patch history methods (SPA navigations / query param updates)
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function (...args) {
      const ret = origPush.apply(this, args);
      emitIfChanged('pushState');
      return ret;
    };
    history.replaceState = function (...args) {
      const ret = origReplace.apply(this, args);
      emitIfChanged('replaceState');
      return ret;
    };

    window.addEventListener('popstate', () => emitIfChanged('popstate'));

    // Fallback poll (some apps mutate URL in odd ways)
    setInterval(() => emitIfChanged('poll'), 500);
  } catch (e) {
    console.warn('⚠️ installUrlChangeHooks failed:', e);
  }
}

// --- Background-driven scanner API (used for listing-page bid opportunity scans) ---
function isExtScanTab() {
  try {
    if (window.__stockxIsScanTab) return true;
  } catch {}
  try {
    const u = new URL(location.href);
    return u.searchParams.get('extScan') === '1';
  } catch {
    return false;
  }
}

function setExtScanStage(stage, detail) {
  try {
    if (!isExtScanTab()) return;
    const s = String(stage || '');
    const d = detail ? ` — ${String(detail)}` : '';
    window.__stockxExtScanStage = { stage: s, detail: String(detail || ''), ts: Date.now() };
    document.title = `SCAN: ${s}${d}`.slice(0, 80);
  } catch {}
}

function ensureExtScanStatusOverlay() {
  try {
    if (!isExtScanTab()) return;
    const id = 'stockx-ext-scan-status';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.style.cssText = `
        position: fixed;
        top: 16px;
        left: 16px;
        z-index: 2147483647;
        background: rgba(17, 24, 39, 0.92);
        color: rgba(255,255,255,0.9);
        border: 1px solid rgba(99,102,241,0.35);
        padding: 8px 10px;
        border-radius: 10px;
        font-family: Arial, sans-serif;
        font-size: 12px;
        max-width: 320px;
        pointer-events: none;
      `;
      document.body.appendChild(el);
    }
    const startedAt = window.__stockxExtScanStartedAt || Date.now();
    window.__stockxExtScanStartedAt = startedAt;
    const stage = window.__stockxExtScanStage?.stage || 'starting';
    const detail = window.__stockxExtScanStage?.detail ? ` • ${window.__stockxExtScanStage.detail}` : '';
    const secs = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    el.textContent = `Scan running: ${stage}${detail} • ${secs}s`;
  } catch {}
}

async function ensureSizeAllSelectedBestEffort(timeoutMs = 8000) {
  // In scan tabs StockX may remember a previously selected size (e.g. "US Men's 4.5").
  // For consistent Market Data behavior we can force the PDP size selector to "All".
  try {
    const start = Date.now();
    const getSelectedSizeText = () => {
      try {
        const btn = document.querySelector('#menu-button-pdp-size-selector');
        if (!btn) return '';
        // StockX uses a nested <p> for the selected size label.
        const p =
          btn.querySelector('[data-testid="selector-label"]') ||
          btn.querySelector('p.chakra-text.css-1s7f4ol') ||
          btn.querySelector('p.chakra-text') ||
          null;
        const t = safeText(p || btn);
        // Usually looks like: "Size: US Men's 4.5" or just "All"
        // Prefer the last token if it includes "Size:" prefix.
        const m = t.match(/\bSize:\s*(.+)\s*$/i);
        return (m?.[1] ? m[1] : t).trim();
      } catch {
        return '';
      }
    };

    // If already on All, done.
    {
      const lbl = getSelectedSizeText();
      if (lbl.trim().toLowerCase() === 'all') {
        return { ok: true, reason: 'already_all' };
      }
    }

    const closePanel = () => {
      try {
        // Escape
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true, cancelable: true }));
      } catch {}
      try {
        const trigger = document.querySelector('#menu-button-pdp-size-selector');
        // If aria-expanded is true, clicking collapses.
        if (trigger && String(trigger.getAttribute('aria-expanded') || '') === 'true') clickElBestEffort(trigger);
      } catch {}
    };

    while (Date.now() - start < timeoutMs) {
      // If we became "All" after a previous attempt, exit early.
      if (getSelectedSizeText().trim().toLowerCase() === 'all') {
        closePanel();
        return { ok: true, reason: 'selected_all' };
      }

      // Open the size menu
      const trigger = document.querySelector('#menu-button-pdp-size-selector');
      if (!trigger) {
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }
      clickElBestEffort(trigger);

      // StockX has (at least) two size selector UIs:
      // (A) Chakra Menu: #menu-list-pdp-size-selector with menuitemradio entries.
      // (B) "Size and Conversions" panel/grid (no menu-list id), with an "All" tile.

      // A) Menu root
      const menu = await waitForElement(
        () => document.querySelector('#menu-list-pdp-size-selector') || null,
        1800
      );
      if (menu) {
        const items = Array.from(menu.querySelectorAll('[role="menuitemradio"]'));
        const allItem =
          items.find((it) => safeText(it.querySelector('[data-testid="selector-label"]') || it).trim().toLowerCase() === 'all') ||
          null;
        if (allItem) {
          clickElBestEffort(allItem);
        } else {
          // fall through to grid attempt
        }
      } else {
        // B) Grid/panel attempt: find a visible container mentioning "Size and Conversions"
        try {
          const nodes = Array.from(document.querySelectorAll('div,section,aside')).slice(0, 3000);
          const panel = nodes.find((n) => {
            const t = safeText(n).toLowerCase();
            return t.includes('size and conversions') && t.includes('all');
          });
          if (panel) {
            // Try to click an "All" tile/button within the panel.
            const clickables = Array.from(
              panel.querySelectorAll('button,[role="button"],[role="option"],[role="gridcell"],[tabindex]')
            );
            const allEl =
              clickables.find((el) => safeText(el).trim().toLowerCase() === 'all') ||
              clickables.find((el) => /^all\b/i.test(safeText(el).trim())) ||
              null;
            if (allEl) {
              clickElBestEffort(allEl);
            } else {
              // last-resort: click any element with "All" text
              const anyAll = Array.from(panel.querySelectorAll('*')).find((el) => safeText(el).trim().toLowerCase() === 'all');
              if (anyAll) clickElBestEffort(anyAll);
            }
          }
        } catch {}
      }

      // Give StockX time to apply selection
      await new Promise((r) => setTimeout(r, 800));
      // Always close any open size UI so it doesn't block "View Market Data"
      closePanel();

      const label = getSelectedSizeText();
      if (label.trim().toLowerCase() === 'all') return { ok: true, reason: 'selected_all' };
    }

    // Don't block the scan if we can't force "All" — proceed anyway.
    try {
      closePanel();
    } catch {}
    return { ok: false, reason: `timeout (selected=${getSelectedSizeText() || 'unknown'})` };
  } catch (e) {
    return { ok: false, reason: e?.message || String(e) };
  }
}

async function withTimeout(promise, ms, label) {
  let t = null;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        t = setTimeout(() => resolve({ success: false, error: `Timeout${label ? ` (${label})` : ''}` }), ms);
      })
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}

async function scanThisProductForBidOpportunities({ mode } = {}) {
  try {
    if (isExtScanTab()) {
      setExtScanStage('init');
      ensureExtScanStatusOverlay();
      // Keep overlay refreshed
      if (!window.__stockxExtScanOverlayInterval) {
        window.__stockxExtScanOverlayInterval = setInterval(() => ensureExtScanStatusOverlay(), 500);
      }
    }

    // Wait briefly for hydration to ensure the size menu trigger exists.
    setExtScanStage('hydrating');
    await new Promise((r) => setTimeout(r, 2200));

    const slug = getProductSlugFromUrl() || '';
    const title = safeText(document.querySelector('h1')) || '';
    // Listing-scan opportunity rules are configurable in extension settings.
    const settings = await loadScanSettings();
    const feeSum = Number(settings?.feeSum);
    const minProfit = Number(settings?.minProfit);
    const minSales30d = Number(settings?.minSales30d);
    const excludeRecentReleaseDays = Number(settings?.excludeRecentReleaseDays);
    let sizeAll = null;

    // Optional: exclude products that released within the last N days (default 30).
    // Best-effort, only applies when we can detect a release date.
    try {
      if (Number.isFinite(excludeRecentReleaseDays) && excludeRecentReleaseDays > 0) {
        const rel = extractReleaseDateBestEffort();
        const d = rel?.date instanceof Date ? rel.date : null;
        if (d && Number.isFinite(d.getTime())) {
          const now = Date.now();
          const ageMs = now - d.getTime();
          const maxMs = excludeRecentReleaseDays * 24 * 60 * 60 * 1000;
          if (ageMs >= 0 && ageMs <= maxMs) {
            return {
              success: true,
              slug,
              title,
              releaseDate: d.toISOString().slice(0, 10),
              releaseDateSource: rel?.source || 'unknown',
              releaseExcluded: true,
              releaseExcludedDays: Math.round(excludeRecentReleaseDays),
              opportunities: [],
              viableSizeCount: 0,
              eliminatedByAsk: 0,
              sizeOptionsCount: 0,
              salesRows: 0,
              asksRows: 0,
              bidsRows: 0,
              foundMarketDataButton: false,
              openedMarketData: false
            };
          }
        }
      }
    } catch {}

    // 1) Optional: size dropdown scrape (can be flaky in background tabs, and unnecessary for listing scans)
    let sizeOptions = [];
    let sizeOptionsCount = 0;
    if (String(mode || '').toLowerCase() !== 'listing') {
      try {
        sizeOptions = await getSizeOptionsFromMenu(); // [{ sizeLabel, highestBid }]
        sizeOptionsCount = Array.isArray(sizeOptions) ? sizeOptions.length : 0;
      } catch {
        sizeOptions = [];
        sizeOptionsCount = 0;
      }
    }

    // For listing scans specifically, force Size=All so Market Data reflects the full grid.
    if (String(mode || '').toLowerCase() === 'listing') {
      setExtScanStage('size', 'selecting All');
      sizeAll = await ensureSizeAllSelectedBestEffort(12000);
      setExtScanStage('size', sizeAll?.ok ? `All (${sizeAll.reason})` : `failed (${sizeAll?.reason || 'unknown'})`);
    }

    // 2) Open Market Data ONCE and scrape Sales + Bids + Asks by switching tabs.
    setExtScanStage('market data', 'opening + reading tables');
    const md = await readMarketDataTablesOnce({
      maxAsks: 250,
      maxBids: 250,
      maxSales: 450,
      openTimeoutMs: 9000,
      onAttempt: (n, found) => setExtScanStage('market data', `opening (attempt ${n}${found ? ', found button' : ''})`),
      onStage: (s, d) => setExtScanStage(s, d)
    });
    let asks = md.asks || [];
    let bids = md.bids || [];
    const sales = md.sales || [];

    // Fallback: in background tabs, Bids/Asks often render as empty even when Sales loads fine.
    // Use Next.js data to recover per-size bid/ask values.
    let nextDataVariantDebug = null;
    if ((Array.isArray(asks) && asks.length === 0) || (Array.isArray(bids) && bids.length === 0)) {
      const fb = extractVariantBidAskFromNextDataAll();
      nextDataVariantDebug = fb?.debug || null;
      if (Array.isArray(asks) && asks.length === 0 && Array.isArray(fb?.asks) && fb.asks.length) asks = fb.asks;
      if (Array.isArray(bids) && bids.length === 0 && Array.isArray(fb?.bids) && fb.bids.length) bids = fb.bids;
    }
    setExtScanStage('market data', `rows: sales ${sales.length}, bids ${bids.length}, asks ${asks.length}`);

    const askBySizeKey = new Map();
    for (const a of Array.isArray(asks) ? asks : []) {
      const key = normalizeSizeKey(a.size);
      const ask = Number(a.ask);
      if (!key || !Number.isFinite(ask) || ask <= 0) continue;
      const prev = askBySizeKey.get(key);
      if (!prev || ask < prev) askBySizeKey.set(key, ask);
    }

    const bidBySizeKey = new Map();
    for (const b of Array.isArray(bids) ? bids : []) {
      const key = normalizeSizeKey(b.size);
      const bid = Number(b.bid);
      if (!key || !Number.isFinite(bid) || bid <= 0) continue;
      const prev = bidBySizeKey.get(key);
      if (!prev || bid > prev) bidBySizeKey.set(key, bid);
    }

    // 3) Merge HB sources (size menu + bids table), preferring the higher HB if both exist.
    const hbBySizeKey = new Map();
    const optionsByKey = new Map(); // kept for debugging/explainEmpty
    for (const opt of Array.isArray(sizeOptions) ? sizeOptions : []) {
      const k = normalizeSizeKey(opt.sizeLabel);
      if (!k) continue;
      // Prefer the first seen (deduped upstream) or higher bid if duplicated
      const prev = optionsByKey.get(k);
      if (!prev || (Number(opt.highestBid) || 0) > (Number(prev.highestBid) || 0)) optionsByKey.set(k, opt);
    }
    for (const [k, opt] of optionsByKey.entries()) {
      const hb = Number(opt?.highestBid);
      if (Number.isFinite(hb) && hb > 0) hbBySizeKey.set(k, hb);
    }
    for (const [k, hb] of bidBySizeKey.entries()) {
      const cur = Number(hbBySizeKey.get(k) || 0);
      if (!cur || hb > cur) hbBySizeKey.set(k, hb);
    }

    // 4) Sales gating: each size must have >=4 sales in the last 30 days.
    const stats30 = computeSizeStatsLastNDays({ recentSales: sales, days: 30 });
    const statsByKey = new Map(); // sizeKey -> { sizeLabel, count, avg }
    for (const s of Array.isArray(stats30) ? stats30 : []) {
      const k = normalizeSizeKey(s?.sizeLabel);
      if (!k) continue;
      const prev = statsByKey.get(k);
      // Prefer the highest-count label; tie-break by avg.
      if (!prev || (Number(s.count) || 0) > (Number(prev.count) || 0)) statsByKey.set(k, s);
    }

    // KPI: lowest sold price in last ~2 months (~60 days) per size (only shown for profitable opportunities).
    const lowestSold2moByKey = new Map(); // sizeKey -> number
    try {
      const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
      for (const s of Array.isArray(sales) ? sales : []) {
        const d = getSaleLocalDateBestEffort(s);
        if (!d || d.getTime() < cutoff) continue;
        const k = normalizeSizeKey(s?.size);
        if (!k) continue;
        const price = typeof s?.price === 'number' ? s.price : toNumberMaybe(s?.price);
        if (!isPlausibleUsd(price)) continue;
        const prev = lowestSold2moByKey.get(k);
        if (!Number.isFinite(prev) || price < prev) lowestSold2moByKey.set(k, price);
      }
    } catch {}

    // Build a label map from market rows (often cleaner than sales labels).
    const labelByKey = new Map();
    for (const a of Array.isArray(asks) ? asks : []) {
      const k = normalizeSizeKey(a?.size);
      const lbl = String(a?.size || '').trim();
      if (k && lbl && !labelByKey.has(k)) labelByKey.set(k, lbl);
    }
    for (const b of Array.isArray(bids) ? bids : []) {
      const k = normalizeSizeKey(b?.size);
      const lbl = String(b?.size || '').trim();
      if (k && lbl && !labelByKey.has(k)) labelByKey.set(k, lbl);
    }

    const opportunities = [];
    let eliminatedByAsk = 0;
    let eliminatedByAvg30d = 0;
    const viableSizeKeys = new Set();

    for (const [sizeKey, hb] of hbBySizeKey.entries()) {
      const hbNum = Number(hb);
      if (!Number.isFinite(hbNum) || hbNum <= 0) continue;

      const stat = statsByKey.get(sizeKey);
      const salesCount = Number(stat?.count) || 0;
      if (Number.isFinite(minSales30d) && minSales30d >= 0 && salesCount < minSales30d) continue;

      const ask = Number(askBySizeKey.get(sizeKey));
      if (!Number.isFinite(ask) || ask <= 0) continue;

      const highestBid = Math.floor(hbNum);
      // Bid we actually place should be $1 above the current highest bid.
      const suggestedBid = highestBid + 1;
      const profit = ask - (suggestedBid + feeSum);
      if (profit < minProfit) {
        eliminatedByAsk += 1;
        continue;
      }

      // New rule: "all-in cost" must be at or below Avg30d sale price.
      // all-in cost = suggestedBid + feeSum
      const avg30d = Number(stat?.avg);
      const allIn = suggestedBid + feeSum;
      if (!Number.isFinite(avg30d) || avg30d <= 0 || allIn > avg30d) {
        eliminatedByAvg30d += 1;
        continue;
      }

      const maxBid = Math.floor(ask - feeSum - minProfit);
      if (!Number.isFinite(maxBid) || maxBid <= 0) continue;
      if (suggestedBid > maxBid) {
        eliminatedByAsk += 1;
        continue;
      }
      viableSizeKeys.add(sizeKey);

      opportunities.push({
        sizeLabel: labelByKey.get(sizeKey) || stat?.sizeLabel || sizeKey,
        sizeParam: stockxSizeParamFromLabel(labelByKey.get(sizeKey) || stat?.sizeLabel || sizeKey),
        highestBid,
        suggestedBid,
        maxBid,
        lowestAsk: Math.floor(ask),
        profit: Math.floor(profit),
        lowestSold2mo: (() => {
          const v = Number(lowestSold2moByKey.get(sizeKey));
          return Number.isFinite(v) ? Math.floor(v) : null;
        })(),
        avg30d: Number.isFinite(avg30d) ? Math.round(avg30d) : null,
        sales30d: salesCount,
        edge: maxBid - suggestedBid
      });
    }
    const viableSizeCount = viableSizeKeys.size;

    opportunities.sort((a, b) => (b.edge || 0) - (a.edge || 0));

    // Persist a compact snapshot of Market Data so the listing widget can show *current* parsed data
    // (and we don't confuse it with older cached results).
    const compactRows = (rows, pick) => {
      try {
        const base = Array.isArray(rows) ? rows : [];
        return base.slice(0, 25).map((r) => {
          const out = {};
          for (const k of pick) out[k] = r?.[k];
          if (typeof r?.raw === 'string') out.raw = r.raw.slice(0, 180);
          return out;
        });
      } catch {
        return [];
      }
    };

    return {
      success: true,
      slug,
      title,
      feeSum,
      salesRows: Array.isArray(sales) ? sales.length : 0,
      asksRows: Array.isArray(asks) ? asks.length : 0,
      bidsRows: Array.isArray(bids) ? bids.length : 0,
      marketDataSample: {
        asks: compactRows(asks, ['size', 'ask']),
        bids: compactRows(bids, ['size', 'bid']),
        sales: compactRows(sales, ['date', 'size', 'price'])
      },
      nextDataVariantDebug,
      foundMarketDataButton: !!md.foundMarketDataButton,
      openedMarketData: !!md.openedMarketData,
      marketDataOpenDebug: md.openDebug || null,
      marketDataTabDebug: md.tabDebug || null,
      sizeAll,
      sizeOptionsCount,
      viableSizeCount,
      eliminatedByAsk,
      eliminatedByAvg30d,
      opportunities
    };
  } catch (e) {
    setExtScanStage('error', e?.message || String(e));
    return { success: false, error: e?.message || String(e) };
  }
}

try {
  if (chrome?.runtime?.onMessage?.addListener) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request?.action === 'collectListingProductUrls') {
        try {
          const maxItems = Number.isFinite(Number(request?.maxItems)) ? Math.max(1, Math.min(48, Number(request.maxItems))) : 48;
          const opts = request?.opts && typeof request.opts === 'object' ? request.opts : {};
          const urls = collectListingProductUrls(maxItems, opts);
          sendResponse({
            success: true,
            url: location.href,
            page: (() => {
              try {
                const u = new URL(location.href);
                const p = Number(u.searchParams.get('page') || '1');
                return Number.isFinite(p) && p > 0 ? p : 1;
              } catch {
                return 1;
              }
            })(),
            urls
          });
        } catch (e) {
          sendResponse({ success: false, error: e?.message || String(e), urls: [] });
        }
        return true;
      }

      if (request?.action === 'scanProductBidOpportunities') {
        // Hard cap per product so background scans never "hang" on a single shoe.
        const task = scanThisProductForBidOpportunities({ mode: request?.mode });
        withTimeout(task, 45000, 'product scan').then((res) => sendResponse(res));
        return true;
      }

      // Progress/results from background listing scans (only meaningful on listing pages).
      if (request?.action === 'listingBidScanProgress' || request?.action === 'listingBidScanResult' || request?.action === 'listingBidScanDone') {
        try {
          window.__stockxListingBidScanLastMsg = request;
          // If the listing widget exists, update it immediately.
          try {
            if (typeof window.__stockxListingBidScanHandleMsg === 'function') {
              window.__stockxListingBidScanHandleMsg(request);
            }
          } catch {}
        } catch {}
        // no response expected
        return;
      }
    });
  }
} catch {}

// --- Global safety: handle "Extension context invalidated" gracefully ---
// This happens when the extension reloads/updates while a StockX tab is still open.
// Any further chrome.runtime calls from that old content-script context can throw.
try {
  const handleInvalidated = () => {
    try {
      const state = window.__stockxListingBidScanState;
      if (state && typeof state === 'object') {
        state.scanId = '';
        state.pendingStop = false;
        state.stage = 'error: Extension context invalidated — reload extension and hard refresh this tab.';
      }
    } catch {}
    try {
      const w = document.getElementById('stockx-bid-opps-widget');
      if (w && typeof ensureListingBidWidget === 'function') ensureListingBidWidget();
    } catch {}
    try {
      const w2 = document.getElementById('stockx-price-tracker-widget');
      if (w2) {
        const status = w2.querySelector?.('[data-role="status"]');
        if (status) status.textContent = 'Extension updated — hard refresh this StockX tab to re-enable scanning.';
      }
    } catch {}
  };

  window.addEventListener(
    'error',
    (e) => {
      const msg = String(e?.message || '');
      if (/Extension context invalidated/i.test(msg)) {
        try {
          e.preventDefault?.();
          e.stopImmediatePropagation?.();
        } catch {}
        handleInvalidated();
      }
    },
    true
  );

  window.addEventListener(
    'unhandledrejection',
    (e) => {
      const msg = String(e?.reason?.message || e?.reason || '');
      if (/Extension context invalidated/i.test(msg)) {
        try {
          e.preventDefault?.();
        } catch {}
        handleInvalidated();
      }
    },
    true
  );
} catch {}

// --- Listing-page "Bid Opportunities" widget ---
function isStockxHomepage() {
  try {
    if (!location.hostname.includes('stockx.com')) return false;
    const p = (location.pathname || '/').toLowerCase();
    return p === '/' || p === '';
  } catch {
    return false;
  }
}

function isStockxListingPage() {
  try {
    if (!location.hostname.includes('stockx.com')) return false;
    if (isStockxHomepage()) return false;
    if (isBuyingOrderDetailPage()) return false;
    if (isBuyFlowPath()) return false;
    const path = (location.pathname || '/').toLowerCase();

    // Favorites page: treat as a listing page (it contains product cards we can scan).
    if (path === '/favorites' || path.startsWith('/favorites/')) return true;

    // Product pages should not show this widget (URL-based: product pages are usually /<slug>)
    // Important: do NOT rely on DOM-based product detection here (can be false during hydration).
    const parts = path.split('/').filter(Boolean);
    const isProductLikePath =
      parts.length === 1 &&
      parts[0].length >= 6 &&
      /^[a-z0-9-]+$/.test(parts[0]) &&
      ![
        'favorites',
        'search',
        'sell',
        'buy',
        'buying',
        'selling',
        'help',
        'settings',
        'about',
        'professional-tools',
        'accounts',
        'login',
        'signup',
        'profile',
        'brands',
        'news',
        'category',
        'categories'
      ].includes(parts[0]);
    if (isProductLikePath) return false;

    // Exclude common non-listing routes
    const excludedPrefixes = ['/help', '/settings', '/about', '/professional-tools', '/accounts', '/login', '/signup'];
    if (excludedPrefixes.some((p) => path.startsWith(p))) return false;
    // Listing pages we explicitly support
    if (path.startsWith('/category/')) return true;
    if (path.startsWith('/search')) return true;
    // Top-level category routes (StockX uses these in nav)
    if (
      path === '/sneakers' ||
      path.startsWith('/sneakers/') ||
      path === '/streetwear' ||
      path.startsWith('/streetwear/') ||
      path === '/collectibles' ||
      path.startsWith('/collectibles/') ||
      path === '/electronics' ||
      path.startsWith('/electronics/') ||
      path === '/trading-cards' ||
      path.startsWith('/trading-cards/') ||
      path === '/handbags' ||
      path.startsWith('/handbags/') ||
      path === '/watches' ||
      path.startsWith('/watches/')
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function isLikelyProductPathForListing(pathname) {
  const p = String(pathname || '').toLowerCase();
  if (!p.startsWith('/')) return false;
  if (p === '/' || p === '') return false;
  const excluded = [
    '/favorites',
    '/profile',
    '/brands',
    '/news',
    '/search',
    '/sell',
    '/buy',
    '/buying',
    '/selling',
    '/help',
    '/settings',
    '/about',
    '/professional-tools',
    '/accounts',
    '/login',
    '/signup',
    '/sneakers',
    '/streetwear',
    '/collectibles',
    '/electronics',
    '/trading-cards',
    '/handbags',
    '/watches',
    '/category',
    '/categories'
  ];
  if (excluded.some((x) => p === x || p.startsWith(`${x}/`))) return false;
  // Most product pages are /<slug> (single segment)
  const parts = p.split('/').filter(Boolean);
  if (parts.length !== 1) return false;
  const slug = parts[0];
  if (!slug || slug.length < 6) return false;
  if (!/^[a-z0-9-]+$/.test(slug)) return false;
  return true;
}

function collectListingProductUrls(max = 48, opts = {}) {
  const urls = [];
  const seen = new Set();
  const anchors = Array.from(document.querySelectorAll('a[href^="/"]'));
  const isSearch = (() => {
    try {
      return String(location.pathname || '').toLowerCase().startsWith('/search');
    } catch {
      return false;
    }
  })();

  const looksLikeProductCardLink = (a) => {
    try {
      if (a.querySelector?.('img')) return true;
      const card = a.closest('article,li,[role="listitem"]') || null;
      if (card && card.querySelector?.('img')) return true;
      return false;
    } catch {
      return false;
    }
  };

  const shouldSkipByCardText = (a) => {
    try {
      const onlySneakers = !!opts.onlySneakers;
      const skipOneSize = !!opts.skipOneSize;
      const includeCategories = Array.isArray(opts.includeCategories) ? opts.includeCategories : [];
      if (!onlySneakers && !skipOneSize && includeCategories.length === 0) return false;

      const card = a.closest('article,li,[role="listitem"],div') || a;
      const t = safeText(card).toLowerCase();

      if (opts.excludeSponsored) {
        if (t.includes('sponsored')) return true;
      }

      if (skipOneSize) {
        if (t.includes('one size')) return true;
      }

      // Category allowlist (best-effort). If we can detect a category and it's not allowed, skip it.
      const allowed = onlySneakers ? ['sneakers'] : includeCategories;
      if (allowed && allowed.length) {
        const signals = [
          { key: 'sneakers', words: ['sneakers'] },
          { key: 'streetwear', words: ['streetwear'] },
          { key: 'collectibles', words: ['collectibles'] },
          { key: 'electronics', words: ['electronics'] },
          { key: 'trading-cards', words: ['trading cards', 'trading-cards'] },
          { key: 'handbags', words: ['handbags'] },
          { key: 'watches', words: ['watches'] }
        ];
        const detected = signals.find((s) => s.words.some((w) => t.includes(w)))?.key || '';
        if (detected && !allowed.includes(detected)) return true;
      }

      return false;
    } catch {
      return false;
    }
  };

  // Search-page fallback: users reported every even "row" is sponsored on some search grids.
  // If excludeSponsored is enabled and we can identify product-card containers, we skip every even card (2,4,6...)
  // *only* when we don't see explicit "Sponsored" text anywhere.
  try {
    if (isSearch && opts.excludeSponsored) {
      const cards = Array.from(
        document.querySelectorAll('article,[role="listitem"],li,[data-testid*="product" i],[data-testid*="tile" i]')
      ).slice(0, 400);
      const cardAnchors = [];
      let sponsoredTextSeen = false;
      for (const c of cards) {
        const t = safeText(c).toLowerCase();
        if (t.includes('sponsored')) sponsoredTextSeen = true;
        const as = Array.from(c.querySelectorAll('a[href^="/"]'));
        const a = as.find((x) => {
          try {
            const u = new URL(x.getAttribute('href') || '', location.origin);
            return isLikelyProductPathForListing(u.pathname);
          } catch {
            return false;
          }
        });
        if (a) cardAnchors.push(a);
        if (cardAnchors.length >= max * 3) break;
      }

      if (!sponsoredTextSeen && cardAnchors.length >= 20) {
        for (let i = 0; i < cardAnchors.length && urls.length < max; i++) {
          // Skip even rows: 2,4,6... => i is 1,3,5... (0-based odd)
          if (i % 2 === 1) continue;
          const a = cardAnchors[i];
          const href = a.getAttribute('href') || '';
          let u = null;
          try {
            u = new URL(href, location.origin);
          } catch {
            continue;
          }
          if (!isLikelyProductPathForListing(u.pathname)) continue;
          if (String(u.searchParams.get('sponsored') || '').toLowerCase() === 'true') continue;
          if (!looksLikeProductCardLink(a)) continue;
          if (shouldSkipByCardText(a)) continue;
          const normalized = `${u.origin}${u.pathname}`;
          if (seen.has(normalized)) continue;
          seen.add(normalized);
          urls.push(normalized);
        }
        if (urls.length) return urls;
      }
    }
  } catch {}

  for (const a of anchors) {
    const href = a.getAttribute('href') || '';
    let u = null;
    try {
      u = new URL(href, location.origin);
    } catch {
      continue;
    }
    if (!isLikelyProductPathForListing(u.pathname)) continue;
    if (opts.excludeSponsored && String(u.searchParams.get('sponsored') || '').toLowerCase() === 'true') continue;
    if (!looksLikeProductCardLink(a)) continue;
    if (shouldSkipByCardText(a)) continue;
    // Ignore links that are clearly not product cards (e.g. header/footer)
    const txt = safeText(a);
    if (txt && txt.length > 80) continue;
    // Normalize sponsored / tracking / size params to a canonical product URL.
    // Listing scans will force Size=All, so keeping ?size=... is unnecessary and can cause flakiness.
    const normalized = (() => {
      try {
        return `${u.origin}${u.pathname}`;
      } catch {
        return u.toString();
      }
    })();
    const key = normalized;
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(key);
    if (urls.length >= max) break;
  }
  return urls;
}

function formatOppRow(opp, { slug, url } = {}) {
  const size = String(opp.sizeLabel || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const hb = Number(opp.highestBid);
  const ask = Number(opp.lowestAsk);
  const profit =
    Number.isFinite(Number(opp.profit)) ? Math.floor(Number(opp.profit)) :
    Number.isFinite(ask) && Number.isFinite(hb) ? Math.floor(ask - hb - 21) :
    null;
  const bidTxt = Number.isFinite(hb) ? hb : '—';
  const askTxt = Number.isFinite(ask) ? ask : '—';
  const profitTxt = profit == null ? '—' : `${profit >= 0 ? '+' : ''}${profit}`;
  const low2mo = Number(opp.lowestSold2mo);
  const low2moTxt = Number.isFinite(low2mo) ? String(Math.round(low2mo)) : '—';

  const sizeParam = String(opp.sizeParam || stockxSizeParamFromLabel(opp.sizeLabel) || '').trim();
  const canOpen = !!(url && sizeParam);
  const openBtn = canOpen
    ? `<button data-role="open-size" data-url="${String(url)}" data-sizeparam="${sizeParam}"
         style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.10); color:white; padding:4px 8px; border-radius:8px; cursor:pointer; font-weight:800; font-size:11px;">
         Open
       </button>`
    : '';

  return `<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; font-size:12px; min-width:0;">
    <div title="${size}" style="
      flex: 1;
      min-width: 84px;
      font-weight: 800;
      line-height: 1.15;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      white-space: normal;
      word-break: break-word;
    ">${size}</div>
    <div style="
      display:flex;
      align-items:center;
      justify-content:flex-end;
      flex-wrap:wrap;
      row-gap:6px;
      column-gap:10px;
      white-space:normal;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      flex: 0 0 auto;
      max-width: 240px;
    ">
      <span>Bid ${bidTxt}</span>
      <span>Ask ${askTxt}</span>
      <span>Profit ${profitTxt}</span>
      <span>Low60d ${low2moTxt}</span>
      ${openBtn}
    </div>
  </div>`;
}

function ensureListingBidWidget() {
  const existing = document.getElementById('stockx-bid-opps-widget');
  if (!isStockxListingPage()) {
    if (existing) existing.remove();
    return;
  }

  const state = (window.__stockxListingBidScanState =
    window.__stockxListingBidScanState || {
      scanId: '',
      total: 0,
      current: 0,
      stage: '',
      results: {},
      maxItems: 48,
      maxPages: 5,
      concurrency: 1,
      onlySneakers: false,
      skipOneSize: false,
      biddingMode: false,
      showNonProfitable: false,
      debugClicks: false,
      pendingStop: false
    });

  // Load saved widget position once (async), then re-render.
  try {
    if (!window.__stockxListingWidgetPosLoaded && !window.__stockxListingWidgetPosLoading) {
      window.__stockxListingWidgetPosLoading = true;
      loadListingWidgetPos().then(() => {
        try {
          window.__stockxListingWidgetPosLoaded = true;
          window.__stockxListingWidgetPosLoading = false;
          ensureListingBidWidget();
        } catch {}
      });
    }
  } catch {}

  // Best-effort load bid history into a cache for UI rendering.
  try {
    if (!window.__stockxBidHistoryLoading) {
      window.__stockxBidHistoryLoading = true;
      loadBidHistoryMap().then((m) => {
        try {
          window.__stockxBidHistoryCache = m || {};
        } catch {}
        try {
          window.__stockxBidHistoryLoading = false;
          ensureListingBidWidget();
        } catch {}
      });
    }
  } catch {}

  const runtimeSendMessageSafe = (msg, cb) => {
    try {
      if (!chrome?.runtime?.sendMessage) {
        state.stage = 'error: chrome.runtime not available (refresh the page)';
        ensureListingBidWidget();
        return false;
      }
      chrome.runtime.sendMessage(msg, (resp) => {
        const err = chrome.runtime?.lastError;
        if (err) {
          const m = err.message || String(err);
          if (/Extension context invalidated/i.test(m)) {
            state.stage = 'error: Extension updated — refresh this StockX tab, then retry Scan.';
          } else {
            state.stage = `error: ${m}`;
          }
          ensureListingBidWidget();
          return;
        }
        cb?.(resp);
      });
      return true;
    } catch (e) {
      const m = e?.message || String(e);
      state.stage = /Extension context invalidated/i.test(m)
        ? 'error: Extension updated — refresh this StockX tab, then retry Scan.'
        : `error: ${m}`;
      ensureListingBidWidget();
      return false;
    }
  };

  // Global stop overlay should work from any StockX tab, not just the listing widget tab.
  // We mount it here too (idempotent) so it appears quickly after any rerender.
  try {
    ensureGlobalStopOverlay();
  } catch {}

  // Poll persisted scan state/results so the UI updates even if runtime messages are missed.
  try {
    if (!window.__stockxListingScanStoragePoll) {
      window.__stockxListingScanStoragePoll = setInterval(() => {
        try {
          chrome?.storage?.local?.get?.(['stockxActiveListingScanId', 'stockxLastListingScanId'], (ids) => {
            void chrome.runtime.lastError;
            const sid = String(ids?.stockxActiveListingScanId || state.scanId || ids?.stockxLastListingScanId || '');
            if (!sid) return;
            const stateKey = `stockxListingScanState:${sid}`;
            const resultsKey = `stockxListingScanResults:${sid}`;
            chrome.storage.local.get([stateKey, resultsKey], (res) => {
              void chrome.runtime.lastError;
              const s = res?.[stateKey];
              const r = res?.[resultsKey];
              // Avoid re-rendering while the user is interacting with the widget; otherwise the DOM
              // can be replaced mid-click and inputs/buttons feel "unclickable".
              const hovering = !!window.__stockxListingWidgetHovering;
              const widgetEl = document.getElementById('stockx-bid-opps-widget');
              const focusedInside = !!(widgetEl && document.activeElement && widgetEl.contains(document.activeElement));
              const interactingUntil = Number(window.__stockxListingWidgetInteractingUntil || 0);
              const interacting = Date.now() < interactingUntil;

              // Track a lightweight snapshot so we only re-render when something actually changed.
              let snap = '';
              try {
                snap = JSON.stringify({
                  scanId: String(s?.scanId || sid),
                  stage: String(s?.stage || ''),
                  total: Number(s?.total || 0),
                  completed: Number(s?.completed || 0),
                  resultCount: r && typeof r === 'object' ? Object.keys(r).length : 0
                });
              } catch {
                snap = '';
              }
              const lastSnap = String(window.__stockxListingWidgetLastSnap || '');
              if (s && typeof s === 'object') {
                state.scanId = String(s.scanId || sid);
                state.stage = String(s.stage || state.stage || '');
                state.total = Number(s.total || state.total || 0);
                state.current = Number(s.completed || state.current || 0);
              }
              if (r && typeof r === 'object') {
                // Convert map(url->result) into the existing state.results shape.
                state.results = {};
                for (const [url, val] of Object.entries(r)) {
                  state.results[url] = val;
                }
              }
              // Avoid infinite recursion: only redraw if widget exists
              const w = document.getElementById('stockx-bid-opps-widget');
              if (!w) return;
              if (hovering || focusedInside || interacting) return;
              if (snap && snap === lastSnap) return;
              window.__stockxListingWidgetLastSnap = snap;
              ensureListingBidWidget();
            });
          });
        } catch {}
      }, 1200);
    }
  } catch {}

  const widget = existing || document.createElement('div');
  widget.id = 'stockx-bid-opps-widget';
  const savedPos = getListingWidgetPosCached();
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const safeLeft = savedPos ? clamp(savedPos.left, 8, Math.max(8, window.innerWidth - 60)) : null;
  const safeTop = savedPos ? clamp(savedPos.top, 8, Math.max(8, window.innerHeight - 60)) : null;
  widget.style.cssText = `
    position: fixed;
    ${savedPos ? `top: ${safeTop}px; left: ${safeLeft}px; bottom: auto;` : `bottom: 16px; left: 16px;`}
    width: 360px;
    max-height: 70vh;
    overflow-y: auto;
    overflow-x: hidden;
    background: rgba(17, 24, 39, 0.95);
    color: #fff;
    padding: 12px;
    border-radius: 12px;
    z-index: 2147483647;
    box-shadow: 0 12px 30px rgba(0,0,0,0.35);
    border: 1px solid rgba(34,197,94,0.25);
    font-family: Arial, sans-serif;
    pointer-events: auto;
    user-select: auto;
  `;

  // While the cursor is over the widget, pause background-driven rerenders so clicks work reliably.
  try {
    widget.onmouseenter = () => {
      window.__stockxListingWidgetHovering = true;
    };
    widget.onmouseleave = () => {
      window.__stockxListingWidgetHovering = false;
    };
    const markInteracting = () => {
      // Give the user a small window where we never re-render the widget,
      // otherwise clicks/toggles can get canceled mid-flight.
      window.__stockxListingWidgetInteractingUntil = Date.now() + 2000;
    };
    widget.addEventListener('mousedown', markInteracting, { capture: true });
    widget.addEventListener('pointerdown', markInteracting, { capture: true });
    widget.addEventListener('touchstart', markInteracting, { capture: true, passive: true });
    widget.addEventListener('keydown', markInteracting, { capture: true });
    widget.addEventListener('focusin', markInteracting, { capture: true });
  } catch {}

  const resultEntries = Object.values(state.results || {});
  const profitableEntries = resultEntries.filter((r) => Array.isArray(r?.opportunities) && r.opportunities.length > 0);
  const otherEntries = resultEntries.filter((r) => !(Array.isArray(r?.opportunities) && r.opportunities.length > 0));
  const bidHistory = (() => {
    try {
      const m = window.__stockxBidHistoryCache;
      return m && typeof m === 'object' ? m : {};
    } catch {
      return {};
    }
  })();
  const renderEntry = (r) => {
    const title = String(r.title || r.slug || r.url || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const url = String(r.url || '');
    const slug = String(r.slug || '');
    const best = Array.isArray(r.opportunities) ? r.opportunities[0] : null;
    const opps = Array.isArray(r.opportunities) ? r.opportunities.slice(0, 3) : [];
    const bestKey = best ? bidHistoryKey({ slug, sizeParam: best.sizeParam || stockxSizeParamFromLabel(best.sizeLabel) }) : '';
    const bestAlreadyBid = !!(bestKey && bidHistory[bestKey]);
    const explainEmpty = () => {
      if (r?.success === false) return `Scan failed: ${String(r.error || 'unknown error')}`;
      if (r?.releaseExcluded) {
        const ds = Number(r?.releaseExcludedDays) || 0;
        const rd = String(r?.releaseDate || '');
        return `Excluded: released within last ${ds || 30} days${rd ? ` (release: ${rd})` : ''}.`;
      }
      const salesRows = Number(r?.salesRows) || 0;
      const asksRows = Number(r?.asksRows) || 0;
      const bidsRows = Number(r?.bidsRows) || 0;
      const foundBtn = !!r?.foundMarketDataButton;
      const opened = !!r?.openedMarketData;
      const sizeOptionsCount = Number(r?.sizeOptionsCount) || 0;
      const viableSizeCount = Number(r?.viableSizeCount) || 0;
      const eliminatedByAsk = Number(r?.eliminatedByAsk) || 0;
      const eliminatedByAvg30d = Number(r?.eliminatedByAvg30d) || 0;
      if (!foundBtn && !opened)
        return 'Could not find a Market Data button on this page (StockX UI variant not detected).';
      if (!opened && asksRows === 0 && bidsRows === 0 && salesRows === 0)
        return 'Tried to click “Market Data” but modal didn’t open (StockX blocked automation).';
      if (opened && asksRows === 0) return 'Could not parse Asks rows (0) — Market Data opened but UI/markup may have changed.';
      if (!opened && asksRows === 0) return 'Could not read Asks table (Market Data didn’t open).';
      if (opened && bidsRows === 0) return 'Could not parse Bids rows (0) — Market Data opened but UI/markup may have changed.';
      if (!opened && bidsRows === 0) return 'Could not read Bids table (Market Data didn’t open).';
      // Size menu is often unavailable in background tabs; we primarily rely on Bids table instead.
      if (sizeOptionsCount === 0) return 'Size menu not readable in background tab (OK) — using Bids table instead.';
      if (viableSizeCount === 0)
        return `No sizes met your rules (filtered profit ${eliminatedByAsk}, avg30d ${eliminatedByAvg30d}).`;
      if (salesRows === 0)
        return opened ? 'Could not parse Sales rows (0) — Market Data opened but Sales didn’t load/parse.' : 'Could not read Sales table (Market Data didn’t load).';
      return 'No sizes met your rules.';
    };
    const oppHtml = opps.length
      ? opps
          .map((o) => {
            const sp = String(o?.sizeParam || stockxSizeParamFromLabel(o?.sizeLabel) || '').trim();
            const k = bidHistoryKey({ slug, sizeParam: sp });
            const already = !!(k && bidHistory[k]);
            const badge = already
              ? `<span style="margin-left:8px; font-size:10px; font-weight:900; padding:2px 6px; border-radius:999px; background:rgba(34,197,94,0.20); border:1px solid rgba(34,197,94,0.35); color:#bbf7d0;">BIDDED</span>`
              : '';
            return `${formatOppRow(o, { slug, url })}${badge}`;
          })
          .join('')
      : `<div style="opacity:.65; font-size:12px;">${explainEmpty()}</div>`;
    return `
      <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:10px; margin-top:10px;">
        <div style="font-weight:800; font-size:13px; margin-bottom:6px;">${title}</div>
        ${oppHtml}
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button data-role="open-bid" data-slug="${slug}" data-sizeparam="${best ? String(best.sizeParam || '') : ''}" data-size="${best ? String(best.sizeLabel || '') : ''}" data-bid="${best ? String(best.suggestedBid || '') : ''}" ${best && !bestAlreadyBid ? '' : 'disabled'}
            style="flex:1; background:${best ? '#22c55e' : 'rgba(255,255,255,0.06)'}; border:1px solid rgba(255,255,255,0.10); color:${best ? '#052e14' : 'rgba(255,255,255,0.7)'}; padding:7px 8px; border-radius:10px; cursor:${best ? 'pointer' : 'not-allowed'}; font-weight:900;">
            ${bestAlreadyBid ? 'Bidded' : 'Bid best'}
          </button>
        </div>
        <div style="margin-top:6px; font-size:11px; color:rgba(255,255,255,0.55);">
          <a href="#" data-role="why" data-url="${url}" data-slug="${slug}" style="color:#93c5fd; text-decoration:underline;">why?</a>
        </div>
      </div>
    `;
  };

  const itemsHtml =
    resultEntries.length === 0
      ? `<div style="opacity:.75; font-size:12px;">No results yet. Click Scan to check the first items on this page.</div>`
      : (() => {
          const top = profitableEntries.length
            ? profitableEntries.map(renderEntry).join('')
            : `<div style="opacity:.75; font-size:12px;">No profitable opportunities found (with current settings).</div>`;

          const showOthers = !!state.showNonProfitable;
          const others =
            showOthers && otherEntries.length
              ? `<details style="margin-top:10px;">
                   <summary style="cursor:pointer; font-weight:900; font-size:12px; color:rgba(255,255,255,0.85);">
                     No opportunities / skipped (${otherEntries.length})
                   </summary>
                   <div style="margin-top:8px;">${otherEntries.map(renderEntry).join('')}</div>
                 </details>`
              : otherEntries.length
                ? `<div style="margin-top:10px; opacity:.65; font-size:12px;">
                     Hidden: ${otherEntries.length} items had no opportunities (toggle “Show skipped” to view).
                   </div>`
                : '';

          return `${top}${others}`;
        })();

  const stageLine =
    state.stage && state.total
      ? `<div style="margin-top:6px; font-size:11px; color:rgba(255,255,255,0.7);">
           ${state.stage} ${state.current || 0}/${state.total}
         </div>`
      : '';

  widget.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
      <div data-role="drag-handle" style="display:flex; align-items:center; gap:8px; cursor:move; user-select:none;">
        <div style="font-weight:900; color:#bbf7d0;">Bid opportunities (page)</div>
        <span style="opacity:.55; font-size:11px; font-weight:800;">drag</span>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <button title="Dashboard" data-role="open-dashboard" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.10); color:rgba(255,255,255,0.85); cursor:pointer; padding:4px 8px; border-radius:10px; font-weight:900; font-size:12px;">📈</button>
        <button title="Settings" data-role="open-settings" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.10); color:rgba(255,255,255,0.85); cursor:pointer; padding:4px 8px; border-radius:10px; font-weight:900; font-size:12px;">⚙</button>
        <button data-role="close" title="Close" style="background:none;border:none;color:rgba(255,255,255,0.75);cursor:pointer;font-size:18px;">×</button>
      </div>
    </div>
    <div style="display:flex; gap:8px; margin-top:10px;">
      <button data-role="scan" style="flex:1; background:#22c55e; border:1px solid rgba(34,197,94,0.9); color:#052e14; padding:8px 10px; border-radius:10px; cursor:pointer; font-weight:900;">
        Scan this page
      </button>
      <button data-role="scan-pages" style="width:120px; background:#10b981; border:1px solid rgba(16,185,129,0.9); color:#052e14; padding:8px 10px; border-radius:10px; cursor:pointer; font-weight:900;">
        Scan pages
      </button>
      <button data-role="stop" style="width:90px; background:#ef4444; border:1px solid rgba(239,68,68,0.95); color:#450a0a; padding:8px 10px; border-radius:10px; cursor:pointer; font-weight:1000;">
        Stop
      </button>
      <button data-role="clear" style="width:90px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.10); color:white; padding:8px 10px; border-radius:10px; cursor:pointer; font-weight:800;">
        Clear
      </button>
    </div>
    <div style="display:flex; align-items:center; gap:8px; margin-top:8px; font-size:12px; color:rgba(255,255,255,0.8);">
      <span style="opacity:.8;">Items to scan:</span>
      <input data-role="max-items" inputmode="numeric" value="${String(state.maxItems || 48)}"
        style="width:64px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:white; padding:6px 8px; border-radius:8px;" />
      <span style="opacity:.6;">(max 48)</span>
    </div>
    <div style="display:flex; align-items:center; gap:8px; margin-top:6px; font-size:12px; color:rgba(255,255,255,0.8);">
      <span style="opacity:.8;">Pages:</span>
      <input data-role="max-pages" inputmode="numeric" value="${String(state.maxPages || 5)}"
        style="width:64px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:white; padding:6px 8px; border-radius:8px;" />
      <span style="opacity:.6;">(scan next pages via ?page=)</span>
    </div>
    <div style="display:flex; align-items:center; gap:8px; margin-top:6px; font-size:12px; color:rgba(255,255,255,0.8);">
      <span style="opacity:.8;">Tabs at once:</span>
      <input data-role="concurrency" inputmode="numeric" value="${String(state.concurrency || 1)}"
        style="width:64px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:white; padding:6px 8px; border-radius:8px;" />
      <span style="opacity:.6;">(1–5)</span>
    </div>
    <div style="display:flex; align-items:center; gap:10px; margin-top:8px; font-size:12px; color:rgba(255,255,255,0.82);">
      <label style="display:flex; align-items:center; gap:6px; cursor:pointer; user-select:none;">
        <input type="checkbox" data-role="only-sneakers" ${state.onlySneakers ? 'checked' : ''} />
        Only sneakers (skip collectibles/electronics/etc)
      </label>
    </div>
    <div style="display:flex; align-items:center; gap:10px; margin-top:6px; font-size:12px; color:rgba(255,255,255,0.82);">
      <label style="display:flex; align-items:center; gap:6px; cursor:pointer; user-select:none;">
        <input type="checkbox" data-role="skip-one-size" ${state.skipOneSize ? 'checked' : ''} />
        Skip “ONE SIZE” items
      </label>
    </div>
    <div style="display:flex; align-items:center; gap:10px; margin-top:6px; font-size:12px; color:rgba(255,255,255,0.82);">
      <label style="display:flex; align-items:center; gap:6px; cursor:pointer; user-select:none;">
        <input type="checkbox" data-role="bidding-mode" ${state.biddingMode ? 'checked' : ''} />
        Bidding mode (auto-skip already bidded sizes)
      </label>
      <label style="display:flex; align-items:center; gap:6px; cursor:pointer; user-select:none; margin-left:6px;">
        <input type="checkbox" data-role="show-skipped" ${state.showNonProfitable ? 'checked' : ''} />
        Show skipped
      </label>
      <label title="Logs what received your click + what element is on top (Console)" style="display:flex; align-items:center; gap:6px; cursor:pointer; user-select:none; margin-left:6px; opacity:.85;">
        <input type="checkbox" data-role="debug-clicks" ${state.debugClicks ? 'checked' : ''} />
        Debug
      </label>
      <button data-role="bid-all" style="margin-left:auto; background:#22c55e; border:1px solid rgba(34,197,94,0.9); color:#052e14; padding:6px 10px; border-radius:10px; cursor:pointer; font-weight:900;">
        Bid all
      </button>
      <button data-role="clear-bids" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.10); color:white; padding:6px 10px; border-radius:10px; cursor:pointer; font-weight:800;">
        Clear bids
      </button>
    </div>
    ${stageLine}
    <div style="margin-top:10px;">${itemsHtml}</div>
  `;

  if (!existing) document.body.appendChild(widget);

  // Prevent StockX's page-level click handlers from reacting to interactions inside our widget.
  // Some pages attach listeners that can cause tiny scroll adjustments on any click.
  try {
    if (!widget.__stockxStopPropInstalled) {
      widget.__stockxStopPropInstalled = true;
      const stop = (e) => {
        try { e.stopPropagation(); } catch {}
      };
      ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach((t) => {
        try { widget.addEventListener(t, stop, false); } catch {}
      });
    }
  } catch {}

  // Delegate primary actions so they still work even if StockX cancels the normal "click" event.
  // Using pointerup in capture phase makes actions reliably fire on the first press.
  try {
    if (!widget.__stockxDelegatedActionsInstalled) {
      widget.__stockxDelegatedActionsInstalled = true;
      const ACTION_ROLES = new Set([
        'open-dashboard',
        'open-settings',
        'close',
        'scan',
        'scan-pages',
        'stop',
        'clear',
        'open-size',
        'open-bid',
        'bid-all',
        'clear-bids',
        'why'
      ]);

      // Swallow click events for action roles so per-element click handlers don't double-run.
      // This also prevents StockX from seeing these clicks.
      try {
        widget.addEventListener(
          'click',
          (e) => {
            try {
              const role = e?.target?.closest?.('[data-role]')?.getAttribute?.('data-role') || '';
              if (!role || !ACTION_ROLES.has(role)) return;
              e.preventDefault?.();
              e.stopPropagation?.();
            } catch {}
          },
          { capture: true }
        );
      } catch {}

      widget.addEventListener(
        'pointerup',
        (e) => {
          try {
            const roleEl = e?.target?.closest?.('[data-role]');
            const role = roleEl?.getAttribute?.('data-role') || '';
            if (!role || !ACTION_ROLES.has(role)) return;

            e.preventDefault?.();
            e.stopPropagation?.();

            if (role === 'open-dashboard') return void openExtensionDashboardTab();
            if (role === 'open-settings') return void openExtensionSettingsTab();
            if (role === 'close') return void widget.remove();

            if (role === 'open-size') {
              const url = roleEl.getAttribute('data-url') || '';
              const sp = roleEl.getAttribute('data-sizeparam') || '';
              const target = withSizeParam(url, sp);
              if (!target) return;
              return void openUrlInNewTabBestEffort(target);
            }

            if (role === 'open-bid') {
              const slug = roleEl.getAttribute('data-slug') || '';
              const sizeLabel = roleEl.getAttribute('data-size') || '';
              const sizeParam = roleEl.getAttribute('data-sizeparam') || '';
              const bid = Number(roleEl.getAttribute('data-bid') || '');
              if (!slug || !sizeLabel || !Number.isFinite(bid) || bid <= 0) return;
              const sizeKey = String(sizeParam || stockxSizeParamFromLabel(sizeLabel) || normalizeSizeKey(sizeLabel) || '').trim();
              if (!sizeKey) return;
              // Mark as bidded so we don't rebid this (slug,size) later
              markBidPlaced({
                slug,
                url: `${location.origin}/${slug}`,
                sizeLabel,
                sizeParam: sizeKey,
                bid: Math.round(bid),
                ask: null
              }).catch(() => {});
              // Open bid tab + auto-run
              openBidInNewTab({ slug, sizeKey, bid: Math.round(bid) }).then((res) => {
                try {
                  if (!res?.ok) state.stage = `Bid tab failed: ${res?.error || 'unknown error'}`;
                  else state.stage = `Opened bid tab for ${sizeLabel}`;
                  ensureListingBidWidget();
                } catch {}
              });
              return;
            }

            if (role === 'why') {
              const url = roleEl.getAttribute('data-url') || '';
              const slug = roleEl.getAttribute('data-slug') || '';
              const vals = Object.values(state.results || {});
              const entry =
                (url ? vals.find((x) => String(x?.url || '') === url) : null) ||
                (slug ? vals.find((x) => String(x?.slug || '') === slug) : null) ||
                null;
              try {
                const payload = entry
                  ? {
                      scanId: entry.scanId || null,
                      savedAt: entry.savedAt || null,
                      url: entry.url,
                      slug: entry.slug,
                      title: entry.title,
                      success: entry.success,
                      error: entry.error,
                      sizeOptionsCount: entry.sizeOptionsCount,
                      asksRows: entry.asksRows,
                      bidsRows: entry.bidsRows,
                      salesRows: entry.salesRows,
                      viableSizeCount: entry.viableSizeCount,
                      eliminatedByAsk: entry.eliminatedByAsk,
                      marketDataOpenDebug: entry.marketDataOpenDebug || null,
                      marketDataTabDebug: entry.marketDataTabDebug || null,
                      marketDataSample: entry.marketDataSample || null,
                      nextDataVariantDebug: entry.nextDataVariantDebug || null,
                      sizeAll: entry.sizeAll || null,
                      opportunities: (entry.opportunities || []).slice(0, 5)
                    }
                  : null;
                const text = payload ? JSON.stringify(payload, null, 2) : 'No debug info found for this item.';
                showCopyableDebugModal(text);
              } catch {}
              return;
            }

            if (role === 'clear-bids') {
              clearBidHistory()
                .then(() => ensureListingBidWidget())
                .catch(() => {});
              return;
            }

            if (role === 'bid-all') {
              (async () => {
                try {
                  const vals = Object.values(state.results || {});
                  const allOpps = [];
                  for (const r of vals) {
                    const slug = String(r?.slug || '');
                    const url = String(r?.url || '');
                    const opps = Array.isArray(r?.opportunities) ? r.opportunities : [];
                    for (const o of opps) {
                      const sizeLabel = String(o?.sizeLabel || '').trim();
                      const sizeParam = String(o?.sizeParam || stockxSizeParamFromLabel(sizeLabel) || '').trim();
                      const bid = Number(o?.suggestedBid);
                      const ask = Number(o?.lowestAsk);
                      if (!slug || !url || !sizeParam || !Number.isFinite(bid) || bid <= 0) continue;
                      allOpps.push({
                        slug,
                        url,
                        sizeLabel,
                        sizeParam,
                        bid: Math.round(bid),
                        ask: Number.isFinite(ask) ? Math.round(ask) : null
                      });
                    }
                  }
                  // De-dupe by (slug,sizeParam)
                  const uniq = new Map();
                  for (const x of allOpps) {
                    const k = bidHistoryKey({ slug: x.slug, sizeParam: x.sizeParam });
                    if (!k) continue;
                    if (!uniq.has(k)) uniq.set(k, x);
                  }
                  const toBid = Array.from(uniq.values());
                  if (!toBid.length) {
                    state.stage = 'No opportunities to bid';
                    ensureListingBidWidget();
                    return;
                  }

                  state.stage = `bidding ${toBid.length}…`;
                  ensureListingBidWidget();

                  const history = await loadBidHistoryMap();
                  for (let i = 0; i < toBid.length; i++) {
                    const x = toBid[i];
                    const k = bidHistoryKey({ slug: x.slug, sizeParam: x.sizeParam });
                    if (state.biddingMode && k && history[k]) continue;

                    state.stage = `bidding ${i + 1}/${toBid.length}…`;
                    ensureListingBidWidget();

                    // Mark first to prevent double-bids if the flow navigates/reloads
                    await markBidPlaced(x);
                    history[k] = { ...(history[k] || {}), ...x, placedAt: Date.now() };

                    const res = await openBidInNewTab({ slug: x.slug, sizeKey: x.sizeParam, bid: x.bid });
                    if (!res?.ok) {
                      // If opening failed, clear the mark so it can retry later
                      try {
                        delete history[k];
                        await saveBidHistoryMap(history);
                      } catch {}
                    }
                    // Don't spam tabs instantly
                    await new Promise((r) => setTimeout(r, 900));
                  }

                  state.stage = 'done (bidding)';
                  ensureListingBidWidget();
                } catch (err) {
                  state.stage = `error: ${err?.message || String(err)}`;
                  ensureListingBidWidget();
                }
              })();
              return;
            }

            if (role === 'clear') {
              try {
                state.scanId = '';
                state.total = 0;
                state.current = 0;
                state.stage = '';
                state.results = {};
              } catch {}
              ensureListingBidWidget();
              return;
            }

            if (role === 'stop') {
              try {
                // If scanId isn't set yet, remember the user's intent and stop as soon as we get it.
                if (!state.scanId) {
                  state.pendingStop = true;
                  state.stage = 'stopping';
                  ensureListingBidWidget();
                  return;
                }
                state.pendingStop = false;
                state.stage = 'stopping';
                ensureListingBidWidget();
                runtimeSendMessageSafe({ action: 'stopListingBidScan', scanId: state.scanId }, (resp) => {
                  try {
                    if (!resp?.success) state.stage = `error: ${resp?.error || 'failed to stop'}`;
                    else state.stage = 'stopped';
                    ensureListingBidWidget();
                  } catch {}
                });
              } catch (err) {
                state.stage = `error: ${err?.message || String(err)}`;
                ensureListingBidWidget();
              }
              return;
            }

            if (role === 'scan') {
              try {
                const maxItems = Math.max(1, Math.min(48, Number(state.maxItems || 48)));
                const concurrency = Math.max(1, Math.min(5, Number(state.concurrency || 1)));
                const settings = getScanSettingsCached();
                const urls = collectListingProductUrls(maxItems, {
                  onlySneakers: !!state.onlySneakers,
                  skipOneSize: !!state.skipOneSize || !!settings.skipOneSize,
                  excludeSponsored: !!settings.excludeSponsored,
                  includeCategories: Array.isArray(settings.includeCategories) ? settings.includeCategories : []
                });
                if (!urls.length) {
                  state.stage = 'No products detected';
                  state.total = 0;
                  state.current = 0;
                  ensureListingBidWidget();
                  return;
                }
                state.results = {};
                state.stage = 'starting';
                state.total = urls.length;
                state.current = 0;
                state.pendingStop = false;
                ensureListingBidWidget();
                runtimeSendMessageSafe({ action: 'startListingBidScan', urls, maxItems: urls.length, concurrency }, (resp) => {
                  const ok = resp?.success;
                  if (!ok) {
                    state.stage = `error: ${resp?.error || 'failed to start'}`;
                    ensureListingBidWidget();
                    return;
                  }
                  state.scanId = resp.scanId;
                  state.total = resp.total || urls.length;
                  state.stage = 'queued';
                  state.current = 0;
                  if (state.pendingStop) {
                    const sid = state.scanId;
                    state.stage = 'stopping';
                    ensureListingBidWidget();
                    runtimeSendMessageSafe({ action: 'stopListingBidScan', scanId: sid }, () => {});
                  }
                  ensureListingBidWidget();
                });
              } catch (err) {
                state.stage = `error: ${err?.message || String(err)}`;
                ensureListingBidWidget();
              }
              return;
            }

            if (role === 'scan-pages') {
              try {
                const maxPages = Math.max(1, Math.min(200, Number(state.maxPages || 1)));
                const perPage = 48;
                const settings = getScanSettingsCached();
                const collectOpts = {
                  onlySneakers: !!state.onlySneakers,
                  skipOneSize: !!state.skipOneSize || !!settings.skipOneSize,
                  excludeSponsored: !!settings.excludeSponsored,
                  includeCategories: Array.isArray(settings.includeCategories) ? settings.includeCategories : []
                };

                state.results = {};
                state.stage = `starting (pages x${maxPages})`;
                state.total = maxPages * perPage;
                state.current = 0;
                state.pendingStop = false;
                ensureListingBidWidget();

                runtimeSendMessageSafe(
                  { action: 'startListingBidScanPaginated', startUrl: location.href, maxPages, perPage, collectOpts, allowBackground: false },
                  (resp) => {
                    const ok = resp?.success;
                    if (!ok) {
                      state.stage = `error: ${resp?.error || 'failed to start'}`;
                      ensureListingBidWidget();
                      return;
                    }
                    state.scanId = resp.scanId;
                    state.total = resp.total || maxPages * perPage;
                    state.stage = 'queued';
                    state.current = 0;
                    if (state.pendingStop) {
                      const sid = state.scanId;
                      state.stage = 'stopping';
                      ensureListingBidWidget();
                      runtimeSendMessageSafe({ action: 'stopListingBidScan', scanId: sid }, () => {});
                    }
                    ensureListingBidWidget();
                  }
                );
              } catch (err) {
                state.stage = `error: ${err?.message || String(err)}`;
                ensureListingBidWidget();
              }
              return;
            }
          } catch {}
        },
        { capture: true }
      );
    }
  } catch {}

  widget.querySelector('[data-role="open-settings"]')?.addEventListener('click', (e) => {
    try {
      e.preventDefault();
      e.stopPropagation();
      openExtensionSettingsTab();
    } catch {}
  });
  widget.querySelector('[data-role="open-dashboard"]')?.addEventListener('click', (e) => {
    try {
      e.preventDefault();
      e.stopPropagation();
      openExtensionDashboardTab();
    } catch {}
  });
  widget.querySelector('[data-role="close"]')?.addEventListener('click', () => widget.remove());

  // Click debug: if clicks never reach the widget, this won't fire (useful for diagnosing pointer-event blocking).
  try {
    if (!widget.__stockxClickDebugInstalled) {
      widget.__stockxClickDebugInstalled = true;
      widget.addEventListener(
        'pointerdown',
        (ev) => {
          try {
            window.__stockxListingWidgetInteractingUntil = Date.now() + 2000;
          } catch {}
          try {
            if (state.debugClicks && ev && typeof ev.clientX === 'number') {
              const topEl = document.elementFromPoint?.(ev.clientX, ev.clientY);
              const target = ev.target;
              const role = target?.closest?.('[data-role]')?.getAttribute?.('data-role') || '';
              console.log('🖱️ widget pointerdown', {
                role,
                targetTag: String(target?.tagName || ''),
                targetText: safeText(target).slice(0, 80),
                topTag: String(topEl?.tagName || ''),
                topText: safeText(topEl).slice(0, 80)
              });
            }
          } catch {}
        },
        { capture: true }
      );
    }
  } catch {}

  // Drag-to-move (header only). Persists to chrome.storage.local.
  try {
    const handle = widget.querySelector('[data-role="drag-handle"]');
    if (handle && !handle.__stockxDragInstalled) {
      handle.__stockxDragInstalled = true;
      let dragging = false;
      let startX = 0;
      let startY = 0;
      let startLeft = 0;
      let startTop = 0;
      let w = 0;
      let h = 0;

      const onMove = (ev) => {
        try {
          if (!dragging) return;
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          const maxLeft = Math.max(8, window.innerWidth - w - 8);
          const maxTop = Math.max(8, window.innerHeight - h - 8);
          const nextLeft = clamp(startLeft + dx, 8, maxLeft);
          const nextTop = clamp(startTop + dy, 8, maxTop);
          widget.style.left = `${Math.round(nextLeft)}px`;
          widget.style.top = `${Math.round(nextTop)}px`;
          widget.style.bottom = 'auto';
          try {
            window.__stockxListingWidgetPosCache = { left: Math.round(nextLeft), top: Math.round(nextTop) };
          } catch {}
        } catch {}
      };

      const onUp = async () => {
        try {
          if (!dragging) return;
          dragging = false;
          const pos = getListingWidgetPosCached();
          if (pos) await saveListingWidgetPos(pos);
        } catch {}
        try {
          window.removeEventListener('pointermove', onMove, true);
          window.removeEventListener('pointerup', onUp, true);
          window.removeEventListener('pointercancel', onUp, true);
        } catch {}
      };

      handle.addEventListener('pointerdown', (ev) => {
        try {
          if (ev.button != null && ev.button !== 0) return;
          const r = widget.getBoundingClientRect();
          w = r.width;
          h = r.height;
          startX = ev.clientX;
          startY = ev.clientY;
          startLeft = r.left;
          startTop = r.top;
          dragging = true;
          widget.style.bottom = 'auto';
          widget.style.left = `${Math.round(startLeft)}px`;
          widget.style.top = `${Math.round(startTop)}px`;
          ev.preventDefault();
          try { handle.setPointerCapture?.(ev.pointerId); } catch {}
          window.addEventListener('pointermove', onMove, true);
          window.addEventListener('pointerup', onUp, true);
          window.addEventListener('pointercancel', onUp, true);
        } catch {}
      });
    }
  } catch {}

  const stopBtn = widget.querySelector('[data-role="stop"]');
  try {
    const s = String(state.stage || '').toLowerCase();
    const isDone = s === 'done' || s.startsWith('done ') || s === 'stopped';
    const isError = s.startsWith('error:');
    const isRunning = !!state.scanId && !isDone && !isError;
    const canStop = isRunning || state.pendingStop || s === 'starting' || s === 'queued' || s === 'opening' || s === 'scanning' || s === 'scanned';
    if (stopBtn) {
      stopBtn.disabled = !canStop;
      stopBtn.style.opacity = canStop ? '1' : '0.35';
      stopBtn.style.cursor = canStop ? 'pointer' : 'not-allowed';
    }
  } catch {}

  stopBtn?.addEventListener('click', () => {
    try {
      // If scanId isn't set yet, remember the user's intent and stop as soon as we get it.
      if (!state.scanId) {
        state.pendingStop = true;
        state.stage = 'stopping';
        ensureListingBidWidget();
        return;
      }
      state.pendingStop = false;
      state.stage = 'stopping';
      ensureListingBidWidget();
      runtimeSendMessageSafe({ action: 'stopListingBidScan', scanId: state.scanId }, (resp) => {
        if (!resp?.success) {
          state.stage = `error: ${resp?.error || 'failed to stop'}`;
        } else {
          state.stage = 'stopped';
        }
        ensureListingBidWidget();
      });
    } catch (e) {
      state.stage = `error: ${e?.message || String(e)}`;
      ensureListingBidWidget();
    }
  });
  widget.querySelector('[data-role="clear"]')?.addEventListener('click', () => {
    try {
      state.scanId = '';
      state.total = 0;
      state.current = 0;
      state.stage = '';
      state.results = {};
    } catch {}
    ensureListingBidWidget();
  });

  const maxEl = widget.querySelector('[data-role="max-items"]');
  maxEl?.addEventListener('input', () => {
    const n = Math.max(1, Math.min(48, Number(String(maxEl.value || '').trim())));
    if (!Number.isFinite(n)) return;
    state.maxItems = n;
  });

  const concEl = widget.querySelector('[data-role="concurrency"]');
  concEl?.addEventListener('input', () => {
    const n = Math.max(1, Math.min(5, Number(String(concEl.value || '').trim())));
    if (!Number.isFinite(n)) return;
    state.concurrency = n;
  });

  const maxPagesEl = widget.querySelector('[data-role="max-pages"]');
  maxPagesEl?.addEventListener('input', () => {
    const n = Math.max(1, Math.min(200, Number(String(maxPagesEl.value || '').trim())));
    if (!Number.isFinite(n)) return;
    state.maxPages = n;
  });

  const onlySneakersEl = widget.querySelector('[data-role="only-sneakers"]');
  onlySneakersEl?.addEventListener('change', () => {
    try {
      state.onlySneakers = !!onlySneakersEl.checked;
    } catch {}
  });

  const skipOneSizeEl = widget.querySelector('[data-role="skip-one-size"]');
  skipOneSizeEl?.addEventListener('change', () => {
    try {
      state.skipOneSize = !!skipOneSizeEl.checked;
    } catch {}
  });

  const biddingModeEl = widget.querySelector('[data-role="bidding-mode"]');
  biddingModeEl?.addEventListener('change', () => {
    try {
      state.biddingMode = !!biddingModeEl.checked;
    } catch {}
  });

  const showSkippedEl = widget.querySelector('[data-role="show-skipped"]');
  showSkippedEl?.addEventListener('change', () => {
    try {
      state.showNonProfitable = !!showSkippedEl.checked;
      // Defer rerender to avoid "clunky" clicks where the DOM is replaced mid-toggle.
      setTimeout(() => {
        try { ensureListingBidWidget(); } catch {}
      }, 0);
    } catch {}
  });

  const debugClicksEl = widget.querySelector('[data-role="debug-clicks"]');
  debugClicksEl?.addEventListener('change', () => {
    try {
      state.debugClicks = !!debugClicksEl.checked;
    } catch {}
  });

  widget.querySelector('[data-role="clear-bids"]')?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await clearBidHistory();
    ensureListingBidWidget();
  });

  widget.querySelector('[data-role="bid-all"]')?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const vals = Object.values(state.results || {});
      const allOpps = [];
      for (const r of vals) {
        const slug = String(r?.slug || '');
        const url = String(r?.url || '');
        const opps = Array.isArray(r?.opportunities) ? r.opportunities : [];
        for (const o of opps) {
          const sizeLabel = String(o?.sizeLabel || '').trim();
          const sizeParam = String(o?.sizeParam || stockxSizeParamFromLabel(sizeLabel) || '').trim();
          const bid = Number(o?.suggestedBid);
          const ask = Number(o?.lowestAsk);
          if (!slug || !url || !sizeParam || !Number.isFinite(bid) || bid <= 0) continue;
          allOpps.push({ slug, url, sizeLabel, sizeParam, bid: Math.round(bid), ask: Number.isFinite(ask) ? Math.round(ask) : null });
        }
      }
      // De-dupe by (slug,sizeParam)
      const uniq = new Map();
      for (const x of allOpps) {
        const k = bidHistoryKey({ slug: x.slug, sizeParam: x.sizeParam });
        if (!k) continue;
        if (!uniq.has(k)) uniq.set(k, x);
      }
      const toBid = Array.from(uniq.values());
      if (!toBid.length) {
        state.stage = 'No opportunities to bid';
        ensureListingBidWidget();
        return;
      }

      state.stage = `bidding ${toBid.length}…`;
      ensureListingBidWidget();

      const history = await loadBidHistoryMap();
      for (let i = 0; i < toBid.length; i++) {
        const x = toBid[i];
        const k = bidHistoryKey({ slug: x.slug, sizeParam: x.sizeParam });
        if (state.biddingMode && k && history[k]) continue;

        state.stage = `bidding ${i + 1}/${toBid.length}…`;
        ensureListingBidWidget();

        // Mark first to prevent double-bids if the flow navigates/reloads
        await markBidPlaced(x);
        history[k] = { ...(history[k] || {}), ...x, placedAt: Date.now() };

        const res = await openBidInNewTab({ slug: x.slug, sizeKey: x.sizeParam, bid: x.bid });
        if (!res?.ok) {
          // If opening failed, clear the mark so it can retry later
          try {
            delete history[k];
            await saveBidHistoryMap(history);
          } catch {}
        }
        // Don't spam tabs instantly
        await new Promise((r) => setTimeout(r, 900));
      }

      state.stage = 'done (bidding)';
      ensureListingBidWidget();
    } catch (err) {
      state.stage = `error: ${err?.message || String(err)}`;
      ensureListingBidWidget();
    }
  });

  widget.querySelector('[data-role="scan"]')?.addEventListener('click', () => {
    try {
      const maxItems = Math.max(1, Math.min(48, Number(state.maxItems || 48)));
      const concurrency = Math.max(1, Math.min(5, Number(state.concurrency || 1)));
      const settings = getScanSettingsCached();
      const urls = collectListingProductUrls(maxItems, {
        onlySneakers: !!state.onlySneakers,
        skipOneSize: !!state.skipOneSize || !!settings.skipOneSize,
        excludeSponsored: !!settings.excludeSponsored,
        includeCategories: Array.isArray(settings.includeCategories) ? settings.includeCategories : []
      });
      if (!urls.length) {
        state.stage = 'No products detected';
        state.total = 0;
        state.current = 0;
        ensureListingBidWidget();
        return;
      }
      state.results = {};
      state.stage = 'starting';
      state.total = urls.length;
      state.current = 0;
      state.pendingStop = false;
      ensureListingBidWidget();
      runtimeSendMessageSafe({ action: 'startListingBidScan', urls, maxItems: urls.length, concurrency }, (resp) => {
        const ok = resp?.success;
        if (!ok) {
          state.stage = `error: ${resp?.error || 'failed to start'}`;
          ensureListingBidWidget();
          return;
        }
        state.scanId = resp.scanId;
        state.total = resp.total || urls.length;
        state.stage = 'queued';
        state.current = 0;
        // If the user clicked Stop before we got the scanId, stop immediately now.
        if (state.pendingStop) {
          const sid = state.scanId;
          state.stage = 'stopping';
          ensureListingBidWidget();
          runtimeSendMessageSafe({ action: 'stopListingBidScan', scanId: sid }, () => {});
        }
        ensureListingBidWidget();
      });
    } catch (e) {
      state.stage = `error: ${e?.message || String(e)}`;
      ensureListingBidWidget();
    }
  });

  widget.querySelector('[data-role="scan-pages"]')?.addEventListener('click', () => {
    try {
      const maxPages = Math.max(1, Math.min(200, Number(state.maxPages || 1)));
      const perPage = 48;
      const settings = getScanSettingsCached();
      const collectOpts = {
        onlySneakers: !!state.onlySneakers,
        skipOneSize: !!state.skipOneSize || !!settings.skipOneSize,
        excludeSponsored: !!settings.excludeSponsored,
        includeCategories: Array.isArray(settings.includeCategories) ? settings.includeCategories : []
      };

      // Reset UI state
      state.results = {};
      state.stage = `starting (pages x${maxPages})`;
      state.total = maxPages * perPage;
      state.current = 0;
      state.pendingStop = false;
      ensureListingBidWidget();

      runtimeSendMessageSafe(
        { action: 'startListingBidScanPaginated', startUrl: location.href, maxPages, perPage, collectOpts, allowBackground: false },
        (resp) => {
          const ok = resp?.success;
          if (!ok) {
            state.stage = `error: ${resp?.error || 'failed to start'}`;
            ensureListingBidWidget();
            return;
          }
          state.scanId = resp.scanId;
          state.total = resp.total || maxPages * perPage;
          state.stage = 'queued';
          state.current = 0;
          if (state.pendingStop) {
            const sid = state.scanId;
            state.stage = 'stopping';
            ensureListingBidWidget();
            runtimeSendMessageSafe({ action: 'stopListingBidScan', scanId: sid }, () => {});
          }
          ensureListingBidWidget();
        }
      );
    } catch (e) {
      state.stage = `error: ${e?.message || String(e)}`;
      ensureListingBidWidget();
    }
  });

  // Row buttons
  widget.querySelectorAll('[data-role="open-size"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      try {
        try { e?.preventDefault?.(); } catch {}
        try { e?.stopPropagation?.(); } catch {}
        const url = btn.getAttribute('data-url') || '';
        const sp = btn.getAttribute('data-sizeparam') || '';
        const target = withSizeParam(url, sp);
        if (!target) return;
        openUrlInNewTabBestEffort(target);
      } catch {}
    });
  });
  widget.querySelectorAll('[data-role="open-bid"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const slug = btn.getAttribute('data-slug') || '';
      const sizeLabel = btn.getAttribute('data-size') || '';
      const sizeParam = btn.getAttribute('data-sizeparam') || '';
      const bid = Number(btn.getAttribute('data-bid') || '');
      if (!slug || !sizeLabel || !Number.isFinite(bid) || bid <= 0) return;
      const sizeKey = String(sizeParam || stockxSizeParamFromLabel(sizeLabel) || normalizeSizeKey(sizeLabel) || '').trim();
      if (!sizeKey) return;
      // Mark as bidded so we don't rebid this (slug,size) later
      await markBidPlaced({
        slug,
        url: `${location.origin}/${slug}`,
        sizeLabel,
        sizeParam: sizeKey,
        bid: Math.round(bid),
        ask: null
      });
      // Reuse the existing helper flow to open /buy/... and auto-run the bid.
      const res = await openBidInNewTab({ slug, sizeKey, bid: Math.round(bid) });
      try {
        if (!res?.ok) state.stage = `Bid tab failed: ${res?.error || 'unknown error'}`;
        else state.stage = `Opened bid tab for ${sizeLabel}`;
        ensureListingBidWidget();
      } catch {}
    });
  });

  widget.querySelectorAll('[data-role="why"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = btn.getAttribute('data-url') || '';
      const slug = btn.getAttribute('data-slug') || '';
      const vals = Object.values(state.results || {});
      const entry =
        (url ? vals.find((x) => String(x?.url || '') === url) : null) ||
        (slug ? vals.find((x) => String(x?.slug || '') === slug) : null) ||
        null;
      try {
        console.log('🧪 Bid scan debug:', entry);
      } catch {}
      try {
        const payload = entry
          ? {
              scanId: entry.scanId || null,
              savedAt: entry.savedAt || null,
              url: entry.url,
              slug: entry.slug,
              title: entry.title,
              success: entry.success,
              error: entry.error,
              sizeOptionsCount: entry.sizeOptionsCount,
              asksRows: entry.asksRows,
              bidsRows: entry.bidsRows,
              salesRows: entry.salesRows,
              viableSizeCount: entry.viableSizeCount,
              eliminatedByAsk: entry.eliminatedByAsk,
              marketDataOpenDebug: entry.marketDataOpenDebug || null,
              marketDataTabDebug: entry.marketDataTabDebug || null,
              marketDataSample: entry.marketDataSample || null,
              nextDataVariantDebug: entry.nextDataVariantDebug || null,
              sizeAll: entry.sizeAll || null,
              opportunities: (entry.opportunities || []).slice(0, 5)
            }
          : null;

        const text = payload ? JSON.stringify(payload, null, 2) : 'No debug info found for this item.';
        showCopyableDebugModal(text);
      } catch {}
    });
  });

  // Expose message handler for background progress
  try {
    window.__stockxListingBidScanHandleMsg = (msg) => {
      if (!msg) return;
      // Only update the active scan
      if (state.scanId && msg.scanId && state.scanId !== msg.scanId) return;
      if (msg.action === 'listingBidScanProgress') {
        state.stage = msg.stage || state.stage;
        state.current = msg.current || state.current;
        state.total = msg.total || state.total;
        ensureListingBidWidget();
      } else if (msg.action === 'listingBidScanResult') {
        const r = msg;
        const key = r.slug || r.url || `${Date.now()}_${Math.random().toString(16).slice(2)}`;
        state.results[key] = r;
        ensureListingBidWidget();
      } else if (msg.action === 'listingBidScanDone') {
        if (msg.cancelled) state.stage = 'stopped';
        else state.stage = msg.success ? 'done' : `done (error: ${msg.error || 'unknown'})`;
        ensureListingBidWidget();
      }
    };
  } catch {}
}

function showCopyableDebugModal(text) {
  try {
    const id = 'stockx-bid-debug-modal';
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.55);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      font-family: Arial, sans-serif;
    `;

    const card = document.createElement('div');
    card.style.cssText = `
      width: min(900px, 96vw);
      max-height: 85vh;
      background: rgba(17, 24, 39, 0.98);
      color: rgba(255,255,255,0.92);
      border: 1px solid rgba(99,102,241,0.35);
      border-radius: 12px;
      box-shadow: 0 18px 40px rgba(0,0,0,0.45);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;

    const header = document.createElement('div');
    header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px;';
    header.innerHTML = `
      <div style="font-weight:900; color:#c7d2fe;">Debug info</div>
      <button data-role="close" style="background:none;border:none;color:rgba(255,255,255,0.75);cursor:pointer;font-size:18px;">×</button>
    `;

    const ta = document.createElement('textarea');
    ta.value = String(text || '');
    ta.readOnly = true;
    ta.spellcheck = false;
    ta.style.cssText = `
      width: 100%;
      flex: 1;
      min-height: 240px;
      background: rgba(255,255,255,0.06);
      color: rgba(255,255,255,0.92);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px;
      padding: 10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      line-height: 1.4;
      resize: vertical;
    `;

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex; gap:8px; justify-content:flex-end; align-items:center;';
    actions.innerHTML = `
      <div data-role="status" style="margin-right:auto; font-size:11px; color:rgba(255,255,255,0.65);"></div>
      <button data-role="select" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.10); color:white; padding:8px 10px; border-radius:10px; cursor:pointer; font-weight:900;">Select</button>
      <button data-role="copy" style="background:#22c55e; border:1px solid rgba(34,197,94,0.9); color:#052e14; padding:8px 10px; border-radius:10px; cursor:pointer; font-weight:1000;">Copy</button>
    `;

    card.appendChild(header);
    card.appendChild(ta);
    card.appendChild(actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const close = () => {
      try { overlay.remove(); } catch {}
    };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    header.querySelector('[data-role="close"]')?.addEventListener('click', close);

    const statusEl = actions.querySelector('[data-role="status"]');
    const setStatus = (s) => {
      if (statusEl) statusEl.textContent = String(s || '');
    };

    actions.querySelector('[data-role="select"]')?.addEventListener('click', () => {
      try {
        ta.focus();
        ta.select();
        setStatus('Selected');
      } catch {}
    });

    actions.querySelector('[data-role="copy"]')?.addEventListener('click', async () => {
      try {
        const v = ta.value || '';
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(v);
          setStatus('Copied to clipboard');
          return;
        }
      } catch {}
      // Fallback
      try {
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        setStatus(ok ? 'Copied to clipboard' : 'Copy failed (try Select then Cmd+C)');
      } catch {
        setStatus('Copy failed (try Select then Cmd+C)');
      }
    });

    // Auto-select for convenience
    try {
      ta.focus();
      ta.select();
    } catch {}
  } catch {}
}

function ensureGlobalStopOverlay() {
  try {
    if (!location.hostname.includes('stockx.com')) return;
    const id = 'stockx-global-stop-scan';

    const upsert = (activeScanId) => {
      const existingNow = document.getElementById(id);
      if (!activeScanId) {
        if (existingNow) existingNow.remove();
        return;
      }
      const el = existingNow || document.createElement('div');
      el.id = id;
      el.style.cssText = `
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 2147483647;
        font-family: Arial, sans-serif;
        pointer-events: auto;
      `;
      el.innerHTML = `
        <button data-role="stop-scan" style="
          background:#ef4444;
          border:1px solid rgba(239,68,68,0.95);
          color:#450a0a;
          padding:10px 12px;
          border-radius:9999px;
          cursor:pointer;
          font-weight:1000;
          box-shadow: 0 10px 22px rgba(0,0,0,0.25);
        ">Stop scan</button>
      `;
      if (!existingNow) document.body.appendChild(el);
      el.querySelector('[data-role="stop-scan"]')?.addEventListener('click', () => {
        try {
          if (!chrome?.runtime?.sendMessage) return;
          chrome.runtime.sendMessage({ action: 'stopListingBidScan', scanId: activeScanId }, () => {
            void chrome.runtime.lastError;
          });
        } catch {}
      });
    };

    // Poll storage for an active scan id (set by background). This keeps the overlay working in any tab.
    if (window.__stockxGlobalStopOverlayPollInstalled) return;
    window.__stockxGlobalStopOverlayPollInstalled = true;
    const tick = () => {
      try {
        chrome?.storage?.local?.get?.(['stockxActiveListingScanId'], (res) => {
          void chrome.runtime.lastError;
          const sid = String(res?.stockxActiveListingScanId || '');
          upsert(sid || '');
        });
      } catch {}
    };
    tick();
    setInterval(tick, 1000);
  } catch {}
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
  // Explicitly exclude homepage (it has h1/buttons and can falsely match)
  try {
    const u = new URL(url);
    if ((u.hostname || '').includes('stockx.com') && ((u.pathname || '/') === '/' || (u.pathname || '') === '')) {
      return false;
    }
    // Also exclude category/listing style routes
    const path = String(u.pathname || '/').toLowerCase();
    if (path.startsWith('/category/')) return false;
    // And require product pages to be a single slug segment
    const parts = path.split('/').filter(Boolean);
    if (parts.length !== 1) return false;
  } catch {}
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

// Main function
function init() {
  console.log('🔍 Initializing simple tracker...');

  // Ensure we detect SPA navigations and query-param size changes reliably.
  installUrlChangeHooks();

  // If this tab was opened by the listing scanner, run in scan-only mode (no big widgets).
  const isScanTab = (() => {
    try {
      const u = new URL(location.href);
      const yes = u.searchParams.get('extScan') === '1';
      if (yes) {
        try { window.__stockxIsScanTab = true; } catch {}
      }
      return yes || !!window.__stockxIsScanTab;
    } catch {
      return !!window.__stockxIsScanTab;
    }
  })();

  // Clean URL in scan tabs (keep scan-only behavior via window.__stockxIsScanTab).
  try {
    if (isScanTab) {
      const u = new URL(location.href);
      if (u.searchParams.has('extScan') || u.searchParams.has('extScanId')) {
        u.searchParams.delete('extScan');
        u.searchParams.delete('extScanId');
        history.replaceState({}, '', u.toString());
      }
    }
  } catch {}

  // If we landed on /buy/...defaultBid=true due to a pending request, run it automatically.
  try {
    if (!isScanTab) runPendingOfferRequestIfPresent();
  } catch {}
  
  // If this is a buying order page, run tracking watcher (independent of product widget).
  if (!isScanTab) startBuyingTrackingWatcher();

  // Product helper widget (recent sales + bid automation) – render best-effort and keep retrying during hydration.
  if (!isScanTab) startProductHelperWatcher();

  // Listing-page scanner widget (category/search pages)
  try {
    if (!isScanTab) ensureListingBidWidget();
  } catch {}

  // Global red stop overlay for listing scans (must work on ANY StockX tab)
  try {
    ensureGlobalStopOverlay();
  } catch {}
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

  // Also restart product helper watcher on any SPA navigation.
  try {
    startProductHelperWatcher();
  } catch {}

  // Listing widget may need to show/hide on route changes
  try {
    ensureListingBidWidget();
  } catch {}

  // Global stop overlay should also survive SPA navigations
  try {
    ensureGlobalStopOverlay();
  } catch {}
}).observe(document, { subtree: true, childList: true });
