import GTINArbitrageTester from '@/components/GTINArbitrageTester';

export default function TestGTINArbitragePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            GTIN-Enhanced Arbitrage Finder
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            Test the enhanced eBay StockX arbitrage finder with GTIN and Style Code search capabilities. 
            This tool now prioritizes GTIN/UPC/EAN and Style Code searches for more accurate product matching.
          </p>
        </div>
        
        <GTINArbitrageTester />
        
        <div className="mt-12 bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">How Enhanced Search Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">🔍 Search Process</h3>
              <ol className="text-sm text-gray-700 space-y-2">
                <li>1. <strong>Extract Identifiers:</strong> Scans query for style codes and GTINs</li>
                <li>2. <strong>eBay GTIN Search:</strong> Uses eBay's native GTIN API for precise listings</li>
                <li>3. <strong>Validate Formats:</strong> Checks style code patterns and GTIN check digits</li>
                <li>4. <strong>Style Code Search:</strong> Searches StockX using style codes (highest priority)</li>
                <li>5. <strong>GTIN Search:</strong> Searches StockX using GTIN directly (second priority)</li>
                <li>6. <strong>Text Fallback:</strong> Falls back to text search if identifiers not found</li>
                <li>7. <strong>Confidence Scoring:</strong> Style Code (+25), GTIN (+20), Text (base)</li>
              </ol>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">🏷️ Supported Formats</h3>
              <ul className="text-sm text-gray-700 space-y-2">
                <li>• <strong>Style Codes:</strong> Nike (DJ0950-101), Adidas (H01234), New Balance (M990BK5)</li>
                <li>• <strong>UPC:</strong> 12 digits (US products)</li>
                <li>• <strong>EAN:</strong> 13 digits (International)</li>
                <li>• <strong>GTIN-14:</strong> 14 digits (Trade items)</li>
                <li>• <strong>Validation:</strong> Style code patterns and GTIN check digit verification</li>
                <li>• <strong>Prefix Support:</strong> style:, code:, SKU:, UPC:, EAN:, GTIN:</li>
              </ul>
            </div>
          </div>
          
          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h4 className="font-semibold text-yellow-800 mb-2">💡 Test Suggestions</h4>
            <div className="text-sm text-yellow-700">
              <p className="mb-2">Try searching with these types of queries:</p>
              <ul className="space-y-1">
                <li>• <strong>Style codes:</strong> "DJ0950-101", "H01234", "M990BK5"</li>
                <li>• <strong>Product names:</strong> "Nike Air Jordan 1", "Adidas Yeezy 350"</li>
                <li>• <strong>GTIN codes:</strong> "123456789012", "1234567890123"</li>
                <li>• <strong>Mixed queries:</strong> "Nike Dunk Low DJ0950-101", "Jordan 4 123456789012"</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
