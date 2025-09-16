// Delivery arrival logging system
export interface DeliveryArrival {
  id: string;
  purchaseId: string;
  trackingNumber: string;
  carrier: string;
  productName: string;
  productBrand: string;
  productSize: string;
  status: 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'unknown';
  estimatedArrival: string;
  actualArrival?: string;
  arrivalWindow?: {
    start: string;
    end: string;
  };
  location: {
    current: string;
    destination: string;
    origin: string;
  };
  lastUpdate: string;
  updates: DeliveryUpdate[];
  arrivalNotifications: ArrivalNotification[];
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryUpdate {
  id: string;
  timestamp: string;
  location: string;
  status: string;
  description: string;
  isArrivalUpdate: boolean;
  arrivalProbability?: number; // 0-100% chance of arrival
  estimatedTimeToArrival?: string; // "2 hours", "1 day", etc.
}

export interface ArrivalNotification {
  id: string;
  type: 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'delayed' | 'exception';
  message: string;
  timestamp: string;
  sent: boolean;
  deliveryMethod: 'email' | 'push' | 'sms' | 'in_app';
}

export class DeliveryArrivalLogger {
  private arrivals = new Map<string, DeliveryArrival>();
  private notificationQueue: ArrivalNotification[] = [];
  
  // Create or update delivery arrival record
  async logDeliveryArrival(purchase: any, trackingInfo: any): Promise<DeliveryArrival> {
    const arrivalId = `arrival_${purchase.id}_${Date.now()}`;
    
    // Calculate arrival probability and estimated time
    const arrivalAnalysis = this.analyzeArrivalProbability(trackingInfo);
    
    // Create delivery update
    const deliveryUpdate: DeliveryUpdate = {
      id: `update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: trackingInfo.lastUpdate || new Date().toISOString(),
      location: trackingInfo.updates?.[0]?.location || 'Unknown',
      status: trackingInfo.status,
      description: trackingInfo.updates?.[0]?.description || 'Status update',
      isArrivalUpdate: this.isArrivalUpdate(trackingInfo.status),
      arrivalProbability: arrivalAnalysis.probability,
      estimatedTimeToArrival: arrivalAnalysis.estimatedTime
    };
    
    // Get or create arrival record
    let arrival = this.arrivals.get(purchase.id);
    
    if (!arrival) {
      arrival = {
        id: arrivalId,
        purchaseId: purchase.id,
        trackingNumber: trackingInfo.trackingNumber,
        carrier: trackingInfo.carrier,
        productName: purchase.product?.name || purchase.productName || 'Unknown Product',
        productBrand: purchase.product?.brand || purchase.brand || 'Unknown Brand',
        productSize: purchase.product?.size || purchase.size || 'Unknown Size',
        status: trackingInfo.status,
        estimatedArrival: this.calculateEstimatedArrival(trackingInfo),
        location: {
          current: trackingInfo.updates?.[0]?.location || 'Unknown',
          destination: trackingInfo.destination || 'Your Address',
          origin: trackingInfo.origin || 'Unknown'
        },
        lastUpdate: trackingInfo.lastUpdate || new Date().toISOString(),
        updates: [deliveryUpdate],
        arrivalNotifications: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    } else {
      // Update existing arrival
      arrival.status = trackingInfo.status;
      arrival.lastUpdate = trackingInfo.lastUpdate || new Date().toISOString();
      arrival.updates.unshift(deliveryUpdate); // Add to beginning
      arrival.updatedAt = new Date().toISOString();
      
      // Update location if changed
      if (trackingInfo.updates?.[0]?.location) {
        arrival.location.current = trackingInfo.updates[0].location;
      }
    }
    
    // Check for arrival notifications
    const notifications = this.generateArrivalNotifications(arrival, deliveryUpdate);
    arrival.arrivalNotifications.push(...notifications);
    
    // Add to notification queue
    this.notificationQueue.push(...notifications);
    
    // Store updated arrival
    this.arrivals.set(purchase.id, arrival);
    
    console.log(`📦 Logged delivery arrival for ${purchase.id}: ${arrival.status} (${arrivalAnalysis.probability}% arrival probability)`);
    
    return arrival;
  }
  
  // Analyze arrival probability based on tracking status and updates
  private analyzeArrivalProbability(trackingInfo: any): { probability: number; estimatedTime: string } {
    const status = trackingInfo.status;
    const updates = trackingInfo.updates || [];
    const lastUpdate = updates[0];
    
    let probability = 0;
    let estimatedTime = 'Unknown';
    
    switch (status) {
      case 'shipped':
        probability = 20;
        estimatedTime = '3-5 days';
        break;
      case 'in_transit':
        probability = 50;
        estimatedTime = '1-3 days';
        break;
      case 'out_for_delivery':
        probability = 90;
        estimatedTime = 'Today';
        break;
      case 'delivered':
        probability = 100;
        estimatedTime = 'Arrived';
        break;
      case 'exception':
        probability = 10;
        estimatedTime = 'Delayed';
        break;
      default:
        probability = 30;
        estimatedTime = '2-4 days';
    }
    
    // Adjust based on recent updates
    if (lastUpdate) {
      const updateAge = Date.now() - new Date(lastUpdate.timestamp).getTime();
      const hoursSinceUpdate = updateAge / (1000 * 60 * 60);
      
      if (hoursSinceUpdate > 24) {
        probability = Math.max(0, probability - 20); // Reduce probability if no recent updates
      } else if (hoursSinceUpdate < 2) {
        probability = Math.min(100, probability + 10); // Increase probability for recent updates
      }
    }
    
    return { probability, estimatedTime };
  }
  
  // Check if this is an arrival-related update
  private isArrivalUpdate(status: string): boolean {
    return ['out_for_delivery', 'delivered', 'exception'].includes(status);
  }
  
  // Calculate estimated arrival date
  private calculateEstimatedArrival(trackingInfo: any): string {
    if (trackingInfo.estimatedDelivery) {
      return trackingInfo.estimatedDelivery;
    }
    
    // Calculate based on status and current time
    const now = new Date();
    const estimated = new Date(now);
    
    switch (trackingInfo.status) {
      case 'shipped':
        estimated.setDate(estimated.getDate() + 5);
        break;
      case 'in_transit':
        estimated.setDate(estimated.getDate() + 3);
        break;
      case 'out_for_delivery':
        estimated.setDate(estimated.getDate() + 1);
        break;
      case 'delivered':
        return now.toISOString().split('T')[0];
      default:
        estimated.setDate(estimated.getDate() + 4);
    }
    
    return estimated.toISOString().split('T')[0];
  }
  
  // Generate arrival notifications
  private generateArrivalNotifications(arrival: DeliveryArrival, update: DeliveryUpdate): ArrivalNotification[] {
    const notifications: ArrivalNotification[] = [];
    
    // Check if this is a new status that warrants a notification
    const previousStatus = arrival.updates.length > 1 ? arrival.updates[1].status : null;
    
    if (update.status !== previousStatus) {
      const notification: ArrivalNotification = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: update.status as any,
        message: this.generateNotificationMessage(arrival, update),
        timestamp: new Date().toISOString(),
        sent: false,
        deliveryMethod: 'in_app'
      };
      
      notifications.push(notification);
    }
    
    // Special notifications for high-probability arrivals
    if (update.arrivalProbability && update.arrivalProbability >= 80) {
      const urgentNotification: ArrivalNotification = {
        id: `urgent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'out_for_delivery',
        message: `🚚 ${arrival.productName} is arriving soon! ${update.estimatedTimeToArrival}`,
        timestamp: new Date().toISOString(),
        sent: false,
        deliveryMethod: 'push'
      };
      
      notifications.push(urgentNotification);
    }
    
