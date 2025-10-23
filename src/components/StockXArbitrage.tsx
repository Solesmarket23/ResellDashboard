'use client';

import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, DollarSign, ExternalLink, Search, AlertCircle, BarChart3, LogIn, CheckCircle, Bell, Twitter, Upload, Image, X, Filter, SortAsc, SortDesc, TrendingUpIcon, Activity, Clock, Zap, Target, Gauge, Link, ShoppingCart, Receipt } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { shareToTwitter, generateShareImage, ArbitrageShareData } from '@/lib/twitter/twitterExport';
import { generateEnhancedShareImage, EnhancedArbitrageShareData } from '@/lib/twitter/enhancedGraphics';
// Removed Sovrn imports - using Impact.com instead
import { useAuth } from '@/lib/contexts/AuthContext';
import { useSiteAuth } from '@/lib/hooks/useSiteAuth';
import { usePriceMonitor } from '@/lib/contexts/PriceMonitorContext';
import MiniPriceChart from './MiniPriceChart';
import PurchaseLinkPopup from './PurchaseLinkPopup';
import HistoricalSalesViewer from './HistoricalSalesViewer';

// Enhanced placeholder component for StockX products since images aren't publicly accessible
interface FallbackImageProps {
  imageUrls: string[];
  alt: string;
  className: string;
  productTitle?: string;
  brand?: string;
}

const FallbackImage: React.FC<FallbackImageProps> = ({ imageUrls, alt, className, productTitle, brand }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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

  const handleImageError = () => {
    // Try next image URL if available
    if (currentImageIndex < imageUrls.length - 1) {
      setCurrentImageIndex(currentImageIndex + 1);
    } else {
      // All images failed, show placeholder
      setImageError(true);
      setIsLoading(false);
    }
  };

  const handleImageLoad = () => {
    setIsLoading(false);
    setImageError(false);
  };

  // Reset when imageUrls change
  useEffect(() => {
    setCurrentImageIndex(0);
    setImageError(false);
    setIsLoading(true);
  }, [imageUrls]);

  // Show placeholder if no valid URLs or all failed
  if (!imageUrls || imageUrls.length === 0 || imageUrls[0] === '/placeholder-shoe.png' || imageError) {
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
  }

  // Try to load actual image
  return (
    <div className={`${className} relative overflow-hidden rounded-lg`}>
      {/* Loading state */}
      {isLoading && (
        <div className={`absolute inset-0 ${getBrandColor(brand)} flex items-center justify-center`}>
          <div className="text-center">
            <div className="text-white font-bold text-lg animate-pulse">
              {getBrandInitial(brand)}
            </div>
          </div>
        </div>
      )}
      
      {/* Actual image */}
      <img
        src={imageUrls[currentImageIndex]}
        alt={alt}
        className={`${className} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-200`}
        onError={handleImageError}
        onLoad={handleImageLoad}
      />
    </div>
  );
};

// Removed HistoricalSales interface - this data is not available from StockX API

interface ArbitrageOpportunity {
  id: string;
  productName: string;
  size: string;
  imageUrl: string;
  brand?: string;
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
  stockxUrl?: string;
  flexAskAmount?: number;
  
  // Enhanced data
  category?: string;
  releaseDate?: string;
  bidAskVolume?: number; // Volume of bids/asks
  priceHistory?: PricePoint[];
  volatilityScore?: number; // 0-100 price volatility
  velocityScore?: number; // How fast it sells
  riskScore?: number; // Overall risk assessment
  lastSalePrice?: number;
  salesVolume24h?: number;
  trendDirection?: 'up' | 'down' | 'stable';
  estimatedSellTime?: string; // "2-3 days", "1 week", etc.
}

interface PricePoint {
  timestamp: number;
  price: number;
  type: 'ask' | 'bid' | 'sale';
}

