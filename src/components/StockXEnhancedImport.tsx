'use client';

import React, { useState, useEffect } from 'react';
import { 
  Search, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  BarChart3, 
  TrendingUp,
  RefreshCw,
  Play,
  Pause,
  Stop,
  Settings,
  Eye,
  Download,
  AlertCircle,
  Info
} from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';

interface ImportSession {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  currentPhase: string;
  totalSalesImported: number;
  qualityMetrics: {
    totalApiCalls: number;
    rateLimitHits: number;
    timeouts: number;
    dataValidationErrors: number;
  };
  performance: {
    startTime: string;
    averageApiResponseTime: number;
    throughputPerMinute: number;
  };
  coverage: {
    missingDateRanges: Array<{ start: string; end: string }>;
    statusGaps: string[];
  };
}

interface DataQualityReport {
  totalSalesImported: number;
  coveragePercentage: number;
  dataIntegrityIssues: Array<{
    type: string;
    orderNumber: string;
    description: string;
    severity: string;
  }>;
  missingDateRanges: Array<{ start: string; end: string }>;
  performanceMetrics: {
    averageResponseTime: number;
    rateLimitEncounters: number;
    timeoutOccurrences: number;
    retrySuccessRate: number;
  };
}

interface ImportSettings {
  maxConcurrentRequests: number;
  enableDetailedEnrichment: boolean;
  skipValidation: boolean;
  dateRange: {
    start: string;
    end: string;
  } | null;
  auditOnly: boolean;
}

