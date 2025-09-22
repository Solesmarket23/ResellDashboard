// UPS OAuth Authorization Code Flow with PKCE Support
import crypto from 'crypto';

export interface UPSOAuthToken {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  scope: string;
  client_id: string;
  refresh_token_expires_in: number;
  refresh_token_issued_at: number;
  refresh_count: string;
  status: string;
}

export interface UPSOAuthConfig {
  clientId: string;
  redirectUri: string;
  scope: string;
  baseUrl: string;
}

export class UPSOAuthService {
  private static instance: UPSOAuthService;
  private token: UPSOAuthToken | null = null;
  private tokenPromise: Promise<UPSOAuthToken> | null = null;

  private constructor() {}

  static getInstance(): UPSOAuthService {
    if (!UPSOAuthService.instance) {
      UPSOAuthService.instance = new UPSOAuthService();
    }
    return UPSOAuthService.instance;
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  generatePKCE(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    
    return { codeVerifier, codeChallenge };
  }

  /**
   * Generate authorization URL for OAuth flow
   */
  generateAuthUrl(config: UPSOAuthConfig, state?: string): { url: string; codeVerifier: string } {
    const { codeVerifier, codeChallenge } = this.generatePKCE();
    
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: config.scope,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    if (state) {
      params.append('state', state);
    }

    // Use the correct UPS OAuth authorization URL
    const oauthBaseUrl = 'https://wwwcie.ups.com';
    const url = `${oauthBaseUrl}/security/v1/oauth/authorize?${params.toString()}`;
    
    return { url, codeVerifier };
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(
    code: string,
    codeVerifier: string,
    config: UPSOAuthConfig
  ): Promise<UPSOAuthToken> {
    // Authorization Code flow uses wwwcie.ups.com
    const tokenUrl = `${config.baseUrl}/security/v1/oauth/token`;
    
    console.log(`🔐 Exchanging authorization code for UPS OAuth token at: ${tokenUrl}`);
    
    // UPS OAuth uses Basic Auth with client_id:client_secret for token exchange
    const clientSecret = process.env.UPS_CLIENT_SECRET;
    if (!clientSecret) {
      throw new Error('UPS_CLIENT_SECRET is required for token exchange');
    }
    
    const credentials = Buffer.from(`${config.clientId}:${clientSecret}`).toString('base64');
    
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: config.redirectUri,
      code_verifier: codeVerifier
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: body.toString()
    });

    console.log(`- Token Exchange Response Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ UPS OAuth token exchange failed: ${response.status} ${errorText}`);
      throw new Error(`UPS OAuth token exchange failed: ${response.status} ${errorText}`);
    }

    const tokenData = await response.json();
    console.log(`✅ UPS OAuth token exchange successful! Token type: ${tokenData.token_type}, expires in: ${tokenData.expires_in}s`);
    
    const token: UPSOAuthToken = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
      expires_at: Date.now() + (tokenData.expires_in * 1000),
      scope: tokenData.scope,
      client_id: tokenData.client_id,
      refresh_token_expires_in: parseInt(tokenData.refresh_token_expires_in),
      refresh_token_issued_at: parseInt(tokenData.refresh_token_issued_at),
      refresh_count: tokenData.refresh_count,
      status: tokenData.status
    };

    this.token = token;
    console.log('🔐 UPS OAuth token obtained successfully');
    return token;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(config: UPSOAuthConfig): Promise<UPSOAuthToken> {
    if (!this.token?.refresh_token) {
      throw new Error('No refresh token available');
    }

    const tokenUrl = `${config.baseUrl}/security/v1/oauth/refresh`;
    
    console.log(`🔄 Refreshing UPS OAuth token at: ${tokenUrl}`);
    
    // UPS OAuth uses Basic Auth with client_id:client_secret for refresh
    const clientSecret = process.env.UPS_CLIENT_SECRET;
    if (!clientSecret) {
      throw new Error('UPS_CLIENT_SECRET is required for token refresh');
    }
    
    const credentials = Buffer.from(`${config.clientId}:${clientSecret}`).toString('base64');
    
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.token.refresh_token
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: body.toString()
    });

    console.log(`- Token Refresh Response Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ UPS OAuth token refresh failed: ${response.status} ${errorText}`);
      throw new Error(`UPS OAuth token refresh failed: ${response.status} ${errorText}`);
    }

    const tokenData = await response.json();
    console.log(`✅ UPS OAuth token refresh successful! Token type: ${tokenData.token_type}, expires in: ${tokenData.expires_in}s`);
    
    const token: UPSOAuthToken = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
      expires_at: Date.now() + (tokenData.expires_in * 1000),
      scope: tokenData.scope,
      client_id: tokenData.client_id,
      refresh_token_expires_in: parseInt(tokenData.refresh_token_expires_in),
      refresh_token_issued_at: parseInt(tokenData.refresh_token_issued_at),
      refresh_count: tokenData.refresh_count,
      status: tokenData.status
    };

    this.token = token;
    console.log('🔄 UPS OAuth token refreshed successfully');
    return token;
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getValidToken(config: UPSOAuthConfig): Promise<string> {
    // If we have a valid token, return it
    if (this.token && this.isTokenValid(this.token)) {
      return this.token.access_token;
    }

    // If we're already getting a token, wait for that promise
    if (this.tokenPromise) {
      const token = await this.tokenPromise;
      return token.access_token;
    }

    // Try to refresh if we have a refresh token
    if (this.token?.refresh_token && this.isRefreshTokenValid(this.token)) {
      this.tokenPromise = this.refreshToken(config);
    } else {
      throw new Error('No valid OAuth token available. Please re-authenticate.');
    }

    try {
      const token = await this.tokenPromise;
      return token.access_token;
    } finally {
      this.tokenPromise = null;
    }
  }

  /**
   * Set token (useful for storing/loading from database)
   */
  setToken(token: UPSOAuthToken): void {
    this.token = token;
  }

  /**
   * Get current token
   */
  getToken(): UPSOAuthToken | null {
    return this.token;
  }

  /**
   * Clear token
   */
  clearToken(): void {
    this.token = null;
    this.tokenPromise = null;
  }

  private isTokenValid(token: UPSOAuthToken): boolean {
    // Add 5 minute buffer to account for clock skew
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    return Date.now() < (token.expires_at - bufferTime);
  }

  private isRefreshTokenValid(token: UPSOAuthToken): boolean {
    // Add 1 hour buffer for refresh token
    const bufferTime = 60 * 60 * 1000; // 1 hour
    const refreshExpiresAt = token.refresh_token_issued_at + (token.refresh_token_expires_in * 1000);
    return Date.now() < (refreshExpiresAt - bufferTime);
  }
}
