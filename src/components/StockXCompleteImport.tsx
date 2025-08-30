import React, { useState } from 'react';
import { RefreshCw, Package, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface ImportProgress {
  phase: 'fetching' | 'enriching' | 'complete' | 'error';
  currentBatch?: number;
  totalBatches?: number;
  salesFetched?: number;
  processedCount?: number;
  totalCount?: number;
  successCount?: number;
  errorCount?: number;
  message?: string;
}

interface StockXCompleteImportProps {
  onImportComplete?: (sales: any[]) => void;
  userId: string;
}

const StockXCompleteImport: React.FC<StockXCompleteImportProps> = ({ onImportComplete, userId }) => {
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importedSales, setImportedSales] = useState<any[]>([]);

  const handleCompleteImport = async () => {
    setIsImporting(true);
    setError(null);
    setProgress({ phase: 'fetching', message: 'Starting import process...' });
    setImportedSales([]);

    try {
      // Update progress periodically during import
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev?.phase === 'fetching') {
            return {
              ...prev,
              message: `Fetching sales from StockX... This may take a few minutes for large inventories.`
            };
          } else if (prev?.phase === 'enriching') {
            return {
              ...prev,
              message: `Enriching sales with complete fee data... Please wait.`
            };
          }
          return prev;
        });
      }, 3000);

      setProgress({ phase: 'fetching', message: 'Connecting to StockX and fetching all sales...' });

      const response = await fetch('/api/stockx/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'completed',
          userId: userId,
          maxSales: 50, // Safe limit for Vercel Hobby tier
          skipPayoutEnrichment: false
        }),
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Failed to import: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        setImportedSales(data.data);
        setProgress({
          phase: 'complete',
          totalCount: data.totalCount,
          successCount: data.salesWithPayouts,
          message: data.hasMore 
            ? `Imported first ${data.totalCount} sales. ${data.salesWithPayouts} have fee data. More sales available.`
            : `Import complete! ${data.totalCount} sales imported with ${data.salesWithPayouts} having fee data.`
        });

        if (onImportComplete) {
          onImportComplete(data.data);
        }
        
        // Show warning if there are more sales
        if (data.hasMore) {
          setError('Note: Only the first 50 sales were imported due to timeout constraints. Consider using the chunked import for larger inventories.');
        }
      } else {
        throw new Error(data.error || 'Import failed');
      }

    } catch (err) {
      console.error('Import error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setProgress({ phase: 'error', message: 'Import failed' });
    } finally {
      setIsImporting(false);
    }
  };

  const getProgressPercentage = () => {
    if (!progress) return 0;
    
    if (progress.phase === 'fetching') {
      return 33; // 1/3 of the process
    }
    
    if (progress.phase === 'enriching') {
      return 66; // 2/3 of the process
    }
    
    if (progress.phase === 'complete') return 100;
    
    return 0;
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-green-400" />
            Complete Sales Import
          </h3>
          <p className="text-gray-400 text-sm mt-1">
            Import all sales with complete fee and payout data in one go
          </p>
        </div>
        <button
          onClick={handleCompleteImport}
          disabled={isImporting}
          className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center gap-2"
        >
          {isImporting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              Import All Sales
            </>
          )}
        </button>
      </div>

      {/* Progress Display */}
      {progress && (
        <div className="space-y-4">
          {/* Progress Bar */}
          <div className="bg-gray-700 rounded-full h-2 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-green-500 to-emerald-500 h-full transition-all duration-500"
              style={{ width: `${getProgressPercentage()}%` }}
            />
          </div>

          {/* Status Message */}
          <div className="flex items-center gap-2">
            {progress.phase === 'fetching' && (
              <>
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                <span className="text-blue-400">{progress.message}</span>
              </>
            )}
            {progress.phase === 'enriching' && (
              <>
                <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
                <span className="text-yellow-400">{progress.message}</span>
              </>
            )}
            {progress.phase === 'complete' && (
              <>
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-green-400">{progress.message}</span>
              </>
            )}
            {progress.phase === 'error' && (
              <>
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-400">{progress.message}</span>
              </>
            )}
          </div>

          {/* Detailed Stats */}
          {progress.phase === 'enriching' && progress.totalCount && (
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="bg-gray-700/50 rounded-lg p-3">
                <p className="text-gray-400">Processed</p>
                <p className="text-white font-semibold">
                  {progress.processedCount || 0} / {progress.totalCount}
                </p>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-3">
                <p className="text-gray-400">Success</p>
                <p className="text-green-400 font-semibold">{progress.successCount || 0}</p>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-3">
                <p className="text-gray-400">Errors</p>
                <p className="text-red-400 font-semibold">{progress.errorCount || 0}</p>
              </div>
            </div>
          )}

          {/* Batch Info */}
          {progress.phase === 'enriching' && progress.currentBatch && (
            <div className="text-sm text-gray-400">
              Processing batch {progress.currentBatch} of {progress.totalBatches}
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mt-4 bg-red-900/20 border border-red-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <p className="text-red-400">{error}</p>
          </div>
        </div>
      )}

      {/* Success Summary */}
      {progress?.phase === 'complete' && importedSales.length > 0 && (
        <div className="mt-4 bg-green-900/20 border border-green-500/30 rounded-lg p-4">
          <h4 className="text-green-400 font-semibold mb-2">Import Complete!</h4>
          <div className="space-y-1 text-sm text-green-300">
            <p>• Total sales imported: {progress.totalCount}</p>
            <p>• Sales with payout data: {progress.successCount}</p>
            {progress.errorCount > 0 && (
              <p>• Failed to fetch payout data: {progress.errorCount}</p>
            )}
          </div>
        </div>
      )}

      {/* Note about Import Process */}
      <div className="mt-4 text-xs text-gray-500">
        <p>Note: This import process fetches all your sales with complete fee data in one operation.</p>
        <p>The process may take a few minutes for large inventories as it retrieves detailed payout information for each sale.</p>
      </div>
    </div>
  );
};

export default StockXCompleteImport;