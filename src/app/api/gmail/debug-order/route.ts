import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderNumber = searchParams.get('order');
    
    if (!orderNumber) {
      return NextResponse.json({ error: 'Please provide order parameter' }, { status: 400 });
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
      maxResults: 200 // Increase limit to find the order
    });

    const debugInfo = [];
    let foundOrder = null;

    if (response.data.messages) {
      console.log(`🔍 Searching through ${response.data.messages.length} emails for order ${orderNumber}`);
      
      for (const message of response.data.messages) {
        if (!message.id) continue;
        
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
        
        // Check if this email contains the order number
        if (content.includes(orderNumber) || subject.includes(orderNumber)) {
          console.log(`🎯 Found email containing order ${orderNumber}!`);
          console.log(`📧 Subject: ${subject}`);
          console.log(`📄 Content preview: ${content.substring(0, 1000)}...`);
          
          // Extract all potential tracking numbers
          const allNumbers = content.match(/[0-9]{8,22}/g) || [];
          console.log(`🔢 All long numbers in email: ${allNumbers.join(', ')}`);
          
          // Run tracking extraction logic
          let trackingNumber = null;
          const trackingPatterns = [
            { name: 'UPS Priority', regex: /(1Z[0-9A-Z]{16})/gi },
            { name: 'StockX Priority', regex: /(?:>|^)([8-9][0-9]{11})(?:<|$)/g },
            { name: 'FedEx', regex: /(?:>|^|\s)([0-9]{12,14})(?:<|$|\s)/g },
            { name: 'USPS', regex: /(?:>|^|\s)(9[0-9]{19,21})(?:<|$|\s)/g },
            { name: 'Generic Long', regex: /(?:>|^|\s)([0-9]{10,22})(?:<|$|\s)/g }
          ];
          
          const trackingAttempts = [];
          
          for (const pattern of trackingPatterns) {
            if (pattern.regex.flags && pattern.regex.flags.includes('g')) {
              const matches = content.match(pattern.regex);
              if (matches && matches.length > 0) {
                trackingAttempts.push({
                  pattern: pattern.name,
                  matches: matches,
                  selected: null
                });
                
                // Special handling for UPS tracking numbers
                if (pattern.name === 'UPS Priority') {
                  for (const match of matches) {
                    const cleanMatch = match.replace(/[<>]/g, '').trim();
                    // UPS tracking: 1Z followed by exactly 16 alphanumeric characters
                    if (/^1Z[0-9A-Z]{16}$/i.test(cleanMatch)) {
                      trackingNumber = cleanMatch.toUpperCase();
                      trackingAttempts[trackingAttempts.length - 1].selected = cleanMatch.toUpperCase();
                      console.log(`✅ Found UPS tracking number: ${trackingNumber}`);
                      break;
                    }
                  }
                  if (trackingNumber) break;
                } else {
                  // Apply filtering logic for other patterns
                  for (const match of matches) {
                    const cleanMatch = match.replace(/[<>]/g, '').trim();
                    
                    const isOrderNumber = cleanMatch.includes('-');
                    const isPriceRelated = /^(150|8|14|173|00)$/.test(cleanMatch) || cleanMatch.length < 8;
                    const isYear = /^20\d{2}$/.test(cleanMatch);
                    const isZip = /^\d{5}$/.test(cleanMatch);
                    const isPhoneNumber = /^\d{10}$/.test(cleanMatch);
                    const isLikelyStockXTracking = /^[89]\d{11}$/.test(cleanMatch);
                    
                    if (isLikelyStockXTracking) {
                      trackingNumber = cleanMatch;
                      trackingAttempts[trackingAttempts.length - 1].selected = cleanMatch;
                      break;
                    } else if (!isOrderNumber && !isPriceRelated && !isYear && !isZip && !isPhoneNumber && cleanMatch.length >= 10) {
                      trackingNumber = cleanMatch;
                      trackingAttempts[trackingAttempts.length - 1].selected = cleanMatch;
                      break;
                    }
                  }
                  if (trackingNumber) break;
                }
              }
            } else {
              const match = content.match(pattern.regex);
              if (match && match[1]) {
                const cleanMatch = match[1].replace(/[<>]/g, '').trim();
                trackingAttempts.push({
                  pattern: pattern.name,
                  matches: [match[1]],
                  selected: cleanMatch
                });
                trackingNumber = cleanMatch;
                break;
              }
            }
          }
          
          foundOrder = {
            emailId: message.id,
            subject: subject,
            orderNumber: orderNumber,
            contentPreview: content.substring(0, 1500),
            allNumbers: allNumbers,
            trackingAttempts: trackingAttempts,
            finalTracking: trackingNumber,
            contentLength: content.length
          };
          break;
        }
      }
    }

    if (foundOrder) {
      return NextResponse.json({
        success: true,
        order: foundOrder,
        message: `Found order ${orderNumber} and analyzed tracking extraction`
      });
    } else {
      return NextResponse.json({
        success: false,
        message: `Order ${orderNumber} not found in recent emails`,
        searchedEmails: response.data.messages?.length || 0
      });
    }

  } catch (error) {
    console.error('Debug order error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
} 