/**
 * Status Priority System for Order Consolidation
 * 
 * When multiple emails exist for the same order, we use a hierarchy system
 * to determine which status should be displayed. Higher priority = more important status.
 * 
 * Priority Order (highest to lowest):
 * 1. Refund Issued - Order was refunded (highest priority)
 * 2. Delivered - Order has been delivered
 * 3. Shipped - Order has been shipped
 * 4. Ordered - Order was placed (lowest priority)
 */

export const STATUS_PRIORITIES: Record<string, number> = {
  'Refund Issued': 10,
  'Refunded': 10,
  'Canceled': 10, // Treat canceled same as refunded
  'Delivered': 8,
  'delivered': 8,
  'Shipped': 6,
  'shipped': 6,
  'Ordered': 4,
  'ordered': 4,
  'Order Placed': 4,
  'Verified': 3, // Order verified but not yet shipped
  'Delayed': 2, // Order delayed (lower than ordered since it's still in progress)
};

/**
 * Get priority for a status (defaults to 1 if unknown)
 */
export function getStatusPriority(status: string): number {
  return STATUS_PRIORITIES[status] || STATUS_PRIORITIES[status.toLowerCase()] || 1;
}

/**
 * Compare two statuses and return which has higher priority
 * Returns: 1 if statusA > statusB, -1 if statusA < statusB, 0 if equal
 */
export function compareStatusPriority(statusA: string, statusB: string): number {
  const priorityA = getStatusPriority(statusA);
  const priorityB = getStatusPriority(statusB);
  
  if (priorityA > priorityB) return 1;
  if (priorityA < priorityB) return -1;
  return 0;
}

/**
 * Get the highest priority status from an array of statuses
 */
export function getHighestPriorityStatus(statuses: string[]): string {
  if (statuses.length === 0) return 'Ordered';
  
  return statuses.reduce((highest, current) => {
    return compareStatusPriority(current, highest) > 0 ? current : highest;
  }, statuses[0]);
}

/**
 * Consolidate multiple purchases with the same order number
 * Keeps the purchase with the highest priority status and merges useful data
 */
export function consolidatePurchasesByOrderNumber(purchases: any[]): any[] {
  const orderMap = new Map<string, any[]>();
  
  // Group purchases by order number
  purchases.forEach((purchase) => {
    const orderNumber = purchase.orderNumber || purchase.order_number;
    if (!orderNumber) return;
    
    if (!orderMap.has(orderNumber)) {
      orderMap.set(orderNumber, []);
    }
    orderMap.get(orderNumber)!.push(purchase);
  });
  
  const consolidatedPurchases: any[] = [];
  
  for (const [orderNumber, orderPurchases] of orderMap.entries()) {
    if (orderPurchases.length === 1) {
      consolidatedPurchases.push(orderPurchases[0]);
    } else {
      // Sort by priority (highest first)
      const sortedPurchases = orderPurchases.sort((a, b) => {
        const statusA = a.status || a.shipping_status || 'Ordered';
        const statusB = b.status || b.shipping_status || 'Ordered';
        return compareStatusPriority(statusB, statusA);
      });
      
      // Use the highest priority purchase as the base
      const primaryPurchase = { ...sortedPurchases[0] };
      
      // Find the order confirmation email (ordered status) for purchase date
      const orderConfirmationEmail = sortedPurchases.find(p => {
        const status = (p.status || p.shipping_status || '').toLowerCase();
        return status === 'ordered' || status === 'order placed';
      });
      
      // Set purchase date from order confirmation email (if found)
      if (orderConfirmationEmail) {
        // Use existing purchaseDate if it's already formatted, otherwise format from email_date
        if (orderConfirmationEmail.purchaseDate) {
          primaryPurchase.purchaseDate = orderConfirmationEmail.purchaseDate;
        } else if (orderConfirmationEmail.email_date) {
          const emailDate = new Date(orderConfirmationEmail.email_date);
          primaryPurchase.purchaseDate = emailDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } else if (orderConfirmationEmail.createdAt) {
          const emailDate = new Date(orderConfirmationEmail.createdAt);
          primaryPurchase.purchaseDate = emailDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        primaryPurchase.email_date = orderConfirmationEmail.email_date || orderConfirmationEmail.createdAt;
      } else {
        // Fallback: use the earliest email date as purchase date
        const dates = sortedPurchases
          .map(p => new Date(p.email_date || p.createdAt || 0))
          .filter(d => !isNaN(d.getTime()));
        if (dates.length > 0) {
          const earliestDate = new Date(Math.min(...dates.map(d => d.getTime())));
          const earliestPurchase = sortedPurchases.find(p => {
            const pDate = new Date(p.email_date || p.createdAt || 0);
            return !isNaN(pDate.getTime()) && pDate.getTime() === earliestDate.getTime();
          });
          if (earliestPurchase) {
            if (earliestPurchase.purchaseDate) {
              primaryPurchase.purchaseDate = earliestPurchase.purchaseDate;
            } else if (earliestPurchase.email_date) {
              const emailDate = new Date(earliestPurchase.email_date);
              primaryPurchase.purchaseDate = emailDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            } else if (earliestPurchase.createdAt) {
              const emailDate = new Date(earliestPurchase.createdAt);
              primaryPurchase.purchaseDate = emailDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }
          }
        }
      }
      
      // Merge useful data from other purchases (e.g., tracking numbers, updated dates)
      for (let i = 1; i < sortedPurchases.length; i++) {
        const otherPurchase = sortedPurchases[i];
        
        // If this purchase has tracking and primary doesn't, use it
        if (otherPurchase.tracking && !primaryPurchase.tracking) {
          primaryPurchase.tracking = otherPurchase.tracking;
          primaryPurchase.carrier = otherPurchase.carrier;
        }
        
        // Keep the most recent email_date for display (but purchaseDate stays from order confirmation)
        const otherDate = new Date(otherPurchase.email_date || otherPurchase.createdAt || 0);
        const primaryDate = new Date(primaryPurchase.email_date || primaryPurchase.createdAt || 0);
        if (otherDate > primaryDate && !orderConfirmationEmail) {
          // Only update email_date if we didn't find an order confirmation email
          primaryPurchase.email_date = otherPurchase.email_date;
        }
      }
      
      // Add metadata about consolidation
      primaryPurchase.consolidatedFrom = sortedPurchases.length;
      primaryPurchase.allStatuses = sortedPurchases.map(p => 
        p.status || p.shipping_status || 'Ordered'
      );
      
      consolidatedPurchases.push(primaryPurchase);
    }
  }
  
  return consolidatedPurchases;
}

