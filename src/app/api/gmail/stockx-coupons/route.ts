import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CouponStatus = 'available' | 'used_on_bid' | 'expired';
type CouponSource = 'gmail' | 'manual';
type CouponBenefit = 'amount_off' | 'free_shipping' | 'half_off_shipping';

type Coupon = {
  code: string;
  emailId: string;
  threadId?: string;
  subject: string;
  from: string;
  sentAt: string; // ISO
  expiresAt: string; // ISO
  daysLeft: number; // 0..14
  status: CouponStatus;
  statusSource: 'computed' | 'user';
  hidden?: boolean;
  source: CouponSource;
  amount?: number | null;
  benefit?: CouponBenefit | null;
};

type StoredCouponMeta = { status?: CouponStatus; updatedAt?: string; hidden?: boolean };
type ManualCouponDoc = {
  userId: string;
  code: string;
  expiresAt: string; // ISO
  amount?: number | null;
  benefit?: CouponBenefit | null;
  createdAt?: string;
  updatedAt?: string;
};

// Gmail-extracted StockX coupon codes (strict, avoids false positives from email content).
const GMAIL_COUPON_CODE_RE = /^B10-[A-Z0-9]{6}$/;
function normalizeCouponCode(code: string): string {
  return String(code || '').trim().toUpperCase();
}
function isValidGmailCouponCode(code: string): boolean {
  return GMAIL_COUPON_CODE_RE.test(normalizeCouponCode(code));
}
// Manual coupon codes can be any non-empty user-entered string (within a sane length limit).
function isValidManualCouponCode(code: string): boolean {
  const c = String(code || '').trim();
  return c.length >= 1 && c.length <= 80;
}

function resolveUserId(request: NextRequest): string {
  const qpUserId = request.nextUrl.searchParams.get('userId')?.trim() || '';
  const headerUserId = request.headers.get('x-user-id')?.trim() || '';
  const cookieStore = cookies();
  const cookieUserId =
    (cookieStore.get('userId')?.value ||
      cookieStore.get('siteUserId')?.value ||
      cookieStore.get('site-user-id')?.value ||
      '')
      .trim();

  return (qpUserId || headerUserId || cookieUserId).trim();
}

function decodeBase64Url(data: string): string {
  // Gmail uses base64url (RFC 4648)
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, 'base64').toString('utf8');
}

