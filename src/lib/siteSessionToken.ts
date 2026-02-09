import { createHmac } from 'crypto';

const ALG = 'HS256';
const TTL_SEC = 60 * 60 * 24 * 30; // 30 days

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Buffer {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

/**
 * Sign a site session token for the given userId.
 * Used when a user signs in with the site password (web or native app).
 * Requires SITE_SESSION_SECRET env var.
 */
export function signSiteSessionToken(userId: string): string | null {
  const secret = process.env.SITE_SESSION_SECRET;
  if (!secret || !userId) return null;

  const header = { alg: ALG, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: userId, iat: now, exp: now + TTL_SEC };

  const headerB64 = base64UrlEncode(Buffer.from(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const message = `${headerB64}.${payloadB64}`;
  const sig = createHmac('sha256', secret).update(message).digest();
  const sigB64 = base64UrlEncode(sig);

  return `${message}.${sigB64}`;
}

/**
 * Verify a site session token and return the userId (sub claim), or null if invalid/expired.
 */
export function verifySiteSessionToken(token: string): string | null {
  const secret = process.env.SITE_SESSION_SECRET;
  if (!secret || !token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  const message = `${headerB64}.${payloadB64}`;
  const expectedSig = base64UrlEncode(createHmac('sha256', secret).update(message).digest());
  if (sigB64 !== expectedSig) return null;

  let payload: { sub?: string; exp?: number };
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
  } catch {
    return null;
  }

  const exp = payload.exp;
  if (typeof exp !== 'number' || Date.now() / 1000 > exp) return null;

  const sub = payload.sub;
  return typeof sub === 'string' && sub.length > 0 ? sub : null;
}
