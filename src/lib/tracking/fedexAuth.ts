// FedEx OAuth2 Authentication Service
// FedEx auth has IP-level thresholds (burst 3/sec for 5s, avg 1/sec for 2 min). We request a token
// once and reuse it until near expiry (5-min buffer) to stay under thresholds.
export interface FedExToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  expires_at: number; // Timestamp when token expires
}

export class FedExAuthService {
  private static instance: FedExAuthService;
  private token: FedExToken | null = null;
  private tokenPromise: Promise<FedExToken> | null = null;

  private constructor() {}

  static getInstance(): FedExAuthService {
    if (!FedExAuthService.instance) {
      FedExAuthService.instance = new FedExAuthService();
    }
    return FedExAuthService.instance;
  }

  async getValidToken(): Promise<FedExToken> {
    // If we have a valid token, return it
    if (this.token && this.isTokenValid(this.token)) {
      return this.token;
    }

    // If we're already getting a token, wait for that promise
    if (this.tokenPromise) {
      return this.tokenPromise;
    }

    // Start getting a new token
    this.tokenPromise = this.authenticate();
    
    try {
      const token = await this.tokenPromise;
      this.token = token;
      return token;
    } finally {
      this.tokenPromise = null;
    }
  }

  private async authenticate(): Promise<FedExToken> {
    const apiKey = process.env.FEDEX_API_KEY;
    const secretKey = process.env.FEDEX_SECRET_KEY;
    const baseUrl = process.env.FEDEX_BASE_URL || 'https://apis.fedex.com';

    if (!apiKey || !secretKey) {
      throw new Error('FedEx API credentials not configured');
    }

    const authUrl = `${baseUrl}/oauth/token`;
    
    console.log(`🔐 Authenticating with FedEx OAuth at: ${authUrl}`);
    console.log(`- Using API Key: ${apiKey.substring(0, 8)}...`);
    console.log(`- Using Secret Key: ${secretKey.substring(0, 8)}...`);
    
    // Use the correct FedEx OAuth format from official documentation
    // FedEx requires form-encoded body parameters, not Basic Auth
    const response = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`
    });

    console.log(`- Auth Response Status: ${response.status}`);
    console.log(`- Auth Response Headers:`, Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ FedEx OAuth failed: ${response.status} ${errorText}`);
      throw new Error(`FedEx authentication failed: ${response.status} ${errorText}`);
    }

    const tokenData = await response.json();
    console.log(`✅ FedEx OAuth successful! Token type: ${tokenData.token_type}, expires in: ${tokenData.expires_in}s`);
    
    const token: FedExToken = {
      access_token: tokenData.access_token,
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
      scope: tokenData.scope,
      expires_at: Date.now() + (tokenData.expires_in * 1000)
    };

    console.log('🔐 FedEx token obtained successfully');
    return token;
  }

  private isTokenValid(token: FedExToken): boolean {
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
