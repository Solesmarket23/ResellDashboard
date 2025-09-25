import { TrackingInfo, TrackingUpdate } from './trackingService';
import { UPSAuthService } from './upsAuth';
import { UPSOAuthService } from './upsOAuth';

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

export class UPSTrackingAPI {
  private authService: UPSAuthService;
  private oauthService: UPSOAuthService;
  private baseUrl: string;
  private useOAuth: boolean;

  constructor() {
    this.authService = UPSAuthService.getInstance();
    this.oauthService = UPSOAuthService.getInstance();
    // Use production URL for tracking API with real tracking numbers
    this.baseUrl = 'https://onlinetools.ups.com';
    
    // For package tracking, use Client Credentials (not OAuth)
    // OAuth is only needed when customers create shipping labels
    this.useOAuth = false;
  }

  async getTrackingInfo(trackingNumber: string): Promise<TrackingInfo> {
    try {
      console.log(`🔍 Fetching UPS tracking info for: ${trackingNumber}`);
      
      // Get access token (OAuth or Client Credentials)
      let accessToken: string;
      
      if (this.useOAuth) {
        console.log('🔐 Using UPS OAuth for tracking');
        const oauthConfig = {
          clientId: process.env.UPS_OAUTH_CLIENT_ID!,
          redirectUri: process.env.UPS_OAUTH_REDIRECT_URI!,
          scope: process.env.UPS_OAUTH_SCOPE || 'ups.track ups.ship',
          baseUrl: this.baseUrl
        };
        accessToken = await this.oauthService.getValidToken(oauthConfig);
      } else {
        console.log('🔑 Using UPS Client Credentials for tracking');
        const token = await this.authService.getValidToken();
        accessToken = token.access_token;
      }
      
      const requestBody = {
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

      const url = new URL(`${this.baseUrl}/api/track/v1/details/${trackingNumber}`);
      url.searchParams.set('locale', 'en_US');
      url.searchParams.set('returnSignature', 'false');
      url.searchParams.set('returnMilestones', 'false');
      url.searchParams.set('returnPOD', 'false');
      
      console.log(`🔍 UPS API URL: ${url.toString()}`);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'transId': `track-${Date.now()}`,
          'transactionSrc': 'ResellDashboard',
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ UPS API error: ${response.status} ${errorText}`);
        console.error(`❌ UPS API URL: ${url.toString()}`);
        console.error(`❌ UPS API Headers:`, {
          'Authorization': `Bearer ${accessToken.substring(0, 20)}...`,
          'transId': `track-${Date.now()}`,
          'transactionSrc': 'ResellDashboard',
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        });
        console.error(`❌ UPS API Body:`, JSON.stringify(requestBody, null, 2));
        console.error(`❌ Full UPS API Response:`, errorText);
        
        // Try to parse the error response as JSON
        try {
          const errorJson = JSON.parse(errorText);
          console.error(`❌ Parsed UPS API Error:`, errorJson);
        } catch (e) {
          console.error(`❌ Could not parse UPS API error as JSON`);
        }
        
        throw new Error(`UPS API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      console.log('🔍 UPS API Response:', JSON.stringify(data, null, 2));
      
      // Check if the response contains an error (even with 200 status)
      if (data.response && data.response.errors && data.response.errors.length > 0) {
        const error = data.response.errors[0];
        console.error(`❌ UPS API returned error: ${error.code} - ${error.message}`);
        return {
          trackingNumber,
          carrier: 'UPS',
          status: 'unknown',
          lastUpdate: new Date().toISOString(),
          updates: [],
          error: `UPS API error: ${error.code} - ${error.message}`
        };
      }
      
      return this.parseTrackingResponse(data, trackingNumber);

    } catch (error) {
      console.error(`❌ UPS tracking error for ${trackingNumber}:`, error);
      
      return {
        trackingNumber,
        carrier: 'UPS',
        status: 'unknown',
        lastUpdate: new Date().toISOString(),
        updates: [],
        error: error instanceof Error ? error.message : 'Unknown UPS API error'
      };
    }
  }

  private parseTrackingResponse(response: any, trackingNumber: string): TrackingInfo {
    try {
      console.log('🔍 Parsing UPS response structure:', Object.keys(response));
      console.log('🔍 Full UPS response:', JSON.stringify(response, null, 2));
      
      // Check if response has trackResponse property (lowercase)
      const trackResponse = response.trackResponse || response.TrackResponse;
      if (!trackResponse) {
        console.log('❌ No trackResponse found in UPS response');
        return {
          trackingNumber,
          carrier: 'UPS',
          status: 'unknown',
          lastUpdate: new Date().toISOString(),
          updates: [],
          error: 'No trackResponse found in UPS API response'
        };
      }

      console.log('🔍 TrackResponse structure:', Object.keys(trackResponse));
      
      // Check if response has shipment property (lowercase)
      const shipment = trackResponse.shipment || trackResponse.Shipment;
      if (!shipment || shipment.length === 0) {
        console.log('❌ No shipment data found in UPS response');
        return {
          trackingNumber,
          carrier: 'UPS',
          status: 'unknown',
          lastUpdate: new Date().toISOString(),
          updates: [],
          error: 'No shipment data found in UPS response'
        };
      }

      const shipmentData = shipment[0];
      console.log('🔍 Shipment structure:', Object.keys(shipmentData));

      // Parse activities into tracking updates
      const updates: TrackingUpdate[] = [];
      const packageData = shipmentData.package?.[0] || shipmentData.Package?.[0];
      
      if (packageData?.activity) {
        updates.push(...packageData.activity.map((activity: any) => ({
          timestamp: this.formatUPSTimestamp(activity.date, activity.time),
          location: this.formatLocation(activity.location?.address),
          status: this.mapUPSStatus(activity.status?.statusCode || activity.status?.code),
          description: activity.status?.description || 'No description',
          details: {
            statusCode: activity.status?.statusCode || activity.status?.code,
            statusType: activity.status?.type,
            statusDescription: activity.status?.description
          }
        })));
      } else if (packageData?.Activity) {
        updates.push(...packageData.Activity.map((activity: any) => ({
          timestamp: this.formatUPSTimestamp(activity.Date, activity.Time),
          location: this.formatLocation(activity.Location?.Address),
          status: this.mapUPSStatus(activity.Status?.Code),
          description: activity.Status?.Description || 'No description',
          details: {
            statusCode: activity.Status?.Code,
            statusType: activity.Status?.Type,
            statusDescription: activity.Status?.Description
          }
        })));
      }

      // Sort updates by timestamp (newest first)
      updates.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Determine current status
      const currentStatus = this.mapUPSStatus(packageData?.currentStatus?.code || packageData?.CurrentStatus?.Code);
      
      // Get estimated delivery date - check multiple possible fields
      let estimatedDelivery = undefined;
      
      console.log('🔍 Looking for delivery date in shipment data...');
      console.log('📋 Shipment data keys:', Object.keys(shipmentData));
      
      // Check various possible fields for delivery date
      if (shipmentData.scheduledDeliveryDate) {
        const date = new Date(shipmentData.scheduledDeliveryDate);
        if (!isNaN(date.getTime())) {
          estimatedDelivery = date.toISOString().split('T')[0];
          console.log('📅 Found scheduledDeliveryDate:', estimatedDelivery);
        }
      } else if (shipmentData.ScheduledDeliveryDate) {
        const date = new Date(shipmentData.ScheduledDeliveryDate);
        if (!isNaN(date.getTime())) {
          estimatedDelivery = date.toISOString().split('T')[0];
          console.log('📅 Found ScheduledDeliveryDate:', estimatedDelivery);
        }
      } else if (shipmentData.deliveryDate) {
        const date = new Date(shipmentData.deliveryDate);
        if (!isNaN(date.getTime())) {
          estimatedDelivery = date.toISOString().split('T')[0];
          console.log('📅 Found deliveryDate:', estimatedDelivery);
        }
      } else if (shipmentData.estimatedDeliveryDate) {
        const date = new Date(shipmentData.estimatedDeliveryDate);
        if (!isNaN(date.getTime())) {
          estimatedDelivery = date.toISOString().split('T')[0];
          console.log('📅 Found estimatedDeliveryDate:', estimatedDelivery);
        }
      } else if (packageData) {
        console.log('📋 Package data keys:', Object.keys(packageData));
        
        // Check package level for delivery date
        if (packageData.scheduledDeliveryDate) {
          const date = new Date(packageData.scheduledDeliveryDate);
          if (!isNaN(date.getTime())) {
            estimatedDelivery = date.toISOString().split('T')[0];
            console.log('📅 Found package scheduledDeliveryDate:', estimatedDelivery);
          }
        } else if (packageData.deliveryDate) {
          // Handle deliveryDate as array of objects (API response format)
          if (Array.isArray(packageData.deliveryDate) && packageData.deliveryDate.length > 0) {
            const deliveryDateObj = packageData.deliveryDate[0];
            if (deliveryDateObj.date) {
              // UPS date format: YYYYMMDD (e.g., '20240905')
              const dateStr = deliveryDateObj.date;
              const year = dateStr.substring(0, 4);
              const month = dateStr.substring(4, 6);
              const day = dateStr.substring(6, 8);
              // Create date in local timezone to avoid UTC conversion issues
              const localDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
              estimatedDelivery = localDate.toISOString().split('T')[0];
              console.log('📅 Found package deliveryDate array:', estimatedDelivery);
            }
          } else if (typeof packageData.deliveryDate === 'string' && packageData.deliveryDate.length === 8) {
            // Handle webhook-style date format: '20240905'
            const dateStr = packageData.deliveryDate;
            const year = dateStr.substring(0, 4);
            const month = dateStr.substring(4, 6);
            const day = dateStr.substring(6, 8);
            // Create date in local timezone to avoid UTC conversion issues
            const localDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            estimatedDelivery = localDate.toISOString().split('T')[0];
            console.log('📅 Found package deliveryDate webhook format:', estimatedDelivery);
          } else {
            // Handle standard date format
            const date = new Date(packageData.deliveryDate);
            if (!isNaN(date.getTime())) {
              estimatedDelivery = date.toISOString().split('T')[0];
              console.log('📅 Found package deliveryDate string:', estimatedDelivery);
            }
          }
        } else if (packageData.estimatedDeliveryDate) {
          const date = new Date(packageData.estimatedDeliveryDate);
          if (!isNaN(date.getTime())) {
            estimatedDelivery = date.toISOString().split('T')[0];
            console.log('📅 Found package estimatedDeliveryDate:', estimatedDelivery);
          }
        } else if (packageData.ScheduledDeliveryDate) {
          const date = new Date(packageData.ScheduledDeliveryDate);
          if (!isNaN(date.getTime())) {
            estimatedDelivery = date.toISOString().split('T')[0];
            console.log('📅 Found package ScheduledDeliveryDate:', estimatedDelivery);
          }
        } else if (packageData.DeliveryDate) {
          const date = new Date(packageData.DeliveryDate);
          if (!isNaN(date.getTime())) {
            estimatedDelivery = date.toISOString().split('T')[0];
            console.log('📅 Found package DeliveryDate:', estimatedDelivery);
          }
        } else if (packageData.EstimatedDeliveryDate) {
          const date = new Date(packageData.EstimatedDeliveryDate);
          if (!isNaN(date.getTime())) {
            estimatedDelivery = date.toISOString().split('T')[0];
            console.log('📅 Found package EstimatedDeliveryDate:', estimatedDelivery);
          }
        }
      }
      
      if (!estimatedDelivery) {
        console.log('❌ No delivery date found in UPS response');
        console.log('📋 Full shipment data:', JSON.stringify(shipmentData, null, 2));
      }

      // Parse delivery time window if available
      let deliveryTimeWindow = undefined;
      if (packageData?.deliveryDate && Array.isArray(packageData.deliveryDate)) {
        const deliveryDateObj = packageData.deliveryDate[0];
        if (deliveryDateObj.deliveryStartTime && deliveryDateObj.deliveryEndTime) {
          // Convert UPS time format (HHMMSS) to readable format
          const startTime = deliveryDateObj.deliveryStartTime;
          const endTime = deliveryDateObj.deliveryEndTime;
          const startHour = startTime.substring(0, 2);
          const startMin = startTime.substring(2, 4);
          const endHour = endTime.substring(0, 2);
          const endMin = endTime.substring(2, 4);
          
          deliveryTimeWindow = {
            estimated: {
              starts: `${startHour}:${startMin}`,
              ends: `${endHour}:${endMin}`
            }
          };
          console.log('📅 Found delivery time window:', deliveryTimeWindow);
        }
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
        shipmentType: shipment.ShipmentType?.Description,
        // Delivery time window
        deliveryTimeWindow: deliveryTimeWindow
      };

    } catch (error) {
      console.error('❌ Error parsing UPS response:', error);
      throw error;
    }
  }

  private formatLocation(address: any): string {
    if (!address) return 'Unknown';
    
    // Handle both uppercase and lowercase field names
    const city = address.city || address.City;
    const state = address.stateProvince || address.StateProvince || address.StateProvinceCode;
    const country = address.country || address.Country || address.CountryCode;
    
    const parts = [city, state, country].filter(Boolean);
    
    return parts.length > 0 ? parts.join(', ') : 'Unknown';
  }

  private mapUPSStatus(statusCode?: string): 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'unknown' {
    if (!statusCode) return 'unknown';
    
    switch (statusCode) {
      case 'OR': // Origin Scan
      case 'PU': // Picked Up
      case '160': // Origin Scan
        return 'shipped';
      case 'DP': // Departed
      case 'AR': // Arrived
      case 'IT': // In Transit
      case '005': // In Transit
        return 'in_transit';
      case 'OD': // Out for Delivery
        return 'out_for_delivery';
      case 'DL': // Delivered
        return 'delivered';
      case 'EX': // Exception
      case 'X': // Exception
      case 'CA': // Cancelled
      case '092': // Customs clearance
      case '048': // Delay
      case '08': // Exception
      case 'XD': // Drop-Off
      case '167': // Drop-Off
      case 'MP': // Label created
      case '003': // Label created
        return 'exception';
      default:
        return 'unknown';
    }
  }

  private formatUPSTimestamp(date: string, time: string): string {
    if (!date || !time) return new Date().toISOString();
    
    try {
      // UPS date format: YYYYMMDD, time format: HHMMSS
      // UPS already provides times in destination timezone (GMT-04:00)
      const year = date.substring(0, 4);
      const month = date.substring(4, 6);
      const day = date.substring(6, 8);
      const hour = time.substring(0, 2);
      const minute = time.substring(2, 4);
      const second = time.substring(4, 6);
      
      // Create date directly - UPS times are already in local timezone
      const localDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
      
      return localDate.toISOString();
    } catch (error) {
      console.error('❌ Error formatting UPS timestamp:', error);
      return new Date().toISOString();
    }
  }
}
