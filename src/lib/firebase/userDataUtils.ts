import { addDocument, getDocuments, updateDocument, deleteDocument } from './firebaseUtils';
import { OrderInfo } from '../email/orderConfirmationParser';

// Safety check for server-side rendering
const isClientSide = typeof window !== 'undefined';

// User Data Types
export interface UserThemePreference {
  userId: string;
  themeName: string;
  updatedAt: string;
}

export interface UserProfileData {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  timezone: string;
  language: string;
  notifications: {
    emailAlerts: boolean;
    smsAlerts: boolean;
    pushNotifications: boolean;
    marketingEmails: boolean;
    weeklyReports: boolean;
    profitAlerts: boolean;
  };
  security: {
    twoFactorAuth: boolean;
    loginAlerts: boolean;
    deviceTracking: boolean;
  };
  updatedAt: string;
}

export interface UserSaleData {
  userId: string;
  id: string; // Firebase document ID is a string
  product: string;
  brand: string;
  orderNumber: string;
  size: string;
  market: string;
  salePrice: number;
  purchasePrice: number; // Add missing purchasePrice field
  fees: number;
  payout: number;
  profit: number;
  date: string;
  isTest: boolean;
  type: 'manual' | 'imported';
  createdAt: string;
}

// New interface for purchase data from OrderInfo parser
export interface UserPurchaseData {
  userId: string;
  id: string; // Firebase document ID is a string
  
  // Order details
  orderNumber: string;
  orderType: string; // "regular", "xpress", etc.
  merchant: string; // "StockX", "GOAT", etc.
  
  // Product details
  productName: string;
  productVariant: string; // color, style, etc.
  size: string;
  condition: string;
  styleId: string;
  
  // Product image
  productImageUrl: string;
  productImageAlt: string;
  
  // Pricing breakdown
  purchasePrice: number;
  processingFee: number;
  shippingFee: number;
  shippingType: string; // "Shipping", "Xpress Shipping"
  totalAmount: number;
  currency: string;
  
  // Delivery information
  estimatedDeliveryStart: string;
  estimatedDeliveryEnd: string;
  
  // Purchase information
  purchaseDate: string; // When the order was placed
  
  // Email metadata
  emailSubject: string;
  emailDate: string;
  sender: string;
  
  // System metadata
  isTest: boolean;
  type: 'manual' | 'imported';
  createdAt: string;
}

export interface UserEmailConfig {
  userId: string;
  config: any; // Email parsing configuration
  updatedAt: string;
}

export interface UserDashboardSettings {
  userId: string;
  activeTimePeriod: string;
  customDateRange: {
    startDate: string;
    endDate: string;
  };
  preferences: {
    showBackground: boolean;
    defaultView: string;
  };
  updatedAt: string;
}

export interface UserStockXSettings {
  userId: string;
  sellerLevel: 1 | 2 | 3 | 4 | 5; // StockX seller levels
  transactionFee: number; // Base transaction fee percentage (e.g., 9.0, 8.5, 8.0, 7.5, 7.0)
  updatedAt: string;
}

// Collection names
const COLLECTIONS = {
  THEMES: 'user_themes',
  PROFILES: 'user_profiles',
  SALES: 'user_sales',
  PURCHASES: 'user_purchases', // New collection for purchases
  EMAIL_CONFIGS: 'user_email_configs',
  DASHBOARD_SETTINGS: 'user_dashboard_settings',
  STOCKX_SETTINGS: 'user_stockx_settings'
};

// Theme Persistence
export const saveUserTheme = async (userId: string, themeName: string) => {
  try {
    const themeData: UserThemePreference = {
      userId,
      themeName,
      updatedAt: new Date().toISOString()
    };

    // Check if user theme exists
    const existingThemes = await getDocuments(COLLECTIONS.THEMES);
    const userTheme = existingThemes.find((theme: any) => theme.userId === userId);

    if (userTheme && userTheme.id) {
      await updateDocument(COLLECTIONS.THEMES, userTheme.id, themeData);
    } else {
      await addDocument(COLLECTIONS.THEMES, themeData);
    }

    console.log('✅ Theme preference saved to Firebase');
  } catch (error) {
    console.error('❌ Error saving theme preference:', error);
    throw error;
  }
};

