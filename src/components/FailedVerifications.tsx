'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Plus, AlertTriangle, Calendar, ChevronDown, RotateCcw, CheckCircle, DollarSign, X, Trash2 } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { generateGmailSearchUrl } from '../lib/utils/orderNumberUtils';
import { useAuth } from '../lib/contexts/AuthContext';
import { db } from '../lib/firebase/firebase';
import { collection, addDoc, query, where, onSnapshot, deleteDoc, doc } from 'firebase/firestore';

const FailedVerifications = () => {
  const [timeFilter, setTimeFilter] = useState('Monthly');
  const [statusFilter, setStatusFilter] = useState('All Statuses');
  const [isScanning, setIsScanning] = useState(false);
  const [showScanResult, setShowScanResult] = useState(false);
  const [timeDropdownOpen, setTimeDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const { currentTheme } = useTheme();
  const { user } = useAuth();
  
  // Dynamic theme detection for consistent neon styling
  const isNeon = currentTheme.name === 'Neon';

  const timeOptions = ['Monthly', 'Weekly', 'Daily'];
  const statusOptions = ['All Statuses', 'Failed', 'Pending', 'Completed'];
  
  const timeDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (timeDropdownRef.current && !timeDropdownRef.current.contains(event.target as Node)) {
        setTimeDropdownOpen(false);
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setStatusDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Load failed verifications from Firebase
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const failedVerificationsRef = collection(db, 'failedVerifications');
    const q = query(failedVerificationsRef, where('userId', '==', user.uid));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const failures = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setManualFailures(failures);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const [scanResults, setScanResults] = useState<any[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [manualFailures, setManualFailures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const handleDeleteFailure = async (failureId: string) => {
    try {
      await deleteDoc(doc(db, 'failedVerifications', failureId));
    } catch (error) {
      console.error('Error deleting failed verification:', error);
      alert('Failed to delete verification failure.');
    }
  };

  const handleScanClick = async () => {
    console.log('🔍 Scan button clicked');
    setIsScanning(true);
    setShowScanResult(false);
    setScanError(null);
    setScanResults([]);
    
    try {
      console.log('🔍 Calling API...');
      // Call the API with a higher limit (increased from default 10)
      const response = await fetch('/api/gmail/verification-failures?limit=100');
      
      console.log('🔍 API Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('🔍 API Error response:', errorText);
        throw new Error('Failed to scan verification failures');
      }
      
      const data = await response.json();
      console.log('🔍 API Response data:', data);
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      setScanResults(data.failures || []);
      setShowScanResult(true);
      console.log('🔍 Scan complete, found', data.failures?.length || 0, 'results');
    } catch (error) {
      console.error('🔍 Error scanning verification failures:', error);
      setScanError(error instanceof Error ? error.message : 'Failed to scan');
    } finally {
      setIsScanning(false);
    }
  };

  const monthlyData = [
    { month: 'Jan 2025', rate: '0.0%', failed: 0, total: 0, status: 'No sales' },
    { month: 'Feb 2025', rate: '0.0%', failed: 0, total: 0, status: 'No sales' },
    { month: 'Mar 2025', rate: '0.0%', failed: 0, total: 0, status: 'No sales' },
    { month: 'Apr 2025', rate: '0.0%', failed: 0, total: 0, status: 'No sales' }
  ];

  const totalFailures = scanResults.length + manualFailures.length;
  
  const statusCards = [
    {
      title: 'Total Failed',
      value: totalFailures.toString(),
      icon: AlertTriangle,
      iconColor: 'text-red-600'
    },
    {
      title: 'Pending Returns',
      value: totalFailures.toString(),
      icon: RotateCcw,
      iconColor: 'text-orange-600'
    },
    {
      title: 'Completed',
      value: '0',
      icon: CheckCircle,
      iconColor: 'text-green-600'
    },
    {
      title: 'Total Loss',
      value: '$0.00',
      icon: DollarSign,
      iconColor: 'text-red-600',
      valueColor: 'text-red-600'
    }
  ];

  return (
    <div className={`flex-1 p-8 ${
      isNeon 
        ? 'bg-slate-950' 
        : currentTheme.colors.background
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className={`text-2xl font-bold ${
            isNeon ? 'text-white' : 'text-gray-900'
          }`}>Failed Verifications</h1>
          <p className={`mt-1 ${
            isNeon ? 'text-slate-400' : 'text-gray-600'
          }`}>Track items that failed marketplace verification</p>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={handleScanClick}
            disabled={isScanning}
            className={`flex items-center px-4 py-2 text-white rounded-lg transition-all duration-300 ${
              isNeon
                ? isScanning 
                  ? 'bg-gradient-to-r from-cyan-500/50 to-emerald-500/50 cursor-not-allowed'
                  : 'bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 shadow-lg shadow-cyan-500/25 hover:shadow-xl hover:shadow-cyan-500/40'
                : isScanning 
                  ? 'bg-blue-500 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            <Search className="w-4 h-4 mr-2" />
            {isScanning ? 'Scanning...' : 'Scan for Verification Failures'}
          </button>
          <button 
            onClick={() => setShowAddModal(true)}
            className={`flex items-center px-4 py-2 text-white rounded-lg transition-all duration-300 ${
            isNeon
              ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/40'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}>
            <Plus className="w-4 h-4 mr-2" />
            Add Failed Verification
          </button>
        </div>
      </div>

      {/* Main Metrics Section */}
      <div className={`rounded-lg p-8 mb-6 ${
        isNeon
          ? 'dark-neon-card border border-slate-700/50'
          : `${currentTheme.colors.cardBackground} shadow-sm border border-gray-200`
      }`}
      style={{ overflow: 'visible' }}>
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center">
            <AlertTriangle className={`w-6 h-6 mr-3 ${
              isNeon ? 'text-orange-400' : 'text-orange-500'
            }`} />
            <h2 className={`text-xl font-semibold ${
              isNeon ? 'text-white' : 'text-gray-900'
            }`}>Verification Failure Rate</h2>
          </div>
          <div className="relative" ref={timeDropdownRef} style={{ zIndex: 1 }}>
            <button
              onClick={() => setTimeDropdownOpen(!timeDropdownOpen)}
              className={`flex items-center justify-between rounded-lg px-4 py-2 pr-8 text-sm font-medium focus:outline-none focus:ring-2 focus:border-opacity-50 transition-all duration-200 ${
                isNeon
                  ? 'input-premium text-white border-slate-600/50 focus:ring-cyan-500 hover:border-cyan-500/50'
                  : `${currentTheme.colors.cardBackground} border border-gray-300 text-gray-700 ${currentTheme.colors.primary.replace('bg-', 'focus:ring-')} hover:border-gray-400`
              }`}
            >
              <span>{timeFilter}</span>
              <ChevronDown className={`w-4 h-4 ml-2 transition-transform duration-200 ${
                timeDropdownOpen ? 'rotate-180' : ''
              } ${isNeon ? 'text-slate-400' : 'text-gray-400'}`} />
            </button>
            
            {timeDropdownOpen && (
              <div className={`absolute top-full left-0 mt-1 rounded-lg shadow-xl z-[9999] ${
                isNeon 
                  ? 'dark-neon-card border border-slate-700/50' 
                  : 'bg-white border border-gray-200'
              }`}
              style={{ minWidth: '100%' }}>
                {timeOptions.map((option) => (
                  <button
                    key={option}
                    onClick={() => {
                      setTimeFilter(option);
                      setTimeDropdownOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors duration-150 first:rounded-t-lg last:rounded-b-lg whitespace-nowrap ${
                      isNeon
                        ? option === timeFilter
                          ? 'bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 text-cyan-300'
                          : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                        : option === timeFilter
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Stats Row */}
        <div className="grid grid-cols-3 gap-8 mb-6">
          <div className="text-center">
            <div className={`text-4xl font-bold mb-2 ${
              isNeon ? 'text-red-400' : 'text-red-600'
            }`}>--</div>
            <div className={`text-sm ${
              isNeon ? 'text-slate-400' : 'text-gray-500'
            }`}>Overall Rate</div>
          </div>
          <div className="text-center">
            <div className={`text-4xl font-bold mb-2 ${
              isNeon ? 'text-white' : 'text-gray-900'
            }`}>{totalFailures}</div>
            <div className={`text-sm ${
              isNeon ? 'text-slate-400' : 'text-gray-500'
            }`}>Total Failures</div>
          </div>
          <div className="text-center">
            <div className={`text-4xl font-bold mb-2 ${
              isNeon ? 'text-white' : 'text-gray-900'
            }`}>--</div>
            <div className={`text-sm ${
              isNeon ? 'text-slate-400' : 'text-gray-500'
            }`}>Total Sales</div>
          </div>
        </div>

        {/* Current Month Rate */}
        <div className={`flex items-center justify-between pt-6 border-t ${
          isNeon ? 'border-slate-700/50' : 'border-gray-200'
        }`}>
          <div>
            <div className={`text-2xl font-bold ${
              isNeon ? 'text-white' : 'text-gray-900'
            }`}>--</div>
            <div className={`text-sm ${
              isNeon ? 'text-slate-400' : 'text-gray-500'
            }`}>Current month rate</div>
          </div>
          <div className={`text-sm ${
            isNeon ? 'text-slate-400' : 'text-gray-500'
          }`}>--</div>
        </div>
      </div>

      {/* Monthly Breakdown */}
      <div className={`rounded-lg p-6 mb-6 ${
        isNeon
          ? 'dark-neon-card border border-slate-700/50'
          : `${currentTheme.colors.cardBackground} shadow-sm border border-gray-200`
      }`}>
        <div className="flex items-center mb-6">
          <Calendar className={`w-5 h-5 mr-2 ${
            isNeon ? 'text-cyan-400' : 'text-gray-600'
          }`} />
          <h3 className={`text-lg font-semibold ${
            isNeon ? 'text-white' : 'text-gray-900'
          }`}>Monthly Breakdown</h3>
        </div>

        <div className="space-y-4">
          {monthlyData.map((month, index) => (
            <div key={index} className={`flex items-center justify-between py-3 border-b last:border-b-0 ${
              isNeon ? 'border-slate-700/50' : 'border-gray-100'
            }`}>
              <div className="flex-1">
                <div className={`font-medium ${
                  isNeon ? 'text-white' : 'text-gray-900'
                }`}>{month.month}</div>
                <div className={`text-sm ${
                  isNeon ? 'text-slate-400' : 'text-gray-500'
                }`}>{month.failed} of {month.total} sales failed</div>
              </div>
              <div className="text-right">
                <div className={`text-lg font-bold ${
                  isNeon ? 'text-emerald-400' : 'text-green-600'
                }`}>{month.rate}</div>
                <div className={`text-sm ${
                  isNeon ? 'text-slate-400' : 'text-gray-500'
                }`}>{month.status}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {statusCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <div key={index} className={`rounded-lg p-6 ${
              isNeon
                ? 'dark-neon-card border border-slate-700/50 hover:border-cyan-500/50 transition-all duration-300'
                : `${currentTheme.colors.cardBackground} shadow-sm border border-gray-200`
            }`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-sm font-medium ${
                  isNeon ? 'text-slate-300' : 'text-gray-600'
                }`}>{card.title}</h3>
                <Icon className={`w-5 h-5 ${
                  isNeon 
                    ? card.iconColor.includes('red') ? 'text-red-400'
                      : card.iconColor.includes('orange') ? 'text-orange-400'
                      : card.iconColor.includes('green') ? 'text-emerald-400'
                      : 'text-cyan-400'
                    : card.iconColor
                }`} />
              </div>
              <p className={`text-2xl font-bold ${
                isNeon
                  ? card.valueColor?.includes('red') ? 'text-red-400'
                    : 'text-white'
                  : card.valueColor || 'text-gray-900'
              }`}>
                {card.value}
              </p>
            </div>
          );
        })}
      </div>

      {/* Search and Filter */}
      <div className="flex items-center justify-between mb-6" style={{ overflow: 'visible' }}>
        <div className="relative flex-1 max-w-md">
          <Search className={`w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 ${
            isNeon ? 'text-slate-400' : 'text-gray-400'
          }`} />
          <input
            type="text"
            placeholder="Search failed verifications..."
            className={`w-full pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 ${
              isNeon
                ? 'input-premium text-white placeholder-slate-400 border-slate-600/50 focus:ring-cyan-500 focus:border-cyan-500'
                : 'border border-gray-300 focus:ring-blue-500 focus:border-blue-500'
            }`}
          />
        </div>
        <div className="ml-4">
          <div className="relative" ref={statusDropdownRef} style={{ zIndex: 1 }}>
            <button
              onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
              className={`flex items-center justify-between rounded-lg px-4 py-2 pr-8 text-sm font-medium focus:outline-none focus:ring-2 focus:border-opacity-50 transition-all duration-200 min-w-[120px] ${
                isNeon
                  ? 'input-premium text-white border-slate-600/50 focus:ring-cyan-500 hover:border-cyan-500/50'
                  : `${currentTheme.colors.cardBackground} border border-gray-300 text-gray-700 ${currentTheme.colors.primary.replace('bg-', 'focus:ring-')} hover:border-gray-400`
              }`}
            >
              <span>{statusFilter}</span>
              <ChevronDown className={`w-4 h-4 ml-2 transition-transform duration-200 ${
                statusDropdownOpen ? 'rotate-180' : ''
              } ${isNeon ? 'text-slate-400' : 'text-gray-400'}`} />
            </button>
            
            {statusDropdownOpen && (
              <div className={`absolute top-full left-0 mt-1 rounded-lg shadow-xl z-[9999] ${
                isNeon 
                  ? 'dark-neon-card border border-slate-700/50' 
                  : 'bg-white border border-gray-200'
              }`}
              style={{ minWidth: '100%' }}>
                {statusOptions.map((option) => (
                  <button
                    key={option}
                    onClick={() => {
                      setStatusFilter(option);
                      setStatusDropdownOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors duration-150 first:rounded-t-lg last:rounded-b-lg whitespace-nowrap ${
                      isNeon
                        ? option === statusFilter
                          ? 'bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 text-cyan-300'
                          : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                        : option === statusFilter
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error Notification */}
      {scanError && (
        <div className={`rounded-lg p-6 mb-6 ${
          isNeon
            ? 'dark-neon-card border border-red-500/30 shadow-lg shadow-red-500/10'
            : `${currentTheme.colors.cardBackground} shadow-sm border border-red-200 bg-red-50`
        }`}>
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                isNeon
                  ? 'bg-gradient-to-br from-red-500/20 to-orange-500/20 border border-red-500/30'
                  : 'bg-red-100'
              }`}>
                <AlertTriangle className={`w-4 h-4 ${
                  isNeon ? 'text-red-400' : 'text-red-600'
                }`} />
              </div>
            </div>
            <div className="flex-1">
              <h3 className={`text-lg font-semibold mb-2 ${
                isNeon ? 'text-white' : 'text-gray-900'
              }`}>
                Scan Failed
              </h3>
              <p className={isNeon ? 'text-slate-300' : 'text-gray-600'}>
                {scanError}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Scan Result Notification */}
      {showScanResult && !scanError && (
        <div className={`rounded-lg p-6 mb-6 ${
          isNeon
            ? 'dark-neon-card border border-cyan-500/30 shadow-lg shadow-cyan-500/10'
            : `${currentTheme.colors.cardBackground} shadow-sm border border-gray-200`
        }`}>
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                isNeon
                  ? 'bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30'
                  : 'bg-blue-100'
              }`}>
                <Search className={`w-4 h-4 ${
                  isNeon ? 'text-cyan-400' : 'text-blue-600'
                }`} />
              </div>
            </div>
            <div className="flex-1">
              <h3 className={`text-lg font-semibold mb-2 ${
                isNeon ? 'text-white' : 'text-gray-900'
              }`}>
                Found {scanResults.length} verification failure emails
              </h3>
              <p className={isNeon ? 'text-slate-300' : 'text-gray-600'}>
                Order numbers and failure reasons extracted from StockX emails.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* StockX Verification Failures Table */}
      {(showScanResult && !scanError && scanResults.length > 0) || manualFailures.length > 0 ? (
        <div className={`rounded-lg overflow-hidden ${
          isNeon
            ? 'dark-neon-card border border-slate-700/50'
            : `${currentTheme.colors.cardBackground} shadow-sm border border-gray-200`
        }`}>
          {/* Table Header */}
          <div className={`px-6 py-4 border-b ${
            isNeon ? 'border-slate-700/50' : 'border-gray-200'
          }`}>
            <div className="flex items-center mb-2">
              <AlertTriangle className={`w-5 h-5 mr-2 ${
                isNeon ? 'text-red-400' : 'text-red-600'
              }`} />
              <h3 className={`text-lg font-semibold ${
                isNeon ? 'text-white' : 'text-gray-900'
              }`}>StockX Verification Failures ({scanResults.length + manualFailures.length})</h3>
            </div>
            <p className={`text-sm ${
              isNeon ? 'text-slate-400' : 'text-gray-500'
            }`}>Found from Gmail scan - "An Update Regarding Your Sale" emails</p>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={`border-b ${
                isNeon 
                  ? 'bg-slate-800/50 border-slate-700/50' 
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <tr>
                  <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                    isNeon ? 'text-slate-300' : 'text-gray-500'
                  }`}>
                    Order Number
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                    isNeon ? 'text-slate-300' : 'text-gray-500'
                  }`}>
                    Product
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                    isNeon ? 'text-slate-300' : 'text-gray-500'
                  }`}>
                    Failure Reason
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                    isNeon ? 'text-slate-300' : 'text-gray-500'
                  }`}>
                    Date
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                    isNeon ? 'text-slate-300' : 'text-gray-500'
                  }`}>
                    Status
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                    isNeon ? 'text-slate-300' : 'text-gray-500'
                  }`}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className={`divide-y ${
                isNeon 
                  ? 'divide-slate-700/50' 
                  : `${currentTheme.colors.cardBackground} divide-gray-200`
              }`}>
                {[...scanResults, ...manualFailures].map((failure, index) => (
                  <tr key={index} className={`transition-colors duration-200 ${
                    isNeon ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50'
                  }`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <a 
                        href={generateGmailSearchUrl(failure.orderNumber)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`text-sm font-medium transition-colors duration-200 ${
                          isNeon 
                            ? 'text-cyan-400 hover:text-cyan-300' 
                            : 'text-blue-600 hover:text-blue-800'
                        }`}
                      >
                        {failure.orderNumber}
                      </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className={`text-sm font-medium ${
                          isNeon ? 'text-white' : 'text-gray-900'
                        }`}>{failure.productName || 'StockX Item'}</div>
                        <div className={`text-sm ${
                          isNeon ? 'text-slate-400' : 'text-gray-500'
                        }`}>{failure.subject || 'An Update Regarding Your Sale'}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                        isNeon 
                          ? 'bg-red-900/30 text-red-400 border border-red-500/30' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        <AlertTriangle className="w-4 h-4 mr-1" />
                        {failure.failureReason || 'Did not pass verification'}
                      </span>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                      isNeon ? 'text-white' : 'text-gray-900'
                    }`}>
                      {failure.date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                        isNeon 
                          ? 'bg-orange-900/30 text-orange-400 border border-orange-500/30' 
                          : 'bg-orange-100 text-orange-800'
                      }`}>
                        <RotateCcw className="w-4 h-4 mr-1" />
                        Needs Review
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {failure.userId ? (
                        <button
                          onClick={() => handleDeleteFailure(failure.id)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            isNeon
                              ? 'hover:bg-red-900/30 text-red-400 hover:text-red-300'
                              : 'hover:bg-red-100 text-red-600 hover:text-red-700'
                          }`}
                          title="Delete failed verification"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : (
                        <span className={`text-sm ${
                          isNeon ? 'text-slate-500' : 'text-gray-400'
                        }`}>Scanned</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Add Failed Verification Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`rounded-lg p-6 max-w-md w-full mx-4 ${
            isNeon
              ? 'dark-neon-card border border-slate-700/50'
              : 'bg-white shadow-xl'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xl font-semibold ${
                isNeon ? 'text-white' : 'text-gray-900'
              }`}>Add Failed Verification</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className={`p-1 rounded-lg transition-colors ${
                  isNeon
                    ? 'hover:bg-slate-800/50 text-slate-400 hover:text-white'
                    : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!user) {
                alert('Please sign in to add failed verifications');
                return;
              }
              
              const formData = new FormData(e.currentTarget);
              const newFailure = {
                userId: user.uid,
                orderNumber: formData.get('orderNumber'),
                productName: formData.get('productName'),
                failureReason: formData.get('failureReason'),
                date: new Date().toLocaleDateString('en-US', { 
                  month: 'numeric', 
                  day: 'numeric', 
                  year: '2-digit' 
                }),
                status: 'Needs Review',
                subject: 'Manual Entry',
                fromEmail: 'manual@entry.com',
                createdAt: new Date().toISOString()
              };
              
              try {
                await addDoc(collection(db, 'failedVerifications'), newFailure);
                setShowAddModal(false);
                e.currentTarget.reset();
              } catch (error) {
                console.error('Error adding failed verification:', error);
                alert('Failed to save verification failure. Please try again.');
              }
            }}>
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${
                    isNeon ? 'text-slate-300' : 'text-gray-700'
                  }`}>Order Number</label>
                  <input
                    type="text"
                    name="orderNumber"
                    required
                    placeholder="e.g. 75553904-75453663"
                    className={`w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 ${
                      isNeon
                        ? 'input-premium text-white placeholder-slate-400 border-slate-600/50 focus:ring-cyan-500'
                        : 'border border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                    }`}
                  />
                </div>
                
                <div>
                  <label className={`block text-sm font-medium mb-1 ${
                    isNeon ? 'text-slate-300' : 'text-gray-700'
                  }`}>Product Name</label>
                  <input
                    type="text"
                    name="productName"
                    required
                    placeholder="e.g. Jordan 4 Retro Black Cat"
                    className={`w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 ${
                      isNeon
                        ? 'input-premium text-white placeholder-slate-400 border-slate-600/50 focus:ring-cyan-500'
                        : 'border border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                    }`}
                  />
                </div>
                
                <div>
                  <label className={`block text-sm font-medium mb-1 ${
                    isNeon ? 'text-slate-300' : 'text-gray-700'
                  }`}>Failure Reason</label>
                  <select
                    name="failureReason"
                    required
                    className={`w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 ${
                      isNeon
                        ? 'input-premium text-white border-slate-600/50 focus:ring-cyan-500 bg-slate-800'
                        : 'border border-gray-300 focus:ring-blue-500 focus:border-blue-500 bg-white'
                    }`}
                  >
                    <option value="Did not pass verification">Did not pass verification</option>
                    <option value="Damaged box">Damaged box</option>
                    <option value="Wrong size">Wrong size</option>
                    <option value="Fake/Replica">Fake/Replica</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    isNeon
                      ? 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 hover:text-white border border-slate-600/50'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 rounded-lg text-white transition-all ${
                    isNeon
                      ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 shadow-lg shadow-cyan-500/25'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  Add Failure
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FailedVerifications; 