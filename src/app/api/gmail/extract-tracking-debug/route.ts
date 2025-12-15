import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';
import puppeteer from 'puppeteer';
import { getOrderNumberForGmailSearch } from '@/lib/utils/orderNumberUtils';
import {
  extractStockxTrackOrderUrlFromEmailHtml,
  resolveTrackingFromTrackOrderUrl,
} from '@/lib/tracking/stockxTrackingExtraction';

function redactUrlForLogs(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl);
    // Strip query + hash to avoid leaking tokens in logs.
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    // If not a valid URL, just truncate.
    return String(rawUrl).slice(0, 120);
  }
}

function normalizeTrackOrderUrl(input: string): string {
  // Unwrap common wrappers:
  // - Gmail safe redirect: https://www.google.com/url?q=<encoded>&...
  // - wizrocketmail redirect: ...?r=<encoded_stockx_url>
  try {
    const u = new URL(input);
    if (u.hostname === 'www.google.com' && u.pathname === '/url') {
      const q = u.searchParams.get('q');
      if (q) return decodeURIComponent(q);
    }
    if (u.hostname.includes('wizrocketmail')) {
      const r = u.searchParams.get('r');
      if (r) return decodeURIComponent(r);
    }
  } catch {
    // ignore
  }
  return input;
}

function getHtmlFromEmail(email: any): string {
  let html = '';
  const parts = email?.payload?.parts || [];
  if (parts.length > 0) {
    for (const part of parts) {
      if (part?.mimeType === 'text/html' && part?.body?.data) {
        html += Buffer.from(part.body.data, 'base64').toString('utf8');
      }
    }
  } else if (email?.payload?.mimeType === 'text/html' && email?.payload?.body?.data) {
    html = Buffer.from(email.payload.body.data, 'base64').toString('utf8');
  }
  return html;
}

function normalizeCookieDomainToHost(domain: string): string {
  const d = domain.replace(/^\./, '').trim().toLowerCase();
  if (!d) return 'stockx.com';
  // Ensure we use real hosts we can navigate to for setting cookies.
  if (d.endsWith('accounts.stockx.com')) return 'accounts.stockx.com';
  if (d.endsWith('stockx.com')) return 'stockx.com';
  return d;
}

