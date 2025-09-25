'use client';

import { useState, useEffect } from 'react';
import { Loader2, CheckCircle, XCircle, Play, Square } from 'lucide-react';

interface SyncProgress {
  isRunning: boolean;
  currentBatch: number;
  totalBatches: number;
  totalFound: number;
  totalProcessed: number;
  purchases: any[];
  error: string | null;
  startTime: number | null;
  elapsedTime: number;
}

interface SyncProgressIndicatorProps {
  onPurchasesUpdate?: (purchases: any[]) => void;
}

export default function SyncProgressIndicator({ onPurchasesUpdate }: SyncProgressIndicatorProps) {
  const [progress, setProgress] = useState<SyncProgress>({
    isRunning: false,
    currentBatch: 0,
    totalBatches: 0,
    totalFound: 0,
    totalProcessed: 0,
    purchases: [],
    error: null,
    startTime: null,
    elapsedTime: 0
  });
  const [isVisible, setIsVisible] = useState(false);

  // Poll for sync status
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch('/api/gmail/sync-background?action=status');
        const data = await response.json();
        setProgress(data);
        
        // Show indicator if sync is running or has recent activity
        if (data.isRunning || (data.purchases.length > 0 && data.elapsedTime < 300000)) { // Show for 5 minutes after completion
          setIsVisible(true);
        } else if (!data.isRunning && data.elapsedTime > 300000) {
          setIsVisible(false);
        }

        // Notify parent component of new purchases
        if (onPurchasesUpdate && data.purchases.length > 0) {
          onPurchasesUpdate(data.purchases);
        }
      } catch (error) {
        console.error('Error polling sync status:', error);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [onPurchasesUpdate]);

  const startSync = async () => {
    try {
      const response = await fetch('/api/gmail/sync-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' })
      });
      const data = await response.json();
      if (data.success) {
        setIsVisible(true);
      }
    } catch (error) {
      console.error('Error starting sync:', error);
    }
  };

  const stopSync = async () => {
    try {
      const response = await fetch('/api/gmail/sync-background?action=stop');
      const data = await response.json();
      if (data.success) {
        setIsVisible(false);
      }
    } catch (error) {
      console.error('Error stopping sync:', error);
    }
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (!isVisible) {
    return (
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={startSync}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-lg flex items-center space-x-2 transition-colors"
        >
          <Play className="w-4 h-4" />
          <span>Sync Gmail</span>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed top-4 right-4 z-50 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg shadow-lg p-4 min-w-80 max-w-96">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          {progress.isRunning ? (
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
          ) : progress.error ? (
            <XCircle className="w-5 h-5 text-red-600" />
          ) : (
            <CheckCircle className="w-5 h-5 text-green-600" />
          )}
          <h3 className="font-semibold text-gray-900">
            {progress.isRunning ? 'Syncing Gmail...' : progress.error ? 'Sync Failed' : 'Sync Complete'}
          </h3>
        </div>
        <button
          onClick={progress.isRunning ? stopSync : () => setIsVisible(false)}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          {progress.isRunning ? <Square className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
        </button>
      </div>

      {progress.error && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {progress.error}
        </div>
      )}

      <div className="space-y-2 text-sm text-gray-600">
        <div className="flex justify-between">
          <span>Batch:</span>
          <span className="font-medium">
            {progress.currentBatch + 1} / {progress.totalBatches || '?'}
          </span>
        </div>
        
        <div className="flex justify-between">
          <span>Emails Found:</span>
          <span className="font-medium">{progress.totalFound}</span>
        </div>
        
        <div className="flex justify-between">
          <span>Emails Processed:</span>
          <span className="font-medium">{progress.totalProcessed}</span>
        </div>
        
        <div className="flex justify-between">
          <span>Purchases Found:</span>
          <span className="font-medium text-green-600">{progress.purchases.length}</span>
        </div>
        
        {progress.startTime && (
          <div className="flex justify-between">
            <span>Elapsed Time:</span>
            <span className="font-medium">{formatTime(progress.elapsedTime)}</span>
          </div>
        )}
      </div>

      {progress.isRunning && progress.totalProcessed > 0 && (
        <div className="mt-3">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ 
                width: `${progress.totalBatches > 0 ? ((progress.currentBatch + 1) / progress.totalBatches) * 100 : 0}%` 
              }}
            />
          </div>
        </div>
      )}

      {!progress.isRunning && progress.purchases.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Ready to view purchases</span>
            <button
              onClick={() => setIsVisible(false)}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              View Results
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
