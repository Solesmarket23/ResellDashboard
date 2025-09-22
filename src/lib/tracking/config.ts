// Tracking API configuration
export const trackingConfig = {
  // AfterShip API (Universal tracking service)
  afterShip: {
    apiKey: process.env.AFTERSHIP_API_KEY,
    baseUrl: 'https://api.aftership.com/tracking/2025-07',
    enabled: !!process.env.AFTERSHIP_API_KEY
  },
  
  // UPS API
  ups: {
    // OAuth credentials (preferred)
    oauthClientId: process.env.UPS_OAUTH_CLIENT_ID,
    oauthClientSecret: process.env.UPS_OAUTH_CLIENT_SECRET,
    oauthRedirectUri: process.env.UPS_OAUTH_REDIRECT_URI,
    oauthScope: process.env.UPS_OAUTH_SCOPE,
    // Client credentials (fallback)
    clientId: process.env.UPS_CLIENT_ID,
    clientSecret: process.env.UPS_CLIENT_SECRET,
    accountNumber: process.env.UPS_ACCOUNT_NUMBER,
    baseUrl: process.env.UPS_BASE_URL || 'https://wwwcie.ups.com',
    // Legacy API credentials (if needed)
    apiKey: process.env.UPS_API_KEY,
    username: process.env.UPS_API_USERNAME,
    password: process.env.UPS_API_PASSWORD,
    enabled: !!(process.env.UPS_OAUTH_CLIENT_ID && process.env.UPS_OAUTH_CLIENT_SECRET) || 
             !!(process.env.UPS_CLIENT_ID && process.env.UPS_CLIENT_SECRET && process.env.UPS_ACCOUNT_NUMBER) ||
             !!(process.env.UPS_API_KEY && process.env.UPS_API_USERNAME && process.env.UPS_API_PASSWORD)
  },
  
  // FedEx API
  fedex: {
    apiKey: process.env.FEDEX_API_KEY,
    secretKey: process.env.FEDEX_SECRET_KEY,
    baseUrl: process.env.FEDEX_BASE_URL || 'https://apis.fedex.com',
    enabled: !!(process.env.FEDEX_API_KEY && process.env.FEDEX_SECRET_KEY)
  },
  
  // USPS API
  usps: {
    apiKey: process.env.USPS_API_KEY,
    baseUrl: 'https://secure.shippingapis.com/ShippingAPI.dll',
    enabled: !!process.env.USPS_API_KEY
  },
  
  // General settings
  refreshInterval: 60000, // 1 minute
  maxRetries: 3,
  timeout: 10000, // 10 seconds
  rateLimitDelay: 1000 // 1 second between requests
};

// Helper function to check if any tracking APIs are available
export function hasTrackingAPIs(): boolean {
  return trackingConfig.afterShip.enabled || 
         trackingConfig.ups.enabled || 
         trackingConfig.fedex.enabled || 
         trackingConfig.usps.enabled;
}

// Helper function to get available carriers
export function getAvailableCarriers(): string[] {
  const carriers: string[] = [];
  
  if (trackingConfig.afterShip.enabled) carriers.push('AfterShip');
  if (trackingConfig.ups.enabled) carriers.push('UPS');
  if (trackingConfig.fedex.enabled) carriers.push('FedEx');
  if (trackingConfig.usps.enabled) carriers.push('USPS');
  
  return carriers;
}
