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
    page.setDefaultTimeout(60000); // 60 seconds
    
    // Step 1: Navigate to StockX order page
    const url = stockxOrderUrl || `https://stockx.com/buying/${orderNumber}`;
    console.log(`📄 Step 1: Navigating to StockX order page: ${url}`);
    
    await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });
    
    // Wait for page to fully render
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check if we're on a login page or error page
    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('sign-in')) {
      return NextResponse.json(
        { 
          error: 'StockX requires login to view order details. Please log in to StockX first.',
          requiresLogin: true,
          currentUrl
        },
        { status: 401 }
      );
    }
    
    if (currentUrl.includes('404') || currentUrl.includes('not found')) {
      return NextResponse.json(
        { 
          error: `Order not found: ${orderNumber}. The order may not exist or you may not have access to it.`,
          orderNumber,
          currentUrl
        },
        { status: 404 }
      );
    }
    
    // Step 2: Find and click "Track Order" button
    console.log(`🔘 Step 2: Looking for "Track Order" button...`);
    
    // Try common selectors for the Track Order button
    const trackButtonSelectors = [
      'button:has-text("Track Order")',
      'a:has-text("Track Order")',
      'button:has-text("Track")',
      'a:has-text("Track")',
      '[data-testid="track-order"]',
      'button[aria-label*="Track"]',
      'a[href*="track"]'
    ];
    
    let trackButtonFound = false;
    let fedexPage = null;
    
    for (const selector of trackButtonSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          console.log(`✅ Found track button with selector: ${selector}`);
          
          // Set up listener for new page (FedEx) before clicking
          const pagePromise = new Promise((resolve) => {
            browser.once('targetcreated', async (target) => {
              const newPage = await target.page();
              resolve(newPage);
            });
          });
          
          // Click the button
          await button.click();
          
          // Wait for FedEx page to open
          try {
            fedexPage = await Promise.race([
              pagePromise,
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
    
    if (!trackButtonFound || !fedexPage) {
      return NextResponse.json(
        { 
          error: 'Could not find "Track Order" button on StockX page or FedEx page did not open.',
          debug: {
            url,
            orderNumber,
            currentUrl: page.url()
          }
        },
        { status: 404 }
      );
    }
    
    // Step 3: Wait for FedEx page to load and extract tracking from URL
    console.log(`📦 Step 3: Extracting tracking number from FedEx URL...`);
    
    try {
      await fedexPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (e) {
      // Page might already be loaded, continue
      console.log(`⚠️ Navigation wait timeout (page may already be loaded)`);
    }
    
    // Wait a bit for URL to stabilize
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const fedexUrl = fedexPage.url();
    console.log(`📦 FedEx URL: ${fedexUrl}`);
    
    // Extract tracking number from FedEx URL
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
    
    return NextResponse.json(
      { 
        error: 'Could not extract tracking number from FedEx URL',
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
