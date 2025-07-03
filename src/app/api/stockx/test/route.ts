import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  // Get credentials from environment variables
  const clientId = process.env.STOCKX_CLIENT_ID;
  const clientSecret = process.env.STOCKX_CLIENT_SECRET;
  const apiKey = process.env.STOCKX_API_KEY;
  const redirectUri = process.env.STOCKX_REDIRECT_URI;

  // Check if all credentials are present
  const credentialsStatus = {
    clientId: clientId ? '✅ Present' : '❌ Missing',
    clientSecret: clientSecret ? '✅ Present' : '❌ Missing',
    apiKey: apiKey ? '✅ Present' : '❌ Missing',
    redirectUri: redirectUri ? '✅ Present' : '❌ Missing'
  };

  const missingCredentials = !clientId || !clientSecret || !apiKey || !redirectUri;

  if (missingCredentials) {
    return NextResponse.json({
      status: 'error',
      message: 'Missing StockX API credentials',
      credentials: credentialsStatus,
      oauthFlow: true,
      instructions: [
        '1. Add your StockX credentials to .env.local:',
        '   STOCKX_CLIENT_ID=your_client_id',
        '   STOCKX_CLIENT_SECRET=your_client_secret',
        '   STOCKX_API_KEY=your_api_key',
        '   STOCKX_REDIRECT_URI=http://localhost:3002/api/stockx/callback',
        '2. Restart your development server',
        '3. Make sure your redirect URI is registered in your StockX application',
        '4. Click "Login with StockX" to start the OAuth flow'
      ]
    }, { status: 500 });
  }

  // For OAuth flow, we don't test the API directly here
  // Instead, we provide guidance on the OAuth process
  return NextResponse.json({
    status: 'info',
    message: 'StockX OAuth2 Flow Ready',
    credentials: credentialsStatus,
    oauthFlow: true,
    flowSteps: [
      '1. User clicks "Login with StockX"',
      '2. Redirects to StockX authorization page',
      '3. User logs in with StockX credentials',
      '4. StockX redirects back with authorization code',
      '5. System exchanges code for access token',
      '6. Access token is used for API calls'
    ],
    endpoints: {
      authorization: 'https://accounts.stockx.com/authorize',
      token: 'https://accounts.stockx.com/oauth/token',
      api: 'https://api.stockx.com'
    },
    nextSteps: [
      'Click "Login with StockX" to start the OAuth flow',
      'After successful authentication, you can test the search functionality',
      'The access token will be stored securely in httpOnly cookies'
    ]
  });
} 