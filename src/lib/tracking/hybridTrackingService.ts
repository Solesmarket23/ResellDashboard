import { trackingService } from './trackingService';
import { webhookManager } from './webhookManager';
import { TrackingInfo } from './trackingService';

// Hybrid tracking service that combines free and premium services
export class HybridTrackingService {
  private freeTierLimit = 100; // AfterShip free tier
  private premiumThreshold = 500; // When to consider FedEx Advanced
  private currentUsage = 0;
  
  // Track usage for cost optimization
  private usageTracker = {
    monthlyRequests: 0,
    lastReset: new Date(),
    highValueShipments: 0,
    regularShipments: 0
  };
  
  async getTrackingInfo(trackingNumber: string, carrier?: string, isHighValue: boolean = false): Promise<TrackingInfo> {
    // Reset monthly counter if needed
    this.resetMonthlyCounterIfNeeded();
    
    // Check if we should use premium service
    const shouldUsePremium = this.shouldUsePremiumService(trackingNumber, isHighValue);
    
    if (shouldUsePremium) {
      console.log(`🚀 Using premium tracking for: ${trackingNumber}`);
      return await this.getPremiumTrackingInfo(trackingNumber, carrier);
    } else {
      console.log(`💰 Using free tracking for: ${trackingNumber}`);
      return await this.getFreeTrackingInfo(trackingNumber, carrier);
    }
  }
  
  private async getFreeTrackingInfo(trackingNumber: string, carrier?: string): Promise<TrackingInfo> {
    this.usageTracker.monthlyRequests++;
    this.usageTracker.regularShipments++;
    
    // Use AfterShip free tier
    return await trackingService.getTrackingInfo(trackingNumber, carrier);
  }
  
  private async getPremiumTrackingInfo(trackingNumber: string, carrier?: string): Promise<TrackingInfo> {
    this.usageTracker.monthlyRequests++;
    this.usageTracker.highValueShipments++;
    
    // Try webhook-based tracking first (if available)
    const webhookInfo = await this.getWebhookTrackingInfo(trackingNumber);
    if (webhookInfo) {
      return webhookInfo;
    }
    
    // Fallback to API-based tracking
    return await trackingService.getTrackingInfo(trackingNumber, carrier);
  }
  
  private async getWebhookTrackingInfo(trackingNumber: string): Promise<TrackingInfo | null> {
    // Check if we have webhook data for this tracking number
    // This would query your database for recent webhook updates
    return null; // Placeholder - implement based on your webhook data storage
  }
  
  private shouldUsePremiumService(trackingNumber: string, isHighValue: boolean): boolean {
    // Use premium service for:
    // 1. High-value shipments
    // 2. When we're under the free tier limit
    // 3. Critical shipments (express, overnight, etc.)
    
    if (isHighValue) return true;
    if (this.usageTracker.monthlyRequests < this.freeTierLimit) return false;
    if (this.isCriticalShipment(trackingNumber)) return true;
    
    return false;
  }
  
  private isCriticalShipment(trackingNumber: string): boolean {
    // Check if this is an express/overnight shipment
    // This could be based on tracking number format, carrier, or other indicators
    return false; // Placeholder
  }
  
  private resetMonthlyCounterIfNeeded(): void {
    const now = new Date();
    const lastReset = this.usageTracker.lastReset;
    
    // Reset if it's a new month
    if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
      this.usageTracker.monthlyRequests = 0;
      this.usageTracker.highValueShipments = 0;
      this.usageTracker.regularShipments = 0;
      this.usageTracker.lastReset = now;
      
      console.log('📊 Monthly usage counter reset');
    }
  }
  
  // Cost analysis and recommendations
  getCostAnalysis() {
    const monthlyRequests = this.usageTracker.monthlyRequests;
    const highValueCount = this.usageTracker.highValueShipments;
    const regularCount = this.usageTracker.regularShipments;
    
    const analysis = {
      currentUsage: {
        totalRequests: monthlyRequests,
        highValueShipments: highValueCount,
        regularShipments: regularCount,
        freeTierRemaining: Math.max(0, this.freeTierLimit - monthlyRequests)
      },
      costBreakdown: {
        currentCost: 0, // AfterShip free tier
        projectedMonthlyCost: this.calculateProjectedCost(monthlyRequests),
        savings: this.calculateSavings(monthlyRequests)
      },
      recommendations: this.getRecommendations(monthlyRequests, highValueCount)
    };
    
    return analysis;
  }
  
  private calculateProjectedCost(monthlyRequests: number): number {
    if (monthlyRequests <= 100) return 0; // AfterShip free
    if (monthlyRequests <= 7500) return 199; // FedEx Advanced tier 1
    if (monthlyRequests <= 30000) return 599; // FedEx Advanced tier 2
    if (monthlyRequests <= 50000) return 999; // FedEx Advanced tier 3
    if (monthlyRequests <= 75000) return 1499; // FedEx Advanced tier 4
    return monthlyRequests * 0.02; // Pay-per-use
  }
  
  private calculateSavings(monthlyRequests: number): number {
    // Calculate savings from using hybrid approach vs full premium
    const fullPremiumCost = this.calculateProjectedCost(monthlyRequests);
    const hybridCost = this.calculateHybridCost(monthlyRequests);
    return fullPremiumCost - hybridCost;
  }
  
  private calculateHybridCost(monthlyRequests: number): number {
    // Hybrid cost: AfterShip free tier + selective premium usage
    const freeUsage = Math.min(monthlyRequests, 100);
    const premiumUsage = Math.max(0, monthlyRequests - 100);
    
    if (premiumUsage === 0) return 0;
    if (premiumUsage <= 7400) return 199; // FedEx Advanced tier 1
    // Add more tiers as needed
    return 199; // Simplified for now
  }
  
  private getRecommendations(monthlyRequests: number, highValueCount: number): string[] {
    const recommendations = [];
    
    if (monthlyRequests < 100) {
      recommendations.push("✅ Stay with AfterShip free tier - no additional cost needed");
    } else if (monthlyRequests < 500) {
      recommendations.push("💡 Consider AfterShip paid plan ($9/month) for more requests");
      recommendations.push("💡 Only use FedEx Advanced for high-value shipments");
    } else if (monthlyRequests < 1000) {
      recommendations.push("🚀 FedEx Advanced Integrated Visibility ($199/month) would be cost-effective");
      recommendations.push("💡 Use hybrid approach: AfterShip for regular, FedEx for premium");
    } else {
      recommendations.push("🚀 FedEx Advanced Integrated Visibility is definitely worth it");
      recommendations.push("💡 Consider account-wide webhooks for maximum efficiency");
    }
    
    if (highValueCount > 0) {
      recommendations.push("⭐ High-value shipments detected - premium tracking recommended");
    }
    
    return recommendations;
  }
  
  // Webhook management for premium features
  async setupWebhookForHighValueShipments(): Promise<string> {
    const webhookId = await webhookManager.registerWebhook({
      carrier: 'fedex',
      accountNumber: process.env.FEDEX_ACCOUNT_NUMBER,
      webhookUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/tracking/webhook/fedex`,
      events: ['delivery', 'exception', 'picture_proof'],
      active: true
    });
    
    console.log(`🔗 Webhook registered for high-value shipments: ${webhookId}`);
    return webhookId;
  }
}

// Export singleton instance
export const hybridTrackingService = new HybridTrackingService();
