/**
 * Utility functions for handling order number formatting
 */

/**
 * Extract the correct order number for Gmail search
 * @param fullOrderNumber - The full order number from the system
 * @returns The formatted order number for Gmail search
 */
export function getOrderNumberForGmailSearch(fullOrderNumber: string): string {
  // Check if it's a standard order format (contains hyphen and both parts are numeric)
  if (fullOrderNumber.includes('-')) {
    const parts = fullOrderNumber.split('-');
    
    // Check if it's a standard order (both parts are numeric)
    if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
      // Return the second half for standard orders
      return parts[1];
    }
    
    // For Xpress orders (format like 01-GNHWJCZS95), return the full order number
    return fullOrderNumber;
  }
  
  // For orders without hyphens, return as is
  return fullOrderNumber;
}

/**
 * Generate Gmail search URL for an order number
 * @param orderNumber - The order number to search for
 * @returns Gmail search URL
 */
export function generateGmailSearchUrl(orderNumber: string): string {
  const searchOrderNumber = getOrderNumberForGmailSearch(orderNumber);
  return `https://mail.google.com/mail/u/0/#search/"${encodeURIComponent(searchOrderNumber)}"`;
}

/**
 * Check if an order number is in Xpress format
 * @param orderNumber - The order number to check
 * @returns True if it's an Xpress order format
 */
export function isXpressOrderNumber(orderNumber: string): boolean {
  if (!orderNumber.includes('-')) return false;
  
  const parts = orderNumber.split('-');
  if (parts.length !== 2) return false;
  
  // Xpress orders have format like "01-GNHWJCZS95" (numeric prefix, alphanumeric suffix)
  return /^\d+$/.test(parts[0]) && /^[A-Z0-9]+$/.test(parts[1]) && parts[1].length > 5;
}

/**
 * Check if an order number is in standard format
 * @param orderNumber - The order number to check
 * @returns True if it's a standard order format
 */
export function isStandardOrderNumber(orderNumber: string): boolean {
  if (!orderNumber.includes('-')) return false;
  
  const parts = orderNumber.split('-');
  if (parts.length !== 2) return false;
  
  // Standard orders have format like "73258261-73158020" (both parts numeric)
  return /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1]);
}

/**
 * Format order number for display in the UI
 * @param orderNumber - The full order number from the system
 * @returns The properly formatted order number for display
 */
export function formatOrderNumberForDisplay(orderNumber: string): string {
  if (!orderNumber) return orderNumber;
  
  // Check if it's a standard order format (numeric-numeric)
  if (isStandardOrderNumber(orderNumber)) {
    const parts = orderNumber.split('-');
    // For standard orders, display only the second half (8 characters)
    return parts[1];
  }
  
  // For Xpress orders (01-GNHWJCZS95) or any other format, display the full order number
  return orderNumber;
} 