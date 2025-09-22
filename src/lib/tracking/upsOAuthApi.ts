import { TrackingInfo, TrackingUpdate } from './trackingService';

export interface UPSTrackingRequest {
  TrackRequest: {
    Request: {
      RequestOption: string;
      TransactionReference: {
        CustomerContext: string;
      };
    };
    InquiryNumber: string;
  };
}

export interface UPSTrackingResponse {
  TrackResponse: {
    Response: {
      ResponseStatus: {
        Code: string;
        Description: string;
      };
      Alert?: Array<{
        Code: string;
        Description: string;
      }>;
    };
    Shipment?: Array<{
      InquiryNumber: {
        Value: string;
      };
      ShipmentIdentificationNumber: string;
      Service: {
        Code: string;
        Description: string;
      };
      ShipmentType: {
        Code: string;
        Description: string;
      };
      ReferenceNumber?: Array<{
        Number: string;
        Code: string;
      }>;
      CurrentStatus: {
        Code: string;
        Description: string;
      };
      PickupDate: string;
      ScheduledDeliveryDate?: string;
      ScheduledDeliveryTime?: string;
      Package: Array<{
        TrackingNumber: string;
        Activity: Array<{
          Date: string;
          Time: string;
          Status: {
            Code: string;
            Description: string;
          };
          Location: {
            Address: {
              City: string;
              StateProvinceCode: string;
              CountryCode: string;
              CountryName: string;
            };
          };
          StatusType: {
            Code: string;
            Description: string;
          };
        }>;
        PackageWeight: {
          Weight: string;
          UnitOfMeasurement: {
            Code: string;
            Description: string;
          };
        };
      }>;
    }>;
  };
}

