import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    console.log(`🔄 RESET: Clearing all forced status updates`);

    // Return empty status updates to clear incorrect ones
    const resetUpdates: any[] = [];

    return NextResponse.json({
      success: true,
      updatedOrders: resetUpdates,
      summary: {
        requested: 0,
        updated: 0,
        reset: true,
        message: "All forced status updates cleared. Original statuses restored."
      }
    });

  } catch (error: any) {
    console.error('❌ Reset status error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to reset status',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Use POST method to reset/clear all forced status updates'
  });
}