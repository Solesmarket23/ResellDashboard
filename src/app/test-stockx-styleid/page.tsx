'use client';

import { useState } from 'react';

interface SearchResult {
  success: boolean;
  styleId: string;
  product?: {
    id: string;
    title: string;
    brand: string;
    urlKey: string;
  };
  marketData?: {
    variants: Array<{
      variantId: string;
      size: string;
      lowestAsk: number;
      highestBid: number;
      lastSale: number;
    }>;
  };
  error?: string;
  logs: string[];
}

export default function TestStockXStyleId() {
  const [styleId, setStyleId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);

  const testStyleId = async () => {
    if (!styleId.trim()) {
      alert('Please enter a StyleId');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/test-styleid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ styleId: styleId.trim() })
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        styleId: styleId,
        error: error instanceof Error ? error.message : 'Unknown error',
        logs: ['Failed to fetch']
      });
    } finally {
      setLoading(false);
    }
  };

  const testExamples = [
    { id: 'FZ8117-400', name: 'Nike Sabrina 3 Ice Cold' },
    { id: 'ID5480', name: 'adidas Yeezy Slide Salt' },
    { id: 'DV0833-108', name: 'Nike Dunk Low Panda' },
    { id: 'FB1396-100', name: 'Air Jordan 1 High OG' },
    { id: '1203A383-020', name: 'ASICS Gel-NYC' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            🔍 StockX StyleId Tester
          </h1>
          <p className="text-gray-400">
            Test if StyleId search returns accurate market prices from StockX
          </p>
        </div>

        {/* Input Section */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700">
          <label className="block text-white font-semibold mb-2">
            Enter StyleId:
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={styleId}
              onChange={(e) => setStyleId(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && testStyleId()}
              placeholder="e.g., FZ8117-400, ID5480, DV0833-108"
              className="flex-1 px-4 py-3 bg-gray-900 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={testStyleId}
              disabled={loading || !styleId.trim()}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
            >
              {loading ? 'Testing...' : 'Test'}
            </button>
          </div>

          {/* Example StyleIds */}
          <div className="mt-4">
            <p className="text-gray-400 text-sm mb-2">Quick Test Examples:</p>
            <div className="flex flex-wrap gap-2">
              {testExamples.map((example) => (
                <button
                  key={example.id}
                  onClick={() => setStyleId(example.id)}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-md transition-colors"
                  title={example.name}
                >
                  {example.id}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Results Section */}
        {result && (
          <div className="space-y-6">
            {/* Success/Error Banner */}
            <div className={`rounded-lg p-4 ${result.success ? 'bg-green-900/30 border border-green-600' : 'bg-red-900/30 border border-red-600'}`}>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{result.success ? '✅' : '❌'}</span>
                <div>
                  <h3 className={`font-bold ${result.success ? 'text-green-400' : 'text-red-400'}`}>
                    {result.success ? 'Success!' : 'Failed'}
                  </h3>
                  <p className="text-gray-300 text-sm">
                    StyleId: <code className="bg-black/30 px-2 py-1 rounded">{result.styleId}</code>
                  </p>
                </div>
              </div>
            </div>

            {/* Product Info */}
            {result.product && (
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <h3 className="text-white font-bold text-xl mb-4">📦 Product Found</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-400 text-sm">Product ID</p>
                    <p className="text-white font-mono">{result.product.id}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Brand</p>
                    <p className="text-white">{result.product.brand}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-gray-400 text-sm">Title</p>
                    <p className="text-white font-semibold">{result.product.title}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-gray-400 text-sm">StockX URL</p>
                    <a 
                      href={`https://stockx.com/${result.product.urlKey}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 hover:underline"
                    >
                      https://stockx.com/{result.product.urlKey}
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Market Data */}
            {result.marketData && result.marketData.variants.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <h3 className="text-white font-bold text-xl mb-4">💰 Market Prices by Size</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left text-gray-400 font-semibold py-2 px-3">Size</th>
                        <th className="text-right text-gray-400 font-semibold py-2 px-3">Lowest Ask</th>
                        <th className="text-right text-gray-400 font-semibold py-2 px-3">Highest Bid</th>
                        <th className="text-right text-gray-400 font-semibold py-2 px-3">Last Sale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.marketData.variants.map((variant) => (
                        <tr key={variant.variantId} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                          <td className="py-2 px-3 text-white font-semibold">{variant.size}</td>
                          <td className="py-2 px-3 text-right">
                            <span className="text-green-400 font-semibold">
                              ${variant.lowestAsk > 0 ? variant.lowestAsk.toFixed(0) : '--'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <span className="text-blue-400">
                              ${variant.highestBid > 0 ? variant.highestBid.toFixed(0) : '--'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right text-gray-300">
                            ${variant.lastSale > 0 ? variant.lastSale.toFixed(0) : '--'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Error Message */}
            {result.error && (
              <div className="bg-red-900/20 border border-red-600 rounded-lg p-4">
                <h3 className="text-red-400 font-bold mb-2">Error Details:</h3>
                <p className="text-gray-300">{result.error}</p>
              </div>
            )}

            {/* API Logs */}
            {result.logs && result.logs.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <h3 className="text-white font-bold text-xl mb-4">📋 API Logs</h3>
                <div className="bg-black/50 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                  {result.logs.map((log, index) => (
                    <div 
                      key={index} 
                      className={`py-1 ${
                        log.includes('✅') ? 'text-green-400' : 
                        log.includes('❌') ? 'text-red-400' : 
                        log.includes('🔍') || log.includes('🔎') ? 'text-blue-400' : 
                        log.includes('💰') ? 'text-yellow-400' :
                        'text-gray-300'
                      }`}
                    >
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Instructions */}
        {!result && (
          <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
            <h3 className="text-white font-bold mb-3">📖 How to Use:</h3>
            <ol className="text-gray-300 space-y-2 list-decimal list-inside">
              <li>Enter a StyleId from a StockX product (e.g., FZ8117-400)</li>
              <li>Click "Test" to search StockX</li>
              <li>View the product details and market prices for all sizes</li>
              <li>Check the logs to see exactly what the API returned</li>
            </ol>
            <div className="mt-4 p-4 bg-blue-900/20 border border-blue-600 rounded-lg">
              <p className="text-blue-300 text-sm">
                💡 <strong>Tip:</strong> StyleIds are found on StockX product pages or in your Gmail order confirmations from StockX. 
                They typically look like: FB1396-100, DV0833-001, ID5480, etc.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

