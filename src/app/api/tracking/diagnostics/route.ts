import { NextRequest, NextResponse } from 'next/server';
import { trackingConfig, hasTrackingAPIs, getAvailableCarriers } from '../../../../lib/tracking/config';

export async function GET(request: NextRequest) {
  try {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      trackingConfig: {
        afterShip: {
          enabled: trackingConfig.afterShip.enabled,
          hasApiKey: !!process.env.AFTERSHIP_API_KEY,
          apiKeyLength: process.env.AFTERSHIP_API_KEY?.length || 0
        },
        fedex: {
          enabled: trackingConfig.fedex.enabled,
          hasApiKey: !!process.env.FEDEX_API_KEY,
          hasSecretKey: !!process.env.FEDEX_SECRET_KEY,
          apiKeyLength: process.env.FEDEX_API_KEY?.length || 0,
          secretKeyLength: process.env.FEDEX_SECRET_KEY?.length || 0
        },
        ups: {
          enabled: trackingConfig.ups.enabled,
          hasApiKey: !!process.env.UPS_API_KEY,
          hasUsername: !!process.env.UPS_API_USERNAME,
          hasPassword: !!process.env.UPS_API_PASSWORD
        },
        usps: {
          enabled: trackingConfig.usps.enabled,
          hasApiKey: !!process.env.USPS_API_KEY
        }
      },
      hasAnyTrackingAPIs: hasTrackingAPIs(),
      availableCarriers: getAvailableCarriers(),
      environmentVariables: {
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
        // Don't expose actual API keys, just show if they exist
        AFTERSHIP_API_KEY: process.env.AFTERSHIP_API_KEY ? '***configured***' : 'not set',
        FEDEX_API_KEY: process.env.FEDEX_API_KEY ? '***configured***' : 'not set',
        FEDEX_SECRET_KEY: process.env.FEDEX_SECRET_KEY ? '***configured***' : 'not set',
        UPS_API_KEY: process.env.UPS_API_KEY ? '***configured***' : 'not set',
        USPS_API_KEY: process.env.USPS_API_KEY ? '***configured***' : 'not set'
      }
    };

    return NextResponse.json({
      success: true,
      data: diagnostics
    });

  } catch (error) {
    console.error('❌ Error getting tracking diagnostics:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
