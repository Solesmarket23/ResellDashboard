import { refreshStockXTokens } from './tokenRefresh';

export type StockXAuth =
  | { apiKey: string; accessToken: string; refreshToken?: string }
  | { apiKey: string; refreshToken: string; accessToken?: string };

export type StockXMarketPriceResult = {
  price: number | null;
  productId?: string;
  variantId?: string;
  urlKey?: string;
  termUsed?: string;
  reason:
    | 'ok'
    | 'missing_search_term'
    | 'missing_refresh_token'
    | 'token_refresh_failed'
    | 'search_http_error'
    | 'no_products'
    | 'missing_product_id'
    | 'market_http_error'
    | 'no_variants'
    | 'no_variant'
    | 'no_price'
    | 'network_error'
    | 'unknown_error';
  stage?: 'auth' | 'search' | 'market';
  httpStatus?: number;
  details?: string;
};

function buildSearchTerms(args: {
  urlKey?: string | null;
  styleId?: string | null;
  productName?: string | null;
}): string[] {
  const terms: string[] = [];
  const push = (s: unknown) => {
    const t = typeof s === 'string' ? s.trim() : '';
    if (t) terms.push(t);
  };

  // Strongest identifier first: StockX urlKey/slug (e.g. "asics-gel-nyc-oyster-grey")
  push(args.urlKey || '');
  push(args.styleId || '');
  push(args.productName || '');

  // Common cleanups to improve StockX catalog search hit rate.
  // - remove parenthetical brand/notes: "Foo (adidas)" -> "Foo"
  // - remove "Size: ..." suffixes
  // - collapse whitespace
  const cleaned1 = String(args.productName || '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\bsize\s*:\s*.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  push(cleaned1);

  // More aggressive: strip common SKU-ish punctuation
  const cleaned2 = cleaned1.replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  push(cleaned2);

  // Dedupe while preserving order
  return Array.from(new Set(terms));
}

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
  // Include 408 since we observed StockX returning timeouts for product-level market-data.
  const retryStatuses = new Set([408, 429, 500, 502, 503, 504]);
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

function pickVariantIdBySize(variants: any[], size: string): string | null {
  const v = pickVariantBySize(variants, size);
  const vid = v?.variantId || v?.id || v?.uuid;
  return vid ? String(vid) : null;
}

function lowestAskFromVariant(variant: any): number | null {
  const std = parseStockXMoneyToDollars(variant?.lowestAskAmount);
  const flex = parseStockXMoneyToDollars(variant?.flexLowestAskAmount);
  if (std !== null && flex !== null) return Math.min(std, flex);
  return std ?? flex ?? null;
}

export async function fetchStockXMarketPriceDetailed(args: {
  auth: StockXAuth;
  productName: string;
  size: string;
  styleId?: string | null;
  urlKey?: string | null;
  productId?: string | null;
  variantId?: string | null;
}): Promise<StockXMarketPriceResult> {
  const searchTerms = buildSearchTerms({ urlKey: args.urlKey, styleId: args.styleId, productName: args.productName });
  if (searchTerms.length === 0) return { price: null, reason: 'missing_search_term' };

  let accessToken: string;
  try {
    const t = await getStockXAccessToken(args.auth);
    accessToken = t.accessToken;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toLowerCase().includes('missing stockx refresh token')) {
      return { price: null, reason: 'missing_refresh_token', stage: 'auth', details: msg };
    }
    if (msg.toLowerCase().includes('token refresh failed')) {
      return { price: null, reason: 'token_refresh_failed', stage: 'auth', details: msg };
    }
    return { price: null, reason: 'unknown_error', stage: 'auth', details: msg };
  }

  const apiKey = args.auth.apiKey;

  try {
    // Fast path: if we already know productId+variantId (repricer-style), skip catalog search entirely.
    const directProductId = args.productId ? String(args.productId).trim() : '';
    const directVariantId = args.variantId ? String(args.variantId).trim() : '';
    if (directProductId && directVariantId) {
      const variantMarketUrl = `https://api.stockx.com/v2/catalog/products/${directProductId}/variants/${directVariantId}/market-data`;
      const vmRes = await stockxFetchWithRetry(variantMarketUrl, { apiKey, accessToken });
      if (!vmRes.ok) {
        return {
          price: null,
          reason: 'market_http_error',
          stage: 'market',
          httpStatus: vmRes.status,
          details: 'direct_variant_market_data',
          productId: directProductId,
          variantId: directVariantId,
          urlKey: args.urlKey || undefined,
        };
      }
      const vmData = await vmRes.json().catch(() => null);
      const variantData = Array.isArray(vmData)
        ? vmData.find((item: any) => String(item?.variantId) === String(directVariantId))
        : vmData;
      if (!variantData) {
        return {
          price: null,
          reason: 'no_variant',
          stage: 'market',
          productId: directProductId,
          variantId: directVariantId,
          urlKey: args.urlKey || undefined,
        };
      }
      const price = lowestAskFromVariant(variantData);
      if (price === null) {
        return {
          price: null,
          reason: 'no_price',
          stage: 'market',
          productId: directProductId,
          variantId: directVariantId,
          urlKey: args.urlKey || undefined,
        };
      }
      return {
        price,
        reason: 'ok',
        details: 'direct_variant_market_data',
        productId: directProductId,
        variantId: directVariantId,
        urlKey: args.urlKey || undefined,
      };
    }

    let productId: string | null = null;
    let urlKey: string | null = null;
    let termUsed: string | null = null;
    let lastNoProductsTerm: string | null = null;

    // Step 1: Catalog search -> productId (try a few query variants)
    for (const term of searchTerms) {
      const searchUrl = `https://api.stockx.com/v2/catalog/search?query=${encodeURIComponent(term)}&pageSize=5`;
      const searchRes = await stockxFetchWithRetry(searchUrl, { apiKey, accessToken });
      if (!searchRes.ok) {
        return { price: null, reason: 'search_http_error', stage: 'search', httpStatus: searchRes.status, details: `term=${term}` };
      }
      const searchData = await searchRes.json().catch(() => ({}));
      // NOTE: StockX v2 catalog search in this codebase returns `products` (see /api/stockx/search),
      // but some older codepaths use `results`/`Products`. Support all.
      const products = (searchData.products || searchData.results || searchData.Products || []) as any[];
      if (!Array.isArray(products) || products.length === 0) {
        lastNoProductsTerm = term;
        continue;
      }
      const product = products[0];
      const pid = product.productId || product.id || product.uuid;
      if (pid) {
        productId = String(pid);
        urlKey = (product.urlKey || product.url_key || product.productUrlKey || product.slug || null) ? String(product.urlKey || product.url_key || product.productUrlKey || product.slug) : null;
        termUsed = term;
        break;
      }
      return { price: null, reason: 'missing_product_id', stage: 'search', details: `term=${term}` };
    }

    if (!productId) {
      return { price: null, reason: 'no_products', stage: 'search', details: lastNoProductsTerm ? `term=${lastNoProductsTerm}` : undefined, termUsed: lastNoProductsTerm || undefined };
    }

    // Step 2: Prefer repricer-style flow: fetch variants -> pick variantId -> variant market-data
    const variantsUrl = `https://api.stockx.com/v2/catalog/products/${productId}/variants`;
    const variantsRes = await stockxFetchWithRetry(variantsUrl, { apiKey, accessToken });
    if (!variantsRes.ok) {
      return { price: null, reason: 'market_http_error', stage: 'market', httpStatus: variantsRes.status, details: 'variants' };
    }
    const variantsData = await variantsRes.json().catch(() => null);
    const variants = Array.isArray(variantsData) ? variantsData : (variantsData?.variants || []);
    if (!Array.isArray(variants) || variants.length === 0) {
      return { price: null, reason: 'no_variants', stage: 'market', productId, urlKey: urlKey || undefined, termUsed: termUsed || undefined };
    }
    const variantId = pickVariantIdBySize(variants, args.size);
    if (!variantId) return { price: null, reason: 'no_variant', stage: 'market', productId, urlKey: urlKey || undefined, termUsed: termUsed || undefined };

    const variantMarketUrl = `https://api.stockx.com/v2/catalog/products/${productId}/variants/${variantId}/market-data`;
    const vmRes = await stockxFetchWithRetry(variantMarketUrl, { apiKey, accessToken });
    if (!vmRes.ok) {
      // Fallback to product-level market-data in case variant endpoint is temporarily unavailable.
      const fallbackUrl = `https://api.stockx.com/v2/catalog/products/${productId}/market-data`;
      const marketRes = await stockxFetchWithRetry(fallbackUrl, { apiKey, accessToken });
      if (!marketRes.ok) {
        return { price: null, reason: 'market_http_error', stage: 'market', httpStatus: vmRes.status, details: `variant_market_failed_then_product_market_failed (${vmRes.status}/${marketRes.status})`, productId, variantId, urlKey: urlKey || undefined, termUsed: termUsed || undefined };
      }
      const marketData = await marketRes.json().catch(() => null);
      const arr = Array.isArray(marketData) ? marketData : [];
      const variant = pickVariantBySize(arr, args.size);
      if (!variant) return { price: null, reason: 'no_variant', stage: 'market', productId, variantId, urlKey: urlKey || undefined, termUsed: termUsed || undefined };
      const price = lowestAskFromVariant(variant);
      if (price === null) return { price: null, reason: 'no_price', stage: 'market', productId, variantId, urlKey: urlKey || undefined, termUsed: termUsed || undefined };
      return { price, reason: 'ok', details: 'fallback_product_market_data', productId, variantId, urlKey: urlKey || undefined, termUsed: termUsed || undefined };
    }

    const vmData = await vmRes.json().catch(() => null);
    const variantData = Array.isArray(vmData)
      ? vmData.find((item: any) => String(item?.variantId) === String(variantId))
      : vmData;
    if (!variantData) return { price: null, reason: 'no_variant', stage: 'market', productId, variantId, urlKey: urlKey || undefined, termUsed: termUsed || undefined };
    const price = lowestAskFromVariant(variantData);
    if (price === null) return { price: null, reason: 'no_price', stage: 'market', productId, variantId, urlKey: urlKey || undefined, termUsed: termUsed || undefined };
    return { price, reason: 'ok', productId, variantId, urlKey: urlKey || undefined, termUsed: termUsed || undefined };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Best-effort: never throw to callers (Slack notifications, etc.)
    return { price: null, reason: 'network_error', details: msg };
  }
}

export async function fetchStockXMarketPrice(args: {
  auth: StockXAuth;
  productName: string;
  size: string;
  styleId?: string | null;
}): Promise<number | null> {
  const res = await fetchStockXMarketPriceDetailed(args);
  return res.price;
}

