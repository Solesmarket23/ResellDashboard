import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { google } from 'googleapis';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { getStatusPriority, getHighestPriorityStatus } from '@/lib/utils/statusPriority';
import { parseGmailApiMessage } from '@/lib/email/orderConfirmationParser';

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

function pickTracking(data: any): string | null {
  return (
    data?.tracking ||
    data?.trackingNumber ||
    data?.tracking_number ||
    data?.shipment?.tracking ||
    data?.shipment?.trackingNumber ||
    null
  );
}

function pickDeliveredAt(data: any): string | null {
  const delivered =
    data?.actualDelivery ||
    data?.deliveredAt ||
    data?.shipment?.deliveredAt ||
    data?.deliveryDate ||
    null;
  if (!delivered) return null;
  if (typeof delivered === 'string') return delivered;
  // Best-effort Firestore Timestamp support
  if (typeof delivered === 'object') {
    if (typeof (delivered as any)?.toDate === 'function') {
      try {
        const d = (delivered as any).toDate();
        if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString();
      } catch {
        // ignore
      }
    }
    if (typeof (delivered as any)?.seconds === 'number') {
      try {
        return new Date((delivered as any).seconds * 1000).toISOString();
      } catch {
        // ignore
      }
    }
  }
  return null;
}

function pickStatus(data: any): string {
  return String(data?.status || data?.shipping_status || data?.shippingStatus || 'Ordered');
}

async function findPurchasesByOrderNumber(
  adminDb: FirebaseFirestore.Firestore,
  userId: string,
  orderNumber: string
) {
  const candidates: Array<{ fieldPath: string }> = [{ fieldPath: 'orderNumber' }, { fieldPath: 'order_number' }];
  const byId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();

  for (const { fieldPath } of candidates) {
    const snap = await adminDb.collection('purchases').where(fieldPath, '==', orderNumber).limit(25).get();
    for (const doc of snap.docs) {
      const data = doc.data() as any;
      const owner = (data?.userId || data?.uid || '').toString();
      if (owner === userId) byId.set(doc.id, doc);
    }
  }

  return [...byId.values()];
}

function headersToMap(headers: any[] | undefined) {
  const m = new Map<string, string>();
  for (const h of headers || []) {
    if (!h?.name) continue;
    m.set(String(h.name).toLowerCase(), String(h.value || ''));
  }
  return m;
}

function getGmailSubject(gmailMessage: any): string {
  const headers = headersToMap(gmailMessage?.payload?.headers);
  return headers.get('subject') || '';
}

function getGmailDate(gmailMessage: any): string {
  const headers = headersToMap(gmailMessage?.payload?.headers);
  return headers.get('date') || '';
}

function normalizeMaybeOrderNumber(v: unknown): string {
  return String(v || '').trim();
}

