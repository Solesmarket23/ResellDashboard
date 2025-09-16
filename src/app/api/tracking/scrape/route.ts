import { NextRequest, NextResponse } from 'next/server';
import { scraperManager } from '../../../../lib/scrapers/scraperManager';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const trackingNumber = searchParams.get('trackingNumber');
    const carrier = searchParams.get('carrier');
    const strategy = searchParams.get('strategy');
    
    if (!trackingNumber) {
      return NextResponse.json({ 
        success: false, 
        error: 'Tracking number is required' 
      }, { status: 400 });
    }
    
    console.log(`🔍 Scraping tracking: ${trackingNumber} (${carrier || 'auto-detect'})`);
    
    const trackingInfo = await scraperManager.getTrackingInfo(
      trackingNumber, 
      carrier || undefined, 
      strategy || undefined
    );
    
    return NextResponse.json({
      success: true,
      data: trackingInfo
    });
    
  } catch (error) {
    console.error('❌ Error scraping tracking:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { trackingNumbers, carrier, strategy } = await request.json();
    
    if (!trackingNumbers || !Array.isArray(trackingNumbers)) {
      return NextResponse.json({ 
        success: false, 
        error: 'trackingNumbers array is required' 
      }, { status: 400 });
    }
    
    console.log(`🔍 Bulk scraping ${trackingNumbers.length} tracking numbers`);
    
    const results = await Promise.allSettled(
      trackingNumbers.map(tn => scraperManager.getTrackingInfo(tn, carrier, strategy))
    );
    
    const trackingInfos = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          trackingNumber: trackingNumbers[index],
          carrier: carrier || 'Unknown',
          status: 'unknown' as const,
          lastUpdate: new Date().toISOString(),
          updates: [],
          error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
        };
      }
    });
    
    return NextResponse.json({
      success: true,
      data: trackingInfos
    });
    
  } catch (error) {
    console.error('❌ Error bulk scraping tracking:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
