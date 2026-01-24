'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Menu } from 'lucide-react';
import { useTheme } from '../../lib/contexts/ThemeContext';
import { useAuth } from '../../lib/contexts/AuthContext';
import { isMobilePlatform } from '../../lib/utils/platformDetection';

import Sidebar from '../../components/Sidebar';
import MobileLayout from '../../components/MobileLayout';

function SectionFallback() {
  return (
    <div className="flex-1 p-6">
      <div className="text-sm text-gray-500">Loading…</div>
    </div>
  );
}

// Lazy-load heavy dashboard sections to keep /dashboard initial JS small.
// Most of these sections are interactive/client-only, so `ssr: false` is OK.
const Dashboard = dynamic(() => import('../../components/Dashboard'), { ssr: false, loading: SectionFallback });
const Purchases = dynamic(() => import('../../components/Purchases'), { ssr: false, loading: SectionFallback });
const Deliveries = dynamic(() => import('../../components/Deliveries'), { ssr: false, loading: SectionFallback });
const FailedVerifications = dynamic(() => import('../../components/FailedVerifications'), { ssr: false, loading: SectionFallback });
const ProfitCalculator = dynamic(() => import('../../components/ProfitCalculator'), { ssr: false, loading: SectionFallback });
const AudioPreview = dynamic(() => import('../../components/AudioPreview'), { ssr: false, loading: SectionFallback });
const MarketAlerts = dynamic(() => import('../../components/MarketAlerts'), { ssr: false, loading: SectionFallback });
const Plans = dynamic(() => import('../../components/Plans'), { ssr: false, loading: SectionFallback });
const FAQ = dynamic(() => import('../../components/FAQ'), { ssr: false, loading: SectionFallback });
const FeatureRequests = dynamic(() => import('../../components/FeatureRequests'), { ssr: false, loading: SectionFallback });
const StockXOrderManagement = dynamic(() => import('../../components/StockXOrderManagement'), { ssr: false, loading: SectionFallback });
const StockXMarketResearch = dynamic(() => import('../../components/StockXMarketResearch'), { ssr: false, loading: SectionFallback });
const StockXInventory = dynamic(() => import('../../components/StockXInventory'), { ssr: false, loading: SectionFallback });
const StockXArbitrage = dynamic(() => import('../../components/StockXArbitrage'), { ssr: false, loading: SectionFallback });
const EbayStockXArbitrage = dynamic(() => import('../../components/EbayStockXArbitrage'), { ssr: false, loading: SectionFallback });
const StockXRepricing = dynamic(() => import('../../components/StockXRepricing'), { ssr: false, loading: SectionFallback });
const StockXReleases = dynamic(() => import('../../components/StockXReleases'), { ssr: false, loading: SectionFallback });
const StockXPriceMonitor = dynamic(() => import('../../components/StockXPriceMonitor'), { ssr: false, loading: SectionFallback });
const StockXFlexAskMonitor = dynamic(() => import('../../components/StockXFlexAskMonitor'), { ssr: false, loading: SectionFallback });
const StockXProfitCalc = dynamic(() => import('../../components/StockXProfitCalc'), { ssr: false, loading: SectionFallback });
const StockXTrends = dynamic(() => import('../../components/StockXTrends'), { ssr: false, loading: SectionFallback });
const StockXAlerts = dynamic(() => import('../../components/StockXAlerts'), { ssr: false, loading: SectionFallback });
const StockXListingCreator = dynamic(() => import('../../components/StockXListingCreator'), { ssr: false, loading: SectionFallback });
const StockXCoupons = dynamic(() => import('../../components/StockXCoupons'), { ssr: false, loading: SectionFallback });
const OnboardingQuestionnaire = dynamic(() => import('../../components/OnboardingQuestionnaire'), { ssr: false, loading: SectionFallback });
const AliasInventory = dynamic(() => import('../../components/AliasInventory'), { ssr: false, loading: SectionFallback });
const AliasListingCreator = dynamic(() => import('../../components/AliasListingCreator'), { ssr: false, loading: SectionFallback });
const AliasOrderManagement = dynamic(() => import('../../components/AliasOrderManagement'), { ssr: false, loading: SectionFallback });
const Cashflow = dynamic(() => import('../../components/Cashflow'), { ssr: false, loading: SectionFallback });
const Analytics = dynamic(() => import('../../components/Analytics'), { ssr: false, loading: SectionFallback });
const TestStockXOrders = dynamic(() => import('../test-stockx-orders/page'), { ssr: false, loading: SectionFallback });
const TestPurchaseLinkingPage = dynamic(() => import('../test-purchase-linking/page'), { ssr: false, loading: SectionFallback });

