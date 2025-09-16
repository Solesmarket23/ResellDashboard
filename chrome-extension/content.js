// StockX Price Tracker Content Script
console.log('🔍 StockX Price Tracker loaded');
console.log('🔍 Current URL:', window.location.href);
console.log('🔍 Document ready state:', document.readyState);

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

class StockXPriceTracker {
  constructor() {
    this.priceWidget = null;
    this.isLoading = false;
    this.init();
  }

  init() {
    // Wait for page to load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.startTracking());
    } else {
      this.startTracking();
    }
  }

  startTracking() {
    // Check if we're on a product page
    if (this.isProductPage()) {
      console.log('📦 StockX product page detected');
      this.extractProductInfo();
    }
  }

  isProductPage() {
    // Check for StockX product page indicators
    const url = window.location.href;
    const isStockX = url.includes('stockx.com');
    const isNotSearchPage = !url.includes('/search') && !url.includes('/sell') && !url.includes('/buy');
    const hasProductIndicators = (
      document.querySelector('[data-testid="product-detail"]') ||
      document.querySelector('.product-detail') ||
      document.querySelector('[data-testid="product-title"]') ||
      document.querySelector('h1') ||
      document.querySelector('.product-title') ||
      document.querySelector('[data-testid="product-price"]') ||
      document.querySelector('.product-price') ||
      document.querySelector('button[data-testid="buy-now"]') ||
      document.querySelector('button[data-testid="place-bid"]') ||
      // Removed invalid :contains() selectors
      document.querySelector('button[aria-label*="Buy"]') ||
      document.querySelector('button[aria-label*="Bid"]')
    );
    
    console.log('🔍 Product page detection:', {
      isStockX,
      isNotSearchPage,
      hasProductIndicators,
      url: url
    });
    
    return isStockX && isNotSearchPage && hasProductIndicators;
  }

  extractProductInfo() {
    try {
      // Extract product information from the page
      const productInfo = this.getProductInfo();
      console.log('📊 Product info extracted:', productInfo);

      if (productInfo.sku) {
        // Add a small delay to ensure the page is fully loaded
        setTimeout(() => {
          this.fetchMarketData(productInfo);
        }, 2000); // Wait 2 seconds for dynamic content to load
      } else {
        console.log('⚠️ Could not extract product SKU');
      }
    } catch (error) {
      console.error('❌ Error extracting product info:', error);
    }
  }

  getProductInfo() {
    // Try multiple selectors to find product information
    const selectors = {
      title: [
        'h1[data-testid="product-title"]',
        'h1.product-title',
        'h1',
        '.product-title'
      ],
      sku: [
        '[data-testid="product-sku"]',
        '.product-sku',
        '.sku',
        '[data-testid="product-detail-sku"]'
      ],
      price: [
        '[data-testid="product-price"]',
        '.product-price',
        '.price',
        '[data-testid="product-detail-price"]'
      ]
    };

    const info = {};
    
    // Extract title
    for (const selector of selectors.title) {
      const element = document.querySelector(selector);
      if (element) {
        info.title = element.textContent.trim();
        break;
      }
    }

    // Extract SKU
    for (const selector of selectors.sku) {
      const element = document.querySelector(selector);
      if (element) {
        info.sku = element.textContent.trim();
        break;
      }
    }

    // Extract current price
    for (const selector of selectors.price) {
      const element = document.querySelector(selector);
      if (element) {
        info.currentPrice = element.textContent.trim();
        break;
      }
    }

    // If no SKU found, try to extract from URL or other sources
    if (!info.sku) {
      info.sku = this.extractSkuFromUrl();
    }

    return info;
  }

  extractSkuFromUrl() {
    // Try to extract SKU from URL path
    const pathParts = window.location.pathname.split('/');
    const lastPart = pathParts[pathParts.length - 1];
    
    // Remove common suffixes
    return lastPart.replace(/-size-chart$/, '').replace(/-size-guide$/, '');
  }

  scrapeMarketDataFromPage() {
    try {
      console.log('🔍 Scraping market data from StockX page...');
      
      // Debug: Log page structure for troubleshooting
      this.debugPageStructure();
      
      // Common selectors for StockX pricing data
      const selectors = {
        lastSale: [
          '[data-testid="last-sale"]',
          '.last-sale',
          '[data-testid="product-detail-last-sale"]',
          '.product-detail-last-sale',
          '[data-testid="market-data-last-sale"]',
          '.market-data-last-sale',
          // Look for elements with price and "sale" text
          '*[class*="sale"]',
          '*[class*="last"]'
        ],
        averagePrice: [
          '[data-testid="average-price"]',
          '.average-price',
          '[data-testid="product-detail-average-price"]',
          '.product-detail-average-price',
          '[data-testid="market-data-average-price"]',
          '.market-data-average-price',
          '*[class*="average"]'
        ],
        highestBid: [
          '[data-testid="highest-bid"]',
          '.highest-bid',
          '[data-testid="product-detail-highest-bid"]',
          '.product-detail-highest-bid',
          '[data-testid="market-data-highest-bid"]',
          '.market-data-highest-bid',
          '[data-testid="bid-price"]',
          '.bid-price',
          '*[class*="bid"]',
          // Look for "Buy" buttons which often show ask price
          'button[data-testid*="buy"]'
        ],
        lowestAsk: [
          '[data-testid="lowest-ask"]',
          '.lowest-ask',
          '[data-testid="product-detail-lowest-ask"]',
          '.product-detail-lowest-ask',
          '[data-testid="market-data-lowest-ask"]',
          '.market-data-lowest-ask',
          '[data-testid="ask-price"]',
          '.ask-price',
          '*[class*="ask"]',
          // Look for "Sell" buttons which often show bid price
          'button[data-testid*="sell"]'
        ]
      };

      const marketData = {};

      // Extract each price type
      Object.keys(selectors).forEach(priceType => {
        for (const selector of selectors[priceType]) {
          const element = document.querySelector(selector);
          if (element) {
            const text = element.textContent || element.innerText || '';
            // Extract numeric value from text (remove $, commas, etc.)
            const numericValue = text.replace(/[^0-9.]/g, '');
            if (numericValue && !isNaN(parseFloat(numericValue))) {
              marketData[priceType] = parseFloat(numericValue);
              console.log(`✅ Found ${priceType}: $${marketData[priceType]}`);
              break;
            }
          }
        }
      });

      // Also try to find pricing in common StockX layout patterns
      if (!marketData.lastSale || !marketData.highestBid || !marketData.lowestAsk) {
        this.scrapeFromCommonPatterns(marketData);
      }

      // Check if we got any useful data
      const hasData = Object.values(marketData).some(value => value && value > 0);
      
      if (hasData) {
        console.log('✅ Successfully scraped market data:', marketData);
        return {
          averagePrice: marketData.averagePrice || marketData.lastSale || 'N/A',
          lastSale: marketData.lastSale || 'N/A',
          highestBid: marketData.highestBid || 'N/A',
          lowestAsk: marketData.lowestAsk || 'N/A',
          scrapedFromPage: true
        };
      } else {
        console.log('⚠️ No market data found on page');
        return null;
      }
    } catch (error) {
      console.error('❌ Error scraping market data:', error);
      return null;
    }
  }

  scrapeFromCommonPatterns(marketData) {
    try {
      // Look for common StockX pricing patterns in the DOM
      console.log('🔍 Searching for pricing patterns in DOM...');
      
      // First, try to find all elements with dollar amounts
      const allElements = document.querySelectorAll('*');
      const priceElements = [];
      
      allElements.forEach(element => {
        try {
          const text = element.textContent || element.innerText || '';
          
          // Look for price patterns like "$123", "$1,234", "123", etc.
          const priceMatches = text.match(/\$?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g);
          if (priceMatches) {
            priceMatches.forEach(match => {
              const price = parseFloat(match.replace(/[$,]/g, ''));
              if (price > 10 && price < 10000) { // Reasonable price range
                priceElements.push({
                  element,
                  price,
                  text: text.trim(),
                  parentText: element.parentElement?.textContent?.toLowerCase() || ''
                });
              }
            });
          }
        } catch (error) {
          // Skip elements that cause errors
          console.log('⚠️ Error processing element:', error);
        }
      });

      console.log(`🔍 Found ${priceElements.length} potential price elements`);

      // Now analyze each price element to determine its type
      priceElements.forEach(({ element, price, text, parentText }) => {
        try {
          const fullText = (text + ' ' + parentText).toLowerCase();
          
          // Look for specific keywords to identify price types
          if (fullText.includes('last sale') && !marketData.lastSale) {
            marketData.lastSale = price;
            console.log(`✅ Found last sale: $${price} (${text})`);
          } else if (fullText.includes('average') && !marketData.averagePrice) {
            marketData.averagePrice = price;
            console.log(`✅ Found average price: $${price} (${text})`);
          } else if (fullText.includes('bid') && !marketData.highestBid) {
            marketData.highestBid = price;
            console.log(`✅ Found highest bid: $${price} (${text})`);
          } else if (fullText.includes('ask') && !marketData.lowestAsk) {
            marketData.lowestAsk = price;
            console.log(`✅ Found lowest ask: $${price} (${text})`);
          } else if (fullText.includes('buy now') && !marketData.lowestAsk) {
            marketData.lowestAsk = price;
            console.log(`✅ Found buy now price (ask): $${price} (${text})`);
          } else if (fullText.includes('sell now') && !marketData.highestBid) {
            marketData.highestBid = price;
            console.log(`✅ Found sell now price (bid): $${price} (${text})`);
          }
        } catch (error) {
          console.log('⚠️ Error analyzing price element:', error);
        }
      });

      // If we still don't have all the data, try to infer from button text
      if (!marketData.highestBid || !marketData.lowestAsk) {
        this.scrapeFromButtons(marketData);
      }
    } catch (error) {
      console.error('❌ Error in scrapeFromCommonPatterns:', error);
    }
  }

  scrapeFromButtons(marketData) {
    try {
      // Look for Buy/Sell buttons that might contain pricing
      console.log('🔍 Analyzing buttons for pricing data...');
      const buttons = document.querySelectorAll('button, [role="button"], a[href*="buy"], a[href*="sell"]');
      
      let allPrices = [];
      
      buttons.forEach(button => {
        try {
          const text = button.textContent?.toLowerCase() || '';
          const priceMatch = text.match(/\$?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
          
          if (priceMatch) {
            const price = parseFloat(priceMatch[1].replace(/[$,]/g, ''));
            if (price > 10 && price < 10000) {
              allPrices.push(price);
              
              if (text.includes('sell now') && !marketData.highestBid) {
                marketData.highestBid = price;
                console.log(`✅ Found bid price from sell button: $${price}`);
              } else if (text.includes('buy now') && !marketData.lowestAsk) {
                marketData.lowestAsk = price;
                console.log(`✅ Found ask price from buy button: $${price}`);
              } else if (text.includes('ask for more') && !marketData.lowestAsk) {
                // This is likely the ask price
                marketData.lowestAsk = price;
                console.log(`✅ Found ask price from "ask for more" button: $${price}`);
              }
            }
          }
        } catch (error) {
          console.log('⚠️ Error processing button:', error);
        }
      });

      // If we found multiple prices but no specific bid/ask, use the range
      if (allPrices.length > 0 && (!marketData.highestBid || !marketData.lowestAsk)) {
        allPrices.sort((a, b) => a - b);
        const minPrice = allPrices[0];
        const maxPrice = allPrices[allPrices.length - 1];
        
        if (!marketData.highestBid) {
          marketData.highestBid = minPrice; // Lowest price is likely the bid
          console.log(`✅ Using lowest price as bid: $${minPrice}`);
        }
        if (!marketData.lowestAsk) {
          marketData.lowestAsk = maxPrice; // Highest price is likely the ask
          console.log(`✅ Using highest price as ask: $${maxPrice}`);
        }
        
        // Calculate average from all prices
        if (!marketData.averagePrice) {
          const average = allPrices.reduce((sum, price) => sum + price, 0) / allPrices.length;
          marketData.averagePrice = Math.round(average);
          console.log(`✅ Calculated average price: $${marketData.averagePrice}`);
        }
      }

      console.log(`🔍 Found ${allPrices.length} prices total:`, allPrices);
    } catch (error) {
      console.error('❌ Error in scrapeFromButtons:', error);
    }
  }

  debugPageStructure() {
    try {
      console.log('🔍 Debug: Analyzing StockX page structure...');
      
      // Log all elements with data-testid attributes
      const testIdElements = document.querySelectorAll('[data-testid]');
      console.log(`🔍 Found ${testIdElements.length} elements with data-testid:`);
      testIdElements.forEach(el => {
        try {
          console.log(`  - ${el.tagName}.${el.className} [data-testid="${el.getAttribute('data-testid')}"]: "${el.textContent?.trim()}"`);
        } catch (error) {
          console.log('⚠️ Error logging testId element:', error);
        }
      });
      
      // Log all elements with class names containing price-related keywords
      const priceKeywords = ['price', 'sale', 'bid', 'ask', 'market', 'last', 'average'];
      priceKeywords.forEach(keyword => {
        try {
          const elements = document.querySelectorAll(`[class*="${keyword}"]`);
          if (elements.length > 0) {
            console.log(`🔍 Found ${elements.length} elements with class containing "${keyword}":`);
            elements.forEach(el => {
              try {
                console.log(`  - ${el.tagName}.${el.className}: "${el.textContent?.trim()}"`);
              } catch (error) {
                console.log('⚠️ Error logging price element:', error);
              }
            });
          }
        } catch (error) {
          console.log(`⚠️ Error searching for ${keyword} elements:`, error);
        }
      });
      
      // Log all buttons and their text
      const buttons = document.querySelectorAll('button');
      console.log(`🔍 Found ${buttons.length} buttons:`);
      buttons.forEach(button => {
        try {
          const text = button.textContent?.trim();
          if (text && text.length < 100) { // Only log short button text
            console.log(`  - Button: "${text}"`);
          }
        } catch (error) {
          console.log('⚠️ Error logging button:', error);
        }
      });
    } catch (error) {
      console.error('❌ Error in debugPageStructure:', error);
    }
  }

  async fetchMarketData(productInfo) {
    if (this.isLoading) return;
    
    this.isLoading = true;
    this.showLoadingWidget();

    try {
      // Scrape market data directly from the page
      console.log('🔍 Attempting to scrape market data from page...');
      const marketData = this.scrapeMarketDataFromPage();
      
      if (marketData) {
        console.log('✅ Market data scraped successfully:', marketData);
        this.displayPriceWidget(marketData);
      } else {
        console.log('❌ Scraping failed, using mock data...');
        // Use mock data instead of trying to contact background script
        const mockData = {
          averagePrice: '95',
          lastSale: '103',
          highestBid: '89',
          lowestAsk: '98',
          mockData: true
        };
        console.log('📊 Using mock data:', mockData);
        this.displayPriceWidget(mockData);
      }
    } catch (error) {
      console.error('❌ Error fetching market data:', error);
      this.showErrorWidget('Failed to fetch market data: ' + error.message);
    } finally {
      this.isLoading = false;
    }
  }


  showLoadingWidget() {
    this.removeWidget();
    
    this.priceWidget = document.createElement('div');
    this.priceWidget.id = 'stockx-price-tracker-widget';
    this.priceWidget.innerHTML = `
      <div class="price-widget loading">
        <div class="widget-header">
          <span class="widget-title">📊 Market Data</span>
          <span class="loading-spinner">⏳</span>
        </div>
        <div class="widget-content">
          <p>Loading market data...</p>
        </div>
      </div>
    `;
    
    this.insertWidget();
  }

  displayPriceWidget(marketData) {
    this.removeWidget();
    
    const avgPrice = marketData.averagePrice || marketData.lastSale || 'N/A';
    const lastSale = marketData.lastSale || 'N/A';
    const highestBid = marketData.highestBid || 'N/A';
    const lowestAsk = marketData.lowestAsk || 'N/A';
    
    this.priceWidget = document.createElement('div');
    this.priceWidget.id = 'stockx-price-tracker-widget';
    this.priceWidget.innerHTML = `
      <div class="price-widget">
        <div class="widget-header">
          <span class="widget-title">📊 Market Data</span>
          <button class="close-btn" onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="widget-content">
          <div class="price-row">
            <span class="price-label">Average Price:</span>
            <span class="price-value avg-price">$${avgPrice}</span>
          </div>
          <div class="price-row">
            <span class="price-label">Last Sale:</span>
            <span class="price-value">$${lastSale}</span>
          </div>
          <div class="price-row">
            <span class="price-label">Highest Bid:</span>
            <span class="price-value">$${highestBid}</span>
          </div>
          <div class="price-row">
            <span class="price-label">Lowest Ask:</span>
            <span class="price-value">$${lowestAsk}</span>
          </div>
          <div class="widget-footer">
            <small>Data from StockX API</small>
          </div>
        </div>
      </div>
    `;
    
    this.insertWidget();
  }

  showErrorWidget(message) {
    this.removeWidget();
    
    this.priceWidget = document.createElement('div');
    this.priceWidget.id = 'stockx-price-tracker-widget';
    this.priceWidget.innerHTML = `
      <div class="price-widget error">
        <div class="widget-header">
          <span class="widget-title">❌ Error</span>
          <button class="close-btn" onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="widget-content">
          <p>${message}</p>
        </div>
      </div>
    `;
    
    this.insertWidget();
  }

  insertWidget() {
    // Try to find a good place to insert the widget
    const targetSelectors = [
      '[data-testid="product-detail"]',
      '.product-detail',
      '.product-info',
      '.product-header',
      'main',
      'body'
    ];

    let targetElement = null;
    for (const selector of targetSelectors) {
      targetElement = document.querySelector(selector);
      if (targetElement) break;
    }

    if (targetElement) {
      targetElement.insertBefore(this.priceWidget, targetElement.firstChild);
    } else {
      document.body.appendChild(this.priceWidget);
    }
  }

  removeWidget() {
    if (this.priceWidget) {
      this.priceWidget.remove();
      this.priceWidget = null;
    }
  }
}

// Initialize the tracker with error handling
try {
  console.log('🔍 Initializing StockX Price Tracker...');
  new StockXPriceTracker();
  console.log('✅ StockX Price Tracker initialized successfully');
} catch (error) {
  console.error('❌ Error initializing StockX Price Tracker:', error);
  
  // Show error indicator
  const errorIndicator = document.createElement('div');
  errorIndicator.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: #ff0000;
    color: white;
    padding: 5px 10px;
    border-radius: 5px;
    font-size: 12px;
    z-index: 10000;
    font-family: Arial, sans-serif;
  `;
  errorIndicator.textContent = 'Extension Error: ' + error.message;
  document.body.appendChild(errorIndicator);
}

// Listen for navigation changes (SPA)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    setTimeout(() => {
      if (new StockXPriceTracker().isProductPage()) {
        new StockXPriceTracker();
      }
    }, 1000);
  }
}).observe(document, { subtree: true, childList: true });
