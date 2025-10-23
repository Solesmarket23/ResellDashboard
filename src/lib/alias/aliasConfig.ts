// Alias API Configuration
export const ALIAS_API_CONFIG = {
  baseUrl: 'https://api.alias.org/api/v1',
  version: 'v1.3.4',
  timeout: 30000, // 30 seconds
  retryAttempts: 3,
  retryDelay: 1000, // 1 second
};

export const ALIAS_ENDPOINTS = {
  // Authentication
  test: '/test',
  
  // Catalog
  catalog: '/catalog',
  catalogItem: (id: string) => `/catalog/${id}`,
  
  // Pricing Insights
  pricingAvailability: (catalogId: string) => `/pricing_insights/availabilities/${catalogId}`,
  pricingInsights: '/pricing_insights/availability',
  offerHistogram: '/pricing_insights/offer_histogram',
  recentSales: '/pricing_insights/recent_sales',
  
  // Listings
  listings: '/listings',
  listing: (id: string) => `/listings/${id}`,
  listingActivate: (id: string) => `/listings/${id}/activate`,
  listingDeactivate: (id: string) => `/listings/${id}/deactivate`,
  listingMetadata: (id: string) => `/listings/${id}/metadata`,
  listingMetadataDelete: (id: string) => `/listings/${id}/metadata_delete`,
  
  // Pictures
  pictures: '/pictures',
  picture: (id: string) => `/pictures/${id}`,
  
  // Orders
  orders: '/orders',
  order: (id: string) => `/orders/${id}`,
  orderCancel: (id: string) => `/orders/${id}/cancel`,
  orderConfirm: (id: string) => `/orders/${id}/confirm`,
  orderGenerateLabel: (id: string) => `/orders/${id}/generate_label`,
  orderRegenerateLabel: (id: string) => `/orders/${id}/regenerate_label`,
  orderShip: (id: string) => `/orders/${id}/ship`,
  
  // Batch Operations
  batchListings: '/listings/batch',
  batchListing: (id: string) => `/listings/batch/${id}`,
  batchActivate: '/listings/batch_activate',
  batchCreate: '/listings/batch_create',
  batchDeactivate: '/listings/batch_deactivate',
  batchDelete: '/listings/batch_delete',
  batchQuota: '/listings/batch_operation/quota',
  batchOperations: (id: string) => `/listings/batch_operations/${id}`,
  batchUpdate: '/listings/batch_update',
};

export const ALIAS_ENUMS = {
  // Product Conditions
  PRODUCT_CONDITION: {
    NEW: 'PRODUCT_CONDITION_NEW',
    USED: 'PRODUCT_CONDITION_USED',
    NEW_WITH_DEFECTS: 'PRODUCT_CONDITION_NEW_WITH_DEFECTS',
  },
  
  // Packaging Conditions
  PACKAGING_CONDITION: {
    GOOD_CONDITION: 'PACKAGING_CONDITION_GOOD_CONDITION',
    MISSING_LID: 'PACKAGING_CONDITION_MISSING_LID',
    BADLY_DAMAGED: 'PACKAGING_CONDITION_BADLY_DAMAGED',
    NO_ORIGINAL_BOX: 'PACKAGING_CONDITION_NO_ORIGINAL_BOX',
  },
  
  // Size Units
  SIZE_UNIT: {
    US: 'SIZE_UNIT_US',
    UK: 'SIZE_UNIT_UK',
    IT: 'SIZE_UNIT_IT',
    FR: 'SIZE_UNIT_FR',
    EU: 'SIZE_UNIT_EU',
    JP: 'SIZE_UNIT_JP',
  },
  
  // Listing Status
  LISTING_STATUS: {
    ACTIVE: 'LISTING_STATUS_ACTIVE',
    INACTIVE: 'LISTING_STATUS_INACTIVE',
    PENDING: 'LISTING_STATUS_PENDING',
  },
  
  // Order Status
  ORDER_STATUS: {
    CONFIRMED: 'ORDER_STATUS_CONFIRMED',
    IN_TRANSIT: 'ORDER_STATUS_IN_TRANSIT',
    COMPLETED: 'ORDER_STATUS_COMPLETED',
    CANCELED: 'ORDER_STATUS_CANCELED',
    LABEL_GENERATED: 'ORDER_STATUS_LABEL_GENERATED',
  },
  
  // Fulfillment Status
  FULFILLMENT_STATUS: {
    DELIVERED: 'FULFILLMENT_STATUS_DELIVERED',
    IN_TRANSIT: 'FULFILLMENT_STATUS_IN_TRANSIT',
    SELLER_SHIPPED: 'FULFILLMENT_STATUS_SELLER_SHIPPED',
  },
  
  // Picture Types
  PICTURE_TYPE: {
    OUTER: 'PICTURE_TYPE_OUTER',
    INNER: 'PICTURE_TYPE_INNER',
    UNDER: 'PICTURE_TYPE_UNDER',
    TOP: 'PICTURE_TYPE_TOP',
    BACK: 'PICTURE_TYPE_BACK',
    TAG: 'PICTURE_TYPE_TAG',
    PACKAGING: 'PICTURE_TYPE_PACKAGING',
    SIZE_TAG: 'PICTURE_TYPE_SIZE_TAG',
    INTERIOR: 'PICTURE_TYPE_INTERIOR',
    EXTRA: 'PICTURE_TYPE_EXTRA',
  },
  
  // Label Types
  LABEL_TYPE: {
    SHIPPING: 'LABEL_TYPE_SHIPPING',
    DROPOFF: 'LABEL_TYPE_DROPOFF',
  },
  
  // Batch Status
  BATCH_STATUS: {
    PENDING: 'BATCH_STATUS_PENDING',
    IN_PROGRESS: 'BATCH_STATUS_IN_PROGRESS',
    COMPLETED: 'BATCH_STATUS_COMPLETED',
  },
  
  // Listing Defects
  LISTING_DEFECT: {
    HAS_ODOR: 'LISTING_DEFECT_HAS_ODOR',
    HAS_DISCOLORATION: 'LISTING_DEFECT_HAS_DISCOLORATION',
    HAS_MISSING_INSOLES: 'LISTING_DEFECT_HAS_MISSING_INSOLES',
    HAS_SCUFFS: 'LISTING_DEFECT_HAS_SCUFFS',
    HAS_TEARS: 'LISTING_DEFECT_HAS_TEARS',
    B_GRADE: 'LISTING_DEFECT_B_GRADE',
  },
};
