import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, CheckCircle, AlertCircle, Clock, DollarSign } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';

interface RefreshProgress {
  type: 'connected' | 'total' | 'progress' | 'complete' | 'error';
  message?: string;
  count?: number;
  current?: number;
  total?: number;
  orderNumber?: string;
  status?: string;
  payout?: number;
  error?: string;
  successCount?: number;
  errorCount?: number;
}

interface StockXPayoutRefresherProps {
  onRefreshComplete?: () => void;
  skipCompleted?: boolean;
}

const StockXPayoutRefresher: React.FC<StockXPayoutRefresherProps> = ({ 
  onRefreshComplete,
  skipCompleted = true 
}) => {
  const { user } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [progress, setProgress] = useState<RefreshProgress | null>(null);
  const [completedOrders, setCompletedOrders] = useState<{orderNumber: string; payout: number; status: 'success' | 'error'; error?: string}[]>([]);
  const [estimatedTime, setEstimatedTime] = useState<string>('');
  const eventSourceRef = useRef<EventSource | null>(null);

  // Calculate estimated time based on number of sales
  useEffect(() => {
    if (progress?.total) {
      const secondsPerOrder = 0.75; // 750ms per order
      const totalSeconds = Math.ceil(progress.total * secondsPerOrder);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      setEstimatedTime(`${minutes}m ${seconds}s`);
    }
  }, [progress?.total]);

  const startRefresh = async () => {
    if (!user) return;

    setIsRefreshing(true);
    setProgress(null);
    setCompletedOrders([]);

    try {
      // Get user's ID token for authentication
      const idToken = await user.getIdToken();

      // Create EventSource for SSE
      const url = new URL('/api/stockx/refresh-payouts', window.location.origin);
      if (skipCompleted) {
        url.searchParams.set('skipCompleted', 'true');
      }

      // EventSource doesn't support custom headers, so we'll use fetch with ReadableStream
      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Accept': 'text/event-stream',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to start refresh: ${response.statusText}`);
      }

      // Read the stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              handleProgressUpdate(data);
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }

    } catch (error) {
      console.error('Error during payout refresh:', error);
      setProgress({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleProgressUpdate = (data: RefreshProgress) => {
    setProgress(data);

    // Track completed orders
    if (data.type === 'progress' && data.orderNumber) {
      setCompletedOrders(prev => [...prev, {
        orderNumber: data.orderNumber!,
        payout: data.payout || 0,
        status: data.status as 'success' | 'error',
        error: data.error
      }]);
    }

    // Handle completion
    if (data.type === 'complete') {
      onRefreshComplete?.();
    }
  };

  const cancelRefresh = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsRefreshing(false);
    setProgress({
      type: 'error',
      message: 'Refresh cancelled by user'
    });
  };

  const getProgressPercentage = () => {
    if (!progress || progress.type !== 'progress') return 0;
    if (!progress.total || !progress.current) return 0;
    return Math.round((progress.current / progress.total) * 100);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-400" />
            Payout Refresh
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            Update all sales with accurate payout information from StockX
          </p>
        </div>
        
        {!isRefreshing && (
          <button
            onClick={startRefresh}
            className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Payouts
          </button>
        )}
      </div>

      {/* Progress Display */}
      {isRefreshing && progress && (
        <div className="space-y-4">
          {/* Progress Bar */}
          {progress.type === 'progress' && progress.total && (
            <div>
              <div className="flex justify-between text-sm text-gray-400 mb-2">
                <span>Processing: {progress.current} of {progress.total}</span>
                <span>{getProgressPercentage()}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-green-500 to-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${getProgressPercentage()}%` }}
                />
              </div>
              {estimatedTime && (
                <p className="text-xs text-gray-500 mt-2">
                  Estimated time remaining: {estimatedTime}
                </p>
              )}
            </div>
          )}

          {/* Current Order Status */}
          {progress.type === 'progress' && progress.orderNumber && (
            <div className="bg-gray-700/50 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">
                  Order #{progress.orderNumber}
                </span>
                {progress.status === 'fetching' && (
                  <span className="flex items-center gap-1 text-yellow-400 text-sm">
                    <Clock className="w-3 h-3 animate-spin" />
                    Fetching...
                  </span>
                )}
                {progress.status === 'success' && (
                  <span className="flex items-center gap-1 text-green-400 text-sm">
                    <CheckCircle className="w-3 h-3" />
                    {formatCurrency(progress.payout || 0)}
                  </span>
                )}
                {progress.status === 'error' && (
                  <span className="flex items-center gap-1 text-red-400 text-sm">
                    <AlertCircle className="w-3 h-3" />
                    Error
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Cancel Button */}
          {progress.type !== 'complete' && progress.type !== 'error' && (
            <button
              onClick={cancelRefresh}
              className="bg-red-500/20 hover:bg-red-500/30 text-red-400 font-medium py-2 px-4 rounded-lg transition-colors duration-200 text-sm"
            >
              Cancel Refresh
            </button>
          )}
        </div>
      )}

      {/* Completion Message */}
      {progress?.type === 'complete' && (
        <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-400 mb-2">
            <CheckCircle className="w-5 h-5" />
            <span className="font-semibold">Refresh Complete!</span>
          </div>
          <p className="text-green-300 text-sm">{progress.message}</p>
          {progress.successCount !== undefined && progress.errorCount !== undefined && (
            <div className="mt-2 text-sm text-green-200">
              <p>✅ Success: {progress.successCount} orders</p>
              {progress.errorCount > 0 && (
                <p>❌ Errors: {progress.errorCount} orders</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {progress?.type === 'error' && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-400">
            <AlertCircle className="w-5 h-5" />
            <span className="font-semibold">Error</span>
          </div>
          <p className="text-red-300 text-sm mt-1">{progress.message}</p>
        </div>
      )}

      {/* Recent Updates (last 5) */}
      {completedOrders.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-400 mb-2">Recent Updates</h4>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {completedOrders.slice(-5).reverse().map((order, index) => (
              <div key={`${order.orderNumber}-${index}`} className="flex items-center justify-between text-xs">
                <span className="text-gray-500">#{order.orderNumber}</span>
                {order.status === 'success' ? (
                  <span className="text-green-400">{formatCurrency(order.payout)}</span>
                ) : (
                  <span className="text-red-400">Failed</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info Box */}
      {!isRefreshing && !progress && (
        <div className="mt-4 bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
          <p className="text-blue-300 text-sm">
            <strong>ℹ️ Background Refresh:</strong> This process fetches detailed payout information for each sale individually. 
            It processes ~1-2 orders per second to respect StockX rate limits.
          </p>
          <p className="text-blue-200 text-xs mt-2">
            {skipCompleted ? 'Only sales without payout data will be refreshed.' : 'All sales will be refreshed.'}
          </p>
        </div>
      )}
    </div>
  );
};

export default StockXPayoutRefresher;