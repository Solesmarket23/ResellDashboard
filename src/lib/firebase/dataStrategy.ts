/**
 * Firebase Data Strategy for ResellDashboard
 * Defines what data should be saved to Firebase vs local storage/cache
 */

export const FIREBASE_COLLECTIONS = {
  // ✅ CORE USER DATA - Always save to Firebase
  THEMES: 'user_themes',
  PROFILES: 'user_profiles', 
  PURCHASES: 'purchases',
  SALES: 'user_sales',
  EMAIL_CONFIGS: 'user_email_configs',
  DASHBOARD_SETTINGS: 'user_dashboard_settings',
  
  // ✅ NEW COLLECTIONS - Consider adding these
  WATCHLISTS: 'user_watchlists',
  ALERTS: 'user_alerts',
  SAVED_SEARCHES: 'user_saved_searches',
  USER_SESSIONS: 'user_sessions', // Track last login, preferences
} as const;

export const LOCAL_STORAGE_KEYS = {
  // 🏠 LOCAL STORAGE - Fast access, non-critical data
  RECENT_SEARCHES: 'recent_searches',
  TEMP_FORM_DATA: 'temp_form_data',
  UI_PREFERENCES: 'ui_preferences', // Sidebar state, etc.
  CACHE_TIMESTAMPS: 'cache_timestamps',
  MARKET_DATA_CACHE: 'market_data_cache',
} as const;

export const MEMORY_ONLY = {
  // 💾 MEMORY ONLY - Never persist
  CURRENT_PRICES: 'Live market data',
  LOADING_STATES: 'Component loading states',
  FORM_VALIDATION: 'Form validation states',
  MODAL_STATES: 'Modal open/closed states',
  SEARCH_RESULTS: 'Current search results',
  ERROR_STATES: 'Temporary error messages',
} as const;

/**
 * Data Classification Rules
 */
export const DATA_RULES = {
  // Save to Firebase if:
  SAVE_TO_FIREBASE: [
    'User created/modified',
    'Business critical',
    'Needs sync across devices',
    'Permanent user preferences',
    'Historical data needed',
  ],
  
  // Use Local Storage if:
  USE_LOCAL_STORAGE: [
    'Temporary preferences',
    'Performance optimization',
    'Offline functionality',
    'Caching external data',
    'Session-specific data',
  ],
  
  // Keep in Memory only if:
  MEMORY_ONLY: [
    'Changes frequently',
    'Large file sizes',
    'Real-time data',
    'UI state only',
    'Temporary calculations',
  ],
} as const;

/**
 * Data Size Limits
 */
export const DATA_LIMITS = {
  // Firebase Firestore limits
  FIRESTORE: {
    MAX_DOCUMENT_SIZE: '1MB',
    MAX_BATCH_SIZE: 500,
    MAX_WRITES_PER_SECOND: 1000,
    RECOMMENDED_COLLECTION_SIZE: '10,000 documents',
  },
  
  // Local Storage limits
  LOCAL_STORAGE: {
    MAX_SIZE: '5-10MB per domain',
    RECOMMENDED_SIZE: '1MB per key',
  },
} as const;

/**
 * Component-specific data handling
 */
