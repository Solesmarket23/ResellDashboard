'use client';

import React, { useState, useEffect } from 'react';
import { 
  Search, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  ExternalLink, 
  AlertCircle, 
  CheckCircle, 
  RefreshCw, 
  Filter,
  ArrowRight,
  ShoppingCart,
  Target,
  Percent,
  Clock,
  Star
} from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

interface EbayListing {
  title: string;
  price: number;
  currency: string;
  image: string;
  url: string;
  seller: string;
  condition: string;
  source: string;
  itemId: string;
  shipping?: number;
  bidsCount?: number;
  endTime?: string;
  buyItNowPrice?: number;
}

interface StockXPriceData {
  lowestAsk: number;
  highestBid: number;
  lastSale: number;
  productId: string;
  variantId: string;
  size: string;
}

interface ArbitrageOpportunity {
  ebayListing: EbayListing;
  stockxData: StockXPriceData | null;
  profit: number;
  profitMargin: number;
  totalCost: number;
  netRevenue: number;
  roi: number;
  matchedProduct?: string;
  confidence: number;
  searchMethod?: 'gtin' | 'stylecode' | 'text';
  gtin?: string;
  styleCode?: string;
}

interface SearchStats {
  totalEbayListings: number;
  totalOpportunities: number;
  averageProfit: number;
  averageProfitMargin: number;
}

