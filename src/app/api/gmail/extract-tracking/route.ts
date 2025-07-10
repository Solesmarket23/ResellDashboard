import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { orderNumber } = await request.json();
    
    if (!orderNumber) {
      return NextResponse.json({ error: 'Order number required' }, { status: 400 });
    }

    const cookieStore = cookies();
    const accessToken = cookieStore.get('gmail_access_token')?.value;
    const refreshToken = cookieStore.get('gmail_refresh_token')?.value;

    if (!accessToken) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 });
    }

    // Set up OAuth2 client
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/gmail/callback`;

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Search specifically for shipping emails that contain this order number
    const shippingQueries = [
      `from:noreply@stockx.com AND subject:"Order Verified & Shipped:" AND "${orderNumber}"`,
      `from:noreply@stockx.com AND subject:"Order Shipped:" AND "${orderNumber}"`,
      `from:noreply@stockx.com AND subject:"Xpress Order Shipped:" AND "${orderNumber}"`,
      `from:stockx.com AND subject:"shipped" AND "${orderNumber}"`
    ];

    console.log(`🔍 TRACKING EXTRACTION: Searching for shipping emails for order ${orderNumber}`);

    let trackingNumber = null;
    let shippingEmail = null;

    for (const query of shippingQueries) {
      try {
        console.log(`🔍 Searching with query: ${query}`);
        
        const response = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: 10
        });

        if (response.data.messages && response.data.messages.length > 0) {
          console.log(`📧 Found ${response.data.messages.length} shipping emails for order ${orderNumber}`);
          
          // Get the first (most relevant) shipping email
          const emailData = await gmail.users.messages.get({
            userId: 'me',
            id: response.data.messages[0].id,
            format: 'full'
          });

          const subject = emailData.data.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || '';
          console.log(`📧 Processing shipping email: "${subject}"`);

          // Extract tracking number from this email
          const extractedTracking = extractTrackingFromEmail(emailData.data);
          
          if (extractedTracking) {
            trackingNumber = extractedTracking.trackingNumber;
            shippingEmail = {
              subject,
              trackingNumber: extractedTracking.trackingNumber,
              trackingType: extractedTracking.trackingType,
              emailId: response.data.messages[0].id,
              extractionDetails: extractedTracking.details
            };
            console.log(`✅ TRACKING FOUND: ${trackingNumber} (${extractedTracking.trackingType})`);
            break;
          }
        }
      } catch (error) {
        console.error(`Error searching for tracking with query "${query}":`, error);
      }
    }

    if (trackingNumber) {
      return NextResponse.json({
        success: true,
        orderNumber,
        trackingNumber,
        trackingType: shippingEmail?.trackingType,
        shippingEmail,
        message: `Successfully extracted tracking number for order ${orderNumber}`
      });
    } else {
      return NextResponse.json({
        success: false,
        orderNumber,
        message: `No shipping email or tracking number found for order ${orderNumber}`,
        searchedQueries: shippingQueries
      });
    }

  } catch (error) {
    console.error('Error extracting tracking:', error);
    return NextResponse.json({ error: 'Failed to extract tracking' }, { status: 500 });
  }
}

// Enhanced tracking extraction function
function extractTrackingFromEmail(email: any): { trackingNumber: string; trackingType: string; details: any } | null {
  try {
    // Get email body content
    let bodyContent = '';
    if (email.payload?.parts) {
      for (const part of email.payload.parts) {
        if (part.mimeType === 'text/html' || part.mimeType === 'text/plain') {
          if (part.body?.data) {
            bodyContent += Buffer.from(part.body.data, 'base64').toString('utf8');
          }
        }
      }
    } else if (email.payload?.body?.data) {
      bodyContent = Buffer.from(email.payload.body.data, 'base64').toString('utf8');
    }

    console.log(`📄 Email content length: ${bodyContent.length} characters`);

    // Enhanced tracking patterns with priority order
    const trackingPatterns = [
      { 
        name: 'UPS Tracking', 
        regex: /(1Z[0-9A-Z]{16})/gi,
        priority: 1,
        validator: (match: string) => /^1Z[0-9A-Z]{16}$/i.test(match)
      },
      { 
        name: 'FedEx Standard', 
        regex: /(?:tracking.*?|number.*?)([0-9]{12})\b/gi,
        priority: 2,
        validator: (match: string) => /^[0-9]{12}$/.test(match) && !isExcludedNumber(match)
      },
      { 
        name: 'FedEx Express', 
        regex: /(?:tracking.*?|number.*?)([0-9]{14})\b/gi,
        priority: 2,
        validator: (match: string) => /^[0-9]{14}$/.test(match) && !isExcludedNumber(match)
      },
      { 
        name: 'USPS Priority', 
        regex: /(9[0-9]{21})\b/gi,
        priority: 3,
        validator: (match: string) => /^9[0-9]{21}$/.test(match)
      },
      { 
        name: 'USPS Standard', 
        regex: /(9[0-9]{19})\b/gi,
        priority: 3,
        validator: (match: string) => /^9[0-9]{19}$/.test(match)
      },
      { 
        name: 'StockX Custom', 
        regex: /([8-9][0-9]{11})\b/gi,
        priority: 4,
        validator: (match: string) => /^[8-9][0-9]{11}$/.test(match) && !isExcludedNumber(match)
      }
    ];

    // Helper function to check if number should be excluded
    function isExcludedNumber(num: string): boolean {
      const excluded = [
        // Price-related numbers
        /^(0{8,}|1{8,})$/, // All zeros or ones
        /^(150|173|14|8|00)$/, // Common price components
        // Date/year related
        /^20[0-9]{2}$/, // Years
        /^[0-9]{2}\/[0-9]{2}\/[0-9]{4}$/, // Dates
        // Common exclusions
        /^[0-9]{5}$/, // ZIP codes
        /^[0-9]{10}$/ // Phone numbers
      ];
      
      return excluded.some(pattern => pattern.test(num));
    }

    const allAttempts = [];
    let bestMatch = null;

    // Try each pattern in priority order
    for (const pattern of trackingPatterns) {
      const matches = bodyContent.match(pattern.regex) || [];
      console.log(`🔍 Pattern "${pattern.name}": found ${matches.length} potential matches`);
      
      for (const match of matches) {
        const cleanMatch = match.replace(/[<>]/g, '').trim();
        
        allAttempts.push({
          pattern: pattern.name,
          match: cleanMatch,
          priority: pattern.priority,
          valid: pattern.validator(cleanMatch)
        });

        if (pattern.validator(cleanMatch)) {
          if (!bestMatch || pattern.priority < bestMatch.priority) {
            bestMatch = {
              trackingNumber: cleanMatch,
              trackingType: pattern.name,
              priority: pattern.priority
            };
          }
        }
      }
    }

    console.log(`🎯 All tracking attempts:`, allAttempts);
    console.log(`🏆 Best match:`, bestMatch);

    if (bestMatch) {
      return {
        trackingNumber: bestMatch.trackingNumber,
        trackingType: bestMatch.trackingType,
        details: {
          allAttempts,
          selectedPriority: bestMatch.priority
        }
      };
    }

    return null;
  } catch (error) {
    console.error('Error extracting tracking from email:', error);
    return null;
  }
}