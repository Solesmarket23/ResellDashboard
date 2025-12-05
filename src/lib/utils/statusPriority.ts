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
      
      // ALWAYS find the order confirmation email for purchase date
      // Check multiple ways to identify order confirmation emails:
      // 1. Status is "ordered" or contains "order confirmed" or "confirmation"
      // 2. Email subject contains "Order Confirmed", "Order Confirmation", "Xpress Order Confirmed" (ignore emojis)
      // 3. Filename contains "order-confirmed", "order-confirmation", "xpress-order-confirmed" (ignore emojis and spaces)
      // 4. Use earliest email date as fallback if no order confirmation found
      const orderConfirmationEmail = sortedPurchases.find(p => {
        const status = (p.status || p.shipping_status || '').toLowerCase();
        // Remove emojis and normalize subject/filename for matching
        const normalizeText = (text: string) => text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        const rawSubject = (p.email_subject || p.subject || '').toLowerCase();
        const subject = normalizeText(rawSubject);
        const filename = normalizeText(p.filename || '');
        
        // Check status - must be "ordered" or "order placed" (not "shipped" or "delivered")
        const statusMatch = (status === 'ordered' || 
                           status === 'order placed') &&
                           status !== 'shipped' &&
                           status !== 'delivered';
        
        // Check subject line (normalized, emojis removed) - more patterns
        const subjectMatch = subject.includes('order-confirmed') ||
                            subject.includes('order-confirmation') ||
                            subject.includes('xpress-order-confirmed') ||
                            rawSubject.includes('order confirmed') ||
                            rawSubject.includes('order confirmation') ||
                            rawSubject.includes('👍 order') ||
                            rawSubject.includes('👍order');
        
        // Check filename (normalized, emojis and spaces removed)
        const filenameMatch = filename.includes('order-confirmed') ||
                             filename.includes('order-confirmation') ||
                             filename.includes('xpress-order-confirmed');
        
        const found = statusMatch || subjectMatch || filenameMatch;
        if (found) {
          console.log(`🔍 Order confirmation email detected: status="${status}", subject="${p.email_subject || p.subject}", filename="${p.filename}"`);
        }
        return found;
      });
      
      // ALWAYS set purchase date from order confirmation email (if found)
      // This overwrites any purchase date that might have been set from the primary (shipped/delivered) email
      if (orderConfirmationEmail) {
        console.log(`📅 Found order confirmation email for ${orderNumber}: status="${orderConfirmationEmail.status || orderConfirmationEmail.shipping_status}", subject="${orderConfirmationEmail.email_subject || orderConfirmationEmail.subject || 'N/A'}", email_date="${orderConfirmationEmail.email_date}", purchaseDate="${orderConfirmationEmail.purchaseDate}"`);
        
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
              const formattedDate = emailDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
              console.log(`✅ Set purchase date from order confirmation email_date: "${orderConfirmationEmail.email_date}" → ${formattedDate} (overwrote any existing date)`);
            } else {
              console.warn(`⚠️ Invalid email_date: "${orderConfirmationEmail.email_date}" (parsed to invalid date)`);
            }
          } catch (e) {
            console.warn(`⚠️ Failed to parse email_date: "${orderConfirmationEmail.email_date}"`, e);
          }
        }
        
        // Priority 2: Fallback to existing purchaseDate from order confirmation email
        if (!purchaseDateSet && orderConfirmationEmail.purchaseDate) {
          primaryPurchase.purchaseDate = orderConfirmationEmail.purchaseDate;
          primaryPurchase.purchase_date = orderConfirmationEmail.purchase_date || orderConfirmationEmail.email_date || orderConfirmationEmail.createdAt;
          purchaseDateSet = true;
          console.log(`✅ Using existing purchaseDate from order confirmation: ${primaryPurchase.purchaseDate}`);
        }
        
        // Priority 3: Final fallback to createdAt from order confirmation email
        if (!purchaseDateSet && orderConfirmationEmail.createdAt) {
          try {
            const emailDate = new Date(orderConfirmationEmail.createdAt);
            if (!isNaN(emailDate.getTime())) {
              const formattedDate = emailDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              primaryPurchase.purchaseDate = formattedDate;
              primaryPurchase.purchase_date = orderConfirmationEmail.createdAt;
              primaryPurchase.email_date = orderConfirmationEmail.createdAt;
              purchaseDateSet = true;
              console.log(`✅ Set purchase date from order confirmation createdAt: ${formattedDate}`);
            }
          } catch (e) {
            console.warn(`⚠️ Failed to parse createdAt: ${orderConfirmationEmail.createdAt}`, e);
          }
        }
      } else {
        console.log(`⚠️ No order confirmation email found for ${orderNumber}`);
        console.log(`   Available emails: ${sortedPurchases.map(p => `status="${p.status || p.shipping_status}", subject="${p.email_subject || p.subject || 'N/A'}", filename="${p.filename || 'N/A'}"`).join('; ')}`);
        console.log(`   ⚠️ WARNING: Purchase date will use earliest available email date, not order confirmation date`);
        console.log(`   💡 TIP: Upload the order confirmation email (Order Confirmed, Order Confirmation, or Xpress Order Confirmed) to get the correct purchase date`);
        console.log(`   Using earliest date fallback`);
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
              primaryPurchase.purchase_date = earliestPurchase.purchase_date || earliestPurchase.email_date || earliestPurchase.createdAt;
            } else if (earliestPurchase.email_date) {
              const emailDate = new Date(earliestPurchase.email_date);
              primaryPurchase.purchaseDate = emailDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              primaryPurchase.purchase_date = earliestPurchase.email_date;
            } else if (earliestPurchase.createdAt) {
              const emailDate = new Date(earliestPurchase.createdAt);
              primaryPurchase.purchaseDate = emailDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              primaryPurchase.purchase_date = earliestPurchase.createdAt;
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

