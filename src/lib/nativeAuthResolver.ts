import { NextRequest } from 'next/server';
import { getAdminAuth } from '@/lib/firebase/admin';
import { verifySiteSessionToken } from '@/lib/siteSessionToken';

function getBearerToken(request: NextRequest): string | null {
  const raw = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const m = raw.match(/^Bearer\s+(.+)$/i);
  const token = (m?.[1] || '').trim();
  return token ? token : null;
}

/**
 * Resolve authenticated user id for native app API routes.
 * Accepts either:
 * - Firebase ID token (Bearer) → returns Firebase uid
 * - Site session token (Bearer) → returns site-password userId (same as users/{uid} in Firestore)
 * Returns null if missing or invalid.
 */
export async function resolveNativeAuthUserId(request: NextRequest): Promise<string | null> {
  const bearer = getBearerToken(request);
  if (!bearer) return null;

  // 1) Try Firebase ID token (Google sign-in)
  const adminAuth = getAdminAuth();
  if (adminAuth) {
    try {
      const decoded = await adminAuth.verifyIdToken(bearer);
      const uid = String(decoded?.uid || '').trim();
      if (uid) return uid;
    } catch {
      // not a Firebase token, try site session
    }
  }

  // 2) Try site session token (site-password sign-in)
  const siteUserId = verifySiteSessionToken(bearer);
  return siteUserId;
}
