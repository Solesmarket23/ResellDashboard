import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

type DeliveriesSlackSettings = {
  enabled: boolean;
  webhookUrl: string;
  timeLocal: string; // "HH:MM"
  timezone: string; // IANA tz
  updatedAt: string;
  lastSentLocalDate?: string | null; // "YYYY-MM-DD"
};

function normalizeTimeLocal(v: any): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!/^\d{2}:\d{2}$/.test(s)) return null;
  const [hh, mm] = s.split(':').map((x) => parseInt(x, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return s;
}

function normalizeTimezone(v: any): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  // Basic validation only; Intl will validate at runtime.
  return s;
}

export async function GET(request: NextRequest) {
  try {
    const userId = resolveUserId(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });
    }
    const db = getAdminDb();
    const doc = await db.collection('users').doc(userId).get();
    const data = doc.exists ? (doc.data() as any) : {};
    const s = data?.deliveriesSlack || null;
    const settings: DeliveriesSlackSettings = {
      enabled: s?.enabled === true,
      webhookUrl: typeof s?.webhookUrl === 'string' ? s.webhookUrl : '',
      timeLocal: typeof s?.timeLocal === 'string' ? s.timeLocal : '21:00',
      timezone: typeof s?.timezone === 'string' ? s.timezone : 'America/New_York',
      updatedAt: typeof s?.updatedAt === 'string' ? s.updatedAt : null,
      lastSentLocalDate: typeof s?.lastSentLocalDate === 'string' ? s.lastSentLocalDate : null,
    } as any;
    return NextResponse.json({ success: true, userId, settings });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = resolveUserId(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });
    }
    const body = await request.json().catch(() => ({}));
    const enabled = body?.enabled === true;
    const webhookUrl = String(body?.webhookUrl || '').trim();
    if (enabled && !webhookUrl) {
      return NextResponse.json({ success: false, error: 'webhookUrl is required when enabled' }, { status: 400 });
    }
    if (webhookUrl && !/^https:\/\//i.test(webhookUrl)) {
      return NextResponse.json({ success: false, error: 'webhookUrl must be https' }, { status: 400 });
    }
    const timeLocal = normalizeTimeLocal(body?.timeLocal) || '21:00';
    const timezone = normalizeTimezone(body?.timezone) || 'America/New_York';

    // Validate timezone via Intl (throws RangeError if invalid)
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid timezone' }, { status: 400 });
    }

    const db = getAdminDb();
    const nowIso = new Date().toISOString();
    // Preserve lastSentLocalDate if settings already exist (avoids accidental re-sends on edits).
    const existing = await db.collection('users').doc(userId).get();
    const existingData = existing.exists ? (existing.data() as any) : {};
    const existingLastSent =
      typeof existingData?.deliveriesSlack?.lastSentLocalDate === 'string'
        ? existingData.deliveriesSlack.lastSentLocalDate
        : null;

    const payload: DeliveriesSlackSettings = {
      enabled,
      webhookUrl: enabled ? webhookUrl : '',
      timeLocal,
      timezone,
      updatedAt: nowIso,
      lastSentLocalDate: existingLastSent,
    };

    await db.collection('users').doc(userId).set({ deliveriesSlack: payload, updatedAt: nowIso }, { merge: true });
    return NextResponse.json({ success: true, userId, settings: payload });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Server error' }, { status: 500 });
  }
}