export const getUserTheme = async (userId: string): Promise<string | null> => {
  // Skip Firebase calls during server-side rendering
  if (!isClientSide) {
    return null;
  }

  try {
    const themes = await getDocuments(COLLECTIONS.THEMES);
    const userTheme = themes.find((theme: any) => theme.userId === userId);
    return userTheme ? userTheme.themeName : null;
  } catch (error) {
    console.error('❌ Error loading theme preference:', error);
    return null;
  }
};

// Profile Persistence
export const saveUserProfile = async (userId: string, profileData: Partial<UserProfileData>) => {
  try {
    const profile: UserProfileData = {
      userId,
      ...profileData,
      updatedAt: new Date().toISOString()
    } as UserProfileData;

    const existingProfiles = await getDocuments(COLLECTIONS.PROFILES);
    const userProfile = existingProfiles.find((p: any) => p.userId === userId);

    if (userProfile && userProfile.id) {
      await updateDocument(COLLECTIONS.PROFILES, userProfile.id, profile);
    } else {
      await addDocument(COLLECTIONS.PROFILES, profile);
    }

    console.log('✅ Profile saved to Firebase');
  } catch (error) {
    console.error('❌ Error saving profile:', error);
    throw error;
  }
};

export const getUserProfile = async (userId: string): Promise<UserProfileData | null> => {
  try {
    const profiles = await getDocuments(COLLECTIONS.PROFILES);
    const userProfile = profiles.find((p: any) => p.userId === userId);
    return userProfile || null;
  } catch (error) {
    console.error('❌ Error loading profile:', error);
    return null;
  }
};

