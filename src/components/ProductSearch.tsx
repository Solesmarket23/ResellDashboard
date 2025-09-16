import React, { useState, useEffect } from 'react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { Search, Image as ImageIcon, Loader2 } from 'lucide-react';

interface ProductSearchResult {
  id: string;
  name: string;
  image: string;
  brand?: string;
  price?: string;
  source: string;
}

interface ProductSearchProps {
  searchTerm: string;
  onProductSelect: (product: ProductSearchResult) => void;
  isVisible: boolean;
}

const ProductSearch: React.FC<ProductSearchProps> = ({ 
  searchTerm, 
  onProductSelect, 
  isVisible 
}) => {
  const { currentTheme } = useTheme();
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced search effect
  useEffect(() => {
    if (!searchTerm.trim() || searchTerm.length < 2) {
      setResults([]);
      return;
    }

    const timeoutId = setTimeout(() => {
      searchProducts(searchTerm);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  const searchProducts = async (query: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/product-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();
      setResults(data.results || []);
    } catch (err) {
      console.error('Product search error:', err);
      setError('Search failed. Please try again.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleProductSelect = (product: ProductSearchResult) => {
    onProductSelect(product);
  };

  if (!isVisible || searchTerm.length < 2) {
    return null;
  }

  return (
    <div className={`mt-2 border rounded-lg ${currentTheme.border} ${currentTheme.colors.background}`}>
      <div className="p-3 border-b border-gray-200">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Search className="w-4 h-4" />
          <span>Search results for "{searchTerm}"</span>
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm text-gray-600">Searching products...</span>
          </div>
        )}

        {error && (
          <div className="p-4 text-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {!loading && !error && results.length === 0 && searchTerm.length >= 2 && (
          <div className="p-4 text-center">
            <p className="text-sm text-gray-500">No products found. Try a different search term.</p>
          </div>
        )}

        {!loading && !error && results.length > 0 && (
          <div className="divide-y divide-gray-200">
            {results.map((product) => (
              <div
                key={product.id}
                onClick={() => handleProductSelect(product)}
                className={`p-3 hover:${currentTheme.hover} cursor-pointer transition-colors`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          target.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <ImageIcon className={`w-6 h-6 text-gray-400 ${product.image ? 'hidden' : ''}`} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h4 className={`text-sm font-medium ${currentTheme.colors.textPrimary} truncate`}>
                      {product.name}
                    </h4>
                    {product.brand && (
                      <p className="text-xs text-gray-500 truncate">{product.brand}</p>
                    )}
                    {product.price && (
                      <p className="text-xs text-green-600 font-medium">{product.price}</p>
                    )}
                    <p className="text-xs text-gray-400">Source: {product.source}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductSearch;
