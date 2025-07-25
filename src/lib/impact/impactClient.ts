// Impact.com API Client for StockX Affiliate Links

export interface ImpactConfig {
  accountSid: string;
  authToken: string;
  campaignId?: string; // StockX campaign ID if needed
}

export interface TrackingLink {
  originalUrl: string;
  trackingUrl: string;
  shortUrl?: string;
}

class ImpactClient {
  private baseUrl = 'https://api.impact.com';
  private accountSid: string;
  private authToken: string;
  private campaignId?: string;

  constructor(config: ImpactConfig) {
    this.accountSid = config.accountSid;
    this.authToken = config.authToken;
    this.campaignId = config.campaignId;
  }

  // Create headers for API requests
  private getHeaders() {
    return {
      'Authorization': `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  // Generate an affiliate tracking link for a StockX URL
  async createTrackingLink(stockxUrl: string, customParams?: Record<string, string>): Promise<TrackingLink> {
    try {
      // First, try to get existing tracking links to find the right ad/campaign
      const adsResponse = await fetch(`${this.baseUrl}/Mediapartners/${this.accountSid}/Ads`, {
        headers: this.getHeaders()
      });

      if (!adsResponse.ok) {
        throw new Error(`Failed to fetch ads: ${adsResponse.statusText}`);
      }

      const adsData = await adsResponse.json();
      
      // Find StockX ad or use first available
      const stockxAd = adsData.Ads?.find((ad: any) => 
        ad.Name?.toLowerCase().includes('stockx') || 
        ad.AdvertiserName?.toLowerCase().includes('stockx')
      ) || adsData.Ads?.[0];

      if (!stockxAd) {
        throw new Error('No StockX ads found in your Impact account');
      }

      // Get the tracking link template
      const trackingLinkResponse = await fetch(
        `${this.baseUrl}/Mediapartners/${this.accountSid}/Ads/${stockxAd.Id}/TrackingLink`,
        {
          headers: this.getHeaders()
        }
      );

      if (!trackingLinkResponse.ok) {
        throw new Error(`Failed to get tracking link: ${trackingLinkResponse.statusText}`);
      }

      const trackingData = await trackingLinkResponse.json();
      
      // Build the affiliate URL
      let affiliateUrl = trackingData.TrackingLink || trackingData.Url;
      
      // Add the destination URL
      if (affiliateUrl.includes('?')) {
        affiliateUrl += `&u=${encodeURIComponent(stockxUrl)}`;
      } else {
        affiliateUrl += `?u=${encodeURIComponent(stockxUrl)}`;
      }

      // Add custom tracking parameters
      if (customParams) {
        Object.entries(customParams).forEach(([key, value]) => {
          affiliateUrl += `&${key}=${encodeURIComponent(value)}`;
        });
      }

      return {
        originalUrl: stockxUrl,
        trackingUrl: affiliateUrl
      };

    } catch (error) {
      console.error('Error creating Impact tracking link:', error);
      // Fallback to original URL if affiliate link generation fails
      return {
        originalUrl: stockxUrl,
        trackingUrl: stockxUrl
      };
    }
  }

  // Get commission report
  async getCommissions(startDate: string, endDate: string) {
    try {
      const response = await fetch(
        `${this.baseUrl}/Mediapartners/${this.accountSid}/Actions?` + 
        `StartDate=${startDate}&EndDate=${endDate}&States=APPROVED,PENDING`,
        {
          headers: this.getHeaders()
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch commissions: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching commissions:', error);
      return null;
    }
  }

  // Get click statistics
  async getClicks(startDate: string, endDate: string) {
    try {
      const response = await fetch(
        `${this.baseUrl}/Mediapartners/${this.accountSid}/Clicks?` + 
        `StartDate=${startDate}&EndDate=${endDate}`,
        {
          headers: this.getHeaders()
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch clicks: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching clicks:', error);
      return null;
    }
  }
}

// Singleton instance
let impactClient: ImpactClient | null = null;

export function initializeImpactClient(config: ImpactConfig) {
  impactClient = new ImpactClient(config);
  return impactClient;
}

export function getImpactClient(): ImpactClient | null {
  return impactClient;
}

export default ImpactClient;