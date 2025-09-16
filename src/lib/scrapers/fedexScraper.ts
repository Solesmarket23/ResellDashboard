import { TrackingInfo, TrackingUpdate } from '../tracking/trackingService';

// FedEx scraper for live tracking data
export class FedExScraper {
  private baseUrl = 'https://www.fedex.com/fedextrack';
  private userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  
  // Track rate limiting
  private requestCount = 0;
  private lastRequestTime = 0;
  private readonly rateLimitDelay = 2000; // 2 seconds between requests
  
  async getTrackingInfo(trackingNumber: string): Promise<TrackingInfo> {
    try {
      // Rate limiting
      await this.enforceRateLimit();
      
      console.log(`🔍 Scraping FedEx tracking: ${trackingNumber}`);
      
      // Step 1: Get the tracking page
      const trackingPage = await this.getTrackingPage(trackingNumber);
      
      // Step 2: Extract tracking data
      const trackingData = await this.extractTrackingData(trackingPage, trackingNumber);
      
      return trackingData;
      
    } catch (error) {
      console.error(`❌ FedEx scraping error for ${trackingNumber}:`, error);
      
      return {
        trackingNumber,
        carrier: 'FedEx',
        status: 'unknown',
        lastUpdate: new Date().toISOString(),
        updates: [],
        error: error instanceof Error ? error.message : 'Unknown scraping error'
      };
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
  
  private async getTrackingPage(trackingNumber: string): Promise<string> {
    const url = `${this.baseUrl}?trknbr=${encodeURIComponent(trackingNumber)}`;
    
    console.log(`📡 Fetching FedEx page: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    console.log(`✅ FedEx page fetched: ${html.length} characters`);
    
    return html;
  }
  
  private async extractTrackingData(html: string, trackingNumber: string): Promise<TrackingInfo> {
    try {
      // Parse the HTML to extract tracking information
      const trackingData = this.parseTrackingHTML(html);
      
      // Map FedEx status to our delivery status
      const deliveryStatus = this.mapFedExStatus(trackingData.status);
      
      // Create tracking updates
      const updates: TrackingUpdate[] = trackingData.events.map(event => ({
        timestamp: event.timestamp,
        location: event.location,
        status: event.status,
        description: event.description,
        details: event.details
      }));
      
      return {
        trackingNumber,
        carrier: 'FedEx',
        status: deliveryStatus,
        estimatedDelivery: trackingData.estimatedDelivery,
        actualDelivery: trackingData.actualDelivery,
        origin: trackingData.origin,
        destination: trackingData.destination,
        lastUpdate: updates.length > 0 ? updates[0].timestamp : new Date().toISOString(),
        updates: updates
      };
      
    } catch (error) {
      console.error('❌ Error parsing FedEx HTML:', error);
      throw error;
    }
  }
  
  private parseTrackingHTML(html: string): any {
    // This is a simplified parser - in production, you'd use a proper HTML parser
    const trackingData = {
      status: 'unknown',
      estimatedDelivery: null,
      actualDelivery: null,
      origin: null,
      destination: null,
      events: []
    };
    
    try {
      // Extract status from various possible locations in the HTML
      const statusPatterns = [
        /"status":"([^"]+)"/g,
        /"deliveryStatus":"([^"]+)"/g,
        /"currentStatus":"([^"]+)"/g,
        /class="[^"]*status[^"]*"[^>]*>([^<]+)</g,
        /<span[^>]*class="[^"]*status[^"]*"[^>]*>([^<]+)</g
      ];
      
      for (const pattern of statusPatterns) {
        const match = pattern.exec(html);
        if (match && match[1]) {
          trackingData.status = match[1].trim();
          break;
        }
      }
      
      // Extract estimated delivery date
      const deliveryPatterns = [
        /"estimatedDelivery":"([^"]+)"/g,
        /"deliveryDate":"([^"]+)"/g,
        /"expectedDelivery":"([^"]+)"/g,
        /Estimated delivery[^>]*>([^<]+)</g,
        /Expected delivery[^>]*>([^<]+)</g
      ];
      
      for (const pattern of deliveryPatterns) {
        const match = pattern.exec(html);
        if (match && match[1]) {
          trackingData.estimatedDelivery = this.parseDate(match[1].trim());
          break;
        }
      }
      
      // Extract tracking events
      const eventsPattern = /"events":\s*\[(.*?)\]/gs;
      const eventsMatch = eventsPattern.exec(html);
      
      if (eventsMatch) {
        try {
          const eventsJson = JSON.parse(`[${eventsMatch[1]}]`);
          trackingData.events = eventsJson.map((event: any) => ({
            timestamp: this.parseDate(event.timestamp || event.time || event.date),
            location: event.location || event.city || 'Unknown',
            status: event.status || event.eventType || 'Unknown',
            description: event.description || event.message || 'Status update',
            details: event.details || event.notes
          }));
        } catch (e) {
          console.log('Could not parse events JSON, trying alternative parsing');
          trackingData.events = this.parseEventsFromHTML(html);
        }
      } else {
        // Fallback: try to parse events from HTML structure
        trackingData.events = this.parseEventsFromHTML(html);
      }
      
      // Extract origin and destination
      const originMatch = /"origin":"([^"]+)"/g.exec(html);
      if (originMatch) {
        trackingData.origin = originMatch[1];
      }
      
      const destinationMatch = /"destination":"([^"]+)"/g.exec(html);
      if (destinationMatch) {
        trackingData.destination = destinationMatch[1];
      }
      
    } catch (error) {
      console.error('Error parsing tracking HTML:', error);
    }
    
    return trackingData;
  }
  
  private parseEventsFromHTML(html: string): any[] {
    const events = [];
    
    // Look for common event patterns in HTML
    const eventPatterns = [
      /<div[^>]*class="[^"]*event[^"]*"[^>]*>.*?<span[^>]*class="[^"]*time[^"]*"[^>]*>([^<]+)</g,
      /<li[^>]*class="[^"]*tracking-event[^"]*"[^>]*>.*?<time[^>]*>([^<]+)</g,
      /<div[^>]*class="[^"]*tracking-step[^"]*"[^>]*>.*?<span[^>]*class="[^"]*date[^"]*"[^>]*>([^<]+)</g
    ];
    
    for (const pattern of eventPatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        events.push({
          timestamp: this.parseDate(match[1]),
          location: 'Unknown',
          status: 'Unknown',
          description: 'Status update'
        });
      }
    }
    
    return events;
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
      'Delayed': 'exception'
    };
    
    return statusMap[fedexStatus] || 'unknown';
  }
  
  private parseDate(dateString: string): string {
    if (!dateString) return new Date().toISOString();
    
    try {
      // Try various date formats
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
      
      // Fallback to current time
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
export const fedexScraper = new FedExScraper();
