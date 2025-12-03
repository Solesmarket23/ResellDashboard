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
        const orderInfo = parser.parseEmail(emailContent);
        
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
    const orderInfo = parser.parseEmail(emailContent);

    return NextResponse.json({
      filename,
      success: true,
      data: orderInfo
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

