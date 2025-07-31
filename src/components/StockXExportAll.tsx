import React, { useState } from 'react';
import { Download, Loader2, CheckCircle, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { StockXSale } from '@/lib/types/stockx';
import { useAuth } from '@/lib/contexts/AuthContext';
import { addDocument, getDocuments, updateDocument } from '@/lib/firebase/firebaseUtils';

interface ExportProgress {
  pageNumber: number;
  salesInPage: number;
  totalSales: number;
  status: 'completed' | 'active';
}

const StockXExportAll: React.FC = () => {
  const { user } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [exportedSales, setExportedSales] = useState<StockXSale[]>([]);
  const [completedPages, setCompletedPages] = useState(0);

  const startExport = async () => {
    if (!user) {
      setError('Please login to export sales');
      return;
    }

    setIsExporting(true);
    setError(null);
    setProgress(null);
    setStatus('Connecting to StockX...');
    setExportedSales([]);
    setCompletedPages(0);

    try {
      const eventSource = new EventSource('/api/stockx/export-all-sales');
      
      eventSource.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'connected':
            setStatus(data.message);
            break;
            
          case 'status':
            setStatus(data.message);
            break;
            
          case 'progress':
            setProgress(data);
            setCompletedPages(prev => prev + 1);
            setStatus(`Fetching ${data.status} sales - Page ${data.pageNumber} (${data.totalSales} total)`);
            break;
            
          case 'complete':
            console.log(`✅ Export complete! ${data.totalSales} sales exported`);
            setExportedSales(data.sales);
            setStatus(`Export complete! ${data.totalSales} sales (${data.completedSales} completed, ${data.activeSales} active)`);
            
            // Save to Firebase if desired
            if (user) {
              setStatus('Saving to database...');
              await saveSalesToFirebase(data.sales, user.uid);
              setStatus(`Export complete! ${data.totalSales} sales exported and saved.`);
            }
            
            // Generate CSV download
            downloadCSV(data.sales);
            
            setIsExporting(false);
            eventSource.close();
            break;
            
          case 'error':
            console.error('❌ Export error:', data.message);
            setError(data.message);
            setIsExporting(false);
            eventSource.close();
            break;
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('❌ EventSource error:', error);
        setError('Connection lost. Please try again.');
        setIsExporting(false);
        eventSource.close();
      };
      
    } catch (error) {
      console.error('Error starting export:', error);
      setError('Failed to start export');
      setIsExporting(false);
    }
  };

  const saveSalesToFirebase = async (salesData: StockXSale[], userId: string) => {
    try {
      // Get existing sales to check for duplicates
      let existingSales: any[] = [];
      try {
        existingSales = await getDocuments('stockxSales');
      } catch (error) {
        console.log('No existing StockX sales found - will create new collection');
      }
      
      const userSalesMap = new Map(
        existingSales
          .filter(sale => sale.userId === userId)
          .map(sale => [sale.stockxOrderId, sale])
      );

      let savedCount = 0;
      let updatedCount = 0;

      // Save each sale
      for (const sale of salesData) {
        const existingSale = userSalesMap.get(sale.orderNumber);
        
        if (existingSale) {
          // Update existing sale if status changed
          if (existingSale.saleData.status !== sale.status || 
              existingSale.saleData.pricing.totalPayout !== sale.pricing.totalPayout) {
            await updateDocument('stockxSales', existingSale.id, {
              saleData: sale,
              updatedAt: new Date().toISOString()
            });
            updatedCount++;
          }
        } else {
          // Add new sale
          await addDocument('stockxSales', {
            userId: userId,
            stockxOrderId: sale.orderNumber,
            saleData: sale,
            createdAt: new Date().toISOString(),
            source: 'stockx_api_export'
          });
          savedCount++;
        }
      }
      
      console.log(`✅ Saved ${savedCount} new sales, updated ${updatedCount} existing sales`);
    } catch (error) {
      console.error('Error saving sales to Firebase:', error);
      throw error;
    }
  };

  const downloadCSV = (sales: StockXSale[]) => {
    // Create CSV headers
    const headers = [
      'Order Number',
      'Status',
      'Product Name',
      'Brand',
      'Size',
      'Sale Price',
      'Fees',
      'Payout',
      'Order Date',
      'Payout Date',
      'Authentication Status'
    ];

    // Create CSV rows
    const rows = sales.map(sale => [
      sale.orderNumber,
      sale.status,
      sale.product.productName,
      sale.product.brand,
      sale.variant.size,
      sale.pricing.salePrice.toFixed(2),
      sale.pricing.sellerFees.toFixed(2),
      sale.pricing.totalPayout.toFixed(2),
      new Date(sale.createdAt).toLocaleDateString(),
      sale.payoutDate ? new Date(sale.payoutDate).toLocaleDateString() : '',
      sale.authentication?.status || ''
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `stockx_sales_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-blue-400" />
            Export All StockX Sales
          </h3>
          <p className="text-gray-400 text-sm mt-1">
            Export your complete StockX sales history with no limits
          </p>
        </div>
      </div>

      {/* Export Button */}
      {!isExporting && !exportedSales.length && (
        <button
          onClick={startExport}
          className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
        >
          <Download className="w-5 h-5" />
          Export All Sales
        </button>
      )}

      {/* Progress Display */}
      {isExporting && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
            <p className="text-white">{status}</p>
          </div>
          
          {progress && (
            <div className="bg-gray-700/50 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-400">Current Page</p>
                  <p className="text-white font-semibold">{progress.pageNumber}</p>
                </div>
                <div>
                  <p className="text-gray-400">Total Sales</p>
                  <p className="text-white font-semibold">{progress.totalSales}</p>
                </div>
                <div>
                  <p className="text-gray-400">Sales in Page</p>
                  <p className="text-white font-semibold">{progress.salesInPage}</p>
                </div>
                <div>
                  <p className="text-gray-400">Status</p>
                  <p className="text-white font-semibold capitalize">{progress.status}</p>
                </div>
              </div>
              
              <div className="mt-4">
                <p className="text-gray-400 text-xs mb-1">Pages Processed: {completedPages}</p>
                <div className="w-full bg-gray-600 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min((completedPages / 15) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Success Display */}
      {!isExporting && exportedSales.length > 0 && (
        <div className="space-y-4">
          <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <p className="text-green-400 font-semibold">Export Complete!</p>
            </div>
            <p className="text-green-300 text-sm">{status}</p>
          </div>
          
          <button
            onClick={startExport}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export Again
          </button>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 mt-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <p className="text-red-400">{error}</p>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="mt-6 bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
        <h4 className="text-blue-400 font-semibold mb-2">What this does:</h4>
        <ul className="space-y-1 text-sm text-blue-300">
          <li>• Exports ALL your StockX sales (no 1,000 limit)</li>
          <li>• Fetches both completed and active orders</li>
          <li>• Includes accurate payout data where available</li>
          <li>• Saves to your database for offline access</li>
          <li>• Downloads as CSV for spreadsheet analysis</li>
        </ul>
      </div>
    </div>
  );
};

export default StockXExportAll;