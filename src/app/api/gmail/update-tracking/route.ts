import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';
import { getDocuments, updateDocument } from '../../../../lib/firebase/firebaseUtils';

export async function POST(request: NextRequest) {
  try {
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

    console.log('🔄 BULK TRACKING UPDATE: Starting bulk tracking number extraction...');

    // Get all existing purchases from Firebase
    const existingPurchases = await getDocuments('purchases');
    console.log(`📊 Found ${existingPurchases.length} existing purchases in Firebase`);

    // Filter purchases that need tracking numbers (currently "No tracking")
    const purchasesNeedingTracking = existingPurchases.filter(
      purchase => !purchase.tracking || purchase.tracking === 'No tracking'
    );

    console.log(`🎯 Found ${purchasesNeedingTracking.length} purchases needing tracking numbers`);

    let processedCount = 0;
    let updatedCount = 0;
    let failedCount = 0;
    const results = [];

    for (const purchase of purchasesNeedingTracking) {
      processedCount++;
      console.log(`🔄 Processing ${processedCount}/${purchasesNeedingTracking.length}: Order ${purchase.orderNumber}`);

      try {
        // Extract tracking number for this order
        const trackingNumber = await extractTrackingNumber(purchase.orderNumber, gmail);
        
        if (trackingNumber) {
          // Update the purchase in Firebase
          await updateDocument('purchases', purchase.id, {
            tracking: trackingNumber,
            updatedAt: new Date().toISOString(),
            trackingExtracted: true
          });

          updatedCount++;
          results.push({
            orderNumber: purchase.orderNumber,
            trackingNumber,
            status: 'updated'
          });

          console.log(`✅ Updated order ${purchase.orderNumber} with tracking: ${trackingNumber}`);
          
          // Special logging for the test order
          if (purchase.orderNumber === '01-SZ976NVNKQ') {
            console.log(`🎯 SPECIAL: Found tracking for test order 01-SZ976NVNKQ: ${trackingNumber}`);
          }
        } else {
          failedCount++;
          results.push({
            orderNumber: purchase.orderNumber,
            status: 'no_tracking_found'
          });
          console.log(`❌ No tracking found for order ${purchase.orderNumber}`);
        }

        // Add small delay to avoid overwhelming Gmail API
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        failedCount++;
        results.push({
          orderNumber: purchase.orderNumber,
          status: 'error',
          error: error.message
        });
        console.error(`❌ Error processing order ${purchase.orderNumber}:`, error);
      }
    }

    console.log(`🎉 Bulk tracking update complete:`);
    console.log(`  📊 Processed: ${processedCount}`);
    console.log(`  ✅ Updated: ${updatedCount}`);
    console.log(`  ❌ Failed: ${failedCount}`);

    return NextResponse.json({
      success: true,
      message: `Bulk tracking update completed`,
      summary: {
        totalProcessed: processedCount,
        successfullyUpdated: updatedCount,
        failed: failedCount,
        purchasesNeedingTracking: purchasesNeedingTracking.length
      },
      results,
      testOrderResult: results.find(r => r.orderNumber === '01-SZ976NVNKQ')
    });

  } catch (error) {
    console.error('Error in bulk tracking update:', error);
    return NextResponse.json({ error: 'Failed to update tracking numbers' }, { status: 500 });
  }
}

