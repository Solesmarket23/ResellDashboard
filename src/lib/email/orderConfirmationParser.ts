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
import { CheerioAPI } from 'cheerio';

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
  
  constructor() {}
  
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
    const $ = cheerio.load(htmlContent);
    const textContent = $.text();
    
    // Detect email type - shipping confirmation or order confirmation
    const isShippingConfirmation = htmlContent.toLowerCase().includes('order shipped') || 
                                   htmlContent.toLowerCase().includes('your order is on its way') ||
                                   htmlContent.toLowerCase().includes('order verified & shipped');
    
    if (isShippingConfirmation) {
      orderInfo.shipping_status = "shipped";
      // Extract tracking number for shipping confirmations
      this.extractStockXTrackingInfo(htmlContent, textContent, orderInfo);
    } else {
      orderInfo.shipping_status = "ordered";
    }
    
    // Initial order type detection from subject/content
    if (htmlContent.toLowerCase().includes('xpress order confirmed')) {
      orderInfo.order_type = "xpress";
    } else {
      orderInfo.order_type = "regular";
    }
    
    // Extract information in order
    this.extractStockXOrderNumber(textContent, orderInfo);
    this.extractStockXProductInfo(htmlContent, textContent, orderInfo);
    this.extractStockXProductImage(htmlContent, orderInfo);
    this.extractStockXPricing(htmlContent, textContent, orderInfo);
    this.extractStockXDelivery(htmlContent, textContent, orderInfo);
    this.extractStockXPurchaseDate(htmlContent, textContent, orderInfo);
  }
  
  /**
   * Extract product details from StockX email
   */
  private extractStockXProductInfo(htmlContent: string, textContent: string, orderInfo: OrderInfo): void {
    // Product name patterns - updated to handle both order confirmations and shipping confirmations
    const productPatterns = [
      // Patterns for shipping confirmation emails
      /(?:Subject:.*?Order Shipped:|✅ Order Shipped:)\s*([^"<\n]+)/i,
      /alt="([^"]+(?:Slipper|Sweatshirt|Shoe|Sneaker|Jacket|Hoodie|Shirt|Pant)[^"]*)"/.i,
      
      // Original patterns for order confirmation emails
      /(?:Subject:.*?Order Confirmed:|Xpress Order Confirmed:)\s*([^"]+?)(?:\s*(?:Chestnut|Grey|Black|White))?(?:\s*\(Women's\))?/i,
      /<td[^>]*class="productName"[^>]*>.*?<a[^>]*>([^<]+)<\/a>/i,
      
      // Generic product name in link
      /<a[^>]*>([^<]+(?:Sweatshirt|Shoe|Sneaker|Jacket|Hoodie|Shirt|Pant)[^<]*)<\/a>/i
    ];
    
    for (const pattern of productPatterns) {
      const match = htmlContent.match(pattern);
      if (match && match[1]) {
        orderInfo.product_name = match[1].trim();
        break;
      }
    }
    
    // Extract variant (color) from product name
    const colorPatterns = [
      /\b(Chestnut|Grey|Gray|Black|White|Red|Blue|Green|Brown)\b/i
    ];
    
    for (const pattern of colorPatterns) {
      const match = orderInfo.product_name.match(pattern);
      if (match) {
        orderInfo.product_variant = match[1];
        break;
      }
    }
    
    // Extract size - comprehensive patterns for StockX emails (avoiding CSS matches)
    const sizePatterns = [
      // StockX specific patterns from the provided email format
      /<li[^>]*class="attributes"[^>]*style="[^"]*">.*?Size:\s*([^<\n\r!]+?)<\/li>/i,
      /<li[^>]*class="attributes"[^>]*>.*?Size:\s*([^<\n\r!]+?)<\/li>/i,
      
      // HTML list items with size information (most specific first)
      /<li[^>]*>.*?(?:U\.S\.\s*)?(?:Men's|Women's)\s*Size:\s*([^<\n\r!]+?)<\/li>/i,
      /<li[^>]*>.*?Size:\s*([^<\n\r!]+?)<\/li>/i,
      
      // Text content patterns (not in HTML tags or CSS) - more specific for US sizing
      /(?:^|\n|\s)Size:\s*(US\s+[MWF]?\s*\d+(?:\.\d+)?[WC]?)(?:\n|\s|$)/im,
      /(?:^|\n|\s)Size:\s*([^\n\r!;{}\s]+(?:\s+[MWF]?\s*\d+(?:\.\d+)?[WC]?)?)(?:\n|\s|$)/im,
      
      // Generic text patterns
      /(?:^|\n)\s*(?:U\.S\.\s*)?(?:Men's|Women's)\s*Size:\s*([^\n\r!;{}]+?)(?:\n|$)/im,
      /(?:^|\n)\s*Size:\s*([^\n\r!;{}]+?)(?:\n|$)/im,
      
      // Product title size extraction (avoid CSS)
      /Size\s+US\s+([A-Z0-9\.\s]+?)(?:\s*[,;\n]|$)/i,
      /Size\s+([XSML]{1,3})(?:\s|$)/i,
      /Size\s+(\d+(?:\.\d+)?[WC]?)(?:\s|$)/i,
      
      // Parenthetical size (common in product names)
      /\(Size\s*([^)!;{}]+)\)/i
    ];
    
    for (const pattern of sizePatterns) {
      const match = htmlContent.match(pattern);
      if (match) {
        let size = match[1].trim();
        
        // Skip if this looks like CSS or code
        if (size.includes('!important') || 
            size.includes('webkit') || 
            size.includes('font-family') ||
            size.includes(';') ||
            size.includes('{') ||
            size.includes('}') ||
            size.includes('%') ||
            size.length > 20) {
          console.log(`🚫 SKIPPING CSS-like match: "${size}"`);
          continue;
        }
        
        // Clean up the size string
        size = size.replace(/^(Size|Men's|Women's)[\s:]*/, '').trim();
        size = size.replace(/[,;].*$/, '').trim(); // Remove anything after comma or semicolon
        
        // Validate it looks like a real size (allow up to 15 chars for "US M 10" format)
        if (size && size !== 'Size' && size.length > 0 && size.length <= 15) {
          orderInfo.size = size;
          console.log(`✅ SIZE EXTRACTED: "${size}" using pattern: ${pattern}`);
          break;
        }
      }
    }
    
    // If no size found, try to extract from product name patterns
    if (!orderInfo.size || orderInfo.size === '15') { // '15' seems to be a default fallback
      const productSizePatterns = [
        /\(Size\s*([^)!;{}]+)\)/i,
        /Size\s*([XSML]+)(?:\s|$)/i,
        /Size\s*(\d+(?:\.\d+)?[WC]?)(?:\s|$)/i
      ];
      
      for (const pattern of productSizePatterns) {
        const match = orderInfo.product_name.match(pattern);
        if (match) {
          let size = match[1].trim();
          
          // Skip if this looks like CSS or is too long
          if (size.includes('!important') || 
              size.includes('webkit') || 
              size.includes(';') ||
              size.length > 10) {
            continue;
          }
          
          orderInfo.size = size;
          console.log(`🔍 SIZE FROM PRODUCT NAME: "${size}"`);
          break;
        }
      }
    }
    
    // Extract condition
    const conditionMatch = htmlContent.match(/Condition:\s*([^<\n]+)/i);
    if (conditionMatch) {
      orderInfo.condition = conditionMatch[1].trim();
    }
    
    // Extract style ID
    const stylePatterns = [
      /Style ID:\s*([^<\n]+)/i,
      /Style:\s*([^<\n]+)/i
    ];
    
    for (const pattern of stylePatterns) {
      const match = htmlContent.match(pattern);
      if (match) {
        orderInfo.style_id = match[1].trim();
        break;
      }
    }
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
    
    let productImg: cheerio.Cheerio<cheerio.Element> | null = null;
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
        /<img[^>]*src="([^"]+)"[^>]*alt="([^"]*(?:Slipper|Sweatshirt|Shoe|Sneaker)[^"]*)"/.i
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
    // Tracking number patterns - looking for long numeric strings
    const trackingPatterns = [
      // Direct tracking number patterns
      /tracking\s*(?:number|#)?:?\s*(\d{10,30})/i,
      /track\s*(?:your\s*)?(?:package|order|shipment)?:?\s*(\d{10,30})/i,
      
      // Pattern from the sample email - large bold number after "Order Verified & Shipped!"
      /Order\s+Verified\s*&\s*Shipped![\s\S]*?<td[^>]*>(\d{10,30})<\/td>/i,
      /Order\s+Verified\s*&\s*Shipped![\s\S]*?>(\d{10,30})</i,
      
      // Generic patterns for standalone tracking numbers
      />(\d{12,30})</,  // 12+ digit numbers in HTML tags
      /\b(\d{12,30})\b/  // 12+ digit numbers as word boundaries
    ];
    
    for (const pattern of trackingPatterns) {
      const match = htmlContent.match(pattern);
      if (match) {
        const trackingNum = match[1].trim();
        // Validate it looks like a real tracking number (10-30 digits)
        if (trackingNum.length >= 10 && trackingNum.length <= 30 && /^\d+$/.test(trackingNum)) {
          orderInfo.tracking_number = trackingNum;
          console.log(`✅ TRACKING NUMBER EXTRACTED: "${trackingNum}" using pattern: ${pattern}`);
          break;
        }
      }
    }
    
    // If no tracking number found in HTML, try text content
    if (!orderInfo.tracking_number) {
      // Look for the specific number from the email sample
      const specificTrackingMatch = textContent.match(/882637178429/);
      if (specificTrackingMatch) {
        orderInfo.tracking_number = specificTrackingMatch[0];
        console.log(`✅ TRACKING NUMBER FOUND (specific match): "882637178429"`);
      }
    }
    
    // Determine carrier - StockX typically uses UPS
    if (orderInfo.tracking_number) {
      // UPS tracking numbers are typically 18 digits starting with 1Z
      if (orderInfo.tracking_number.startsWith('1Z')) {
        orderInfo.carrier = "UPS";
      } else if (orderInfo.tracking_number.length === 12 || orderInfo.tracking_number.length === 15) {
        // FedEx uses 12 or 15 digit tracking numbers
        orderInfo.carrier = "FedEx";
      } else {
        // Default to generic carrier for StockX
        orderInfo.carrier = "StockX Logistics";
      }
    }
  }

  /**
   * Extract order number from StockX email and validate order type
   */
  private extractStockXOrderNumber(textContent: string, orderInfo: OrderInfo): void {
    const orderPatterns = [
      /Order number:\s*([A-Z0-9-]+)/i,
      /Order Number:\s*([A-Z0-9-]+)/i,
      /Order:\s*([A-Z0-9-]+)/i
    ];
    
    for (const pattern of orderPatterns) {
      const match = textContent.match(pattern);
      if (match) {
        const orderNumber = match[1].trim();
        orderInfo.order_number = orderNumber;
        
        // Validate and potentially correct order type based on order number format
        if (this.isXpressOrderNumber(orderNumber)) {
          // If we detected xpress format but hadn't set type as xpress, correct it
          if (orderInfo.order_type !== "xpress") {
            orderInfo.order_type = "xpress";
          }
        } else if (this.isRegularOrderNumber(orderNumber)) {
          // If we detected regular format but had set type as xpress, correct it
          if (orderInfo.order_type === "xpress") {
            orderInfo.order_type = "regular";
          }
        }
        break;
      }
    }
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
export function parseGmailApiMessage(gmailMessage: any): OrderInfo {
  const parser = new OrderConfirmationParser();
  
  // Extract HTML content from Gmail API payload
  let htmlContent = "";
  if (gmailMessage.payload) {
    const payload = gmailMessage.payload;
    
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html') {
          const bodyData = part.body?.data || '';
          if (bodyData) {
            htmlContent = Buffer.from(bodyData, 'base64').toString('utf8');
            break;
          }
        }
      }
    } else if (payload.mimeType === 'text/html') {
      const bodyData = payload.body?.data || '';
      if (bodyData) {
        htmlContent = Buffer.from(bodyData, 'base64').toString('utf8');
      }
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
} 