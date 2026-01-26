import { refreshStockXTokens } from './tokenRefresh';

export type StockXAuth =
  | { apiKey: string; accessToken: string; refreshToken?: string }
  | { apiKey: string; refreshToken: string; accessToken?: string };

function parseStockXMoneyToDollars(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  // StockX commonly returns cents as strings (e.g. "12345"), but sometimes dollars.
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
  if (!Number.isFinite(n) || n <= 0) return null;
  // Heuristic: if it's huge, treat as cents.
  if (n > 10_000) return n / 100;
  // If it's an integer and >= 1000, also likely cents.
  if (Number.isInteger(n) && n >= 1000) return n / 100;
  return n;
}

async function stockxFetchWithRetry(
  url: string,
  args: { apiKey: string; accessToken: string },
  opts?: { method?: string }
): Promise<Response> {
  const retryStatuses = new Set([429, 500, 502, 503, 504]);
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, {
      method: opts?.method || 'GET',
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        'X-API-Key': args.apiKey,
        Accept: 'application/json',
        'User-Agent': 'ResellDashboard/1.0'
      }
    });

    if (!res.ok && retryStatuses.has(res.status) && attempt < 5) {
      const retryAfter = res.headers.get('retry-after');
      const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : NaN;
      const retryAfterMs = Number.isFinite(retryAfterSeconds) ? Math.max(0, retryAfterSeconds * 1000) : 0;
      const baseBackoffMs = Math.min(30_000, 800 * Math.pow(2, attempt));
      const jitterMs = Math.floor(Math.random() * 250);
      const waitMs = Math.max(retryAfterMs, baseBackoffMs) + jitterMs;
      await res.text().catch(() => '');
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    return res;
  }

  // Should never reach
  return fetch(url);
}

export async function getStockXAccessToken(auth: StockXAuth): Promise<{ accessToken: string; refreshToken?: string }> {
  if (auth.accessToken) return { accessToken: auth.accessToken, refreshToken: auth.refreshToken };
  if (!auth.refreshToken) throw new Error('Missing StockX refresh token');

  const refreshed = await refreshStockXTokens(auth.refreshToken);
  if (!refreshed.success || !refreshed.accessToken) throw new Error(`StockX token refresh failed: ${refreshed.error || 'unknown'}`);
  return { accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken };
}

function pickVariantBySize(variants: any[], size: string): any | null {
  if (!Array.isArray(variants) || variants.length === 0) return null;
  const wanted = String(size || '').trim();
  if (wanted && wanted !== 'Unknown') {
    const exact = variants.find((v: any) => {
      const variantSize = v.variantValue || v.size || v.sizeValue || v.shoeSize || v.displaySize;
      return variantSize === wanted || variantSize === `US M ${wanted}` || variantSize === `US W ${wanted}`;
    });
    if (exact) return exact;
  }
  // Fallback: pick first variant that has pricing
  return (
    variants.find((v: any) => parseStockXMoneyToDollars(v.lowestAskAmount) || parseStockXMoneyToDollars(v.flexLowestAskAmount)) ||
    variants[0]
  );
}

function lowestAskFromVariant(variant: any): number | null {
  const std = parseStockXMoneyToDollars(variant?.lowestAskAmount);
  const flex = parseStockXMoneyToDollars(variant?.flexLowestAskAmount);
  if (std !== null && flex !== null) return Math.min(std, flex);
  return std ?? flex ?? null;
}

export async function fetchStockXMarketPrice(args: {
  auth: StockXAuth;
  productName: string;
  size: string;
  styleId?: string | null;
}): Promise<number | null> {
  try {
    const apiKey = args.auth.apiKey;
    const { accessToken } = await getStockXAccessToken(args.auth);

    const searchTerm = (args.styleId || args.productName || '').trim();
    if (!searchTerm) return null;

    // Step 1: Catalog search -> productId
    const searchUrl = `https://api.stockx.com/v2/catalog/search?query=${encodeURIComponent(searchTerm)}&pageSize=5`;
    const searchRes = await stockxFetchWithRetry(searchUrl, { apiKey, accessToken });
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json().catch(() => ({}));
    const products = (searchData.results || searchData.Products || []) as any[];
    if (!Array.isArray(products) || products.length === 0) return null;
    const product = products[0];
    const productId = product.id || product.uuid || product.productId;
    if (!productId) return null;

    // Step 2: Market data -> variant prices
    const marketUrl = `https://api.stockx.com/v2/catalog/products/${productId}/market-data`;
    const marketRes = await stockxFetchWithRetry(marketUrl, { apiKey, accessToken });
    if (!marketRes.ok) return null;
    const marketData = await marketRes.json().catch(() => null);
    const variants = Array.isArray(marketData) ? marketData : [];
    const variant = pickVariantBySize(variants, args.size);
    if (!variant) return null;
    return lowestAskFromVariant(variant);
  } catch (e) {
    // Best-effort: market price lookup should never break the caller (Slack notifications, etc.)
    console.warn('⚠️ StockX market price lookup failed (non-fatal):', e instanceof Error ? e.message : String(e));
    return null;
  }
}

