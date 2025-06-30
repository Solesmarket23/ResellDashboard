import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../lib/firebase/firebase';
import { collection, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';

interface TrackingFix {
  orderNumber: string;
  oldTracking: string;
  newTracking: string;
  reason: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderNumber, correctTracking, dryRun = true, fixSimilar = false } = body;

    if (!orderNumber || !correctTracking) {
      return NextResponse.json({ 
        error: 'Please provide orderNumber and correctTracking in request body' 
      }, { status: 400 });
    }

    console.log(`🔍 ${dryRun ? 'ANALYZING' : 'FIXING'} tracking for order ${orderNumber}`);

    // Get all purchases from Firebase
    const purchasesRef = collection(db, 'purchases');
    const purchasesSnapshot = await getDocs(purchasesRef);
    
    let targetOrder = null;
    let similarIssues: TrackingFix[] = [];
    let allPurchases = [];

    purchasesSnapshot.forEach((doc) => {
      const purchase = { id: doc.id, ...doc.data() };
      allPurchases.push(purchase);
      
      // Check if this is the target order
      if (purchase.orderNumber === orderNumber) {
        targetOrder = {
          id: doc.id,
          ...purchase,
          correctTracking: correctTracking,
          currentTracking: purchase.tracking || purchase.trackingNumber,
          needsUpdate: (purchase.tracking || purchase.trackingNumber) !== correctTracking
        };
      }
      
      // Look for similar UPS tracking issues
      if (fixSimilar && purchase.orderNumber && purchase.orderNumber !== orderNumber) {
        const currentTracking = purchase.tracking || purchase.trackingNumber;
        
        // Check if order has UPS tracking but current tracking is wrong format
        const hasValidUpsTracking = /^1Z[0-9A-Z]{16}$/i.test(currentTracking || '');
        
        // Look for potential UPS tracking in rawEmailContent or other fields
        const emailContent = purchase.rawEmailContent || '';
        const upsTrackingInEmail = emailContent.match(/(1Z[0-9A-Z]{16})/gi) || [];
        
        if (upsTrackingInEmail.length > 0 && !hasValidUpsTracking) {
          similarIssues.push({
            orderNumber: purchase.orderNumber,
            oldTracking: currentTracking || 'No tracking',
            newTracking: upsTrackingInEmail[0].toUpperCase(),
            reason: 'UPS tracking found in email but not extracted correctly'
          });
        }
      }
    });

    const results = {
      dryRun,
      targetOrder,
      similarIssues: similarIssues.slice(0, 20),
      summary: {
        totalPurchasesAnalyzed: allPurchases.length,
        targetOrderFound: !!targetOrder,
        targetOrderNeedsUpdate: targetOrder?.needsUpdate || false,
        similarIssuesFound: similarIssues.length,
        correctTrackingProvided: correctTracking
      }
    };

    // Apply fixes if not dry run
    if (!dryRun) {
      const fixedOrders = [];
      
      // Fix the target order
      if (targetOrder && targetOrder.needsUpdate) {
        const orderRef = doc(db, 'purchases', targetOrder.id);
        await updateDoc(orderRef, {
          tracking: correctTracking,
          trackingNumber: correctTracking, // Update both fields for compatibility
          lastUpdated: new Date().toISOString(),
          fixedBy: 'tracking-fix-script'
        });
        
        fixedOrders.push({
          orderNumber: targetOrder.orderNumber,
          oldTracking: targetOrder.currentTracking,
          newTracking: correctTracking
        });
        
        console.log(`✅ Updated ${targetOrder.orderNumber} tracking: ${targetOrder.currentTracking} → ${correctTracking}`);
      }
      
      // Fix similar issues if requested
      if (fixSimilar && similarIssues.length > 0) {
        for (const issue of similarIssues.slice(0, 10)) { // Limit to 10 fixes per run
          try {
            // Find the purchase document for this order
            const orderQuery = query(purchasesRef, where('orderNumber', '==', issue.orderNumber));
            const orderSnapshot = await getDocs(orderQuery);
            
            if (!orderSnapshot.empty) {
              const orderDoc = orderSnapshot.docs[0];
              const orderRef = doc(db, 'purchases', orderDoc.id);
              
              await updateDoc(orderRef, {
                tracking: issue.newTracking,
                trackingNumber: issue.newTracking,
                lastUpdated: new Date().toISOString(),
                fixedBy: 'tracking-fix-script'
              });
              
              fixedOrders.push(issue);
              console.log(`✅ Updated ${issue.orderNumber} tracking: ${issue.oldTracking} → ${issue.newTracking}`);
            }
          } catch (error) {
            console.error(`❌ Failed to update ${issue.orderNumber}:`, error);
          }
        }
      }
      
      results.summary.ordersFixed = fixedOrders.length;
      results.fixedOrders = fixedOrders;
    }

    return NextResponse.json(results);

  } catch (error) {
    console.error('Fix tracking database error:', error);
    return NextResponse.json({ 
      error: error.message,
      details: 'Make sure Firebase is properly configured and the purchases collection exists'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Use POST method to fix tracking numbers',
    examples: {
      fixSpecificOrder: {
        orderNumber: '01-95H9NC36ST',
        correctTracking: '1Z24WA430206362750',
        dryRun: true
      },
      fixSpecificOrderAndSimilar: {
        orderNumber: '01-95H9NC36ST',
        correctTracking: '1Z24WA430206362750',
        dryRun: false,
        fixSimilar: true
      }
    },
    instructions: [
      '1. First run with dryRun: true to see what would be changed',
      '2. Then run with dryRun: false to apply the fixes',
      '3. Use fixSimilar: true to also fix other orders with UPS tracking issues'
    ]
  });
} 