import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('query') || 'Nike Dunk Low';
  
  console.log(`🔍 DEBUG: Testing arbitrage pipeline for "${query}"`);
  
  // Mock eBay listings to test the pipeline
  const mockEbayListings = [
    {
      title: 'Nike Air Jordan 1 High OG "Bred Toe" FQ0235-102 Size 10 NEW',
      price: 180,
      currency: 'USD',
      image: '/placeholder-shoe.png',
      url: 'https://ebay.com/item/mock1',
      seller: 'sneaker_connect',
      condition: 'New',
      source: 'eBay (Mock)',
      itemId: 'mock1',
      shipping: 12
    }
  ];
  
  const debugLog: string[] = [];
  
  try {
    // Test parseShoeDetails function
    const listing = mockEbayListings[0];
    debugLog.push(`Processing: ${listing.title}`);
    
    // Parse shoe details
    const parsedDetails = parseShoeDetails(listing.title);
    debugLog.push(`Parsed details: ${JSON.stringify(parsedDetails)}`);
    
    // Test StockX search
    const stockxQuery = generateStockXQuery(listing.title, parsedDetails);
    debugLog.push(`StockX query: "${stockxQuery}"`);
    
    // Test actual StockX search call
    const baseUrl = 'https://www.solesmarket.com';
    const stockxApiUrl = `${baseUrl}/api/stockx/public-search?query=${encodeURIComponent(stockxQuery)}&limit=10`;
    debugLog.push(`StockX API URL: ${stockxApiUrl}`);
    
    const stockxResponse = await fetch(stockxApiUrl, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; solesmarket-debug)'
      }
    });
    debugLog.push(`StockX API status: ${stockxResponse.status}`);
    
    if (stockxResponse.ok) {
      const stockxData = await stockxResponse.json();
      debugLog.push(`StockX response: ${JSON.stringify(stockxData)}`);
    } else {
      const errorText = await stockxResponse.text();
      debugLog.push(`StockX error: ${errorText}`);
    }
    
    return NextResponse.json({
      success: true,
      query,
      debugLog,
      mockListing: listing
    });
    
  } catch (error) {
    debugLog.push(`Error: ${error.message}`);
    return NextResponse.json({
      success: false,
      error: error.message,
      debugLog
    });
  }
}

// Copy the functions from the main arbitrage file for testing
function parseShoeDetails(title: string): { brand?: string; model?: string; size?: string; styleCode?: string; possibleSizes: string[] } {
  const normalizedTitle = title.toLowerCase();
  
  // Extract style code - look for common Nike/Adidas style patterns
  const styleCodePatterns = [
    /\b([A-Z]{2}\d{4}-\d{3})\b/i,  // Nike pattern: DJ0950-101
    /\b([A-Z]\d{5})\b/i,           // Adidas pattern: H01234
    /\b([A-Z]{2}\d{4})\b/i,        // Alternative Nike: DJ0950
    /\b(\d{6}-\d{3})\b/i,          // Numeric: 123456-789
    /\b([A-Z]{1,3}\d{3,5}-?\d{0,3})\b/i // General pattern
  ];
  
  let styleCode = undefined;
  for (const pattern of styleCodePatterns) {
    const match = title.match(pattern);
    if (match) {
      styleCode = match[1].toUpperCase();
      break;
    }
  }
  
  // Common shoe brands
  const brands = ['nike', 'jordan', 'adidas', 'yeezy', 'new balance', 'vans', 'converse', 'puma', 'reebok', 'asics', 'supreme', 'off-white', 'fear of god'];
  const brand = brands.find(b => normalizedTitle.includes(b));
  
  // Extract sizes (US shoe sizes)
  const sizeRegex = /\b(?:size\s+)?(\d+(?:\.\d+)?)\b/gi;
  const sizeMatches = title.match(sizeRegex) || [];
  const possibleSizes = sizeMatches
    .map(match => match.replace(/size\s+/i, '').trim())
    .filter(size => {
      const num = parseFloat(size);
      return num >= 3 && num <= 18; // Reasonable shoe size range
    });
  
  // Try to extract the main size (first valid size mentioned)
  const size = possibleSizes[0];
  
  // Extract model (everything after brand, before size)
  let model = '';
  if (brand) {
    const brandIndex = normalizedTitle.indexOf(brand);
    let afterBrand = title.substring(brandIndex + brand.length).trim();
    
    // Remove size info from model
    if (size) {
      afterBrand = afterBrand.replace(new RegExp(`\\b(?:size\\s+)?${size}\\b`, 'gi'), '').trim();
    }
    
    // Clean up the model name
    model = afterBrand
      .replace(/\b(men|women|mens|womens|male|female|gs|ps|td)\b/gi, '')
      .replace(/\b(new|used|authentic|deadstock|ds)\b/gi, '')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .substring(0, 50); // Limit length
  }
  
  return { brand, model, size, styleCode, possibleSizes };
}

function generateStockXQuery(ebayTitle: string, parsedDetails: { brand?: string; model?: string; styleCode?: string }): string {
  const { brand, model, styleCode } = parsedDetails;
  
  // Priority 1: Use style code if available (most accurate)
  if (styleCode) {
    return styleCode;
  }
  
  // Priority 2: Use brand + model
  if (brand && model) {
    return `${brand} ${model}`.trim();
  } 
  
  // Priority 3: Use just brand
  if (brand) {
    return brand;
  } 
  
  // Fallback: Use first few words of title
  return ebayTitle.split(' ').slice(0, 3).join(' ');
}
