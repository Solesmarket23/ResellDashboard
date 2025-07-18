'use client';

import React, { useState, useEffect } from 'react';
import { Search, DollarSign, Package, CheckCircle, AlertCircle, Loader, X, TrendingUp, ArrowRight } from 'lucide-react';
import { useTheme } from '@/lib/contexts/ThemeContext';

interface Product {
  productId: string;
  title: string;
  brand: string;
  imageUrl: string;
  retailPrice: number;
  urlKey: string;
  // Add fields for size data from search results
  sizeData?: any;
  productTraits?: any;
}

interface Variant {
  variantId: string;
  variantValue: string; // Size
  lowestAsk?: number;
  highestBid?: number;
  isFlexEligible?: boolean;
  isDirectEligible?: boolean;
}

interface MarketData {
  variantId: string;
  lowestAskAmount: number;
  highestBidAmount: number;
  lastSaleAmount?: number;
}

interface ListingOperation {
  listingId: string;
  operationId: string;
  operationType: string;
  operationStatus: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  error?: any;
}

// Helper function to extract product identifier from various API responses
function getProductIdentifier(product: any): string | null {
  return product?.productId || 
         product?.uuid || 
         product?.id || 
         product?.stockxId ||
         product?.product_id ||
         null;
}

export default function StockXListingCreator() {
  const { currentTheme } = useTheme();
  const isNeon = currentTheme.name === 'neon';
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  
  // Product selection state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [isLoadingVariants, setIsLoadingVariants] = useState(false);
  
  // Market data state
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [isLoadingMarketData, setIsLoadingMarketData] = useState(false);
  
  // Listing form state
  const [listingPrice, setListingPrice] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [condition, setCondition] = useState<'new' | 'used'>('new');
  const [createAsActive, setCreateAsActive] = useState(true);
  
  // Operation state
  const [isCreatingListing, setIsCreatingListing] = useState(false);
  const [currentOperation, setCurrentOperation] = useState<ListingOperation | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);

  // Test with actual product from search results
  const testKnownProduct = async () => {
    console.log('🧪 Testing API endpoints...');
    
    // First test with a real product ID from our search results
    const realProductId = searchResults[0]?.productId;
    if (!realProductId) {
      console.log('🧪 No search results to test with. Search for Nike first.');
      return;
    }
    
    console.log(`🧪 Testing with real product ID: ${realProductId}`);
    
    try {
      // Test the market data endpoint which includes variants + pricing
      const endpoints = [
        `/api/stockx/products/${realProductId}/market-data`,
        `/api/stockx/catalog/products/${realProductId}/market-data`,
        `/api/stockx/products/${realProductId}/variants`,
        `/api/stockx/catalog/products/${realProductId}/variants`
      ];
      
      for (const endpoint of endpoints) {
        try {
          console.log(`🧪 Testing endpoint: ${endpoint}`);
          const response = await fetch(endpoint);
          const data = await response.json();
          console.log(`✅ ${endpoint} -> Status: ${response.status}`, data);
        } catch (error) {
          console.log(`❌ ${endpoint} -> Failed:`, error);
        }
      }
    } catch (error) {
      console.error('🧪 Test failed:', error);
    }
  };

  // Search for products
  const searchProducts = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);
    
    try {
      const response = await fetch(`/api/stockx/search?query=${encodeURIComponent(searchQuery)}&limit=10`);
      
      if (!response.ok) {
        throw new Error('Failed to search products');
      }
      
      const data = await response.json();
      if (data.success && data.data?.products) {
        // Transform the products to match our expected format
        const transformedProducts = data.data.products.map((p: any) => {
          // StockX API sometimes uses 'id' and sometimes 'productId'
          // Handle both productId (from docs) and uuid (from actual API)
          const productId = getProductIdentifier(p);
          
          if (!productId) {
            console.error('No valid product identifier found for:', p);
            return null;
          }
          
          console.log('Product data:', JSON.stringify({
            productId: p.productId,
            uuid: p.uuid,
            id: p.id,
            title: p.title,
            urlKey: p.urlKey,
            styleId: p.styleId,
            brand: p.brand,
            selectedIdentifier: productId,
            // Look for any variant/size data in search results
            variants: p.variants,
            sizes: p.sizes,
            market: p.market,
            children: p.children,
            allFields: Object.keys(p) // Show all available fields
          }, null, 2));
          
          return {
            productId: productId,
            title: p.title || p.name || 'Unknown Product',
            brand: p.brand || p.primaryCategory || 'Unknown',
            imageUrl: p.imageUrl || p.media?.imageUrl || p.media?.thumbUrl || p.thumbUrl || '/placeholder-shoe.png',
            retailPrice: p.retailPrice || p.retail || 0,
            urlKey: p.urlKey || p.slug || '',
            sizeData: p.sizeData || p.sizes || p.variants,
            productTraits: p.productTraits || p.traits
          };
        }).filter(p => p !== null); // Remove any products without valid identifiers
        setSearchResults(transformedProducts);
      } else {
        setSearchError('No products found');
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchError('Failed to search products. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  // Load variants when product is selected
  const loadVariants = async (product: Product) => {
    console.log('Loading variants for product:', product.productId, product.title);
    console.log('Product data:', product);
    setIsLoadingVariants(true);
    setVariants([]);
    setSelectedVariant(null);
    setSearchError(null);
    
    // First check if we have size data from the search results
    if (product.sizeData || product.productTraits) {
      console.log('Checking for size data in search results:', { sizeData: product.sizeData, traits: product.productTraits });
      
      // Extract sizes from productTraits if available
      const sizes = product.productTraits?.find((trait: any) => trait.name === 'Size' || trait.filterId === 'size')?.values || [];
      
      if (sizes.length > 0) {
        const mockVariants = sizes.map((size: any) => ({
          variantId: `trait-${size}`, // Different prefix for trait-based sizes
          variantValue: size,
          // These will be populated when a size is selected
          lowestAsk: 0,
          highestBid: 0,
          isFlexEligible: false,
          isDirectEligible: false
        }));
        setVariants(mockVariants);
        console.log(`Created ${mockVariants.length} variants from product traits`);
        setIsLoadingVariants(false);
        return;
      }
    }
    
    // If no size data in search results, first check product details to see if it should have variants
    try {
      // Step 1: Get product details to understand what variants should exist
      console.log('🔍 Checking product details first...');
      const detailsResponse = await fetch(`/api/stockx/products/${product.productId}/details`);
      
      if (detailsResponse.ok) {
        const detailsData = await detailsResponse.json();
        console.log('📦 Product details:', detailsData.productData);
        
        if (!detailsData.productData.shouldHaveVariants) {
          console.log('ℹ️ Product type does not have variants:', detailsData.productData.productType);
          // This product doesn't have variants, use standard sizes anyway
          const standardSizes = ['7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '13'];
          const fallbackVariants = standardSizes.map(size => ({
            variantId: `fallback-${size}`,
            variantValue: size,
            lowestAsk: 0,
            highestBid: 0,
            isFlexEligible: false,
            isDirectEligible: false
          }));
          setVariants(fallbackVariants);
          setIsLoadingVariants(false);
          return;
        }
        
        console.log('✅ Product should have variants, proceeding to fetch them...');
      }
      
      // Step 2: Try to fetch variants with market data (better approach)
      console.log('💰 Trying market data endpoint for variants...');
      let response = await fetch(`/api/stockx/products/${product.productId}/market-data`);
      
      // If market data fails, fall back to variants endpoint
      if (!response.ok) {
        console.log('💰 Market data failed, trying variants endpoint...');
        response = await fetch(`/api/stockx/products/${product.productId}/variants`);
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Variants API error:', response.status, errorText);
        
        // If API fails with 404, continue to fallback logic below
        if (response.status === 404) {
          console.log('Product not found (404), will use standard sizes...');
        }
        
        throw new Error(`Failed to load variants: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Variants response:', data);
      
      if (data.success && data.variants && data.variants.length > 0) {
        console.log(`✅ Using real variants from StockX API (${data.source || 'variants'})`);
        // Sort variants by size (numeric sort for shoe sizes)
        const sortedVariants = data.variants.sort((a: Variant, b: Variant) => {
          const aSize = parseFloat(a.variantValue);
          const bSize = parseFloat(b.variantValue);
          if (!isNaN(aSize) && !isNaN(bSize)) {
            return aSize - bSize;
          }
          return a.variantValue.localeCompare(b.variantValue);
        });
        setVariants(sortedVariants);
        console.log(`✅ Loaded ${sortedVariants.length} variants from ${data.source || 'API'}`);
      } else {
        console.warn('❌ No variants data available for product:', product.productId);
        // Use standard sizes as fallback
        console.log('🔄 Using standard sneaker sizes as fallback...');
        const standardSizes = ['7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '13'];
        const fallbackVariants = standardSizes.map(size => ({
          variantId: `fallback-${size}`, // Use a simple fallback ID
          variantValue: size,
          lowestAsk: 0,
          highestBid: 0,
          isFlexEligible: false,
          isDirectEligible: false
        }));
        setVariants(fallbackVariants);
      }
    } catch (error) {
      console.error('Error loading variants:', error);
      // Use standard sizes as fallback
      const standardSizes = ['7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '13'];
      const mockVariants = standardSizes.map(size => ({
        variantId: `fallback-${size}`,
        variantValue: size,
        lowestAsk: 0,
        highestBid: 0,
        isFlexEligible: false,
        isDirectEligible: false
      }));
      setVariants(mockVariants);
    } finally {
      setIsLoadingVariants(false);
    }
  };

  // Load market data when variant is selected
  const loadMarketData = async (product: Product, variant: Variant) => {
    setIsLoadingMarketData(true);
    setMarketData(null);
    
    try {
      // Log what we're sending to help debug
      console.log('Loading market data for:', {
        productId: product.productId,
        variantId: variant.variantId,
        variantValue: variant.variantValue
      });
      
      const response = await fetch(`/api/stockx/market-data?productId=${product.productId}&variantId=${variant.variantId}`, {
        method: 'GET'
      });
      
      if (!response.ok) {
        throw new Error('Failed to load market data');
      }
      
      const data = await response.json();
      setMarketData({
        variantId: variant.variantId,
        lowestAskAmount: data.lowestAskAmount || variant.lowestAsk || 0,
        highestBidAmount: data.highestBidAmount || variant.highestBid || 0,
        lastSaleAmount: data.lastSaleAmount
      });
      
      // Suggest a competitive price (slightly below lowest ask)
      if (data.lowestAskAmount) {
        const suggestedPrice = Math.floor(data.lowestAskAmount * 0.95);
        setListingPrice(suggestedPrice.toString());
      }
    } catch (error) {
      console.error('Error loading market data:', error);
      // Use variant data as fallback
      if (variant.lowestAsk) {
        setListingPrice(Math.floor(variant.lowestAsk * 0.95).toString());
      }
    } finally {
      setIsLoadingMarketData(false);
    }
  };

  // Handle product selection
  const selectProduct = (product: Product) => {
    setSelectedProduct(product);
    loadVariants(product);
  };

  // Handle variant selection
  const selectVariant = (variant: Variant) => {
    setSelectedVariant(variant);
    if (selectedProduct) {
      loadMarketData(selectedProduct, variant);
    }
  };

  // Create listing
  const createListing = async () => {
    if (!selectedProduct || !selectedVariant || !listingPrice) {
      return;
    }
    
    setIsCreatingListing(true);
    setOperationError(null);
    setCurrentOperation(null);
    
    try {
      const response = await fetch('/api/stockx/listings/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: selectedProduct.productId,
          variantId: selectedVariant.variantId,
          amount: parseFloat(listingPrice),
          quantity,
          active: createAsActive,
          condition
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create listing');
      }
      
      const data = await response.json();
      setCurrentOperation(data.operation);
      
      // Start polling for operation status
      if (data.operation) {
        pollOperationStatus(data.operation.listingId, data.operation.operationId);
      }
    } catch (error) {
      console.error('Error creating listing:', error);
      setOperationError(error instanceof Error ? error.message : 'Failed to create listing');
    } finally {
      setIsCreatingListing(false);
    }
  };

  // Poll operation status
  const pollOperationStatus = async (listingId: string, operationId: string) => {
    const maxAttempts = 30; // 30 seconds max
    let attempts = 0;
    
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/stockx/listings/operations/${operationId}?listingId=${listingId}`);
        
        if (!response.ok) {
          throw new Error('Failed to check operation status');
        }
        
        const data = await response.json();
        setCurrentOperation(data.operation);
        
        if (data.isComplete) {
          if (data.isSuccessful) {
            // Success! Clear form
            setSelectedProduct(null);
            setSelectedVariant(null);
            setListingPrice('');
            setQuantity(1);
            setSearchQuery('');
            setSearchResults([]);
          } else if (data.isFailed && data.operation.error) {
            setOperationError(data.operation.error.message || 'Listing creation failed');
          }
        } else if (attempts < maxAttempts) {
          // Continue polling
          attempts++;
          setTimeout(checkStatus, 1000);
        } else {
          setOperationError('Operation timed out. Please check your listings.');
        }
      } catch (error) {
        console.error('Error checking operation status:', error);
        setOperationError('Failed to check operation status');
      }
    };
    
    checkStatus();
  };

  // Calculate profit margins
  const calculateProfitMargin = () => {
    if (!listingPrice || !marketData) return null;
    
    const price = parseFloat(listingPrice);
    const sellerFee = price * 0.09; // 9% seller fee
    const transactionFee = price * 0.03; // 3% transaction fee
    const totalFees = sellerFee + transactionFee;
    const payout = price - totalFees;
    
    return {
      price,
      sellerFee,
      transactionFee,
      totalFees,
      payout,
      profitMargin: ((payout / price) * 100).toFixed(1)
    };
  };

  const profit = calculateProfitMargin();

  return (
    <div className="min-h-screen p-6 bg-gray-900 text-white overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Package className="w-8 h-8 text-cyan-400" />
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
              Create StockX Listing
            </h1>
          </div>
          <p className="text-gray-400">
            List your products on StockX marketplace with competitive pricing
          </p>
        </div>

        {/* Step 1: Product Search */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 bg-cyan-500 rounded-full text-sm">1</span>
            Search for Product
          </h2>
          
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && searchProducts()}
              placeholder="Search by product name or SKU..."
              className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <button
              onClick={searchProducts}
              disabled={isSearching || !searchQuery.trim()}
              className="bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 text-white font-semibold py-2 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 flex items-center gap-2"
            >
              {isSearching ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Search
            </button>
            <button
              onClick={testKnownProduct}
              className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
            >
              Test
            </button>
          </div>

          {searchError && (
            <div className="text-red-400 text-sm mb-4">{searchError}</div>
          )}

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {searchResults.slice(0, 6).map((product) => (
                <div
                  key={product.productId}
                  onClick={() => selectProduct(product)}
                  className={`bg-gray-800 rounded-lg p-4 cursor-pointer transition-all duration-200 border-2 ${
                    selectedProduct?.productId === product.productId
                      ? 'border-cyan-500 shadow-lg shadow-cyan-500/20'
                      : 'border-transparent hover:border-gray-700'
                  }`}
                >
                  <div className="flex gap-4">
                    <div className="w-20 h-20 bg-gray-700 rounded-lg overflow-hidden">
                      {product.imageUrl && product.imageUrl !== '/placeholder-shoe.png' ? (
                        <img 
                          src={product.imageUrl} 
                          alt={product.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/placeholder-shoe.png';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-8 h-8 text-gray-500" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-white">{product.title}</h3>
                      <p className="text-gray-400 text-sm">{product.brand}</p>
                      {product.retailPrice > 0 && (
                        <p className="text-gray-500 text-sm">Retail: ${product.retailPrice}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Step 2: Select Size */}
        {selectedProduct && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 bg-cyan-500 rounded-full text-sm">2</span>
              Select Size
            </h2>
            
            {isLoadingVariants ? (
              <div className="flex items-center justify-center py-8">
                <Loader className="w-6 h-6 animate-spin text-cyan-400" />
              </div>
            ) : variants.length > 0 ? (
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {variants.map((variant) => (
                  <button
                    key={variant.variantId}
                    onClick={() => selectVariant(variant)}
                    className={`p-3 rounded-lg border-2 transition-all duration-200 ${
                      selectedVariant?.variantId === variant.variantId
                        ? 'bg-cyan-500 border-cyan-500 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                    }`}
                  >
                    <div className="font-semibold">{variant.variantValue}</div>
                    {variant.lowestAsk && (
                      <div className="text-xs mt-1">
                        ${variant.lowestAsk}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-400">Loading sizes failed. Please try again.</p>
                <p className="text-gray-500 text-sm mt-2">If the problem persists, select a different product.</p>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Set Price */}
        {selectedVariant && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 bg-cyan-500 rounded-full text-sm">3</span>
              Set Your Price
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Market Data */}
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-cyan-400" />
                  Market Data
                </h3>
                
                {isLoadingMarketData ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader className="w-5 h-5 animate-spin text-cyan-400" />
                  </div>
                ) : marketData ? (
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Lowest Ask</span>
                      <span className="font-semibold text-green-400">
                        ${marketData.lowestAskAmount}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Highest Bid</span>
                      <span className="font-semibold text-blue-400">
                        ${marketData.highestBidAmount}
                      </span>
                    </div>
                    {marketData.lastSaleAmount && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Last Sale</span>
                        <span className="font-semibold">
                          ${marketData.lastSaleAmount}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500">No market data available</p>
                )}
              </div>

              {/* Pricing Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Your Ask Price
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                    <input
                      type="number"
                      value={listingPrice}
                      onChange={(e) => setListingPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Quantity
                  </label>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    min="1"
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Condition
                  </label>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as 'new' | 'used')}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="new">New</option>
                    <option value="used">Used</option>
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="active"
                    checked={createAsActive}
                    onChange={(e) => setCreateAsActive(e.target.checked)}
                    className="w-4 h-4 text-cyan-500 bg-gray-800 border-gray-600 rounded focus:ring-cyan-500"
                  />
                  <label htmlFor="active" className="text-sm text-gray-300">
                    List immediately (create as active)
                  </label>
                </div>
              </div>
            </div>

            {/* Profit Calculation */}
            {profit && (
              <div className="mt-6 bg-gray-800 rounded-lg p-6">
                <h3 className="font-semibold mb-4">Payout Calculation</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Your Ask Price</span>
                    <span>${profit.price.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Seller Fee (9%)</span>
                    <span className="text-red-400">-${profit.sellerFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Transaction Fee (3%)</span>
                    <span className="text-red-400">-${profit.transactionFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-700 font-semibold">
                    <span>Your Payout</span>
                    <span className="text-green-400">${profit.payout.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Create Listing Button */}
            <div className="mt-6">
              <button
                onClick={createListing}
                disabled={isCreatingListing || !listingPrice || parseFloat(listingPrice) <= 0}
                className="w-full bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isCreatingListing ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Creating Listing...
                  </>
                ) : (
                  <>
                    <Package className="w-5 h-5" />
                    Create Listing
                  </>
                )}
              </button>
            </div>

            {/* Operation Status */}
            {currentOperation && (
              <div className={`mt-6 p-4 rounded-lg ${
                currentOperation.operationStatus === 'PENDING' ? 'bg-yellow-900/20 border border-yellow-500' :
                currentOperation.operationStatus === 'SUCCEEDED' ? 'bg-green-900/20 border border-green-500' :
                'bg-red-900/20 border border-red-500'
              }`}>
                <div className="flex items-center gap-3">
                  {currentOperation.operationStatus === 'PENDING' && (
                    <Loader className="w-5 h-5 animate-spin text-yellow-400" />
                  )}
                  {currentOperation.operationStatus === 'SUCCEEDED' && (
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  )}
                  {currentOperation.operationStatus === 'FAILED' && (
                    <AlertCircle className="w-5 h-5 text-red-400" />
                  )}
                  <div>
                    <p className="font-semibold">
                      {currentOperation.operationStatus === 'PENDING' && 'Creating listing...'}
                      {currentOperation.operationStatus === 'SUCCEEDED' && 'Listing created successfully!'}
                      {currentOperation.operationStatus === 'FAILED' && 'Listing creation failed'}
                    </p>
                    <p className="text-sm text-gray-400">
                      Operation ID: {currentOperation.operationId}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Error Message */}
            {operationError && (
              <div className="mt-4 p-4 bg-red-900/20 border border-red-500 rounded-lg">
                <div className="flex items-center gap-2 text-red-400">
                  <AlertCircle className="w-5 h-5" />
                  <p>{operationError}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}