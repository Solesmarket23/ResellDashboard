import { NextRequest, NextResponse } from 'next/server';
import { AfterShipAPI } from '../../../../lib/tracking/trackingService';

// Test endpoint for AfterShip API integration
export async function POST(request: NextRequest) {
  try {
    const { trackingNumber } = await request.json();
    
    if (!trackingNumber) {
      return NextResponse.json({ 
        error: 'Tracking number is required' 
      }, { status: 400 });
    }

    console.log(`🧪 Testing AfterShip API with tracking number: ${trackingNumber}`);
    
    const apiKey = process.env.AFTERSHIP_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'AFTERSHIP_API_KEY not configured'
      }, { status: 500 });
    }
    
    const afterShipAPI = new AfterShipAPI(apiKey);
    const trackingInfo = await afterShipAPI.getTrackingInfo(trackingNumber);
    
    return NextResponse.json({
      success: true,
      trackingInfo,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ AfterShip API test error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// GET endpoint to check AfterShip API configuration
export async function GET() {
  try {
    const apiKey = process.env.AFTERSHIP_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'AFTERSHIP_API_KEY not configured',
        configuration: {
          apiKeyPresent: false,
          baseUrl: 'https://api.aftership.com/v4'
        }
      }, { status: 500 });
    }
    
    // Test basic API connectivity
    try {
      const response = await fetch('https://api.aftership.com/v4/couriers', {
        headers: {
          'aftership-api-key': apiKey,
          'Content-Type': 'application/json'
        }
      });
      
      const couriersData = await response.json();
      
      return NextResponse.json({
        success: true,
        configuration: {
          apiKeyPresent: true,
          baseUrl: 'https://api.aftership.com/v4',
          apiKeyLength: apiKey.length,
          apiKeyPrefix: apiKey.substring(0, 8) + '...',
          couriersAvailable: couriersData.data?.couriers?.length || 0,
          lastTested: new Date().toISOString()
        },
        couriers: couriersData.data?.couriers?.slice(0, 10) || [] // First 10 couriers
      });
      
    } catch (apiError) {
      return NextResponse.json({
        success: false,
        error: 'Failed to connect to AfterShip API',
        details: apiError instanceof Error ? apiError.message : 'Unknown API error',
        configuration: {
          apiKeyPresent: true,
          baseUrl: 'https://api.aftership.com/v4',
          apiKeyLength: apiKey.length,
          apiKeyPrefix: apiKey.substring(0, 8) + '...'
        }
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('❌ AfterShip configuration check error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
