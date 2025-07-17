import { db } from './firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  deleteDoc,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import crypto from 'crypto';

// Simple encryption/decryption for API keys
const encryptApiKey = (apiKey: string, userId: string): string => {
  // Use userId as part of the encryption key for user-specific encryption
  const key = crypto.createHash('sha256').update(userId + process.env.ENCRYPTION_SECRET || 'default-secret').digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher('aes-256-cbc', key);
  
  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return iv.toString('hex') + ':' + encrypted;
};

const decryptApiKey = (encryptedData: string, userId: string): string => {
  try {
    const key = crypto.createHash('sha256').update(userId + process.env.ENCRYPTION_SECRET || 'default-secret').digest();
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipher('aes-256-cbc', key);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Failed to decrypt API key:', error);
    throw new Error('Invalid API key format');
  }
};

export interface UserApiKeys {
  userId: string;
  stockxApiKey?: string;
  stockxClientId?: string;
  stockxClientSecret?: string;
  updatedAt: string;
  isActive: boolean;
}

export interface ApiKeyStatus {
  hasStockXKeys: boolean;
  isConfigured: boolean;
  lastUpdated?: string;
}

/**
 * Save user's StockX API credentials
 */
export const saveUserStockXKeys = async (
  userId: string, 
  apiKey: string, 
  clientId?: string, 
  clientSecret?: string
): Promise<void> => {
  try {
    if (!userId || !apiKey) {
      throw new Error('User ID and API key are required');
    }

    // Encrypt sensitive data
    const encryptedApiKey = encryptApiKey(apiKey, userId);
    const encryptedClientSecret = clientSecret ? encryptApiKey(clientSecret, userId) : undefined;

    const apiKeysData: UserApiKeys = {
      userId,
      stockxApiKey: encryptedApiKey,
      stockxClientId: clientId, // Client ID can be stored in plain text
      stockxClientSecret: encryptedClientSecret,
      updatedAt: new Date().toISOString(),
      isActive: true
    };

    // Store in user's own collection for security
    const userApiKeysRef = doc(db, `users/${userId}/apiKeys`, 'stockx');
    await setDoc(userApiKeysRef, apiKeysData);

    console.log('✅ User StockX API keys saved successfully');
  } catch (error) {
    console.error('❌ Error saving user API keys:', error);
    throw error;
  }
};

/**
 * Get user's StockX API credentials
 */
export const getUserStockXKeys = async (userId: string): Promise<{
  apiKey?: string;
  clientId?: string;
  clientSecret?: string;
  isConfigured: boolean;
}> => {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const userApiKeysRef = doc(db, `users/${userId}/apiKeys`, 'stockx');
    const docSnap = await getDoc(userApiKeysRef);

    if (!docSnap.exists()) {
      return { isConfigured: false };
    }

    const data = docSnap.data() as UserApiKeys;
    
    if (!data.isActive || !data.stockxApiKey) {
      return { isConfigured: false };
    }

    // Decrypt sensitive data
    const decryptedApiKey = decryptApiKey(data.stockxApiKey, userId);
    const decryptedClientSecret = data.stockxClientSecret 
      ? decryptApiKey(data.stockxClientSecret, userId) 
      : undefined;

    return {
      apiKey: decryptedApiKey,
      clientId: data.stockxClientId,
      clientSecret: decryptedClientSecret,
      isConfigured: true
    };
  } catch (error) {
    console.error('❌ Error retrieving user API keys:', error);
    return { isConfigured: false };
  }
};

/**
 * Check if user has configured API keys
 */
export const getUserApiKeyStatus = async (userId: string): Promise<ApiKeyStatus> => {
  try {
    const keys = await getUserStockXKeys(userId);
    
    return {
      hasStockXKeys: keys.isConfigured,
      isConfigured: keys.isConfigured,
      lastUpdated: keys.isConfigured ? new Date().toISOString() : undefined
    };
  } catch (error) {
    console.error('❌ Error checking API key status:', error);
    return {
      hasStockXKeys: false,
      isConfigured: false
    };
  }
};

/**
 * Delete user's API keys
 */
export const deleteUserStockXKeys = async (userId: string): Promise<void> => {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const userApiKeysRef = doc(db, `users/${userId}/apiKeys`, 'stockx');
    await deleteDoc(userApiKeysRef);

    console.log('✅ User StockX API keys deleted successfully');
  } catch (error) {
    console.error('❌ Error deleting user API keys:', error);
    throw error;
  }
};

/**
 * Test if user's API keys are valid
 */
export const testUserStockXKeys = async (userId: string): Promise<{
  isValid: boolean;
  error?: string;
  details?: any;
}> => {
  try {
    const keys = await getUserStockXKeys(userId);
    
    if (!keys.isConfigured || !keys.apiKey) {
      return {
        isValid: false,
        error: 'No API keys configured'
      };
    }

    // Test the API key with a simple StockX API call
    const testResponse = await fetch('https://api.stockx.com/v2/catalog/search?query=nike&pageSize=1', {
      method: 'GET',
      headers: {
        'X-API-Key': keys.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'FlipFlow/1.0'
      }
    });

    if (testResponse.ok) {
      return {
        isValid: true,
        details: {
          status: testResponse.status,
          message: 'API key is valid'
        }
      };
    } else {
      const errorText = await testResponse.text();
      return {
        isValid: false,
        error: `API test failed: ${testResponse.status}`,
        details: {
          status: testResponse.status,
          response: errorText
        }
      };
    }
  } catch (error) {
    console.error('❌ Error testing user API keys:', error);
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}; 