export const COMPONENT_DATA_STRATEGY = {
  // Dashboard Component
  DASHBOARD: {
    SAVE_TO_FIREBASE: ['active_time_period', 'custom_date_range', 'widget_preferences'],
    USE_LOCAL_STORAGE: ['last_viewed_tab', 'collapsed_sections'],
    MEMORY_ONLY: ['current_metrics', 'loading_states'],
  },
  
  // Purchases Component
  PURCHASES: {
    SAVE_TO_FIREBASE: ['purchase_records', 'manual_purchases', 'gmail_imports'],
    USE_LOCAL_STORAGE: ['column_widths', 'sort_preferences', 'filter_history'],
    MEMORY_ONLY: ['current_filter_state', 'search_query', 'pagination_state'],
  },
  
  // Profile Component
  PROFILE: {
    SAVE_TO_FIREBASE: ['user_info', 'notification_preferences', 'security_settings'],
    USE_LOCAL_STORAGE: ['form_draft', 'unsaved_changes'],
    MEMORY_ONLY: ['form_validation_errors', 'upload_progress'],
  },
  
  // Market Research Component
  MARKET_RESEARCH: {
    SAVE_TO_FIREBASE: ['saved_searches', 'watchlists', 'alerts'],
    USE_LOCAL_STORAGE: ['recent_searches', 'price_history_cache'],
    MEMORY_ONLY: ['live_prices', 'search_results', 'api_responses'],
  },
  
  // Email Integration
  EMAIL_INTEGRATION: {
    SAVE_TO_FIREBASE: ['parsing_rules', 'connected_accounts', 'processing_history'],
    USE_LOCAL_STORAGE: ['oauth_tokens', 'last_sync_time'],
    MEMORY_ONLY: ['email_content', 'parsing_progress', 'sync_status'],
  },
} as const;

/**
 * Performance Optimization Rules
 */
export const PERFORMANCE_RULES = {
  // Batch operations
  BATCH_WRITES: 'Group multiple writes together',
  PAGINATION: 'Load data in chunks of 20-50 items',
  CACHING: 'Cache frequently accessed data locally',
  LAZY_LOADING: 'Load data only when needed',
  
  // Real-time updates
  REAL_TIME_THRESHOLD: 'Only use real-time listeners for critical data',
  POLLING_INTERVAL: 'Poll external APIs every 5-10 minutes max',
  
  // Data cleanup
  AUTO_CLEANUP: 'Remove old cache data after 24 hours',
  ARCHIVE_OLD_DATA: 'Archive purchases older than 2 years',
} as const;

/**
 * Security and Privacy Rules
 */
export const SECURITY_RULES = {
  ENCRYPT_SENSITIVE: ['oauth_tokens', 'api_keys', 'personal_info'],
  USER_ISOLATION: 'All data must be tied to userId',
  DATA_RETENTION: 'Delete user data on account deletion',
  MINIMAL_STORAGE: 'Only store necessary data',
} as const;

/**
 * Cost Optimization
 */
export const COST_OPTIMIZATION = {
  // Firebase costs
  MINIMIZE_READS: 'Cache data locally to reduce reads',
  BATCH_OPERATIONS: 'Group operations to reduce write costs',
  ARCHIVE_OLD_DATA: 'Move old data to cheaper storage',
  
  // Free tier limits
  FIRESTORE_FREE_TIER: {
    READS: '50,000 per day',
    WRITES: '20,000 per day',
    DELETES: '20,000 per day',
    STORAGE: '1 GB',
  },
} as const;

/**
 * Helper function to determine where data should be stored
 */
export function getDataStorageStrategy(
  dataType: string,
  isUserGenerated: boolean,
  isCritical: boolean,
  changeFrequency: 'low' | 'medium' | 'high',
  dataSize: 'small' | 'medium' | 'large'
): 'firebase' | 'localStorage' | 'memory' {
  
  // Critical user data always goes to Firebase
  if (isCritical && isUserGenerated) {
    return 'firebase';
  }
  
  // Large or frequently changing data stays in memory
  if (dataSize === 'large' || changeFrequency === 'high') {
    return 'memory';
  }
  
  // Medium priority data goes to localStorage
  if (changeFrequency === 'medium' && dataSize === 'small') {
    return 'localStorage';
  }
  
  // Default to memory for temporary data
  return 'memory';
}

/**
 * Data migration utilities
 */
export const DATA_MIGRATION = {
  // Move data from localStorage to Firebase
  migrateToFirebase: (key: string, userId: string) => {
    // Implementation would go here
  },
  
  // Clean up old local storage data
  cleanupOldData: (olderThanDays: number) => {
    // Implementation would go here
  },
} as const; 