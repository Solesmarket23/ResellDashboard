import { useEffect, useState } from 'react';
import { initializeSovrn, getSovrnService, convertToAffiliateLink } from '../sovrn/sovrnAffiliate';

interface UseSovrnReturn {
  isInitialized: boolean;
  convertLink: (url: string, productInfo?: any) => string;
  convertStockXLink: (url: string, productInfo?: any) => string;
}

export function useSovrn(): UseSovrnReturn {
  const [isInitialized, setIsInitialized] = useState(false);
  
  useEffect(() => {
    // Initialize Sovrn service if API key is available
    // In production, these values are baked into the bundle at build time
    const apiKey = process.env.NEXT_PUBLIC_SOVRN_API_KEY;
    const enableOptimization = process.env.NEXT_PUBLIC_SOVRN_ENABLE_OPTIMIZATION === 'true';
    
    // Debug logging for production
    if (typeof window !== 'undefined') {
      console.log('🔍 Sovrn Environment Check:', {
        apiKeyExists: !!apiKey,
        apiKeyLength: apiKey?.length || 0,
        enableOptimization,
        nodeEnv: process.env.NODE_ENV,
        // Log all NEXT_PUBLIC vars to debug
        allPublicEnvKeys: Object.keys(process.env).filter(key => key.startsWith('NEXT_PUBLIC_')),
      });
    }
    
    if (apiKey) {
      initializeSovrn({
        apiKey,
        enableOptimization,
        utmSource: 'reselldashboard',
        utmMedium: 'web',
        utmCampaign: 'affiliate_links',
      });
      setIsInitialized(true);
      console.log('✅ Sovrn affiliate service initialized with API key:', apiKey.substring(0, 8) + '...');
    } else {
      console.warn('⚠️ Sovrn API key not found in environment variables. Make sure NEXT_PUBLIC_SOVRN_API_KEY is set in Vercel.');
    }
  }, []);
  
  const convertLink = (url: string, productInfo?: any): string => {
    if (!isInitialized) {
      return url;
    }
    
    try {
      return convertToAffiliateLink(url);
    } catch (error) {
      console.error('Error converting to affiliate link:', error);
      return url;
    }
  };
  
  const convertStockXLink = (url: string, productInfo?: any): string => {
    if (!isInitialized) {
      return url;
    }
    
    const service = getSovrnService();
    if (!service) {
      return url;
    }
    
    try {
      return service.generateStockXAffiliateLink(url, productInfo);
    } catch (error) {
      console.error('Error converting StockX link:', error);
      return url;
    }
  };
  
  return {
    isInitialized,
    convertLink,
    convertStockXLink,
  };
}