'use client';

import { useState } from 'react';
import { Search, Plus, AlertTriangle, Calendar, ChevronDown, RotateCcw, CheckCircle, DollarSign } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

const FailedVerifications = () => {
  const [timeFilter, setTimeFilter] = useState('Monthly');
  const [statusFilter, setStatusFilter] = useState('All Statuses');
  const [isScanning, setIsScanning] = useState(false);
  const [showScanResult, setShowScanResult] = useState(false);
  const { currentTheme } = useTheme();

  const handleScanClick = () => {
    setIsScanning(true);
    setShowScanResult(false);
    
    // Simulate scanning process
    setTimeout(() => {
      setIsScanning(false);
      setShowScanResult(true);
    }, 3000); // 3 second scan simulation
  };

  const monthlyData = [
    { month: 'Jan 2025', rate: '0.0%', failed: 0, total: 0, status: 'No sales' },
    { month: 'Feb 2025', rate: '0.0%', failed: 0, total: 0, status: 'No sales' },
    { month: 'Mar 2025', rate: '0.0%', failed: 0, total: 0, status: 'No sales' },
    { month: 'Apr 2025', rate: '0.0%', failed: 0, total: 0, status: 'No sales' }
  ];

  const statusCards = [
    {
      title: 'Total Failed',
      value: '0',
      icon: AlertTriangle,
      iconColor: 'text-red-600'
    },
    {
      title: 'Pending Returns',
      value: '0',
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
    <div className={`flex-1 ${currentTheme.colors.background} p-8`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Failed Verifications</h1>
          <p className="text-gray-600 mt-1">Track items that failed marketplace verification</p>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={handleScanClick}
            disabled={isScanning}
            className={`flex items-center px-4 py-2 text-white rounded-lg transition-colors ${
              isScanning 
                ? 'bg-blue-500 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            <Search className="w-4 h-4 mr-2" />
            {isScanning ? 'Scanning...' : 'Scan for Verification Failures'}
          </button>
          <button className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4 mr-2" />
            Add Failed Verification
          </button>
        </div>
      </div>

      {/* Main Metrics Section */}
      <div className={`${currentTheme.colors.cardBackground} rounded-lg p-8 shadow-sm border border-gray-200 mb-6`}>
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center">
            <AlertTriangle className="w-6 h-6 text-orange-500 mr-3" />
            <h2 className="text-xl font-semibold text-gray-900">Verification Failure Rate</h2>
          </div>
          <div className="relative">
            <select 
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
              className={`appearance-none ${currentTheme.colors.cardBackground} border border-gray-300 rounded-lg px-4 py-2 pr-8 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 ${currentTheme.colors.primary.replace('bg-', 'focus:ring-')} focus:border-opacity-50`}
            >
              <option>Monthly</option>
              <option>Weekly</option>
              <option>Daily</option>
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Main Stats Row */}
        <div className="grid grid-cols-3 gap-8 mb-6">
          <div className="text-center">
            <div className="text-4xl font-bold text-red-600 mb-2">0.0%</div>
            <div className="text-sm text-gray-500">Overall Rate</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-gray-900 mb-2">0</div>
            <div className="text-sm text-gray-500">Total Failures</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-gray-900 mb-2">10</div>
            <div className="text-sm text-gray-500">Total Sales</div>
          </div>
        </div>

        {/* Current Month Rate */}
        <div className="flex items-center justify-between pt-6 border-t border-gray-200">
          <div>
            <div className="text-2xl font-bold text-gray-900">0.0%</div>
            <div className="text-sm text-gray-500">Current month rate</div>
          </div>
          <div className="text-sm text-gray-500">No change</div>
        </div>
      </div>

      {/* Monthly Breakdown */}
      <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 shadow-sm border border-gray-200 mb-6`}>
        <div className="flex items-center mb-6">
          <Calendar className="w-5 h-5 text-gray-600 mr-2" />
          <h3 className="text-lg font-semibold text-gray-900">Monthly Breakdown</h3>
        </div>

        <div className="space-y-4">
          {monthlyData.map((month, index) => (
            <div key={index} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
              <div className="flex-1">
                <div className="font-medium text-gray-900">{month.month}</div>
                <div className="text-sm text-gray-500">{month.failed} of {month.total} sales failed</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-green-600">{month.rate}</div>
                <div className="text-sm text-gray-500">{month.status}</div>
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
            <div key={index} className={`${currentTheme.colors.cardBackground} rounded-lg p-6 shadow-sm border border-gray-200`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-gray-600">{card.title}</h3>
                <Icon className={`w-5 h-5 ${card.iconColor}`} />
              </div>
              <p className={`text-2xl font-bold ${card.valueColor || 'text-gray-900'}`}>
                {card.value}
              </p>
            </div>
          );
        })}
      </div>

      {/* Search and Filter */}
      <div className="flex items-center justify-between mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search failed verifications..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="ml-4">
          <div className="relative">
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`appearance-none ${currentTheme.colors.cardBackground} border border-gray-300 rounded-lg px-4 py-2 pr-8 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 ${currentTheme.colors.primary.replace('bg-', 'focus:ring-')} focus:border-opacity-50`}
            >
              <option>All Statuses</option>
              <option>Failed</option>
              <option>Pending</option>
              <option>Completed</option>
            </select>
            <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Scan Result Notification */}
      {showScanResult && (
        <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 shadow-sm border border-gray-200 mb-6`}>
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <Search className="w-4 h-4 text-blue-600" />
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Found 10 verification failure emails
              </h3>
              <p className="text-gray-600">
                Order numbers and failure reasons extracted from StockX emails.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* StockX Verification Failures Table */}
      {showScanResult && (
        <div className={`${currentTheme.colors.cardBackground} rounded-lg shadow-sm border border-gray-200 overflow-hidden`}>
          {/* Table Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center mb-2">
              <AlertTriangle className="w-5 h-5 text-red-600 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900">StockX Verification Failures (10)</h3>
            </div>
            <p className="text-sm text-gray-500">Found from Gmail scan - "An Update Regarding Your Sale" emails</p>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Order Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Failure Reason
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className={`${currentTheme.colors.cardBackground} divide-y divide-gray-200`}>
                {[
                  { orderNumber: '75553904-75453663', date: '6/24/2025' },
                  { orderNumber: '75570179-75469938', date: '6/23/2025' },
                  { orderNumber: '75449709-75349468', date: '6/23/2025' },
                  { orderNumber: '75494025-75393784', date: '6/20/2025' },
                  { orderNumber: '75467374-75367133', date: '6/18/2025' },
                  { orderNumber: '75458113-75357872', date: '6/17/2025' },
                  { orderNumber: '75437800-75337559', date: '6/17/2025' },
                  { orderNumber: '75064475-74964234', date: '5/30/2025' }
                ].map((failure, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <a 
                        href={`https://mail.google.com/mail/u/0/#search/"${encodeURIComponent(failure.orderNumber)}"`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        {failure.orderNumber}
                      </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">StockX Item</div>
                        <div className="text-sm text-gray-500">An Update Regarding Your Sale</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
                        <AlertTriangle className="w-4 h-4 mr-1" />
                        Did not pass verification
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {failure.date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800">
                        <RotateCcw className="w-4 h-4 mr-1" />
                        Needs Review
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default FailedVerifications; 