// Generate eBay application token from App ID and Cert ID
export async function getEbayApplicationToken(appId: string, certId: string): Promise<string | null> {
  try {
    const credentials = `${appId}:${certId}`;
    const encodedCredentials = Buffer.from(credentials).toString('base64');
    
    console.log(`🔐 eBay credentials: App ID length ${appId.length}, Cert ID length ${certId.length}`);
    
    const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${encodedCredentials}`
      },
      body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope'
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ eBay token error:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    console.log('✅ eBay token generated successfully');
    return data.access_token;
  } catch (error) {
    console.error('❌ eBay token generation error:', error);
    return null;
  }
}
