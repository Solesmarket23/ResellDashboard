import { NextRequest, NextResponse } from 'next/server';
import { getDocuments, addDocument, updateDocument } from '@/lib/firebase/firebaseUtils';

interface PerformanceMetrics {
  endpoint: string;
  method: string;
  responseTime: number;
  statusCode: number;
  timestamp: string;
  userId: string;
  requestSize?: number;
  responseSize?: number;
  rateLimited: boolean;
  retryCount: number;
  errorType?: string;
  phase: 'authentication' | 'pagination' | 'enrichment' | 'validation' | 'storage';
}

interface PerformanceReport {
  timeRange: {
    start: string;
    end: string;
  };
  totalRequests: number;
  averageResponseTime: number;
  successRate: number;
  rateLimitHits: number;
  timeoutOccurrences: number;
  topSlowEndpoints: Array<{
    endpoint: string;
    averageTime: number;
    requestCount: number;
  }>;
  performanceByPhase: Record<string, {
    averageTime: number;
    requestCount: number;
    errorRate: number;
  }>;
  hourlyThroughput: Array<{
    hour: string;
    requestCount: number;
    averageResponseTime: number;
  }>;
  recommendations: Array<{
    type: 'optimization' | 'infrastructure' | 'rate_limiting' | 'caching';
    priority: 'high' | 'medium' | 'low';
    description: string;
    estimatedImpact: string;
  }>;
}

interface RateLimitStrategy {
  endpoint: string;
  maxRequestsPerMinute: number;
  burstCapacity: number;
  backoffMultiplier: number;
  maxBackoffTime: number;
  concurrentRequestLimit: number;
}

