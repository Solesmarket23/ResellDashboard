// Alias API Demo Page
'use client';

import React, { useState } from 'react';
import { Search, Package, TrendingUp, ShoppingCart, RefreshCw } from 'lucide-react';
import { useAliasApi } from '../../lib/hooks/useAliasApi';
import { useTheme } from '../../lib/contexts/ThemeContext';
import AliasConnector from '../../components/AliasConnector';

const AliasDemo: React.FC = () => {
  const { currentTheme } = useTheme();
  const { status, searchCatalog, getPricingInsights, getRecentSales } = useAliasApi();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [pricingData, setPricingData] = useState<any>(null);
  const [salesData, setSalesData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsLoading(true);
    try {
      const results = await searchCatalog(searchQuery, 10);
      setSearchResults(results.catalog_items || []);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProductSelect = async (product: any) => {
    setSelectedProduct(product);
    setIsLoading(true);
    
    try {
      // Get pricing insights for size 10, new condition
      const pricing = await getPricingInsights({
        catalog_id: product.catalog_id,
        size: 10,
        product_condition: 'PRODUCT_CONDITION_NEW',
        packaging_condition: 'PACKAGING_CONDITION_GOOD_CONDITION',
      });
      setPricingData(pricing);

      // Get recent sales
      const sales = await getRecentSales({
        catalog_id: product.catalog_id,
        size: 10,
        limit: 10,
      });
      setSalesData(sales.recent_sales || []);
    } catch (error) {
      console.error('Product data error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  return (
    <div className={`min-h-screen ${currentTheme.colors.background} p-8`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className={`text-3xl font-bold ${currentTheme.colors.textPrimary} mb-2`}>
            Alias API Demo
          </h1>
          <p className={`text-lg ${currentTheme.colors.textSecondary}`}>
            Explore marketplace data, pricing insights, and product information
          </p>
        </div>

        {/* Connection Status */}
        <div className="mb-8">
          <AliasConnector />
        </div>

        {!status.isConnected && (
          <div className={`p-8 rounded-lg border-2 border-dashed ${
            currentTheme.name === 'Neon' 
              ? 'border-gray-700 bg-gray-900/30' 
              : 'border-gray-300 bg-gray-50'
          }`}>
            <div className="text-center">
              <Package className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <h3 className={`text-lg font-medium ${currentTheme.colors.textPrimary} mb-2`}>
                Connect to Alias API
              </h3>
              <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                Configure your bearer token to start exploring marketplace data
              </p>
            </div>
          </div>
        )}

        {status.isConnected && (
          <div className="space-y-8">
            {/* Search Section */}
            <div className={`p-6 rounded-lg border ${
              currentTheme.name === 'Neon' 
                ? 'bg-gray-900/50 border-gray-700' 
                : 'bg-white border-gray-200'
            }`}>
              <h2 className={`text-xl font-semibold ${currentTheme.colors.textPrimary} mb-4`}>
                Search Products
              </h2>
              
              <div className="flex space-x-4 mb-6">
                <div className="flex-1">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search for products (e.g., 'Nike Air Jordan', 'DZ5485-612')"
                    className={`w-full px-4 py-2 rounded-lg border ${
                      currentTheme.name === 'Neon'
                        ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-400'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  />
                </div>
                <button
                  onClick={handleSearch}
                  disabled={isLoading || !searchQuery.trim()}
                  className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                    currentTheme.name === 'Neon'
                      ? 'bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-50'
                      : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50'
                  }`}
                >
                  {isLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="space-y-3">
                  <h3 className={`text-lg font-medium ${currentTheme.colors.textPrimary}`}>
                    Search Results ({searchResults.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {searchResults.map((product) => (
                      <div
                        key={product.catalog_id}
                        onClick={() => handleProductSelect(product)}
                        className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                          currentTheme.name === 'Neon'
                            ? 'bg-gray-800 border-gray-600 hover:bg-gray-700'
                            : 'bg-white border-gray-200 hover:bg-gray-50'
                        } ${selectedProduct?.catalog_id === product.catalog_id ? 'ring-2 ring-blue-500' : ''}`}
                      >
                        <div className="flex items-start space-x-3">
                          <img
                            src={product.main_picture_url}
                            alt={product.name}
                            className="w-16 h-16 rounded-lg object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className={`text-sm font-medium ${currentTheme.colors.textPrimary} truncate`}>
                              {product.name}
                            </h4>
                            <p className={`text-xs ${currentTheme.colors.textSecondary} truncate`}>
                              {product.brand} • {product.sku}
                            </p>
                            <p className={`text-xs ${currentTheme.colors.textSecondary}`}>
                              Retail: {formatPrice(product.retail_price_cents)}
                            </p>
                            <div className="flex items-center space-x-2 mt-2">
                              <span className={`text-xs px-2 py-1 rounded ${
                                product.resellable 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {product.resellable ? 'Resellable' : 'Not Resellable'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Product Details */}
            {selectedProduct && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Product Info */}
                <div className={`p-6 rounded-lg border ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-gray-900/50 border-gray-700' 
                    : 'bg-white border-gray-200'
                }`}>
                  <h2 className={`text-xl font-semibold ${currentTheme.colors.textPrimary} mb-4`}>
                    Product Details
                  </h2>
                  
                  <div className="space-y-4">
                    <div className="flex items-start space-x-4">
                      <img
                        src={selectedProduct.main_picture_url}
                        alt={selectedProduct.name}
                        className="w-24 h-24 rounded-lg object-cover"
                      />
                      <div className="flex-1">
                        <h3 className={`text-lg font-medium ${currentTheme.colors.textPrimary}`}>
                          {selectedProduct.name}
                        </h3>
                        <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                          {selectedProduct.brand} • {selectedProduct.sku}
                        </p>
                        <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                          {selectedProduct.colorway}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className={`font-medium ${currentTheme.colors.textPrimary}`}>Release Date:</span>
                        <p className={currentTheme.colors.textSecondary}>
                          {new Date(selectedProduct.release_date).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <span className={`font-medium ${currentTheme.colors.textPrimary}`}>Retail Price:</span>
                        <p className={currentTheme.colors.textSecondary}>
                          {formatPrice(selectedProduct.retail_price_cents)}
                        </p>
                      </div>
                      <div>
                        <span className={`font-medium ${currentTheme.colors.textPrimary}`}>Price Range:</span>
                        <p className={currentTheme.colors.textSecondary}>
                          {formatPrice(selectedProduct.minimum_listing_price_cents)} - {formatPrice(selectedProduct.maximum_listing_price_cents)}
                        </p>
                      </div>
                      <div>
                        <span className={`font-medium ${currentTheme.colors.textPrimary}`}>Gender:</span>
                        <p className={currentTheme.colors.textSecondary}>
                          {selectedProduct.gender}
                        </p>
                      </div>
                    </div>

                    <div>
                      <span className={`font-medium ${currentTheme.colors.textPrimary}`}>Available Sizes:</span>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {selectedProduct.allowed_sizes.slice(0, 10).map((size: any) => (
                          <span
                            key={size.value}
                            className={`px-2 py-1 text-xs rounded ${
                              currentTheme.name === 'Neon'
                                ? 'bg-gray-700 text-gray-300'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {size.display_name}
                          </span>
                        ))}
                        {selectedProduct.allowed_sizes.length > 10 && (
                          <span className={`px-2 py-1 text-xs rounded ${
                            currentTheme.name === 'Neon'
                              ? 'bg-gray-700 text-gray-300'
                              : 'bg-gray-100 text-gray-700'
                          }`}>
                            +{selectedProduct.allowed_sizes.length - 10} more
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pricing & Sales Data */}
                <div className={`p-6 rounded-lg border ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-gray-900/50 border-gray-700' 
                    : 'bg-white border-gray-200'
                }`}>
                  <h2 className={`text-xl font-semibold ${currentTheme.colors.textPrimary} mb-4`}>
                    Market Data
                  </h2>

                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Pricing Insights */}
                      {pricingData && (
                        <div>
                          <h3 className={`text-lg font-medium ${currentTheme.colors.textPrimary} mb-3`}>
                            <TrendingUp className="w-5 h-5 inline mr-2" />
                            Pricing Insights (Size 10, New)
                          </h3>
                          <div className="grid grid-cols-2 gap-4">
                            <div className={`p-3 rounded-lg ${
                              currentTheme.name === 'Neon' ? 'bg-gray-800' : 'bg-gray-50'
                            }`}>
                              <p className={`text-sm ${currentTheme.colors.textSecondary}`}>Lowest Listing</p>
                              <p className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
                                {formatPrice(parseInt(pricingData.availability.lowest_listing_price_cents))}
                              </p>
                            </div>
                            <div className={`p-3 rounded-lg ${
                              currentTheme.name === 'Neon' ? 'bg-gray-800' : 'bg-gray-50'
                            }`}>
                              <p className={`text-sm ${currentTheme.colors.textSecondary}`}>Highest Offer</p>
                              <p className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
                                {formatPrice(parseInt(pricingData.availability.highest_offer_price_cents))}
                              </p>
                            </div>
                            <div className={`p-3 rounded-lg ${
                              currentTheme.name === 'Neon' ? 'bg-gray-800' : 'bg-gray-50'
                            }`}>
                              <p className={`text-sm ${currentTheme.colors.textSecondary}`}>Last Sold</p>
                              <p className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
                                {formatPrice(parseInt(pricingData.availability.last_sold_listing_price_cents))}
                              </p>
                            </div>
                            <div className={`p-3 rounded-lg ${
                              currentTheme.name === 'Neon' ? 'bg-gray-800' : 'bg-gray-50'
                            }`}>
                              <p className={`text-sm ${currentTheme.colors.textSecondary}`}>Market Price</p>
                              <p className={`text-lg font-semibold text-green-600`}>
                                {formatPrice(parseInt(pricingData.availability.global_indicator_price_cents))}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Recent Sales */}
                      {salesData.length > 0 && (
                        <div>
                          <h3 className={`text-lg font-medium ${currentTheme.colors.textPrimary} mb-3`}>
                            <ShoppingCart className="w-5 h-5 inline mr-2" />
                            Recent Sales ({salesData.length})
                          </h3>
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {salesData.map((sale, index) => (
                              <div
                                key={index}
                                className={`flex justify-between items-center p-2 rounded ${
                                  currentTheme.name === 'Neon' ? 'bg-gray-800' : 'bg-gray-50'
                                }`}
                              >
                                <div>
                                  <p className={`text-sm ${currentTheme.colors.textPrimary}`}>
                                    Size {sale.size}
                                  </p>
                                  <p className={`text-xs ${currentTheme.colors.textSecondary}`}>
                                    {new Date(sale.purchased_at).toLocaleDateString()}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className={`text-sm font-medium ${currentTheme.colors.textPrimary}`}>
                                    {formatPrice(parseInt(sale.price_cents))}
                                  </p>
                                  <p className={`text-xs ${currentTheme.colors.textSecondary}`}>
                                    {sale.consigned ? 'Consigned' : 'Direct'}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AliasDemo;
