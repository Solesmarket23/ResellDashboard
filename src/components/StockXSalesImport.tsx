import React, { useState } from 'react';
import { RefreshCw, Package, AlertCircle, CheckCircle } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import NeonNotification, { NotificationType } from './NeonNotification';

interface StockXSalesImportProps {
  userId: string;
  onImportComplete?: (success: boolean, salesCount: number) => void;
}

interface ImportProgress {
  phase: 'idle' | 'fetching' | 'enriching' | 'saving' | 'complete' | 'error';
  message: string;
  percentage: number;
  salesCount?: number;
  enrichedCount?: number;
}

const StockXSalesImport: React.FC<StockXSalesImportProps> = ({ userId, onImportComplete }) => {
  const { currentTheme } = useTheme();
  const isNeon = currentTheme.name === 'Neon';
  
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress>({
    phase: 'idle',
    message: '',
    percentage: 0
  });
  const [notification, setNotification] = useState<{
    isVisible: boolean;
    message: string;
    type: NotificationType;
  }>({ isVisible: false, message: '', type: 'success' });

  const handleImport = async () => {
    if (!userId) {
      setNotification({
        isVisible: true,
        message: 'Please sign in to import StockX sales',
        type: 'error'
      });
      return;
    }

    setIsImporting(true);
    setProgress({
      phase: 'fetching',
      message: 'Connecting to StockX and fetching sales...',
      percentage: 10
    });

    try {
      // Phase 1: Fetch sales with brand enrichment and payout data
      const response = await fetch('/api/stockx/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'completed',
          userId: userId,
          maxSales: 500,
          skipPayoutEnrichment: false // Get complete data
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
        phase: 'enriching',
        message: `Processing ${data.totalCount} sales with brand and payout data...`,
        percentage: 40,
        salesCount: data.totalCount
      });

      // Phase 2: Save to Firebase (this happens in the API, but we simulate progress)
      await new Promise(resolve => setTimeout(resolve, 1000));

      setProgress({
        phase: 'saving',
        message: 'Saving sales to database...',
        percentage: 70,
        salesCount: data.totalCount
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Phase 3: Complete
      setProgress({
        phase: 'complete',
        message: `✅ Successfully imported ${data.totalCount} sales with complete data!`,
        percentage: 100,
        salesCount: data.totalCount,
        enrichedCount: data.enrichedCount || 0
      });

      setNotification({
        isVisible: true,
        message: `🎉 Imported ${data.totalCount} StockX sales with brands, payouts, and complete product data!`,
        type: 'success'
      });

      // Call completion callback
      onImportComplete?.(true, data.totalCount);

      // Reset after a delay
      setTimeout(() => {
        setProgress({
          phase: 'idle',
          message: '',
          percentage: 0
        });
      }, 3000);

    } catch (error) {
      console.error('StockX import error:', error);
      setProgress({
        phase: 'error',
        message: `❌ Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        percentage: 0
      });

      setNotification({
        isVisible: true,
        message: `Import failed: ${error instanceof Error ? error.message : 'Please try again'}`,
        type: 'error'
      });

      onImportComplete?.(false, 0);

      // Reset after a delay
      setTimeout(() => {
        setProgress({
          phase: 'idle',
          message: '',
          percentage: 0
        });
      }, 5000);
    } finally {
      setIsImporting(false);
    }
  };

  const getProgressColor = () => {
    if (progress.phase === 'error') return isNeon ? 'from-red-500 to-red-600' : 'bg-red-500';
    if (progress.phase === 'complete') return isNeon ? 'from-green-500 to-green-600' : 'bg-green-500';
    return isNeon ? 'from-blue-500 to-blue-600' : 'bg-blue-500';
  };

  const getPhaseIcon = () => {
    switch (progress.phase) {
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-400" />;
      case 'complete':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      default:
        return <RefreshCw className={`w-5 h-5 text-blue-400 ${isImporting ? 'animate-spin' : ''}`} />;
    }
  };

  return (
    <>
      <NeonNotification
        isVisible={notification.isVisible}
        message={notification.message}
        type={notification.type}
        onClose={() => setNotification({ ...notification, isVisible: false })}
      />

      <div className={`${
        isNeon 
          ? 'bg-gray-800/50 border border-gray-700/50' 
          : 'bg-white border border-gray-200'
      } rounded-lg p-6`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className={`text-lg font-semibold flex items-center gap-2 ${
              isNeon ? 'text-white' : 'text-gray-900'
            }`}>
              <Package className="w-5 h-5 text-green-400" />
              StockX Sales Import
            </h3>
            <p className={`text-sm mt-1 ${
              isNeon ? 'text-gray-400' : 'text-gray-600'
            }`}>
              Import all your StockX sales with brands, payouts, and complete product data
            </p>
          </div>

          <button
            onClick={handleImport}
            disabled={isImporting}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all duration-200 ${
              isImporting
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : isNeon
                ? 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white shadow-lg shadow-green-500/25'
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
          >
            {isImporting ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5" />
                Import StockX Sales
              </>
            )}
          </button>
        </div>

        {/* Progress Display */}
        {progress.phase !== 'idle' && (
          <div className="space-y-3">
            {/* Progress Bar */}
            <div className={`h-3 rounded-full overflow-hidden ${
              isNeon ? 'bg-gray-700' : 'bg-gray-200'
            }`}>
              <div 
                className={`h-full transition-all duration-500 bg-gradient-to-r ${getProgressColor()}`}
                style={{ width: `${progress.percentage}%` }}
              />
            </div>

            {/* Status Message */}
            <div className="flex items-center gap-2">
              {getPhaseIcon()}
              <span className={`text-sm ${
                isNeon ? 'text-gray-300' : 'text-gray-700'
              }`}>
                {progress.message}
              </span>
            </div>

            {/* Stats */}
            {progress.salesCount && (
              <div className={`text-xs ${
                isNeon ? 'text-gray-400' : 'text-gray-500'
              }`}>
                {progress.phase === 'complete' && progress.enrichedCount ? (
                  <p>• Sales: {progress.salesCount} • Brand data: {progress.enrichedCount} enriched</p>
                ) : (
                  <p>• Processing {progress.salesCount} sales</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Feature List */}
        {progress.phase === 'idle' && (
          <div className={`mt-4 text-xs space-y-1 ${
            isNeon ? 'text-gray-400' : 'text-gray-500'
          }`}>
            <p>✅ Fetches all completed sales from StockX</p>
            <p>✅ Enriches with brand data from product catalog</p>
            <p>✅ Includes accurate payout and fee information</p>
            <p>✅ Saves complete product details to your database</p>
          </div>
        )}
      </div>
    </>
  );
};

export default StockXSalesImport;
