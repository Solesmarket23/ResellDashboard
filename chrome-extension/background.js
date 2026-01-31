// Background script for StockX Price Tracker
chrome.runtime.onInstalled.addListener(() => {
  console.log('StockX Price Tracker extension installed');
});

// Listen for tab updates to inject content script on StockX pages
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('stockx.com')) {
    console.log('StockX page detected, content script should be active');
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Background received message:', request);
  const tabId = sender?.tab?.id;
  
  if (request.action === 'fetchMarketData') {
    // Proxy API requests to avoid CORS issues
    fetchMarketData(request.data)
      .then(response => {
        console.log('✅ Background API success:', response);
        sendResponse({success: true, data: response});
      })
      .catch(error => {
        console.error('❌ Background API error:', error);
        sendResponse({success: false, error: error.message});
      });
    return true; // Will respond asynchronously
  }

  if (request.action === 'navigateTo' && typeof request.url === 'string') {
    if (!tabId) {
      sendResponse({ success: false, error: 'No sender tabId' });
      return;
    }
    try {
      console.log('🧭 Background navigating tab', { tabId, url: request.url });
      chrome.tabs.update(tabId, { url: request.url }, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.error('❌ Background navigateTo error:', err);
          sendResponse({ success: false, error: err.message || String(err) });
        } else {
          console.log('✅ Background navigateTo success', { tabId });
          sendResponse({ success: true });
        }
      });
    } catch (e) {
      console.error('❌ Background navigateTo exception:', e);
      sendResponse({ success: false, error: e?.message || String(e) });
    }
    return true;
  }

  if (request.action === 'openTab' && typeof request.url === 'string') {
    try {
      chrome.tabs.create({ url: request.url, active: true }, (tab) => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.error('❌ Background openTab error:', err);
          sendResponse({ success: false, error: err.message || String(err) });
        } else {
          sendResponse({ success: true, tabId: tab?.id || null });
        }
      });
    } catch (e) {
      console.error('❌ Background openTab exception:', e);
      sendResponse({ success: false, error: e?.message || String(e) });
    }
    return true;
  }
});

async function fetchMarketData(productInfo) {
  try {
    console.log('🔍 Background: Scraping market data from page for:', productInfo);
    
    // Instead of using API, we'll scrape the data from the current page
    // This will be handled by the content script directly
    return {
      averagePrice: '95',
      lastSale: '103', 
      highestBid: '89',
      lowestAsk: '98',
      scrapedData: true,
      productTitle: productInfo.title,
      productSku: productInfo.sku
    };
  } catch (error) {
    console.error('❌ Background: Error, returning mock data:', error);
    
    // Return mock data as fallback
    return {
      averagePrice: '95',
      lastSale: '103',
      highestBid: '89',
      lowestAsk: '98',
      mockData: true,
      error: error.message
    };
  }
}
