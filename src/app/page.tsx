'use client';

import { useState, useEffect } from 'react';
import { Palette } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import Sidebar from '../components/Sidebar';
import Dashboard from '../components/Dashboard';
import Purchases from '../components/Purchases';
import Sales from '../components/Sales';
import FailedVerifications from '../components/FailedVerifications';
import ProfitCalculator from '../components/ProfitCalculator';
import AudioPreview from '../components/AudioPreview';
import FAQ from '../components/FAQ';
import Plans from '../components/Plans';

export default function Home() {
  const { currentTheme, setTheme } = useTheme();
  const [activeItem, setActiveItem] = useState('dashboard');

  const handleItemClick = (item: string) => {
    setActiveItem(item);
  };

  // Map theme names to numbers for the UI
  const getThemeNumber = (themeName: string) => {
    switch (themeName) {
      case 'Light': return 1;
      case 'Dark': return 2;
      case 'Premium': return 3;
      default: return 1;
    }
  };

  // Map numbers back to theme names
  const setThemeByNumber = (themeNumber: 1 | 2 | 3) => {
    switch (themeNumber) {
      case 1: setTheme('Light'); break;
      case 2: setTheme('Dark'); break;
      case 3: setTheme('Premium'); break;
    }
  };

  const isPremium = currentTheme.name === 'Premium';
  const isDark = currentTheme.name === 'Dark';
  const isRevolutionary = currentTheme.name === 'Premium'; // Revolutionary Creative = Premium theme

  // Apply theme body classes on component mount and theme changes
  useEffect(() => {
    // The ThemeContext already handles body class management
    // Just ensure the initial theme is applied on first load
    if (typeof document !== 'undefined') {
      document.body.className = document.body.className.replace(/theme-\w+/g, '');
      document.body.classList.add(currentTheme.colors.bodyClass);
    }
  }, [currentTheme]);

  const ComingSoonPage = ({ title, description, features }: { title: string; description: string; features: string[] }) => (
    <div className={`flex-1 p-8 ${
      isRevolutionary ? 'ml-80 bg-slate-900' :
      isPremium ? 'ml-80 bg-slate-900' : 
      isDark ? 'ml-80 bg-gray-900' :
      'ml-80 bg-gray-50'
    }`}>
      <h1 className={`text-3xl font-bold ${
        isRevolutionary ? 'heading-revolutionary' :
        isPremium ? 'text-premium-gradient' : 
        isDark ? 'text-white' :
        'text-gray-900'
      }`}>
        {title}
      </h1>
      <div className={`
        mt-6 p-6 rounded-xl shadow-lg
        ${isRevolutionary
          ? 'revolutionary-card'
          : isPremium 
            ? 'dark-premium-card' 
            : isDark
              ? 'bg-gray-800 border border-gray-700'
              : 'bg-white border border-gray-200'
        }
      `}>
        <p className={`${
          isRevolutionary ? 'text-white/80' :
          isPremium ? 'text-slate-300' : 
          isDark ? 'text-gray-300' :
          'text-gray-600'
        }`}>
          {description}
        </p>
        <div className={`
          mt-4 p-4 rounded-lg border
          ${isRevolutionary
            ? 'bg-white/5 border-white/20 backdrop-blur-xl'
            : isPremium 
              ? 'bg-slate-800 border-slate-600' 
              : isDark
                ? 'bg-gray-700 border-gray-600'
                : 'bg-blue-50 border-blue-200'
          }
        `}>
          <h3 className={`text-lg font-semibold mb-2 ${
            isRevolutionary ? 'text-revolutionary-gradient' :
            isPremium || isDark ? 'text-white' : 'text-gray-900'
          }`}>
            {title.includes('Features') ? 'Features:' : 'Coming Features:'}
          </h3>
          <ul className={`space-y-2 ${
            isRevolutionary ? 'text-white/70' :
            isPremium ? 'text-slate-400' : 
            isDark ? 'text-gray-400' :
            'text-gray-600'
          }`}>
            {features.map((feature, index) => (
              <li key={index}>• {feature}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeItem) {
      case 'dashboard':
        return <Dashboard />;
      case 'inventory':
        return (
          <ComingSoonPage
            title="Inventory"
            description="Inventory management coming soon..."
            features={[
              'Real-time inventory tracking',
              'Automated stock alerts',
              'SKU management system',
              'Inventory value analytics'
            ]}
          />
        );
      case 'purchases':
        return <Purchases />;
      case 'sales':
        return <Sales />;
      case 'verification':
      case 'failed-verifications':
        return <FailedVerifications />;
      case 'profitCalculator':
      case 'profit-calculator':
        return <ProfitCalculator />;
      case 'scanner':
        return (
          <ComingSoonPage
            title="Package Scanner"
            description="AI-powered package scanning and verification system coming soon..."
            features={[
              'Automated barcode scanning',
              'Package authenticity verification',
              'Instant profit calculations',
              'Integration with major platforms'
            ]}
          />
        );
      case 'analytics':
        return (
          <ComingSoonPage
            title="Analytics"
            description="Advanced analytics and reporting dashboard coming soon..."
            features={[
              'Market trend analysis',
              'Profit optimization insights',
              'Performance benchmarking',
              'Predictive market modeling'
            ]}
          />
        );
      case 'trends':
        return (
          <ComingSoonPage
            title="Market Trends"
            description="Real-time market trends and insights coming soon..."
            features={[
              'Live price tracking',
              'Market sentiment analysis',
              'Trending product alerts',
              'Seasonal demand patterns'
            ]}
          />
        );
      case 'tracking':
        return (
          <ComingSoonPage
            title="Package Tracking"
            description="Advanced package tracking and logistics management coming soon..."
            features={[
              'Multi-carrier tracking',
              'Delivery notifications',
              'Route optimization',
              'Shipping cost analysis'
            ]}
          />
        );
      case 'performance':
        return (
          <ComingSoonPage
            title="Performance Metrics"
            description="Comprehensive performance tracking and optimization tools coming soon..."
            features={[
              'ROI tracking and analysis',
              'Success rate monitoring',
              'Goal setting and tracking',
              'Performance comparisons'
            ]}
          />
        );
      case 'insights':
        return (
          <ComingSoonPage
            title="Business Insights"
            description="AI-powered business insights and recommendations coming soon..."
            features={[
              'Profit optimization recommendations',
              'Market opportunity detection',
              'Risk assessment tools',
              'Growth strategy suggestions'
            ]}
          />
        );
      case 'revenue':
        return (
          <ComingSoonPage
            title="Revenue Analytics"
            description="Advanced revenue tracking and forecasting tools coming soon..."
            features={[
              'Revenue forecasting',
              'Profit margin analysis',
              'Cash flow projections',
              'Tax optimization tools'
            ]}
          />
        );
      case 'voice':
        return (
          <ComingSoonPage
            title="Voice Notes"
            description="Voice-to-text note taking and organization system coming soon..."
            features={[
              'Voice-to-text transcription',
              'Smart note organization',
              'Audio recording backup',
              'Searchable voice archive'
            ]}
          />
        );
      case 'audio-preview':
        return (
          <div className={`flex-1 ${
            isRevolutionary ? 'ml-80 bg-slate-900' :
            isPremium ? 'ml-80 bg-slate-900' : 
            isDark ? 'ml-80 bg-gray-900' :
            'ml-80 bg-gray-50'
          }`}>
            <AudioPreview />
          </div>
        );
      case 'faq':
        return <FAQ />;
      case 'plans':
        return <Plans />;
      default:
        return (
          <ComingSoonPage
            title={activeItem.charAt(0).toUpperCase() + activeItem.slice(1).replace('-', ' ')}
            description="This premium feature is coming soon..."
            features={['Stay tuned for updates and new functionality!']}
          />
        );
    }
  };

  return (
    <div className={`flex h-screen relative ${
      isRevolutionary ? 'bg-slate-900' :
      isPremium ? 'bg-slate-900' : 
      isDark ? 'bg-gray-900' :
      'bg-gray-50'
    }`}>
      {/* Revolutionary theme - no special containers or overlays */}
      
      {/* Global Theme Selector - Show on all pages */}
      <div className="fixed top-2 right-2 z-[60] sm:top-3 sm:right-3">
        <div className={`backdrop-blur-xl rounded-xl p-1.5 border shadow-xl ${
          isRevolutionary
            ? 'bg-black/20 border-white/20'
            : isPremium 
              ? 'bg-slate-800/90 border-slate-600/50' 
              : isDark
                ? 'bg-gray-800/90 border-gray-600/50'
                : 'bg-white/90 border-gray-200/50'
        }`}>
          <div className="flex items-center space-x-1">
            <span className={`text-xs font-medium px-2 hidden sm:inline ${
              isRevolutionary ? 'text-white/80' :
              isPremium ? 'text-slate-300' : 
              isDark ? 'text-gray-300' :
              'text-gray-600'
            }`}>
              Theme:
            </span>
            {[1, 2, 3].map((themeNumber) => (
              <button
                key={themeNumber}
                onClick={() => setThemeByNumber(themeNumber as 1 | 2 | 3)}
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg font-bold text-xs transition-all duration-300 flex items-center justify-center ${
                  getThemeNumber(currentTheme.name) === themeNumber
                    ? isRevolutionary && themeNumber === 3
                      ? 'bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 text-white shadow-2xl scale-110 glow-revolutionary'
                      : 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg scale-110'
                    : isRevolutionary
                      ? 'text-white/60 hover:text-white hover:bg-white/10 hover:scale-105 backdrop-blur-sm'
                      : isPremium 
                        ? 'text-slate-400 hover:text-white hover:bg-slate-700/50 hover:scale-105'
                        : isDark
                          ? 'text-gray-400 hover:text-white hover:bg-gray-700/50 hover:scale-105'
                          : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100/50 hover:scale-105'
                }`}
                aria-label={`Switch to theme ${themeNumber}`}
                title={`Switch to ${themeNumber === 1 ? 'Light' : themeNumber === 2 ? 'Dark' : 'Revolutionary Creative'} Theme`}
              >
                {themeNumber}
              </button>
            ))}
            <div className="ml-1 text-xs">
              <Palette className={`w-3 h-3 ${
                isRevolutionary ? 'text-white/60' :
                isPremium ? 'text-slate-400' : 
                isDark ? 'text-gray-400' :
                'text-gray-500'
              }`} />
            </div>
          </div>
        </div>
      </div>
      
      <Sidebar activeItem={activeItem} onItemClick={handleItemClick} />
      {renderContent()}
    </div>
  );
}
