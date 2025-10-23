import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const { userId, saleData } = await request.json();
    
    if (!userId || !saleData) {
      return NextResponse.json({ success: false, error: 'Missing userId or saleData' }, { status: 400 });
    }

    const db = getAdminDb();
    
    // Add userId to the sale data and ensure all required fields are present
    const saleWithUserId = {
      ...saleData,
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Ensure these fields exist with defaults if missing
      product: saleData.product || '',
      brand: saleData.brand || '',
      size: saleData.size || '',
      orderNumber: saleData.orderNumber || '',
      salePrice: saleData.salePrice || 0,
      purchasePrice: saleData.purchasePrice || 0,
      fees: saleData.fees || 0,
      profit: saleData.profit || 0,
      date: saleData.date || new Date().toISOString().split('T')[0],
      status: saleData.status || 'pending',
      type: saleData.type || 'imported',
      isTest: saleData.isTest || false
    };
    
    // Save to user_sales collection using Firebase Admin (bypasses security rules)
    const docRef = await db.collection('user_sales').add(saleWithUserId);
    
    console.log(`✅ Sale created successfully for user ${userId}:`, docRef.id);
    
    return NextResponse.json({ 
      success: true, 
      id: docRef.id,
      message: 'Sale created successfully' 
    });
    
  } catch (error) {
    console.error('❌ Error creating sale:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to create sale',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