// Helper function to extract tracking number (shared with main purchases route)
async function extractTrackingNumber(orderNumber: string, gmail: any): Promise<string | null> {
  if (!orderNumber || !gmail) return null;
  
  try {
    console.log(`🔍 TRACKING: Searching for tracking number for order ${orderNumber}`);
    
    // Search for shipping emails containing this order number
    const shippingQueries = [
      `from:noreply@stockx.com AND subject:"Order Verified & Shipped:" AND "${orderNumber}"`,
      `from:noreply@stockx.com AND subject:"Order Shipped:" AND "${orderNumber}"`,
      `from:noreply@stockx.com AND subject:"Xpress Order Shipped:" AND "${orderNumber}"`,
      `from:stockx.com AND subject:"shipped" AND "${orderNumber}"`
    ];

    for (const query of shippingQueries) {
      try {
        const response = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: 5
        });

        if (response.data.messages && response.data.messages.length > 0) {
          console.log(`📧 TRACKING: Found ${response.data.messages.length} shipping emails for order ${orderNumber}`);
          
          // Get the first shipping email
          const emailData = await gmail.users.messages.get({
            userId: 'me',
            id: response.data.messages[0].id,
            format: 'full'
          });

          const subject = emailData.data.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || '';
          console.log(`📧 TRACKING: Processing shipping email: "${subject}"`);

          // Extract tracking number from email content
          const trackingNumber = extractTrackingFromShippingEmail(emailData.data);
          
          if (trackingNumber) {
            console.log(`✅ TRACKING: Found tracking number ${trackingNumber} for order ${orderNumber}`);
            return trackingNumber;
          }
        }
      } catch (error) {
        console.error(`TRACKING: Error searching with query "${query}":`, error);
      }
    }

    console.log(`❌ TRACKING: No tracking number found for order ${orderNumber}`);
    return null;
  } catch (error) {
    console.error(`TRACKING: Error extracting tracking for order ${orderNumber}:`, error);
    return null;
  }
}

// Extract tracking number from shipping email content
function extractTrackingFromShippingEmail(email: any): string | null {
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

    // Enhanced tracking patterns optimized for StockX emails
    const trackingPatterns = [
      { 
        name: 'UPS Tracking', 
        regex: /(1Z[0-9A-Z]{16})/gi,
        validator: (match: string) => /^1Z[0-9A-Z]{16}$/i.test(match)
      },
      { 
        name: 'FedEx 12-digit', 
        regex: /(?:tracking.*?|number.*?|track.*?)([0-9]{12})\b/gi,
        validator: (match: string) => /^[0-9]{12}$/.test(match) && !isCommonExclusion(match)
      },
      { 
        name: 'FedEx 14-digit', 
        regex: /(?:tracking.*?|number.*?|track.*?)([0-9]{14})\b/gi,
        validator: (match: string) => /^[0-9]{14}$/.test(match) && !isCommonExclusion(match)
      },
      { 
        name: 'USPS Priority', 
        regex: /(9[0-9]{21})\b/gi,
        validator: (match: string) => /^9[0-9]{21}$/.test(match)
      },
      { 
        name: 'USPS Standard', 
        regex: /(9[0-9]{19})\b/gi,
        validator: (match: string) => /^9[0-9]{19}$/.test(match)
      },
      { 
        name: 'Generic Long Numbers', 
        regex: /\b([0-9]{10,22})\b/gi,
        validator: (match: string) => match.length >= 10 && !isCommonExclusion(match)
      }
    ];

    // Helper function to exclude common non-tracking numbers
    function isCommonExclusion(num: string): boolean {
      const excluded = [
        // Price-related
        /^(150|173|14|8|00|000)/, 
        // Dates/years
        /^20[0-9]{2}$/, 
        // Common patterns
        /^[0-9]{5}$/, // ZIP codes
        /^[0-9]{10}$/, // Phone numbers
        /^0+$/, // All zeros
        /^1+$/, // All ones
        // StockX order number patterns
        /^[0-9]{2}-/,
        /^[0-9]{8}-[0-9]{8}$/
      ];
      
      return excluded.some(pattern => pattern.test(num));
    }

    // Try patterns in priority order
    for (const pattern of trackingPatterns) {
      const matches = bodyContent.match(pattern.regex) || [];
      
      for (const match of matches) {
        const cleanMatch = match.replace(/[<>]/g, '').trim();
        
        if (pattern.validator(cleanMatch)) {
          console.log(`✅ TRACKING: Found ${pattern.name}: ${cleanMatch}`);
          return cleanMatch;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('TRACKING: Error extracting from email:', error);
    return null;
  }
}