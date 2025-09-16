// Simple StockX Price Tracker Content Script
console.log('🔍 Simple StockX Price Tracker loaded');

// Add a visible indicator that the extension is loaded
const indicator = document.createElement('div');
indicator.id = 'stockx-extension-loaded';
indicator.style.cssText = `
  position: fixed;
  top: 10px;
  right: 10px;
  background: #00ff00;
  color: black;
  padding: 5px 10px;
  border-radius: 5px;
  font-size: 12px;
  z-index: 10000;
  font-family: Arial, sans-serif;
`;
indicator.textContent = 'StockX Extension Loaded';
document.body.appendChild(indicator);

// Remove indicator after 3 seconds
setTimeout(() => {
  if (indicator.parentNode) {
    indicator.parentNode.removeChild(indicator);
  }
}, 3000);

// Simple function to check if we're on a StockX product page
function isProductPage() {
  const url = window.location.href;
  const isStockX = url.includes('stockx.com');
  const isNotSearchPage = !url.includes('/search') && !url.includes('/sell') && !url.includes('/buy');
  const hasProductIndicators = document.querySelector('h1') || document.querySelector('button');
  
  console.log('🔍 Product page detection:', {
    isStockX,
    isNotSearchPage,
    hasProductIndicators,
    url: url
  });
  
  return isStockX && isNotSearchPage && hasProductIndicators;
}

// Simple function to scrape pricing data
function scrapePricingData() {
  console.log('🔍 Scraping pricing data...');
  
  const buttons = document.querySelectorAll('button');
  const prices = [];
  
  buttons.forEach(button => {
    const text = button.textContent || '';
    const priceMatch = text.match(/\$?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
    
    if (priceMatch) {
      const price = parseFloat(priceMatch[1].replace(/[$,]/g, ''));
      if (price > 10 && price < 10000) {
        prices.push(price);
        console.log(`💰 Found price: $${price} in "${text}"`);
      }
    }
  });
  
  if (prices.length > 0) {
    prices.sort((a, b) => a - b);
    const minPrice = prices[0];
    const maxPrice = prices[prices.length - 1];
    const avgPrice = Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length);
    
    return {
      averagePrice: avgPrice,
      lastSale: avgPrice,
      highestBid: minPrice,
      lowestAsk: maxPrice,
      scrapedFromPage: true
    };
  }
  
  return null;
}

// Simple function to display the widget
function displayWidget(marketData) {
  // Remove existing widget
  const existingWidget = document.getElementById('stockx-price-tracker-widget');
  if (existingWidget) {
    existingWidget.remove();
  }
  
  const widget = document.createElement('div');
  widget.id = 'stockx-price-tracker-widget';
  widget.style.cssText = `
    position: fixed;
    top: 20px;
    left: 20px;
    background: #2d3748;
    color: white;
    padding: 15px;
    border-radius: 8px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    z-index: 10000;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    max-width: 250px;
  `;
  
  widget.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
      <span style="font-weight: bold;">📊 Market Data</span>
      <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: white; cursor: pointer; font-size: 18px;">×</button>
    </div>
    <div style="margin-bottom: 8px;">
      <span>Average Price: </span>
      <span style="color: #4ade80;">$${marketData.averagePrice}</span>
    </div>
    <div style="margin-bottom: 8px;">
      <span>Last Sale: </span>
      <span>$${marketData.lastSale}</span>
    </div>
    <div style="margin-bottom: 8px;">
      <span>Highest Bid: </span>
      <span>$${marketData.highestBid}</span>
    </div>
    <div style="margin-bottom: 8px;">
      <span>Lowest Ask: </span>
      <span>$${marketData.lowestAsk}</span>
    </div>
    <div style="font-size: 12px; color: #a0aec0; text-align: center; margin-top: 10px;">
      ${marketData.scrapedFromPage ? 'Data scraped from page' : 'Mock data'}
    </div>
  `;
  
  document.body.appendChild(widget);
}

// Main function
function init() {
  console.log('🔍 Initializing simple tracker...');
  
  if (isProductPage()) {
    console.log('📦 StockX product page detected');
    
    // Wait a bit for page to load
    setTimeout(() => {
      const marketData = scrapePricingData();
      
      if (marketData) {
        console.log('✅ Scraped market data:', marketData);
        displayWidget(marketData);
      } else {
        console.log('⚠️ No pricing data found, using mock data');
        displayWidget({
          averagePrice: 95,
          lastSale: 103,
          highestBid: 89,
          lowestAsk: 98,
          scrapedFromPage: false
        });
      }
    }, 2000);
  } else {
    console.log('❌ Not a StockX product page');
  }
}

// Initialize
try {
  init();
} catch (error) {
  console.error('❌ Error initializing simple tracker:', error);
}
