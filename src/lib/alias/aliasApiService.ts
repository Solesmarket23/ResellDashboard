// Main Alias API Service - combines all services
import { AliasAuthService } from './aliasAuth';
import { AliasCatalogService } from './aliasCatalogService';
import { AliasPricingService } from './aliasPricingService';
import { AliasListingsService } from './aliasListingsService';
import { AliasOrdersService } from './aliasOrdersService';

export interface AliasApiConfig {
  bearerToken: string;
}

export class AliasApiService {
  public auth: AliasAuthService;
  public catalog: AliasCatalogService;
  public pricing: AliasPricingService;
  public listings: AliasListingsService;
  public orders: AliasOrdersService;

  constructor(config: AliasApiConfig) {
    this.auth = new AliasAuthService(config);
    this.catalog = new AliasCatalogService(this.auth);
    this.pricing = new AliasPricingService(this.auth);
    this.listings = new AliasListingsService(this.auth);
    this.orders = new AliasOrdersService(this.auth);
  }

  /**
   * Initialize the API service and test authentication
   */
  async initialize(): Promise<{ success: boolean; error?: string }> {
    try {
      const authTest = await this.auth.testAuth();
      return authTest;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update the bearer token
   */
  updateToken(newToken: string): void {
    this.auth.updateToken(newToken);
  }

  /**
   * Get service status
   */
  getStatus(): {
    hasToken: boolean;
    maskedToken: string;
  } {
    return {
      hasToken: !!this.auth,
      maskedToken: this.auth.getMaskedToken(),
    };
  }
}

// Export all types and enums for convenience
export * from './aliasConfig';
export * from './aliasAuth';
export * from './aliasBaseService';
export * from './aliasCatalogService';
export * from './aliasPricingService';
export * from './aliasListingsService';
export * from './aliasOrdersService';
