import { NextRequest, NextResponse } from 'next/server';
import { createSlackService } from '@/lib/notifications/slackService';
import { getDocumentsServer } from '@/lib/firebase/firebaseServerUtils';
import { trackingService } from '@/lib/tracking/trackingService';

/**
 * POST /api/notifications/slack
 * Send delivery summary to Slack
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, type = 'daily_summary', purchases } = await request.json();
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Create Slack service
    const slackService = createSlackService();
    if (!slackService) {
      return NextResponse.json({ 
        error: 'Slack not configured. Please set SLACK_WEBHOOK_URL in .env.local' 
      }, { status: 500 });
    }

    console.log(`📨 Sending Slack notification (${type}) for user: ${userId}`);

    // Get purchases - either from request body (localStorage users) or Firebase
    let allPurchases: any[] = [];
    
    if (purchases && Array.isArray(purchases)) {
      allPurchases = purchases;
      console.log(`📦 Using ${allPurchases.length} purchases from request`);
    } else {
      // Get from Firebase
      const [purchasesByUserId, purchasesByUid] = await Promise.all([
        getDocumentsServer('purchases', {
          where: [{ field: 'userId', operator: '==', value: userId }]
        }),
        getDocumentsServer('purchases', {
          where: [{ field: 'uid', operator: '==', value: userId }]
        })
      ]);

      allPurchases = [...purchasesByUserId, ...purchasesByUid].filter((purchase, index, self) => 
        index === self.findIndex(p => p.id === purchase.id)
      );
      console.log(`📦 Found ${allPurchases.length} purchases from Firebase`);
    }

    // Filter purchases with tracking numbers
    const purchasesWithTracking = allPurchases.filter((purchase: any) => {
      const trackingValue = purchase.tracking || 
                           purchase.trackingNumber || 
                           purchase.tracking_number;
      return trackingValue && trackingValue.trim() !== '' && trackingValue !== 'TBD';
    });

    console.log(`📦 Found ${purchasesWithTracking.length} purchases with tracking`);

    if (purchasesWithTracking.length === 0) {
      return NextResponse.json({ 
        success: true,
        message: 'No deliveries to notify about',
        sent: false
      });
    }

    // Get tracking numbers
    const trackingNumbers = purchasesWithTracking.map((purchase: any) => 
      purchase.tracking || purchase.trackingNumber || purchase.tracking_number
    );

    // Get live tracking data
    console.log(`🔄 Fetching live tracking data for ${trackingNumbers.length} packages`);
    const liveTrackingData = await trackingService.getBulkTrackingInfo(trackingNumbers);

    // Build deliveries array with live tracking data
    const deliveries = purchasesWithTracking.map((purchase: any) => {
      const trackingValue = purchase.tracking || purchase.trackingNumber || purchase.tracking_number;
      const liveTracking = liveTrackingData.find(lt => lt.trackingNumber === trackingValue);
      
      // Determine status from live tracking or purchase status
      let status = purchase.status?.toLowerCase() || 'shipped';
      if (liveTracking && !liveTracking.error) {
        status = liveTracking.status;
      }

      // Get estimated delivery - normalize to YYYY-MM-DD format
      let estimatedDelivery = 'TBD';
      if (liveTracking && liveTracking.estimatedDelivery) {
        estimatedDelivery = liveTracking.estimatedDelivery;
      } else if (purchase.estimatedDelivery) {
        estimatedDelivery = purchase.estimatedDelivery;
      }

      // Validate and normalize date format
      if (estimatedDelivery && estimatedDelivery !== 'TBD') {
        try {
          const date = new Date(estimatedDelivery);
          if (!isNaN(date.getTime())) {
            // Convert to YYYY-MM-DD format
            estimatedDelivery = date.toISOString().split('T')[0];
          } else {
            console.warn(`⚠️ Invalid date for ${purchase.productName}: ${estimatedDelivery}`);
            estimatedDelivery = 'TBD';
          }
        } catch (error) {
          console.error(`❌ Error parsing date for ${purchase.productName}:`, error);
          estimatedDelivery = 'TBD';
        }
      }

      const productName = purchase.productName || purchase.product?.name || 'Unknown Product';
      
      // Calculate profit: Market Price - Purchase Price - $1 (pricing strategy)
      let purchasePrice: number | undefined;
      let marketPrice: number | undefined;
      let estimatedProfit: number | undefined;

      // Get purchase price (total amount paid) - check all possible field names
      // Priority order: total_amount (Gmail parsed) > totalAmount > totalPayment > price
      if (purchase.total_amount !== undefined) {
        purchasePrice = typeof purchase.total_amount === 'number' ? purchase.total_amount : parseFloat(purchase.total_amount);
      } else if (purchase.totalAmount !== undefined) {
        purchasePrice = typeof purchase.totalAmount === 'number' ? purchase.totalAmount : parseFloat(purchase.totalAmount);
      } else if (purchase.totalPayment !== undefined) {
        purchasePrice = typeof purchase.totalPayment === 'number' ? purchase.totalPayment : parseFloat(purchase.totalPayment);
      } else if (purchase.purchasePrice !== undefined) {
        purchasePrice = typeof purchase.purchasePrice === 'number' ? purchase.purchasePrice : parseFloat(purchase.purchasePrice);
      } else if (purchase.price) {
        // Try to parse price string like "$180.00" or "180.00 + $0.00"
        const priceStr = purchase.price.toString().replace(/[$,]/g, '').split('+')[0].trim();
        purchasePrice = parseFloat(priceStr);
      }
      
      // Validate purchase price
      if (purchasePrice !== undefined && (isNaN(purchasePrice) || purchasePrice <= 0)) {
        purchasePrice = undefined;
      }

      // Get current market price from StockX
      if (purchase.lowestAsk) {
        marketPrice = typeof purchase.lowestAsk === 'number' ? purchase.lowestAsk : parseFloat(purchase.lowestAsk);
      } else if (purchase.marketPrice) {
        marketPrice = typeof purchase.marketPrice === 'number' ? purchase.marketPrice : parseFloat(purchase.marketPrice);
      }

      // Calculate estimated profit: Market Price - Purchase Price - $1
      if (purchasePrice && marketPrice && !isNaN(purchasePrice) && !isNaN(marketPrice)) {
        estimatedProfit = marketPrice - purchasePrice - 1; // Subtract $1 for pricing strategy
      }
      
      console.log(`📦 ${productName}: tracking=${trackingValue}, eta=${estimatedDelivery}, status=${status}, purchase=$${purchasePrice}, market=$${marketPrice}, profit=$${estimatedProfit}`);

      return {
        productName,
        productBrand: purchase.productBrand || purchase.brand || 'Unknown Brand',
        productSize: purchase.productSize || purchase.size || purchase.product?.size || 'Unknown',
        trackingNumber: trackingValue,
        carrier: liveTracking?.carrier || purchase.carrier || 'Unknown',
        estimatedDelivery,
        status,
        purchasePrice,
        marketPrice,
        estimatedProfit
      };
    });

    // Calculate summary stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const arrivingToday = deliveries.filter(d => 
      d.estimatedDelivery === todayStr || d.status === 'out_for_delivery'
    ).length;

    const arrivingTomorrow = deliveries.filter(d => 
      d.estimatedDelivery === tomorrowStr
    ).length;

    const arrivingThisWeek = deliveries.filter(d => {
      if (!d.estimatedDelivery || d.estimatedDelivery === 'TBD') return false;
      const deliveryDate = new Date(d.estimatedDelivery);
      return deliveryDate > tomorrow && deliveryDate <= weekEnd;
    }).length;

    const inTransit = deliveries.filter(d => 
      d.status === 'in_transit' || d.status === 'shipped' || d.status === 'out_for_delivery'
    ).length;

    // Send notification
    if (type === 'daily_summary') {
      await slackService.sendDeliverySummary({
        totalDeliveries: deliveries.length,
        arrivingToday,
        arrivingTomorrow,
        arrivingThisWeek,
        inTransit,
        deliveries
      });
    }

    console.log(`✅ Slack notification sent successfully`);

    return NextResponse.json({
      success: true,
      message: 'Notification sent',
      sent: true,
      summary: {
        totalDeliveries: deliveries.length,
        arrivingToday,
        arrivingTomorrow,
        arrivingThisWeek,
        inTransit
      }
    });

  } catch (error) {
    console.error('❌ Error sending Slack notification:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * GET /api/notifications/slack/test
 * Test Slack webhook configuration
 */
export async function GET(request: NextRequest) {
  try {
    const slackService = createSlackService();
    
    if (!slackService) {
      return NextResponse.json({ 
        configured: false,
        message: 'Slack not configured. Please set SLACK_WEBHOOK_URL in .env.local' 
      });
    }

    // Send a test message
    await slackService.sendDeliveryUpdate({
      productName: 'Test Product',
      trackingNumber: '1Z999AA10123456784',
      status: 'in_transit',
      estimatedDelivery: new Date().toISOString().split('T')[0]
    });

    return NextResponse.json({
      configured: true,
      message: 'Slack webhook is configured and working! Check your Slack channel.'
    });

  } catch (error) {
    console.error('❌ Slack webhook test failed:', error);
    return NextResponse.json({
      configured: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

