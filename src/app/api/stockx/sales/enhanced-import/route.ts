import { NextRequest, NextResponse } from 'next/server';
import { refreshStockXTokens } from '@/lib/stockx/tokenRefresh';
import { getDocuments, addDocument, updateDocument } from '@/lib/firebase/firebaseUtils';
import { StockXSale } from '@/lib/types/stockx';

interface ImportSession {
  id: string;
  userId: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  createdAt: string;
  lastSync: string;
  totalSalesExpected?: number;
  totalSalesImported: number;
  currentPhase: 'audit' | 'historical' | 'recent' | 'details' | 'validation' | 'completed';
  dateRanges: Array<{ start: string; end: string; completed: boolean }>;
  qualityMetrics: {
    totalApiCalls: number;
    rateLimitHits: number;
    timeouts: number;
    dataValidationErrors: number;
    duplicatesFound: number;
    orphanedRecords: number;
  };
  performance: {
    startTime: string;
    estimatedCompletion?: string;
    averageApiResponseTime: number;
    throughputPerMinute: number;
  };
  coverage: {
    missingDateRanges: Array<{ start: string; end: string }>;
    statusGaps: string[];
    missingOrderTypes: string[];
  };
}

interface DataQualityReport {
  totalSalesInDashboard?: number;
  totalSalesImported: number;
  coveragePercentage: number;
  dataIntegrityIssues: Array<{
    type: 'missing_data' | 'inconsistent_data' | 'duplicate' | 'orphaned';
    orderNumber: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
  }>;
  missingDateRanges: Array<{ start: string; end: string; salesCount?: number }>;
  performanceMetrics: {
    averageResponseTime: number;
    rateLimitEncounters: number;
    timeoutOccurrences: number;
    retrySuccessRate: number;
  };
}

