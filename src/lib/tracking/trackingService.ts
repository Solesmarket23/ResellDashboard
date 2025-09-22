import { FedExTrackingAPI } from './fedexApi';
import { UPSTrackingAPI } from './upsApi';

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
  // Additional courier-specific information
  courierEstimatedDelivery?: string;
  afterShipEstimatedDelivery?: string;
  transitTime?: number;
  deliveryType?: string;
  signatureRequired?: string;
  courierTrackingLink?: string;
  onTimeStatus?: string;
  // Enhanced delivery date information
  commitmentDate?: string; // COMMITMENT type from dateAndTimes
  appointmentDeliveryDate?: string; // APPOINTMENT_DELIVERY type from dateAndTimes
  deliveryTimeWindow?: {
    estimated?: { starts: string; ends: string };
    actual?: { starts: string; ends: string };
  };
  deliveryDetails?: {
    location?: string;
    signatureName?: string;
    serviceArea?: string;
    serviceAreaDescription?: string;
    locationDescription?: string;
    deliveryToday?: boolean;
    deliveryAttempts?: string;
  };
}

// Multi-carrier tracking service

// Main tracking service - supports FedEx and UPS
export class TrackingService {
  private fedexAPI?: FedExTrackingAPI;
  private upsAPI?: UPSTrackingAPI;
  private fedexInitialized = false;
  private upsInitialized = false;
  
  constructor() {
    // No parameters needed - credentials come from environment variables
  }
  
  private initializeFedEx(): void {
    if (this.fedexInitialized) return;
    
    if (process.env.FEDEX_API_KEY && process.env.FEDEX_SECRET_KEY) {
      this.fedexAPI = new FedExTrackingAPI();
      console.log('✅ FedEx API initialized');
    } else {
      console.warn('⚠️ No FedEx API credentials provided');
    }
    
    this.fedexInitialized = true;
  }

  private initializeUPS(): void {
    if (this.upsInitialized) return;
    
    if (process.env.UPS_CLIENT_ID && process.env.UPS_CLIENT_SECRET && process.env.UPS_ACCOUNT_NUMBER) {
      this.upsAPI = new UPSTrackingAPI();
      console.log('✅ UPS API initialized');
    } else {
      console.warn('⚠️ No UPS API credentials provided');
    }
    
    this.upsInitialized = true;
  }
  
  async getTrackingInfo(trackingNumber: string, carrier?: string): Promise<TrackingInfo> {
    // Initialize both APIs
    this.initializeFedEx();
    this.initializeUPS();
    
    // Determine which API to use based on carrier or tracking number format
    const detectedCarrier = carrier || this.detectCarrier(trackingNumber);
    
    if (detectedCarrier === 'UPS' && this.upsAPI) {
      console.log(`🔄 Getting tracking info from UPS API for ${trackingNumber}`);
      try {
        const upsResult = await this.upsAPI.getTrackingInfo(trackingNumber);
        console.log(`✅ UPS API success for ${trackingNumber}`);
        return upsResult;
      } catch (error) {
        console.error(`❌ UPS API error for ${trackingNumber}:`, error);
        return {
          trackingNumber,
          carrier: 'UPS',
          status: 'unknown',
          lastUpdate: new Date().toISOString(),
          updates: [],
          error: error instanceof Error ? error.message : 'UPS API error'
        };
      }
    } else if (detectedCarrier === 'FedEx' && this.fedexAPI) {
      console.log(`🔄 Getting tracking info from FedEx API for ${trackingNumber}`);
      try {
        const fedexResult = await this.fedexAPI.getTrackingInfo(trackingNumber);
        console.log(`✅ FedEx API success for ${trackingNumber}`);
        return fedexResult;
      } catch (error) {
        console.error(`❌ FedEx API error for ${trackingNumber}:`, error);
        return {
          trackingNumber,
          carrier: 'FedEx',
          status: 'unknown',
          lastUpdate: new Date().toISOString(),
          updates: [],
          error: error instanceof Error ? error.message : 'FedEx API error'
        };
      }
    } else {
      // No API available for this carrier
      return {
        trackingNumber,
        carrier: detectedCarrier,
        status: 'unknown',
        lastUpdate: new Date().toISOString(),
        updates: [],
        error: `${detectedCarrier} API not configured`
      };
    }
  }

  private detectCarrier(trackingNumber: string): string {
    if (!trackingNumber) return 'Unknown';
    
    const cleanTracking = trackingNumber.replace(/[\s\-_]/g, '').toUpperCase();
    
    // UPS: Starts with 1Z and is 15-18 characters after 1Z (total 17-20)
    if (/^1Z[0-9A-Z]{15,18}$/.test(cleanTracking)) return 'UPS';
    
    // FedEx: 12-15 digits (most common), or 20+ digits (some formats)
    if (/^[0-9]{12,15}$/.test(cleanTracking)) return 'FedEx';
    if (/^[0-9]{20,}$/.test(cleanTracking)) return 'FedEx';
    
    // USPS: 20-22 digits starting with 9, or 13 digits starting with 9
    if (/^9[0-9]{19,21}$/.test(cleanTracking)) return 'USPS';
    if (/^9[0-9]{12}$/.test(cleanTracking)) return 'USPS';
    
    // DHL: 10 digits, or starts with DHL
    if (/^[0-9]{10}$/.test(cleanTracking)) return 'DHL';
    if (/^DHL[0-9A-Z]+$/.test(cleanTracking)) return 'DHL';
    
    return 'Unknown';
  }
  
  async getBulkTrackingInfo(trackingNumbers: string[]): Promise<TrackingInfo[]> {
    // Initialize both APIs
    this.initializeFedEx();
    this.initializeUPS();
    
    // Check if any tracking APIs are available
    if (!this.fedexAPI && !this.upsAPI) {
      return trackingNumbers.map(trackingNumber => ({
        trackingNumber,
        carrier: 'Unknown',
        status: 'unknown' as const,
        lastUpdate: new Date().toISOString(),
        updates: [],
        error: 'No tracking APIs configured'
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
          carrier: 'FedEx',
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
export const trackingService = new TrackingService();
