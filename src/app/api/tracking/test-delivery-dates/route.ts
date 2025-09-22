import { NextRequest, NextResponse } from 'next/server';
import { trackingService } from '@/lib/tracking/trackingService';

export async function POST(request: NextRequest) {
  try {
    const { trackingNumbers } = await request.json();
    
    if (!trackingNumbers || !Array.isArray(trackingNumbers)) {
      return NextResponse.json(
        { error: 'Please provide an array of tracking numbers' },
        { status: 400 }
      );
    }

    console.log(`🧪 Testing delivery date extraction for ${trackingNumbers.length} tracking numbers`);
    
    const results = await trackingService.getBulkTrackingInfo(trackingNumbers);
    
    // Enhanced response with detailed delivery date information
    const detailedResults = results.map(result => ({
      trackingNumber: result.trackingNumber,
      carrier: result.carrier,
      status: result.status,
      error: result.error,
      
      // Primary delivery dates
      estimatedDelivery: result.estimatedDelivery,
      actualDelivery: result.actualDelivery,
      
      // Enhanced delivery date information
      commitmentDate: result.commitmentDate,
      appointmentDeliveryDate: result.appointmentDeliveryDate,
      
      // Delivery time windows
      deliveryTimeWindow: result.deliveryTimeWindow,
      
      // Delivery details
      deliveryDetails: result.deliveryDetails,
      
      // Additional info for debugging
      lastUpdate: result.lastUpdate,
      updatesCount: result.updates.length,
      serviceType: result.serviceType,
      
      // Raw scan events for debugging (last 3)
      recentScans: result.updates.slice(0, 3).map(update => ({
        timestamp: update.timestamp,
        location: update.location,
        status: update.status,
        description: update.description
      }))
    }));

    return NextResponse.json({
      success: true,
      count: results.length,
      results: detailedResults,
      summary: {
        successful: results.filter(r => !r.error).length,
        failed: results.filter(r => r.error).length,
        withEstimatedDelivery: results.filter(r => r.estimatedDelivery).length,
        withActualDelivery: results.filter(r => r.actualDelivery).length,
        withCommitmentDate: results.filter(r => r.commitmentDate).length,
        withAppointmentDate: results.filter(r => r.appointmentDeliveryDate).length
      }
    });

  } catch (error) {
    console.error('❌ Test delivery dates error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to test delivery dates',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Test Delivery Dates API',
    usage: 'POST with { "trackingNumbers": ["123456789012", "987654321098"] }',
    description: 'Tests the enhanced delivery date extraction for FedEx tracking numbers'
  });
}