export class UPSOAuthTrackingAPI {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.UPS_BASE_URL || 'https://wwwcie.ups.com';
  }

  async getTrackingInfo(trackingNumber: string, accessToken: string): Promise<TrackingInfo> {
    try {
      console.log(`🔍 Fetching UPS OAuth tracking info for: ${trackingNumber}`);
      
      const requestBody: UPSTrackingRequest = {
        TrackRequest: {
          Request: {
            RequestOption: '1',
            TransactionReference: {
              CustomerContext: 'Track by Number'
            }
          },
          InquiryNumber: trackingNumber
        }
      };

      const response = await fetch(`${this.baseUrl}/api/track/v1/track`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'transId': '12345',
          'transactionSrc': 'testing'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ UPS OAuth API error: ${response.status} ${errorText}`);
        throw new Error(`UPS OAuth API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      console.log('🔍 UPS OAuth API Response:', JSON.stringify(data, null, 2));
      return this.parseTrackingResponse(data, trackingNumber);

    } catch (error) {
      console.error(`❌ UPS OAuth tracking error for ${trackingNumber}:`, error);
      
      return {
        trackingNumber,
        carrier: 'UPS',
        status: 'unknown',
        lastUpdate: new Date().toISOString(),
        updates: [],
        error: error instanceof Error ? error.message : 'Unknown UPS OAuth API error'
      };
    }
  }

  private parseTrackingResponse(response: any, trackingNumber: string): TrackingInfo {
    try {
      console.log('🔍 Parsing UPS OAuth response structure:', Object.keys(response));
      
      // Check if response has trackResponse property (lowercase)
      const trackResponse = response.trackResponse || response.TrackResponse;
      if (!trackResponse) {
        console.log('❌ No trackResponse found in UPS OAuth response');
        return {
          trackingNumber,
          carrier: 'UPS',
          status: 'unknown',
          lastUpdate: new Date().toISOString(),
          updates: [],
          error: 'No trackResponse found in UPS OAuth API response'
        };
      }

      console.log('🔍 TrackResponse structure:', Object.keys(trackResponse));
      
      // Check if response has shipment property (lowercase)
      const shipment = trackResponse.shipment || trackResponse.Shipment;
      if (!shipment || shipment.length === 0) {
        console.log('❌ No shipment data found in UPS OAuth response');
        return {
          trackingNumber,
          carrier: 'UPS',
          status: 'unknown',
          lastUpdate: new Date().toISOString(),
          updates: [],
          error: 'No shipment data found in UPS OAuth response'
        };
      }

      const shipmentData = shipment[0];
      console.log('🔍 Shipment structure:', Object.keys(shipmentData));

      // Parse activities into tracking updates
      const updates: TrackingUpdate[] = [];
      const packageData = shipment.Package?.[0];
      
      if (packageData?.Activity) {
        updates.push(...packageData.Activity.map(activity => ({
          timestamp: `${activity.Date}T${activity.Time}`,
          location: this.formatLocation(activity.Location?.Address),
          status: this.mapUPSStatus(activity.Status?.Code),
          description: activity.Status?.Description || activity.StatusType?.Description || 'No description',
          details: {
            statusCode: activity.Status?.Code,
            statusType: activity.StatusType?.Code,
            statusDescription: activity.StatusType?.Description
          }
        })));
      }

      // Sort updates by timestamp (newest first)
      updates.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Determine current status
      const currentStatus = this.mapUPSStatus(shipment.CurrentStatus?.Code);
      
      // Get estimated delivery date - check multiple possible fields
      let estimatedDelivery = undefined;
      
      // Check various possible fields for delivery date
      if (shipmentData.scheduledDeliveryDate) {
        estimatedDelivery = new Date(shipmentData.scheduledDeliveryDate).toISOString().split('T')[0];
        console.log('📅 Found scheduledDeliveryDate:', estimatedDelivery);
      } else if (shipmentData.ScheduledDeliveryDate) {
        estimatedDelivery = new Date(shipmentData.ScheduledDeliveryDate).toISOString().split('T')[0];
        console.log('📅 Found ScheduledDeliveryDate:', estimatedDelivery);
      } else if (shipmentData.deliveryDate) {
        estimatedDelivery = new Date(shipmentData.deliveryDate).toISOString().split('T')[0];
        console.log('📅 Found deliveryDate:', estimatedDelivery);
      } else if (shipmentData.estimatedDeliveryDate) {
        estimatedDelivery = new Date(shipmentData.estimatedDeliveryDate).toISOString().split('T')[0];
        console.log('📅 Found estimatedDeliveryDate:', estimatedDelivery);
      } else if (shipmentData.package) {
        // Check package level for delivery date
        const pkg = shipmentData.package[0];
        if (pkg.scheduledDeliveryDate) {
          estimatedDelivery = new Date(pkg.scheduledDeliveryDate).toISOString().split('T')[0];
          console.log('📅 Found package scheduledDeliveryDate:', estimatedDelivery);
        } else if (pkg.deliveryDate) {
          estimatedDelivery = new Date(pkg.deliveryDate).toISOString().split('T')[0];
          console.log('📅 Found package deliveryDate:', estimatedDelivery);
        }
      } else {
        console.log('❌ No delivery date found in UPS OAuth response');
        console.log('📋 Available fields:', Object.keys(shipmentData));
      }

      return {
        trackingNumber,
        carrier: 'UPS',
        status: currentStatus,
        estimatedDelivery,
        origin: updates.length > 0 ? updates[updates.length - 1].location : undefined,
        destination: 'Unknown', // UPS doesn't provide destination in tracking response
        lastUpdate: updates.length > 0 ? updates[0].timestamp : new Date().toISOString(),
        updates: updates,
        serviceType: shipment.Service?.Description,
        weight: packageData?.PackageWeight?.Weight,
        weightUnit: packageData?.PackageWeight?.UnitOfMeasurement?.Code,
        // Additional UPS-specific information
        scheduledDeliveryTime: shipment.ScheduledDeliveryTime,
        serviceCode: shipment.Service?.Code,
        shipmentType: shipment.ShipmentType?.Description
      };

    } catch (error) {
      console.error('❌ Error parsing UPS OAuth response:', error);
      throw error;
    }
  }

  private formatLocation(address: any): string {
    if (!address) return 'Unknown';
    
    const parts = [address.City, address.StateProvinceCode, address.CountryCode]
      .filter(Boolean);
    
    return parts.length > 0 ? parts.join(', ') : 'Unknown';
  }

  private mapUPSStatus(statusCode?: string): 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'unknown' {
    if (!statusCode) return 'unknown';
    
    switch (statusCode) {
      case 'OR': // Origin Scan
      case 'DP': // Departed
      case 'IT': // In Transit
        return 'in_transit';
      case 'OD': // Out for Delivery
        return 'out_for_delivery';
      case 'DL': // Delivered
        return 'delivered';
      case 'EX': // Exception
      case 'CA': // Cancelled
        return 'exception';
      case 'PU': // Picked Up
      case 'AR': // Arrived
        return 'shipped';
      default:
        return 'unknown';
    }
  }
}
