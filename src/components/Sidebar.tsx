'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { 
  Home, 
  Package, 
  ShoppingCart, 
  Calculator,
  BarChart3,
  TrendingUp,
  Target,
  AlertTriangle,
  Lightbulb,
  MessageSquare,
  CreditCard,
  User,
  LogOut,
  Settings,
  HelpCircle,
  Zap,
  Search,
  Archive,
  ArrowLeftRight,
  Calendar,
  Monitor,
  LineChart,
  Bell,
  Activity
} from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

interface SidebarProps {
  activeItem: string;
  onItemClick: (item: string) => void;
}

const Sidebar = ({ activeItem, onItemClick }: SidebarProps) => {
  const { currentTheme, setTheme, themes } = useTheme();
  const router = useRouter();

  const navigationItems = [
    {
      section: 'OVERVIEW',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: Home },
        { id: 'purchases', label: 'Purchases', icon: ShoppingCart },
        { id: 'sales', label: 'Sales', icon: TrendingUp },
        { id: 'profit-calculator', label: 'Profit Calculator', icon: Calculator },
      ]
    },
    {
      section: 'ANALYTICS',
      items: [
        { id: 'analytics', label: 'Analytics', icon: BarChart3 },
        { id: 'trends', label: 'Trends', icon: TrendingUp },
        { id: 'tracking', label: 'Tracking', icon: Target },
        { id: 'performance', label: 'Performance', icon: Package },
      ]
    },
    {
      section: 'TOOLS',
      items: [
        { id: 'failed-verifications', label: 'Failed Verifications', icon: AlertTriangle },
        { id: 'insights', label: 'Insights', icon: Lightbulb },
        { id: 'reviews', label: 'Reviews', icon: MessageSquare },
      ]
    },
    {
      section: 'STOCKX INTEGRATION',
      items: [
        { id: 'stockx-market-research', label: 'Market Research', icon: Search },
        { id: 'stockx-inventory', label: 'Inventory Manager', icon: Archive },
        { id: 'stockx-arbitrage', label: 'Arbitrage Finder', icon: ArrowLeftRight },
        { id: 'stockx-releases', label: 'Release Calendar', icon: Calendar },
        { id: 'stockx-price-monitor', label: 'Price Monitor', icon: Monitor },
        { id: 'stockx-profit-calc', label: 'Enhanced Profit Calc', icon: Calculator },
        { id: 'stockx-trends', label: 'Market Trends', icon: LineChart },
        { id: 'stockx-alerts', label: 'Alert System', icon: Bell },
      ]
    },
    {
      section: 'SUPPORT',
      items: [
        { id: 'plans', label: 'Plans & Pricing', icon: CreditCard },
        { id: 'feature-requests', label: 'Feature Requests', icon: Zap },
        { id: 'faq', label: 'FAQ', icon: HelpCircle },
      ]
    }
  ];

  const handleLogout = () => {
    // Add any logout logic here (clear tokens, etc.)
    router.push('/landing');
  };

  return (
    <div className={`w-64 xl:w-72 ${currentTheme.colors.background} h-screen flex flex-col border-r border-gray-700/20 flex-shrink-0`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-700/20">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center">
            <Image
              src="/flip-flow-logo.svg"
              alt="Flip Flow Logo"
              width={32}
              height={32}
              className="w-8 h-8"
            />
          </div>
          <div>
            <h1 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>Flip Flow</h1>
            <p className={`text-sm ${currentTheme.colors.textSecondary}`}>Revolutionary Analytics Suite</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto">
        {navigationItems.map((section) => (
          <div key={section.section} className="p-4">
            <h3 className={`text-xs font-semibold ${currentTheme.colors.textSecondary} uppercase tracking-wider mb-3`}>
              {section.section}
            </h3>
            <nav className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeItem === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onItemClick(item.id)}
                    className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap ${
                      isActive
                        ? currentTheme.name === 'Neon'
                          ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                          : `${currentTheme.colors.primary} text-white`
                        : `${currentTheme.colors.textSecondary} hover:bg-white/5 hover:text-white`
                    }`}
                  >
                    <Icon className="w-5 h-5 mr-3 flex-shrink-0" />
                    {item.label}
                    {isActive && (
                      <div className="ml-auto w-2 h-2 bg-current rounded-full"></div>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      {/* Theme Selector */}
      <div className="p-4 border-t border-gray-700/20">
        <div className="flex items-center justify-between mb-4">
          <span className={`text-xs font-semibold ${currentTheme.colors.textSecondary} uppercase tracking-wider`}>
            Theme
          </span>
          <div className="flex items-center space-x-1">
            <Settings className={`w-4 h-4 ${currentTheme.colors.textSecondary}`} />
          </div>
        </div>
        <div className="flex items-center space-x-1 p-1 rounded-lg bg-black/20 backdrop-blur-sm">
          {Object.values(themes).map((theme, index) => (
            <button
              key={theme.name}
              onClick={() => setTheme(theme.name)}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-bold transition-all duration-200 ${
                currentTheme.name === theme.name 
                  ? 'bg-gradient-to-r from-cyan-500 to-purple-500 text-white shadow-lg' 
                  : 'text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {index + 1}
            </button>
          ))}
        </div>
      </div>

      {/* User Profile Section */}
      <div className="p-4 border-t border-gray-700/20">
        {/* User Info */}
        <div className="flex items-center space-x-3 mb-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            currentTheme.name === 'Neon' 
              ? 'bg-gradient-to-r from-emerald-500 to-cyan-500' 
              : 'bg-gradient-to-r from-purple-500 to-pink-500'
          }`}>
            <User className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${currentTheme.colors.textPrimary} truncate`}>
              Mike Milburn
            </p>
            <p className={`text-xs ${currentTheme.colors.textSecondary} truncate`}>
              Pro Member
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          <button
            onClick={() => onItemClick('profile')}
            className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              activeItem === 'profile'
                ? currentTheme.name === 'Neon'
                  ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : `${currentTheme.colors.primary} text-white`
                : `${currentTheme.colors.textSecondary} hover:bg-white/5 hover:text-white`
            }`}
          >
            <User className="w-4 h-4 mr-3" />
            Profile Settings
          </button>
          
          <button
            onClick={handleLogout}
            className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${currentTheme.colors.textSecondary} hover:bg-red-500/10 hover:text-red-400 group`}
          >
            <LogOut className="w-4 h-4 mr-3 group-hover:text-red-400" />
            <span className="group-hover:text-red-400">Logout</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar; 