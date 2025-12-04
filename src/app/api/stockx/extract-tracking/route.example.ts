/**
 * EXAMPLE: Headless Browser Tracking Extraction
 * 
 * This is an example implementation showing how to use Puppeteer/Playwright
 * to automatically extract tracking numbers from StockX → FedEx flow.
 * 
 * To use this:
 * 1. Install: npm install puppeteer (or playwright)
 * 2. Uncomment and adapt the code below
 * 3. Add to your API routes
 */

import { NextRequest, NextResponse } from 'next/server';

/*
// OPTION 1: Using Puppeteer
import puppeteer from 'puppeteer';

export async function POST(request: NextRequest) {
  const { orderNumber, stockxOrderUrl } = await request.json();
  
  if (!orderNumber && !stockxOrderUrl) {
    return NextResponse.json(
      { error: 'Order number or StockX URL required' },
      { status: 400 }
    );
  }
  
  console.log(`🤖 Starting headless browser to extract tracking for order: ${orderNumber}`);
  
  const browser = await puppeteer.launch({
    headless: true, // Set to false to see browser (for debugging)
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Navigate to StockX order page
    const url = stockxOrderUrl || `https://stockx.com/buying/${orderNumber}`;
    console.log(`📄 Navigating to: ${url}`);
    
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Wait a bit for page to fully load
    await page.waitForTimeout(2000);
    
    // Find "Track Order" button/link
    // Note: Selectors may need to be updated based on StockX's actual HTML
    const trackButtonSelectors = [
      'button:has-text("Track Order")',
      'a:has-text("Track Order")',
      '[data-testid="track-order"]',
      'button[aria-label*="Track"]',
      'a[href*="track"]'
    ];
    
    let trackButtonFound = false;
    for (const selector of trackButtonSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          console.log(`✅ Found track button with selector: ${selector}`);
          
          // Click button and wait for new page (FedEx)
          const [newPage] = await Promise.all([
            new Promise((resolve) => {
              browser.once('targetcreated', async (target) => {
                const page = await target.page();
                resolve(page);
              });
            }),
            button.click()
          ]);
          
          // Wait for FedEx page to load
          await newPage.waitForLoadState('networkidle');
          
          // Extract tracking number from FedEx URL
          const fedexUrl = newPage.url();
          console.log(`📦 FedEx URL: ${fedexUrl}`);
          
          // FedEx URLs typically contain tracking in these formats:
          // - tracknumbers=886695584309
          // - trknbr=886695584309
          const trackingMatch = fedexUrl.match(/tracknumbers?=(\d{10,22})/i) || 
                               fedexUrl.match(/trknbr=(\d{10,22})/i);
          
          if (trackingMatch) {
            const trackingNumber = trackingMatch[1];
            console.log(`✅ Extracted tracking number: ${trackingNumber}`);
            
            return NextResponse.json({
              success: true,
              trackingNumber,
              carrier: 'FedEx',
              fedexUrl
            });
          }
          
          trackButtonFound = true;
          break;
        }
      } catch (e) {
        // Try next selector
        continue;
      }
    }
    
    if (!trackButtonFound) {
      return NextResponse.json(
        { error: 'Could not find "Track Order" button on StockX page' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { error: 'Could not extract tracking number from FedEx URL' },
      { status: 500 }
    );
    
  } catch (error: any) {
    console.error('❌ Error extracting tracking:', error);
    return NextResponse.json(
      { 
        error: 'Failed to extract tracking number', 
        details: error.message 
      },
      { status: 500 }
    );
  } finally {
    await browser.close();
  }
}
*/

/*
// OPTION 2: Using Playwright (more reliable, cross-browser)
import { chromium } from 'playwright';

export async function POST(request: NextRequest) {
  const { orderNumber, stockxOrderUrl } = await request.json();
  
  if (!orderNumber && !stockxOrderUrl) {
    return NextResponse.json(
      { error: 'Order number or StockX URL required' },
      { status: 400 }
    );
  }
  
  console.log(`🤖 Starting Playwright to extract tracking for order: ${orderNumber}`);
  
  const browser = await chromium.launch({ 
    headless: true 
  });
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Navigate to StockX order page
    const url = stockxOrderUrl || `https://stockx.com/buying/${orderNumber}`;
    console.log(`📄 Navigating to: ${url}`);
    
    await page.goto(url, { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    // Wait for page to load
    await page.waitForTimeout(2000);
    
    // Click "Track Order" and wait for new page
    const [fedexPage] = await Promise.all([
      context.waitForEvent('page', { timeout: 10000 }),
      page.click('text=Track Order', { timeout: 10000 })
    ]);
    
    // Wait for FedEx page to load
    await fedexPage.waitForLoadState('networkidle');
    
    // Extract tracking number from FedEx URL
    const fedexUrl = fedexPage.url();
    console.log(`📦 FedEx URL: ${fedexUrl}`);
    
    const trackingMatch = fedexUrl.match(/tracknumbers?=(\d{10,22})/i) || 
                         fedexUrl.match(/trknbr=(\d{10,22})/i);
    
    if (trackingMatch) {
      const trackingNumber = trackingMatch[1];
      console.log(`✅ Extracted tracking number: ${trackingNumber}`);
      
      return NextResponse.json({
        success: true,
        trackingNumber,
        carrier: 'FedEx',
        fedexUrl
      });
    }
    
    return NextResponse.json(
      { error: 'Could not extract tracking number from FedEx URL' },
      { status: 500 }
    );
    
  } catch (error: any) {
    console.error('❌ Error extracting tracking:', error);
    return NextResponse.json(
      { 
        error: 'Failed to extract tracking number', 
        details: error.message 
      },
      { status: 500 }
    );
  } finally {
    await browser.close();
  }
}
*/

// Placeholder response (remove when implementing)
export async function POST(request: NextRequest) {
  return NextResponse.json({
    message: 'Headless browser extraction not yet implemented',
    note: 'See route.example.ts for implementation example'
  });
}

