import { NextRequest, NextResponse } from 'next/server';
import { getAdminDocuments } from '@/lib/firebase/firebaseAdmin';
import { COLLECTIONS } from '@/lib/firebase/collections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });
    }

    // Read from server-side Firestore to avoid client/server project mismatches
    const allSales = await getAdminDocuments(COLLECTIONS.SALES);
    const userSales = allSales
      .filter((s: any) => s.userId === userId)
      .map((s: any) => ({ ...s }));

    return NextResponse.json({ success: true, sales: userSales });
  } catch (error: any) {
    console.error('❌ API /api/sales/list error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 });
  }
}