const EbayStockXArbitrage: React.FC = () => {
  const { currentTheme } = useTheme();
  const isNeon = currentTheme.name.toLowerCase() === 'neon';
  
  // Mode state
  const [mode, setMode] = useState<'manual' | 'bulk'>('bulk');
  
  // Manual search state
  const [searchQuery, setSearchQuery] = useState('');
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [stats, setStats] = useState<SearchStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchStatus, setSearchStatus] = useState<string>('');
  
  // Bulk scan state
  const [bulkOpportunities, setBulkOpportunities] = useState<any[]>([]);
  const [bulkStats, setBulkStats] = useState<{
    totalScanned: number;
    filtered: number;
    opportunities: number;
  } | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [searchProgress, setSearchProgress] = useState<{
    ebayFound: number;
    stockxMatched: number;
    currentStep: string;
  }>({ ebayFound: 0, stockxMatched: 0, currentStep: '' });

  // Filter states
  const [minProfitMargin, setMinProfitMargin] = useState(0);
  const [maxPrice, setMaxPrice] = useState(500);
  const [minConfidence, setMinConfidence] = useState(60);
  const [showFilters, setShowFilters] = useState(false);
  const [newItemsOnly, setNewItemsOnly] = useState(true);
  const [authenticityGuaranteeOnly, setAuthenticityGuaranteeOnly] = useState(false);
  const [stockxAuthStatus, setStockxAuthStatus] = useState<'checking' | 'authenticated' | 'not_authenticated'>('checking');

  // Bulk scan function
  const scanForBulkOpportunities = async () => {
    setBulkLoading(true);
    setBulkError(null);
    setBulkOpportunities([]);
    setBulkStats(null);
    
    // Reset progress
    setSearchProgress({ ebayFound: 0, stockxMatched: 0, currentStep: 'Starting bulk scan...' });
    setSearchStatus('Initializing bulk scan...');
    
    try {
      console.log('🚀 Starting bulk opportunity scan...');
      
      // Update progress - searching eBay
      setSearchProgress(prev => ({ ...prev, currentStep: 'Searching eBay for sneakers...' }));
      setSearchStatus('Searching eBay for sneaker listings...');
      
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 second timeout
      
      const response = await fetch('/api/ebay-feed-scanner?limit=20&minProfit=5', {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('📦 Bulk scan response:', data);
      
      if (data.success) {
        // Update progress - processing results
        setSearchProgress(prev => ({ 
          ...prev, 
          ebayFound: data.totalScanned || 0,
          stockxMatched: data.opportunities?.length || 0,
          currentStep: 'Processing results...'
        }));
        setSearchStatus(`Found ${data.totalScanned || 0} items, ${data.filtered || 0} passed filters, ${data.opportunities?.length || 0} opportunities`);
        
        setBulkOpportunities(data.opportunities || []);
        setBulkStats({
          totalScanned: data.totalScanned || 0,
          filtered: data.filtered || 0,
          opportunities: data.opportunities?.length || 0
        });
        
        if (data.opportunities?.length > 0) {
          setSuccessMessage(`Found ${data.opportunities.length} profitable opportunities!`);
        } else {
          setSuccessMessage('Bulk scan completed, but no profitable opportunities found with current criteria.');
        }
      } else {
        setBulkError(data.message || 'Failed to scan for opportunities');
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setBulkError('Scan timed out after 45 seconds. The search is taking longer than expected.');
      } else {
        setBulkError('Network error occurred');
      }
      console.error('Bulk scanner error:', err);
    } finally {
      setBulkLoading(false);
      
      // Clear status after a delay
      setTimeout(() => {
        setSearchStatus('');
        setSearchProgress({ ebayFound: 0, stockxMatched: 0, currentStep: '' });
      }, 5000);
    }
  };

  // Check StockX authentication status on component mount
  useEffect(() => {
    const checkStockXAuth = async () => {
      try {
        const response = await fetch('/api/stockx/auth/status');
        if (response.ok) {
          const data = await response.json();
          setStockxAuthStatus(data.isAuthenticated ? 'authenticated' : 'not_authenticated');
        } else {
          setStockxAuthStatus('not_authenticated');
        }
      } catch (error) {
        console.error('Error checking StockX auth status:', error);
        setStockxAuthStatus('not_authenticated');
      }
    };

    checkStockXAuth();
    
    // Check for auth success in URL params (when returning from StockX OAuth)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('success') === 'true') {
      // Remove the success param from URL
      window.history.replaceState({}, '', window.location.pathname + '?section=ebay-stockx-arbitrage');
      // Refresh auth status
      setTimeout(checkStockXAuth, 1000);
    }
  }, []);

  const searchArbitrageOpportunities = async () => {
    if (!searchQuery.trim()) {
      setErrorMessage('Please enter a search query');
      return;
    }

    // If not authenticated, show auth message
    if (stockxAuthStatus === 'not_authenticated') {
      setErrorMessage('Please connect to StockX first to enable price comparisons');
      return;
    }

    console.log(`🔍 Starting eBay-StockX arbitrage search for: "${searchQuery}"`);
    console.log(`📊 Filters: minProfit=${minProfitMargin}%, maxPrice=$${maxPrice}, minConfidence=${minConfidence}%`);

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setOpportunities([]);
    setStats(null);
    setSearchStatus('Searching eBay listings...');
    setSearchProgress({ ebayFound: 0, stockxMatched: 0, currentStep: 'Searching eBay' });

    const startTime = Date.now();

    try {
      const params = new URLSearchParams({
        query: searchQuery,
        minProfitMargin: minProfitMargin.toString(),
        maxPrice: maxPrice.toString(),
        limit: '50',
        newItemsOnly: newItemsOnly.toString(),
        authenticityGuaranteeOnly: authenticityGuaranteeOnly.toString()
      });

      console.log(`🌐 Making API call to: /api/ebay-stockx-arbitrage?${params.toString()}`);
      
      const response = await fetch(`/api/ebay-stockx-arbitrage?${params.toString()}`);
      
      const elapsedTime = Date.now() - startTime;
      console.log(`⏱️ API response received in ${elapsedTime}ms with status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ HTTP error ${response.status}:`, errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log(`📦 Raw API response:`, data);
      
      if (data.success) {
        const allOpportunities = data.opportunities || [];
        console.log(`📋 Total opportunities from API: ${allOpportunities.length}`);
        
        // Update progress
        setSearchProgress(prev => ({ 
          ...prev, 
          ebayFound: data.totalEbayListings || 0,
          stockxMatched: data.totalOpportunities || 0,
          currentStep: 'Processing results...'
        }));
        setSearchStatus(`Found ${data.totalEbayListings || 0} eBay listings, ${data.totalOpportunities || 0} with StockX matches`);
        
        // Filter by confidence (showing ALL for debugging)
        const filteredOpportunities = allOpportunities.filter((opp: ArbitrageOpportunity) => 
          opp.confidence >= minConfidence
        );
        
        console.log(`🔍 After confidence filter (showing ALL for debugging): ${filteredOpportunities.length} opportunities`);
        
        setOpportunities(filteredOpportunities);
        
        if (filteredOpportunities.length > 0) {
          console.log(`✅ Found ${filteredOpportunities.length} opportunities`);
          filteredOpportunities.forEach((opp, index) => {
            console.log(`Opportunity ${index + 1}:`, {
              title: opp.ebayListing.title,
              price: opp.ebayListing.price,
              profit: opp.profit,
              margin: opp.profitMargin,
              confidence: opp.confidence
            });
          });
        }
        
        setStats({
          totalEbayListings: data.totalEbayListings || 0,
          totalOpportunities: data.totalOpportunities || 0,
          averageProfit: data.averageProfit || 0,
          averageProfitMargin: data.averageProfitMargin || 0
        });
        
        if (filteredOpportunities.length > 0) {
          setSuccessMessage(`Found ${filteredOpportunities.length} profitable arbitrage opportunities!`);
        } else {
          setSuccessMessage('Search completed, but no profitable opportunities found with current filters.');
        }
      } else {
        console.error(`❌ API returned error:`, data);
        setErrorMessage(data.error || data.message || 'Failed to search for opportunities');
      }
    } catch (error) {
      console.error('❌ Search error:', error);
      setErrorMessage('An error occurred while searching. Please try again.');
    } finally {
      const totalTime = Date.now() - startTime;
      console.log(`🏁 Search completed in ${totalTime}ms`);
      setIsLoading(false);
      
      if (!errorMessage) {
        // Clear status after a short delay if no errors
        setTimeout(() => {
          setSearchStatus('');
          setSearchProgress({ ebayFound: 0, stockxMatched: 0, currentStep: '' });
        }, 3000);
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      searchArbitrageOpportunities();
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-400';
    if (confidence >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 80) return 'High';
    if (confidence >= 60) return 'Medium';
    return 'Low';
  };

  return (
    <div className="p-4 sm:p-6 bg-gray-900 text-white min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-6 h-6 sm:w-8 sm:h-8 text-blue-400" />
              <ArrowRight className="w-4 h-4 text-gray-400" />
              <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-400" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-400 via-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              eBay → StockX Arbitrage Finder
            </h1>
          </div>
          <p className="text-gray-400 text-lg mb-4">
            Find shoes selling for less on eBay than their market value on StockX
          </p>
        </div>

        {/* StockX Authentication Status */}
        {stockxAuthStatus === 'not_authenticated' && (
          <div className="bg-yellow-900/20 border border-yellow-500 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-400" />
              <p className="text-yellow-400">
                StockX authentication required to enable price comparisons
              </p>
              <button
                onClick={() => {
                  const returnUrl = encodeURIComponent(window.location.href);
                  window.location.href = `/api/stockx/auth?returnTo=${returnUrl}`;
                }}
                className="ml-auto bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-md text-sm font-semibold transition-colors"
              >
                Connect StockX
              </button>
            </div>
          </div>
        )}

        {/* Mode Toggle */}
        <div className="mb-8">
          <div className="flex bg-gray-800 rounded-lg p-1 w-fit">
            <button
              onClick={() => setMode('bulk')}
              className={`px-6 py-3 rounded-md font-semibold transition-colors ${
                mode === 'bulk'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              🚀 Bulk Scanner
            </button>
            <button
              onClick={() => setMode('manual')}
              className={`px-6 py-3 rounded-md font-semibold transition-colors ${
                mode === 'manual'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              🔍 Manual Search
            </button>
          </div>
        </div>

        {/* StockX Authentication Status */}
        {stockxAuthStatus === 'authenticated' && (
          <div className="bg-green-900/20 border border-green-500 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <p className="text-green-400">StockX connected - Ready to find arbitrage opportunities!</p>
            </div>
          </div>
        )}

        {/* Bulk Scanner Mode */}
        {mode === 'bulk' && (
          <div className="space-y-6 mb-8">
            {/* Bulk Scanner Stats */}
            {bulkStats && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{bulkStats.totalScanned}</div>
                  <div className="text-sm text-blue-600">Items Scanned</div>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">{bulkStats.filtered}</div>
                  <div className="text-sm text-yellow-600">Filtered</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{bulkStats.opportunities}</div>
                  <div className="text-sm text-green-600">Opportunities</div>
                </div>
              </div>
            )}

            {/* Bulk Scanner Actions */}
            <div className="text-center space-y-4">
              <button
                onClick={scanForBulkOpportunities}
                disabled={bulkLoading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
              >
                {bulkLoading ? '🔄 Scanning...' : '🚀 Scan for Opportunities'}
              </button>
              
              {/* Progress Indicator */}
              {bulkLoading && (
                <div className="bg-gray-800 rounded-lg p-4 max-w-md mx-auto">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                    <span className="text-sm text-gray-300">{searchProgress.currentStep}</span>
                  </div>
                  <div className="text-xs text-gray-400 text-center">
                    {searchProgress.ebayFound > 0 && `Found ${searchProgress.ebayFound} items`}
                    {searchProgress.stockxMatched > 0 && ` • ${searchProgress.stockxMatched} matches`}
                  </div>
                </div>
              )}
              
              {/* Status Message */}
              {searchStatus && (
                <div className="bg-blue-900/20 border border-blue-500 rounded-lg p-3 max-w-md mx-auto">
                  <p className="text-blue-400 text-sm">{searchStatus}</p>
                </div>
              )}
            </div>

            {/* Bulk Scanner Error */}
            {bulkError && (
              <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                  <p className="text-red-400">{bulkError}</p>
                </div>
              </div>
            )}

            {/* Bulk Opportunities - Neon Theme */}
            {bulkOpportunities.length > 0 && (
              <div className="space-y-6">
                <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400">
                  ⚡ Bulk Opportunities
                </h3>
                {bulkOpportunities.map((opportunity, index) => (
                  <div key={index} className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-xl shadow-2xl p-6 border-2 border-cyan-500/30 hover:border-cyan-400/60 transition-all duration-300 hover:shadow-cyan-500/20 hover:shadow-xl">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* eBay Item - Neon Blue */}
                      <div className="space-y-4">
                        <h4 className="font-bold text-cyan-400 text-lg flex items-center gap-2">
                          <span className="text-2xl">🛒</span>
                          eBay Item
                        </h4>
                        <div className="flex gap-4">
                          <img
                            src={opportunity.ebayItem.imageUrl || '/placeholder-shoe.png'}
                            alt={opportunity.ebayItem.title}
                            className="w-24 h-24 object-cover rounded-lg border-2 border-cyan-400/50 shadow-lg"
                          />
                          <div className="flex-1">
                            <h5 className="font-bold text-white mb-2 text-sm leading-tight">
                              {opportunity.ebayItem.title}
                            </h5>
                            <div className="text-xs text-cyan-300 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-cyan-400">🏷️</span>
                                <span className="font-semibold">{opportunity.ebayItem.brand}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-cyan-400">⭐</span>
                                <span>{opportunity.ebayItem.condition}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-cyan-400">👤</span>
                                <span>{opportunity.ebayItem.sellerUsername}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-cyan-400">📊</span>
                                <span>{opportunity.ebayItem.sellerFeedbackPercentage}% ({opportunity.ebayItem.sellerFeedbackScore})</span>
                              </div>
                              {opportunity.ebayItem.gtin && (
                                <div className="flex items-center gap-2">
                                  <span className="text-cyan-400">🔢</span>
                                  <span>GTIN: {opportunity.ebayItem.gtin}</span>
                                </div>
                              )}
                              {opportunity.styleCode && (
                                <div className="flex items-center gap-2">
                                  <span className="text-cyan-400">🎨</span>
                                  <span>Style: {opportunity.styleCode}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* StockX Match - Neon Green */}
                      <div className="space-y-4">
                        <h4 className="font-bold text-green-400 text-lg flex items-center gap-2">
                          <span className="text-2xl">📈</span>
                          StockX Match
                        </h4>
                        <div className="bg-gradient-to-br from-green-900/30 to-emerald-900/30 p-4 rounded-lg border border-green-400/30">
                          <div className="font-bold text-green-300 mb-3">{opportunity.matchedProduct}</div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between items-center">
                              <span className="text-green-400">Lowest Ask:</span>
                              <span className="font-bold text-green-300">${opportunity.stockxProduct.lowestAsk}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-green-400">Highest Bid:</span>
                              <span className="font-bold text-green-300">${opportunity.stockxProduct.highestBid}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-green-400">Last Sale:</span>
                              <span className="font-bold text-green-300">${opportunity.stockxProduct.lastSale}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Profit Analysis - Neon Purple/Pink */}
                    <div className="mt-6 pt-6 border-t border-purple-400/30">
                      <div className="grid grid-cols-2 gap-4 text-center">
                        <div className="bg-gradient-to-r from-cyan-900/30 to-blue-900/30 p-3 rounded-lg border border-cyan-400/30">
                          <div className="text-xs text-cyan-400 font-semibold">eBay Price</div>
                          <div className="text-xl font-bold text-cyan-300">
                            ${opportunity.ebayItem.priceValue}
                          </div>
                        </div>
                        <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 p-3 rounded-lg border border-green-400/30">
                          <div className="text-xs text-green-400 font-semibold">StockX Ask</div>
                          <div className="text-xl font-bold text-green-300">
                            ${opportunity.stockxProduct.lowestAsk}
                          </div>
                        </div>
                        <div className="col-span-2 bg-gradient-to-r from-purple-900/30 to-pink-900/30 p-4 rounded-lg border border-purple-400/30">
                          <div className="text-xs text-purple-400 font-semibold">Potential Profit</div>
                          <div className="text-3xl font-bold">
                            <span className={`font-bold ${opportunity.profit > 0 ? 'text-green-400' : 'text-red-400'}`}>
                              ${opportunity.profit.toFixed(2)}
                            </span>
                          </div>
                          <div className="text-sm">
                            <span className={`font-bold ${opportunity.profitPercentage > 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {opportunity.profitPercentage.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions - Neon Buttons */}
                      <div className="mt-4 flex gap-2 flex-wrap">
                        <span className={`px-4 py-2 rounded-full text-xs font-bold ${
                          opportunity.profit > 0 
                            ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/30' 
                            : 'bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-lg shadow-red-500/30'
                        }`}>
                          ${opportunity.profit.toFixed(2)} Profit
                        </span>
                        <span className={`px-4 py-2 rounded-full text-xs font-bold ${
                          opportunity.confidence > 80 
                            ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/30' 
                            : opportunity.confidence > 60 
                            ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-lg shadow-yellow-500/30' 
                            : 'bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-lg shadow-red-500/30'
                        }`}>
                          {opportunity.confidence}% Match
                        </span>
                        <span className="px-4 py-2 rounded-full text-xs font-bold bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/30">
                          {opportunity.searchMethod.toUpperCase()}
                        </span>
                        <a
                          href={opportunity.ebayItem.itemWebUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 rounded-full text-xs font-bold bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-400 hover:to-cyan-400 transition-all duration-300 shadow-lg shadow-blue-500/30 hover:shadow-blue-400/50"
                        >
                          View on eBay
                        </a>
                        <a
                          href={`https://stockx.com/${opportunity.stockxProduct.urlKey}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 rounded-full text-xs font-bold bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-400 hover:to-emerald-400 transition-all duration-300 shadow-lg shadow-green-500/30 hover:shadow-green-400/50"
                        >
                          View on StockX
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Bulk Scanner Empty State */}
            {bulkOpportunities.length === 0 && !bulkLoading && (
              <div className="text-center py-12">
                <div className="bg-gray-800 rounded-lg p-8">
                  <div className="text-6xl mb-4">🚀</div>
                  <h3 className="text-xl font-semibold text-gray-300 mb-2">Ready to Scan for Opportunities</h3>
                  <p className="text-gray-400 max-w-md mx-auto">
                    Click the scan button to automatically find profitable arbitrage opportunities from eBay listings.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Manual Search Mode */}
        {mode === 'manual' && (
          <div className="space-y-4 mb-6 sm:mb-8">
            {/* Main Search */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Search for Shoes
                </label>
                <input
                  type="text"
                  placeholder="e.g., Jordan 1 High, Yeezy 350 V2, Nike Dunk Low..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => setSearchQuery('Jordan 1 High')}
                    className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded transition-colors"
                  >
                    Jordan 1 High
                  </button>
                  <button
                    onClick={() => setSearchQuery('Yeezy 350 V2')}
                    className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded transition-colors"
                  >
                    Yeezy 350 V2
                  </button>
                  <button
                    onClick={() => setSearchQuery('Nike Dunk Low')}
                    className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded transition-colors"
                  >
                    Nike Dunk Low
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Min Profit Margin: {minProfitMargin}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={minProfitMargin}
                  onChange={(e) => setMinProfitMargin(parseFloat(e.target.value) || 0)}
                  className="w-full"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={searchArbitrageOpportunities}
                  disabled={isLoading || !searchQuery.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Searching...
                    </div>
                  ) : (
                    'Search Opportunities'
                  )}
                </button>
              </div>
            </div>

            {/* Advanced Filters */}
            <div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                <Filter className="w-4 h-4" />
                Advanced Filters
                {showFilters ? '▼' : '▶'}
              </button>
              
              {showFilters && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 p-4 bg-gray-800/50 rounded-lg">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Max eBay Price: ${maxPrice}
                    </label>
                    <input
                      type="range"
                      min="50"
                      max="2000"
                      step="50"
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(parseInt(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>$50</span>
                      <span>$2000</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Min Match Confidence: {minConfidence}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="10"
                      value={minConfidence}
                      onChange={(e) => setMinConfidence(parseInt(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>0%</span>
                      <span>100%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Item Condition
                    </label>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-sm text-gray-300">
                        <input
                          type="checkbox"
                          checked={newItemsOnly}
                          onChange={(e) => setNewItemsOnly(e.target.checked)}
                          className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                        />
                        New items only
                      </label>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      StockX only accepts new items
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center space-x-2">
                      <label className="flex items-center space-x-2 text-sm text-gray-300">
                        <input
                          type="checkbox"
                          checked={authenticityGuaranteeOnly}
                          onChange={(e) => setAuthenticityGuaranteeOnly(e.target.checked)}
                          className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                        />
                        Authenticity Guarantee only
                      </label>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      Only show eBay items with authenticity guarantee
                    </div>
                  </div>
                  <div className="flex items-end">
                    <div className="text-sm text-gray-400 w-full">
                      <p className="mb-1">🎯 Filter Tips:</p>
                      <ul className="text-xs space-y-0.5">
                        <li>• Higher confidence = better matches</li>
                        <li>• Lower max price = more budget-friendly deals</li>
                        <li>• Higher profit % = more selective results</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Messages */}
        {successMessage && (
          <div className="bg-green-900/20 border border-green-500 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <p className="text-green-400">{successMessage}</p>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <p className="text-red-400">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Search Progress */}
        {isLoading && (
          <div className="bg-blue-900/20 border border-blue-500 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
              <p className="text-blue-400">{searchStatus}</p>
            </div>
            {searchProgress.currentStep && (
              <div className="mt-2 text-sm text-blue-300">
                {searchProgress.currentStep}
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        {stats && opportunities.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">eBay Listings</p>
                  <p className="text-2xl font-bold text-white">{stats.totalEbayListings}</p>
                </div>
                <ShoppingCart className="w-8 h-8 text-blue-400" />
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">StockX Matches</p>
                  <p className="text-2xl font-bold text-white">{stats.totalOpportunities}</p>
                </div>
                <Target className="w-8 h-8 text-emerald-400" />
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Avg Profit</p>
                  <p className="text-2xl font-bold text-white">{formatCurrency(stats.averageProfit)}</p>
                </div>
                <DollarSign className="w-8 h-8 text-green-400" />
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Avg Margin</p>
                  <p className="text-2xl font-bold text-white">{stats.averageProfitMargin.toFixed(1)}%</p>
                </div>
                <Percent className="w-8 h-8 text-yellow-400" />
              </div>
            </div>
          </div>
        )}

        {/* Opportunities */}
        {opportunities.length > 0 && (
          <div className="space-y-6">
            {opportunities.map((opportunity, index) => (
              <div key={`${opportunity.ebayListing.itemId}-${index}`} className="bg-gray-800 rounded-lg p-6">
                {/* Header */}
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
                  <div className="flex gap-4">
                    <img
                      src={opportunity.ebayListing.image}
                      alt={opportunity.ebayListing.title}
                      className="w-20 h-20 object-cover rounded-lg"
                    />
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-2">
                        {opportunity.ebayListing.title}
                      </h3>
                      <div className="text-sm text-gray-400 space-y-1">
                        <div>Seller: {opportunity.ebayListing.seller}</div>
                        <div>Condition: {opportunity.ebayListing.condition}</div>
                        {opportunity.ebayListing.shipping && (
                          <div>Shipping: {formatCurrency(opportunity.ebayListing.shipping)}</div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => window.open(opportunity.ebayListing.url, '_blank')}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View on eBay
                    </button>
                    {opportunity.matchedProduct && (
                      <button
                        onClick={() => {
                          const stockxUrl = `https://stockx.com/search?s=${encodeURIComponent(opportunity.matchedProduct || '')}`;
                          window.open(stockxUrl, '_blank');
                        }}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
                      >
                        <ExternalLink className="w-4 h-4" />
                        View on StockX
                      </button>
                    )}
                  </div>
                </div>

                {/* Price Comparison */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  <div className="bg-gray-700 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-gray-300 mb-2">eBay Price</h4>
                    <div className="text-2xl font-bold text-white">
                      {formatCurrency(opportunity.ebayListing.price)}
                    </div>
                    <div className="text-sm text-gray-400">
                      + {formatCurrency(opportunity.ebayListing.shipping || 0)} shipping
                    </div>
                  </div>
                  <div className="bg-gray-700 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-gray-300 mb-2">StockX Ask</h4>
                    <div className="text-2xl font-bold text-white">
                      {formatCurrency(opportunity.stockxData?.lowestAsk || 0)}
                    </div>
                    <div className="text-sm text-gray-400">
                      {opportunity.stockxData?.size && (
                        <div>Size: {opportunity.stockxData.size}</div>
                      )}
                    </div>
                  </div>
                  <div className="bg-gray-700 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-gray-300 mb-2">Potential Profit</h4>
                    <div className="text-2xl font-bold text-green-400">
                      {formatCurrency(opportunity.profit)}
                    </div>
                    <div className="text-sm text-green-300">
                      {opportunity.profitMargin.toFixed(1)}% margin
                    </div>
                  </div>
                </div>

                {/* Match Details */}
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Star className={`w-4 h-4 ${getConfidenceColor(opportunity.confidence)}`} />
                    <span className="text-gray-400">Match Confidence:</span>
                    <span className={`text-sm font-semibold ${getConfidenceColor(opportunity.confidence)}`}>
                      {opportunity.confidence}% ({getConfidenceLabel(opportunity.confidence)})
                    </span>
                  </div>
                  {opportunity.stockxData?.size && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">Size:</span>
                      <span className="text-white">{opportunity.stockxData.size}</span>
                    </div>
                  )}
                  {opportunity.searchMethod && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">Search Method:</span>
                      <span className="text-white">{opportunity.searchMethod.toUpperCase()}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && opportunities.length === 0 && !errorMessage && searchQuery && (
          <div className="text-center py-12">
            <div className="bg-gray-800 rounded-lg p-8">
              <div className="text-6xl mb-4">🔍</div>
              <h3 className="text-xl font-semibold text-gray-300 mb-2">No Profitable Opportunities Found</h3>
              <p className="text-gray-400 max-w-md mx-auto">
                We searched eBay but couldn't find any shoes that would be profitable to flip on StockX 
                with your current criteria. Try adjusting your filters or searching for different products.
              </p>
            </div>
          </div>
        )}

        {/* Initial State */}
        {!isLoading && opportunities.length === 0 && !searchQuery && (
          <div className="text-center py-12">
            <div className="bg-gray-800 rounded-lg p-8">
              <div className="text-6xl mb-4">💎</div>
              <h3 className="text-xl font-semibold text-gray-300 mb-2">Ready to Find Profitable Deals</h3>
              <p className="text-gray-400 max-w-md mx-auto">
                Search for popular shoe models to find deals on eBay that you could profit from by selling on StockX. 
                We'll analyze prices, fees, and shipping to calculate your potential profit.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EbayStockXArbitrage;