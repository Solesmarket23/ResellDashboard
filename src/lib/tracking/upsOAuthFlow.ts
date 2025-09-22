// UPS OAuth Flow Service - Follows UPS step-by-step implementation guide
import { UPSOAuthService } from './upsOAuth';

export interface UPSOAuthFlowConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  baseUrl: string;
}

export class UPSOAuthFlowService {
  private static instance: UPSOAuthFlowService;
  private oauthService: UPSOAuthService;

  private constructor() {
    this.oauthService = UPSOAuthService.getInstance();
  }

  static getInstance(): UPSOAuthFlowService {
    if (!UPSOAuthFlowService.instance) {
      UPSOAuthFlowService.instance = new UPSOAuthFlowService();
    }
    return UPSOAuthFlowService.instance;
  }

  /**
   * Step 1: Initiate OAuth flow - Get authorization URL
   * This follows UPS specification exactly
   */
  async initiateOAuthFlow(config: UPSOAuthFlowConfig, state?: string): Promise<{
    authorizationUrl: string;
    state: string;
    codeVerifier: string;
  }> {
    const { codeVerifier, codeChallenge } = this.oauthService.generatePKCE();
    const finalState = state || this.generateState();
    
    // Step 1: Call UPS OAuth authorize endpoint
    const authUrl = `${config.baseUrl}/security/v1/oauth/authorize?` + new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      state: finalState,
      scope: config.scope,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    }).toString();

    console.log('🔐 Step 1: Initiating UPS OAuth flow');
    console.log(`- Authorization URL: ${authUrl}`);
    console.log(`- State: ${finalState}`);
    console.log(`- Code Verifier: ${codeVerifier.substring(0, 10)}...`);

    // Step 2: Make the initial request to get the redirect to lasso/signin
    try {
      const response = await fetch(authUrl, {
        method: 'GET',
        redirect: 'manual' // Don't follow redirects automatically
      });

      console.log(`- Response Status: ${response.status}`);
      console.log(`- Response Headers:`, Object.fromEntries(response.headers.entries()));

      if (response.status === 302) {
        const location = response.headers.get('location');
        const appname = response.headers.get('appname');
        const displayname = response.headers.get('displayname');

        console.log('✅ Step 2: Received redirect to UPS login');
        console.log(`- Location: ${location}`);
        console.log(`- App Name: ${appname}`);
        console.log(`- Display Name: ${displayname}`);

        if (location) {
          // Return the final login URL that the user should be redirected to
          return {
            authorizationUrl: location,
            state: finalState,
            codeVerifier
          };
        }
      }

      throw new Error(`Unexpected response status: ${response.status}`);
    } catch (error) {
      console.error('❌ Step 1-2 failed:', error);
      throw new Error(`Failed to initiate OAuth flow: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Step 3: Handle callback and exchange code for token
   * This follows UPS specification for token exchange
   */
  async handleCallback(
    code: string,
    codeVerifier: string,
    config: UPSOAuthFlowConfig
  ): Promise<any> {
    console.log('🔐 Step 3: Handling OAuth callback');
    console.log(`- Code: ${code.substring(0, 10)}...`);
    console.log(`- Code Verifier: ${codeVerifier.substring(0, 10)}...`);

    // Use the existing OAuth service for token exchange
    return await this.oauthService.exchangeCodeForToken(code, codeVerifier, {
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      scope: config.scope,
      baseUrl: config.baseUrl
    });
  }

  /**
   * Step 4: Refresh access token
   * This follows UPS specification for token refresh
   */
  async refreshAccessToken(config: UPSOAuthFlowConfig): Promise<any> {
    console.log('🔄 Step 4: Refreshing access token');
    
    return await this.oauthService.refreshToken({
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      scope: config.scope,
      baseUrl: config.baseUrl
    });
  }

  /**
   * Complete OAuth flow test
   */
  async testOAuthFlow(config: UPSOAuthFlowConfig): Promise<{
    step1: any;
    step2: any;
    step3: any;
    step4: any;
  }> {
    console.log('🧪 Testing complete UPS OAuth flow...');

    try {
      // Step 1-2: Initiate flow and get login URL
      const step1 = await this.initiateOAuthFlow(config, 'test-state');
      console.log('✅ Step 1-2 completed');

      // Note: Steps 3-4 would require actual user interaction
      // This is just to test the configuration
      return {
        step1,
        step2: { message: 'User would be redirected to UPS login' },
        step3: { message: 'Requires actual authorization code from callback' },
        step4: { message: 'Requires valid refresh token' }
      };
    } catch (error) {
      console.error('❌ OAuth flow test failed:', error);
      throw error;
    }
  }

  private generateState(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}
