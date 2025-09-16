import { NextRequest, NextResponse } from 'next/server';
import { getDocuments, addDocument } from '../../../lib/firebase/firebaseUtils';

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Starting lost purchases recovery...');

    // Get all current purchases
    const currentPurchases = await getDocuments('purchases');
    console.log(`📊 Current purchases in database: ${currentPurchases.length}`);

    // Get user ID from request or use a default
    const { userId } = await request.json().catch(() => ({}));
    
    if (!userId) {
      return NextResponse.json({ 
        success: false, 
        error: 'User ID required for recovery' 
      }, { status: 400 });
    }

    // Filter purchases for this user
    const userPurchases = currentPurchases.filter((p: any) => p.userId === userId);
    console.log(`👤 User purchases: ${userPurchases.length}`);

    // Check for potential data loss indicators
    const analysis = {
      totalPurchases: currentPurchases.length,
      userPurchases: userPurchases.length,
      gmailPurchases: userPurchases.filter((p: any) => p.type === 'gmail').length,
      manualPurchases: userPurchases.filter((p: any) => p.type === 'manual').length,
      purchasesWithTracking: userPurchases.filter((p: any) => 
        p.tracking && p.tracking !== 'No tracking' && p.tracking !== ''
      ).length,
      recentPurchases: userPurchases.filter((p: any) => {
        const createdAt = new Date(p.createdAt || p.purchaseDate);
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        return createdAt > oneWeekAgo;
      }).length
    };

    console.log('📈 Purchase Analysis:', analysis);

    // Look for patterns that might indicate data loss
    const potentialIssues = [];
    
    if (analysis.gmailPurchases < 50) {
      potentialIssues.push('Low Gmail purchase count - might indicate data loss');
    }
    
    if (analysis.purchasesWithTracking < analysis.gmailPurchases * 0.3) {
      potentialIssues.push('Low tracking number coverage - might indicate parsing issues');
    }

    // Check for duplicate order numbers (might indicate incomplete cleanup)
    const orderNumbers = userPurchases.map((p: any) => p.orderNumber).filter(Boolean);
    const uniqueOrderNumbers = new Set(orderNumbers);
    
    if (orderNumbers.length !== uniqueOrderNumbers.size) {
      potentialIssues.push('Duplicate order numbers found - might indicate data inconsistency');
    }

    // Sample some purchases for debugging
    const samplePurchases = userPurchases.slice(0, 5).map((p: any) => ({
      orderNumber: p.orderNumber,
      productName: p.productName || p.product?.name,
      status: p.status,
      tracking: p.tracking,
      type: p.type,
      createdAt: p.createdAt,
      hasTracking: !!(p.tracking && p.tracking !== 'No tracking' && p.tracking !== '')
    }));

    console.log('🔍 Sample purchases:', samplePurchases);

    return NextResponse.json({
      success: true,
      message: 'Lost purchases analysis completed',
      analysis,
      potentialIssues,
      samplePurchases,
      recommendations: [
        'Run "Consolidate Tracking" to find tracking data in different fields',
        'Run "Protect Tracking" to prevent future data loss',
        'Check if Gmail sync is working properly',
        'Consider running a full Gmail re-sync if data seems incomplete'
      ]
    });

  } catch (error) {
    console.error('❌ Error in lost purchases recovery:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Recovery analysis failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
}

