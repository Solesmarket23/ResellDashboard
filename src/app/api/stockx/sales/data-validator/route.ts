import { NextRequest, NextResponse } from 'next/server';
import { getDocuments, updateDocument } from '@/lib/firebase/firebaseUtils';
import { StockXSale } from '@/lib/types/stockx';

interface ValidationReport {
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  validationErrors: ValidationError[];
  dataQualityScore: number;
  recommendations: Recommendation[];
  performanceMetrics: {
    validationTime: number;
    recordsPerSecond: number;
  };
}

interface ValidationError {
  recordId: string;
  orderNumber?: string;
  errorType: 'missing_required_field' | 'invalid_data_format' | 'business_logic_violation' | 'cross_reference_failure';
  field: string;
  expectedValue?: string;
  actualValue?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  suggestedFix?: string;
}

interface Recommendation {
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: 'data_completion' | 'data_accuracy' | 'performance' | 'business_logic';
  action: string;
  description: string;
  estimatedImpact: string;
  implementationComplexity: 'low' | 'medium' | 'high';
}

export async function POST(request: NextRequest) {
  const { 
    userId,
    validationType = 'comprehensive', // 'quick' | 'comprehensive' | 'critical_only'
    autoFix = false,
    generateReport = true
  } = await request.json();

  console.log('🔍 Starting StockX data validation:', { validationType, autoFix });

  const startTime = Date.now();
  
  try {
    // Load all StockX sales for the user
    const stockxSales = await getDocuments('stockxSales');
    const userSales = stockxSales.filter((sale: any) => sale.userId === userId);
    
    console.log(`📊 Validating ${userSales.length} StockX sales records...`);
    
    const validationReport: ValidationReport = {
      totalRecords: userSales.length,
      validRecords: 0,
      invalidRecords: 0,
      validationErrors: [],
      dataQualityScore: 0,
      recommendations: [],
      performanceMetrics: {
        validationTime: 0,
        recordsPerSecond: 0
      }
    };

    // Run validation based on type
    switch (validationType) {
      case 'quick':
        await runQuickValidation(userSales, validationReport, autoFix);
        break;
      case 'comprehensive':
        await runComprehensiveValidation(userSales, validationReport, autoFix);
        break;
      case 'critical_only':
        await runCriticalValidation(userSales, validationReport, autoFix);
        break;
    }

    // Calculate performance metrics
    validationReport.performanceMetrics.validationTime = Date.now() - startTime;
    validationReport.performanceMetrics.recordsPerSecond = 
      Math.round(validationReport.totalRecords / (validationReport.performanceMetrics.validationTime / 1000));

    // Calculate data quality score (0-100)
    validationReport.dataQualityScore = calculateDataQualityScore(validationReport);

    // Generate recommendations
    validationReport.recommendations = generateValidationRecommendations(validationReport);

    console.log(`✅ Validation completed: ${validationReport.dataQualityScore}% quality score`);

    return NextResponse.json({
      success: true,
      validation: validationReport,
      summary: {
        qualityScore: validationReport.dataQualityScore,
        criticalIssues: validationReport.validationErrors.filter(e => e.severity === 'critical').length,
        highPriorityIssues: validationReport.validationErrors.filter(e => e.severity === 'high').length,
        autoFixesApplied: autoFix ? validationReport.validationErrors.filter(e => e.suggestedFix).length : 0
      }
    });

  } catch (error: any) {
    console.error('❌ Validation failed:', error);
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
}

async function runQuickValidation(
  sales: any[], 
  report: ValidationReport, 
  autoFix: boolean
): Promise<void> {
  console.log('⚡ Running quick validation...');
  
  for (const sale of sales) {
    const saleData = sale.saleData as StockXSale;
    let isValid = true;

    // Critical field validation
    if (!saleData.orderNumber) {
      report.validationErrors.push({
        recordId: sale.id,
        errorType: 'missing_required_field',
        field: 'orderNumber',
        severity: 'critical',
        description: 'Missing order number - required for tracking and linking',
        suggestedFix: 'Use sale ID as fallback order number'
      });
      isValid = false;

      if (autoFix) {
        saleData.orderNumber = sale.stockxOrderId || sale.id;
        await updateDocument('stockxSales', sale.id, { saleData });
      }
    }

    // Price validation
    if (!saleData.pricing?.salePrice || saleData.pricing.salePrice <= 0) {
      report.validationErrors.push({
        recordId: sale.id,
        orderNumber: saleData.orderNumber,
        errorType: 'invalid_data_format',
        field: 'pricing.salePrice',
        actualValue: String(saleData.pricing?.salePrice),
        severity: 'high',
        description: 'Invalid or missing sale price',
        suggestedFix: 'Check source data or mark for manual review'
      });
      isValid = false;
    }

    // Product validation
    if (!saleData.product?.productName || saleData.product.productName === 'Unknown Product') {
      report.validationErrors.push({
        recordId: sale.id,
        orderNumber: saleData.orderNumber,
        errorType: 'missing_required_field',
        field: 'product.productName',
        severity: 'medium',
        description: 'Missing or generic product name',
        suggestedFix: 'Fetch detailed product data from StockX API'
      });
      isValid = false;
    }

    if (isValid) {
      report.validRecords++;
    } else {
      report.invalidRecords++;
    }
  }
}

async function runComprehensiveValidation(
  sales: any[], 
  report: ValidationReport, 
  autoFix: boolean
): Promise<void> {
  console.log('🔍 Running comprehensive validation...');
  
  // Run quick validation first
  await runQuickValidation(sales, report, autoFix);
  
  // Additional comprehensive checks
  for (const sale of sales) {
    const saleData = sale.saleData as StockXSale;

    // Date validation
    if (saleData.createdAt) {
      const saleDate = new Date(saleData.createdAt);
      const now = new Date();
      
      if (saleDate > now) {
        report.validationErrors.push({
          recordId: sale.id,
          orderNumber: saleData.orderNumber,
          errorType: 'business_logic_violation',
          field: 'createdAt',
          actualValue: saleData.createdAt,
          severity: 'high',
          description: 'Sale date is in the future',
          suggestedFix: 'Verify date format or data source'
        });
      }

      // Check for dates too far in the past (before StockX existed)
      const stockxLaunch = new Date('2016-01-01');
      if (saleDate < stockxLaunch) {
        report.validationErrors.push({
          recordId: sale.id,
          orderNumber: saleData.orderNumber,
          errorType: 'business_logic_violation',
          field: 'createdAt',
          actualValue: saleData.createdAt,
          severity: 'medium',
          description: 'Sale date predates StockX launch',
          suggestedFix: 'Verify date accuracy'
        });
      }
    }

    // Size validation
    if (saleData.variant?.size) {
      const size = saleData.variant.size;
      const validSizePattern = /^(\d+(?:\.\d)?|[XS|S|M|L|XL|XXL]+)$/i;
      
      if (!validSizePattern.test(size) && size !== 'OS' && !size.includes('C')) {
        report.validationErrors.push({
          recordId: sale.id,
          orderNumber: saleData.orderNumber,
          errorType: 'invalid_data_format',
          field: 'variant.size',
          actualValue: size,
          severity: 'medium',
          description: 'Unusual size format detected',
          suggestedFix: 'Standardize size format'
        });
      }
    }

    // Pricing logic validation
    if (saleData.pricing) {
      const { salePrice, sellerFees, totalPayout } = saleData.pricing;
      
      if (sellerFees > salePrice * 0.5) {
        report.validationErrors.push({
          recordId: sale.id,
          orderNumber: saleData.orderNumber,
          errorType: 'business_logic_violation',
          field: 'pricing.sellerFees',
          actualValue: String(sellerFees),
          severity: 'high',
          description: 'Seller fees exceed 50% of sale price',
          suggestedFix: 'Review fee calculation logic'
        });
      }

      if (totalPayout && totalPayout > salePrice) {
        report.validationErrors.push({
          recordId: sale.id,
          orderNumber: saleData.orderNumber,
          errorType: 'business_logic_violation',
          field: 'pricing.totalPayout',
          actualValue: String(totalPayout),
          severity: 'high',
          description: 'Payout exceeds sale price',
          suggestedFix: 'Recalculate payout amount'
        });
      }
    }

    // Order type validation
    if (saleData.orderType && saleData.orderNumber) {
      const expectedType = determineOrderTypeFromNumber(saleData.orderNumber);
      if (expectedType && expectedType !== saleData.orderType) {
        report.validationErrors.push({
          recordId: sale.id,
          orderNumber: saleData.orderNumber,
          errorType: 'business_logic_violation',
          field: 'orderType',
          expectedValue: expectedType,
          actualValue: saleData.orderType,
          severity: 'medium',
          description: 'Order type mismatch with order number pattern',
          suggestedFix: `Set order type to ${expectedType}`
        });

        if (autoFix) {
          saleData.orderType = expectedType as any;
          await updateDocument('stockxSales', sale.id, { saleData });
        }
      }
    }
  }

  // Cross-reference validation (check for duplicates)
  await validateCrossReferences(sales, report);
}

async function runCriticalValidation(
  sales: any[], 
  report: ValidationReport, 
  autoFix: boolean
): Promise<void> {
  console.log('🚨 Running critical validation...');
  
  for (const sale of sales) {
    const saleData = sale.saleData as StockXSale;
    let isValid = true;

    // Only check critical issues that would break functionality
    const criticalChecks = [
      {
        condition: !saleData.orderNumber,
        field: 'orderNumber',
        description: 'Missing order number - breaks tracking'
      },
      {
        condition: !saleData.id,
        field: 'id',
        description: 'Missing ID - breaks record management'
      },
      {
        condition: !saleData.pricing?.salePrice || saleData.pricing.salePrice <= 0,
        field: 'pricing.salePrice',
        description: 'Missing or invalid sale price - breaks calculations'
      }
    ];

    for (const check of criticalChecks) {
      if (check.condition) {
        report.validationErrors.push({
          recordId: sale.id,
          orderNumber: saleData.orderNumber,
          errorType: 'missing_required_field',
          field: check.field,
          severity: 'critical',
          description: check.description
        });
        isValid = false;
      }
    }

    if (isValid) {
      report.validRecords++;
    } else {
      report.invalidRecords++;
    }
  }
}

async function validateCrossReferences(sales: any[], report: ValidationReport): Promise<void> {
  console.log('🔗 Validating cross-references...');
  
  const orderNumberMap = new Map<string, string[]>();
  
  // Build map of order numbers to record IDs
  for (const sale of sales) {
    const orderNumber = sale.saleData?.orderNumber;
    if (orderNumber) {
      if (!orderNumberMap.has(orderNumber)) {
        orderNumberMap.set(orderNumber, []);
      }
      orderNumberMap.get(orderNumber)!.push(sale.id);
    }
  }

  // Check for duplicates
  for (const [orderNumber, recordIds] of orderNumberMap.entries()) {
    if (recordIds.length > 1) {
      for (const recordId of recordIds) {
        report.validationErrors.push({
          recordId,
          orderNumber,
          errorType: 'cross_reference_failure',
          field: 'orderNumber',
          severity: 'high',
          description: `Duplicate order number found in ${recordIds.length} records`,
          suggestedFix: 'Merge duplicate records or verify data source'
        });
      }
    }
  }
}

function determineOrderTypeFromNumber(orderNumber: string): string | null {
  if (orderNumber.startsWith('02-')) return 'FLEX';
  if (orderNumber.startsWith('06-')) return 'DIRECT';
  if (orderNumber.match(/^\d{8,}-/)) return 'STANDARD';
  return null;
}

function calculateDataQualityScore(report: ValidationReport): number {
  if (report.totalRecords === 0) return 100;
  
  const baseScore = (report.validRecords / report.totalRecords) * 100;
  
  // Apply penalties for severity of errors
  let penalties = 0;
  for (const error of report.validationErrors) {
    switch (error.severity) {
      case 'critical': penalties += 10; break;
      case 'high': penalties += 5; break;
      case 'medium': penalties += 2; break;
      case 'low': penalties += 0.5; break;
    }
  }
  
  // Apply penalty as percentage reduction
  const penaltyPercentage = Math.min(penalties / report.totalRecords * 10, 50); // Cap at 50%
  
  return Math.max(0, Math.round(baseScore - penaltyPercentage));
}

function generateValidationRecommendations(report: ValidationReport): Recommendation[] {
  const recommendations: Recommendation[] = [];
  
  // Critical issues recommendations
  const criticalErrors = report.validationErrors.filter(e => e.severity === 'critical');
  if (criticalErrors.length > 0) {
    recommendations.push({
      priority: 'critical',
      category: 'data_completion',
      action: 'fix_critical_data_issues',
      description: `${criticalErrors.length} critical data issues must be resolved immediately`,
      estimatedImpact: 'Prevents system functionality',
      implementationComplexity: 'medium'
    });
  }

  // Missing product names
  const missingProducts = report.validationErrors.filter(e => 
    e.field === 'product.productName' && e.severity === 'medium'
  );
  if (missingProducts.length > 0) {
    recommendations.push({
      priority: 'high',
      category: 'data_accuracy',
      action: 'enrich_product_data',
      description: `${missingProducts.length} records missing product names - fetch from StockX API`,
      estimatedImpact: 'Improves data completeness and user experience',
      implementationComplexity: 'low'
    });
  }

  // Quality score recommendations
  if (report.dataQualityScore < 90) {
    recommendations.push({
      priority: 'medium',
      category: 'data_accuracy',
      action: 'comprehensive_data_cleanup',
      description: 'Data quality score below 90% - recommend full data review and cleanup',
      estimatedImpact: 'Significantly improves data reliability',
      implementationComplexity: 'high'
    });
  }

  // Performance recommendations
  if (report.performanceMetrics.recordsPerSecond < 10) {
    recommendations.push({
      priority: 'low',
      category: 'performance',
      action: 'optimize_validation_performance',
      description: 'Validation performance is slow - consider optimization',
      estimatedImpact: 'Faster data processing',
      implementationComplexity: 'medium'
    });
  }

  return recommendations;
}

export async function GET(request: NextRequest) {
  // Get validation history and status
  const searchParams = request.nextUrl.searchParams;
  const userId = searchParams.get('userId');
  
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  try {
    // Get recent validation reports
    const validationReports = await getDocuments('validationReports');
    const userReports = validationReports
      .filter((report: any) => report.userId === userId)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);

    return NextResponse.json({
      success: true,
      recentReports: userReports,
      summary: userReports.length > 0 ? {
        latestQualityScore: userReports[0].dataQualityScore,
        trend: userReports.length > 1 ? 
          userReports[0].dataQualityScore - userReports[1].dataQualityScore : 0,
        lastValidation: userReports[0].createdAt
      } : null
    });

  } catch (error: any) {
    console.error('❌ Failed to get validation history:', error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}
