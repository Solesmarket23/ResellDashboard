import { trackingConfig } from './config';

// Tracking service for live delivery updates
export interface TrackingUpdate {
  timestamp: string;
  location: string;
  status: string;
  description: string;
  details?: string;
}

export interface TrackingInfo {
  trackingNumber: string;
  carrier: string;
  status: 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'unknown';
  estimatedDelivery?: string;
  actualDelivery?: string;
  origin?: string;
  destination?: string;
  lastUpdate: string;
  updates: TrackingUpdate[];
  error?: string;
}

export interface CarrierAPI {
  name: string;
  detectTrackingNumber: (trackingNumber: string) => boolean;
  getTrackingInfo: (trackingNumber: string) => Promise<TrackingInfo>;
}

// Note: All carrier APIs removed - using only AfterShip for all tracking

// AfterShip API Integration (Universal tracking service)
export class AfterShipAPI implements CarrierAPI {
  name = 'AfterShip';
  private apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  detectTrackingNumber(trackingNumber: string): boolean {
    // AfterShip can handle any tracking number format
    return trackingNumber.length >= 8;
  }
  
  async getTrackingInfo(trackingNumber: string): Promise<TrackingInfo> {
    try {
      // First, search for the tracking number in AfterShip
      const searchResponse = await fetch(`https://api.aftership.com/v4/trackings?tracking_numbers=${trackingNumber}`, {
        headers: {
          'as-api-key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });
      
      if (!searchResponse.ok) {
        const errorData = await searchResponse.text();
        console.log(`⚠️ AfterShip search failed for ${trackingNumber}: ${searchResponse.status} - ${errorData}`);
        throw new Error(`AfterShip API error: ${searchResponse.status} - ${errorData}`);
      }
      
      const searchData = await searchResponse.json();
      
      // If we found the tracking, get the full details
      if (searchData.data.trackings && searchData.data.trackings.length > 0) {
        const tracking = searchData.data.trackings[0];
        console.log(`✅ Found tracking in AfterShip: ${trackingNumber}`);
        return this.parseAfterShipResponse({ data: { tracking } });
      } else {
        // Tracking not found, register it with AfterShip
        console.log(`⚠️ Tracking not found in AfterShip: ${trackingNumber}, registering...`);
        
        const registerResponse = await fetch('https://api.aftership.com/v4/trackings', {
          method: 'POST',
          headers: {
            'as-api-key': this.apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            tracking: {
              tracking_number: trackingNumber,
              slug: this.detectCarrierFromTrackingNumber(trackingNumber)
            }
          })
        });
        
        if (registerResponse.ok) {
          console.log(`✅ Successfully registered tracking with AfterShip: ${trackingNumber}`);
          // Wait for AfterShip to process the registration
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Try to get the tracking info again
          return await this.getTrackingInfo(trackingNumber);
        } else {
          const errorData = await registerResponse.json();
          console.log(`❌ Failed to register tracking with AfterShip: ${errorData.meta?.message || 'Unknown error'}`);
          
          // Check if it's a permission issue
          if (registerResponse.status === 403) {
            return {
              trackingNumber,
              carrier: this.detectCarrierFromTrackingNumber(trackingNumber),
              status: 'unknown',
              lastUpdate: new Date().toISOString(),
              updates: [],
              error: 'AfterShip API key lacks write permissions. Please register this tracking number manually in AfterShip dashboard or upgrade your API key permissions.'
            };
          }
          
          return {
            trackingNumber,
            carrier: this.detectCarrierFromTrackingNumber(trackingNumber),
            status: 'unknown',
            lastUpdate: new Date().toISOString(),
            updates: [],
            error: `Failed to register with AfterShip: ${errorData.meta?.message || 'Unknown error'}`
          };
        }
      }
    } catch (error) {
      console.error(`❌ AfterShip API error for ${trackingNumber}:`, error);
      
      return {
        trackingNumber,
        carrier: this.detectCarrierFromTrackingNumber(trackingNumber),
        status: 'unknown',
        lastUpdate: new Date().toISOString(),
        updates: [],
        error: error instanceof Error ? error.message : 'AfterShip API error'
      };
    }
  }
  
  private detectCarrierFromTrackingNumber(trackingNumber: string): string {
    if (trackingNumber.startsWith('1Z')) return 'ups';
    if (/^[0-9]{12,15}$/.test(trackingNumber)) return 'fedex';
    if (/^9[0-9]{19,21}$/.test(trackingNumber)) return 'usps';
    if (/^[0-9]{10}$/.test(trackingNumber)) return 'dhl';
    return 'fedex'; // Default to FedEx for unknown formats
  }
  
  private parseAfterShipResponse(data: any): TrackingInfo {
    const tracking = data.data.tracking;
    const checkpoints = tracking.checkpoints || [];
    const estimatedDelivery = tracking.expected_delivery;
    
    // Log the estimated delivery from AfterShip for debugging
    if (estimatedDelivery) {
      console.log(`📦 AfterShip estimated delivery: ${estimatedDelivery} for ${tracking.tracking_number}`);
    }
    
    const updates: TrackingUpdate[] = checkpoints.map((checkpoint: any) => ({
      timestamp: checkpoint.checkpoint_time,
      location: checkpoint.location || 'Unknown',
      status: this.mapAfterShipStatus(checkpoint.tag, estimatedDelivery),
      description: checkpoint.message || checkpoint.description || 'Status update',
      details: checkpoint.details
    }));
    
    return {
      trackingNumber: tracking.tracking_number,
      carrier: tracking.slug || 'Unknown',
      status: this.mapAfterShipStatus(tracking.tag, estimatedDelivery),
      estimatedDelivery: tracking.expected_delivery,
      actualDelivery: tracking.tag === 'Delivered' ? tracking.delivered_time : undefined,
      origin: tracking.origin_country,
      destination: tracking.destination_country,
      lastUpdate: updates.length > 0 ? updates[updates.length - 1].timestamp : new Date().toISOString(),
      updates: updates.reverse() // Most recent first
    };
  }
  
  private mapAfterShipStatus(tag: string, estimatedDelivery?: string): TrackingInfo['status'] {
    let status: TrackingInfo['status'];
    
    switch (tag?.toLowerCase()) {
      case 'delivered':
        status = 'delivered';
        break;
      case 'in_transit':
      case 'in_transit':
        status = 'in_transit';
        break;
      case 'out_for_delivery':
        status = 'out_for_delivery';
        break;
      case 'exception':
        status = 'exception';
        break;
      case 'pending':
      case 'info_received':
        status = 'shipped';
        break;
      default:
        status = 'unknown';
    }
    
    // If status is "out_for_delivery" but estimated delivery is more than 1 day away,
    // it's likely still in transit to the local facility
    if (status === 'out_for_delivery' && estimatedDelivery) {
      const estimatedDate = new Date(estimatedDelivery);
      const today = new Date();
      const daysUntilDelivery = Math.ceil((estimatedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysUntilDelivery > 1) {
        status = 'in_transit';
      }
    }
    
    return status;
  }
}

// Main tracking service - AfterShip only
export class TrackingService {
  private afterShipAPI?: AfterShipAPI;
  
  constructor(afterShipApiKey?: string) {
    if (afterShipApiKey) {
      this.afterShipAPI = new AfterShipAPI(afterShipApiKey);
    } else {
      console.warn('⚠️ No AfterShip API key provided - tracking will not work');
    }
  }
  
  async getTrackingInfo(trackingNumber: string, carrier?: string): Promise<TrackingInfo> {
    if (!this.afterShipAPI) {
      return {
        trackingNumber,
        carrier: 'Unknown',
        status: 'unknown',
        lastUpdate: new Date().toISOString(),
        updates: [],
        error: 'AfterShip API not configured'
      };
    }
    
    console.log(`🔄 Getting tracking info from AfterShip for ${trackingNumber}`);
    return await this.afterShipAPI.getTrackingInfo(trackingNumber);
  }
  
  async getBulkTrackingInfo(trackingNumbers: string[]): Promise<TrackingInfo[]> {
    if (!this.afterShipAPI) {
      return trackingNumbers.map(trackingNumber => ({
        trackingNumber,
        carrier: 'Unknown',
        status: 'unknown' as const,
        lastUpdate: new Date().toISOString(),
        updates: [],
        error: 'AfterShip API not configured'
      }));
    }
    
    const results = await Promise.allSettled(
      trackingNumbers.map(tn => this.getTrackingInfo(tn))
    );
    
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          trackingNumber: trackingNumbers[index],
          carrier: 'Unknown',
          status: 'unknown' as const,
          lastUpdate: new Date().toISOString(),
          updates: [],
          error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
        };
      }
    });
  }
}

// Create singleton instance
export const trackingService = new TrackingService(trackingConfig.afterShip.apiKey);
