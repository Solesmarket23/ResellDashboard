'use client';

import React, { useEffect, useRef, useState } from 'react';
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
  qIndex?: number;
  totalQueries?: number;
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
  const [isForceCompleting, setIsForceCompleting] = useState(false);
  const isCancelledRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  // Cancel outstanding work on unmount
  useEffect(() => {
    isCancelledRef.current = false;
    return () => {
      isCancelledRef.current = true;
      if (controllerRef.current) {
        try { controllerRef.current.abort(); } catch {}
      }
    };
  }, []);

  const startBatchedSync = async () => {
    setIsLoading(true);
    setError(null);
    setProgress(null);
    setAllPurchases([]);
    setCurrentBatch(0);
    setIsComplete(false);
    isCancelledRef.current = false;

    await processBatches();
  };

  const processBatches = async () => {
    let batchIndex = 0;
    let pageToken: string | undefined = undefined;
    let qIndex = 0; // Track which query we're on
    let allCollectedPurchases: any[] = [];
    let hasMore = true;
    let lastProcessed = -1;
    let stagnantIterations = 0;

    // Process in smaller chunks for more frequent updates
    // Instead of processing all 100 emails at once, process 20 at a time
    const CHUNK_SIZE = 20; // Process 20 emails per API call for more frequent updates
    
    while (hasMore && batchIndex < 50) { // Up to 50 chunks (1,000 emails total) - ~1 month of history
      try {
        console.log(`🚀 Starting chunk ${batchIndex + 1}...`);
        
        // Build URL with parameters
        const params = new URLSearchParams({
          batch: batchIndex.toString(),
          reset: batchIndex === 0 ? 'true' : 'false',
          quick: 'false', // Don't use quick mode for incremental updates
          limit: CHUNK_SIZE.toString(), // Limit each chunk to 20 emails
          qIndex: qIndex.toString() // Pass current query index
        });
        
        if (pageToken) {
          params.set('pageToken', pageToken);
        }

        setCurrentBatch(batchIndex + 1);

        // Add a timeout so we never hang indefinitely
        if (isCancelledRef.current) {
          console.warn('⏹️ Sync cancelled before fetch');
          break;
        }

        const controller = new AbortController();
        controllerRef.current = controller;
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout per chunk
        const response = await fetch(`/api/gmail/purchases-batched?${params.toString()}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        controllerRef.current = null;
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log(`✅ Chunk ${batchIndex + 1} completed: Found ${data.purchases?.length || 0} purchases`);

        // Update progress immediately
        if (isCancelledRef.current) {
          console.warn('⏹️ Sync cancelled after fetch');
          break;
        }
        setProgress(data.progress);
        
        // Add new purchases to collection and push immediate UI updates
        if (data.purchases && data.purchases.length > 0) {
          // Add purchases one by one for smoother UI updates
          for (const p of data.purchases) {
            allCollectedPurchases = [...allCollectedPurchases, p];
            setAllPurchases(prev => [...prev, p]);
            // Update parent immediately for each purchase found
            onPurchasesUpdate?.([...allCollectedPurchases]);
          }
          console.log(`📊 Total purchases so far: ${allCollectedPurchases.length}`);
        } else {
          // Still update parent even if no purchases found in this chunk
          onPurchasesUpdate?.(allCollectedPurchases);
        }

        // Check if we should continue
        hasMore = data.progress.hasMore && !data.isComplete && !isCancelledRef.current;

        // If quick mode returned 0 purchases and no more pages, automatically retry without quick mode
        if (!hasMore && batchIndex === 0 && allCollectedPurchases.length === 0 && params.get('quick') === 'true') {
          console.log('🔁 Quick scan found 0 purchases - retrying full scan');
          // Retry immediately without quick flag and with a larger first page
          params.delete('quick');
          const fullController = new AbortController();
          controllerRef.current = fullController;
          const fullTimeout = setTimeout(() => fullController.abort(), 90000);
          const fullResp = await fetch(`/api/gmail/purchases-batched?${params.toString()}`, { signal: fullController.signal });
          clearTimeout(fullTimeout);
          controllerRef.current = null;
          if (fullResp.ok) {
            const fullData = await fullResp.json();
            if (fullData.purchases && fullData.purchases.length > 0) {
              for (const p of fullData.purchases) {
                allCollectedPurchases = [...allCollectedPurchases, p];
                setAllPurchases(prev => [...prev, p]);
              }
              onPurchasesUpdate?.(allCollectedPurchases);
            }
            setProgress(fullData.progress);
            hasMore = fullData.progress.hasMore && !fullData.isComplete && !isCancelledRef.current;
            pageToken = fullData.progress.nextPageToken;
            qIndex = fullData.progress.qIndex || 0;
          }
        }
        
        // Stagnation detection removed to avoid premature finishes on slow Gmail responses
        pageToken = data.progress.nextPageToken;
        
        // Advance to next query if we've exhausted current query (no more pages)
        if (!pageToken && data.progress.qIndex !== undefined && data.progress.totalQueries) {
          const apiQIndex = data.progress.qIndex;
          if (apiQIndex + 1 < data.progress.totalQueries) {
            // Move to next query
            qIndex = apiQIndex + 1;
            console.log(`🔄 Advancing to query ${qIndex + 1}/${data.progress.totalQueries}`);
          } else {
            // We've exhausted all queries
            console.log(`✅ Completed all ${data.progress.totalQueries} queries`);
          }
        }
        
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
    if (!isCancelledRef.current) {
      setIsComplete(true);
      setIsLoading(false);
      onSyncComplete?.(allCollectedPurchases.length);
    }
    
    const totalEmailsProcessed = batchIndex * CHUNK_SIZE;
    console.log(`🎉 Gmail sync complete!`);
    console.log(`   📧 Total emails processed: ${totalEmailsProcessed}`);
    console.log(`   📦 Total purchases found: ${allCollectedPurchases.length}`);
    console.log(`   📊 Batches completed: ${batchIndex}`);
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
                {/* Force-complete button in case API pagination stalls */}
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setIsForceCompleting(true);
                      isCancelledRef.current = true;
                      if (controllerRef.current) {
                        try { controllerRef.current.abort(); } catch {}
                      }
                      setIsComplete(true);
                      setIsLoading(false);
                      onSyncComplete?.(allPurchases.length);
                      setIsForceCompleting(false);
                    }}
                    className={`text-xs underline ${currentTheme.colors.textSecondary} hover:${currentTheme.colors.textPrimary}`}
                  >
                    {isForceCompleting ? 'Finishing…' : 'Finish now'}
                  </button>
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