interface SearchFilters {
  minSpreadPercentage: number;
  priceRange: { min: number; max: number };
  profitRange: { min: number; max: number };
  selectedCategories: string[];
  selectedSizes: string[];
  excludedBrands: string[];
  onlyRecentReleases: boolean;
  minBidAskVolume: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

interface PurchaseData {
  orderNumber: string;
  purchasePrice: number;
  purchaseDate: string;
  purchaseSource: string;
  shippingCost?: number;
  taxAmount?: number;
  notes?: string;
}

interface LinkedPurchase {
  opportunityId: string;
  productId: string;
  variantId: string;
  purchaseData: PurchaseData;
  linkedAt: string;
}

const StockXArbitrage: React.FC = () => {
  const { currentTheme } = useTheme();
  const isNeon = currentTheme.name.toLowerCase() === 'neon';
  const auth = useAuth();
  const siteAuth = useSiteAuth(); // Use site auth for password-protected users
  const { addMonitoredProduct, monitoredProducts: firebaseMonitoredProducts } = usePriceMonitor();
  
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [minSpreadPercentage, setMinSpreadPercentage] = useState(10);
  const [excludedBrandTags, setExcludedBrandTags] = useState<string[]>([]);
  const [excludedBrandInput, setExcludedBrandInput] = useState('');
  
  // Advanced Filtering
  const [priceRange, setPriceRange] = useState({ min: 0, max: 1000 });
  const [profitRange, setProfitRange] = useState({ min: 0, max: 500 });
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<string>('profit'); // profit, margin, volume, velocity
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [onlyRecentReleases, setOnlyRecentReleases] = useState(false);
  const [minBidAskVolume, setMinBidAskVolume] = useState(0);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState(false);
  
  // Purchase tracking state
  const [linkedPurchases, setLinkedPurchases] = useState<LinkedPurchase[]>([]);
  const [showPurchasePopup, setShowPurchasePopup] = useState(false);
  const [selectedOpportunity, setSelectedOpportunity] = useState<ArbitrageOpportunity | null>(null);
  
  // Historical sales state
  const [showHistoricalSales, setShowHistoricalSales] = useState<{[key: string]: boolean}>({});
  const [selectedHistoricalProduct, setSelectedHistoricalProduct] = useState<ArbitrageOpportunity | null>(null);
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
  const [preserveOrder, setPreserveOrder] = useState(false); // Track if we should preserve order when loading more

  // Check authentication status on component mount and prompt login if needed
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/stockx/auth/status');
        const data = await response.json();
        setIsAuthenticated(data.isAuthenticated);
        
        // If not authenticated, automatically redirect to login
        if (!data.isAuthenticated) {
          // Check if we're not already coming back from an auth attempt
          const urlParams = new URLSearchParams(window.location.search);
          const hasAuthParams = urlParams.has('success') || urlParams.has('error') || urlParams.has('disconnected') || urlParams.has('tokens_cleared');
          
          if (!hasAuthParams) {
            // Small delay to let the UI render first
            setTimeout(() => {
              setErrorMessage('You need to authenticate with StockX to use the arbitrage finder.');
              setIsAuthError(true);
              // Optionally auto-redirect after showing the message
              setTimeout(() => {
                const currentUrl = window.location.href;
                const authUrl = `/api/stockx/auth?returnTo=${encodeURIComponent(currentUrl)}`;
                window.location.href = authUrl;
              }, 2000); // 2 second delay to show the message
            }, 500);
          }
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        setIsAuthenticated(false);
        setErrorMessage('Failed to check StockX authentication status. Please try refreshing the page.');
        setIsAuthError(true);
      }
    };
    
