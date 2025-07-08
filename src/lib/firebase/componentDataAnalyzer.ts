/**
 * Component Data Analyzer
 * Helps determine what data from each component should be saved to Firebase
 */

import { COMPONENT_DATA_STRATEGY, getDataStorageStrategy } from './dataStrategy';

interface ComponentDataItem {
  name: string;
  type: 'state' | 'prop' | 'computed';
  description: string;
  currentStorage: 'none' | 'localStorage' | 'firebase' | 'memory';
  recommendedStorage: 'firebase' | 'localStorage' | 'memory';
  reasoning: string;
  priority: 'high' | 'medium' | 'low';
}

interface ComponentAnalysis {
  componentName: string;
  dataItems: ComponentDataItem[];
  summary: {
    shouldSaveToFirebase: number;
    shouldUseLocalStorage: number;
    shouldKeepInMemory: number;
  };
}

/**
 * Analyze current components and recommend data storage strategy
 */
export class ComponentDataAnalyzer {
  
  /**
   * Analyze the Purchases component
   */
  static analyzePurchasesComponent(): ComponentAnalysis {
    const dataItems: ComponentDataItem[] = [
      {
        name: 'purchases',
        type: 'state',
        description: 'Gmail-imported purchase records',
        currentStorage: 'firebase', // Now saving after our changes
        recommendedStorage: 'firebase',
        reasoning: 'User-critical business data that needs persistence',
        priority: 'high'
      },
      {
        name: 'manualPurchases',
        type: 'state', 
        description: 'Manually added purchase records',
        currentStorage: 'firebase', // Already implemented
        recommendedStorage: 'firebase',
        reasoning: 'User-generated critical business data',
        priority: 'high'
      },
      {
        name: 'columnWidths',
        type: 'state',
        description: 'User-resized table column widths',
        currentStorage: 'memory',
        recommendedStorage: 'localStorage',
        reasoning: 'User preference that improves UX but not critical',
        priority: 'medium'
      },
      {
        name: 'sortBy',
        type: 'state',
        description: 'Current table sort preference',
        currentStorage: 'memory',
        recommendedStorage: 'localStorage',
        reasoning: 'User preference for session continuity',
        priority: 'low'
      },
      {
        name: 'loading',
        type: 'state',
        description: 'Loading state during API calls',
        currentStorage: 'memory',
        recommendedStorage: 'memory',
        reasoning: 'Temporary UI state, no persistence needed',
        priority: 'low'
      },
      {
        name: 'totalValue',
        type: 'computed',
        description: 'Calculated total value of purchases',
        currentStorage: 'memory',
        recommendedStorage: 'memory',
        reasoning: 'Computed value, can be recalculated',
        priority: 'low'
      }
    ];

    return {
      componentName: 'Purchases',
      dataItems,
      summary: {
        shouldSaveToFirebase: dataItems.filter(item => item.recommendedStorage === 'firebase').length,
        shouldUseLocalStorage: dataItems.filter(item => item.recommendedStorage === 'localStorage').length,
        shouldKeepInMemory: dataItems.filter(item => item.recommendedStorage === 'memory').length,
      }
    };
  }

  /**
   * Analyze the Dashboard component
   */
  static analyzeDashboardComponent(): ComponentAnalysis {
    const dataItems: ComponentDataItem[] = [
      {
        name: 'activeTimePeriod',
        type: 'state',
        description: 'Selected time period for dashboard metrics',
        currentStorage: 'firebase', // Already implemented in userDataUtils
        recommendedStorage: 'firebase',
        reasoning: 'User preference that should persist across sessions',
        priority: 'high'
      },
      {
        name: 'customDateRange',
        type: 'state',
        description: 'Custom date range selection',
        currentStorage: 'firebase', // Already implemented
        recommendedStorage: 'firebase',
        reasoning: 'User-defined setting for business analysis',
        priority: 'high'
      },
      {
        name: 'currentMetrics',
        type: 'computed',
        description: 'Calculated profit/loss metrics',
        currentStorage: 'memory',
        recommendedStorage: 'memory',
        reasoning: 'Computed from saved data, no need to persist',
        priority: 'low'
      },
      {
        name: 'showBackground',
        type: 'state',
        description: 'UI preference for background display',
        currentStorage: 'firebase', // In dashboard settings
        recommendedStorage: 'localStorage',
        reasoning: 'UI preference, not critical enough for Firebase',
        priority: 'low'
      }
    ];

    return {
      componentName: 'Dashboard',
      dataItems,
      summary: {
        shouldSaveToFirebase: dataItems.filter(item => item.recommendedStorage === 'firebase').length,
        shouldUseLocalStorage: dataItems.filter(item => item.recommendedStorage === 'localStorage').length,
        shouldKeepInMemory: dataItems.filter(item => item.recommendedStorage === 'memory').length,
      }
    };
  }

