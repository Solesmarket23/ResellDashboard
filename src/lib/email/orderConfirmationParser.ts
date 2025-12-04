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
  discount_code: string; // e.g., "B10-6HRXZ2"
  discount_amount: number; // e.g., -10.00
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
    discount_code: "",
    discount_amount: 0.0,
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
    
    if (this.debug) {
      console.log(`\n📧 ===== HTML EXTRACTION FROM EML =====`);
      console.log(`   HTML Content length: ${htmlContent.length} chars`);
      console.log(`   HTML preview (first 500 chars): ${htmlContent.substring(0, 500)}`);
      console.log(`   Contains '<html': ${htmlContent.toLowerCase().includes('<html')}`);
      console.log(`   Contains '<li': ${htmlContent.includes('<li')}`);
      console.log(`   Contains 'class="attributes"': ${htmlContent.includes('class="attributes"')}`);
      console.log(`📧 ===== HTML EXTRACTION FROM EML =====\n`);
    }
    
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
    if (this.debug) {
      console.log(`\n🔍 PARSE STOCKX EMAIL START`);
      console.log(`   HTML Content length: ${htmlContent.length}`);
      console.log(`   HTML starts with: ${htmlContent.substring(0, 100)}`);
      console.log(`   Contains '<li': ${htmlContent.includes('<li')}`);
      console.log(`   Contains 'class="attributes"': ${htmlContent.includes('class="attributes"')}`);
      console.log(`   Contains 'Size:': ${htmlContent.includes('Size:')}`);
    }
    
    // Clean HTML and extract text
    const $: any = cheerio.load(htmlContent);
    const textContent: string = ($('body').text && $('body').text()) || ($.root && $.root().text && $.root().text()) || '';
    
    if (this.debug) {
      console.log(`   Text content length: ${textContent.length}`);
      console.log(`   Text preview: ${textContent.substring(0, 200)}`);
    }
    
    // Get subject from email (check multiple locations)
    const subjectMatch = htmlContent.match(/<title>([^<]+)<\/title>/i) || 
                        htmlContent.match(/Subject:\s*([^\n]+)/i) ||
                        htmlContent.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    const emailSubject = subjectMatch ? subjectMatch[1].trim() : '';
    
    console.log(`🔍 EMAIL SUBJECT: "${emailSubject}"`);
    
    // Comprehensive subject line patterns for all StockX email types
    const subjectPatterns = {
      // Refund patterns (highest priority)
      refund: [
        'Refund Issued:',
        'Refund:',
        'Order Refunded:',
        'Refund Processed:'
      ],
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
    let emailType: 'order' | 'shipped' | 'delivered' | 'refund' = 'order';
    let isXpress = false;
    
    // Check for refund emails first (highest priority)
    if (subjectPatterns.refund.some(pattern => 
        normalizedSubject.includes(pattern.toLowerCase()) || 
        normalizedHtml.includes(pattern.toLowerCase())
      )) {
      emailType = 'refund';
      orderInfo.shipping_status = "refunded";
      console.log(`💰 REFUND EMAIL DETECTED: "${emailSubject}"`);
    }
    // Check for delivery emails (second priority)
    else if (subjectPatterns.delivered.some(pattern => 
        normalizedSubject.includes(pattern.toLowerCase()) || 
        normalizedHtml.includes(pattern.toLowerCase())
      )) {
      emailType = 'delivered';
      orderInfo.shipping_status = "delivered";
      console.log(`📬 DELIVERY EMAIL DETECTED: "${emailSubject}"`);
    }
    // Check for shipping emails (third priority)
    else if (subjectPatterns.shipped.some(pattern => 
        normalizedSubject.includes(pattern.toLowerCase()) || 
        normalizedHtml.includes(pattern.toLowerCase())
      )) {
      emailType = 'shipped';
      orderInfo.shipping_status = "shipped";
      console.log(`📦 SHIPPING EMAIL DETECTED: "${emailSubject}"`);
    }
    // Check for order confirmation emails (lowest priority)
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
      if (normalizedHtml.includes('refund') || 
          normalizedHtml.includes('refund issued') ||
          normalizedHtml.includes('refund processed')) {
        emailType = 'refund';
        orderInfo.shipping_status = "refunded";
        console.log(`💰 REFUND EMAIL DETECTED (fallback): "${emailSubject}"`);
      } else if (normalizedHtml.includes('order delivered') || 
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
    
    // Extract tracking ONLY for shipped and delivered emails
    // Order confirmation emails (Order Confirmed, Order Confirmation, Xpress Order Confirmed) 
    // do not have tracking numbers yet - NEVER extract tracking from these
    if (emailType === 'shipped' || emailType === 'delivered') {
      console.log(`🔍 Extracting tracking for ${emailType} email...`);
      this.extractStockXTrackingInfo(htmlContent, textContent, orderInfo);
    } else {
      // Explicitly ensure no tracking is set for order confirmation emails
      orderInfo.tracking_number = "";
      orderInfo.carrier = "";
      console.log(`⏭️ Skipping tracking extraction for ${emailType} email (no tracking available yet)`);
    }
    
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
    
    // Extract size - Prioritize <li class="attributes"> pattern using cheerio
    let sizeFound = false;
    
    // Method 0: First try the simplest possible pattern - "Size: US S" or "Size: US W 8.5" anywhere in HTML
    // This handles cases where cheerio fails due to encoded HTML
    // Pattern 1: Match "US W 8.5" or "US M 10" format (letter followed by number)
    const simpleSizeMatch1 = htmlContent.match(/Size:\s*(US\s+[A-Z]\s+\d+(?:\.\d+)?)/i);
    if (simpleSizeMatch1 && simpleSizeMatch1[1]) {
      let size = simpleSizeMatch1[1].trim().replace(/\s+/g, ' ');
      if (this.isValidSizeFormat(size)) {
        orderInfo.size = size;
        sizeFound = true;
        console.log(`✅ SIZE EXTRACTED using simple pattern (US W 8.5 format): "${size}"`);
      } else {
        console.log(`⚠️ Simple pattern matched "${size}" but validation failed`);
      }
    }
    // Pattern 2: Match "US S" or "US M" format (single letter)
    if (!sizeFound) {
      const simpleSizeMatch2 = htmlContent.match(/Size:\s*(US\s+[A-Z0-9\.]+)/i);
      if (simpleSizeMatch2 && simpleSizeMatch2[1]) {
        let size = simpleSizeMatch2[1].trim().replace(/\s+/g, ' ');
        if (this.isValidSizeFormat(size)) {
          orderInfo.size = size;
          sizeFound = true;
          console.log(`✅ SIZE EXTRACTED using simple pattern: "${size}"`);
        } else {
          console.log(`⚠️ Simple pattern matched "${size}" but validation failed`);
        }
      }
    }
    
    // Method 1: Use cheerio to parse HTML and find <li class="attributes"> elements
    if (!sizeFound) {
      try {
        const $ = cheerio.load(htmlContent);
        const attributeLis = $('li.attributes');
        
        for (let i = 0; i < attributeLis.length; i++) {
          const li = attributeLis.eq(i);
          const text = li.text().trim();
          
          // Look for "Size:" in the text
          const sizeMatch = text.match(/^Size:\s*(.+)$/i);
          if (sizeMatch) {
            let size = sizeMatch[1].trim();
            
            // Clean up the size
            size = size.replace(/[,;].*$/, '').trim(); // Remove anything after comma or semicolon
            size = size.replace(/\s+/g, ' ').trim(); // Normalize whitespace
            
            // Validate it looks like a real size
            if (size && size.length > 0 && size.length <= 25 && this.isValidSizeFormat(size)) {
              orderInfo.size = size;
              sizeFound = true;
              console.log(`✅ SIZE EXTRACTED using cheerio from <li class="attributes">: "${size}"`);
              break;
            } else {
              console.log(`⚠️ Cheerio found "${size}" but validation failed`);
            }
          }
        }
      } catch (error) {
        console.log(`⚠️ Error using cheerio for size extraction: ${error}`);
      }
    }
    
    // Method 2: If cheerio didn't find it, use regex patterns (prioritize <li class="attributes">)
    // Handle both encoded (=3D) and decoded (=) HTML
    if (!sizeFound) {
      const sizePatterns = [
        // Highest priority: Match "US W 8.5" or "US M 10" format (letter followed by number)
        /Size:\s*(US\s+[A-Z]\s+\d+(?:\.\d+)?)(?:\s|$|,|;|\.|<\/)/i,
        // Second priority: Simple pattern that matches "Size: US S" anywhere (handles multi-line tags)
        // Capture the full "US S" or "US 10" etc.
        /Size:\s*(US\s+[A-Z0-9\.]+)(?:\s|$|,|;|\.|<\/)/i,
        
        // Handle encoded HTML (class=3D"attributes") - match across line breaks
        /<li[^>]*class=3D["']attributes["'][^>]*>[\s\S]*?Size:\s*([^<\n\r!]+?)\s*<\/li>/i,
        /<li[^>]*class=3D["']attributes["'][^>]*style=3D[^>]*>[\s\S]*?Size:\s*([^<\n\r!]+?)\s*<\/li>/i,
        // More flexible: match even if there are spaces or other attributes
        /<li[^>]*class\s*=\s*3D\s*["']attributes["'][^>]*>[\s\S]*?Size:\s*([^<\n\r!]+?)\s*<\/li>/i,
        // Very specific pattern for encoded HTML with style attribute (most common case)
        /<li[^>]*class=3D["']attributes["'][^>]*style=3D[^>]*>[\s\S]*?Size:\s*([A-Z0-9\.\s]+?)\s*<\/li>/i,
        // Handle decoded HTML (class="attributes") - match across line breaks
        /<li[^>]*class=["']attributes["'][^>]*>[\s\S]*?Size:\s*([^<\n\r!]+?)\s*<\/li>/i,
        /<li[^>]*class=["']attributes["'][^>]*style=["'][^"']*["'][^>]*>[\s\S]*?Size:\s*([^<\n\r!]+?)\s*<\/li>/i,
        /<li[^>]*class=["']attributes["'][^>]*>Size:\s*([^<\n\r!]+?)<\/li>/i,
        
        // Pattern for sizes without "Size:" prefix in attributes list
        /<li[^>]*class=["']attributes["'][^>]*>\s*(US\s+[A-Z0-9\.\s]+?)\s*<\/li>/i,
        
        // Other list item patterns
        /<li[^>]*>.*?Size:\s*([^<\n\r!]+?)<\/li>/i,
        
        // Table cell patterns
        /<td[^>]*>Size:\s*([^<\n\r!]+?)<\/td>/i,
        /<td[^>]*>.*?Size:\s*([^<\n\r!]+?)<\/td>/i,
        
        // Generic HTML patterns
        /<[^>]*>Size:\s*([^<\n\r!]+?)<\/[^>]*>/i,
        /Size:\s*US\s*([A-Z0-9\.\s]+?)(?=<|$)/i,
        /Size:\s*([^<\n\r!]+?)(?=<|$)/i,
        
        // Text patterns with context
        /(?:^|\n|\s)Size:\s*(US\s+[A-Z0-9\.\s]+?)(?:\n|\s|$)/im,
        /(?:^|\n|\s)Size:\s*([A-Z0-9\.\s]+?)(?:\n|\s|$)/im
      ];
      
      for (let i = 0; i < sizePatterns.length; i++) {
        const pattern = sizePatterns[i];
        const match = htmlContent.match(pattern);
        if (match) {
          let size = match[1].trim();
          
          // Skip if this looks like CSS or code
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
          
          // Don't reject if it contains valid size indicators
          const hasValidSizeIndicators = /US|W|M|L|S|XL|XXL|GS|Y|\.5|\.0|\.5Y|\.0Y/i.test(size);
          
          // Skip single digit numbers that are likely CSS values
          if (/^[0-9]+$/.test(size) && size.length <= 2) {
            continue;
          }
          
          // Reject if it has CSS patterns but no valid size indicators
          if (isCssPattern && !hasValidSizeIndicators) {
            continue;
          }
          
          // Clean up the size string
          size = size.replace(/^Size[\s:]*/i, '').trim();
          size = size.replace(/[,;].*$/, '').trim(); // Remove anything after comma or semicolon
          size = size.replace(/[<>]/g, '').trim(); // Remove any HTML tags
          size = size.replace(/\s+/g, ' ').trim(); // Normalize whitespace
          
          // Reject code-like numeric matches (e.g., 601)
          if (/^\d{3,4}$/.test(size) && /^[0-9]+$/.test(size)) {
            continue;
          }
          
          // Validate it looks like a real size
          if (size && size !== 'Size' && size.length > 0 && size.length <= 25) {
            if (/[A-Za-z0-9]/.test(size)) {
              const isValidSize = this.isValidSizeFormat(size);
              if (isValidSize) {
                orderInfo.size = size;
                sizeFound = true;
                console.log(`✅ SIZE EXTRACTED using regex pattern ${i+1}: "${size}"`);
                break;
              }
            }
          }
        }
      }
    }
    
    // Method 3: If still no size found, try fallback methods
    if (!sizeFound) {
      console.log(`🔍 NO SIZE FOUND with primary methods, trying fallback methods...`);
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
    
    // Extract condition - Prioritize <li class="attributes"> pattern
    try {
      const $ = cheerio.load(htmlContent);
      const attributeLis = $('li.attributes');
      
      for (let i = 0; i < attributeLis.length; i++) {
        const li = attributeLis.eq(i);
        const text = li.text().trim();
        
        // Look for "Condition:" in the text
        const conditionMatch = text.match(/^Condition:\s*(.+)$/i);
        if (conditionMatch) {
          const condition = conditionMatch[1].trim();
          if (condition) {
            orderInfo.condition = condition;
            console.log(`✅ CONDITION EXTRACTED using cheerio: "${condition}"`);
            break;
          }
        }
      }
    } catch (error) {
      // Fallback to regex if cheerio fails
      const conditionMatch = htmlContent.match(/Condition:\s*([^<\n]+)/i);
      if (conditionMatch) {
        orderInfo.condition = conditionMatch[1].trim();
        console.log(`✅ CONDITION EXTRACTED using regex: "${orderInfo.condition}"`);
      }
    }
    
    // Extract style ID - Prioritize <li class="attributes"> pattern
    try {
      const $ = cheerio.load(htmlContent);
      const attributeLis = $('li.attributes');
      
      for (let i = 0; i < attributeLis.length; i++) {
        const li = attributeLis.eq(i);
        const text = li.text().trim();
        
        // Look for "Style ID:" in the text
        const styleMatch = text.match(/^Style ID:\s*(.+)$/i);
        if (styleMatch) {
          const styleId = styleMatch[1].trim();
          if (styleId && /^[A-Z0-9\-]+$/i.test(styleId)) {
            orderInfo.style_id = styleId;
            console.log(`✅ STYLE ID EXTRACTED using cheerio: "${styleId}"`);
            break;
          }
        }
      }
    } catch (error) {
      // Fallback to regex if cheerio fails
      const stylePatterns = [
        /<li[^>]*class=["']attributes["'][^>]*>\s*Style ID:\s*([A-Z0-9\-]+)\s*<\/li>/i,
        /Style ID:\s*([A-Z0-9\-]+)\b/i
      ];
      
      for (const pattern of stylePatterns) {
        const match = htmlContent.match(pattern);
        if (match) {
          orderInfo.style_id = match[1].trim();
          console.log(`✅ STYLE ID EXTRACTED using regex: "${orderInfo.style_id}"`);
          break;
        }
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
    
    // Quick check for common valid formats first (before other checks)
    if (/^US\s+[SLM]$/i.test(size) || /^US\s+[X]+[SLM]$/i.test(size) || /^US\s+XS$/i.test(size)) {
      return true;
    }
    // Check for "US W 8.5" or "US M 10" format (letter followed by number)
    if (/^US\s+[A-Z]\s+\d+(?:\.\d+)?$/i.test(size)) {
      return true;
    }
    
    // Reject single digits (likely CSS values like "0", "1", "2", etc.)
    if (/^[0-9]+$/.test(size) && size.length <= 2) {
      return false;
    }
    
    // Common size patterns
    const sizePatterns = [
      // US sizes with letter and number (US W 8.5, US M 10, etc.) - highest priority
      /^US\s+[A-Z]\s+\d+(?:\.\d+)?$/i,
      
      // US sizes with single letter (US S, US M, US L, etc.)
      /^US\s+[SLM]$/i,
      /^US\s+XS$/i,  // US XS
      /^US\s+[X]+[SLM]$/i,  // US XL, US XXL, etc.
      
      // Letter sizes (XS, S, M, L, XL, XXL, etc.) - but not just single letters that are CSS keywords
      /^[X]+[SLM]$/i,  // XXL, XXXL, etc.
      /^[SLM]$/i,      // S, L, M only
      /^[X]*[SLM]\d+$/i, // XS10, M10, etc.
      
      // Number sizes (5, 5.5, 10, 10.5, etc.)
      /^\d+(\.\d+)?$/,
      
      // US sizes (US 5, US M, US W 9, etc.) - general pattern
      /^US\s+[A-Z0-9\.]+$/i,  // US followed by space and alphanumeric (no spaces in middle)
      /^US\s*[A-Z0-9\.\s]+$/i,  // US with optional space and alphanumeric (allows spaces)
      
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
    
    // Method 0: Direct pattern matching for "Size: US X" in any HTML structure (highest priority fallback)
    const directSizePatterns = [
      // Match "Size: US W 8.5" or "Size: US M 10" format (letter followed by number) - highest priority
      /Size:\s*(US\s+[A-Z]\s+\d+(?:\.\d+)?)(?:\s|$|,|;|\.|<\/)/i,
      // Match "Size: US S" or "Size: US M" etc. - capture the full "US S" or "US 10"
      /Size:\s*(US\s+[A-Z0-9\.]+)(?:\s|$|,|;|\.|<\/)/i,
      // Match "Size: US 10" or "Size: US 10.5" etc. - capture the full "US 10"
      /Size:\s*(US\s+\d+(?:\.\d+)?)(?:\s|$|,|;|\.|<\/)/i,
      // Match "Size: US S" even if there's extra whitespace - capture the full "US S"
      /Size:\s*(US\s+[A-Z])(?:\s|$|,|;|\.|<\/)/i,
      // Very simple: just match "Size: US" followed by anything that looks like a size
      /Size:\s*(US\s+[A-Z0-9\.\s]{1,10})(?:\s|$|,|;|\.|<\/|<\/li>)/i
    ];
    
    for (const pattern of directSizePatterns) {
      const match = htmlContent.match(pattern);
      if (match && match[1]) {
        let size = match[1].trim();
        // Clean up any extra whitespace
        size = size.replace(/\s+/g, ' ').trim();
        if (this.isValidSizeFormat(size)) {
          orderInfo.size = size;
          console.log(`✅ SIZE FOUND with direct pattern: "${size}"`);
          return true;
        } else {
          console.log(`⚠️ Pattern matched but validation failed: "${size}"`);
        }
      }
    }
    
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
      // Prioritize "Size: US X" patterns (most common format)
      /Size:\s*US\s+([A-Z0-9\.\s]+?)(?:\s|$|,|;|\.|<\/)/gi,
      /Size:\s*([A-Z0-9\.\s]+?)(?:\s|$|,|;|\.|<\/)/gi,
      /([A-Z0-9\.\s]+?)\s*Size(?:\s|$|,|;|\.|<\/)/gi
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
    if (this.debug) {
      console.log(`\n💰 EXTRACTING PRICING`);
      console.log(`   HTML contains 'Purchase Price': ${htmlContent.includes('Purchase Price')}`);
      console.log(`   HTML contains '$': ${htmlContent.includes('$')}`);
    }
    
    // Purchase Price - handle both encoded and decoded HTML
    const pricePatterns = [
      // Handle encoded HTML (class=3D, style=3D)
      /<td[^>]*class=3D[^>]*>Purchase Price:<\/td>\s*<td[^>]*>\$(\d+\.\d{2})/i,
      /Purchase Price:.*?\$(\d+\.\d{2})/i,
      // Handle decoded HTML
      /<td[^>]*>Purchase Price:<\/td>\s*<td[^>]*>\$(\d+\.\d{2})/i,
      /Purchase Price:.*?\$(\d+\.\d{2})/i
    ];
    
    for (const pattern of pricePatterns) {
      const match = htmlContent.match(pattern);
      if (match) {
        orderInfo.purchase_price = parseFloat(match[1]);
        if (this.debug) {
          console.log(`✅ Purchase Price extracted: $${orderInfo.purchase_price}`);
        }
        break;
      }
    }
    
    // Processing Fee - handle both encoded and decoded HTML
    const processingPatterns = [
      // Handle encoded HTML
      /<td[^>]*class=3D[^>]*>Processing Fee:<\/td>\s*<td[^>]*>\$(\d+\.\d{2})/i,
      /Processing Fee:.*?\$(\d+\.\d{2})/i,
      // Handle decoded HTML
      /<td[^>]*>Processing Fee:<\/td>\s*<td[^>]*>\$(\d+\.\d{2})/i,
      /Processing Fee:.*?\$(\d+\.\d{2})/i
    ];
    
    for (const pattern of processingPatterns) {
      const match = htmlContent.match(pattern);
      if (match) {
        orderInfo.processing_fee = parseFloat(match[1]);
        if (this.debug) {
          console.log(`✅ Processing Fee extracted: $${orderInfo.processing_fee}`);
        }
        break;
      }
    }
    
    // Shipping - handle both encoded and decoded HTML
    const shippingPatterns = [
      // Handle encoded HTML
      /<td[^>]*class=3D[^>]*>(Xpress Shipping|Shipping):<\/td>\s*<td[^>]*>\$(\d+\.\d{2})/i,
      /(Xpress Shipping|Shipping):.*?\$(\d+\.\d{2})/i,
      // Handle decoded HTML
      /<td[^>]*>(Xpress Shipping|Shipping):<\/td>\s*<td[^>]*>\$(\d+\.\d{2})/i,
      /(Xpress Shipping|Shipping):.*?\$(\d+\.\d{2})/i
    ];
    
    for (const pattern of shippingPatterns) {
      const match = htmlContent.match(pattern);
      if (match) {
        orderInfo.shipping_type = match[1];
        orderInfo.shipping_fee = parseFloat(match[2]);
        if (this.debug) {
          console.log(`✅ Shipping Fee extracted: $${orderInfo.shipping_fee} (${orderInfo.shipping_type})`);
        }
        break;
      }
    }
    
    // Discount Code and Amount - Handle multiple formats:
    // 1. Pattern: B + 2 digits + hyphen + 6 alphanumeric (e.g., B10-6HRXZ2)
    // 2. Pattern: FREESHIP or promo codes (e.g., FREESHIPBF2025DV5DHHV4)
    // The discount appears in a table row like: <td>B10-6HRXZ2:</td><td>-$10.00</td>
    // or: <td>FREESHIPBF2025DV5DHHV4:</td><td>-$14.95</td>
    const discountPatterns = [
      // Pattern 1: Handle encoded HTML with B10-6HRXZ2 format (class=3D, style=3D)
      /<td[^>]*class=3D[^>]*>(B\d{2}-[A-Z0-9]{6}):<\/td>\s*<td[^>]*>-\$(\d+\.\d{2})/i,
      /<td[^>]*class=3D[^>]*style=3D[^>]*>(B\d{2}-[A-Z0-9]{6}):<\/td>\s*<td[^>]*>-\$(\d+\.\d{2})/i,
      
      // Pattern 2: Handle encoded HTML with FREESHIP/promo codes (longer alphanumeric codes)
      /<td[^>]*class=3D[^>]*>([A-Z]{6,}[A-Z0-9]{8,}):<\/td>\s*<td[^>]*>-\$(\d+\.\d{2})/i,
      /<td[^>]*class=3D[^>]*style=3D[^>]*>([A-Z]{6,}[A-Z0-9]{8,}):<\/td>\s*<td[^>]*>-\$(\d+\.\d{2})/i,
      
      // Pattern 3: Handle decoded HTML with B10-6HRXZ2 format
      /<td[^>]*>(B\d{2}-[A-Z0-9]{6}):<\/td>\s*<td[^>]*>-\$(\d+\.\d{2})/i,
      
      // Pattern 4: Handle decoded HTML with FREESHIP/promo codes
      /<td[^>]*>([A-Z]{6,}[A-Z0-9]{8,}):<\/td>\s*<td[^>]*>-\$(\d+\.\d{2})/i,
      
      // Pattern 5: More flexible patterns that don't require exact table structure (B10-6HRXZ2)
      /(B\d{2}-[A-Z0-9]{6}):\s*-\$(\d+\.\d{2})/i,
      /(B\d{2}-[A-Z0-9]{6})\s*:\s*.*?-\$(\d+\.\d{2})/i,
      
      // Pattern 6: More flexible patterns for FREESHIP/promo codes (alphanumeric codes 14+ chars)
      /([A-Z]{6,}[A-Z0-9]{8,}):\s*-\$(\d+\.\d{2})/i,
      /([A-Z]{6,}[A-Z0-9]{8,})\s*:\s*.*?-\$(\d+\.\d{2})/i,
      
      // Pattern 7: Very flexible - match any alphanumeric code (8+ chars) followed by colon and negative amount
      // This catches codes that don't match the specific patterns above
      /([A-Z0-9]{8,}):\s*-\$(\d+\.\d{2})/i,
      /([A-Z0-9]{8,})\s*:\s*.*?-\$(\d+\.\d{2})/i
    ];
    
    for (let i = 0; i < discountPatterns.length; i++) {
      const pattern = discountPatterns[i];
      const match = htmlContent.match(pattern);
      if (match && match[1] && match[2]) {
        const code = match[1].trim();
        const amount = parseFloat(match[2]);
        
        // Validate discount code looks reasonable
        // Must be at least 8 characters, contain letters, and not be common words
        const isValidCode = code.length >= 8 && 
                           /[A-Za-z]/.test(code) && 
                           !/^(Purchase|Processing|Shipping|Total|Payment|Price|Fee)$/i.test(code);
        
        if (isValidCode && amount > 0) {
          orderInfo.discount_code = code;
          orderInfo.discount_amount = -amount; // Negative value
          if (this.debug) {
            console.log(`✅ Discount Code extracted using pattern ${i + 1}: ${orderInfo.discount_code} ($${orderInfo.discount_amount})`);
          }
          break;
        } else if (this.debug) {
          console.log(`⚠️ Discount pattern ${i + 1} matched but validation failed: code="${code}", amount=${amount}`);
        }
      }
    }
    
    // Extract total from email for validation (optional)
    let extractedTotal: number | null = null;
    const totalPatterns = [
      // Handle encoded HTML
      /<td[^>]*class=3D[^>]*>.*?Total Payment.*?<\/td>\s*<td[^>]*>\$(\d+\.\d{2})\*?/i,
      /Total Payment.*?\$(\d+\.\d{2})\*?/i,
      // Handle decoded HTML
      /<td[^>]*>.*?Total Payment.*?<\/td>\s*<td[^>]*>\$(\d+\.\d{2})\*?/i,
      /Total.*?\$(\d+\.\d{2})\*?/i
    ];
    
    for (const pattern of totalPatterns) {
      const match = htmlContent.match(pattern);
      if (match) {
        extractedTotal = parseFloat(match[1]);
        if (this.debug) {
          console.log(`✅ Total extracted from email: $${extractedTotal}`);
        }
        break;
      }
    }
    
    // Prioritize extracted total from email (most accurate, especially with discounts)
    if (extractedTotal !== null) {
      orderInfo.total_amount = extractedTotal;
      if (this.debug) {
        console.log(`✅ Using Total Payment from email: $${orderInfo.total_amount}`);
      }
      
      // If no discount code found but total doesn't match calculation, detect discount
      if (!orderInfo.discount_code) {
        const calculatedWithoutDiscount = orderInfo.purchase_price + orderInfo.processing_fee + orderInfo.shipping_fee;
        const difference = calculatedWithoutDiscount - extractedTotal;
        
        // If there's a significant difference (> $0.50), there's likely a discount
        if (difference > 0.5) {
          orderInfo.discount_amount = -difference;
          if (this.debug) {
            console.log(`⚠️ Discount detected from price difference: $${difference.toFixed(2)} (discount code not found in email)`);
          }
        }
      }
    } else {
      // Calculate total: purchase_price + processing_fee + shipping_fee + discount_amount
      const calculatedTotal = orderInfo.purchase_price + orderInfo.processing_fee + orderInfo.shipping_fee + (orderInfo.discount_amount || 0);
      
      if (calculatedTotal > 0) {
        orderInfo.total_amount = parseFloat(calculatedTotal.toFixed(2));
        if (this.debug) {
          const discountStr = orderInfo.discount_amount !== 0 ? ` + (${orderInfo.discount_amount >= 0 ? '+' : ''}$${orderInfo.discount_amount.toFixed(2)})` : '';
          console.log(`💰 Total calculated: $${orderInfo.purchase_price} + $${orderInfo.processing_fee} + $${orderInfo.shipping_fee}${discountStr} = $${orderInfo.total_amount}`);
        }
      } else {
        if (this.debug) {
          console.log(`⚠️ Could not calculate or extract total amount`);
        }
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
    // Priority: UPS and FedEx patterns first (most common for StockX)
    const trackingPatterns = [
      // UPS tracking: 18-character alphanumeric starting with 1Z
      // Format: 1Z + shipper number (6 chars) + service level (2 digits) + package ID (8 digits) = 18 total
      // Highest priority
      /tracking\s*(?:number|#)?:?\s*(1Z[0-9A-Z]{16})\b/i,
      /track\s*(?:your\s*)?(?:package|order|shipment)?:?\s*(1Z[0-9A-Z]{16})\b/i,
      /(?:ups|ups\.com|united\s*parcel).*?(1Z[0-9A-Z]{16})\b/i,
      /(?:track|tracking)[^0-9A-Z]*(1Z[0-9A-Z]{16})\b/i,
      
      // FedEx tracking: 10-22 digits (most common 12, but can be 10, 15, 20, or 22)
      // All numeric, no letters - second priority
      /fedex\.com.*tracknumbers[=%3D](\d{10,22})\b/i,
      /tracknumbers%3D(\d{10,22})\b/i,
      /tracknumbers=(\d{10,22})\b/i,
      /tracking\s*(?:number|#)?:?\s*(\d{10,22})\b/i,
      /(?:fedex|fedex\.com|federal\s*express).*?(\d{10,22})\b/i,
      /(?:track|tracking)[^0-9]*(\d{10,22})\b/i,
      
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
        
        // Validate based on carrier formats (strict validation)
        const isValidTracking = (
          // UPS: 1Z followed by exactly 16 alphanumeric (18 total)
          // Format: 1Z + shipper number (6) + service level (2) + package ID (8) = 18
          /^1Z[0-9A-Z]{16}$/i.test(trackingNum) ||
          // FedEx: 10-22 digits (most common 12, but can be 10, 15, 20, or 22)
          // All numeric, no letters, no dashes
          /^\d{10,22}$/.test(trackingNum) ||
          // USPS: 20-22 digits (for completeness, though StockX doesn't use USPS)
          /^\d{20,22}$/.test(trackingNum) ||
          // DHL: 10 digits (for completeness, though StockX doesn't use DHL)
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
      // Look for UPS tracking (1Z + 16 alphanumeric)
      const upsPattern = /\b(1Z[0-9A-Z]{16})\b/gi;
      const upsMatches = htmlContent.match(upsPattern) || [];
      
      for (const match of upsMatches) {
        // Additional validation: check if it's near shipping/tracking context
        const contextCheck = new RegExp(`(?:tracking|shipped|delivered|package|ups)[\\s\\S]{0,150}${match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]{0,150}(?:tracking|shipped|delivered|package|ups)`, 'i');
        if (contextCheck.test(htmlContent)) {
          orderInfo.tracking_number = match.toUpperCase();
          orderInfo.carrier = "UPS";
          console.log(`✅ TRACKING NUMBER FOUND (UPS with context): "${match}"`);
          break;
        }
      }
      
      // Look for FedEx numbers (10-22 digits, most common 12)
      if (!orderInfo.tracking_number) {
        // Prioritize 12-digit (most common), then check other lengths
        const fedexPatterns = [
          /\b(\d{12})\b/g,  // Most common: 12 digits
          /\b(\d{15})\b/g,  // Common variation: 15 digits
          /\b(\d{10})\b/g,  // Shorter: 10 digits
          /\b(\d{20,22})\b/g // Longer: 20-22 digits
        ];
        
        for (const fedexPattern of fedexPatterns) {
          const fedexMatches = htmlContent.match(fedexPattern) || [];
          
          for (const match of fedexMatches) {
            // Skip if it looks like a date, phone number, or other common number
            // Additional validation: check if it's near shipping/tracking context
            const contextCheck = new RegExp(`(?:tracking|shipped|delivered|package|fedex)[\\s\\S]{0,150}${match}|${match}[\\s\\S]{0,150}(?:tracking|shipped|delivered|package|fedex)`, 'i');
            if (contextCheck.test(htmlContent)) {
              orderInfo.tracking_number = match;
              orderInfo.carrier = "FedEx";
              console.log(`✅ TRACKING NUMBER FOUND (FedEx ${match.length}-digit with context): "${match}"`);
              break;
            }
          }
          if (orderInfo.tracking_number) break;
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
      
      // Last resort for shipping emails - find the FIRST tracking number after "shipped"
      // Try UPS first (1Z + 16 alphanumeric), then FedEx (10-22 digits)
      if (!orderInfo.tracking_number && orderInfo.shipping_status === "shipped") {
        // Try UPS pattern first
        const upsAfterShippedPattern = /(?:shipped|tracking|track your order)[^0-9A-Z]*(1Z[0-9A-Z]{16})\b/i;
        const upsAfterShippedMatch = textContent.match(upsAfterShippedPattern);
        if (upsAfterShippedMatch) {
          orderInfo.tracking_number = upsAfterShippedMatch[1].toUpperCase();
          orderInfo.carrier = "UPS";
          console.log(`✅ TRACKING NUMBER FOUND (UPS after 'shipped'): "${upsAfterShippedMatch[1]}"`);
        } else {
          // Try FedEx pattern (10-22 digits, prioritize 12)
          const fedexAfterShippedPattern = /(?:shipped|tracking|track your order)[^0-9]*(\d{10,22})\b/i;
          const fedexAfterShippedMatch = textContent.match(fedexAfterShippedPattern);
          if (fedexAfterShippedMatch && !fedexAfterShippedMatch[1].includes('-')) {
            orderInfo.tracking_number = fedexAfterShippedMatch[1];
            orderInfo.carrier = "FedEx";
            console.log(`✅ TRACKING NUMBER FOUND (FedEx ${fedexAfterShippedMatch[1].length}-digit after 'shipped'): "${fedexAfterShippedMatch[1]}"`);
          }
        }
      }
    }
    
    // Determine carrier - StockX uses UPS or FedEx
    if (orderInfo.tracking_number) {
      const trackingUpper = orderInfo.tracking_number.toUpperCase();
      
      // UPS tracking numbers: 18-character alphanumeric starting with 1Z
      // Format: 1Z + shipper number (6) + service level (2) + package ID (8) = 18 total
      if (trackingUpper.startsWith('1Z') && trackingUpper.length === 18 && /^1Z[0-9A-Z]{16}$/i.test(trackingUpper)) {
        orderInfo.carrier = "UPS";
      } 
      // FedEx tracking numbers: 10-22 digits (most common 12, but can be 10, 15, 20, or 22)
      // All numeric, no letters
      else if (/^\d{10,22}$/.test(orderInfo.tracking_number)) {
        orderInfo.carrier = "FedEx";
      }
      // Try to detect from HTML content if tracking format doesn't match
      else {
        const htmlUpper = htmlContent.toUpperCase();
        if (htmlUpper.includes('UPS') || htmlUpper.includes('UNITED PARCEL SERVICE')) {
          orderInfo.carrier = "UPS";
        } else if (htmlUpper.includes('FEDEX') || htmlUpper.includes('FEDERAL EXPRESS')) {
          orderInfo.carrier = "FedEx";
        } else {
          // Default to generic carrier for StockX
          orderInfo.carrier = "StockX Logistics";
        }
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
    if (this.debug) {
      console.log(`\n🔍 EXTRACTING ORDER NUMBER`);
      console.log(`   HTML contains 'class=3D': ${htmlContent.includes('class=3D')}`);
      console.log(`   HTML contains 'class=': ${htmlContent.includes('class=')}`);
      console.log(`   HTML contains 'Order number': ${htmlContent.includes('Order number')}`);
      console.log(`   HTML contains 'Order number' (case insensitive): ${/Order\s+number/i.test(htmlContent)}`);
    }
    
    // Priority 1: Search HTML for structured order number (most reliable)
    // Handle both encoded (=3D) and decoded (=) versions
    const htmlOrderPatterns = [
      // Handle encoded HTML: class=3D"attributes"
      /<li[^>]*class=3D["']attributes["'][^>]*>\s*Order\s+number:\s*([A-Z0-9-]+)\s*<\/li>/i,
      /<li[^>]*class=3D["']attributes["'][^>]*style=3D[^>]*>\s*Order\s+number:\s*([A-Z0-9-]+)\s*<\/li>/i,
      // Handle decoded HTML: class="attributes"
      /<li[^>]*class=["']attributes["'][^>]*>\s*Order\s+number:\s*([A-Z0-9-]+)\s*<\/li>/i,
      /<li[^>]*class=["']attributes["'][^>]*>\s*Order\s+Number:\s*([A-Z0-9-]+)\s*<\/li>/i,
      // Fallback patterns
      /<li[^>]*>\s*Order\s+number:\s*([A-Z0-9-]+)\s*<\/li>/i,
      /<td[^>]*>\s*Order\s+number:\s*([A-Z0-9-]+)\s*<\/td>/i,
      // Text-based patterns (work even if HTML is malformed)
      /Order\s+number:\s*([A-Z0-9-]+)/i
    ];
    
    // Try HTML patterns first
    for (let i = 0; i < htmlOrderPatterns.length; i++) {
      const pattern = htmlOrderPatterns[i];
      const match = htmlContent.match(pattern);
      if (match && match[1]) {
        const orderNumber = match[1].trim();
        orderInfo.order_number = orderNumber;
        if (this.debug) {
          console.log(`✅ Order number extracted using pattern ${i + 1}: ${orderNumber}`);
        }
        
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
    
    if (this.debug) {
      console.log(`❌ No order number found with HTML patterns`);
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
   * Extract HTML content from email message and decode quoted-printable
   */
  private getHtmlContent(emailContent: string): string {
    // Find the start of the HTML part
    const htmlPartStart = emailContent.indexOf('Content-Type: text/html');
    if (htmlPartStart === -1) {
      // No HTML part found, check if entire content is HTML
      const encodingMatch = emailContent.match(/Content-Transfer-Encoding:\s*([^\n]+)/i);
      const isQuotedPrintable = encodingMatch && encodingMatch[1].toLowerCase().includes('quoted-printable');
      const charsetMatch = emailContent.match(/Content-Type:.*?charset=([^\s;]+)/i);
      const charset = charsetMatch ? charsetMatch[1].toLowerCase() : 'utf-8';
      
      if (isQuotedPrintable) {
        return this.decodeQuotedPrintable(emailContent, charset);
      }
      return emailContent;
    }
    
    // Extract charset and encoding from headers
    // Check headers BEFORE Content-Type (encoding might be above)
    const headersBeforeHtml = emailContent.substring(Math.max(0, htmlPartStart - 500), htmlPartStart);
    const encodingMatchBefore = headersBeforeHtml.match(/Content-Transfer-Encoding:\s*([^\n\r]+)/i);
    
    // Also check headers after Content-Type
    const headersAfterHtml = emailContent.substring(htmlPartStart, htmlPartStart + 500);
    const encodingMatchAfter = headersAfterHtml.match(/Content-Transfer-Encoding:\s*([^\n\r]+)/i);
    const charsetMatch = headersAfterHtml.match(/charset=([^\s;]+)/i);
    
    const encodingMatch = encodingMatchAfter || encodingMatchBefore;
    const isQuotedPrintable = encodingMatch && encodingMatch[1].toLowerCase().includes('quoted-printable');
    const charset = charsetMatch ? charsetMatch[1].toLowerCase() : 'utf-8';
    
    // Find the blank line after headers (look for \n\n or \r\n\r\n)
    let blankLinePos = emailContent.indexOf('\n\n', htmlPartStart);
    if (blankLinePos === -1) {
      blankLinePos = emailContent.indexOf('\r\n\r\n', htmlPartStart);
      if (blankLinePos !== -1) {
        blankLinePos += 4; // Skip \r\n\r\n
      }
    } else {
      blankLinePos += 2; // Skip \n\n
    }
    
    // If no blank line found, look for HTML start directly
    let contentStart = blankLinePos;
    if (blankLinePos === -1 || blankLinePos <= htmlPartStart) {
      // Look for HTML start markers
      const doctypePos = emailContent.indexOf('<!DOCTYPE', htmlPartStart);
      const htmlPos = emailContent.indexOf('<html', htmlPartStart);
      if (doctypePos !== -1) {
        contentStart = doctypePos;
      } else if (htmlPos !== -1) {
        contentStart = htmlPos;
      } else {
        // Fallback: start after Content-Type header (assume headers end within 200 chars)
        contentStart = htmlPartStart + 200;
      }
    } else {
      // We found blank line, but make sure HTML starts right after it
      // Look for HTML start markers near the blank line
      const doctypePos = emailContent.indexOf('<!DOCTYPE', blankLinePos - 10);
      const htmlPos = emailContent.indexOf('<html', blankLinePos - 10);
      if (doctypePos !== -1 && doctypePos >= blankLinePos - 10) {
        contentStart = doctypePos;
      } else if (htmlPos !== -1 && htmlPos >= blankLinePos - 10) {
        contentStart = htmlPos;
      }
    }
    
    // Find the end of HTML content
    // Priority 1: Look for closing </html> tag (most reliable)
    const htmlEndTag = emailContent.indexOf('</html>', contentStart);
    
    // Priority 2: Look for MIME boundary markers (must be at start of line)
    // Boundaries look like: \n--boundary-name or \r\n--boundary-name
    let nextBoundary = -1;
    const boundaryMatch = emailContent.substring(contentStart).match(/\n--[a-zA-Z0-9_-]+/);
    if (boundaryMatch) {
      nextBoundary = contentStart + emailContent.substring(contentStart).indexOf(boundaryMatch[0]);
    }
    
    // Priority 3: Look for Content-Type header (must be at start of line, not inside HTML)
    // Only match if it's followed by a space and looks like a real header
    let nextContentType = -1;
    const contentTypeMatch = emailContent.substring(contentStart).match(/\nContent-Type:\s+[^\n]+/);
    if (contentTypeMatch) {
      const matchPos = contentStart + emailContent.substring(contentStart).indexOf(contentTypeMatch[0]);
      // Only use if it's after </html> or if </html> wasn't found
      if (htmlEndTag === -1 || matchPos > htmlEndTag) {
        nextContentType = matchPos;
      }
    }
    
    // Determine end position: prefer </html>, then boundary, then Content-Type, then end of file
    let endPos = emailContent.length;
    if (htmlEndTag !== -1) {
      endPos = htmlEndTag + 7; // Include </html>
    } else if (nextBoundary !== -1) {
      endPos = nextBoundary;
    } else if (nextContentType !== -1) {
      endPos = nextContentType;
    }
    
    let html = emailContent.substring(contentStart, endPos).trim();
    
    // Remove trailing boundary markers if present
    html = html.replace(/\n--[^\n]*$/, '');
    html = html.replace(/\r\n--[^\r\n]*$/, '');
    
    // Decode quoted-printable if needed
    if (isQuotedPrintable) {
      html = this.decodeQuotedPrintable(html, charset);
    }
    
    // Debug logging
    if (this.debug) {
      console.log(`📧 HTML EXTRACTION:`);
      console.log(`   Found Content-Type at: ${htmlPartStart}`);
      console.log(`   Blank line at: ${blankLinePos}`);
      console.log(`   Content start: ${contentStart}`);
      console.log(`   Content end: ${endPos}`);
      console.log(`   HTML length (before decode): ${emailContent.substring(contentStart, endPos).trim().length}`);
      console.log(`   HTML length (after decode): ${html.length}`);
      console.log(`   Is quoted-printable: ${isQuotedPrintable}`);
      console.log(`   Charset: ${charset}`);
      console.log(`   HTML preview (first 200 chars): ${html.substring(0, 200)}`);
      console.log(`   HTML contains '<html': ${html.toLowerCase().includes('<html')}`);
      console.log(`   HTML contains '<li': ${html.toLowerCase().includes('<li')}`);
      console.log(`   HTML contains 'Order number': ${html.toLowerCase().includes('order number')}`);
    }
    
    return html;
  }
  
  /**
   * Decode quoted-printable encoded text
   */
  private decodeQuotedPrintable(text: string, charset: string = 'utf-8'): string {
    // Remove soft line breaks (= at end of line)
    let cleaned = text.replace(/=\r?\n/g, '');
    
    // Decode hex sequences (=XX) into bytes
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
    
    // Convert bytes to string based on charset
    const buffer = Buffer.from(bytes);
    if (charset.includes('iso-8859-1') || charset.includes('latin1') || charset.includes('windows-1252')) {
      return buffer.toString('latin1');
    }
    
    // Default to UTF-8
    return buffer.toString('utf8');
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
      discount_code: orderInfo.discount_code,
      discount_amount: orderInfo.discount_amount,
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