    checkAuth();
  }, []);

  // Load existing monitored products from Firebase context
  useEffect(() => {
    const monitoredIds = new Set<string>();
    
    // Extract the monitor button IDs from Firebase products
    firebaseMonitoredProducts.forEach((item: any) => {
      if (item.productId && item.variantId) {
        const buttonId = `monitor-${item.productId}-${item.variantId}`;
        monitoredIds.add(buttonId);
      }
    });
    
    setMonitoredProducts(monitoredIds);
    console.log('📊 Loaded monitored products from Firebase:', monitoredIds.size, 'items');
  }, [firebaseMonitoredProducts]);

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
      
      // Re-check authentication status after successful login
      const recheckAuth = async () => {
        try {
          const response = await fetch('/api/stockx/auth/status');
          const data = await response.json();
          setIsAuthenticated(data.isAuthenticated);
        } catch (error) {
          console.error('Auth recheck failed:', error);
        }
      };
      recheckAuth();
      
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

  // Helper function to generate StockX URL with size
  const generateStockXUrl = (productName: string, variantId: string, size?: string) => {
    const slug = productName.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
    
    // Include size in URL if provided
    if (size) {
      return `https://stockx.com/${slug}?size=${encodeURIComponent(size)}`;
    }
    return `https://stockx.com/${slug}`;
  };

  const handleStockXLogin = () => {
    // Store the current page URL to redirect back after authentication
    const currentUrl = window.location.href;
    const authUrl = `/api/stockx/auth?returnTo=${encodeURIComponent(currentUrl)}`;
    window.location.href = authUrl;
  };

  // Tag management functions
  const addBrandTag = (brand: string) => {
    const trimmedBrand = brand.trim();
    if (trimmedBrand && !excludedBrandTags.includes(trimmedBrand)) {
      setExcludedBrandTags([...excludedBrandTags, trimmedBrand]);
      setExcludedBrandInput('');
    }
  };

  const removeBrandTag = (index: number) => {
    setExcludedBrandTags(excludedBrandTags.filter((_, i) => i !== index));
  };

  const handleBrandInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ',' || e.key === 'Enter') {
      e.preventDefault();
      addBrandTag(excludedBrandInput);
    } else if (e.key === 'Backspace' && excludedBrandInput === '' && excludedBrandTags.length > 0) {
      // Remove last tag when backspace is pressed on empty input
      removeBrandTag(excludedBrandTags.length - 1);
    }
  };

  const handleBrandInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // If user types a comma, add the tag
    if (value.endsWith(',')) {
      addBrandTag(value.slice(0, -1));
    } else {
      setExcludedBrandInput(value);
    }
  };

  const handleClearTokens = () => {
    // Clear all StockX tokens and force re-authentication
    const currentUrl = window.location.href;
    const disconnectUrl = `/api/stockx/disconnect?returnTo=${encodeURIComponent(currentUrl)}`;
    window.location.href = disconnectUrl;
  };

  const searchArbitrageOpportunities = async (loadMore = false) => {
    console.log('🚀 searchArbitrageOpportunities called:', { loadMore, currentPage, searchQuery: searchQuery.substring(0, 30) });
    
    if (!searchQuery.trim()) {
      setErrorMessage('Please enter a search query');
      setIsAuthError(false);
      return;
    }

    // Always determine page BEFORE any state updates to avoid race conditions
    const pageToLoad = loadMore ? currentPage + 1 : 1;
    console.log('🔍 StockX Search Debug:', { loadMore, currentPage, pageToLoad, searchQuery });

    if (loadMore) {
      setIsLoadingMore(true);
      setPreserveOrder(true); // Preserve order when loading more
    } else {
      setIsLoading(true);
      setErrorMessage(null);
      setIsAuthError(false);
      setSuccessMessage(null);
      setOpportunities([]); // Clear previous results
      setCurrentPage(1);
      setHasMore(false);
      setPreserveOrder(false); // Don't preserve order for new searches
    }
    setHasSearched(true);

    try {
      
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
      if (excludedBrandTags.length > 0) {
        params.set('excludeBrands', excludedBrandTags.join(','));
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
                brand: data.data.brand || '',
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
    // Generate StockX URL for this product
    const stockxUrl = opportunity.stockxUrl || generateStockXUrl(opportunity.productName, opportunity.variantId, opportunity.size);
    
    // Generate Impact.com affiliate URL
    let affiliateUrl = stockxUrl;
    try {
      const impactResponse = await fetch('/api/impact/create-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          stockxUrl,
          customParams: {
            productId: opportunity.productId,
            size: opportunity.size,
            source: 'twitter_share'
          }
        })
      });
      
      if (impactResponse.ok) {
        const impactData = await impactResponse.json();
        affiliateUrl = impactData.trackingUrl || stockxUrl;
        console.log('Impact.com affiliate URL created:', affiliateUrl);
      } else {
        console.error('Impact.com API error:', await impactResponse.text());
        // Fallback to original URL if Impact fails
        affiliateUrl = stockxUrl;
      }
    } catch (error) {
      console.error('Error creating Impact.com link:', error);
      // Fallback to original URL if Impact fails
      affiliateUrl = stockxUrl;
    }
    
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
    
    console.log('Final URLs:', { stockxUrl, affiliateUrl, shortUrl });
    
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
    
    // Skip image generation for now - just use text-based share
    const shareData: ArbitrageShareData = {
      productName: opportunity.productName,
      size: opportunity.size,
      purchasePrice: opportunity.costPrice || 0,
      salePrice: opportunity.askAmount || 0,
      profit: opportunity.profit || 0,
      profitMargin: opportunity.profitMargin || 0,
      imageUrl: undefined, // No image for now
      affiliateUrl,
      shortUrl: shortUrl || undefined,
      backgroundVersion: 'bright'
    };
    
    // Open Twitter with pre-filled text
    shareToTwitter(shareData);
  };

  const addToPriceMonitor = async (opportunity: ArbitrageOpportunity, threshold: number = 30) => {
    console.log('📊 Adding to price monitor:', opportunity.productName, 'with', threshold + '% threshold');
    
    const buttonId = `monitor-${opportunity.productId}-${opportunity.variantId}`;
    setClickedButtons(prev => new Set(prev).add(buttonId));
    
    // Check if already monitored in Firebase
    const isAlreadyMonitored = firebaseMonitoredProducts.some((item: any) => 
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
    
    try {
      // Add to Firebase using context
      await addMonitoredProduct(newMonitoredProduct);
      
      // Update local state
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
    } catch (error) {
      console.error('Error adding to price monitor:', error);
      setTrackingMessage('❌ Error adding product to monitor. Please try again.');
      setTimeout(() => {
        setTrackingMessage(null);
        setClickedButtons(prev => {
          const newSet = new Set(prev);
          newSet.delete(buttonId);
          return newSet;
        });
      }, 4000);
    }
  };

  // Enhanced filtering and sorting functions
  const applyFiltersAndSorting = (opportunities: ArbitrageOpportunity[]): ArbitrageOpportunity[] => {
    let filtered = [...opportunities];
    
    // Apply filters
    filtered = filtered.filter(opp => {
      // Price range filter
      if (opp.askAmount && (opp.askAmount < priceRange.min || opp.askAmount > priceRange.max)) {
        return false;
      }
      
      // Profit range filter
      if (opp.profit < profitRange.min || opp.profit > profitRange.max) {
        return false;
      }
      
      // Category filter
      if (selectedCategories.length > 0 && opp.category && !selectedCategories.includes(opp.category)) {
        return false;
      }
      
      // Size filter
      if (selectedSizes.length > 0 && !selectedSizes.includes(opp.size)) {
        return false;
      }
      
      // Volume filter
      if (opp.bidAskVolume && opp.bidAskVolume < minBidAskVolume) {
        return false;
      }
      
      // Recent releases filter
      if (onlyRecentReleases && opp.releaseDate) {
        const releaseDate = new Date(opp.releaseDate);
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        if (releaseDate < threeMonthsAgo) {
          return false;
        }
      }
      
      return true;
    });
    
    // Sorting removed - maintaining original API order
    
    return filtered;
  };

  // Get popular sizes for filters
  const getPopularSizes = () => {
    return ['7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '13'];
  };

  // Get categories for filters
  const getCategories = () => {
    return ['Sneakers', 'Apparel', 'Accessories', 'Collectibles', 'Electronics'];
  };

  // Apply filters to displayed opportunities
  // When loading more, maintain the original order of results
  const filteredOpportunities = preserveOrder 
    ? opportunities.filter(opp => {
        // Apply only filters, no sorting when preserving order
        if (opp.askAmount && (opp.askAmount < priceRange.min || opp.askAmount > priceRange.max)) {
          return false;
        }
        if (opp.profit < profitRange.min || opp.profit > profitRange.max) {
          return false;
        }
        if (selectedCategories.length > 0 && opp.category && !selectedCategories.includes(opp.category)) {
          return false;
        }
        if (selectedSizes.length > 0 && !selectedSizes.includes(opp.size)) {
          return false;
        }
        if (opp.bidAskVolume && opp.bidAskVolume < minBidAskVolume) {
          return false;
        }
        if (onlyRecentReleases && opp.releaseDate) {
          const releaseDate = new Date(opp.releaseDate);
          const threeMonthsAgo = new Date();
          threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
          if (releaseDate < threeMonthsAgo) {
            return false;
          }
        }
        return true;
      })
    : applyFiltersAndSorting(opportunities);

  // Reset preserveOrder when filters change
  useEffect(() => {
    setPreserveOrder(false);
  }, [priceRange, profitRange, selectedCategories, selectedSizes, minBidAskVolume, onlyRecentReleases]);

  // Load linked purchases from localStorage on component mount
  useEffect(() => {
    const savedPurchases = localStorage.getItem('linkedPurchases');
    if (savedPurchases) {
      try {
        const purchases = JSON.parse(savedPurchases);
        setLinkedPurchases(purchases);
      } catch (error) {
        console.error('Error loading linked purchases:', error);
      }
    }
  }, []);

  // Save linked purchases to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('linkedPurchases', JSON.stringify(linkedPurchases));
  }, [linkedPurchases]);

  // Function to get linked purchase for an opportunity
  const getLinkedPurchase = (opportunity: ArbitrageOpportunity): LinkedPurchase | null => {
    return linkedPurchases.find(
      purchase => purchase.productId === opportunity.productId && 
                  purchase.variantId === opportunity.variantId
    ) || null;
  };

  // Function to calculate actual profit using linked purchase data
  const calculateActualProfit = (opportunity: ArbitrageOpportunity): number | null => {
    const linkedPurchase = getLinkedPurchase(opportunity);
    if (!linkedPurchase || !opportunity.askAmount) return null;

    const totalCost = linkedPurchase.purchaseData.purchasePrice + 
                     (linkedPurchase.purchaseData.shippingCost || 0) + 
                     (linkedPurchase.purchaseData.taxAmount || 0);
    
    const stockxFees = (opportunity.askAmount * 0.095) + 3; // Approximate StockX seller fees
    
    return opportunity.askAmount - stockxFees - totalCost;
  };

  // Function to handle purchase linking
  const handleLinkPurchase = (opportunity: ArbitrageOpportunity) => {
    setSelectedOpportunity(opportunity);
    setShowPurchasePopup(true);
  };

  // Function to save purchase data
  const handleSavePurchase = async (opportunity: ArbitrageOpportunity, purchaseData: PurchaseData) => {
    const newLinkedPurchase: LinkedPurchase = {
      opportunityId: opportunity.id,
      productId: opportunity.productId,
      variantId: opportunity.variantId,
      purchaseData,
      linkedAt: new Date().toISOString()
    };

    // Remove any existing purchase for this product/variant and add the new one
    setLinkedPurchases(prev => {
      const filtered = prev.filter(
        p => !(p.productId === opportunity.productId && p.variantId === opportunity.variantId)
      );
      return [...filtered, newLinkedPurchase];
    });

    setSuccessMessage(`✅ Purchase linked successfully! Order #${purchaseData.orderNumber}`);
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  // Function to remove a linked purchase
  const handleRemovePurchase = (opportunity: ArbitrageOpportunity) => {
    setLinkedPurchases(prev => 
      prev.filter(p => !(p.productId === opportunity.productId && p.variantId === opportunity.variantId))
    );
    setSuccessMessage(`🗑️ Purchase link removed for ${opportunity.title}`);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // Function to toggle historical sales view
  const toggleHistoricalSales = (opportunity: ArbitrageOpportunity) => {
    const key = `${opportunity.productId}-${opportunity.variantId}`;
    setShowHistoricalSales(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
    setSelectedHistoricalProduct(opportunity);
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
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
      `}</style>
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
                placeholder="e.g., Jordan 1, Nike, or https://stockx.com/air-jordan-3-retro-og-rare-air"
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
                onChange={(e) => {
                  const value = e.target.value;
                  // Handle empty input
                  if (value === '') {
                    setMinSpreadPercentage(0);
                  } else {
                    // Parse as number to remove leading zeros
                    const numValue = parseInt(value, 10);
                    // Ensure value is within bounds
                    if (!isNaN(numValue)) {
                      setMinSpreadPercentage(Math.min(100, Math.max(0, numValue)));
                    }
                  }
                }}
                onBlur={(e) => {
                  // If empty on blur, set to default
                  if (e.target.value === '' || e.target.value === '0') {
                    setMinSpreadPercentage(10);
                  }
                }}
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
              <div className="w-full min-h-[42px] px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus-within:ring-2 focus-within:ring-cyan-500 cursor-text" 
                onClick={() => document.getElementById('brand-input')?.focus()}>
                <div className="flex flex-wrap gap-2 items-center">
                  {excludedBrandTags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 rounded-md text-sm text-white group animate-fadeIn"
                    >
                      <span>{tag}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeBrandTag(index);
                        }}
                        className="ml-1 hover:bg-white/20 rounded-sm transition-colors duration-200"
                      >
                        <X className="w-3 h-3 text-gray-300 hover:text-white" />
                      </button>
                    </span>
                  ))}
                  <input
                    id="brand-input"
                    type="text"
                    value={excludedBrandInput}
                    onChange={handleBrandInputChange}
                    onKeyDown={handleBrandInputKeyDown}
                    className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-white placeholder-gray-400"
                    placeholder={excludedBrandTags.length === 0 ? "Type brand and press comma" : "Add more..."}
                  />
                </div>
              </div>
              <div className="mt-1 text-xs text-gray-400">
                <span>💡 Example exclusions:</span>
                <button
                  type="button"
                  onClick={() => {
                    setExcludedBrandTags(['Nike', 'Jordan', 'Adidas']);
                    setExcludedBrandInput('');
                  }}
                  className="ml-1 text-red-400 hover:text-red-300 underline"
                >
                  Major Sports Brands
                </button>
                <span className="mx-1">•</span>
                <button
                  type="button"
                  onClick={() => {
                    setExcludedBrandTags(['Supreme', 'Off-White', 'Yeezy']);
                    setExcludedBrandInput('');
                  }}
                  className="text-red-400 hover:text-red-300 underline"
                >
                  Hype Brands
                </button>
              </div>
            </div>
            
            <div className="flex items-end">
              <button
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="w-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
              >
                <Filter className="w-4 h-4" />
                {showAdvancedFilters ? 'Hide' : 'Show'} Advanced Filters
              </button>
            </div>
          </div>

          {/* Advanced Filters Panel */}
          {showAdvancedFilters && (
            <div className="mt-4 p-6 bg-gray-800/50 border border-gray-700 rounded-lg space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <Filter className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-semibold text-white">Advanced Filters</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Price Range */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Price Range: ${priceRange.min} - ${priceRange.max}
                  </label>
                  <div className="space-y-2">
                    <input
                      type="range"
                      min="0"
                      max="2000"
                      step="50"
                      value={priceRange.max}
                      onChange={(e) => setPriceRange(prev => ({ ...prev, max: parseInt(e.target.value) }))}
                      className="w-full"
                    />
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={priceRange.min}
                        onChange={(e) => setPriceRange(prev => ({ ...prev, min: parseInt(e.target.value) || 0 }))}
                        className="w-20 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs"
                        placeholder="Min"
                      />
                      <input
                        type="number"
                        value={priceRange.max}
                        onChange={(e) => setPriceRange(prev => ({ ...prev, max: parseInt(e.target.value) || 2000 }))}
                        className="w-20 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs"
                        placeholder="Max"
                      />
                    </div>
                  </div>
                </div>

                {/* Profit Range */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Profit Range: ${profitRange.min} - ${profitRange.max}
                  </label>
                  <div className="space-y-2">
                    <input
                      type="range"
                      min="0"
                      max="500"
                      step="10"
                      value={profitRange.max}
                      onChange={(e) => setProfitRange(prev => ({ ...prev, max: parseInt(e.target.value) }))}
                      className="w-full"
                    />
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={profitRange.min}
                        onChange={(e) => setProfitRange(prev => ({ ...prev, min: parseInt(e.target.value) || 0 }))}
                        className="w-20 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs"
                        placeholder="Min"
                      />
                      <input
                        type="number"
                        value={profitRange.max}
                        onChange={(e) => setProfitRange(prev => ({ ...prev, max: parseInt(e.target.value) || 500 }))}
                        className="w-20 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs"
                        placeholder="Max"
                      />
                    </div>
                  </div>
                </div>

                {/* Size Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Sizes ({selectedSizes.length} selected)
                  </label>
                  <div className="max-h-32 overflow-y-auto border border-gray-600 rounded p-2 bg-gray-700">
                    <div className="grid grid-cols-3 gap-1">
                      {getPopularSizes().map(size => (
                        <label key={size} className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={selectedSizes.includes(size)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedSizes([...selectedSizes, size]);
                              } else {
                                setSelectedSizes(selectedSizes.filter(s => s !== size));
                              }
                            }}
                            className="w-3 h-3"
                          />
                          {size}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Category Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Categories ({selectedCategories.length} selected)
                  </label>
                  <div className="space-y-1">
                    {getCategories().map(category => (
                      <label key={category} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedCategories.includes(category)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCategories([...selectedCategories, category]);
                            } else {
                              setSelectedCategories(selectedCategories.filter(c => c !== category));
                            }
                          }}
                          className="w-4 h-4"
                        />
                        {category}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Volume Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Min Bid/Ask Volume: {minBidAskVolume}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={minBidAskVolume}
                    onChange={(e) => setMinBidAskVolume(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <div className="text-xs text-gray-400 mt-1">
                    Higher volume = more liquid market
                  </div>
                </div>

                {/* Recent Releases */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Release Timing
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={onlyRecentReleases}
                      onChange={(e) => setOnlyRecentReleases(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-gray-300">Only Recent Releases (3 months)</span>
                  </label>
                  <div className="text-xs text-gray-400 mt-1">
                    Focus on recently released items with higher demand
                  </div>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="border-t border-gray-600 pt-4">
                <p className="text-sm font-medium text-gray-300 mb-3">Quick Filter Presets:</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setProfitRange({ min: 50, max: 500 });
                      setPriceRange({ min: 0, max: 500 });
                      setSelectedSizes(['9', '9.5', '10', '10.5', '11']);
                    }}
                    className="px-3 py-1 bg-green-600/20 border border-green-500/30 rounded text-green-400 text-xs hover:bg-green-600/30 transition-colors"
                  >
                    💰 High Profit
                  </button>
                  <button
                    onClick={() => {
                      setOnlyRecentReleases(true);
                      setSelectedCategories(['Sneakers']);
                    }}
                    className="px-3 py-1 bg-blue-600/20 border border-blue-500/30 rounded text-blue-400 text-xs hover:bg-blue-600/30 transition-colors"
                  >
                    ⚡ Recent Releases
                  </button>
                  <button
                    onClick={() => {
                      setMinBidAskVolume(20);
                    }}
                    className="px-3 py-1 bg-yellow-600/20 border border-yellow-500/30 rounded text-yellow-400 text-xs hover:bg-yellow-600/30 transition-colors"
                  >
                    🛡️ High Volume
                  </button>
                  <button
                    onClick={() => {
                      setPriceRange({ min: 0, max: 200 });
                      setMinSpreadPercentage(20);
                    }}
                    className="px-3 py-1 bg-purple-600/20 border border-purple-500/30 rounded text-purple-400 text-xs hover:bg-purple-600/30 transition-colors"
                  >
                    🎯 Budget Friendly
                  </button>
                  <button
                    onClick={() => {
                      // Reset all filters
                      setPriceRange({ min: 0, max: 1000 });
                      setProfitRange({ min: 0, max: 500 });
                      setSelectedCategories([]);
                      setSelectedSizes([]);
                      setMinBidAskVolume(0);
                      setOnlyRecentReleases(false);
                    }}
                    className="px-3 py-1 bg-gray-600/20 border border-gray-500/30 rounded text-gray-400 text-xs hover:bg-gray-600/30 transition-colors"
                  >
                    🔄 Reset All
                  </button>
                </div>
              </div>
            </div>
          )}
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

        {/* Enhanced Stats */}
        {opportunities.length > 0 && (
          <div className="mb-6 sm:mb-8">
            {/* Filter Summary */}
            {(selectedSizes.length > 0 || selectedCategories.length > 0 || priceRange.min > 0 || profitRange.min > 0) && (
              <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Filter className="w-4 h-4 text-blue-400" />
                  <span className="text-blue-300 text-sm font-medium">Active Filters:</span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {selectedSizes.length > 0 && (
                    <span className="px-2 py-1 bg-blue-500/20 border border-blue-500/30 rounded text-blue-300">
                      Sizes: {selectedSizes.join(', ')}
                    </span>
                  )}
                  {selectedCategories.length > 0 && (
                    <span className="px-2 py-1 bg-blue-500/20 border border-blue-500/30 rounded text-blue-300">
                      Categories: {selectedCategories.join(', ')}
                    </span>
                  )}
                  {(priceRange.min > 0 || priceRange.max < 1000) && (
                    <span className="px-2 py-1 bg-blue-500/20 border border-blue-500/30 rounded text-blue-300">
                      Price: ${priceRange.min} - ${priceRange.max}
                    </span>
                  )}
                  {(profitRange.min > 0 || profitRange.max < 500) && (
                    <span className="px-2 py-1 bg-blue-500/20 border border-blue-500/30 rounded text-blue-300">
                      Profit: ${profitRange.min} - ${profitRange.max}
                    </span>
                  )}
                  <span className="px-2 py-1 bg-gray-500/20 border border-gray-500/30 rounded text-gray-300">
                    Showing {filteredOpportunities.length} of {opportunities.length}
                  </span>
                </div>
              </div>
            )}
            
            {/* Main Stats Grid */}
            <div className={`grid grid-cols-1 gap-4 sm:gap-6 ${showFlexAsk ? 'md:grid-cols-6' : 'md:grid-cols-5'}`}>
              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm">Found / Filtered</p>
                    <p className="text-2xl font-bold text-cyan-400">
                      {filteredOpportunities.length} / {opportunities.length}
                    </p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-cyan-400" />
                </div>
              </div>
              
              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm">Avg Profit</p>
                    <p className="text-2xl font-bold text-emerald-400">
                      ${filteredOpportunities.length > 0 ? 
                        Math.round(filteredOpportunities.reduce((sum, opp) => sum + (opp.profit || 0), 0) / filteredOpportunities.length) 
                        : 0}
                    </p>
                  </div>
                  <DollarSign className="w-8 h-8 text-emerald-400" />
                </div>
              </div>
              
              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm">Avg Margin</p>
                    <p className="text-2xl font-bold text-green-400">
                      {filteredOpportunities.length > 0 ? 
                        Math.round(filteredOpportunities.reduce((sum, opp) => sum + (opp.profitMargin || 0), 0) / filteredOpportunities.length) 
                        : 0}%
                    </p>
                  </div>
                  <BarChart3 className="w-8 h-8 text-green-400" />
                </div>
              </div>
              
              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm">Total Value</p>
                    <p className="text-2xl font-bold text-yellow-400">
                      ${filteredOpportunities.reduce((sum, opp) => sum + (opp.profit || 0), 0).toLocaleString()}
                    </p>
                  </div>
                  <Target className="w-8 h-8 text-yellow-400" />
                </div>
              </div>
              
              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm">Linked Purchases</p>
                    <p className="text-2xl font-bold text-orange-400">
                      {filteredOpportunities.filter(opp => getLinkedPurchase(opp)).length}
                    </p>
                  </div>
                  <ShoppingCart className="w-8 h-8 text-orange-400" />
                </div>
              </div>
              
              {showFlexAsk && (
                <div className="bg-gray-800 rounded-lg p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-sm">Fast Sellers</p>
                      <p className="text-2xl font-bold text-purple-400">
                        {filteredOpportunities.filter(opp => opp.flexAskAmount && opp.flexAskAmount > 0).length}
                      </p>
                    </div>
                    <Zap className="w-8 h-8 text-purple-400" />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Initial State Message - No Search Performed Yet */}
        {!isLoading && opportunities.length === 0 && !errorMessage && !hasSearched && (
          <div className="text-center py-12">
            <div className="bg-gray-800 rounded-lg p-8">
              <div className="text-6xl mb-4">🔍</div>
              <h3 className="text-xl font-semibold text-gray-300 mb-2">Ready to Find Arbitrage Opportunities</h3>
              <p className="text-gray-400 max-w-md mx-auto">
                Search by popular brands like "Fear of God Essentials" or "Supreme", or paste StockX trending URLs like "https://stockx.com/category/apparel?sort=most-active" to discover what's currently hot on StockX. Set your minimum profit percentage to find profitable opportunities.
              </p>
              {!isAuthenticated && (
                <p className="text-yellow-400 text-sm mt-4">
                  Checking StockX authentication...
                </p>
              )}
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
          {filteredOpportunities.map((opportunity) => (
            <div key={opportunity.id} className="bg-gray-800 rounded-lg p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="relative group">
                    <FallbackImage
                      imageUrls={[uploadedImages[opportunity.productId] || opportunity.imageUrl]}
                      alt={opportunity.productName}
                      className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg flex-shrink-0"
                      productTitle={opportunity.productName}
                      brand={opportunity.brand}
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

              <div className={`grid gap-3 sm:gap-4 mb-4 ${showFlexAsk && opportunity.flexAskAmount ? 'grid-cols-4' : 'grid-cols-3'}`}>
                <div className="text-center p-3 bg-gray-700 rounded-lg">
                  <p className="text-xs sm:text-sm text-gray-400 mb-1">Cost Price</p>
                  <p className="text-base sm:text-lg font-semibold text-green-400">${(opportunity.costPrice || 0).toFixed(2)}</p>
                  {opportunity.bidAmount && (
                    <p className="text-xs text-gray-400 mt-1">Bid: ${opportunity.bidAmount.toFixed(2)}</p>
                  )}
                </div>
                <div className="text-center p-3 bg-gray-700 rounded-lg">
                  <p className="text-xs sm:text-sm text-gray-400 mb-1">Standard Ask</p>
                  <p className="text-base sm:text-lg font-semibold text-cyan-400">${(opportunity.sellingPrice || 0).toFixed(2)}</p>
                  {opportunity.lastSalePrice && (
                    <p className="text-xs text-gray-400 mt-1">Last: ${opportunity.lastSalePrice.toFixed(2)}</p>
                  )}
                </div>
                <div className="text-center p-3 bg-emerald-900/30 border border-emerald-500/30 rounded-lg">
                  <p className="text-xs sm:text-sm text-emerald-300 mb-1">Net Profit</p>
                  <p className="text-base sm:text-lg font-semibold text-emerald-400">${(opportunity.profit || 0).toFixed(2)}</p>
                  <p className="text-xs text-emerald-300 mt-1">{(opportunity.profitMargin || 0).toFixed(1)}% margin</p>
                </div>
                {showFlexAsk && opportunity.flexAskAmount && (
                  <div className="text-center p-3 bg-purple-900/30 border border-purple-500/30 rounded-lg">
                    <p className="text-xs sm:text-sm text-purple-300 mb-1">Flex Ask</p>
                    <p className="text-base sm:text-lg font-semibold text-purple-400">${opportunity.flexAskAmount.toFixed(2)}</p>
                    <p className="text-xs text-purple-300 mt-1">Faster Sale</p>
                  </div>
                )}
              </div>

              {/* Enhanced Metrics Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 text-xs">
                <div className="flex items-center gap-1 text-gray-400">
                  <Activity className="w-3 h-3" />
                  <span>Volume: {opportunity.bidAskVolume || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-1 text-gray-400">
                  <Gauge className="w-3 h-3" />
                  <span>Velocity: {opportunity.velocityScore || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-1 text-gray-400">
                  <Clock className="w-3 h-3" />
                  <span>Est. Time: {opportunity.estimatedSellTime || 'Unknown'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  <span className={`
                    ${opportunity.trendDirection === 'up' ? 'text-green-400' : 
                      opportunity.trendDirection === 'down' ? 'text-red-400' : 'text-gray-400'}
                  `}>
                    Trend: {opportunity.trendDirection || 'stable'}
                  </span>
                </div>
              </div>

              {/* Risk Assessment */}
              {opportunity.riskScore !== undefined && (
                <div className="mb-4 p-3 bg-gray-700/50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-300">Risk Assessment</span>
                    <span className={`text-sm font-semibold ${
                      opportunity.riskScore <= 30 ? 'text-green-400' :
                      opportunity.riskScore <= 60 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {opportunity.riskScore <= 30 ? 'Low' :
                       opportunity.riskScore <= 60 ? 'Medium' : 'High'} Risk
                    </span>
                  </div>
                  <div className="w-full bg-gray-600 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${
                        opportunity.riskScore <= 30 ? 'bg-green-400' :
                        opportunity.riskScore <= 60 ? 'bg-yellow-400' : 'bg-red-400'
                      }`}
                      style={{ width: `${opportunity.riskScore}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>Safe</span>
                    <span>Risky</span>
                  </div>
                </div>
              )}

              {/* Price History Chart */}
              {opportunity.priceHistory && opportunity.priceHistory.length > 0 && (
                <div className="mb-4 p-3 bg-gray-700/30 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-300">Price Trend (7 days)</span>
                    <div className="flex items-center gap-2">
                      <MiniPriceChart 
                        priceHistory={opportunity.priceHistory} 
                        width={100} 
                        height={30}
                        className="rounded"
                      />
                      <span className={`text-xs ${
                        opportunity.trendDirection === 'up' ? 'text-green-400' : 
                        opportunity.trendDirection === 'down' ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {opportunity.trendDirection === 'up' ? '↗' : 
                         opportunity.trendDirection === 'down' ? '↘' : '→'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-400">
                  <p>Product ID: {opportunity.productId}</p>
                  <p>Variant ID: {opportunity.variantId}</p>
                  {opportunity.category && (
                    <p className="text-blue-400 mt-1">Category: {opportunity.category}</p>
                  )}
                  {showFlexAsk && opportunity.flexAskAmount && (
                    <p className="text-purple-400 mt-1">
                      🚀 Flex Ask Available: ${opportunity.flexAskAmount.toFixed(2)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Purchase Tracking Button */}
                  {(() => {
                    const linkedPurchase = getLinkedPurchase(opportunity);
                    const actualProfit = calculateActualProfit(opportunity);
                    
                    return linkedPurchase ? (
                      <div className="flex items-center gap-2">
                        <div className="text-right text-sm">
                          <p className="text-green-400 font-semibold">
                            Actual: ${actualProfit?.toFixed(2) || 'N/A'}
                          </p>
                          <p className="text-gray-400 text-xs">
                            Order #{linkedPurchase.purchaseData.orderNumber}
                          </p>
                        </div>
                        <button
                          onClick={() => handleLinkPurchase(opportunity)}
                          className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-3 rounded-lg transition-colors flex items-center gap-2"
                          title="Edit Purchase"
                        >
                          <Receipt className="w-4 h-4" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleRemovePurchase(opportunity)}
                          className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-2 rounded-lg transition-colors"
                          title="Remove Purchase Link"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleLinkPurchase(opportunity)}
                        className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
                        title="Link Purchase"
                      >
                        <Link className="w-4 h-4" />
                        Link Purchase
                      </button>
                    );
                  })()}
                  
                  <button
                    onClick={() => handleTwitterExport(opportunity)}
                    className="bg-black hover:bg-gray-900 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center gap-2 border border-gray-700"
                    title="Export to Twitter"
                  >
                    <Twitter className="w-4 h-4" />
                    Share
                  </button>
                  
                  <button
                    onClick={() => toggleHistoricalSales(opportunity)}
                    className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
                    title="View Sales History"
                  >
                    <BarChart3 className="w-4 h-4" />
                    Sales History
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
                  <button
                    onClick={() => {
                      // Disabled affiliate links - using regular StockX URL
                      const stockxUrl = opportunity.stockxUrl || generateStockXUrl(opportunity.productName, opportunity.variantId, opportunity.size);
                      window.open(stockxUrl, '_blank', 'noopener,noreferrer');
                    }}
                    className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View on StockX
                  </button>
                </div>
              </div>

              {/* Historical Sales Viewer */}
              {showHistoricalSales[`${opportunity.productId}-${opportunity.variantId}`] && (
                <div className="mt-6 border-t border-gray-700 pt-6">
                  <HistoricalSalesViewer
                    productId={opportunity.productId}
                    variantId={opportunity.variantId}
                    productName={opportunity.productName}
                    size={opportunity.size}
                  />
                </div>
              )}
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
              Showing {filteredOpportunities.length} filtered of {opportunities.length} total results - Page {currentPage}
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

      {/* Purchase Link Popup */}
      <PurchaseLinkPopup
        isOpen={showPurchasePopup}
        onClose={() => {
          setShowPurchasePopup(false);
          setSelectedOpportunity(null);
        }}
        opportunity={selectedOpportunity}
        onSavePurchase={handleSavePurchase}
        existingPurchase={selectedOpportunity ? getLinkedPurchase(selectedOpportunity)?.purchaseData : null}
      />
    </div>
  );
};

export default StockXArbitrage; 