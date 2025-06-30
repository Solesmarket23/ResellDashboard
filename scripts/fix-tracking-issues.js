#!/usr/bin/env node

/**
 * Fix Tracking Issues Script
 * 
 * This script identifies and fixes tracking number extraction issues,
 * specifically focusing on UPS tracking numbers that weren't properly extracted.
 * 
 * Usage:
 * node scripts/fix-tracking-issues.js --dry-run
 * node scripts/fix-tracking-issues.js --fix
 */

const fs = require('fs');
const path = require('path');

// Known tracking fixes based on user input
const KNOWN_FIXES = [
  {
    orderNumber: '01-95H9NC36ST',
    correctTracking: '1Z24WA430206362750',
    reason: 'User provided correct UPS tracking number',
    priority: 'HIGH'
  }
];

// Improved UPS tracking extraction function
function extractUPSTracking(content) {
  const upsPattern = /(1Z[0-9A-Z]{16})/gi;
  const matches = content.match(upsPattern) || [];
  
  for (const match of matches) {
    const candidate = match.replace(/[<>]/g, '').trim();
    if (/^1Z[0-9A-Z]{16}$/i.test(candidate)) {
      return candidate.toUpperCase();
    }
  }
  return null;
}

// Analyze tracking extraction patterns
function analyzeTrackingPatterns(emailContent, currentTracking) {
  const analysis = {
    hasUPSTracking: false,
    upsTrackingNumbers: [],
    currentTracking: currentTracking,
    shouldBeUPS: false,
    issue: null
  };

  // Find all UPS tracking numbers in content
  const upsNumbers = emailContent.match(/(1Z[0-9A-Z]{16})/gi) || [];
  analysis.upsTrackingNumbers = upsNumbers.map(num => num.toUpperCase());
  analysis.hasUPSTracking = upsNumbers.length > 0;

  // Check if current tracking is UPS format
  const currentIsUPS = /^1Z[0-9A-Z]{16}$/i.test(currentTracking || '');

  if (analysis.hasUPSTracking && !currentIsUPS) {
    analysis.shouldBeUPS = true;
    analysis.issue = 'UPS_NOT_EXTRACTED';
  }

  return analysis;
}

// Simulate database operations (replace with actual Firebase calls)
class MockDatabase {
  constructor() {
    this.data = this.loadMockData();
  }

  loadMockData() {
    // This would be replaced with actual Firebase queries
    return [
      {
        id: 'mock1',
        orderNumber: '01-95H9NC36ST',
        tracking: '888327774362', // Incorrect - should be UPS tracking
        rawEmailContent: `
          <html><body>
            <h1>Order Shipped: Nike Air Jordan 1 Retro</h1>
            <p>Order number: 01-95H9NC36ST</p>
            <p>Your order has shipped via UPS.</p>
            <p>Track your package: 1Z24WA430206362750</p>
            <p>Other numbers: 888327774362, 150.00, 2024</p>
          </body></html>
        `,
        productName: 'Nike Air Jordan 1 Retro',
        status: 'Shipped'
      },
      {
        id: 'mock2',
        orderNumber: '01-B56RWN58RD',
        tracking: '882268115454',
        rawEmailContent: `
          <html><body>
            <h1>Order Delivered: Yeezy Boost 350</h1>
            <p>Order number: 01-B56RWN58RD</p>
            <p>Tracking: 1Z24WA430227721340</p>
            <p>StockX number: 882268115454</p>
          </body></html>
        `,
        productName: 'Yeezy Boost 350',
        status: 'Delivered'
      }
    ];
  }

  async findByOrderNumber(orderNumber) {
    return this.data.find(item => item.orderNumber === orderNumber);
  }

  async updateTracking(id, newTracking) {
    const item = this.data.find(item => item.id === id);
    if (item) {
      item.tracking = newTracking;
      item.lastUpdated = new Date().toISOString();
      item.fixedBy = 'tracking-fix-script';
      return true;
    }
    return false;
  }

  async getAllPurchases() {
    return this.data;
  }
}

