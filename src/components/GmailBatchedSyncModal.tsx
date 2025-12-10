'use client';

import { useState, useEffect } from 'react';
import { X, Mail, Package, Filter, CheckCircle, Clock, TrendingUp, Loader2, Sparkles, BarChart3, RefreshCw, AlertCircle } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

interface SyncStats {
  totalEmailsFetched: number;
  totalEmailsProcessed: number;
  totalPurchasesFound: number;
  totalFiltered: number;
  totalConsolidated: number;
  filterReasons: {
    nonStockX: number;
    nonPurchase: number;
    invalidOrderNumber: number;
    duplicates: number;
  };
  queriesCompleted: number;
  totalQueries: number;
  batchesCompleted: number;
  timeElapsed: number;
  byQuery: Array<{
    queryIndex: number;
    query: string;
    emailsFetched: number;
    purchasesFound: number;
    filtered: number;
  }>;
}

interface GmailBatchedSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

const GmailBatchedSyncModal: React.FC<GmailBatchedSyncModalProps> = ({ isOpen, onClose, onComplete }) => {
  const { currentTheme } = useTheme();
  const [isRunning, setIsRunning] = useState(false);
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  // Format seconds into human-readable time
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}m ${secs}s`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  };

  // Update timer every second while running
  useEffect(() => {
    if (!isRunning || !startTime) return;

    const interval = setInterval(() => {
      setStats(prev => prev ? {
        ...prev,
        timeElapsed: Math.round((Date.now() - startTime) / 1000)
      } : prev);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, startTime]);

  // Auto-start sync when modal opens
  useEffect(() => {
    if (isOpen && !isRunning && !isComplete) {
      startSync();
    }
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsRunning(false);
      setStats(null);
      setError(null);
      setLogs([]);
      setStartTime(null);
      setIsComplete(false);
    }
  }, [isOpen]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const consolidatePurchases = (purchases: Array<{subject: string, orderNumber: string, status: string}>) => {
    const consolidatedMap = new Map<string, any>();
    purchases.forEach(purchase => {
      const existing = consolidatedMap.get(purchase.orderNumber);
      if (!existing) {
        consolidatedMap.set(purchase.orderNumber, purchase);
      } else {
        const statusPriority: Record<string, number> = {
          'Delivered': 3,
          'Shipped': 2,
          'Ordered': 1
        };
        const existingPriority = statusPriority[existing.status] || 0;
        const newPriority = statusPriority[purchase.status] || 0;
        
        if (newPriority > existingPriority) {
          consolidatedMap.set(purchase.orderNumber, purchase);
        }
      }
    });
    return Array.from(consolidatedMap.values());
  };

  const startSync = async () => {
    setIsRunning(true);
    setError(null);
    setLogs([]);
    setIsComplete(false);
    
    addLog('🚀 Starting historical Gmail sync...');
    const syncStartTime = Date.now();
    setStartTime(syncStartTime);
    
    const allStats: SyncStats = {
      totalEmailsFetched: 0,
      totalEmailsProcessed: 0,
      totalPurchasesFound: 0,
      totalFiltered: 0,
      totalConsolidated: 0,
      filterReasons: {
        nonStockX: 0,
        nonPurchase: 0,
        invalidOrderNumber: 0,
        duplicates: 0
      },
      queriesCompleted: 0,
      totalQueries: 0,
      batchesCompleted: 0,
      timeElapsed: 0,
      byQuery: []
    };
    
    setStats(allStats);

    try {
      let batchIndex = 0;
      let hasMore = true;
      let pageToken: string | undefined = undefined;
      let qIndex = 0;
      const purchasesFound: any[] = [];

      while (hasMore && batchIndex < 400) {
        addLog(`📦 Fetching batch ${batchIndex + 1}...`);

        const params = new URLSearchParams({
          batchIndex: batchIndex.toString(),
          reset: batchIndex === 0 ? 'true' : 'false',
          qIndex: qIndex.toString()
        });

        if (pageToken) {
          params.set('pageToken', pageToken);
        }

        let response;
        try {
          response = await fetch(`/api/gmail/purchases-batched?${params.toString()}`, {
            signal: AbortSignal.timeout(90000)
          });
        } catch (fetchErr: any) {
          if (fetchErr.name === 'TimeoutError' || fetchErr.name === 'AbortError') {
            addLog(`⏱️ Batch ${batchIndex + 1} timed out - advancing to next query`);
            if (qIndex + 1 < (allStats.totalQueries || 5)) {
              qIndex++;
              pageToken = undefined;
              allStats.queriesCompleted = qIndex;
              setStats({ ...allStats });
              batchIndex++;
              continue;
            } else {
              addLog(`✅ All queries completed`);
              break;
            }
          }
          throw fetchErr;
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          addLog(`❌ HTTP ${response.status}: ${errorText}`);
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        // Update stats
        const emailsInBatch = data.debug?.totalMessages || 0;
        const purchasesInBatch = data.purchases?.length || 0;
        const processedInBatch = data.debug?.processedInBatch || 0;
        const filteredInBatch = data.debug?.filteredSubjects?.length || 0;
        const consolidatedInBatch = processedInBatch - purchasesInBatch - filteredInBatch;

        allStats.totalEmailsFetched += emailsInBatch;
        allStats.totalEmailsProcessed += processedInBatch;
        allStats.totalFiltered += filteredInBatch;
        allStats.totalConsolidated += consolidatedInBatch;
        allStats.batchesCompleted = batchIndex + 1;
        allStats.totalQueries = data.progress?.totalQueries || 0;
        allStats.timeElapsed = Math.round((Date.now() - syncStartTime) / 1000);

        // Track purchases
        if (data.purchases && data.purchases.length > 0) {
          data.purchases.forEach((p: any) => {
            purchasesFound.push({
              subject: p.subject || 'Unknown',
              orderNumber: p.orderNumber || p.order_number || 'N/A',
              status: p.status || 'Unknown'
            });
          });

          // Consolidate and update count
          const consolidated = consolidatePurchases(purchasesFound);
          allStats.totalPurchasesFound = consolidated.length;
        }

        setStats({ ...allStats });
        addLog(`✅ Batch ${batchIndex + 1}: ${purchasesInBatch} purchases, ${filteredInBatch} filtered`);

        // Check if we should continue
        pageToken = data.progress?.nextPageToken;
        hasMore = data.progress?.hasMore && !data.isComplete;

        // Advance to next query if needed
        if (!pageToken && data.progress?.qIndex !== undefined && data.progress?.totalQueries) {
          const apiQIndex = data.progress.qIndex;
          if (apiQIndex + 1 < data.progress.totalQueries) {
            qIndex = apiQIndex + 1;
            pageToken = undefined;
            hasMore = true;
            allStats.queriesCompleted = apiQIndex + 1;
            addLog(`🔄 Moving to query ${qIndex + 1}/${data.progress.totalQueries}`);
          } else {
            addLog(`✅ Completed all ${data.progress.totalQueries} queries`);
            hasMore = false;
            allStats.queriesCompleted = data.progress.totalQueries;
          }
        }

        batchIndex++;

        // Small delay between batches
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      setStats({ ...allStats });
      setIsComplete(true);
      addLog(`🎉 Sync complete! Found ${allStats.totalPurchasesFound} unique purchases from ${allStats.totalEmailsProcessed} emails`);
      
      // Call onComplete to refresh the purchases list
      onComplete();

    } catch (err: any) {
      const errorMsg = err.message || String(err);
      setError(errorMsg);
      addLog(`❌ Error: ${errorMsg}`);
      console.error('Gmail sync error:', err);
    } finally {
      setIsRunning(false);
      setStartTime(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div 
        className={`w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl ${
          currentTheme.name === 'Neon'
            ? 'bg-gray-900 border border-cyan-500/30'
            : 'bg-white border border-gray-200'
        }`}
      >
        {/* Header */}
        <div className={`sticky top-0 z-10 flex items-center justify-between p-6 border-b ${
          currentTheme.name === 'Neon'
            ? 'bg-gray-900 border-white/10'
            : 'bg-gray-50 border-gray-200'
        }`}>
          <div>
            <h2 className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>
              {isComplete ? '✅ Sync Complete!' : '🔄 Syncing Gmail Purchases'}
            </h2>
            <p className={`text-sm mt-1 ${currentTheme.colors.textSecondary}`}>
              {isComplete 
                ? 'All historical purchases have been imported'
                : 'Importing your purchase history from Gmail...'}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isRunning}
            className={`p-2 rounded-lg transition-colors ${
              isRunning ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100'
            } ${currentTheme.colors.textSecondary}`}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-red-400">Sync Failed</p>
                <p className="text-sm text-red-300 mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Stats Grid */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {/* Emails Fetched */}
              <div className={`rounded-lg p-4 border ${
                currentTheme.name === 'Neon'
                  ? 'bg-gray-800/50 border-white/10'
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <Mail className={`w-4 h-4 ${currentTheme.name === 'Neon' ? 'text-blue-400' : 'text-blue-600'}`} />
                  <p className={`text-xs ${currentTheme.colors.textSecondary}`}>Fetched</p>
                </div>
                <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>
                  {stats.totalEmailsFetched.toLocaleString()}
                </p>
              </div>

              {/* Emails Processed */}
              <div className={`rounded-lg p-4 border ${
                currentTheme.name === 'Neon'
                  ? 'bg-gray-800/50 border-white/10'
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className={`w-4 h-4 ${currentTheme.name === 'Neon' ? 'text-purple-400' : 'text-purple-600'}`} />
                  <p className={`text-xs ${currentTheme.colors.textSecondary}`}>Processed</p>
                </div>
                <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>
                  {stats.totalEmailsProcessed.toLocaleString()}
                </p>
              </div>

              {/* Purchases Found */}
              <div className={`rounded-lg p-4 border ${
                currentTheme.name === 'Neon'
                  ? 'bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/30'
                  : 'bg-green-50 border-green-200'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <Package className={`w-4 h-4 ${currentTheme.name === 'Neon' ? 'text-green-400' : 'text-green-600'}`} />
                  <p className={`text-xs ${currentTheme.colors.textSecondary}`}>Purchases</p>
                </div>
                <p className={`text-2xl font-bold ${currentTheme.name === 'Neon' ? 'text-green-400' : 'text-green-600'}`}>
                  {stats.totalPurchasesFound.toLocaleString()}
                </p>
              </div>

              {/* Consolidated */}
              <div className={`rounded-lg p-4 border ${
                currentTheme.name === 'Neon'
                  ? 'bg-gray-800/50 border-white/10'
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <RefreshCw className={`w-4 h-4 ${currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-cyan-600'}`} />
                  <p className={`text-xs ${currentTheme.colors.textSecondary}`}>Merged</p>
                </div>
                <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>
                  {stats.totalConsolidated.toLocaleString()}
                </p>
              </div>

              {/* Filtered */}
              <div className={`rounded-lg p-4 border ${
                currentTheme.name === 'Neon'
                  ? 'bg-gray-800/50 border-white/10'
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <Filter className={`w-4 h-4 ${currentTheme.name === 'Neon' ? 'text-orange-400' : 'text-orange-600'}`} />
                  <p className={`text-xs ${currentTheme.colors.textSecondary}`}>Filtered</p>
                </div>
                <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>
                  {stats.totalFiltered.toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {/* Progress Info */}
          {stats && (
            <div className={`rounded-lg p-4 border ${
              currentTheme.name === 'Neon'
                ? 'bg-gray-800/50 border-white/10'
                : 'bg-gray-50 border-gray-200'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Clock className={`w-4 h-4 ${currentTheme.colors.textSecondary}`} />
                  <span className={`text-sm font-medium ${currentTheme.colors.textPrimary}`}>
                    Progress: {stats.queriesCompleted}/{stats.totalQueries} queries
                  </span>
                </div>
                <span className={`text-sm ${currentTheme.colors.textSecondary}`}>
                  {formatTime(stats.timeElapsed)}
                </span>
              </div>
              <div className={`h-2 rounded-full overflow-hidden ${
                currentTheme.name === 'Neon' ? 'bg-gray-700' : 'bg-gray-200'
              }`}>
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-500"
                  style={{ 
                    width: stats.totalQueries > 0 
                      ? `${(stats.queriesCompleted / stats.totalQueries) * 100}%` 
                      : '0%' 
                  }}
                />
              </div>
              <p className={`text-xs mt-2 ${currentTheme.colors.textSecondary}`}>
                {stats.batchesCompleted} batches completed • {stats.timeElapsed > 0 
                  ? `${Math.round(stats.totalEmailsProcessed / stats.timeElapsed)} emails/sec`
                  : '0 emails/sec'
                }
              </p>
            </div>
          )}

          {/* Logs */}
          <div className={`rounded-lg border ${
            currentTheme.name === 'Neon'
              ? 'bg-black/30 border-white/10'
              : 'bg-gray-50 border-gray-200'
          }`}>
            <div className="p-3 border-b border-inherit">
              <h3 className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>Live Logs</h3>
            </div>
            <div className="p-4 h-64 overflow-y-auto font-mono text-xs space-y-1">
              {logs.length === 0 ? (
                <p className={currentTheme.colors.textSecondary}>Starting sync...</p>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className={`${currentTheme.colors.textSecondary} animate-fade-in`}>
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            {isRunning && (
              <button
                onClick={() => {
                  setIsRunning(false);
                  addLog('🛑 Sync stopped by user');
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentTheme.name === 'Neon'
                    ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30'
                    : 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200'
                }`}
              >
                Stop Sync
              </button>
            )}
            {isComplete && (
              <button
                onClick={onClose}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  currentTheme.name === 'Neon'
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white'
                    : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white'
                }`}
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}} />
    </div>
  );
};

export default GmailBatchedSyncModal;

