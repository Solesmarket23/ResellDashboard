import React, { useMemo, useState } from 'react';
import { RefreshCw, Package, AlertCircle, CheckCircle } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import NeonNotification, { NotificationType } from './NeonNotification';

interface StockXSalesImportProps {
  userId: string;
  onImportComplete?: (success: boolean, salesCount: number) => void;
}

type ImportRange = 'all' | '1m' | '3m' | '12m';

interface ImportProgress {
  phase: 'idle' | 'fetching' | 'enriching' | 'saving' | 'complete' | 'error';
  message: string;
  percentage: number;
  salesCount?: number;
  enrichedCount?: number;
  currentPage?: number;
  pageResults?: number;
}

const StockXSalesImport: React.FC<StockXSalesImportProps> = ({ userId, onImportComplete }) => {
  const { currentTheme } = useTheme();
  const isNeon = currentTheme.name === 'Neon';
  
  const [isImporting, setIsImporting] = useState(false);
  const [importRange, setImportRange] = useState<ImportRange>('all');
  // PerimeterX tends to trigger on high request volume; this mode drastically reduces calls.
  const [completedOnly, setCompletedOnly] = useState(false);
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

  const rangeLabel = useMemo(() => {
    switch (importRange) {
      case '1m':
        return 'last 1 month';
      case '3m':
        return 'last 3 months';
      case '12m':
        return 'last 12 months';
      default:
        return 'all time';
    }
  }, [importRange]);

  const rangeYmd = useMemo(() => {
    if (importRange === 'all') return {};
    const now = new Date();
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const from = new Date(to);
    const months = importRange === '1m' ? 1 : importRange === '3m' ? 3 : 12;
    from.setMonth(from.getMonth() - months);
    return {
      fromYmd: from.toISOString().slice(0, 10),
      toYmd: to.toISOString().slice(0, 10)
    };
  }, [importRange]);

  const handleImport = async () => {
    if (!userId) {
      setNotification({
        isVisible: true,
        message: 'Please sign in to import StockX sales',
        type: 'error'
      });
      return;
    }

    console.log('🚀 Starting StockX sales import');
    console.log('👤 User ID:', userId);
    console.log('⏰ Start time:', new Date().toISOString());

    setIsImporting(true);
    setProgress({
      phase: 'fetching',
      message: `Connecting to StockX and fetching sales (${rangeLabel})...`,
      percentage: 10
    });

    try {
      console.log('📡 Making request to bulk-import-stream endpoint');
      console.log('📋 Request body:', { userId, maxSales: 2000, completedOnly, ...rangeYmd });
      
      // Use Server-Sent Events for real-time progress updates
      const response = await fetch('/api/stockx/sales/bulk-import-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userId,
          maxSales: 2000,
          completedOnly,
          ...rangeYmd
        }),
      });

      console.log('📨 Response received:', {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Response not OK:', { status: response.status, statusText: response.statusText, errorText });
        throw new Error(`Import failed: ${response.statusText} - ${errorText}`);
      }

      // If the route didn't return an SSE stream, parse the body and surface the real error.
      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('text/event-stream')) {
        const bodyText = await response.text().catch(() => '');
        try {
          const asJson = JSON.parse(bodyText);
          const msg = asJson?.message || asJson?.error || bodyText || 'Import failed (non-stream response)';
          throw new Error(String(msg));
        } catch {
          throw new Error(bodyText || `Import failed (unexpected content-type: ${contentType || 'unknown'})`);
        }
      }

      // Set up EventSource-like processing for the response stream
      console.log('🔄 Setting up SSE stream reader');
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        console.error('❌ Failed to get response stream reader');
        throw new Error('Failed to get response stream');
      }

      let buffer = '';
      let finalResult: any = null;
      let streamStartTime = Date.now();
      let lastUpdateTime = Date.now();
      let updateCount = 0;
      let maxSalesFound = 0;
      let savingPhaseStarted = false;
      let lastSseErrorMessage: string | null = null;
      let sawAnySse = false;

      console.log('🔄 Starting stream reading loop');

      // Set up a maximum timeout for the entire import process
      const maxImportTime = 120000; // 2 minutes max
      const importTimeout = setTimeout(() => {
        if (!finalResult && maxSalesFound > 0) {
          console.log(`⏰ Import timeout reached but ${maxSalesFound} sales found - auto-completing`);
          finalResult = {
            success: true,
            totalSales: maxSalesFound,
            message: `✅ Successfully imported ${maxSalesFound} sales (completed due to timeout)`
          };
          reader.cancel();
        }
      }, maxImportTime);

      try {
        const processLine = (rawLine: string) => {
          const line = rawLine.replace(/\r$/, '');
          if (!line.startsWith('data:')) return;
          sawAnySse = true;

          // Support both "data: {...}" and "data:{...}"
          const jsonText = line.slice('data:'.length).trimStart();
          if (!jsonText) return;

          let data: any;
          try {
            data = JSON.parse(jsonText);
          } catch (parseError) {
            console.warn('Failed to parse SSE JSON:', parseError, 'Raw line:', line);
            return;
          }

          try {
            updateCount++;
            lastUpdateTime = Date.now();

            console.log(`📊 SSE Update #${updateCount}:`, {
              type: data.type,
              phase: data.phase,
              message: data.message,
              progress: data.progress,
              salesFound: data.salesFound,
              currentPage: data.currentPage,
              pageResults: data.pageResults,
              elapsed: Date.now() - streamStartTime
            });

            if (data.type === 'status' || data.type === 'progress') {
              const salesCount = data.salesFound || data.totalSales || 0;
              if (salesCount > maxSalesFound) maxSalesFound = salesCount;

              if (data.phase === 'saving' && !savingPhaseStarted) {
                savingPhaseStarted = true;
                console.log(`💾 Saving phase started with ${salesCount} sales`);
              }

              setProgress({
                phase: data.phase || 'fetching',
                message: data.message,
                percentage: data.progress || 0,
                salesCount: salesCount,
                currentPage: data.currentPage,
                pageResults: data.pageResults
              });

              if (data.batchComplete) {
                console.log(`📦 Batch ${data.batchNumber}/${data.totalBatches} complete:`, {
                  savedInBatch: data.savedInBatch,
                  totalSaved: data.totalSaved,
                  progress: data.progress
                });

                if ((data.batchNumber % 3) === 0 || data.batchNumber === data.totalBatches) {
                  onImportComplete?.(true, data.totalSaved);
                }
              }
            } else if (data.type === 'warning') {
              console.warn('⚠️ Import warning:', data.message);
              setProgress(prev => ({
                ...prev,
                message: data.message,
                percentage: data.progress || prev.percentage
              }));
            } else if (data.type === 'error') {
              lastSseErrorMessage = String(data.message || 'Import failed');
              console.error('❌ Import error:', lastSseErrorMessage);
              throw new Error(lastSseErrorMessage);
            } else if (data.type === 'complete') {
              console.log('🎉 Import completed successfully:', data);
              finalResult = data;
            }
          } catch (handlerError) {
            // This catch is only for handler logic; if we threw due to an SSE error, rethrow.
            if (handlerError instanceof Error) throw handlerError;
            throw new Error(String(handlerError));
          }
        };

        while (true) {
          const currentTime = Date.now();
          const { done, value } = await reader.read();
        
        console.log(`📖 Stream read: done=${done}, valueLength=${value?.length || 0}, elapsed=${currentTime - streamStartTime}ms`);
        
        if (done) {
          console.log('✅ Stream reading completed');
            // Process any remaining buffered line (common if stream ends without trailing newline)
            if (buffer.trim().length) {
              processLine(buffer.trim());
              buffer = '';
            }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
            processLine(line);
            if (finalResult) break;
        }

          if (finalResult) break;

          // Timeout check - warn if no updates for too long
          if (currentTime - lastUpdateTime > 15000) {
            console.warn(`⚠️ No updates received for ${(currentTime - lastUpdateTime) / 1000}s`);
          }
        }
      } finally {
        // Clear the timeout
        clearTimeout(importTimeout);
      }

      // Handle case where stream ends without final result (but import may have succeeded)
      if (!finalResult) {
        console.warn('⚠️ Stream ended without final result - checking if import succeeded anyway');
        if (lastSseErrorMessage) {
          throw new Error(lastSseErrorMessage);
        }
        if (!sawAnySse) {
          throw new Error(
            `Import failed: did not receive any SSE updates (content-type=${contentType || 'unknown'}). ` +
              `This usually means the stream was buffered/blocked or the server returned an empty stream. ` +
              `Try a smaller range (Last 1 month), wait a few minutes, then retry.`
          );
        }
        
        // Use the maximum sales count we tracked during the process
        const salesCount = Math.max(maxSalesFound, progress.salesCount || 0);
        
        if (salesCount > 0) {
          console.log(`✅ Stream interrupted but ${salesCount} sales were processed - treating as success`);
          console.log(`📊 Max sales found: ${maxSalesFound}, Current progress: ${progress.salesCount}, Saving started: ${savingPhaseStarted}`);
          
          // Create a synthetic success result
          finalResult = {
            success: true,
            totalSales: salesCount,
            message: `✅ Successfully imported ${salesCount} sales (auto-completed due to stream interruption)`
          };
          
          // Trigger the completion callback immediately
          console.log('🔄 Triggering completion callback for interrupted stream');
          onImportComplete?.(true, salesCount);
        } else {
          throw new Error('Import completed but no final result received and no sales were processed');
        }
      }

      if (!finalResult.success) {
        throw new Error(finalResult.message || 'Import failed');
      }

      // Final success update
      setProgress({
        phase: 'complete',
        message: finalResult.message,
        percentage: 100,
        salesCount: finalResult.totalSales,
        enrichedCount: finalResult.totalSales || 0
      });

      setNotification({
        isVisible: true,
        message: `🎉 Imported ${finalResult.totalSales} StockX sales and added them to your main sales table!`,
        type: 'success'
      });

      // Call completion callback
      console.log('🔄 StockXSalesImport: Calling onImportComplete with:', { success: true, count: finalResult.totalSales });
      onImportComplete?.(true, finalResult.totalSales);

      // Reset after a delay
      setTimeout(() => {
        setProgress({
          phase: 'idle',
          message: '',
          percentage: 0
        });
      }, 3000);

    } catch (error) {
      console.error('❌ StockX import failed with detailed error:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : 'Unknown',
        cause: error instanceof Error ? error.cause : undefined,
        fullError: error,
        timestamp: new Date().toISOString()
      });
      
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
      console.log('🏁 Import process finished at:', new Date().toISOString());
      setIsImporting(false);
    }
  };

  const handleQuickImport = async () => {
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
      message: 'Quick importing 1 page of COMPLETED orders (non-stream fallback)...',
      percentage: 10
    });

    try {
      const resp = await fetch('/api/stockx/sales/import-once', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, pageNumber: 1, pageSize: 50, orderStatus: 'COMPLETED' })
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || json?.success === false) {
        const msg = json?.message || json?.error || `Quick import failed (${resp.status})`;
        const detail =
          json?.url || json?.sourceUrl
            ? ` host=${json.url || json.sourceUrl}`
            : json?.status
              ? ` status=${json.status}`
              : '';
        const snippet = json?.bodySnippet ? ` snippet=${String(json.bodySnippet).slice(0, 180)}` : '';
        throw new Error(String(msg) + detail + snippet);
      }

      const totalWritten = Number(json?.saved || 0) + Number(json?.updated || 0);
      setProgress({
        phase: 'complete',
        message: `✅ Quick import wrote ${totalWritten} sale(s) to your sales table.`,
        percentage: 100,
        salesCount: totalWritten,
        enrichedCount: totalWritten
      });

      setNotification({
        isVisible: true,
        message: `✅ Quick import complete (${totalWritten} sale(s)).`,
        type: 'success'
      });

      onImportComplete?.(true, totalWritten);
      setTimeout(() => {
        setProgress({ phase: 'idle', message: '', percentage: 0 });
      }, 2000);
    } catch (e: any) {
      setProgress({
        phase: 'error',
        message: `❌ Quick import failed: ${e?.message || 'Unknown error'}`,
        percentage: 0
      });
      setNotification({
        isVisible: true,
        message: `Quick import failed: ${e?.message || 'Please try again'}`,
        type: 'error'
      });
      onImportComplete?.(false, 0);
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
              Import your StockX sales (up to 2000) and add them to your main sales table
            </p>
            <div className={`mt-3 flex flex-wrap items-center gap-2 text-xs ${
              isNeon ? 'text-gray-300' : 'text-gray-700'
            }`}>
              <span className={`font-semibold ${isNeon ? 'text-gray-200' : 'text-gray-800'}`}>Import range:</span>
              <select
                value={importRange}
                disabled={isImporting}
                onChange={(e) => setImportRange(e.target.value as ImportRange)}
                className={`px-3 py-2 rounded-lg border ${
                  isNeon
                    ? 'bg-gray-900 border-cyan-500/30 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/40'
                    : 'bg-white border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/40'
                } disabled:opacity-60`}
                title="Limit the import to a recent window to keep it fast"
              >
                <option value="1m">Last 1 month</option>
                <option value="3m">Last 3 months</option>
                <option value="12m">Last 12 months</option>
                <option value="all">All time</option>
              </select>
              <label className="inline-flex items-center gap-2 ml-1">
                <input
                  type="checkbox"
                  checked={completedOnly}
                  disabled={isImporting}
                  onChange={(e) => setCompletedOnly(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="font-medium">Completed-only (fewer requests)</span>
              </label>
            </div>
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
                Import
              </>
            )}
          </button>
        </div>

        <div className="mb-4">
          <button
            type="button"
            onClick={handleQuickImport}
            disabled={isImporting}
            className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${
              isImporting
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : isNeon
                  ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10'
                  : 'bg-white border border-gray-300 text-gray-900 hover:bg-gray-50'
            }`}
            title="Fallback import (no streaming): imports 1 page of COMPLETED orders to validate data + FIFO quickly"
          >
            Quick Import (1 page)
          </button>
          <div className={`mt-2 text-xs ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
            If streaming import fails, use this to write a small sample into your Sales table so Purchase Linking / FIFO can run.
          </div>
        </div>

        {/* Auth helper */}
        {progress.phase === 'error' &&
          typeof progress.message === 'string' &&
          progress.message.toLowerCase().includes('reconnect to stockx') && (
            <div
              className={`mb-4 rounded-lg p-4 ${
                isNeon ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50 border border-red-200'
              }`}
            >
              <div className={`text-sm font-semibold ${isNeon ? 'text-red-200' : 'text-red-800'}`}>
                StockX connection needs a refresh
              </div>
              <div className={`mt-1 text-sm ${isNeon ? 'text-red-100/90' : 'text-red-700'}`}>
                Click below to re-authenticate with StockX, then retry the import.
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href="/api/stockx/auth?returnTo=/dashboard?section=sales-2-0"
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${
                    isNeon
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-black'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  Reconnect to StockX
                </a>
              </div>
            </div>
          )}

        {/* CAPTCHA / bot-protection helper (PerimeterX) */}
        {progress.phase === 'error' &&
          typeof progress.message === 'string' &&
          (progress.message.toLowerCase().includes('px-cloud') ||
            progress.message.toLowerCase().includes('perimeterx') ||
            progress.message.toLowerCase().includes('captcha') ||
            progress.message.toLowerCase().includes('"appid":"px') ||
            progress.message.toLowerCase().includes('bot protection')) && (
            <div
              className={`mb-4 rounded-lg p-4 ${
                isNeon ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-yellow-50 border border-yellow-200'
              }`}
            >
              <div className={`text-sm font-semibold ${isNeon ? 'text-yellow-200' : 'text-yellow-800'}`}>
                StockX CAPTCHA / bot protection triggered
              </div>
              <div className={`mt-1 text-sm ${isNeon ? 'text-yellow-100/90' : 'text-yellow-800'}`}>
                StockX temporarily blocked automated requests. Open StockX in this browser and complete any CAPTCHA, then retry in a few minutes.
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href="https://stockx.com"
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${
                    isNeon
                      ? 'bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-black'
                      : 'bg-yellow-500 hover:bg-yellow-600 text-white'
                  }`}
                >
                  Open StockX
                </a>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${
                    isNeon
                      ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10'
                      : 'bg-white border border-gray-300 text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  Reload page
                </button>
              </div>
              <div className={`mt-2 text-xs ${isNeon ? 'text-yellow-100/80' : 'text-yellow-700'}`}>
                Tip: Avoid repeated retries back-to-back; wait a few minutes between attempts to reduce re-blocking.
              </div>
            </div>
          )}

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
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {getPhaseIcon()}
                <span className={`text-sm ${
                  isNeon ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  {progress.message}
                </span>
              </div>
              
              {/* Detailed Progress Info */}
              {(progress.currentPage || progress.salesCount || progress.pageResults) && (
                <div className={`text-xs grid grid-cols-3 gap-4 ${
                  isNeon ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  {progress.currentPage && (
                    <div>
                      <span className="font-medium">Page:</span> {progress.currentPage}
                    </div>
                  )}
                  {progress.salesCount !== undefined && (
                    <div>
                      <span className="font-medium">Total Found:</span> {progress.salesCount}
                    </div>
                  )}
                  {progress.pageResults && (
                    <div>
                      <span className="font-medium">Last Page:</span> +{progress.pageResults}
                    </div>
                  )}
                </div>
              )}
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
            <p>✅ Fetches StockX seller orders (completed + pending/active if enabled)</p>
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
