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
  const [cumulativeEmailsProcessed, setCumulativeEmailsProcessed] = useState(0);
  const [cumulativeEmailsFound, setCumulativeEmailsFound] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
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

  // Timer effect - update elapsed time every second while loading
  useEffect(() => {
    if (!isLoading || !startTime) {
      return;
    }

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isLoading, startTime]);

  const startBatchedSync = async () => {
    setIsLoading(true);
    setError(null);
    setAllPurchases([]);
    setCurrentBatch(0);
    setIsComplete(false);
    isCancelledRef.current = false;
    
    // Reset cumulative totals and timer
    setCumulativeEmailsProcessed(0);
    setCumulativeEmailsFound(0);
    setStartTime(Date.now());
    setElapsedTime(0);
    
    // Set initial progress immediately to show "Starting sync..." instead of "Connecting to Gmail..."
    setProgress({
      batchIndex: 0,
      totalBatches: 1,
      currentBatchSize: 0,
      processedInBatch: 0,
      totalProcessed: 0,
      totalFound: 0,
      hasMore: true,
      qIndex: 0,
      totalQueries: 1
    });

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
    let totalEmailsProcessed = 0; // Track cumulative total across all batches

    // Process in chunks for frequent updates while maintaining good performance
    const CHUNK_SIZE = 50; // Process 50 emails per API call (was previously configured at 50)
    const MAX_TOTAL_EMAILS = 10000; // Maximum total emails to process (matches backend config)
    const MAX_BATCHES = Math.ceil(MAX_TOTAL_EMAILS / CHUNK_SIZE); // Calculate max batches: 10,000 / 50 = 200 batches
    
    while (hasMore && batchIndex < MAX_BATCHES && totalEmailsProcessed < MAX_TOTAL_EMAILS) { // Up to 200 chunks (10,000 emails total)
      try {
        console.log(`🚀 Starting chunk ${batchIndex + 1}...`);
        
        // Build URL with parameters
        const params = new URLSearchParams({
          batch: batchIndex.toString(),
          reset: batchIndex === 0 ? 'true' : 'false',
          quick: 'false', // Don't use quick mode for incremental updates
          limit: CHUNK_SIZE.toString(), // Limit each chunk to 50 emails
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
        // Use shorter timeout - if it times out, we'll move to next query
        const timeoutDuration = 45000; // 45s timeout for all batches
        const timeoutId = setTimeout(() => {
          console.warn(`⏱️ Timeout after ${timeoutDuration/1000}s for batch ${batchIndex + 1} - will try next query`);
          controller.abort();
        }, timeoutDuration);
        
        console.log(`⏱️ Starting batch ${batchIndex + 1} fetch (timeout: ${timeoutDuration/1000}s)...`);
        let response;
        try {
          response = await fetch(`/api/gmail/purchases-batched?${params.toString()}`, { signal: controller.signal });
          clearTimeout(timeoutId);
          controllerRef.current = null;
          console.log(`✅ Batch ${batchIndex + 1} fetch completed`);
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          controllerRef.current = null;
          if (fetchError.name === 'AbortError') {
            console.warn(`⏱️ Batch ${batchIndex + 1} timed out after ${timeoutDuration/1000}s`);
            // Don't throw error - instead complete with what we have
            // This ensures purchases collected so far are saved
            console.log(`📦 Completing sync with ${allCollectedPurchases.length} purchases found before timeout`);
            hasMore = false;
            break; // Exit the loop and trigger onSyncComplete
          }
          throw fetchError;
        }
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const data = await response.json();
        const emailsInThisBatch = data.progress?.processedInBatch || data.debug?.processedInBatch || CHUNK_SIZE;
        const emailsFoundInThisBatch = data.progress?.totalFound || data.debug?.totalMessages || emailsInThisBatch;
        totalEmailsProcessed += emailsInThisBatch; // Track cumulative total
        
        // Update cumulative totals
        setCumulativeEmailsProcessed(totalEmailsProcessed);
        // For cumulative found, we need to track across batches - use the current batch's found count
        // Since Gmail API returns results per query, we'll use the max found so far
        setCumulativeEmailsFound(prev => Math.max(prev, totalEmailsProcessed));
        
        const purchasesInBatch = data.purchases?.length || 0;
        console.log(`✅ Chunk ${batchIndex + 1} completed: Found ${purchasesInBatch} purchases, processed ${emailsInThisBatch} emails (total: ${totalEmailsProcessed}/${MAX_TOTAL_EMAILS} emails, ${allCollectedPurchases.length + purchasesInBatch} total purchases)`);
        
        // Log query info for debugging
        if (data.progress) {
          console.log(`   Query: ${data.progress.qIndex + 1}/${data.progress.totalQueries}, Has more: ${data.progress.hasMore}, Next page: ${!!data.progress.nextPageToken}`);
        }

        // Update progress immediately with cumulative totals
        if (isCancelledRef.current) {
          console.warn('⏹️ Sync cancelled after fetch');
          break;
        }
        // Merge backend progress with cumulative frontend totals
        // Ensure totalFound is at least as large as totalProcessed and purchases found
        const estimatedTotalFound = Math.max(
          data.progress?.totalFound || 0,
          totalEmailsProcessed,
          allCollectedPurchases.length + purchasesInBatch
        );
        setProgress({
          ...data.progress,
          totalProcessed: totalEmailsProcessed, // Use cumulative total
          totalFound: estimatedTotalFound // Use cumulative estimate
        });
        
        // Stop if we've reached the maximum email limit
        if (totalEmailsProcessed >= MAX_TOTAL_EMAILS) {
          console.log(`🛑 Reached maximum email limit (${MAX_TOTAL_EMAILS}). Stopping sync.`);
          hasMore = false;
          break;
        }
        
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

        // Check if we should continue (also check email limit)
        // Important: Even if backend says hasMore=false, check if we should advance to next query
        const backendSaysHasMore = data.progress.hasMore && !data.isComplete;
        const shouldAdvanceQuery = !pageToken && data.progress.qIndex !== undefined && 
                                   (data.progress.qIndex + 1 < (data.progress.totalQueries || 1)) &&
                                   totalEmailsProcessed < MAX_TOTAL_EMAILS;
        
        hasMore = (backendSaysHasMore || shouldAdvanceQuery) && !isCancelledRef.current && totalEmailsProcessed < MAX_TOTAL_EMAILS;
        
        console.log(`🔍 Continue check: backendHasMore=${backendSaysHasMore}, shouldAdvanceQuery=${shouldAdvanceQuery}, hasMore=${hasMore}, totalProcessed=${totalEmailsProcessed}/${MAX_TOTAL_EMAILS}`);

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
          if (apiQIndex + 1 < data.progress.totalQueries && totalEmailsProcessed < MAX_TOTAL_EMAILS) {
            // Move to next query - reset pageToken for new query
            qIndex = apiQIndex + 1;
            pageToken = undefined; // Reset pageToken for new query
            hasMore = true; // Ensure we continue processing the next query
            console.log(`🔄 Advancing to query ${qIndex + 1}/${data.progress.totalQueries} (${totalEmailsProcessed}/${MAX_TOTAL_EMAILS} emails processed so far)`);
          } else {
            // We've exhausted all queries or hit email limit
            if (totalEmailsProcessed >= MAX_TOTAL_EMAILS) {
              console.log(`🛑 Hit email limit (${totalEmailsProcessed}/${MAX_TOTAL_EMAILS}). Stopping.`);
            } else {
              console.log(`✅ Completed all ${data.progress.totalQueries} queries`);
            }
            hasMore = false;
          }
        } else if (!pageToken && data.progress.hasMore === false) {
          // If backend says no more but we haven't hit limit, check if we should try next query
          if (qIndex + 1 < (data.progress.totalQueries || 1) && totalEmailsProcessed < MAX_TOTAL_EMAILS) {
            qIndex++;
            pageToken = undefined;
            hasMore = true;
            console.log(`🔄 No more pages in current query, advancing to query ${qIndex + 1}`);
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
    
    console.log(`🎉 Gmail sync complete!`);
    console.log(`   📧 Total emails processed: ${totalEmailsProcessed}/${MAX_TOTAL_EMAILS}`);
    console.log(`   📦 Total purchases found: ${allCollectedPurchases.length}`);
    console.log(`   📊 Batches completed: ${batchIndex}`);
  };

  const getProgressPercentage = () => {
    if (!progress) return 0;
    if (progress.totalFound === 0) return 100;
    return Math.round((progress.totalProcessed / progress.totalFound) * 100);
  };

  const formatElapsedTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
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
    if (!progress) return 'Preparing sync...';
    
    // ALWAYS use cumulative totals from our own tracking (ignore backend per-batch totals)
    const totalProcessed = cumulativeEmailsProcessed;
    const totalFound = cumulativeEmailsFound;
    
    // Show more helpful status messages
    if (totalProcessed === 0 && totalFound === 0) {
      // Still searching - show purchases count if we have any
      if (allPurchases.length > 0) {
        return `${allPurchases.length} purchases found so far`;
      }
      return 'Searching for emails...';
    }
    
    if (totalFound > 0 && totalProcessed === 0) {
      return `Found ${totalFound} emails, starting to process...`;
    }
    
    // Show cumulative totals - ensure we show at least as many emails as purchases found
    // (since multiple purchases can come from the same email via consolidation)
    const displayProcessed = Math.max(totalProcessed, allPurchases.length);
    const displayFound = Math.max(totalFound, displayProcessed, allPurchases.length);
    
    // Always show both counts
    return `${displayProcessed} of ${displayFound} emails processed`;
  };

  return (
    <div className={`${
      currentTheme.name === 'Neon' 
        ? 'bg-gray-900/95 backdrop-blur-md' 
        : 'bg-white'
    } rounded-lg border ${currentTheme.colors.border} shadow-2xl ${className}`}>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${currentTheme.colors.accent === 'text-cyan-400' ? 'bg-cyan-500/20' : 'bg-blue-500/20'}`}>
              <Mail className={`w-4 h-4 ${currentTheme.colors.accent || 'text-blue-500'}`} />
            </div>
            <div>
              <h3 className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>
                Gmail Sync
              </h3>
              <p className={`text-xs ${currentTheme.colors.textSecondary}`}>
                Fetching purchases
              </p>
            </div>
          </div>
          
          {!isLoading && (
            <button
              onClick={startBatchedSync}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${currentTheme.colors.primary} text-white hover:opacity-90 transition-opacity`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Start
            </button>
          )}
        </div>

        {/* Progress Section */}
        {(isLoading || progress || isComplete || error) && (
          <div className="space-y-3">
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
                <p className={`font-medium text-sm ${error ? 'text-red-400' : isComplete ? 'text-green-400' : currentTheme.colors.textPrimary}`}>
                  {getStatusText()}
                </p>
                <p className={`text-xs ${currentTheme.colors.textSecondary}`}>
                  {getDetailText()}
                </p>
              </div>
            </div>

            {/* Compact Stats Grid */}
            {isLoading && (
              <div className={`grid grid-cols-3 gap-2 p-2 rounded-lg ${currentTheme.name === 'Neon' ? 'bg-white/5' : 'bg-gray-50'}`}>
                <div className="text-center">
                  <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Time</div>
                  <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>
                    {formatElapsedTime(elapsedTime)}
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Emails</div>
                  <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>
                    {cumulativeEmailsProcessed}
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Found</div>
                  <div className={`text-sm font-semibold ${currentTheme.name === 'Neon' ? 'text-emerald-400' : 'text-green-600'}`}>
                    {allPurchases.length}
                  </div>
                </div>
              </div>
            )}

            {/* Progress Bar */}
            {isLoading && progress && (
              <div className="space-y-1.5">
                <div className={`w-full h-1.5 rounded-full overflow-hidden ${currentTheme.name === 'Neon' ? 'bg-white/10' : 'bg-gray-200'}`}>
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

            {/* Complete Stats */}
            {isComplete && (
              <div className={`grid grid-cols-3 gap-2 p-2 rounded-lg ${currentTheme.name === 'Neon' ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-green-50 border border-green-200'}`}>
                <div className="text-center">
                  <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Time</div>
                  <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>
                    {formatElapsedTime(elapsedTime)}
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Emails</div>
                  <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>
                    {cumulativeEmailsProcessed}
                  </div>
                </div>
                <div className="text-center">
                  <div className={`text-xs ${currentTheme.colors.textSecondary}`}>Found</div>
                  <div className={`text-sm font-semibold ${currentTheme.name === 'Neon' ? 'text-emerald-400' : 'text-green-600'}`}>
                    {allPurchases.length}
                  </div>
                </div>
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