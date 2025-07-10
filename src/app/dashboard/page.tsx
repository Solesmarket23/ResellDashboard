'use client';

import { useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import { useTheme } from '../../lib/contexts/ThemeContext';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
import Sidebar from '../../components/Sidebar';
import Dashboard from '../../components/Dashboard';
import Purchases from '../../components/Purchases';
import Deliveries from '../../components/Deliveries';
import Sales from '../../components/Sales';
import FailedVerifications from '../../components/FailedVerifications';
import ProfitCalculator from '../../components/ProfitCalculator';
import AudioPreview from '../../components/AudioPreview';
import MarketAlerts from '../../components/MarketAlerts';
import Plans from '../../components/Plans';
import Profile from '../../components/Profile';
import FAQ from '../../components/FAQ';
import FeatureRequests from '../../components/FeatureRequests';
import StockXMarketResearch from '../../components/StockXMarketResearch';
import StockXInventory from '../../components/StockXInventory';
import StockXArbitrage from '../../components/StockXArbitrage';
import StockXRepricing from '../../components/StockXRepricing';
import StockXSales from '../../components/StockXSales';
import StockXReleases from '../../components/StockXReleases';
import StockXPriceMonitor from '../../components/StockXPriceMonitor';
import StockXFlexAskMonitor from '../../components/StockXFlexAskMonitor';
import StockXProfitCalc from '../../components/StockXProfitCalc';
import StockXTrends from '../../components/StockXTrends';
import StockXAlerts from '../../components/StockXAlerts';

export default function DashboardPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentSection, setCurrentSection] = useState('dashboard');
  const [isClient, setIsClient] = useState(false);
  const { currentTheme } = useTheme();
  
  // Dynamic theme detection for consistent background
  const isNeon = currentTheme.name === 'Neon';

  // Ensure we're on the client side before accessing window
  useEffect(() => {
    setIsClient(true);
    
    // Get section from URL on mount
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const section = urlParams.get('section');
      if (section) {
        setCurrentSection(section);
      } else {
        // Set default section in URL
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('section', 'dashboard');
        window.history.replaceState({}, '', newUrl.toString());
      }
    }
  }, []);

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
    
    // Update URL only if we're on the client
    if (typeof window !== 'undefined') {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('section', urlSection);
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
        return <Profile />;
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
      case 'stockx-market-research':
        return <StockXMarketResearch />;
      case 'stockx-inventory':
        return <StockXInventory />;
      case 'stockx-arbitrage':
        return <StockXArbitrage />;
      case 'stockx-repricing':
        return <StockXRepricing />;
      case 'stockx-sales':
        return <StockXSales />;
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

  // Don't render until client-side hydration is complete
  if (!isClient) {
    return (
      <div className={`flex h-screen overflow-hidden ${currentTheme.colors.background}`}>
        <div className="flex-1 flex items-center justify-center">
          <div className={`text-lg ${isNeon ? 'text-white' : 'text-gray-900'}`}>
            Loading...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-screen overflow-hidden ${currentTheme.colors.background}`}>
      {/* Sidebar */}
      <Sidebar 
        activeItem={currentSection}
        onItemClick={handleItemClick}
        isOpen={sidebarOpen}
        onClose={closeSidebar}
      />
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden lg:ml-0">
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