// Main analysis and fix logic
async function analyzeAndFixTracking(options = {}) {
  const { dryRun = true, fixSimilar = false } = options;
  
  console.log(`🔍 ${dryRun ? 'ANALYZING' : 'FIXING'} tracking issues...`);
  
  const db = new MockDatabase();
  const results = {
    dryRun,
    fixes: [],
    similarIssues: [],
    summary: {
      totalAnalyzed: 0,
      issuesFound: 0,
      fixesApplied: 0
    }
  };

  // Get all purchases
  const purchases = await db.getAllPurchases();
  results.summary.totalAnalyzed = purchases.length;

  console.log(`📊 Analyzing ${purchases.length} purchases...`);

  // Process known fixes first
  for (const knownFix of KNOWN_FIXES) {
    console.log(`\n🎯 Processing known fix: ${knownFix.orderNumber}`);
    
    const purchase = await db.findByOrderNumber(knownFix.orderNumber);
    if (purchase) {
      const currentTracking = purchase.tracking || 'No tracking';
      const needsUpdate = currentTracking !== knownFix.correctTracking;
      
      if (needsUpdate) {
        const fix = {
          orderNumber: knownFix.orderNumber,
          currentTracking,
          correctTracking: knownFix.correctTracking,
          reason: knownFix.reason,
          priority: knownFix.priority,
          productName: purchase.productName || 'Unknown'
        };
        
        results.fixes.push(fix);
        results.summary.issuesFound++;
        
        console.log(`  ❌ Current: ${currentTracking}`);
        console.log(`  ✅ Correct: ${knownFix.correctTracking}`);
        console.log(`  📝 Reason: ${knownFix.reason}`);
        
        if (!dryRun) {
          const success = await db.updateTracking(purchase.id, knownFix.correctTracking);
          if (success) {
            results.summary.fixesApplied++;
            console.log(`  🔧 Applied fix successfully`);
          } else {
            console.log(`  ❌ Failed to apply fix`);
          }
        }
      } else {
        console.log(`  ✅ Already correct: ${currentTracking}`);
      }
    } else {
      console.log(`  ⚠️  Order not found in database`);
    }
  }

  // Find similar issues if requested
  if (fixSimilar) {
    console.log(`\n🔍 Looking for similar UPS tracking issues...`);
    
    for (const purchase of purchases) {
      // Skip if already in known fixes
      const isKnownFix = KNOWN_FIXES.some(fix => fix.orderNumber === purchase.orderNumber);
      if (isKnownFix) continue;

      const analysis = analyzeTrackingPatterns(
        purchase.rawEmailContent || '', 
        purchase.tracking
      );

      if (analysis.issue === 'UPS_NOT_EXTRACTED' && analysis.upsTrackingNumbers.length > 0) {
        const similarIssue = {
          orderNumber: purchase.orderNumber,
          currentTracking: purchase.tracking || 'No tracking',
          suggestedTracking: analysis.upsTrackingNumbers[0],
          reason: 'UPS tracking found in email but not extracted correctly',
          confidence: 'MEDIUM',
          productName: purchase.productName || 'Unknown'
        };
        
        results.similarIssues.push(similarIssue);
        results.summary.issuesFound++;
        
        console.log(`  📦 ${purchase.orderNumber}: ${purchase.productName}`);
        console.log(`    Current: ${similarIssue.currentTracking}`);
        console.log(`    UPS Found: ${similarIssue.suggestedTracking}`);
      }
    }
  }

  return results;
}

// Generate fix report
function generateFixReport(results) {
  const report = [];
  
  report.push('# Tracking Number Fix Report');
  report.push(`Generated: ${new Date().toISOString()}`);
  report.push('');
  
  report.push('## Summary');
  report.push(`- Total purchases analyzed: ${results.summary.totalAnalyzed}`);
  report.push(`- Issues found: ${results.summary.issuesFound}`);
  report.push(`- Fixes applied: ${results.summary.fixesApplied}`);
  report.push(`- Mode: ${results.dryRun ? 'DRY RUN' : 'LIVE FIXES'}`);
  report.push('');
  
  if (results.fixes.length > 0) {
    report.push('## Known Fixes Applied');
    results.fixes.forEach(fix => {
      report.push(`### ${fix.orderNumber} - ${fix.productName}`);
      report.push(`- **Current**: ${fix.currentTracking}`);
      report.push(`- **Correct**: ${fix.correctTracking}`);
      report.push(`- **Reason**: ${fix.reason}`);
      report.push(`- **Priority**: ${fix.priority}`);
      report.push('');
    });
  }
  
  if (results.similarIssues.length > 0) {
    report.push('## Similar Issues Found');
    results.similarIssues.forEach(issue => {
      report.push(`### ${issue.orderNumber} - ${issue.productName}`);
      report.push(`- **Current**: ${issue.currentTracking}`);
      report.push(`- **Suggested**: ${issue.suggestedTracking}`);
      report.push(`- **Reason**: ${issue.reason}`);
      report.push(`- **Confidence**: ${issue.confidence}`);
      report.push('');
    });
  }
  
  report.push('## Next Steps');
  if (results.dryRun) {
    report.push('1. Review the issues found above');
    report.push('2. Run with `--fix` flag to apply the known fixes');
    report.push('3. Manually review and apply similar issues as needed');
  } else {
    report.push('1. Verify that the fixes were applied correctly in your database');
    report.push('2. Test the updated tracking numbers');
    report.push('3. Consider updating the email parsing logic to prevent future issues');
  }
  
  return report.join('\n');
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--fix');
  const fixSimilar = args.includes('--similar');
  
  console.log('🚀 Tracking Number Fix Script');
  console.log('================================');
  
  try {
    const results = await analyzeAndFixTracking({ dryRun, fixSimilar });
    
    // Generate and display report
    const report = generateFixReport(results);
    console.log('\n📋 FINAL REPORT:');
    console.log('================');
    console.log(report);
    
    // Save report to file
    const reportPath = path.join(__dirname, '..', 'tracking-fix-report.md');
    fs.writeFileSync(reportPath, report);
    console.log(`\n💾 Report saved to: ${reportPath}`);
    
    // Provide next steps
    console.log('\n🎯 NEXT STEPS:');
    if (dryRun) {
      console.log('1. Review the report above');
      console.log('2. Run: node scripts/fix-tracking-issues.js --fix');
      console.log('3. Optionally: node scripts/fix-tracking-issues.js --fix --similar');
    } else {
      console.log('1. Check your database to verify fixes were applied');
      console.log('2. Update your email parsing logic to prevent future issues');
      console.log('3. Test the corrected tracking numbers');
    }
    
  } catch (error) {
    console.error('❌ Error running fix script:', error.message);
    process.exit(1);
  }
}

// Export for testing
module.exports = {
  extractUPSTracking,
  analyzeTrackingPatterns,
  analyzeAndFixTracking,
  KNOWN_FIXES
};

// Run if called directly
if (require.main === module) {
  main();
} 