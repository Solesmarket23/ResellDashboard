/**
 * ORDER CONFIRMATION EMAIL PARSER
 * ===============================
 * 
 * Replaces the existing Gmail email parser with a comprehensive
 * order confirmation parser that supports StockX orders.
 * 
 * Features:
 * - Supports StockX order confirmations (regular & Xpress)
 * - Extracts: product info, pricing, delivery dates, images, order numbers
 * - Validates order types against order number formats
 * - Handles both Gmail API and email files
 * - Robust error handling with multiple extraction patterns
 * - Clean, structured data output
 */

import * as cheerio from 'cheerio';

// OrderInfo interface - structured order information extracted from email
export interface OrderInfo {
  merchant: string;
  order_number: string;
  order_type: string; // "regular", "xpress", etc.
  product_name: string;
  product_variant: string; // color, style, etc.
  size: string;
  condition: string;
  style_id: string;
  
  // Product images
  product_image_url: string;
  product_image_alt: string;
  
  // Pricing breakdown
  purchase_price: number;
  processing_fee: number;
  shipping_fee: number;
  shipping_type: string; // "Shipping", "Xpress Shipping"
  total_amount: number;
  currency: string;
  
  // Delivery information
  estimated_delivery_start: string;
  estimated_delivery_end: string;
  
  // Purchase information
  purchase_date: string; // When the order was placed
  
  // Shipping information
  tracking_number: string;
  carrier: string;
  shipping_status: string; // "ordered", "shipped", "delivered"
  
  // Email metadata
  email_subject: string;
  email_date: string;
  sender: string;
}

// Create default OrderInfo object
function createDefaultOrderInfo(): OrderInfo {
  return {
    merchant: "",
    order_number: "",
    order_type: "",
    product_name: "",
    product_variant: "",
    size: "",
    condition: "",
    style_id: "",
    product_image_url: "",
    product_image_alt: "",
    purchase_price: 0.0,
    processing_fee: 0.0,
    shipping_fee: 0.0,
    shipping_type: "",
    total_amount: 0.0,
    currency: "USD",
    estimated_delivery_start: "",
    estimated_delivery_end: "",
    purchase_date: "",
    tracking_number: "",
    carrier: "",
    shipping_status: "",
    email_subject: "",
    email_date: "",
    sender: ""
  };
}

export class OrderConfirmationParser {
  private supportedMerchants: string[] = ['stockx'];
  private debug: boolean = false;
  
  constructor(debug: boolean = false) {
    this.debug = debug;
  }
  
  /**
   * Parse an email and extract order information
   * 
   * @param emailContent - Raw email content (EML format or HTML)
   * @returns OrderInfo object with extracted data
   */
  parseEmail(emailContent: string): OrderInfo {
    // Parse email if it's in EML format
    if (emailContent.includes('Delivered-To:') || emailContent.includes('Return-Path:')) {
      return this.parseEmailMessage(emailContent);
    } else {
      // Assume it's HTML content
      return this.parseHtmlContent(emailContent);
    }
  }
  
  /**
   * Parse email message content (EML format)
   */
  private parseEmailMessage(emailContent: string): OrderInfo {
    const orderInfo = createDefaultOrderInfo();
    
    // Extract email metadata from headers
    const subjectMatch = emailContent.match(/^Subject: (.+)$/m);
    const dateMatch = emailContent.match(/^Date: (.+)$/m);
    const fromMatch = emailContent.match(/^From: (.+)$/m);
    
    if (subjectMatch) orderInfo.email_subject = this.decodeHeader(subjectMatch[1]);
    if (dateMatch) orderInfo.email_date = dateMatch[1];
    if (fromMatch) orderInfo.sender = fromMatch[1];
    
    // Extract HTML content from email
    const htmlContent = this.getHtmlContent(emailContent);
    
    // Determine merchant and parse accordingly
    if (orderInfo.sender.toLowerCase().includes('stockx.com') || 
        orderInfo.email_subject.toLowerCase().includes('stockx')) {
      orderInfo.merchant = "StockX";
      this.parseStockXEmail(htmlContent, orderInfo);
      
      // Log tracking extraction results
      if (orderInfo.tracking_number) {
        console.log(`📦 TRACKING EXTRACTED: Order ${orderInfo.order_number} -> Tracking: ${orderInfo.tracking_number} (${orderInfo.carrier})`);
      }
    }
    
    return orderInfo;
  }
  
  /**
   * Parse HTML content directly
   */
  private parseHtmlContent(htmlContent: string): OrderInfo {
    const orderInfo = createDefaultOrderInfo();
    
    // Try to determine merchant from content
    if (htmlContent.toLowerCase().includes('stockx')) {
      orderInfo.merchant = "StockX";
      this.parseStockXEmail(htmlContent, orderInfo);
    }
    
    return orderInfo;
  }
  
  /**
   * Parse StockX-specific email format
   */
  private parseStockXEmail(htmlContent: string, orderInfo: OrderInfo): void {
    // Clean HTML and extract text
    const $: any = cheerio.load(htmlContent);
    const textContent: string = ($('body').text && $('body').text()) || ($.root && $.root().text && $.root().text()) || '';
    
    // Get subject from email (check multiple locations)
    const subjectMatch = htmlContent.match(/<title>([^<]+)<\/title>/i) || 
                        htmlContent.match(/Subject:\s*([^\n]+)/i) ||
                        htmlContent.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    const emailSubject = subjectMatch ? subjectMatch[1].trim() : '';
    
    console.log(`🔍 EMAIL SUBJECT: "${emailSubject}"`);
    
    // Comprehensive subject line patterns for all StockX email types
    const subjectPatterns = {
      // Order confirmation patterns
      orderConfirmed: [
        'Order Confirmed:',
        'Order Confirmation:',
        'Xpress Order Confirmed:'
      ],
      // Shipping patterns
      shipped: [
        'Order Verified & Shipped:',
        'Order Shipped:',
        'Xpress Order Shipped:'
      ],
      // Delivery patterns
      delivered: [
        'Xpress Ship Order Delivered:',
        'Order Delivered:'
      ]
    };
    
    // Normalize subject for matching (remove extra whitespace, handle case)
    const normalizedSubject = emailSubject.toLowerCase().trim();
    const normalizedHtml = htmlContent.toLowerCase();
    
    // Determine email type and status
    let emailType: 'order' | 'shipped' | 'delivered' = 'order';
    let isXpress = false;
    
    // Check for delivery emails first (most specific)
    if (subjectPatterns.delivered.some(pattern => 
        normalizedSubject.includes(pattern.toLowerCase()) || 
        normalizedHtml.includes(pattern.toLowerCase())
      )) {
      emailType = 'delivered';
      orderInfo.shipping_status = "delivered";
      console.log(`📬 DELIVERY EMAIL DETECTED: "${emailSubject}"`);
    }
    // Check for shipping emails
    else if (subjectPatterns.shipped.some(pattern => 
        normalizedSubject.includes(pattern.toLowerCase()) || 
        normalizedHtml.includes(pattern.toLowerCase())
      )) {
      emailType = 'shipped';
      orderInfo.shipping_status = "shipped";
      console.log(`📦 SHIPPING EMAIL DETECTED: "${emailSubject}"`);
    }
    // Check for order confirmation emails
    else if (subjectPatterns.orderConfirmed.some(pattern => 
        normalizedSubject.includes(pattern.toLowerCase()) || 
        normalizedHtml.includes(pattern.toLowerCase())
      )) {
      emailType = 'order';
      orderInfo.shipping_status = "ordered";
      console.log(`📦 ORDER EMAIL DETECTED: "${emailSubject}"`);
    }
    // Fallback: check content for status indicators
    else {
      if (normalizedHtml.includes('order delivered') || 
          normalizedHtml.includes('has been delivered') ||
          normalizedHtml.includes('🎉')) {
        emailType = 'delivered';
        orderInfo.shipping_status = "delivered";
        console.log(`📬 DELIVERY EMAIL DETECTED (fallback): "${emailSubject}"`);
      } else if (normalizedHtml.includes('order verified & shipped') ||
                 normalizedHtml.includes('order shipped') ||
                 normalizedHtml.includes('has been shipped') ||
                 normalizedHtml.includes('✅')) {
        emailType = 'shipped';
        orderInfo.shipping_status = "shipped";
        console.log(`📦 SHIPPING EMAIL DETECTED (fallback): "${emailSubject}"`);
      } else {
        emailType = 'order';
        orderInfo.shipping_status = "ordered";
        console.log(`📦 ORDER EMAIL DETECTED (fallback): "${emailSubject}"`);
      }
    }
    
    // Extract tracking for shipped and delivered emails
    if (emailType === 'shipped' || emailType === 'delivered') {
      console.log(`🔍 Extracting tracking for ${emailType} email...`);
      this.extractStockXTrackingInfo(htmlContent, textContent, orderInfo);
    }
    
    // Also attempt tracking extraction for all emails (some order confirmations have tracking)
    console.log(`🔍 Attempting tracking extraction for all StockX emails...`);
    this.extractStockXTrackingInfo(htmlContent, textContent, orderInfo);
    
    // Detect order type (Xpress vs Regular)
    // Check subject line first
    if (normalizedSubject.includes('xpress') || normalizedHtml.includes('xpress order')) {
      isXpress = true;
      orderInfo.order_type = "xpress";
      console.log(`⚡ XPRESS ORDER DETECTED`);
    } else {
      orderInfo.order_type = "regular";
      console.log(`📦 REGULAR ORDER DETECTED`);
    }
    
    // Extract information in order
    this.extractStockXOrderNumber(htmlContent, textContent, orderInfo);
    this.extractStockXProductInfo(htmlContent, textContent, orderInfo);
    this.extractStockXProductImage(htmlContent, orderInfo);

    // If product name is missing or clearly polluted, try using image alt
    if (!orderInfo.product_name || orderInfo.product_name.length < 4 || /class=|style=|<div|<span|\bOrder\b|\bView Order\b/i.test(orderInfo.product_name)) {
      if (orderInfo.product_image_alt) {
        orderInfo.product_name = this.cleanProductName(orderInfo.product_image_alt);
      } else {
        orderInfo.product_name = this.cleanProductName(orderInfo.product_name);
      }
    } else {
      orderInfo.product_name = this.cleanProductName(orderInfo.product_name);
    }
    this.extractStockXPricing(htmlContent, textContent, orderInfo);
    this.extractStockXDelivery(htmlContent, textContent, orderInfo);
    this.extractStockXPurchaseDate(htmlContent, textContent, orderInfo);
  }
  
