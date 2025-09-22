// UPS API Service - Uses OAuth access token for API calls
import { UPSOAuthService } from './upsOAuth';

export interface UPSApiConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  baseUrl: string;
}

export class UPSApiService {
  private static instance: UPSApiService;
  private oauthService: UPSOAuthService;

  private constructor() {
    this.oauthService = UPSOAuthService.getInstance();
  }

  static getInstance(): UPSApiService {
    if (!UPSApiService.instance) {
      UPSApiService.instance = new UPSApiService();
    }
    return UPSApiService.instance;
  }

  /**
   * Get a valid access token for API calls
   */
  private async getAccessToken(config: UPSApiConfig): Promise<string> {
    return await this.oauthService.getValidToken({
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      scope: config.scope,
      baseUrl: config.baseUrl
    });
  }

  /**
   * Make authenticated UPS API call
   */
  private async makeApiCall(
    endpoint: string,
    method: string,
    data: any,
    config: UPSApiConfig
  ): Promise<any> {
    const accessToken = await this.getAccessToken(config);
    
    console.log(`🚀 Making UPS API call to: ${endpoint}`);
    console.log(`- Method: ${method}`);
    console.log(`- Access Token: ${accessToken.substring(0, 20)}...`);

    const response = await fetch(`${config.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: data ? JSON.stringify(data) : undefined
    });

    console.log(`- Response Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ UPS API call failed: ${response.status} ${errorText}`);
      throw new Error(`UPS API call failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    console.log(`✅ UPS API call successful`);
    return result;
  }

  /**
   * Track a package using UPS API
   */
  async trackPackage(trackingNumber: string, config: UPSApiConfig): Promise<any> {
    console.log(`📦 Tracking UPS package: ${trackingNumber}`);
    
    const trackRequest = {
      TrackRequest: {
        Request: {
          RequestOption: "1",
          TransactionReference: {
            CustomerContext: "Resell Dashboard"
          }
        },
        InquiryNumber: trackingNumber
      }
    };

    return await this.makeApiCall(
      '/api/track/v1/details',
      'POST',
      trackRequest,
      config
    );
  }

  /**
   * Get shipping rates using UPS API
   */
  async getShippingRates(rateRequest: any, config: UPSApiConfig): Promise<any> {
    console.log(`💰 Getting UPS shipping rates`);
    
    return await this.makeApiCall(
      '/api/rating/v1/Rate',
      'POST',
      rateRequest,
      config
    );
  }

  /**
   * Create shipping label using UPS API
   */
  async createShippingLabel(shipRequest: any, config: UPSApiConfig): Promise<any> {
    console.log(`📋 Creating UPS shipping label`);
    
    return await this.makeApiCall(
      '/api/ship/v1/shipments',
      'POST',
      shipRequest,
      config
    );
  }

  /**
   * Test UPS API connection
   */
  async testConnection(config: UPSApiConfig): Promise<{
    success: boolean;
    message: string;
    tokenInfo?: any;
  }> {
    try {
      console.log('🧪 Testing UPS API connection...');
      
      // Get access token
      const accessToken = await this.getAccessToken(config);
      
      // Test with a simple API call (this would be a real UPS endpoint)
      // For now, just verify we can get a token
      
      return {
        success: true,
        message: 'UPS API connection successful',
        tokenInfo: {
          accessToken: accessToken.substring(0, 20) + '...',
          hasToken: true
        }
      };
    } catch (error) {
      console.error('❌ UPS API connection test failed:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
