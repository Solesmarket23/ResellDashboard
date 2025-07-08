import { NextRequest, NextResponse } from 'next/server';
import { getDocuments } from '../../../../lib/firebase/firebaseUtils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json({ error: 'userId parameter required' }, { status: 400 });
    }

    // Get all purchases from Firebase
    const allPurchases = await getDocuments('purchases');
    
    // Filter to specific user
    const userPurchases = allPurchases.filter(
      (purchase: any) => purchase.userId === userId
    );
    
    // Separate by type
    const manualPurchases = userPurchases.filter(p => p.type === 'manual');
    const gmailPurchases = userPurchases.filter(p => p.type === 'gmail');
    
    return NextResponse.json({
      success: true,
      data: {
        total: userPurchases.length,
        manual: manualPurchases.length,
        gmail: gmailPurchases.length,
        purchases: userPurchases,
        manualPurchases,
        gmailPurchases
      }
    });
    
  } catch (error) {
    console.error('Error fetching Firebase purchases:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch purchases',
      details: error.message 
    }, { status: 500 });
  }
} 