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
  askSource?: 'standard' | 'flex';
  askStd?: number | null;
  askFlex?: number | null;
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
  const rawStr = typeof raw === 'string' ? raw.trim() : String(raw).trim();
  const n = typeof raw === 'number' ? raw : parseFloat(rawStr);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Robust cents-vs-dollars heuristic:
  // - Many StockX endpoints return cents as an integer-like string with 5+ digits (e.g. "299300" -> $2,993.00)
  // - High-priced items can legitimately be 4 digits in dollars (e.g. 2993 -> $2,993), so do NOT downscale those.
  // - If the input looks like cents (5+ digits and no decimal), treat as cents.
  const looksInteger = Number.isInteger(n);
  const looksCentsString = typeof raw === 'string' && /^[0-9]{5,}$/.test(rawStr);
  if (looksCentsString) return n / 100;
  // For numeric inputs, only treat as cents when it's clearly huge.
  if (looksInteger && n > 10_000) return n / 100;
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
  const wantedRaw = String(size || '').trim();
  const wantedUpper = wantedRaw.toUpperCase();
  const wantsWomen = /\bW\b/.test(wantedUpper) || wantedUpper.includes('USW') || wantedUpper.includes("WOMEN");
  const wantsMen = /\bM\b/.test(wantedUpper) || wantedUpper.includes('USM') || wantedUpper.includes("MEN");
  const wantsYouth = /\bY\b/.test(wantedUpper);
  const canonicalize = (s: unknown) => {
    const raw = String(s ?? '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/-/g, '');
    if (!raw) return '';
    // Strip common "US" prefixes
    const t = raw.replace(/^US(?:M|W)?/i, '');
    // Canonicalize letter sizes (handle "XSMALL", "EXTRASMALL", etc.)
    const map: Record<string, string> = {
      EXTRASMALL: 'XS',
      XSMALL: 'XS',
      EXTRASMALLL: 'XS',
      EXTRALARGE: 'XL',
      XLARGE: 'XL',
      EXTRALARGE2: 'XL',
      XXSMALL: 'XXS',
      XXXSMALL: 'XXXS',
      XXLARGE: 'XXL',
      XXXLARGE: 'XXXL',
    };
    if (map[t]) return map[t];
    if (t === 'SMALL') return 'S';
    if (t === 'MEDIUM') return 'M';
    if (t === 'LARGE') return 'L';
    return t;
  };
  const normalize = canonicalize;
  const wanted = normalize(wantedRaw);
  const isLetterSize = (t: string) => ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'].includes(t);
  if (wanted && wanted !== 'UNKNOWN') {
    // If the input size is explicitly Women's / Men's / Youth, prefer matching that cohort first.
    // This avoids common mismatches like US W 8 matching a Men's USM8 variant.
    const cohortFiltered = (cohort: 'W' | 'M' | 'Y') => {
      return variants.filter((v: any) => {
        const variantSize = v.variantValue || v.size || v.sizeValue || v.shoeSize || v.displaySize;
        const raw = String(variantSize ?? '').toUpperCase().replace(/\s+/g, '');
        if (!raw) return false;
        // Women's sizes can appear as "USW8", "W8", or "8W" depending on endpoint.
        if (cohort === 'W') return raw.includes('USW') || raw.startsWith('W') || raw.endsWith('W') || raw.includes('WOMEN');
        if (cohort === 'M') return raw.includes('USM') || raw.startsWith('M');
        if (cohort === 'Y') return raw.includes('Y') || raw.endsWith('Y');
        return false;
      });
    };

    const tryExactIn = (pool: any[]) => {
      return pool.find((v: any) => {
        const variantSize = v.variantValue || v.size || v.sizeValue || v.shoeSize || v.displaySize;
        const candidate = normalize(variantSize);
        if (!candidate) return false;
        if (candidate === wanted) return true;
        // Handle common StockX variants like "USM8.5" / "USW8.5" etc.
        if (candidate === `USM${wanted}` || candidate === `USW${wanted}`) return true;
        if (isLetterSize(wanted)) {
          // Letter sizes must match exactly (avoid XS matching XXS, etc.)
          return candidate === `US${wanted}` || candidate === `USM${wanted}` || candidate === `USW${wanted}`;
        }
        // Numeric/other short tokens: allow end-match (e.g. "USM8.5" ends with "8.5")
        if (wanted.length <= 6 && candidate.endsWith(wanted)) return true;
        return false;
      });
    };

    if (wantsWomen) {
      const v = tryExactIn(cohortFiltered('W'));
      if (v) return v;
    } else if (wantsMen) {
      const v = tryExactIn(cohortFiltered('M'));
      if (v) return v;
    } else if (wantsYouth) {
      const v = tryExactIn(cohortFiltered('Y'));
      if (v) return v;
    }

    const exact = variants.find((v: any) => {
      const variantSize = v.variantValue || v.size || v.sizeValue || v.shoeSize || v.displaySize;
      const candidate = normalize(variantSize);
      if (!candidate) return false;
      if (candidate === wanted) return true;
      // Handle common StockX variants like "USM8.5" / "USW8.5" / "USM" etc.
      if (candidate === `USM${wanted}` || candidate === `USW${wanted}`) return true;
      if (isLetterSize(wanted)) {
        // Letter sizes must match exactly (avoid XS matching XXS, etc.)
        return candidate === `US${wanted}` || candidate === `USM${wanted}` || candidate === `USW${wanted}`;
      }
      // Numeric/other short tokens: allow end-match (e.g. "USM8.5" ends with "8.5")
      if (wanted.length <= 6 && candidate.endsWith(wanted)) return true;
      return false;
    });
    if (exact) return exact;
  }
  // Fallback: pick first variant that has pricing
  return (
    variants.find((v: any) => parseStockXMoneyToDollars(v.lowestAskAmount) || parseStockXMoneyToDollars(v.flexLowestAskAmount)) ||
    variants[0]
  );
}

