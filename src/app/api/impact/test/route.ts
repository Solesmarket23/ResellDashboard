import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Check if Impact.com credentials are available
  const accountSid = process.env.IMPACT_ACCOUNT_SID;
  const authToken = process.env.IMPACT_AUTH_TOKEN;
  const campaignId = process.env.IMPACT_CAMPAIGN_ID;
  
  const hasCredentials = !!(accountSid && authToken);
  
  return NextResponse.json({
    configured: hasCredentials,
    hasAccountSid: !!accountSid,
    accountSidPreview: accountSid ? `${accountSid.substring(0, 4)}...` : null,
    hasAuthToken: !!authToken,
    authTokenPreview: authToken ? `${authToken.substring(0, 4)}...` : null,
    hasCampaignId: !!campaignId,
    campaignIdPreview: campaignId ? `${campaignId.substring(0, 4)}...` : null,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
}