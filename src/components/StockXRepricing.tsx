'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { DollarSign, TrendingDown, Target, Zap, RefreshCw, AlertTriangle, CheckCircle, Loader, Package, Copy, Check, ChevronUp, ChevronDown, ChevronsUpDown, Clock, Save, X, Wrench, Shield, MoreHorizontal } from 'lucide-react';
import NeonDropdown, { type NeonDropdownOption } from './NeonDropdown';
import { addDocument, getDocuments, updateDocument, deleteField } from '@/lib/firebase/firebaseUtils';
import { auth } from '@/lib/firebase/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useStockXAuth } from '@/lib/hooks/useStockXAuth';

interface RepricingStrategy {
  type: 'competitive' | 'margin_based' | 'velocity_based' | 'hybrid';
  settings: {
    minProfitMargin?: number;
    maxPriceReduction?: number;
    competitiveBuffer?: number;
    velocityThreshold?: number;
    maxDaysListed?: number;
    aggressiveness?: 'conservative' | 'moderate' | 'aggressive';
  };
}

interface IndividualPricingStrategy {
  type: 'beat_lowest' | 'match_lowest' | 'percentage_below' | 'manual' | 'keep_current' | 'market_peek' | 'reset_then_beat_lowest';
  value?: number; // Amount for beat_lowest or percentage
  manualPrice?: number;
  beatBy?: number; // legacy; two-step is now hardcoded to beat by $1
  peekSettings?: {
    frequency: 'hourly' | 'conservative' | 'balanced' | 'aggressive'; // 1h, 8h, 6h, 4h
    lastPeekTime?: string;
    nextScheduledPeek?: string;
    isPeeking?: boolean;
    peekHistory?: MarketPeekResult[];
  };
}

interface MarketPeekResult {
  timestamp: string;
  previousPrice: number;
  peekPrice: number;
  discoveredLowestAsk: number;
  newPrice: number;
  profitGained: number;
  success: boolean;
  error?: string;
  apiResponseTimes: {
    raisePriceMs?: number;
    fetchMarketMs?: number;
    setPriceMs?: number;
  };
}

interface Listing {
  listingId: string;
  productId: string;
  variantId: string;
  productName: string;
  urlKey?: string | null;
  size: string;
  currentPrice: number;
  originalPrice: number;
  styleId?: string;
  colorway?: string;
  brand?: string;
  condition?: string;
  status?: string;
  createdAt?: string;
  retailPrice?: number;
  lowestAsk?: number;
  flexLowestAsk?: number;
  highestBid?: number;
  lastSale?: number;
  category?: string;
  inventoryType?: string;
  selected: boolean;
  // Individual pricing settings
  pricingStrategy?: IndividualPricingStrategy;
  // Per-listing toggle for cron-based repricing (stored in stockxPricingSettings.enabled)
  repricingEnabled?: boolean;
  minPrice?: number;
  maxPrice?: number;
  autoDeactivate?: boolean;
  costBasis?: number; // Add cost basis for validation
  // Inventory grouping
  inventoryGroupId?: string; // productId + variantId
  isGroupLeader?: boolean;
  groupLeaderId?: string;
}

interface InventoryGroup {
  groupId: string; // productId + variantId
  productId: string;
  variantId: string;
  productName: string;
  size: string;
  listings: Listing[];
  leaderId: string; // listingId of the representative
  lastSyncTime?: string;
}

interface RepricingResult {
  listingId: string;
  currentPrice: number;
  newPrice: number;
  action: string;
  reason: string;
  profitChange: number;
  competitivePosition: string;
}

