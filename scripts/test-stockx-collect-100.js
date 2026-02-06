/**
 * StockX listing URL collector smoke test (Puppeteer)
 *
 * What it tests:
 * - Can we reliably collect 48-ish product URLs per listing page?
 * - Can we paginate and collect >= 100 unique product URLs?
 *
 * What it DOES NOT test:
 * - The extension’s full per-product scan flow (Market Data modal, etc)
 *
 * Usage:
 *   node scripts/test-stockx-collect-100.js --url "https://stockx.com/category/apparel?sort=most-active" --target 100
 *
 * Optional:
 *   --pages 5          (max pages to visit; default 5)
 *   --perPage 48       (expected per page; default 48)
 *   --headful          (show browser)
 *   --slowMo 50        (slow mo ms)
 */

const puppeteer = require('puppeteer');

function arg(name, fallback = '') {
  try {
    const idx = process.argv.indexOf(`--${name}`);
    if (idx === -1) return fallback;
    const next = process.argv[idx + 1];
    if (!next || next.startsWith('--')) return true;
    return next;
  } catch {
    return fallback;
  }
}

function buildPageUrl(startUrl, pageNum) {
  try {
    const u = new URL(String(startUrl || ''));
    if (pageNum <= 1) u.searchParams.delete('page');
    else u.searchParams.set('page', String(pageNum));
    return u.toString();
  } catch {
    return String(startUrl || '');
  }
}

async function main() {
  const startUrl = String(arg('url', '') || '').trim();
  if (!startUrl) {
    console.error('Missing --url');
    process.exit(2);
  }

  const target = Math.max(1, Math.min(400, Number(arg('target', '100')) || 100));
  const maxPages = Math.max(1, Math.min(200, Number(arg('pages', '5')) || 5));
  const perPage = Math.max(1, Math.min(200, Number(arg('perPage', '48')) || 48));
  const headful = !!arg('headful', false);
  const slowMo = Math.max(0, Math.min(250, Number(arg('slowMo', '0')) || 0));

  const browser = await puppeteer.launch({
    headless: !headful,
    slowMo,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36'
  );

  const all = [];
  const seen = new Set();

  for (let p = 1; p <= maxPages && all.length < target; p++) {
    const url = buildPageUrl(startUrl, p);
    const t0 = Date.now();
    console.log(`\n[page ${p}] navigating: ${url}`);

    // StockX is a heavy SPA; avoid 'networkidle' which can hang.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

    // Wait for some tiles/cards to appear.
    try {
      await page.waitForFunction(
        () => {
          const cards = document.querySelectorAll('article,[role="listitem"],li,[data-testid*="product" i],[data-testid*="tile" i]');
          return cards && cards.length > 10;
        },
        { timeout: 45000 }
      );
    } catch {
      // keep going; collection will show 0 and you’ll see it.
    }

    // Best-effort scroll to trigger lazy-loaded tiles
    try {
      await page.evaluate(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        for (let i = 0; i < 5; i++) {
          window.scrollTo(0, document.body.scrollHeight);
          await sleep(350);
        }
        window.scrollTo(0, 0);
      });
    } catch {}

    const urls = await page.evaluate((max) => {
      const normalize = (u) => `${u.origin}${u.pathname}`;
      const excluded = new Set([
        '/',
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
        '/category',
        '/categories'
      ]);
      const isProductPath = (pathname) => {
        try {
          const p = String(pathname || '').toLowerCase();
          if (!p.startsWith('/')) return false;
          if (excluded.has(p)) return false;
          for (const x of excluded) {
            if (x !== '/' && (p === x || p.startsWith(`${x}/`))) return false;
          }
          const parts = p.split('/').filter(Boolean);
          if (parts.length !== 1) return false;
          const slug = parts[0];
          if (!slug || slug.length < 6) return false;
          if (!/^[a-z0-9-]+$/.test(slug)) return false;
          return true;
        } catch {
          return false;
        }
      };

      const out = [];
      const seen = new Set();
      const cards = Array.from(
        document.querySelectorAll('article,[role="listitem"],li,[data-testid*="product" i],[data-testid*="tile" i]')
      ).slice(0, 1000);

      for (const c of cards) {
        if (out.length >= max) break;
        const as = Array.from(c.querySelectorAll('a[href]'));
        let best = null;
        for (const a of as) {
          const href = a.getAttribute('href') || '';
          let u;
          try {
            u = new URL(href, location.origin);
          } catch {
            continue;
          }
          if (!/(\.|^)stockx\.com$/i.test(String(u.hostname || ''))) continue;
          if (!isProductPath(u.pathname)) continue;
          best = u;
          break;
        }
        if (!best) continue;
        const n = normalize(best);
        if (seen.has(n)) continue;
        seen.add(n);
        out.push(n);
      }
      return out;
    }, perPage);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[page ${p}] collected: ${urls.length}/${perPage} in ${elapsed}s`);

    for (const u of urls) {
      if (seen.has(u)) continue;
      seen.add(u);
      all.push(u);
      if (all.length >= target) break;
    }
  }

  console.log(`\nDONE: collected ${all.length} unique product URLs (target=${target})`);
  if (all.length) {
    console.log('Sample:', all.slice(0, 5));
  }

  await browser.close();
  process.exit(all.length >= target ? 0 : 1);
}

main().catch((e) => {
  console.error('Test failed:', e?.message || String(e));
  process.exit(1);
});

