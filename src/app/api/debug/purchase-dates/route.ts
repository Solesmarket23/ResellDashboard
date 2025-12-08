import { NextRequest, NextResponse } from 'next/server';
import { consolidatePurchasesByOrderNumber } from '../../../../lib/utils/statusPriority';
import { getDocuments } from '../../../../lib/firebase/firebaseUtils';

export async function GET(request: NextRequest) {
  try {
    // Get purchases from Firebase
    const allPurchases = await getDocuments('purchases');
    
    // Group by order number to see duplicates
    const ordersMap = new Map<string, any[]>();
    allPurchases.forEach(p => {
      const orderNum = p.orderNumber || p.order_number;
      if (orderNum) {
        if (!ordersMap.has(orderNum)) ordersMap.set(orderNum, []);
        ordersMap.get(orderNum)!.push(p);
      }
    });
    
    // Find orders with multiple emails
    const ordersWithMultipleEmails = Array.from(ordersMap.entries())
      .filter(([_, purchases]) => purchases.length > 1)
      .slice(0, 10); // First 10 for debugging
    
    // Get sample orders to analyze
    const sampleOrders = ordersWithMultipleEmails.map(([orderNum, purchases]) => {
      // Try consolidation on this order
      const consolidated = consolidatePurchasesByOrderNumber(purchases);
      const consolidatedPurchase = consolidated[0];
      
      return {
        orderNumber: orderNum,
        emailCount: purchases.length,
        emails: purchases.map(p => ({
          status: p.status || p.shipping_status,
          email_subject: (p.email_subject || p.subject || 'N/A').substring(0, 60),
          email_date: p.email_date || p.emailDate || 'N/A',
          purchaseDate: p.purchaseDate || 'N/A',
          purchase_date: p.purchase_date || 'N/A'
        })),
        consolidated: {
          status: consolidatedPurchase?.status || consolidatedPurchase?.shipping_status,
          email_subject: (consolidatedPurchase?.email_subject || consolidatedPurchase?.subject || 'N/A').substring(0, 60),
          email_date: consolidatedPurchase?.email_date || consolidatedPurchase?.emailDate || 'N/A',
          purchaseDate: consolidatedPurchase?.purchaseDate || 'N/A',
          purchase_date: consolidatedPurchase?.purchase_date || 'N/A'
        }
      };
    });
    
    // Also check for orders that might have wrong dates
    const deliveredOrders = allPurchases
      .filter(p => (p.status || p.shipping_status || '').toLowerCase() === 'delivered')
      .slice(0, 5);
    
    const deliveredAnalysis = deliveredOrders.map(p => {
      const orderNum = p.orderNumber || p.order_number;
      const allOrderEmails = allPurchases.filter(op => 
        (op.orderNumber || op.order_number) === orderNum
      );
      
      return {
        orderNumber: orderNum,
        currentPurchaseDate: p.purchaseDate || p.purchase_date || 'N/A',
        status: p.status || p.shipping_status,
        email_subject: (p.email_subject || p.subject || 'N/A').substring(0, 60),
        email_date: p.email_date || p.emailDate || 'N/A',
        allEmailsForOrder: allOrderEmails.map(e => ({
          status: e.status || e.shipping_status,
          email_subject: (e.email_subject || e.subject || 'N/A').substring(0, 60),
          email_date: e.email_date || e.emailDate || 'N/A'
        }))
      };
    });
    
    return NextResponse.json({
      summary: {
        totalPurchases: allPurchases.length,
        uniqueOrders: ordersMap.size,
        ordersWithMultipleEmails: ordersWithMultipleEmails.length
      },
      sampleOrdersWithMultipleEmails: sampleOrders,
      deliveredOrdersAnalysis: deliveredAnalysis
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze purchases', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


