// Popup script for StockX Price Tracker
document.addEventListener('DOMContentLoaded', function() {
  const statusText = document.getElementById('statusText');
  const refreshBtn = document.getElementById('refreshBtn');
  const dashboardBtn = document.getElementById('dashboardBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const helpBtn = document.getElementById('helpBtn');

  // Check if we're on a StockX product page
  checkCurrentPageStatus();

  refreshBtn.addEventListener('click', function() {
    refreshCurrentPage();
  });
  refreshBtn.addEventListener('pointerup', function() {
    refreshCurrentPage();
  });

  dashboardBtn.addEventListener('click', function() {
    openDashboard();
  });
  dashboardBtn.addEventListener('pointerup', function() {
    openDashboard();
  });

  settingsBtn.addEventListener('click', function() {
    openSettings();
  });
  settingsBtn.addEventListener('pointerup', function() {
    openSettings();
  });

  helpBtn.addEventListener('click', function() {
    openHelp();
  });
  helpBtn.addEventListener('pointerup', function() {
    openHelp();
  });

  function checkCurrentPageStatus() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const currentTab = tabs[0];
      const url = String(currentTab?.url || '');

      // Hard guarantee: do not show the popup on the StockX homepage.
      // (Even if background popup overrides haven't fired yet.)
      try {
        const u = new URL(url);
        const host = String(u.hostname || '').toLowerCase();
        const isStockx = host === 'stockx.com' || host.endsWith('.stockx.com');
        const isHomepage = (u.pathname || '/') === '/' || (u.pathname || '') === '';
        if (isStockx && isHomepage) {
          // Some Chrome builds can ignore an immediate close; do a microtask+timeout.
          Promise.resolve().then(() => {
            try { window.close(); } catch {}
            setTimeout(() => {
              try { window.close(); } catch {}
            }, 25);
          });
          return;
        }
      } catch {}
      
      if (url.includes('stockx.com')) {
        if (isProductPage(url)) {
          statusText.textContent = '✅ On StockX product page - Extension active';
          statusText.style.color = '#059669';
          refreshBtn.disabled = false;
        } else {
          statusText.textContent = '📍 On StockX but not a product page';
          statusText.style.color = '#d97706';
          refreshBtn.disabled = false;
        }
      } else {
        statusText.textContent = '❌ Not on StockX.com';
        statusText.style.color = '#dc2626';
        refreshBtn.disabled = true;
      }
    });
  }

  function isProductPage(url) {
    const isStockX = url.includes('stockx.com');
    const isNotSearchPage = !url.includes('/search') && !url.includes('/sell') && !url.includes('/buy');
    
    // Simplified check for popup: just ensure it's StockX and not a known non-product page
    return isStockX && isNotSearchPage;
  }

  function refreshCurrentPage() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.reload(tabs[0].id);
      window.close();
    });
  }

  function openSettings() {
    chrome.tabs.create({
      url: chrome.runtime.getURL('settings.html')
    });
  }

  function openDashboard() {
    chrome.tabs.create({
      url: chrome.runtime.getURL('dashboard.html')
    });
  }

  function openHelp() {
    chrome.tabs.create({
      url: 'https://github.com/your-repo/stockx-price-tracker'
    });
  }
});
