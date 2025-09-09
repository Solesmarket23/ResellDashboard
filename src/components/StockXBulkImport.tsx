'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { Download, AlertCircle, CheckCircle, Loader2, BarChart3 } from 'lucide-react';

interface BulkImportProgress {
  phase: 'fetching' | 'saving' | 'complete';
  message: string;
  totalSales?: number;
  breakdown?: {
    completed: number;
    authenticated: number;
    other: number;
  };
}

interface StockXBulkImportProps {
  onImportComplete?: (success: boolean, count?: number) => void;
}

const StockXBulkImport: React.FC<StockXBulkImportProps> = ({ onImportComplete }) => {
  const { user } = useAuth();
  const { currentTheme } = useTheme();
  const isNeon = currentTheme === 'neon';

  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<BulkImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleBulkImport = async () => {
    if (!user) {
      setError('Please sign in to import sales');
      return;
    }

    setIsImporting(true);
    setError(null);
    setProgress({
      phase: 'fetching',
      message: 'Starting comprehensive sales import...'
    });

    try {
      console.log('🚀 Starting bulk StockX sales import');

      const response = await fetch('/api/stockx/sales/bulk-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.uid,
          maxSales: 2000 // Import up to 2000 sales
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Import failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Import failed');
      }

      setProgress({
        phase: 'complete',
        message: `✅ Successfully imported ${data.totalSales} StockX sales!`,
        totalSales: data.totalSales,
        breakdown: data.breakdown
      });

      console.log('✅ Bulk import completed:', data);

      // Call completion callback
      onImportComplete?.(true, data.totalSales);

    } catch (error: any) {
      console.error('❌ Bulk import error:', error);
      setError(error.message || 'Import failed');
      setProgress(null);
      onImportComplete?.(false);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className={`p-6 rounded-lg border ${
      isNeon 
        ? 'bg-gray-900/50 border-cyan-500/30' 
        : 'bg-white border-gray-200'
    }`}>
      <div className="flex items-center space-x-3 mb-4">
        <div className={`p-2 rounded-lg ${
          isNeon ? 'bg-cyan-500/20' : 'bg-blue-100'
        }`}>
          <BarChart3 className={`w-5 h-5 ${
            isNeon ? 'text-cyan-400' : 'text-blue-600'
          }`} />
        </div>
        <div>
          <h3 className={`text-lg font-semibold ${
            isNeon ? 'text-white' : 'text-gray-900'
          }`}>
            Bulk Sales Import
          </h3>
          <p className={`text-sm ${
            isNeon ? 'text-gray-400' : 'text-gray-600'
          }`}>
            Import all your StockX sales (up to 2000) with complete data
          </p>
        </div>
      </div>

      {error && (
        <div className={`mb-4 p-4 rounded-lg flex items-start space-x-3 ${
          isNeon ? 'bg-red-900/30 border border-red-500/30' : 'bg-red-50 border border-red-200'
        }`}>
          <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
            isNeon ? 'text-red-400' : 'text-red-600'
          }`} />
          <div>
            <h4 className={`font-medium ${
              isNeon ? 'text-red-300' : 'text-red-800'
            }`}>
              Import Failed
            </h4>
            <p className={`text-sm mt-1 ${
              isNeon ? 'text-red-400' : 'text-red-700'
            }`}>
              {error}
            </p>
          </div>
        </div>
      )}

      {progress && (
        <div className={`mb-4 p-4 rounded-lg ${
          isNeon ? 'bg-gray-800/50 border border-gray-700' : 'bg-gray-50 border border-gray-200'
        }`}>
          <div className="flex items-center space-x-3">
            {progress.phase === 'complete' ? (
              <CheckCircle className={`w-5 h-5 ${
                isNeon ? 'text-green-400' : 'text-green-600'
              }`} />
            ) : (
              <Loader2 className={`w-5 h-5 animate-spin ${
                isNeon ? 'text-cyan-400' : 'text-blue-600'
              }`} />
            )}
            <div className="flex-1">
              <p className={`text-sm font-medium ${
                isNeon ? 'text-white' : 'text-gray-900'
              }`}>
                {progress.message}
              </p>
              
              {progress.breakdown && (
                <div className={`mt-2 grid grid-cols-3 gap-4 text-xs ${
                  isNeon ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  <div>
                    <span className={`font-medium ${
                      isNeon ? 'text-green-400' : 'text-green-600'
                    }`}>
                      {progress.breakdown.completed}
                    </span> Completed
                  </div>
                  <div>
                    <span className={`font-medium ${
                      isNeon ? 'text-yellow-400' : 'text-yellow-600'
                    }`}>
                      {progress.breakdown.authenticated}
                    </span> Authenticated
                  </div>
                  <div>
                    <span className={`font-medium ${
                      isNeon ? 'text-blue-400' : 'text-blue-600'
                    }`}>
                      {progress.breakdown.other}
                    </span> Other
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className={`text-sm ${
          isNeon ? 'text-gray-400' : 'text-gray-600'
        }`}>
          <h4 className={`font-medium mb-2 ${
            isNeon ? 'text-white' : 'text-gray-900'
          }`}>
            What this import includes:
          </h4>
          <ul className="space-y-1">
            <li>• All completed StockX sales (up to 2000)</li>
            <li>• Complete product information (brand, name, images)</li>
            <li>• Order numbers and transaction details</li>
            <li>• Pricing breakdown and net payouts</li>
            <li>• Saves to both StockX collection and main sales table</li>
          </ul>
        </div>

        <button
          onClick={handleBulkImport}
          disabled={isImporting}
          className={`w-full px-4 py-3 rounded-lg font-medium transition-all ${
            isImporting
              ? isNeon
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              : isNeon
                ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {isImporting ? (
            <div className="flex items-center justify-center space-x-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Importing Sales...</span>
            </div>
          ) : (
            <div className="flex items-center justify-center space-x-2">
              <Download className="w-4 h-4" />
              <span>Start Bulk Import</span>
            </div>
          )}
        </button>
      </div>

      {progress?.phase === 'complete' && (
        <div className={`mt-4 p-3 rounded-lg text-center ${
          isNeon ? 'bg-green-900/30 border border-green-500/30' : 'bg-green-50 border border-green-200'
        }`}>
          <p className={`text-sm ${
            isNeon ? 'text-green-300' : 'text-green-700'
          }`}>
            🎉 Your sales have been imported and should now appear in the main Sales table!
          </p>
        </div>
      )}
    </div>
  );
};

export default StockXBulkImport;