const StockXEnhancedImport: React.FC = () => {
  const { user } = useAuth();
  const [currentSession, setCurrentSession] = useState<ImportSession | null>(null);
  const [auditReport, setAuditReport] = useState<DataQualityReport | null>(null);
  const [validationReport, setValidationReport] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'audit' | 'import' | 'validation' | 'settings'>('overview');
  
  const [settings, setSettings] = useState<ImportSettings>({
    maxConcurrentRequests: 3,
    enableDetailedEnrichment: true,
    skipValidation: false,
    dateRange: null,
    auditOnly: false
  });

  const [logs, setLogs] = useState<Array<{
    timestamp: string;
    level: 'info' | 'warning' | 'error' | 'success';
    message: string;
  }>>([]);

  useEffect(() => {
    // Load any existing session on mount
    loadExistingSession();
  }, []);

  const addLog = (level: 'info' | 'warning' | 'error' | 'success', message: string) => {
    setLogs(prev => [...prev, {
      timestamp: new Date().toLocaleTimeString(),
      level,
      message
    }].slice(-100)); // Keep last 100 logs
  };

  const loadExistingSession = async () => {
    // Implementation to load existing session
    addLog('info', 'Checking for existing import sessions...');
  };

  const runDataAudit = async () => {
    if (!user) {
      setError('Please authenticate first');
      return;
    }

    setIsLoading(true);
    setError(null);
    addLog('info', 'Starting comprehensive data audit...');

    try {
      const response = await fetch('/api/stockx/sales/enhanced-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'audit',
          userId: user.uid
        })
      });

      const data = await response.json();

      if (data.success) {
        setAuditReport(data.audit);
        addLog('success', `Audit completed: ${data.audit.coveragePercentage}% coverage found`);
        
        if (data.audit.dataIntegrityIssues.length > 0) {
          addLog('warning', `Found ${data.audit.dataIntegrityIssues.length} data integrity issues`);
        }
      } else {
        throw new Error(data.error || 'Audit failed');
      }
    } catch (error: any) {
      const errorMsg = error.message || 'Failed to run audit';
      setError(errorMsg);
      addLog('error', errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const startEnhancedImport = async () => {
    if (!user) {
      setError('Please authenticate first');
      return;
    }

    setIsLoading(true);
    setError(null);
    addLog('info', 'Starting enhanced import session...');

    try {
      const response = await fetch('/api/stockx/sales/enhanced-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          userId: user.uid,
          ...settings
        })
      });

      const data = await response.json();

      if (data.success) {
        addLog('success', 'Import session started successfully');
        // Start polling for session updates
        pollSessionStatus(data.sessionId);
      } else {
        throw new Error(data.error || 'Failed to start import');
      }
    } catch (error: any) {
      const errorMsg = error.message || 'Failed to start import';
      setError(errorMsg);
      addLog('error', errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const runDataValidation = async () => {
    if (!user) {
      setError('Please authenticate first');
      return;
    }

    setIsLoading(true);
    setError(null);
    addLog('info', 'Running data validation...');

    try {
      const response = await fetch('/api/stockx/sales/data-validator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          validationType: 'comprehensive',
          autoFix: false,
          generateReport: true
        })
      });

      const data = await response.json();

      if (data.success) {
        setValidationReport(data.validation);
        addLog('success', `Validation completed: ${data.summary.qualityScore}% quality score`);
        
        if (data.summary.criticalIssues > 0) {
          addLog('error', `Found ${data.summary.criticalIssues} critical issues requiring immediate attention`);
        }
        if (data.summary.highPriorityIssues > 0) {
          addLog('warning', `Found ${data.summary.highPriorityIssues} high priority issues`);
        }
      } else {
        throw new Error(data.error || 'Validation failed');
      }
    } catch (error: any) {
      const errorMsg = error.message || 'Failed to run validation';
      setError(errorMsg);
      addLog('error', errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const pollSessionStatus = async (sessionId: string) => {
    // Implementation for polling session status
    addLog('info', `Monitoring session ${sessionId}...`);
  };

  const renderOverviewTab = () => (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white/5 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Data Coverage</p>
              <p className="text-2xl font-bold text-white">
                {auditReport ? `${auditReport.coveragePercentage}%` : '-'}
              </p>
            </div>
            <BarChart3 className="w-8 h-8 text-blue-400" />
          </div>
        </div>

        <div className="bg-white/5 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Quality Score</p>
              <p className="text-2xl font-bold text-white">
                {validationReport ? `${validationReport.dataQualityScore}%` : '-'}
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-400" />
          </div>
        </div>

        <div className="bg-white/5 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Total Sales</p>
              <p className="text-2xl font-bold text-white">
                {auditReport ? auditReport.totalSalesImported.toLocaleString() : '-'}
              </p>
            </div>
            <CheckCircle className="w-8 h-8 text-cyan-400" />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={runDataAudit}
          disabled={isLoading}
          className="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
        >
          <Search className="w-5 h-5" />
          <span>Run Data Audit</span>
        </button>

        <button
          onClick={runDataValidation}
          disabled={isLoading}
          className="bg-green-600 hover:bg-green-700 text-white p-4 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
        >
          <CheckCircle className="w-5 h-5" />
          <span>Validate Data</span>
        </button>

        <button
          onClick={startEnhancedImport}
          disabled={isLoading}
          className="bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
        >
          <Play className="w-5 h-5" />
          <span>Start Import</span>
        </button>
      </div>

      {/* Current Issues */}
      {(auditReport?.dataIntegrityIssues.length > 0 || validationReport?.validationErrors.length > 0) && (
        <div className="bg-white/5 border border-orange-500/30 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
            <AlertTriangle className="w-5 h-5 text-orange-400 mr-2" />
            Data Issues Detected
          </h3>
          <div className="space-y-2">
            {auditReport?.dataIntegrityIssues.slice(0, 3).map((issue, index) => (
              <div key={index} className="flex items-center justify-between text-sm">
                <span className="text-gray-300">{issue.description}</span>
                <span className={`px-2 py-1 rounded text-xs ${
                  issue.severity === 'high' ? 'bg-red-500/20 text-red-400' :
                  issue.severity === 'medium' ? 'bg-orange-500/20 text-orange-400' :
                  'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {issue.severity}
                </span>
              </div>
            ))}
            {auditReport && auditReport.dataIntegrityIssues.length > 3 && (
              <p className="text-sm text-gray-400">
                +{auditReport.dataIntegrityIssues.length - 3} more issues...
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderAuditTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-white">Data Completeness Audit</h3>
        <button
          onClick={runDataAudit}
          disabled={isLoading}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-2"
        >
          <Search className="w-4 h-4" />
          <span>Run Audit</span>
        </button>
      </div>

      {auditReport && (
        <div className="space-y-4">
          {/* Coverage Summary */}
          <div className="bg-white/5 border border-gray-700 rounded-lg p-4">
            <h4 className="text-lg font-semibold text-white mb-3">Coverage Summary</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-400">Dashboard Total</p>
                <p className="text-xl font-bold text-white">
                  {auditReport.totalSalesInDashboard?.toLocaleString() || 'Unknown'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Imported</p>
                <p className="text-xl font-bold text-white">
                  {auditReport.totalSalesImported.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Coverage</p>
                <p className="text-xl font-bold text-white">
                  {auditReport.coveragePercentage}%
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Issues</p>
                <p className="text-xl font-bold text-white">
                  {auditReport.dataIntegrityIssues.length}
                </p>
              </div>
            </div>
          </div>

          {/* Missing Date Ranges */}
          {auditReport.missingDateRanges.length > 0 && (
            <div className="bg-white/5 border border-gray-700 rounded-lg p-4">
              <h4 className="text-lg font-semibold text-white mb-3">Missing Date Ranges</h4>
              <div className="space-y-2">
                {auditReport.missingDateRanges.map((range, index) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <span className="text-gray-300">
                      {new Date(range.start).toLocaleDateString()} - {new Date(range.end).toLocaleDateString()}
                    </span>
                    <span className="text-orange-400">Gap detected</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Performance Metrics */}
          <div className="bg-white/5 border border-gray-700 rounded-lg p-4">
            <h4 className="text-lg font-semibold text-white mb-3">Performance Metrics</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-400">Avg Response Time</p>
                <p className="text-lg font-semibold text-white">
                  {auditReport.performanceMetrics.averageResponseTime}ms
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Rate Limits</p>
                <p className="text-lg font-semibold text-white">
                  {auditReport.performanceMetrics.rateLimitEncounters}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Timeouts</p>
                <p className="text-lg font-semibold text-white">
                  {auditReport.performanceMetrics.timeoutOccurrences}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Success Rate</p>
                <p className="text-lg font-semibold text-white">
                  {auditReport.performanceMetrics.retrySuccessRate}%
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderValidationTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-white">Data Quality Validation</h3>
        <button
          onClick={runDataValidation}
          disabled={isLoading}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-2"
        >
          <CheckCircle className="w-4 h-4" />
          <span>Run Validation</span>
        </button>
      </div>

      {validationReport && (
        <div className="space-y-4">
          {/* Quality Score */}
          <div className="bg-white/5 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-white">Data Quality Score</h4>
              <div className="text-3xl font-bold text-white">
                {validationReport.dataQualityScore}%
              </div>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-3">
              <div 
                className={`h-3 rounded-full transition-all duration-500 ${
                  validationReport.dataQualityScore >= 90 ? 'bg-green-500' :
                  validationReport.dataQualityScore >= 70 ? 'bg-yellow-500' :
                  'bg-red-500'
                }`}
                style={{ width: `${validationReport.dataQualityScore}%` }}
              />
            </div>
          </div>

          {/* Validation Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white/5 border border-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-400">Total Records</p>
              <p className="text-2xl font-bold text-white">
                {validationReport.totalRecords.toLocaleString()}
              </p>
            </div>
            <div className="bg-white/5 border border-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-400">Valid Records</p>
              <p className="text-2xl font-bold text-green-400">
                {validationReport.validRecords.toLocaleString()}
              </p>
            </div>
            <div className="bg-white/5 border border-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-400">Invalid Records</p>
              <p className="text-2xl font-bold text-red-400">
                {validationReport.invalidRecords.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Validation Errors */}
          {validationReport.validationErrors.length > 0 && (
            <div className="bg-white/5 border border-gray-700 rounded-lg p-4">
              <h4 className="text-lg font-semibold text-white mb-3">
                Validation Errors ({validationReport.validationErrors.length})
              </h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {validationReport.validationErrors.slice(0, 20).map((error: any, index: number) => (
                  <div key={index} className="flex items-start justify-between text-sm border-b border-gray-700 pb-2">
                    <div className="flex-1">
                      <p className="text-gray-300">{error.description}</p>
                      <p className="text-xs text-gray-500">
                        {error.orderNumber ? `Order: ${error.orderNumber}` : `Record: ${error.recordId}`} • 
                        Field: {error.field}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs ml-2 ${
                      error.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                      error.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                      error.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {error.severity}
                    </span>
                  </div>
                ))}
                {validationReport.validationErrors.length > 20 && (
                  <p className="text-sm text-gray-400 pt-2">
                    +{validationReport.validationErrors.length - 20} more errors...
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderLogsSection = () => (
    <div className="bg-white/5 border border-gray-700 rounded-lg p-4">
      <h4 className="text-lg font-semibold text-white mb-3">Activity Logs</h4>
      <div className="max-h-48 overflow-y-auto space-y-1">
        {logs.map((log, index) => (
          <div key={index} className="flex items-start space-x-2 text-sm">
            <span className="text-gray-500 text-xs mt-0.5 w-16 shrink-0">
              {log.timestamp}
            </span>
            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
              log.level === 'success' ? 'bg-green-400' :
              log.level === 'warning' ? 'bg-yellow-400' :
              log.level === 'error' ? 'bg-red-400' :
              'bg-blue-400'
            }`} />
            <span className={`${
              log.level === 'success' ? 'text-green-400' :
              log.level === 'warning' ? 'text-yellow-400' :
              log.level === 'error' ? 'text-red-400' :
              'text-gray-300'
            }`}>
              {log.message}
            </span>
          </div>
        ))}
        {logs.length === 0 && (
          <p className="text-gray-500 text-sm">No activity logs yet</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Enhanced StockX Import</h1>
          <p className="text-gray-400">Comprehensive data extraction with quality assurance</p>
        </div>
        {isLoading && (
          <div className="flex items-center space-x-2 text-blue-400">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Processing...</span>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-red-400 font-medium">Error</p>
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="border-b border-gray-700">
        <nav className="flex space-x-8">
          {[
            { id: 'overview', label: 'Overview', icon: Eye },
            { id: 'audit', label: 'Data Audit', icon: Search },
            { id: 'validation', label: 'Validation', icon: CheckCircle },
            { id: 'import', label: 'Import', icon: Download },
            { id: 'settings', label: 'Settings', icon: Settings }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-400 hover:text-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'audit' && renderAuditTab()}
        {activeTab === 'validation' && renderValidationTab()}
        {activeTab === 'import' && (
          <div className="text-center py-12">
            <p className="text-gray-400">Import functionality coming soon...</p>
          </div>
        )}
        {activeTab === 'settings' && (
          <div className="text-center py-12">
            <p className="text-gray-400">Settings panel coming soon...</p>
          </div>
        )}
      </div>

      {/* Activity Logs */}
      {renderLogsSection()}
    </div>
  );
};

export default StockXEnhancedImport;
