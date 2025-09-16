'use client';

import React, { useState } from 'react';
import { Search, TestTube, RefreshCw, CheckCircle, XCircle, AlertTriangle, Clock } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

interface ScraperTestResult {
  strategy: string;
  success: boolean;
  data?: any;
  error?: string;
  responseTime?: number;
}

const ScraperTester: React.FC = () => {
  const { currentTheme } = useTheme();
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState('');
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<ScraperTestResult[]>([]);
  const [singleResult, setSingleResult] = useState<any>(null);

  const testScrapers = async () => {
    if (!trackingNumber.trim()) {
      alert('Please enter a tracking number');
      return;
    }

    setTesting(true);
    setResults([]);
    setSingleResult(null);

    try {
      console.log(`🧪 Testing scrapers for: ${trackingNumber}`);
      
      const response = await fetch(`/api/tracking/scrape?trackingNumber=${encodeURIComponent(trackingNumber)}&carrier=${encodeURIComponent(carrier)}`);
      const data = await response.json();
      
      if (data.success) {
        setSingleResult(data.data);
        console.log('✅ Scraper test successful:', data.data);
      } else {
        console.error('❌ Scraper test failed:', data.error);
        alert(`Scraper test failed: ${data.error}`);
      }
    } catch (error) {
      console.error('❌ Error testing scrapers:', error);
      alert(`Error testing scrapers: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setTesting(false);
    }
  };

  const testAllStrategies = async () => {
    if (!trackingNumber.trim()) {
      alert('Please enter a tracking number');
      return;
    }

    setTesting(true);
    setResults([]);
    setSingleResult(null);

    try {
      console.log(`🧪 Testing all strategies for: ${trackingNumber}`);
      
      // Test each strategy individually
      const strategies = ['fetch', 'puppeteer'];
      const testResults: ScraperTestResult[] = [];
      
      for (const strategy of strategies) {
        const startTime = Date.now();
        
        try {
          const response = await fetch(`/api/tracking/scrape?trackingNumber=${encodeURIComponent(trackingNumber)}&carrier=${encodeURIComponent(carrier)}&strategy=${strategy}`);
          const data = await response.json();
          const responseTime = Date.now() - startTime;
          
          testResults.push({
            strategy,
            success: data.success,
            data: data.data,
            error: data.error,
            responseTime
          });
        } catch (error) {
          const responseTime = Date.now() - startTime;
          testResults.push({
            strategy,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            responseTime
          });
        }
      }
      
      setResults(testResults);
      console.log('🧪 All strategy tests completed:', testResults);
      
    } catch (error) {
      console.error('❌ Error testing all strategies:', error);
      alert(`Error testing all strategies: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setTesting(false);
    }
  };

  const getStatusIcon = (success: boolean) => {
    return success ? (
      <CheckCircle className="w-4 h-4 text-green-500" />
    ) : (
      <XCircle className="w-4 h-4 text-red-500" />
    );
  };

  const getStatusColor = (success: boolean) => {
    return success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  };

  return (
    <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border}`}>
      <div className="flex items-center gap-2 mb-6">
        <TestTube className="w-6 h-6 text-blue-600" />
        <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
          Scraper Tester
        </h3>
      </div>

      {/* Test Form */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className={`block text-sm font-medium ${currentTheme.colors.textPrimary} mb-2`}>
            Tracking Number
          </label>
          <input
            type="text"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="Enter tracking number"
            className={`w-full px-3 py-2 border rounded-lg ${currentTheme.colors.border} ${currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary}`}
          />
        </div>
        
        <div>
          <label className={`block text-sm font-medium ${currentTheme.colors.textPrimary} mb-2`}>
            Carrier (optional)
          </label>
          <select
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg ${currentTheme.colors.border} ${currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary}`}
          >
            <option value="">Auto-detect</option>
            <option value="fedex">FedEx</option>
            <option value="ups">UPS</option>
            <option value="usps">USPS</option>
            <option value="dhl">DHL</option>
          </select>
        </div>
        
        <div className="flex items-end gap-2">
          <button
            onClick={testScrapers}
            disabled={testing}
            className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
              testing
                ? 'bg-gray-400 cursor-not-allowed text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {testing ? (
              <>
                <div className="w-4 h-4 border-2 border-transparent border-t-current rounded-full animate-spin"></div>
                Testing...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Test Scraper
              </>
            )}
          </button>
          
          <button
            onClick={testAllStrategies}
            disabled={testing}
            className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
              testing
                ? 'bg-gray-400 cursor-not-allowed text-white'
                : 'bg-purple-600 hover:bg-purple-700 text-white'
            }`}
          >
            <TestTube className="w-4 h-4" />
            Test All
          </button>
        </div>
      </div>

      {/* Single Result */}
      {singleResult && (
        <div className={`mb-6 p-4 rounded-lg border ${currentTheme.colors.border}`}>
          <h4 className={`text-md font-medium ${currentTheme.colors.textPrimary} mb-3`}>
            Scraper Result
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                <strong>Tracking Number:</strong> {singleResult.trackingNumber}
              </p>
              <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                <strong>Carrier:</strong> {singleResult.carrier}
              </p>
              <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                <strong>Status:</strong> {singleResult.status}
              </p>
              {singleResult.error && (
                <p className={`text-sm text-red-600`}>
                  <strong>Error:</strong> {singleResult.error}
                </p>
              )}
            </div>
            
            <div>
              {singleResult.estimatedDelivery && (
                <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                  <strong>Estimated Delivery:</strong> {new Date(singleResult.estimatedDelivery).toLocaleDateString()}
                </p>
              )}
              <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                <strong>Last Update:</strong> {new Date(singleResult.lastUpdate).toLocaleString()}
              </p>
              <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                <strong>Updates:</strong> {singleResult.updates?.length || 0}
              </p>
            </div>
          </div>
          
          {singleResult.updates && singleResult.updates.length > 0 && (
            <div className="mt-4">
              <h5 className={`text-sm font-medium ${currentTheme.colors.textPrimary} mb-2`}>
                Tracking Updates:
              </h5>
              <div className="space-y-2">
                {singleResult.updates.slice(0, 3).map((update: any, index: number) => (
                  <div key={index} className={`p-2 rounded border ${currentTheme.colors.border}`}>
                    <p className={`text-sm ${currentTheme.colors.textPrimary}`}>
                      {update.description}
                    </p>
                    <p className={`text-xs ${currentTheme.colors.textSecondary}`}>
                      {update.location} • {new Date(update.timestamp).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Multiple Results */}
      {results.length > 0 && (
        <div className={`mb-6 p-4 rounded-lg border ${currentTheme.colors.border}`}>
          <h4 className={`text-md font-medium ${currentTheme.colors.textPrimary} mb-3`}>
            Strategy Comparison
          </h4>
          
          <div className="space-y-3">
            {results.map((result, index) => (
              <div key={index} className={`p-3 rounded-lg border ${currentTheme.colors.border}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(result.success)}
                    <span className={`font-medium ${currentTheme.colors.textPrimary}`}>
                      {result.strategy.toUpperCase()} Strategy
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(result.success)}`}>
                      {result.success ? 'Success' : 'Failed'}
                    </span>
                  </div>
                  
                  {result.responseTime && (
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-gray-500" />
                      <span className={`text-xs ${currentTheme.colors.textSecondary}`}>
                        {result.responseTime}ms
                      </span>
                    </div>
                  )}
                </div>
                
                {result.success && result.data ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <p className={`${currentTheme.colors.textSecondary}`}>
                      <strong>Status:</strong> {result.data.status}
                    </p>
                    <p className={`${currentTheme.colors.textSecondary}`}>
                      <strong>Updates:</strong> {result.data.updates?.length || 0}
                    </p>
                    {result.data.estimatedDelivery && (
                      <p className={`${currentTheme.colors.textSecondary}`}>
                        <strong>Est. Delivery:</strong> {new Date(result.data.estimatedDelivery).toLocaleDateString()}
                      </p>
                    )}
                    <p className={`${currentTheme.colors.textSecondary}`}>
                      <strong>Last Update:</strong> {new Date(result.data.lastUpdate).toLocaleString()}
                    </p>
                  </div>
                ) : (
                  <p className={`text-sm text-red-600`}>
                    <strong>Error:</strong> {result.error}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className={`p-4 rounded-lg border ${currentTheme.colors.border} bg-gray-50`}>
        <h4 className={`text-md font-medium ${currentTheme.colors.textPrimary} mb-2`}>
          How to Use
        </h4>
        <ul className={`text-sm space-y-1 ${currentTheme.colors.textSecondary}`}>
          <li>• Enter a tracking number to test the scraper</li>
          <li>• Select a carrier or leave blank for auto-detection</li>
          <li>• "Test Scraper" uses the best available strategy</li>
          <li>• "Test All" compares all available strategies</li>
          <li>• Check the results to see which strategy works best</li>
        </ul>
      </div>
    </div>
  );
};

export default ScraperTester;