export default function StockXRepricing() {
  const { currentTheme } = useTheme();
  const { user: authUser } = useAuth(); // Get user from AuthContext
  const isNeon = currentTheme.name.toLowerCase() === 'neon';

  // Vercel Cron cadence (hard limit): users can't run more frequently than this.
  // Default matches `vercel.json` (currently */5).
  const cronCadenceMinutes = (() => {
    const raw = process.env.NEXT_PUBLIC_AUTO_REPRICE_CRON_MINUTES;
    const n = raw ? Number(raw) : 5;
    return Number.isFinite(n) && n > 0 ? n : 5;
  })();
  
  // StockX Auth Hook for automatic token refresh
  const { startTokenRefreshInterval, checkAndRefreshToken } = useStockXAuth({
    onAuthError: () => {
      console.log('StockX auth error detected - need to re-authenticate');
      setAuthError(true);
      setAuthenticated(false);
    },
    onTokenRefreshed: () => {
      console.log('StockX token refreshed successfully');
      setAuthError(false);
      setAuthenticated(true);
    },
    checkInterval: 5 * 60 * 1000, // Check every 5 minutes
    refreshBuffer: 10 * 60 * 1000 // Refresh 10 minutes before expiry
  });
  
  // Debug theme detection
  useEffect(() => {
    console.log('StockX Repricing Theme:', currentTheme.name, 'isNeon:', isNeon);
  }, [currentTheme, isNeon]);
  
  const [listings, setListings] = useState<Listing[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);
  const [strategy, setStrategy] = useState<RepricingStrategy>({
    type: 'competitive',
    settings: {
      minProfitMargin: 0.15,
      maxPriceReduction: 0.20,
      competitiveBuffer: 1,
      maxDaysListed: 30,
      aggressiveness: 'moderate'
    }
  });
  const [loading, setLoading] = useState(false);
  const [autoRefreshing, setAutoRefreshing] = useState(false);
  const [results, setResults] = useState<RepricingResult[]>([]);
  const [dryRun, setDryRun] = useState(true);
  const [notificationEmail, setNotificationEmail] = useState('');
  const [authenticated, setAuthenticated] = useState(true); // Assume authenticated initially
  const [authError, setAuthError] = useState(false);
  const [captchaDetected, setCaptchaDetected] = useState(false);
  const [captchaSnippet, setCaptchaSnippet] = useState<string | null>(null);
  const [customRuleType, setCustomRuleType] = useState('below_dollar');
  const [listingStats, setListingStats] = useState<{
    rawCount?: number;
    trueDuplicatesRemoved?: number;
    investigation?: {
      productSizeGroupsWithMultiples: number;
      totalPotentialDuplicates: number;
      trueDuplicateGroups: number;
      message: string;
    };
  }>({});
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);
  const [lastMarketRefreshTime, setLastMarketRefreshTime] = useState<Date | null>(null);
  const [refreshProgress, setRefreshProgress] = useState<{ current: number; total: number } | null>(null);
  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false);
  const [bulkActionMessage, setBulkActionMessage] = useState<string | null>(null);
  // Unit assignment (physical inventory label 1–999) → listingId
  const [unitDraftByListingId, setUnitDraftByListingId] = useState<Record<string, string>>({});
  const [unitAssignStateByListingId, setUnitAssignStateByListingId] = useState<Record<string, 'idle' | 'saving' | 'saved'>>({});
  const [unitOptionsByListingId, setUnitOptionsByListingId] = useState<Record<string, Array<{ unitNumber: number; orderNumber: string | null }>>>({});
  const [unitOptionsLoadingByListingId, setUnitOptionsLoadingByListingId] = useState<Record<string, boolean>>({});
  const [showBulkPricingModal, setShowBulkPricingModal] = useState(false);
  const [previewResults, setPreviewResults] = useState<RepricingResult[]>([]);
  const [isPreviewMinimized, setIsPreviewMinimized] = useState(false);
  const [showPreviewResults, setShowPreviewResults] = useState(false);
  const [savedSettings, setSavedSettings] = useState<Record<string, any>>({});
  const savedSettingsRef = useRef<Record<string, any>>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [activePeeks, setActivePeeks] = useState<Record<string, boolean>>({});
  const [peekScheduler, setPeekScheduler] = useState<NodeJS.Timeout | null>(null);
  const [inventoryGroups, setInventoryGroups] = useState<Map<string, InventoryGroup>>(new Map());
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [copiedStyleIds, setCopiedStyleIds] = useState<Record<string, boolean>>({});
  const [copiedListingIds, setCopiedListingIds] = useState<Record<string, boolean>>({});
  const [sortColumn, setSortColumn] = useState<'product' | 'size' | 'price' | 'market' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState('');

  const LISTINGS_CACHE_KEY = 'stockx_listings_cache_v1';
  const listingsCooldownUntilRef = useRef<number>(0);
  const listingsLastFetchStartedAtRef = useRef<number>(0);

  const getSiteUserId = useCallback((): string | null => {
    try {
      const cookies = document.cookie.split(';');
      const userIdCookie = cookies.find(c => c.trim().startsWith('site-user-id='));
      if (!userIdCookie) return null;
      return decodeURIComponent(userIdCookie.split('=')[1]);
    } catch {
      return null;
    }
  }, []);

  const applySavedSettingsToListings = useCallback((input: Listing[], settingsMap: Record<string, any>) => {
    if (!Array.isArray(input) || input.length === 0) return input;
    const hasAny = settingsMap && Object.keys(settingsMap).length > 0;
    return input.map(listing => {
      const saved = hasAny ? settingsMap[listing.listingId] : undefined;
      if (saved) {
        return {
          ...listing,
          repricingEnabled: Object.prototype.hasOwnProperty.call(saved, 'enabled') ? saved.enabled !== false : true,
          pricingStrategy: saved.pricingStrategy || listing.pricingStrategy,
          minPrice: Object.prototype.hasOwnProperty.call(saved, 'minPrice') ? saved.minPrice : listing.minPrice,
          maxPrice: Object.prototype.hasOwnProperty.call(saved, 'maxPrice') ? saved.maxPrice : listing.maxPrice,
          autoDeactivate: Object.prototype.hasOwnProperty.call(saved, 'autoDeactivate') ? saved.autoDeactivate : listing.autoDeactivate
        };
      }
      // No settings doc = not opted-in = OFF by default
      return { ...listing, repricingEnabled: false };
    });
  }, []);

  const getTrueAsk = useCallback((listing: Listing): number | null => {
    const std = typeof listing.lowestAsk === 'number' && listing.lowestAsk > 0 ? listing.lowestAsk : null;
    const flex = typeof listing.flexLowestAsk === 'number' && listing.flexLowestAsk > 0 ? listing.flexLowestAsk : null;
    if (std === null && flex === null) return null;
    if (std === null) return flex;
    if (flex === null) return std;
    return Math.min(std, flex);
  }, []);
  
  // Auto-repricing settings
  const [showAutoRepricingSettings, setShowAutoRepricingSettings] = useState(false); // Default to collapsed
  const [autoRepricingEnabled, setAutoRepricingEnabled] = useState(false);
  const [savingAutoRepricing, setSavingAutoRepricing] = useState(false);
  
  // Track pending pricing rule changes
  const [pendingStrategyChanges, setPendingStrategyChanges] = useState<Record<string, IndividualPricingStrategy>>({});
  const [pendingBoundChanges, setPendingBoundChanges] = useState<Record<string, true>>({});
  const [rowSaveState, setRowSaveState] = useState<Record<string, 'idle' | 'saving' | 'saved'>>({});
  
  const filteredListings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return listings;
    return listings.filter(l => {
      const fields = [
        l.productName,
        l.size,
        l.styleId,
        l.listingId,
        l.productId,
        l.variantId,
        l.inventoryType
      ]
        .filter(Boolean)
        .map(v => String(v).toLowerCase());
      return fields.some(v => v.includes(q));
    });
  }, [listings, searchQuery]);

  // UX: richer, self-explanatory pricing rules (grouped + described)
  const pricingRuleOptions = useMemo<NeonDropdownOption[]>(
    () => [
      {
        value: 'keep_current',
        label: 'Keep Current',
        description: 'No automated price changes (manual only).',
        group: 'Basics',
      },
      {
        value: 'manual',
        label: 'Manual',
        description: 'You set a price manually; safety bounds still apply.',
        group: 'Basics',
      },
      {
        value: 'beat_lowest',
        label: 'Beat Lowest by $1',
        description: 'Sets price to (best ask − $1).',
        group: 'Competitive',
      },
      {
        value: 'match_lowest',
        label: 'Match Lowest',
        description: 'Sets price to the best ask.',
        group: 'Competitive',
      },
      {
        value: 'percentage_below',
        label: 'Below %',
        description: 'Sets price to (best ask × (1 − %)).',
        group: 'Competitive',
      },
      {
        value: 'reset_then_beat_lowest',
        label: '⚡ Two-step: reset then beat lowest',
        description: 'Temporarily sets $999 to reveal real asks, then undercuts by $1.',
        group: 'Advanced',
        badge: 'Recommended',
      },
      {
        value: 'market_peek',
        label: '🔍 Market Peek',
        description: 'Occasionally “peeks” market to re-check the true lowest ask.',
        group: 'Advanced',
      },
    ],
    []
  );

  // Reset to page 1 when search changes (same UX as Purchases)
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Sorting logic
  const sortedListings = [...filteredListings].sort((a, b) => {
    if (!sortColumn) return 0;
    
    let aValue: any;
    let bValue: any;
    
    switch (sortColumn) {
      case 'product':
        aValue = a.productName.toLowerCase();
        bValue = b.productName.toLowerCase();
        break;
      case 'size':
        // Convert sizes to sortable format
        aValue = convertSizeToNumber(a.size);
        bValue = convertSizeToNumber(b.size);
        break;
      case 'price':
        aValue = a.currentPrice;
        bValue = b.currentPrice;
        break;
      case 'market':
        aValue = getTrueAsk(a) || 0;
        bValue = getTrueAsk(b) || 0;
        break;
      default:
        return 0;
    }
    
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Pagination calculations - moved here so they're available for all functions
  const totalPages = Math.ceil(sortedListings.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedListings = sortedListings.slice(startIndex, endIndex);
  
  const selectedCount = listings.filter(l => l.selected).length;
  const pageSelectedCount = paginatedListings.filter(l => l.selected).length;
  const isAllSelected = paginatedListings.length > 0 && paginatedListings.every(l => l.selected);
  const isPartiallySelected = pageSelectedCount > 0 && pageSelectedCount < paginatedListings.length;

  // Track previous listings length outside of effect
  const prevListingsLength = useRef(0);
  const isInitialMount = useRef(true);
  
  // Reset to page 1 only on significant changes
  useEffect(() => {
    // Skip on initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      prevListingsLength.current = listings.length;
      return;
    }
    
    // Only reset if going from/to 0 or major change (>50% difference)
    const prevLength = prevListingsLength.current;
    const currentLength = listings.length;
    
    if ((prevLength === 0 && currentLength > 0) || 
        (prevLength > 0 && currentLength === 0) ||
        (prevLength > 0 && Math.abs(currentLength - prevLength) > prevLength * 0.5)) {
      setCurrentPage(1);
    }
    prevListingsLength.current = currentLength;
  }, [listings.length]);

  // Component mount debugging
  useEffect(() => {
    console.log('🚀 StockXRepricing component mounted');
    console.log('📊 Initial state:', {
      listingsCount: listings.length,
      savedSettingsCount: Object.keys(savedSettings).length,
      settingsLoaded,
      currentUser: authUser?.uid
    });
  }, [authUser]);

  // Load cached listings immediately for a "sticky" UX across refreshes
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LISTINGS_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const cachedListings = Array.isArray(parsed?.listings) ? parsed.listings : null;
      const cachedAt = typeof parsed?.cachedAt === 'number' ? parsed.cachedAt : null;
      if (!cachedListings || !cachedAt) return;

      // Only use cache if it's reasonably fresh (6 hours)
      if (Date.now() - cachedAt > 6 * 60 * 60 * 1000) return;

      setListings(
        cachedListings.map((l: any) => ({
          ...l,
          selected: false
        }))
      );
      setLastFetchTime(new Date(cachedAt));
      console.log('📦 Loaded cached listings:', cachedListings.length);
    } catch (e) {
      console.warn('⚠️ Failed to load cached listings:', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load pricing settings (works with Firebase auth OR site-user-id cookie)
  useEffect(() => {
    const effectiveUserId = authUser?.uid || getSiteUserId();
    console.log(
      '👤 Effective user changed:',
      authUser?.uid ? `Firebase (${authUser.uid})` : effectiveUserId ? `Site (${effectiveUserId})` : 'No user id'
    );
    if (!effectiveUserId) return;
    loadSavedSettings(effectiveUserId);
  }, [authUser, getSiteUserId]);

  // Fetch listings on mount. StockX listing fetch is cookie-based and does NOT require Firebase auth.
  const hasInitiallyFetched = useRef(false);
  useEffect(() => {
    if (!loading && !hasInitiallyFetched.current) {
      console.log('📋 Initial load - fetching listings...');
      hasInitiallyFetched.current = true;
      fetchListings(false); // Don't force; fetchListings will show loading only if list is empty
    }
  }, []); // Run once

  // Auto-refresh listings periodically to catch new listings
  useEffect(() => {
    console.log('⏰ Setting up auto-refresh for listings (every 10 minutes)...');
    
    const refreshInterval = setInterval(() => {
      console.log('🔄 Auto-refreshing listings to check for new items...');
      fetchListings(false, true); // Prefer cached refresh to reduce 429 risk
    }, 10 * 60 * 1000); // 10 minutes
    
    return () => {
      console.log('🛑 Clearing listings auto-refresh interval');
      clearInterval(refreshInterval);
    };
  }, []);

  // Load auto-repricing settings
  useEffect(() => {
    const loadAutoRepricingSettings = async () => {
      // Use Firebase auth user if present, otherwise fall back to site-user-id cookie
      const userId =
        authUser?.uid ||
        (() => {
          try {
            const cookies = document.cookie.split(';');
            const userIdCookie = cookies.find(c => c.trim().startsWith('site-user-id='));
            if (!userIdCookie) return null;
            return decodeURIComponent(userIdCookie.split('=')[1]);
          } catch {
            return null;
          }
        })();
      if (!userId) return;
      
      try {
        const res = await fetch(`/api/stockx/auto-repricing-settings?userId=${encodeURIComponent(userId)}`);
        const json = await res.json().catch(() => null);
        if (res.ok && json?.success) {
          setAutoRepricingEnabled(json.enabled === true);
        }
      } catch (error) {
        console.error('Error loading auto-repricing settings:', error);
      }
    };
    
    loadAutoRepricingSettings();
  }, [authUser]);

  // Keep a ref to the latest saved settings so async flows (like "Save → run two-step → fetchListings")
  // don't accidentally use a stale closure and wipe newly saved min/max from the UI.
  useEffect(() => {
    savedSettingsRef.current = savedSettings;
  }, [savedSettings]);

  // If saved settings change (e.g. user clicks Save), re-apply them to the current listings in-memory
  // so the UI stays consistent even if a background refresh comes in.
  useEffect(() => {
    setListings(prev => applySavedSettingsToListings(prev, savedSettingsRef.current));
  }, [applySavedSettingsToListings, savedSettings]);

  const saveAutoRepricingEnabled = async (enabled: boolean) => {
    // Try to get user ID from Firebase auth first, then fall back to site user ID from cookies
    let userId = authUser?.uid;

    if (!userId) {
      const cookies = document.cookie.split(';');
      const userIdCookie = cookies.find(c => c.trim().startsWith('site-user-id='));
      if (userIdCookie) {
        userId = decodeURIComponent(userIdCookie.split('=')[1]);
      }
    }

    if (!userId) {
      alert('❌ You must be connected to StockX to save settings. Please connect on the StockX Arbitrage page first.');
      return;
    }

    try {
      setSavingAutoRepricing(true);

      const resp = await fetch('/api/stockx/auto-repricing-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({
          userId,
          enabled,
          // We run on a fixed cadence; keep the stored interval aligned with the cadence.
          intervalMinutes: cronCadenceMinutes
        })
      });
      const out = await resp.json().catch(() => null);
      if (!resp.ok || !out?.success) {
        throw new Error(out?.error || `Failed to save (${resp.status})`);
      }

      setAutoRepricingEnabled(enabled);
      setBulkActionMessage(enabled ? '✅ Auto-repricing enabled' : '✅ Auto-repricing disabled');
      setTimeout(() => setBulkActionMessage(null), 6000);
    } catch (error) {
      console.error('❌ Error saving auto-repricing settings:', error);
      alert('❌ Failed to save auto-repricing settings. Please try again.');
    } finally {
      setSavingAutoRepricing(false);
    }
  };

  // Apply saved settings - removed to prevent double application

  // Market Peek Scheduler - moved to useRef to prevent recreation
  const peekSchedulerRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    // Clear any existing scheduler
    if (peekSchedulerRef.current) {
      clearInterval(peekSchedulerRef.current);
    }

    // Check every minute for scheduled peeks
    peekSchedulerRef.current = setInterval(() => {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      
      // Check if it's time for a scheduled peek (9 AM, 3 PM, 9 PM)
      if (currentMinute === 0 && (currentHour === 9 || currentHour === 15 || currentHour === 21)) {
        runScheduledPeeks();
      }
    }, 60000); // Check every minute

    return () => {
      if (peekSchedulerRef.current) {
        clearInterval(peekSchedulerRef.current);
        peekSchedulerRef.current = null;
      }
    };
  }, []); // Empty dependency array - scheduler doesn't need to restart

  const loadSavedSettings = async (userId: string) => {
    try {
      console.log('🔄 Loading saved settings for user:', userId);
      // Prefer server-side fetch (works even without Firebase authUser via site-user-id cookie)
      const res = await fetch(`/api/stockx/pricing-settings?userId=${encodeURIComponent(userId)}`);
      const json = await res.json().catch(() => null);
      const userSettings = Array.isArray(json?.settings) ? json.settings : [];
      console.log(`📊 Found ${userSettings.length} saved settings in Firebase`);
      
      // Convert to a map for easier lookup
      const settingsMap: Record<string, any> = {};
      userSettings.forEach(setting => {
        settingsMap[setting.listingId] = setting;
        console.log(`📄 Loaded settings for ${setting.listingId}:`, {
          minPrice: setting.minPrice,
          maxPrice: setting.maxPrice,
          hasMinPrice: 'minPrice' in setting,
          hasMaxPrice: 'maxPrice' in setting,
          minPriceType: typeof setting.minPrice,
          maxPriceType: typeof setting.maxPrice,
          fullSetting: setting,
          pricingStrategy: setting.pricingStrategy?.type
        });
      });
      
      setSavedSettings(() => {
        savedSettingsRef.current = settingsMap;
        return settingsMap;
      });
      setSettingsLoaded(true);
      console.log('✅ Settings loaded into state.');

      // Apply immediately to whatever listings we already have (cached or freshly fetched),
      // so a page refresh a few seconds after Save still shows the saved values.
      setListings(prev => {
        const next = applySavedSettingsToListings(prev, settingsMap);
        // Also refresh the local cache so the next refresh stays consistent.
        try {
          const minimal = next.map((l: any) => ({
            listingId: l.listingId,
            productId: l.productId,
            variantId: l.variantId,
            productName: l.productName,
            size: l.size,
            currentPrice: l.currentPrice,
            originalPrice: l.originalPrice,
            styleId: l.styleId,
            brand: l.brand,
            colorway: l.colorway,
            condition: l.condition,
            status: l.status,
            createdAt: l.createdAt,
            updatedAt: l.updatedAt,
            retailPrice: l.retailPrice,
            lowestAsk: l.lowestAsk,
            flexLowestAsk: l.flexLowestAsk,
            highestBid: l.highestBid,
            lastSale: l.lastSale,
            category: l.category,
            inventoryType: l.inventoryType,
            pricingStrategy: l.pricingStrategy,
            repricingEnabled: l.repricingEnabled,
            minPrice: l.minPrice,
            maxPrice: l.maxPrice,
            autoDeactivate: l.autoDeactivate
          }));
          localStorage.setItem(LISTINGS_CACHE_KEY, JSON.stringify({ cachedAt: Date.now(), listings: minimal }));
        } catch {}
        return next;
      });
    } catch (error) {
      console.error('❌ Error loading saved settings:', error);
    }
  };

  const saveSettingToFirebase = async (listingId: string, settings: any) => {
    if (savingSettings) return;

    // Support site-password sessions (no Firebase authUser) by using site-user-id cookie.
    const siteUserId = (() => {
      try {
        const cookies = document.cookie.split(';');
        const userIdCookie = cookies.find(c => c.trim().startsWith('site-user-id='));
        if (!userIdCookie) return null;
        return decodeURIComponent(userIdCookie.split('=')[1]);
      } catch {
        return null;
      }
    })();

    const effectiveUserId = authUser?.uid || siteUserId;
    if (!effectiveUserId) {
      console.log('❌ Skipping save - no user id available');
      return;
    }
    
    console.log(`💾 Starting save for ${listingId}:`, {
      settings,
      minPrice: settings.minPrice,
      maxPrice: settings.maxPrice,
      hasMinPrice: 'minPrice' in settings,
      hasMaxPrice: 'maxPrice' in settings
    });
    
    setSavingSettings(true);
    try {
      const existingSetting = savedSettings[listingId];
      console.log(`📄 Existing setting for ${listingId}:`, existingSetting);
      
      // Ensure we have a valid pricing strategy and clean it
      let pricingStrategy = settings.pricingStrategy || { type: 'keep_current' };
      
      // Clean the pricing strategy object - remove undefined values
      const cleanPricingStrategy: any = { type: pricingStrategy.type };
      if (pricingStrategy.value !== undefined && pricingStrategy.value !== null) {
        cleanPricingStrategy.value = pricingStrategy.value;
      }
      if (pricingStrategy.manualPrice !== undefined && pricingStrategy.manualPrice !== null) {
        cleanPricingStrategy.manualPrice = pricingStrategy.manualPrice;
      }
      if (pricingStrategy.peekSettings) {
        // Clean peekSettings to remove undefined values
        const cleanPeekSettings: any = {};
        if (pricingStrategy.peekSettings.frequency) {
          cleanPeekSettings.frequency = pricingStrategy.peekSettings.frequency;
        }
        if (pricingStrategy.peekSettings.lastPeekTime !== undefined && pricingStrategy.peekSettings.lastPeekTime !== null) {
          cleanPeekSettings.lastPeekTime = pricingStrategy.peekSettings.lastPeekTime;
        }
        if (pricingStrategy.peekSettings.nextScheduledPeek !== undefined && pricingStrategy.peekSettings.nextScheduledPeek !== null) {
          cleanPeekSettings.nextScheduledPeek = pricingStrategy.peekSettings.nextScheduledPeek;
        }
        if (pricingStrategy.peekSettings.isPeeking !== undefined) {
          cleanPeekSettings.isPeeking = pricingStrategy.peekSettings.isPeeking;
        }
        if (pricingStrategy.peekSettings.peekHistory && Array.isArray(pricingStrategy.peekSettings.peekHistory)) {
          cleanPeekSettings.peekHistory = pricingStrategy.peekSettings.peekHistory;
        }
        
        // Only add peekSettings if it has at least one property
        if (Object.keys(cleanPeekSettings).length > 0) {
          cleanPricingStrategy.peekSettings = cleanPeekSettings;
        }
      }
      
      const normalizeBound = (v: any): number | null => {
        if (v === null || v === undefined) return null;
        if (typeof v === 'string' && v.trim() === '') return null;
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) return null;
        return n;
      };

      const settingData: any = {
        listingId,
        pricingStrategy: cleanPricingStrategy,
        // Per-listing on/off (default true once opted-in)
        enabled: settings.enabled !== undefined
          ? settings.enabled === true
          : (existingSetting?.enabled !== undefined ? existingSetting.enabled !== false : true),
        autoDeactivate:
          settings.autoDeactivate !== undefined
            ? settings.autoDeactivate === true
            : (existingSetting?.autoDeactivate === true),
        updatedAt: new Date().toISOString()
      };
      
      // Handle minPrice and maxPrice - Firebase doesn't allow undefined values
      if (settings.minPrice !== undefined) {
        const min = normalizeBound(settings.minPrice);
        if (min === null) {
          settingData.minPrice = null; // server route will delete the field
          console.log(`🗑️ Clearing minPrice`);
        } else {
          settingData.minPrice = min;
          console.log(`✅ Including minPrice: ${settingData.minPrice}`);
        }
      } else {
        console.log(`⏭️ minPrice not in settings, keeping existing value`);
      }
      
      if (settings.maxPrice !== undefined) {
        const max = normalizeBound(settings.maxPrice);
        if (max === null) {
          settingData.maxPrice = null; // server route will delete the field
          console.log(`🗑️ Clearing maxPrice`);
        } else {
          settingData.maxPrice = max;
          console.log(`✅ Including maxPrice: ${settingData.maxPrice}`);
        }
      } else {
        console.log(`⏭️ maxPrice not in settings, keeping existing value`);
      }
      
      console.log('📦 Final setting data to save:', settingData);

      // Save via server route (Firebase Admin) for consistent behavior across auth modes
      const resp = await fetch('/api/stockx/pricing-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': effectiveUserId },
        body: JSON.stringify({ userId: effectiveUserId, listingId, settings: settingData })
      });
      const out = await resp.json().catch(() => null);
      if (!resp.ok || !out?.success) {
        throw new Error(out?.error || `Failed to save settings (${resp.status})`);
      }

      // Update local state so UI stays in sync immediately
      // Mirror server-side deletion semantics (null means delete the field).
      const localSettingData = { ...settingData };
      if (localSettingData.minPrice === null) delete localSettingData.minPrice;
      if (localSettingData.maxPrice === null) delete localSettingData.maxPrice;
      setSavedSettings(prev => {
        const next = {
          ...prev,
          [listingId]: { ...prev[listingId], ...localSettingData, id: out.id, userId: effectiveUserId }
        };
        savedSettingsRef.current = next;
        return next;
      });
      setSettingsLoaded(true);
      console.log('🎉 Settings saved successfully to Firebase');
    } catch (error) {
      console.error('❌ Error saving settings:', error);
    } finally {
      setSavingSettings(false);
    }
  };

  // Process inventory groups to identify duplicates and assign representatives
  const processInventoryGroups = (listings: Listing[]): Listing[] => {
    const groups = new Map<string, InventoryGroup>();
    
    // Group listings by productId + variantId
    listings.forEach(listing => {
      // Only group ACTIVE listings
      if (listing.status !== 'ACTIVE') return;
      
      const groupId = `${listing.productId}_${listing.variantId}`;
      listing.inventoryGroupId = groupId;
      
      if (!groups.has(groupId)) {
        groups.set(groupId, {
          groupId,
          productId: listing.productId,
          variantId: listing.variantId,
          productName: listing.productName,
          size: listing.size,
          listings: [],
          leaderId: '',
          lastSyncTime: new Date().toISOString()
        });
      }
      
      groups.get(groupId)!.listings.push(listing);
    });
    
    // Process each group to select representatives
    groups.forEach(group => {
      if (group.listings.length === 1) {
        // Single listing is always the leader
        group.listings[0].isGroupLeader = true;
        group.leaderId = group.listings[0].listingId;
      } else {
        // Multiple listings - choose the one with lowest price as leader
        const sortedByPrice = [...group.listings].sort((a, b) => a.currentPrice - b.currentPrice);
        const leader = sortedByPrice[0];
        
        leader.isGroupLeader = true;
        group.leaderId = leader.listingId;
        
        // Mark all other listings as followers
        group.listings.forEach(listing => {
          listing.groupLeaderId = leader.listingId;
          if (listing.listingId !== leader.listingId) {
            listing.isGroupLeader = false;
            // Sync pricing strategy from leader
            listing.pricingStrategy = leader.pricingStrategy;
            listing.minPrice = leader.minPrice;
            listing.maxPrice = leader.maxPrice;
            listing.autoDeactivate = leader.autoDeactivate;
          }
        });
        
        console.log(`🔗 Inventory group ${group.groupId}: ${group.listings.length} items, leader: ${leader.productName} @ $${leader.currentPrice}`);
      }
    });
    
    // Update inventory groups state
    setInventoryGroups(groups);
    
    return listings;
  };

  // Sync prices across an inventory group
  const syncInventoryGroup = async (groupId: string, newPrice: number, leaderId?: string) => {
    const group = inventoryGroups.get(groupId);
    if (!group || group.listings.length <= 1) return;
    
    console.log(`🔄 Syncing inventory group ${groupId} to price $${newPrice}`);
    
    // If leader changed, update group
    if (leaderId && leaderId !== group.leaderId) {
      group.leaderId = leaderId;
      group.listings.forEach(listing => {
        listing.isGroupLeader = listing.listingId === leaderId;
        listing.groupLeaderId = leaderId;
      });
    }
    
    // Update all listings in the group to the same price
    const updatePromises = group.listings.map(async (listing) => {
      if (listing.currentPrice !== newPrice) {
        try {
          const response = await fetch('/api/stockx/repricing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              listings: [{
                listingId: listing.listingId,
                currentPrice: listing.currentPrice,
                newPrice: newPrice
              }]
            })
          });
          
          if (response.ok) {
            listing.currentPrice = newPrice;
            console.log(`✅ Updated ${listing.listingId} to $${newPrice}`);
          }
        } catch (error) {
          console.error(`❌ Failed to sync ${listing.listingId}:`, error);
        }
      }
    });
    
    await Promise.all(updatePromises);
    group.lastSyncTime = new Date().toISOString();
  };

  // Promote new group leader when current leader is sold/deactivated
  const promoteNewGroupLeader = async (groupId: string, oldLeaderId: string) => {
    const group = inventoryGroups.get(groupId);
    if (!group || group.listings.length <= 1) return;
    
    // Remove old leader from group
    group.listings = group.listings.filter(l => l.listingId !== oldLeaderId);
    
    if (group.listings.length === 0) {
      // No more listings in group, remove it
      inventoryGroups.delete(groupId);
      return;
    }
    
    // Select new leader (lowest price)
    const sortedByPrice = [...group.listings].sort((a, b) => a.currentPrice - b.currentPrice);
    const newLeader = sortedByPrice[0];
    
    console.log(`👑 Promoting ${newLeader.productName} as new group leader for ${groupId}`);
    
    // Update group and listings
    group.leaderId = newLeader.listingId;
    group.listings.forEach(listing => {
      listing.isGroupLeader = listing.listingId === newLeader.listingId;
      listing.groupLeaderId = newLeader.listingId;
    });
    
    // Sync pricing strategy from new leader to followers
    const followers = group.listings.filter(l => l.listingId !== newLeader.listingId);
    followers.forEach(follower => {
      follower.pricingStrategy = newLeader.pricingStrategy;
      follower.minPrice = newLeader.minPrice;
      follower.maxPrice = newLeader.maxPrice;
      follower.autoDeactivate = newLeader.autoDeactivate;
    });
    
    // Save settings for all followers
    for (const follower of followers) {
      await saveSettingToFirebase(follower.listingId, {
        pricingStrategy: follower.pricingStrategy,
        minPrice: follower.minPrice,
        maxPrice: follower.maxPrice,
        autoDeactivate: follower.autoDeactivate
      });
    }
  };

  // Handle manual price change - make that listing the new leader
  const handleManualPriceChange = async (listingId: string, newPrice: number) => {
    const listing = listings.find(l => l.listingId === listingId);
    if (!listing || !listing.inventoryGroupId) return;
    
    const group = inventoryGroups.get(listing.inventoryGroupId);
    if (!group || group.listings.length <= 1) return;
    
    // If this listing is not the leader, make it the leader
    if (!listing.isGroupLeader) {
      console.log(`🔄 Manual price change detected - making ${listing.productName} the new group leader`);
      await promoteNewGroupLeader(listing.inventoryGroupId, group.leaderId);
      
      // Update the group with this listing as leader
      group.leaderId = listingId;
      group.listings.forEach(l => {
        l.isGroupLeader = l.listingId === listingId;
        l.groupLeaderId = listingId;
      });
    }
    
    // Sync the new price to all group members
    await syncInventoryGroup(listing.inventoryGroupId, newPrice, listingId);
  };

  // Interval selection UI removed: automated repricing runs on a fixed cadence.

  const fetchListings = async (forceReload = false, isAutoRefresh = false) => {
    // Client-side throttle/cooldown to reduce StockX rate limiting (429) via our API.
    const nowMs = Date.now();
    const cooldownUntil = listingsCooldownUntilRef.current || 0;
    if (nowMs < cooldownUntil) {
      const remainingSeconds = Math.max(1, Math.ceil((cooldownUntil - nowMs) / 1000));
      setBulkActionMessage(`⏳ Rate limited. Try again in ${remainingSeconds}s.`);
      setTimeout(() => setBulkActionMessage(null), 3000);
      return;
    }

    // Soft minimum spacing between fetches (unless forceReload).
    if (!forceReload && listingsLastFetchStartedAtRef.current && nowMs - listingsLastFetchStartedAtRef.current < 20_000) {
      return;
    }
    listingsLastFetchStartedAtRef.current = nowMs;

    console.log(`🔄 Fetching listings... (forceReload: ${forceReload}, autoRefresh: ${isAutoRefresh})`);
    console.log('📊 Current state before fetch:', {
      settingsLoaded,
      savedSettingsCount: Object.keys(savedSettings).length,
      currentUser: authUser?.uid,
      hasListings: listings.length > 0
    });
    // Only show loading on initial fetch or force reload
    if (isAutoRefresh) {
      setAutoRefreshing(true);
    } else if (forceReload || listings.length === 0) {
      setLoading(true);
    }
    setAuthError(false);
    // Don't clear listings here - update them after successful fetch to prevent flicker
    
    try {
      // Let the server cache briefly to reduce upstream 429 risk.
      // Force reload bypasses the server cache.
      const url = `/api/stockx/listings?force=${forceReload ? '1' : '0'}`;
      console.log(`📍 Fetching from: ${url}`);
      
      let response = await fetch(url, {
        method: 'GET',
        cache: 'no-store'
      });
      
      // Check if authentication failed
      if (response.status === 401 || response.status === 403) {
        console.log('🔐 Authentication error detected, attempting token refresh...');
        
        // Try to refresh the token
        await checkAndRefreshToken();
        
        // Retry the request once
        const retryResponse = await fetch(url, { method: 'GET', cache: 'no-store' });
        
        if (retryResponse.status === 401 || retryResponse.status === 403) {
          // Still failing after refresh attempt
          setAuthenticated(false);
          setAuthError(true);
          // Don't wipe existing listings; keep UI usable and allow manual re-auth/refresh
          return;
        }
        
        // Use the retry response
        response = retryResponse;
      }
      
      // Defensive parsing: if something upstream returns HTML (CAPTCHA/auth wall or Next error page),
      // calling response.json() will throw and break the UI.
      const rawText = await response.text();
      const contentType = response.headers.get('content-type') || '';
      const trimmed = rawText.trim().toLowerCase();
      const isHtml =
        contentType.includes('text/html') ||
        trimmed.startsWith('<!doctype') ||
        trimmed.startsWith('<html') ||
        trimmed.startsWith('<head') ||
        trimmed.startsWith('<body') ||
        trimmed.startsWith('<');

      if (isHtml) {
        console.error('❌ Listings API returned HTML (likely auth challenge/CAPTCHA).');
        setCaptchaDetected(true);
        setCaptchaSnippet(rawText.slice(0, 3000));
        setAuthenticated(false);
        setAuthError(true);
        setBulkActionMessage('❌ StockX returned an authentication challenge (HTML). Please re-authenticate.');
        setTimeout(() => setBulkActionMessage(null), 10000);
        return;
      }

      let data: any = null;
      try {
        data = JSON.parse(rawText);
      } catch {
        console.error('❌ Listings API returned non-JSON response.');
        setCaptchaDetected(true);
        setCaptchaSnippet(rawText.slice(0, 3000));
        setAuthenticated(false);
        setAuthError(true);
        setBulkActionMessage('❌ StockX returned an unexpected response. Please re-authenticate.');
        setTimeout(() => setBulkActionMessage(null), 10000);
        return;
      }

      // If the API explicitly tells us StockX returned HTML, treat it as auth/captcha.
      if (data?.upstream?.kind === 'html') {
        setCaptchaDetected(true);
        setCaptchaSnippet(typeof data?.upstream?.snippet === 'string' ? data.upstream.snippet.slice(0, 3000) : null);
        setAuthenticated(false);
        setAuthError(true);
        setBulkActionMessage('❌ StockX returned an authentication challenge (HTML). Please re-authenticate.');
        setTimeout(() => setBulkActionMessage(null), 10000);
        return;
      }

      // Rate-limited: set a cooldown and keep showing cached/current listings.
      if (response.status === 429 || data?.error === 'Too Many Requests') {
        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfterSecondsFromHeader = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
        const retryAfterSecondsFromBody = typeof data?.retryAfterSeconds === 'number' ? data.retryAfterSeconds : NaN;
        const retryAfterSeconds = Number.isFinite(retryAfterSecondsFromHeader)
          ? retryAfterSecondsFromHeader
          : Number.isFinite(retryAfterSecondsFromBody)
            ? retryAfterSecondsFromBody
            : 30;

        const boundedSeconds = Math.min(120, Math.max(10, retryAfterSeconds));
        listingsCooldownUntilRef.current = Date.now() + boundedSeconds * 1000;
        setBulkActionMessage(`⏳ StockX rate-limited (429). Waiting ~${boundedSeconds}s before retrying.`);
        setTimeout(() => setBulkActionMessage(null), 6000);
        return;
      }
      
      // Always log the raw response to see what we're getting
      console.log('📦 Raw API Response:', data);
      console.log('📊 Listings count:', data.listings?.length);
      console.log('🔍 Has debugInfo?', !!data.debugInfo);
      console.log('⏰ Fetched at:', new Date().toISOString());
      
      // Log debug information to browser console
      if (data.debugInfo) {
        console.log('🔍 === StockX Listing Debug Info ===');
        console.log('API Response:', data.debugInfo.apiResponse);
        console.log('Filtering Steps:', data.debugInfo.filtering);
        
        // Log filtering math check
        if (data.debugInfo.filtering.mathCheck) {
          console.log('\n📐 Filtering Math Check:');
          console.log(`  Total from API: ${data.debugInfo.filtering.mathCheck.totalFromAPI}`);
          console.log(`  - Expired listings: ${data.debugInfo.filtering.mathCheck.expiredListings}`);
          console.log(`  - With orders: ${data.debugInfo.filtering.mathCheck.listingsWithOrders}`);
          console.log(`  = Should have: ${data.debugInfo.filtering.mathCheck.calculated}`);
          console.log(`  Actually have: ${data.debugInfo.filtering.mathCheck.actual}`);
        }
        
        // Log suspicious listings
        if (data.debugInfo.filtering.suspiciousListings && data.debugInfo.filtering.suspiciousListings.length > 0) {
          console.log('\n🚨 Suspicious Listings (expired but showing):');
          data.debugInfo.filtering.suspiciousListings.forEach((listing: any, index: number) => {
            console.log(`  ${index + 1}. ${listing.productName} - Size ${listing.size}`);
            console.log(`     Expired: ${listing.expiredAt}`);
            console.log(`     Current: ${listing.currentTime}`);
          });
        }
        
        console.log('\nDiscrepancy Analysis:', data.debugInfo.discrepancy);
        
        if (data.debugInfo.discrepancy.difference !== 0) {
          console.warn(`⚠️ Showing ${data.debugInfo.discrepancy.showing} listings but expected ${data.debugInfo.discrepancy.expected}`);
          console.warn('Possible reasons:', data.debugInfo.discrepancy.possibleReasons);
          if (data.debugInfo.discrepancy.inventoryTypes) {
            console.log('Inventory Types:', data.debugInfo.discrepancy.inventoryTypes);
          }
        }
      }
      
      if (data.success && data.listings && Array.isArray(data.listings)) {
        setAuthenticated(true); // User is authenticated if we got listings
        setCaptchaDetected(false);
        setCaptchaSnippet(null);
        
        // Load cached market prices
        let cachedPrices: Record<string, any> = {};
        try {
          const cached = localStorage.getItem('stockx_market_prices');
          if (cached) {
            cachedPrices = JSON.parse(cached);
            console.log('📦 Loaded cached market prices for', Object.keys(cachedPrices).length, 'listings');
          }
        } catch (error) {
          console.error('Error loading cached prices:', error);
        }
        
        const enrichedListings = data.listings.map((listing: any) => {
          const cached = cachedPrices[listing.listingId];
          // Only use cache if it's less than 1 hour old
          const isRecentCache = cached && (Date.now() - cached.cachedAt < 3600000);
          
          return {
          ...listing,
            selected: false,
            // Apply cached prices if available and recent
            lowestAsk: isRecentCache && cached.lowestAsk ? cached.lowestAsk : listing.lowestAsk,
            flexLowestAsk: isRecentCache && cached.flexLowestAsk ? cached.flexLowestAsk : listing.flexLowestAsk,
            highestBid: isRecentCache && cached.highestBid ? cached.highestBid : listing.highestBid,
            lastSale: isRecentCache && cached.lastSale ? cached.lastSale : listing.lastSale
          };
        });
        
        // Process inventory groups
        const groupedListings = processInventoryGroups(enrichedListings);
        
        // Apply saved settings to the grouped listings
        // IMPORTANT: use the ref to avoid stale closures when this runs right after a Save.
        const currentSaved = savedSettingsRef.current || {};
        let finalListings = groupedListings;
        if (Object.keys(currentSaved).length > 0) {
          console.log('🔧 Applying saved settings after grouping...');
          console.log('📊 Settings loaded:', settingsLoaded);
          console.log('📊 Number of saved settings:', Object.keys(currentSaved).length);
          
          finalListings = groupedListings.map(listing => {
            const saved = currentSaved[listing.listingId];
            if (saved) {
              console.log(`✅ Restoring settings for ${listing.listingId}:`, {
                savedMinPrice: saved.minPrice,
                savedMaxPrice: saved.maxPrice,
                hasMinPrice: saved.hasOwnProperty('minPrice'),
                hasMaxPrice: saved.hasOwnProperty('maxPrice'),
                currentMinPrice: listing.minPrice,
                currentMaxPrice: listing.maxPrice
              });
              return {
                ...listing,
                repricingEnabled: saved.hasOwnProperty('enabled') ? saved.enabled !== false : true,
                pricingStrategy: saved.pricingStrategy || listing.pricingStrategy,
                minPrice: saved.hasOwnProperty('minPrice') ? saved.minPrice : listing.minPrice,
                maxPrice: saved.hasOwnProperty('maxPrice') ? saved.maxPrice : listing.maxPrice,
                autoDeactivate: saved.hasOwnProperty('autoDeactivate') ? saved.autoDeactivate : listing.autoDeactivate
              };
            } else {
              console.log(`⚠️ No saved settings found for ${listing.listingId}`);
            }
            // No settings doc = not opted-in = OFF by default
            return { ...listing, repricingEnabled: false };
          });
        } else {
          console.log('⚠️ Settings not applied:', {
            hasUser: !!authUser,
            settingsLoaded,
            savedSettingsCount: Object.keys(currentSaved).length
          });
        }
        
        setListings(finalListings);
        setLastFetchTime(new Date());

        // Persist listings so the table is not empty after navigation/refresh.
        // Store a minimal payload to reduce localStorage size.
        try {
          const minimal = finalListings.map((l: any) => ({
            listingId: l.listingId,
            productId: l.productId,
            variantId: l.variantId,
            productName: l.productName,
            urlKey: l.urlKey || null,
            size: l.size,
            currentPrice: l.currentPrice,
            originalPrice: l.originalPrice,
            styleId: l.styleId,
            brand: l.brand,
            colorway: l.colorway,
            condition: l.condition,
            status: l.status,
            createdAt: l.createdAt,
            updatedAt: l.updatedAt,
            retailPrice: l.retailPrice,
            lowestAsk: l.lowestAsk,
            flexLowestAsk: l.flexLowestAsk,
            highestBid: l.highestBid,
            lastSale: l.lastSale,
            category: l.category,
            inventoryType: l.inventoryType,
            pricingStrategy: l.pricingStrategy,
            repricingEnabled: l.repricingEnabled,
            minPrice: l.minPrice,
            maxPrice: l.maxPrice,
            autoDeactivate: l.autoDeactivate
          }));
          localStorage.setItem(
            LISTINGS_CACHE_KEY,
            JSON.stringify({ cachedAt: Date.now(), listings: minimal })
          );
        } catch (e) {
          console.warn('⚠️ Failed to cache listings:', e);
        }
        
        // Store listing stats if available
        if (data.rawCount !== undefined || data.trueDuplicatesRemoved !== undefined || data.investigation) {
          setListingStats({
            rawCount: data.rawCount,
            trueDuplicatesRemoved: data.trueDuplicatesRemoved,
            investigation: data.investigation
          });
        }
        
        // Auto-fetch market prices for first page of listings (in background)
        if (!forceReload && finalListings.length > 0) {
          const firstPageListings = finalListings.slice(0, itemsPerPage);
          const listingsNeedingPrices = firstPageListings.filter(l => (!l.lowestAsk || l.lowestAsk === 0) && (!l.flexLowestAsk || l.flexLowestAsk === 0));
          
          if (listingsNeedingPrices.length > 0) {
            console.log(`🔄 Auto-fetching market prices for ${listingsNeedingPrices.length} listings...`);
            // Fetch in background without blocking UI
            setTimeout(() => {
              fetchMarketDataForListings(listingsNeedingPrices).catch(err => {
                console.error('Background market price fetch failed:', err);
              });
            }, 1000); // Small delay to not overwhelm API
          }
        }
        
        // If user is logged in but settings haven't loaded yet, load them now
        // If settings haven't loaded yet, try to load them using whichever user id is available.
        if (!settingsLoaded) {
          const effectiveUserId = authUser?.uid || (() => {
            try {
              const cookies = document.cookie.split(';');
              const userIdCookie = cookies.find(c => c.trim().startsWith('site-user-id='));
              if (!userIdCookie) return null;
              return decodeURIComponent(userIdCookie.split('=')[1]);
            } catch {
              return null;
            }
          })();

          if (effectiveUserId) {
            console.log('🔄 Loading saved settings after listings fetch...');
            await loadSavedSettings(effectiveUserId);
          }
        }
      } else if (data.error && data.error.includes('token')) {
        // Token related error
        setAuthenticated(false);
        setAuthError(true);
        // Keep existing listings to prevent flicker
      } else {
        console.error('❌ Error response from API:', data);
        if (data.error) {
          console.error('❌ Error:', data.error);
          console.error('❌ Message:', data.message);
          console.error('❌ Details:', data.details);
        }
        // Keep existing listings on error (avoid blanking the table)
        setBulkActionMessage(`❌ Failed to load listings: ${data.message || data.error || 'Unknown error'}`);
        setTimeout(() => setBulkActionMessage(null), 10000);
      }
    } catch (error) {
      console.error('❌ Failed to fetch listings:', error);
      // Keep existing listings on error to prevent flicker
    } finally {
      setLoading(false);
      setAutoRefreshing(false);
      console.log(`✅ Fetch complete at ${new Date().toISOString()}`);
    }
  };

  const toggleListingSelection = async (listingId: string) => {
    // First update the selection state
    setListings(prev => prev.map(listing => 
      listing.listingId === listingId 
        ? { ...listing, selected: !listing.selected }
        : listing
    ));
    
    // Find the listing that was toggled
    const listing = listings.find(l => l.listingId === listingId);
    if (!listing || listing.selected) return; // If already selected or not found, skip
    
    // If we don't have market data for this listing, fetch it
    if ((!listing.lowestAsk || listing.lowestAsk === 0) && (!listing.flexLowestAsk || listing.flexLowestAsk === 0)) {
      try {
        const response = await fetch('/api/stockx/listings/market-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            listings: [{ 
              listingId: listing.listingId, 
              productId: listing.productId, 
              variantId: listing.variantId 
            }]
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.marketData && data.marketData.length > 0) {
            const marketInfo = data.marketData[0];
            if (marketInfo.marketData) {
              // Update the listing with market data
              setListings(prev => prev.map(l => 
                l.listingId === listingId 
                  ? { 
                      ...l, 
                      lowestAsk: marketInfo.marketData.lowestAsk,
                      flexLowestAsk: marketInfo.marketData.flexLowestAsk,
                      highestBid: marketInfo.marketData.highestBid,
                      lastSale: marketInfo.marketData.lastSale
                    }
                  : l
              ));
            }
          }
        }
      } catch (error) {
        console.error('Error fetching market data:', error);
      }
    }
  };

  const selectAll = async () => {
    const allPageSelected = paginatedListings.every(listing => listing.selected);
    
    // Update selection state for current page items only
    setListings(prev => prev.map(listing => {
      const isOnCurrentPage = paginatedListings.some(pl => pl.listingId === listing.listingId);
      if (isOnCurrentPage) {
        return { ...listing, selected: !allPageSelected };
      }
      return listing;
    }));
    
    // If selecting all on current page, fetch market data for listings that don't have it
    if (!allPageSelected) {
      const listingsNeedingData = paginatedListings.filter(l => (!l.lowestAsk || l.lowestAsk === 0) && (!l.flexLowestAsk || l.flexLowestAsk === 0));
      if (listingsNeedingData.length > 0) {
        try {
          // No need to limit since we're already paginated
          const batchListings = listingsNeedingData.map(l => ({
            listingId: l.listingId,
            productId: l.productId,
            variantId: l.variantId
          }));
          
          const response = await fetch('/api/stockx/listings/market-data', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ listings: batchListings })
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.marketData) {
              // Update listings with market data
              setListings(prev => prev.map(listing => {
                const marketInfo = data.marketData.find((m: any) => m.listingId === listing.listingId);
                if (marketInfo && marketInfo.marketData) {
                  return {
                    ...listing,
                    lowestAsk: marketInfo.marketData.lowestAsk,
                    flexLowestAsk: marketInfo.marketData.flexLowestAsk,
                    highestBid: marketInfo.marketData.highestBid,
                    lastSale: marketInfo.marketData.lastSale
                  };
                }
                return listing;
              }));
            }
          }
        } catch (error) {
          console.error('Error fetching market data for batch:', error);
        }
      }
    }
  };

  const fetchMarketDataForListings = useCallback(async (listingsToFetch: Listing[]) => {
    if (listingsToFetch.length === 0) return;
    
    try {
      const batchListings = listingsToFetch.map(l => ({
        listingId: l.listingId,
        productId: l.productId,
        variantId: l.variantId
      }));
      
      const response = await fetch('/api/stockx/listings/market-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ listings: batchListings })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.marketData) {
          // Update listings with market data
          setListings(prev => {
            const updated = prev.map(listing => {
            const marketInfo = data.marketData.find((m: any) => m.listingId === listing.listingId);
            if (marketInfo && marketInfo.marketData) {
              return {
                ...listing,
                lowestAsk: marketInfo.marketData.lowestAsk,
                flexLowestAsk: marketInfo.marketData.flexLowestAsk,
                highestBid: marketInfo.marketData.highestBid,
                lastSale: marketInfo.marketData.lastSale
              };
            }
            return listing;
            });
            
            // Cache market data to localStorage
            try {
              const cacheData = updated.reduce((acc: any, listing) => {
                if (listing.lowestAsk || listing.flexLowestAsk || listing.highestBid) {
                  acc[listing.listingId] = {
                    lowestAsk: listing.lowestAsk,
                    flexLowestAsk: listing.flexLowestAsk,
                    highestBid: listing.highestBid,
                    lastSale: listing.lastSale,
                    cachedAt: Date.now()
                  };
                }
                return acc;
              }, {});
              localStorage.setItem('stockx_market_prices', JSON.stringify(cacheData));
              console.log('💾 Cached market prices for', Object.keys(cacheData).length, 'listings');
            } catch (error) {
              console.error('❌ Error caching market prices:', error);
            }
            
            return updated;
          });
        }
      }
    } catch (error) {
      console.error('Error refreshing market prices:', error);
      // Don't show alert in background refresh, only log
      if (!isBackgroundRefreshing) {
        alert('Failed to refresh market prices. Please try again.');
      }
    }
  }, [isBackgroundRefreshing]);

  const refreshMarketPrices = useCallback(async () => {
    // This is for manual refresh of current page only
    try {
      setLoading(true);
      const listingsNeedingData = paginatedListings.filter(l => (!l.lowestAsk || l.lowestAsk === 0) && (!l.flexLowestAsk || l.flexLowestAsk === 0));
      
      if (listingsNeedingData.length === 0) {
        // If all have prices, refresh all on current page
        await fetchMarketDataForListings(paginatedListings);
      } else {
        // Otherwise just fetch for those missing prices
        await fetchMarketDataForListings(listingsNeedingData);
      }
      
      // Don't update the main refresh time, this is just for current page
      console.log(`✅ Refreshed market prices for ${paginatedListings.length} items on current page`);
    } finally {
      setLoading(false);
    }
  }, [paginatedListings, fetchMarketDataForListings]);

  const refreshAllMarketPrices = useCallback(async () => {
    // Background refresh for ALL listings in batches
    if (isBackgroundRefreshing || listings.length === 0) return;
    
    console.log(`🔄 Starting background refresh for ${listings.length} total listings`);
    setIsBackgroundRefreshing(true);
    setRefreshProgress({ current: 0, total: listings.length });
    
    const BATCH_SIZE = 25; // Process 25 items at a time
    const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds between batches
    
    try {
      // Process all listings in batches
      for (let i = 0; i < listings.length; i += BATCH_SIZE) {
        const batch = listings.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(listings.length / BATCH_SIZE);
        
        console.log(`📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} items)`);
        
        // Fetch market data for this batch
        await fetchMarketDataForListings(batch);
        
        // Update progress
        const processed = Math.min(i + BATCH_SIZE, listings.length);
        setRefreshProgress({ current: processed, total: listings.length });
        
        // Wait between batches to avoid rate limiting (except for last batch)
        if (i + BATCH_SIZE < listings.length) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
      }
      
      console.log('✅ Background refresh completed for all listings');
      setLastMarketRefreshTime(new Date());
      
    } catch (error) {
      console.error('❌ Error during background refresh:', error);
    } finally {
      setIsBackgroundRefreshing(false);
      setRefreshProgress(null);
    }
  }, [listings, isBackgroundRefreshing, fetchMarketDataForListings]);

  // useEffect hooks after function definitions to avoid hoisting issues
  // Initial mount effect - only handle URL params and token refresh, not fetching
  useEffect(() => {
    let mounted = true;
    
    const init = async () => {
      // Start the token refresh interval
      startTokenRefreshInterval();
      
      // Check if we're returning from authentication
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('authenticated') === 'true') {
        // Remove the parameter from URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      
      // Don't fetch listings here - let the auth/settings useEffect handle it
      console.log('🚀 Component initialized, waiting for auth and settings...');
    };
    
    init();
    
    return () => {
      mounted = false;
    };
  }, []); // Remove startTokenRefreshInterval dependency

  // Auto-refresh ALL market prices every 15 minutes
  useEffect(() => {
    console.log('🔄 Starting auto-refresh timer for ALL market prices (15 min intervals)');
    
    // Don't refresh immediately on mount - let initial fetch complete first

    // Set up interval for periodic refresh of ALL listings
    const interval = setInterval(() => {
      console.log('⏰ Auto-refreshing ALL market prices...');
      if (listings.length > 0) {
        refreshAllMarketPrices();
      }
    }, 15 * 60 * 1000); // 15 minutes

    // Cleanup
    return () => {
      clearInterval(interval);
      console.log('🛑 Stopped auto-refresh timer');
    };
  }, []); // Empty dependency - timer should only be set up once

  // Individual listing update functions
  const updateListingStrategy = (listingId: string, type: IndividualPricingStrategy['type']) => {
    const listing = listings.find(l => l.listingId === listingId);
    if (!listing) return;
    
    // Build a clean strategy object without undefined values
    const newStrategy: any = { type };
    
    // Only add properties that are needed for each strategy type
    if (type === 'beat_lowest') {
      newStrategy.value = 1;
    } else if (type === 'percentage_below') {
      newStrategy.value = listing.pricingStrategy?.value || 5;
    } else if (type === 'manual') {
      newStrategy.manualPrice = listing.pricingStrategy?.manualPrice || listing.currentPrice;
    } else if (type === 'reset_then_beat_lowest') {
      // Hardcoded two-step: reset $999 then beat by $1
    } else if (type === 'market_peek') {
      newStrategy.peekSettings = {
        frequency: listing.pricingStrategy?.peekSettings?.frequency || 'balanced',
        peekHistory: listing.pricingStrategy?.peekSettings?.peekHistory || []
      };
      // Only add lastPeekTime if it exists
      if (listing.pricingStrategy?.peekSettings?.lastPeekTime) {
        newStrategy.peekSettings.lastPeekTime = listing.pricingStrategy.peekSettings.lastPeekTime;
      }
    }
    
    // Always store as pending change (even if same value is selected)
    // This ensures Save button always appears when dropdown is clicked
    setPendingStrategyChanges(prev => ({
      ...prev,
      [listingId]: newStrategy
    }));
    
    // Update UI immediately for preview
    setListings(prev => prev.map(l => 
      l.listingId === listingId 
        ? { ...l, pricingStrategy: newStrategy }
        : l
    ));
  };

  // Save the pending pricing rule change (and any pending min/max bound edits)
  const savePricingRuleChange = async (listingId: string) => {
    console.log('💾 Save button clicked for listing:', listingId);
    
    const listing = listings.find(l => l.listingId === listingId);
    const pendingStrategy = pendingStrategyChanges[listingId];
    const hasPendingBounds = pendingBoundChanges[listingId] === true;
    const strategyToSave = pendingStrategy || listing?.pricingStrategy || { type: 'keep_current' as const };
    
    console.log('📋 Listing found:', !!listing);
    console.log('📋 Pending strategy:', pendingStrategy);
    console.log('📋 Current user:', authUser);
    
    if (!listing || !strategyToSave) {
      console.error('❌ Cannot save: missing listing');
      return;
    }
    
    // For manual pricing, we require at least a Min bound as a safety rail.
    if (strategyToSave.type === 'manual') {
      if (!listing.minPrice || listing.minPrice <= 0) {
        setBulkActionMessage('⚠️ Please enter a Min price before saving manual pricing');
        setTimeout(() => setBulkActionMessage(null), 5000);
        return;
      }
    }
    
    // For all strategies: if min/max are provided, validate they make sense
    if (listing.minPrice && listing.maxPrice) {
      if (listing.minPrice >= listing.maxPrice) {
        setBulkActionMessage('⚠️ Min price must be less than Max price');
        setTimeout(() => setBulkActionMessage(null), 5000);
        return;
      }
    }
    
    // Warn if automated strategy has NO safety bounds at all (but still allow saving)
    if (
      strategyToSave.type !== 'manual' &&
      strategyToSave.type !== 'keep_current' &&
      (!listing.minPrice || listing.minPrice <= 0) &&
      (!listing.maxPrice || listing.maxPrice <= 0)
    ) {
      console.warn(`⚠️ Saving ${strategyToSave.type} without any safety bounds for listing ${listingId}`);
    }
    
    // Check if this listing is part of a group
    const group = listing.inventoryGroupId ? inventoryGroups.get(listing.inventoryGroupId) : null;
    const listingsToUpdate = (group && group.listings.length > 1 && listing.isGroupLeader) 
      ? group.listings 
      : [listing];
    
    // Update all listings in the group (if leader)
    if (listingsToUpdate.length > 1) {
    setListings(prev => prev.map(l => {
      const shouldUpdate = listingsToUpdate.some(ul => ul.listingId === l.listingId);
      return shouldUpdate
          ? { ...l, pricingStrategy: strategyToSave }
        : l;
    }));
    }
    
    // Save to Firebase for all updated listings
    try {
      setRowSaveState(prev => ({ ...prev, [listingId]: 'saving' }));
      for (const l of listingsToUpdate) {
        await saveSettingToFirebase(l.listingId, {
          pricingStrategy: strategyToSave,
          minPrice: l.minPrice,
          maxPrice: l.maxPrice,
          autoDeactivate: l.autoDeactivate
      });
      }

      // If user saved the Two-step strategy, run it immediately (LIVE) for this listing/group leader.
      if (pendingStrategy?.type === 'reset_then_beat_lowest') {
        const hasAnyBounds =
          (!!listing.minPrice && listing.minPrice > 0) || (!!listing.maxPrice && listing.maxPrice > 0);
        if (!hasAnyBounds) {
          const ok = window.confirm(
            'Two-step will run LIVE now.\n\nWarning: you have no Min/Max safety bounds set for this listing.\n\nRun anyway?'
          );
          if (!ok) {
            setBulkActionMessage('✅ Two-step saved. (Not executed: missing Min/Max and you cancelled.)');
            setTimeout(() => setBulkActionMessage(null), 5000);
          } else {
            setBulkActionMessage('⚡ Two-step saved. Running now...');
          }
          // If user cancelled, skip execution but continue to clear pending changes below.
          if (!ok) {
            // Remove from pending changes
            setPendingStrategyChanges(prev => {
              const newPending = { ...prev };
              delete newPending[listingId];
              return newPending;
            });
            setPendingBoundChanges(prev => {
              const next = { ...prev };
              delete next[listingId];
              return next;
            });
            setRowSaveState(prev => ({ ...prev, [listingId]: 'idle' }));
            return;
          }
        } else {
          setBulkActionMessage('⚡ Two-step saved. Running now...');
        }

        // Only run leaders (followers will be synced by the server when inventoryGroups are provided)
        const leadersToReprice = listingsToUpdate.filter(l => {
          if (!l.inventoryGroupId) return true;
          const group = inventoryGroups.get(l.inventoryGroupId);
          if (!group || group.listings.length <= 1) return true;
          return l.isGroupLeader;
        });

        setLoading(true);
        try {
          const response = await fetch('/api/stockx/repricing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              listings: leadersToReprice.map(l => ({
                ...l,
                pricingStrategy: pendingStrategy,
                // Estimate cost basis if not provided (matches executeRepricing behavior)
                costBasis: l.costBasis || l.retailPrice || l.originalPrice * 0.7
              })),
              strategy,
              dryRun: false,
              useIndividualStrategies: true,
              allowTwoStep: true,
              inventoryGroups: Array.from(inventoryGroups.values())
            })
          });

          const data = await response.json().catch(() => null);
          if (response.ok && data?.success) {
            setResults(Array.isArray(data.results) ? data.results : []);
            setBulkActionMessage('✅ Two-step executed successfully.');
            // Refresh listings to show new prices
            await fetchListings(true);
          } else {
            setBulkActionMessage(`❌ Two-step execution failed: ${data?.error || data?.message || 'Unknown error'}`);
          }
        } catch (error) {
          console.error('Two-step execution error:', error);
          setBulkActionMessage('❌ Two-step execution failed. Check console logs.');
        } finally {
          setLoading(false);
          setTimeout(() => setBulkActionMessage(null), 7000);
        }
      }
      
      // Show success message
      const strategyLabel = strategyToSave.type === 'beat_lowest' ? 'Beat Lowest by $1' :
                           strategyToSave.type === 'match_lowest' ? 'Match Lowest' :
                           strategyToSave.type === 'market_peek' ? 'Market Peek' :
                           strategyToSave.type === 'reset_then_beat_lowest' ? 'Two-step: reset then beat lowest' :
                           strategyToSave.type === 'percentage_below' ? `Below ${(strategyToSave as any).value}%` :
                           strategyToSave.type === 'manual' ? 'Manual' :
                           hasPendingBounds ? 'Bounds updated' :
                           'Keep Current';
      
      // Avoid overwriting the "running now" message for two-step
      if (pendingStrategy?.type !== 'reset_then_beat_lowest') {
        setBulkActionMessage(`✅ Pricing rule saved: ${strategyLabel} (Min: $${listing.minPrice}, Max: $${listing.maxPrice})`);
        setTimeout(() => setBulkActionMessage(null), 5000);
      }
      
      // Remove from pending changes
      setPendingStrategyChanges(prev => {
        const newPending = { ...prev };
        delete newPending[listingId];
        return newPending;
      });
      setPendingBoundChanges(prev => {
        const next = { ...prev };
        delete next[listingId];
        return next;
      });

      setRowSaveState(prev => ({ ...prev, [listingId]: 'saved' }));
      setTimeout(() => {
        setRowSaveState(prev => ({ ...prev, [listingId]: 'idle' }));
      }, 1500);
    } catch (error) {
      console.error('Error saving pricing rule:', error);
      setBulkActionMessage('❌ Failed to save pricing rule. Please try again.');
      setTimeout(() => setBulkActionMessage(null), 5000);
      setRowSaveState(prev => ({ ...prev, [listingId]: 'idle' }));
    }
  };

  const updatePeekFrequency = (listingId: string, frequency: 'conservative' | 'balanced' | 'aggressive') => {
    const listing = listings.find(l => l.listingId === listingId);
    if (!listing || !listing.pricingStrategy) return;
    
    const newStrategy = {
      ...listing.pricingStrategy,
      peekSettings: {
        ...listing.pricingStrategy.peekSettings!,
        frequency
      }
    };
    
    setListings(prev => prev.map(l => 
      l.listingId === listingId 
        ? { ...l, pricingStrategy: newStrategy }
        : l
    ));
    
    // Save to Firebase
    saveSettingToFirebase(listingId, {
      pricingStrategy: newStrategy,
      minPrice: listing.minPrice,
      maxPrice: listing.maxPrice,
      autoDeactivate: listing.autoDeactivate
    });
  };

  const updateStrategyValue = (listingId: string, value: number) => {
    const listing = listings.find(l => l.listingId === listingId);
    if (!listing) return;
    
    const newStrategy = { ...listing.pricingStrategy!, value };
    
    setListings(prev => prev.map(l => 
      l.listingId === listingId 
        ? { ...l, pricingStrategy: newStrategy }
        : l
    ));
    
    // Save to Firebase
    saveSettingToFirebase(listingId, {
      pricingStrategy: newStrategy,
      minPrice: listing.minPrice,
      maxPrice: listing.maxPrice,
      autoDeactivate: listing.autoDeactivate
    });
  };

  const updateManualPrice = (listingId: string, manualPrice: number) => {
    const listing = listings.find(l => l.listingId === listingId);
    if (!listing) return;
    
    const newStrategy = { ...listing.pricingStrategy!, manualPrice };
    
    setListings(prev => prev.map(l => 
      l.listingId === listingId 
        ? { ...l, pricingStrategy: newStrategy }
        : l
    ));
    
    // Save to Firebase
    saveSettingToFirebase(listingId, {
      pricingStrategy: newStrategy,
      minPrice: listing.minPrice,
      maxPrice: listing.maxPrice,
      autoDeactivate: listing.autoDeactivate
    });
  };

  // Apply manual price immediately to StockX
  const applyManualPriceNow = async (listingId: string) => {
    const listing = listings.find(l => l.listingId === listingId);
    if (!listing) {
      console.error('❌ Listing not found:', listingId);
      return;
    }
    
    console.log('🎯 Applying manual price for listing:', {
      listingId,
      currentPrice: listing.currentPrice,
      manualPrice: listing.pricingStrategy?.manualPrice,
      minPrice: listing.minPrice,
      maxPrice: listing.maxPrice,
      pricingStrategy: listing.pricingStrategy
    });
    
    // Validate manual price is set
    if (!listing.pricingStrategy?.manualPrice || listing.pricingStrategy.manualPrice <= 0) {
      setBulkActionMessage('⚠️ Please enter a valid manual price first');
      setTimeout(() => setBulkActionMessage(null), 5000);
      return;
    }
    
    // Validate min/max prices
    if (!listing.minPrice || listing.minPrice <= 0) {
      setBulkActionMessage('⚠️ Please set a Min price before applying manual price');
      setTimeout(() => setBulkActionMessage(null), 5000);
      return;
    }
    
    if (!listing.maxPrice || listing.maxPrice <= 0) {
      setBulkActionMessage('⚠️ Please set a Max price before applying manual price');
      setTimeout(() => setBulkActionMessage(null), 5000);
      return;
    }
    
    // Validate manual price is within range
    if (listing.pricingStrategy.manualPrice < listing.minPrice || listing.pricingStrategy.manualPrice > listing.maxPrice) {
      setBulkActionMessage(`⚠️ Manual price ($${listing.pricingStrategy.manualPrice}) must be between Min ($${listing.minPrice}) and Max ($${listing.maxPrice})`);
      setTimeout(() => setBulkActionMessage(null), 5000);
      return;
    }
    
    setLoading(true);
    try {
      console.log('📤 Updating price directly via StockX API...');
      
      // Use the direct update-price endpoint (simpler and more reliable)
      const response = await fetch('/api/stockx/listings/update-price', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          listingId: listing.listingId,
          amount: listing.pricingStrategy.manualPrice
        })
      });

      const data = await response.json();
      console.log('📥 Update response:', data);
      
      // Check for authentication error
      if (data.needsAuth || (data.error && (data.error.includes('401') || data.error.toLowerCase().includes('token expired')))) {
        setBulkActionMessage('⚠️ StockX access token expired. Please re-authenticate with StockX and try again.');
        setTimeout(() => setBulkActionMessage(null), 10000);
        return;
      }
      
      if (data.success) {
        setBulkActionMessage(`✅ Price updated to $${data.newPrice} on StockX!`);
        setTimeout(() => setBulkActionMessage(null), 5000);
        // Refresh listings to show updated price
        await fetchListings(true);
      } else {
        console.error('❌ Update failed:', data);
        setBulkActionMessage(`❌ ${data.error || 'Failed to update price'}`);
        setTimeout(() => setBulkActionMessage(null), 10000);
      }
    } catch (error) {
      console.error('❌ Manual price update error:', error);
      setBulkActionMessage('❌ Failed to update price on StockX');
      setTimeout(() => setBulkActionMessage(null), 10000);
    } finally {
      setLoading(false);
    }
  };

  const updateMinPrice = (listingId: string, minPrice: number, opts?: { persist?: boolean }) => {
    console.log(`🔧 updateMinPrice called for ${listingId} with value: ${minPrice}`);
    const listing = listings.find(l => l.listingId === listingId);
    if (!listing) {
      console.log(`❌ Listing ${listingId} not found`);
      return;
    }
    
    const newMinPrice = isNaN(minPrice) ? undefined : minPrice;
    console.log(`📊 New min price after NaN check: ${newMinPrice}`);
    
    // Check if this listing is part of a group
    const group = listing.inventoryGroupId ? inventoryGroups.get(listing.inventoryGroupId) : null;
    const listingsToUpdate = (group && group.listings.length > 1 && listing.isGroupLeader) 
      ? group.listings 
      : [listing];
    
    console.log(`🔄 Updating ${listingsToUpdate.length} listing(s)`);
    
    // Update all listings in the group (if leader) or just this listing
    setListings(prev => prev.map(l => {
      const shouldUpdate = listingsToUpdate.some(ul => ul.listingId === l.listingId);
      return shouldUpdate
        ? { ...l, minPrice: newMinPrice }
        : l;
    }));

    // Mark row dirty so the Save button appears.
    // If editing a group leader, saving will apply to the full group via Save.
    setPendingBoundChanges(prev => ({ ...prev, [listingId]: true }));
  };

  const updateMaxPrice = (listingId: string, maxPrice: number, opts?: { persist?: boolean }) => {
    console.log(`🔧 updateMaxPrice called for ${listingId} with value: ${maxPrice}`);
    const listing = listings.find(l => l.listingId === listingId);
    if (!listing) {
      console.log(`❌ Listing ${listingId} not found`);
      return;
    }
    
    const newMaxPrice = isNaN(maxPrice) ? undefined : maxPrice;
    console.log(`📊 New max price after NaN check: ${newMaxPrice}`);
    
    // Check if this listing is part of a group
    const group = listing.inventoryGroupId ? inventoryGroups.get(listing.inventoryGroupId) : null;
    const listingsToUpdate = (group && group.listings.length > 1 && listing.isGroupLeader) 
      ? group.listings 
      : [listing];
    
    console.log(`🔄 Updating ${listingsToUpdate.length} listing(s)`);
    
    // Update all listings in the group (if leader) or just this listing
    setListings(prev => prev.map(l => {
      const shouldUpdate = listingsToUpdate.some(ul => ul.listingId === l.listingId);
      return shouldUpdate
        ? { ...l, maxPrice: newMaxPrice }
        : l;
    }));

    // Mark row dirty so the Save button appears.
    setPendingBoundChanges(prev => ({ ...prev, [listingId]: true }));
  };

  const updateAutoDeactivate = (listingId: string, autoDeactivate: boolean) => {
    const listing = listings.find(l => l.listingId === listingId);
    if (!listing) return;
    
    setListings(prev => prev.map(l => 
      l.listingId === listingId 
        ? { ...l, autoDeactivate }
        : l
    ));
    
    // Save to Firebase
    saveSettingToFirebase(listingId, {
      pricingStrategy: listing.pricingStrategy,
      minPrice: listing.minPrice,
      maxPrice: listing.maxPrice,
      autoDeactivate: autoDeactivate
    });
  };

  const updateRepricingEnabled = (listingId: string, enabled: boolean) => {
    const listing = listings.find(l => l.listingId === listingId);
    if (!listing) return;

    // Update UI immediately
    setListings(prev =>
      prev.map(l => (l.listingId === listingId ? { ...l, repricingEnabled: enabled } : l))
    );

    // Persist. If listing had no prior settings doc, this creates one (opt-in).
    saveSettingToFirebase(listingId, {
      enabled,
      pricingStrategy: listing.pricingStrategy || { type: 'keep_current' },
      minPrice: listing.minPrice,
      maxPrice: listing.maxPrice,
      autoDeactivate: listing.autoDeactivate
    });
  };

  const applyPricingRule = async (rule: string, value: number) => {
    const selectedListings = listings.filter(listing => listing.selected);
    
    if (selectedListings.length === 0) {
      alert('Please select at least one listing to apply pricing rule');
      return;
    }

    // Map rule to pricing strategy type
    let strategyType: IndividualPricingStrategy['type'] = 'keep_current';
    if (rule === 'beat_lowest') {
      strategyType = 'beat_lowest';
    } else if (rule === 'match_lowest') {
      strategyType = 'match_lowest';
    } else if (rule === 'percentage') {
      strategyType = 'percentage_below';
    }

    // Update the pricing strategy for all selected listings
    setListings(prev => prev.map(listing => {
      if (listing.selected) {
        return {
          ...listing,
          pricingStrategy: {
            type: strategyType,
            value: value
          }
        };
      }
      return listing;
    }));

    // Show success message
    console.log(`✅ Applied ${rule} pricing rule to ${selectedListings.length} listings`);
    
    // Display success message
    let message = '';
    if (rule === 'beat_lowest') {
      message = `Applied "Beat Lowest by $${value}" to ${selectedListings.length} item${selectedListings.length > 1 ? 's' : ''}`;
    } else if (rule === 'match_lowest') {
      message = `Applied "Match Lowest Ask" to ${selectedListings.length} item${selectedListings.length > 1 ? 's' : ''}`;
    } else if (rule === 'percentage') {
      message = `Applied "${value}% Below Market" to ${selectedListings.length} item${selectedListings.length > 1 ? 's' : ''}`;
    }
    
    setBulkActionMessage(message);
    setTimeout(() => setBulkActionMessage(null), 5000); // Clear after 5 seconds
    
    // Close the modal
    setShowBulkPricingModal(false);
    
    // Optional: Auto-refresh market prices for selected items
    if (selectedListings.some(l => !getTrueAsk(l))) {
      await fetchMarketDataForListings(selectedListings);
    }
  };

  const applyPricingRuleDirectly = async (rule: string, value: number) => {
    const selectedListings = listings.filter(listing => listing.selected);
    
    if (selectedListings.length === 0) {
      alert('Please select at least one listing to reprice');
      return;
    }

    setLoading(true);
    try {
      // Calculate new prices based on rule
      const updates = selectedListings.map(listing => {
        let newPrice = listing.currentPrice;
        
        if (rule === 'beat_lowest') {
          const market = getTrueAsk(listing) || listing.currentPrice;
          newPrice = market - value;
        } else if (rule === 'match_lowest') {
          newPrice = getTrueAsk(listing) || listing.currentPrice;
        } else if (rule === 'percentage') {
          const marketPrice = getTrueAsk(listing) || listing.currentPrice;
          newPrice = marketPrice * (1 - value / 100);
        }
        
        // Round to nearest dollar
        newPrice = Math.round(newPrice);
        
        return {
          listingId: listing.listingId,
          currentPrice: listing.currentPrice,
          newPrice,
          marketPrice: getTrueAsk(listing) || 0
        };
      });

      // Update prices via API
      const response = await fetch('/api/stockx/listings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update_price',
          listingIds: updates.map(u => u.listingId),
          updates // Send all update details
        })
      });

      const data = await response.json();
      
      if (data.success) {
        alert(`Successfully updated ${updates.length} listing${updates.length > 1 ? 's' : ''}`);
        // Refresh listings to show new prices
        await fetchListings();
      } else {
        alert(`Failed to update prices: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Pricing rule error:', error);
      alert('Failed to apply pricing rule');
    } finally {
      setLoading(false);
    }
  };

  const applyCustomRule = async (type: string, amount: number) => {
    const selectedListings = listings.filter(listing => listing.selected);
    
    if (selectedListings.length === 0) {
      alert('Please select at least one listing to reprice');
      return;
    }

    setLoading(true);
    try {
      // Calculate new prices based on custom rule
      const updates = selectedListings.map(listing => {
        let newPrice = listing.currentPrice;
        const marketPrice = getTrueAsk(listing) || listing.currentPrice;
        
        switch (type) {
          case 'below_dollar':
            newPrice = marketPrice - amount;
            break;
          case 'below_percent':
            newPrice = marketPrice * (1 - amount / 100);
            break;
          case 'above_dollar':
            newPrice = marketPrice + amount;
            break;
          case 'above_percent':
            newPrice = marketPrice * (1 + amount / 100);
            break;
        }
        
        // Round to nearest dollar
        newPrice = Math.round(newPrice);
        
        return {
          listingId: listing.listingId,
          currentPrice: listing.currentPrice,
          newPrice,
          marketPrice
        };
      });

      // Update prices via API
      const response = await fetch('/api/stockx/listings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update_price',
          listingIds: updates.map(u => u.listingId),
          updates
        })
      });

      const data = await response.json();
      
      if (data.success) {
        alert(`Successfully updated ${updates.length} listing${updates.length > 1 ? 's' : ''}`);
        await fetchListings();
      } else {
        alert(`Failed to update prices: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Custom rule error:', error);
      alert('Failed to apply custom pricing rule');
    } finally {
      setLoading(false);
    }
  };

  const calculatePreviewPrices = async () => {
    const selectedListings = listings.filter(listing => listing.selected);
    
    if (selectedListings.length === 0) {
      return;
    }

    const previewData: RepricingResult[] = selectedListings.map(listing => {
      let newPrice = listing.currentPrice;
      let reason = 'No pricing rule set';
      
      if (listing.pricingStrategy) {
        const marketPrice = getTrueAsk(listing) || listing.currentPrice;
        
        switch (listing.pricingStrategy.type) {
          case 'beat_lowest':
            const beatBy = listing.pricingStrategy.value || 1;
            newPrice = Math.max(1, marketPrice - beatBy);
            reason = `Beat lowest by $${beatBy}`;
            break;
            
          case 'match_lowest':
            newPrice = marketPrice;
            reason = 'Match lowest ask';
            break;
            
          case 'percentage_below':
            const percentage = listing.pricingStrategy.value || 5;
            newPrice = Math.max(1, Math.round(marketPrice * (1 - percentage / 100)));
            reason = `${percentage}% below market`;
            break;

          case 'reset_then_beat_lowest': {
            const beatBy2 = 1;
            // Preview is "what you'll end up at" (step 2). Step 1 happens server-side.
            newPrice = Math.max(1, Math.round(marketPrice - beatBy2));
            reason = `Two-step: reset $999, then beat by $1`;
            break;
          }
            
          case 'manual':
            newPrice = listing.pricingStrategy.manualPrice || listing.currentPrice;
            reason = 'Manual price';
            break;
            
          case 'keep_current':
            newPrice = listing.currentPrice;
            reason = 'Keep current price';
            break;
            
          case 'market_peek':
            // For preview, show what would happen after a peek
            newPrice = Math.max(1, marketPrice - 1);
            const freq = listing.pricingStrategy.peekSettings?.frequency || 'balanced';
            reason = `Market Peek (${freq === 'conservative' ? '8h' : freq === 'balanced' ? '6h' : '4h'})`;
            break;
        }
        
        // Apply min/max constraints if set
        if (listing.minPrice && newPrice < listing.minPrice) {
          newPrice = listing.minPrice;
          reason += ' (limited by min price)';
        }
        if (listing.maxPrice && newPrice > listing.maxPrice) {
          newPrice = listing.maxPrice;
          reason += ' (limited by max price)';
        }
      }
      
      const priceChange = newPrice - listing.currentPrice;
      const competitivePosition = listing.lowestAsk 
        ? newPrice <= listing.lowestAsk 
          ? 'lowest_ask' 
          : newPrice <= listing.lowestAsk + 5 
            ? 'competitive' 
            : 'above_market'
        : 'unknown';
      
      return {
        listingId: listing.listingId,
        currentPrice: listing.currentPrice,
        newPrice: newPrice,
        action: priceChange === 0 ? 'no_change' : 'would_update',
        reason: reason,
        profitChange: priceChange,
        competitivePosition: competitivePosition
      };
    });
    
    setPreviewResults(previewData);
  };

  // Clear preview results when switching modes
  useEffect(() => {
    if (!dryRun) {
      setShowPreviewResults(false);
      setPreviewResults([]);
    }
  }, [dryRun]);

  const handlePreviewClick = async () => {
    if (dryRun) {
      // Calculate and show preview
      await calculatePreviewPrices();
      setShowPreviewResults(true);
    } else {
      // Execute repricing
      await executeRepricing();
    }
  };

  const runScheduledPeeks = async () => {
    const peekListings = listings.filter(l => 
      l.pricingStrategy?.type === 'market_peek' && 
      !activePeeks[l.listingId]
    );

    for (const listing of peekListings) {
      const peekSettings = listing.pricingStrategy?.peekSettings;
      if (!peekSettings) continue;

      // Check if enough time has passed based on frequency
      const lastPeek = peekSettings.lastPeekTime ? new Date(peekSettings.lastPeekTime) : null;
      const hoursSinceLastPeek = lastPeek ? (Date.now() - lastPeek.getTime()) / (1000 * 60 * 60) : Infinity;
      
      const requiredHours = peekSettings.frequency === 'conservative' ? 8 : 
                           peekSettings.frequency === 'balanced' ? 6 : 4;

      if (hoursSinceLastPeek >= requiredHours) {
        console.log(`📅 Running scheduled peek for ${listing.productName}`);
        await executeMarketPeek(listing);
        // Add delay between peeks to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  };

  const convertSizeToNumber = (size: string): number => {
    // Handle clothing sizes
    const sizeMap: { [key: string]: number } = {
      'XXS': 1, 'XS': 2, 'S': 3, 'M': 4, 'L': 5, 'XL': 6, 'XXL': 7, 'XXXL': 8,
      'XXS/XS': 1.5, 'XS/S': 2.5, 'S/M': 3.5, 'M/L': 4.5, 'L/XL': 5.5, 'XL/XXL': 6.5
    };
    
    const upperSize = size.toUpperCase();
    if (sizeMap[upperSize]) return sizeMap[upperSize];
    
    // Handle shoe sizes (numeric)
    const numericSize = parseFloat(size);
    if (!isNaN(numericSize)) return numericSize;
    
    // Handle W (women's) or Y/GS (youth) prefixes
    const sizeMatch = size.match(/^[WYC]?(\d+\.?\d*)/i);
    if (sizeMatch) {
      const baseSize = parseFloat(sizeMatch[1]);
      if (size.toUpperCase().startsWith('W')) return baseSize + 100; // Women's sizes sort after men's
      if (size.toUpperCase().startsWith('Y') || size.toUpperCase().includes('GS')) return baseSize - 100; // Youth sizes sort before men's
      return baseSize;
    }
    
    // Default to alphabetical for unknown formats
    return 999;
  };

  const copyStyleCode = (styleId: string, listingId: string) => {
    navigator.clipboard.writeText(styleId).then(() => {
      setCopiedStyleIds(prev => ({ ...prev, [listingId]: true }));
      setTimeout(() => {
        setCopiedStyleIds(prev => ({ ...prev, [listingId]: false }));
      }, 2000);
    });
  };

  const copyListingIdentifiers = (listing: Listing) => {
    const payload = [
      `productName: ${listing.productName}`,
      `styleId: ${listing.styleId || ''}`,
      `listingId: ${listing.listingId}`,
      `productId: ${listing.productId}`,
      `variantId: ${listing.variantId}`,
      `marketDataUrl: https://api.stockx.com/v2/catalog/products/${listing.productId}/variants/${listing.variantId}/market-data`
    ].join('\n');

    navigator.clipboard.writeText(payload).then(() => {
      setCopiedListingIds(prev => ({ ...prev, [listing.listingId]: true }));
      setTimeout(() => {
        setCopiedListingIds(prev => ({ ...prev, [listing.listingId]: false }));
      }, 2000);
    });
  };

  const buildStockXProductUrl = (listing: Listing): string | null => {
    // Prefer StockX-provided `urlKey` slug when available (most accurate).
    const urlKey = (listing.urlKey || '').trim();
    const base = urlKey
      ? `https://stockx.com/${encodeURIComponent(urlKey)}`
      : (() => {
          const name = (listing.productName || '').trim();
          if (!name) return null;
          let slug = name
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');
          // Common StockX pattern: Jordans are usually "air-jordan-..."
          if (slug.startsWith('jordan-')) slug = `air-${slug}`;
          return `https://stockx.com/${slug}`;
        })();

    if (!base) return null;
    const size = (listing.size || '').trim();
    return size ? `${base}?size=${encodeURIComponent(size)}` : base;
  };

  const resolveUserIdForApi = (): string | null => {
    const siteUserId = typeof window !== 'undefined' ? localStorage.getItem('siteUserId') : null;
    return authUser?.uid || siteUserId || null;
  };

  const assignUnitNumberToListing = async (listingId: string, unitNumber: number | null) => {
    setUnitAssignStateByListingId(prev => ({ ...prev, [listingId]: 'saving' }));
    try {
      const userId = resolveUserIdForApi();
      const resp = await fetch('/api/stockx/listings/assign-unit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId || undefined,
          listingId,
          unitNumber
        })
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || json?.success === false) {
        throw new Error(json?.details || json?.error || `Assign failed (${resp.status})`);
      }

      setUnitAssignStateByListingId(prev => ({ ...prev, [listingId]: 'saved' }));
      setTimeout(() => {
        setUnitAssignStateByListingId(prev => ({ ...prev, [listingId]: 'idle' }));
      }, 2000);

      if (unitNumber === null) {
        setBulkActionMessage('✅ Unit assignment cleared');
      } else {
        setBulkActionMessage(`✅ Assigned Unit #${unitNumber} to listing`);
      }
      setTimeout(() => setBulkActionMessage(null), 4000);
    } catch (e: any) {
      setUnitAssignStateByListingId(prev => ({ ...prev, [listingId]: 'idle' }));
      setBulkActionMessage(`❌ Unit assign failed: ${e?.message || 'Unknown error'}`);
      setTimeout(() => setBulkActionMessage(null), 6000);
    }
  };

  const fetchAvailableUnitsForListing = async (listing: Listing) => {
    const styleId = (listing.styleId || '').trim();
    const size = (listing.size || '').trim();
    if (!styleId || !size) {
      setBulkActionMessage('⚠️ This listing is missing styleId or size (can’t find matching units).');
      setTimeout(() => setBulkActionMessage(null), 4000);
      return;
    }

    try {
      setUnitOptionsLoadingByListingId(prev => ({ ...prev, [listing.listingId]: true }));
      const userId = resolveUserIdForApi();
      const qs = new URLSearchParams({
        userId: userId || '',
        styleId,
        size
      });
      const resp = await fetch(`/api/purchases/available-units?${qs.toString()}`, { cache: 'no-store' });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || json?.success === false) {
        throw new Error(json?.error || `Failed (${resp.status})`);
      }
      const units = Array.isArray(json?.units) ? json.units : [];
      setUnitOptionsByListingId(prev => ({
        ...prev,
        [listing.listingId]: units.map((u: any) => ({
          unitNumber: Number(u.unitNumber),
          orderNumber: u.orderNumber || null
        })).filter((u: any) => Number.isFinite(u.unitNumber))
      }));
      if (units.length === 0) {
        setBulkActionMessage('ℹ️ No available units found (add Unit # on the purchase first).');
        setTimeout(() => setBulkActionMessage(null), 5000);
      }
    } catch (e: any) {
      setBulkActionMessage(`❌ Failed to load units: ${e?.message || 'Unknown error'}`);
      setTimeout(() => setBulkActionMessage(null), 6000);
    } finally {
      setUnitOptionsLoadingByListingId(prev => ({ ...prev, [listing.listingId]: false }));
    }
  };

  const handleSort = (column: 'product' | 'size' | 'price' | 'market' | 'status') => {
    if (sortColumn === column) {
      // Toggle direction if clicking the same column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new column and default to ascending
      setSortColumn(column);
      setSortDirection('asc');
    }
    // Reset to first page when sorting
    setCurrentPage(1);
  };

  const manualPeekNow = async (listingId: string) => {
    const listing = listings.find(l => l.listingId === listingId);
    if (!listing) return;

    // Check if already peeking
    if (activePeeks[listingId]) {
      console.log('Already peeking this listing');
      return;
    }

    // Check if a peek was done in the last 2 hours
    const lastPeek = listing.pricingStrategy?.peekSettings?.lastPeekTime;
    if (lastPeek) {
      const hoursSinceLastPeek = (Date.now() - new Date(lastPeek).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastPeek < 2) {
        alert(`Please wait ${Math.ceil(2 - hoursSinceLastPeek)} more hours before peeking again.`);
        return;
      }
    }

    console.log(`👆 Manual peek triggered for ${listing.productName}`);
    
    // Set a maximum timeout to clear the peeking state after 30 seconds
    const timeoutId = setTimeout(() => {
      console.log('⏱️ Market peek timeout - clearing state');
      setActivePeeks(prev => ({ ...prev, [listingId]: false }));
    }, 30000);

    try {
      const result = await executeMarketPeek(listing);
      
      if (result.success) {
        setBulkActionMessage(`Market peek successful! Discovered price: $${result.discoveredLowestAsk}, New price: $${result.newPrice}`);
        setTimeout(() => setBulkActionMessage(null), 5000);
      } else {
        setBulkActionMessage(`Market peek failed: ${result.error || 'Unknown error'}`);
        setTimeout(() => setBulkActionMessage(null), 5000);
      }
    } finally {
      // Clear the timeout since the operation completed
      clearTimeout(timeoutId);
    }
  };

  const executeMarketPeek = async (listing: Listing): Promise<MarketPeekResult> => {
    const startTime = Date.now();
    const result: MarketPeekResult = {
      timestamp: new Date().toISOString(),
      previousPrice: listing.currentPrice,
      peekPrice: 0,
      discoveredLowestAsk: 0,
      newPrice: 0,
      profitGained: 0,
      success: false,
      apiResponseTimes: {}
    };

    try {
      // Check if this listing is part of a group and if it's the leader
      const group = listing.inventoryGroupId ? inventoryGroups.get(listing.inventoryGroupId) : null;
      if (group && group.listings.length > 1 && !listing.isGroupLeader) {
        console.log(`⚠️ Skipping market peek for follower listing ${listing.listingId}. Only group leader can peek.`);
        throw new Error('Only group leader can perform market peek');
      }
      
      // Get all listings to update (leader + followers)
      const listingsToUpdate = group && group.listings.length > 1 ? group.listings : [listing];
      const listingIds = listingsToUpdate.map(l => l.listingId);
      
      // Mark all listings in group as peeking
      listingIds.forEach(id => {
        setActivePeeks(prev => ({ ...prev, [id]: true }));
      });
      
      // Step 1: Calculate peek price (always 10x for proper market discovery)
      const currentMarketPrice = listing.lowestAsk || listing.currentPrice;
      // Always use 10x strategy for peek, regardless of max price settings
      // Max price will be enforced on the final price, not the temporary peek
      result.peekPrice = Math.min(currentMarketPrice * 10, 9999);
      
      // Safety check: Ensure we have enough separation for discovery
      if (result.peekPrice < currentMarketPrice * 1.5) {
        // This should rarely happen unless price is already very high
        console.log(`⚠️ Cannot achieve sufficient price separation for market discovery at this price level.`);
        throw new Error('Price too high for effective market discovery');
      }
      
      console.log(`🔍 Market Peek starting for ${listing.productName} (${listingsToUpdate.length} items) - Raising to $${result.peekPrice}`);
      
      // Step 1: Raise price to peek amount for ALL listings in group
      const raiseStart = Date.now();
      const raiseResponse = await fetch('/api/stockx/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_price',
          listingIds: listingIds,
          newPrice: result.peekPrice
        })
      });
      
      if (!raiseResponse.ok) throw new Error('Failed to raise price for peek');
      result.apiResponseTimes.raisePriceMs = Date.now() - raiseStart;
      
      // Wait 15 seconds as per requirements
      await new Promise(resolve => setTimeout(resolve, 15000));
      
      // Step 2: Fetch market data to discover real lowest ask
      const fetchStart = Date.now();
      const marketResponse = await fetch('/api/stockx/listings/market-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listings: [{
            listingId: listing.listingId,
            productId: listing.productId,
            variantId: listing.variantId
          }]
        })
      });
      
      if (!marketResponse.ok) throw new Error('Failed to fetch market data');
      const marketData = await marketResponse.json();
      result.apiResponseTimes.fetchMarketMs = Date.now() - fetchStart;
      
      // Extract discovered lowest ask
      const discoveredData = marketData.marketData?.[0]?.marketData;
      result.discoveredLowestAsk = discoveredData?.lowestAsk || listing.lowestAsk || listing.currentPrice;
      
      // Wait 3 seconds for the market to react
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Step 3: Calculate new optimal price (lowest ask - $1)
      result.newPrice = Math.max(1, result.discoveredLowestAsk - 1);
      
      // Apply min/max constraints to the final selling price (not the peek price)
      // This ensures we respect your pricing boundaries while still allowing full market discovery
      if (listing.minPrice && result.newPrice < listing.minPrice) {
        result.newPrice = listing.minPrice;
      }
      if (listing.maxPrice && result.newPrice > listing.maxPrice) {
        result.newPrice = listing.maxPrice;
      }
      
      // Step 4: Set new price for ALL listings in group
      const setStart = Date.now();
      const setResponse = await fetch('/api/stockx/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_price',
          listingIds: listingIds,
          newPrice: result.newPrice
        })
      });
      
      if (!setResponse.ok) throw new Error('Failed to set new price');
      result.apiResponseTimes.setPriceMs = Date.now() - setStart;
      
      // Wait 3 seconds before completing
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Calculate profit gained
      result.profitGained = result.discoveredLowestAsk - listing.lowestAsk!;
      result.success = true;
      
      console.log(`✅ Market Peek successful! Discovered: $${result.discoveredLowestAsk}, New price: $${result.newPrice} for ${listingsToUpdate.length} items`);
      
      // Update all listings in group with new price and market data
      setListings(prev => prev.map(l => {
        // Check if this listing is in the group
        const isInGroup = listingIds.includes(l.listingId);
        
        if (isInGroup) {
          const isLeader = l.listingId === listing.listingId;
          return { 
            ...l, 
            currentPrice: result.newPrice,
            lowestAsk: result.discoveredLowestAsk,
            pricingStrategy: isLeader ? {
              ...l.pricingStrategy!,
              peekSettings: {
                frequency: l.pricingStrategy?.peekSettings?.frequency || 'balanced',
                lastPeekTime: result.timestamp,
                isPeeking: false,
                peekHistory: [
                  result,
                  ...(l.pricingStrategy?.peekSettings?.peekHistory || []).slice(0, 9) // Keep last 10
                ]
              }
            } : l.pricingStrategy
          };
        }
        return l;
      }));
      
      // Sync the inventory group
      if (group && group.listings.length > 1) {
        await syncInventoryGroup(listing.inventoryGroupId!, result.newPrice, listing.listingId);
      }
      
    } catch (error: any) {
      console.error(`❌ Market Peek failed:`, error);
      result.success = false;
      result.error = error.message;
      
      // Auto-revert to previous price on failure for all listings in group
      const listingsToRevert = group && group.listings.length > 1 ? group.listings : [listing];
      try {
        await fetch('/api/stockx/listings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_price',
            listingIds: listingsToRevert.map(l => l.listingId),
            newPrice: listing.currentPrice
          })
        });
      } catch (revertError) {
        console.error('Failed to revert price:', revertError);
      }
    } finally {
      // Clear peeking status for all listings in group
      const listingsToClear = group && group.listings.length > 1 ? group.listings : [listing];
      listingsToClear.forEach(l => {
        setActivePeeks(prev => ({ ...prev, [l.listingId]: false }));
      });
    }
    
    return result;
  };

  const executeRepricing = async () => {
    const selectedListings = listings.filter(listing => listing.selected);
    
    if (selectedListings.length === 0) {
      alert('Please select at least one listing to reprice');
      return;
    }

    // Filter out follower listings - only reprice leaders (or standalone listings)
    const listingsToReprice = selectedListings.filter(listing => {
      // If not in a group, include it
      if (!listing.inventoryGroupId) return true;
      
      const group = inventoryGroups.get(listing.inventoryGroupId);
      // If group doesn't exist or has only 1 listing, include it
      if (!group || group.listings.length <= 1) return true;
      
      // Only include if it's the group leader
      return listing.isGroupLeader;
    });

    console.log(`🎯 Repricing ${listingsToReprice.length} items (${selectedListings.length - listingsToReprice.length} followers will be synced automatically)`);

    // Validate that all listings to reprice have min/max prices
    const invalidListings = listingsToReprice.filter(listing => !listing.minPrice || !listing.maxPrice);
    if (invalidListings.length > 0) {
      alert(`Please set min and max prices for all selected listings. ${invalidListings.length} listing(s) are missing price limits.`);
      return;
    }

    // Validate min < max for all listings
    const invalidPriceRanges = listingsToReprice.filter(listing => 
      listing.minPrice && listing.maxPrice && listing.minPrice >= listing.maxPrice
    );
    if (invalidPriceRanges.length > 0) {
      alert(`Please ensure min price is less than max price for all listings. ${invalidPriceRanges.length} listing(s) have invalid price ranges.`);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/stockx/repricing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          listings: listingsToReprice.map(listing => ({
            ...listing,
            costBasis: listing.costBasis || listing.retailPrice || listing.originalPrice * 0.7, // Estimate cost basis if not provided
          })),
          strategy,
          dryRun,
          notificationEmail: notificationEmail || undefined,
          useIndividualStrategies: true, // Flag to indicate we're using individual strategies
          inventoryGroups: Array.from(inventoryGroups.values()) // Send inventory groups for server-side syncing
        })
      });

      const data = await response.json();
      
      if (data.success && data.results && Array.isArray(data.results)) {
        setResults(data.results);
        // Refresh listings after repricing
        if (!dryRun) {
          await fetchListings();
        }
      } else {
        alert(`Repricing failed: ${data.error || 'Unknown error'}`);
        setResults([]);
      }
    } catch (error) {
      console.error('Repricing error:', error);
      alert('Failed to execute repricing');
    } finally {
      setLoading(false);
    }
  };

  const getStrategyDescription = (type: string) => {
    switch (type) {
      case 'competitive':
        return 'Price just below the current lowest ask to maximize sales velocity';
      case 'margin_based':
        return 'Maintain minimum profit margins while staying competitive';
      case 'velocity_based':
        return 'Reduce prices on slow-moving inventory after specified days';
      case 'hybrid':
        return 'Combine multiple strategies for optimal balance of profit and velocity';
      default:
        return '';
    }
  };

  const getCompetitivePositionColor = (position: string) => {
    switch (position) {
      case 'lowest_ask':
        return 'text-green-600';
      case 'competitive':
        return 'text-blue-600';
      case 'market_price':
        return 'text-yellow-600';
      case 'premium':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  if (!authenticated || authError) {
    return (
      <div className={`min-h-screen ${isNeon ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="text-center max-w-xl w-full">
            <h2 className={`text-3xl font-bold mb-4 ${isNeon ? 'text-cyan-400' : 'text-gray-900'}`}>
              StockX Repricing
            </h2>
            <p className={`mb-6 ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
            {captchaDetected
              ? "StockX returned an authentication challenge (HTML/CAPTCHA). Please re-authenticate to continue."
              : authError 
                ? "Your StockX session has expired. Please re-authenticate to continue."
                : "Please authenticate with StockX to use the repricing feature."}
            </p>
            {captchaDetected && captchaSnippet && (
              <details className={`mb-6 text-left ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                <summary className="cursor-pointer text-sm font-medium">
                  Show details (debug)
                </summary>
                <pre className={`mt-3 max-h-40 overflow-auto rounded-lg p-3 text-xs whitespace-pre-wrap ${
                  isNeon ? 'bg-black/30 border border-slate-700' : 'bg-gray-50 border border-gray-200'
                }`}>
                  {captchaSnippet}
                </pre>
              </details>
            )}
            <div className="flex justify-center">
              <button 
                onClick={() => window.location.href = '/api/stockx/auth?returnTo=' + encodeURIComponent(window.location.href)}
                className={`px-6 py-3 rounded-lg font-semibold transition-all duration-200 ${
                  isNeon 
                    ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 text-white shadow-lg hover:shadow-cyan-500/20'
                    : 'bg-green-600 text-white hover:bg-green-700 shadow-lg'
                }`}
              >
                {authError ? "Re-authenticate with StockX" : "Authenticate with StockX"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen p-6 space-y-6 pb-32 ${isNeon ? 'bg-gray-900 text-white' : 'bg-gray-50'}`}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
          <h2 className={`text-3xl font-bold ${
            isNeon ? 'bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent' : 'text-gray-900'
          }`}>
            StockX Automated Repricing
          </h2>
            {autoRefreshing && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-500/30">
                <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                <span className="text-xs text-blue-400 font-medium">Checking for new listings...</span>
              </div>
            )}
          </div>
          <p className={`mt-2 ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
            Optimize your listing prices with intelligent repricing strategies
          </p>
          <p className={`mt-1 text-sm ${isNeon ? 'text-cyan-400' : 'text-blue-600'}`}>
            💡 Tip: Configure auto-repricing intervals below to automatically reprice your listings
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fetchListings(false)}
            disabled={loading}
            className={`flex items-center space-x-2 ${
              isNeon
                ? 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-lg hover:shadow-indigo-500/25'
                : 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-lg hover:shadow-indigo-500/25'
            } disabled:opacity-50 text-white px-6 py-3 rounded-lg font-medium transition-all duration-200`}
          >
            {loading ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Refresh Listings
              </>
            )}
          </button>
        </div>
      </div>

      {/* Auto-Repricing Interval Settings */}
      <div className={`rounded-xl border ${
        isNeon ? 'bg-slate-800/50 border-cyan-500/30' : 'bg-white border-gray-200'
      }`}>
        <button
          onClick={() => setShowAutoRepricingSettings(!showAutoRepricingSettings)}
          className={`w-full p-4 flex items-center justify-between ${
            isNeon ? 'hover:bg-slate-700/50' : 'hover:bg-gray-50'
          } transition-colors rounded-xl`}
        >
          <div className="flex items-center gap-3">
            <Clock className={`w-6 h-6 ${isNeon ? 'text-cyan-400' : 'text-blue-600'}`} />
            <div className="text-left">
              <h3 className={`font-semibold ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                Auto-Repricing Settings
              </h3>
              <p className={`text-sm ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                {autoRepricingEnabled 
                  ? `Active - Automated repricing every ${cronCadenceMinutes} minutes`
                  : `Automated repricing occurs every ${cronCadenceMinutes} minutes`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {autoRepricingEnabled && (
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                isNeon ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'
              }`}>
                Enabled
              </span>
            )}
            {showAutoRepricingSettings ? (
              <ChevronUp className={`w-5 h-5 ${isNeon ? 'text-gray-400' : 'text-gray-600'}`} />
            ) : (
              <ChevronDown className={`w-5 h-5 ${isNeon ? 'text-gray-400' : 'text-gray-600'}`} />
            )}
          </div>
        </button>

        {showAutoRepricingSettings && (
          <div className={`p-6 border-t ${isNeon ? 'border-slate-700' : 'border-gray-200'}`}>
            <div className="space-y-4">
              <p className={`text-sm ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                Automated repricing occurs every {cronCadenceMinutes} minutes.
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <button
                  onClick={() => saveAutoRepricingEnabled(!autoRepricingEnabled)}
                  disabled={savingAutoRepricing}
                  className={`px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
                    autoRepricingEnabled
                      ? isNeon
                        ? 'bg-red-500/20 border border-red-500/40 text-red-200 hover:bg-red-500/30'
                        : 'bg-red-50 border border-red-200 text-red-700 hover:bg-red-100'
                      : isNeon
                        ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 text-white'
                        : 'bg-green-600 text-white hover:bg-green-700'
                  } disabled:opacity-50`}
                >
                  {savingAutoRepricing ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {autoRepricingEnabled ? 'Disable auto-repricing' : 'Enable auto-repricing'}
                    </>
                  )}
                </button>
                <span className={`text-xs ${isNeon ? 'text-gray-500' : 'text-gray-500'}`}>
                  Runs automatically every {cronCadenceMinutes} minutes when enabled.
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toast Notification - Fixed position in corner */}
      {bulkActionMessage && (
        <div className="fixed top-4 right-4 z-50 max-w-md animate-slide-in-right">
          <div className={`rounded-lg p-4 shadow-2xl flex items-start gap-3 ${
            bulkActionMessage.startsWith('✅')
              ? isNeon 
                ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 backdrop-blur-sm'
                : 'bg-green-50 border border-green-300 text-green-800'
              : bulkActionMessage.startsWith('⚠️')
              ? isNeon
                ? 'bg-yellow-500/20 border border-yellow-500/50 text-yellow-400 backdrop-blur-sm'
                : 'bg-yellow-50 border border-yellow-300 text-yellow-800'
              : bulkActionMessage.startsWith('⚡') || bulkActionMessage.startsWith('⏳')
              ? isNeon
                ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 backdrop-blur-sm'
                : 'bg-blue-50 border border-blue-300 text-blue-800'
              : isNeon
                ? 'bg-red-500/20 border border-red-500/50 text-red-400 backdrop-blur-sm'
                : 'bg-red-50 border border-red-300 text-red-800'
        }`}>
            {bulkActionMessage.startsWith('✅') ? (
              <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            ) : bulkActionMessage.startsWith('⚠️') ? (
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            ) : bulkActionMessage.startsWith('⚡') ? (
              <Zap className="w-5 h-5 flex-shrink-0 mt-0.5" />
            ) : bulkActionMessage.startsWith('⏳') ? (
              <Clock className="w-5 h-5 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className="font-medium text-sm leading-relaxed">{bulkActionMessage}</p>
            </div>
            <button
              onClick={() => setBulkActionMessage(null)}
              className={`flex-shrink-0 ${
                isNeon ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'
              } transition-colors`}
              aria-label="Close notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Bulk Pricing Button - Only show when items are selected */}
      {selectedCount > 0 && (
        <div className="flex justify-center">
          <button
            onClick={() => setShowBulkPricingModal(true)}
            className={`px-6 py-3 rounded-lg font-semibold transition-all duration-200 flex items-center gap-2 ${
              isNeon
                ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 text-white shadow-lg hover:shadow-cyan-500/25'
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg'
            }`}
          >
            <Target className="w-5 h-5" />
            Apply Pricing Rule to {selectedCount} Item{selectedCount > 1 ? 's' : ''}
          </button>
        </div>
      )}

      {/* Bulk Pricing Modal */}
      {showBulkPricingModal && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowBulkPricingModal(false)}
        >
          <div 
            className={`w-full max-w-lg rounded-xl shadow-2xl animate-fadeIn ${
            isNeon ? 'bg-gray-800 border border-cyan-500/30' : 'bg-white'
          }`}
            onClick={(e) => e.stopPropagation()}>
            <div className={`p-6 border-b ${isNeon ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <h3 className={`text-xl font-semibold flex items-center gap-2 ${
                  isNeon ? 'text-cyan-400' : 'text-gray-900'
                }`}>
                  <Target className="w-6 h-6" />
                  Bulk Pricing Rules
                </h3>
                <button
                  onClick={() => setShowBulkPricingModal(false)}
                  className={`p-2 rounded-lg transition-colors ${
                    isNeon 
                      ? 'hover:bg-gray-700 text-gray-400 hover:text-white'
                      : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className={`mt-2 text-sm ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                Apply pricing rule to {selectedCount} selected item{selectedCount > 1 ? 's' : ''}
              </p>
            </div>
            
            <div className="p-6 space-y-3">
          {/* Quick Pricing Rules */}
          <button
            onClick={() => applyPricingRule('beat_lowest', 1)}
            className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
              isNeon 
                ? 'bg-gray-900 border-gray-700 hover:border-cyan-500 hover:bg-cyan-500/10'
                : 'bg-white border-gray-200 hover:border-blue-500 hover:bg-blue-50'
            }`}
          >
            <div className={`font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
              Beat Lowest Ask by $1
            </div>
            <div className={`text-sm ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
              Set price to $1 below the current market price
            </div>
          </button>

          <button
            onClick={() => applyPricingRule('beat_lowest', 5)}
            className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
              isNeon 
                ? 'bg-gray-900 border-gray-700 hover:border-cyan-500 hover:bg-cyan-500/10'
                : 'bg-white border-gray-200 hover:border-blue-500 hover:bg-blue-50'
            }`}
          >
            <div className={`font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
              Beat Lowest Ask by $5
            </div>
            <div className={`text-sm ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
              Set price to $5 below the current market price
            </div>
          </button>

          <button
            onClick={() => applyPricingRule('match_lowest', 0)}
            className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
              isNeon 
                ? 'bg-gray-900 border-gray-700 hover:border-cyan-500 hover:bg-cyan-500/10'
                : 'bg-white border-gray-200 hover:border-blue-500 hover:bg-blue-50'
            }`}
          >
            <div className={`font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
              Match Lowest Ask
            </div>
            <div className={`text-sm ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
              Set price equal to the current market price
            </div>
          </button>

          <button
            onClick={() => applyPricingRule('percentage', 5)}
            className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
              isNeon 
                ? 'bg-gray-900 border-gray-700 hover:border-cyan-500 hover:bg-cyan-500/10'
                : 'bg-white border-gray-200 hover:border-blue-500 hover:bg-blue-50'
            }`}
          >
            <div className={`font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
              5% Below Market
            </div>
            <div className={`text-sm ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
              Set price to 5% below the current market price
            </div>
          </button>

          <button
            onClick={() => applyPricingRule('percentage', 10)}
            className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
              isNeon 
                ? 'bg-gray-900 border-gray-700 hover:border-cyan-500 hover:bg-cyan-500/10'
                : 'bg-white border-gray-200 hover:border-blue-500 hover:bg-blue-50'
            }`}
          >
            <div className={`font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
              10% Below Market
            </div>
            <div className={`text-sm ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
              Set price to 10% below the current market price
            </div>
          </button>

          {/* Custom Price Input */}
          <div className={`p-4 rounded-lg border-2 ${
            isNeon ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
          }`}>
            <label className={`block text-sm font-medium mb-2 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
              Custom Rule
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Amount"
                min="0"
                step="1"
                className={`flex-1 p-2 rounded-md ${
                  isNeon 
                    ? 'bg-gray-800 border border-gray-700 text-white focus:border-cyan-500 focus:outline-none'
                    : 'bg-gray-50 border border-gray-300 focus:border-blue-500 focus:outline-none'
                }`}
                id="customAmount"
              />
              <NeonDropdown
                value={customRuleType}
                onChange={setCustomRuleType}
                options={[
                  { value: 'below_dollar', label: '$ Below Market' },
                  { value: 'below_percent', label: '% Below Market' },
                  { value: 'above_dollar', label: '$ Above Market' },
                  { value: 'above_percent', label: '% Above Market' }
                ]}
                isNeon={isNeon}
              />
              <button
                onClick={() => {
                  const amount = parseFloat((document.getElementById('customAmount') as HTMLInputElement).value);
                  const type = customRuleType;
                  if (amount) applyCustomRule(type, amount);
                }}
                className={`px-4 py-2 rounded-md font-medium ${
                  isNeon 
                    ? 'bg-cyan-500 text-black hover:bg-cyan-400'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                Apply
              </button>
            </div>
          </div>
            </div>
          </div>
        </div>
      )}

      {/* Notification Settings */}
      <div className={`rounded-lg p-6 ${
        isNeon ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
      }`}>
        <h3 className={`text-lg font-semibold mb-4 ${
          isNeon ? 'text-cyan-400' : 'text-gray-900'
        }`}>
          Notification Settings
        </h3>
        <div>
          <label className={`block text-sm font-medium mb-1 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Notification Email</label>
          <input
              type="email"
              value={notificationEmail}
              onChange={(e) => setNotificationEmail(e.target.value)}
              placeholder="your@email.com"
              className={`w-full p-2 rounded-md border focus:outline-none focus:ring-2 ${
                isNeon 
                  ? 'bg-gray-700 border-cyan-500/50 text-cyan-400 focus:ring-cyan-500/50 placeholder-gray-500' 
                  : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-500 placeholder-gray-400'
              }`}
            />
        </div>
      </div>

      {/* Listings Selection */}
      <div className={`rounded-lg p-6 ${
        isNeon ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-lg font-semibold flex items-center gap-2 ${
            isNeon ? 'text-cyan-400' : 'text-gray-900'
          }`}>
            <Package className="w-5 h-5" />
            Select Listings to Reprice
            {listings.length > 0 && (
              <span className={`text-sm font-normal ml-2 ${
                isNeon ? 'text-gray-400' : 'text-gray-600'
              }`}>
                ({selectedCount} of {listings.length} selected{pageSelectedCount > 0 ? `, ${pageSelectedCount} on this page` : ''})
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            {listingStats.investigation && (listingStats.trueDuplicatesRemoved && listingStats.trueDuplicatesRemoved > 0) && (
              <div
                className={`text-sm px-3 py-1 rounded-full flex items-center gap-2 ${
                  isNeon
                    ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                    : 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                }`}
                title={`${listingStats.investigation.productSizeGroupsWithMultiples} product-size combos have multiple listings`}
              >
                {listingStats.investigation.message}
              </div>
            )}
            {lastFetchTime && (
              <div className={`text-xs ${isNeon ? 'text-gray-500' : 'text-gray-400'}`}>
                Listings: {lastFetchTime.toLocaleTimeString()}
              </div>
            )}
            {(lastMarketRefreshTime || isBackgroundRefreshing) && (
              <div className={`text-xs px-2 py-1 rounded-full ${
                isNeon 
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' 
                  : 'bg-blue-50 text-blue-600 border border-blue-200'
              }`}>
                {isBackgroundRefreshing ? (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Refreshing all prices...</span>
                    {refreshProgress && (
                      <div className="flex items-center gap-1">
                        <div className={`w-24 h-2 rounded-full overflow-hidden ${
                          isNeon ? 'bg-gray-700' : 'bg-gray-300'
                        }`}>
                          <div 
                            className={`h-full transition-all duration-500 ${
                              isNeon ? 'bg-gradient-to-r from-cyan-500 to-emerald-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${(refreshProgress.current / refreshProgress.total) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium">{refreshProgress.current}/{refreshProgress.total}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" />
                    Market prices: {lastMarketRefreshTime.toLocaleTimeString()}
                    <span className={`text-xs ${isNeon ? 'text-cyan-300' : 'text-blue-500'}`}>
                      (auto-refresh all every 15min)
                    </span>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={refreshMarketPrices}
              disabled={loading || isBackgroundRefreshing}
              className={`flex items-center space-x-2 ${
                isNeon
                  ? 'bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40 shadow-lg'
                  : 'bg-white hover:bg-gray-50 border border-gray-300 hover:border-gray-400 shadow-lg'
              } ${isNeon ? 'text-gray-300' : 'text-gray-700'} px-4 py-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-50`}
              title="Refresh market prices for current page"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh Page
            </button>
            <button
              onClick={refreshAllMarketPrices}
              disabled={loading || isBackgroundRefreshing}
              className={`flex items-center space-x-2 ${
                isNeon
                  ? 'bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40 shadow-lg'
                  : 'bg-white hover:bg-gray-50 border border-gray-300 hover:border-gray-400 shadow-lg'
              } ${isNeon ? 'text-gray-300' : 'text-gray-700'} px-4 py-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-50`}
              title="Refresh market prices for ALL listings"
            >
              <RefreshCw className={`w-4 h-4 ${isBackgroundRefreshing ? 'animate-spin' : ''}`} />
              Refresh All ({listings.length})
            </button>
          </div>
        </div>

        {/* Search Bar (match Purchases UI) */}
        {listings.length > 0 && (
          <div className="mb-4">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by product, listing ID, size, style ID, product ID, or variant ID..."
                className={`w-full px-4 py-3 pl-12 rounded-lg ${
                  isNeon
                    ? 'bg-gray-900 border border-white/20 text-gray-300 placeholder-gray-500 focus:border-cyan-500'
                    : 'bg-white border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-indigo-500'
                } focus:outline-none focus:ring-2 focus:ring-opacity-50 ${
                  isNeon ? 'focus:ring-cyan-500' : 'focus:ring-indigo-500'
                } transition-all`}
              />
              <svg
                className={`absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 ${
                  isNeon ? 'text-gray-500' : 'text-gray-400'
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className={`absolute right-4 top-1/2 transform -translate-y-1/2 ${
                    isNeon ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
                  } transition-colors`}
                  title="Clear search"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {/* Reserve space to prevent layout shift while typing */}
            <div className="mt-2 min-h-[20px]">
              {searchQuery && (
                <p className={`text-sm ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                  Showing {sortedListings.length} result{sortedListings.length !== 1 ? 's' : ''} for "{searchQuery}"
                </p>
              )}
            </div>
          </div>
        )}

        {listings.length === 0 ? (
          <div className={`text-center py-8 ${isNeon ? 'text-gray-400' : 'text-gray-500'}`}>
            <p>No listings found. Click "Refresh Listings" to load your StockX listings.</p>
            {authError && (
              <div className="mt-4">
                <p className={`mb-3 ${isNeon ? 'text-red-400' : 'text-red-600'}`}>
                  Authentication error detected. You may need to re-authenticate with StockX.
                </p>
                <button
                  onClick={() => window.location.href = '/api/stockx/auth?returnTo=' + encodeURIComponent(window.location.href)}
                  className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                    isNeon 
                      ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 text-white'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  Re-authenticate with StockX
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
          <div className={`rounded-xl overflow-hidden ${
            isNeon
              ? 'bg-gradient-to-br from-gray-900/50 to-gray-900/30 border border-white/10 shadow-2xl'
              : 'bg-white border border-gray-200 shadow-lg'
          }`}>
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full" style={{ tableLayout: 'auto' }}>
                <thead className={`${
                  isNeon
                    ? 'bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-white/20 backdrop-blur-sm'
                    : 'bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 border-b border-gray-300'
                } sticky top-0 z-10`}>
                  <tr className="h-12">
                    <th className="relative px-3 py-0 h-10 align-middle text-center">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = isPartiallySelected;
                        }}
                        onChange={selectAll}
                        className={`rounded ${isNeon ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-300'} cursor-pointer`}
                      />
                    </th>

                    <th
                      className={`relative px-6 py-0 h-12 cursor-pointer select-none group transition-all duration-200 ${
                        isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'
                      }`}
                      onClick={() => handleSort('product')}
                    >
                      <div className="flex items-center justify-center h-full">
                        <div className="flex items-center gap-2 justify-center w-full">
                          <Package className={`w-4 h-4 ${isNeon ? 'text-cyan-400' : 'text-blue-600'}`} />
                          <span className={`text-xs font-bold uppercase tracking-wider ${
                            isNeon ? 'text-gray-300 group-hover:text-cyan-400' : 'text-gray-600 group-hover:text-blue-700'
                          } transition-colors`}>
                            Product
                          </span>
                          {sortColumn === 'product' ? (
                            sortDirection === 'asc'
                              ? <ChevronUp className={`w-4 h-4 ${isNeon ? 'text-cyan-400' : 'text-blue-600'}`} />
                              : <ChevronDown className={`w-4 h-4 ${isNeon ? 'text-cyan-400' : 'text-blue-600'}`} />
                          ) : (
                            <ChevronsUpDown className={`w-4 h-4 ${isNeon ? 'text-gray-500 group-hover:text-cyan-400' : 'text-gray-400 group-hover:text-blue-700'} transition-colors`} />
                          )}
                        </div>
                      </div>
                    </th>

                    <th
                      className={`relative px-6 py-0 h-12 cursor-pointer select-none group transition-all duration-200 ${
                        isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'
                      }`}
                      onClick={() => handleSort('size')}
                    >
                      <div className="flex items-center justify-start h-full">
                        <div className="flex items-center gap-2 justify-start w-full">
                          <Target className={`w-4 h-4 ${isNeon ? 'text-cyan-400' : 'text-blue-600'}`} />
                          <span className={`text-xs font-bold uppercase tracking-wider ${
                            isNeon ? 'text-gray-300 group-hover:text-cyan-400' : 'text-gray-600 group-hover:text-blue-700'
                          } transition-colors`}>
                            Size
                          </span>
                          {sortColumn === 'size' ? (
                            sortDirection === 'asc'
                              ? <ChevronUp className={`w-4 h-4 ${isNeon ? 'text-cyan-400' : 'text-blue-600'}`} />
                              : <ChevronDown className={`w-4 h-4 ${isNeon ? 'text-cyan-400' : 'text-blue-600'}`} />
                          ) : (
                            <ChevronsUpDown className={`w-4 h-4 ${isNeon ? 'text-gray-500 group-hover:text-cyan-400' : 'text-gray-400 group-hover:text-blue-700'} transition-colors`} />
                          )}
                        </div>
                      </div>
                    </th>

                    <th
                      className={`relative px-6 py-0 h-12 cursor-pointer select-none group transition-all duration-200 ${
                        isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'
                      }`}
                      onClick={() => handleSort('price')}
                    >
                      <div className="flex items-center justify-start h-full">
                        <div className="flex items-center gap-2 justify-start w-full">
                          <DollarSign className={`w-4 h-4 ${isNeon ? 'text-cyan-400' : 'text-blue-600'}`} />
                          <span className={`text-xs font-bold uppercase tracking-wider ${
                            isNeon ? 'text-gray-300 group-hover:text-cyan-400' : 'text-gray-600 group-hover:text-blue-700'
                          } transition-colors`}>
                            My Price
                          </span>
                          {sortColumn === 'price' ? (
                            sortDirection === 'asc'
                              ? <ChevronUp className={`w-4 h-4 ${isNeon ? 'text-cyan-400' : 'text-blue-600'}`} />
                              : <ChevronDown className={`w-4 h-4 ${isNeon ? 'text-cyan-400' : 'text-blue-600'}`} />
                          ) : (
                            <ChevronsUpDown className={`w-4 h-4 ${isNeon ? 'text-gray-500 group-hover:text-cyan-400' : 'text-gray-400 group-hover:text-blue-700'} transition-colors`} />
                          )}
                        </div>
                      </div>
                    </th>

                    <th
                      className={`relative px-6 py-0 h-12 cursor-pointer select-none group transition-all duration-200 ${
                        isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-200'
                      }`}
                      onClick={() => handleSort('market')}
                    >
                      <div className="flex items-center justify-start h-full">
                        <div className="flex items-center gap-2 justify-start w-full">
                          <TrendingDown className={`w-4 h-4 ${isNeon ? 'text-cyan-400' : 'text-blue-600'}`} />
                          <span className={`text-xs font-bold uppercase tracking-wider ${
                            isNeon ? 'text-gray-300 group-hover:text-cyan-400' : 'text-gray-600 group-hover:text-blue-700'
                          } transition-colors`}>
                            Market
                          </span>
                          {sortColumn === 'market' ? (
                            sortDirection === 'asc'
                              ? <ChevronUp className={`w-4 h-4 ${isNeon ? 'text-cyan-400' : 'text-blue-600'}`} />
                              : <ChevronDown className={`w-4 h-4 ${isNeon ? 'text-cyan-400' : 'text-blue-600'}`} />
                          ) : (
                            <ChevronsUpDown className={`w-4 h-4 ${isNeon ? 'text-gray-500 group-hover:text-cyan-400' : 'text-gray-400 group-hover:text-blue-700'} transition-colors`} />
                          )}
                        </div>
                      </div>
                    </th>

                    {[
                      { icon: RefreshCw, label: 'Auto' },
                      { icon: Wrench, label: 'Pricing Rule' },
                      { icon: Shield, label: 'Min. Price' },
                      { icon: Shield, label: 'Max Price' },
                      { icon: AlertTriangle, label: 'Auto Off' },
                      { icon: MoreHorizontal, label: 'Actions' }
                    ].map((col) => (
                      <th key={col.label} className="relative px-6 py-0 h-12 select-none">
                        <div className="flex items-center h-full justify-center">
                          <div className="flex items-center gap-2 justify-center">
                            <col.icon className={`w-4 h-4 ${isNeon ? 'text-cyan-400' : 'text-blue-600'}`} />
                            <span className={`text-xs font-bold uppercase tracking-wider ${
                              isNeon ? 'text-gray-300' : 'text-gray-600'
                            }`}>
                              {col.label}
                            </span>
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className={`${isNeon ? 'divide-y divide-white/5' : 'divide-y divide-gray-200'}`}>
                {paginatedListings.map((listing) => {
                  // Debug log to see what values are being rendered
                  if (listing.minPrice || listing.maxPrice) {
                    console.log(`Rendering ${listing.listingId}:`, {
                      minPrice: listing.minPrice,
                      maxPrice: listing.maxPrice
                    });
                  }
                  return (
                  <tr
                    key={listing.listingId}
                    className={`group transition-all duration-300 ${
                      listing.selected
                        ? isNeon
                          ? 'bg-gradient-to-r from-cyan-500/15 via-transparent to-cyan-500/15'
                          : 'bg-gradient-to-r from-blue-100/70 via-transparent to-blue-100/70'
                        : isNeon
                          ? 'hover:bg-gradient-to-r hover:from-cyan-500/5 hover:via-transparent hover:to-cyan-500/5 hover:shadow-lg hover:shadow-cyan-500/5'
                          : 'hover:bg-gradient-to-r hover:from-blue-50/50 hover:via-transparent hover:to-blue-50/50 hover:shadow-md'
                    }`}
                  >
                    <td className="px-3 py-3 text-center relative">
                      <input
                        type="checkbox"
                        checked={listing.selected}
                        onChange={() => toggleListingSelection(listing.listingId)}
                        className={`rounded ${isNeon ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-300'} cursor-pointer`}
                      />
                    </td>
                    <td className="px-6 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="text-center">
                          <div className={`font-medium text-sm ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                            {(() => {
                              const href = buildStockXProductUrl(listing);
                              if (!href) return listing.productName;
                              return (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={`inline-flex items-center justify-center gap-1 underline underline-offset-2 ${
                                    isNeon ? 'decoration-cyan-400/60 hover:text-cyan-300' : 'decoration-blue-500/60 hover:text-blue-700'
                                  }`}
                                  title="Open on StockX"
                                >
                                  <span>{listing.productName}</span>
                                </a>
                              );
                            })()}
                          </div>
                          <div className={`text-xs flex items-center justify-center gap-1 ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                            <span>Style code: {listing.styleId || 'N/A'}</span>
                            {listing.styleId && listing.styleId !== 'N/A' && (
                              <button
                                onClick={() => copyStyleCode(listing.styleId!, listing.listingId)}
                                className={`p-0.5 rounded transition-all ${
                                  copiedStyleIds[listing.listingId]
                                    ? isNeon ? 'text-green-400' : 'text-green-600'
                                    : isNeon ? 'text-gray-500 hover:text-cyan-400' : 'text-gray-400 hover:text-gray-600'
                                }`}
                                title="Copy style code"
                              >
                                {copiedStyleIds[listing.listingId] ? (
                                  <Check className="w-3 h-3" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            )}

                            <button
                              onClick={() => copyListingIdentifiers(listing)}
                              className={`p-0.5 rounded transition-all ${
                                copiedListingIds[listing.listingId]
                                  ? isNeon ? 'text-green-400' : 'text-green-600'
                                  : isNeon ? 'text-gray-500 hover:text-cyan-400' : 'text-gray-400 hover:text-gray-600'
                              }`}
                              title="Copy listingId + productId + variantId + market-data URL"
                            >
                              {copiedListingIds[listing.listingId] ? (
                                <Check className="w-3 h-3" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                          {/* Unit assignment (physical label 1–999) */}
                          <div className="mt-2 flex items-center justify-center gap-2">
                            <span className={`text-[11px] font-semibold ${isNeon ? 'text-gray-500' : 'text-gray-500'}`}>
                              Unit #
                            </span>
                            <button
                              onClick={() => fetchAvailableUnitsForListing(listing)}
                              disabled={unitOptionsLoadingByListingId[listing.listingId] === true}
                              className={`px-2 py-1 rounded text-xs font-semibold transition-all whitespace-nowrap ${
                                isNeon
                                  ? 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10'
                                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200'
                              } disabled:opacity-60`}
                              title="Find unassigned units (by styleId + size)"
                            >
                              {unitOptionsLoadingByListingId[listing.listingId] ? 'Finding…' : 'Find'}
                            </button>
                            {Array.isArray(unitOptionsByListingId[listing.listingId]) &&
                            unitOptionsByListingId[listing.listingId]!.length > 0 ? (
                              <select
                                value={unitDraftByListingId[listing.listingId] ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setUnitDraftByListingId(prev => ({ ...prev, [listing.listingId]: val }));
                                }}
                                className={`text-xs px-2 py-1 rounded border focus:outline-none focus:ring-2 ${
                                  isNeon
                                    ? 'bg-gray-700 border-cyan-500/50 text-cyan-200 focus:ring-cyan-500/50'
                                    : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-500'
                                }`}
                                title="Pick from available units"
                              >
                                <option value="">Pick…</option>
                                {unitOptionsByListingId[listing.listingId]!.map((u) => (
                                  <option key={u.unitNumber} value={String(u.unitNumber)}>
                                    #{u.unitNumber}{u.orderNumber ? ` • ${u.orderNumber}` : ''}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                            <input
                              type="number"
                              min={1}
                              max={999}
                              step={1}
                              value={unitDraftByListingId[listing.listingId] ?? ''}
                              onChange={(e) => {
                                const next = e.target.value;
                                setUnitDraftByListingId(prev => ({ ...prev, [listing.listingId]: next }));
                              }}
                              placeholder="1-999"
                              className={`w-[84px] text-xs px-2 py-1 rounded border focus:outline-none focus:ring-2 ${
                                isNeon
                                  ? 'bg-gray-700 border-cyan-500/50 text-cyan-200 placeholder-gray-500 focus:ring-cyan-500/50'
                                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-blue-500'
                              }`}
                            />
                            <button
                              onClick={() => {
                                const raw = unitDraftByListingId[listing.listingId];
                                const n = Number(raw);
                                if (!Number.isFinite(n)) {
                                  setBulkActionMessage('⚠️ Enter a Unit # (1–999) first');
                                  setTimeout(() => setBulkActionMessage(null), 3000);
                                  return;
                                }
                                assignUnitNumberToListing(listing.listingId, n);
                              }}
                              disabled={unitAssignStateByListingId[listing.listingId] === 'saving'}
                              className={`px-2 py-1 rounded text-xs font-semibold transition-all whitespace-nowrap ${
                                unitAssignStateByListingId[listing.listingId] === 'saving'
                                  ? isNeon
                                    ? 'bg-white/10 text-gray-400 border border-white/10'
                                    : 'bg-gray-100 text-gray-500 border border-gray-200'
                                  : isNeon
                                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white'
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                              } disabled:opacity-60`}
                              title="Assign this listing to the physical unit label"
                            >
                              {unitAssignStateByListingId[listing.listingId] === 'saving'
                                ? 'Saving…'
                                : unitAssignStateByListingId[listing.listingId] === 'saved'
                                  ? 'Saved'
                                  : 'Assign'}
                            </button>
                            <button
                              onClick={() => assignUnitNumberToListing(listing.listingId, null)}
                              disabled={unitAssignStateByListingId[listing.listingId] === 'saving'}
                              className={`px-2 py-1 rounded text-xs font-semibold transition-all whitespace-nowrap ${
                                isNeon
                                  ? 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10'
                                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200'
                              } disabled:opacity-60`}
                              title="Clear unit assignment for this listing"
                            >
                              Clear
                            </button>
                          </div>
                        </div>
                        {/* Group Leader Indicator */}
                        {listing.inventoryGroupId && inventoryGroups.get(listing.inventoryGroupId)?.listings.length > 1 && (
                          <div className="flex flex-col items-center gap-1">
                            {listing.isGroupLeader ? (
                              <span className={`px-2 py-1 text-xs rounded-full flex items-center gap-1 ${
                                isNeon 
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                                  : 'bg-amber-100 text-amber-700 border border-amber-300'
                              }`}
                              title="Group Leader - Controls pricing for duplicate inventory">
                                👑 Leader
                              </span>
                            ) : (
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                isNeon 
                                  ? 'bg-gray-600/50 text-gray-400 border border-gray-500/30' 
                                  : 'bg-gray-100 text-gray-600 border border-gray-300'
                              }`}
                              title="Follower - Price synced with group leader">
                                🔗 Synced
                              </span>
                            )}
                            <span className={`text-xs ${isNeon ? 'text-gray-500' : 'text-gray-500'}`}>
                              {inventoryGroups.get(listing.inventoryGroupId)?.listings.length} units
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${
                          isNeon
                            ? 'bg-white/5 text-gray-300 border border-white/10'
                            : 'bg-gray-100 text-gray-700 border border-gray-200'
                        }`}
                      >
                        {listing.size}
                      </span>
                    </td>
                    <td className={`px-6 py-3 font-medium text-sm text-center tabular-nums ${isNeon ? 'text-cyan-400' : 'text-gray-900'}`}>
                      ${listing.currentPrice}
                    </td>
                    <td className={`px-6 py-3 font-medium text-sm text-center tabular-nums ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                      <div className="flex flex-col leading-tight items-center">
                        <span>${listing.lowestAsk || '-'}</span>
                        <span className={`text-[11px] ${isNeon ? 'text-gray-500' : 'text-gray-500'}`}>
                          Flex: ${listing.flexLowestAsk || '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-center">
                      <div className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={listing.repricingEnabled === true}
                          onChange={(e) => updateRepricingEnabled(listing.listingId, e.target.checked)}
                          className={`w-4 h-4 ${isNeon ? 'text-cyan-500 accent-cyan-500' : 'text-blue-600'} cursor-pointer`}
                          title={
                            listing.repricingEnabled === true
                              ? 'Auto-reprice ON (cron will consider this listing)'
                              : 'Auto-reprice OFF (cron will skip this listing)'
                          }
                          aria-label="Auto-reprice toggle"
                        />
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <NeonDropdown
                          value={listing.pricingStrategy?.type || 'keep_current'}
                          onChange={(value) => updateListingStrategy(listing.listingId, value as any)}
                          options={pricingRuleOptions.map((opt) => {
                            if (opt.value !== 'percentage_below') return opt;
                            // Make the selected % visible in the closed state.
                            if (listing.pricingStrategy?.type !== 'percentage_below') return opt;
                            const pct = listing.pricingStrategy?.value || 5;
                            return { ...opt, label: `Below ${pct}%` };
                          })}
                          isNeon={isNeon}
                          className="w-[260px] max-w-full"
                        />
                        {(pendingStrategyChanges[listing.listingId] || pendingBoundChanges[listing.listingId]) && (
                          <button
                            onClick={() => savePricingRuleChange(listing.listingId)}
                            className={`px-2 py-1 rounded text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1 ${
                              isNeon
                                ? 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                            }`}
                            title="Save pricing rule"
                          >
                            {rowSaveState[listing.listingId] === 'saving' ? (
                              <>
                                <Loader className="w-3 h-3 animate-spin" />
                                Saving…
                              </>
                            ) : rowSaveState[listing.listingId] === 'saved' ? (
                              <>
                                <Check className="w-3 h-3" />
                                Saved
                              </>
                            ) : (
                              <>
                                <Save className="w-3 h-3" />
                                Save
                              </>
                            )}
                          </button>
                        )}
                        {listing.pricingStrategy?.type === 'market_peek' ? (
                          <select
                            value={listing.pricingStrategy?.peekSettings?.frequency || 'balanced'}
                            onChange={(e) => updatePeekFrequency(listing.listingId, e.target.value as any)}
                            className={`w-[70px] text-xs px-2 py-1 rounded border focus:outline-none focus:ring-2 ${
                              isNeon 
                                ? 'bg-gray-700 border-cyan-500/50 text-cyan-400 focus:ring-cyan-500/50' 
                                : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-500'
                            }`}
                          >
                            <option value="hourly">1h</option>
                            <option value="conservative">8h</option>
                            <option value="balanced">6h</option>
                            <option value="aggressive">4h</option>
                          </select>
                        ) : (listing.pricingStrategy?.type === 'reset_then_beat_lowest') ? (
                          <span
                            className={`text-xs whitespace-nowrap ${
                              isNeon ? 'text-gray-400' : 'text-gray-600'
                            }`}
                            title="Two-step is fully automatic: set $999 to reveal true lowest asks, then undercut by $1."
                          >
                            Auto: $999 → -$1
                          </span>
                        ) : (listing.pricingStrategy?.type === 'percentage_below' ||
                            listing.pricingStrategy?.type === 'manual') ? (
                          <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="1"
                            value={
                              listing.pricingStrategy?.type === 'manual' 
                                ? listing.pricingStrategy?.manualPrice || listing.currentPrice
                                : listing.pricingStrategy?.value || 1
                            }
                            onChange={(e) => {
                              const value = parseFloat(e.target.value);
                              if (listing.pricingStrategy?.type === 'manual') {
                                updateManualPrice(listing.listingId, value);
                              } else {
                                updateStrategyValue(listing.listingId, value);
                              }
                            }}
                            className={`w-[70px] text-xs px-2 py-1 rounded border focus:outline-none focus:ring-2 ${
                              isNeon 
                                ? 'bg-gray-700 border-cyan-500/50 text-cyan-400 focus:ring-cyan-500/50' 
                                : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-500'
                            }`}
                            placeholder={listing.pricingStrategy?.type === 'manual' ? '$' : '#'}
                          />
                            {listing.pricingStrategy?.type === 'manual' && (
                              <button
                                onClick={() => applyManualPriceNow(listing.listingId)}
                                className={`px-2 py-1 rounded text-xs font-semibold transition-all whitespace-nowrap ${
                                  isNeon
                                    ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white'
                                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                }`}
                                title="Apply this price to StockX now"
                              >
                                Apply
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="w-[70px]"></div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex justify-center">
                      <div className="relative">
                        <span className={`absolute left-2 top-1/2 -translate-y-1/2 text-xs ${
                          isNeon ? 'text-cyan-400' : 'text-gray-600'
                        }`}>
                          $
                        </span>
                      <input
                        type="number"
                          min="0"
                        step="1"
                          value={listing.minPrice && listing.minPrice > 0 ? listing.minPrice : ''}
                        onChange={(e) => {
                          console.log(`📝 Min price onChange for ${listing.listingId}: ${e.target.value}`);
                          // Update UI while typing; persist on blur.
                          updateMinPrice(listing.listingId, Math.round(parseFloat(e.target.value) || 0), { persist: false });
                        }}
                        onBlur={(e) => {
                          console.log(`💾 Min price onBlur for ${listing.listingId}: ${e.target.value} - Saving to Firebase`);
                          const minPrice = Math.round(parseFloat(e.target.value) || 0);
                          updateMinPrice(listing.listingId, minPrice, { persist: false });
                        }}
                          className={`w-24 text-xs pl-5 pr-2 py-1 rounded border focus:outline-none focus:ring-2 tabular-nums ${
                          isNeon 
                              ? 'bg-gray-700 border-cyan-500/50 text-cyan-400 focus:ring-cyan-500/50' 
                              : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-500'
                        }`}
                          placeholder="Min"
                      />
                      </div>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex justify-center">
                      <div className="relative">
                        <span className={`absolute left-2 top-1/2 -translate-y-1/2 text-xs ${
                          isNeon ? 'text-cyan-400' : 'text-gray-600'
                        }`}>
                          $
                        </span>
                      <input
                        type="number"
                          min="0"
                        step="1"
                          value={listing.maxPrice && listing.maxPrice > 0 ? listing.maxPrice : ''}
                        onChange={(e) => {
                          console.log(`📝 Max price onChange for ${listing.listingId}: ${e.target.value}`);
                          // Update UI while typing; persist on blur.
                          updateMaxPrice(listing.listingId, Math.round(parseFloat(e.target.value) || 0), { persist: false });
                        }}
                        onBlur={(e) => {
                          console.log(`💾 Max price onBlur for ${listing.listingId}: ${e.target.value} - Saving to Firebase`);
                          const maxPrice = Math.round(parseFloat(e.target.value) || 0);
                          updateMaxPrice(listing.listingId, maxPrice, { persist: false });
                        }}
                          className={`w-24 text-xs pl-5 pr-2 py-1 rounded border focus:outline-none focus:ring-2 tabular-nums ${
                          isNeon 
                              ? 'bg-gray-700 border-cyan-500/50 text-cyan-400 focus:ring-cyan-500/50' 
                              : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-500'
                        }`}
                          placeholder="Max"
                      />
                      </div>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={listing.autoDeactivate || false}
                        onChange={(e) => updateAutoDeactivate(listing.listingId, e.target.checked)}
                        className={`w-4 h-4 ${isNeon ? 'text-cyan-500 accent-cyan-500' : 'text-blue-600'} cursor-pointer`}
                      />
                    </td>
                    <td className={`px-6 py-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                      <div className="flex items-center gap-2">
                        {listing.pricingStrategy?.type === 'market_peek' ? (
                          <button
                            onClick={() => manualPeekNow(listing.listingId)}
                            disabled={activePeeks[listing.listingId]}
                            className={`px-2 py-1 text-xs rounded-full transition-all ${
                              activePeeks[listing.listingId]
                                ? isNeon ? 'bg-yellow-500/20 text-yellow-400 animate-pulse cursor-not-allowed' : 'bg-yellow-100 text-yellow-800 animate-pulse cursor-not-allowed'
                                : isNeon ? 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 cursor-pointer' : 'bg-blue-100 text-blue-700 hover:bg-blue-200 cursor-pointer'
                            }`}
                            title={activePeeks[listing.listingId] ? 'Peek in progress...' : 'Click to peek now'}
                          >
                            {activePeeks[listing.listingId] ? '👀 Peeking...' : '🔍 Peek'}
                          </button>
                        ) : (
                          <span className={`text-xs ${isNeon ? 'text-gray-500' : 'text-gray-500'}`}>—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
                })}
                </tbody>
              </table>
            </div>
          </div>
          
          {totalPages > 1 && (
            <div className={`flex items-center justify-between mt-4 px-2 ${
              isNeon ? 'text-gray-300' : 'text-gray-700'
            }`}>
              <div className="text-sm">
                Showing {startIndex + 1} to {Math.min(endIndex, listings.length)} of {listings.length} listings
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className={`px-3 py-1 rounded-md transition-all ${
                    currentPage === 1
                      ? isNeon ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : isNeon 
                        ? 'bg-gray-700 hover:bg-gray-600 text-cyan-400' 
                        : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300'
                  }`}
                >
                  Previous
                </button>
                
                <div className="flex items-center gap-1">
                  {[...Array(totalPages)].map((_, index) => {
                    const page = index + 1;
                    // Show first page, last page, current page, and pages around current
                    if (
                      page === 1 || 
                      page === totalPages || 
                      Math.abs(page - currentPage) <= 1
                    ) {
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-3 py-1 rounded-md transition-all ${
                            page === currentPage
                              ? isNeon 
                                ? 'bg-cyan-500 text-black font-semibold' 
                                : 'bg-blue-600 text-white font-semibold'
                              : isNeon 
                                ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' 
                                : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    } else if (
                      page === currentPage - 2 || 
                      page === currentPage + 2
                    ) {
                      return <span key={page} className="px-1">...</span>;
                    }
                    return null;
                  })}
                </div>
                
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className={`px-3 py-1 rounded-md transition-all ${
                    currentPage === totalPages
                      ? isNeon ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : isNeon 
                        ? 'bg-gray-700 hover:bg-gray-600 text-cyan-400' 
                        : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300'
                  }`}
                >
                  Next
                </button>
              </div>
            </div>
          )}
          </>
        )}
      </div>

      {/* Sticky Execution Controls */}
      <div className={`fixed bottom-0 left-0 right-0 z-40 transition-all duration-300 ${
        isPreviewMinimized ? 'transform translate-y-[calc(100%-3rem)]' : ''
      }`}>
        <div className={`${
          isNeon ? 'bg-gray-900 border-t border-gray-700' : 'bg-white border-t border-gray-200'
        } shadow-2xl`}>
          {/* Minimized State Bar */}
          {isPreviewMinimized && (
            <div 
              onClick={() => setIsPreviewMinimized(false)}
              className={`flex items-center justify-between p-3 cursor-pointer ${
                isNeon ? 'hover:bg-gray-800' : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <svg 
                  className="w-4 h-4 rotate-180" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                <span className={`font-medium ${isNeon ? 'text-cyan-400' : 'text-gray-700'}`}>
                  Show Preview Panel
                </span>
                {selectedCount > 0 && (
                  <span className={`text-sm ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                    ({selectedCount} items selected)
                  </span>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePreviewClick();
                }}
                disabled={loading || listings.filter(l => l.selected).length === 0}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 flex items-center gap-2 disabled:opacity-50 ${
                  dryRun 
                    ? isNeon
                      ? 'bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                    : isNeon
                      ? 'bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white'
                      : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {dryRun ? 'Preview' : 'Execute'} Repricing
              </button>
            </div>
          )}

          {/* Minimize Button (when expanded) */}
          {!isPreviewMinimized && (
            <button
              onClick={() => setIsPreviewMinimized(true)}
              className={`absolute -top-10 right-4 px-4 py-2 rounded-t-lg flex items-center gap-2 ${
                isNeon 
                  ? 'bg-gray-800 text-cyan-400 hover:bg-gray-700' 
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              } shadow-lg`}
            >
              <svg 
                className="w-4 h-4" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              Hide Preview
            </button>
          )}

          {/* Preview Results Table (when expanded and in dry run mode) */}
          {!isPreviewMinimized && showPreviewResults && previewResults.length > 0 && (
            <div className={`max-h-64 overflow-y-auto border-b ${
              isNeon ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <table className="w-full text-sm">
                <thead className={`sticky top-0 ${
                  isNeon ? 'bg-gray-800' : 'bg-gray-50'
                }`}>
                  <tr className={`border-b ${isNeon ? 'border-gray-700' : 'border-gray-200'}`}>
                    <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Product</th>
                    <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Current</th>
                    <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Market</th>
                    <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>New Price</th>
                    <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Change</th>
                    <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Rule</th>
                  </tr>
                </thead>
                <tbody>
                  {previewResults.map((result) => {
                    const listing = listings.find(l => l.listingId === result.listingId);
                    const priceChange = result.newPrice - result.currentPrice;
                    const priceChangePercent = (priceChange / result.currentPrice) * 100;
                    
                    return (
                      <tr key={result.listingId} className={`border-b ${
                        isNeon ? 'border-gray-700' : 'border-gray-100'
                      }`}>
                        <td className="p-3">
                          <div className={`font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                            {listing?.productName}
                          </div>
                          <div className={`text-xs ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                            Size {listing?.size}
                          </div>
                        </td>
                        <td className={`p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                          ${result.currentPrice}
                        </td>
                        <td className={`p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                          ${listing?.lowestAsk || '-'}
                        </td>
                        <td className={`p-3 font-medium ${
                          priceChange < 0 
                            ? isNeon ? 'text-emerald-400' : 'text-green-600'
                            : priceChange > 0 
                              ? isNeon ? 'text-red-400' : 'text-red-600'
                              : isNeon ? 'text-gray-400' : 'text-gray-600'
                        }`}>
                          ${result.newPrice}
                        </td>
                        <td className={`p-3 text-xs ${
                          priceChange < 0 
                            ? isNeon ? 'text-emerald-400' : 'text-green-600'
                            : priceChange > 0 
                              ? isNeon ? 'text-red-400' : 'text-red-600'
                              : isNeon ? 'text-gray-400' : 'text-gray-600'
                        }`}>
                          {priceChange !== 0 && (
                            <>
                              {priceChange > 0 ? '+' : ''}${priceChange}
                              <div>({priceChangePercent.toFixed(1)}%)</div>
                            </>
                          )}
                          {priceChange === 0 && 'No change'}
                        </td>
                        <td className={`p-3 text-xs ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                          {result.reason}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Control Bar */}
          {!isPreviewMinimized && (
            <div className="flex items-center justify-between p-4">
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  className={`w-4 h-4 ${isNeon ? 'text-cyan-500' : 'text-blue-600'}`}
                />
                <span className={isNeon ? 'text-gray-300' : 'text-gray-700'}>
                  Preview Mode
                </span>
              </label>
              
              {selectedCount > 0 && (
                <div className={`text-sm ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                  {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
                </div>
              )}
            </div>
            
            <button
              onClick={handlePreviewClick}
              disabled={loading || listings.filter(l => l.selected).length === 0}
              className={`px-6 py-3 rounded-lg font-semibold transition-all duration-200 flex items-center gap-2 disabled:opacity-50 ${
                dryRun 
                  ? isNeon
                    ? 'bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                  : isNeon
                    ? 'bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white'
                    : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {loading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  {dryRun ? <AlertTriangle className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                  {dryRun ? 'Preview Repricing' : 'Execute Repricing'}
                </>
              )}
            </button>
          </div>
          )}
        </div>
      </div>

      {/* Results */}
      {results && results.length > 0 && (
        <div className={`rounded-lg p-6 ${
          isNeon ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
        }`}>
          <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${
            isNeon ? 'text-cyan-400' : 'text-gray-900'
          }`}>
            <CheckCircle className="w-5 h-5" />
            Repricing Results {dryRun && '(Preview)'}
          </h3>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${isNeon ? 'border-gray-700' : 'border-gray-200'}`}>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Product</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Current Price</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>New Price</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Change</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Action</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Position</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => {
                  const listing = listings.find(l => l.listingId === result.listingId);
                  const priceChange = result.newPrice - result.currentPrice;
                  const priceChangePercent = (priceChange / result.currentPrice) * 100;
                  
                  return (
                    <tr key={result.listingId} className={`border-b ${
                      isNeon ? 'border-gray-700' : 'border-gray-100'
                    }`}>
                      <td className="p-3">
                        <div className={`font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                          {listing?.productName}
                        </div>
                        <div className={isNeon ? 'text-gray-400 text-sm' : 'text-gray-600 text-sm'}>
                          Size {listing?.size}
                        </div>
                      </td>
                      <td className={`p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                        ${result.currentPrice}
                      </td>
                      <td className={`p-3 font-medium ${isNeon ? 'text-cyan-400' : 'text-gray-900'}`}>
                        ${result.newPrice}
                      </td>
                      <td className="p-3">
                        <div className={`font-medium ${
                          priceChange >= 0 
                            ? isNeon ? 'text-emerald-400' : 'text-green-600'
                            : isNeon ? 'text-red-400' : 'text-red-600'
                        }`}>
                          {priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}
                        </div>
                        <div className={`text-xs ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                          ({priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(1)}%)
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          result.action === 'updated' || result.action === 'would_update' 
                            ? isNeon 
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-green-100 text-green-800'
                            : isNeon
                              ? 'bg-gray-700 text-gray-300 border border-gray-600'
                              : 'bg-gray-100 text-gray-800'
                        }`}>
                          {result.action.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="p-3">
                        {(() => {
                          const cp = (result as any).competitivePosition as string | undefined;
                          const label = (cp || 'unknown').replace('_', ' ');
                          return (
                        <span className={`font-medium ${
                          isNeon 
                            ? cp === 'lowest_ask' 
                              ? 'text-emerald-400'
                              : cp === 'competitive'
                              ? 'text-cyan-400'
                              : 'text-gray-400'
                            : getCompetitivePositionColor(cp as any)
                        }`}>
                          {label}
                        </span>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
} 