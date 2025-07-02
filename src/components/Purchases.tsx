'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Edit, MoreHorizontal, Camera, RefreshCw, Mail, Trash2, Settings } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import NativeBarcodeScannerModal from './NativeBarcodeScannerModal';
import GmailConnector from './GmailConnector';
import EmailParsingSettings from './EmailParsingSettings';

const Purchases = () => {
  const [sortBy, setSortBy] = useState('Purchase Date');
  const [showScanModal, setShowScanModal] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalValue, setTotalValue] = useState('$0.00');
  const [totalCount, setTotalCount] = useState(0);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showEmailSettings, setShowEmailSettings] = useState(false);
  const { currentTheme } = useTheme();
  
  // Column width state
  const [columnWidths, setColumnWidths] = useState({
    product: 300,
    orderNumber: 150,
    status: 120,
    tracking: 150,
    market: 100,
    price: 130,
    purchaseDate: 120,
    dateAdded: 120,
    verified: 80,
    edit: 80
  });
  
  const [isResizing, setIsResizing] = useState(false);
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  
  // Handle mouse down on resize handle
  const handleMouseDown = (e: React.MouseEvent, columnKey: string) => {
    e.preventDefault();
    setIsResizing(true);
    setResizingColumn(columnKey);
    
    const startX = e.clientX;
    const startWidth = columnWidths[columnKey as keyof typeof columnWidths];
    
    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX;
      const newWidth = Math.max(60, startWidth + diff);
      
      setColumnWidths(prev => ({
        ...prev,
        [columnKey]: newWidth
      }));
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      setResizingColumn(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    if (gmailConnected) {
      fetchPurchases();
    } else {
      loadMockData();
    }

    // Listen for email config updates and refresh purchases
    const handleConfigUpdate = () => {
      if (gmailConnected) {
        fetchPurchases();
      }
    };

    window.addEventListener('emailConfigUpdated', handleConfigUpdate);
    
    return () => {
      window.removeEventListener('emailConfigUpdated', handleConfigUpdate);
    };
  }, [gmailConnected]);

  const fetchPurchases = async () => {
    setLoading(true);
    try {
      // Get email parsing configuration from localStorage
      const emailConfig = localStorage.getItem('emailParsingConfig');
      
      const response = await fetch('/api/gmail/purchases', {
        headers: {
          'Content-Type': 'application/json',
          ...(emailConfig ? { 'email-config': emailConfig } : {})
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setPurchases(data.purchases || []);
        calculateTotals(data.purchases || []);
      } else {
        console.error('Failed to fetch purchases');
        loadMockData();
      }
    } catch (error) {
      console.error('Error fetching purchases:', error);
      loadMockData();
    } finally {
      setLoading(false);
    }
  };

  const loadMockData = () => {
    const mockPurchases = [
      {
        id: 1,
        product: {
          name: "Travis Scott Cactus Jack x Spider Days Before Rode...",
          brand: "Travis Scott",
          size: "Size US XL",
          image: "https://picsum.photos/200/200?random=1",
          bgColor: "bg-amber-900",
          color: "brown"
        },
        orderNumber: "81-CE1Y398K3Z",
        status: "Delivered",
        statusColor: "green",
        tracking: "888637538408",
        market: "StockX",
        price: "$118.90",
        originalPrice: "$118.90 + $0.00",
        purchaseDate: "Jun 23",
        dateAdded: "Jun 23\n4:15 PM",
        verified: "verified",
        verifiedColor: "green"
      },
      {
        id: 2,
        product: {
          name: "Denim Tears Cotton Wreath Hoodie Black Monochro...",
          brand: "Denim Tears",
          size: "Size US S",
          image: "https://picsum.photos/200/200?random=3",
          bgColor: "bg-gray-900",
          color: "black"
        },
        orderNumber: "81-DHFSC2NK16",
        status: "Shipped",
        statusColor: "blue",
        tracking: "882268115454",
        market: "StockX",
        price: "$197.83",
        originalPrice: "$197.83 + $0.00",
        purchaseDate: "Jun 23",
        dateAdded: "Jun 23\n4:15 PM",
        verified: "pending",
        verifiedColor: "orange"
      },
      {
        id: 3,
        product: {
          name: "Denim Tears The Cotton Wreath Sweatshirt Black",
          brand: "Denim Tears",
          size: "Size US M",
          image: "https://picsum.photos/200/200?random=5",
          bgColor: "bg-gray-900",
          color: "black"
        },
        orderNumber: "81-LG34U384ZP",
        status: "Delivered",
        statusColor: "green",
        tracking: "430386817447",
        market: "StockX",
        price: "$238.13",
        originalPrice: "$238.13 + $0.00",
        purchaseDate: "Jun 23",
        dateAdded: "Jun 23\n4:15 PM",
        verified: "pending",
        verifiedColor: "orange"
      }
    ];
    setPurchases(mockPurchases);
    calculateTotals(mockPurchases);
  };

  const calculateTotals = (purchaseList: any[]) => {
    const total = purchaseList.reduce((sum, purchase) => {
      const price = parseFloat(purchase.price.replace('$', '').replace(',', ''));
      return sum + price;
    }, 0);
    setTotalValue(`$${total.toLocaleString()}`);
    setTotalCount(purchaseList.length);
  };

  const refreshPurchases = () => {
    if (gmailConnected) {
      fetchPurchases();
    }
  };

  const handleResetClick = () => {
    setShowResetConfirm(true);
  };

  const confirmReset = () => {
    setPurchases([]);
    setTotalValue('$0');
    setTotalCount(0);
    setShowResetConfirm(false);
  };

  const cancelReset = () => {
    setShowResetConfirm(false);
  };

  const getStatusBadge = (status: string, color: string) => {
    const baseClasses = "px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap";
    if (currentTheme.name === 'Neon') {
      const colorClasses = {
        green: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
        orange: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
        blue: "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
      };
      return `${baseClasses} ${colorClasses[color as keyof typeof colorClasses]}`;
    } else {
      const colorClasses = {
        green: "bg-green-100 text-green-800",
        orange: "bg-orange-100 text-orange-800",
        blue: "bg-blue-100 text-blue-800"
      };
      return `${baseClasses} ${colorClasses[color as keyof typeof colorClasses]}`;
    }
  };

  const getVerifiedIndicator = (verified: string, color: string) => {
    if (currentTheme.name === 'Neon') {
      const colorClasses = {
        green: "bg-emerald-500",
        orange: "bg-orange-500",
        red: "bg-red-500"
      };
      return `w-2 h-2 rounded-full ${colorClasses[color as keyof typeof colorClasses]}`;
    } else {
      const colorClasses = {
        green: "bg-green-500",
        orange: "bg-orange-500",
        red: "bg-red-500"
      };
      return `w-2 h-2 rounded-full ${colorClasses[color as keyof typeof colorClasses]}`;
    }
  };

  const handleScanComplete = (trackingNumber: string) => {
    console.log('Scanned tracking number:', trackingNumber);
  };

  return (
    <div className={`flex-1 ${currentTheme.colors.background} p-8`}>
      {/* Gmail Connection Status */}
      <div className="mb-6">
        <GmailConnector onConnectionChange={setGmailConnected} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <div>
            <h1 className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>Purchases</h1>
            <p className={`${currentTheme.colors.textSecondary} mt-1`}>
              {gmailConnected ? 
                `Showing ${totalCount} purchases from Gmail` : 
                `Showing ${totalCount} purchases (Demo data)`
              }
            </p>
          </div>
          <div className="flex items-center space-x-2">
            {gmailConnected && (
              <button
                onClick={refreshPurchases}
                disabled={loading}
                className={`flex items-center space-x-2 ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 shadow-lg hover:shadow-emerald-500/25' 
                    : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-lg hover:shadow-purple-500/25'
                } disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200`}
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                <span>Sync Gmail</span>
              </button>
            )}
            <button
              onClick={() => setShowScanModal(true)}
              className={`flex items-center space-x-2 ${
                currentTheme.name === 'Neon' 
                  ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 shadow-lg hover:shadow-emerald-500/25' 
                  : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-lg hover:shadow-purple-500/25'
              } text-white px-4 py-2 rounded-lg font-medium transition-all duration-200`}
            >
              <Camera className="w-5 h-5" />
              <span>Scan Package</span>
            </button>
            {totalCount > 0 && (
              <button
                onClick={handleResetClick}
                className={`flex items-center space-x-2 ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30' 
                    : 'bg-red-600 hover:bg-red-700 text-white'
                } px-4 py-2 rounded-lg font-medium transition-all duration-200`}
              >
                <Trash2 className="w-5 h-5" />
                <span>Reset</span>
              </button>
            )}
            <button
              onClick={() => setShowEmailSettings(true)}
              className={`flex items-center space-x-2 ${
                currentTheme.name === 'Neon' 
                  ? 'bg-white/10 hover:bg-white/20 text-gray-300 border border-white/20' 
                  : 'bg-gray-600 hover:bg-gray-700 text-white'
              } px-4 py-2 rounded-lg font-medium transition-all duration-200`}
            >
              <Settings className="w-5 h-5" />
              <span>Settings</span>
            </button>
          </div>
        </div>
        <div className="text-right">
          <p className={`${currentTheme.colors.textSecondary}`}>Total value:</p>
          <p className={`text-xl font-bold ${currentTheme.colors.textPrimary}`}>{totalValue}</p>
          {gmailConnected && (
            <p className={`text-xs ${currentTheme.name === 'Neon' ? 'text-emerald-400' : 'text-green-600'} flex items-center justify-end mt-1`}>
              <Mail className="w-3 h-3 mr-1" />
              Live from Gmail
            </p>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className={`w-6 h-6 animate-spin ${currentTheme.colors.accent} mr-2`} />
          <span className={`${currentTheme.colors.textSecondary}`}>Fetching purchases from Gmail...</span>
        </div>
      )}

      {/* Table */}
      <div className={`${currentTheme.colors.cardBackground} rounded-lg shadow-sm ${currentTheme.colors.border} border overflow-hidden`}>
        <div className="overflow-x-auto">
          <table ref={tableRef} className="w-full" style={{ tableLayout: 'fixed' }}>
            <thead className={`${
              currentTheme.name === 'Neon' 
                ? 'bg-white/5 border-b border-white/10' 
                : 'bg-gray-50 border-b border-gray-200'
            }`}>
              <tr className="h-10">
                <th className={`relative px-6 py-0 h-10 align-middle text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`} style={{ width: `${columnWidths.product}px` }}>
                  Product
                  <div 
                    className={`absolute right-0 top-0 h-full w-1 cursor-col-resize ${
                      currentTheme.name === 'Neon' ? 'hover:bg-cyan-400/50' : 'hover:bg-blue-300'
                    } opacity-0 hover:opacity-100 transition-opacity`}
                    onMouseDown={(e) => handleMouseDown(e, 'product')}
                  />
                </th>
                <th className={`relative px-6 py-0 h-10 align-middle text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`} style={{ width: `${columnWidths.orderNumber}px` }}>
                  Order #
                  <div 
                    className={`absolute right-0 top-0 h-full w-1 cursor-col-resize ${
                      currentTheme.name === 'Neon' ? 'hover:bg-cyan-400/50' : 'hover:bg-blue-300'
                    } opacity-0 hover:opacity-100 transition-opacity`}
                    onMouseDown={(e) => handleMouseDown(e, 'orderNumber')}
                  />
                </th>
                <th className={`relative px-6 py-0 h-10 align-middle text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`} style={{ width: `${columnWidths.status}px` }}>
                  Status / Delivery
                  <div 
                    className={`absolute right-0 top-0 h-full w-1 cursor-col-resize ${
                      currentTheme.name === 'Neon' ? 'hover:bg-cyan-400/50' : 'hover:bg-blue-300'
                    } opacity-0 hover:opacity-100 transition-opacity`}
                    onMouseDown={(e) => handleMouseDown(e, 'status')}
                  />
                </th>
                <th className={`relative px-6 py-0 h-10 align-middle text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`} style={{ width: `${columnWidths.tracking}px` }}>
                  Tracking
                  <div 
                    className={`absolute right-0 top-0 h-full w-1 cursor-col-resize ${
                      currentTheme.name === 'Neon' ? 'hover:bg-cyan-400/50' : 'hover:bg-blue-300'
                    } opacity-0 hover:opacity-100 transition-opacity`}
                    onMouseDown={(e) => handleMouseDown(e, 'tracking')}
                  />
                </th>
                <th className={`relative px-6 py-0 h-10 align-middle text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`} style={{ width: `${columnWidths.market}px` }}>
                  Market
                  <div 
                    className={`absolute right-0 top-0 h-full w-1 cursor-col-resize ${
                      currentTheme.name === 'Neon' ? 'hover:bg-cyan-400/50' : 'hover:bg-blue-300'
                    } opacity-0 hover:opacity-100 transition-opacity`}
                    onMouseDown={(e) => handleMouseDown(e, 'market')}
                  />
                </th>
                <th className={`relative px-6 py-0 h-10 align-middle text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`} style={{ width: `${columnWidths.price}px` }}>
                  Price
                  <div 
                    className={`absolute right-0 top-0 h-full w-1 cursor-col-resize ${
                      currentTheme.name === 'Neon' ? 'hover:bg-cyan-400/50' : 'hover:bg-blue-300'
                    } opacity-0 hover:opacity-100 transition-opacity`}
                    onMouseDown={(e) => handleMouseDown(e, 'price')}
                  />
                </th>
                <th className={`relative px-6 py-0 h-10 align-middle text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider cursor-pointer ${
                  currentTheme.name === 'Neon' ? 'hover:bg-white/5' : 'hover:bg-gray-100'
                }`} style={{ width: `${columnWidths.purchaseDate}px` }}>
                  <div className="flex items-center h-10">
                    Purchase Date
                    <ChevronDown className="w-4 h-4 ml-1" />
                  </div>
                  <div 
                    className={`absolute right-0 top-0 h-full w-1 cursor-col-resize ${
                      currentTheme.name === 'Neon' ? 'hover:bg-cyan-400/50' : 'hover:bg-blue-300'
                    } opacity-0 hover:opacity-100 transition-opacity`}
                    onMouseDown={(e) => handleMouseDown(e, 'purchaseDate')}
                  />
                </th>
                <th className={`relative px-6 py-0 h-10 align-middle text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`} style={{ width: `${columnWidths.dateAdded}px` }}>
                  Date Added
                  <div 
                    className={`absolute right-0 top-0 h-full w-1 cursor-col-resize ${
                      currentTheme.name === 'Neon' ? 'hover:bg-cyan-400/50' : 'hover:bg-blue-300'
                    } opacity-0 hover:opacity-100 transition-opacity`}
                    onMouseDown={(e) => handleMouseDown(e, 'dateAdded')}
                  />
                </th>
                <th className={`relative px-6 py-0 h-10 align-middle text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`} style={{ width: `${columnWidths.verified}px` }}>
                  Verified
                  <div 
                    className={`absolute right-0 top-0 h-full w-1 cursor-col-resize ${
                      currentTheme.name === 'Neon' ? 'hover:bg-cyan-400/50' : 'hover:bg-blue-300'
                    } opacity-0 hover:opacity-100 transition-opacity`}
                    onMouseDown={(e) => handleMouseDown(e, 'verified')}
                  />
                </th>
                <th className={`relative px-6 py-0 h-10 align-middle text-left text-xs font-medium ${currentTheme.colors.textSecondary} uppercase tracking-wider`} style={{ width: `${columnWidths.edit}px` }}>
                  Edit
                  <div 
                    className={`absolute right-0 top-0 h-full w-1 cursor-col-resize ${
                      currentTheme.name === 'Neon' ? 'hover:bg-cyan-400/50' : 'hover:bg-blue-300'
                    } opacity-0 hover:opacity-100 transition-opacity`}
                    onMouseDown={(e) => handleMouseDown(e, 'edit')}
                  />
                </th>
              </tr>
            </thead>
            <tbody className={`${currentTheme.colors.cardBackground} ${
              currentTheme.name === 'Neon' ? 'divide-y divide-white/10' : 'divide-y divide-gray-100'
            }`}>
              {purchases.map((purchase) => (
                <tr key={purchase.id} className={`${
                  currentTheme.name === 'Neon' ? 'hover:bg-white/5' : 'hover:bg-gray-50'
                } transition-colors`}>
                  <td className="px-6 py-2">
                    <div className="flex items-start gap-3 min-h-12">
                      <div className={`w-8 h-8 rounded-lg flex-shrink-0 overflow-hidden ${purchase.product.bgColor} flex items-center justify-center shadow-sm mt-1`}>
                        <img 
                          src={purchase.product.image} 
                          alt={purchase.product.name}
                          className="w-full h-full object-cover rounded-lg"
                          onLoad={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.parentElement!.classList.remove(purchase.product.bgColor);
                          }}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const parent = target.parentElement!;
                            parent.innerHTML = `<div class="w-full h-full flex items-center justify-center text-white text-xs font-bold">${purchase.product.brand.split(' ')[0]}</div>`;
                          }}
                        />
                      </div>
                      <div className="flex-1">
                        <div className={`text-sm font-medium ${currentTheme.colors.textPrimary} leading-tight`} style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                          {purchase.product.name}
                        </div>
                        <div className={`text-xs ${currentTheme.colors.textSecondary}`} style={{ wordBreak: 'break-word' }}>
                          {purchase.product.brand} • {purchase.product.size}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <a 
                      href={`https://mail.google.com/mail/u/0/#search/"${encodeURIComponent(purchase.orderNumber)}"`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${currentTheme.colors.accent} text-sm font-medium hover:underline whitespace-nowrap transition-colors`}
                    >
                      {purchase.orderNumber}
                    </a>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <span className={getStatusBadge(purchase.status, purchase.statusColor)}>
                      {purchase.status}
                    </span>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <a href="#" className={`${currentTheme.colors.accent} text-sm hover:underline transition-colors`}>
                      {purchase.tracking}
                    </a>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <span className={`text-sm ${currentTheme.colors.textPrimary} font-medium`}>
                      {purchase.market}
                    </span>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>{purchase.price}</div>
                    <div className={`text-xs ${currentTheme.colors.textSecondary}`}>({purchase.originalPrice})</div>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <span className={`text-sm ${currentTheme.colors.textPrimary} font-medium`}>
                      {purchase.purchaseDate}
                    </span>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <div className={`text-sm ${currentTheme.colors.textPrimary} whitespace-nowrap`}>
                      {purchase.dateAdded.replace('\n', ' ')}
                    </div>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <div className={getVerifiedIndicator(purchase.verified, purchase.verifiedColor)}></div>
                  </td>
                  <td className="px-6 py-2 align-middle">
                    <div className="flex items-center space-x-1">
                      <button className={`p-1 ${currentTheme.colors.textSecondary} ${
                        currentTheme.name === 'Neon' ? 'hover:text-cyan-400 hover:bg-white/10' : 'hover:text-gray-600 hover:bg-gray-100'
                      } rounded transition-colors`}>
                        <Edit className="w-4 h-4" />
                      </button>
                      <button className={`p-1 ${currentTheme.colors.textSecondary} ${
                        currentTheme.name === 'Neon' ? 'hover:text-cyan-400 hover:bg-white/10' : 'hover:text-gray-600 hover:bg-gray-100'
                      } rounded transition-colors`}>
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Native Barcode Scanner Modal */}
      <NativeBarcodeScannerModal
        isOpen={showScanModal}
        onClose={() => setShowScanModal(false)}
        onScanComplete={handleScanComplete}
      />

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`${currentTheme.colors.cardBackground} ${currentTheme.colors.border} border rounded-lg p-6 max-w-md w-full mx-4`}>
            <div className="flex items-center mb-4">
              <Trash2 className={`w-6 h-6 ${
                currentTheme.name === 'Neon' ? 'text-red-400' : 'text-red-600'
              } mr-3`} />
              <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>Reset All Purchases</h3>
            </div>
            <p className={`${currentTheme.colors.textSecondary} mb-6`}>
              Are you sure you want to clear all purchases? This action cannot be undone.
              {gmailConnected && " You can always sync with Gmail again to restore your data."}
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelReset}
                className={`px-4 py-2 ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-white/10 hover:bg-white/20 text-gray-300 border border-white/20' 
                    : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                } rounded-lg font-medium transition-colors`}
              >
                Cancel
              </button>
              <button
                onClick={confirmReset}
                className={`px-4 py-2 ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30' 
                    : 'bg-red-600 hover:bg-red-700 text-white'
                } rounded-lg font-medium transition-colors`}
              >
                Reset All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Parsing Settings Modal */}
      <EmailParsingSettings
        isOpen={showEmailSettings}
        onClose={() => setShowEmailSettings(false)}
      />
    </div>
  );
};

export default Purchases; 