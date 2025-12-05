import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';
import puppeteer from 'puppeteer';
import { getOrderNumberForGmailSearch } from '../../../../lib/utils/orderNumberUtils';

// Helper function to extract email body text
function getEmailBodyText(email: any): string {
  let bodyText = '';
  if (email.payload?.parts) {
    for (const part of email.payload.parts) {
      if (part.mimeType === 'text/html' || part.mimeType === 'text/plain') {
        if (part.body?.data) {
          bodyText += Buffer.from(part.body.data, 'base64').toString('utf8');
        }
      }
    }
  } else if (email.payload?.body?.data) {
    bodyText = Buffer.from(email.payload.body.data, 'base64').toString('utf8');
  }
  return bodyText;
}

export async function POST(request: NextRequest) {
  const { orderNumber } = await request.json();
  
  if (!orderNumber) {
    return NextResponse.json(
      { error: 'Order number is required' },
      { status: 400 }
    );
  }
  
  console.log(`🤖 Starting Gmail API → StockX → FedEx tracking extraction for order: ${orderNumber}`);
  
  // Step 1: Use Gmail API to find the shipped email
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
  const searchOrderNumber = getOrderNumberForGmailSearch(orderNumber);

  // Search for shipped emails containing the order number
  console.log(`📧 Step 1: Searching Gmail for shipped email with order: ${searchOrderNumber}`);
  console.log(`📧 Original order number: ${orderNumber}`);
  console.log(`📧 Search order number: ${searchOrderNumber}`);
  
  // More flexible search queries - try multiple variations
  // For Xpress orders (like 03-S1NF8EJ2BD), search for the full order number
  const shippingQueries = [
    // Exact match with full order number - Xpress orders
    `from:noreply@stockx.com AND (subject:"Order Verified & Shipped:" OR subject:"Order Shipped:" OR subject:"Xpress Order Shipped:" OR subject:"Xpress Ship Order Shipped:") AND "${searchOrderNumber}"`,
    // Try without quotes (partial match)
    `from:noreply@stockx.com AND (subject:"Order Verified & Shipped:" OR subject:"Order Shipped:" OR subject:"Xpress") AND ${searchOrderNumber}`,
    // Broader search - just shipped emails from StockX
    `from:noreply@stockx.com AND subject:"shipped" AND "${searchOrderNumber}"`,
    // Even broader - any StockX email with order number
    `from:stockx.com AND "${searchOrderNumber}"`,
    // Try searching for just the order number (might be in body or subject)
    `from:noreply@stockx.com "${searchOrderNumber}"`,
    // Last resort - search for any StockX shipped email (we'll filter by order number in email content)
    `from:noreply@stockx.com AND (subject:"shipped" OR subject:"Shipped") newer_than:90d`
  ];

  let shippedEmail = null;
  let trackOrderUrl = null;

  for (let queryIndex = 0; queryIndex < shippingQueries.length; queryIndex++) {
    const query = shippingQueries[queryIndex];
    try {
      console.log(`🔍 Searching with query ${queryIndex + 1}/${shippingQueries.length}: ${query}`);
      
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: queryIndex === shippingQueries.length - 1 ? 50 : 5 // Get more results for last fallback query
      });

      if (response.data.messages && response.data.messages.length > 0) {
        console.log(`✅ Found ${response.data.messages.length} emails with query ${queryIndex + 1}`);
        
        // For the last fallback query, we need to filter by order number in email content
        let emailsToCheck = response.data.messages;
        if (queryIndex === shippingQueries.length - 1) {
          // Filter emails that contain the order number
          const filteredEmails = [];
          for (const msg of emailsToCheck.slice(0, 20)) { // Check up to 20 emails
            try {
              const emailData = await gmail.users.messages.get({
                userId: 'me',
                id: msg.id,
                format: 'full'
              });
              
              const subject = emailData.data.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || '';
              const bodyText = getEmailBodyText(emailData.data);
              
              // Check if order number appears in subject or body
              if (subject.includes(searchOrderNumber) || bodyText.includes(searchOrderNumber) || 
                  subject.includes(orderNumber) || bodyText.includes(orderNumber)) {
                filteredEmails.push(msg);
                console.log(`✅ Found matching email: "${subject}"`);
              }
            } catch (e) {
              // Skip this email
            }
          }
          emailsToCheck = filteredEmails;
          
          if (emailsToCheck.length === 0) {
            console.log(`⚠️ No emails found matching order number ${searchOrderNumber}`);
            continue;
          }
        }
        
        // Get the first (most recent) matching email
        const emailData = await gmail.users.messages.get({
          userId: 'me',
          id: emailsToCheck[0].id,
          format: 'full'
        });

        const subject = emailData.data.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || '';
        console.log(`📧 Processing shipped email: "${subject}"`);

        // Extract HTML content from email
        let htmlContent = '';
        if (emailData.data.payload?.parts) {
          for (const part of emailData.data.payload.parts) {
            if (part.mimeType === 'text/html' && part.body?.data) {
              htmlContent = Buffer.from(part.body.data, 'base64').toString('utf8');
              break;
            }
          }
        } else if (emailData.data.payload?.mimeType === 'text/html' && emailData.data.payload?.body?.data) {
          htmlContent = Buffer.from(emailData.data.payload.body.data, 'base64').toString('utf8');
        }

        // Extract tracking number directly from email HTML (avoiding Puppeteer/Cloudflare)
        if (htmlContent) {
          console.log(`📄 Email HTML content length: ${htmlContent.length} characters`);
          
          // Collect all potential tracking numbers with their context/priority
          const trackingCandidates: Array<{ number: string; priority: number; source: string }> = [];
          
          // Strategy 1: Extract from FedEx URLs (highest priority - most reliable)
          const fedexUrlPatterns = [
            { pattern: /fedex\.com[^"'\s<>]*tracknumbers?[=%3D](\d{12})/gi, priority: 1, source: 'FedEx URL tracknumbers' },
            { pattern: /tracknumbers?[=%3D](\d{12})/gi, priority: 2, source: 'tracknumbers param' },
            { pattern: /trknbr[=%3D](\d{12})/gi, priority: 2, source: 'trknbr param' },
            { pattern: /fedex\.com[^"'\s<>]*track[^"'\s<>]*(\d{12})/gi, priority: 3, source: 'FedEx URL track' },
            // Look for FedEx URLs in href attributes
            { pattern: /href=["'][^"']*fedex[^"']*(\d{12})/gi, priority: 2, source: 'FedEx href' },
            // Look for tracking numbers in URL-encoded links
            { pattern: /%3D(\d{12})/gi, priority: 3, source: 'URL encoded' },
            // Look for 12-digit numbers starting with 8 (common FedEx format)
            { pattern: /\b(8\d{11})\b/g, priority: 4, source: '12-digit starting with 8' },
            // Look for tracking numbers in any URL (broader search)
            { pattern: /[?&](?:track|tracking|trknbr|tracknumber)[=%3D](\d{12})/gi, priority: 2, source: 'URL tracking param' }
          ];
          
          for (const { pattern, priority, source } of fedexUrlPatterns) {
            const matches = [...htmlContent.matchAll(pattern)];
            for (const match of matches) {
              if (match[1]) {
                const trackingNum = match[1];
                // FedEx tracking numbers are exactly 12 digits
                if (trackingNum.length === 12 && /^[0-9]{12}$/.test(trackingNum)) {
                  // Skip if it looks like a date or order ID
                  if (!trackingNum.startsWith('20') && !trackingNum.startsWith('19') &&
                      !trackingNum.startsWith('14') && !trackingNum.startsWith('15')) {
                    trackingCandidates.push({ number: trackingNum, priority, source });
                    console.log(`🔍 Found tracking candidate: ${trackingNum} (${source}, priority ${priority})`);
                  }
                }
              }
            }
          }
          
          // Strategy 1b: Search for all 12-digit numbers and check context
          const all12DigitNumbers = [...htmlContent.matchAll(/\b(\d{12})\b/g)];
          for (const match of all12DigitNumbers) {
            if (match[1] && match.index !== undefined) {
              const num = match[1];
              // Skip dates and order IDs
              if (num.startsWith('20') || num.startsWith('19') || 
                  num.startsWith('14') || num.startsWith('15')) {
                continue;
              }
              
              // Check if it's near tracking-related text (look at surrounding context)
              const startIndex = Math.max(0, match.index - 150);
              const endIndex = Math.min(htmlContent.length, match.index + match[0].length + 150);
              const context = htmlContent.substring(startIndex, endIndex).toLowerCase();
              
              if (context.includes('track') || context.includes('fedex') || 
                  context.includes('shipping') || context.includes('delivery') ||
                  context.includes('tracking') || context.includes('carrier')) {
                trackingCandidates.push({ 
                  number: num, 
                  priority: 4, 
                  source: '12-digit near tracking context' 
                });
                console.log(`🔍 Found 12-digit number near tracking context: ${num}`);
              }
            }
          }
          
          // Strategy 2: Extract from "Track your order" link href (high priority)
          const trackYourOrderLinkRegex = /<a[^>]*href=["']([^"']*track[^"']*your[^"']*order[^"']*)["'][^>]*>/i;
          const trackLinkMatch = htmlContent.match(trackYourOrderLinkRegex);
          if (trackLinkMatch && trackLinkMatch[1]) {
            let trackLink = trackLinkMatch[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"');
            
            console.log(`🔗 Track your order link (raw): ${trackLink.substring(0, 300)}...`);
            
            // Try multiple decoding strategies
            let decodedLinks: string[] = [trackLink];
            
            // Try URL decoding
            try {
              decodedLinks.push(decodeURIComponent(trackLink));
            } catch (e) {
              // Continue
            }
            
            // Try double decoding (sometimes URLs are double-encoded)
            try {
              decodedLinks.push(decodeURIComponent(decodeURIComponent(trackLink)));
            } catch (e) {
              // Continue
            }
            
            // If it's a wizrocketmail redirect, extract the actual URL from the r= parameter
            if (trackLink.includes('wizrocketmail')) {
              const rParamMatch = trackLink.match(/[?&]r=([^&]+)/i);
              if (rParamMatch && rParamMatch[1]) {
                try {
                  const actualUrl = decodeURIComponent(rParamMatch[1]);
                  decodedLinks.push(actualUrl);
                  console.log(`🔗 Extracted actual URL from wizrocketmail redirect: ${actualUrl.substring(0, 200)}...`);
                } catch (e) {
                  // Continue
                }
              }
            }
            
            // Look for tracking number in all decoded versions of the link
            for (const link of decodedLinks) {
              // Look for tracking number in the link URL (check multiple patterns)
              const trackingPatterns = [
                /tracknumbers?[=%3D](\d{12})/gi,
                /trknbr[=%3D](\d{12})/gi,
                /fedex[^"']*(\d{12})/gi,
                /[?&]track[^=]*=(\d{12})/gi,
                // Look for 12-digit numbers in the URL (but validate they're not order IDs)
                /(\d{12})/g
              ];
              
              for (const pattern of trackingPatterns) {
                const matches = [...link.matchAll(pattern)];
                for (const match of matches) {
                  if (match[1] && match[1].length === 12) {
                    const trackingNum = match[1];
                    // Skip if it looks like an order ID (very long numbers) or date
                    // Order IDs are usually longer (like 14797812286991753494)
                    if (!trackingNum.startsWith('20') && !trackingNum.startsWith('19') && 
                        !trackingNum.startsWith('14') && !trackingNum.startsWith('15')) {
                      trackingCandidates.push({ 
                        number: trackingNum, 
                        priority: 2, 
                        source: 'Track your order link' 
                      });
                      console.log(`🔍 Found tracking candidate in track link: ${trackingNum}`);
                    }
                  }
                }
              }
            }
          }
          
          // Strategy 3: Extract from href attributes containing "track" (medium priority)
          const hrefTrackPattern = /href=["'][^"']*track[^"']*(\d{12})/gi;
          const hrefMatches = [...htmlContent.matchAll(hrefTrackPattern)];
          for (const match of hrefMatches) {
            if (match[1] && match[1].length === 12) {
              trackingCandidates.push({ 
                number: match[1], 
                priority: 4, 
                source: 'href with track' 
              });
            }
          }
          
          // Strategy 4: Extract using common tracking patterns in email content (lower priority)
          const trackingPatterns = [
            { pattern: /(?:tracking|track)\s*(?:number|#)?[:\s]*(\d{12})\b/gi, priority: 5, source: 'tracking number text' },
            { pattern: /\b(\d{12})\b(?=.*track)/gi, priority: 6, source: '12-digit near track' },
            // Look for tracking numbers in table cells or divs near "track" text
            { pattern: /<td[^>]*>.*?(\d{12}).*?<\/td>/gi, priority: 5, source: 'table cell' },
            { pattern: /<div[^>]*>.*?track[^>]*>.*?(\d{12})/gi, priority: 5, source: 'div with track' }
          ];
          
          for (const { pattern, priority, source } of trackingPatterns) {
            const matches = [...htmlContent.matchAll(pattern)];
            for (const match of matches) {
              if (match[1] && match[1].length === 12) {
                const trackingNum = match[1];
                // Skip if it looks like a date or other common number
                if (!trackingNum.startsWith('20') && !trackingNum.startsWith('19') &&
                    !trackingNum.startsWith('14') && !trackingNum.startsWith('15')) {
                  trackingCandidates.push({ number: trackingNum, priority, source });
                  console.log(`🔍 Found tracking candidate via pattern: ${trackingNum} (${source})`);
                }
              }
            }
          }
          
          // Strategy 5: Extract from plain text content (strip HTML tags)
          const textContent = htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
          const textTrackingPatterns = [
            /tracking\s*(?:number|#)?[:\s]+(\d{12})/i,
            /track\s*(?:number|#)?[:\s]+(\d{12})/i,
            /fedex\s*(?:tracking|track)?[:\s]+(\d{12})/i
          ];
          
          for (const pattern of textTrackingPatterns) {
            const match = textContent.match(pattern);
            if (match && match[1] && match[1].length === 12) {
              const trackingNum = match[1];
              if (!trackingNum.startsWith('20') && !trackingNum.startsWith('19') &&
                  !trackingNum.startsWith('14') && !trackingNum.startsWith('15')) {
                trackingCandidates.push({ 
                  number: trackingNum, 
                  priority: 3, 
                  source: 'plain text content' 
                });
                console.log(`🔍 Found tracking in text content: ${trackingNum}`);
              }
            }
          }
          
          // Strategy 6: Final fallback - extract ALL 12-digit numbers and validate
          if (trackingCandidates.length === 0) {
            console.log(`🔍 No candidates found with patterns, trying comprehensive search...`);
            const allNumbers = [...htmlContent.matchAll(/\b(\d{12})\b/g)];
            const validNumbers: Array<{ number: string; priority: number }> = [];
            
            for (const match of allNumbers) {
              if (match[1] && match.index !== undefined) {
                const num = match[1];
                // Skip dates, order IDs, and other common non-tracking numbers
                if (num.startsWith('20') || num.startsWith('19') || 
                    num.startsWith('14') || num.startsWith('15') ||
                    num.startsWith('0') && num.length === 12) {
                  continue;
                }
                
                // Check context around the number
                const startIndex = Math.max(0, match.index - 200);
                const endIndex = Math.min(htmlContent.length, match.index + num.length + 200);
                const context = htmlContent.substring(startIndex, endIndex).toLowerCase();
                
                // Higher priority for numbers starting with 8 or 9 (common FedEx)
                let priority = 10;
                if (num.startsWith('8') || num.startsWith('9')) {
                  priority = 7; // Higher priority for FedEx-like numbers
                }
                
                // Boost priority if near tracking-related keywords
                if (context.includes('track') || context.includes('fedex') || 
                    context.includes('shipping') || context.includes('delivery')) {
                  priority = Math.min(priority, 6);
                }
                
                validNumbers.push({ number: num, priority });
                console.log(`🔍 Found 12-digit number: ${num} (priority ${priority})`);
              }
            }
            
            // Add valid numbers to candidates
            for (const { number, priority } of validNumbers) {
              trackingCandidates.push({ 
                number, 
                priority, 
                source: 'comprehensive search' 
              });
            }
          }
          
          // Remove duplicates and sort by priority (lower number = higher priority)
          const uniqueCandidates = Array.from(
            new Map(trackingCandidates.map(c => [c.number, c])).values()
          ).sort((a, b) => a.priority - b.priority);
          
          console.log(`📋 Found ${uniqueCandidates.length} unique tracking candidates:`, 
            uniqueCandidates.map(c => `${c.number} (${c.source}, priority ${c.priority})`));
          
          // Select the best candidate (highest priority, and prefer 12-digit numbers starting with 8 or 9)
          let extractedTracking = null;
          if (uniqueCandidates.length > 0) {
            // First, try to find one starting with 8 or 9 (common FedEx format)
            const fedexLike = uniqueCandidates.find(c => /^[89]/.test(c.number));
            if (fedexLike) {
              extractedTracking = fedexLike.number;
              console.log(`✅ Selected FedEx-like tracking: ${extractedTracking} (${fedexLike.source})`);
            } else {
              // Otherwise, use the highest priority one
              extractedTracking = uniqueCandidates[0].number;
              console.log(`✅ Selected highest priority tracking: ${extractedTracking} (${uniqueCandidates[0].source})`);
            }
          }
          
          if (extractedTracking) {
            // Determine carrier
            let carrier = 'FedEx';
            if (extractedTracking.startsWith('1Z') && extractedTracking.length === 18) {
              carrier = 'UPS';
            }
            
            return NextResponse.json({
              success: true,
              trackingNumber: extractedTracking,
              carrier,
              extractedVia: 'gmail-email-html',
              note: 'Extracted directly from email HTML (no Puppeteer needed)'
            });
          }
          
          // If tracking not found in HTML, save the track order URL for Puppeteer fallback
          console.log(`🔍 Tracking not found in email HTML, looking for "Track your order" link...`);
          
          // Try multiple patterns to find the "Track your order" link
          const stockxTrackLinkPatterns = [
            // Pattern 1: Direct StockX link with "Track your order" text
            /<a[^>]*href=["']([^"']*stockx[^"']*(?:track|buying)[^"']*)["'][^>]*>(?:[^<]*Track[^<]*your[^<]*order[^<]*|[^<]*Track[^<]*Order[^<]*)/i,
            // Pattern 2: wizrocketmail redirect with StockX URL in r= parameter
            /<a[^>]*href=["']([^"']*wizrocketmail[^"']*r=[^"']*stockx[^"']*)["'][^>]*>(?:[^<]*Track[^<]*your[^<]*order[^<]*|[^<]*Track[^<]*Order[^<]*)/i,
            // Pattern 3: Any link containing "track" and "your" and "order" in text
            /<a[^>]*href=["']([^"']*)["'][^>]*>(?:[^<]*(?:track|Track)[^<]*(?:your|Your)[^<]*(?:order|Order)[^<]*)/i,
            // Pattern 4: Link with track-related href and order-related text
            /<a[^>]*href=["']([^"']*(?:track|buying|order)[^"']*)["'][^>]*>(?:[^<]*(?:track|Track|order|Order)[^<]*)/i,
            // Pattern 5: Look for any link containing "track" (broader search)
            /<a[^>]*href=["']([^"']*track[^"']*)["'][^>]*>/i
          ];
          
          console.log(`🔍 Trying ${stockxTrackLinkPatterns.length} patterns to find track link...`);
          
          for (let patternIndex = 0; patternIndex < stockxTrackLinkPatterns.length; patternIndex++) {
            const pattern = stockxTrackLinkPatterns[patternIndex];
            const match = htmlContent.match(pattern);
            if (match && match[1]) {
              trackOrderUrl = match[1];
              trackOrderUrl = trackOrderUrl.replace(/&amp;/g, '&').replace(/&quot;/g, '"');
              
              console.log(`🔍 Pattern ${patternIndex + 1} matched, found link: ${trackOrderUrl.substring(0, 200)}...`);
              
              // If it's a wizrocketmail redirect, extract the actual StockX URL
              if (trackOrderUrl.includes('wizrocketmail')) {
                console.log(`🔍 Detected wizrocketmail redirect, extracting actual URL...`);
                const rParamMatch = trackOrderUrl.match(/[?&]r=([^&]+)/i);
                if (rParamMatch && rParamMatch[1]) {
                  try {
                    const actualUrl = decodeURIComponent(rParamMatch[1]);
                    console.log(`🔍 Decoded URL: ${actualUrl.substring(0, 200)}...`);
                    if (actualUrl.includes('stockx.com')) {
                      trackOrderUrl = actualUrl;
                      console.log(`✅ Extracted StockX URL from wizrocketmail redirect: ${trackOrderUrl}`);
                    }
                  } catch (e) {
                    console.log(`⚠️ Could not decode wizrocketmail URL: ${e}`);
                  }
                }
              }
              
              // Only use if it's a StockX URL
              if (trackOrderUrl.includes('stockx.com')) {
                console.log(`✅ Found "Track your order" link (will try Puppeteer): ${trackOrderUrl}`);
                shippedEmail = {
                  id: emailsToCheck[0].id,
                  subject,
                  trackOrderUrl
                };
                break;
              } else {
                console.log(`⚠️ Link found but not a StockX URL, continuing search...`);
              }
            }
          }
          
          if (!trackOrderUrl) {
            console.log(`⚠️ Could not find "Track your order" link in email HTML`);
          }
        }
      }
    } catch (error: any) {
      console.error(`Error searching with query "${query}":`, error.message);
      continue;
    }
  }

  if (!trackOrderUrl || !shippedEmail) {
    return NextResponse.json(
      { 
        error: 'Could not find shipped email or "Track your order" link in Gmail. Make sure the order has been shipped.',
        debug: {
          orderNumber,
          searchedQueries: shippingQueries
        }
      },
      { status: 404 }
    );
  }

  // Step 2: Use Puppeteer to navigate to StockX and click Track Order
  console.log(`🔗 Step 2: Navigating to StockX order page: ${trackOrderUrl}`);
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    page.setDefaultTimeout(60000); // 60 seconds
    
    // Set realistic user agent and viewport to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Navigate to StockX order page (from the "Track your order" link)
    await page.goto(trackOrderUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });
    
    // Wait for page to fully render
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const stockxUrl = page.url();
    console.log(`📦 Step 3: StockX page loaded: ${stockxUrl}`);
    
    // Check for Cloudflare challenge
    const pageText = await page.evaluate(() => document.body.innerText);
    const hasCloudflare = pageText.includes('Verify you are human') || 
                         pageText.includes('Cloudflare') ||
                         pageText.includes('security of your connection') ||
                         pageText.includes('Ray ID:');
    
    if (hasCloudflare) {
      console.log(`⚠️ Cloudflare challenge detected on StockX page`);
      return NextResponse.json(
        { 
          error: 'StockX is blocking automated access with Cloudflare protection. The tracking number cannot be extracted automatically.',
          cloudflareBlocked: true,
          suggestion: 'Please manually extract the tracking number by clicking "Track your order" in the shipped email, then clicking "Track Order" on StockX to get the FedEx tracking number.',
          debug: {
            orderNumber,
            stockxUrl,
            pagePreview: pageText.substring(0, 200)
          }
        },
        { status: 403 }
      );
    }
    
    // Check if we're on StockX
    if (!stockxUrl.includes('stockx.com')) {
      return NextResponse.json(
        { 
          error: `Expected StockX page but got: ${stockxUrl}`,
          debug: {
            orderNumber,
            actualUrl: stockxUrl
          }
        },
        { status: 500 }
      );
    }
    
    // Step 3: Click "Track Order" button on StockX page
    console.log(`🔘 Step 4: Looking for "Track Order" button on StockX...`);
    
    // Debug: Get page content to see what's available (already fetched above for Cloudflare check)
    console.log(`📄 Page content preview (first 500 chars): ${pageText.substring(0, 500)}`);
    
    // Get all buttons and links on the page for debugging
    const allButtons = await page.$$eval('button, a', (elements) => 
      elements.map(el => ({
        tagName: el.tagName,
        text: el.textContent?.trim() || '',
        href: el.getAttribute('href') || '',
        className: el.className || '',
        ariaLabel: el.getAttribute('aria-label') || ''
      }))
    );
    console.log(`📋 Found ${allButtons.length} buttons/links on page`);
    console.log(`📋 Sample buttons/links:`, allButtons.slice(0, 10).map(b => `${b.tagName}: "${b.text.substring(0, 50)}"`));
    
    // Try multiple strategies to find the track button
    let trackButtonFound = false;
    let fedexPage: any = null;
    
    // Strategy 1: Find button by text content using evaluate (most reliable)
    // First, get all buttons and links, then filter by text content
    try {
      const trackButtonInfo = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('button, a, [role="button"]'));
        for (const el of elements) {
          const text = (el.textContent || '').trim().toLowerCase();
          const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
          const className = (el.className || '').toLowerCase();
          const href = (el.getAttribute('href') || '').toLowerCase();
          
          // Check if it's a track order button/link
          if ((text.includes('track order') || 
               (text.includes('track') && text.includes('order')) ||
               ariaLabel.includes('track order') ||
               ariaLabel.includes('track') && ariaLabel.includes('order')) &&
              !text.includes('tracking') && // Avoid "tracking number" text
              el.offsetParent !== null) { // Element is visible
            return {
              tagName: el.tagName,
              text: el.textContent?.trim() || '',
              href: el.getAttribute('href') || '',
              className: el.className || '',
              ariaLabel: el.getAttribute('aria-label') || '',
              id: el.id || '',
              dataTestId: el.getAttribute('data-testid') || ''
            };
          }
        }
        return null;
      });
      
      if (trackButtonInfo) {
        console.log(`✅ Found track button: ${trackButtonInfo.tagName} - "${trackButtonInfo.text}"`);
        
        // Set up listener for FedEx page BEFORE clicking
        const fedexPagePromise = new Promise((resolve) => {
          browser.once('targetcreated', async (target) => {
            const newPage = await target.page();
            resolve(newPage);
          });
        });
        
        // Click using the most specific selector available
        let clicked = false;
        if (trackButtonInfo.id) {
          try {
            await page.click(`#${trackButtonInfo.id}`);
            clicked = true;
          } catch (e) {
            // Try next method
          }
        }
        
        if (!clicked && trackButtonInfo.dataTestId) {
          try {
            await page.click(`[data-testid="${trackButtonInfo.dataTestId}"]`);
            clicked = true;
          } catch (e) {
            // Try next method
          }
        }
        
        if (!clicked) {
          // Use evaluate to click the element directly
          await page.evaluate((info) => {
            const elements = Array.from(document.querySelectorAll('button, a, [role="button"]'));
            for (const el of elements) {
              const text = (el.textContent || '').trim().toLowerCase();
              if (text.includes('track order') || (text.includes('track') && text.includes('order'))) {
                (el as HTMLElement).click();
                return;
              }
            }
          }, trackButtonInfo);
        }
        
        // Wait for FedEx page
        try {
          fedexPage = await Promise.race([
            fedexPagePromise,
            new Promise((resolve) => {
              page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 })
                .then(() => resolve(page))
                .catch(() => resolve(null));
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20000))
          ]) as any;
          
          trackButtonFound = true;
          console.log(`✅ FedEx page opened`);
        } catch (e) {
          console.log(`⚠️ Timeout waiting for FedEx page`);
        }
      }
    } catch (e) {
      console.log(`⚠️ Strategy 1 failed: ${e}`);
    }
    
    // Strategy 1b: Try common selectors (fallback)
    if (!trackButtonFound) {
      const trackButtonSelectors = [
        '[data-testid="track-order"]',
        '[data-testid="track"]',
        'button[aria-label*="Track"]',
        'a[aria-label*="Track"]',
        'a[href*="track"]',
        'button[class*="track"]',
        'a[class*="track"]'
      ];
      
      for (const selector of trackButtonSelectors) {
        try {
          const button = await page.$(selector);
          if (button) {
            console.log(`✅ Found track button with selector: ${selector}`);
            
            // Set up listener for FedEx page
            const fedexPagePromise = new Promise((resolve) => {
              browser.once('targetcreated', async (target) => {
                const newPage = await target.page();
                resolve(newPage);
              });
            });
            
            await button.click();
            
            // Wait for FedEx page
            try {
              fedexPage = await Promise.race([
                fedexPagePromise,
                new Promise((resolve) => {
                  page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 })
                    .then(() => resolve(page))
                    .catch(() => resolve(null));
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20000))
              ]) as any;
              
              trackButtonFound = true;
              console.log(`✅ FedEx page opened`);
              break;
            } catch (e) {
              console.log(`⚠️ Timeout waiting for FedEx page with selector: ${selector}`);
              continue;
            }
          }
        } catch (e) {
          continue;
        }
      }
    }
    
    // Strategy 2: Look for links containing "fedex" or "track" in href
    if (!trackButtonFound) {
      console.log(`🔍 Strategy 2: Looking for tracking links...`);
      try {
        const trackLinks = await page.$$eval('a[href]', (links) => 
          links
            .filter(link => {
              const href = (link.getAttribute('href') || '').toLowerCase();
              const text = (link.textContent || '').toLowerCase();
              return (href.includes('fedex') || href.includes('ups') || href.includes('track')) ||
                     (text.includes('track') && (href.includes('http') || href.startsWith('/')));
            })
            .map(link => ({
              href: link.getAttribute('href') || '',
              text: link.textContent?.trim() || ''
            }))
        );
        
        if (trackLinks.length > 0) {
          console.log(`✅ Found ${trackLinks.length} potential tracking links`);
          const firstLink = trackLinks[0];
          console.log(`🔗 Clicking link: ${firstLink.href}`);
          
          const fedexPagePromise = new Promise((resolve) => {
            browser.once('targetcreated', async (target) => {
              const newPage = await target.page();
              resolve(newPage);
            });
          });
          
          await page.click(`a[href="${firstLink.href}"]`);
          
          try {
            fedexPage = await Promise.race([
              fedexPagePromise,
              new Promise((resolve) => {
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 })
                  .then(() => resolve(page))
                  .catch(() => resolve(null));
              }),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20000))
            ]) as any;
            
            trackButtonFound = true;
            console.log(`✅ FedEx page opened via link`);
          } catch (e) {
            console.log(`⚠️ Timeout waiting for FedEx page via link`);
          }
        }
      } catch (e) {
        console.log(`⚠️ Strategy 3 failed: ${e}`);
      }
    }
    
    if (!trackButtonFound || !fedexPage) {
      return NextResponse.json(
        { 
          error: 'Could not find "Track Order" button on StockX page or FedEx page did not open.',
          debug: {
            orderNumber,
            stockxUrl
          }
        },
        { status: 404 }
      );
    }
    
    // Step 4: Extract tracking number from FedEx URL
    console.log(`📦 Step 5: Extracting tracking number from FedEx URL...`);
    
    // Wait for FedEx page to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const fedexUrl = fedexPage.url();
    console.log(`📦 FedEx URL: ${fedexUrl}`);
    
    // Extract tracking number from FedEx URL
    const trackingMatch = fedexUrl.match(/tracknumbers?[=%3D](\d{10,22})/i) || 
                         fedexUrl.match(/trknbr[=%3D](\d{10,22})/i);
    
    if (trackingMatch) {
      const trackingNumber = trackingMatch[1];
      console.log(`✅ Extracted tracking number: ${trackingNumber}`);
      
      // Determine carrier
      let carrier = 'FedEx';
      if (trackingNumber.startsWith('1Z') && trackingNumber.length === 18) {
        carrier = 'UPS';
      }
      
      return NextResponse.json({
        success: true,
        trackingNumber,
        carrier,
        fedexUrl,
        extractedVia: 'gmail-api-stockx-fedex'
      });
    }
    
    return NextResponse.json(
      { 
        error: 'Could not extract tracking number from FedEx URL',
        fedexUrl,
        debug: {
          orderNumber,
          fedexUrl
        }
      },
      { status: 500 }
    );
    
  } catch (error: any) {
    console.error('❌ Error in Puppeteer flow:', error);
    
    let errorMessage = 'Failed to extract tracking number';
    let errorDetails = error.message;
    
    if (error.message?.includes('timeout') || error.message?.includes('Timeout')) {
      errorMessage = 'Request timed out. The page may be loading slowly. Please try again.';
    } else if (error.message?.includes('Could not find')) {
      errorMessage = 'Could not find tracking information. The order may not be shipped yet or tracking may not be available.';
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: errorDetails,
        suggestion: 'You can manually add the tracking number by clicking "View Email" and copying it from the Gmail email.',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
