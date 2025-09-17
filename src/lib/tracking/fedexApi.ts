import { TrackingInfo, TrackingUpdate } from './trackingService';
import { FedExAuthService } from './fedexAuth';

export interface FedExTrackingRequest {
  includeDetailedScans: boolean;
  trackingInfo: {
    trackingNumberInfo: {
      trackingNumber: string;
    }[];
  }[];
}

export interface FedExTrackingResponse {
  output: {
    completeTrackResults: Array<{
      trackingNumber: string;
      trackResults: Array<{
        trackingNumberInfo: {
          trackingNumber: string;
          carrierCode: string;
        };
        additionalTrackingInfo: {
          hasAssociatedShipments: boolean;
        };
        distanceToDestination: {
          unitOfMeasurement: string;
          value: number;
        };
        scanEvents: Array<{
          date: string;
          eventType: string;
          eventDescription: string;
          scanLocation: {
            city: string;
            stateOrProvinceCode: string;
            countryCode: string;
            residential: boolean;
          };
          exceptionDescription?: string;
          exceptionCode?: string;
        }>;
        packageDetails: {
          type: string;
          packagingDescription: string;
          count: number;
          weightAndDimensions: {
            weight: Array<{
              value: number;
              unit: string;
            }>;
            dimensions: Array<{
              length: number;
              width: number;
              height: number;
              units: string;
            }>;
          };
        };
        serviceDetail: {
          type: string;
          description: string;
          shortDescription: string;
        };
        standardTransitTimeWindow: {
          description: string;
          window: {
            starts: string;
            ends: string;
          };
        };
        estimatedDeliveryTimeWindow: {
          description: string;
          window: {
            starts: string;
            ends: string;
          };
        };
        actualDeliveryTimeWindow: {
          description: string;
          window: {
            starts: string;
            ends: string;
          };
        };
        deliveryDetails: {
          actualDeliveryTimestamp: string;
          deliveryLocation: string;
          deliverySignatureName: string;
          deliveryServiceArea: string;
          deliveryServiceAreaDescription: string;
          deliveryLocationDescription: string;
          deliverySignatureName: string;
          deliverySignatureTitle: string;
          deliverySignatureTitle: string;
        };
        statusDetail: {
          code: string;
          derivedCode: string;
          statusByLocale: string;
          description: string;
        };
        statusCode: string;
        statusDescription: string;
      }>;
    }>;
  };
}

export class FedExTrackingAPI {
  private authService: FedExAuthService;
  private baseUrl: string;

  constructor() {
    this.authService = FedExAuthService.getInstance();
    this.baseUrl = process.env.FEDEX_BASE_URL || 'https://apis.fedex.com';
  }

  async getTrackingInfo(trackingNumber: string): Promise<TrackingInfo> {
    try {
      console.log(`🔍 Fetching FedEx tracking info for: ${trackingNumber}`);
      
      const token = await this.authService.getValidToken();
      const requestBody: FedExTrackingRequest = {
        includeDetailedScans: true,
        trackingInfo: [
          {
            trackingNumberInfo: [
              {
                trackingNumber: trackingNumber
              }
            ]
          }
        ]
      };

      const response = await fetch(`${this.baseUrl}/track/v1/trackingnumbers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token.access_token}`,
          'x-locale': 'en_US'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ FedEx API error: ${response.status} ${errorText}`);
        throw new Error(`FedEx API error: ${response.status} ${errorText}`);
      }

      const data: FedExTrackingResponse = await response.json();
      return this.parseTrackingResponse(data, trackingNumber);

    } catch (error) {
      console.error(`❌ FedEx tracking error for ${trackingNumber}:`, error);
      
      return {
        trackingNumber,
        carrier: 'FedEx',
        status: 'unknown',
        lastUpdate: new Date().toISOString(),
        updates: [],
        error: error instanceof Error ? error.message : 'Unknown FedEx API error'
      };
    }
  }

  private parseTrackingResponse(response: FedExTrackingResponse, trackingNumber: string): TrackingInfo {
    try {
      const trackResults = response.output.completeTrackResults[0]?.trackResults[0];
      
      if (!trackResults) {
        throw new Error('No tracking results found');
      }

      // Parse scan events into tracking updates
      const updates: TrackingUpdate[] = trackResults.scanEvents.map(scan => ({
        timestamp: scan.date,
        location: this.formatLocation(scan.scanLocation),
        status: this.mapFedExStatus(scan.eventType),
        description: scan.eventDescription,
        details: {
          eventType: scan.eventType,
          exceptionCode: scan.exceptionCode,
          exceptionDescription: scan.exceptionDescription
        }
      }));

      // Sort updates by timestamp (newest first)
      updates.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Determine current status
      const currentStatus = this.mapFedExStatus(trackResults.statusCode || trackResults.statusDetail?.code || 'UNKNOWN');
      
      // Get estimated delivery
      const estimatedDelivery = trackResults.estimatedDeliveryTimeWindow?.window?.starts || 
                               trackResults.standardTransitTimeWindow?.window?.starts;

      // Get actual delivery
      const actualDelivery = trackResults.deliveryDetails?.actualDeliveryTimestamp;

      return {
        trackingNumber,
        carrier: 'FedEx',
        status: currentStatus,
        estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery).toISOString().split('T')[0] : undefined,
        actualDelivery: actualDelivery ? new Date(actualDelivery).toISOString().split('T')[0] : undefined,
        origin: updates.length > 0 ? updates[updates.length - 1].location : undefined,
        destination: trackResults.deliveryDetails?.deliveryLocation || 'Unknown',
        lastUpdate: updates.length > 0 ? updates[0].timestamp : new Date().toISOString(),
        updates: updates,
        serviceType: trackResults.serviceDetail?.description,
        weight: trackResults.packageDetails?.weightAndDimensions?.weight?.[0]?.value,
        weightUnit: trackResults.packageDetails?.weightAndDimensions?.weight?.[0]?.unit
      };

    } catch (error) {
      console.error('❌ Error parsing FedEx response:', error);
      throw error;
    }
  }

  private formatLocation(location: any): string {
    if (!location) return 'Unknown';
    
    const parts = [location.city, location.stateOrProvinceCode, location.countryCode]
      .filter(Boolean);
    
    return parts.join(', ') || 'Unknown';
  }

  private mapFedExStatus(fedexStatus: string): string {
    const statusMap: { [key: string]: string } = {
      'OC': 'shipped', // Origin scan
      'DP': 'shipped', // Departed origin
      'IT': 'in_transit', // In transit
      'OD': 'out_for_delivery', // Out for delivery
      'DL': 'delivered', // Delivered
      'DE': 'delivered', // Delivered
      'EX': 'exception', // Exception
      'CA': 'exception', // Cancelled
      'SE': 'exception', // Shipment exception
      'UNKNOWN': 'unknown'
    };

    return statusMap[fedexStatus] || 'unknown';
  }

  // Method to check if tracking number is valid FedEx format
  detectTrackingNumber(trackingNumber: string): boolean {
    // FedEx tracking numbers are typically 12-15 digits
    return /^[0-9]{12,15}$/.test(trackingNumber);
  }
}
