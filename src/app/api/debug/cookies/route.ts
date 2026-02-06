import { NextRequest, NextResponse } from 'next/server';

// Public debug endpoint to confirm what cookies the server receives.
// Intentionally only returns a small allowlist of cookie names (no sensitive tokens).
export async function GET(request: NextRequest) {
  const host = request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const url = `${proto}://${host || 'unknown-host'}${request.nextUrl.pathname}`;

  const allowlist = new Set([
    'site-auth',
    'site-user-id',
  ]);

  const cookies = request.cookies
    .getAll()
    .filter((c) => allowlist.has(c.name))
    .map((c) => ({ name: c.name, value: c.value }));

  return NextResponse.json({
    ok: true,
    url,
    host,
    received: cookies,
  });
}

