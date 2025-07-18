'use client';

import React, { useState, useEffect } from 'react';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { DollarSign, TrendingDown, Target, Zap, RefreshCw, AlertTriangle, CheckCircle, Loader, Package } from 'lucide-react';

interface RepricingStrategy {
  type: 'competitive' | 'margin_based' | 'velocity_based' | 'hybrid';
  settings: {
    minProfitMargin?: number;
    maxPriceReduction?: number;
    competitiveBuffer?: number;
    velocityThreshold?: number;
    maxDaysListed?: number;
    aggressiveness?: 'conservative' | 'moderate' | 'aggressive';
  };
}

interface Listing {
  listingId: string;
  productId: string;
  variantId: string;
  productName: string;
  size: string;
  currentPrice: number;
  originalPrice: number;
  costBasis: number;
  daysListed: number;
  views: number;
  saves: number;
  selected: boolean;
}

interface RepricingResult {
  listingId: string;
  currentPrice: number;
  newPrice: number;
  action: string;
  reason: string;
  profitChange: number;
  competitivePosition: string;
}

export default function StockXRepricing() {
  const { currentTheme } = useTheme();
  const isNeon = currentTheme.name.toLowerCase() === 'neon';
  
  // Debug theme detection
  useEffect(() => {
    console.log('StockX Repricing Theme:', currentTheme.name, 'isNeon:', isNeon);
  }, [currentTheme, isNeon]);
  
  const [listings, setListings] = useState<Listing[]>([]);
  const [strategy, setStrategy] = useState<RepricingStrategy>({
    type: 'competitive',
    settings: {
      minProfitMargin: 0.15,
      maxPriceReduction: 0.20,
      competitiveBuffer: 1,
      maxDaysListed: 30,
      aggressiveness: 'moderate'
    }
  });
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<RepricingResult[]>([]);
  const [dryRun, setDryRun] = useState(true);
  const [notificationEmail, setNotificationEmail] = useState('');
  const [authenticated, setAuthenticated] = useState(true); // Assume authenticated initially
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    // Check if we're returning from authentication
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('authenticated') === 'true') {
      // Remove the parameter from URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    fetchListings();
  }, []);

  const fetchListings = async () => {
    setLoading(true);
    setAuthError(false);
    try {
      const response = await fetch('/api/stockx/listings');
      
      // Check if authentication failed
      if (response.status === 401 || response.status === 403) {
        setAuthenticated(false);
        setAuthError(true);
        setListings([]);
        return;
      }
      
      const data = await response.json();
      
      if (data.success && data.listings && Array.isArray(data.listings)) {
        setAuthenticated(true); // User is authenticated if we got listings
        const enrichedListings = data.listings.map((listing: any) => ({
          ...listing,
          selected: false,
          costBasis: listing.price * 0.8, // Example: assume 80% cost basis
          daysListed: Math.floor(Math.random() * 60), // Mock days listed
          views: Math.floor(Math.random() * 100),
          saves: Math.floor(Math.random() * 20)
        }));
        setListings(enrichedListings);
      } else if (data.error && data.error.includes('token')) {
        // Token related error
        setAuthenticated(false);
        setAuthError(true);
        setListings([]);
      } else {
        console.log('No listings found or invalid response:', data);
        setListings([]);
      }
    } catch (error) {
      console.error('Failed to fetch listings:', error);
      setListings([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleListingSelection = (listingId: string) => {
    setListings(prev => prev.map(listing => 
      listing.listingId === listingId 
        ? { ...listing, selected: !listing.selected }
        : listing
    ));
  };

  const selectAll = () => {
    const allSelected = listings.every(listing => listing.selected);
    setListings(prev => prev.map(listing => ({ ...listing, selected: !allSelected })));
  };

  const executeRepricing = async () => {
    const selectedListings = listings.filter(listing => listing.selected);
    
    if (selectedListings.length === 0) {
      alert('Please select at least one listing to reprice');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/stockx/repricing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          listings: selectedListings,
          strategy,
          dryRun,
          notificationEmail: notificationEmail || undefined
        })
      });

      const data = await response.json();
      
      if (data.success && data.results && Array.isArray(data.results)) {
        setResults(data.results);
        // Refresh listings after repricing
        if (!dryRun) {
          await fetchListings();
        }
      } else {
        alert(`Repricing failed: ${data.error || 'Unknown error'}`);
        setResults([]);
      }
    } catch (error) {
      console.error('Repricing error:', error);
      alert('Failed to execute repricing');
    } finally {
      setLoading(false);
    }
  };

  const getStrategyDescription = (type: string) => {
    switch (type) {
      case 'competitive':
        return 'Price just below the current lowest ask to maximize sales velocity';
      case 'margin_based':
        return 'Maintain minimum profit margins while staying competitive';
      case 'velocity_based':
        return 'Reduce prices on slow-moving inventory after specified days';
      case 'hybrid':
        return 'Combine multiple strategies for optimal balance of profit and velocity';
      default:
        return '';
    }
  };

  const getCompetitivePositionColor = (position: string) => {
    switch (position) {
      case 'lowest_ask':
        return 'text-green-600';
      case 'competitive':
        return 'text-blue-600';
      case 'market_price':
        return 'text-yellow-600';
      case 'premium':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  if (!authenticated || authError) {
    return (
      <div className={`min-h-screen p-6 ${isNeon ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <h2 className={`text-2xl font-bold mb-4 ${isNeon ? 'text-cyan-400' : 'text-gray-900'}`}>
          StockX Repricing
        </h2>
        <div className="text-center py-8">
          <p className={`mb-4 ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
            {authError 
              ? "Your StockX session has expired. Please re-authenticate to continue."
              : "Please authenticate with StockX to use the repricing feature."}
          </p>
          <button 
            onClick={() => window.location.href = '/api/stockx/auth?returnTo=' + encodeURIComponent(window.location.origin + '/dashboard?view=stockx-repricing')}
            className={`px-6 py-2 rounded-lg font-semibold transition-all duration-200 ${
              isNeon 
                ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 text-white'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {authError ? "Re-authenticate with StockX" : "Authenticate with StockX"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen p-6 ${isNeon ? 'bg-gray-900 text-white' : 'bg-gray-50'} space-y-6`}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className={`text-3xl font-bold ${
            isNeon ? 'bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent' : 'text-gray-900'
          }`}>
            StockX Automated Repricing
          </h2>
          <p className={`mt-2 ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
            Optimize your listing prices with intelligent repricing strategies
          </p>
        </div>
        <button
          onClick={fetchListings}
          disabled={loading}
          className={`px-6 py-3 rounded-lg font-semibold transition-all duration-200 flex items-center gap-2 ${
            isNeon
              ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 text-white disabled:opacity-50'
              : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
          }`}
        >
          {loading ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              Refresh Listings
            </>
          )}
        </button>
      </div>

      {/* Strategy Selection */}
      <div className={`rounded-lg p-6 ${
        isNeon ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
      }`}>
        <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${
          isNeon ? 'text-cyan-400' : 'text-gray-900'
        }`}>
          <Target className="w-5 h-5" />
          Repricing Strategy
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {(['competitive', 'margin_based', 'velocity_based', 'hybrid'] as const).map((type) => (
            <label key={type} className={`flex items-center space-x-3 cursor-pointer p-4 rounded-lg border-2 transition-all ${
              strategy.type === type
                ? isNeon 
                  ? 'bg-cyan-500/10 border-cyan-500' 
                  : 'bg-blue-50 border-blue-500'
                : isNeon
                  ? 'bg-gray-900 border-gray-700 hover:border-gray-600'
                  : 'bg-white border-gray-200 hover:border-gray-300'
            }`}>
              <input
                type="radio"
                name="strategy"
                value={type}
                checked={strategy.type === type}
                onChange={(e) => setStrategy(prev => ({ ...prev, type: e.target.value as any }))}
                className={`w-4 h-4 ${isNeon ? 'text-cyan-500' : 'text-blue-600'}`}
              />
              <div className="flex-1">
                <div className={`font-medium capitalize ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                  {type.replace('_', ' ')}
                </div>
                <div className={`text-sm ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                  {getStrategyDescription(type)}
                </div>
              </div>
            </label>
          ))}
        </div>

        {/* Strategy Settings */}
        <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-lg ${
          isNeon ? 'bg-gray-900' : 'bg-gray-50'
        }`}>
          <div>
            <label className={`block text-sm font-medium mb-1 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
              Min Profit Margin
            </label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={strategy.settings.minProfitMargin || 0.15}
              onChange={(e) => setStrategy(prev => ({
                ...prev,
                settings: { ...prev.settings, minProfitMargin: parseFloat(e.target.value) }
              }))}
              className={`w-full p-2 rounded-md ${
                isNeon 
                  ? 'bg-gray-800 border border-gray-700 text-white focus:border-cyan-500 focus:outline-none'
                  : 'bg-white border border-gray-300 focus:border-blue-500 focus:outline-none'
              }`}
            />
          </div>
          
          <div>
            <label className={`block text-sm font-medium mb-1 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
              Max Price Reduction
            </label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={strategy.settings.maxPriceReduction || 0.20}
              onChange={(e) => setStrategy(prev => ({
                ...prev,
                settings: { ...prev.settings, maxPriceReduction: parseFloat(e.target.value) }
              }))}
              className={`w-full p-2 rounded-md ${
                isNeon 
                  ? 'bg-gray-800 border border-gray-700 text-white focus:border-cyan-500 focus:outline-none'
                  : 'bg-white border border-gray-300 focus:border-blue-500 focus:outline-none'
              }`}
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-1 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
              Competitive Buffer ($)
            </label>
            <input
              type="number"
              min="0"
              value={strategy.settings.competitiveBuffer || 1}
              onChange={(e) => setStrategy(prev => ({
                ...prev,
                settings: { ...prev.settings, competitiveBuffer: parseInt(e.target.value) }
              }))}
              className={`w-full p-2 rounded-md ${
                isNeon 
                  ? 'bg-gray-800 border border-gray-700 text-white focus:border-cyan-500 focus:outline-none'
                  : 'bg-white border border-gray-300 focus:border-blue-500 focus:outline-none'
              }`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Max Days Listed</label>
            <input
              type="number"
              min="1"
              value={strategy.settings.maxDaysListed || 30}
              onChange={(e) => setStrategy(prev => ({
                ...prev,
                settings: { ...prev.settings, maxDaysListed: parseInt(e.target.value) }
              }))}
              className="w-full p-2 border rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Aggressiveness</label>
            <select
              value={strategy.settings.aggressiveness || 'moderate'}
              onChange={(e) => setStrategy(prev => ({
                ...prev,
                settings: { ...prev.settings, aggressiveness: e.target.value as any }
              }))}
              className="w-full p-2 border rounded-md"
            >
              <option value="conservative">Conservative</option>
              <option value="moderate">Moderate</option>
              <option value="aggressive">Aggressive</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notification Email</label>
            <input
              type="email"
              value={notificationEmail}
              onChange={(e) => setNotificationEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full p-2 border rounded-md"
            />
          </div>
        </div>
      </div>

      {/* Listings Selection */}
      <div className={`rounded-lg p-6 ${
        isNeon ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-lg font-semibold flex items-center gap-2 ${
            isNeon ? 'text-cyan-400' : 'text-gray-900'
          }`}>
            <Package className="w-5 h-5" />
            Select Listings to Reprice
          </h3>
          {listings.length > 0 && (
            <button
              onClick={selectAll}
              className={`font-medium transition-colors ${
                isNeon 
                  ? 'text-cyan-400 hover:text-cyan-300' 
                  : 'text-blue-600 hover:text-blue-800'
              }`}
            >
              {listings.every(l => l.selected) ? 'Deselect All' : 'Select All'}
            </button>
          )}
        </div>

        {listings.length === 0 ? (
          <div className={`text-center py-8 ${isNeon ? 'text-gray-400' : 'text-gray-500'}`}>
            <p>No listings found. Click "Refresh Listings" to load your StockX listings.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${isNeon ? 'border-gray-700' : 'border-gray-200'}`}>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Select</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Product</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Size</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Current Price</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Days Listed</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Views</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Saves</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((listing) => (
                  <tr key={listing.listingId} className={`border-b transition-colors ${
                    isNeon 
                      ? 'border-gray-700 hover:bg-gray-700/50' 
                      : 'border-gray-100 hover:bg-gray-50'
                  }`}>
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={listing.selected}
                        onChange={() => toggleListingSelection(listing.listingId)}
                        className={`w-4 h-4 ${isNeon ? 'text-cyan-500' : 'text-blue-600'}`}
                      />
                    </td>
                    <td className="p-3">
                      <div className={`font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                        {listing.productName}
                      </div>
                    </td>
                    <td className={`p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>{listing.size}</td>
                    <td className={`p-3 font-medium ${isNeon ? 'text-cyan-400' : 'text-gray-900'}`}>
                      ${listing.currentPrice}
                    </td>
                    <td className={`p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>{listing.daysListed}</td>
                    <td className={`p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>{listing.views}</td>
                    <td className={`p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>{listing.saves}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Execution Controls */}
      <div className={`flex items-center justify-between p-6 rounded-lg ${
        isNeon ? 'bg-gray-800' : 'bg-gray-50'
      }`}>
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className={`w-4 h-4 ${isNeon ? 'text-cyan-500' : 'text-blue-600'}`}
            />
            <span className={isNeon ? 'text-gray-300' : 'text-gray-700'}>
              Dry Run (Preview Only)
            </span>
          </label>
        </div>
        
        <button
          onClick={executeRepricing}
          disabled={loading || listings.filter(l => l.selected).length === 0}
          className={`px-6 py-3 rounded-lg font-semibold transition-all duration-200 flex items-center gap-2 disabled:opacity-50 ${
            dryRun 
              ? isNeon
                ? 'bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white'
                : 'bg-blue-600 text-white hover:bg-blue-700'
              : isNeon
                ? 'bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white'
                : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          {loading ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              {dryRun ? <AlertTriangle className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
              {dryRun ? 'Preview Repricing' : 'Execute Repricing'}
            </>
          )}
        </button>
      </div>

      {/* Results */}
      {results && results.length > 0 && (
        <div className={`rounded-lg p-6 ${
          isNeon ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
        }`}>
          <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${
            isNeon ? 'text-cyan-400' : 'text-gray-900'
          }`}>
            <CheckCircle className="w-5 h-5" />
            Repricing Results {dryRun && '(Preview)'}
          </h3>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${isNeon ? 'border-gray-700' : 'border-gray-200'}`}>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Product</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Current Price</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>New Price</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Change</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Action</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Position</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => {
                  const listing = listings.find(l => l.listingId === result.listingId);
                  const priceChange = result.newPrice - result.currentPrice;
                  const priceChangePercent = (priceChange / result.currentPrice) * 100;
                  
                  return (
                    <tr key={result.listingId} className={`border-b ${
                      isNeon ? 'border-gray-700' : 'border-gray-100'
                    }`}>
                      <td className="p-3">
                        <div className={`font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                          {listing?.productName}
                        </div>
                        <div className={isNeon ? 'text-gray-400 text-sm' : 'text-gray-600 text-sm'}>
                          Size {listing?.size}
                        </div>
                      </td>
                      <td className={`p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                        ${result.currentPrice}
                      </td>
                      <td className={`p-3 font-medium ${isNeon ? 'text-cyan-400' : 'text-gray-900'}`}>
                        ${result.newPrice}
                      </td>
                      <td className="p-3">
                        <div className={`font-medium ${
                          priceChange >= 0 
                            ? isNeon ? 'text-emerald-400' : 'text-green-600'
                            : isNeon ? 'text-red-400' : 'text-red-600'
                        }`}>
                          {priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}
                        </div>
                        <div className={`text-xs ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                          ({priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(1)}%)
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          result.action === 'updated' || result.action === 'would_update' 
                            ? isNeon 
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-green-100 text-green-800'
                            : isNeon
                              ? 'bg-gray-700 text-gray-300 border border-gray-600'
                              : 'bg-gray-100 text-gray-800'
                        }`}>
                          {result.action.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`font-medium ${
                          isNeon 
                            ? result.competitivePosition === 'lowest_ask' 
                              ? 'text-emerald-400'
                              : result.competitivePosition === 'competitive'
                              ? 'text-cyan-400'
                              : 'text-gray-400'
                            : getCompetitivePositionColor(result.competitivePosition)
                        }`}>
                          {result.competitivePosition.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
} 