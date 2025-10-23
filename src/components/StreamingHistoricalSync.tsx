import React, { useState, useEffect } from 'react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { RefreshCw, CheckCircle, AlertCircle, X, TrendingUp, Mail, Search } from 'lucide-react';

interface StreamingHistoricalSyncProps {
  isOpen: boolean;
  onClose: () => void;
  onPurchasesUpdate: (purchases: any[]) => void;
  onSyncComplete: (totalPurchases: number) => void;
  className?: string;
}

interface SyncUpdate {
  type: string;
  message: string;
  progress: number;
  totalEmails: number;
  purchasesFound: number;
  currentQuery?: number;
  totalQueries?: number;
  currentQueryText?: string;
  emailsInQuery?: number;
  currentBatch?: number;
  totalBatches?: number;
  newPurchases?: any[];
  allPurchases?: any[];
  finalPurchases?: any[];
  stats?: any;
  error?: string;
}

const StreamingHistoricalSync: React.FC<StreamingHistoricalSyncProps> = ({
  isOpen,
  onClose,
  onPurchasesUpdate,
  onSyncComplete,
  className = ''
}) => {
  const { currentTheme } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('Ready to start historical sync...');
  const [totalEmails, setTotalEmails] = useState(0);
  const [purchasesFound, setPurchasesFound] = useState(0);
  const [currentQuery, setCurrentQuery] = useState(0);
  const [totalQueries, setTotalQueries] = useState(0);
  const [currentQueryText, setCurrentQueryText] = useState('');
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [allPurchases, setAllPurchases] = useState<any[]>([]);
  const [recentPurchases, setRecentPurchases] = useState<any[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  useEffect(() => {
    if (isOpen) {
      startStreamingSync();
    } else {
      // Cancel the sync when modal closes
      if (abortController) {
        console.log('🛑 Cancelling historical sync due to modal close');
        abortController.abort();
        setAbortController(null);
      }
      
      // Reset state when modal closes
      setIsLoading(false);
      setProgress(0);
      setMessage('Ready to start historical sync...');
      setTotalEmails(0);
      setPurchasesFound(0);
      setCurrentQuery(0);
      setTotalQueries(0);
      setCurrentQueryText('');
      setCurrentBatch(0);
      setTotalBatches(0);
      setAllPurchases([]);
      setRecentPurchases([]);
      setIsComplete(false);
      setError(null);
      setStats(null);
    }
  }, [isOpen, abortController]);

  const startStreamingSync = async () => {
    setIsLoading(true);
    setError(null);
    setMessage('Starting historical sync...');
    setProgress(0);

    // Create abort controller for cancellation
    const controller = new AbortController();
    setAbortController(controller);

    try {
      const response = await fetch('/api/gmail/historical-sync-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal, // Add abort signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data: SyncUpdate = JSON.parse(line.slice(6));
              handleSyncUpdate(data);
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }

    } catch (err) {
      console.error('Streaming sync error:', err);
      
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('🛑 Historical sync was cancelled');
        setMessage('Historical sync was cancelled');
        setError(null); // Don't show error for cancellation
      } else if (err instanceof Error && err.message.includes('Failed to fetch')) {
        setError('Gmail is not connected. Please connect Gmail first before running historical sync.');
      } else {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
      
      setIsLoading(false);
      setAbortController(null);
    }
  };

  const handleSyncUpdate = (update: SyncUpdate) => {
    console.log('📡 Sync update:', update);

    switch (update.type) {
      case 'start':
        setMessage(update.message);
        setProgress(update.progress);
        break;

      case 'progress':
        setMessage(update.message);
        setProgress(update.progress);
        setTotalEmails(update.totalEmails);
        setPurchasesFound(update.purchasesFound);
        setCurrentQuery(update.currentQuery || 0);
        setTotalQueries(update.totalQueries || 0);
        break;

      case 'query_start':
        setMessage(update.message);
        setProgress(update.progress);
        setCurrentQueryText(update.currentQueryText || '');
        break;

      case 'query_result':
        setMessage(update.message);
        setTotalEmails(update.totalEmails);
        break;

      case 'batch_start':
        setMessage(update.message);
        setProgress(update.progress);
        setCurrentBatch(update.currentBatch || 0);
        setTotalBatches(update.totalBatches || 0);
        break;

      case 'purchases_found':
        setMessage(update.message);
        setProgress(update.progress);
        setPurchasesFound(update.purchasesFound);
        setAllPurchases(update.allPurchases || []);
        setRecentPurchases(update.newPurchases || []);
        
        // Notify parent component of new purchases
        if (update.allPurchases) {
          onPurchasesUpdate(update.allPurchases);
        }
        break;

      case 'batch_complete':
        setMessage(update.message);
        setProgress(update.progress);
        break;

      case 'consolidating':
        setMessage(update.message);
        setProgress(update.progress);
        break;

      case 'complete':
        setMessage(update.message);
        setProgress(100);
        setPurchasesFound(update.purchasesFound);
        setAllPurchases(update.finalPurchases || []);
        setStats(update.stats);
        setIsComplete(true);
        setIsLoading(false);
        setAbortController(null); // Clear abort controller on completion
        
        // Notify parent component of final results
        if (update.finalPurchases) {
          onPurchasesUpdate(update.finalPurchases);
          onSyncComplete(update.finalPurchases.length);
        }
        break;

      case 'error':
        setError(update.error || 'Unknown error');
        setIsLoading(false);
        break;

      case 'query_error':
        console.warn('Query error:', update.error);
        break;

      case 'query_complete':
        setMessage(update.message);
        setProgress(update.progress);
        setTotalEmails(update.totalEmails);
        setPurchasesFound(update.purchasesFound);
        setCurrentQuery(update.currentQuery || 0);
        setTotalQueries(update.totalQueries || 0);
        break;

      case 'query_empty':
        setMessage(update.message);
        setProgress(update.progress);
        setTotalEmails(update.totalEmails);
        setPurchasesFound(update.purchasesFound);
        setCurrentQuery(update.currentQuery || 0);
        setTotalQueries(update.totalQueries || 0);
        break;
    }
  };

  const formatProgress = (progress: number) => {
    return Math.round(progress);
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 ${className}`}>
      <div className={`max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden rounded-lg ${currentTheme.colors.background} border ${currentTheme.colors.border}`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${currentTheme.colors.border}`}>
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${currentTheme.name === 'Neon' ? 'bg-violet-500/20' : 'bg-indigo-500/20'}`}>
              <Search className={`w-6 h-6 ${currentTheme.name === 'Neon' ? 'text-violet-400' : 'text-indigo-500'}`} />
            </div>
            <div>
              <h2 className={`text-xl font-semibold ${currentTheme.colors.textPrimary}`}>
                Historical Sync
              </h2>
              <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                Searching through all your emails for purchases
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-full ${currentTheme.colors.textSecondary} hover:${currentTheme.colors.textPrimary} transition-colors`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[calc(90vh-140px)] overflow-y-auto">
          {/* Progress Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className={`text-sm font-medium ${currentTheme.colors.textPrimary}`}>
                Progress
              </span>
              <span className={`text-sm ${currentTheme.colors.textSecondary}`}>
                {formatProgress(progress)}%
              </span>
            </div>
            
            <div className={`w-full bg-gray-200 rounded-full h-3 ${currentTheme.name === 'Neon' ? 'bg-white/10' : 'bg-gray-200'}`}>
              <div
                className={`h-3 rounded-full transition-all duration-300 ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-gradient-to-r from-violet-500 to-purple-500' 
                    : 'bg-gradient-to-r from-indigo-500 to-purple-500'
                }`}
                style={{ width: `${formatProgress(progress)}%` }}
              />
            </div>

            <div className={`text-sm ${currentTheme.colors.textSecondary}`}>
              {message}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={`p-4 rounded-lg ${currentTheme.name === 'Neon' ? 'bg-white/5' : 'bg-gray-50'}`}>
              <div className="flex items-center space-x-2">
                <Mail className={`w-4 h-4 ${currentTheme.colors.textSecondary}`} />
                <span className={`text-sm ${currentTheme.colors.textSecondary}`}>Emails</span>
              </div>
              <div className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>
                {formatNumber(totalEmails)}
              </div>
            </div>

            <div className={`p-4 rounded-lg ${currentTheme.name === 'Neon' ? 'bg-white/5' : 'bg-gray-50'}`}>
              <div className="flex items-center space-x-2">
                <TrendingUp className={`w-4 h-4 ${currentTheme.colors.textSecondary}`} />
                <span className={`text-sm ${currentTheme.colors.textSecondary}`}>Purchases</span>
              </div>
              <div className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>
                {formatNumber(purchasesFound)}
              </div>
            </div>

            <div className={`p-4 rounded-lg ${currentTheme.name === 'Neon' ? 'bg-white/5' : 'bg-gray-50'}`}>
              <div className="flex items-center space-x-2">
                <Search className={`w-4 h-4 ${currentTheme.colors.textSecondary}`} />
                <span className={`text-sm ${currentTheme.colors.textSecondary}`}>Query</span>
              </div>
              <div className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>
                {currentQuery}/{totalQueries}
              </div>
            </div>

            <div className={`p-4 rounded-lg ${currentTheme.name === 'Neon' ? 'bg-white/5' : 'bg-gray-50'}`}>
              <div className="flex items-center space-x-2">
                <RefreshCw className={`w-4 h-4 ${currentTheme.colors.textSecondary}`} />
                <span className={`text-sm ${currentTheme.colors.textSecondary}`}>Batch</span>
              </div>
              <div className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>
                {currentBatch}/{totalBatches}
              </div>
            </div>
          </div>

          {/* Current Query */}
          {currentQueryText && (
            <div className={`p-4 rounded-lg ${currentTheme.name === 'Neon' ? 'bg-white/5' : 'bg-gray-50'}`}>
              <div className={`text-sm font-medium ${currentTheme.colors.textPrimary} mb-2`}>
                Current Search Query:
              </div>
              <div className={`text-sm ${currentTheme.colors.textSecondary} font-mono`}>
                {currentQueryText}
              </div>
            </div>
          )}

          {/* Recent Purchases */}
          {recentPurchases.length > 0 && (
            <div className={`p-4 rounded-lg ${currentTheme.name === 'Neon' ? 'bg-white/5' : 'bg-gray-50'}`}>
              <div className={`text-sm font-medium ${currentTheme.colors.textPrimary} mb-3`}>
                Recently Found Purchases:
              </div>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {recentPurchases.slice(-5).map((purchase, index) => (
                  <div key={index} className={`text-sm ${currentTheme.colors.textSecondary} flex items-center space-x-2`}>
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>{purchase.product?.name || 'Unknown Product'}</span>
                    <span className="text-xs opacity-75">- {purchase.orderNumber}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className={`p-4 rounded-lg bg-red-50 border border-red-200 ${currentTheme.name === 'Neon' ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span className="text-red-700 font-medium">Error</span>
              </div>
              <p className="text-red-600 text-sm mt-1">{error}</p>
            </div>
          )}

          {/* Complete State */}
          {isComplete && stats && (
            <div className={`p-4 rounded-lg ${currentTheme.name === 'Neon' ? 'bg-green-500/10 border border-green-500/20' : 'bg-green-50 border border-green-200'}`}>
              <div className="flex items-center space-x-2 mb-3">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="text-green-700 font-medium">Sync Complete!</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className={currentTheme.colors.textSecondary}>Emails Processed:</span>
                  <span className={`ml-2 font-medium ${currentTheme.colors.textPrimary}`}>
                    {formatNumber(stats.totalEmailsProcessed)}
                  </span>
                </div>
                <div>
                  <span className={currentTheme.colors.textSecondary}>Total Emails Found:</span>
                  <span className={`ml-2 font-medium ${currentTheme.colors.textPrimary}`}>
                    {formatNumber(stats.totalEmailsFound)}
                  </span>
                </div>
                <div>
                  <span className={currentTheme.colors.textSecondary}>Before Consolidation:</span>
                  <span className={`ml-2 font-medium ${currentTheme.colors.textPrimary}`}>
                    {formatNumber(stats.purchasesBeforeConsolidation)}
                  </span>
                </div>
                <div>
                  <span className={currentTheme.colors.textSecondary}>After Consolidation:</span>
                  <span className={`ml-2 font-medium ${currentTheme.colors.textPrimary}`}>
                    {formatNumber(stats.purchasesAfterConsolidation)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between p-6 border-t ${currentTheme.colors.border}`}>
          <div className="text-sm text-gray-500">
            {isLoading && !isComplete && (
              <span>💡 Tip: Closing this window will stop the sync</span>
            )}
          </div>
          
          <div className="flex items-center space-x-3">
            {isLoading && !isComplete && (
              <button
                onClick={() => {
                  if (abortController) {
                    console.log('🛑 Manual stop requested');
                    abortController.abort();
                    setAbortController(null);
                    setIsLoading(false);
                    setMessage('Historical sync was stopped');
                  }
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentTheme.name === 'Neon'
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-red-500 hover:bg-red-600 text-white'
                }`}
              >
                Stop Sync
              </button>
            )}
            
            {isComplete ? (
              <button
                onClick={onClose}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentTheme.name === 'Neon'
                    ? 'bg-violet-500 hover:bg-violet-600 text-white'
                    : 'bg-indigo-500 hover:bg-indigo-600 text-white'
                }`}
              >
                Close
              </button>
            ) : (
              <button
                onClick={onClose}
                disabled={isLoading}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentTheme.name === 'Neon'
                    ? 'bg-gray-500 hover:bg-gray-600 text-white'
                    : 'bg-gray-500 hover:bg-gray-600 text-white'
                } disabled:opacity-50`}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StreamingHistoricalSync;
