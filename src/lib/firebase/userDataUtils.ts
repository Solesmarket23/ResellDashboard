import { addDocument, getDocuments, updateDocument, deleteDocument } from './firebaseUtils';

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
  id: number;
  product: string;
  brand: string;
  orderNumber: string;
  size: string;
  market: string;
  salePrice: number;
  fees: number;
  payout: number;
  profit: number;
  date: string;
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

// Collection names
const COLLECTIONS = {
  THEMES: 'user_themes',
  PROFILES: 'user_profiles',
  SALES: 'user_sales',
  EMAIL_CONFIGS: 'user_email_configs',
  DASHBOARD_SETTINGS: 'user_dashboard_settings'
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
    const sale: UserSaleData = {
      userId,
      ...saleData,
      type: 'manual',
      createdAt: new Date().toISOString()
    } as UserSaleData;

    await addDocument(COLLECTIONS.SALES, sale);
    console.log('✅ Sale saved to Firebase');
  } catch (error) {
    console.error('❌ Error saving sale:', error);
    throw error;
  }
};

export const getUserSales = async (userId: string): Promise<UserSaleData[]> => {
  try {
    const sales = await getDocuments(COLLECTIONS.SALES);
    const userSales = sales.filter((sale: any) => sale.userId === userId);
    return userSales;
  } catch (error) {
    console.error('❌ Error loading sales:', error);
    return [];
  }
};

export const deleteUserSale = async (userId: string, saleId: string) => {
  try {
    await deleteDocument(COLLECTIONS.SALES, saleId);
    console.log('✅ Sale deleted from Firebase');
  } catch (error) {
    console.error('❌ Error deleting sale:', error);
    throw error;
  }
};

export const clearAllUserSales = async (userId: string) => {
  try {
    const sales = await getDocuments(COLLECTIONS.SALES);
    const userSales = sales.filter((sale: any) => sale.userId === userId);
    
    for (const sale of userSales) {
      if (sale.id) {
        await deleteDocument(COLLECTIONS.SALES, sale.id);
      }
    }
    
    console.log('✅ All sales cleared from Firebase');
  } catch (error) {
    console.error('❌ Error clearing sales:', error);
    throw error;
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

// Utility function to clear all user data
export const clearAllUserData = async (userId: string) => {
  try {
    // Clear themes
    const themes = await getDocuments(COLLECTIONS.THEMES);
    const userThemes = themes.filter((theme: any) => theme.userId === userId);
    for (const theme of userThemes) {
      if (theme.id) await deleteDocument(COLLECTIONS.THEMES, theme.id);
    }

    // Clear profiles
    const profiles = await getDocuments(COLLECTIONS.PROFILES);
    const userProfiles = profiles.filter((profile: any) => profile.userId === userId);
    for (const profile of userProfiles) {
      if (profile.id) await deleteDocument(COLLECTIONS.PROFILES, profile.id);
    }

    // Clear sales
    await clearAllUserSales(userId);

    // Clear email configs
    const configs = await getDocuments(COLLECTIONS.EMAIL_CONFIGS);
    const userConfigs = configs.filter((config: any) => config.userId === userId);
    for (const config of userConfigs) {
      if (config.id) await deleteDocument(COLLECTIONS.EMAIL_CONFIGS, config.id);
    }

    // Clear dashboard settings
    const settings = await getDocuments(COLLECTIONS.DASHBOARD_SETTINGS);
    const userSettings = settings.filter((setting: any) => setting.userId === userId);
    for (const setting of userSettings) {
      if (setting.id) await deleteDocument(COLLECTIONS.DASHBOARD_SETTINGS, setting.id);
    }

    console.log('✅ All user data cleared from Firebase');
  } catch (error) {
    console.error('❌ Error clearing all user data:', error);
    throw error;
  }
}; 