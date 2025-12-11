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
  'Order Canceled/Refunded': 10, // Backend uses this status name
  'Partially Refunded': 9, // Partial refund (higher than delivered, lower than full refund)
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
      // Only log consolidation if there are many duplicates (10+)
      const shouldLogDetails = orderPurchases.length >= 10;
      
      if (shouldLogDetails) {
        console.log(`🔄 Consolidating ${orderPurchases.length} emails for order ${orderNumber} (${orderPurchases.length} duplicates)`);
      }
      
      const sortedPurchases = orderPurchases.sort((a, b) => {
        const statusA = a.status || a.shipping_status || 'Ordered';
        const statusB = b.status || b.shipping_status || 'Ordered';
        const priorityA = getStatusPriority(statusA);
        const priorityB = getStatusPriority(statusB);
        return compareStatusPriority(statusB, statusA);
      });
      
      // Use the highest priority purchase as the base
      const primaryPurchase = { ...sortedPurchases[0] };
      const primaryStatus = primaryPurchase.status || primaryPurchase.shipping_status || 'Ordered';
      if (shouldLogDetails) {
        console.log(`   ✅ Kept: Status="${primaryStatus}", Subject="${(primaryPurchase.email_subject || primaryPurchase.subject || 'N/A').substring(0, 60)}"`);
      }
      // ALWAYS find the order confirmation email for purchase date
      // Check multiple ways to identify order confirmation emails:
      // PRIORITY: Subject match is most reliable (works even if email was miscategorized)
      // 1. Email subject contains order confirmation keywords (most reliable)
      // 2. Status is "ordered" or "order placed" (secondary check)
      // 3. Filename contains order confirmation patterns (tertiary check)
      // 4. Use earliest email date as fallback if no order confirmation found
      const orderConfirmationEmail = sortedPurchases.find(p => {
        // Remove emojis and normalize subject/filename for matching
        const normalizeText = (text: string) => text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        const rawSubject = (p.email_subject || p.subject || '').toLowerCase();
        const subject = normalizeText(rawSubject);
        const filename = normalizeText(p.filename || '');
        const status = (p.status || p.shipping_status || '').toLowerCase();
        
        // PRIORITY 1: Check subject line (most reliable - works even if email was miscategorized)
        // StockX order confirmations can have various formats:
        // - "Order Confirmed:", "Xpress Order Confirmed:", "Order Confirmation:"
        // - "Item Arrived For Verification" (StockX sends this when order is placed)
        // - Emoji variations like "👍 Order Confirmed:"
        const subjectMatch = subject.includes('order-confirmed') ||
                            subject.includes('order-confirmation') ||
                            subject.includes('xpress-order-confirmed') ||
                            subject.includes('item-arrived-for-verification') ||
                            rawSubject.includes('order confirmed') ||
                            rawSubject.includes('order confirmation') ||
                            rawSubject.includes('xpress order confirmed') ||
                            rawSubject.includes('item arrived for verification') ||
                            rawSubject.includes('purchase confirmed') ||
                            rawSubject.includes('👍 order') ||
                            rawSubject.includes('👍order');
        
        // PRIORITY 2: Check status - must be "ordered" or "order placed" (not "shipped" or "delivered")
        // But only if subject doesn't already match (to avoid false positives)
        const statusMatch = !subjectMatch && // Only check status if subject doesn't match
                           (status === 'ordered' || status === 'order placed') &&
                           status !== 'shipped' &&
                           status !== 'delivered';
        
        // PRIORITY 3: Check filename (normalized, emojis and spaces removed)
        const filenameMatch = !subjectMatch && // Only check filename if subject doesn't match
                             (filename.includes('order-confirmed') ||
                              filename.includes('order-confirmation') ||
                              filename.includes('xpress-order-confirmed'));
        
        const found = subjectMatch || statusMatch || filenameMatch;
        // Removed verbose logging - only log for orders with 10+ duplicates in parent scope
        return found;
      });
      
      // ALWAYS set purchase date from order confirmation email (if found)
      // This overwrites any purchase date that might have been set from the primary (shipped/delivered) email
      if (orderConfirmationEmail) {
        let purchaseDateSet = false;
        
        // Priority 1: Use email_date from order confirmation email - ALWAYS overwrite
        if (orderConfirmationEmail.email_date) {
          try {
            // Parse email_date (could be ISO string or Date header format like "Wed, 03 Dec 2025 23:31:33 +0000")
            let emailDate: Date;
            if (typeof orderConfirmationEmail.email_date === 'string') {
              emailDate = new Date(orderConfirmationEmail.email_date);
            } else {
              emailDate = orderConfirmationEmail.email_date;
            }
            
            if (!isNaN(emailDate.getTime())) {
              const formattedDate = emailDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              // ALWAYS overwrite purchaseDate with order confirmation date
              primaryPurchase.purchaseDate = formattedDate;
              // Store the original email_date string, or convert to ISO if it's a Date object
              primaryPurchase.purchase_date = typeof orderConfirmationEmail.email_date === 'string' 
                ? orderConfirmationEmail.email_date 
                : emailDate.toISOString();
              primaryPurchase.email_date = typeof orderConfirmationEmail.email_date === 'string'
                ? orderConfirmationEmail.email_date
                : emailDate.toISOString();
              purchaseDateSet = true;
            } else {
              if (shouldLogDetails) {
                console.warn(`⚠️ Invalid email_date for ${orderNumber}`);
              }
            }
          } catch (e) {
            if (shouldLogDetails) {
              console.warn(`⚠️ Failed to parse email_date for ${orderNumber}`);
            }
          }
        }
        
        // Priority 2: Fallback to existing purchaseDate from order confirmation email
        if (!purchaseDateSet && orderConfirmationEmail.purchaseDate) {
          primaryPurchase.purchaseDate = orderConfirmationEmail.purchaseDate;
          primaryPurchase.purchase_date = orderConfirmationEmail.purchase_date || orderConfirmationEmail.email_date || orderConfirmationEmail.createdAt;
          purchaseDateSet = true;
        }
        
        // Priority 3: Final fallback to createdAt from order confirmation email
        if (!purchaseDateSet && orderConfirmationEmail.createdAt) {
          try {
            const emailDate = new Date(orderConfirmationEmail.createdAt);
            if (!isNaN(emailDate.getTime())) {
              const formattedDate = emailDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              primaryPurchase.purchaseDate = formattedDate;
              primaryPurchase.purchase_date = orderConfirmationEmail.createdAt;
              primaryPurchase.email_date = orderConfirmationEmail.createdAt;
              purchaseDateSet = true;
            }
          } catch (e) {
            if (shouldLogDetails) {
              console.warn(`⚠️ Failed to parse createdAt for ${orderNumber}`);
            }
          }
        }
      } else {
        // No order confirmation found - set to TBD
        primaryPurchase.purchaseDate = 'TBD';
        primaryPurchase.purchase_date = '';
        
        // Only log detailed warning for orders with 10+ duplicates
        if (shouldLogDetails) {
          console.log(`⚠️ No order confirmation found for ${orderNumber} - set to TBD`);
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