function decodeQuotedPrintable(input: string): string {
  // Decode quoted-printable content (common in StockX transactional emails).
  // Handles soft line breaks ("=\r\n") and hex escapes ("=C2=A0").
  if (!input || (!input.includes('=') && !input.includes('=\n') && !input.includes('=\r'))) return input;

  const s = input.replace(/=\r?\n/g, ''); // soft line breaks
  const bytes: number[] = [];

  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    if (ch === 61 /* '=' */ && i + 2 < s.length) {
      const h1 = s.charCodeAt(i + 1);
      const h2 = s.charCodeAt(i + 2);
      const isHex =
        ((h1 >= 48 && h1 <= 57) || (h1 >= 65 && h1 <= 70) || (h1 >= 97 && h1 <= 102)) &&
        ((h2 >= 48 && h2 <= 57) || (h2 >= 65 && h2 <= 70) || (h2 >= 97 && h2 <= 102));
      if (isHex) {
        const hex = s.slice(i + 1, i + 3);
        bytes.push(Number.parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    // Keep ASCII byte. (QP bodies are typically ASCII with hex escapes for non-ASCII.)
    bytes.push(ch & 0xff);
  }

  try {
    return Buffer.from(bytes).toString('utf8');
  } catch {
    return s;
  }
}

function extractBody(email: any): { html: string; text: string } {
  let html = '';
  let text = '';

  const walk = (part: any) => {
    if (!part) return;
    const mime = part.mimeType;
    const data = part.body?.data;
    if ((mime === 'text/html' || mime === 'text/plain') && data) {
      const decoded = decodeQuotedPrintable(decodeBase64Url(data));
      if (mime === 'text/html') html += decoded;
      else text += decoded;
    }
    if (Array.isArray(part.parts)) part.parts.forEach(walk);
  };

  walk(email?.payload);
  return { html, text };
}

function stripHtml(input: string): string {
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLikelyCouponCodes(text: string): string[] {
  const t = text.toUpperCase();

  // StockX coupon codes in your template are always `B10-` + 6 chars (e.g. B10-ZVVG7N / B10-123456).
  // This avoids false positives from hyphenated words in subject lines like "DOUBLE-KNIT".
  const isValidCouponCodeLocal = (code: string) => isValidGmailCouponCode(code);

  // Strong signals first (StockX template examples):
  // - "Use code B10-ZVVG7N in the next 14 days..."
  // - "Coupon Code: B10-ZVVG7N"
  const strong: string[] = [];
  const strongPatterns: RegExp[] = [
    /\bUSE\s+CODE\s+(B10-[A-Z0-9]{6})\b/g,
    /\bCOUPON\s+CODE\s*:\s*(B10-[A-Z0-9]{6})\b/g,
    /\bPROMO\s+CODE\s*:\s*(B10-[A-Z0-9]{6})\b/g
  ];
  for (const re of strongPatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      strong.push(m[1]);
    }
  }

  // Heuristic 1: look for "CODE" nearby and capture the next token-ish string
  const nearCode: string[] = [];
  const nearCodeRe = /\b(?:USE\s+CODE|PROMO\s+CODE|COUPON\s+CODE|CODE)\b[^A-Z0-9]{0,20}(B10-[A-Z0-9]{6})\b/g;
  let m: RegExpExecArray | null;
  while ((m = nearCodeRe.exec(t))) {
    nearCode.push(m[1]);
  }

  // Heuristic 2: general “coupon-looking” tokens (avoid common words)
  const generic = (t.match(/\b[A-Z0-9][A-Z0-9\-]{5,20}\b/g) || []).filter((s) => {
    const bad = new Set([
      'STOCKX',
      'ORDER',
      'REFUND',
      'REFUNDED',
      'SHIPPED',
      'DELIVERED',
      'DISCOUNT',
      'COUPON',
      'PROMO',
      'OFFER',
      'VALID',
      'EXPIRES',
      'OFF'
    ]);
    if (bad.has(s)) return false;
    // Avoid dates like 2026-01-24
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    // Coupon codes are typically not all-numeric.
    if (/^\d+$/.test(s)) return false;
    // Require at least one letter (reduces false positives from ids).
    if (!/[A-Z]/.test(s)) return false;
    return true;
  });

  // Prefer strong matches, then fall back.
  const combined = [...strong, ...nearCode, ...generic];
  // De-dupe and keep order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of combined) {
    if (seen.has(c)) continue;
    // Only accept codes that look like actual StockX coupons.
    if (!isValidCouponCodeLocal(c)) continue;
    seen.add(c);
    out.push(c);
  }
  // If we found strong matches, do not return unrelated guesses.
  if (strong.length > 0) return out.slice(0, 3);
  return out.slice(0, 5);
}

function extractCouponBenefit(plain: string): { benefit: CouponBenefit | null; amount: number | null } {
  const t = String(plain || '');
  const lower = t.toLowerCase();

  // Shipping-related benefits (match common StockX wording)
  if (lower.includes('free shipping')) {
    return { benefit: 'free_shipping', amount: null };
  }
  if (
    lower.includes('half off shipping') ||
    /\b50%\s*off\s*shipping\b/i.test(t) ||
    /\b50%\s*shipping\b/i.test(t)
  ) {
    return { benefit: 'half_off_shipping', amount: null };
  }

  // Amount-off benefits
  const amountPatterns: RegExp[] = [
    /\$\s*([0-9]{1,4}(?:\.[0-9]{1,2})?)\s*(?:off|credit)\b/i,
    /\b([0-9]{1,4}(?:\.[0-9]{1,2})?)\s*(?:dollars?)\s*(?:off|credit)\b/i,
    /\b(?:bid\s*credit|credit)\s*[:\-]?\s*\$\s*([0-9]{1,4}(?:\.[0-9]{1,2})?)\b/i,
    // Common StockX wording variants
    /\b(?:bid\s*credit|credit)\s*[:\-]?\s*([0-9]{1,4}(?:\.[0-9]{1,2})?)\s*(?:usd|dollars?)?\b/i,
    /\bget\s*\$?\s*([0-9]{1,4}(?:\.[0-9]{1,2})?)\s*(?:off|credit)\b/i,
    /\bsave\s*\$?\s*([0-9]{1,4}(?:\.[0-9]{1,2})?)\b/i,
  ];
  for (const re of amountPatterns) {
    const m = t.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) {
      return { benefit: 'amount_off', amount: n };
    }
  }

  return { benefit: null, amount: null };
}

