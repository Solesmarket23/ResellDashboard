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
    const excludedPrefixes = [
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
  // Prefer numeric part for matching (e.g. "US 9.5" -> "9.5")
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
  const m1 = s.match(/\b(?:US|UK|EU)\s*([MW]?\s*\d{1,2}(?:\.\d)?)\b/i);
  if (m1?.[0]) return m1[0].toUpperCase().replace(/\s+/g, ' ');

  const m2 = s.match(/\b(?:MEN|WOMEN|M|W)\s*(\d{1,2}(?:\.\d)?)\b/i);
  if (m2?.[0]) return m2[0].toUpperCase().replace(/\s+/g, ' ');

  // Fallback: plain numeric size, but constrain to realistic shoe size range and avoid common non-size contexts.
  const m3 = s.match(/\b(\d{1,2}(?:\.\d)?)\b/);
  if (!m3?.[1]) return null;
  const n = Number(m3[1]);
  if (!Number.isFinite(n)) return null;
  if (n < 3 || n > 21) return null;
  const lowered = s.toLowerCase();
  if (/\b(sales|sold|reviews|results|items|views|followers)\b/i.test(lowered)) return null;
  return String(n);
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
      if (!/sale\s*price/i.test(headerText) || !/\bdate\b/i.test(headerText) || !/\bsize\b/i.test(headerText)) return [];
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
        const dateIdx = colIndex.date !== -1 ? colIndex.date : Math.max(0, tds.length - 3);
        const sizeIdx = colIndex.size !== -1 ? colIndex.size : Math.max(0, tds.length - 2);
        const priceIdx = colIndex.price !== -1 ? colIndex.price : Math.max(0, tds.length - 1);

        // First try the mapped indices, then fall back to per-row detection.
        const quick = parseRowCells([tds[dateIdx], tds[sizeIdx], tds[priceIdx]].filter(Boolean));
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
      if (!/sale\s*price/i.test(rootText) || !/\bdate\b/i.test(rootText) || !/\bsize\b/i.test(rootText)) return [];

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

function parseMarketDataAsksTable(max = 100) {
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

    // Find the active market modal on the Asks tab
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]'));
    const dialog = dialogs.find((d) => {
      if (!isVisibleEl(d)) return false;
      const tab = d.querySelector('[role="tab"][aria-selected="true"]');
      if (safeText(tab).trim().toLowerCase() !== 'asks') return false;
      return safeText(d).toLowerCase().includes('all asks');
    });
    const root = dialog || document;

    const vma = root.querySelector('[data-component="ViewMarketActivity"]') || root;
    const table = vma.querySelector('table') || null;
    if (!table) return [];

    const headerText = safeText(table.querySelector('thead') || table).toLowerCase();
    // Expect at least Size + Ask/Price
    if (!headerText.includes('size') || !(headerText.includes('ask') || headerText.includes('price'))) return [];

    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const out = [];
    for (const tr of rows) {
      const tds = Array.from(tr.querySelectorAll('td,th'));
      if (tds.length < 2) continue;
      const txt = safeText(tr);
      if (!txt) continue;
      const price = parsePriceFromText(txt);
      if (!isPlausibleUsd(price)) continue;
      const size = safeText(tds.find((td) => /US\b/i.test(safeText(td)) || !!parseSizeFromText(safeText(td))) || tds[0]);
      out.push({ size: size || '', ask: price, raw: txt });
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

    const highestBid = getValueNearLabel(/highest\s+bid/i) ?? getValueNearLabel(/^\s*bid\s*$/i);
    const lowestAsk = getValueNearLabel(/lowest\s+ask/i) ?? getValueNearLabel(/^\s*ask\s*$/i);
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
    return v ? String(v) : '';
  } catch {
    return '';
  }
}

