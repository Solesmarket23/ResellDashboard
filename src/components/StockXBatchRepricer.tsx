'use client';

import React, { useState, useEffect, useRef } from 'react';
import { TrendingDown, AlertCircle, Loader2, Info, DollarSign, Package, RefreshCw, Settings, Play, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { useAuth } from '@/lib/contexts/AuthContext';

interface StockXListing {
  id: string;
  listingId: string;
  productName: string;
  size: string;
  currentPrice: number;
  lowestAsk?: number;
  highestBid?: number;
  daysListed: number;
  imageUrl?: string;
  sku?: string;
  selected?: boolean;
  newPrice?: number;
  priceDifference?: number;
}

interface RepricingResult {
  batch: number;
  success: boolean;
  processed?: number;
  updated?: number;
  failed?: number;
  error?: string;
}

interface BatchProgress {
  currentBatch: number;
  totalBatches: number;
  itemsProcessed: number;
  totalItems: number;
  status: string;
  results: RepricingResult[];
}

const StockXBatchRepricer: React.FC = () => {
  const { currentTheme } = useTheme();
  const { user } = useAuth();
  const isNeon = currentTheme.name.toLowerCase() === 'neon';
  
  const [listings, setListings] = useState<StockXListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [repricing, setRepricing] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<'undercut' | 'match' | 'percentage' | 'custom'>('undercut');
  const [undercutAmount, setUndercutAmount] = useState(1);
  const [percentageAmount, setPercentageAmount] = useState(5);
  const [selectAll, setSelectAll] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [rateLimitInfo, setRateLimitInfo] = useState<any>(null);
  
  // Continuation handling for multi-batch operations
  const [continuationToken, setContinuationToken] = useState<string | null>(null);
  const continuationTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load listings
  const loadListings = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/stockx/listings?status=active');
      if (response.ok) {
        const data = await response.json();
        setListings(data.listings.map((listing: any) => ({
          id: listing.id,
          listingId: listing.id,
          productName: listing.product?.title || 'Unknown',
          size: listing.size || 'N/A',
          currentPrice: parseFloat(listing.askPrice) || 0,
          lowestAsk: listing.marketData?.lowestAsk,
          highestBid: listing.marketData?.highestBid,
          daysListed: Math.floor((Date.now() - new Date(listing.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
          imageUrl: listing.product?.imageUrl,
          sku: listing.product?.styleId,
          selected: false
        })));
      }
    } catch (error) {
      console.error('Failed to load listings:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadListings();
  }, []);

  // Calculate new price based on strategy
  const calculateNewPrice = (listing: StockXListing): number => {
    const lowestAsk = listing.lowestAsk || listing.currentPrice;
    
    switch (selectedStrategy) {
      case 'undercut':
        return Math.max(1, lowestAsk - undercutAmount);
      case 'match':
        return lowestAsk;
      case 'percentage':
        return Math.max(1, Math.round(lowestAsk * (1 - percentageAmount / 100)));
      case 'custom':
        return listing.newPrice || listing.currentPrice;
      default:
        return listing.currentPrice;
    }
  };

  // Toggle selection
  const toggleSelection = (listingId: string) => {
    setListings(prev => prev.map(listing => 
      listing.id === listingId 
        ? { ...listing, selected: !listing.selected }
        : listing
    ));
  };

  // Toggle all selections
  const toggleSelectAll = () => {
    setSelectAll(!selectAll);
    setListings(prev => prev.map(listing => ({
      ...listing,
      selected: !selectAll
    })));
  };

  // Update custom price
  const updateCustomPrice = (listingId: string, price: number) => {
    setListings(prev => prev.map(listing => 
      listing.id === listingId 
        ? { ...listing, newPrice: price }
        : listing
    ));
  };

  // Execute batch repricing
  const executeBatchReprice = async (isDryRun = false) => {
    const selectedListings = listings.filter(l => l.selected);
    
    if (selectedListings.length === 0) {
      alert('Please select at least one listing to reprice');
      return;
    }

    // Prepare items for repricing
    const items = selectedListings.map(listing => ({
      listingId: listing.listingId,
      currentPrice: listing.currentPrice,
      newAskPrice: calculateNewPrice(listing),
      productName: listing.productName,
      size: listing.size
    }));

    // Calculate batches
    const batchCount = Math.ceil(items.length / 500);
    const estimatedTime = (batchCount - 1) * 5;

    if (!isDryRun && batchCount > 1) {
      const proceed = confirm(
        `This operation will process ${items.length} items in ${batchCount} batches.\n` +
        `Estimated time: ${estimatedTime} minutes.\n\n` +
        `Continue?`
      );
      if (!proceed) return;
    }

    setRepricing(true);
    setShowResults(false);
    setProgress({
      currentBatch: 0,
      totalBatches: batchCount,
      itemsProcessed: 0,
      totalItems: items.length,
      status: isDryRun ? 'Running dry run...' : 'Starting batch repricing...',
      results: []
    });

    try {
      const response = await fetch('/api/stockx/batch-reprice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          strategy: selectedStrategy,
          dryRun: isDryRun
        })
      });

      const result = await response.json();

      if (response.status === 429) {
        // Rate limited
        setProgress(prev => ({
          ...prev!,
          status: `Rate limited. Please wait ${result.waitSeconds} seconds.`
        }));
        return;
      }

      if (response.ok) {
        if (result.partial) {
          // Multi-batch operation, save continuation token
          setContinuationToken(result.continuation.token);
          
          setProgress(prev => ({
            ...prev!,
            currentBatch: result.completed,
            itemsProcessed: result.totalUpdated + result.totalFailed,
            status: `Completed batch ${result.completed}/${batchCount}. Waiting 5 minutes...`,
            results: result.results
          }));

          // Set timer to continue
          const nextBatchTime = new Date(result.continuation.nextBatchAt).getTime();
          const waitTime = nextBatchTime - Date.now();
          
          continuationTimerRef.current = setTimeout(() => {
            continueBatchReprice();
          }, Math.max(0, waitTime));
          
        } else {
          // Operation complete
          setProgress(prev => ({
            ...prev!,
            currentBatch: result.completed,
            itemsProcessed: result.totalItems,
            status: 'Repricing complete!',
            results: result.results
          }));
          setShowResults(true);
          
          // Reload listings to show new prices
          if (!isDryRun) {
            setTimeout(loadListings, 2000);
          }
        }
      } else {
        throw new Error(result.error || 'Repricing failed');
      }
      
    } catch (error) {
      console.error('Repricing error:', error);
      setProgress(prev => ({
        ...prev!,
        status: `Error: ${error.message}`
      }));
    } finally {
      if (!continuationToken) {
        setRepricing(false);
      }
    }
  };

  // Continue multi-batch operation
  const continueBatchReprice = async () => {
    if (!continuationToken) return;

    try {
      const response = await fetch('/api/stockx/batch-reprice', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ continuationToken })
      });

      const result = await response.json();
      
      if (response.ok) {
        if (result.partial) {
          // More batches to process
          setContinuationToken(result.continuation.token);
          
          setProgress(prev => ({
            ...prev!,
            currentBatch: result.completed,
            itemsProcessed: result.totalUpdated + result.totalFailed,
            status: `Completed batch ${result.completed}. Waiting for next batch...`,
            results: [...(prev?.results || []), ...result.results]
          }));

          // Set timer for next batch
          const nextBatchTime = new Date(result.continuation.nextBatchAt).getTime();
          const waitTime = nextBatchTime - Date.now();
          
          continuationTimerRef.current = setTimeout(() => {
            continueBatchReprice();
          }, Math.max(0, waitTime));
          
        } else {
          // All batches complete
          setContinuationToken(null);
          setProgress(prev => ({
            ...prev!,
            status: 'All batches complete!',
            results: [...(prev?.results || []), ...result.results]
          }));
          setShowResults(true);
          setRepricing(false);
          
          // Reload listings
          setTimeout(loadListings, 2000);
        }
      }
    } catch (error) {
      console.error('Continuation error:', error);
      setContinuationToken(null);
      setRepricing(false);
    }
  };

  // Cancel batch operation
  const cancelBatchOperation = () => {
    if (continuationTimerRef.current) {
      clearTimeout(continuationTimerRef.current);
    }
    setContinuationToken(null);
    setRepricing(false);
    setProgress(prev => ({
      ...prev!,
      status: 'Operation cancelled'
    }));
  };

  return (
    <div className={`${isNeon ? 'bg-black' : 'bg-gray-50'} min-h-screen p-6`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className={`text-2xl font-bold ${isNeon ? 'text-white' : 'text-gray-900'}`}>
            StockX Batch Repricing
          </h1>
          <p className={`${isNeon ? 'text-gray-300' : 'text-gray-600'}`}>
            Update prices for multiple listings at once using batch API
          </p>
        </div>

        {/* Rate Limit Info */}
        <div className={`${
          isNeon 
            ? 'bg-yellow-900/20 border border-yellow-500/30' 
            : 'bg-yellow-100 border border-yellow-400'
        } rounded-lg p-4 mb-6`}>
          <div className="flex items-start gap-3">
            <Info className={`w-5 h-5 ${isNeon ? 'text-yellow-400' : 'text-yellow-600'} flex-shrink-0 mt-0.5`} />
            <div className={`text-sm ${isNeon ? 'text-yellow-300' : 'text-yellow-700'}`}>
              <p className="font-semibold mb-1">Rate Limit Information:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Maximum 500 items per batch</li>
                <li>5 minute cooldown between batches</li>
                <li>50,000 items per day limit</li>
                <li>Large operations will be processed in multiple batches automatically</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Strategy Selection */}
        <div className={`${
          isNeon 
            ? 'bg-gray-900 border border-gray-800' 
            : 'bg-white border border-gray-200'
        } rounded-lg p-6 mb-6`}>
          <h2 className={`text-lg font-semibold mb-4 ${isNeon ? 'text-white' : 'text-gray-900'}`}>
            Repricing Strategy
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Undercut Strategy */}
            <button
              onClick={() => setSelectedStrategy('undercut')}
              className={`p-4 rounded-lg border-2 transition-all ${
                selectedStrategy === 'undercut'
                  ? isNeon 
                    ? 'border-cyan-500 bg-cyan-500/10' 
                    : 'border-blue-500 bg-blue-50'
                  : isNeon
                    ? 'border-gray-700 hover:border-gray-600'
                    : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <TrendingDown className={`w-6 h-6 mb-2 ${
                selectedStrategy === 'undercut' 
                  ? isNeon ? 'text-cyan-400' : 'text-blue-500'
                  : isNeon ? 'text-gray-400' : 'text-gray-600'
              }`} />
              <h3 className={`font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                Undercut
              </h3>
              <p className={`text-sm ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                Beat lowest ask by fixed amount
              </p>
              {selectedStrategy === 'undercut' && (
                <input
                  type="number"
                  value={undercutAmount}
                  onChange={(e) => setUndercutAmount(Math.max(1, parseInt(e.target.value) || 1))}
                  className={`mt-2 w-full px-2 py-1 rounded border ${
                    isNeon 
                      ? 'bg-gray-800 border-gray-700 text-white' 
                      : 'bg-white border-gray-300'
                  }`}
                  placeholder="Amount"
                  min="1"
                />
              )}
            </button>

            {/* Match Strategy */}
            <button
              onClick={() => setSelectedStrategy('match')}
              className={`p-4 rounded-lg border-2 transition-all ${
                selectedStrategy === 'match'
                  ? isNeon 
                    ? 'border-cyan-500 bg-cyan-500/10' 
                    : 'border-blue-500 bg-blue-50'
                  : isNeon
                    ? 'border-gray-700 hover:border-gray-600'
                    : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <DollarSign className={`w-6 h-6 mb-2 ${
                selectedStrategy === 'match' 
                  ? isNeon ? 'text-cyan-400' : 'text-blue-500'
                  : isNeon ? 'text-gray-400' : 'text-gray-600'
              }`} />
              <h3 className={`font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                Match Lowest
              </h3>
              <p className={`text-sm ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                Match the current lowest ask
              </p>
            </button>

            {/* Percentage Strategy */}
            <button
              onClick={() => setSelectedStrategy('percentage')}
              className={`p-4 rounded-lg border-2 transition-all ${
                selectedStrategy === 'percentage'
                  ? isNeon 
                    ? 'border-cyan-500 bg-cyan-500/10' 
                    : 'border-blue-500 bg-blue-50'
                  : isNeon
                    ? 'border-gray-700 hover:border-gray-600'
                    : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <TrendingDown className={`w-6 h-6 mb-2 ${
                selectedStrategy === 'percentage' 
                  ? isNeon ? 'text-cyan-400' : 'text-blue-500'
                  : isNeon ? 'text-gray-400' : 'text-gray-600'
              }`} />
              <h3 className={`font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                Percentage Below
              </h3>
              <p className={`text-sm ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                Set % below lowest ask
              </p>
              {selectedStrategy === 'percentage' && (
                <input
                  type="number"
                  value={percentageAmount}
                  onChange={(e) => setPercentageAmount(Math.max(1, Math.min(50, parseInt(e.target.value) || 5)))}
                  className={`mt-2 w-full px-2 py-1 rounded border ${
                    isNeon 
                      ? 'bg-gray-800 border-gray-700 text-white' 
                      : 'bg-white border-gray-300'
                  }`}
                  placeholder="%"
                  min="1"
                  max="50"
                />
              )}
            </button>

            {/* Custom Strategy */}
            <button
              onClick={() => setSelectedStrategy('custom')}
              className={`p-4 rounded-lg border-2 transition-all ${
                selectedStrategy === 'custom'
                  ? isNeon 
                    ? 'border-cyan-500 bg-cyan-500/10' 
                    : 'border-blue-500 bg-blue-50'
                  : isNeon
                    ? 'border-gray-700 hover:border-gray-600'
                    : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <Settings className={`w-6 h-6 mb-2 ${
                selectedStrategy === 'custom' 
                  ? isNeon ? 'text-cyan-400' : 'text-blue-500'
                  : isNeon ? 'text-gray-400' : 'text-gray-600'
              }`} />
              <h3 className={`font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                Custom Price
              </h3>
              <p className={`text-sm ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                Set individual prices
              </p>
            </button>
          </div>
        </div>

        {/* Listings Table */}
        <div className={`${
          isNeon 
            ? 'bg-gray-900 border border-gray-800' 
            : 'bg-white border border-gray-200'
        } rounded-lg overflow-hidden`}>
          {/* Table Header */}
          <div className={`px-6 py-4 border-b ${
            isNeon ? 'border-gray-800' : 'border-gray-200'
          } flex items-center justify-between`}>
            <h2 className={`text-lg font-semibold ${isNeon ? 'text-white' : 'text-gray-900'}`}>
              Active Listings ({listings.filter(l => l.selected).length} selected)
            </h2>
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className={`px-3 py-1 text-sm rounded ${
                  isNeon 
                    ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                {selectAll ? 'Deselect All' : 'Select All'}
              </button>
              <button
                onClick={() => loadListings()}
                disabled={loading}
                className={`px-3 py-1 text-sm rounded flex items-center gap-2 ${
                  isNeon 
                    ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="p-12 text-center">
              <Loader2 className={`w-8 h-8 animate-spin mx-auto mb-4 ${
                isNeon ? 'text-cyan-400' : 'text-blue-500'
              }`} />
              <p className={isNeon ? 'text-gray-400' : 'text-gray-600'}>
                Loading listings...
              </p>
            </div>
          ) : listings.length === 0 ? (
            <div className="p-12 text-center">
              <Package className={`w-8 h-8 mx-auto mb-4 ${
                isNeon ? 'text-gray-600' : 'text-gray-400'
              }`} />
              <p className={isNeon ? 'text-gray-400' : 'text-gray-600'}>
                No active listings found
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className={`${
                  isNeon ? 'bg-gray-800/50' : 'bg-gray-50'
                }`}>
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectAll}
                        onChange={toggleSelectAll}
                        className="rounded"
                      />
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      isNeon ? 'text-gray-300' : 'text-gray-500'
                    }`}>
                      Product
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      isNeon ? 'text-gray-300' : 'text-gray-500'
                    }`}>
                      Size
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      isNeon ? 'text-gray-300' : 'text-gray-500'
                    }`}>
                      Current Price
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      isNeon ? 'text-gray-300' : 'text-gray-500'
                    }`}>
                      Lowest Ask
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      isNeon ? 'text-gray-300' : 'text-gray-500'
                    }`}>
                      New Price
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      isNeon ? 'text-gray-300' : 'text-gray-500'
                    }`}>
                      Days Listed
                    </th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${
                  isNeon ? 'divide-gray-800' : 'divide-gray-200'
                }`}>
                  {listings.map((listing) => {
                    const newPrice = calculateNewPrice(listing);
                    const priceDiff = newPrice - listing.currentPrice;
                    
                    return (
                      <tr key={listing.id} className={`${
                        listing.selected 
                          ? isNeon ? 'bg-cyan-900/10' : 'bg-blue-50' 
                          : ''
                      }`}>
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            checked={listing.selected}
                            onChange={() => toggleSelection(listing.id)}
                            className="rounded"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div>
                            <p className={`font-medium ${
                              isNeon ? 'text-white' : 'text-gray-900'
                            }`}>
                              {listing.productName}
                            </p>
                            {listing.sku && (
                              <p className={`text-sm ${
                                isNeon ? 'text-gray-400' : 'text-gray-500'
                              }`}>
                                {listing.sku}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className={`px-6 py-4 ${
                          isNeon ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                          {listing.size}
                        </td>
                        <td className={`px-6 py-4 ${
                          isNeon ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                          ${listing.currentPrice}
                        </td>
                        <td className={`px-6 py-4 ${
                          isNeon ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                          ${listing.lowestAsk || '-'}
                        </td>
                        <td className="px-6 py-4">
                          {selectedStrategy === 'custom' && listing.selected ? (
                            <input
                              type="number"
                              value={listing.newPrice || newPrice}
                              onChange={(e) => updateCustomPrice(listing.id, parseFloat(e.target.value) || 0)}
                              className={`w-24 px-2 py-1 rounded border ${
                                isNeon 
                                  ? 'bg-gray-800 border-gray-700 text-white' 
                                  : 'bg-white border-gray-300'
                              }`}
                              min="1"
                            />
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className={`${
                                isNeon ? 'text-white' : 'text-gray-900'
                              } font-medium`}>
                                ${newPrice}
                              </span>
                              {listing.selected && priceDiff !== 0 && (
                                <span className={`text-sm ${
                                  priceDiff < 0 
                                    ? 'text-green-500' 
                                    : 'text-red-500'
                                }`}>
                                  {priceDiff > 0 ? '+' : ''}${priceDiff.toFixed(2)}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className={`px-6 py-4 ${
                          isNeon ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                          {listing.daysListed}d
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex items-center gap-4">
          <button
            onClick={() => executeBatchReprice(true)}
            disabled={repricing || listings.filter(l => l.selected).length === 0}
            className={`px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              repricing || listings.filter(l => l.selected).length === 0
                ? isNeon 
                  ? 'bg-gray-800 text-gray-600 cursor-not-allowed' 
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : isNeon 
                  ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' 
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
          >
            <Play className="w-5 h-5" />
            Dry Run
          </button>

          <button
            onClick={() => executeBatchReprice(false)}
            disabled={repricing || listings.filter(l => l.selected).length === 0}
            className={`px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              repricing || listings.filter(l => l.selected).length === 0
                ? isNeon 
                  ? 'bg-gray-800 text-gray-600 cursor-not-allowed' 
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : isNeon 
                  ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 text-white shadow-lg shadow-cyan-500/25' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {repricing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <TrendingDown className="w-5 h-5" />
                Execute Repricing
              </>
            )}
          </button>

          {repricing && continuationToken && (
            <button
              onClick={cancelBatchOperation}
              className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                isNeon 
                  ? 'bg-red-600 hover:bg-red-700 text-white' 
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              Cancel
            </button>
          )}
        </div>

        {/* Progress Display */}
        {progress && (
          <div className={`mt-6 ${
            isNeon 
              ? 'bg-gray-900 border border-gray-800' 
              : 'bg-white border border-gray-200'
          } rounded-lg p-6`}>
            <h3 className={`text-lg font-semibold mb-4 ${
              isNeon ? 'text-white' : 'text-gray-900'
            }`}>
              Progress
            </h3>

            <div className="space-y-4">
              {/* Status */}
              <div className="flex items-center gap-3">
                {repricing ? (
                  <Loader2 className={`w-5 h-5 animate-spin ${
                    isNeon ? 'text-cyan-400' : 'text-blue-500'
                  }`} />
                ) : progress.status.includes('complete') ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : progress.status.includes('Error') || progress.status.includes('cancelled') ? (
                  <XCircle className="w-5 h-5 text-red-500" />
                ) : (
                  <Clock className={`w-5 h-5 ${
                    isNeon ? 'text-yellow-400' : 'text-yellow-500'
                  }`} />
                )}
                <p className={isNeon ? 'text-gray-300' : 'text-gray-700'}>
                  {progress.status}
                </p>
              </div>

              {/* Progress Bar */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className={isNeon ? 'text-gray-400' : 'text-gray-600'}>
                    Items: {progress.itemsProcessed} / {progress.totalItems}
                  </span>
                  <span className={isNeon ? 'text-gray-400' : 'text-gray-600'}>
                    Batch: {progress.currentBatch} / {progress.totalBatches}
                  </span>
                </div>
                <div className={`h-2 rounded-full overflow-hidden ${
                  isNeon ? 'bg-gray-800' : 'bg-gray-200'
                }`}>
                  <div 
                    className={`h-full transition-all duration-300 ${
                      isNeon 
                        ? 'bg-gradient-to-r from-cyan-500 to-emerald-500' 
                        : 'bg-blue-600'
                    }`}
                    style={{ 
                      width: `${(progress.itemsProcessed / progress.totalItems) * 100}%` 
                    }}
                  />
                </div>
              </div>

              {/* Results Summary */}
              {showResults && progress.results.length > 0 && (
                <div className={`mt-4 p-4 rounded ${
                  isNeon ? 'bg-gray-800' : 'bg-gray-50'
                }`}>
                  <h4 className={`font-medium mb-2 ${
                    isNeon ? 'text-white' : 'text-gray-900'
                  }`}>
                    Results Summary
                  </h4>
                  <div className="space-y-2">
                    {progress.results.map((result, index) => (
                      <div key={index} className={`flex items-center justify-between text-sm ${
                        isNeon ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        <span>Batch {result.batch}</span>
                        <div className="flex items-center gap-4">
                          {result.updated !== undefined && (
                            <span className="text-green-500">
                              ✓ {result.updated} updated
                            </span>
                          )}
                          {result.failed !== undefined && result.failed > 0 && (
                            <span className="text-red-500">
                              ✗ {result.failed} failed
                            </span>
                          )}
                          {result.error && (
                            <span className="text-red-500">
                              Error: {result.error}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StockXBatchRepricer;