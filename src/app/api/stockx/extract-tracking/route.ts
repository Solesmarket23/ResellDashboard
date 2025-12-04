import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

export async function POST(request: NextRequest) {
  const { orderNumber, stockxOrderUrl } = await request.json();
  
  if (!orderNumber && !stockxOrderUrl) {
    return NextResponse.json(
      { error: 'Order number or StockX URL required' },
      { status: 400 }
    );
  }
  
  console.log(`🤖 Starting headless browser to extract tracking for order: ${orderNumber || 'from URL'}`);
  
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
    
    // Set a reasonable timeout
    page.setDefaultTimeout(30000);
    
    // Navigate to StockX order page
    const url = stockxOrderUrl || `https://stockx.com/buying/${orderNumber}`;
    console.log(`📄 Navigating to: ${url}`);
    
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Wait a bit for page to fully load and render
    await page.waitForTimeout(3000);
    
    // Check if we're on a login page or error page
    const currentUrl = page.url();
    const pageTitle = await page.title();
    const pageContent = await page.content();
    
    console.log(`📍 Current URL: ${currentUrl}`);
    console.log(`📄 Page title: ${pageTitle}`);
    
    if (currentUrl.includes('login') || currentUrl.includes('sign-in') || pageContent.includes('Sign In') || pageContent.includes('Log In')) {
      return NextResponse.json(
        { 
          error: 'StockX requires login to view order details. Please log in to StockX first.',
          requiresLogin: true,
          currentUrl
        },
        { status: 401 }
      );
    }
    
    if (currentUrl.includes('404') || pageContent.includes('404') || pageContent.includes('not found')) {
      return NextResponse.json(
        { 
          error: `Order not found: ${orderNumber}. The order may not exist or you may not have access to it.`,
          orderNumber,
          currentUrl
        },
        { status: 404 }
      );
    }
    
    // Log page content snippet for debugging
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log(`📝 Page content preview (first 500 chars): ${bodyText.substring(0, 500)}`);
    
    // Try multiple selectors for "Track Order" button/link
    // StockX might use different selectors, so we try multiple
    const trackButtonSelectors = [
      'button:has-text("Track Order")',
      'a:has-text("Track Order")',
      'button:has-text("Track")',
      'a:has-text("Track")',
      '[data-testid="track-order"]',
      '[data-testid="track"]',
      'button[aria-label*="Track"]',
      'a[href*="track"]',
      'button[class*="track"]',
      'a[class*="track"]'
    ];
    
    let trackButtonFound = false;
    let fedexPage = null;
    
    for (const selector of trackButtonSelectors) {
      try {
        // Check if element exists
        const button = await page.$(selector);
        if (button) {
          console.log(`✅ Found track button with selector: ${selector}`);
          
          // Set up listener for new page before clicking
          const pagePromise = new Promise((resolve) => {
            browser.once('targetcreated', async (target) => {
              const newPage = await target.page();
              resolve(newPage);
            });
          });
          
          // Click the button
          await button.click();
          
          // Wait for new page (FedEx) to open
          try {
            fedexPage = await Promise.race([
              pagePromise,
              new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
            ]) as any;
            
            trackButtonFound = true;
            console.log(`✅ FedEx page opened`);
            break;
          } catch (e) {
            console.log(`⚠️ Timeout waiting for new page with selector: ${selector}`);
            // Try next selector
            continue;
          }
        }
      } catch (e) {
        // Try next selector
        continue;
      }
    }
    
    // If no button found, try clicking any link that contains "track" in href
    if (!trackButtonFound) {
      console.log(`🔍 Trying to find track link by href...`);
      try {
        const trackLinks = await page.$$eval('a[href*="track"], a[href*="Track"]', (links) => 
          links.map(link => ({
            href: link.getAttribute('href'),
            text: link.textContent?.trim() || ''
          }))
        );
        
        if (trackLinks.length > 0) {
          console.log(`✅ Found ${trackLinks.length} track links`);
          const firstTrackLink = trackLinks[0];
          
          // Set up listener for new page
          const pagePromise = new Promise((resolve) => {
            browser.once('targetcreated', async (target) => {
              const newPage = await target.page();
              resolve(newPage);
            });
          });
          
          // Click the link
          await page.click(`a[href="${firstTrackLink.href}"]`);
          
          // Wait for new page
          try {
            fedexPage = await Promise.race([
              pagePromise,
              new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
            ]) as any;
            
            trackButtonFound = true;
            console.log(`✅ FedEx page opened via link`);
          } catch (e) {
            console.log(`⚠️ Timeout waiting for new page via link`);
          }
        }
      } catch (e) {
        console.log(`⚠️ Error finding track links: ${e}`);
      }
    }
    
    // If button click didn't work, try to find tracking number directly on StockX page
    if (!trackButtonFound || !fedexPage) {
      console.log(`🔍 Button click failed, searching for tracking number directly on StockX page...`);
      
      // Get all text content from the page
      const pageText = await page.evaluate(() => document.body.innerText);
      const pageHtml = await page.content();
      
      // Look for tracking numbers in the page content
      // FedEx: 10-22 digits
      const fedexPattern = /\b(\d{10,22})\b/g;
      const fedexMatches = pageText.match(fedexPattern) || [];
      
      // UPS: 1Z + 16 alphanumeric
      const upsPattern = /\b(1Z[0-9A-Z]{16})\b/gi;
      const upsMatches = pageText.match(upsPattern) || [];
      
      // Filter out common non-tracking numbers (dates, prices, etc.)
      const potentialTracking = [...fedexMatches, ...upsMatches].filter(num => {
        // Skip if it looks like a year (starts with 19 or 20)
        if (/^(19|20)\d{2,}$/.test(num)) return false;
        // Skip if it's too short or too long for FedEx
        if (num.length < 10 || num.length > 22) return false;
        // Skip if it's all zeros
        if (/^0+$/.test(num)) return false;
        return true;
      });
      
      if (potentialTracking.length > 0) {
        // Check if any are near "track" keywords
        for (const trackingNum of potentialTracking) {
          const contextWindow = 100;
          const numIndex = pageText.indexOf(trackingNum);
          if (numIndex !== -1) {
            const context = pageText.substring(
              Math.max(0, numIndex - contextWindow),
              Math.min(pageText.length, numIndex + trackingNum.length + contextWindow)
            );
            
            if (/track|tracking|ship|fedex|ups|carrier/i.test(context)) {
              console.log(`✅ Found tracking number in page content: ${trackingNum}`);
              
              let carrier = 'FedEx';
              if (trackingNum.startsWith('1Z') && trackingNum.length === 18) {
                carrier = 'UPS';
              }
              
              return NextResponse.json({
                success: true,
                trackingNumber: trackingNum,
                carrier,
                extractedFrom: 'stockx-page-content'
              });
            }
          }
        }
      }
      
      // Also check for tracking in URLs on the page
      const allLinks = await page.$$eval('a[href]', (links) => 
        links.map(link => link.getAttribute('href'))
      );
      
      for (const linkHref of allLinks) {
        if (linkHref && (linkHref.includes('fedex') || linkHref.includes('ups'))) {
          const trackingMatch = linkHref.match(/tracknumbers?[=%3D](\d{10,22})/i) || 
                               linkHref.match(/trknbr[=%3D](\d{10,22})/i) ||
                               linkHref.match(/(1Z[0-9A-Z]{16})/i);
          
          if (trackingMatch) {
            const trackingNum = trackingMatch[1];
            console.log(`✅ Found tracking number in link: ${trackingNum}`);
            
            let carrier = 'FedEx';
            if (trackingNum.startsWith('1Z') && trackingNum.length === 18) {
              carrier = 'UPS';
            }
            
            return NextResponse.json({
              success: true,
              trackingNumber: trackingNum,
              carrier,
              extractedFrom: 'stockx-link'
            });
          }
        }
      }
      
      // Take a screenshot for debugging
      try {
        await page.screenshot({ path: '/tmp/stockx-page.png', fullPage: true });
        console.log(`📸 Screenshot saved for debugging`);
      } catch (e) {
        // Ignore screenshot errors
      }
      
      return NextResponse.json(
        { 
          error: 'Could not find "Track Order" button or tracking number on StockX page. The order may require login or the page structure may have changed.',
          debug: {
            url,
            orderNumber,
            currentUrl: page.url(),
            pageTitle: await page.title(),
            foundLinks: allLinks.length,
            potentialTrackingNumbers: potentialTracking.slice(0, 5) // First 5 for debugging
          }
        },
        { status: 404 }
      );
    }
    
    // If we got here, fedexPage should exist - extract tracking from FedEx URL
    if (!fedexPage) {
      return NextResponse.json(
        { 
          error: 'FedEx page was not opened. The "Track Order" button may not be available for this order.',
          debug: {
            url,
            orderNumber
          }
        },
        { status: 404 }
      );
    }
    
    // Wait for FedEx page to load
    try {
      await fedexPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
    } catch (e) {
      // Page might already be loaded, continue
      console.log(`⚠️ Navigation wait timeout (page may already be loaded)`);
    }
    await new Promise(resolve => setTimeout(resolve, 2000)); // Extra wait for URL to stabilize
    
    // Extract tracking number from FedEx URL
    const fedexUrl = fedexPage.url();
    console.log(`📦 FedEx URL: ${fedexUrl}`);
    
    // FedEx URLs typically contain tracking in these formats:
    // - tracknumbers=886695584309
    // - trknbr=886695584309
    // - tracknumbers%3D886695584309 (URL encoded)
    const trackingMatch = fedexUrl.match(/tracknumbers?[=%3D](\d{10,22})/i) || 
                         fedexUrl.match(/trknbr[=%3D](\d{10,22})/i);
    
    if (trackingMatch) {
      const trackingNumber = trackingMatch[1];
      console.log(`✅ Extracted tracking number: ${trackingNumber}`);
      
      // Determine carrier (FedEx for 10-22 digits, UPS for 1Z format)
      let carrier = 'FedEx';
      if (trackingNumber.startsWith('1Z') && trackingNumber.length === 18) {
        carrier = 'UPS';
      }
      
      return NextResponse.json({
        success: true,
        trackingNumber,
        carrier,
        fedexUrl
      });
    }
    
    // Fallback: Try to extract from page content
    try {
      const pageContent = await fedexPage.content();
      const trackingInContent = pageContent.match(/Tracking\s+Number[:\s]*(\d{10,22})/i) ||
                                pageContent.match(/Track\s+Number[:\s]*(\d{10,22})/i);
      
      if (trackingInContent) {
        const trackingNumber = trackingInContent[1];
        console.log(`✅ Extracted tracking number from page content: ${trackingNumber}`);
        
        return NextResponse.json({
          success: true,
          trackingNumber,
          carrier: 'FedEx',
          fedexUrl,
          extractedFrom: 'page-content'
        });
      }
    } catch (e) {
      console.log(`⚠️ Error extracting from page content: ${e}`);
    }
    
    return NextResponse.json(
      { 
        error: 'Could not extract tracking number from FedEx URL or page content',
        fedexUrl,
        debug: {
          url,
          orderNumber
        }
      },
      { status: 500 }
    );
    
  } catch (error: any) {
    console.error('❌ Error extracting tracking:', error);
    return NextResponse.json(
      { 
        error: 'Failed to extract tracking number', 
        details: error.message,
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