    return notifications;
  }
  
  // Generate notification message
  private generateNotificationMessage(arrival: DeliveryArrival, update: DeliveryUpdate): string {
    const productName = arrival.productName;
    const status = update.status;
    const location = update.location;
    
    switch (status) {
      case 'shipped':
        return `📦 ${productName} has been shipped and is on its way!`;
      case 'in_transit':
        return `🚛 ${productName} is in transit from ${location}`;
      case 'out_for_delivery':
        return `🚚 ${productName} is out for delivery and will arrive today!`;
      case 'delivered':
        return `✅ ${productName} has been delivered!`;
      case 'exception':
        return `⚠️ ${productName} delivery has been delayed`;
      default:
        return `📦 ${productName} status updated: ${status}`;
    }
  }
  
  // Get all arrivals
  getAllArrivals(): DeliveryArrival[] {
    return Array.from(this.arrivals.values());
  }
  
  // Get arrivals by status
  getArrivalsByStatus(status: string): DeliveryArrival[] {
    return this.getAllArrivals().filter(arrival => arrival.status === status);
  }
  
  // Get arrivals arriving today
  getArrivalsToday(): DeliveryArrival[] {
    const today = new Date().toISOString().split('T')[0];
    return this.getAllArrivals().filter(arrival => 
      arrival.estimatedArrival === today || 
      arrival.status === 'out_for_delivery'
    );
  }
  
  // Get arrivals arriving this week
  getArrivalsThisWeek(): DeliveryArrival[] {
    const today = new Date();
    const weekFromNow = new Date(today);
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    
    return this.getAllArrivals().filter(arrival => {
      const arrivalDate = new Date(arrival.estimatedArrival);
      return arrivalDate >= today && arrivalDate <= weekFromNow;
    });
  }
  
  // Get pending notifications
  getPendingNotifications(): ArrivalNotification[] {
    return this.notificationQueue.filter(notif => !notif.sent);
  }
  
  // Mark notification as sent
  markNotificationSent(notificationId: string): void {
    const notification = this.notificationQueue.find(n => n.id === notificationId);
    if (notification) {
      notification.sent = true;
    }
  }
  
  // Get arrival statistics
  getArrivalStats() {
    const arrivals = this.getAllArrivals();
    const today = new Date().toISOString().split('T')[0];
    
    return {
      total: arrivals.length,
      shipped: arrivals.filter(a => a.status === 'shipped').length,
      inTransit: arrivals.filter(a => a.status === 'in_transit').length,
      outForDelivery: arrivals.filter(a => a.status === 'out_for_delivery').length,
      delivered: arrivals.filter(a => a.status === 'delivered').length,
      arrivingToday: arrivals.filter(a => a.estimatedArrival === today).length,
      arrivingThisWeek: this.getArrivalsThisWeek().length,
      pendingNotifications: this.getPendingNotifications().length
    };
  }
}

// Export singleton instance
export const deliveryArrivalLogger = new DeliveryArrivalLogger();
