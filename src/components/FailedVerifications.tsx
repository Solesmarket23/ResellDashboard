'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Plus, AlertTriangle, Calendar, ChevronDown, RotateCcw, CheckCircle, DollarSign, X, Trash2, Users, TrendingUp, TrendingDown, RefreshCw, Mail, Settings, Package, Truck } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { generateGmailSearchUrl } from '../lib/utils/orderNumberUtils';
import { useAuth } from '../lib/contexts/AuthContext';
import { db } from '../lib/firebase/firebase';
import { collection, query, where, onSnapshot, doc, getDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { addDocument, deleteDocument } from '../lib/firebase/firebaseUtils';
import { getCommunityAggregates, calculateUserPercentile, contributeFailureData } from '../lib/firebase/communityInsights';
import { FailedVerification, VerificationStatus } from '../types/failed-verification';
import { StatusBadge } from './failed-verifications/StatusBadge';
import { QuickActions } from './failed-verifications/QuickActions';
import { STATUS_LABELS } from '../lib/verification-status';

const FailedVerifications = () => {
  const [timeFilter, setTimeFilter] = useState('Monthly');
  const [statusFilter, setStatusFilter] = useState('All Statuses');
  const [isScanning, setIsScanning] = useState(false);
  const [showScanResult, setShowScanResult] = useState(false);
  const [timeDropdownOpen, setTimeDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [scanResults, setScanResults] = useState<any[]>([]);
  const [manualFailures, setManualFailures] = useState<FailedVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanError, setScanError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [communityInsightsEnabled, setCommunityInsightsEnabled] = useState(false);
  const [communityData, setCommunityData] = useState<any>(null);

  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [showEmailSettings, setShowEmailSettings] = useState(false);
  const [emailLoaded, setEmailLoaded] = useState(false);

  const [scanStatus, setScanStatus] = useState<'scanning' | 'saving' | 'complete' | null>(null);
  const [scanProgress, setScanProgress] = useState({ found: 0, saved: 0, message: '' });
  const [verificationStatusFilter, setVerificationStatusFilter] = useState<VerificationStatus | 'all'>('all');
  const [isMigrating, setIsMigrating] = useState(false);
  const { currentTheme } = useTheme();
  const { user, loading: authLoading } = useAuth();
  
  // Dynamic theme detection for consistent neon styling
  const isNeon = currentTheme.name === 'Neon';

  const timeOptions = ['Monthly', 'Weekly', 'Daily'];
  const statusOptions = ['All Statuses', 'Failed', 'Pending', 'Completed'];
  
  const timeDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  // Load test email from localStorage
  useEffect(() => {
    let savedTestEmail = localStorage.getItem('returnRequestTestEmail');
    console.log('Loading test email from localStorage:', savedTestEmail);
    
    // If not found, check common locations where it might be stored
    if (!savedTestEmail) {
      // Check if it's stored under a different key
      const possibleKeys = ['testEmail', 'test-email', 'returnEmail'];
      for (const key of possibleKeys) {
        const value = localStorage.getItem(key);
        if (value && value.includes('@')) {
          console.log(`Found test email under key '${key}':`, value);
          savedTestEmail = value;
          // Migrate to standard key
          localStorage.setItem('returnRequestTestEmail', value);
          break;
        }
      }
    }
    
    if (savedTestEmail) {
      setTestEmail(savedTestEmail);
      console.log('Test email set to:', savedTestEmail);
    } else {
      // If still not found, prompt user to set it
      console.log('No test email found in localStorage');
      setTestEmail('');
    }
    setEmailLoaded(true);
  }, []);

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
      console.log('🔍 No user found, skipping Firebase load');
      setLoading(false);
      return;
    }

    console.log('🔍 Loading failed verifications for user:', user.uid);
    const failedVerificationsRef = collection(db, 'user_failed_verifications');
    const q = query(failedVerificationsRef, where('userId', '==', user.uid));

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const failures = snapshot.docs.map(doc => {
          const data = doc.data();
          // Convert old status format to new format
          let status = data.status || 'needs_review';
          if (status === 'Needs Review') {
            status = 'needs_review';
          }
          return {
            id: doc.id,
            ...data,
            status: status
          };
        }) as FailedVerification[];
        console.log('📊 Loaded failed verifications from Firebase:', failures.length);
        setManualFailures(failures);
        setLoading(false);
      },
      (error) => {
        console.error('❌ Error loading failed verifications:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Load user's community insights preference and data
  useEffect(() => {
    const loadCommunityInsights = async () => {
      if (!user) return;

      try {
        // Check if user has opted in
        const userRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const isOptedIn = userData.communityInsights?.shareData || false;
          setCommunityInsightsEnabled(isOptedIn);
          
          if (isOptedIn) {
            // Load current month's community data
            const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
            const aggregates = await getCommunityAggregates(currentMonth);
            setCommunityData(aggregates);
          }
        }
      } catch (error) {
        console.error('Error loading community insights:', error);
      }
    };

    loadCommunityInsights();
  }, [user]);


  const handleDeleteFailure = async (failureId: string) => {
    try {
      console.log('🗑️ Attempting to delete failed verification:', failureId);
      await deleteDocument('user_failed_verifications', failureId);
      console.log('✅ Successfully deleted failed verification');
    } catch (error) {
      console.error('❌ Error deleting failed verification:', error);
      alert('Failed to delete verification failure.');
    }
  };

  // Run migration for existing data
  const runMigration = async () => {
    if (!user) return;
    
    setIsMigrating(true);
    try {
      const response = await fetch('/api/migrate-failed-verifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user.uid }),
      });

      if (!response.ok) {
        throw new Error('Failed to migrate data');
      }

      const data = await response.json();
      console.log('✅ Migration complete:', data);
      
      if (data.migratedDocuments > 0) {
        alert(`Successfully migrated ${data.migratedDocuments} verification failures to the new status tracking system!`);
      }
    } catch (error) {
      console.error('❌ Error running migration:', error);
      alert('Failed to migrate data. Please try again.');
    } finally {
      setIsMigrating(false);
    }
  };

  // Function to group failures by month
  const groupFailuresByMonth = (failures: any[]) => {
    const monthGroups: { [key: string]: number } = {};
    
    failures.forEach(failure => {
      let date: Date;
      
      // Handle different date formats
      if (failure.emailDate) {
        // Scanned results have emailDate in ISO format
        date = new Date(failure.emailDate);
      } else if (failure.date) {
        // Manual entries have date in "M/D/YY" format
        const [month, day, year] = failure.date.split('/');
        date = new Date(2000 + parseInt(year), parseInt(month) - 1, parseInt(day));
      } else if (failure.createdAt) {
        // Fallback to createdAt
        date = new Date(failure.createdAt);
      } else {
        // Skip if no valid date
        return;
      }
      
      // Format as "Mon YYYY"
      const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      monthGroups[monthKey] = (monthGroups[monthKey] || 0) + 1;
    });
    
    // Convert to array and sort by date (newest first)
    return Object.entries(monthGroups)
      .map(([month, count]) => ({
        month,
        failed: count,
        date: new Date(month)
      }))
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .map(({ month, failed }) => ({
        month,
        failed,
        rate: '--',
        total: '--',
        status: `${failed} failure${failed !== 1 ? 's' : ''}`
      }));
  };

  const handleScanClick = async () => {
    console.log('🔍 Scan button clicked');
    setIsScanning(true);
    setShowScanResult(false);
    setScanError(null);
    setScanResults([]);
    setScanStatus('scanning');
    setScanProgress({ found: 0, saved: 0, message: 'Scanning your Gmail for verification failures...' });
    
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
      
      const failures = data.failures || [];
      setScanResults(failures);
      setShowScanResult(true);
      console.log('🔍 Scan complete, found', failures.length, 'results');
      
      // Update progress
      setScanProgress({ found: failures.length, saved: 0, message: `Found ${failures.length} verification failure${failures.length !== 1 ? 's' : ''}` });
      
      // Clear previous scan results to avoid duplicates in the UI
      setScanResults([]);
      
      // Save scanned results to Firebase
      if (failures.length > 0 && user) {
        setScanStatus('saving');
        setScanProgress({ found: failures.length, saved: 0, message: 'Saving to your account...' });
        console.log('💾 Saving scanned results to Firebase...');
        let savedCount = 0;
        
        // Create a Set to track order numbers that already exist or have been saved
        const existingOrderNumbers = new Set(manualFailures.map(f => f.orderNumber));
        
        for (const failure of failures) {
          try {
            // Check if this failure already exists or has been saved in this batch
            if (!existingOrderNumbers.has(failure.orderNumber)) {
              // Add to the set immediately to prevent duplicates in the same batch
              existingOrderNumbers.add(failure.orderNumber);
              const timestamp = new Date().toISOString();
              const failureToSave: Partial<FailedVerification> = {
                userId: user.uid,
                orderNumber: failure.orderNumber,
                productName: failure.productName || 'StockX Item',
                failureReason: failure.failureReason || 'Did not pass verification',
                date: failure.date,
                emailDate: failure.emailDate,
                status: 'needs_review',
                subject: failure.subject || 'An Update Regarding Your Sale',
                fromEmail: failure.fromEmail || 'stockx@stockx.com',
                source: 'gmail_scan',
                createdAt: timestamp,
                statusHistory: [{
                  status: 'needs_review',
                  timestamp: timestamp,
                  note: 'Imported from Gmail scan'
                }],
                lastStatusUpdate: timestamp
              };
              
              await addDocument('user_failed_verifications', failureToSave);
              savedCount++;
              setScanProgress({ found: failures.length, saved: savedCount, message: `Saving... (${savedCount}/${failures.length})` });
            }
          } catch (error) {
            console.error('❌ Error saving scanned failure:', error);
          }
        }
        
        console.log(`✅ Saved ${savedCount} new failures to Firebase`);
        setScanStatus('complete');
        if (savedCount > 0) {
          setScanProgress({ 
            found: failures.length, 
            saved: savedCount, 
            message: `Successfully saved ${savedCount} new verification failure${savedCount !== 1 ? 's' : ''}!` 
          });
        } else {
          setScanProgress({ 
            found: failures.length, 
            saved: 0, 
            message: 'All failures were already saved.' 
          });
        }
      } else if (failures.length === 0) {
        setScanStatus('complete');
        setScanProgress({ found: 0, saved: 0, message: 'No new verification failures found.' });
      }
      
      // Auto-close modal after 3 seconds if complete
      setTimeout(() => {
        setScanStatus(null);
      }, 3000);
    } catch (error) {
      console.error('🔍 Error scanning verification failures:', error);
      setScanError(error instanceof Error ? error.message : 'Failed to scan');
      setScanStatus('complete');
      setScanProgress({ found: 0, saved: 0, message: 'Scan failed. Please try again.' });
      setTimeout(() => {
        setScanStatus(null);
      }, 3000);
    } finally {
      setIsScanning(false);
    }
  };



  // Only use manualFailures which includes all saved failures
  const allFailures = manualFailures;
  
  // Filter by status if needed
  const filteredFailures = verificationStatusFilter === 'all' 
    ? allFailures 
    : allFailures.filter(f => f.status === verificationStatusFilter);
  
  const totalFailures = allFailures.length;
  
  // Calculate status counts
  const statusCounts = allFailures.reduce((acc, failure) => {
    acc[failure.status] = (acc[failure.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Calculate aging alerts
  const agingAlerts = allFailures.filter(v => {
    const daysSinceUpdate = Math.floor(
      (Date.now() - new Date(v.lastStatusUpdate || v.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    return (
      (v.status === 'email_sent' && daysSinceUpdate > 5) ||
      (v.status === 'shipped_back' && daysSinceUpdate > 10) ||
      (v.status === 'label_received' && daysSinceUpdate > 7)
    );
  });
  
  // Calculate monthly breakdown dynamically
  const monthlyData = groupFailuresByMonth(allFailures);
  
  // Handle sending return request email
  const handleSendReturnRequest = async (failure: any) => {
    if (!testEmail) {
      alert('Please set a test email address first (click the settings icon)');
      setShowEmailSettings(true);
      return;
    }

    setSendingEmail(failure.id);
    
    try {
      const response = await fetch('/api/gmail/send-return-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderNumber: failure.orderNumber,
          productName: failure.productName || 'StockX Item',
          recipientEmail: testEmail
        })
      });

      const data = await response.json();

      if (response.ok) {
        alert(`Return request email sent to ${testEmail}`);
      } else {
        if (response.status === 403) {
          alert('Gmail send permission not granted. Please reconnect your Gmail account.');
          // Optionally redirect to Gmail auth
          window.location.href = '/api/gmail/auth';
        } else {
          alert(`Failed to send email: ${data.error}`);
        }
      }
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Failed to send email. Please try again.');
    } finally {
      setSendingEmail(null);
    }
  };

  // Save test email to localStorage
  const saveTestEmail = (email: string) => {
    console.log('Saving test email:', email);
    setTestEmail(email);
    localStorage.setItem('returnRequestTestEmail', email);
  };

  // If no data, show placeholder
  const displayMonthlyData = monthlyData.length > 0 ? monthlyData : [
    { month: 'No data', rate: '--', failed: 0, total: '--', status: 'No failures recorded' }
  ];
  
  // Get current month failures
  const currentMonth = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const currentMonthData = monthlyData.find(m => m.month === currentMonth);
  const currentMonthFailures = currentMonthData ? currentMonthData.failed : 0;
  
  const statusCards = [
    {
      title: 'Total Failed',
      value: totalFailures.toString(),
      icon: AlertTriangle,
      iconColor: 'text-red-600'
    },
    {
      title: 'Awaiting Action',
      value: (statusCounts['needs_review'] || 0).toString(),
      icon: RotateCcw,
      iconColor: 'text-orange-600'
    },
    {
      title: 'In Progress',
      value: ((statusCounts['email_sent'] || 0) + 
              (statusCounts['label_received'] || 0) + 
              (statusCounts['shipped_back'] || 0)).toString(),
      icon: Package,
      iconColor: 'text-blue-600'
    },
    {
      title: 'Aging Alerts',
      value: agingAlerts.length.toString(),
      icon: AlertTriangle,
      iconColor: 'text-yellow-600',
      valueColor: agingAlerts.length > 0 ? 'text-yellow-600' : ''
    }
  ];

  // Contribute data when failures change (if opted in)
  useEffect(() => {
    if (!user || !communityInsightsEnabled) return;

    const contributeData = async () => {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const monthlyFailures = groupFailuresByMonth(allFailures);
      const currentMonthData = monthlyFailures.find(m => {
        const monthDate = new Date(m.month);
        const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
        return monthKey === currentMonth;
      });

      if (currentMonthData) {
        await contributeFailureData(user.uid, currentMonth, currentMonthData.failed);
      }
    };

    contributeData();
  }, [user, communityInsightsEnabled, scanResults, manualFailures]);

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className={`flex-1 p-8 ${
        isNeon 
          ? 'bg-slate-950' 
          : currentTheme.colors.background
      }`}>
        <div className="flex items-center justify-center h-64">
          <div className={`text-lg ${isNeon ? 'text-slate-400' : 'text-gray-600'}`}>
            Loading...
          </div>
        </div>
      </div>
    );
  }

  // Show auth prompt if no user
  if (!user && !authLoading) {
    return (
      <div className={`flex-1 p-8 ${
        isNeon 
          ? 'bg-slate-950' 
          : currentTheme.colors.background
      }`}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertTriangle className={`w-12 h-12 mx-auto mb-4 ${
              isNeon ? 'text-orange-400' : 'text-orange-500'
            }`} />
            <h2 className={`text-xl font-semibold mb-2 ${
              isNeon ? 'text-white' : 'text-gray-900'
            }`}>
              Sign In Required
            </h2>
            <p className={`mb-4 ${
              isNeon ? 'text-slate-400' : 'text-gray-600'
            }`}>
              Please sign in to save and view your failed verifications
            </p>
            <div className="space-y-2">
              <a
                href="/login"
                className={`inline-block px-6 py-2 rounded-lg text-white transition-all ${
                  isNeon
                    ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                Sign In
              </a>
              <p className={`text-sm ${
                isNeon ? 'text-slate-500' : 'text-gray-500'
              }`}>
                or add <code className="bg-gray-800 px-2 py-1 rounded">?testMode=true</code> to the URL for demo mode
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
            onClick={() => setShowEmailSettings(!showEmailSettings)}
            className={`p-2 rounded-lg transition-all duration-300 ${
              isNeon
                ? showEmailSettings
                  ? 'bg-cyan-500/20 text-cyan-400'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-cyan-400'
                : showEmailSettings
                  ? 'bg-blue-100 text-blue-600'
                  : 'hover:bg-gray-100 text-gray-600 hover:text-blue-600'
            }`}
            title="Email settings"
          >
            <Settings className="w-5 h-5" />
          </button>
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
          
          {/* Migration button - only show if there are unmigrated items */}
          {totalFailures > 0 && allFailures.some(f => !f.statusHistory) && (
            <button 
              onClick={runMigration}
              disabled={isMigrating}
              className={`flex items-center px-4 py-2 text-white rounded-lg transition-all duration-300 ${
                isNeon
                  ? isMigrating 
                    ? 'bg-gradient-to-r from-purple-500/50 to-pink-500/50 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-lg shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/40'
                  : isMigrating 
                    ? 'bg-purple-500 cursor-not-allowed' 
                    : 'bg-purple-600 hover:bg-purple-700'
              }`}
              title="Upgrade your data to enable status tracking"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isMigrating ? 'animate-spin' : ''}`} />
              {isMigrating ? 'Migrating...' : 'Enable Status Tracking'}
            </button>
          )}
        </div>
      </div>

      {/* Main Metrics Section */}
      <div className={`rounded-lg p-8 mb-6 overflow-visible ${
        isNeon
          ? 'dark-neon-card border border-slate-700/50'
          : `${currentTheme.colors.cardBackground} shadow-sm border border-gray-200`
      }`}
      style={{ minHeight: '280px' }}>
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center">
            <AlertTriangle className={`w-6 h-6 mr-3 ${
              isNeon ? 'text-orange-400' : 'text-orange-500'
            }`} />
            <h2 className={`text-xl font-semibold ${
              isNeon ? 'text-white' : 'text-gray-900'
            }`}>Verification Failure Rate</h2>
          </div>
          <div className="relative" ref={timeDropdownRef}>
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
              currentMonthFailures > 0
                ? isNeon ? 'text-red-400' : 'text-red-600'
                : isNeon ? 'text-white' : 'text-gray-900'
            }`}>{currentMonthFailures}</div>
            <div className={`text-sm ${
              isNeon ? 'text-slate-400' : 'text-gray-500'
            }`}>Current month failures</div>
          </div>
          <div className={`text-sm ${
            isNeon ? 'text-slate-400' : 'text-gray-500'
          }`}>{currentMonth}</div>
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
          {displayMonthlyData.map((month, index) => (
            <div key={index} className={`flex items-center justify-between py-3 border-b last:border-b-0 ${
              isNeon ? 'border-slate-700/50' : 'border-gray-100'
            }`}>
              <div className="flex-1">
                <div className={`font-medium ${
                  isNeon ? 'text-white' : 'text-gray-900'
                }`}>{month.month}</div>
                <div className={`text-sm ${
                  isNeon ? 'text-slate-400' : 'text-gray-500'
                }`}>{month.status}</div>
              </div>
              <div className="text-right">
                <div className={`text-lg font-bold ${
                  month.failed > 0 
                    ? isNeon ? 'text-red-400' : 'text-red-600'
                    : isNeon ? 'text-slate-400' : 'text-gray-400'
                }`}>{month.failed}</div>
                <div className={`text-sm ${
                  isNeon ? 'text-slate-400' : 'text-gray-500'
                }`}>failures</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Community Insights Card */}
      {communityInsightsEnabled && communityData && (
        <div className={`rounded-lg p-6 mb-6 ${
          isNeon
            ? 'dark-neon-card border border-slate-700/50'
            : `${currentTheme.colors.cardBackground} shadow-sm border border-gray-200`
        }`}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <Users className={`w-5 h-5 mr-2 ${
                isNeon ? 'text-cyan-400' : 'text-blue-600'
              }`} />
              <h3 className={`text-lg font-semibold ${
                isNeon ? 'text-white' : 'text-gray-900'
              }`}>Community Insights</h3>
            </div>
            <div className={`text-sm ${
              isNeon ? 'text-slate-400' : 'text-gray-500'
            }`}>
              {communityData.totalUsers} users contributing
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Community Average */}
            <div className={`p-4 rounded-lg ${
              isNeon 
                ? 'bg-slate-800/50 border border-slate-700/50' 
                : 'bg-gray-50 border border-gray-200'
            }`}>
              <div className={`text-sm font-medium mb-2 ${
                isNeon ? 'text-slate-300' : 'text-gray-600'
              }`}>Community Average</div>
              <div className={`text-2xl font-bold ${
                isNeon ? 'text-white' : 'text-gray-900'
              }`}>
                {communityData.avgFailureRate ? `${communityData.avgFailureRate.toFixed(1)}%` : '--'}
              </div>
              <div className={`text-sm mt-1 ${
                isNeon ? 'text-slate-400' : 'text-gray-500'
              }`}>failure rate</div>
            </div>

            {/* Your Percentile */}
            <div className={`p-4 rounded-lg ${
              isNeon 
                ? 'bg-slate-800/50 border border-slate-700/50' 
                : 'bg-gray-50 border border-gray-200'
            }`}>
              <div className={`text-sm font-medium mb-2 ${
                isNeon ? 'text-slate-300' : 'text-gray-600'
              }`}>Your Performance</div>
              <div className="flex items-center">
                <div className={`text-2xl font-bold mr-2 ${
                  isNeon ? 'text-white' : 'text-gray-900'
                }`}>
                  {(() => {
                    const currentRate = totalFailures > 0 ? 0 : 0; // Calculate actual rate when sales data is available
                    const percentile = calculateUserPercentile(currentRate, communityData);
                    return `Top ${percentile}%`;
                  })()}
                </div>
                {(() => {
                  const currentRate = totalFailures > 0 ? 0 : 0;
                  const isAboveAverage = currentRate < (communityData.avgFailureRate || 0);
                  return isAboveAverage ? (
                    <TrendingUp className={`w-5 h-5 ${
                      isNeon ? 'text-emerald-400' : 'text-green-600'
                    }`} />
                  ) : (
                    <TrendingDown className={`w-5 h-5 ${
                      isNeon ? 'text-red-400' : 'text-red-600'
                    }`} />
                  );
                })()}
              </div>
              <div className={`text-sm mt-1 ${
                isNeon ? 'text-slate-400' : 'text-gray-500'
              }`}>
                {(() => {
                  const currentRate = totalFailures > 0 ? 0 : 0;
                  const isAboveAverage = currentRate < (communityData.avgFailureRate || 0);
                  return isAboveAverage ? 'Better than average' : 'Below average';
                })()}
              </div>
            </div>

            {/* Median Rate */}
            <div className={`p-4 rounded-lg ${
              isNeon 
                ? 'bg-slate-800/50 border border-slate-700/50' 
                : 'bg-gray-50 border border-gray-200'
            }`}>
              <div className={`text-sm font-medium mb-2 ${
                isNeon ? 'text-slate-300' : 'text-gray-600'
              }`}>Median Rate</div>
              <div className={`text-2xl font-bold ${
                isNeon ? 'text-white' : 'text-gray-900'
              }`}>
                {communityData.medianFailureRate ? `${communityData.medianFailureRate.toFixed(1)}%` : '--'}
              </div>
              <div className={`text-sm mt-1 ${
                isNeon ? 'text-slate-400' : 'text-gray-500'
              }`}>50th percentile</div>
            </div>
          </div>

          <div className={`mt-4 pt-4 border-t ${
            isNeon ? 'border-slate-700/50' : 'border-gray-200'
          }`}>
            <p className={`text-sm ${
              isNeon ? 'text-slate-400' : 'text-gray-500'
            }`}>
              <span className="font-medium">Note:</span> Community data is aggregated anonymously from users who opt-in to share their metrics. Your individual data remains private.
            </p>
          </div>
        </div>
      )}

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

      {/* Status Filter Tabs */}
      <div className={`border-b mb-6 ${isNeon ? 'border-slate-700/50' : 'border-gray-200'}`}>
        <nav className="-mb-px flex space-x-8 overflow-x-auto">
          <button
            onClick={() => setVerificationStatusFilter('all')}
            className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
              verificationStatusFilter === 'all'
                ? isNeon 
                  ? 'border-cyan-400 text-cyan-400'
                  : 'border-blue-500 text-blue-600'
                : isNeon
                  ? 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            All ({totalFailures})
          </button>
          {Object.entries(STATUS_LABELS).map(([status, label]) => (
            <button
              key={status}
              onClick={() => setVerificationStatusFilter(status as VerificationStatus)}
              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                verificationStatusFilter === status
                  ? isNeon 
                    ? 'border-cyan-400 text-cyan-400'
                    : 'border-blue-500 text-blue-600'
                  : isNeon
                    ? 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {label} ({statusCounts[status] || 0})
            </button>
          ))}
        </nav>
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
      {manualFailures.length > 0 ? (
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
              }`}>StockX Verification Failures ({manualFailures.length})</h3>
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
                {filteredFailures.map((failure, index) => (
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
                      <div className="flex items-center gap-2">
                        <StatusBadge 
                          status={(failure.status === 'Needs Review' ? 'needs_review' : failure.status) || 'needs_review'} 
                          showTimestamp={failure.lastStatusUpdate !== failure.createdAt}
                          timestamp={failure.lastStatusUpdate}
                        />
                        {(() => {
                          const daysSinceUpdate = Math.floor(
                            (Date.now() - new Date(failure.lastStatusUpdate || failure.createdAt).getTime()) / (1000 * 60 * 60 * 24)
                          );
                          const showAgingAlert = 
                            (failure.status === 'email_sent' && daysSinceUpdate > 5) ||
                            (failure.status === 'shipped_back' && daysSinceUpdate > 10) ||
                            (failure.status === 'label_received' && daysSinceUpdate > 7);
                          
                          return showAgingAlert ? (
                            <div className="group relative">
                              <AlertTriangle className={`w-4 h-4 ${isNeon ? 'text-yellow-400' : 'text-yellow-500'}`} />
                              <div className={`absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 ${
                                isNeon ? 'bg-gray-900 text-white' : 'bg-gray-900 text-white'
                              } text-xs`}>
                                {daysSinceUpdate} days since last update
                              </div>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <QuickActions 
                          verification={{
                            ...failure,
                            status: (failure.status === 'Needs Review' ? 'needs_review' : failure.status) || 'needs_review'
                          }}
                          testEmail={testEmail}
                          onStatusUpdate={() => {
                            // The Firebase listener will automatically update the UI
                            console.log('Status updated for', failure.orderNumber);
                            console.log('Current test email in parent:', testEmail);
                          }}
                        />
                        {failure.id && (
                          <button
                            onClick={() => handleDeleteFailure(failure.id!)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isNeon
                                ? 'hover:bg-red-900/30 text-red-400 hover:text-red-300'
                                : 'hover:bg-red-100 text-red-600 hover:text-red-700'
                            }`}
                            title="Delete failed verification"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
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
              const timestamp = new Date().toISOString();
              const newFailure: Partial<FailedVerification> = {
                userId: user.uid,
                orderNumber: formData.get('orderNumber') as string,
                productName: formData.get('productName') as string,
                failureReason: formData.get('failureReason') as string,
                date: new Date().toLocaleDateString('en-US', { 
                  month: 'numeric', 
                  day: 'numeric', 
                  year: '2-digit' 
                }),
                status: 'needs_review',
                subject: 'Manual Entry',
                fromEmail: 'manual@entry.com',
                source: 'manual',
                createdAt: timestamp,
                statusHistory: [{
                  status: 'needs_review',
                  timestamp: timestamp,
                  note: 'Manually added'
                }],
                lastStatusUpdate: timestamp
              };
              
              try {
                console.log('💾 Saving new failed verification:', newFailure);
                const docRef = await addDocument('user_failed_verifications', newFailure);
                console.log('✅ Successfully saved failed verification with ID:', docRef.id);
                setShowAddModal(false);
                e.currentTarget.reset();
                // Show success feedback
                alert('Failed verification saved successfully!');
              } catch (error) {
                console.error('❌ Error adding failed verification:', error);
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
                    <option value="">Select a reason</option>
                    <option value="Manufacturing Defect">Manufacturing Defect</option>
                    <option value="Suspected Inauthentic">Suspected Inauthentic</option>
                    <option value="Used/Product Damage">Used/Product Damage</option>
                    <option value="Incorrect Sizing">Incorrect Sizing</option>
                    <option value="Used">Used</option>
                    <option value="Box Damage">Box Damage</option>
                    <option value="Incorrect Product">Incorrect Product</option>
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

      {/* Email Settings Modal */}
      {showEmailSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`rounded-lg p-6 max-w-md w-full mx-4 ${
            isNeon
              ? 'dark-neon-card border border-slate-700/50'
              : 'bg-white shadow-xl'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-semibold ${
                isNeon ? 'text-white' : 'text-gray-900'
              }`}>Email Settings</h3>
              <button
                onClick={() => setShowEmailSettings(false)}
                className={`p-1 rounded-lg transition-colors ${
                  isNeon
                    ? 'hover:bg-slate-800 text-slate-400'
                    : 'hover:bg-gray-100 text-gray-600'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${
                  isNeon ? 'text-slate-300' : 'text-gray-700'
                }`}>
                  Test Email Address
                </label>
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => {
                    console.log('Setting test email to:', e.target.value);
                    setTestEmail(e.target.value);
                  }}
                  placeholder="Enter your email for testing (e.g. yankeesfan1616@gmail.com)"
                  className={`w-full px-3 py-2 rounded-lg ${
                    isNeon
                      ? 'input-premium text-white placeholder-slate-500'
                      : 'border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                  }`}
                />
                <p className={`mt-1 text-sm ${
                  isNeon ? 'text-slate-400' : 'text-gray-500'
                }`}>
                  All return request emails will be sent to this address for testing
                </p>
              </div>
              
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  onClick={() => setShowEmailSettings(false)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    isNeon
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    saveTestEmail(testEmail);
                    setShowEmailSettings(false);
                  }}
                  className={`px-4 py-2 rounded-lg text-white transition-colors ${
                    isNeon
                      ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scan Status Modal */}
      {scanStatus && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`rounded-lg p-8 max-w-md w-full mx-4 ${
            isNeon
              ? 'dark-neon-card border border-cyan-500/30 shadow-2xl shadow-cyan-500/20'
              : 'bg-white shadow-2xl'
          }`}>
            {/* Animated Icon */}
            <div className="flex justify-center mb-6">
              <div className={`relative w-20 h-20 rounded-full flex items-center justify-center ${
                isNeon
                  ? 'bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30'
                  : 'bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30'
              }`}>
                {scanStatus === 'scanning' && (
                  <Search className={`w-10 h-10 ${
                    isNeon ? 'text-cyan-400' : 'text-blue-600'
                  } animate-pulse`} />
                )}
                {scanStatus === 'saving' && (
                  <RefreshCw className={`w-10 h-10 ${
                    isNeon ? 'text-emerald-400' : 'text-green-600'
                  } animate-spin`} />
                )}
                {scanStatus === 'complete' && (
                  <CheckCircle className={`w-10 h-10 ${
                    scanProgress.saved > 0 || scanProgress.found === 0
                      ? isNeon ? 'text-emerald-400' : 'text-green-600'
                      : isNeon ? 'text-orange-400' : 'text-orange-600'
                  }`} />
                )}
                
                {/* Animated ring */}
                <div className={`absolute inset-0 rounded-full ${
                  isNeon
                    ? 'bg-gradient-to-r from-cyan-500 to-emerald-500'
                    : 'bg-gradient-to-r from-blue-500 to-purple-500'
                } opacity-20 animate-ping`}></div>
              </div>
            </div>

            {/* Status Text */}
            <div className="text-center">
              <h3 className={`text-xl font-semibold mb-2 ${
                isNeon ? 'text-white' : 'text-gray-900'
              }`}>
                {scanStatus === 'scanning' && 'Scanning Gmail...'}
                {scanStatus === 'saving' && 'Saving Results...'}
                {scanStatus === 'complete' && 'Scan Complete!'}
              </h3>
              
              <p className={`text-base mb-4 ${
                isNeon ? 'text-cyan-300' : 'text-gray-700'
              }`}>
                {scanProgress.message}
              </p>

              {/* Progress indicators */}
              {scanProgress.found > 0 && scanStatus !== 'complete' && (
                <div className="space-y-2">
                  <div className={`text-sm ${
                    isNeon ? 'text-slate-400' : 'text-gray-600'
                  }`}>
                    Found: {scanProgress.found} failures
                  </div>
                  {scanStatus === 'saving' && (
                    <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${
                          isNeon
                            ? 'bg-gradient-to-r from-cyan-500 to-emerald-500'
                            : 'bg-gradient-to-r from-blue-500 to-purple-500'
                        }`}
                        style={{ width: `${(scanProgress.saved / scanProgress.found) * 100}%` }}
                      ></div>
                    </div>
                  )}
                </div>
              )}

              {/* Auto-close notice */}
              {scanStatus === 'complete' && (
                <p className={`text-sm mt-4 ${
                  isNeon ? 'text-slate-500' : 'text-gray-500'
                }`}>
                  Closing automatically...
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FailedVerifications; 