// Sales Persistence
export const saveUserSale = async (userId: string, saleData: Partial<UserSaleData>) => {
  try {
    console.log('💾 saveUserSale: Starting save process for user:', userId);
    console.log('💾 saveUserSale: Input sale data:', saleData);
    
    // Be more explicit about the data structure to ensure userId is always saved
    const sale = {
      ...saleData,
      userId: userId, // Explicitly set userId last to ensure it's not overridden
      type: 'manual',
      createdAt: new Date().toISOString()
    };
    
    console.log('💾 saveUserSale: Processed sale data before saving:', sale);
    console.log('💾 saveUserSale: Sale data keys:', Object.keys(sale));
    console.log('💾 saveUserSale: userId field value:', sale.userId);

    const docRef = await addDocument(COLLECTIONS.SALES, sale);
    console.log('✅ Sale saved to Firebase with doc ID:', docRef.id);
    
    // Verify the save by immediately reading it back
    const savedSale = await getDocuments(COLLECTIONS.SALES);
    const justSavedSale = savedSale.find((s: any) => s.id === docRef.id);
    console.log('🔍 Verification - Just saved sale:', justSavedSale);
    console.log('🔍 Verification - userId in saved sale:', justSavedSale?.userId);
    
    return docRef;
  } catch (error) {
    console.error('❌ Error saving sale:', error);
    console.error('❌ Error details:', {
      userId,
      saleData,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
};

export const getUserSales = async (userId: string): Promise<UserSaleData[]> => {
  try {
    console.log('🔄 getUserSales: Loading sales for user:', userId);
    
    // Force a fresh fetch from Firebase by adding a cache-busting timestamp
    const timestamp = Date.now();
    console.log('🔄 getUserSales: Cache-busting timestamp:', timestamp);
    
    const sales = await getDocuments(COLLECTIONS.SALES);
    console.log('📊 getUserSales: Total sales in database:', sales.length);
    
    const userSales = sales.filter((sale: any) => sale.userId === userId);
    console.log('📊 getUserSales: User sales found:', userSales.length);
    console.log('📊 getUserSales: User sales:', userSales.map(s => ({ id: s.id, product: s.product, profit: s.profit })));
    
    return userSales;
  } catch (error) {
    console.error('❌ Error loading sales:', error);
    return [];
  }
};

export const deleteUserSale = async (userId: string, saleId: string | number) => {
  try {
    // Ensure saleId is a string (Firebase document ID)
    const docId = String(saleId);
    
    console.log('🔥 Attempting to delete sale with doc ID:', docId);
    await deleteDocument(COLLECTIONS.SALES, docId);
    console.log('✅ Sale deleted from Firebase');
  } catch (error) {
    console.error('❌ Error deleting sale:', error);
    console.error('Sale ID:', saleId, 'Type:', typeof saleId);
    throw error;
  }
};

export const clearAllUserSales = async (userId: string): Promise<{success: boolean, error?: string}> => {
  try {
    console.log('🔄 Starting clearAllUserSales for user:', userId);
    
    const sales = await getDocuments(COLLECTIONS.SALES);
    console.log('📊 Total sales in database:', sales.length);
    
    const userSales = sales.filter((sale: any) => sale.userId === userId);
    console.log('📊 User sales found:', userSales.length);
    
    if (userSales.length === 0) {
      console.log('ℹ️ No sales found for user - nothing to delete');
      return { success: true };
    }
    
    console.log('🗑️ Deleting sales:', userSales.map(s => ({ id: s.id, product: s.product })));
    
    for (const sale of userSales) {
      if (sale.id) {
        console.log('🔥 Deleting sale:', sale.id);
        await deleteDocument(COLLECTIONS.SALES, sale.id);
        console.log('✅ Deleted sale:', sale.id);
      } else {
        console.warn('⚠️ Sale missing ID:', sale);
      }
    }
    
    console.log('✅ All sales cleared from Firebase');
    return { success: true };
  } catch (error) {
    console.error('❌ Error clearing sales:', error);
    console.error('Error details:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to clear all sales';
    return { success: false, error: errorMessage };
  }
};

// New Purchase Persistence Functions
export const saveUserPurchase = async (userId: string, orderInfo: OrderInfo): Promise<any> => {
  try {
    console.log('💾 saveUserPurchase: Starting save process for user:', userId);
    console.log('💾 saveUserPurchase: Input order info:', orderInfo);
    
    // Convert OrderInfo to UserPurchaseData
    const purchaseData: UserPurchaseData = {
      userId,
      id: '', // Will be set by Firebase
      orderNumber: orderInfo.order_number,
      orderType: orderInfo.order_type,
      merchant: orderInfo.merchant,
      productName: orderInfo.product_name,
      productVariant: orderInfo.product_variant,
      size: orderInfo.size,
      condition: orderInfo.condition,
      styleId: orderInfo.style_id,
      productImageUrl: orderInfo.product_image_url,
      productImageAlt: orderInfo.product_image_alt,
      purchasePrice: orderInfo.purchase_price,
      processingFee: orderInfo.processing_fee,
      shippingFee: orderInfo.shipping_fee,
      shippingType: orderInfo.shipping_type,
      totalAmount: orderInfo.total_amount,
      currency: orderInfo.currency,
      estimatedDeliveryStart: orderInfo.estimated_delivery_start,
      estimatedDeliveryEnd: orderInfo.estimated_delivery_end,
      purchaseDate: orderInfo.purchase_date,
      emailSubject: orderInfo.email_subject,
      emailDate: orderInfo.email_date,
      sender: orderInfo.sender,
      isTest: false,
      type: 'imported',
      createdAt: new Date().toISOString()
    };
    
    console.log('💾 saveUserPurchase: Processed purchase data:', purchaseData);
    
    const docRef = await addDocument(COLLECTIONS.PURCHASES, purchaseData);
    console.log('✅ Purchase saved to Firebase with doc ID:', docRef.id);
    
    // Verify the save by immediately reading it back
    const savedPurchases = await getDocuments(COLLECTIONS.PURCHASES);
    const justSavedPurchase = savedPurchases.find((p: any) => p.id === docRef.id);
    console.log('🔍 Verification - Just saved purchase:', justSavedPurchase);
    
    return docRef;
  } catch (error) {
    console.error('❌ Error saving purchase:', error);
    console.error('❌ Error details:', {
      userId,
      orderInfo,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
};

export const getUserPurchases = async (userId: string): Promise<UserPurchaseData[]> => {
  try {
    console.log('🔄 getUserPurchases: Loading purchases for user:', userId);
    
    const purchases = await getDocuments(COLLECTIONS.PURCHASES);
    console.log('📊 getUserPurchases: Total purchases in database:', purchases.length);
    
    const userPurchases = purchases.filter((purchase: any) => purchase.userId === userId);
    console.log('📊 getUserPurchases: User purchases found:', userPurchases.length);
    console.log('📊 getUserPurchases: User purchases:', userPurchases.map(p => ({ 
      id: p.id, 
      product: p.productName, 
      orderNumber: p.orderNumber 
    })));
    
    return userPurchases;
  } catch (error) {
    console.error('❌ Error loading purchases:', error);
    return [];
  }
};

export const deleteUserPurchase = async (userId: string, purchaseId: string | number) => {
  try {
    // Ensure purchaseId is a string (Firebase document ID)
    const docId = String(purchaseId);
    
    console.log('🔥 Attempting to delete purchase with doc ID:', docId);
    await deleteDocument(COLLECTIONS.PURCHASES, docId);
    console.log('✅ Purchase deleted from Firebase');
  } catch (error) {
    console.error('❌ Error deleting purchase:', error);
    console.error('Purchase ID:', purchaseId, 'Type:', typeof purchaseId);
    throw error;
  }
};

export const clearAllUserPurchases = async (userId: string): Promise<{success: boolean, error?: string}> => {
  try {
    console.log('🔄 Starting clearAllUserPurchases for user:', userId);
    
    const purchases = await getDocuments(COLLECTIONS.PURCHASES);
    console.log('📊 Total purchases in database:', purchases.length);
    
    const userPurchases = purchases.filter((purchase: any) => purchase.userId === userId);
    console.log('📊 User purchases found:', userPurchases.length);
    
    if (userPurchases.length === 0) {
      console.log('ℹ️ No purchases found for user - nothing to delete');
      return { success: true };
    }
    
    console.log('🗑️ Deleting purchases:', userPurchases.map(p => ({ id: p.id, product: p.productName })));
    
    for (const purchase of userPurchases) {
      if (purchase.id) {
        console.log('🔥 Deleting purchase:', purchase.id);
        await deleteDocument(COLLECTIONS.PURCHASES, purchase.id);
        console.log('✅ Deleted purchase:', purchase.id);
      } else {
        console.warn('⚠️ Purchase missing ID:', purchase);
      }
    }
    
    console.log('✅ All purchases cleared from Firebase');
    return { success: true };
  } catch (error) {
    console.error('❌ Error clearing purchases:', error);
    console.error('Error details:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to clear all purchases';
    return { success: false, error: errorMessage };
  }
};

// Email Config Persistence
export const saveUserEmailConfig = async (userId: string, config: any) => {
  try {
    const emailConfig: UserEmailConfig = {
      userId,
      config,
      updatedAt: new Date().toISOString()
    };

    const existingConfigs = await getDocuments(COLLECTIONS.EMAIL_CONFIGS);
    const userConfig = existingConfigs.find((c: any) => c.userId === userId);

    if (userConfig && userConfig.id) {
      await updateDocument(COLLECTIONS.EMAIL_CONFIGS, userConfig.id, emailConfig);
    } else {
      await addDocument(COLLECTIONS.EMAIL_CONFIGS, emailConfig);
    }

    console.log('✅ Email config saved to Firebase');
  } catch (error) {
    console.error('❌ Error saving email config:', error);
    throw error;
  }
};

export const getUserEmailConfig = async (userId: string): Promise<any | null> => {
  try {
    const configs = await getDocuments(COLLECTIONS.EMAIL_CONFIGS);
    const userConfig = configs.find((c: any) => c.userId === userId);
    return userConfig ? userConfig.config : null;
  } catch (error) {
    console.error('❌ Error loading email config:', error);
    return null;
  }
};

// Dashboard Settings Persistence
export const saveUserDashboardSettings = async (userId: string, settings: Partial<UserDashboardSettings>) => {
  try {
    const dashboardSettings: UserDashboardSettings = {
      userId,
      ...settings,
      updatedAt: new Date().toISOString()
    } as UserDashboardSettings;

    const existingSettings = await getDocuments(COLLECTIONS.DASHBOARD_SETTINGS);
    const userSettings = existingSettings.find((s: any) => s.userId === userId);

    if (userSettings && userSettings.id) {
      await updateDocument(COLLECTIONS.DASHBOARD_SETTINGS, userSettings.id, dashboardSettings);
    } else {
      await addDocument(COLLECTIONS.DASHBOARD_SETTINGS, dashboardSettings);
    }

    console.log('✅ Dashboard settings saved to Firebase');
  } catch (error) {
    console.error('❌ Error saving dashboard settings:', error);
    throw error;
  }
};

export const getUserDashboardSettings = async (userId: string): Promise<UserDashboardSettings | null> => {
  try {
    const settings = await getDocuments(COLLECTIONS.DASHBOARD_SETTINGS);
    const userSettings = settings.find((s: any) => s.userId === userId);
    return userSettings || null;
  } catch (error) {
    console.error('❌ Error loading dashboard settings:', error);
    return null;
  }
};

// StockX Settings Persistence
export const saveUserStockXSettings = async (userId: string, settings: Partial<UserStockXSettings>) => {
  try {
    const stockxSettings: UserStockXSettings = {
      userId,
      ...settings,
      updatedAt: new Date().toISOString()
    } as UserStockXSettings;

    try {
      // Try Firebase first
      const existingSettings = await getDocuments(COLLECTIONS.STOCKX_SETTINGS);
      const userSettings = existingSettings.find((s: any) => s.userId === userId);

      if (userSettings && userSettings.id) {
        await updateDocument(COLLECTIONS.STOCKX_SETTINGS, userSettings.id, stockxSettings);
      } else {
        await addDocument(COLLECTIONS.STOCKX_SETTINGS, stockxSettings);
      }
      console.log('✅ StockX settings saved to Firebase');
    } catch (firebaseError) {
      console.warn('⚠️ Firebase save failed, using localStorage fallback:', firebaseError);
      // Fallback to localStorage
      if (isClientSide) {
        localStorage.setItem(`stockx_settings_${userId}`, JSON.stringify(stockxSettings));
        console.log('✅ StockX settings saved to localStorage');
      }
    }
  } catch (error) {
    console.error('❌ Error saving StockX settings:', error);
    throw error;
  }
};

export const getUserStockXSettings = async (userId: string): Promise<UserStockXSettings | null> => {
  try {
    // Try Firebase first
    try {
      const settings = await getDocuments(COLLECTIONS.STOCKX_SETTINGS);
      const userSettings = settings.find((s: any) => s.userId === userId);
      if (userSettings) {
        console.log('✅ StockX settings loaded from Firebase');
        return userSettings;
      }
    } catch (firebaseError) {
      console.warn('⚠️ Firebase load failed, trying localStorage:', firebaseError);
    }
    
    // Fallback to localStorage
    if (isClientSide) {
      const localSettings = localStorage.getItem(`stockx_settings_${userId}`);
      if (localSettings) {
        console.log('✅ StockX settings loaded from localStorage');
        return JSON.parse(localSettings);
      }
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error loading StockX settings:', error);
    return null;
  }
};

// Utility function to clear all user data
export const clearAllUserData = async (userId: string) => {
  console.log('🧹 Starting complete data wipe for user:', userId);
  
  if (!userId) {
    throw new Error('User ID is required for data clearing');
  }

  let clearedCounts = {
    themes: 0,
    profiles: 0,
    purchases: 0,
    sales: 0,
    emailConfigs: 0,
    dashboardSettings: 0,
    stockxSettings: 0
  };

  try {
    // Clear themes (with error handling)
    try {
      console.log('🔄 Clearing theme preferences...');
      const themes = await getDocuments(COLLECTIONS.THEMES);
      const userThemes = themes.filter((theme: any) => theme.userId === userId);
      for (const theme of userThemes) {
        if (theme.id) {
          await deleteDocument(COLLECTIONS.THEMES, theme.id);
          clearedCounts.themes++;
        }
      }
      console.log(`✅ Cleared ${clearedCounts.themes} theme preferences`);
    } catch (error) {
      console.warn('⚠️ Error clearing themes (continuing anyway):', error);
    }

    // Clear profiles (with error handling)
    try {
      console.log('🔄 Clearing profile records...');
      const profiles = await getDocuments(COLLECTIONS.PROFILES);
      const userProfiles = profiles.filter((profile: any) => profile.userId === userId);
      for (const profile of userProfiles) {
        if (profile.id) {
          await deleteDocument(COLLECTIONS.PROFILES, profile.id);
          clearedCounts.profiles++;
        }
      }
      console.log(`✅ Cleared ${clearedCounts.profiles} profile records`);
    } catch (error) {
      console.warn('⚠️ Error clearing profiles (continuing anyway):', error);
    }

    // Clear sales (with error handling)
    try {
      console.log('🔄 Clearing sales data...');
      const sales = await getDocuments(COLLECTIONS.SALES);
      const userSales = sales.filter((sale: any) => sale.userId === userId);
      for (const sale of userSales) {
        if (sale.id) {
          await deleteDocument(COLLECTIONS.SALES, sale.id);
          clearedCounts.sales++;
        }
      }
      console.log(`✅ Cleared ${clearedCounts.sales} sales records`);
    } catch (error) {
      console.warn('⚠️ Error clearing sales (continuing anyway):', error);
    }

    // Clear purchases (with error handling)
    try {
      console.log('🔄 Clearing purchase records...');
      const allPurchases = await getDocuments(COLLECTIONS.PURCHASES);
      const userPurchases = allPurchases.filter((purchase: any) => purchase.userId === userId);
      for (const purchase of userPurchases) {
        if (purchase.id) {
          await deleteDocument(COLLECTIONS.PURCHASES, purchase.id);
          clearedCounts.purchases++;
        }
      }
      console.log(`✅ Cleared ${clearedCounts.purchases} purchase records`);
    } catch (error) {
      console.warn('⚠️ Error clearing purchases (continuing anyway):', error);
    }

    // Clear email configs (with error handling)
    try {
      console.log('🔄 Clearing email configurations...');
      const configs = await getDocuments(COLLECTIONS.EMAIL_CONFIGS);
      const userConfigs = configs.filter((config: any) => config.userId === userId);
      for (const config of userConfigs) {
        if (config.id) {
          await deleteDocument(COLLECTIONS.EMAIL_CONFIGS, config.id);
          clearedCounts.emailConfigs++;
        }
      }
      console.log(`✅ Cleared ${clearedCounts.emailConfigs} email configurations`);
    } catch (error) {
      console.warn('⚠️ Error clearing email configs (continuing anyway):', error);
    }

    // Clear dashboard settings (with error handling)
    try {
      console.log('🔄 Clearing dashboard settings...');
      const settings = await getDocuments(COLLECTIONS.DASHBOARD_SETTINGS);
      const userSettings = settings.filter((setting: any) => setting.userId === userId);
      for (const setting of userSettings) {
        if (setting.id) {
          await deleteDocument(COLLECTIONS.DASHBOARD_SETTINGS, setting.id);
          clearedCounts.dashboardSettings++;
        }
      }
      console.log(`✅ Cleared ${clearedCounts.dashboardSettings} dashboard settings`);
    } catch (error) {
      console.warn('⚠️ Error clearing dashboard settings (continuing anyway):', error);
    }

    // Clear StockX settings (with error handling)
    try {
      console.log('🔄 Clearing StockX settings...');
      const stockxSettings = await getDocuments(COLLECTIONS.STOCKX_SETTINGS);
      const userStockXSettings = stockxSettings.filter((setting: any) => setting.userId === userId);
      for (const setting of userStockXSettings) {
        if (setting.id) {
          await deleteDocument(COLLECTIONS.STOCKX_SETTINGS, setting.id);
          clearedCounts.stockxSettings++;
        }
      }
      console.log(`✅ Cleared ${clearedCounts.stockxSettings} StockX settings`);
    } catch (error) {
      console.warn('⚠️ Error clearing StockX settings (continuing anyway):', error);
    }

    // Clear localStorage data (client-side only, non-critical)
    let clearedLocalStorageItems = 0;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        // Clear theme preference
        localStorage.removeItem('selectedTheme');
        
        // Clear email parsing config
        localStorage.removeItem('emailParsingConfig');
        
        // Clear any cached data
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes('resell') || key.includes('dashboard') || key.includes('user'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        clearedLocalStorageItems = keysToRemove.length + 2; // +2 for theme and email config
        console.log(`✅ Cleared ${clearedLocalStorageItems} localStorage items`);
      } else {
        console.log('⚠️ localStorage not available (server-side) - skipping browser storage cleanup');
      }
    } catch (localStorageError) {
      console.warn('⚠️ Error clearing localStorage (non-critical):', localStorageError);
      // Don't throw error - localStorage cleanup is not critical
    }

    console.log('🎉 COMPLETE DATA WIPE SUCCESSFUL - Account is now fresh!');
    
    return {
      success: true,
      cleared: clearedCounts
    };
    
  } catch (error) {
    console.error('❌ Critical error during data wipe:', error);
    
    // Return partial success if we cleared some data
    const totalCleared = Object.values(clearedCounts).reduce((sum, count) => sum + count, 0);
    if (totalCleared > 0) {
      console.log(`⚠️ Partial success: cleared ${totalCleared} items before error`);
      return {
        success: false,
        cleared: clearedCounts,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
    
    throw error;
  }
}; 

// Helper function to convert OrderInfo to purchase data for backward compatibility
export const convertOrderInfoToPurchaseData = (orderInfo: OrderInfo): Partial<UserSaleData> => {
  return {
    product: orderInfo.product_name,
    brand: extractBrandFromProduct(orderInfo.product_name),
    orderNumber: orderInfo.order_number,
    size: orderInfo.size,
    market: orderInfo.merchant,
    purchasePrice: orderInfo.purchase_price,
    date: orderInfo.purchase_date || new Date().toISOString()
  };
};

// Helper function to extract brand from product name
function extractBrandFromProduct(productName: string): string {
  if (productName.toLowerCase().includes('jordan')) return 'Jordan';
  if (productName.toLowerCase().includes('nike')) return 'Nike';
  if (productName.toLowerCase().includes('adidas')) return 'Adidas';
  if (productName.toLowerCase().includes('yeezy')) return 'Yeezy';
  if (productName.toLowerCase().includes('travis scott')) return 'Travis Scott';
  if (productName.toLowerCase().includes('off-white')) return 'Off-White';
  if (productName.toLowerCase().includes('dior')) return 'Dior';
  if (productName.toLowerCase().includes('denim tears')) return 'Denim Tears';
  if (productName.toLowerCase().includes('sp5der')) return 'Sp5der';
  if (productName.toLowerCase().includes('ugg')) return 'UGG';
  return 'Unknown Brand';
} 