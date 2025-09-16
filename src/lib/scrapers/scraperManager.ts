import { TrackingInfo } from '../tracking/trackingService';
import { fedexScraper } from './fedexScraper';
import { fedexPuppeteerScraper } from './fedexPuppeteerScraper';

// Scraper manager for handling multiple scraping strategies
export class ScraperManager {
  private scrapers = new Map<string, any>();
  private fallbackOrder = ['puppeteer', 'fetch'];
  private retryAttempts = 3;
  private retryDelay = 2000; // 2 seconds
  
  constructor() {
    // Register available scrapers
    this.scrapers.set('fedex', {
      fetch: fedexScraper,
      puppeteer: fedexPuppeteerScraper
    });
    
    // Add more carriers as needed
    // this.scrapers.set('ups', { fetch: upsScraper, puppeteer: upsPuppeteerScraper });
    // this.scrapers.set('usps', { fetch: uspsScraper, puppeteer: uspsPuppeteerScraper });
  }
  
  async getTrackingInfo(trackingNumber: string, carrier?: string, strategy?: string): Promise<TrackingInfo> {
    const detectedCarrier = carrier || this.detectCarrier(trackingNumber);
    const scraperGroup = this.scrapers.get(detectedCarrier.toLowerCase());
    
    if (!scraperGroup) {
      return {
        trackingNumber,
        carrier: detectedCarrier,
        status: 'unknown',
        lastUpdate: new Date().toISOString(),
        updates: [],
        error: `No scraper available for carrier: ${detectedCarrier}`
      };
    }
    
    // Try different strategies in order
    const strategies = strategy ? [strategy] : this.fallbackOrder;
    
    for (const strategyName of strategies) {
      const scraper = scraperGroup[strategyName];
      
      if (!scraper) {
        console.log(`⚠️ Scraper strategy '${strategyName}' not available for ${detectedCarrier}`);
        continue;
      }
      
      console.log(`🔍 Trying ${strategyName} scraper for ${detectedCarrier} tracking: ${trackingNumber}`);
      
      try {
        const result = await this.retryWithBackoff(
          () => scraper.getTrackingInfo(trackingNumber),
          this.retryAttempts,
          this.retryDelay
        );
        
        if (result && !result.error) {
          console.log(`✅ ${strategyName} scraper succeeded for ${trackingNumber}`);
          return result;
        } else {
          console.log(`⚠️ ${strategyName} scraper returned error: ${result?.error}`);
        }
        
      } catch (error) {
        console.error(`❌ ${strategyName} scraper failed for ${trackingNumber}:`, error);
      }
    }
    
    // All strategies failed
    return {
      trackingNumber,
      carrier: detectedCarrier,
      status: 'unknown',
      lastUpdate: new Date().toISOString(),
      updates: [],
      error: 'All scraping strategies failed'
    };
  }
  
  private detectCarrier(trackingNumber: string): string {
    // UPS tracking numbers start with 1Z and are 18 characters
    if (/^1Z[0-9A-Z]{16}$/i.test(trackingNumber)) {
      return 'UPS';
    }
    
    // FedEx tracking numbers are typically 12-15 digits
    if (/^[0-9]{12,15}$/.test(trackingNumber)) {
      return 'FedEx';
    }
    
    // USPS tracking numbers start with 9 and are 20-22 characters
    if (/^9[0-9]{19,21}$/.test(trackingNumber)) {
      return 'USPS';
    }
    
    // DHL tracking numbers are typically 10 characters
    if (/^[0-9]{10}$/.test(trackingNumber)) {
      return 'DHL';
    }
    
    // Default to FedEx for unknown formats
    return 'FedEx';
  }
  
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxAttempts: number,
    delay: number
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxAttempts) {
          throw lastError;
        }
        
        const backoffDelay = delay * Math.pow(2, attempt - 1);
        console.log(`⏳ Retry attempt ${attempt}/${maxAttempts} in ${backoffDelay}ms`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
    
    throw lastError!;
  }
  
  // Get available scrapers for a carrier
  getAvailableScrapers(carrier: string): string[] {
    const scraperGroup = this.scrapers.get(carrier.toLowerCase());
    return scraperGroup ? Object.keys(scraperGroup) : [];
  }
  
  // Get all available carriers
  getAvailableCarriers(): string[] {
    return Array.from(this.scrapers.keys());
  }
  
  // Get scraper status
  getScraperStatus(carrier: string, strategy: string): any {
    const scraperGroup = this.scrapers.get(carrier.toLowerCase());
    if (!scraperGroup || !scraperGroup[strategy]) {
      return null;
    }
    
    const scraper = scraperGroup[strategy];
    
    // Get rate limit status if available
    if (scraper.getRateLimitStatus) {
      return scraper.getRateLimitStatus();
    }
    
    return { status: 'available' };
  }
  
  // Reset rate limits for all scrapers
  resetRateLimits(): void {
    for (const [carrier, scraperGroup] of this.scrapers) {
      for (const [strategy, scraper] of Object.entries(scraperGroup)) {
        if (scraper.resetRateLimit) {
          scraper.resetRateLimit();
          console.log(`🔄 Reset rate limit for ${carrier} ${strategy} scraper`);
        }
      }
    }
  }
  
  // Test all scrapers with a tracking number
  async testAllScrapers(trackingNumber: string, carrier?: string): Promise<{ [strategy: string]: TrackingInfo }> {
    const results: { [strategy: string]: TrackingInfo } = {};
    const detectedCarrier = carrier || this.detectCarrier(trackingNumber);
    const scraperGroup = this.scrapers.get(detectedCarrier.toLowerCase());
    
    if (!scraperGroup) {
      return { error: `No scrapers available for carrier: ${detectedCarrier}` };
    }
    
    for (const [strategy, scraper] of Object.entries(scraperGroup)) {
      try {
        console.log(`🧪 Testing ${strategy} scraper for ${trackingNumber}`);
        const result = await scraper.getTrackingInfo(trackingNumber);
        results[strategy] = result;
      } catch (error) {
        results[strategy] = {
          trackingNumber,
          carrier: detectedCarrier,
          status: 'unknown',
          lastUpdate: new Date().toISOString(),
          updates: [],
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
    
    return results;
  }
}

// Export singleton instance
export const scraperManager = new ScraperManager();