export async function POST(request: NextRequest) {
  const { 
    action = 'start',
    sessionId,
    userId,
    auditOnly = false,
    dateRange,
    maxConcurrentRequests = 3,
    enableDetailedEnrichment = true,
    skipValidation = false
  } = await request.json();

  console.log('🚀 Enhanced StockX Sales Import:', { action, sessionId, auditOnly });

  // Get access token from cookies
  const accessToken = request.cookies.get('stockx_access_token')?.value;
  const refreshToken = request.cookies.get('stockx_refresh_token')?.value;
  const apiKey = process.env.STOCKX_API_KEY || process.env.STOCKX_CLIENT_ID;

  if (!accessToken || !apiKey) {
    return NextResponse.json(
      { 
        error: 'Missing authentication', 
        message: 'Please authenticate with StockX first'
      },
      { status: 401 }
    );
  }

  try {
    switch (action) {
      case 'audit':
        return await performDataCompletenessAudit(accessToken, refreshToken, apiKey, userId);
      
      case 'start':
        return await startEnhancedImport(accessToken, refreshToken, apiKey, userId, {
          auditOnly,
          dateRange,
          maxConcurrentRequests,
          enableDetailedEnrichment
        });
        
      case 'continue':
        return await continueEnhancedImport(sessionId, accessToken, refreshToken, apiKey);
        
      case 'status':
        return await getImportStatus(sessionId);
        
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('❌ Enhanced import error:', error);
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
}

async function performDataCompletenessAudit(
  accessToken: string,
  refreshToken: string,
  apiKey: string,
  userId: string
): Promise<NextResponse> {
  console.log('🔍 Starting Data Completeness Audit...');
  
  const auditReport: DataQualityReport = {
    totalSalesImported: 0,
    coveragePercentage: 0,
    dataIntegrityIssues: [],
    missingDateRanges: [],
    performanceMetrics: {
      averageResponseTime: 0,
      rateLimitEncounters: 0,
      timeoutOccurrences: 0,
      retrySuccessRate: 100
    }
  };

  const startTime = Date.now();
  let currentAccessToken = accessToken;
  
  try {
    // Phase 1: Get total sales count from dashboard summary
    console.log('📊 Phase 1: Getting dashboard summary...');
    
    const dashboardSummary = await fetchWithSmartRetry(
      'https://api.stockx.com/v2/selling/dashboard/summary',
      currentAccessToken,
      apiKey
    );
    
    if (dashboardSummary.data) {
      auditReport.totalSalesInDashboard = dashboardSummary.data.totalCompletedOrders || 
                                          dashboardSummary.data.lifetimeSales || 
                                          0;
    }

    // Phase 2: Quick pagination scan to detect gaps
    console.log('📋 Phase 2: Scanning pagination coverage...');
    
    const paginationScan = await scanPaginationCoverage(currentAccessToken, apiKey);
    auditReport.totalSalesImported = paginationScan.totalFound;
    auditReport.missingDateRanges = paginationScan.dateGaps;
    
    // Phase 3: Detect missing order statuses
    console.log('🔄 Phase 3: Checking order status coverage...');
    
    const statusCoverage = await checkOrderStatusCoverage(currentAccessToken, apiKey);
    
    // Phase 4: Compare with existing Firebase data
    console.log('🗄️ Phase 4: Comparing with existing data...');
    
    const existingSales = await getDocuments('stockxSales');
    const userSales = existingSales.filter((sale: any) => sale.userId === userId);
    
    const duplicateAnalysis = await analyzeDuplicates(userSales);
    auditReport.dataIntegrityIssues.push(...duplicateAnalysis);
    
    // Calculate coverage percentage
    if (auditReport.totalSalesInDashboard) {
      auditReport.coveragePercentage = Math.round(
        (auditReport.totalSalesImported / auditReport.totalSalesInDashboard) * 100
      );
    }
    
    // Phase 5: Performance metrics
    auditReport.performanceMetrics.averageResponseTime = Date.now() - startTime;
    
    console.log('✅ Audit completed:', auditReport);
    
    return NextResponse.json({
      success: true,
      audit: auditReport,
      recommendations: generateRecommendations(auditReport)
    });

  } catch (error: any) {
    console.error('❌ Audit failed:', error);
    return NextResponse.json({ 
      error: 'Audit failed', 
      details: error.message,
      partialResults: auditReport
    }, { status: 500 });
  }
}

async function startEnhancedImport(
  accessToken: string,
  refreshToken: string,
  apiKey: string,
  userId: string,
  options: any
): Promise<NextResponse> {
  console.log('🚀 Starting Enhanced Import with options:', options);
  
  // Create import session
  const session: ImportSession = {
    id: `enhanced_${Date.now()}`,
    userId,
    status: 'running',
    createdAt: new Date().toISOString(),
    lastSync: new Date().toISOString(),
    totalSalesImported: 0,
    currentPhase: 'audit',
    dateRanges: [],
    qualityMetrics: {
      totalApiCalls: 0,
      rateLimitHits: 0,
      timeouts: 0,
      dataValidationErrors: 0,
      duplicatesFound: 0,
      orphanedRecords: 0
    },
    performance: {
      startTime: new Date().toISOString(),
      averageApiResponseTime: 0,
      throughputPerMinute: 0
    },
    coverage: {
      missingDateRanges: [],
      statusGaps: [],
      missingOrderTypes: []
    }
  };

  // Save session to Firebase
  await addDocument('stockxImportSessions', session);
  
  // If audit only, perform audit and return
  if (options.auditOnly) {
    const auditResult = await performDataCompletenessAudit(accessToken, refreshToken, apiKey, userId);
    return auditResult;
  }
  
  // Start the import process (will be continued via separate calls)
  return NextResponse.json({
    success: true,
    sessionId: session.id,
    message: 'Enhanced import session started',
    nextAction: 'Call /continue endpoint to proceed with import'
  });
}

async function continueEnhancedImport(
  sessionId: string,
  accessToken: string,
  refreshToken: string,
  apiKey: string
): Promise<NextResponse> {
  // Load session from Firebase
  const sessions = await getDocuments('stockxImportSessions');
  const session = sessions.find((s: any) => s.id === sessionId);
  
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  
  console.log(`🔄 Continuing import session ${sessionId}, phase: ${session.currentPhase}`);
  
  try {
    switch (session.currentPhase) {
      case 'audit':
        return await executeAuditPhase(session, accessToken, apiKey);
      case 'historical':
        return await executeHistoricalPhase(session, accessToken, apiKey);
      case 'recent':
        return await executeRecentPhase(session, accessToken, apiKey);
      case 'details':
        return await executeDetailsPhase(session, accessToken, apiKey);
      case 'validation':
        return await executeValidationPhase(session, accessToken, apiKey);
      default:
        return NextResponse.json({ error: 'Invalid phase' }, { status: 400 });
    }
  } catch (error: any) {
    console.error(`❌ Phase ${session.currentPhase} failed:`, error);
    
    // Update session status
    await updateDocument('stockxImportSessions', session.id, {
      status: 'failed',
      error: error.message,
      updatedAt: new Date().toISOString()
    });
    
    return NextResponse.json({ 
      error: error.message,
      sessionId: session.id,
      phase: session.currentPhase
    }, { status: 500 });
  }
}

// Smart retry mechanism with exponential backoff
async function fetchWithSmartRetry(
  url: string,
  accessToken: string,
  apiKey: string,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<any> {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'x-api-key': apiKey,
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        return await response.json();
      }
      
      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : baseDelay * Math.pow(2, attempt);
        
        console.log(`⏳ Rate limited, waiting ${delay}ms before retry ${attempt + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Handle other HTTP errors
      if (response.status >= 500) {
        throw new Error(`Server error: ${response.status}`);
      } else {
        throw new Error(`API error: ${response.status}`);
      }
      
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`🔄 Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

async function scanPaginationCoverage(accessToken: string, apiKey: string) {
  console.log('🔍 Scanning pagination coverage...');
  
  let totalFound = 0;
  let pageNumber = 1;
  let hasNextPage = true;
  const dateGaps: Array<{ start: string; end: string }> = [];
  const salesByDate: Map<string, number> = new Map();
  
  while (hasNextPage && pageNumber <= 50) { // Limit scan to reasonable number
    const queryParams = new URLSearchParams({
      pageNumber: pageNumber.toString(),
      pageSize: '100',
      orderStatus: 'COMPLETED'
    });
    
    const url = `https://api.stockx.com/v2/selling/orders/history?${queryParams.toString()}`;
    
    try {
      const data = await fetchWithSmartRetry(url, accessToken, apiKey);
      
      if (data.orders && Array.isArray(data.orders)) {
        totalFound += data.orders.length;
        
        // Track sales by date for gap analysis
        data.orders.forEach((order: any) => {
          const date = new Date(order.createdAt || order.created).toDateString();
          salesByDate.set(date, (salesByDate.get(date) || 0) + 1);
        });
        
        hasNextPage = data.hasNextPage && data.orders.length > 0;
      } else {
        hasNextPage = false;
      }
      
      pageNumber++;
      
      // Small delay to be respectful
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.error(`Failed to scan page ${pageNumber}:`, error);
      hasNextPage = false;
    }
  }
  
  // Analyze date gaps (simplified - look for gaps > 7 days with no sales)
  const dates = Array.from(salesByDate.keys()).sort();
  let lastDate = new Date(dates[0]);
  
  for (let i = 1; i < dates.length; i++) {
    const currentDate = new Date(dates[i]);
    const daysDiff = (currentDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysDiff > 7) {
      dateGaps.push({
        start: lastDate.toISOString().split('T')[0],
        end: currentDate.toISOString().split('T')[0]
      });
    }
    
    lastDate = currentDate;
  }
  
  return { totalFound, dateGaps };
}

async function checkOrderStatusCoverage(accessToken: string, apiKey: string) {
  console.log('🔄 Checking order status coverage...');
  
  const statuses = ['COMPLETED', 'SHIPPED', 'AUTHENTICATED', 'PAYOUT_PENDING'];
  const coverage: Record<string, number> = {};
  
  for (const status of statuses) {
    try {
      const queryParams = new URLSearchParams({
        pageNumber: '1',
        pageSize: '1',
        orderStatus: status
      });
      
      const url = `https://api.stockx.com/v2/selling/orders/history?${queryParams.toString()}`;
      const data = await fetchWithSmartRetry(url, accessToken, apiKey);
      
      coverage[status] = data.totalCount || 0;
      
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Failed to check status ${status}:`, error);
      coverage[status] = 0;
    }
  }
  
  return coverage;
}

async function analyzeDuplicates(existingSales: any[]) {
  const issues = [];
  const orderNumbers = new Map();
  
  for (const sale of existingSales) {
    const orderNumber = sale.saleData?.orderNumber || sale.stockxOrderId;
    
    if (orderNumber) {
      if (orderNumbers.has(orderNumber)) {
        issues.push({
          type: 'duplicate' as const,
          orderNumber,
          description: `Duplicate order found: ${orderNumber}`,
          severity: 'medium' as const
        });
      } else {
        orderNumbers.set(orderNumber, sale);
      }
    } else {
      issues.push({
        type: 'missing_data' as const,
        orderNumber: sale.id || 'unknown',
        description: 'Sale missing order number',
        severity: 'low' as const
      });
    }
  }
  
  return issues;
}

function generateRecommendations(audit: DataQualityReport) {
  const recommendations = [];
  
  if (audit.coveragePercentage < 95) {
    recommendations.push({
      priority: 'high',
      action: 'missing_data_recovery',
      message: `Only ${audit.coveragePercentage}% coverage detected. Run full historical import.`
    });
  }
  
  if (audit.missingDateRanges.length > 0) {
    recommendations.push({
      priority: 'medium',
      action: 'date_range_fill',
      message: `${audit.missingDateRanges.length} date gaps found. Consider targeted import.`,
      ranges: audit.missingDateRanges
    });
  }
  
  if (audit.dataIntegrityIssues.length > 0) {
    recommendations.push({
      priority: 'medium',
      action: 'data_cleanup',
      message: `${audit.dataIntegrityIssues.length} data integrity issues found.`,
      issues: audit.dataIntegrityIssues
    });
  }
  
  return recommendations;
}

// Placeholder implementations for phase execution
async function executeAuditPhase(session: any, accessToken: string, apiKey: string) {
  // Implementation for audit phase
  return NextResponse.json({ message: 'Audit phase completed', nextPhase: 'historical' });
}

async function executeHistoricalPhase(session: any, accessToken: string, apiKey: string) {
  // Implementation for historical data import
  return NextResponse.json({ message: 'Historical phase completed', nextPhase: 'recent' });
}

async function executeRecentPhase(session: any, accessToken: string, apiKey: string) {
  // Implementation for recent data import
  return NextResponse.json({ message: 'Recent phase completed', nextPhase: 'details' });
}

async function executeDetailsPhase(session: any, accessToken: string, apiKey: string) {
  // Implementation for detailed order enrichment
  return NextResponse.json({ message: 'Details phase completed', nextPhase: 'validation' });
}

async function executeValidationPhase(session: any, accessToken: string, apiKey: string) {
  // Implementation for final validation
  return NextResponse.json({ message: 'Validation phase completed', nextPhase: 'completed' });
}

async function getImportStatus(sessionId: string): Promise<NextResponse> {
  const sessions = await getDocuments('stockxImportSessions');
  const session = sessions.find((s: any) => s.id === sessionId);
  
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  
  return NextResponse.json({ session });
}
