import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET(request: NextRequest) {
  try {
    // Get Gmail OAuth token from cookies
    const accessToken = request.cookies.get('gmail_access_token')?.value;
    const refreshToken = request.cookies.get('gmail_refresh_token')?.value;

    if (!accessToken) {
      return NextResponse.json({ error: 'Not authenticated with Gmail' }, { status: 401 });
    }

    // Set up Gmail API
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'http://localhost:3000/api/gmail/callback'
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Fetch just a few emails for debugging
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: 'from:stockx.com',
      maxResults: 3
    });

    const debugInfo = [];

    if (response.data.messages) {
      for (const message of response.data.messages) {
        const emailData = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full'
        });

        // Extract all the raw data
        const fromHeader = emailData.data.payload.headers.find((h: any) => h.name === 'From')?.value || '';
        const subjectHeader = emailData.data.payload.headers.find((h: any) => h.name === 'Subject')?.value || '';
        const dateHeader = emailData.data.payload.headers.find((h: any) => h.name === 'Date')?.value || '';
        
        // Extract email content
        let content = '';
        if (emailData.data.payload.body?.data) {
          content = Buffer.from(emailData.data.payload.body.data, 'base64').toString();
        } else if (emailData.data.payload.parts) {
          for (const part of emailData.data.payload.parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) {
              content += Buffer.from(part.body.data, 'base64').toString();
            } else if (part.mimeType === 'text/html' && part.body?.data) {
              content += Buffer.from(part.body.data, 'base64').toString();
            }
          }
        }

        // Try to extract various fields with different patterns
        const orderNumberPatterns = [
          { name: 'Order/Purchase/Confirmation', regex: /(?:Order|Purchase|Confirmation)[\s#:]*([A-Z0-9-]{6,})/i },
          { name: 'Any alphanumeric', regex: /([A-Z0-9-]{10,})/i },
          { name: 'Number only', regex: /([0-9]{6,})/i }
        ];

        const pricePatterns = [
          { name: 'Dollar amount', regex: /\$(\d+(?:\.\d{2})?)/g },
          { name: 'Price/Total', regex: /(?:Price|Total|Amount)[\s:]*\$(\d+(?:\.\d{2})?)/i },
          { name: 'USD amount', regex: /(\d+(?:\.\d{2})?)\s*USD/i }
        ];

        const productPatterns = [
          { name: 'Sneaker brands', regex: /(Jordan|Nike|Adidas|Yeezy|Dunk|Air Max|Travis Scott|Off-White|Dior)[^.]*(?:\.|$)/i },
          { name: 'Product line', regex: /Product[\s:]+([^\n]+)/i },
          { name: 'Item line', regex: /Item[\s:]+([^\n]+)/i }
        ];

        const sizePatterns = [
          { name: 'Size format', regex: /Size[\s:]*([A-Z]*\s*\d+(?:\.\d+)?)/i },
          { name: 'US size', regex: /US\s+(\d+(?:\.\d+)?)/i },
          { name: 'Men size', regex: /Men['\s]*s?\s+(\d+(?:\.\d+)?)/i }
        ];

        // Test all patterns
        const orderResults = orderNumberPatterns.map(p => ({
          pattern: p.name,
          matches: content.match(p.regex) || []
        }));

        const priceResults = pricePatterns.map(p => ({
          pattern: p.name,
          matches: content.match(p.regex) || []
        }));

        const productResults = productPatterns.map(p => ({
          pattern: p.name,
          matches: content.match(p.regex) || []
        }));

        const sizeResults = sizePatterns.map(p => ({
          pattern: p.name,
          matches: content.match(p.regex) || []
        }));

        debugInfo.push({
          emailId: message.id,
          from: fromHeader,
          subject: subjectHeader,
          date: dateHeader,
          contentPreview: content.substring(0, 500) + '...',
          contentLength: content.length,
          extraction: {
            orderNumber: orderResults,
            price: priceResults,
            product: productResults,
            size: sizeResults
          },
          currentlyExtracted: {
            // What the current parser would extract
            orderNumber: extractOrderNumber(content),
            price: extractPrice(content),
            product: extractProduct(content),
            size: extractSize(content)
          }
        });
      }
    }

    return NextResponse.json({ 
      debug: debugInfo,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in debug endpoint:', error);
    return NextResponse.json({ error: 'Debug failed' }, { status: 500 });
  }
}

// Helper functions to show current extraction logic
function extractOrderNumber(content: string): string {
  const orderNumberRegexes = [
    /(?:Order|Purchase|Confirmation)[\s#:]*([A-Z0-9-]{10,})/i,
    /(?:Order|Purchase|Confirmation)[\s#:]*([A-Z0-9]{6,})/i,
    /(?:Order|Purchase|Confirmation)[\s#:]*([0-9]{6,})/i,
    /([A-Z0-9-]{10,})/i
  ];
  
  for (const regex of orderNumberRegexes) {
    const match = content.match(regex);
    if (match) {
      return match[1];
    }
  }
  return 'UNKNOWN';
}

function extractPrice(content: string): string {
  const priceRegex = /\$(\d+(?:\.\d{2})?)/g;
  const priceMatches = content.match(priceRegex);
  return priceMatches ? priceMatches[0] : '$0.00';
}

function extractProduct(content: string): string {
  const productRegex = /(Jordan|Nike|Adidas|Yeezy|Dunk|Air Max|Travis Scott|Off-White|Dior)[^.]*(?:\.|$)/i;
  const productMatch = content.match(productRegex);
  return productMatch ? productMatch[0].replace(/\.$/, '') : 'Unknown Product';
}

function extractSize(content: string): string {
  const sizeRegex = /Size\s*:?\s*([A-Z]*\s*\d+(?:\.\d+)?)/i;
  const sizeMatch = content.match(sizeRegex);
  return sizeMatch ? `Size ${sizeMatch[1]}` : 'Unknown Size';
} 