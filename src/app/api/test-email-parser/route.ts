import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { OrderConfirmationParser, OrderInfo } from '@/lib/email/orderConfirmationParser';

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
  }> = [];

  const parser = new OrderConfirmationParser(true); // Enable debug mode

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

  return NextResponse.json({ results });
}

// POST endpoint to test with custom email content
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { emailContent, filename = 'custom-email.eml' } = body;
    
    if (!emailContent) {
      return NextResponse.json(
        { error: 'emailContent is required' },
        { status: 400 }
      );
    }

    const parser = new OrderConfirmationParser(true);
    
    // Log email content info for debugging
    console.log(`\n📧 ===== TEST API: Processing ${filename} =====`);
    console.log(`   Content length: ${emailContent.length} chars`);
    console.log(`   Has Delivered-To: ${emailContent.includes('Delivered-To:')}`);
    console.log(`   Has Return-Path: ${emailContent.includes('Return-Path:')}`);
    console.log(`   Has StockX: ${emailContent.toLowerCase().includes('stockx')}`);
    console.log(`   Content preview (first 500 chars): ${emailContent.substring(0, 500)}`);
    
    const orderInfo = parser.parseEmail(emailContent);
    
    // Log what was extracted
    console.log(`\n📊 ===== TEST API: Extraction Results =====`);
    console.log(`   Order #: ${orderInfo.order_number || 'NONE'}`);
    console.log(`   Product: ${orderInfo.product_name || 'NONE'}`);
    console.log(`   Size: ${orderInfo.size || 'NONE'}`);
    console.log(`   Style ID: ${orderInfo.style_id || 'NONE'}`);
    console.log(`   Total: $${orderInfo.total_amount || '0.00'}`);
    console.log(`   Tracking: ${orderInfo.tracking_number || 'NONE'}`);
    console.log(`   Status: ${orderInfo.shipping_status || 'NONE'}`);
    console.log(`📊 ===== TEST API: Extraction Results =====\n`);

    // Check if any data was extracted
    const hasData = orderInfo.order_number || orderInfo.size || orderInfo.product_name || orderInfo.total_amount;
    
    return NextResponse.json({
      filename,
      success: true,
      data: orderInfo,
      debug: {
        hasData,
        extractedFields: {
          order_number: !!orderInfo.order_number,
          size: !!orderInfo.size,
          product_name: !!orderInfo.product_name,
          total_amount: !!orderInfo.total_amount,
          merchant: orderInfo.merchant || 'NONE'
        }
      }
    });
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

