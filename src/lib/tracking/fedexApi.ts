import { TrackingInfo, TrackingUpdate } from './trackingService';
import { FedExAuthService } from './fedexAuth';

export interface FedExTrackingRequest {
  includeDetailedScans: boolean;
  trackingInfo: {
    trackingNumberInfo: {
      trackingNumber: string;
    };
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
        // Key addition: dateAndTimes array for precise delivery date extraction
        dateAndTimes: Array<{
          dateTime: string;
          type: 'ACTUAL_DELIVERY' | 'ESTIMATED_DELIVERY' | 'COMMITMENT' | 'APPOINTMENT_DELIVERY' | 'ACTUAL_PICKUP' | 'ACTUAL_TENDER' | 'ANTICIPATED_TENDER' | 'ATTEMPTED_DELIVERY' | 'ESTIMATED_ARRIVAL_AT_GATEWAY' | 'ESTIMATED_PICKUP' | 'ESTIMATED_RETURN_TO_STATION' | 'SHIP' | 'SHIPMENT_DATA_RECEIVED';
        }>;
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
            trackingNumberInfo: {
              trackingNumber: trackingNumber
            }
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
        if (response.status === 429) {
          const hint = this.parse429RetryHint(errorText);
          throw new Error(`FedEx rate limit or quota exceeded. ${hint} Original: ${errorText}`);
        }
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

  /**
   * Parse FedEx 429 body for a user-friendly retry hint.
   * - Daily quota: "Retry after 12:00AM GMT"
   * - Rate limit: "Retry after 10 seconds" / "too many requests in a short duration"
   */
  private parse429RetryHint(errorText: string): string {
    const lower = errorText.toLowerCase();
    if (lower.includes('daily') && lower.includes('quota')) return 'Daily quota exceeded. Retry after 12:00 AM GMT.';
    if (lower.includes('per project') && lower.includes('quota')) return 'Project daily quota exceeded. Retry after 12:00 AM GMT.';
    if (lower.includes('rate limit') || lower.includes('short duration')) return 'Rate limit exceeded. Retry after 10 seconds.';
    return 'Retry later.';
  }

  private parseTrackingResponse(response: FedExTrackingResponse, trackingNumber: string): TrackingInfo {
    try {
      const complete = Array.isArray((response as any)?.output?.completeTrackResults)
        ? ((response as any).output.completeTrackResults as any[])
        : [];

      // Prefer the matching trackingNumber result if present, else fall back to first.
      const matching = complete.find((c: any) => String(c?.trackingNumber || '').trim() === String(trackingNumber).trim());
      const trackResults =
        (matching?.trackResults && Array.isArray(matching.trackResults) ? matching.trackResults[0] : null) ||
        (complete[0]?.trackResults && Array.isArray(complete[0].trackResults) ? complete[0].trackResults[0] : null);
      
      if (!trackResults) {
        throw new Error('No tracking results found');
      }

      // Parse scan events into tracking updates
      const scanEvents = Array.isArray((trackResults as any).scanEvents) ? ((trackResults as any).scanEvents as any[]) : [];
      const dateAndTimes = Array.isArray((trackResults as any).dateAndTimes) ? ((trackResults as any).dateAndTimes as any[]) : [];

      // If FedEx indicates there are no associated shipments, treat as not-found.
      const hasAssociatedShipments = (trackResults as any)?.additionalTrackingInfo?.hasAssociatedShipments;
      const rawStatusCode = String((trackResults as any)?.statusCode || (trackResults as any)?.statusDetail?.code || '').trim();
      const rawStatusText = String(
        (trackResults as any)?.statusDetail?.description ||
          (trackResults as any)?.statusDetail?.statusByLocale ||
          (trackResults as any)?.statusDescription ||
          ''
      ).trim();
      const lowerStatusText = rawStatusText.toLowerCase();

      const looksLikeNotFoundText =
        lowerStatusText.includes('not found') ||
        lowerStatusText.includes('no record') ||
        lowerStatusText.includes('no records') ||
        lowerStatusText.includes('no shipment') ||
        lowerStatusText.includes('unable to locate') ||
        lowerStatusText.includes('invalid tracking') ||
        lowerStatusText.includes('invalid number') ||
        lowerStatusText.includes('invalid') && lowerStatusText.includes('tracking');

      const isEffectivelyNotFound =
        hasAssociatedShipments === false &&
        scanEvents.length === 0 &&
        dateAndTimes.length === 0 &&
        (!rawStatusCode || rawStatusCode.toUpperCase() === 'UNKNOWN');

      // Also treat as not-found when FedEx returns an "UNKNOWN" + empty payload with a not-found-ish status message.
      const isEmptyPayload =
        scanEvents.length === 0 &&
        dateAndTimes.length === 0 &&
        !(trackResults as any)?.estimatedDeliveryTimeWindow?.window &&
        !(trackResults as any)?.standardTransitTimeWindow?.window &&
        !(trackResults as any)?.deliveryDetails?.actualDeliveryTimestamp;
      const isUnknownStatus = !rawStatusCode || rawStatusCode.toUpperCase() === 'UNKNOWN';
      const isNotFound = isEffectivelyNotFound || (isEmptyPayload && isUnknownStatus && looksLikeNotFoundText);

      if (isNotFound) {
        return {
          trackingNumber,
          carrier: 'FedEx',
          status: 'unknown',
          lastUpdate: new Date().toISOString(),
          updates: [],
          error: 'Tracking not found'
        };
      }

      const updates: TrackingUpdate[] = scanEvents.map((scan: any) => ({
        timestamp: scan.date,
        location: this.formatLocation(scan.scanLocation),
        status: this.mapFedExStatus(scan.eventType, scan.eventDescription),
        description: scan.eventDescription,
        details: {
          eventType: scan.eventType,
          exceptionCode: scan.exceptionCode,
          exceptionDescription: scan.exceptionDescription
        }
      }));

      // Sort updates by timestamp (newest first)
      updates.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Determine current status:
      // Prefer derivedCode if present (more consistent), then statusCode, then statusDetail.code.
      let currentStatus = this.mapFedExStatus(
        (trackResults as any)?.statusDetail?.derivedCode ||
          (trackResults as any)?.statusCode ||
          (trackResults as any)?.statusDetail?.code ||
          'UNKNOWN',
        rawStatusText
      );
      // If FedEx gives us an unfamiliar status code but we have scan events, infer status from the newest scan.
      // This fixes cases where the top-level status code is "UNKNOWN"/non-mapped while scan text clearly indicates "Arrived", "In transit", etc.
      const newestScanStatus = (updates[0]?.status as TrackingInfo['status'] | undefined) || undefined;
      if (currentStatus === 'unknown' && newestScanStatus && newestScanStatus !== 'unknown') {
        currentStatus = newestScanStatus;
      }
      
      // Get delivery dates from dateAndTimes array (most reliable method)
      // Debug: Log all available date types from FedEx API
      console.log(`📅 FedEx dateAndTimes for ${trackingNumber}:`, 
        dateAndTimes.map(dt => `${dt.type}: ${dt.dateTime}`).join(', '));

      const toDate = (raw: unknown): string | null => {
        if (!raw) return null;
        const dt = new Date(String(raw));
        return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
      };

      const pickDateAndTimes = (types: string[]): { date: string | null; from: string | null } => {
        for (const t of types) {
          const raw = dateAndTimes.find((dt: any) => dt?.type === t)?.dateTime;
          const parsed = toDate(raw);
          if (parsed) return { date: parsed, from: t };
        }
        return { date: null, from: null };
      };

      // Step 1: Prefer explicit FedEx dateAndTimes (best)
      const eta1 = pickDateAndTimes(['ESTIMATED_DELIVERY', 'COMMITMENT', 'APPOINTMENT_DELIVERY', 'ESTIMATED_RETURN_TO_STATION']);

      // Step 2: Fallback to time windows (often present even when dateAndTimes is empty)
      const windowEnds =
        (trackResults as any)?.estimatedDeliveryTimeWindow?.window?.ends ||
        (trackResults as any)?.estimatedDeliveryTimeWindow?.window?.starts ||
        (trackResults as any)?.standardTransitTimeWindow?.window?.ends ||
        (trackResults as any)?.standardTransitTimeWindow?.window?.starts;
      const eta2 = toDate(windowEnds);

      // Step 3: Last-resort fallback: if we have scan events, use the newest scan date as a weak proxy
      const newestScanIso = updates[0]?.timestamp ? toDate(updates[0].timestamp) : null;

      const estimatedDeliveryDate = eta1.date || eta2 || null;
      const estimatedFrom = eta1.from || (eta2 ? 'TIME_WINDOW' : newestScanIso ? 'SCAN_EVENT' : null);

      console.log(`🎯 Using estimated delivery: ${estimatedDeliveryDate || 'none'} (from ${estimatedFrom || 'none'})`);
      
      // Find actual delivery date
      const actualDeliveryDate = dateAndTimes.find(dt => 
        dt.type === 'ACTUAL_DELIVERY'
      )?.dateTime;

      // Find commitment date (original scheduled delivery)
      const commitmentDate = dateAndTimes.find(dt => 
        dt.type === 'COMMITMENT'
      )?.dateTime;

      // Find appointment delivery date
      const appointmentDeliveryDate = dateAndTimes.find(dt => 
        dt.type === 'APPOINTMENT_DELIVERY'
      )?.dateTime;

      // Fallback to time windows if dateAndTimes not available
      const estimatedDelivery = estimatedDeliveryDate || 
                               trackResults.estimatedDeliveryTimeWindow?.window?.starts || 
                               trackResults.standardTransitTimeWindow?.window?.starts;

      // Fallback to deliveryDetails if dateAndTimes not available
      const actualDelivery = actualDeliveryDate || 
                            trackResults.deliveryDetails?.actualDeliveryTimestamp;

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
        weightUnit: trackResults.packageDetails?.weightAndDimensions?.weight?.[0]?.unit,
        // Enhanced delivery date information
        commitmentDate: commitmentDate ? new Date(commitmentDate).toISOString().split('T')[0] : undefined,
        appointmentDeliveryDate: appointmentDeliveryDate ? new Date(appointmentDeliveryDate).toISOString().split('T')[0] : undefined,
        deliveryTimeWindow: {
          estimated: trackResults.estimatedDeliveryTimeWindow?.window ? {
            starts: trackResults.estimatedDeliveryTimeWindow.window.starts,
            ends: trackResults.estimatedDeliveryTimeWindow.window.ends
          } : undefined,
          actual: trackResults.actualDeliveryTimeWindow?.window ? {
            starts: trackResults.actualDeliveryTimeWindow.window.starts,
            ends: trackResults.actualDeliveryTimeWindow.window.ends
          } : undefined
        },
        deliveryDetails: trackResults.deliveryDetails ? {
          location: trackResults.deliveryDetails.deliveryLocation,
          signatureName: trackResults.deliveryDetails.deliverySignatureName,
          serviceArea: trackResults.deliveryDetails.deliveryServiceArea,
          serviceAreaDescription: trackResults.deliveryDetails.deliveryServiceAreaDescription,
          locationDescription: trackResults.deliveryDetails.deliveryLocationDescription,
          deliveryToday: false, // This would need to be calculated based on current date vs delivery date
          deliveryAttempts: '0' // This would need to be extracted from scan events
        } : undefined
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

  private mapFedExStatus(fedexStatus: string, statusText?: string): TrackingInfo['status'] {
    const code = String(fedexStatus || '').trim().toUpperCase();
    const text = String(statusText || '').trim().toLowerCase();

    // Common FedEx codes (not exhaustive, but covers most real-world scans/statuses)
    const statusMap: Record<string, TrackingInfo['status']> = {
      // Picked up / tendered / shipped
      OC: 'shipped', // Origin scan
      DP: 'shipped', // Departed origin
      PU: 'shipped', // Picked up
      SH: 'shipped', // Shipped
      SR: 'shipped', // Shipment information sent / label created-ish
      SE: 'exception', // Shipment exception

      // In transit / arrived / departed hubs
      IT: 'in_transit', // In transit
      AR: 'in_transit', // Arrived
      AD: 'in_transit', // At destination / facility
      AA: 'in_transit',
      AE: 'in_transit', // Arriving early (FedEx uses AE for some "arriving early" updates)
      FD: 'in_transit',

      // Out for delivery
      OD: 'out_for_delivery',
      ODL: 'out_for_delivery',

      // Delivered
      DL: 'delivered',
      DE: 'delivered',

      // Exceptions / holds / cancellations
      EX: 'exception',
      CA: 'exception',
      CD: 'exception',
      HL: 'exception',
      DY: 'exception',

      UNKNOWN: 'unknown',
    };

    if (statusMap[code]) return statusMap[code];

    // Heuristic fallback from human-readable text/description
    if (text.includes('delivered')) return 'delivered';
    if (text.includes('out for delivery') || text.includes('on fedex vehicle')) return 'out_for_delivery';
    if (
      text.includes('in transit') ||
      text.includes('departed') ||
      text.includes('arrived') ||
      text.includes('arriving early') ||
      text.includes('at local') ||
      text.includes('at destination') ||
      text.includes('at fedex')
    )
      return 'in_transit';
    if (text.includes('picked up') || text.includes('shipment information sent') || text.includes('label created'))
      return 'shipped';
    if (text.includes('exception') || text.includes('delayed') || text.includes('held') || text.includes('returned'))
      return 'exception';

    return 'unknown';
  }

  // Method to check if tracking number is valid FedEx format
  detectTrackingNumber(trackingNumber: string): boolean {
    // FedEx tracking numbers are typically 12-15 digits
    return /^[0-9]{12,15}$/.test(trackingNumber);
  }
}
