import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderNumber, correctTracking, dryRun = true } = body;

    if (!orderNumber || !correctTracking) {
      return NextResponse.json({ 
        error: 'Please provide orderNumber and correctTracking in request body' 
      }, { status: 400 });
    }

    // Get OAuth token from environment
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!refreshToken || !clientId || !clientSecret) {
      return NextResponse.json({ error: 'Gmail OAuth not configured' }, { status: 500 });
    }

    // Setup OAuth2 client
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Search for emails from StockX
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: 'from:orders@stockx.com OR from:noreply@stockx.com',
      maxResults: 500 // Search more emails
    });

    let targetOrder = null;
    let similarIssues = [];

    if (response.data.messages) {
      console.log(`🔍 Analyzing ${response.data.messages.length} emails for UPS tracking issues`);
      
      for (const message of response.data.messages) {
        const emailData = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full'
        });

        // Extract content
        let content = '';
        if (emailData.data.payload?.body?.data) {
          content = Buffer.from(emailData.data.payload.body.data, 'base64').toString();
        } else if (emailData.data.payload?.parts) {
          for (const part of emailData.data.payload.parts) {
            if (part.mimeType === 'text/html' && part.body?.data) {
              content += Buffer.from(part.body.data, 'base64').toString();
            }
          }
        }

        const subject = emailData.data.payload?.headers?.find(h => h.name === 'Subject')?.value || '';
        
        // Extract order number from email
        const extractedOrderNumber = extractOrderNumber(content);
        
        // Find all UPS tracking numbers in the email content
        const upsTrackingNumbers = content.match(/(1Z[0-9A-Z]{16})/gi) || [];
        
        // Run current tracking extraction logic
        const currentExtractedTracking = extractTrackingNumber(content);
        
        // Check if this is the target order or has similar issues
        if (extractedOrderNumber === orderNumber || content.includes(orderNumber)) {
          targetOrder = {
            emailId: message.id,
            subject: subject,
            orderNumber: extractedOrderNumber || orderNumber,
            correctTracking: correctTracking,
            currentExtractedTracking: currentExtractedTracking,
            upsTrackingNumbers: upsTrackingNumbers,
            hasUpsTracking: upsTrackingNumbers.length > 0,
            trackingMismatch: currentExtractedTracking !== correctTracking,
            contentPreview: content.substring(0, 1000)
          };
        }
        
        // Identify orders with UPS tracking that was incorrectly extracted
        if (upsTrackingNumbers.length > 0 && extractedOrderNumber) {
          const hasUpsInExtracted = /^1Z[0-9A-Z]{16}$/i.test(currentExtractedTracking || '');
          
          if (!hasUpsInExtracted) {
            similarIssues.push({
              emailId: message.id,
              subject: subject,
              orderNumber: extractedOrderNumber,
              currentExtractedTracking: currentExtractedTracking,
              upsTrackingNumbers: upsTrackingNumbers,
              shouldBeTracking: upsTrackingNumbers[0], // Use first UPS tracking found
              issueType: 'UPS_NOT_EXTRACTED'
            });
          }
        }
      }
    }

    const results = {
      dryRun,
      targetOrder,
      similarIssues: similarIssues.slice(0, 20), // Limit to 20 for readability
      summary: {
        totalEmailsAnalyzed: response.data.messages?.length || 0,
        targetOrderFound: !!targetOrder,
        similarIssuesFound: similarIssues.length,
        correctTrackingProvided: correctTracking
      }
    };

    if (!dryRun && targetOrder) {
      // In a real implementation, you would update the database here
      console.log(`🔧 Would update order ${orderNumber} tracking from "${targetOrder.currentExtractedTracking}" to "${correctTracking}"`);
      results.summary.fixed = true;
    }

    return NextResponse.json(results);

  } catch (error) {
    console.error('Fix tracking error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Helper function to extract order number from email content
function extractOrderNumber(content: string): string | null {
  const orderPatterns = [
    /Order number:\s*([0-9A-Z\-]+)/i,
    /<li[^>]*>Order number:\s*([0-9A-Z\-]+)<\/li>/i,
    /Order #:\s*([0-9A-Z\-]+)/i,
    /Order ID:\s*([0-9A-Z\-]+)/i,
    /Your Order #([0-9A-Z\-]+)/i,
    /Order:\s*([0-9A-Z\-]+)/i
  ];
  
  for (const pattern of orderPatterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

// Helper function to extract tracking number using current logic
function extractTrackingNumber(content: string): string | null {
  let trackingNumber = null;
  
  // UPS tracking (1Z + 16 characters) - HIGHEST PRIORITY
  const upsPattern = /(1Z[0-9A-Z]{16})/gi;
  const upsMatches = content.match(upsPattern) || [];
  
  if (upsMatches.length > 0) {
    for (const match of upsMatches) {
      const candidate = match.replace(/[<>]/g, '').trim();
      if (/^1Z[0-9A-Z]{16}$/i.test(candidate)) {
        trackingNumber = candidate.toUpperCase();
        break;
      }
    }
  }
  
  // If no UPS tracking found, try other patterns
  if (!trackingNumber) {
    const allNumbers = content.match(/[0-9]{8,22}/g) || [];
    // StockX tracking pattern (12 digits starting with 8/9)
    const stockxLike = allNumbers.find(num => /^[89]\d{11}$/.test(num));
    if (stockxLike) {
      trackingNumber = stockxLike;
    } else {
      // Pick the longest number that's not obviously a price or order number
      const candidates = allNumbers.filter(num => 
        !num.includes('-') && 
        !/^(150|8|14|173|00|20\d{2})/.test(num) &&
        num.length >= 10
      );
      if (candidates.length > 0) {
        trackingNumber = candidates.sort((a, b) => b.length - a.length)[0];
      }
    }
  }
  
  return trackingNumber;
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Use POST method with orderNumber and correctTracking in body',
    example: {
      orderNumber: '01-95H9NC36ST',
      correctTracking: '1Z24WA430206362750',
      dryRun: true
    }
  });
} 