function inferCouponBenefitFromCode(code: string): { benefit: CouponBenefit | null; amount: number | null } {
  const c = String(code || '').trim().toUpperCase();
  // StockX bid credit codes commonly start with "B10-", "B20-", etc.
  const m = c.match(/^B(\d{1,3})\-/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) return { benefit: 'amount_off', amount: n };
  }
  return { benefit: null, amount: null };
}

function computeDaysLeft(sentAtMs: number): { expiresAtMs: number; daysLeft: number } {
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
  const expiresAtMs = sentAtMs + fourteenDaysMs;
  const now = Date.now();
  const daysLeft = Math.ceil((expiresAtMs - now) / (24 * 60 * 60 * 1000));
  return { expiresAtMs, daysLeft: Math.max(0, Math.min(14, daysLeft)) };
}

function computeDaysLeftFromExpiresAt(expiresAtMs: number): { daysLeft: number } {
  const now = Date.now();
  const daysLeft = Math.ceil((expiresAtMs - now) / (24 * 60 * 60 * 1000));
  return { daysLeft: Math.max(0, daysLeft) };
}

async function loadStatusMap(userId: string) {
  const db = getAdminDb();
  const snap = await db.collection('user_stockx_coupon_status').where('userId', '==', userId).get();
  const map = new Map<string, StoredCouponMeta>();
  snap.docs.forEach((d) => {
    const data = d.data() as any;
    if (!data?.code) return;
    const code = normalizeCouponCode(data.code);
    if (!isValidManualCouponCode(code)) return;
    map.set(code, {
      status: data?.status as CouponStatus | undefined,
      updatedAt: data?.updatedAt || '',
      hidden: !!data?.hidden
    });
  });
  return map;
}

function docIdForCoupon(userId: string, code: string): string {
  return `${userId}_${encodeURIComponent(code.toUpperCase())}`;
}

function docIdForManualCoupon(userId: string, code: string): string {
  return `${userId}_${encodeURIComponent(code.toUpperCase())}`;
}

async function loadManualCoupons(userId: string): Promise<ManualCouponDoc[]> {
  const db = getAdminDb();
  const snap = await db.collection('user_stockx_manual_coupons').where('userId', '==', userId).get();
  return snap.docs
    .map((d) => d.data() as any)
    .filter((x) => x?.code && x?.expiresAt)
    .map((x) => ({
      userId: String(x.userId || userId),
      code: normalizeCouponCode(x.code),
      expiresAt: String(x.expiresAt),
      amount: typeof x.amount === 'number' ? x.amount : (x.amount == null ? null : Number(x.amount)),
      benefit: (x.benefit === 'amount_off' || x.benefit === 'free_shipping' || x.benefit === 'half_off_shipping')
        ? (x.benefit as CouponBenefit)
        : null,
      createdAt: x.createdAt ? String(x.createdAt) : undefined,
      updatedAt: x.updatedAt ? String(x.updatedAt) : undefined,
    }))
    .filter((x) => isValidManualCouponCode(x.code));
}

