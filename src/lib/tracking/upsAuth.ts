// UPS OAuth2 Authentication Service
export interface UPSToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number; // Timestamp when token expires
}

export type UPSAuthMode = 'client_credentials' | 'oauth_authorization_code';

export class UPSAuthService {
  private static instance: UPSAuthService;
  private token: UPSToken | null = null;
  private tokenPromise: Promise<UPSToken> | null = null;
  private authMode: UPSAuthMode = 'client_credentials';

  private constructor() {}

  static getInstance(): UPSAuthService {
    if (!UPSAuthService.instance) {
      UPSAuthService.instance = new UPSAuthService();
    }
    return UPSAuthService.instance;
  }

  /**
   * Set authentication mode
   */
  setAuthMode(mode: UPSAuthMode): void {
    this.authMode = mode;
    // Clear existing token when switching modes
    this.clearToken();
  }

  /**
   * Get current authentication mode
   */
  getAuthMode(): UPSAuthMode {
    return this.authMode;
  }

  async getValidToken(): Promise<UPSToken> {
    // If we have a valid token, return it
    if (this.token && this.isTokenValid(this.token)) {
      return this.token;
    }

    // If we're already getting a token, wait for that promise
    if (this.tokenPromise) {
      return this.tokenPromise;
    }

    // Start getting a new token based on auth mode
    this.tokenPromise = this.authenticate();
    
    try {
      const token = await this.tokenPromise;
      this.token = token;
      return token;
    } finally {
      this.tokenPromise = null;
    }
  }

  private async authenticate(): Promise<UPSToken> {
    if (this.authMode === 'client_credentials') {
      return this.authenticateClientCredentials();
    } else {
      throw new Error('OAuth Authorization Code flow requires separate OAuth service. Use UPSOAuthService for OAuth flow.');
    }
  }

  private async authenticateClientCredentials(): Promise<UPSToken> {
    const clientId = process.env.UPS_CLIENT_ID;
    const clientSecret = process.env.UPS_CLIENT_SECRET;
    const accountNumber = process.env.UPS_ACCOUNT_NUMBER;
    // Client Credentials flow uses onlinetools.ups.com
    const baseUrl = process.env.UPS_CLIENT_CREDENTIALS_BASE_URL || 'https://onlinetools.ups.com';

    if (!clientId || !clientSecret || !accountNumber) {
      throw new Error('UPS API credentials not configured (need CLIENT_ID, CLIENT_SECRET, and ACCOUNT_NUMBER)');
    }

    const authUrl = `${baseUrl}/security/v1/oauth/token`;
    
    console.log(`🔐 Authenticating with UPS OAuth (Client Credentials) at: ${authUrl}`);
    console.log(`- Using Client ID: ${clientId.substring(0, 8)}...`);
    console.log(`- Using Account Number: ${accountNumber}`);
    
    // UPS uses Basic Auth with client_id:client_secret and account number in header
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const response = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
        'x-merchant-id': accountNumber
      },
      body: 'grant_type=client_credentials'
    });

    console.log(`- Auth Response Status: ${response.status}`);
    console.log(`- Auth Response Headers:`, Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ UPS OAuth failed: ${response.status} ${errorText}`);
      throw new Error(`UPS authentication failed: ${response.status} ${errorText}`);
    }

    const tokenData = await response.json();
    console.log(`✅ UPS OAuth successful! Token type: ${tokenData.token_type}, expires in: ${tokenData.expires_in}s`);
    
    const token: UPSToken = {
      access_token: tokenData.access_token,
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
      expires_at: Date.now() + (tokenData.expires_in * 1000)
    };

    console.log('🔐 UPS token obtained successfully');
    return token;
  }

  private isTokenValid(token: UPSToken): boolean {
    // Add 5 minute buffer to account for clock skew
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    return Date.now() < (token.expires_at - bufferTime);
  }

  // Clear token (useful for testing or when credentials change)
  clearToken(): void {
    this.token = null;
    this.tokenPromise = null;
  }
}
