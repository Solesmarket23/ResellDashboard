export function extractStockXUrlKeyFromLink(raw: unknown): string | null {
  const input = typeof raw === 'string' ? raw.trim() : '';
  if (!input) return null;

  const tryParse = (maybeUrl: string): string | null => {
    try {
      const u = new URL(maybeUrl);

      // Some email trackers wrap the real destination in ?r=...
      const redirected =
        u.searchParams.get('r') ||
        u.searchParams.get('redirect') ||
        u.searchParams.get('redirect_url') ||
        u.searchParams.get('url');
      if (redirected && redirected.includes('stockx.com')) {
        const nested = tryParse(redirected);
        if (nested) return nested;
      }

      const host = u.host.toLowerCase();
      if (!host.includes('stockx.com')) return null;

      const path = u.pathname.replace(/^\/+/, '');
      const first = path.split('/')[0]?.trim() || '';
      if (!first) return null;
      // Ignore non-product paths
      if (first === 'search' || first === 'category' || first === 'news' || first === 'help') return null;
      return first;
    } catch {
      return null;
    }
  };

  // Accept both raw slugs and URLs
  if (!input.startsWith('http://') && !input.startsWith('https://')) {
    if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(input)) return input;
  }

  return tryParse(input);
}

export function extractStockXUrlKeyFromPurchase(purchase: any): string | null {
  const candidates: unknown[] = [
    purchase?.urlKey,
    purchase?.stockxUrlKey,
    purchase?.stockxUrl,
    purchase?.productUrl,
    purchase?.productLink,
    purchase?.url,
    purchase?.product?.urlKey,
    purchase?.product?.stockxUrl,
    purchase?.product?.url,
    purchase?.links?.stockx,
  ];
  for (const c of candidates) {
    const key = extractStockXUrlKeyFromLink(c);
    if (key) return key;
  }
  return null;
}

/**
 * Normalize a stored size string into the StockX `?size=` param format.
 *
 * Examples:
 * - "US M 13" -> "13"
 * - "US W 8" -> "8W"
 * - "6.5Y" -> "6.5Y"
 * - "XL" / "US XL" -> "XL"
 */
export function normalizeStockXSizeForUrl(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s || s.toLowerCase() === 'unknown') return null;
  const upper = s.toUpperCase();

  const isWomen =
    /\bW\b/.test(upper) ||
    upper.includes('USW') ||
    upper.includes('WOMEN') ||
    /(\d+(?:\.\d+)?)W\b/.test(upper);
  const isYouth =
    /\bY\b/.test(upper) ||
    upper.includes('YOUTH') ||
    /(\d+(?:\.\d+)?)Y\b/.test(upper);

  // Prefer a numeric core size if present
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (m) {
    const num = m[1];
    if (isYouth) return `${num}Y`;
    if (isWomen) return `${num}W`;
    return num;
  }

  // Apparel letter sizes
  const letter = s.match(/\b(XXXL|XXL|XL|XS|S|M|L)\b/i)?.[1];
  if (letter) return letter.toUpperCase();

  // Fallback: preserve token to avoid empty links
  return s;
}

export function buildStockXUrl(args: {
  urlKey?: string | null;
  styleId?: string | null;
  productName?: string | null;
  size?: string | null;
}): string {
  const urlKey = typeof args.urlKey === 'string' ? args.urlKey.trim() : '';
  const size = typeof args.size === 'string' ? args.size.trim() : '';
  const hasSize = !!size;
  if (urlKey) {
    return `https://stockx.com/${urlKey}${hasSize ? `?size=${encodeURIComponent(size)}` : ''}`;
  }
  const term = (String(args.styleId || '').trim() || String(args.productName || '').trim() || 'StockX').trim();
  return `https://stockx.com/search?s=${encodeURIComponent(term)}`;
}

