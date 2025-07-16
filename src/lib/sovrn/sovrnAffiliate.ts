// Sovrn Affiliate Link Generator
// This module handles the generation of Sovrn affiliate links for StockX products

interface SovrnConfig {
  apiKey: string; // Commerce API key from Sovrn account page
  enableOptimization?: boolean; // Enable sending to higher paying retailer
  customId?: string; // CUID for tracking
  utmSource?: string; // UTM tracking parameters
  utmMedium?: string;
  utmCampaign?: string;
}

export class SovrnAffiliateService {
  private config: SovrnConfig;
  
  constructor(config: SovrnConfig) {
    this.config = config;
  }
  
  /**
   * Generate an affiliate link using Sovrn's redirect API
   * @param originalUrl The original URL to monetize
   * @param customParams Optional custom parameters for this specific link
   * @returns The affiliate link
   */
  generateAffiliateLink(
    originalUrl: string, 
    customParams?: {
      cuid?: string;
      utmSource?: string;
      utmMedium?: string;
      utmCampaign?: string;
      utmTerm?: string;
      utmContent?: string;
    }
  ): string {
    // Build the redirect URL with required parameters
    const params = new URLSearchParams({
      key: this.config.apiKey,
      u: originalUrl, // URL will be automatically encoded by URLSearchParams
    });
    
    // Add optional parameters
    if (this.config.enableOptimization) {
      params.append('opt', 'true');
    }
    
    // Add custom ID (either from config or custom params)
    const cuid = customParams?.cuid || this.config.customId;
    if (cuid) {
      params.append('cuid', cuid);
    }
    
    // Add UTM parameters (custom params override config)
    const utmSource = customParams?.utmSource || this.config.utmSource;
    const utmMedium = customParams?.utmMedium || this.config.utmMedium;
    const utmCampaign = customParams?.utmCampaign || this.config.utmCampaign;
    
    if (utmSource) params.append('utm_source', utmSource);
    if (utmMedium) params.append('utm_medium', utmMedium);
    if (utmCampaign) params.append('utm_campaign', utmCampaign);
    if (customParams?.utmTerm) params.append('utm_term', customParams.utmTerm);
    if (customParams?.utmContent) params.append('utm_content', customParams.utmContent);
    
    return `https://redirect.viglink.com?${params.toString()}`;
  }
  
  /**
   * Generate affiliate link specifically for StockX products
   * Adds StockX-specific tracking parameters
   */
  generateStockXAffiliateLink(
    stockxUrl: string,
    productInfo?: {
      productName?: string;
      productId?: string;
      size?: string;
    }
  ): string {
    // Create custom ID from product info if available
    let cuid = undefined;
    if (productInfo?.productId) {
      cuid = `stockx_${productInfo.productId}`;
      if (productInfo.size) {
        cuid += `_size${productInfo.size.replace(/\s+/g, '')}`;
      }
    }
    
    return this.generateAffiliateLink(stockxUrl, {
      cuid,
      utmSource: 'reselldashboard',
      utmMedium: 'arbitrage_finder',
      utmCampaign: 'stockx_arbitrage',
      utmContent: productInfo?.productName?.substring(0, 50), // Limit length
    });
  }
  
  /**
   * Batch generate affiliate links
   * @param urls Array of original URLs
   * @returns Map of original URL to affiliate URL
   */
  generateBatchAffiliateLinks(urls: string[]): Map<string, string> {
    const linkMap = new Map<string, string>();
    
    urls.forEach(url => {
      linkMap.set(url, this.generateAffiliateLink(url));
    });
    
    return linkMap;
  }
}

// Singleton instance
let sovrnService: SovrnAffiliateService | null = null;

/**
 * Initialize the Sovrn service with configuration
 */
export function initializeSovrn(config: SovrnConfig) {
  sovrnService = new SovrnAffiliateService(config);
}

/**
 * Get the Sovrn service instance
 */
export function getSovrnService(): SovrnAffiliateService | null {
  return sovrnService;
}

/**
 * Utility function to convert StockX URL to affiliate link
 */
export function convertToAffiliateLink(stockxUrl: string): string {
  if (!sovrnService) {
    console.warn('Sovrn service not initialized');
    return stockxUrl;
  }
  
  return sovrnService.generateAffiliateLink(stockxUrl);
}

/**
 * Check if a URL is already an affiliate link
 */
export function isAffiliateLink(url: string): boolean {
  return url.includes('sovrn.co') || 
         url.includes('viglink.com') || 
         url.includes('redirect.viglink.com');
}