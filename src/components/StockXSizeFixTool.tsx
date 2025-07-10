import React, { useState } from 'react';
import { RefreshCw, AlertCircle, CheckCircle, Settings, Play, BarChart3 } from 'lucide-react';

interface FixResult {
  id: string;
  productName: string;
  orderNumber: string;
  oldSize?: string;
  newSize?: string;
  success?: boolean;
  error?: string;
}

interface FixSummary {
  total: number;
  updated: number;
  failed: number;
  details: FixResult[];
}

export default function StockXSizeFixTool() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [fixResult, setFixResult] = useState<FixSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyzeSizeIssues = async () => {
    setIsAnalyzing(true);
    setError(null);
    
    try {
      const response = await fetch('/api/gmail/fix-size-parsing', {
        method: 'GET',
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setAnalysisResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze size issues');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const runSizeFix = async () => {
    setIsFixing(true);
    setError(null);
    
    try {
      // Get Gmail access token (you'll need to implement this based on your auth flow)
      const accessToken = localStorage.getItem('gmail_access_token');
      
      if (!accessToken) {
        throw new Error('Gmail access token not found. Please reconnect Gmail.');
      }
      
      const response = await fetch('/api/gmail/fix-size-parsing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accessToken }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setFixResult(data.results);
      
      // Re-analyze to get updated counts
      await analyzeSizeIssues();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run size fix');
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-semibold">StockX Size Parsing Fix</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={analyzeSizeIssues}
            disabled={isAnalyzing}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              isAnalyzing
                ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            }`}
          >
            {isAnalyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
            {isAnalyzing ? 'Analyzing...' : 'Analyze Issues'}
          </button>
          
          {analysisResult && analysisResult.problematicPurchases > 0 && (
            <button
              onClick={runSizeFix}
              disabled={isFixing}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                isFixing
                  ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              {isFixing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {isFixing ? 'Fixing...' : 'Run Fix'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {analysisResult && (
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-3">Analysis Results</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-blue-50 p-3 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{analysisResult.totalPurchases}</div>
              <div className="text-sm text-blue-700">Total Purchases</div>
            </div>
            <div className="bg-green-50 p-3 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{analysisResult.stockxPurchases}</div>
              <div className="text-sm text-green-700">StockX Purchases</div>
            </div>
            <div className="bg-orange-50 p-3 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">{analysisResult.problematicPurchases}</div>
              <div className="text-sm text-orange-700">Need Size Fix</div>
            </div>
            <div className="bg-purple-50 p-3 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">
                {analysisResult.purchases.filter((p: any) => p.hasEmailId).length}
              </div>
              <div className="text-sm text-purple-700">Have Email ID</div>
            </div>
          </div>

          {analysisResult.problematicPurchases > 0 && (
            <div>
              <h4 className="font-medium mb-2">Purchases with Size "15":</h4>
              <div className="bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto">
                {analysisResult.purchases.map((purchase: any) => (
                  <div key={purchase.id} className="flex items-center justify-between py-1 border-b border-gray-200 last:border-b-0">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{purchase.productName}</div>
                      <div className="text-xs text-gray-500">Order: {purchase.orderNumber}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-orange-600">Size: {purchase.size}</div>
                      <div className="text-xs text-gray-500">
                        {purchase.hasEmailId ? '✅ Has Email ID' : '❌ No Email ID'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {fixResult && (
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-3">Fix Results</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-blue-50 p-3 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{fixResult.total}</div>
              <div className="text-sm text-blue-700">Total Processed</div>
            </div>
            <div className="bg-green-50 p-3 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{fixResult.updated}</div>
              <div className="text-sm text-green-700">Successfully Updated</div>
            </div>
            <div className="bg-red-50 p-3 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{fixResult.failed}</div>
              <div className="text-sm text-red-700">Failed</div>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">Detailed Results:</h4>
            <div className="bg-gray-50 rounded-lg p-3 max-h-60 overflow-y-auto">
              {fixResult.details.map((result: FixResult, index: number) => (
                <div key={index} className="flex items-center justify-between py-2 border-b border-gray-200 last:border-b-0">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{result.productName}</div>
                    <div className="text-xs text-gray-500">Order: {result.orderNumber}</div>
                  </div>
                  <div className="text-right">
                    {result.success ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <div>
                          <div className="text-sm font-medium text-green-600">
                            {result.oldSize} → {result.newSize}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-600" />
                        <div>
                          <div className="text-sm font-medium text-red-600">Failed</div>
                          <div className="text-xs text-gray-500">{result.error}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="bg-blue-50 p-4 rounded-lg">
        <h4 className="font-medium text-blue-900 mb-2">How this works:</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Finds all StockX purchases with size "15" (a common parsing error)</li>
          <li>• Re-fetches the original email content from Gmail</li>
          <li>• Uses improved regex patterns to extract the correct size</li>
          <li>• Updates the database with the correct size information</li>
          <li>• Logs all changes for your review</li>
        </ul>
      </div>
    </div>
  );
} 