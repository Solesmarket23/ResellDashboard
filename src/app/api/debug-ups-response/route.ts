import { NextRequest, NextResponse } from 'next/server';
import { UPSTrackingAPI } from '@/lib/tracking/upsApi';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const trackingNumber = searchParams.get('trackingNumber') || '1ZR1H0140317255932';
    
    console.log(`🔍 Debugging UPS response for: ${trackingNumber}`);
    
    const upsAPI = new UPSTrackingAPI();
    
    // Get the raw response by calling the UPS API directly
    const authService = (upsAPI as any).authService;
    const token = await authService.getValidToken();
    const accessToken = token.access_token;
    
    const url = new URL(`https://onlinetools.ups.com/api/track/v1/details/${trackingNumber}`);
    url.searchParams.set('locale', 'en_US');
    url.searchParams.set('returnSignature', 'false');
    url.searchParams.set('returnMilestones', 'false');
    url.searchParams.set('returnPOD', 'false');
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'transId': `debug-${Date.now()}`,
        'transactionSrc': 'ResellDashboard',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`UPS API error: ${response.status} ${await response.text()}`);
    }
    
    const rawData = await response.json();
    
    // Extract key parts of the response
    const shipment = rawData.trackResponse?.shipment?.[0];
    const packageData = shipment?.package?.[0];
    
    return NextResponse.json({
      success: true,
      trackingNumber,
      rawResponse: rawData,
      shipmentKeys: shipment ? Object.keys(shipment) : [],
      packageKeys: packageData ? Object.keys(packageData) : [],
      shipmentData: shipment,
      packageData: packageData,
      deliveryDateFields: {
        shipment: {
          scheduledDeliveryDate: shipment?.scheduledDeliveryDate,
          ScheduledDeliveryDate: shipment?.ScheduledDeliveryDate,
          deliveryDate: shipment?.deliveryDate,
          estimatedDeliveryDate: shipment?.estimatedDeliveryDate
        },
        package: {
          scheduledDeliveryDate: packageData?.scheduledDeliveryDate,
          ScheduledDeliveryDate: packageData?.ScheduledDeliveryDate,
          deliveryDate: packageData?.deliveryDate,
          estimatedDeliveryDate: packageData?.estimatedDeliveryDate
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error debugging UPS response:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