  /**
   * Extract product details from StockX email
   */
  private extractStockXProductInfo(htmlContent: string, textContent: string, orderInfo: OrderInfo): void {
    console.log(`\n🚀 ===== PRODUCT INFO EXTRACTION START =====`);
    console.log(`🔧 STARTING PRODUCT INFO EXTRACTION for ${orderInfo.order_number || 'UNKNOWN'}`);
    console.log(`🚀 ===== PRODUCT INFO EXTRACTION START =====\n`);
    
    // Product name patterns - updated to handle both order confirmations and shipping confirmations
    const productPatterns = [
      // Email <title> or Subject header variants
      /<title>[^<]*?:\s*([^<]+)<\/title>/i,
      /Subject:\s*(?:[^:]*?:\s*)?([^\n]+)\n/i,

      // Subject line text blocks rendered into body (emoji variants too)
      /(?:✅\s*)?Order Verified & Shipped:\s*([^\n<]+)/i,
      /(?:✅\s*)?Order Shipped:\s*([^\n<]+)/i,
      /(?:Xpress\s*)?Order Confirmed:\s*([^\n<]+)/i,
      /(?:🎉\s*)?Order Delivered:\s*([^\n<]+)/i,
      /(?:🎉\s*)?Xpress Ship Order Delivered:\s*([^\n<]+)/i,

      // Product name anchors/TDs
      /<td[^>]*class="productName"[^>]*>.*?<a[^>]*>([^<]+)<\/a>/i,
      /<a[^>]*>([^<]+(?:Slipper|Sweatshirt|Shoe|Sneaker|Jacket|Hoodie|Shirt|Pant)[^<]*)<\/a>/i,
      /alt="([^"]+(?:Slipper|Sweatshirt|Shoe|Sneaker|Jacket|Hoodie|Shirt|Pant)[^"]*)"/i
    ];
    
    for (const pattern of productPatterns) {
      const match = htmlContent.match(pattern);
      if (match && match[1]) {
        orderInfo.product_name = this.cleanProductName(match[1]);
        break;
      }
    }
    
    // Extract variant (color) from product name
    const colorPatterns = [
      /\b(Chestnut|Grey|Gray|Black|White|Red|Blue|Green|Brown|Purple|Pink|Silver|Gold|Monochrome)\b/i
    ];
    
    for (const pattern of colorPatterns) {
      const match = orderInfo.product_name.match(pattern);
      if (match) {
        orderInfo.product_variant = match[1];
        break;
      }
    }
    
    // Extract size - COMPREHENSIVE patterns for StockX emails (100% accuracy required)
    if (this.debug) {
      console.log(`\n🔍 ===== SIZE EXTRACTION DEBUG START =====`);
      console.log(`🔍 EXTRACTING SIZE from order: ${orderInfo.order_number || 'UNKNOWN'}`);
      console.log(`🔍 HTML CONTENT LENGTH: ${htmlContent.length} characters`);
      console.log(`🔍 HTML CONTENT SAMPLE: ${htmlContent.substring(0, 500)}...`);
    }
    
    // Special debug for the specific order we're testing
    if (orderInfo.order_number === '77272475') {
      console.log(`🔍 *** TESTING ORDER 77272475 ***`);
      console.log(`🔍 FULL HTML CONTENT: ${htmlContent}`);
    }
    
    if (this.debug) {
      console.log(`🔍 ===== SIZE EXTRACTION DEBUG START =====\n`);
    }
    
    // Look for size patterns in the HTML content
    const sizeMatches = htmlContent.match(/Size:\s*([^<\n\r!]+?)/gi);
    if (this.debug) {
      if (sizeMatches) {
        console.log(`🔍 FOUND SIZE MATCHES: ${sizeMatches.join(', ')}`);
      } else {
        console.log(`🔍 NO SIZE MATCHES FOUND in HTML`);
      }
    }
    
    // Test with a simple pattern to see if ANY size text is found
    const simpleSizeMatches = htmlContent.match(/Size/gi);
    if (simpleSizeMatches) {
      console.log(`🔍 FOUND 'Size' TEXT: ${simpleSizeMatches.length} occurrences`);
    } else {
      console.log(`🔍 NO 'Size' TEXT FOUND at all`);
    }
    
    // Look for the specific list item pattern
    const listItemMatches = htmlContent.match(/<li[^>]*class="attributes"[^>]*>.*?Size:.*?<\/li>/gi);
    if (listItemMatches) {
      console.log(`🔍 FOUND LIST ITEM MATCHES: ${listItemMatches.join(', ')}`);
    } else {
      console.log(`🔍 NO LIST ITEM MATCHES FOUND`);
    }
    
    // Test the exact pattern from the email you showed me
    const exactPattern = htmlContent.match(/<li[^>]*class="attributes"[^>]*style="[^"]*"[^>]*>\s*Size:\s*([^<\n\r!]+?)\s*<\/li>/gi);
    if (exactPattern) {
      console.log(`🔍 FOUND EXACT PATTERN MATCHES: ${exactPattern.join(', ')}`);
    } else {
      console.log(`🔍 NO EXACT PATTERN MATCHES FOUND`);
    }
    
    // Test specifically for "US M 11.5" pattern
    const usPattern = htmlContent.match(/Size:\s*US\s+[A-Z0-9\.\s]+/gi);
    if (usPattern) {
      console.log(`🔍 FOUND US SIZE PATTERNS: ${usPattern.join(', ')}`);
    } else {
      console.log(`🔍 NO US SIZE PATTERNS FOUND`);
    }
    
    const sizePatterns = [
      // 1. StockX specific HTML list patterns (highest priority)
      /<li[^>]*class="attributes"[^>]*style="[^"]*"[^>]*>Size:\s*([^<\n\r!]+?)<\/li>/i,
      /<li[^>]*class="attributes"[^>]*>Size:\s*([^<\n\r!]+?)<\/li>/i,
      /<li[^>]*>.*?Size:\s*([^<\n\r!]+?)<\/li>/i,
      
      // 1.5. More specific StockX patterns for the exact format we see
      /<li[^>]*class="attributes"[^>]*style="[^"]*"[^>]*>\s*Size:\s*([^<\n\r!]+?)\s*<\/li>/i,
      /<li[^>]*class="attributes"[^>]*>\s*Size:\s*([^<\n\r!]+?)\s*<\/li>/i,
      