export async function POST(request: NextRequest) {
  const { action, metrics, userId, timeRange } = await request.json();

  console.log('📊 Performance Monitor:', { action, userId });

  try {
    switch (action) {
      case 'log_metrics':
        return await logPerformanceMetrics(metrics);
      
      case 'get_report':
        return await generatePerformanceReport(userId, timeRange);
      
      case 'optimize_strategy':
        return await optimizeRateLimitStrategy(userId);
      
      case 'get_real_time_stats':
        return await getRealTimeStats(userId);
        
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('❌ Performance monitoring error:', error);
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
}

async function logPerformanceMetrics(metrics: PerformanceMetrics): Promise<NextResponse> {
  try {
    // Add computed metrics
    const enhancedMetrics = {
      ...metrics,
      id: `perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      computedMetrics: {
        isSlowRequest: metrics.responseTime > 5000,
        isTimeout: metrics.responseTime > 30000,
        efficiency: calculateEfficiency(metrics),
        performanceGrade: calculatePerformanceGrade(metrics.responseTime)
      }
    };

    await addDocument('performanceMetrics', enhancedMetrics);

    // Check for immediate alerts
    const alerts = checkForPerformanceAlerts(enhancedMetrics);
    
    return NextResponse.json({
      success: true,
      metricsId: enhancedMetrics.id,
      alerts: alerts.length > 0 ? alerts : undefined
    });

  } catch (error: any) {
    console.error('❌ Failed to log metrics:', error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}

async function generatePerformanceReport(
  userId: string, 
  timeRange: { start: string; end: string }
): Promise<NextResponse> {
  try {
    console.log('📈 Generating performance report for user:', userId);

    // Load performance metrics within time range
    const allMetrics = await getDocuments('performanceMetrics');
    const userMetrics = allMetrics.filter((metric: any) => 
      metric.userId === userId &&
      new Date(metric.timestamp) >= new Date(timeRange.start) &&
      new Date(metric.timestamp) <= new Date(timeRange.end)
    );

    if (userMetrics.length === 0) {
      return NextResponse.json({
        success: true,
        report: {
          timeRange,
          totalRequests: 0,
          message: 'No performance data available for the specified time range'
        }
      });
    }

    const report: PerformanceReport = {
      timeRange,
      totalRequests: userMetrics.length,
      averageResponseTime: calculateAverageResponseTime(userMetrics),
      successRate: calculateSuccessRate(userMetrics),
      rateLimitHits: userMetrics.filter((m: any) => m.rateLimited).length,
      timeoutOccurrences: userMetrics.filter((m: any) => m.computedMetrics?.isTimeout).length,
      topSlowEndpoints: identifySlowEndpoints(userMetrics),
      performanceByPhase: analyzePerformanceByPhase(userMetrics),
      hourlyThroughput: calculateHourlyThroughput(userMetrics),
      recommendations: generatePerformanceRecommendations(userMetrics)
    };

    return NextResponse.json({
      success: true,
      report,
      summary: {
        healthScore: calculateOverallHealthScore(report),
        trendDirection: calculateTrend(userMetrics),
        criticalIssues: identifyCriticalIssues(report)
      }
    });

  } catch (error: any) {
    console.error('❌ Failed to generate report:', error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}

async function optimizeRateLimitStrategy(userId: string): Promise<NextResponse> {
  try {
    console.log('🎯 Optimizing rate limit strategy for user:', userId);

    // Load recent performance data
    const recentMetrics = await getRecentMetrics(userId, 24); // Last 24 hours
    
    // Analyze rate limiting patterns
    const rateLimitAnalysis = analyzeRateLimitPatterns(recentMetrics);
    
    // Generate optimized strategies per endpoint
    const optimizedStrategies: RateLimitStrategy[] = [];
    
    for (const [endpoint, data] of Object.entries(rateLimitAnalysis)) {
      const strategy: RateLimitStrategy = {
        endpoint,
        maxRequestsPerMinute: calculateOptimalRateLimit(data as any),
        burstCapacity: calculateBurstCapacity(data as any),
        backoffMultiplier: calculateBackoffMultiplier(data as any),
        maxBackoffTime: 60000, // 1 minute max
        concurrentRequestLimit: calculateConcurrentLimit(data as any)
      };
      
      optimizedStrategies.push(strategy);
    }

    // Save optimized strategies
    await addDocument('rateLimitStrategies', {
      userId,
      strategies: optimizedStrategies,
      createdAt: new Date().toISOString(),
      basedOnMetrics: {
        timeRange: '24h',
        totalRequests: recentMetrics.length,
        rateLimitHits: recentMetrics.filter((m: any) => m.rateLimited).length
      }
    });

    return NextResponse.json({
      success: true,
      strategies: optimizedStrategies,
      improvements: calculateImprovements(recentMetrics, optimizedStrategies),
      recommendations: [
        {
          type: 'rate_limiting',
          priority: 'high',
          description: 'Implement exponential backoff with optimized timing',
          estimatedImpact: 'Reduce rate limit hits by 70-90%'
        },
        {
          type: 'caching',
          priority: 'medium',
          description: 'Cache frequently accessed product data',
          estimatedImpact: 'Improve response time by 40-60%'
        }
      ]
    });

  } catch (error: any) {
    console.error('❌ Failed to optimize strategy:', error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}

async function getRealTimeStats(userId: string): Promise<NextResponse> {
  try {
    // Get metrics from last 15 minutes for real-time view
    const recentMetrics = await getRecentMetrics(userId, 0.25); // 15 minutes
    
    const realTimeStats = {
      currentThroughput: calculateCurrentThroughput(recentMetrics),
      averageResponseTime: calculateAverageResponseTime(recentMetrics),
      activePhases: identifyActivePhases(recentMetrics),
      rateLimitStatus: checkRateLimitStatus(recentMetrics),
      systemHealth: calculateSystemHealth(recentMetrics),
      lastUpdated: new Date().toISOString()
    };

    return NextResponse.json({
      success: true,
      stats: realTimeStats,
      alerts: checkForRealTimeAlerts(recentMetrics)
    });

  } catch (error: any) {
    console.error('❌ Failed to get real-time stats:', error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}

// Utility functions
async function getRecentMetrics(userId: string, hoursBack: number) {
  const allMetrics = await getDocuments('performanceMetrics');
  const cutoffTime = new Date(Date.now() - (hoursBack * 60 * 60 * 1000));
  
  return allMetrics.filter((metric: any) => 
    metric.userId === userId &&
    new Date(metric.timestamp) >= cutoffTime
  );
}

function calculateEfficiency(metrics: PerformanceMetrics): number {
  // Calculate efficiency based on response time, retries, and success
  const baseEfficiency = Math.max(0, 100 - (metrics.responseTime / 100));
  const retryPenalty = metrics.retryCount * 10;
  const rateLimitPenalty = metrics.rateLimited ? 20 : 0;
  
  return Math.max(0, Math.min(100, baseEfficiency - retryPenalty - rateLimitPenalty));
}

function calculatePerformanceGrade(responseTime: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (responseTime < 1000) return 'A';
  if (responseTime < 3000) return 'B';
  if (responseTime < 5000) return 'C';
  if (responseTime < 10000) return 'D';
  return 'F';
}

function checkForPerformanceAlerts(metrics: PerformanceMetrics) {
  const alerts = [];
  
  if (metrics.responseTime > 10000) {
    alerts.push({
      type: 'slow_response',
      severity: 'high',
      message: `Very slow response time: ${metrics.responseTime}ms for ${metrics.endpoint}`
    });
  }
  
  if (metrics.rateLimited) {
    alerts.push({
      type: 'rate_limited',
      severity: 'medium',
      message: `Rate limit hit on ${metrics.endpoint}`
    });
  }
  
  if (metrics.retryCount > 3) {
    alerts.push({
      type: 'high_retry_count',
      severity: 'medium',
      message: `High retry count (${metrics.retryCount}) for ${metrics.endpoint}`
    });
  }
  
  return alerts;
}

function calculateAverageResponseTime(metrics: any[]): number {
  if (metrics.length === 0) return 0;
  const total = metrics.reduce((sum, metric) => sum + metric.responseTime, 0);
  return Math.round(total / metrics.length);
}

function calculateSuccessRate(metrics: any[]): number {
  if (metrics.length === 0) return 100;
  const successCount = metrics.filter(metric => metric.statusCode >= 200 && metric.statusCode < 300).length;
  return Math.round((successCount / metrics.length) * 100);
}

function identifySlowEndpoints(metrics: any[]) {
  const endpointStats = new Map();
  
  metrics.forEach(metric => {
    const endpoint = metric.endpoint;
    if (!endpointStats.has(endpoint)) {
      endpointStats.set(endpoint, { totalTime: 0, count: 0 });
    }
    const stats = endpointStats.get(endpoint);
    stats.totalTime += metric.responseTime;
    stats.count += 1;
  });
  
  return Array.from(endpointStats.entries())
    .map(([endpoint, stats]: any) => ({
      endpoint,
      averageTime: Math.round(stats.totalTime / stats.count),
      requestCount: stats.count
    }))
    .sort((a, b) => b.averageTime - a.averageTime)
    .slice(0, 10);
}

function analyzePerformanceByPhase(metrics: any[]) {
  const phaseStats: Record<string, any> = {};
  
  metrics.forEach(metric => {
    const phase = metric.phase || 'unknown';
    if (!phaseStats[phase]) {
      phaseStats[phase] = { totalTime: 0, count: 0, errors: 0 };
    }
    phaseStats[phase].totalTime += metric.responseTime;
    phaseStats[phase].count += 1;
    if (metric.statusCode >= 400) {
      phaseStats[phase].errors += 1;
    }
  });
  
  Object.keys(phaseStats).forEach(phase => {
    const stats = phaseStats[phase];
    stats.averageTime = Math.round(stats.totalTime / stats.count);
    stats.errorRate = Math.round((stats.errors / stats.count) * 100);
    delete stats.totalTime;
    delete stats.errors;
  });
  
  return phaseStats;
}

function calculateHourlyThroughput(metrics: any[]) {
  const hourlyStats = new Map();
  
  metrics.forEach(metric => {
    const hour = new Date(metric.timestamp).toISOString().slice(0, 13) + ':00:00.000Z';
    if (!hourlyStats.has(hour)) {
      hourlyStats.set(hour, { totalTime: 0, count: 0 });
    }
    const stats = hourlyStats.get(hour);
    stats.totalTime += metric.responseTime;
    stats.count += 1;
  });
  
  return Array.from(hourlyStats.entries())
    .map(([hour, stats]: any) => ({
      hour,
      requestCount: stats.count,
      averageResponseTime: Math.round(stats.totalTime / stats.count)
    }))
    .sort((a, b) => new Date(a.hour).getTime() - new Date(b.hour).getTime());
}

function generatePerformanceRecommendations(metrics: any[]) {
  const recommendations = [];
  
  const avgResponseTime = calculateAverageResponseTime(metrics);
  const rateLimitHits = metrics.filter(m => m.rateLimited).length;
  const timeouts = metrics.filter(m => m.computedMetrics?.isTimeout).length;
  
  if (avgResponseTime > 5000) {
    recommendations.push({
      type: 'optimization',
      priority: 'high',
      description: 'Average response time is above 5 seconds. Consider implementing request batching and caching.',
      estimatedImpact: 'Reduce response time by 50-70%'
    });
  }
  
  if (rateLimitHits > metrics.length * 0.1) {
    recommendations.push({
      type: 'rate_limiting',
      priority: 'high',
      description: 'High rate limit encounter rate. Implement exponential backoff and request queuing.',
      estimatedImpact: 'Reduce rate limit hits by 80%'
    });
  }
  
  if (timeouts > 0) {
    recommendations.push({
      type: 'infrastructure',
      priority: 'medium',
      description: 'Request timeouts detected. Consider increasing timeout limits or optimizing slow endpoints.',
      estimatedImpact: 'Improve success rate by 15-25%'
    });
  }
  
  return recommendations;
}

function calculateOverallHealthScore(report: PerformanceReport): number {
  let score = 100;
  
  // Penalize based on various factors
  if (report.averageResponseTime > 3000) score -= 20;
  if (report.successRate < 95) score -= 15;
  if (report.rateLimitHits > report.totalRequests * 0.05) score -= 10;
  if (report.timeoutOccurrences > 0) score -= 10;
  
  return Math.max(0, Math.min(100, score));
}

function calculateTrend(metrics: any[]): 'improving' | 'stable' | 'degrading' {
  if (metrics.length < 10) return 'stable';
  
  const firstHalf = metrics.slice(0, Math.floor(metrics.length / 2));
  const secondHalf = metrics.slice(Math.floor(metrics.length / 2));
  
  const firstHalfAvg = calculateAverageResponseTime(firstHalf);
  const secondHalfAvg = calculateAverageResponseTime(secondHalf);
  
  const improvement = ((firstHalfAvg - secondHalfAvg) / firstHalfAvg) * 100;
  
  if (improvement > 10) return 'improving';
  if (improvement < -10) return 'degrading';
  return 'stable';
}

function identifyCriticalIssues(report: PerformanceReport) {
  const issues = [];
  
  if (report.successRate < 90) {
    issues.push({
      type: 'low_success_rate',
      severity: 'critical',
      description: `Success rate is only ${report.successRate}%`
    });
  }
  
  if (report.averageResponseTime > 10000) {
    issues.push({
      type: 'very_slow_response',
      severity: 'critical',
      description: `Average response time is ${report.averageResponseTime}ms`
    });
  }
  
  return issues;
}

function analyzeRateLimitPatterns(metrics: any[]) {
  const endpointAnalysis: Record<string, any> = {};
  
  metrics.forEach(metric => {
    const endpoint = metric.endpoint;
    if (!endpointAnalysis[endpoint]) {
      endpointAnalysis[endpoint] = {
        totalRequests: 0,
        rateLimitHits: 0,
        averageResponseTime: 0,
        responseTimeSum: 0,
        concurrentRequests: 0
      };
    }
    
    const analysis = endpointAnalysis[endpoint];
    analysis.totalRequests += 1;
    analysis.responseTimeSum += metric.responseTime;
    if (metric.rateLimited) analysis.rateLimitHits += 1;
  });
  
  // Calculate averages
  Object.keys(endpointAnalysis).forEach(endpoint => {
    const analysis = endpointAnalysis[endpoint];
    analysis.averageResponseTime = analysis.responseTimeSum / analysis.totalRequests;
    analysis.rateLimitRate = analysis.rateLimitHits / analysis.totalRequests;
  });
  
  return endpointAnalysis;
}

function calculateOptimalRateLimit(data: any): number {
  // Base rate limit on success rate and current hit rate
  const baseRate = 30; // Conservative starting point
  const hitRate = data.rateLimitRate;
  
  if (hitRate > 0.1) return Math.max(10, baseRate * 0.5); // Reduce if high hit rate
  if (hitRate === 0) return baseRate * 1.5; // Increase if no hits
  return baseRate;
}

function calculateBurstCapacity(data: any): number {
  return Math.max(5, Math.floor(calculateOptimalRateLimit(data) * 0.3));
}

function calculateBackoffMultiplier(data: any): number {
  const hitRate = data.rateLimitRate;
  if (hitRate > 0.2) return 3; // Aggressive backoff for high hit rate
  if (hitRate > 0.1) return 2.5;
  return 2; // Standard backoff
}

function calculateConcurrentLimit(data: any): number {
  return Math.max(1, Math.min(5, Math.floor(calculateOptimalRateLimit(data) / 10)));
}

function calculateImprovements(metrics: any[], strategies: RateLimitStrategy[]) {
  const currentHitRate = metrics.filter(m => m.rateLimited).length / metrics.length;
  const estimatedNewHitRate = currentHitRate * 0.2; // Assume 80% reduction
  
  return {
    rateLimitHitReduction: Math.round((currentHitRate - estimatedNewHitRate) * 100),
    estimatedThroughputIncrease: '25-40%',
    projectedSuccessRateImprovement: Math.min(10, currentHitRate * 100)
  };
}

function calculateCurrentThroughput(metrics: any[]): number {
  if (metrics.length === 0) return 0;
  const timeSpanMinutes = 15; // Last 15 minutes
  return Math.round(metrics.length / timeSpanMinutes);
}

function identifyActivePhases(metrics: any[]): string[] {
  const phases = new Set(metrics.map(m => m.phase).filter(Boolean));
  return Array.from(phases);
}

function checkRateLimitStatus(metrics: any[]) {
  const recentHits = metrics.filter(m => m.rateLimited).length;
  return {
    recentHits,
    status: recentHits > 0 ? 'hitting_limits' : 'healthy',
    lastHit: recentHits > 0 ? 
      metrics.filter(m => m.rateLimited).pop()?.timestamp : null
  };
}

function calculateSystemHealth(metrics: any[]): 'healthy' | 'warning' | 'critical' {
  if (metrics.length === 0) return 'healthy';
  
  const avgResponseTime = calculateAverageResponseTime(metrics);
  const errorRate = metrics.filter(m => m.statusCode >= 400).length / metrics.length;
  
  if (avgResponseTime > 10000 || errorRate > 0.2) return 'critical';
  if (avgResponseTime > 5000 || errorRate > 0.1) return 'warning';
  return 'healthy';
}

function checkForRealTimeAlerts(metrics: any[]) {
  const alerts = [];
  
  const recentErrors = metrics.filter(m => m.statusCode >= 400);
  if (recentErrors.length > metrics.length * 0.3) {
    alerts.push({
      type: 'high_error_rate',
      severity: 'critical',
      message: 'High error rate detected in the last 15 minutes'
    });
  }
  
  const slowRequests = metrics.filter(m => m.responseTime > 10000);
  if (slowRequests.length > 0) {
    alerts.push({
      type: 'slow_requests',
      severity: 'warning',
      message: `${slowRequests.length} slow requests detected`
    });
  }
  
  return alerts;
}