export async function GET(request: NextRequest) {
  try {
    const userId = resolveUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Missing userId (query param, x-user-id header, or cookies)' },
        { status: 400 }
      );
    }

    const cookieStore = cookies();
    const accessToken = cookieStore.get('gmail_access_token')?.value;
    const refreshToken = cookieStore.get('gmail_refresh_token')?.value;

    if (!accessToken) {
      return NextResponse.json({ success: false, error: 'Gmail not connected' }, { status: 401 });
    }

    const limitParam = Number.parseInt(request.nextUrl.searchParams.get('limit') || '50', 10);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;
    const debugEnabled = request.nextUrl.searchParams.get('debug') === '1';
    const includeHidden = request.nextUrl.searchParams.get('includeHidden') === '1';

    // Redirect URI matching existing pattern
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/gmail/callback`;

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );
    oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });

    // Best-effort refresh
    try {
      if (refreshToken) {
        const tokenInfo = await oauth2Client.getAccessToken();
        if (tokenInfo.token && tokenInfo.token !== accessToken) {
          oauth2Client.setCredentials({ access_token: tokenInfo.token, refresh_token: refreshToken });
        }
      }
    } catch {
      // If refresh fails, we’ll let the Gmail call error and return 401 below.
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Mirror the “known-good” approach used by /failed-verifications:
    // use a small set of deterministic queries, then dedupe.
    // Note: Gmail search date syntax can be finicky across providers/locales; we avoid `after:` here.
    const phrases = ['"StockX Has Your Back"', '"Has Your Back"'];
    const queries: string[] = [
      ...phrases.map((p) => `from:noreply@stockx.com subject:${p}`),
      ...phrases.map((p) => `from:stockx.com subject:${p}`),
      // Provider/bounce domains (sometimes indexed in odd ways)
      ...phrases.map((p) => `from:tmail.stockx.com subject:${p}`),
      ...phrases.map((p) => `from:em.tmail.stockx.com subject:${p}`),
      // Slightly looser: phrase anywhere but still from StockX
      ...phrases.map((p) => `from:noreply@stockx.com ${p}`),
      ...phrases.map((p) => `from:stockx.com ${p}`)
    ];
    const fallbackQuery = `"StockX Has Your Back"`;

    const statusMap = await loadStatusMap(userId);
    const manualDocs = await loadManualCoupons(userId);

    const attemptCounts: Array<{ q: string; count: number }> = [];
    const messageMap = new Map<string, { id?: string; threadId?: string }>();
    let queryUsed = queries[0];

    for (const q of queries) {
      const res = await gmail.users.messages.list({ userId: 'me', q, maxResults: limit });
      const found = res.data.messages || [];
      attemptCounts.push({ q, count: found.length });
      for (const m of found) {
        if (m?.id) messageMap.set(m.id, m);
      }
    }

    // Fallback: phrase-only (still filtered by From header in code).
    if (messageMap.size === 0) {
      const res = await gmail.users.messages.list({ userId: 'me', q: fallbackQuery, maxResults: limit });
      const found = res.data.messages || [];
      attemptCounts.push({ q: fallbackQuery, count: found.length });
      for (const m of found) {
        if (m?.id) messageMap.set(m.id, m);
      }
      queryUsed = fallbackQuery;
    }

    const messages = [...messageMap.values()];

    const coupons: Coupon[] = [];
    const dbg = {
      totalMessages: messages.length,
      processed: 0,
      filteredOutNotStockx: 0,
      emptyBody: 0,
      noCodeExtracted: 0,
      codesExtracted: 0,
      sampleSubjects: [] as Array<{ subject: string; from: string }>,
      sampleSnippets: [] as string[]
    };

    for (const msg of messages) {
      if (!msg.id) continue;
      const full = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
      const email = full.data as any;
      const headers = email?.payload?.headers || [];
      const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
      const from = headers.find((h: any) => h.name === 'From')?.value || '';
      const fromLower = String(from).toLowerCase();
      // Hard filter: only StockX-origin emails
      if (debugEnabled && dbg.sampleSubjects.length < 5) {
        dbg.sampleSubjects.push({ subject, from });
      }
      if (!fromLower.includes('stockx.com')) {
        dbg.filteredOutNotStockx++;
        continue;
      }
      dbg.processed++;
      const sentAtMs = Number(email?.internalDate || 0);
      if (!Number.isFinite(sentAtMs) || sentAtMs <= 0) continue;

      const { html, text } = extractBody(email);
      const plain = stripHtml(html || text || '');
      if (!plain) {
        dbg.emptyBody++;
        continue;
      }
      const codes = extractLikelyCouponCodes(plain);
      if (codes.length === 0) {
        dbg.noCodeExtracted++;
        if (debugEnabled && dbg.sampleSnippets.length < 3) {
          const hit = plain.match(/.{0,80}(USE CODE|COUPON CODE).{0,120}/i);
          dbg.sampleSnippets.push(hit?.[0] || plain.slice(0, 220));
        }
        continue;
      }
      // De-dupe codes within a single email (these templates often repeat the code multiple times).
      const uniqueCodes = Array.from(new Set(codes.map((c) => c.toUpperCase())));
      dbg.codesExtracted += uniqueCodes.length;

      const extractedBenefit = extractCouponBenefit(plain);
      const { expiresAtMs, daysLeft } = computeDaysLeft(sentAtMs);
      const computedExpired = daysLeft <= 0;

      for (const key of uniqueCodes) {
        const stored = statusMap.get(key);
        if (stored?.hidden && !includeHidden) continue;
        const computedStatus: CouponStatus = computedExpired ? 'expired' : 'available';
        // Expiration should always win. Even if a user previously marked "available"/"used",
        // once it's past expiry we display it as expired.
        const status: CouponStatus = computedExpired ? 'expired' : (stored?.status || computedStatus);

        const inferred = extractedBenefit.benefit || extractedBenefit.amount != null ? extractedBenefit : inferCouponBenefitFromCode(key);

        coupons.push({
          code: key,
          emailId: msg.id,
          threadId: msg.threadId,
          subject,
          from,
          sentAt: new Date(sentAtMs).toISOString(),
          expiresAt: new Date(expiresAtMs).toISOString(),
          daysLeft,
          status,
          statusSource: computedExpired ? 'computed' : (stored?.status ? 'user' : 'computed')
          ,hidden: !!stored?.hidden,
          source: 'gmail',
          amount: inferred.amount,
          benefit: inferred.benefit
        });
      }
    }

    // Add manual coupons (explicit expiry/amount)
    for (const d of manualDocs) {
      const code = d.code.toUpperCase();
      const stored = statusMap.get(code);
      if (stored?.hidden && !includeHidden) continue;
      const expiresAtMs = Date.parse(d.expiresAt);
      if (!Number.isFinite(expiresAtMs)) continue;
      const { daysLeft } = computeDaysLeftFromExpiresAt(expiresAtMs);
      const computedExpired = daysLeft <= 0;
      const computedStatus: CouponStatus = computedExpired ? 'expired' : 'available';
      const status: CouponStatus = computedExpired ? 'expired' : (stored?.status || computedStatus);
      const sentAtIso = d.createdAt && !Number.isNaN(Date.parse(d.createdAt)) ? new Date(d.createdAt).toISOString() : new Date().toISOString();

      coupons.push({
        code,
        emailId: `manual:${docIdForManualCoupon(userId, code)}`,
        threadId: undefined,
        subject: 'Manual coupon',
        from: 'Manual',
        sentAt: sentAtIso,
        expiresAt: new Date(expiresAtMs).toISOString(),
        daysLeft,
        status,
        statusSource: computedExpired ? 'computed' : (stored?.status ? 'user' : 'computed'),
        hidden: !!stored?.hidden,
        source: 'manual',
        amount: typeof d.amount === 'number' && Number.isFinite(d.amount) ? d.amount : null,
        benefit: d.benefit || null
      });
    }

    // De-dupe by code:
    // - prefer manual coupon over gmail if both exist (manual has explicit expiry/amount)
    // - otherwise keep newest by sentAt
    const byCode = new Map<string, Coupon>();
    const sorted = coupons.sort((a, b) => (b.sentAt > a.sentAt ? 1 : -1));
    for (const c of sorted) {
      const existing = byCode.get(c.code);
      if (!existing) {
        byCode.set(c.code, c);
        continue;
      }
      if (existing.source !== 'manual' && c.source === 'manual') {
        byCode.set(c.code, c);
      }
    }

    const results = [...byCode.values()].sort((a, b) => (b.sentAt > a.sentAt ? 1 : -1));

    return NextResponse.json({
      success: true,
      count: results.length,
      coupons: results,
      query: queryUsed,
      // Helpful for diagnosing “0 results” without needing devtools.
      queryAttempts: attemptCounts,
      ...(debugEnabled ? { debug: dbg } : {})
    });
  } catch (error: any) {
    console.error('❌ /api/gmail/stockx-coupons error:', error);
    const msg = error?.message || 'Server error';
    const isAuth = msg.includes('Invalid Credentials') || msg.includes('Login Required') || error?.code === 401;
    return NextResponse.json({ success: false, error: msg, needsReauth: isAuth }, { status: isAuth ? 401 : 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = resolveUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Missing userId (query param, x-user-id header, or cookies)' },
        { status: 400 }
      );
    }

    const body = await request.json();

    const action = String(body?.action || '').trim().toLowerCase();
    const codes: string[] = Array.isArray(body?.codes)
      ? body.codes
          .map((c: any) => normalizeCouponCode(c))
          .filter((c: string) => Boolean(c) && isValidManualCouponCode(c))
      : [];

    const db = getAdminDb();
    const nowIso = new Date().toISOString();

    // Add manual coupon
    if (action === 'add_manual') {
      const code = normalizeCouponCode(body?.code || '');
      const expiresAtRaw = String(body?.expiresAt || '').trim();
      const amountRaw = body?.amount;
      const benefitRaw = String(body?.benefit || 'amount_off').trim();

      if (!code) return NextResponse.json({ success: false, error: 'code is required' }, { status: 400 });
      if (!isValidManualCouponCode(code)) return NextResponse.json({ success: false, error: 'Invalid code' }, { status: 400 });
      if (!expiresAtRaw) return NextResponse.json({ success: false, error: 'expiresAt is required' }, { status: 400 });
      const expiresAtMs = Date.parse(expiresAtRaw);
      if (!Number.isFinite(expiresAtMs)) {
        return NextResponse.json({ success: false, error: 'expiresAt must be a valid date' }, { status: 400 });
      }
      const benefit: CouponBenefit =
        benefitRaw === 'free_shipping' || benefitRaw === 'half_off_shipping' || benefitRaw === 'amount_off'
          ? (benefitRaw as CouponBenefit)
          : 'amount_off';

      const amount =
        benefit === 'amount_off'
          ? (amountRaw === '' || amountRaw == null
              ? null
              : typeof amountRaw === 'number'
                ? amountRaw
                : Number(amountRaw))
          : null;
      if (benefit === 'amount_off' && amount != null && (!Number.isFinite(amount) || amount < 0.01)) {
        return NextResponse.json({ success: false, error: 'amount must be at least 0.01' }, { status: 400 });
      }

      const docId = docIdForManualCoupon(userId, code);
      await db.collection('user_stockx_manual_coupons').doc(docId).set(
        {
          userId,
          code,
          expiresAt: new Date(expiresAtMs).toISOString(),
          amount,
          benefit,
          createdAt: nowIso,
          updatedAt: nowIso
        },
        { merge: true }
      );

      return NextResponse.json({
        success: true,
        action: 'add_manual',
        coupon: {
          code,
          emailId: `manual:${docId}`,
          threadId: undefined,
          subject: 'Manual coupon',
          from: 'Manual',
          sentAt: nowIso,
          expiresAt: new Date(expiresAtMs).toISOString(),
          daysLeft: computeDaysLeftFromExpiresAt(expiresAtMs).daysLeft,
          status: (computeDaysLeftFromExpiresAt(expiresAtMs).daysLeft <= 0 ? 'expired' : 'available') as CouponStatus,
          statusSource: 'computed' as const,
          hidden: false,
          source: 'manual' as const,
          amount,
          benefit
        } satisfies Coupon
      });
    }

    // Bulk hide (Clear all)
    if (action === 'hide_all') {
      if (codes.length === 0) {
        return NextResponse.json({ success: false, error: 'codes[] is required for hide_all' }, { status: 400 });
      }

      const batch = db.batch();
      for (const code of codes) {
        const docId = docIdForCoupon(userId, code);
        const ref = db.collection('user_stockx_coupon_status').doc(docId);
        batch.set(ref, { userId, code, hidden: true, updatedAt: nowIso }, { merge: true });
      }
      await batch.commit();

      return NextResponse.json({ success: true, action: 'hide_all', count: codes.length, updatedAt: nowIso });
    }

    // Bulk set hidden (restore/hide many at once)
    if (action === 'set_hidden_bulk') {
      if (codes.length === 0) {
        return NextResponse.json({ success: false, error: 'codes[] is required for set_hidden_bulk' }, { status: 400 });
      }
      const hidden = body?.hidden;
      if (typeof hidden !== 'boolean') {
        return NextResponse.json({ success: false, error: 'hidden (boolean) is required for set_hidden_bulk' }, { status: 400 });
      }

      const batch = db.batch();
      for (const code of codes) {
        const docId = docIdForCoupon(userId, code);
        const ref = db.collection('user_stockx_coupon_status').doc(docId);
        batch.set(ref, { userId, code, hidden: !!hidden, updatedAt: nowIso }, { merge: true });
      }
      await batch.commit();
      return NextResponse.json({ success: true, action: 'set_hidden_bulk', hidden: !!hidden, count: codes.length, updatedAt: nowIso });
    }

    // Single code update
    const code = normalizeCouponCode(body?.code || '');
    const status = String(body?.status || '').trim() as CouponStatus;
    const hidden = body?.hidden;

    if (!code) return NextResponse.json({ success: false, error: 'code is required' }, { status: 400 });
    if (!isValidManualCouponCode(code)) return NextResponse.json({ success: false, error: 'Invalid code' }, { status: 400 });
    const isSettingHidden = typeof hidden === 'boolean';
    if (!isSettingHidden) {
      if (!['available', 'used_on_bid', 'expired'].includes(status)) {
        return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
      }
    }

    const docId = docIdForCoupon(userId, code);

    await db.collection('user_stockx_coupon_status').doc(docId).set(
      {
        userId,
        code,
        ...(isSettingHidden ? { hidden: !!hidden } : { status }),
        updatedAt: nowIso
      },
      { merge: true }
    );

    return NextResponse.json({ success: true, code, ...(isSettingHidden ? { hidden: !!hidden } : { status }), updatedAt: nowIso });
  } catch (error: any) {
    console.error('❌ /api/gmail/stockx-coupons POST error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 });
  }
}

