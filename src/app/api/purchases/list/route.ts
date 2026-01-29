import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

function normalizeDateString(raw: any): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (s === 'TBD' || s === 'Unknown' || s === 'N/A' || s === 'Invalid Date') return null;
  return s.replace('\n', ' ');
}

function toMillis(raw: any): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  // Firestore Timestamp (Admin SDK)
  if (typeof raw?.toDate === 'function') {
    const d = raw.toDate();
    const t = d?.getTime?.();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof raw?.seconds === 'number') {
    const ns = typeof raw?.nanoseconds === 'number' ? raw.nanoseconds : 0;
    return raw.seconds * 1000 + Math.floor(ns / 1e6);
  }
  const s = normalizeDateString(raw);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function hasTimeComponent(raw: any): boolean {
  const s = normalizeDateString(raw);
  if (!s) return false;
  return /T\d{2}:\d{2}/.test(s) || /\d{1,2}:\d{2}\s*(AM|PM)?/i.test(s);
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function bestPurchaseMs(p: any): number | null {
  const purchaseRaw = p?.purchaseDate ?? p?.purchase_date ?? null;
  const purchaseMs = toMillis(purchaseRaw);
  if (purchaseMs != null && hasTimeComponent(purchaseRaw)) return purchaseMs;

  const emailRaw = p?.email_date ?? p?.emailDate ?? null;
  const emailMs = toMillis(emailRaw);
  if (purchaseMs != null && emailMs != null && isoDay(purchaseMs) === isoDay(emailMs)) return emailMs;

  if (purchaseMs != null) return purchaseMs;

  const fallbacks = [p?.email_date, p?.emailDate, p?.syncedAt, p?.updatedAt, p?.createdAt, p?.dateAdded];
  for (const c of fallbacks) {
    const ms = toMillis(c);
    if (ms != null) return ms;
  }
  return null;
}

function tieBreakerMs(p: any): number {
  const candidates = [p?.syncedAt, p?.updatedAt, p?.createdAt, p?.dateAdded];
  for (const c of candidates) {
    const ms = toMillis(c);
    if (ms != null) return ms;
  }
  return 0;
}

export async function GET(request: NextRequest) {
  try {
    // Get user ID from cookies or query params
    const cookieStore = cookies();
    let userId = cookieStore.get('userId')?.value || 
                 cookieStore.get('siteUserId')?.value || 
                 cookieStore.get('site-user-id')?.value;
    
    // Also check query params for API calls
    if (!userId) {
      const url = new URL(request.url);
      userId = url.searchParams.get('userId') || undefined;
    }
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 });
    }

    console.log(`📊 Loading purchases for user: ${userId}`);

    // Use Firebase Admin SDK to bypass security rules
    const { getAdminDb } = await import('@/lib/firebase/firebaseAdmin');
    const adminDb = getAdminDb();
    
    // Get all purchases for this user
    const purchasesSnapshot = await adminDb
      .collection('purchases')
      .where('userId', '==', userId)
      .get();
    
    const purchases = purchasesSnapshot.docs.map(doc => {
      const data = doc.data();
      // CRITICAL: Put id AFTER spread to ensure Firebase document ID is used
      // (data might have an 'id' field set to orderNumber which we need to overwrite)
      return {
        ...data,
        id: doc.id  // Overwrite any 'id' in data with the actual Firebase document ID
      };
    });

    // Ensure deterministic newest->oldest ordering (including within the same day)
    purchases.sort((a: any, b: any) => {
      const aMs = bestPurchaseMs(a);
      const bMs = bestPurchaseMs(b);

      const aInvalid = aMs == null;
      const bInvalid = bMs == null;

      // Invalid at end
      if (aInvalid && bInvalid) {
        // keep going to deterministic tie-breakers
      } else if (aInvalid) {
        return 1;
      } else if (bInvalid) {
        return -1;
      } else {
        const primary = (bMs as number) - (aMs as number);
        if (primary !== 0) return primary;
      }

      const aTie = tieBreakerMs(a);
      const bTie = tieBreakerMs(b);
      const secondary = bTie - aTie;
      if (secondary !== 0) return secondary;

      const onA = String(a?.orderNumber ?? '');
      const onB = String(b?.orderNumber ?? '');
      const onCmp = onB.localeCompare(onA); // newest-first: keep consistent reversal
      if (onCmp !== 0) return onCmp;

      const idA = String(a?.id ?? '');
      const idB = String(b?.id ?? '');
      return idB.localeCompare(idA);
    });
    
    console.log(`✅ Found ${purchases.length} purchases for user ${userId}`);
    
    // Debug: Verify first purchase has correct ID
    if (purchases.length > 0) {
      const firstId = purchases[0].id;
      const isOrderNumber = firstId?.startsWith('03-');
      console.log(`🔍 First purchase ID: "${firstId}" ${isOrderNumber ? '❌ STILL ORDER NUMBER!' : '✅ Correct Firebase ID'}`);
    }
    
    return NextResponse.json({ 
      purchases,
      count: purchases.length,
      userId 
    });
    
  } catch (error: any) {
    console.error('Error loading purchases:', error);
    return NextResponse.json({ 
      error: 'Failed to load purchases',
      message: error.message 
    }, { status: 500 });
  }
}

