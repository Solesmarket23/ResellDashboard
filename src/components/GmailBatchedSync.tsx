'use client';

import React, { useState } from 'react';
import { RefreshCw, Mail, CheckCircle, AlertCircle, Package } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

interface BatchProgress {
  batchIndex: number;
  totalBatches: number;
  currentBatchSize: number;
  processedInBatch: number;
  totalProcessed: number;
  totalFound: number;
  hasMore: boolean;
  nextPageToken?: string;
}

interface GmailBatchedSyncProps {
  onPurchasesUpdate?: (purchases: any[]) => void;
  onSyncComplete?: (totalPurchases: number) => void;
  className?: string;
}

const GmailBatchedSync: React.FC<GmailBatchedSyncProps> = ({
  onPurchasesUpdate,
  onSyncComplete,
  className = ''
}) => {
  const { currentTheme } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [allPurchases, setAllPurchases] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  const startBatchedSync = async () => {
    setIsLoading(true);
    setError(null);
    setProgress(null);
    setAllPurchases([]);
    setCurrentBatch(0);
    setIsComplete(false);

    await processBatches();
  };

  const processBatches = async () => {
    let batchIndex = 0;
    let pageToken: string | undefined = undefined;
    let allCollectedPurchases: any[] = [];
    let hasMore = true;

    while (hasMore && batchIndex < 1) { // Limit to 1 batch (20 emails)
      try {
        console.log(`🚀 Starting batch ${batchIndex + 1}...`);
        
        // Build URL with parameters
        const params = new URLSearchParams({
          batch: batchIndex.toString(),
          reset: batchIndex === 0 ? 'true' : 'false'
        });
        
        if (pageToken) {
          params.set('pageToken', pageToken);
        }

        setCurrentBatch(batchIndex + 1);

        const response = await fetch(`/api/gmail/purchases-batched?${params.toString()}`);
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log(`✅ Batch ${batchIndex + 1} completed:`, data);

        // Update progress
        setProgress(data.progress);
        
        // Add new purchases to collection
        if (data.purchases && data.purchases.length > 0) {
          allCollectedPurchases = [...allCollectedPurchases, ...data.purchases];
          setAllPurchases(allCollectedPurchases);
          
          // Notify parent component of updates
          onPurchasesUpdate?.(allCollectedPurchases);
        }

        // Check if we should continue
        hasMore = data.progress.hasMore && !data.isComplete;
        pageToken = data.progress.nextPageToken;
        batchIndex++;

        // Small delay between batches to prevent overwhelming the API
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (error) {
        console.error(`❌ Error in batch ${batchIndex + 1}:`, error);
        setError(error instanceof Error ? error.message : 'Unknown error occurred');
        hasMore = false;
      }
    }

    // Sync complete
    setIsComplete(true);
    setIsLoading(false);
    onSyncComplete?.(allCollectedPurchases.length);
    
    console.log(`🎉 Gmail sync complete! Total purchases: ${allCollectedPurchases.length}`);
  };

  const getProgressPercentage = () => {
    if (!progress) return 0;
    if (progress.totalFound === 0) return 100;
    return Math.round((progress.totalProcessed / progress.totalFound) * 100);
  };

  const getStatusText = () => {
    if (error) return 'Sync failed';
    if (isComplete) return 'Sync complete!';
    if (!isLoading) return 'Ready to sync';
    if (!progress) return 'Initializing...';
    
    return `Processing batch ${currentBatch}...`;
  };

  const getDetailText = () => {
    if (error) return error;
    if (isComplete) return `Found ${allPurchases.length} purchases`;
    if (!isLoading) return 'Click to start fetching your purchase emails';
    if (!progress) return 'Connecting to Gmail...';
    
    return `${progress.totalProcessed} of ${progress.totalFound} emails processed`;
  };

  return (
    <div className={`${currentTheme.colors.cardBackground} rounded-lg border ${currentTheme.colors.border} ${className}`}>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${currentTheme.colors.accent === 'text-cyan-400' ? 'bg-cyan-500/20' : 'bg-blue-500/20'}`}>
              <Mail className={`w-5 h-5 ${currentTheme.colors.accent || 'text-blue-500'}`} />
            </div>
            <div>
              <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
                Gmail Purchase Sync
              </h3>
              <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                Fetch your purchase confirmation emails
              </p>
            </div>
          </div>
          
          {!isLoading && (
            <button
              onClick={startBatchedSync}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg ${currentTheme.colors.primary} text-white hover:opacity-90 transition-opacity`}
            >
              <RefreshCw className="w-4 h-4" />
              Start Sync
            </button>
          )}
        </div>

        {/* Progress Section */}
        {(isLoading || progress || isComplete || error) && (
          <div className="space-y-4">
            {/* Status */}
            <div className="flex items-center gap-2">
              {error ? (
                <AlertCircle className="w-5 h-5 text-red-500" />
              ) : isComplete ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : isLoading ? (
                <RefreshCw className={`w-5 h-5 ${currentTheme.colors.accent || 'text-blue-500'} animate-spin`} />
              ) : null}
              
              <div className="flex-1">
                <p className={`font-medium ${error ? 'text-red-400' : isComplete ? 'text-green-400' : currentTheme.colors.textPrimary}`}>
                  {getStatusText()}
                </p>
                <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                  {getDetailText()}
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            {isLoading && progress && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${currentTheme.colors.textSecondary}`}>
                    Batch {currentBatch}{progress.hasMore ? '+' : ''} of {progress.totalBatches || '?'}
                  </span>
                  <span className={`text-sm font-medium ${currentTheme.colors.textPrimary}`}>
                    {getProgressPercentage()}%
                  </span>
                </div>
                
                <div className={`w-full h-2 rounded-full overflow-hidden ${currentTheme.name === 'Neon' ? 'bg-white/10' : 'bg-gray-200'}`}>
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ease-out ${
                      currentTheme.name === 'Neon'
                        ? 'bg-gradient-to-r from-emerald-500 to-cyan-500'
                        : 'bg-gradient-to-r from-blue-500 to-purple-500'
                    }`}
                    style={{ width: `${getProgressPercentage()}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Purchase Count */}
            {allPurchases.length > 0 && (
              <div className={`flex items-center gap-2 p-3 rounded-lg ${currentTheme.name === 'Neon' ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-blue-500/10 border border-blue-500/20'}`}>
                <Package className={`w-4 h-4 ${currentTheme.name === 'Neon' ? 'text-emerald-400' : 'text-blue-500'}`} />
                <span className={`text-sm font-medium ${currentTheme.colors.textPrimary}`}>
                  {allPurchases.length} purchases found so far
                </span>
              </div>
            )}

            {/* Error Actions */}
            {error && (
              <div className="flex gap-2">
                <button
                  onClick={startBatchedSync}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                >
                  Try Again
                </button>
                <button
                  onClick={() => {
                    setError(null);
                    setIsLoading(false);
                    setProgress(null);
                  }}
                  className={`px-4 py-2 rounded-lg transition-colors text-sm ${currentTheme.colors.textSecondary} hover:${currentTheme.colors.textPrimary} hover:bg-gray-100`}
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default GmailBatchedSync;