async function deepGmailTrace(request: NextRequest, orderNumber: string) {
  const cookieStore = cookies();
  const accessToken = cookieStore.get('gmail_access_token')?.value || '';
  const refreshToken = cookieStore.get('gmail_refresh_token')?.value || '';

  if (!accessToken) {
    return {
      ok: false as const,
      connected: false,
      reason: 'Gmail not connected (missing gmail_access_token cookie)',
      searched: null as any,
    };
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
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // Broad, explainable query: "show me emails that mention this order number"
  const query = `from:stockx.com "${orderNumber}"`;
  const listResp = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 25,
  });

  const messageIds = (listResp.data.messages || []).map((m) => m.id).filter(Boolean) as string[];

  const parsed: Array<{
    emailId: string;
    subject: string;
    date: string;
    extracted: {
      orderNumber: string;
      status: string;
      tracking: string;
      carrier: string;
    };
  }> = [];

  for (const id of messageIds) {
    const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
    const subject = getGmailSubject(msg.data);
    const date = getGmailDate(msg.data);
    const info = parseGmailApiMessage(msg.data, false);
    parsed.push({
      emailId: id,
      subject,
      date,
      extracted: {
        orderNumber: normalizeMaybeOrderNumber((info as any)?.order_number),
        status: String((info as any)?.shipping_status || '').trim(),
        tracking: String((info as any)?.tracking_number || '').trim(),
        carrier: String((info as any)?.carrier || '').trim(),
      },
    });
  }

  const statuses = parsed
    .map((p) => p.extracted.status)
    .filter((s) => !!s)
    .map((s) => (s[0] ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s));
  const bestStatus = statuses.length ? getHighestPriorityStatus(statuses) : null;

  // Try to find a tracking number from a "shipped/delivered-ish" email first.
  const bestTracking =
    parsed.find((p) => /shipped|delivered/i.test(p.extracted.status) && p.extracted.tracking)?.extracted.tracking ||
    parsed.find((p) => !!p.extracted.tracking)?.extracted.tracking ||
    null;

  return {
    ok: true as const,
    connected: true,
    reason: null,
    searched: {
      query,
      emailsFound: messageIds.length,
      parsed,
      statusesFound: [...new Set(statuses)],
      bestStatus,
      bestTracking,
    },
  };
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

    const orderNumber = request.nextUrl.searchParams.get('orderNumber')?.trim() || '';
    if (!orderNumber) {
      return NextResponse.json({ success: false, error: 'orderNumber query param is required' }, { status: 400 });
    }

    const deep = request.nextUrl.searchParams.get('deep') === '1' || request.nextUrl.searchParams.get('deep') === 'true';

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const trace: any[] = [];
    const recommendations: string[] = [];

    trace.push({
      step: 'input',
      ok: true,
      details: { orderNumber, deep },
    });

    const purchaseDocs = await findPurchasesByOrderNumber(adminDb, userId, orderNumber);
    trace.push({
      step: 'firestore.lookupPurchaseByOrderNumber',
      ok: purchaseDocs.length > 0,
      details: {
        found: purchaseDocs.length,
        note:
          purchaseDocs.length === 0
            ? 'No purchase doc matched this order number for this user'
            : purchaseDocs.length > 1
              ? 'Multiple purchase docs matched (duplicates)'
              : 'Single purchase doc matched',
      },
    });

    const purchases = purchaseDocs.map((doc) => {
      const data = doc.data() as any;
      const status = pickStatus(data);
      const tracking = pickTracking(data);
      const deliveredAt = pickDeliveredAt(data);
      const syncedAt = typeof data?.syncedAt === 'string' ? data.syncedAt : null;
      return {
        id: doc.id,
        orderNumber: data?.orderNumber || data?.order_number || null,
        type: data?.type || null,
        status,
        statusPriority: getStatusPriority(status),
        tracking,
        deliveredAt,
        syncedAt,
        rawFieldsPresent: {
          hasTracking: !!tracking,
          hasDeliveredAt: !!deliveredAt,
          hasSyncedAt: !!syncedAt,
        },
      };
    });

    if (purchases.length === 0) {
      recommendations.push('Confirm the order number format (include any prefix like "01-").');
      recommendations.push('Run Purchases → Sync Gmail on solesmarket.com, then retry this trace.');
      recommendations.push('If Sync Gmail runs but still no purchase appears, check parsing/extraction for that email.');
    } else {
      const primary = purchases[0];
      const derivedStatus = primary.deliveredAt ? 'Delivered' : primary.tracking ? 'Shipped' : 'Ordered';
      trace.push({
        step: 'firestore.evaluatePurchaseState',
        ok: true,
        details: {
          purchase: primary,
          derivedStatusFromFields: derivedStatus,
          derivedPriority: getStatusPriority(derivedStatus),
          statusLooksBehindFields:
            getStatusPriority(derivedStatus) > getStatusPriority(primary.status)
              ? 'YES (fields indicate later status than stored status)'
              : 'NO',
        },
      });

      if (!primary.tracking) {
        recommendations.push('No tracking is stored on the purchase yet → it cannot be marked "Shipped" by tracking.');
        recommendations.push('Run Purchases → Sync Gmail so the "Order Shipped" email can be parsed and merged.');
      }

      if (primary.tracking && getStatusPriority(primary.status) < getStatusPriority('Shipped')) {
        recommendations.push('Tracking exists but status is still not "Shipped" → check merge/overwrite behavior.');
      }

      if (primary.deliveredAt && getStatusPriority(primary.status) < getStatusPriority('Delivered')) {
        recommendations.push('DeliveredAt exists but status is not "Delivered" → check merge/overwrite behavior.');
      }
    }

    if (deep) {
      const deepResult = await deepGmailTrace(request, orderNumber);
      trace.push({
        step: 'gmail.deepTrace',
        ok: deepResult.ok,
        details: deepResult.ok
          ? deepResult.searched
          : { connected: deepResult.connected, reason: deepResult.reason },
      });

      if (!deepResult.ok) {
        recommendations.push('Connect Gmail first (Gmail status shows not connected/expired).');
      } else {
        const bestStatus = deepResult.searched.bestStatus as string | null;
        const bestTracking = deepResult.searched.bestTracking as string | null;

        if (!bestStatus) {
          recommendations.push('No status-bearing emails were parsed for this order number from Gmail search.');
          recommendations.push('Try searching Gmail manually for the order number; check Spam/Promotions.');
        } else {
          recommendations.push(`Gmail evidence suggests best status should be "${bestStatus}".`);
        }

        if (bestTracking) {
          recommendations.push(`Gmail evidence found tracking "${bestTracking}" (should be saved on the purchase).`);
        } else {
          recommendations.push('Gmail evidence did not include a tracking number in parsed emails.');
        }

        if (purchases.length > 0) {
          const primary = purchases[0];
          if (!primary.tracking && bestTracking) {
            recommendations.push(
              'Purchase is missing tracking but Gmail evidence has it → likely Sync Gmail hasn’t run since that email arrived, or merge by order number failed.'
            );
          }
          if (bestStatus && getStatusPriority(bestStatus) > getStatusPriority(primary.status)) {
            recommendations.push(
              `Stored status "${primary.status}" is behind Gmail evidence "${bestStatus}" → run Sync Gmail; if it still won’t update, inspect orderNumber extraction and consolidation.`
            );
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      userId,
      orderNumber,
      purchases,
      trace,
      recommendations: [...new Set(recommendations)],
    });
  } catch (error: any) {
    console.error('❌ /api/debug/order-status-trace error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 });
  }
}

