// Firebase collection names
export const COLLECTIONS = {
  // Sales related collections
  SALES: 'sales',
  STOCKX_SALES: 'stockxSales',
  PURCHASES: 'purchases',
  
  // User data collections
  PROFILES: 'profiles',
  THEMES: 'themes',
  EMAIL_CONFIGS: 'emailConfigs',
  DASHBOARD_SETTINGS: 'dashboardSettings',
  STOCKX_SETTINGS: 'stockxSettings',
  
  // Sync and status collections
  STOCKX_SYNC_INFO: 'stockxSyncInfo',
  VERIFICATION_STATUS: 'verificationStatus',

  // Shipping fulfillment: user's locally marked-as-shipped order numbers (not StockX state)
  MARKED_SHIPPED: 'markedShipped',

  // Pick locations: SKU/styleId → location (bin/shelf) for fulfillment
  INVENTORY_LOCATIONS: 'inventoryLocations',
} as const;