function setPreferredSize(size) {
  try {
    localStorage.setItem('stockxExtensionPreferredSize', String(size || ''));
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
    return els.find((el) => re.test(safeText(el)));
  };

  return (
    document.querySelector('a[href*="/buy/"][href*="defaultBid=true"]') ||
    byText(/make\s+offer/i) ||
    byText(/place\s+bid/i) ||
    byText(/\bbid\b/i) ||
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
    const req = extId ? await loadPendingOfferRequestById(extId) : await loadPendingOfferRequest();
    if (!req) {
      console.log('🟦 StockX Helper: no pending offer request found in storage');
      return;
    }

    // Ignore stale requests (>10 min)
    if (typeof req.createdAt === 'number' && Date.now() - req.createdAt > 10 * 60 * 1000) {
      if (extId) await deletePendingOfferRequestById(extId);
      else await clearPendingOfferRequest();
      return;
    }

    const slug = getOfferSlugFromUrl();
    const sizeKey = normalizeSizeKey(getSelectedSizeFromUrl());

    const reqSlug = String(req.slug || '').trim();
    const reqSize = normalizeSizeKey(req.size);
    if (!reqSlug || !slug || reqSlug !== slug) return;
    if (reqSize && sizeKey && !sizeKeyMatches(reqSize, sizeKey)) return;

    // Avoid running twice on the same page load.
    const pageKey = `${req.id}::${location.pathname}::${location.search}`;
    if (window.__stockxOfferAutoRanForPageKey === pageKey) return;
    window.__stockxOfferAutoRanForPageKey = pageKey;

    console.log('🟦 StockX Helper: running pending offer request on buy flow page', { slug, sizeKey, bid: req.bid, req });

    // If we're already on the review screen, just click Confirm Bid.
    const confirmNow = findConfirmBidButton(document);
    if (confirmNow) {
      console.log('🟦 StockX Helper: Confirm Bid button found, clicking...');
      try {
        confirmNow.scrollIntoView?.({ block: 'center', inline: 'center' });
      } catch {}
      try {
        confirmNow.click();
      } catch {}
      if (extId) await deletePendingOfferRequestById(extId);
      else await clearPendingOfferRequest();
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
      bidInput.value = String(req.bid || '').trim();
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
    await waitForAndCaptureFees({ root: document, timeoutMs: 8000 });

    // Click Review Bid then Confirm Bid
    const reviewBtn = await waitForElement(
      () => document.querySelector('button[data-testid="checkout-confirm-button"]') || findOfferSubmitButton(document),
      15000
    );
    if (!reviewBtn) {
      console.warn('⚠️ StockX Helper: Review Bid button not found');
      return;
    }
    try {
      console.log('🟦 StockX Helper: clicking Review Bid...');
      reviewBtn.click();
    } catch {}

    // Do NOT clear pending here; Review may navigate. We'll pick it up on the next /buy/ page and click Confirm.
    await updatePendingOfferRequest({ stage: 'review_clicked' });
  } catch (e) {
    console.warn('⚠️ runPendingOfferRequestIfPresent failed:', e);
  }
}

async function openBidInNewTab({ slug, sizeKey, bid }) {
  try {
    const id = `extBid_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const ok = await savePendingOfferRequestById(id, { slug, size: sizeKey, bid });
    if (!ok) return { ok: false, error: 'Failed to save bid request' };
    const url = `${location.origin}/buy/${slug}?size=${encodeURIComponent(sizeKey)}&defaultBid=true&extBidId=${encodeURIComponent(id)}`;
    const res = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'openTab', url }, (resp) => resolve(resp));
    });
    if (!res?.success) return { ok: false, error: res?.error || 'Failed to open tab' };
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
        const saved = await savePendingOfferRequest({ slug, size: sizeKey, bid });
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
        const saved = await savePendingOfferRequest({ slug, size: sizeKey, bid });
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
  if (size) {
    const normalized = String(size).trim().toUpperCase();
    // Click a size dropdown/button then choose an option containing the size text.
    const sizeControl =
      dialog.querySelector('button[aria-haspopup="listbox"], [role="combobox"], select') ||
      Array.from(dialog.querySelectorAll('button,[role="button"]')).find((b) => /size/i.test(safeText(b)));
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
  await waitForAndCaptureFees({ root, timeoutMs: 8000 });

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
  const confirmBtn = await waitForElement(() => findConfirmBidButton(document), 8000);
  if (!confirmBtn) {
    return { ok: false, error: 'Review Bid clicked, but Confirm Bid button never appeared.' };
  }
  try {
    // No second confirm popup; we already confirmed the intent above.
    confirmBtn.click();
  } catch {
    return { ok: false, error: 'Failed to click Confirm Bid.' };
  }

  return { ok: true };
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
  const scanSales = scan?.results
    ? scan.results.map((r) => ({ sizeLabel: r.sizeLabel, count: r.count, avg: r.avg }))
    : null;
  const allTargets = scanSales
    ? computeSizeTargetsLastNDays({ recentSales: scanSales.map((r) => ({ size: r.sizeLabel, price: r.avg, date: new Date().toISOString().slice(0, 10) })), days: 30, minSales: 4, minProfit: 15, feeSum })
    : computeSizeTargetsLastNDays({ recentSales, days: 30, minSales: 4, minProfit: 15, feeSum });
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
      <div style="font-weight:800; color:#c7d2fe;">StockX Helper</div>
      <button data-role="close" style="background:none;border:none;color:rgba(255,255,255,0.8);cursor:pointer;font-size:18px;">×</button>
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
      if (res?.pendingNavigation) statusEl.textContent = 'Opening offer page… (will auto-fill and submit there)';
      else statusEl.textContent = res.ok ? 'Offer submitted (or awaiting site confirmation).' : `Bid failed: ${res.error}`;
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
        return `
          <div data-role="target-row" data-size="${safeSize}"
            style="width:100%; display:flex; justify-content:space-between; gap:10px; padding:7px 8px; border-radius:8px; border:1px solid rgba(255,255,255,0.10); background:rgba(255,255,255,0.04); color:white;">
            <div style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              <span style="font-weight:900;">${safeSize}</span>
              <span style="opacity:.75;"> • ${count} sales${eligible ? '' : ' (need 4)'}</span>
            </div>
            <div style="text-align:right; white-space:nowrap;">
              <div style="font-weight:900;">max bid ${maxBid != null ? `$${maxBid}` : '—'}</div>
              <div style="opacity:.75; font-size:11px;">all-in ${maxAllIn != null ? `$${maxAllIn}` : '—'} • avg ${avg != null ? `$${avg}` : '—'}</div>
              <div style="margin-top:6px; display:flex; justify-content:flex-end; gap:8px;">
                <button data-role="target-select" data-size="${safeSize}"
                  style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.10); color:white; padding:4px 8px; border-radius:8px; cursor:pointer; font-weight:800;">
                  Select
                </button>
                <button data-role="target-bid" data-size="${safeSize}" data-bid="${maxBid != null ? String(maxBid) : ''}" ${eligible && maxBid != null ? '' : 'disabled'}
                  style="background:${eligible && maxBid != null ? '#22c55e' : 'rgba(255,255,255,0.06)'}; border:1px solid rgba(255,255,255,0.10); color:${eligible && maxBid != null ? '#052e14' : 'rgba(255,255,255,0.7)'}; padding:4px 10px; border-radius:8px; cursor:${eligible && maxBid != null ? 'pointer' : 'not-allowed'}; font-weight:900;">
                  Bid
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

async function ensureMarketDataSalesOpen() {
  try {
    // Open market data
    maybeOpenMarketDataOnce();
    // Ensure dialog exists
    const dialog = await waitForElement(() => document.querySelector('[role="dialog"], [aria-modal="true"]'), 6000);
    if (!dialog) return null;
    // Ensure Sales tab selected
    const salesTab = Array.from(dialog.querySelectorAll('[role="tab"]')).find((b) => safeText(b).trim().toLowerCase() === 'sales');
    if (salesTab && salesTab.getAttribute('aria-selected') !== 'true') {
      try { salesTab.click(); } catch {}
    }
    // Wait for rows
    await waitForElement(() => document.querySelectorAll('[data-component="ViewMarketActivity"] tbody tr').length ? true : null, 8000);
    return dialog;
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
    const sizes = await getAvailableSizesFromPicker();
    if (!sizes.length) {
      if (statusEl) statusEl.textContent = 'Could not read size list. Open the size dropdown once, then click Scan sizes again.';
      return;
    }
    const ok = window.confirm(`Scan ${sizes.length} sizes? This will switch sizes and open Market Data repeatedly.`);
    if (!ok) return;

    const results = [];
    for (let i = 0; i < sizes.length; i++) {
      const s = sizes[i];
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
        avg: stats.avg
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
    const looseOk = isProductPage(); // existing loose heuristic

    if (!strictOk && !looseOk) {
      console.log('🟨 StockX Helper: not a product page (yet)', {
        reason,
        strictOk,
        looseOk,
        url
      });
      return false;
    }

    console.log('🟩 StockX Helper: rendering widget', { reason, strictOk, looseOk, url, slug: getProductSlugFromUrl() });
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
    // Restart watchers (product helper + buying tracker)
    try {
      startProductHelperWatcher();
    } catch {}
    try {
      startBuyingTrackingWatcher();
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

// Main function
function init() {
  console.log('🔍 Initializing simple tracker...');

  // Ensure we detect SPA navigations and query-param size changes reliably.
  installUrlChangeHooks();

  // If we landed on /buy/...defaultBid=true due to a pending request, run it automatically.
  try {
    runPendingOfferRequestIfPresent();
  } catch {}
  
  // If this is a buying order page, run tracking watcher (independent of product widget).
  startBuyingTrackingWatcher();

  // Product helper widget (recent sales + bid automation) – render best-effort and keep retrying during hydration.
  startProductHelperWatcher();
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
}).observe(document, { subtree: true, childList: true });
