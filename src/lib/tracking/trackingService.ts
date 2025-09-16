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

// UPS Tracking API Integration
class UPSAPI implements CarrierAPI {
  name = 'UPS';
  
  detectTrackingNumber(trackingNumber: string): boolean {
    return /^1Z[0-9A-Z]{16}$/i.test(trackingNumber);
  }
  
  async getTrackingInfo(trackingNumber: string): Promise<TrackingInfo> {
    try {
      // For now, we'll use a mock implementation
      // In production, you would integrate with UPS API
      return await this.mockUPSResponse(trackingNumber);
    } catch (error) {
      return {
        trackingNumber,
        carrier: 'UPS',
        status: 'unknown',
        lastUpdate: new Date().toISOString(),
        updates: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  private async mockUPSResponse(trackingNumber: string): Promise<TrackingInfo> {
    // Mock response - replace with actual UPS API call
    const mockUpdates: TrackingUpdate[] = [
      {
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        location: 'Louisville, KY',
        status: 'shipped',
        description: 'Package picked up by UPS'
      },
      {
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        location: 'Memphis, TN',
        status: 'in_transit',
        description: 'Package in transit'
      },
      {
        timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        location: 'Local Distribution Center',
        status: 'out_for_delivery',
        description: 'Package out for delivery'
      }
    ];
    
    return {
      trackingNumber,
      carrier: 'UPS',
      status: 'out_for_delivery',
      estimatedDelivery: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      origin: 'Louisville, KY',
      destination: 'Your Address',
      lastUpdate: mockUpdates[mockUpdates.length - 1].timestamp,
      updates: mockUpdates
    };
  }
}

// FedEx Tracking API Integration
class FedExAPI implements CarrierAPI {
  name = 'FedEx';
  
  detectTrackingNumber(trackingNumber: string): boolean {
    return /^[0-9]{12,15}$/.test(trackingNumber);
  }
  
  async getTrackingInfo(trackingNumber: string): Promise<TrackingInfo> {
    try {
      return await this.mockFedExResponse(trackingNumber);
    } catch (error) {
      return {
        trackingNumber,
        carrier: 'FedEx',
        status: 'unknown',
        lastUpdate: new Date().toISOString(),
        updates: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  private async mockFedExResponse(trackingNumber: string): Promise<TrackingInfo> {
    const mockUpdates: TrackingUpdate[] = [
      {
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        location: 'Memphis, TN',
        status: 'shipped',
        description: 'Package picked up by FedEx'
      },
      {
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        location: 'Indianapolis, IN',
        status: 'in_transit',
        description: 'Package in transit'
      },
      {
        timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        location: 'Local FedEx Facility',
        status: 'out_for_delivery',
        description: 'Package out for delivery'
      }
    ];
    
    return {
      trackingNumber,
      carrier: 'FedEx',
      status: 'out_for_delivery',
      estimatedDelivery: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString().split('T')[0],
      origin: 'Memphis, TN',
      destination: 'Your Address',
      lastUpdate: mockUpdates[mockUpdates.length - 1].timestamp,
      updates: mockUpdates
    };
  }
}

// USPS Tracking API Integration
class USPSAPI implements CarrierAPI {
  name = 'USPS';
  
  detectTrackingNumber(trackingNumber: string): boolean {
    return /^9[0-9]{19,21}$/.test(trackingNumber);
  }
  
  async getTrackingInfo(trackingNumber: string): Promise<TrackingInfo> {
    try {
      return await this.mockUSPSResponse(trackingNumber);
    } catch (error) {
      return {
        trackingNumber,
        carrier: 'USPS',
        status: 'unknown',
        lastUpdate: new Date().toISOString(),
        updates: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  private async mockUSPSResponse(trackingNumber: string): Promise<TrackingInfo> {
    const mockUpdates: TrackingUpdate[] = [
      {
        timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        location: 'Origin Facility',
        status: 'shipped',
        description: 'Package accepted by USPS'
      },
      {
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        location: 'Regional Facility',
        status: 'in_transit',
        description: 'Package in transit'
      },
      {
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        location: 'Local Post Office',
        status: 'out_for_delivery',
        description: 'Package out for delivery'
      }
    ];
    
    return {
      trackingNumber,
      carrier: 'USPS',
      status: 'out_for_delivery',
      estimatedDelivery: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().split('T')[0],
      origin: 'Origin Facility',
      destination: 'Your Address',
      lastUpdate: mockUpdates[mockUpdates.length - 1].timestamp,
      updates: mockUpdates
    };
  }
}

// AfterShip API Integration (Universal tracking service)
class AfterShipAPI implements CarrierAPI {
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
      const response = await fetch(`https://api.aftership.com/v4/trackings/${trackingNumber}`, {
        headers: {
          'aftership-api-key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`AfterShip API error: ${response.status}`);
      }
      
      const data = await response.json();
      return this.parseAfterShipResponse(data);
    } catch (error) {
      return {
        trackingNumber,
        carrier: 'Unknown',
        status: 'unknown',
        lastUpdate: new Date().toISOString(),
        updates: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  private parseAfterShipResponse(data: any): TrackingInfo {
    const tracking = data.data.tracking;
    const checkpoints = tracking.checkpoints || [];
    
    const updates: TrackingUpdate[] = checkpoints.map((checkpoint: any) => ({
      timestamp: checkpoint.checkpoint_time,
      location: checkpoint.location || 'Unknown',
      status: this.mapAfterShipStatus(checkpoint.tag),
      description: checkpoint.message || checkpoint.description || 'Status update',
      details: checkpoint.details
    }));
    
    return {
      trackingNumber: tracking.tracking_number,
      carrier: tracking.slug || 'Unknown',
      status: this.mapAfterShipStatus(tracking.tag),
      estimatedDelivery: tracking.expected_delivery,
      actualDelivery: tracking.tag === 'Delivered' ? tracking.delivered_time : undefined,
      origin: tracking.origin_country,
      destination: tracking.destination_country,
      lastUpdate: updates.length > 0 ? updates[updates.length - 1].timestamp : new Date().toISOString(),
      updates: updates.reverse() // Most recent first
    };
  }
  
  private mapAfterShipStatus(tag: string): TrackingInfo['status'] {
    switch (tag?.toLowerCase()) {
      case 'delivered':
        return 'delivered';
      case 'in_transit':
      case 'in_transit':
        return 'in_transit';
      case 'out_for_delivery':
        return 'out_for_delivery';
      case 'exception':
        return 'exception';
      case 'pending':
      case 'info_received':
        return 'shipped';
      default:
        return 'unknown';
    }
  }
}

// Main tracking service
export class TrackingService {
  private carriers: CarrierAPI[];
  private afterShipAPI?: AfterShipAPI;
  
  constructor(afterShipApiKey?: string) {
    this.carriers = [
      new UPSAPI(),
      new FedExAPI(),
      new USPSAPI()
    ];
    
    if (afterShipApiKey) {
      this.afterShipAPI = new AfterShipAPI(afterShipApiKey);
      this.carriers.push(this.afterShipAPI);
    }
  }
  
  async getTrackingInfo(trackingNumber: string, carrier?: string): Promise<TrackingInfo> {
    // If carrier is specified, try that first
    if (carrier) {
      const carrierAPI = this.carriers.find(c => c.name.toLowerCase() === carrier.toLowerCase());
      if (carrierAPI && carrierAPI.detectTrackingNumber(trackingNumber)) {
        return await carrierAPI.getTrackingInfo(trackingNumber);
      }
    }
    
    // Try to detect carrier automatically
    for (const carrierAPI of this.carriers) {
      if (carrierAPI.detectTrackingNumber(trackingNumber)) {
        return await carrierAPI.getTrackingInfo(trackingNumber);
      }
    }
    
    // If no carrier detected and AfterShip is available, use it as fallback
    if (this.afterShipAPI) {
      return await this.afterShipAPI.getTrackingInfo(trackingNumber);
    }
    
    // Return unknown status if no carrier can handle this tracking number
    return {
      trackingNumber,
      carrier: 'Unknown',
      status: 'unknown',
      lastUpdate: new Date().toISOString(),
      updates: [],
      error: 'No carrier detected for this tracking number'
    };
  }
  
  async getBulkTrackingInfo(trackingNumbers: string[]): Promise<TrackingInfo[]> {
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
