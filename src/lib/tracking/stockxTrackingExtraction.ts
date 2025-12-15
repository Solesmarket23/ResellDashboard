export type SupportedCarrier = 'FedEx' | 'UPS' | 'USPS' | 'Unknown';

export type ExtractedTracking = {
  trackingNumber: string;
  carrier: SupportedCarrier;
  source: string;
  url?: string;
};

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function detectCarrierFromTrackingNumber(trackingNumber: string): SupportedCarrier {
  const t = trackingNumber.trim();
  if (/^1Z[0-9A-Z]{16}$/i.test(t)) return 'UPS';
  if (/^9[0-9]{19,21}$/.test(t)) return 'USPS';
  // FedEx can be 12/14/15/20/22 etc. We keep this broad but numeric-only.
  if (/^[0-9]{10,22}$/.test(t)) return 'FedEx';
  return 'Unknown';
}

/**
 * Extracts tracking from any text/html content.
 * Prefer URL params (tracknumbers/trknbr) over "naked" numbers.
 */
export function extractTrackingFromContent(content: string): ExtractedTracking | null {
  if (!content) return null;

  // 1) URL parameter patterns (best signal)
  const urlParamPatterns: Array<{ name: string; re: RegExp }> = [
    { name: 'fedex-tracknumbers', re: /tracknumbers?[=%3D]([0-9]{10,22})/i },
    { name: 'fedex-trknbr', re: /trknbr[=%3D]([0-9]{10,22})/i },
  ];
  for (const p of urlParamPatterns) {
    const m = content.match(p.re);
    if (m?.[1]) {
      const trackingNumber = m[1];
      return {
        trackingNumber,
        carrier: detectCarrierFromTrackingNumber(trackingNumber),
        source: p.name,
      };
    }
  }

  // 2) UPS
  const ups = content.match(/\b(1Z[0-9A-Z]{16})\b/i);
  if (ups?.[1]) {
    return { trackingNumber: ups[1], carrier: 'UPS', source: 'ups-1z' };
  }

  // 3) USPS
  const usps = content.match(/\b(9[0-9]{19,21})\b/);
  if (usps?.[1]) {
    return { trackingNumber: usps[1], carrier: 'USPS', source: 'usps-9xx' };
  }

  // 4) Common StockX FedEx: a 12-digit number often starting with 8/9; but avoid obvious dates/years.
  // Note: USPS starts with 9 but is 20-22 digits; a 12-digit starting with 9 can be FedEx-like.
  const any12 = content.match(/\b([0-9]{12})\b/);
  if (any12?.[1]) {
    const candidate = any12[1];
    if (!candidate.startsWith('20') && !candidate.startsWith('19')) {
      return { trackingNumber: candidate, carrier: 'FedEx', source: 'numeric-12' };
    }
  }

  return null;
}

/**
 * Attempts to find the StockX "Track your order" URL in the shipped email HTML.
 * Handles common redirect wrappers (e.g. wizrocketmail) by extracting the `r=` param.
 */
export function extractStockxTrackOrderUrlFromEmailHtml(html: string): string | null {
  if (!html) return null;

  const normalized = decodeHtmlEntities(html);

  // Look for an anchor whose text contains "Track your order" / "Track Order"
  const linkPatterns: RegExp[] = [
    /<a[^>]*href=["']([^"']+)["'][^>]*>[^<]*track[^<]*your[^<]*order[^<]*<\/a>/i,
    /<a[^>]*href=["']([^"']+)["'][^>]*>[^<]*track[^<]*order[^<]*<\/a>/i,
  ];

  let href: string | null = null;
  for (const re of linkPatterns) {
    const m = normalized.match(re);
    if (m?.[1]) {
      href = m[1];
      break;
    }
  }

  // Fallback: find any href containing stockx + buying/track/order keywords
  if (!href) {
    const m = normalized.match(/href=["']([^"']*stockx\.com[^"']*)["']/i);
    if (m?.[1]) href = m[1];
  }

  if (!href) return null;
  href = decodeHtmlEntities(href);

  // Unwrap common redirect wrapper that contains the actual URL in `r=...`
  if (href.includes('wizrocketmail')) {
    const rParam = href.match(/[?&]r=([^&]+)/i);
    if (rParam?.[1]) {
      try {
        const decoded = decodeURIComponent(rParam[1]);
        if (decoded.includes('stockx.com')) return decoded;
      } catch {
        // ignore
      }
    }
  }

  // URL decode once/twice if needed
  const candidates: string[] = [href];
  try {
    candidates.push(decodeURIComponent(href));
  } catch {}
  try {
    candidates.push(decodeURIComponent(decodeURIComponent(href)));
  } catch {}

  for (const c of candidates) {
    if (c.includes('stockx.com')) return c;
  }

  return null;
}

function extractTrackingFromUrl(url: string): ExtractedTracking | null {
  const extracted = extractTrackingFromContent(url);
  if (!extracted) return null;
  return { ...extracted, url, source: `${extracted.source}-from-url` };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Best-effort resolver:
 * - checks redirect `Location` headers for FedEx tracking params
 * - checks final URL
 * - scans returned HTML for FedEx links containing `tracknumbers=...`
 */
export async function resolveTrackingFromTrackOrderUrl(
  trackOrderUrl: string,
  opts?: { timeoutMs?: number; maxRedirects?: number }
): Promise<ExtractedTracking | null> {
  if (!trackOrderUrl) return null;

  const timeoutMs = opts?.timeoutMs ?? 7000;
  const maxRedirects = opts?.maxRedirects ?? 6;

  // If the trackOrderUrl already has tracking info, return immediately.
  const direct = extractTrackingFromUrl(trackOrderUrl);
  if (direct) return { ...direct, source: 'direct-track-url' };

  let currentUrl = trackOrderUrl;

  for (let i = 0; i < maxRedirects; i++) {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        currentUrl,
        {
          method: 'GET',
          redirect: 'manual',
          headers: {
            // Basic UA helps some pages avoid returning minimal content
            'user-agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        },
        timeoutMs
      );
    } catch {
      return null;
    }

    const location = res.headers.get('location');
    if (location) {
      // Handle relative redirects
      const nextUrl = new URL(location, currentUrl).toString();
      const fromLocation = extractTrackingFromUrl(nextUrl);
      if (fromLocation) return { ...fromLocation, source: 'redirect-location' };
      currentUrl = nextUrl;
      continue;
    }

    // No redirect: check final URL + body
    const finalUrl = res.url || currentUrl;
    const fromFinalUrl = extractTrackingFromUrl(finalUrl);
    if (fromFinalUrl) return { ...fromFinalUrl, source: 'final-url' };

    // Only attempt to parse body if it is HTML-ish
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return null;

    let html = '';
    try {
      html = await res.text();
    } catch {
      return null;
    }

    // Check the HTML itself for tracking params / fedex links
    const fromHtml = extractTrackingFromContent(html);
    if (fromHtml) return { ...fromHtml, source: 'html-content', url: finalUrl };

    // Some pages embed full FedEx URLs. Prefer extracting from those.
    const fedexUrlMatch = html.match(/https?:\/\/[^"'<>]*fedex\.com[^"'<>]*/i);
    if (fedexUrlMatch?.[0]) {
      const fromFedexUrl = extractTrackingFromUrl(fedexUrlMatch[0]);
      if (fromFedexUrl) return { ...fromFedexUrl, source: 'fedex-url-in-html' };
    }

    return null;
  }

  return null;
}