function stockxSizeMatchesWanted(wantedRaw: string, actualRaw: unknown): boolean {
  const wantedUpper = String(wantedRaw ?? '').toUpperCase();
  const wantsWomen = /\bW\b/.test(wantedUpper) || wantedUpper.includes('USW') || wantedUpper.includes('WOMEN');
  const wantsMen = /\bM\b/.test(wantedUpper) || wantedUpper.includes('USM') || wantedUpper.includes('MEN');
  const wantsYouth = /\bY\b/.test(wantedUpper);
  const actualUpper = String(actualRaw ?? '').toUpperCase().replace(/\s+/g, '');
  if (wantsWomen && !(actualUpper.includes('USW') || actualUpper.startsWith('W') || actualUpper.endsWith('W') || actualUpper.includes('WOMEN'))) return false;
  if (wantsMen && !(actualUpper.includes('USM') || actualUpper.startsWith('M'))) return false;
  if (wantsYouth && !(actualUpper.includes('Y') || actualUpper.endsWith('Y'))) return false;

  const canonicalize = (s: unknown) => {
    const raw = String(s ?? '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/-/g, '');
    if (!raw) return '';
    const t = raw.replace(/^US(?:M|W)?/i, '');
    const map: Record<string, string> = {
      EXTRASMALL: 'XS',
      XSMALL: 'XS',
      XXSMALL: 'XXS',
      XXXSMALL: 'XXXS',
      XLARGE: 'XL',
      EXTRALARGE: 'XL',
      XXLARGE: 'XXL',
      XXXLARGE: 'XXXL',
    };
    if (map[t]) return map[t];
    if (t === 'SMALL') return 'S';
    if (t === 'MEDIUM') return 'M';
    if (t === 'LARGE') return 'L';
    return t;
  };
  const normalize = canonicalize;
  const wanted = normalize(wantedRaw);
  if (!wanted || wanted === 'UNKNOWN') return true;
  const actual = normalize(actualRaw);
  if (!actual) return false;
  const isLetterSize = (t: string) => ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'].includes(t);
  if (actual === wanted) return true;
  if (actual === `US${wanted}` || actual === `USM${wanted}` || actual === `USW${wanted}`) return true;
  if (isLetterSize(wanted)) return false; // do not allow substring matches for letter sizes
  return actual.endsWith(wanted);
}

function pickVariantIdBySize(variants: any[], size: string): string | null {
  const v = pickVariantBySize(variants, size);
  const vid = v?.variantId || v?.id || v?.uuid;
  return vid ? String(vid) : null;
}

function lowestAskFromVariant(variant: any): number | null {
  const std = parseStockXMoneyToDollars(variant?.lowestAskAmount);
  const flex = parseStockXMoneyToDollars(variant?.flexLowestAskAmount);
  // Prefer the standard "Lowest Ask" shown in most StockX UI surfaces.
  // Fall back to flex-only ask if standard isn't available.
  return std ?? flex ?? null;
}

function askDebugFromVariant(variant: any): { price: number | null; askSource?: 'standard' | 'flex'; askStd: number | null; askFlex: number | null } {
  const askStd = parseStockXMoneyToDollars(variant?.lowestAskAmount);
  const askFlex = parseStockXMoneyToDollars(variant?.flexLowestAskAmount);
  if (askStd !== null) return { price: askStd, askSource: 'standard', askStd, askFlex };
  if (askFlex !== null) return { price: askFlex, askSource: 'flex', askStd, askFlex };
  return { price: null, askStd, askFlex };
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
      // Safety: if the stored variantId doesn't match the requested size, fall back to selecting by size.
      const variantSize =
        (variantData as any)?.variantValue ||
        (variantData as any)?.size ||
        (variantData as any)?.sizeValue ||
        (variantData as any)?.shoeSize ||
        (variantData as any)?.displaySize;
      if (!stockxSizeMatchesWanted(args.size, variantSize)) {
        // Continue through non-direct flow below (variants list + pick by size).
        // NOTE: We'll keep productId, but ignore the variantId to avoid wrong-size pricing.
      } else {
      const ask = askDebugFromVariant(variantData);
      const price = ask.price;
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
        askSource: ask.askSource,
        askStd: ask.askStd,
        askFlex: ask.askFlex,
        reason: 'ok',
        details: 'direct_variant_market_data',
        productId: directProductId,
        variantId: directVariantId,
        urlKey: args.urlKey || undefined,
      };
      }
    }

    let productId: string | null = null;
    let urlKey: string | null = null;
    let termUsed: string | null = null;
    let lastNoProductsTerm: string | null = null;

    // If we have a productId but no usable variantId (or it mismatched size above), skip search and go straight to variants.
    const preferredProductId = args.productId ? String(args.productId).trim() : '';
    if (preferredProductId) {
      productId = preferredProductId;
      urlKey = args.urlKey ? String(args.urlKey).trim() : null;
      termUsed = args.urlKey ? String(args.urlKey).trim() : (args.styleId ? String(args.styleId).trim() : null);
    } else {

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
      const ask = askDebugFromVariant(variant);
      const price = ask.price;
      if (price === null) return { price: null, reason: 'no_price', stage: 'market', productId, variantId, urlKey: urlKey || undefined, termUsed: termUsed || undefined };
      return { price, askSource: ask.askSource, askStd: ask.askStd, askFlex: ask.askFlex, reason: 'ok', details: 'fallback_product_market_data', productId, variantId, urlKey: urlKey || undefined, termUsed: termUsed || undefined };
    }

    const vmData = await vmRes.json().catch(() => null);
    const variantData = Array.isArray(vmData)
      ? vmData.find((item: any) => String(item?.variantId) === String(variantId))
      : vmData;
    if (!variantData) return { price: null, reason: 'no_variant', stage: 'market', productId, variantId, urlKey: urlKey || undefined, termUsed: termUsed || undefined };
    const ask = askDebugFromVariant(variantData);
    const price = ask.price;
    if (price === null) return { price: null, reason: 'no_price', stage: 'market', productId, variantId, urlKey: urlKey || undefined, termUsed: termUsed || undefined };
    return { price, askSource: ask.askSource, askStd: ask.askStd, askFlex: ask.askFlex, reason: 'ok', productId, variantId, urlKey: urlKey || undefined, termUsed: termUsed || undefined };
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

