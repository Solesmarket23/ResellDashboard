import { NextResponse } from 'next/server';

/**
 * Debug: check if SITE_SESSION_SECRET is set on this deployment.
 * Open https://www.solesmarket.com/api/debug/site-session-secret in a browser.
 * If "set" is false, add SITE_SESSION_SECRET in Vercel → Settings → Environment Variables and redeploy.
 */
export async function GET() {
  const set = Boolean(process.env.SITE_SESSION_SECRET?.trim());
  return NextResponse.json({ set, hint: set ? 'Token will be sent from /api/auth/verify' : 'Add SITE_SESSION_SECRET in Vercel and redeploy' });
}
