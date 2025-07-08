import { NextRequest, NextResponse } from 'next/server';
import { ComponentDataAnalyzer } from '../../../../lib/firebase/componentDataAnalyzer';

export async function GET(request: NextRequest) {
  try {
    // Generate full analysis report
    const fullAnalysis = ComponentDataAnalyzer.analyzeFullApp();
    const report = ComponentDataAnalyzer.generateReport();
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      componentAnalyses: fullAnalysis,
      report,
      recommendations: {
        immediate: report.priorityActions.filter(item => item.priority === 'high'),
        future: report.priorityActions.filter(item => item.priority === 'medium'),
        optional: report.priorityActions.filter(item => item.priority === 'low'),
      },
      currentStatus: {
        wellImplemented: fullAnalysis.flatMap(a => a.dataItems)
          .filter(item => item.currentStorage === item.recommendedStorage)
          .map(item => ({ 
            component: fullAnalysis.find(a => a.dataItems.includes(item))?.componentName,
            item: item.name,
            storage: item.currentStorage 
          })),
        needsImprovement: fullAnalysis.flatMap(a => a.dataItems)
          .filter(item => item.currentStorage !== item.recommendedStorage)
          .map(item => ({ 
            component: fullAnalysis.find(a => a.dataItems.includes(item))?.componentName,
            item: item.name,
            current: item.currentStorage,
            recommended: item.recommendedStorage,
            reasoning: item.reasoning
          }))
      }
    });
    
  } catch (error) {
    console.error('Error generating data strategy analysis:', error);
    return NextResponse.json({ 
      error: 'Failed to generate analysis',
      details: error.message 
    }, { status: 500 });
  }
} 