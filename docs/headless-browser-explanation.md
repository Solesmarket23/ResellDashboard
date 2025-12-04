# Headless Browser Approach for Tracking Number Extraction

## Overview
Use Puppeteer or Playwright to automatically navigate StockX → FedEx and extract tracking numbers.

## Step-by-Step Process

### 1. User clicks "Get Tracking" button
- Button opens StockX order page: `https://stockx.com/buying/14800583785853838882`
- Or we can use the order number from the email: `03-T4MV7BR007`

### 2. Headless browser automation (backend)
```javascript
// Pseudocode flow:
1. Launch headless browser
2. Navigate to StockX order page
3. Wait for page to load
4. Click "Track Order" button
5. Wait for new tab/window to open (FedEx)
6. Extract tracking number from FedEx URL
7. Return tracking number to frontend
8. Close browser
```

### 3. Extract tracking from FedEx URL
FedEx URLs typically look like:
- `https://www.fedex.com/fedextrack/?trknbr=886695584309`
- `https://www.fedex.com/apps/fedextrack/?tracknumbers=886695584309`

The tracking number is in the URL parameters!

## Implementation Example

### Using Puppeteer (Chrome/Chromium)
```javascript
const puppeteer = require('puppeteer');

async function extractTrackingFromStockX(orderNumber) {
  const browser = await puppeteer.launch({
    headless: true, // Run without GUI
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Navigate to StockX order page
    await page.goto(`https://stockx.com/buying/${orderNumber}`);
    
    // Wait for page to load
    await page.waitForSelector('button[data-testid="track-order"]', { timeout: 10000 });
    
    // Click "Track Order" button
    // This will open FedEx in a new tab
    const [newPage] = await Promise.all([
      page.waitForEvent('popup'), // Wait for new tab
      page.click('button[data-testid="track-order"]') // Click button
    ]);
    
    // Wait for FedEx page to load
    await newPage.waitForLoadState('networkidle');
    
    // Extract tracking number from FedEx URL
    const fedexUrl = newPage.url();
    const trackingMatch = fedexUrl.match(/tracknumbers?=(\d{10,22})/i) || 
                         fedexUrl.match(/trknbr=(\d{10,22})/i);
    
    if (trackingMatch) {
      return trackingMatch[1]; // Return tracking number
    }
    
    // Fallback: Try to extract from page content
    const pageContent = await newPage.content();
    const trackingInContent = pageContent.match(/Tracking Number[:\s]*(\d{10,22})/i);
    
    return trackingInContent ? trackingInContent[1] : null;
    
  } finally {
    await browser.close();
  }
}
```

### Using Playwright (Cross-browser)
```javascript
const { chromium } = require('playwright');

async function extractTrackingFromStockX(orderNumber) {
  const browser = await chromium.launch({ headless: true });
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Navigate to StockX
    await page.goto(`https://stockx.com/buying/${orderNumber}`);
    
    // Click "Track Order" and wait for new page
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      page.click('text=Track Order')
    ]);
    
    // Wait for FedEx to load
    await newPage.waitForLoadState('networkidle');
    
    // Extract tracking from URL
    const url = newPage.url();
    const tracking = url.match(/tracknumbers?=(\d{10,22})/i)?.[1];
    
    return tracking;
    
  } finally {
    await browser.close();
  }
}
```

## API Endpoint Implementation

### Next.js API Route
```typescript
// src/app/api/stockx/extract-tracking/route.ts
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
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Navigate to StockX order page
    const url = stockxOrderUrl || `https://stockx.com/buying/${orderNumber}`;
    await page.goto(url, { waitUntil: 'networkidle2' });
    
    // Find and click "Track Order" button
    // Wait for new page to open (FedEx)
    const [fedexPage] = await Promise.all([
      new Promise((resolve) => {
        browser.once('targetcreated', (target) => {
          resolve(target.page());
        });
      }),
      page.click('button:has-text("Track Order"), a:has-text("Track Order")')
    ]);
    
    // Wait for FedEx page to load
    await fedexPage.waitForLoadState('networkidle');
    
    // Extract tracking number from FedEx URL
    const fedexUrl = fedexPage.url();
    const trackingMatch = fedexUrl.match(/tracknumbers?=(\d{10,22})/i) || 
                         fedexUrl.match(/trknbr=(\d{10,22})/i);
    
    const trackingNumber = trackingMatch ? trackingMatch[1] : null;
    
    return NextResponse.json({
      success: !!trackingNumber,
      trackingNumber,
      fedexUrl
    });
    
  } catch (error) {
    console.error('Error extracting tracking:', error);
    return NextResponse.json(
      { error: 'Failed to extract tracking number', details: error.message },
      { status: 500 }
    );
  } finally {
    await browser.close();
  }
}
```

## Pros and Cons

### ✅ Pros
- **Fully automated** - No user interaction needed
- **Reliable** - Always gets tracking from FedEx URL
- **Works even if email parsing fails**
- **No browser extension needed**
- **Can handle authentication** (if user is logged into StockX)

### ❌ Cons
- **Slower** - Takes 5-10 seconds to navigate and extract
- **Requires server resources** - Needs to run browser instances
- **May break if StockX changes UI** - Button selectors might change
- **Requires authentication** - User might need to be logged into StockX
- **Cost** - Server resources for running browsers

## When to Use This Approach

### ✅ Good for:
- Fallback when email parsing fails
- Batch processing multiple orders
- When StockX API doesn't provide tracking
- When you need 100% accuracy

### ❌ Not ideal for:
- Real-time tracking (too slow)
- High-volume processing (resource intensive)
- When email parsing works (unnecessary overhead)

## Hybrid Approach (Recommended)

1. **Primary**: Try email parsing first (fast, no resources)
2. **Fallback**: Use headless browser if parsing fails
3. **Manual**: Show button for user to manually enter if both fail

```typescript
async function getTrackingNumber(orderInfo) {
  // Step 1: Try email parsing (fast)
  const emailTracking = extractTrackingFromEmail(orderInfo.emailHtml);
  if (emailTracking) return emailTracking;
  
  // Step 2: Try headless browser (slower but reliable)
  const browserTracking = await extractTrackingFromStockX(orderInfo.orderNumber);
  if (browserTracking) return browserTracking;
  
  // Step 3: Return null - user can manually enter
  return null;
}
```

## Installation

### Puppeteer
```bash
npm install puppeteer
# Or for serverless environments:
npm install puppeteer-core
```

### Playwright
```bash
npm install playwright
npx playwright install chromium
```

## Serverless Considerations

For Vercel/serverless:
- Use `puppeteer-core` with Chrome AWS Lambda layer
- Or use Playwright with bundled browser
- Consider timeout limits (Vercel: 10s for Hobby, 60s for Pro)

## Security Considerations

- Run in sandboxed environment
- Don't expose browser to public
- Rate limit requests
- Handle authentication securely
- Clean up browser instances

