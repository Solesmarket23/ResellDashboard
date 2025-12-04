import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { OrderConfirmationParser, OrderInfo } from '@/lib/email/orderConfirmationParser';
import { consolidatePurchasesByOrderNumber } from '@/lib/utils/statusPriority';

const EMAIL_FILES = [
  '01-order-confirmed.eml',
  '02-order-confirmation.eml',
  '03-xpress-order-confirmed.eml',
  '04-order-verified-shipped.eml',
  '05-order-shipped.eml',
  '06-xpress-order-shipped.eml',
  '07-xpress-ship-order-delivered.eml',
  '08-order-delivered.eml'
];

// Sample email content embedded for Vercel deployment
// These are the actual email files embedded as strings
const SAMPLE_EMAILS: Record<string, string> = {};

export async function GET() {
  const results: Array<{
    filename: string;
    success: boolean;
    error?: string;
    data?: OrderInfo;
    sourceEmails?: string[];
  }> = [];

  const parser = new OrderConfirmationParser(true); // Enable debug mode

  // Parse all emails first
  for (const filename of EMAIL_FILES) {
    try {
      let emailContent: string | null = null;
      
      // Try to read from file system first (for local development)
      const filePath = join(process.cwd(), 'sample-emails', filename);
      if (existsSync(filePath)) {
        emailContent = readFileSync(filePath, 'utf-8');
      } else if (SAMPLE_EMAILS[filename]) {
        // Fallback to embedded content (for Vercel)
        emailContent = SAMPLE_EMAILS[filename];
      } else {
        // If neither available, skip with error
        results.push({
          filename,
          success: false,
          error: 'Email file not found. Please upload email content via POST request.'
        });
        continue;
      }
      
      if (emailContent) {
        // Log some debug info
        console.log(`\n📧 Processing ${filename}`);
        console.log(`   Content length: ${emailContent.length} chars`);
        console.log(`   Has Delivered-To: ${emailContent.includes('Delivered-To:')}`);
        console.log(`   Has Return-Path: ${emailContent.includes('Return-Path:')}`);
        console.log(`   Has StockX: ${emailContent.toLowerCase().includes('stockx')}`);
        
        const orderInfo = parser.parseEmail(emailContent);
        
        // Log what was extracted
        console.log(`   Extracted Order #: ${orderInfo.order_number || 'NONE'}`);
        console.log(`   Extracted Size: ${orderInfo.size || 'NONE'}`);
        console.log(`   Extracted Product: ${orderInfo.product_name || 'NONE'}`);
        console.log(`   Merchant: ${orderInfo.merchant || 'NONE'}`);
        
        results.push({
          filename,
          success: true,
          data: orderInfo
        });
      }
    } catch (error) {
      results.push({
        filename,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Consolidate results by order number
  const successfulResults = results.filter(r => r.success && r.data?.order_number);
  
  if (successfulResults.length > 0) {
    // Convert to format expected by consolidation utility
    const purchases = successfulResults.map(r => ({
      orderNumber: r.data!.order_number,
      order_number: r.data!.order_number,
      status: r.data!.shipping_status || 'ordered',
      shipping_status: r.data!.shipping_status || 'ordered',
      ...r.data,
      filename: r.filename
    }));
    
    // Consolidate using priority system
    const consolidated = consolidatePurchasesByOrderNumber(purchases);
    
    // Map back to test result format
    const consolidatedResults: typeof results = [];
    const processedOrderNumbers = new Set<string>();
    const failedResults = results.filter(r => !r.success);
    
    for (const consolidatedPurchase of consolidated) {
      const orderNumber = consolidatedPurchase.orderNumber || consolidatedPurchase.order_number;
      if (!orderNumber || processedOrderNumbers.has(orderNumber)) continue;
      
      processedOrderNumbers.add(orderNumber);
      
      // Find all source emails for this order
      const sourceEmails = successfulResults
        .filter(r => r.data?.order_number === orderNumber)
        .map(r => r.filename);
      
      // Get the highest priority result
      const primaryResult = successfulResults.find(r => r.data?.order_number === orderNumber);
      
      if (primaryResult) {
        consolidatedResults.push({
          filename: sourceEmails.length > 1 
            ? `${orderNumber} (${sourceEmails.length} emails)` 
            : primaryResult.filename,
          success: true,
          data: {
            ...consolidatedPurchase as OrderInfo,
            email_subject: primaryResult.data?.email_subject || '',
            email_date: primaryResult.data?.email_date || '',
            sender: primaryResult.data?.sender || ''
          },
          sourceEmails: sourceEmails.length > 1 ? sourceEmails : undefined
        });
      }
    }
    
    return NextResponse.json({ results: [...consolidatedResults, ...failedResults] });
  }

  return NextResponse.json({ results });
}

// POST endpoint to test with custom email content
// Can accept single email or array of emails for consolidation
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Support both single email and array of emails
    const isBatch = Array.isArray(body);
    const emails = isBatch ? body : [{ emailContent: body.emailContent, filename: body.filename || 'custom-email.eml' }];
    
    if (!isBatch && !body.emailContent) {
      return NextResponse.json(
        { error: 'emailContent is required' },
        { status: 400 }
      );
    }

    const parser = new OrderConfirmationParser(true);
    const allResults: Array<{
      filename: string;
      success: boolean;
      error?: string;
      data?: OrderInfo;
      sourceEmails?: string[]; // Track which emails were consolidated
    }> = [];
    
    // Parse all emails first
    for (const emailData of emails) {
      const { emailContent, filename = 'custom-email.eml' } = emailData;
      
      if (!emailContent) {
        allResults.push({
          filename,
          success: false,
          error: 'emailContent is required'
        });
        continue;
      }
      
      try {
        // Log email content info for debugging
        console.log(`\n📧 ===== TEST API: Processing ${filename} =====`);
        console.log(`   Content length: ${emailContent.length} chars`);
        console.log(`   Has Delivered-To: ${emailContent.includes('Delivered-To:')}`);
        console.log(`   Has Return-Path: ${emailContent.includes('Return-Path:')}`);
        console.log(`   Has StockX: ${emailContent.toLowerCase().includes('stockx')}`);
        
        const orderInfo = parser.parseEmail(emailContent);
        
        // Get HTML content for debugging (access private method via any cast)
        const htmlContent = (parser as any).getHtmlContent(emailContent);
        const hasEncodedHtml = htmlContent.includes('class=3D') || htmlContent.includes('=3D');
        
        // Log what was extracted
        console.log(`\n📊 ===== TEST API: Extraction Results =====`);
        console.log(`   Order #: ${orderInfo.order_number || 'NONE'}`);
        console.log(`   Product: ${orderInfo.product_name || 'NONE'}`);
        console.log(`   Size: ${orderInfo.size || 'NONE'}`);
        console.log(`   Status: ${orderInfo.shipping_status || 'NONE'}`);
        console.log(`📊 ===== TEST API: Extraction Results =====\n`);

        allResults.push({
          filename,
          success: true,
          data: orderInfo
        });
      } catch (error) {
        allResults.push({
          filename,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    // If we have multiple emails, consolidate by order number
    if (allResults.length > 1) {
      const successfulResults = allResults.filter(r => r.success && r.data?.order_number);
      
      if (successfulResults.length > 0) {
        // Convert to format expected by consolidation utility
        const purchases = successfulResults.map(r => ({
          orderNumber: r.data!.order_number,
          order_number: r.data!.order_number,
          status: r.data!.shipping_status || 'ordered',
          shipping_status: r.data!.shipping_status || 'ordered',
          ...r.data,
          filename: r.filename, // Keep filename for tracking
          email_subject: r.data!.email_subject, // Keep subject for order confirmation detection
          email_date: r.data!.email_date, // Keep email_date for purchase date
          // Ensure email_date is available for consolidation
          createdAt: r.data!.email_date ? new Date(r.data!.email_date).toISOString() : undefined
        }));
        
        // Debug: Log what we're passing to consolidation
        console.log(`\n📧 TEST API: Passing ${purchases.length} purchases to consolidation:`);
        purchases.forEach(p => {
          console.log(`   Order ${p.orderNumber}: status="${p.status}", email_date="${p.email_date}", subject="${p.email_subject}", filename="${p.filename}"`);
        });
        
        // Consolidate using priority system
        const consolidated = consolidatePurchasesByOrderNumber(purchases);
        
        // Map back to test result format, tracking source emails
        const consolidatedResults: typeof allResults = [];
        const processedOrderNumbers = new Set<string>();
        
        for (const consolidatedPurchase of consolidated) {
          const orderNumber = consolidatedPurchase.orderNumber || consolidatedPurchase.order_number;
          if (!orderNumber || processedOrderNumbers.has(orderNumber)) continue;
          
          processedOrderNumbers.add(orderNumber);
          
          // Find all source emails for this order
          const sourceEmails = successfulResults
            .filter(r => r.data?.order_number === orderNumber)
            .map(r => r.filename);
          
          // Get the highest priority result (should match consolidated purchase)
          const primaryResult = successfulResults.find(r => r.data?.order_number === orderNumber);
          
          // Debug: Log purchase date info
          console.log(`\n📅 TEST API: Consolidation result for ${orderNumber}:`);
          console.log(`   Consolidated purchaseDate: ${consolidatedPurchase.purchaseDate}`);
          console.log(`   Consolidated purchase_date: ${consolidatedPurchase.purchase_date}`);
          console.log(`   Consolidated email_date: ${consolidatedPurchase.email_date}`);
          console.log(`   Primary result purchase_date: ${primaryResult?.data?.purchase_date}`);
          console.log(`   Primary result email_date: ${primaryResult?.data?.email_date}`);
          
          if (primaryResult) {
            consolidatedResults.push({
              filename: sourceEmails.length > 1 
                ? `${orderNumber} (${sourceEmails.length} emails)` 
                : primaryResult.filename,
              success: true,
              data: {
                ...consolidatedPurchase as OrderInfo,
                // Use consolidated purchase_date (from order confirmation email) - this should be set by consolidation
                purchase_date: consolidatedPurchase.purchase_date || consolidatedPurchase.email_date || primaryResult.data?.purchase_date || primaryResult.data?.email_date || '',
                email_date: consolidatedPurchase.email_date || primaryResult.data?.email_date || '',
                // Preserve email metadata from primary result
                email_subject: primaryResult.data?.email_subject || '',
                sender: primaryResult.data?.sender || ''
              },
              sourceEmails: sourceEmails.length > 1 ? sourceEmails : undefined
            });
          }
        }
        
        // Add failed results
        const failedResults = allResults.filter(r => !r.success);
        
        // Return consolidated results
        if (isBatch) {
          return NextResponse.json({ results: [...consolidatedResults, ...failedResults] });
        } else {
          // Single email - return as before
          return NextResponse.json(consolidatedResults[0] || allResults[0]);
        }
      }
    }
    
    // Single email or no consolidation needed
    if (isBatch) {
      return NextResponse.json({ results: allResults });
    } else {
      return NextResponse.json(allResults[0]);
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

