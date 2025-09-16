import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

export interface ExportablePurchase {
  id: string | number;
  productName: string;
  brand: string;
  size: string;
  orderNumber: string;
  status: string;
  trackingNumber: string;
  market: string;
  price: string;
  originalPrice: string;
  purchaseDate: string;
  dateAdded: string;
  verified: string;
  type?: string;
}

export const exportToCSV = (purchases: ExportablePurchase[], filename: string = 'purchases') => {
  if (purchases.length === 0) {
    alert('No purchases to export');
    return;
  }

  // Convert purchases to CSV format
  const csvData = purchases.map(purchase => ({
    'Product Name': purchase.productName,
    'Brand': purchase.brand,
    'Size': purchase.size,
    'Order Number': purchase.orderNumber,
    'Status': purchase.status,
    'Tracking Number': purchase.trackingNumber || '',
    'Market': purchase.market,
    'Price': purchase.price,
    'Original Price': purchase.originalPrice,
    'Purchase Date': purchase.purchaseDate,
    'Date Added': purchase.dateAdded.replace('\n', ' '),
    'Verified': purchase.verified,
    'Type': purchase.type || 'Unknown'
  }));

  // Create CSV content
  const headers = Object.keys(csvData[0]);
  const csvContent = [
    headers.join(','),
    ...csvData.map(row => 
      headers.map(header => {
        const value = row[header as keyof typeof row];
        // Escape commas and quotes in CSV
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    )
  ].join('\n');

  // Create and download file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
};

export const exportToExcel = (purchases: ExportablePurchase[], filename: string = 'purchases') => {
  if (purchases.length === 0) {
    alert('No purchases to export');
    return;
  }

  // Convert purchases to Excel format
  const excelData = purchases.map(purchase => ({
    'Product Name': purchase.productName,
    'Brand': purchase.brand,
    'Size': purchase.size,
    'Order Number': purchase.orderNumber,
    'Status': purchase.status,
    'Tracking Number': purchase.trackingNumber || '',
    'Market': purchase.market,
    'Price': purchase.price,
    'Original Price': purchase.originalPrice,
    'Purchase Date': purchase.purchaseDate,
    'Date Added': purchase.dateAdded.replace('\n', ' '),
    'Verified': purchase.verified,
    'Type': purchase.type || 'Unknown'
  }));

  // Create workbook and worksheet
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(excelData);

  // Set column widths
  const columnWidths = [
    { wch: 40 }, // Product Name
    { wch: 15 }, // Brand
    { wch: 10 }, // Size
    { wch: 20 }, // Order Number
    { wch: 12 }, // Status
    { wch: 20 }, // Tracking Number
    { wch: 12 }, // Market
    { wch: 12 }, // Price
    { wch: 15 }, // Original Price
    { wch: 12 }, // Purchase Date
    { wch: 15 }, // Date Added
    { wch: 10 }, // Verified
    { wch: 10 }  // Type
  ];
  worksheet['!cols'] = columnWidths;

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Purchases');

  // Generate and download file
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
};

export const exportToJSON = (purchases: ExportablePurchase[], filename: string = 'purchases') => {
  if (purchases.length === 0) {
    alert('No purchases to export');
    return;
  }

  const jsonData = {
    exportDate: new Date().toISOString(),
    totalPurchases: purchases.length,
    purchases: purchases.map(purchase => ({
      id: purchase.id,
      product: {
        name: purchase.productName,
        brand: purchase.brand,
        size: purchase.size
      },
      orderNumber: purchase.orderNumber,
      status: purchase.status,
      tracking: purchase.trackingNumber,
      market: purchase.market,
      price: purchase.price,
      originalPrice: purchase.originalPrice,
      purchaseDate: purchase.purchaseDate,
      dateAdded: purchase.dateAdded,
      verified: purchase.verified,
      type: purchase.type || 'Unknown'
    }))
  };

  const jsonContent = JSON.stringify(jsonData, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  saveAs(blob, `${filename}_${new Date().toISOString().split('T')[0]}.json`);
};

export const getExportStats = (purchases: ExportablePurchase[]) => {
  const totalPurchases = purchases.length;
  const totalValue = purchases.reduce((sum, purchase) => {
    const price = parseFloat(purchase.price.replace('$', '').replace(',', ''));
    return sum + price;
  }, 0);

  const statusCounts = purchases.reduce((acc, purchase) => {
    acc[purchase.status] = (acc[purchase.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const marketCounts = purchases.reduce((acc, purchase) => {
    acc[purchase.market] = (acc[purchase.market] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    totalPurchases,
    totalValue: `$${totalValue.toLocaleString()}`,
    statusCounts,
    marketCounts,
    dateRange: {
      earliest: purchases.length > 0 ? Math.min(...purchases.map(p => new Date(p.purchaseDate).getTime())) : null,
      latest: purchases.length > 0 ? Math.max(...purchases.map(p => new Date(p.purchaseDate).getTime())) : null
    }
  };
};
