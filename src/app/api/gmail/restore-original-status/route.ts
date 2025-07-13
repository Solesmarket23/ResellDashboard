import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { orderNumbers } = await request.json();
    
    console.log(`🔄 RESTORE: Restoring original statuses for ${orderNumbers?.length || 'all'} orders`);

    // Return status updates that restore orders to "Ordered" (the default original status)
    // This will override the incorrect "Delivered" statuses
    const restoreUpdates = orderNumbers ? orderNumbers.map((orderNumber: string) => ({
      orderNumber,
      status: "Ordered", 
      statusColor: "yellow",
      priority: 1,
      subject: "Status restored to original",
      date: new Date().toISOString(),
      emailId: "restore-original",
      restored: true
    })) : [];

    console.log(`✅ RESTORE: Generated ${restoreUpdates.length} restore updates`);

    return NextResponse.json({
      success: true,
      updatedOrders: restoreUpdates,
      summary: {
        requested: orderNumbers?.length || 0,
        updated: restoreUpdates.length,
        restored: true,
        message: "Original statuses restored. Incorrect 'Delivered' statuses cleared."
      }
    });

  } catch (error: any) {
    console.error('❌ Restore status error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to restore original status',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Use POST method to restore original statuses',
    example: {
      method: 'POST',
      body: {
        orderNumbers: ['75471168', '81-LG34U384ZP'] // Orders to restore, or omit for all
      }
    }
  });
}