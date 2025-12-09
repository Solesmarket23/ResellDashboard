import { NextRequest, NextResponse } from 'next/server';

async function getEbayApplicationToken(appId: string, certId: string): Promise<string | null> {
  try {
    const encoded = Buffer.from(`${appId}:${certId}`).toString('base64');
    const resp = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${encoded}`
      },
      body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope'
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error('eBay token error:', resp.status, text);
      return null;
    }
    const data = await resp.json();
    return data.access_token as string;
  } catch (err) {
    console.error('eBay token exception:', err);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { query = 'Nike Dunk Low', limit = 5 } = await request.json().catch(() => ({}));

    const appId = process.env.EBAY_APP_ID || process.env.EBAY_CLIENT_ID;
    const certId = process.env.EBAY_CLIENT_SECRET || process.env.EBAY_CERT_ID;

    if (!appId || !certId) {
      return NextResponse.json({
        error: 'Missing eBay credentials',
        needed: ['EBAY_APP_ID or EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET or EBAY_CERT_ID']
      }, { status: 500 });
    }

    const token = await getEbayApplicationToken(appId, certId);
    if (!token) {
      return NextResponse.json({ error: 'Failed to obtain eBay token' }, { status: 502 });
    }

    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(String(limit))}`;
    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    });

    const status = resp.status;
    const data = await resp.json().catch(async () => ({ raw: await resp.text() }));

    return NextResponse.json({
      ok: resp.ok,
      status,
      query,
      count: data?.itemSummaries?.length || 0,
      sample: data?.itemSummaries?.slice(0, 3) || [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unknown error' }, { status: 500 });
  }
}