export async function POST(request: NextRequest) {
  let browser: any | null = null;
  try {
    const {
      orderNumber,
      trackOrderUrl: trackOrderUrlOverride,
      verbose = true,
      allowPuppeteer = true,
      stockxCookies,
    } = await request.json();

    if (!orderNumber && !trackOrderUrlOverride) {
      return NextResponse.json({ error: 'orderNumber or trackOrderUrl is required' }, { status: 400 });
    }

    const cookieStore = cookies();
    const accessToken = cookieStore.get('gmail_access_token')?.value;
    const refreshToken = cookieStore.get('gmail_refresh_token')?.value;

    if (!accessToken) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 });
    }

    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/gmail/callback`;

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // If caller provided a direct Track-your-order URL (from email), we can skip Gmail search entirely.
    if (trackOrderUrlOverride) {
      const trackOrderUrl = normalizeTrackOrderUrl(String(trackOrderUrlOverride));
      if (verbose) console.log('🧪 TRACKING DEBUG: using trackOrderUrl override', { trackOrderUrl: redactUrlForLogs(trackOrderUrl) });
      const resolved = await resolveTrackingFromTrackOrderUrl(trackOrderUrl, { timeoutMs: 8000, maxRedirects: 8 });
      if (resolved?.trackingNumber) {
        return NextResponse.json({
          success: true,
          orderNumber: orderNumber || null,
          trackingNumber: resolved.trackingNumber,
          carrier: resolved.carrier,
          trackOrderUrl,
          extractedVia: resolved.source,
          debug: { resolvedUrl: resolved.url ? redactUrlForLogs(resolved.url) : null },
        });
      }
      // Fall through to Puppeteer flow by pretending we found it from Gmail.
      // We set orderNumber to placeholder in debug response.
      (request as any).__trackOrderUrlOverride = trackOrderUrl;
    }

    const searchOrderNumber = orderNumber ? getOrderNumberForGmailSearch(orderNumber) : '';

    const shippingQueries = [
      `from:noreply@stockx.com (subject:"Order Verified & Shipped:" OR subject:"Order Shipped:" OR subject:"Xpress Order Shipped:" OR subject:"Xpress Ship Order Shipped:" OR subject:"Your order has shipped") "${searchOrderNumber}"`,
      `from:noreply@stockx.com subject:"shipped" "${searchOrderNumber}"`,
      `from:stockx.com "${searchOrderNumber}"`,
    ];

    if (verbose) {
      console.log('🧪 TRACKING DEBUG: starting', { orderNumber: orderNumber || null, searchOrderNumber });
      console.log('🧪 TRACKING DEBUG: queries', shippingQueries);
    }

    for (const q of shippingQueries) {
      if (verbose) console.log('🧪 TRACKING DEBUG: gmail.users.messages.list', { q });

      const list = await gmail.users.messages.list({
        userId: 'me',
        q,
        maxResults: 5,
      });

      const messages = list.data.messages || [];
      if (verbose) console.log('🧪 TRACKING DEBUG: list results', { count: messages.length });

      if (messages.length === 0) continue;

      // Pull the most recent match
      const msgId = messages[0].id!;
      const email = await gmail.users.messages.get({
        userId: 'me',
        id: msgId,
        format: 'full',
      });

      const headers = email.data.payload?.headers || [];
      const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
      const from = headers.find((h: any) => h.name === 'From')?.value || '';

      if (verbose) console.log('🧪 TRACKING DEBUG: using email', { msgId, subject, from });

      const html = getHtmlFromEmail(email.data);
      if (verbose) console.log('🧪 TRACKING DEBUG: extracted html', { length: html.length });

      const trackOrderUrl = extractStockxTrackOrderUrlFromEmailHtml(html);
      if (verbose) console.log('🧪 TRACKING DEBUG: trackOrderUrl', { trackOrderUrl: redactUrlForLogs(trackOrderUrl) });

      if (!trackOrderUrl) {
        return NextResponse.json(
          {
            success: false,
            error: 'Found shipped email, but could not locate a Track-your-order link in the HTML.',
            debug: { orderNumber, searchOrderNumber, msgId, subject },
          },
          { status: 404 }
        );
      }

      const resolved = await resolveTrackingFromTrackOrderUrl(trackOrderUrl, {
        timeoutMs: 8000,
        maxRedirects: 8,
      });

      if (verbose) console.log('🧪 TRACKING DEBUG: resolved', resolved);

      if (!resolved?.trackingNumber) {
        if (!allowPuppeteer) {
          return NextResponse.json(
            {
              success: false,
              error: 'Track-your-order link found, but no FedEx tracking number could be resolved (no tracknumbers= seen).',
              debug: { orderNumber, searchOrderNumber, msgId, subject, trackOrderUrl },
            },
            { status: 404 }
          );
        }

        if (verbose) console.log('🧪 TRACKING DEBUG: falling back to Puppeteer click flow');

        // Puppeteer fallback: open the StockX page behind the trackOrderUrl, click "Track Order", capture FedEx URL.
        browser = await puppeteer.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
          ],
        });

        const page = await browser.newPage();
        page.setDefaultTimeout(60000);

        // Optional: inject StockX session cookies so Puppeteer is authenticated.
        // Expected format: an array of cookie objects from Chrome DevTools "Copy as JSON".
        if (Array.isArray(stockxCookies) && stockxCookies.length > 0) {
          try {
            const normalizedCookies = stockxCookies
              .filter((c: any) => c && typeof c.name === 'string' && typeof c.value === 'string')
              .map((c: any) => {
                const sameSite =
                  c.sameSite === 'Strict' || c.sameSite === 'Lax' || c.sameSite === 'None'
                    ? c.sameSite
                    : undefined;
                return {
                  name: c.name,
                  value: c.value,
                  domain: c.domain || '.stockx.com',
                  path: c.path || '/',
                  expires: typeof c.expires === 'number' ? c.expires : undefined,
                  httpOnly: typeof c.httpOnly === 'boolean' ? c.httpOnly : undefined,
                  secure: typeof c.secure === 'boolean' ? c.secure : undefined,
                  sameSite,
                };
              });

            // Puppeteer enforces cookie domain rules. We must set cookies on the correct host.
            const cookiesByHost = new Map<string, any[]>();
            for (const ck of normalizedCookies) {
              const host = normalizeCookieDomainToHost(String(ck.domain || 'stockx.com'));
              if (!cookiesByHost.has(host)) cookiesByHost.set(host, []);
              cookiesByHost.get(host)!.push(ck);
            }

            // Set StockX cookies on stockx.com first, then accounts.stockx.com if present.
            const hostsInOrder = ['stockx.com', 'accounts.stockx.com'];
            const otherHosts = Array.from(cookiesByHost.keys()).filter(
              (h) => !hostsInOrder.includes(h)
            );
            const allHosts = [...hostsInOrder.filter((h) => cookiesByHost.has(h)), ...otherHosts];

            for (const host of allHosts) {
              const hostCookies = cookiesByHost.get(host) || [];
              if (hostCookies.length === 0) continue;
              // Navigate to host to satisfy domain restrictions.
              await page.goto(`https://${host}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
              await page.setCookie(...hostCookies);
              if (verbose) {
                console.log('🧪 TRACKING DEBUG: injected cookies for host', { host, count: hostCookies.length });
              }
            }
          } catch (e) {
            console.log('🧪 TRACKING DEBUG: failed to set StockX cookies (continuing unauthenticated)', e);
          }
        }

        const debugTrace: {
          stockxUrl?: string;
          clicked?: boolean;
          popupUrl?: string | null;
          sameTabUrlAfterClick?: string | null;
          networkFedexUrls: string[];
          domFedexLinks: Array<{ href: string; text: string }>;
          allTrackCandidates: Array<{ tag: string; text: string; href?: string; ariaLabel?: string }>;
          frameSummaries: Array<{ url: string; hasTrackButton: boolean; hasFedexLink: boolean }>;
          pageTitle?: string;
          htmlLength?: number;
          anchorCount?: number;
          buttonCount?: number;
          shadowTrackLinks?: Array<{ href: string; text: string; dataTestId?: string }>;
        } = {
          networkFedexUrls: [],
          domFedexLinks: [],
          allTrackCandidates: [],
          frameSummaries: [],
          shadowTrackLinks: [],
        };

        // Capture any network request URLs that look like FedEx / contain tracknumbers.
        page.on('request', (req: any) => {
          try {
            const u = String(req.url() || '');
            if (u.includes('fedex.com') || u.includes('tracknumbers=') || u.includes('tracknumbers%3D')) {
              debugTrace.networkFedexUrls.push(u);
            }
          } catch {}
        });

        await page.setUserAgent(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );
        await page.setViewport({ width: 1920, height: 1080 });

        if (verbose) console.log('🧪 TRACKING DEBUG: puppeteer.goto(trackOrderUrl)');
        await page.goto(trackOrderUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        // StockX is an SPA; give it time to hydrate and fetch order details.
        try {
          await page.waitForNetworkIdle({ idleTime: 1000, timeout: 15000 });
        } catch {}
        await new Promise((r) => setTimeout(r, 6000));

        const stockxUrl = page.url();
        debugTrace.stockxUrl = stockxUrl;
        const pageText = await page.evaluate(() => document.body?.innerText || '');
        try {
          debugTrace.pageTitle = await page.title();
        } catch {}
        try {
          const html = await page.content();
          debugTrace.htmlLength = html.length;
        } catch {}
        try {
          const counts = await page.evaluate(() => ({
            a: document.querySelectorAll('a').length,
            b: document.querySelectorAll('button').length,
          }));
          debugTrace.anchorCount = counts.a;
          debugTrace.buttonCount = counts.b;
        } catch {}

        if (verbose) {
          console.log('🧪 TRACKING DEBUG: stockxUrl', stockxUrl);
          console.log('🧪 TRACKING DEBUG: pageText preview', pageText.substring(0, 240));
        }

        // If redirected to login, stop early with explicit message.
        if (stockxUrl.includes('login') || stockxUrl.includes('sign-in')) {
          return NextResponse.json(
            {
              success: false,
              error: 'StockX requires login to view this order page (redirected to login).',
              requiresLogin: true,
              howToFix: 'Paste your StockX cookies into the app once so Puppeteer can run authenticated.',
              debug: { orderNumber, stockxUrl, trackOrderUrl, msgId, subject },
            },
            { status: 401 }
          );
        }

        // Cloudflare / bot protection check
        const hasCloudflare =
          pageText.includes('Verify you are human') ||
          pageText.includes('Cloudflare') ||
          pageText.includes('security of your connection') ||
          pageText.includes('Ray ID:');

        if (hasCloudflare) {
          return NextResponse.json(
            {
              success: false,
              error: 'StockX is blocking automated access (Cloudflare). Try again later, or we may need a different approach.',
              cloudflareBlocked: true,
              debug: { orderNumber, stockxUrl, trackOrderUrl, pagePreview: pageText.substring(0, 500) },
            },
            { status: 403 }
          );
        }

        // Listen for a new tab (FedEx) before clicking
        const fedexTargetPromise = browser!.waitForTarget(
          (t: any) => {
            try {
              const u = String(t.url() || '');
              return u.includes('fedex.com') || u.includes('tracknumbers=') || u.includes('tracknumbers%3D');
            } catch {
              return false;
            }
          },
          { timeout: 20000 }
        ).catch(() => null);

        // Click "Track Order" (multiple strategies)
        // Capture candidate elements for debugging.
        debugTrace.allTrackCandidates = await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('button, a, [role="button"]'));
          return els
            .map((el) => ({
              tag: el.tagName.toLowerCase(),
              text: (el.textContent || '').trim().slice(0, 80),
              href: el.getAttribute('href') || undefined,
              ariaLabel: el.getAttribute('aria-label') || undefined,
            }))
            .filter((x) => {
              const t = (x.text || '').toLowerCase();
              const a = (x.ariaLabel || '').toLowerCase();
              const h = (x.href || '').toLowerCase();
              return t.includes('track') || a.includes('track') || h.includes('track') || h.includes('fedex');
            })
            .slice(0, 60);
        });

        // Shadow DOM scan: StockX sometimes renders action buttons inside shadow roots.
        // This will walk shadow roots and collect anchor links that look like Track/FedEx.
        try {
          debugTrace.shadowTrackLinks = await page.evaluate(() => {
            const out: Array<{ href: string; text: string; dataTestId?: string }> = [];
            const seen = new Set<string>();
            const max = 25;

            const visit = (root: Document | ShadowRoot) => {
              const anchors = Array.from(root.querySelectorAll('a[href]')) as HTMLAnchorElement[];
              for (const a of anchors) {
                const href = a.getAttribute('href') || '';
                const text = (a.textContent || '').trim().slice(0, 80);
                const dataTestId = a.getAttribute('data-testid') || undefined;
                const h = href.toLowerCase();
                if (
                  h.includes('fedex') ||
                  h.includes('tracknumbers=') ||
                  h.includes('tracknumbers%3d') ||
                  (dataTestId && dataTestId.toLowerCase().includes('track'))
                ) {
                  const key = `${href}|${dataTestId || ''}`;
                  if (!seen.has(key)) {
                    seen.add(key);
                    out.push({ href, text, dataTestId });
                    if (out.length >= max) return;
                  }
                }
              }

              const all = Array.from(root.querySelectorAll('*')) as any[];
              for (const el of all) {
                const sr = el.shadowRoot as ShadowRoot | undefined;
                if (sr) {
                  visit(sr);
                  if (out.length >= max) return;
                }
              }
            };

            visit(document);
            return out;
          });
        } catch {
          // ignore shadow scan errors
        }

        // If shadow scan found a direct FedEx tracknumbers link, parse it immediately.
        if (debugTrace.shadowTrackLinks && debugTrace.shadowTrackLinks.length > 0) {
          const href = debugTrace.shadowTrackLinks[0].href || '';
          const m =
            href.match(/tracknumbers?[=%3D](\d{10,22})/i) ||
            href.match(/trknbr[=%3D](\d{10,22})/i);
          if (m?.[1]) {
            const trackingNumber = m[1];
            const carrier = trackingNumber.startsWith('1Z') ? 'UPS' : 'FedEx';
            return NextResponse.json({
              success: true,
              orderNumber,
              trackingNumber,
              carrier,
              trackOrderUrl,
              fedexUrl: href,
              extractedVia: 'puppeteer-shadowdom-tracklink-href',
              debug: { msgId, subject, searchOrderNumber, stockxUrl, trace: debugTrace },
            });
          }
        }

        // Best case: StockX renders a direct FedEx link in the DOM (often an <a data-testid="TrackButton" ...>).
        // In that case, do NOT click—just read href and parse tracknumbers.
        try {
          await page.waitForSelector(
            'a[data-testid="TrackButton"][href], a[data-testid*="Track"][href], a[href*="fedextrack"][href*="tracknumbers"], a[href*="fedex.com"][href*="tracknumbers"]',
            { timeout: 20000 }
          );
        } catch {
          // ignore
        }

        const trackSelectors = [
          'a[data-testid="TrackButton"][href]',
          'a[data-testid*="Track"][href]',
          'a[href*="fedextrack"][href*="tracknumbers"]',
          'a[href*="fedex.com"][href*="tracknumbers"]',
          'a[href*="fedex.com"]',
        ];

        const findHrefInFrame = async (frame: any): Promise<string | null> => {
          for (const sel of trackSelectors) {
            try {
              const href = await frame.$eval(sel, (el: any) => el?.getAttribute?.('href') || '');
              if (href) return String(href);
            } catch {
              // continue
            }
          }
          return null;
        };

        let directTrackHref: string | null = null;
        for (const frame of page.frames()) {
          const frameUrl = (() => {
            try {
              return String(frame.url() || '');
            } catch {
              return '';
            }
          })();
          const href = await findHrefInFrame(frame);
          debugTrace.frameSummaries.push({
            url: redactUrlForLogs(frameUrl) || '',
            hasTrackButton: Boolean(href && href.toLowerCase().includes('track')),
            hasFedexLink: Boolean(href && href.toLowerCase().includes('fedex')),
          });
          if (href) {
            directTrackHref = href;
            break;
          }
        }

        if (directTrackHref) {
          const m =
            directTrackHref.match(/tracknumbers?[=%3D](\d{10,22})/i) ||
            directTrackHref.match(/trknbr[=%3D](\d{10,22})/i);
          if (m?.[1]) {
            const trackingNumber = m[1];
            const carrier = trackingNumber.startsWith('1Z') ? 'UPS' : 'FedEx';
            if (verbose) console.log('🧪 TRACKING DEBUG: found direct TrackButton href', directTrackHref);
            return NextResponse.json({
              success: true,
              orderNumber,
              trackingNumber,
              carrier,
              trackOrderUrl,
              fedexUrl: directTrackHref,
              extractedVia: 'puppeteer-dom-trackbutton-href',
              debug: { msgId, subject, searchOrderNumber, stockxUrl, trace: debugTrace },
            });
          }
        }

        // First try: click a direct FedEx link if it exists.
        const directFedexHref = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
          const fedex = links.find((a) => (a.getAttribute('href') || '').toLowerCase().includes('fedex'));
          return fedex?.getAttribute('href') || null;
        });

        if (directFedexHref) {
          // If href already contains a tracking param, just parse and return.
          const m =
            directFedexHref.match(/tracknumbers?[=%3D](\d{10,22})/i) ||
            directFedexHref.match(/trknbr[=%3D](\d{10,22})/i);
          if (m?.[1]) {
            const trackingNumber = m[1];
            const carrier = trackingNumber.startsWith('1Z') ? 'UPS' : 'FedEx';
            if (verbose) console.log('🧪 TRACKING DEBUG: found direct fedex href (no click needed)', directFedexHref);
            return NextResponse.json({
              success: true,
              orderNumber,
              trackingNumber,
              carrier,
              trackOrderUrl,
              fedexUrl: directFedexHref,
              extractedVia: 'puppeteer-dom-fedex-href',
              debug: { msgId, subject, searchOrderNumber, stockxUrl, trace: debugTrace },
            });
          }
        }

        // Otherwise click "Track Order"
        const clicked = await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('button, a, [role="button"]'));
          const candidates = els.filter((el) => {
            const t = (el.textContent || '').trim().toLowerCase();
            const aria = (el.getAttribute('aria-label') || '').toLowerCase();
            return (
              (t.includes('track order') || (t.includes('track') && t.includes('order')) || aria.includes('track order') || (aria.includes('track') && aria.includes('order'))) &&
              (el as HTMLElement).offsetParent !== null
            );
          });
          if (candidates.length === 0) return false;
          // Scroll into view to improve click reliability
          try {
            (candidates[0] as any).scrollIntoView({ block: 'center', inline: 'center' });
          } catch {}
          (candidates[0] as HTMLElement).click();
          return true;
        });
        debugTrace.clicked = clicked;

        if (verbose) console.log('🧪 TRACKING DEBUG: clicked track button?', clicked);

        // Wait briefly for either:
        // - A new FedEx tab/target
        // - Same-tab navigation to a FedEx URL
        // - DOM to render a FedEx tracking link
        let fedexUrl: string | null = null;

        // (1) New tab/target
        const fedexTarget = (await fedexTargetPromise) as any;
        if (fedexTarget) {
          try {
            fedexUrl = String(fedexTarget.url() || '');
            debugTrace.popupUrl = fedexUrl;
          } catch {}
        }

        // (2) Same-tab navigation
        if (!fedexUrl) {
          await new Promise((r) => setTimeout(r, 4000));
          const currentAfterClick = page.url();
          debugTrace.sameTabUrlAfterClick = currentAfterClick;
          if (currentAfterClick.includes('fedex.com') || currentAfterClick.includes('tracknumbers=')) {
            fedexUrl = currentAfterClick;
          }
        }

        // (3) DOM link extraction (modal link, etc.)
        if (!fedexUrl) {
          debugTrace.domFedexLinks = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
            return links
              .map((a) => ({
                href: a.getAttribute('href') || '',
                text: (a.textContent || '').trim().slice(0, 80),
              }))
              .filter((l) => l.href.toLowerCase().includes('fedex') || l.href.toLowerCase().includes('tracknumbers=') || l.href.toLowerCase().includes('tracknumbers%3d'))
              .slice(0, 20);
          });
          if (debugTrace.domFedexLinks.length > 0) {
            fedexUrl = debugTrace.domFedexLinks[0].href;
          }
        }

        // (4) Network-captured
        if (!fedexUrl && debugTrace.networkFedexUrls.length > 0) {
          fedexUrl = debugTrace.networkFedexUrls[0];
        }

        if (!fedexUrl) {
          return NextResponse.json(
            {
              success: false,
              error: 'Puppeteer could not discover a FedEx URL after clicking Track Order (no new tab, no same-tab nav, no FedEx link in DOM/network).',
              debug: { orderNumber, stockxUrl, trackOrderUrl, trace: debugTrace },
            },
            { status: 404 }
          );
        }

        if (verbose) console.log('🧪 TRACKING DEBUG: fedexUrl discovered', fedexUrl);

        const m =
          fedexUrl.match(/tracknumbers?[=%3D](\d{10,22})/i) ||
          fedexUrl.match(/trknbr[=%3D](\d{10,22})/i);

        if (!m?.[1]) {
          return NextResponse.json(
            {
              success: false,
              error: 'FedEx tab opened, but URL did not contain tracknumbers=',
              debug: { orderNumber, stockxUrl, trackOrderUrl, fedexUrl, trace: debugTrace },
            },
            { status: 404 }
          );
        }

        const trackingNumber = m[1];
        const carrier = trackingNumber.startsWith('1Z') ? 'UPS' : 'FedEx';

        return NextResponse.json({
          success: true,
          orderNumber,
          trackingNumber,
          carrier,
          trackOrderUrl,
          fedexUrl,
          extractedVia: 'puppeteer-click-track-order',
          debug: { msgId, subject, searchOrderNumber, stockxUrl },
        });
      }

      return NextResponse.json({
        success: true,
        orderNumber,
        trackingNumber: resolved.trackingNumber,
        carrier: resolved.carrier,
        trackOrderUrl,
        extractedVia: resolved.source,
        debug: {
          msgId,
          subject,
          searchOrderNumber,
          resolvedUrl: resolved.url,
        },
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: 'No shipped email found for this order (or Gmail query mismatch).',
        debug: { orderNumber, searchOrderNumber, searchedQueries: shippingQueries },
      },
      { status: 404 }
    );
  } catch (error: any) {
    console.error('🧪 TRACKING DEBUG: fatal error', error);
    return NextResponse.json(
      { error: 'Failed to run tracking debug', details: error?.message || String(error) },
      { status: 500 }
    );
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }
}