function DashboardContent() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { currentTheme } = useTheme();
  const PRICE_MONITOR_DISABLED = process.env.NEXT_PUBLIC_DISABLE_PRICE_MONITOR === 'true';
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentSection = useMemo(() => {
    const raw = searchParams.get('section');
    return (raw && raw.trim() ? raw : 'dashboard').toLowerCase();
  }, [searchParams]);
  
  // Dynamic theme detection for consistent background
  const isNeon = currentTheme.name === 'Neon';
  
  // Check if we're on mobile platform
  useEffect(() => {
    setIsMobile(isMobilePlatform());
  }, []);
  
  // Ensure we're on the client side before accessing window/localStorage
  useEffect(() => {
    setIsClient(true);
    
    // Check authentication - site password is sufficient for dashboard access
    if (!loading && !user) {
      // Check if user has site password authentication
      const siteUserId = localStorage.getItem('siteUserId');
      if (!siteUserId) {
        // For now, allow dashboard access without site password for testing
        // window.location.href = '/password-protect';
        // return;
      } else {
        // User has site password authentication, allow dashboard access
        // No redirect needed - user can access dashboard with site password
        // The dashboard will render even without Firebase user
      }
    }
  }, [user, loading, router]);

  const handleItemClick = (item: string) => {
    // Convert section name to URL-friendly format (e.g., "Market Research" -> "market-research")
    const urlSection = item.toLowerCase().replace(/\s+/g, '-');
    const params = new URLSearchParams(searchParams.toString());
    params.set('section', urlSection);
    router.push(`/dashboard?${params.toString()}`);
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  // Helper function to format section name for display
  const formatSectionName = (sectionName: string) => {
    return sectionName
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const renderContent = () => {
    switch (currentSection) {
      case 'dashboard':
        return <Dashboard />;
      case 'inventory':
        return (
          <div className={`flex-1 p-4 sm:p-8 ${currentTheme.colors.background}`}>
            <h1 className={`text-2xl sm:text-3xl font-bold ${
              isNeon ? 'text-white' : 'text-gray-900'
            }`}>Inventory</h1>
            <p className={`mt-4 ${
              isNeon ? 'text-slate-400' : 'text-gray-600'
            }`}>Inventory management coming soon...</p>
          </div>
        );
      case 'purchases':
        return <Purchases />;
      case 'deliveries':
        return <Deliveries />;
      case 'sales':
        // Replaced legacy Sales page with the StockX Orders (Test) tooling.
        // This keeps the existing dashboard nav route (/dashboard?section=sales) but uses the newer UI.
        return <TestStockXOrders />;
      case 'sales-2-0':
        return <TestPurchaseLinkingPage />;
      case 'purchase-linking':
        return <TestPurchaseLinkingPage />;
      case 'analytics':
        return <Analytics />;
      case 'cashflow':
        return <Cashflow />;
      case 'failed-verifications':
        return <FailedVerifications />;
      case 'profit-calculator':
        return <ProfitCalculator />;
      case 'profile':
        return <div className="flex-1 overflow-y-auto bg-gray-50 p-8"><h1 className="text-2xl font-bold">Profile Settings</h1><p className="text-gray-600 mt-2">Profile component temporarily disabled due to build issues.</p></div>;
      case 'price-tracker':
        return (
          <div className={`flex-1 p-4 sm:p-8 ${currentTheme.colors.background}`}>
            <h1 className={`text-2xl sm:text-3xl font-bold ${
              isNeon ? 'text-white' : 'text-gray-900'
            }`}>Price Tracker</h1>
            <p className={`mt-4 ${
              isNeon ? 'text-slate-400' : 'text-gray-600'
            }`}>Track sneaker prices across multiple platforms in real-time. Set alerts for price drops and monitor market trends. Coming soon...</p>
          </div>
        );
      case 'flip-finder':
        return (
          <div className={`flex-1 p-4 sm:p-8 ${currentTheme.colors.background}`}>
            <h1 className={`text-2xl sm:text-3xl font-bold ${
              isNeon ? 'text-white' : 'text-gray-900'
            }`}>Flip Finder</h1>
            <p className={`mt-4 ${
              isNeon ? 'text-slate-400' : 'text-gray-600'
            }`}>AI-powered tool to identify profitable flip opportunities. Analyze market data, predict trends, and discover undervalued sneakers. Coming soon...</p>
          </div>
        );
      case 'market-alerts':
        return (
          <div className={`flex-1 p-4 sm:p-8 ${currentTheme.colors.background}`}>
            <MarketAlerts />
          </div>
        );
      case 'loss-tracker':
        return (
          <div className={`flex-1 p-4 sm:p-8 ${currentTheme.colors.background}`}>
            <h1 className={`text-2xl sm:text-3xl font-bold ${
              isNeon ? 'text-white' : 'text-gray-900'
            }`}>Loss Tracker</h1>
            <p className={`mt-4 ${
              isNeon ? 'text-slate-400' : 'text-gray-600'
            }`}>Monitor and analyze your losses to improve future decisions. Track patterns, identify risk factors, and learn from unsuccessful flips. Coming soon...</p>
          </div>
        );
      case 'audio-preview':
        return (
          <div className={`flex-1 ${currentTheme.colors.background}`}>
            <AudioPreview />
          </div>
        );
      case 'plans':
        return <Plans />;
      case 'feature-requests':
        return <FeatureRequests />;
      case 'faq':
        return <FAQ />;
      case 'stockx-order-management':
        return <StockXOrderManagement />;
      case 'stockx-market-research':
        return <StockXMarketResearch />;
      case 'stockx-inventory':
        return <StockXInventory />;
      case 'stockx-arbitrage':
        return <StockXArbitrage />;
      case 'ebay-stockx-arbitrage':
        return <EbayStockXArbitrage />;
      case 'stockx-repricing':
        return <StockXRepricing />;
      case 'stockx-releases':
        return <StockXReleases />;
      case 'stockx-price-monitor':
        if (PRICE_MONITOR_DISABLED) {
          return (
            <div className={`flex-1 p-4 sm:p-8 ${currentTheme.colors.background}`}>
              <h1
                className={`text-2xl sm:text-3xl font-bold ${
                  isNeon ? 'text-white' : 'text-gray-900'
                }`}
              >
                Price Monitor (Disabled)
              </h1>
              <p className={`mt-4 ${isNeon ? 'text-slate-400' : 'text-gray-600'}`}>
                This feature is temporarily disabled to reduce StockX API traffic.
              </p>
            </div>
          );
        }
        return <StockXPriceMonitor />;
      case 'stockx-flex-ask-monitor':
        return <StockXFlexAskMonitor />;
      case 'stockx-profit-calc':
        return <StockXProfitCalc />;
      case 'stockx-trends':
        return <StockXTrends />;
      case 'stockx-alerts':
        return <StockXAlerts />;
      case 'stockx-coupons':
        return <StockXCoupons />;
      case 'stockx-listings':
        return <StockXListingCreator />;
      case 'onboarding-questionnaire':
        return <OnboardingQuestionnaire onComplete={() => handleItemClick('dashboard')} />;
      case 'alias-inventory':
        return <AliasInventory />;
      case 'alias-listings':
        return <AliasListingCreator />;
      case 'alias-orders':
        return <AliasOrderManagement />;
      case 'alias-pricing':
        return (
          <div className={`flex-1 p-4 sm:p-8 ${currentTheme.colors.background}`}>
            <h1 className={`text-2xl sm:text-3xl font-bold ${
              isNeon ? 'text-white' : 'text-gray-900'
            }`}>Alias Pricing Insights</h1>
            <p className={`mt-4 ${
              isNeon ? 'text-slate-400' : 'text-gray-600'
            }`}>Advanced pricing analytics and market insights for Alias marketplace. Coming soon...</p>
          </div>
        );
      case 'alias-arbitrage':
        return (
          <div className={`flex-1 p-4 sm:p-8 ${currentTheme.colors.background}`}>
            <h1 className={`text-2xl sm:text-3xl font-bold ${
              isNeon ? 'text-white' : 'text-gray-900'
            }`}>Cross-Platform Arbitrage</h1>
            <p className={`mt-4 ${
              isNeon ? 'text-slate-400' : 'text-gray-600'
            }`}>Find profitable arbitrage opportunities between Alias, StockX, and other marketplaces. Coming soon...</p>
          </div>
        );
      default:
        return (
          <div className={`flex-1 p-4 sm:p-8 ${currentTheme.colors.background}`}>
            <h1 className={`text-2xl sm:text-3xl font-bold ${
              isNeon ? 'text-white' : 'text-gray-900'
            }`}>
              {formatSectionName(currentSection)}
            </h1>
            <p className={`mt-4 ${
              isNeon ? 'text-slate-400' : 'text-gray-600'
            }`}>This section is coming soon...</p>
          </div>
        );
    }
  };

  // Don't render until client-side hydration is complete and auth state is determined
  if (!isClient || loading) {
    return (
      <div className={`flex h-screen overflow-hidden ${currentTheme.colors.background}`}>
        <div className="flex-1 flex items-center justify-center">
          <div className={`text-lg ${isNeon ? 'text-white' : 'text-gray-900'}`}>
            {!isClient ? 'Loading...' : 'Checking authentication...'}
          </div>
        </div>
      </div>
    );
  }

  // If not loading and no user, check if we have site password auth
  if (!user) {
    const siteUserId = localStorage.getItem('siteUserId');
    
    // If we have site password auth, allow dashboard access
    if (siteUserId) {
      // Continue to render dashboard - the useEffect will handle the rest
    } else {
      // No authentication at all, show redirecting message
      return (
        <div className={`flex h-screen overflow-hidden ${currentTheme.colors.background}`}>
          <div className="flex-1 flex items-center justify-center">
            <div className={`text-lg ${isNeon ? 'text-white' : 'text-gray-900'}`}>
              Redirecting to login...
            </div>
            <div className={`text-sm mt-2 ${isNeon ? 'text-slate-400' : 'text-gray-500'}`}>
              Debug: No authentication found
            </div>
          </div>
        </div>
      );
    }
  }

  // If on mobile platform, use mobile layout
  if (isMobile) {
    return (
      <MobileLayout
        activeItem={currentSection}
        onItemClick={handleItemClick}
      >
        {renderContent()}
      </MobileLayout>
    );
  }

  // Desktop layout (original)
  return (
    <div className={`flex h-screen overflow-hidden ${currentTheme.colors.background}`}>
      {/* Sidebar */}
      <Sidebar 
        activeItem={currentSection}
        onItemClick={handleItemClick}
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapse}
      />
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header with Hamburger Menu */}
        <div className="lg:hidden flex items-center justify-between p-4 border-b border-gray-700/20">
          <button
            onClick={toggleSidebar}
            className={`p-2 rounded-md hover:bg-white/10 ${currentTheme.colors.textSecondary} hover:text-white transition-colors`}
          >
            <Menu className="w-6 h-6" />
          </button>
          <h1 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
            {formatSectionName(currentSection)}
          </h1>
          <div className="w-10"></div> {/* Spacer for center alignment */}
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-auto">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen overflow-hidden bg-gray-900">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-lg text-white">Loading...</div>
        </div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
} 