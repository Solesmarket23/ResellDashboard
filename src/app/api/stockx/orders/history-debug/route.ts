import { NextRequest, NextResponse } from 'next/server';

function snippet(s: string, n = 450): string {
  const t = String(s || '');
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function isPerimeterXBlock(body: string): boolean {
  const b = String(body || '').toLowerCase();
  return (
    b.includes('px-cloud.net') ||
    b.includes('"appid":"px') ||
    b.includes('"blockscript"') ||
    b.includes('/captcha/captcha.js') ||
    b.includes('perimeterx')
  );
}

export async function GET(request: NextRequest) {
  const pageNumber = request.nextUrl.searchParams.get('pageNumber') || '1';
  const pageSize = request.nextUrl.searchParams.get('pageSize') || '5';
  const orderStatus = request.nextUrl.searchParams.get('orderStatus') || 'COMPLETED';

  const accessToken = request.cookies.get('stockx_access_token')?.value;
  const apiKey = process.env.STOCKX_API_KEY;
  if (!accessToken) return NextResponse.json({ success: false, error: 'Missing access token' }, { status: 401 });
  if (!apiKey) return NextResponse.json({ success: false, error: 'Missing STOCKX_API_KEY' }, { status: 500 });

  const qp = new URLSearchParams();
  qp.set('pageNumber', pageNumber);
  qp.set('pageSize', pageSize);
  if (orderStatus) qp.set('orderStatus', orderStatus);

  const gatewayUrl = `https://gateway.stockx.com/v2/selling/orders/history?${qp.toString()}`;
  const apiUrl = `https://api.stockx.com/v2/selling/orders/history?${qp.toString()}`;

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'x-api-key': apiKey,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'FlipFlow/1.0',
  };

  const fetchOne = async (url: string) => {
    const res = await fetch(url, { method: 'GET', headers });
    const text = await res.text().catch(() => '');
    return {
      url,
      status: res.status,
      ok: res.ok,
      blocked: res.status === 403 && isPerimeterXBlock(text),
      bodySnippet: snippet(text),
    };
  };

  const [gateway, api] = await Promise.all([fetchOne(gatewayUrl), fetchOne(apiUrl)]);

  return NextResponse.json({
    success: true,
    params: { pageNumber, pageSize, orderStatus },
    gateway,
    api,
    summary: {
      gatewayBlocked: gateway.blocked,
      apiBlocked: api.blocked,
    },
  });
}


