'use client';

import React, { useState, useEffect } from 'react';

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
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    checkAuthentication();
    fetchListings();
  }, []);

  const checkAuthentication = async () => {
    try {
      const response = await fetch('/api/stockx/test-api-key');
      const data = await response.json();
      setAuthenticated(data.success && data.authenticated);
    } catch (error) {
      console.error('Auth check failed:', error);
      setAuthenticated(false);
    }
  };

  const fetchListings = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/stockx/listings');
      const data = await response.json();
      
      if (data.success && data.listings && Array.isArray(data.listings)) {
        const enrichedListings = data.listings.map((listing: any) => ({
          ...listing,
          selected: false,
          costBasis: listing.price * 0.8, // Example: assume 80% cost basis
          daysListed: Math.floor(Math.random() * 60), // Mock days listed
          views: Math.floor(Math.random() * 100),
          saves: Math.floor(Math.random() * 20)
        }));
        setListings(enrichedListings);
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

  if (!authenticated) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-lg">
        <h2 className="text-2xl font-bold mb-4">StockX Repricing</h2>
        <div className="text-center py-8">
          <p className="text-gray-600 mb-4">Please authenticate with StockX to use the repricing feature.</p>
          <button 
            onClick={() => window.location.href = '/api/stockx/auth?returnTo=' + encodeURIComponent(window.location.origin + '/dashboard?view=stockx-repricing')}
            className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700"
          >
            Authenticate with StockX
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">StockX Automated Repricing</h2>
        <button
          onClick={fetchListings}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh Listings'}
        </button>
      </div>

      {/* Strategy Selection */}
      <div className="border rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4">Repricing Strategy</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {(['competitive', 'margin_based', 'velocity_based', 'hybrid'] as const).map((type) => (
            <label key={type} className="flex items-center space-x-3 cursor-pointer">
              <input
                type="radio"
                name="strategy"
                value={type}
                checked={strategy.type === type}
                onChange={(e) => setStrategy(prev => ({ ...prev, type: e.target.value as any }))}
                className="w-4 h-4 text-blue-600"
              />
              <div>
                <div className="font-medium capitalize">{type.replace('_', ' ')}</div>
                <div className="text-sm text-gray-600">{getStrategyDescription(type)}</div>
              </div>
            </label>
          ))}
        </div>

        {/* Strategy Settings */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
          <div>
            <label className="block text-sm font-medium mb-1">Min Profit Margin</label>
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
              className="w-full p-2 border rounded-md"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Max Price Reduction</label>
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
              className="w-full p-2 border rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Competitive Buffer ($)</label>
            <input
              type="number"
              min="0"
              value={strategy.settings.competitiveBuffer || 1}
              onChange={(e) => setStrategy(prev => ({
                ...prev,
                settings: { ...prev.settings, competitiveBuffer: parseInt(e.target.value) }
              }))}
              className="w-full p-2 border rounded-md"
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
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Select Listings to Reprice</h3>
          {listings.length > 0 && (
            <button
              onClick={selectAll}
              className="text-blue-600 hover:text-blue-800"
            >
              {listings.every(l => l.selected) ? 'Deselect All' : 'Select All'}
            </button>
          )}
        </div>

        {listings.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No listings found. Click "Refresh Listings" to load your StockX listings.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Select</th>
                  <th className="text-left p-2">Product</th>
                  <th className="text-left p-2">Size</th>
                  <th className="text-left p-2">Current Price</th>
                  <th className="text-left p-2">Days Listed</th>
                  <th className="text-left p-2">Views</th>
                  <th className="text-left p-2">Saves</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((listing) => (
                  <tr key={listing.listingId} className="border-b hover:bg-gray-50">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={listing.selected}
                        onChange={() => toggleListingSelection(listing.listingId)}
                        className="w-4 h-4 text-blue-600"
                      />
                    </td>
                    <td className="p-2">
                      <div className="font-medium">{listing.productName}</div>
                    </td>
                    <td className="p-2">{listing.size}</td>
                    <td className="p-2">${listing.currentPrice}</td>
                    <td className="p-2">{listing.daysListed}</td>
                    <td className="p-2">{listing.views}</td>
                    <td className="p-2">{listing.saves}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Execution Controls */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="w-4 h-4 text-blue-600"
            />
            <span>Dry Run (Preview Only)</span>
          </label>
        </div>
        
        <button
          onClick={executeRepricing}
          disabled={loading || listings.filter(l => l.selected).length === 0}
          className={`px-6 py-2 rounded-lg font-medium ${
            dryRun 
              ? 'bg-blue-600 text-white hover:bg-blue-700' 
              : 'bg-green-600 text-white hover:bg-green-700'
          } disabled:opacity-50`}
        >
          {loading ? 'Processing...' : (dryRun ? 'Preview Repricing' : 'Execute Repricing')}
        </button>
      </div>

      {/* Results */}
      {results && results.length > 0 && (
        <div className="border rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4">
            Repricing Results {dryRun && '(Preview)'}
          </h3>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Product</th>
                  <th className="text-left p-2">Current Price</th>
                  <th className="text-left p-2">New Price</th>
                  <th className="text-left p-2">Change</th>
                  <th className="text-left p-2">Action</th>
                  <th className="text-left p-2">Position</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => {
                  const listing = listings.find(l => l.listingId === result.listingId);
                  const priceChange = result.newPrice - result.currentPrice;
                  const priceChangePercent = (priceChange / result.currentPrice) * 100;
                  
                  return (
                    <tr key={result.listingId} className="border-b">
                      <td className="p-2">
                        <div className="font-medium">{listing?.productName}</div>
                        <div className="text-gray-600">{listing?.size}</div>
                      </td>
                      <td className="p-2">${result.currentPrice}</td>
                      <td className="p-2">${result.newPrice}</td>
                      <td className="p-2">
                        <div className={`${priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-600">
                          ({priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(1)}%)
                        </div>
                      </td>
                      <td className="p-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          result.action === 'updated' || result.action === 'would_update' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {result.action.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="p-2">
                        <span className={`font-medium ${getCompetitivePositionColor(result.competitivePosition)}`}>
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