import { NextRequest, NextResponse } from 'next/server';
import { trackingService, TrackingInfo } from '../../../../lib/tracking/trackingService';
import { UPSOAuthTrackingAPI } from '../../../../lib/tracking/upsOAuthApi';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const trackingNumber = searchParams.get('trackingNumber');
    const carrier = searchParams.get('carrier');
    
    if (!trackingNumber) {
      return NextResponse.json({ 
        success: false, 
        error: 'Tracking number is required' 
      }, { status: 400 });
    }
    
    console.log(`🔍 Fetching live tracking data for: ${trackingNumber} (${carrier || 'auto-detect'})`);
    
    const trackingInfo = await trackingService.getTrackingInfo(trackingNumber, carrier || undefined);
    
    return NextResponse.json({
      success: true,
      data: trackingInfo
    });
    
  } catch (error) {
    console.error('❌ Error fetching live tracking data:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { trackingNumbers } = await request.json();
    
    if (!trackingNumbers || !Array.isArray(trackingNumbers)) {
      return NextResponse.json({ 
        success: false, 
        error: 'trackingNumbers array is required' 
      }, { status: 400 });
    }
    
    console.log(`🔍 Fetching live tracking data for ${trackingNumbers.length} tracking numbers`);
    
    // Check if UPS OAuth is available
    const upsTokenCookie = request.cookies.get('ups_oauth_token');
    let useOAuth = false;
    let upsAccessToken = null;
    
    if (upsTokenCookie) {
      try {
        const tokenData = JSON.parse(upsTokenCookie.value);
        const now = Date.now();
        
        // Check if token is valid and not expired
        if (tokenData.access_token && (!tokenData.expires_at || now < tokenData.expires_at)) {
          useOAuth = true;
          upsAccessToken = tokenData.access_token;
          console.log('🔐 Using UPS OAuth token for tracking');
        } else {
          console.log('⚠️ UPS OAuth token expired or invalid, falling back to client credentials');
        }
      } catch (error) {
        console.log('⚠️ Invalid UPS OAuth token format, falling back to client credentials');
      }
    }
    
    let trackingInfos: TrackingInfo[];
    
    if (useOAuth && upsAccessToken) {
      // Use OAuth for UPS tracking
      const upsAPI = new UPSOAuthTrackingAPI();
      const upsTrackingNumbers = trackingNumbers.filter(tn => 
        tn.startsWith('1Z') || tn.match(/^1Z[0-9A-Z]{15,18}$/)
      );
      const nonUpsTrackingNumbers = trackingNumbers.filter(tn => 
        !tn.startsWith('1Z') && !tn.match(/^1Z[0-9A-Z]{15,18}$/)
      );
      
      const trackingPromises = [];
      
      // Process UPS tracking numbers with OAuth
      if (upsTrackingNumbers.length > 0) {
        trackingPromises.push(
          ...upsTrackingNumbers.map(async (trackingNumber: string) => {
            try {
              return await upsAPI.getTrackingInfo(trackingNumber, upsAccessToken);
            } catch (error) {
              console.error(`❌ OAuth UPS tracking error for ${trackingNumber}:`, error);
              return {
                trackingNumber,
                carrier: 'UPS',
                status: 'unknown' as const,
                lastUpdate: new Date().toISOString(),
                updates: [],
                error: error instanceof Error ? error.message : 'UPS OAuth tracking error'
              };
            }
          })
        );
      }
      
      // Process non-UPS tracking numbers with regular service
      if (nonUpsTrackingNumbers.length > 0) {
        trackingPromises.push(
          ...nonUpsTrackingNumbers.map(async (trackingNumber: string) => {
            try {
              return await trackingService.getTrackingInfo(trackingNumber);
            } catch (error) {
              console.error(`❌ Regular tracking error for ${trackingNumber}:`, error);
              return {
                trackingNumber,
                carrier: 'Unknown',
                status: 'unknown' as const,
                lastUpdate: new Date().toISOString(),
                updates: [],
                error: error instanceof Error ? error.message : 'Tracking error'
              };
            }
          })
        );
      }
      
      trackingInfos = await Promise.all(trackingPromises);
    } else {
      // Use regular tracking service
      trackingInfos = await trackingService.getBulkTrackingInfo(trackingNumbers);
    }
    
    return NextResponse.json({
      success: true,
      data: trackingInfos,
      method: useOAuth ? 'oauth' : 'client_credentials'
    });
    
  } catch (error) {
    console.error('❌ Error fetching bulk live tracking data:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
