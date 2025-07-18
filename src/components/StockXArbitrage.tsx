'use client';

import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, ExternalLink, Search, AlertCircle, BarChart3, LogIn, CheckCircle, Bell, Twitter, Upload, Image } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { shareToTwitter, generateShareImage, ArbitrageShareData } from '@/lib/twitter/twitterExport';
import { generateEnhancedShareImage, EnhancedArbitrageShareData } from '@/lib/twitter/enhancedGraphics';
import { useSovrn } from '@/lib/hooks/useSovrn';
import SovrnDebug from './SovrnDebug';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useSiteAuth } from '@/lib/hooks/useSiteAuth';

// Enhanced placeholder component for StockX products since images aren't publicly accessible
interface FallbackImageProps {
  imageUrls: string[];
  alt: string;
  className: string;
  productTitle?: string;
  brand?: string;
}

const FallbackImage: React.FC<FallbackImageProps> = ({ imageUrls, alt, className, productTitle, brand }) => {
  // Since StockX images aren't publicly accessible, create an informative placeholder
  const getBrandInitial = (brandName?: string) => {
    if (!brandName) return '?';
    return brandName.charAt(0).toUpperCase();
  };

  const getBrandColor = (brandName?: string) => {
    if (!brandName) return 'bg-gray-600';
    const colors = [
      'bg-blue-600', 'bg-green-600', 'bg-purple-600', 'bg-red-600', 
      'bg-yellow-600', 'bg-indigo-600', 'bg-pink-600', 'bg-teal-600'
    ];
    let hash = 0;
    for (let i = 0; i < brandName.length; i++) {
      hash = brandName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className={`${className} ${getBrandColor(brand)} flex items-center justify-center rounded-lg`}>
      <div className="text-center">
        <div className="text-white font-bold text-lg">
          {getBrandInitial(brand)}
        </div>
        <div className="text-white text-xs opacity-75">
          StockX
        </div>
      </div>
    </div>
  );
};

// Removed HistoricalSales interface - this data is not available from StockX API

interface ArbitrageOpportunity {
  id: string;
  productName: string;
  size: string;
  imageUrl: string;
  costPrice: number;
  sellingPrice: number;
  totalCost: number; // Including fees
  profit: number;
  profitMargin: number;
  sku: string;
  productId: string;
  variantId: string;
  bidAmount?: number;
  askAmount?: number;
  stockxUrl?: string; // Add the stockxUrl field
  flexAskAmount?: number; // Add flex ask amount
}

const StockXArbitrage: React.FC = () => {
  const { currentTheme } = useTheme();
  const isNeon = currentTheme.name === 'neon';
  const { convertStockXLink, isInitialized } = useSovrn();
  const auth = useAuth();
  const siteAuth = useSiteAuth(); // Use site auth for password-protected users
  
  // Debug Sovrn initialization
  useEffect(() => {
    console.log('🔍 StockXArbitrage - Sovrn status:', {
      isInitialized,
      convertStockXLink: typeof convertStockXLink,
      timestamp: new Date().toISOString()
    });
  }, [isInitialized, convertStockXLink]);
  
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [minSpreadPercentage, setMinSpreadPercentage] = useState(10);
  const [excludedBrands, setExcludedBrands] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [trackingMessage, setTrackingMessage] = useState<string | null>(null); // Separate message for tracking confirmations
  const [clickedButtons, setClickedButtons] = useState<Set<string>>(new Set()); // Track which buttons were clicked
  const [monitoredProducts, setMonitoredProducts] = useState<Set<string>>(new Set()); // Track monitored products
  const [showMonitorSettings, setShowMonitorSettings] = useState<{ [key: string]: boolean }>({});
  const [monitorSettings, setMonitorSettings] = useState<{ [key: string]: { priceDropThreshold: number } }>({});
  const [hasSearched, setHasSearched] = useState(false); // Track if user has performed a search attempt
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<{ [key: string]: string }>({});
  const [affiliateLinks, setAffiliateLinks] = useState<{ [key: string]: string }>({});
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showFlexAsk, setShowFlexAsk] = useState(true); // Toggle for flex ask display - enabled by default

  // Check authentication status on component mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/stockx/test');
        const data = await response.json();
        setIsAuthenticated(response.ok && data.accessTokenPresent);
      } catch (error) {
        console.error('Auth check failed:', error);
        setIsAuthenticated(false);
      }
    };
    
    checkAuth();
  }, []);

  // Load existing monitored products from localStorage
  useEffect(() => {
    const loadMonitoredProducts = () => {
      try {
        const existingItems = localStorage.getItem('stockx_monitored_products');
        if (existingItems) {
          const monitoredItems = JSON.parse(existingItems);
          const monitoredIds = new Set<string>();
          
          // Extract the monitor button IDs from stored products
          monitoredItems.forEach((item: any) => {
            if (item.productId && item.variantId) {
              const buttonId = `monitor-${item.productId}-${item.variantId}`;
              monitoredIds.add(buttonId);
            }
          });
          
          setMonitoredProducts(monitoredIds);
          console.log('📊 Loaded monitored products:', monitoredIds.size, 'items');
        }
      } catch (error) {
        console.error('Failed to load monitored products:', error);
      }
    };
    
    loadMonitoredProducts();
  }, []);

  // Check for success message on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('success') === 'true') {
      setSuccessMessage('Successfully authenticated with StockX! You can now search for arbitrage opportunities.');
      // Clear the URL parameters
      const url = new URL(window.location.href);
      url.searchParams.delete('success');
      url.searchParams.delete('note');
      window.history.replaceState({}, '', url.toString());
      
      // Auto-dismiss the success message after 5 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
    }
    
    // Check for disconnect success message
    if (urlParams.get('disconnected') === 'true') {
      setSuccessMessage('StockX tokens cleared successfully! You can now re-authenticate.');
      // Clear the URL parameters
      const url = new URL(window.location.href);
      url.searchParams.delete('disconnected');
      window.history.replaceState({}, '', url.toString());
      
      // Auto-dismiss the success message after 5 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
    }
    
    // Check for manual token clear success message
    if (urlParams.get('tokens_cleared') === 'true') {
      setSuccessMessage('All StockX tokens have been cleared! Please click "Login to StockX" to authenticate with fresh tokens.');
      // Clear the URL parameters
      const url = new URL(window.location.href);
      url.searchParams.delete('tokens_cleared');
      window.history.replaceState({}, '', url.toString());
      
      // Auto-dismiss the success message after 7 seconds (longer for more detailed message)
      setTimeout(() => {
        setSuccessMessage(null);
      }, 7000);
    }
    
    // Check for authentication error from callback
    const error = urlParams.get('error');
    const needReauth = urlParams.get('need_reauth') === 'true';
    
    if (error === 'invalid_tokens' && needReauth) {
      setErrorMessage('Your StockX authentication has expired. Please login again to continue.');
      setIsAuthError(true);
      // Clear the URL parameters
      const url = new URL(window.location.href);
      url.searchParams.delete('error');
      url.searchParams.delete('need_reauth');
      window.history.replaceState({}, '', url.toString());
    } else if (error === 'no_tokens' && needReauth) {
      setErrorMessage('You need to authenticate with StockX first to use this feature.');
      setIsAuthError(true);
      // Clear the URL parameters
      const url = new URL(window.location.href);
      url.searchParams.delete('error');
      url.searchParams.delete('need_reauth');
      window.history.replaceState({}, '', url.toString());
    } else if (error === 'state_mismatch') {
      setErrorMessage('Authentication security check failed. Please try logging in again.');
      setIsAuthError(true);
      // Clear the URL parameters
      const url = new URL(window.location.href);
      url.searchParams.delete('error');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  // Helper function to generate StockX URL
  const generateStockXUrl = (productName: string, variantId: string) => {
    const slug = productName.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
    return `https://stockx.com/${slug}`;
  };

  const handleStockXLogin = () => {
    // Store the current page URL to redirect back after authentication
    const currentUrl = window.location.href;
    const authUrl = `/api/stockx/auth?returnTo=${encodeURIComponent(currentUrl)}`;
    window.location.href = authUrl;
  };

  const handleClearTokens = () => {
    // Clear all StockX tokens and force re-authentication
    const currentUrl = window.location.href;
    const disconnectUrl = `/api/stockx/disconnect?returnTo=${encodeURIComponent(currentUrl)}`;
    window.location.href = disconnectUrl;
  };

  const searchArbitrageOpportunities = async (loadMore = false) => {
    if (!searchQuery.trim()) {
      setErrorMessage('Please enter a search query');
      setIsAuthError(false);
      return;
    }

    if (loadMore) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
      setErrorMessage(null);
      setIsAuthError(false);
      setSuccessMessage(null);
      setOpportunities([]); // Clear previous results
      setCurrentPage(1);
      setHasMore(false);
    }
    setHasSearched(true);

    try {
      const pageToLoad = loadMore ? currentPage + 1 : 1;
      
      // Build query parameters for streaming
      const params = new URLSearchParams({
        query: searchQuery,
        limit: '50',
        arbitrageMode: 'true',
        minSpreadPercent: minSpreadPercentage.toString(),
        streaming: 'true', // Enable streaming
        page: pageToLoad.toString()
      });

      // Add excluded brands if specified
      if (excludedBrands.trim()) {
        params.set('excludeBrands', excludedBrands.trim());
      }

      // Use EventSource for streaming results
      const eventSource = new EventSource(`/api/stockx/search?${params.toString()}`);
      
      let currentOpportunities: ArbitrageOpportunity[] = loadMore ? [...opportunities] : [];
      let statusMessage = loadMore ? 'Loading more results...' : 'Searching...';
      let progressMessage = '';

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case 'status':
              statusMessage = data.message;
              setSuccessMessage(`📡 ${statusMessage}`);
              break;
              
            case 'progress':
              progressMessage = `Processing ${data.current}/${data.total} products`;
              setSuccessMessage(`🔍 ${progressMessage}... Found ${currentOpportunities.length} opportunities`);
              break;
              
            case 'result':
              // Add new result to the list
              const newOpportunity: ArbitrageOpportunity = {
                id: `${data.data.productId}-${data.data.variantId}`,
                productName: data.data.title || '',
                size: data.data.size || '',
                imageUrl: data.data.imageUrl || '',
                costPrice: data.data.rawBid || 0,
                sellingPrice: data.data.lowestAsk || 0,
                totalCost: data.data.estimatedTotalBuyerCost || 0,
                profit: data.data.spread || 0,
                profitMargin: data.data.spreadPercent || 0,
                sku: data.data.productId || '',
                productId: data.data.productId || '',
                variantId: data.data.variantId || '',
                bidAmount: data.data.highestBid,
                askAmount: data.data.lowestAsk,
                stockxUrl: data.data.stockxUrl || '',
                flexAskAmount: data.data.flexLowestAskAmount
              };
              
              currentOpportunities.push(newOpportunity);
              setOpportunities([...currentOpportunities]);
              setSuccessMessage(`🔍 Searching... Found ${currentOpportunities.length} opportunities so far`);
              break;
              
            case 'complete':
              setSuccessMessage(`✅ Search complete! Found ${data.totalResults} arbitrage opportunities.`);
              setIsLoading(false);
              setIsLoadingMore(false);
              setCurrentPage(data.page);
              setHasMore(data.hasMore || false);
              eventSource.close();
              break;
              
            case 'error':
              setErrorMessage(data.message);
              setIsAuthError(data.statusCode === 401 || data.message.includes('authenticate') || data.message.includes('401'));
              setIsLoading(false);
              setIsLoadingMore(false);
              setHasSearched(true);
              eventSource.close();
              break;
          }
        } catch (error) {
          console.error('Error parsing streaming data:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        setErrorMessage('Connection error while searching - You may need to authenticate with StockX first');
        setIsAuthError(true); // Set this to true to show auth buttons
        setIsLoading(false);
        setIsLoadingMore(false);
        setHasSearched(true);
        eventSource.close();
      };

      // Cleanup function
      const cleanup = () => {
        eventSource.close();
        setIsLoading(false);
        setIsLoadingMore(false);
      };

      // Set a timeout to prevent indefinite loading
      setTimeout(() => {
        if (eventSource.readyState !== EventSource.CLOSED) {
          cleanup();
          setErrorMessage('Search timeout. Please try again.');
          setHasSearched(true);
        }
      }, 60000); // 60 second timeout

    } catch (error) {
      console.error('Search error:', error);
      setErrorMessage('An error occurred while searching for opportunities');
      setIsLoading(false);
      setIsLoadingMore(false);
      setHasSearched(true);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      searchArbitrageOpportunities();
    }
  };

  // Handle image upload for a specific product
  const handleImageUpload = (productId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    // Create object URL for the uploaded image
    const imageUrl = URL.createObjectURL(file);
    
    // Store the image URL for this product
    setUploadedImages(prev => ({
      ...prev,
      [productId]: imageUrl
    }));
  };

  const handleTwitterExport = async (opportunity: ArbitrageOpportunity) => {
    // Generate affiliate URL for this product
    const stockxUrl = opportunity.stockxUrl || generateStockXUrl(opportunity.productName, opportunity.variantId);
    const affiliateUrl = convertStockXLink(stockxUrl, {
      productName: opportunity.productName,
      productId: opportunity.productId,
      size: opportunity.size
    });
    
    // Store the affiliate URL for this opportunity so View on StockX button can use it
    const opportunityKey = `${opportunity.productId}-${opportunity.variantId}`;
    setAffiliateLinks(prev => ({
      ...prev,
      [opportunityKey]: affiliateUrl
    }));
    
    // Create a short URL to hide the API key
    let shortUrl = '';
    try {
      // Use site auth if available (password-protected users), otherwise use Firebase auth
      const user = siteAuth.user || auth.user;
      console.log('Auth state:', { isAuthenticated: !!user, userId: user?.uid, source: siteAuth.user ? 'site' : 'firebase' });
      
      // Use the API route which handles Firebase server-side
      const response = await fetch('/api/shorten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: affiliateUrl,
          userId: user?.uid 
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        shortUrl = data.shortUrl;
        console.log('Short URL created via API:', shortUrl);
      } else {
        console.error('API error:', response.status, await response.text());
        // Fallback to affiliate URL
        shortUrl = affiliateUrl;
      }
    } catch (error) {
      console.error('Error creating short URL:', error);
      // Fallback to affiliate URL  
      shortUrl = affiliateUrl;
    }
    
    console.log('Final URLs:', { affiliateUrl, shortUrl });
    
    // Use enhanced graphics for better visual impact
    const enhancedShareData: EnhancedArbitrageShareData = {
      productName: opportunity.productName,
      size: opportunity.size,
      purchasePrice: opportunity.costPrice || 0,
      salePrice: opportunity.askAmount || 0,
      profit: opportunity.profit || 0,
      profitMargin: opportunity.profitMargin || 0,
      imageUrl: uploadedImages[opportunity.productId] || opportunity.imageUrl, // Use uploaded image if available
      affiliateUrl,
      shortUrl: shortUrl || undefined,
      backgroundVersion: 'dark', // Premium dark background
      platform: 'stockx',
      flipTime: '3-5 days'
    };
    
    // Generate the enhanced share image
    const shareImageUrl = await generateEnhancedShareImage(enhancedShareData);
    
    // For Twitter, we still use the text-based share
    const shareData: ArbitrageShareData = {
      productName: opportunity.productName,
      size: opportunity.size,
      purchasePrice: opportunity.costPrice || 0,
      salePrice: opportunity.askAmount || 0,
      profit: opportunity.profit || 0,
      profitMargin: opportunity.profitMargin || 0,
      imageUrl: shareImageUrl, // Use the generated image
      affiliateUrl,
      shortUrl: shortUrl || undefined,
      backgroundVersion: 'bright'
    };
    
    // Download the enhanced graphic
    if (shareImageUrl) {
      // Create a temporary link to download the enhanced image
      const link = document.createElement('a');
      link.href = shareImageUrl;
      link.download = `stockx-arbitrage-enhanced-${opportunity.productName.replace(/\s+/g, '-')}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the blob URL
      setTimeout(() => URL.revokeObjectURL(shareImageUrl), 1000);
    }
    
    // Open Twitter with pre-filled text
    shareToTwitter(shareData);
  };

  const addToPriceMonitor = async (opportunity: ArbitrageOpportunity, threshold: number = 30) => {
    console.log('📊 Adding to price monitor:', opportunity.productName, 'with', threshold + '% threshold');
    
    const buttonId = `monitor-${opportunity.productId}-${opportunity.variantId}`;
    setClickedButtons(prev => new Set(prev).add(buttonId));
    
    // Get existing monitored products from localStorage
    const existingItems = localStorage.getItem('stockx_monitored_products');
    const monitoredItems = existingItems ? JSON.parse(existingItems) : [];
    
    // Check if already monitored
    const isAlreadyMonitored = monitoredItems.some((item: any) => 
      item.productId === opportunity.productId && item.variantId === opportunity.variantId
    );
    
    if (isAlreadyMonitored) {
      setTrackingMessage('⚠️ This product is already being monitored for price drops');
      setTimeout(() => {
        setTrackingMessage(null);
        setClickedButtons(prev => {
          const newSet = new Set(prev);
          newSet.delete(buttonId);
          return newSet;
        });
      }, 4000);
      return;
    }
    
    // Create new monitored product
    const newMonitoredProduct = {
      id: `${opportunity.productId}-${opportunity.variantId}`,
      productId: opportunity.productId,
      variantId: opportunity.variantId,
      title: opportunity.productName,
      brand: opportunity.productName.split(' ')[0], // Simple brand extraction
      size: opportunity.size,
      currentAsk: opportunity.askAmount || 0,
      currentBid: opportunity.bidAmount || 0,
      currentFlexAsk: opportunity.flexAskAmount,
      targetAskPrice: Math.floor((opportunity.askAmount || 0) * (1 - threshold / 100)), // Target price based on threshold
      targetFlexAskPrice: opportunity.flexAskAmount ? Math.floor(opportunity.flexAskAmount * (1 - threshold / 100)) : undefined,
      priceDropThreshold: threshold,
      flexPriceDropThreshold: threshold,
      priceHistory: [{
        timestamp: Date.now(),
        highestBid: opportunity.bidAmount || 0,
        lowestAsk: opportunity.askAmount || 0,
        flexLowestAsk: opportunity.flexAskAmount
      }],
      lastChecked: Date.now(),
      alerts: []
    };
    
    // Add to monitored products
    monitoredItems.push(newMonitoredProduct);
    localStorage.setItem('stockx_monitored_products', JSON.stringify(monitoredItems));
    
    // Update state
    setMonitoredProducts(new Set([...monitoredProducts, buttonId]));
    
    // Start monitoring if not already active
    const isMonitoringActive = localStorage.getItem('stockx_monitoring_active') === 'true';
    if (!isMonitoringActive) {
      localStorage.setItem('stockx_monitoring_active', 'true');
    }
    
    setTrackingMessage(`✅ Now monitoring ${opportunity.productName} for ${threshold}% price drops`);
    setTimeout(() => {
      setTrackingMessage(null);
    }, 5000);
  };

  const addToFlexAskMonitor = (opportunity: ArbitrageOpportunity) => {
    console.log('🔔 Track Flex Ask button clicked!');
    console.log('🔔 Adding to Flex Ask Monitor:', opportunity.productName, opportunity.size, 'Flex Ask:', opportunity.flexAskAmount);
    
    // Add visual feedback for button click
    const buttonId = `${opportunity.productId}-${opportunity.variantId}`;
    setClickedButtons(prev => new Set([...prev, buttonId]));
    
    const flexAskItem = {
      productId: opportunity.productId,
      variantId: opportunity.variantId,
      productName: opportunity.productName,
      size: opportunity.size,
      imageUrl: opportunity.imageUrl,
      flexAskAmount: opportunity.flexAskAmount,
      stockxUrl: opportunity.stockxUrl,
      title: opportunity.productName
    };

    console.log('🔔 Item to track:', flexAskItem);

    // Get existing tracked items
    const existingItems = localStorage.getItem('flexAskTrackedItems');
    console.log('🔔 Existing localStorage data:', existingItems);
    const trackedItems = existingItems ? JSON.parse(existingItems) : [];
    console.log('🔔 Parsed existing items:', trackedItems);
    
    // Check if item is already being tracked
    const isAlreadyTracked = trackedItems.some((item: any) => 
      item.productId === opportunity.productId && item.variantId === opportunity.variantId
    );
    
    if (isAlreadyTracked) {
      console.log('⚠️ Item already tracked, showing warning message');
      setTrackingMessage('⚠️ This item is already being tracked in your Flex Ask Monitor');
      setTimeout(() => {
        setTrackingMessage(null);
        // Reset button state
        setClickedButtons(prev => {
          const newSet = new Set(prev);
          newSet.delete(buttonId);
          return newSet;
        });
      }, 4000);
      return;
    }

    // Add to tracked items
    const flexAskValue = Number(opportunity.flexAskAmount) || 0;
    const newItem = {
      id: `tracked-${Date.now()}-${opportunity.productId}-${opportunity.variantId}`,
      productId: opportunity.productId,
      variantId: opportunity.variantId,
      productName: opportunity.productName,
      size: opportunity.size,
      imageUrl: opportunity.imageUrl,
      currentFlexAsk: flexAskValue,
      baselineFlexAsk: flexAskValue,
      lastChecked: new Date().toISOString(),
      alertThreshold: 20, // Default 20% threshold
      isActive: true,
      priceHistory: [{
        price: flexAskValue,
        timestamp: new Date().toISOString()
      }],
      stockxUrl: opportunity.stockxUrl
    };

    console.log('🔔 New item to add:', newItem);

    trackedItems.push(newItem);
    console.log('🔔 Updated trackedItems array:', trackedItems);
    
    try {
      localStorage.setItem('flexAskTrackedItems', JSON.stringify(trackedItems));
      console.log('✅ Successfully saved to localStorage');
      
      // Verify the save
      const verifyData = localStorage.getItem('flexAskTrackedItems');
      console.log('🔍 Verification: localStorage now contains:', verifyData);
      
      // Dispatch custom event to notify Flex Ask Monitor
      console.log('📡 Dispatching custom event: flexAskItemAdded');
      const customEvent = new CustomEvent('flexAskItemAdded', { 
        detail: { item: newItem, count: trackedItems.length } 
      });
      window.dispatchEvent(customEvent);
      console.log('✅ Custom event dispatched successfully');
      
      // Also dispatch storage event manually for cross-tab sync
      console.log('📡 Dispatching storage event manually');
      const storageEvent = new StorageEvent('storage', {
        key: 'flexAskTrackedItems',
        newValue: JSON.stringify(trackedItems),
        oldValue: existingItems,
        storageArea: localStorage
      });
      window.dispatchEvent(storageEvent);
      console.log('✅ Storage event dispatched successfully');
      
    } catch (error) {
      console.error('❌ Error saving to localStorage:', error);
      setTrackingMessage('❌ Error saving item to tracking list');
      setTimeout(() => setTrackingMessage(null), 4000);
      return;
    }
    
    setTrackingMessage(`✅ Added ${opportunity.productName} (${opportunity.size}) to Flex Ask Monitor! Go to StockX > Flex Ask Monitor to configure alerts.`);
    console.log('✅ Success message set');
    
    setTimeout(() => {
      setTrackingMessage(null);
      // Reset button state
      setClickedButtons(prev => {
        const newSet = new Set(prev);
        newSet.delete(buttonId);
        return newSet;
      });
    }, 7000);
  };

  return (
    <div className="p-4 sm:p-6 bg-gray-900 text-white min-h-screen">
      {/* Temporary debug component */}
      {process.env.NODE_ENV === 'development' && <SovrnDebug />}
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400" />
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
              StockX Arbitrage Finder
            </h1>
          </div>
          <p className="text-gray-400 text-lg">
            Find profitable arbitrage opportunities by analyzing bid-ask spreads for specific sizes within StockX
          </p>
          <div className="mt-4 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-blue-300 font-medium">How it works:</p>
                <p className="text-blue-200 text-sm mt-1">
                  This tool analyzes each size variant individually to find specific arbitrage opportunities. Search by trending brand names (e.g., "Fear of God Essentials") or paste StockX category URLs with "sort=most-active" (e.g., "https://stockx.com/category/apparel?sort=most-active") to discover trending products similar to what you see on the actual StockX website. Each result shows a specific product and size where you could potentially place a bid at the highest bid price and then sell at the lowest ask price for a profit.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="space-y-4 mb-6 sm:mb-8">
          {/* Primary Search Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Search Products or StockX URL
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="e.g., Jordan 1, Nike, or https://stockx.com/category/apparel"
              />
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-400">
                <span>💡 Try:</span>
                <button
                  type="button"
                  onClick={() => setSearchQuery('https://stockx.com/category/apparel?sort=most-active')}
                  className="text-cyan-400 hover:text-cyan-300 underline"
                >
                  Trending Apparel
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => setSearchQuery('https://stockx.com/category/sneakers?sort=most-active')}
                  className="text-cyan-400 hover:text-cyan-300 underline"
                >
                  Trending Sneakers
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => setSearchQuery('Fear of God Essentials')}
                  className="text-cyan-400 hover:text-cyan-300 underline"
                >
                  Fear of God
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Minimum Spread (%)
              </label>
              <input
                type="number"
                value={minSpreadPercentage}
                onChange={(e) => setMinSpreadPercentage(Number(e.target.value))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="10"
                min="0"
                max="100"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={searchArbitrageOpportunities}
                disabled={isLoading || !searchQuery.trim()}
                className="w-full bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Search className="w-4 h-4" />
                {isLoading ? 'Searching...' : 'Find Opportunities'}
              </button>
            </div>
          </div>

          {/* Secondary Filters Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Exclude Brands (optional)
              </label>
              <input
                type="text"
                value={excludedBrands}
                onChange={(e) => setExcludedBrands(e.target.value)}
                onKeyPress={handleKeyPress}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="e.g., Nike, Adidas, Jordan (comma-separated)"
              />
              <div className="mt-1 text-xs text-gray-400">
                <span>💡 Example exclusions:</span>
                <button
                  type="button"
                  onClick={() => setExcludedBrands('Nike, Jordan, Adidas')}
                  className="ml-1 text-red-400 hover:text-red-300 underline"
                >
                  Major Sports Brands
                </button>
                <span className="mx-1">•</span>
                <button
                  type="button"
                  onClick={() => setExcludedBrands('Supreme, Off-White, Yeezy')}
                  className="text-red-400 hover:text-red-300 underline"
                >
                  Hype Brands
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Display Options
              </label>
              <div className="flex items-center justify-between p-3 bg-gray-800 border border-gray-700 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-300">Show Flex Ask Prices</span>
                  <div className="text-xs text-gray-400">(when available)</div>
                </div>
                <button
                  onClick={() => setShowFlexAsk(!showFlexAsk)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    showFlexAsk 
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500' 
                      : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                      showFlexAsk ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              <div className="mt-1 text-xs text-gray-400">
                Flex asks are faster-selling prices that may include additional fees. When enabled, "Track Flex Ask" buttons will appear on items with flex pricing.
              </div>
            </div>
            <div className="flex items-end">
              <div className="text-sm text-gray-400">
                <p className="mb-1">📊 Features:</p>
                <ul className="text-xs space-y-0.5">
                  <li>• Brand filtering for focused results</li>
                  <li>• Flex ask prices for faster sales</li>
                  <li>• Real-time profit calculations</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="bg-green-900/20 border border-green-500 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <p className="text-green-400">{successMessage}</p>
            </div>
          </div>
        )}

        {/* Price Drop Alerts */}
        {(() => {
          // Check for price drop alerts in localStorage
          const savedProducts = localStorage.getItem('stockx_monitored_products');
          if (savedProducts) {
            const products = JSON.parse(savedProducts);
            const recentAlerts = products
              .flatMap((p: any) => p.alerts || [])
              .filter((alert: any) => Date.now() - alert.timestamp < 24 * 60 * 60 * 1000) // Last 24 hours
              .sort((a: any, b: any) => b.timestamp - a.timestamp)
              .slice(0, 3); // Show latest 3 alerts
            
            if (recentAlerts.length > 0) {
              return (
                <div className="mb-6 bg-green-900/20 border border-green-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingDown className="w-5 h-5 text-green-400" />
                    <h3 className="text-lg font-semibold text-green-400">Recent Price Drops</h3>
                  </div>
                  <div className="space-y-2">
                    {recentAlerts.map((alert: any, index: number) => (
                      <div key={index} className="text-sm text-gray-300">
                        <span className="text-green-400">↓ {alert.percentage.toFixed(1)}%</span> - {alert.message}
                        <span className="text-gray-500 ml-2">
                          ({new Date(alert.timestamp).toLocaleTimeString()})
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <button
                      onClick={() => window.location.href = '/dashboard?tab=stockx-price-monitor'}
                      className="text-sm text-blue-400 hover:text-blue-300 underline"
                    >
                      View all monitored products →
                    </button>
                  </div>
                </div>
              );
            }
          }
          return null;
        })()}

        {/* Tracking Success Message - Separate from search progress */}
        {trackingMessage && (
          <div className="bg-emerald-900/20 border border-emerald-500 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-emerald-400" />
              <p className="text-emerald-400">{trackingMessage}</p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {errorMessage && (
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <p className="text-red-400">{errorMessage}</p>
              </div>
              {isAuthError && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={handleClearTokens}
                    className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    <AlertCircle className="w-4 h-4" />
                    Clear Tokens
                  </button>
                  <button
                    onClick={handleStockXLogin}
                    className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    <LogIn className="w-4 h-4" />
                    Login to StockX
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Authentication Status */}
        <div className="mb-6">
          <div className={`flex items-center justify-between p-4 rounded-lg border ${
            isAuthenticated 
              ? isNeon 
                ? 'bg-gradient-to-r from-green-900/20 via-emerald-900/20 to-cyan-900/20 border-green-500/50 text-green-400 shadow-lg shadow-green-500/10' 
                : 'bg-green-50 border-green-200 text-green-800'
              : isNeon 
                ? 'bg-red-500/10 border-red-500/30 text-red-400' 
                : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <div className="flex items-center">
              <div className={`w-3 h-3 rounded-full mr-3 ${
                isAuthenticated ? 'bg-green-500' : 'bg-red-500'
              } ${isAuthenticated && isNeon ? 'animate-pulse' : ''}`} />
              <span className="font-medium">
                {isAuthenticated ? 'StockX Connected' : '❌ StockX Authentication Required'}
              </span>
            </div>
            {!isAuthenticated && (
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    try {
                      // Clear old tokens first
                      await fetch('/api/stockx/clear-tokens', { method: 'POST' });
                      // Redirect to auth
                      window.location.href = '/api/stockx/auth?returnTo=' + encodeURIComponent(window.location.href);
                    } catch (error) {
                      console.error('Auth error:', error);
                    }
                  }}
                  className={`px-4 py-2 rounded font-medium transition-all duration-200 ${
                    isNeon
                      ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-400 hover:to-cyan-400 shadow-lg shadow-blue-500/25'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  🔄 Re-authenticate
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
            <p className="text-gray-300">
              {opportunities.length > 0 
                ? `Streaming results... Found ${opportunities.length} opportunities so far`
                : 'Searching StockX catalog...'
              }
            </p>
          </div>
        )}

        {/* Stats */}
        {opportunities.length > 0 && (
          <div className={`grid grid-cols-1 gap-4 sm:gap-6 mb-6 sm:mb-8 ${showFlexAsk ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Total Opportunities</p>
                  <p className="text-2xl font-bold text-cyan-400">{opportunities.length}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-cyan-400" />
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Avg Profit Margin</p>
                  <p className="text-2xl font-bold text-emerald-400">
                    {Math.round(opportunities.reduce((sum, opp) => sum + (opp.profitMargin || 0), 0) / opportunities.length)}%
                  </p>
                </div>
                <DollarSign className="w-8 h-8 text-emerald-400" />
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Total Potential Profit</p>
                  <p className="text-2xl font-bold text-green-400">
                    ${opportunities.reduce((sum, opp) => sum + (opp.profit || 0), 0).toLocaleString()}
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-green-400" />
              </div>
            </div>
            {showFlexAsk && (
              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm">Flex Ask Available</p>
                    <p className="text-2xl font-bold text-purple-400">
                      {opportunities.filter(opp => opp.flexAskAmount && opp.flexAskAmount > 0).length}
                    </p>
                  </div>
                  <div className="w-8 h-8 flex items-center justify-center text-purple-400 text-xl">🚀</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Initial State Message - No Search Performed Yet */}
        {!isLoading && opportunities.length === 0 && !errorMessage && !hasSearched && (
          <div className="text-center py-12">
            <div className="bg-gray-800 rounded-lg p-8">
              <div className="text-6xl mb-4">🔍</div>
              <h3 className="text-xl font-semibold text-gray-300 mb-2">Ready to Find Arbitrage Opportunities</h3>
              <p className="text-gray-400 max-w-md mx-auto mb-4">
                Search by popular brands like "Fear of God Essentials" or "Supreme", or paste StockX trending URLs like "https://stockx.com/category/apparel?sort=most-active" to discover what's currently hot on StockX. Set your minimum profit percentage to find profitable opportunities.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={handleStockXLogin}
                  className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  Login to StockX First
                </button>
              </div>
            </div>
          </div>
        )}

        {/* No Results Message - After Search */}
        {!isLoading && opportunities.length === 0 && !errorMessage && hasSearched && (
          <div className="text-center py-12">
            <div className="bg-gray-800 rounded-lg p-8">
              <div className="text-6xl mb-4">📭</div>
              <h3 className="text-xl font-semibold text-gray-300 mb-2">No Opportunities Found</h3>
              <p className="text-gray-400 max-w-md mx-auto">
                No arbitrage opportunities were found with at least {minSpreadPercentage}% spread. 
                Try lowering the minimum spread percentage or searching for different products.
              </p>
            </div>
          </div>
        )}

        {/* Opportunities List */}
        <div className="space-y-4">
          {opportunities.map((opportunity) => (
            <div key={opportunity.id} className="bg-gray-800 rounded-lg p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="relative group">
                    <FallbackImage
                      imageUrls={[uploadedImages[opportunity.productId] || opportunity.imageUrl]}
                      alt={opportunity.productName}
                      className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg flex-shrink-0"
                      productTitle={opportunity.productName}
                    />
                    {uploadedImages[opportunity.productId] && (
                      <div className="absolute -top-1 -right-1 bg-green-500 rounded-full p-1">
                        <Image className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg sm:text-xl font-semibold text-white truncate">{opportunity.productName}</h3>
                    <p className="text-gray-400 text-sm sm:text-base">{opportunity.size}</p>
                  </div>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-xl sm:text-2xl font-bold text-green-400">
                                                ${(opportunity.profit || 0).toFixed(2)}
                  </p>
                  <p className="text-gray-400 text-sm">
                    (+{(opportunity.profitMargin || 0).toFixed(2)}% profit)
                  </p>
                </div>
              </div>

              <div className={`grid gap-3 sm:gap-4 mb-4 ${showFlexAsk && opportunity.flexAskAmount ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <div className="text-center p-3 bg-gray-700 rounded-lg">
                  <p className="text-xs sm:text-sm text-gray-400 mb-1">Cost Price</p>
                  <p className="text-base sm:text-lg font-semibold text-green-400">${(opportunity.costPrice || 0).toFixed(2)}</p>
                </div>
                <div className="text-center p-3 bg-gray-700 rounded-lg">
                  <p className="text-xs sm:text-sm text-gray-400 mb-1">Standard Ask</p>
                  <p className="text-base sm:text-lg font-semibold text-cyan-400">${(opportunity.sellingPrice || 0).toFixed(2)}</p>
                </div>
                {showFlexAsk && opportunity.flexAskAmount && (
                  <div className="text-center p-3 bg-purple-900/30 border border-purple-500/30 rounded-lg">
                    <p className="text-xs sm:text-sm text-purple-300 mb-1">Flex Ask</p>
                    <p className="text-base sm:text-lg font-semibold text-purple-400">${opportunity.flexAskAmount.toFixed(2)}</p>
                    <p className="text-xs text-purple-300 mt-1">Faster Sale</p>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-400">
                  <p>Product ID: {opportunity.productId}</p>
                  <p>Variant ID: {opportunity.variantId}</p>
                  {showFlexAsk && opportunity.flexAskAmount && (
                    <p className="text-purple-400 mt-1">
                      🚀 Flex Ask Available: ${opportunity.flexAskAmount.toFixed(2)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleTwitterExport(opportunity)}
                    className="bg-black hover:bg-gray-900 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center gap-2 border border-gray-700"
                    title="Export to Twitter"
                  >
                    <Twitter className="w-4 h-4" />
                    Share
                  </button>
                  
                  {/* Price Monitor Button */}
                  {(() => {
                    const monitorButtonId = `monitor-${opportunity.productId}-${opportunity.variantId}`;
                    const isMonitored = monitoredProducts.has(monitorButtonId);
                    const showSettings = showMonitorSettings[monitorButtonId];
                    const settings = monitorSettings[monitorButtonId] || { priceDropThreshold: 30 };
                    
                    return (
                      <div className="relative">
                        <button
                          onClick={() => {
                            if (!isMonitored && !showSettings) {
                              setShowMonitorSettings(prev => ({ ...prev, [monitorButtonId]: true }));
                            }
                          }}
                          className={`font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center gap-2 ${
                            isMonitored 
                              ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white cursor-default'
                              : 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white'
                          }`}
                          disabled={isMonitored}
                        >
                          {isMonitored ? (
                            <>
                              <CheckCircle className="w-4 h-4" />
                              Monitoring
                            </>
                          ) : (
                            <>
                              <TrendingDown className="w-4 h-4" />
                              Monitor Price
                            </>
                          )}
                        </button>
                        
                        {/* Price drop threshold settings */}
                        {showSettings && !isMonitored && (
                          <div className="absolute top-full mt-2 right-0 bg-gray-800 border border-gray-700 rounded-lg p-4 shadow-xl z-10 w-64">
                            <div className="mb-3">
                              <label className="text-sm text-gray-300 block mb-1">Alert when price drops by:</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="range"
                                  min="5"
                                  max="50"
                                  step="5"
                                  value={settings.priceDropThreshold}
                                  onChange={(e) => {
                                    const value = parseInt(e.target.value);
                                    setMonitorSettings(prev => ({
                                      ...prev,
                                      [monitorButtonId]: { priceDropThreshold: value }
                                    }));
                                  }}
                                  className="flex-1"
                                />
                                <span className="text-white font-bold w-12 text-right">{settings.priceDropThreshold}%</span>
                              </div>
                              <div className="text-xs text-gray-400 mt-1">
                                Current: ${opportunity.askAmount?.toFixed(2) || '0'} → Alert at: $
                                {((opportunity.askAmount || 0) * (1 - settings.priceDropThreshold / 100)).toFixed(2)}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  addToPriceMonitor(opportunity, settings.priceDropThreshold);
                                  setShowMonitorSettings(prev => ({ ...prev, [monitorButtonId]: false }));
                                }}
                                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-3 rounded transition-colors"
                              >
                                Start Monitoring
                              </button>
                              <button
                                onClick={() => setShowMonitorSettings(prev => ({ ...prev, [monitorButtonId]: false }))}
                                className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-3 rounded transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {showFlexAsk && opportunity.flexAskAmount && (() => {
                    const buttonId = `${opportunity.productId}-${opportunity.variantId}`;
                    const isClicked = clickedButtons.has(buttonId);
                    return (
                      <button
                        onClick={() => {
                          console.log('🔔 Track Flex Ask button clicked!', opportunity);
                          addToFlexAskMonitor(opportunity);
                        }}
                        className={`font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center gap-2 ${
                          isClicked 
                            ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white'
                            : 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white'
                        }`}
                        disabled={isClicked}
                      >
                        {isClicked ? (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            Added!
                          </>
                        ) : (
                          <>
                            <Bell className="w-4 h-4" />
                            Track Flex Ask
                          </>
                        )}
                      </button>
                    );
                  })()}
                  {/* Debug info - remove this later */}
                  {process.env.NODE_ENV === 'development' && (
                    <div className="text-xs text-gray-500">
                      FlexAsk: {showFlexAsk ? 'ON' : 'OFF'} | Amount: {opportunity.flexAskAmount || 'none'}
                    </div>
                  )}
                  <a
                    href={(() => {
                      const opportunityKey = `${opportunity.productId}-${opportunity.variantId}`;
                      const affiliateLink = affiliateLinks[opportunityKey];
                      if (affiliateLink) {
                        return affiliateLink;
                      }
                      // If no affiliate link stored yet, generate one
                      const stockxUrl = opportunity.stockxUrl || generateStockXUrl(opportunity.productName, opportunity.variantId);
                      return convertStockXLink(stockxUrl, {
                        productName: opportunity.productName,
                        productId: opportunity.productId,
                        size: opportunity.size
                      });
                    })()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View on StockX
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Load More Button */}
        {opportunities.length > 0 && hasMore && !isLoading && (
          <div className="mt-8 text-center">
            <button
              onClick={() => searchArbitrageOpportunities(true)}
              disabled={isLoadingMore}
              className="bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2 mx-auto"
            >
              <Search className="w-5 h-5" />
              {isLoadingMore ? 'Loading More...' : 'Load More Results'}
            </button>
            <p className="text-gray-400 text-sm mt-2">
              Showing {opportunities.length} results - Page {currentPage}
            </p>
          </div>
        )}

        {/* Load More Loading State */}
        {isLoadingMore && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500 mx-auto mb-4"></div>
            <p className="text-gray-300">Loading more opportunities...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default StockXArbitrage; 