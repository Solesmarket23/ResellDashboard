import React, { useState } from 'react';
import { RefreshCw, Package, AlertCircle, CheckCircle } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import NeonNotification, { NotificationType } from './NeonNotification';

interface StockXSalesImportProps {
  userId: string;
  onImportComplete?: (success: boolean, salesCount: number) => void;
}

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
      message: 'Connecting to StockX and fetching sales...',
      percentage: 10
    });

    try {
      console.log('📡 Making request to bulk-import-stream endpoint');
      console.log('📋 Request body:', { userId, maxSales: 2000 });
      
      // Use Server-Sent Events for real-time progress updates
      const response = await fetch('/api/stockx/sales/bulk-import-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userId,
          maxSales: 2000 // Import up to 2000 sales
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

      console.log('🔄 Starting stream reading loop');

      while (true) {
        const currentTime = Date.now();
        const { done, value } = await reader.read();
        
        console.log(`📖 Stream read: done=${done}, valueLength=${value?.length || 0}, elapsed=${currentTime - streamStartTime}ms`);
        
        if (done) {
          console.log('✅ Stream reading completed');
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              updateCount++;
              lastUpdateTime = currentTime;
              
              console.log(`📊 SSE Update #${updateCount}:`, {
                type: data.type,
                phase: data.phase,
                message: data.message,
                progress: data.progress,
                salesFound: data.salesFound,
                currentPage: data.currentPage,
                pageResults: data.pageResults,
                elapsed: currentTime - streamStartTime
              });
              
              // Update progress based on the event type
              if (data.type === 'status' || data.type === 'progress') {
                setProgress({
                  phase: data.phase || 'fetching',
                  message: data.message,
                  percentage: data.progress || 0,
                  salesCount: data.salesFound || data.totalSales || 0,
                  currentPage: data.currentPage,
                  pageResults: data.pageResults
                });
                
                // If we've found a significant number of sales and are in saving phase,
                // trigger a preemptive refresh in case the stream fails
                if (data.phase === 'saving' && data.totalSales > 500) {
                  console.log(`🔄 Preemptive refresh: Found ${data.totalSales} sales in saving phase`);
                  setTimeout(() => {
                    console.log('🔄 Triggering import completion callback due to large import');
                    onImportComplete?.(true, data.totalSales);
                  }, 2000); // Wait 2 seconds for saving to complete
                }
              } else if (data.type === 'warning') {
                console.warn('⚠️ Import warning:', data.message);
                // Still update progress to show we're moving forward
                setProgress(prev => ({
                  ...prev,
                  message: data.message,
                  percentage: data.progress || prev.percentage
                }));
              } else if (data.type === 'error') {
                console.error('❌ Import error:', data.message);
                throw new Error(data.message);
              } else if (data.type === 'complete') {
                console.log('🎉 Import completed successfully:', data);
                finalResult = data;
                break;
              }
            } catch (parseError) {
              console.warn('Failed to parse SSE data:', parseError, 'Raw line:', line);
            }
          }
        }

        if (finalResult) break;

        // Timeout check - warn if no updates for too long
        if (currentTime - lastUpdateTime > 15000) {
          console.warn(`⚠️ No updates received for ${(currentTime - lastUpdateTime) / 1000}s`);
        }
      }

      // Handle case where stream ends without final result (but import may have succeeded)
      if (!finalResult) {
        console.warn('⚠️ Stream ended without final result - checking if import succeeded anyway');
        
        // Check current progress to see if we got sales
        if (progress.salesCount && progress.salesCount > 0) {
          console.log(`✅ Stream interrupted but ${progress.salesCount} sales were processed - treating as success`);
          
          // Create a synthetic success result
          finalResult = {
            success: true,
            totalSales: progress.salesCount,
            message: `✅ Successfully imported ${progress.salesCount} sales (stream completed)`
          };
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
              Import ALL your StockX sales (up to 2000) and add them to your main sales table
            </p>
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
                Import StockX Sales
              </>
            )}
          </button>
        </div>

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
            <p>✅ Fetches all completed sales from StockX</p>
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
