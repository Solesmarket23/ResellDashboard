import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function sanitizeUserId(raw: unknown): string {
  const v = String(raw || '').trim();
  if (!v) return '';
  const lowered = v.toLowerCase();
  if (lowered === 'null' || lowered === 'undefined') return '';
  return v;
}

export async function GET() {
  const cookieStore = cookies();
  const userId = sanitizeUserId(
    cookieStore.get('userId')?.value ||
      cookieStore.get('siteUserId')?.value ||
      cookieStore.get('site-user-id')?.value
  );

  return NextResponse.json({ success: true, userId });
}


