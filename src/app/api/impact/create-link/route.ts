import { NextRequest, NextResponse } from 'next/server';
import ImpactClient from '@/lib/impact/impactClient';

export async function POST(request: NextRequest) {
  try {
    const { stockxUrl, customParams } = await request.json();

    if (!stockxUrl) {
      return NextResponse.json({ error: 'StockX URL is required' }, { status: 400 });
    }

    // Get Impact credentials from environment variables
    const accountSid = process.env.IMPACT_ACCOUNT_SID;
    const authToken = process.env.IMPACT_AUTH_TOKEN;
    const campaignId = process.env.IMPACT_CAMPAIGN_ID; // Optional

    if (!accountSid || !authToken) {
      console.error('Impact.com credentials not configured');
      console.log('Missing credentials:', { 
        hasAccountSid: !!accountSid, 
        hasAuthToken: !!authToken,
        hasCampaignId: !!campaignId
      });
      // Return original URL if no credentials
      return NextResponse.json({
        originalUrl: stockxUrl,
        trackingUrl: stockxUrl,
        error: 'Impact.com not configured - missing IMPACT_ACCOUNT_SID or IMPACT_AUTH_TOKEN'
      });
    }

    // Initialize Impact client
    const impactClient = new ImpactClient({
      accountSid,
      authToken,
      campaignId
    });

    // Generate tracking link
    const trackingLink = await impactClient.createTrackingLink(stockxUrl, customParams);

    return NextResponse.json(trackingLink);

  } catch (error) {
    console.error('Error in Impact.com API:', error);
    const { stockxUrl } = await request.json();
    
    // Return original URL on error
    return NextResponse.json({
      originalUrl: stockxUrl,
      trackingUrl: stockxUrl,
      error: 'Failed to generate affiliate link'
    });
  }
}