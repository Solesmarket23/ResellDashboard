import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { orderNumber } = await request.json();
    
    if (!orderNumber) {
      return NextResponse.json({ error: 'Order number required' }, { status: 400 });
    }

    console.log(`🚀 FORCE DELIVERY: Forcing delivery status for order ${orderNumber}`);

    // Return the forced status update
    const forcedUpdate = {
      orderNumber,
      status: "Delivered",
      statusColor: "green",
      priority: 5,
      subject: "🎉 Xpress Ship Order Delivered: [FORCED UPDATE]",
      date: new Date().toISOString(),
      emailId: "forced-update",
      forced: true
    };

    console.log(`✅ FORCED STATUS: ${orderNumber} → Delivered`);

    return NextResponse.json({
      success: true,
      updatedOrders: [forcedUpdate],
      summary: {
        requested: 1,
        updated: 1,
        forced: true,
        note: "This is a manual override for delivery status"
      }
    });

  } catch (error) {
    console.error('❌ Force delivery error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to force delivery status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Use POST method to force delivery status for specific order',
    example: {
      method: 'POST',
      body: {
        orderNumber: '01-3KF7CE560J'
      }
    }
  });
}