      // 1.6. Pattern for sizes without "Size:" prefix (like "US L") - more specific
      /<li[^>]*class="attributes"[^>]*style="[^"]*"[^>]*>\s*(US\s+[A-Z0-9\.\s]+?)\s*<\/li>/i,
      /<li[^>]*class="attributes"[^>]*>\s*(US\s+[A-Z0-9\.\s]+?)\s*<\/li>/i,
      
      // 2. Table cell patterns
      /<td[^>]*>Size:\s*([^<\n\r!]+?)<\/td>/i,
      /<td[^>]*>.*?Size:\s*([^<\n\r!]+?)<\/td>/i,
      
      // 3. Generic HTML patterns
      /<[^>]*>Size:\s*([^<\n\r!]+?)<\/[^>]*>/i,
      /Size:\s*US\s*([A-Z0-9\.\s]+?)(?=<|$)/i,
      /Size:\s*([^<\n\r!]+?)(?=<|$)/i,
      
      // 4. Text patterns with context
      /(?:^|\n|\s)Size:\s*(US\s+[A-Z0-9\.\s]+?)(?:\n|\s|$)/im,
      /(?:^|\n|\s)Size:\s*([A-Z0-9\.\s]+?)(?:\n|\s|$)/im,
      
      // 5. Product title patterns
      /Size\s+US\s+([A-Z0-9\.\s]+?)(?:\s*[,;\n]|$)/i,
      /Size\s+([A-Z0-9\.\s]+?)(?:\s*[,;\n]|$)/i,
      
      // 6. Parenthetical patterns
      /\(Size\s*([^)!;{}]+)\)/i,
      /\[Size\s*([^\]!;{}]+)\]/i,
      
      // 7. Colon patterns
      /Size:\s*US\s+([A-Z0-9\.\s]+?)(?:\s|$)/i,
      /Size:\s*([A-Z0-9\.\s]+?)(?:\s|$)/i,
      
      // 8. Dash patterns
      /Size\s*-\s*US\s+([A-Z0-9\.\s]+?)(?:\s|$)/i,
      /Size\s*-\s*([A-Z0-9\.\s]+?)(?:\s|$)/i,
      
      // 9. Any remaining patterns
      /Size[:\s]+([A-Z0-9\.\s]+?)(?:\s|$)/i,
      /Size[:\s]*US[:\s]*([A-Z0-9\.\s]+?)(?:\s|$)/i,
      
      // 10. Additional patterns for better coverage
      /Size\s*:\s*([A-Z0-9\.\s]+?)(?:\s|$|,|;|\.)/i,
      /Size\s*-\s*([A-Z0-9\.\s]+?)(?:\s|$|,|;|\.)/i,
      /Size\s*=\s*([A-Z0-9\.\s]+?)(?:\s|$|,|;|\.)/i,
      /([A-Z0-9\.\s]+?)\s*Size(?:\s|$|,|;|\.)/i,
      /US\s*Size\s*([A-Z0-9\.\s]+?)(?:\s|$|,|;|\.)/i,
      /Size\s*US\s*([A-Z0-9\.\s]+?)(?:\s|$|,|;|\.)/i
    ];
    
    let sizeFound = false;
    
    for (let i = 0; i < sizePatterns.length; i++) {
      const pattern = sizePatterns[i];
      const match = htmlContent.match(pattern);
      if (match) {
        let size = match[1].trim();
        if (this.debug) {
          console.log(`📏 SIZE PATTERN ${i+1} MATCH for ${orderInfo.order_number}: "${size}"`);
          console.log(`📏 PATTERN: ${pattern}`);
          console.log(`📏 FULL MATCH: "${match[0]}"`);
          const idx = (match as any).index ?? 0;
          console.log(`📏 CONTEXT: "${htmlContent.substring(Math.max(0, idx - 50), idx + match[0].length + 50)}"`);
        }
        
        // Skip if this looks like CSS or code - comprehensive CSS filtering
        const cssKeywords = [
          '!important', 'webkit', 'font-family', 'font-size', 'line-height', 
          'padding', 'margin', 'width', 'height', 'border', 'color', 'background',
          'display', 'position', 'float', 'clear', 'overflow', 'visibility',
          'z-index', 'opacity', 'transform', 'transition', 'animation',
          'inherit', 'initial', 'unset', 'revert', 'auto', 'none', 'normal',
          'block', 'inline', 'flex', 'grid', 'table', 'absolute', 'relative',
          'fixed', 'static', 'sticky', 'left', 'right', 'top', 'bottom',
          'center', 'justify', 'align', 'space', 'between', 'around', 'evenly',
          'start', 'end', 'baseline', 'stretch', 'row', 'column', 'wrap',
          'nowrap', 'reverse', 'grow', 'shrink', 'basis', 'order', 'gap',
          'px', 'em', 'rem', '%', 'vh', 'vw', 'vmin', 'vmax', 'pt', 'pc',
          'in', 'cm', 'mm', 'ex', 'ch', 'fr', 'deg', 'rad', 'grad', 'turn',
          's', 'ms', 'Hz', 'kHz', 'dpi', 'dpcm', 'dppx', 'x', 'y', 'z',
          'rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch',
          'var(', 'calc(', 'clamp(', 'min(', 'max(', 'attr(', 'url(',
          'linear-gradient', 'radial-gradient', 'conic-gradient',
          'repeating-linear-gradient', 'repeating-radial-gradient',
          'repeating-conic-gradient', 'cubic-bezier', 'steps', 'ease',
          'ease-in', 'ease-out', 'ease-in-out', 'linear', 'ease',
          'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy',
          'bold', 'bolder', 'lighter', 'normal', 'italic', 'oblique',
          'small-caps', 'small-caps', 'all-small-caps', 'petite-caps',
          'all-petite-caps', 'unicase', 'titling-caps', 'ultra-condensed',
          'extra-condensed', 'condensed', 'semi-condensed', 'semi-expanded',
          'expanded', 'extra-expanded', 'ultra-expanded', 'wider', 'narrower',
          'lighter', 'normal', 'bold', 'bolder', '100', '200', '300', '400',
          '500', '600', '700', '800', '900', 'smaller', 'larger', 'xx-small',
          'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large',
          'left', 'right', 'center', 'justify', 'start', 'end', 'match-parent',
          'nowrap', 'wrap', 'wrap-reverse', 'flex-start', 'flex-end',
          'space-between', 'space-around', 'space-evenly', 'stretch',
          'baseline', 'first-baseline', 'last-baseline', 'safe', 'unsafe',
          'row', 'row-reverse', 'column', 'column-reverse', 'nowrap',
          'wrap', 'wrap-reverse', 'grow', 'shrink', 'basis', 'order',
          'auto', 'content', 'max-content', 'min-content', 'fit-content',
          'fill', 'fill-available', 'fit-content', 'contain', 'cover',
          'scale-down', 'none', 'contain', 'cover', 'fill', 'scale-down',
          'repeat', 'no-repeat', 'repeat-x', 'repeat-y', 'space', 'round',
          'scroll', 'fixed', 'local', 'border-box', 'padding-box', 'content-box',
          'text', 'top', 'bottom', 'left', 'right', 'center', 'justify',
          'start', 'end', 'self-start', 'self-end', 'safe', 'unsafe',
          'stretch', 'baseline', 'first-baseline', 'last-baseline',
          'space-between', 'space-around', 'space-evenly', 'stretch',
          'baseline', 'first-baseline', 'last-baseline', 'safe', 'unsafe'
        ];
        
        const isCssKeyword = cssKeywords.some(keyword => 
          size.toLowerCase().includes(keyword.toLowerCase())
        );
        
        // Skip single digit numbers that are likely CSS values
        if (/^[0-9]+$/.test(size) && size.length <= 2) {
          console.log(`🚫 SKIPPING single digit CSS value for ${orderInfo.order_number}: "${size}"`);
          continue;
        }
        
        // More intelligent CSS filtering - only reject if it's clearly CSS
        const isCssPattern = size.includes(';') ||
                            size.includes('{') ||
                            size.includes('}') ||
                            size.includes('(') ||
                            size.includes(')') ||
                            size.includes('[') ||
                            size.includes(']') ||
                            size.includes('=') ||
                            size.includes('"') ||
                            size.includes("'") ||
                            size.length > 25;
        
        // Don't reject if it contains valid size indicators like "US", "W", "M", "L", etc.
        const hasValidSizeIndicators = /US|W|M|L|S|XL|XXL|GS|Y|\.5|\.0|\.5Y|\.0Y/i.test(size);
        
        if (this.debug) {
          console.log(`🔍 SIZE VALIDATION for "${size}": isCssKeyword=${isCssKeyword}, isCssPattern=${isCssPattern}, hasValidSizeIndicators=${hasValidSizeIndicators}`);
        }
        
        // Only reject as CSS if it's a CSS keyword AND doesn't have valid size indicators
        // AND it's not a valid size format (like "US W 7")
        if (isCssKeyword && !hasValidSizeIndicators) {
          console.log(`🚫 SKIPPING CSS keyword match for ${orderInfo.order_number}: "${size}"`);
          continue;
        }
        
        // Reject if it has CSS patterns but no valid size indicators
        if (isCssPattern && !hasValidSizeIndicators) {
          console.log(`🚫 SKIPPING CSS pattern match for ${orderInfo.order_number}: "${size}"`);
          continue;
        }
        
        // Clean up the size string - comprehensive cleaning
        const originalSize = size;
        
        // For sizes like "US W 9", we want to keep the full format, not strip "US W"
        // Only strip "Size:" prefix, not "US" or other size indicators
        size = size.replace(/^Size[\s:]*/i, '').trim();
        size = size.replace(/[,;].*$/, '').trim(); // Remove anything after comma or semicolon
        size = size.replace(/[<>]/g, '').trim(); // Remove any HTML tags
        size = size.replace(/\s+/g, ' ').trim(); // Normalize whitespace
        
        // Additional validation - reject common false positives, but only if the original size was just a number
        // Don't reject if the original size had letters (like "US W 9")
        // Reject code-like numeric matches such as color/style codes (e.g., 601)
        if (/^\d{3,4}$/.test(size) && /^[0-9]+$/.test(originalSize)) {
          console.log(`🚫 REJECTING LIKELY FALSE POSITIVE (code-like number): "${size}"`);
          continue;
        }
        
        // Validate it looks like a real size
        if (size && size !== 'Size' && size.length > 0 && size.length <= 25) {
          // Check if it contains at least one letter or number
          if (/[A-Za-z0-9]/.test(size)) {
            // Additional validation: check if it's a reasonable size format
            const isValidSize = this.isValidSizeFormat(size);
            if (isValidSize) {
              orderInfo.size = size;
              sizeFound = true;
              if (this.debug) {
                console.log(`✅ SIZE EXTRACTED for ${orderInfo.order_number}: "${size}" using pattern ${i+1}`);
              }
              break;
            } else {
              if (this.debug) {
                console.log(`❌ SIZE REJECTED for ${orderInfo.order_number}: "${size}" (invalid size format)`);
              }
            }
          } else {
            if (this.debug) {
              console.log(`❌ SIZE REJECTED for ${orderInfo.order_number}: "${size}" (no letters or numbers)`);
            }
          }
        } else {
          if (this.debug) {
            console.log(`❌ SIZE REJECTED for ${orderInfo.order_number}: "${size}" (invalid format)`);
          }
        }
      }
    }
    
    // If no size found with patterns, try fallback methods
    if (!sizeFound) {
      console.log(`🔍 NO SIZE FOUND with patterns, trying fallback methods...`);
      sizeFound = this.tryFallbackSizeExtraction(htmlContent, textContent, orderInfo);
    }
    
    console.log(`📏 FINAL SIZE for ${orderInfo.order_number}: "${orderInfo.size || 'NOT SET'}"`);
    
    // Check if size contains any HTML content that might be problematic
    if (orderInfo.size && (orderInfo.size.includes('<') || orderInfo.size.includes('>'))) {
      console.log(`⚠️ SIZE CONTAINS HTML for ${orderInfo.order_number}: "${orderInfo.size}"`);
    }
    
    // If product name still empty, try using image alt text captured elsewhere
    if (!orderInfo.product_name && orderInfo.product_image_alt) {
      orderInfo.product_name = this.cleanProductName(orderInfo.product_image_alt);
    }
    // Size extraction is now handled by the comprehensive pattern matching above
    // and fallback methods if no size is found
    
    // Extract condition
    const conditionMatch = htmlContent.match(/Condition:\s*([^<\n]+)/i);
    if (conditionMatch) {
      orderInfo.condition = conditionMatch[1].trim();
    }
    
    // Extract style ID
    const stylePatterns = [
      /Style ID:\s*([A-Z0-9\-]+)\b/i
    ];
    
    for (const pattern of stylePatterns) {
      const match = htmlContent.match(pattern);
      if (match) {
        orderInfo.style_id = match[1].trim();
        break;
      }
    }
    
    console.log(`🏁 COMPLETED PRODUCT INFO EXTRACTION for ${orderInfo.order_number}: size="${orderInfo.size}", product="${orderInfo.product_name}"`);
  }

  /**
   * Clean up a product name string: strip HTML, decode entities, remove pdf2html noise
   */
  private cleanProductName(raw: string): string {
    if (!raw) return '';
    let text = raw;
    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, ' ');
    // Decode common entities
    const entityMap: Record<string, string> = {
      '&amp;': '&',
      '&apos;': "'",
      '&#39;': "'",
      '&quot;': '"',
      '&lt;': '<',
      '&gt;': '>'
    };
    text = text.replace(/&(amp|apos|quot|lt|gt|#39);/g, (m) => entityMap[m] || m);
    // Drop known noise phrases
    const noise = [
      'Your order has been verified', 'Estimated Arrival', 'TOTAL PAYMENT', 'View Order',
      'Ships from StockX', 'Condition:', 'Order number:', 'Purchase Price:', 'Processing Fee:', 'Shipping:'
    ];
    for (const n of noise) {
      const idx = text.indexOf(n);
      if (idx !== -1) text = text.substring(0, idx);
    }
    // Collapse whitespace
    text = text.replace(/\s+/g, ' ').trim();
    // If extremely long, keep first 120 chars
    if (text.length > 120) text = text.slice(0, 120).trim();
    return text;
  }
  
  /**
   * Validate if a string looks like a valid size format
   */
  private isValidSizeFormat(size: string): boolean {
    if (!size || size.length === 0) return false;
    
    // Reject single digits (likely CSS values like "0", "1", "2", etc.)
    if (/^[0-9]+$/.test(size) && size.length <= 2) {
      return false;
    }
    
    // Common size patterns
    const sizePatterns = [
      // Letter sizes (XS, S, M, L, XL, XXL, etc.) - but not just single letters that are CSS keywords
      /^[X]+[SLM]$/i,  // XXL, XXXL, etc.
      /^[SLM]$/i,      // S, L, M only
      /^[X]*[SLM]\d+$/i, // XS10, M10, etc.
      
      // Number sizes (5, 5.5, 10, 10.5, etc.)
      /^\d+(\.\d+)?$/,
      
      // US sizes (US 5, US M, US W 9, etc.)
      /^US\s*[A-Z0-9\.\s]+$/i,
      
      // Women's sizes (W 9, W 10, etc.)
      /^W\s*\d+(\.\d+)?$/i,
      
      // Men's sizes (M 9, M 10, etc.)
      /^M\s*\d+(\.\d+)?$/i,
      
      // Mixed formats (M 10, L 12, etc.)
      /^[A-Z]\s*\d+(\.\d+)?$/i,
      
      // European sizes (40, 41, 42, etc.)
      /^\d{2,3}$/,
      
      // One size fits all
      /^One\s*Size$/i,
      /^OS$/i,
      /^OSFA$/i
    ];
    
    // First check: Must not contain HTML or CSS keywords (highest priority)
    const invalidKeywords = [
      'div', 'span', 'class', 'style', 'width', 'height', 'px', 'em', 'rem', '%',
      'inherit', 'initial', 'unset', 'revert', 'auto', 'none', 'normal', 'block',
      'inline', 'flex', 'grid', 'table', 'absolute', 'relative', 'fixed', 'static',
      'sticky', 'left', 'right', 'top', 'bottom', 'center', 'justify', 'align',
      'space', 'between', 'around', 'evenly', 'start', 'end', 'baseline', 'stretch',
      'row', 'column', 'wrap', 'nowrap', 'reverse', 'grow', 'shrink', 'basis',
      'order', 'gap', 'vh', 'vw', 'vmin', 'vmax', 'pt', 'pc', 'in', 'cm', 'mm',
      'ex', 'ch', 'fr', 'deg', 'rad', 'grad', 'turn', 's', 'ms', 'Hz', 'kHz',
      'dpi', 'dpcm', 'dppx', 'rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch',
      'oklab', 'oklch', 'var(', 'calc(', 'clamp(', 'min(', 'max(', 'attr(',
      'url(', 'linear-gradient', 'radial-gradient', 'conic-gradient',
      'repeating-linear-gradient', 'repeating-radial-gradient',
      'repeating-conic-gradient', 'cubic-bezier', 'steps', 'ease', 'ease-in',
      'ease-out', 'ease-in-out', 'linear', 'serif', 'sans-serif', 'monospace',
      'cursive', 'fantasy', 'bold', 'bolder', 'lighter', 'italic', 'oblique',
      'small-caps', 'all-small-caps', 'petite-caps', 'all-petite-caps',
      'unicase', 'titling-caps', 'ultra-condensed', 'extra-condensed',
      'condensed', 'semi-condensed', 'semi-expanded', 'expanded',
      'extra-expanded', 'ultra-expanded', 'wider', 'narrower', 'smaller',
      'larger', 'xx-small', 'x-small', 'small', 'medium', 'large', 'x-large',
      'xx-large', 'match-parent', 'flex-start', 'flex-end', 'space-between',
      'space-around', 'space-evenly', 'row-reverse', 'column-reverse',
      'content', 'max-content', 'min-content', 'fit-content', 'fill',
      'fill-available', 'contain', 'cover', 'scale-down', 'repeat',
      'no-repeat', 'repeat-x', 'repeat-y', 'space', 'round', 'scroll',
      'local', 'border-box', 'padding-box', 'content-box', 'text',
      'self-start', 'self-end', 'safe', 'unsafe'
    ];
    
  for (const keyword of invalidKeywords) {
    // Use word boundary matching to avoid false positives
    // Escape special regex characters
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedKeyword.toLowerCase()}\\b`, 'i');
    if (regex.test(size)) return false;
  }
    
    // Second check: Must contain at least one letter or number
    if (!/[A-Za-z0-9]/.test(size)) return false;
    
    // Third check: Must not be too long (reasonable size limit)
    if (size.length > 20) return false;
    
    // Fourth check: Check if size matches any valid pattern
    for (const pattern of sizePatterns) {
      if (pattern.test(size)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Try fallback methods to extract size when patterns fail
   */
  private tryFallbackSizeExtraction(htmlContent: string, textContent: string, orderInfo: OrderInfo): boolean {
    console.log(`🔍 TRYING FALLBACK SIZE EXTRACTION for ${orderInfo.order_number}`);
    
    // Method 1: Look for size in product name
    if (orderInfo.product_name) {
      console.log(`🔍 Checking product name for size: "${orderInfo.product_name}"`);
      const productSizePatterns = [
        /\(Size\s*([^)]+)\)/i,
        /\[Size\s*([^\]]+)\]/i,
        /Size\s*([A-Z0-9\.\s]+?)(?:\s|$)/i,
        /([A-Z0-9\.\s]+?)\s*Size/i
      ];
      
      for (const pattern of productSizePatterns) {
        const match = orderInfo.product_name.match(pattern);
        if (match) {
          let size = match[1].trim();
          if (this.isValidSizeFormat(size)) {
            orderInfo.size = size;
            console.log(`✅ SIZE FOUND in product name: "${size}"`);
            return true;
          }
        }
      }
    }
    
    // Method 2: Look for size in alt text of images
    const imageAltPatterns = [
      /alt="[^"]*Size[:\s]*([^"]+)/i,
      /alt="[^"]*([A-Z0-9\.\s]+?)\s*Size/i
    ];
    
    for (const pattern of imageAltPatterns) {
      const match = htmlContent.match(pattern);
      if (match) {
        let size = match[1].trim();
        if (this.isValidSizeFormat(size)) {
          orderInfo.size = size;
          console.log(`✅ SIZE FOUND in image alt text: "${size}"`);
          return true;
        }
      }
    }
    
    // Method 3: Look for any remaining size-like patterns in the entire HTML
    const comprehensivePatterns = [
      /Size[:\s]*([A-Z0-9\.\s]+?)(?:\s|$|,|;|\.)/gi,
      /([A-Z0-9\.\s]+?)\s*Size(?:\s|$|,|;|\.)/gi
    ];
    
    for (const pattern of comprehensivePatterns) {
      const matches = htmlContent.matchAll(pattern);
      for (const match of matches) {
        let size = match[1].trim();
        
        // Skip single digit numbers that are likely CSS values
        if (/^[0-9]+$/.test(size) && size.length <= 2) {
          console.log(`🚫 SKIPPING single digit CSS value: "${size}"`);
          continue;
        }
        
        // More intelligent CSS filtering for fallback
        const isCssPattern = size.includes(';') || size.includes('{') || size.includes('}') || 
                            size.includes('(') || size.includes(')') || size.includes('[') || 
                            size.includes(']') || size.includes('=') || size.includes('"') || 
                            size.includes("'") || size.length > 25;
        
        // Don't reject if it contains valid size indicators
        const hasValidSizeIndicators = /US|W|M|L|S|XL|XXL|GS|Y|\.5|\.0|\.5Y|\.0Y/i.test(size);
        
        // Only reject if it has CSS patterns but no valid size indicators
        if (isCssPattern && !hasValidSizeIndicators) {
          console.log(`🚫 SKIPPING CSS pattern match in fallback: "${size}"`);
          continue;
        }
        
        // Reject code-like numeric of length 3-4
        if (/^\d{3,4}$/.test(size)) {
          console.log(`🚫 SKIPPING code-like numeric size in fallback: "${size}"`);
          continue;
        }
        if (this.isValidSizeFormat(size)) {
          orderInfo.size = size;
          console.log(`✅ SIZE FOUND with comprehensive pattern: "${size}"`);
          return true;
        }
      }
    }
    
    // Method 4: Try one more aggressive extraction from the entire email content
    console.log(`🔍 TRYING AGGRESSIVE SIZE EXTRACTION for ${orderInfo.order_number}`);
    const aggressivePatterns = [
      /Size[:\s]*US\s*([A-Z0-9\.\s]+?)(?:\s|$|,|;|\.|\)|\]|\})/gi,
      /Size[:\s]*([A-Z0-9\.\s]+?)(?:\s|$|,|;|\.|\)|\]|\})/gi,
      /US\s*([A-Z0-9\.\s]+?)(?:\s|$|,|;|\.|\)|\]|\})/gi,
      /([A-Z0-9\.\s]+?)\s*US(?:\s|$|,|;|\.|\)|\]|\})/gi
    ];
    
    for (const pattern of aggressivePatterns) {
      const matches = textContent.matchAll(pattern);
      for (const match of matches) {
        let size = match[1].trim();
        
        // Skip very short or very long matches
        if (size.length < 1 || size.length > 25) continue;
        
        // Skip single digits that are likely CSS values
        if (/^[0-9]+$/.test(size) && size.length <= 2) continue;
        
        // Skip CSS-like patterns
        if (size.includes(';') || size.includes('{') || size.includes('}') || 
            size.includes('(') || size.includes(')') || size.includes('[') || 
            size.includes(']') || size.includes('=') || size.includes('"') || 
            size.includes("'")) continue;
        
        // Reject code-like numeric of length 3-4
        if (/^\d{3,4}$/.test(size)) continue;
        if (this.isValidSizeFormat(size)) {
          orderInfo.size = size;
          console.log(`✅ SIZE FOUND with aggressive extraction: "${size}"`);
          return true;
        }
      }
    }
    
    // Method 5: If still no size found, set a default based on product type
    console.log(`⚠️ NO SIZE FOUND for ${orderInfo.order_number}, setting default based on product type`);
    const defaultSize = this.getDefaultSizeForProduct(orderInfo.product_name);
    if (defaultSize) {
      orderInfo.size = defaultSize;
      console.log(`✅ DEFAULT SIZE SET: "${defaultSize}"`);
      return true;
    }
    
    console.log(`❌ NO SIZE FOUND for ${orderInfo.order_number} - this should not happen!`);
    return false;
  }
  
  /**
   * Get default size for products that might not have explicit sizes
   */
  private getDefaultSizeForProduct(productName: string): string | null {
    if (!productName) return null;
    
    const productNameLower = productName.toLowerCase();
    
    // Check if it's a collectible or toy (one size)
    if (productNameLower.includes('collectible') || 
        productNameLower.includes('toy') || 
        productNameLower.includes('figure') ||
        productNameLower.includes('accessory') ||
        productNameLower.includes('keychain') ||
        productNameLower.includes('pin') ||
        productNameLower.includes('sticker')) {
      return 'One Size';
    }
    
    // For clothing and shoes, we should always find a size
    // If we don't, this indicates a parsing issue
    return null;
  }
  
  /**
   * Extract product image URL from StockX email
   */
  private extractStockXProductImage(htmlContent: string, orderInfo: OrderInfo): void {
    const $ = cheerio.load(htmlContent);
    
    // Look for product images in various ways
    const imageSearches = [
      // Look for images with product names in alt text
      () => $('img[alt*="UGG"], img[alt*="Denim Tears"], img[alt*="Nike"], img[alt*="Adidas"], img[alt*="Jordan"]').first(),
      
      // Look for images in product box sections
      () => $('td.productBoxImage img').first(),
      
      // Look for images with stockx.com/images URLs
      () => $('img[src*="images.stockx.com"][src*="Product"]').first(),
      
      // Look for images with specific product-related alt text
      () => $('img[alt*="Slipper"], img[alt*="Sweatshirt"], img[alt*="Shoe"], img[alt*="Sneaker"], img[alt*="Hoodie"]').first(),
      
      // Fallback: look for any images with product dimensions
      () => $('img[width="260"], img[width="240"], img[width="280"]').first()
    ];
    
    let productImg: any = null;
    for (const searchFunc of imageSearches) {
      try {
        const result = searchFunc();
        if (result.length > 0 && result.attr('src')) {
          productImg = result;
          break;
        }
      } catch (error) {
        continue;
      }
    }
    
    if (productImg) {
      // Extract image URL
      const imgSrc = productImg.attr('src') || '';
      
      // Clean up the URL if it has StockX image parameters
      if (imgSrc.includes('images.stockx.com')) {
        // Remove StockX image processing parameters for cleaner URL
        const baseUrl = imgSrc.split('?')[0];
        orderInfo.product_image_url = baseUrl;
      } else {
        orderInfo.product_image_url = imgSrc;
      }
      
      // Extract alt text
      orderInfo.product_image_alt = productImg.attr('alt') || '';
    }
    
    // If no image found, try regex patterns on raw HTML
    if (!orderInfo.product_image_url) {
      const imageUrlPatterns = [
        /src="(https:\/\/images\.stockx\.com\/images\/[^"]*Product[^"]*\.jpg)"/i,
        /src="(https:\/\/images\.stockx\.com\/images\/[^"]*Product[^"]*)"/i,
        /<img[^>]*alt="([^"]*(?:Slipper|Sweatshirt|Shoe|Sneaker)[^"]*)"[^>]*src="([^"]+)"/i,
        /<img[^>]*src="([^"]+)"[^>]*alt="([^"]*(?:Slipper|Sweatshirt|Shoe|Sneaker)[^"]*)"/i
      ];
      
      for (const pattern of imageUrlPatterns) {
        const match = htmlContent.match(pattern);
        if (match) {
          if (match.length === 2) {
            orderInfo.product_image_url = match[1];
          } else if (match.length === 3) {
            // Check which group is the URL and which is alt text
            const [, group1, group2] = match;
            if (group1.startsWith('http')) {
              orderInfo.product_image_url = group1;
              orderInfo.product_image_alt = group2;
            } else {
              orderInfo.product_image_url = group2;
              orderInfo.product_image_alt = group1;
            }
          }
          break;
        }
      }
    }
  }
  
  /**
   * Extract pricing information from StockX email
   */
  private extractStockXPricing(htmlContent: string, textContent: string, orderInfo: OrderInfo): void {
    // Purchase Price
    const pricePatterns = [
      /Purchase Price:.*?\$(\d+\.\d{2})/i,
      /<td[^>]*>Purchase Price:<\/td>\s*<td[^>]*>\$(\d+\.\d{2})/i
    ];
    
    for (const pattern of pricePatterns) {
      const match = htmlContent.match(pattern);
      if (match) {
        orderInfo.purchase_price = parseFloat(match[1]);
        break;
      }
    }
    
    // Processing Fee
    const processingPatterns = [
      /Processing Fee:.*?\$(\d+\.\d{2})/i,
      /<td[^>]*>Processing Fee:<\/td>\s*<td[^>]*>\$(\d+\.\d{2})/i
    ];
    
    for (const pattern of processingPatterns) {
      const match = htmlContent.match(pattern);
      if (match) {
        orderInfo.processing_fee = parseFloat(match[1]);
        break;
      }
    }
    
    // Shipping
    const shippingPatterns = [
      /(Xpress Shipping|Shipping):.*?\$(\d+\.\d{2})/i,
      /<td[^>]*>(Xpress Shipping|Shipping):<\/td>\s*<td[^>]*>\$(\d+\.\d{2})/i
    ];
    
    for (const pattern of shippingPatterns) {
      const match = htmlContent.match(pattern);
      if (match) {
        orderInfo.shipping_type = match[1];
        orderInfo.shipping_fee = parseFloat(match[2]);
        break;
      }
    }
    
    // Total
    const totalPatterns = [
      /Total Payment.*?\$(\d+\.\d{2})\*?/i,
      /<td[^>]*>.*?Total Payment.*?<\/td>\s*<td[^>]*>\$(\d+\.\d{2})\*?/i
    ];
    
    for (const pattern of totalPatterns) {
      const match = htmlContent.match(pattern);
      if (match) {
        orderInfo.total_amount = parseFloat(match[1]);
        break;
      }
    }
  }
  
  /**
   * Extract delivery information from StockX email
   */
  private extractStockXDelivery(htmlContent: string, textContent: string, orderInfo: OrderInfo): void {
    // Delivery date patterns
    const deliveryPatterns = [
      /Estimated (?:Arrival|Delivery)(?: Date)?:\s*(?:<[^>]*>)*([A-Za-z]+ \d+, \d{4})\s*-\s*([A-Za-z]+ \d+, \d{4})/i,
      /expect to receive it by ([A-Za-z]+ \d+, \d{4})/i,
      /(\w+ \d+, \d{4})\s*-\s*(\w+ \d+, \d{4})/i
    ];
    
    for (const pattern of deliveryPatterns) {
      const match = htmlContent.match(pattern);
      if (match) {
        if (match.length === 3) {
          orderInfo.estimated_delivery_start = match[1].trim();
          orderInfo.estimated_delivery_end = match[2].trim();
        } else if (match.length === 2) {
          orderInfo.estimated_delivery_end = match[1].trim();
        }
        break;
      }
    }
  }
  
  /**
   * Extract purchase date from StockX email
   */
  private extractStockXPurchaseDate(htmlContent: string, textContent: string, orderInfo: OrderInfo): void {
    // Purchase date patterns - look for date near order confirmation
    const purchaseDatePatterns = [
      /Order Confirmed[^0-9]*(\w+ \d+, \d{4})/i,
      /Purchase Date[^0-9]*(\w+ \d+, \d{4})/i,
      /Order Date[^0-9]*(\w+ \d+, \d{4})/i
    ];
    
    for (const pattern of purchaseDatePatterns) {
      const match = htmlContent.match(pattern);
      if (match) {
        orderInfo.purchase_date = match[1].trim();
        break;
      }
    }
  }
  
  /**
   * Extract tracking information from StockX shipping confirmation emails
   */
  private extractStockXTrackingInfo(htmlContent: string, textContent: string, orderInfo: OrderInfo): void {
    console.log(`🔍 EXTRACTING TRACKING INFO for order: ${orderInfo.order_number || 'UNKNOWN'}`);
    console.log(`🔍 HTML Content length: ${htmlContent.length} characters`);
    console.log(`🔍 Text Content length: ${textContent.length} characters`);
    
    // Tracking number patterns - looking for REAL tracking number formats
    const trackingPatterns = [
      // UPS tracking (1Z followed by 16 alphanumeric)
      /tracking\s*(?:number|#)?:?\s*(1Z[0-9A-Z]{16})/i,
      /track\s*(?:your\s*)?(?:package|order|shipment)?:?\s*(1Z[0-9A-Z]{16})/i,
      /(?:ups|ups\.com).*?(1Z[0-9A-Z]{16})/i,
      
      // FedEx tracking in URLs (strict 12-digit)
      /fedex\.com.*tracknumbers[=%3D](\d{12})/i,
      // FedEx tracking in URL-encoded format (strict 12-digit)
      /tracknumbers%3D(\d{12})/i,
      /tracknumbers=(\d{12})/i,
      
      // FedEx tracking (strict 12 digits)
      /tracking\s*(?:number|#)?:?\s*(\d{12})\b/i,
      /(?:fedex|fedex\.com).*?(\d{12})\b/i,
      
      // USPS tracking (20-22 digits, often starts with 9)
      /tracking\s*(?:number|#)?:?\s*(9[0-9]{19,21})/i,
      /(?:usps|usps\.com).*?(9[0-9]{19,21})/i,
      
      // DHL tracking (10 digits)
      /tracking\s*(?:number|#)?:?\s*(\d{10})\b/i,
      /(?:dhl|dhl\.com).*?(\d{10})/i,
      
      // Generic but with "tracking" context - must be preceded by tracking-related text
      /(?:tracking|track your|package tracking)[^0-9]*(\d{10,22})\b/i,
      
      // Look for tracking in specific HTML structures
      /<a[^>]*href=[^>]*track[^>]*>([0-9A-Z]{10,22})<\/a>/i,
      
      // Look for tracking numbers in UPS URLs
      /ups\.com.*track[=%3D](\d{10,15})/i,
      
      // Look for tracking numbers in USPS URLs
      /usps\.com.*track[=%3D](\d{10,15})/i,
      
      // Look for tracking numbers in table cells or divs
      /<(?:td|div)[^>]*>.*?(\d{12,22}).*?<\/(?:td|div)>/i,
      
      // Look for tracking numbers in bold or emphasized text
      /<(?:b|strong|em)[^>]*>.*?(\d{12,22}).*?<\/(?:b|strong|em)>/i,
      
      // Look for tracking numbers after "tracking number" or similar phrases
      /(?:tracking\s*number|track\s*number|tracking\s*#|track\s*#)[:\s]*([0-9A-Z]{10,22})/i,
      
      // Look for tracking numbers in StockX-specific patterns
      /(?:stockx|stock x).*?(\d{12,22})/i
    ];
    
    for (const pattern of trackingPatterns) {
      const match = htmlContent.match(pattern);
      if (match) {
        const trackingNumRaw = match[1].trim();
        const trackingNum = trackingNumRaw.toUpperCase();
        // Validate it looks like a real tracking number
        // Skip if it looks like an order number (contains dash not in UPS format)
        if (trackingNum.includes('-') && !trackingNum.startsWith('1Z')) {
          console.log(`⚠️ Skipping potential order number: "${trackingNum}"`);
          continue;
        }
        
        // Validate based on carrier formats
        const isValidTracking = (
          // UPS: 1Z followed by 16 alphanumeric
          /^1Z[0-9A-Z]{16}$/i.test(trackingNum) ||
          // FedEx: strict 12 digits
          /^\d{12}$/.test(trackingNum) ||
          // USPS: 20-22 digits
          /^\d{20,22}$/.test(trackingNum) ||
          // DHL: 10 digits
          /^\d{10}$/.test(trackingNum)
        );
        
        if (isValidTracking) {
          orderInfo.tracking_number = trackingNum;
          console.log(`✅ TRACKING NUMBER EXTRACTED: "${trackingNum}" using pattern: ${pattern}`);
          break;
        } else {
          console.log(`⚠️ Invalid tracking format: "${trackingNum}"`);
        }
      }
    }
    
    // If no tracking number found with strict patterns, try more flexible approaches
    if (!orderInfo.tracking_number) {
      console.log(`🔍 Trying flexible tracking extraction for StockX...`);
      
      // StockX often puts tracking numbers in specific locations
      // Look for 12-digit FedEx numbers
      const fedexPattern = /\b(\d{12})\b/g;
      const fedexMatches = htmlContent.match(fedexPattern) || [];
      
      for (const match of fedexMatches) {
        // Validate it's not an order number or other ID
        if (!match.includes('-') && /^\d{15}$/.test(match)) {
          // Additional validation: check if it's near shipping/tracking context
          const contextCheck = new RegExp(`(?:tracking|shipped|delivered|package)[\\s\\S]{0,100}${match}|${match}[\\s\\S]{0,100}(?:tracking|shipped|delivered|package)`, 'i');
          if (contextCheck.test(htmlContent)) {
            orderInfo.tracking_number = match;
            console.log(`✅ TRACKING NUMBER FOUND (FedEx 15-digit with context): "${match}"`);
            break;
          }
        }
      }
      
      // If still no tracking, look for any prominent 12-22 digit number in shipping emails
      if (!orderInfo.tracking_number && orderInfo.shipping_status === "shipped") {
        console.log(`🔍 Looking for ANY prominent number in shipping email...`);
        
        // Look for numbers in bold or large text (restrict to 12-digit numeric)
        const prominentPatterns = [
          /<(?:b|strong)>(\d{12})<\//g,
          /<span[^>]*font-size[^>]*>(\d{12})<\/span>/g,
          /<td[^>]*>(\d{12})<\/td>/g,
          /<p[^>]*>(\d{12})<\/p>/g
        ];
        
        for (const pattern of prominentPatterns) {
          const matches = htmlContent.matchAll(pattern);
          for (const match of matches) {
            const number = match[1];
            if (!number.includes('-') && /^\d{12,22}$/.test(number)) {
              orderInfo.tracking_number = number;
              console.log(`✅ TRACKING NUMBER FOUND (prominent ${number.length}-digit number): "${number}"`);
              break;
            }
          }
          if (orderInfo.tracking_number) break;
        }
      }
      
      // Last resort for shipping emails - find the FIRST 12-digit number after "shipped"
      if (!orderInfo.tracking_number && orderInfo.shipping_status === "shipped") {
        const afterShippedPattern = /(?:shipped|tracking|track your order)[^0-9]*(\d{12})/i;
        const afterShippedMatch = textContent.match(afterShippedPattern);
        if (afterShippedMatch && !afterShippedMatch[1].includes('-')) {
          orderInfo.tracking_number = afterShippedMatch[1].toUpperCase();
          console.log(`✅ TRACKING NUMBER FOUND (first number after 'shipped'): "${afterShippedMatch[1]}"`);
        }
      }
    }
    
    // Determine carrier - StockX typically uses UPS
    if (orderInfo.tracking_number) {
      // UPS tracking numbers are typically 18 digits starting with 1Z
      if (orderInfo.tracking_number.toUpperCase().startsWith('1Z')) {
        orderInfo.carrier = "UPS";
      } else if (orderInfo.tracking_number.length === 12) {
        // FedEx uses 12 digit tracking numbers (strict)
        orderInfo.carrier = "FedEx";
      } else {
        // Default to generic carrier for StockX
        orderInfo.carrier = "StockX Logistics";
      }
    }
    
    // Final tracking extraction summary
    console.log(`📦 TRACKING EXTRACTION COMPLETE for order ${orderInfo.order_number}:`);
    console.log(`   - Tracking Number: "${orderInfo.tracking_number || 'NOT FOUND'}"`);
    console.log(`   - Carrier: "${orderInfo.carrier || 'NOT DETECTED'}"`);
    console.log(`   - Shipping Status: "${orderInfo.shipping_status}"`);
  }

  /**
   * Extract order number from StockX email and validate order type
   */
  private extractStockXOrderNumber(htmlContent: string, textContent: string, orderInfo: OrderInfo): void {
    // Priority 1: Search HTML for structured order number (most reliable)
    // Pattern: <li class="attributes">Order number: 03-PAN6QGRR7B</li>
    const htmlOrderPatterns = [
      /<li[^>]*class=["']attributes["'][^>]*>\s*Order\s+number:\s*([A-Z0-9-]+)\s*<\/li>/i,
      /<li[^>]*class=["']attributes["'][^>]*>\s*Order\s+Number:\s*([A-Z0-9-]+)\s*<\/li>/i,
      /<li[^>]*>\s*Order\s+number:\s*([A-Z0-9-]+)\s*<\/li>/i,
      /<td[^>]*>\s*Order\s+number:\s*([A-Z0-9-]+)\s*<\/td>/i,
      /Order\s+number:\s*([A-Z0-9-]+)/i
    ];
    
    // Try HTML patterns first
    for (const pattern of htmlOrderPatterns) {
      const match = htmlContent.match(pattern);
      if (match && match[1]) {
        const orderNumber = match[1].trim();
        orderInfo.order_number = orderNumber;
        console.log(`✅ Order number extracted from HTML: ${orderNumber}`);
        
        // Validate and potentially correct order type based on order number format
        if (this.isXpressOrderNumber(orderNumber)) {
          if (orderInfo.order_type !== "xpress") {
            orderInfo.order_type = "xpress";
            console.log(`📝 Corrected order type to xpress based on order number format`);
          }
        } else if (this.isRegularOrderNumber(orderNumber)) {
          if (orderInfo.order_type === "xpress") {
            orderInfo.order_type = "regular";
            console.log(`📝 Corrected order type to regular based on order number format`);
          }
        }
        return; // Found in HTML, done
      }
    }
    
    // Priority 2: Fall back to text content patterns
    const textOrderPatterns = [
      /Order\s+number:\s*([A-Z0-9-]+)/i,
      /Order\s+Number:\s*([A-Z0-9-]+)/i,
      /Order:\s*([A-Z0-9-]+)/i
    ];
    
    for (const pattern of textOrderPatterns) {
      const match = textContent.match(pattern);
      if (match && match[1]) {
        const orderNumber = match[1].trim();
        orderInfo.order_number = orderNumber;
        console.log(`✅ Order number extracted from text: ${orderNumber}`);
        
        // Validate and potentially correct order type based on order number format
        if (this.isXpressOrderNumber(orderNumber)) {
          if (orderInfo.order_type !== "xpress") {
            orderInfo.order_type = "xpress";
            console.log(`📝 Corrected order type to xpress based on order number format`);
          }
        } else if (this.isRegularOrderNumber(orderNumber)) {
          if (orderInfo.order_type === "xpress") {
            orderInfo.order_type = "regular";
            console.log(`📝 Corrected order type to regular based on order number format`);
          }
        }
        return; // Found in text, done
      }
    }
    
    console.log(`⚠️ Order number not found in email`);
  }
  
  /**
   * Check if order number matches Xpress format: 2 chars/digits, hyphen, then more
   */
  private isXpressOrderNumber(orderNumber: string): boolean {
    const xpressPattern = /^\d{2}-[A-Z0-9]+$/;
    return xpressPattern.test(orderNumber);
  }
  
  /**
   * Check if order number matches regular format: ~8 digits, no hyphen
   */
  private isRegularOrderNumber(orderNumber: string): boolean {
    const regularPattern = /^\d{7,9}$/; // 7-9 digits to be flexible
    return regularPattern.test(orderNumber);
  }
  
  /**
   * Extract HTML content from email message
   */
  private getHtmlContent(emailContent: string): string {
    // Look for HTML content in multipart email
    const htmlMatch = emailContent.match(/Content-Type: text\/html[\s\S]*?\n\n([\s\S]*?)(?=\n--|\nContent-Type:|\n\.\n|$)/);
    if (htmlMatch) {
      return htmlMatch[1];
    }
    
    // If no HTML found, return the content as-is
    return emailContent;
  }
  
  /**
   * Decode email header
   */
  private decodeHeader(header: string): string {
    // Basic header decoding - in a real implementation you might want more sophisticated decoding
    return header.replace(/=\?[^?]+\?[BQ]\?([^?]+)\?=/g, (match, encoded) => {
      try {
        return Buffer.from(encoded, 'base64').toString('utf8');
      } catch {
        return encoded;
      }
    });
  }
}

// Helper functions for external use

/**
 * Parse an order confirmation email from a file
 */
export function parseOrderEmailFile(filePath: string): OrderInfo {
  const fs = require('fs');
  const parser = new OrderConfirmationParser();
  
  const emailContent = fs.readFileSync(filePath, 'utf8');
  return parser.parseEmail(emailContent);
}

/**
 * Parse an order confirmation email from Gmail API response
 */
export function parseGmailApiMessage(gmailMessage: any, debug: boolean = false): OrderInfo {
  if (debug) {
    console.log(`\n📧 ===== PARSING GMAIL MESSAGE START =====`);
    console.log(`📧 MESSAGE ID: ${gmailMessage.id}`);
    console.log(`📧 ===== PARSING GMAIL MESSAGE START =====\n`);
  }
  
  const parser = new OrderConfirmationParser(debug);
  
  // Extract HTML content from Gmail API payload (handle quoted-printable + charset)
  let htmlContent = "";
  if (gmailMessage.payload) {
    const payload = gmailMessage.payload;

    // Helper to decode a part body with potential quoted-printable and charset
    const decodePartBody = (part: any): string => {
      const b64 = part?.body?.data || '';
      if (!b64) return '';
      // Gmail uses base64url
      const raw = Buffer.from(b64, 'base64').toString('latin1');

      const headers: Record<string, string> = {};
      if (Array.isArray(part.headers)) {
        for (const h of part.headers) {
          headers[(h.name || '').toLowerCase()] = h.value || '';
        }
      }
      const contentType = headers['content-type'] || '';
      const transferEncoding = headers['content-transfer-encoding'] || '';
      const charsetMatch = contentType.match(/charset=([\w\-]+)/i);
      const charset = (charsetMatch?.[1] || 'utf-8').toLowerCase();

      const looksQuotedPrintable = transferEncoding.toLowerCase() === 'quoted-printable' || /=\r?\n|=3D/.test(raw);

      const qpDecodeToBuffer = (qp: string): Buffer => {
        const cleaned = qp.replace(/=\r?\n/g, '');
        const bytes: number[] = [];
        for (let i = 0; i < cleaned.length; i++) {
          const ch = cleaned[i];
          if (ch === '=' && i + 2 < cleaned.length) {
            const hex = cleaned.slice(i + 1, i + 3);
            if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
              bytes.push(parseInt(hex, 16));
              i += 2;
              continue;
            }
          }
          bytes.push(cleaned.charCodeAt(i));
        }
        return Buffer.from(bytes);
      };

      try {
        if (looksQuotedPrintable) {
          const buf = qpDecodeToBuffer(raw);
          if (charset.includes('iso-8859-1') || charset.includes('latin1') || charset.includes('windows-1252')) {
            return buf.toString('latin1');
          }
          return buf.toString('utf8');
        } else {
          // Not quoted-printable; decode using charset
          const buf = Buffer.from(raw, 'latin1');
          if (charset.includes('iso-8859-1') || charset.includes('latin1') || charset.includes('windows-1252')) {
            return buf.toString('latin1');
          }
          return buf.toString('utf8');
        }
      } catch (e) {
        // Fallback to utf8
        return Buffer.from(raw, 'latin1').toString('utf8');
      }
    };

    if (payload.parts) {
      // Prefer text/html part; if multipart/alternative, headers may be on each part
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html') {
          htmlContent = decodePartBody(part);
          break;
        }
      }
      if (!htmlContent) {
        // Some emails nest parts; attempt one level deeper
        for (const part of payload.parts) {
          if (part.parts && Array.isArray(part.parts)) {
            for (const sub of part.parts) {
              if (sub.mimeType === 'text/html') {
                htmlContent = decodePartBody(sub);
                break;
              }
            }
            if (htmlContent) break;
          }
        }
      }
    } else if (payload.mimeType === 'text/html') {
      htmlContent = decodePartBody(payload);
    }
  }
  
  const orderInfo = parser.parseEmail(htmlContent);
  
  // Extract metadata from Gmail API headers
  const headers = gmailMessage.payload?.headers || [];
  for (const header of headers) {
    const name = header.name?.toLowerCase() || '';
    const value = header.value || '';
    
    if (name === 'subject') {
      orderInfo.email_subject = value;
    } else if (name === 'from') {
      orderInfo.sender = value;
    } else if (name === 'date') {
      orderInfo.email_date = value;
    }
  }
  
  return orderInfo;
}

/**
 * Convert OrderInfo to a dictionary-like object for easy serialization
 */
export function orderInfoToDict(orderInfo: OrderInfo): Record<string, any> {
  return {
    merchant: orderInfo.merchant,
    order_number: orderInfo.order_number,
    order_type: orderInfo.order_type,
    product_name: orderInfo.product_name,
    product_variant: orderInfo.product_variant,
    size: orderInfo.size,
    condition: orderInfo.condition,
    style_id: orderInfo.style_id,
    product_image: {
      url: orderInfo.product_image_url,
      alt_text: orderInfo.product_image_alt
    },
    pricing: {
      purchase_price: orderInfo.purchase_price,
      processing_fee: orderInfo.processing_fee,
      shipping_fee: orderInfo.shipping_fee,
      shipping_type: orderInfo.shipping_type,
      total_amount: orderInfo.total_amount,
      currency: orderInfo.currency
    },
    delivery: {
      estimated_start: orderInfo.estimated_delivery_start,
      estimated_end: orderInfo.estimated_delivery_end
    },
    shipping: {
      tracking_number: orderInfo.tracking_number,
      carrier: orderInfo.carrier,
      status: orderInfo.shipping_status
    },
    purchase_info: {
      purchase_date: orderInfo.purchase_date
    },
    email_metadata: {
      subject: orderInfo.email_subject,
      date: orderInfo.email_date,
      sender: orderInfo.sender
    }
  };
  
  console.log(`\n📧 ===== PARSING GMAIL MESSAGE COMPLETE =====`);
  console.log(`📧 FINAL ORDER INFO:`, {
    order_number: orderInfo.order_number,
    product_name: orderInfo.product_name,
    size: orderInfo.size,
    total_amount: orderInfo.total_amount
  });
  console.log(`📧 ===== PARSING GMAIL MESSAGE COMPLETE =====\n`);
  
  return orderInfo;
} 