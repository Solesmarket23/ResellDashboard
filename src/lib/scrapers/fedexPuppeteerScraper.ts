import { TrackingInfo, TrackingUpdate } from '../tracking/trackingService';

// Advanced FedEx scraper using Puppeteer for JavaScript-heavy pages
export class FedExPuppeteerScraper {
  private baseUrl = 'https://www.fedex.com/fedextrack';
  private userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  
  // Rate limiting
  private requestCount = 0;
  private lastRequestTime = 0;
  private readonly rateLimitDelay = 3000; // 3 seconds between requests
  
  async getTrackingInfo(trackingNumber: string): Promise<TrackingInfo> {
    let browser;
    
    try {
      // Rate limiting
      await this.enforceRateLimit();
      
      console.log(`🔍 Puppeteer scraping FedEx tracking: ${trackingNumber}`);
      
      // Import puppeteer dynamically to avoid SSR issues
      let puppeteer;
      try {
        puppeteer = await import('puppeteer');
      } catch (importError) {
        console.warn('⚠️ Puppeteer not available, falling back to fetch scraper');
        throw new Error('Puppeteer not available');
      }
      
      // Launch browser
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });
      
      const page = await browser.newPage();
      
      // Set user agent and viewport
      await page.setUserAgent(this.userAgent);
      await page.setViewport({ width: 1920, height: 1080 });
      
      // Navigate to FedEx tracking page
      const url = `${this.baseUrl}?trknbr=${encodeURIComponent(trackingNumber)}`;
      console.log(`📡 Navigating to: ${url}`);
      
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
      // Wait for tracking data to load
      await this.waitForTrackingData(page);
      
      // Extract tracking information
      const trackingData = await this.extractTrackingData(page, trackingNumber);
      
