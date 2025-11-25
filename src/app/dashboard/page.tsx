'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Menu } from 'lucide-react';
import { useTheme } from '../../lib/contexts/ThemeContext';
import { useAuth } from '../../lib/contexts/AuthContext';
import { isMobilePlatform } from '../../lib/utils/platformDetection';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
import Sidebar from '../../components/Sidebar';
import MobileLayout from '../../components/MobileLayout';
import Dashboard from '../../components/Dashboard';
import Purchases from '../../components/Purchases';
import Deliveries from '../../components/Deliveries';
import Sales from '../../components/Sales';
import FailedVerifications from '../../components/FailedVerifications';
import ProfitCalculator from '../../components/ProfitCalculator';
import AudioPreview from '../../components/AudioPreview';
import MarketAlerts from '../../components/MarketAlerts';
import Plans from '../../components/Plans';
// import Profile from '../../components/Profile';
// import ProfileTest from '../../components/ProfileTest';
import FAQ from '../../components/FAQ';
import FeatureRequests from '../../components/FeatureRequests';
import StockXOrderManagement from '../../components/StockXOrderManagement';
import StockXMarketResearch from '../../components/StockXMarketResearch';
import StockXInventory from '../../components/StockXInventory';
import StockXArbitrage from '../../components/StockXArbitrage';
import EbayStockXArbitrage from '../../components/EbayStockXArbitrage';
import StockXRepricing from '../../components/StockXRepricing';
import StockXReleases from '../../components/StockXReleases';
import StockXPriceMonitor from '../../components/StockXPriceMonitor';
import StockXFlexAskMonitor from '../../components/StockXFlexAskMonitor';
import StockXProfitCalc from '../../components/StockXProfitCalc';
import StockXTrends from '../../components/StockXTrends';
import StockXAlerts from '../../components/StockXAlerts';
import StockXListingCreator from '../../components/StockXListingCreator';
import OnboardingQuestionnaire from '../../components/OnboardingQuestionnaire';
import AliasInventory from '../../components/AliasInventory';
import AliasListingCreator from '../../components/AliasListingCreator';
import AliasOrderManagement from '../../components/AliasOrderManagement';

function DashboardContent() {
  console.log('🔍 Dashboard component rendering...');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentSection, setCurrentSection] = useState('dashboard');
  const [isClient, setIsClient] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { currentTheme } = useTheme();
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Dynamic theme detection for consistent background
  const isNeon = currentTheme.name === 'Neon';
  
  // Check if we're on mobile platform
  useEffect(() => {
    setIsMobile(isMobilePlatform());
  }, []);
  
  // Remove early return to allow proper auth state checking in useEffect

  // Ensure we're on the client side before accessing window
  useEffect(() => {
    console.log('🔍 Dashboard useEffect running...');
    try {
      console.log('🔍 Dashboard window object:', typeof window);
      console.log('🔍 Dashboard current URL:', window.location.href);
    } catch (error) {
      console.error('🔍 Dashboard useEffect error:', error);
    }
    setIsClient(true);
    
    // Check authentication - site password is sufficient for dashboard access
    if (!loading && !user) {
      // Check if user has site password authentication
      const siteUserId = localStorage.getItem('siteUserId');
      if (!siteUserId) {
        // For now, allow dashboard access without site password for testing
        console.log('🔐 No site password auth, but allowing dashboard access for testing');
        // window.location.href = '/password-protect';
        // return;
      } else {
        // User has site password authentication, allow dashboard access
        console.log('🔐 Site password auth found, allowing dashboard access');
        // No redirect needed - user can access dashboard with site password
        // The dashboard will render even without Firebase user
      }
    }
    
    // URL parameter detection is now handled by useSearchParams hook
  }, [user, loading, router]);

  // Test if useEffect works at all
  useEffect(() => {
    console.log('🔍 Dashboard simple useEffect running...');
  }, []);

  // Use useSearchParams to detect section parameter immediately
  useEffect(() => {
    console.log('🔍 Dashboard useSearchParams useEffect running...');
    const section = searchParams.get('section');
    console.log('🔍 Dashboard useSearchParams - Section from URL:', section);
    console.log('🔍 Dashboard useSearchParams - All params:', Object.fromEntries(searchParams.entries()));
    
    if (section && section !== '') {
      console.log('🔍 Dashboard useSearchParams - Found section in URL:', section);
      console.log('🔍 Dashboard useSearchParams - Setting current section to:', section);
      setCurrentSection(section);
    } else {
      console.log('🔍 Dashboard useSearchParams - No section in URL, defaulting to dashboard');
      setCurrentSection('dashboard');
    }
  }, [searchParams]);

  // Monitor URL changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleUrlChange = () => {
        console.log('🔍 Dashboard URL changed to:', window.location.href);
      };
      
      window.addEventListener('popstate', handleUrlChange);
      window.addEventListener('pushstate', handleUrlChange);
      window.addEventListener('replacestate', handleUrlChange);
      
      return () => {
        window.removeEventListener('popstate', handleUrlChange);
        window.removeEventListener('pushstate', handleUrlChange);
        window.removeEventListener('replacestate', handleUrlChange);
      };
    }
  }, []);

  // Debug current section changes
  useEffect(() => {
    if (isClient) {
      console.log('🔍 Dashboard currentSection changed to:', currentSection);
    }
  }, [currentSection, isClient]);

  // Handle browser back/forward buttons
  useEffect(() => {
    if (!isClient) return;

    const handlePopState = () => {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const section = urlParams.get('section') || 'dashboard';
        setCurrentSection(section);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isClient]);

  const handleItemClick = (item: string) => {
    // Convert section name to URL-friendly format (e.g., "Market Research" -> "market-research")
    const urlSection = item.toLowerCase().replace(/\s+/g, '-');
    console.log('🔍 Dashboard: Navigating to section:', urlSection);
    
    // Update URL only if we're on the client
    if (typeof window !== 'undefined') {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('section', urlSection);
      console.log('🔍 Dashboard: Updating URL to:', newUrl.toString());
      window.history.pushState({}, '', newUrl.toString());
    }
    
    // Update state
    setCurrentSection(urlSection);
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
        return <Sales />;
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
        return <StockXPriceMonitor />;
      case 'stockx-flex-ask-monitor':
        return <StockXFlexAskMonitor />;
      case 'stockx-profit-calc':
        return <StockXProfitCalc />;
      case 'stockx-trends':
        return <StockXTrends />;
      case 'stockx-alerts':
        return <StockXAlerts />;
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
    console.log('🔍 Dashboard: No Firebase user found, checking site password auth...');
    const siteUserId = localStorage.getItem('siteUserId');
    console.log('🔍 Dashboard: siteUserId from localStorage:', siteUserId);
    
    // If we have site password auth, allow dashboard access
    if (siteUserId) {
      console.log('🔍 Dashboard: Site password auth found, allowing dashboard access');
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