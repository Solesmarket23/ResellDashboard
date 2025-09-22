// UPS OAuth Integration Service - Handles token storage and refresh
import { UPSOAuthService, UPSOAuthToken, UPSOAuthConfig } from './upsOAuth';

export interface UPSOAuthUser {
  id: string;
  email?: string;
  name?: string;
  upsAccountNumber?: string;
  token: UPSOAuthToken;
  createdAt: Date;
  updatedAt: Date;
}

export class UPSOAuthIntegrationService {
  private static instance: UPSOAuthIntegrationService;
  private oauthService: UPSOAuthService;
  private userTokens: Map<string, UPSOAuthUser> = new Map();

  private constructor() {
    this.oauthService = UPSOAuthService.getInstance();
  }

  static getInstance(): UPSOAuthIntegrationService {
    if (!UPSOAuthIntegrationService.instance) {
      UPSOAuthIntegrationService.instance = new UPSOAuthIntegrationService();
    }
    return UPSOAuthIntegrationService.instance;
  }

  /**
   * Store OAuth token for a user
   */
  async storeUserToken(userId: string, token: UPSOAuthToken, userInfo?: {
    email?: string;
    name?: string;
    upsAccountNumber?: string;
  }): Promise<void> {
    const user: UPSOAuthUser = {
      id: userId,
      email: userInfo?.email,
      name: userInfo?.name,
      upsAccountNumber: userInfo?.upsAccountNumber,
      token,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.userTokens.set(userId, user);
    
    // In production, you would store this in your database
    // For now, we'll store in memory
    console.log(`🔐 Stored UPS OAuth token for user: ${userId}`);
  }

  /**
   * Get valid access token for a user
   */
  async getUserAccessToken(userId: string): Promise<string | null> {
    const user = this.userTokens.get(userId);
    if (!user) {
      console.log(`❌ No OAuth token found for user: ${userId}`);
      return null;
    }

    try {
      const config = this.getOAuthConfig();
      this.oauthService.setToken(user.token);
      
      const accessToken = await this.oauthService.getValidToken(config);
      
      // Update stored token if it was refreshed
      const currentToken = this.oauthService.getToken();
      if (currentToken && currentToken !== user.token) {
        user.token = currentToken;
        user.updatedAt = new Date();
        this.userTokens.set(userId, user);
      }

      return accessToken;
    } catch (error) {
      console.error(`❌ Failed to get access token for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Refresh token for a user
   */
  async refreshUserToken(userId: string): Promise<boolean> {
    const user = this.userTokens.get(userId);
    if (!user) {
      console.log(`❌ No OAuth token found for user: ${userId}`);
      return false;
    }

    try {
      const config = this.getOAuthConfig();
      this.oauthService.setToken(user.token);
      
      const newToken = await this.oauthService.refreshToken(config);
      
      user.token = newToken;
      user.updatedAt = new Date();
      this.userTokens.set(userId, user);
      
      console.log(`🔄 Refreshed UPS OAuth token for user: ${userId}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to refresh token for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Remove user token
   */
  removeUserToken(userId: string): void {
    this.userTokens.delete(userId);
    console.log(`🗑️ Removed UPS OAuth token for user: ${userId}`);
  }

  /**
   * Get user OAuth info
   */
  getUserInfo(userId: string): UPSOAuthUser | null {
    return this.userTokens.get(userId) || null;
  }

  /**
   * List all users with OAuth tokens
   */
  getAllUsers(): UPSOAuthUser[] {
    return Array.from(this.userTokens.values());
  }

  /**
   * Check if user has valid OAuth token
   */
  hasValidToken(userId: string): boolean {
    const user = this.userTokens.get(userId);
    if (!user) return false;

    // Check if access token is still valid
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    return Date.now() < (user.token.expires_at - bufferTime);
  }

  /**
   * Get OAuth configuration from environment
   */
  private getOAuthConfig(): UPSOAuthConfig {
    const clientId = process.env.UPS_OAUTH_CLIENT_ID;
    const redirectUri = process.env.UPS_OAUTH_REDIRECT_URI;
    const scope = process.env.UPS_OAUTH_SCOPE || 'ups.track ups.ship';
    const baseUrl = process.env.UPS_BASE_URL || 'https://wwwcie.ups.com';

    if (!clientId || !redirectUri) {
      throw new Error('UPS OAuth not configured (need UPS_OAUTH_CLIENT_ID and UPS_OAUTH_REDIRECT_URI)');
    }

    return {
      clientId,
      redirectUri,
      scope,
      baseUrl
    };
  }

  /**
   * Generate authorization URL for a user
   */
  generateAuthUrl(userId: string): { url: string; codeVerifier: string } {
    const config = this.getOAuthConfig();
    const state = `user_${userId}_${Date.now()}`;
    
    return this.oauthService.generateAuthUrl(config, state);
  }

  /**
   * Process OAuth callback and store token
   */
  async processCallback(
    code: string,
    codeVerifier: string,
    userId: string,
    userInfo?: {
      email?: string;
      name?: string;
      upsAccountNumber?: string;
    }
  ): Promise<UPSOAuthToken> {
    const config = this.getOAuthConfig();
    const token = await this.oauthService.exchangeCodeForToken(code, codeVerifier, config);
    
    await this.storeUserToken(userId, token, userInfo);
    
    return token;
  }

  /**
   * Clean up expired tokens
   */
  cleanupExpiredTokens(): void {
    const now = Date.now();
    const expiredUsers: string[] = [];

    for (const [userId, user] of this.userTokens.entries()) {
      // Check if both access and refresh tokens are expired
      const accessExpired = now > user.token.expires_at;
      const refreshExpired = now > (user.token.refresh_token_issued_at + (user.token.refresh_token_expires_in * 1000));
      
      if (accessExpired && refreshExpired) {
        expiredUsers.push(userId);
      }
    }

    expiredUsers.forEach(userId => {
      this.removeUserToken(userId);
      console.log(`🧹 Cleaned up expired token for user: ${userId}`);
    });
  }
}