      return trackingData;
      
    } catch (error) {
      console.error(`❌ FedEx Puppeteer scraping error for ${trackingNumber}:`, error);
      
      return {
        trackingNumber,
        carrier: 'FedEx',
        status: 'unknown',
        lastUpdate: new Date().toISOString(),
        updates: [],
        error: error instanceof Error ? error.message : 'Unknown scraping error'
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
  
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      console.log(`⏳ Rate limiting: waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
    this.requestCount++;
  }
  
  private async waitForTrackingData(page: any): Promise<void> {
    try {
      // Wait for common tracking elements to appear
      await Promise.race([
        page.waitForSelector('[data-testid="tracking-status"]', { timeout: 10000 }),
        page.waitForSelector('.tracking-status', { timeout: 10000 }),
        page.waitForSelector('[class*="status"]', { timeout: 10000 }),
        page.waitForSelector('.tracking-details', { timeout: 10000 }),
        page.waitForSelector('[class*="tracking"]', { timeout: 10000 })
      ]);
      
      // Additional wait for dynamic content
      await page.waitForTimeout(2000);
      
    } catch (error) {
      console.log('⚠️ Could not find tracking elements, proceeding anyway');
    }
  }
  
  private async extractTrackingData(page: any, trackingNumber: string): Promise<TrackingInfo> {
    try {
      // Extract tracking information using page.evaluate
      const trackingData = await page.evaluate(() => {
        const data: any = {
          status: 'unknown',
          estimatedDelivery: null,
          actualDelivery: null,
          origin: null,
          destination: null,
          events: []
        };
        
        // Try to extract status from various possible selectors
        const statusSelectors = [
          '[data-testid="tracking-status"]',
          '.tracking-status',
          '[class*="status"]',
          '.delivery-status',
          '.package-status'
        ];
        
        for (const selector of statusSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent) {
            data.status = element.textContent.trim();
            break;
          }
        }
        
        // Try to extract estimated delivery date
        const deliverySelectors = [
          '[data-testid="estimated-delivery"]',
          '.estimated-delivery',
          '.delivery-date',
          '.expected-delivery',
          '[class*="delivery"]'
        ];
        
        for (const selector of deliverySelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent) {
            data.estimatedDelivery = element.textContent.trim();
            break;
          }
        }
        
        // Try to extract tracking events
        const eventSelectors = [
          '.tracking-events',
          '.tracking-timeline',
          '.tracking-history',
          '[class*="event"]',
          '[class*="timeline"]'
        ];
        
        for (const selector of eventSelectors) {
          const container = document.querySelector(selector);
          if (container) {
            const eventElements = container.querySelectorAll('li, .event, .timeline-item, [class*="event"]');
            
            data.events = Array.from(eventElements).map((eventEl: any) => {
              const timeEl = eventEl.querySelector('time, .time, .date, [class*="time"], [class*="date"]');
              const locationEl = eventEl.querySelector('.location, .city, [class*="location"]');
              const statusEl = eventEl.querySelector('.status, .event-type, [class*="status"]');
              const descriptionEl = eventEl.querySelector('.description, .message, [class*="description"], [class*="message"]');
              
              return {
                timestamp: timeEl ? timeEl.textContent.trim() : new Date().toISOString(),
                location: locationEl ? locationEl.textContent.trim() : 'Unknown',
                status: statusEl ? statusEl.textContent.trim() : 'Unknown',
                description: descriptionEl ? descriptionEl.textContent.trim() : 'Status update'
              };
            });
            
            if (data.events.length > 0) break;
          }
        }
        
        // Try to extract origin and destination
        const originEl = document.querySelector('.origin, .from, [class*="origin"]');
        if (originEl) {
          data.origin = originEl.textContent.trim();
        }
        
        const destinationEl = document.querySelector('.destination, .to, [class*="destination"]');
        if (destinationEl) {
          data.destination = destinationEl.textContent.trim();
        }
        
        // Try to extract from JSON-LD or other structured data
        const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of jsonLdScripts) {
          try {
            const jsonData = JSON.parse(script.textContent || '');
            if (jsonData['@type'] === 'ParcelDelivery' || jsonData.trackingNumber) {
              if (jsonData.deliveryStatus) data.status = jsonData.deliveryStatus;
              if (jsonData.expectedDeliveryTime) data.estimatedDelivery = jsonData.expectedDeliveryTime;
              if (jsonData.originAddress) data.origin = jsonData.originAddress;
              if (jsonData.deliveryAddress) data.destination = jsonData.deliveryAddress;
            }
          } catch (e) {
            // Ignore JSON parsing errors
          }
        }
        
        return data;
      });
      
      // Map FedEx status to our delivery status
      const deliveryStatus = this.mapFedExStatus(trackingData.status);
      
      // Create tracking updates
      const updates: TrackingUpdate[] = trackingData.events.map((event: any) => ({
        timestamp: this.parseDate(event.timestamp),
        location: event.location,
        status: this.mapFedExStatus(event.status),
        description: event.description,
        details: event.details
      }));
      
      return {
        trackingNumber,
        carrier: 'FedEx',
        status: deliveryStatus,
        estimatedDelivery: trackingData.estimatedDelivery ? this.parseDate(trackingData.estimatedDelivery) : undefined,
        actualDelivery: deliveryStatus === 'delivered' ? this.parseDate(trackingData.estimatedDelivery || new Date().toISOString()) : undefined,
        origin: trackingData.origin,
        destination: trackingData.destination,
        lastUpdate: updates.length > 0 ? updates[0].timestamp : new Date().toISOString(),
        updates: updates
      };
      
    } catch (error) {
      console.error('❌ Error extracting tracking data:', error);
      throw error;
    }
  }
  
  private mapFedExStatus(fedexStatus: string): string {
    const statusMap: { [key: string]: string } = {
      'PICKED_UP': 'shipped',
      'IN_TRANSIT': 'in_transit',
      'OUT_FOR_DELIVERY': 'out_for_delivery',
      'DELIVERED': 'delivered',
      'EXCEPTION': 'exception',
      'DELAYED': 'exception',
      'RETURNED': 'exception',
      'Picked up': 'shipped',
      'In transit': 'in_transit',
      'Out for delivery': 'out_for_delivery',
      'Delivered': 'delivered',
      'Exception': 'exception',
      'Delayed': 'exception',
      'Package picked up': 'shipped',
      'Package in transit': 'in_transit',
      'Package out for delivery': 'out_for_delivery',
      'Package delivered': 'delivered'
    };
    
    return statusMap[fedexStatus] || 'unknown';
  }
  
  private parseDate(dateString: string): string {
    if (!dateString) return new Date().toISOString();
    
    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
      
      // Try parsing common FedEx date formats
      const commonFormats = [
        /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s+(AM|PM)/i,
        /(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/,
        /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
        /(\d{4})-(\d{2})-(\d{2})/
      ];
      
      for (const format of commonFormats) {
        const match = dateString.match(format);
        if (match) {
          let year, month, day, hour = 0, minute = 0, second = 0;
          
          if (format === commonFormats[0]) { // MM/DD/YYYY HH:MM AM/PM
            month = parseInt(match[1]) - 1;
            day = parseInt(match[2]);
            year = parseInt(match[3]);
            hour = parseInt(match[4]);
            minute = parseInt(match[5]);
            if (match[6].toUpperCase() === 'PM' && hour !== 12) hour += 12;
            if (match[6].toUpperCase() === 'AM' && hour === 12) hour = 0;
          } else if (format === commonFormats[1]) { // YYYY-MM-DD HH:MM:SS
            year = parseInt(match[1]);
            month = parseInt(match[2]) - 1;
            day = parseInt(match[3]);
            hour = parseInt(match[4]);
            minute = parseInt(match[5]);
            second = parseInt(match[6]);
          } else if (format === commonFormats[2]) { // MM/DD/YYYY
            month = parseInt(match[1]) - 1;
            day = parseInt(match[2]);
            year = parseInt(match[3]);
          } else if (format === commonFormats[3]) { // YYYY-MM-DD
            year = parseInt(match[1]);
            month = parseInt(match[2]) - 1;
            day = parseInt(match[3]);
          }
          
          const parsedDate = new Date(year, month, day, hour, minute, second);
          if (!isNaN(parsedDate.getTime())) {
            return parsedDate.toISOString();
          }
        }
      }
      
      return new Date().toISOString();
      
    } catch (error) {
      console.error('Error parsing date:', dateString, error);
      return new Date().toISOString();
    }
  }
  
  // Get current rate limit status
  getRateLimitStatus() {
    return {
      requestCount: this.requestCount,
      lastRequestTime: this.lastRequestTime,
      rateLimitDelay: this.rateLimitDelay
    };
  }
  
  // Reset rate limit counter
  resetRateLimit() {
    this.requestCount = 0;
    this.lastRequestTime = 0;
  }
}

// Export singleton instance
export const fedexPuppeteerScraper = new FedExPuppeteerScraper();
