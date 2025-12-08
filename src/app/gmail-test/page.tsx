'use client';

import { useState, useEffect } from 'react';
import { Mail, Package, Filter, CheckCircle, XCircle, Clock, TrendingUp, AlertCircle } from 'lucide-react';

interface SyncStats {
  totalEmailsFetched: number;
  totalEmailsProcessed: number;
  totalPurchasesFound: number;
  totalFiltered: number;
  totalConsolidated: number; // Emails merged into existing purchases
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
  purchasesFound: Array<{
    subject: string;
    orderNumber: string;
    status: string;
    relatedEmails?: string[]; // Other emails for the same order
  }>;
  emailsFiltered: Array<{
    subject: string;
    reason: string;
    orderNumber?: string; // If it had an order number
  }>;
  consolidatedEmails: Array<{
    orderNumber: string;
    emails: Array<{subject: string, status: string}>;
  }>;
}

export default function GmailTestPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [startTime, setStartTime] = useState<number | null>(null);

  // Format seconds into human-readable time
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins} min ${secs}s`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  };

  // Consolidate purchases by order number (keep highest priority status)
  const consolidatePurchases = (purchases: Array<{subject: string, orderNumber: string, status: string}>) => {
    const consolidatedMap = new Map<string, any>();
    purchases.forEach(purchase => {
      const existing = consolidatedMap.get(purchase.orderNumber);
      if (!existing) {
        consolidatedMap.set(purchase.orderNumber, purchase);
      } else {
        // Keep the one with higher priority status
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

  // Check Gmail connection status on mount
  useEffect(() => {
    const checkGmailStatus = async () => {
      try {
        const response = await fetch('/api/gmail/status');
        const data = await response.json();
        setGmailConnected(data.connected);
      } catch (err) {
        console.error('Failed to check Gmail status:', err);
        setGmailConnected(false);
      } finally {
        setIsCheckingAuth(false);
      }
    };
    checkGmailStatus();
  }, []);

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

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const startTest = async () => {
    if (!gmailConnected) {
      setError('Gmail not connected. Please connect Gmail first.');
      addLog('❌ Gmail not connected');
      return;
    }

    setIsRunning(true);
    setError(null);
    setLogs([]);
    
    addLog('🚀 Starting Gmail sync test...');
    const testStartTime = Date.now();
    setStartTime(testStartTime);
    
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
      byQuery: [],
      purchasesFound: [],
      emailsFiltered: [],
      consolidatedEmails: []
    };
    
    setStats(allStats);

    try {
      let batchIndex = 0;
      let hasMore = true;
      let pageToken: string | undefined = undefined;
      let qIndex = 0;

      while (hasMore && batchIndex < 200) {
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
            addLog(`⏱️ Batch ${batchIndex + 1} timed out after 90s - advancing to next query`);
            // Advance to next query
            if (qIndex + 1 < (allStats.totalQueries || 5)) {
              qIndex++;
              pageToken = undefined;
              allStats.queriesCompleted = qIndex;
              setStats({ ...allStats });
              addLog(`🔄 Advanced to query ${qIndex + 1}/${allStats.totalQueries || 5} after timeout`);
              batchIndex++;
              continue;
            } else {
              addLog(`✅ All queries exhausted after timeout`);
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
        // IMPORTANT: Don't calculate filtered count from processed - purchases
        // because consolidation reduces purchase count (multiple emails → 1 purchase)
        // Instead, use the actual filteredSubjects array length from backend
        const filteredInBatch = data.debug?.filteredSubjects?.length || 0;
        
        // Calculate consolidated emails: processed - purchases - filtered
        // This represents emails that were merged into existing purchases
        const consolidatedInBatch = processedInBatch - purchasesInBatch - filteredInBatch;

        allStats.totalEmailsFetched += emailsInBatch;
        allStats.totalEmailsProcessed += processedInBatch;
        allStats.totalFiltered += filteredInBatch;
        allStats.totalConsolidated += consolidatedInBatch;
        allStats.batchesCompleted = batchIndex + 1;
        allStats.totalQueries = data.progress?.totalQueries || 0;
        allStats.timeElapsed = Math.round((Date.now() - testStartTime) / 1000);

        // Update stats immediately to show progress
        setStats({ ...allStats });

        // Track individual purchases and filtered emails
        if (data.purchases && data.purchases.length > 0) {
          // Add all purchases at once (backend already batches them)
          data.purchases.forEach((p: any) => {
            allStats.purchasesFound.push({
              subject: p.subject || p.email_subject || 'Unknown',
              orderNumber: p.orderNumber || p.order_number || 'N/A',
              status: p.status || p.shipping_status || 'Unknown'
            });
          });
          
          // Consolidate after each batch to remove duplicates
          const beforeConsolidation = allStats.purchasesFound.length;
          allStats.purchasesFound = consolidatePurchases(allStats.purchasesFound);
          const consolidatedThisBatch = beforeConsolidation - allStats.purchasesFound.length;
          
          if (consolidatedThisBatch > 0) {
            allStats.totalConsolidated += consolidatedThisBatch;
          }
          
          addLog(`   Found ${data.purchases.length} purchases in this batch (${allStats.purchasesFound.length} unique after consolidation)`);
        }

        // Final update with all filtered emails
        
        // Track filtered emails from backend
        console.log('🔍 Backend debug data:', data.debug);
        console.log('🔍 Filtered subjects array:', data.debug?.filteredSubjects);
        console.log('🔍 Filtered subjects type:', typeof data.debug?.filteredSubjects);
        console.log('🔍 Is array?:', Array.isArray(data.debug?.filteredSubjects));
        
        if (data.debug?.filteredSubjects && Array.isArray(data.debug.filteredSubjects)) {
          console.log(`📊 Found ${data.debug.filteredSubjects.length} filtered emails in this batch`);
          addLog(`   Filtered ${data.debug.filteredSubjects.length} emails in this batch`);
          
          data.debug.filteredSubjects.forEach((filtered: any, idx: number) => {
            console.log(`   Filtered email ${idx + 1}:`, filtered);
            if (typeof filtered === 'object') {
              allStats.emailsFiltered.push({
                subject: filtered.subject || 'Unknown',
                reason: filtered.reason || 'Non-purchase email',
                orderNumber: filtered.orderNumber
              });
            } else if (typeof filtered === 'string') {
              allStats.emailsFiltered.push({
                subject: filtered,
                reason: 'Non-purchase email'
              });
            }
          });
          console.log(`📊 Total filtered emails so far: ${allStats.emailsFiltered.length}`);
          
          // Update UI immediately after adding filtered emails
          setStats({ ...allStats });
        } else {
          // No filtered emails in this batch - this is expected when Gmail query is highly targeted
          if (filteredInBatch === 0) {
            console.log('✅ All emails in this batch were valid purchases (no filtering needed)');
          } else {
            console.warn('⚠️ Backend reported filtered emails but no details provided');
          }
        }

        // Track consolidation details
        if (data.debug?.consolidationDetails && Array.isArray(data.debug.consolidationDetails)) {
          data.debug.consolidationDetails.forEach((consolidation: any) => {
            allStats.consolidatedEmails.push({
              orderNumber: consolidation.orderNumber,
              emails: consolidation.emails
            });
          });
          console.log(`📊 Total consolidated orders so far: ${allStats.consolidatedEmails.length}`);
        }

        // Update totalPurchasesFound to match the actual count
        allStats.totalPurchasesFound = allStats.purchasesFound.length;
        
        // Final stats update
        setStats({ ...allStats });

        // Track by query
        const currentQueryIndex = data.progress?.qIndex || 0;
        let queryStats = allStats.byQuery.find(q => q.queryIndex === currentQueryIndex);
        if (!queryStats) {
          queryStats = {
            queryIndex: currentQueryIndex,
            query: `Query ${currentQueryIndex + 1}`,
            emailsFetched: 0,
            purchasesFound: 0,
            filtered: 0
          };
          allStats.byQuery.push(queryStats);
        }
        queryStats.emailsFetched += emailsInBatch;
        queryStats.purchasesFound += purchasesInBatch;
        queryStats.filtered += filteredInBatch;

        setStats({ ...allStats });

        addLog(`✅ Batch ${batchIndex + 1}: Found ${purchasesInBatch} purchases, filtered ${filteredInBatch}, processed ${processedInBatch}/${emailsInBatch} emails`);
        addLog(`   Query: ${currentQueryIndex + 1}/${data.progress?.totalQueries}, Has more: ${data.progress?.hasMore}, Next page: ${!!data.progress?.nextPageToken}`);

        // Check if we should continue
        pageToken = data.progress?.nextPageToken;
        hasMore = data.progress?.hasMore && !data.isComplete;

        // Advance to next query if current one is exhausted
        if (!pageToken && data.progress?.qIndex !== undefined && data.progress?.totalQueries) {
          const apiQIndex = data.progress.qIndex;
          if (apiQIndex + 1 < data.progress.totalQueries) {
            qIndex = apiQIndex + 1;
            pageToken = undefined;
            hasMore = true;
            allStats.queriesCompleted = apiQIndex + 1;
            addLog(`🔄 Advancing to query ${qIndex + 1}/${data.progress.totalQueries}`);
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

      // Final consolidation across all batches (should be minimal since we consolidate after each batch)
      const beforeFinalConsolidation = allStats.purchasesFound.length;
      allStats.purchasesFound = consolidatePurchases(allStats.purchasesFound);
      allStats.totalPurchasesFound = allStats.purchasesFound.length;
      const finalConsolidatedCount = beforeFinalConsolidation - allStats.purchasesFound.length;
      
      if (finalConsolidatedCount > 0) {
        addLog(`🔄 Final consolidation: removed ${finalConsolidatedCount} more duplicates`);
        allStats.totalConsolidated += finalConsolidatedCount;
      }
      
      setStats({ ...allStats });
      
      addLog(`🎉 Test complete! Processed ${allStats.totalEmailsProcessed} emails, found ${allStats.totalPurchasesFound} unique purchases`);

    } catch (err: any) {
      const errorMsg = err.message || String(err);
      setError(errorMsg);
      addLog(`❌ Error: ${errorMsg}`);
      console.error('Gmail test error:', err);
    } finally {
      setIsRunning(false);
      setStartTime(null);
      addLog(`🏁 Test ended. Final stats: ${allStats.totalPurchasesFound} purchases found from ${allStats.totalEmailsProcessed} emails processed`);
    }
  };

  return (
    <div className="min-h-screen h-screen bg-gray-950 text-white p-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Gmail Sync Test Dashboard</h1>
            <p className="text-gray-400">Monitor email processing and filtering in real-time</p>
          </div>
          <div className="flex items-center gap-4">
            {isCheckingAuth ? (
              <span className="text-gray-400">Checking auth...</span>
            ) : gmailConnected ? (
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle className="w-5 h-5" />
                <span>Gmail Connected</span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-orange-400">
                  <AlertCircle className="w-5 h-5" />
                  <span>Gmail Not Connected</span>
                </div>
                <a
                  href="/"
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
                >
                  Connect Gmail
                </a>
              </div>
            )}
            <button
              onClick={startTest}
              disabled={isRunning || !gmailConnected}
              className={`px-6 py-3 rounded-lg font-medium transition-all ${
                isRunning || !gmailConnected
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {isRunning ? 'Running...' : 'Start Test'}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-red-400">Test Failed</p>
              <p className="text-sm text-red-300 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        {stats && (
          <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Total Emails Fetched */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Mail className="w-5 h-5 text-blue-400" />
                </div>
                <p className="text-sm text-gray-400">Emails Fetched</p>
              </div>
              <p className="text-3xl font-bold">{stats.totalEmailsFetched.toLocaleString()}</p>
            </div>

            {/* Total Processed */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-purple-400" />
                </div>
                <p className="text-sm text-gray-400">Emails Processed</p>
              </div>
              <p className="text-3xl font-bold">{stats.totalEmailsProcessed.toLocaleString()}</p>
            </div>

            {/* Purchases Found */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <Package className="w-5 h-5 text-green-400" />
                </div>
                <p className="text-sm text-gray-400">Purchases Found</p>
              </div>
              <p className="text-3xl font-bold text-green-400">{stats.totalPurchasesFound.toLocaleString()}</p>
            </div>

            {/* Consolidated */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-cyan-500/20 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-cyan-400" />
                </div>
                <p className="text-sm text-gray-400">Consolidated</p>
              </div>
              <p className="text-3xl font-bold text-cyan-400">{stats.totalConsolidated.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">Merged into purchases</p>
            </div>

            {/* Filtered Out */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-orange-500/20 rounded-lg">
                  <Filter className="w-5 h-5 text-orange-400" />
                </div>
                <p className="text-sm text-gray-400">Filtered Out</p>
              </div>
              <p className="text-3xl font-bold text-orange-400">{stats.totalFiltered.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">Non-purchase emails</p>
            </div>
          </div>

          {/* Breakdown explanation */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-400 mb-2">📊 Breakdown:</p>
            <p className="text-xs text-gray-500">
              {stats.totalEmailsProcessed} processed = {stats.totalPurchasesFound} purchases + {stats.totalConsolidated} consolidated + {stats.totalFiltered} filtered
            </p>
            <p className="text-xs text-gray-500 mt-1 italic">
              * Consolidated emails are additional emails for the same order (e.g., "Shipped" and "Delivered" emails merged with "Order Confirmed")
            </p>
          </div>

          {/* Progress Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Progress */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-cyan-500/20 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-cyan-400" />
                </div>
                <p className="text-sm text-gray-400">Queries Progress</p>
              </div>
              <p className="text-3xl font-bold">{stats.queriesCompleted}/{stats.totalQueries}</p>
              <p className="text-xs text-gray-500 mt-1">{stats.batchesCompleted} batches completed</p>
            </div>

            {/* Time Elapsed */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-pink-500/20 rounded-lg">
                  <Clock className="w-5 h-5 text-pink-400" />
                </div>
                <p className="text-sm text-gray-400">Time Elapsed</p>
              </div>
              <p className="text-3xl font-bold">{formatTime(stats.timeElapsed)}</p>
              <p className="text-xs text-gray-500 mt-1">
                {stats.timeElapsed > 0 
                  ? `${Math.round(stats.totalEmailsProcessed / stats.timeElapsed)} emails/sec`
                  : '0 emails/sec'
                }
              </p>
            </div>

            {/* Conversion Rate */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 md:col-span-2">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-emerald-500/20 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                </div>
                <p className="text-sm text-gray-400">Purchase Detection Rate</p>
              </div>
              <p className="text-3xl font-bold text-emerald-400">
                {stats.totalEmailsProcessed > 0 
                  ? `${Math.round((stats.totalPurchasesFound / stats.totalEmailsProcessed) * 100)}%`
                  : '0%'
                }
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {stats.totalPurchasesFound} purchases from {stats.totalEmailsProcessed} processed emails
              </p>
            </div>
          </div>
          </>
        )}

        {/* Per-Query Breakdown */}
        {stats && stats.byQuery.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Query Breakdown</h2>
            <div className="space-y-4">
              {stats.byQuery.map((queryStats) => (
                <div key={queryStats.queryIndex} className="bg-gray-800/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium">Query {queryStats.queryIndex + 1}</h3>
                    <span className="text-sm text-gray-400">{queryStats.query}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-400">Emails Fetched</p>
                      <p className="text-lg font-semibold text-blue-400">{queryStats.emailsFetched}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Purchases Found</p>
                      <p className="text-lg font-semibold text-green-400">{queryStats.purchasesFound}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Filtered Out</p>
                      <p className="text-lg font-semibold text-orange-400">{queryStats.filtered}</p>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-3 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all"
                      style={{ 
                        width: queryStats.emailsFetched > 0 
                          ? `${Math.round((queryStats.purchasesFound / queryStats.emailsFetched) * 100)}%` 
                          : '0%' 
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {queryStats.emailsFetched > 0 
                      ? `${Math.round((queryStats.purchasesFound / queryStats.emailsFetched) * 100)}% detection rate`
                      : '0% detection rate'
                    }
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Purchases Found */}
        {stats && stats.purchasesFound.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">
              Purchases Found ({stats.purchasesFound.length})
              {(() => {
                // Count duplicate order numbers
                const orderCounts = new Map<string, number>();
                stats.purchasesFound.forEach(p => {
                  orderCounts.set(p.orderNumber, (orderCounts.get(p.orderNumber) || 0) + 1);
                });
                const duplicates = Array.from(orderCounts.values()).filter(count => count > 1).length;
                return (
                  <span className={`text-sm ml-2 ${duplicates > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    ({duplicates} duplicate{duplicates !== 1 ? 's' : ''})
                  </span>
                );
              })()}
            </h2>
            <div className="bg-black/50 rounded-lg p-4 max-h-96 overflow-y-auto space-y-2">
              {stats.purchasesFound.map((purchase, i) => (
                <div key={i} className="flex items-start gap-3 p-2 hover:bg-gray-800/50 rounded">
                  <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-green-500/20 rounded text-green-400 text-xs font-bold">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-300 truncate">{purchase.subject}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-gray-500">Order: {purchase.orderNumber}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        purchase.status === 'Delivered' ? 'bg-green-500/20 text-green-400' :
                        purchase.status === 'Shipped' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-orange-500/20 text-orange-400'
                      }`}>
                        {purchase.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Consolidated Emails */}
        {stats && stats.consolidatedEmails.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">
              Consolidated Emails ({stats.consolidatedEmails.length} orders with multiple emails)
              <span className="text-sm text-gray-500 ml-2">
                (Total consolidated: {stats.totalConsolidated} emails merged)
              </span>
            </h2>
            
            <div className="bg-black/50 rounded-lg p-4 max-h-96 overflow-y-auto space-y-4">
              {stats.consolidatedEmails.map((consolidation, i) => (
                <div key={i} className="border border-cyan-500/20 rounded-lg p-3 bg-cyan-500/5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-cyan-500/20 rounded text-cyan-400 text-xs font-bold">
                      {consolidation.emails.length}
                    </div>
                    <p className="text-sm font-medium text-cyan-400">Order: {consolidation.orderNumber}</p>
                  </div>
                  <div className="space-y-1 ml-8">
                    {consolidation.emails.map((email, j) => (
                      <div key={j} className="flex items-start gap-2 text-xs">
                        <span className="text-gray-600">•</span>
                        <div className="flex-1">
                          <span className="text-gray-400">{email.subject}</span>
                          <span className="text-cyan-500 ml-2">({email.status})</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Emails Filtered Out */}
        {stats && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">
              Filtered Out ({stats.emailsFiltered.length})
              <span className="text-sm text-gray-500 ml-2">
                (Total filtered count: {stats.totalFiltered})
              </span>
            </h2>
            
            {stats.emailsFiltered.length === 0 ? (
              <div className="bg-black/50 rounded-lg p-4">
                <p className="text-gray-500">
                  {stats.totalFiltered > 0 
                    ? `⚠️ ${stats.totalFiltered} emails were filtered, but details are not available. Check browser console for debug info.`
                    : 'No emails filtered yet.'
                  }
                </p>
              </div>
            ) : (
              <div className="bg-black/50 rounded-lg p-4 max-h-96 overflow-y-auto space-y-2">
                {stats.emailsFiltered.slice(0, 100).map((filtered, i) => (
                  <div key={i} className="flex items-start gap-3 p-2 hover:bg-gray-800/50 rounded">
                    <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-orange-500/20 rounded text-orange-400 text-xs font-bold">
                      ✕
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-400 truncate">{filtered.subject}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-orange-400">{filtered.reason}</span>
                        {filtered.orderNumber && (
                          <span className="text-xs text-gray-600">Order: {filtered.orderNumber}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {stats.emailsFiltered.length > 100 && (
                  <p className="text-xs text-gray-500 text-center pt-2">
                    ... and {stats.emailsFiltered.length - 100} more
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Logs */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Live Logs</h2>
          <div className="bg-black/50 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm space-y-1 max-h-96">
            {logs.length === 0 ? (
              <p className="text-gray-500">No logs yet. Click "Start Test" to begin.</p>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="text-gray-300">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