  /**
   * Analyze the Profile component
   */
  static analyzeProfileComponent(): ComponentAnalysis {
    const dataItems: ComponentDataItem[] = [
      {
        name: 'userProfile',
        type: 'state',
        description: 'User personal information and settings',
        currentStorage: 'firebase', // Already implemented
        recommendedStorage: 'firebase',
        reasoning: 'Critical user data that must persist',
        priority: 'high'
      },
      {
        name: 'notificationPreferences',
        type: 'state',
        description: 'Email, SMS, push notification settings',
        currentStorage: 'firebase', // In profile data
        recommendedStorage: 'firebase',
        reasoning: 'Important user preferences for functionality',
        priority: 'high'
      },
      {
        name: 'formDraft',
        type: 'state',
        description: 'Unsaved form changes',
        currentStorage: 'memory',
        recommendedStorage: 'localStorage',
        reasoning: 'Prevent data loss during form editing',
        priority: 'medium'
      },
      {
        name: 'validationErrors',
        type: 'state',
        description: 'Form validation error messages',
        currentStorage: 'memory',
        recommendedStorage: 'memory',
        reasoning: 'Temporary UI feedback, no persistence needed',
        priority: 'low'
      }
    ];

    return {
      componentName: 'Profile',
      dataItems,
      summary: {
        shouldSaveToFirebase: dataItems.filter(item => item.recommendedStorage === 'firebase').length,
        shouldUseLocalStorage: dataItems.filter(item => item.recommendedStorage === 'localStorage').length,
        shouldKeepInMemory: dataItems.filter(item => item.recommendedStorage === 'memory').length,
      }
    };
  }

  /**
   * Analyze StockX integration components
   */
  static analyzeStockXComponents(): ComponentAnalysis {
    const dataItems: ComponentDataItem[] = [
      {
        name: 'stockxAuth',
        type: 'state',
        description: 'StockX API authentication tokens',
        currentStorage: 'none',
        recommendedStorage: 'localStorage',
        reasoning: 'Sensitive data, encrypted local storage better than Firebase',
        priority: 'high'
      },
      {
        name: 'savedSearches',
        type: 'state',
        description: 'User-saved product searches',
        currentStorage: 'none',
        recommendedStorage: 'firebase',
        reasoning: 'User-created content that should sync across devices',
        priority: 'medium'
      },
      {
        name: 'watchlist',
        type: 'state',
        description: 'Products user is monitoring',
        currentStorage: 'none',
        recommendedStorage: 'firebase',
        reasoning: 'Important user data for business decisions',
        priority: 'high'
      },
      {
        name: 'currentPrices',
        type: 'state',
        description: 'Live market prices from StockX API',
        currentStorage: 'memory',
        recommendedStorage: 'memory',
        reasoning: 'Live data that changes frequently, cache briefly',
        priority: 'low'
      },
      {
        name: 'priceHistory',
        type: 'state',
        description: 'Historical price data for charts',
        currentStorage: 'memory',
        recommendedStorage: 'localStorage',
        reasoning: 'Large data set, cache locally to reduce API calls',
        priority: 'medium'
      }
    ];

    return {
      componentName: 'StockX Integration',
      dataItems,
      summary: {
        shouldSaveToFirebase: dataItems.filter(item => item.recommendedStorage === 'firebase').length,
        shouldUseLocalStorage: dataItems.filter(item => item.recommendedStorage === 'localStorage').length,
        shouldKeepInMemory: dataItems.filter(item => item.recommendedStorage === 'memory').length,
      }
    };
  }

  /**
   * Generate full app analysis
   */
  static analyzeFullApp(): ComponentAnalysis[] {
    return [
      this.analyzePurchasesComponent(),
      this.analyzeDashboardComponent(),
      this.analyzeProfileComponent(),
      this.analyzeStockXComponents(),
    ];
  }

  /**
   * Generate recommendations report
   */
  static generateReport(): {
    summary: {
      totalItems: number;
      firebaseItems: number;
      localStorageItems: number;
      memoryItems: number;
    };
    priorityActions: ComponentDataItem[];
    costEstimate: {
      firebaseWrites: number;
      firebaseReads: number;
      estimatedMonthlyCost: string;
    };
  } {
    const analyses = this.analyzeFullApp();
    const allItems = analyses.flatMap(analysis => analysis.dataItems);
    
    const firebaseItems = allItems.filter(item => item.recommendedStorage === 'firebase');
    const localStorageItems = allItems.filter(item => item.recommendedStorage === 'localStorage');
    const memoryItems = allItems.filter(item => item.recommendedStorage === 'memory');
    
    const priorityActions = allItems
      .filter(item => 
        item.priority === 'high' && 
        item.currentStorage !== item.recommendedStorage
      )
      .sort((a, b) => a.priority.localeCompare(b.priority));

    return {
      summary: {
        totalItems: allItems.length,
        firebaseItems: firebaseItems.length,
        localStorageItems: localStorageItems.length,
        memoryItems: memoryItems.length,
      },
      priorityActions,
      costEstimate: {
        firebaseWrites: firebaseItems.length * 30, // Estimate 30 writes per item per month
        firebaseReads: firebaseItems.length * 100, // Estimate 100 reads per item per month
        estimatedMonthlyCost: 'Under $1 (within free tier)',
      }
    };
  }
} 