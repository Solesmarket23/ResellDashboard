import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const accessToken = cookieStore.get('gmail_access_token')?.value;
    const refreshToken = cookieStore.get('gmail_refresh_token')?.value;

    if (!accessToken) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 });
    }

    const { userId } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

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

    console.log('🔄 Starting re-scan of all verification failures...');

    // Get all existing failures from Firebase
    const failuresRef = collection(db, 'failedVerifications');
    const q = query(failuresRef, where('userId', '==', userId));
    const snapshot = await getDocs(q);

    let updatedCount = 0;
    const errors = [];

    for (const docSnapshot of snapshot.docs) {
      const failure = docSnapshot.data();
      const orderNumber = failure.orderNumber;

      try {
        console.log(`🔍 Re-scanning order: ${orderNumber}`);

        // Search for the specific order email
        const searchQuery = `from:stockx.com "${orderNumber}"`;
        const response = await gmail.users.messages.list({
          userId: 'me',
          q: searchQuery,
          maxResults: 5
        });

        if (response.data.messages && response.data.messages.length > 0) {
          // Get the first matching email
          const emailData = await gmail.users.messages.get({
            userId: 'me',
            id: response.data.messages[0].id,
            format: 'full'
          });

          const updatedData = parseVerificationFailure(emailData.data);
          
          if (updatedData && updatedData.failureReason !== failure.failureReason) {
            // Update the document with new failure reason
            await updateDoc(doc(db, 'failedVerifications', docSnapshot.id), {
              failureReason: updatedData.failureReason,
              productName: updatedData.productName,
              additionalNotes: updatedData.additionalNotes || '',
              lastScanned: new Date().toISOString()
            });
            
            updatedCount++;
            console.log(`✅ Updated ${orderNumber}: ${updatedData.failureReason}`);
          }
        }
      } catch (error) {
        console.error(`❌ Error updating ${orderNumber}:`, error);
        errors.push({ orderNumber, error: error.message });
      }
    }

    console.log(`✅ Re-scan complete. Updated ${updatedCount} of ${snapshot.size} failures`);

    return NextResponse.json({ 
      success: true,
      totalScanned: snapshot.size,
      updatedCount,
      errors
    });

  } catch (error) {
    console.error('Error re-scanning failures:', error);
    return NextResponse.json({ error: 'Failed to re-scan failures' }, { status: 500 });
  }
}

function parseVerificationFailure(email: any) {
  try {
    const fromHeader = email.payload.headers.find((h: any) => h.name === 'From')?.value || '';
    const subjectHeader = email.payload.headers.find((h: any) => h.name === 'Subject')?.value || '';
    const dateHeader = email.payload.headers.find((h: any) => h.name === 'Date')?.value || '';

    // Extract order number
    let orderNumber = '';
    const orderPatterns = [
      /Order[:\s#]*([0-9]{8}-[0-9]{8})/i,
      /\b([0-9]{8}-[0-9]{8})\b/,
    ];

    for (const pattern of orderPatterns) {
      const match = subjectHeader.match(pattern) || email.snippet?.match(pattern);
      if (match) {
        orderNumber = match[1];
        break;
      }
    }

    // Extract email body content
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

    // Extract product name
    let productName = 'StockX Item';
    const productMatch = bodyContent.match(/we received ([^,]+) which/i);
    if (productMatch) {
      productName = productMatch[1].trim();
    }

    // Extract failure reason
    let failureReason = 'Did not pass verification';
    
    // Look for the specific failure reason in the email
    // Pattern 1: Look for list items after "due to:"
    const reasonMatch = bodyContent.match(/due to:.*?<li[^>]*>([^<]+)<\/li>/is);
    if (reasonMatch) {
      failureReason = reasonMatch[1].trim();
    } else {
      // Pattern 2: Look for specific StockX failure reasons
      const failurePatterns = [
        { pattern: /Manufacturing Defects?/i, reason: 'Manufacturing Defect' },
        { pattern: /Suspected Inauthentic/i, reason: 'Suspected Inauthentic' },
        { pattern: /Used\/Product Damage/i, reason: 'Used/Product Damage' },
        { pattern: /Used or Product Damage/i, reason: 'Used/Product Damage' },
        { pattern: /Incorrect sizing of the item/i, reason: 'Incorrect Sizing' },
        { pattern: /Box Damage/i, reason: 'Box Damage' },
        { pattern: /Damaged box/i, reason: 'Box Damage' },
        { pattern: /manufacturer defects.*misplaced tags.*misplaced logos.*embroidery issues/i, reason: 'Manufacturing Defect' },
        { pattern: /signs of wear or prior use/i, reason: 'Used' },
        { pattern: /incorrect materials.*tags.*substandard construction/i, reason: 'Suspected Inauthentic' },
        { pattern: /incorrect model.*incorrect packaging.*incorrect product/i, reason: 'Incorrect Product' },
        // Single word patterns
        { pattern: /\bUsed\b/i, reason: 'Used' },
        // Additional patterns for variations
        { pattern: /Product Damage/i, reason: 'Product Damage' },
        { pattern: /Sizing Issue/i, reason: 'Incorrect Sizing' },
        { pattern: /Wrong Size/i, reason: 'Incorrect Sizing' },
        { pattern: /Fake\/Replica/i, reason: 'Suspected Inauthentic' },
        { pattern: /Counterfeit/i, reason: 'Suspected Inauthentic' },
        { pattern: /Not Authentic/i, reason: 'Suspected Inauthentic' },
        { pattern: /Failed Authentication/i, reason: 'Suspected Inauthentic' }
      ];
      
      for (const { pattern, reason } of failurePatterns) {
        if (bodyContent.match(pattern)) {
          failureReason = reason;
          break;
        }
      }
    }

    // Extract additional notes
    let additionalNotes = '';
    const notesMatch = bodyContent.match(/Additional Notes from Verification:\s*([^<]+)/i);
    if (notesMatch) {
      additionalNotes = notesMatch[1].trim();
    }

    return {
      orderNumber,
      productName,
      failureReason,
      additionalNotes
    };

  } catch (error) {
    console.error('Error parsing verification failure:', error);
    return null;
  }
}