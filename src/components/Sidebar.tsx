'use client';

import React from 'react';
import { 
  Home, 
  Package, 
  ShoppingCart, 
  TrendingUp, 
  List, 
  Truck, 
  AlertTriangle, 
  PieChart, 
  DollarSign, 
  Activity, 
  CreditCard, 
  BarChart3,
  Zap,
  ArrowUpRight,
  Calculator,
  Target,
  Zap as Flash,
  TrendingDown,
  Bell,
  Volume2,
  HelpCircle,
  CreditCard as Pricing,
  Sparkles,
  Crown
} from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

interface SidebarProps {
  activeItem: string;
  onItemClick: (item: string) => void;
}

const Sidebar = ({ activeItem, onItemClick }: SidebarProps) => {
  const { currentTheme } = useTheme();
  const isPremium = currentTheme.name === 'Premium';
  const isRevolutionary = currentTheme.name === 'Premium'; // Revolutionary Creative = Premium theme

  const navigationItems = [
    {
      section: 'OVERVIEW',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: Home },
        { id: 'purchases', label: 'Purchases', icon: Package },
        { id: 'sales', label: 'Sales', icon: ShoppingCart },
        { id: 'profitCalculator', label: 'Profit Calculator', icon: Calculator },
      ]
    },
    {
      section: 'ANALYTICS',
      items: [
        { id: 'analytics', label: 'Analytics', icon: BarChart3 },
        { id: 'trends', label: 'Trends', icon: TrendingUp },
        { id: 'tracking', label: 'Tracking', icon: Truck },
        { id: 'performance', label: 'Performance', icon: Target },
      ]
    },
    {
      section: 'TOOLS',
      items: [
        { id: 'verification', label: 'Failed Verifications', icon: AlertTriangle },
        { id: 'insights', label: 'Insights', icon: PieChart },
        { id: 'revenue', label: 'Revenue', icon: DollarSign },
        { id: 'scanner', label: 'Package Scanner', icon: Flash },
        { id: 'voice', label: 'Voice Notes', icon: Volume2 },
      ]
    },
    {
      section: 'SUPPORT',
      items: [
        { id: 'faq', label: 'FAQ', icon: HelpCircle },
        { id: 'plans', label: 'Plans & Pricing', icon: Pricing },
      ]
    }
  ];

  return (
    <div className={`w-80 h-screen fixed left-0 top-0 z-40 overflow-y-auto ${
      isRevolutionary
        ? 'sidebar-revolutionary'
        : isPremium 
          ? 'sidebar-dark-premium' 
          : 'bg-white border-r border-gray-200'
    }`}>
      <div className="p-6">
        {/* Logo/Brand */}
        <div className="mb-8">
          <h1 className={`text-xl font-bold ${
            isRevolutionary
              ? 'text-revolutionary-gradient'
              : isPremium 
                ? 'text-premium-gradient' 
                : 'text-blue-600'
          }`}>
            {isRevolutionary ? '🚀' : '⚡'} Resell Dashboard
          </h1>
          <p className={`text-sm mt-1 ${
            isRevolutionary
              ? 'text-white/70'
              : isPremium 
                ? 'text-slate-400' 
                : 'text-gray-500'
          }`}>
            {isRevolutionary ? 'Revolutionary Analytics Suite' : isPremium ? 'Premium Analytics Suite' : 'Analytics Dashboard'}
          </p>
        </div>

        {/* Navigation */}
        <nav className="space-y-6">
          {navigationItems.map((section) => (
            <div key={section.section}>
              <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 px-4 ${
                isRevolutionary
                  ? 'text-white/50'
                  : isPremium 
                    ? 'text-slate-500' 
                    : 'text-gray-400'
              }`}>
                {section.section}
              </h3>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeItem === item.id;
                  
                  return (
                    <button
                      key={item.id}
                      onClick={() => onItemClick(item.id)}
                      className={`w-full group flex items-center px-4 py-3 rounded-lg transition-all duration-300 ${
                        isRevolutionary
                          ? `nav-item-revolutionary ${isActive ? 'active' : ''}`
                          : isPremium
                            ? `nav-item-premium ${isActive ? 'active' : ''}`
                            : isActive
                              ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-600'
                              : 'text-gray-600 hover:bg-gray-50 hover:text-blue-600'
                      }`}
                    >
                      <Icon className={`w-5 h-5 mr-3 transition-colors ${
                        isRevolutionary
                          ? isActive 
                            ? 'text-cyan-400' 
                            : 'text-white/60 group-hover:text-cyan-400'
                          : isPremium
                            ? isActive 
                              ? 'text-purple-400' 
                              : 'text-slate-400 group-hover:text-purple-400'
                            : isActive
                              ? 'text-blue-600'
                              : 'text-gray-400 group-hover:text-blue-500'
                      }`} />
                      <span className="text-sm font-medium">
                        {item.label}
                      </span>
                      {(isPremium || isRevolutionary) && isActive && (
                        <div className={`ml-auto w-2 h-2 rounded-full ${
                          isRevolutionary
                            ? 'bg-gradient-to-r from-cyan-400 to-purple-400 glow-revolutionary'
                            : 'bg-gradient-to-r from-purple-500 to-blue-500 glow-purple'
                        }`}></div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Premium Badge or Upgrade Card */}
        {isPremium || isRevolutionary ? (
          <div className="mt-8 mx-2">
            <div className={`p-4 ${
              isRevolutionary ? 'revolutionary-card' : 'dark-premium-card'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-semibold uppercase tracking-wider ${
                  isRevolutionary ? 'text-revolutionary-gradient' : 'text-premium-gradient'
                }`}>
                  {isRevolutionary ? 'Revolutionary' : 'Premium'}
                </span>
                {isRevolutionary ? (
                  <Crown className="w-4 h-4 text-yellow-400" />
                ) : (
                  <Zap className="w-4 h-4 text-yellow-400" />
                )}
              </div>
              <p className={`text-xs mb-3 ${
                isRevolutionary ? 'text-white/70' : 'text-slate-400'
              }`}>
                {isRevolutionary 
                  ? 'Experience the future of analytics' 
                  : 'Unlock advanced analytics and unlimited tracking'
                }
              </p>
              <button className={`w-full text-xs py-2 ${
                isRevolutionary ? 'btn-revolutionary' : 'btn-premium'
              }`}>
                {isRevolutionary ? 'Explore Features' : 'Upgrade Now'}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-8 mx-2">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
                  Upgrade
                </span>
                <Zap className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-xs text-blue-600 mb-3">
                Get advanced analytics and unlimited tracking
              </p>
              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs py-2 px-3 rounded-md font-medium transition-colors">
                Go Premium
              </button>
            </div>
          </div>
        )}

        {/* Stats Card */}
        <div className="mt-4 mx-2">
          <div className={`p-4 rounded-lg ${
            isRevolutionary
              ? 'revolutionary-card'
              : isPremium 
                ? 'dark-premium-card' 
                : 'bg-gray-50 border border-gray-100'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-semibold uppercase tracking-wider ${
                isRevolutionary
                  ? 'text-revolutionary-gradient'
                  : isPremium 
                    ? 'text-slate-300' 
                    : 'text-gray-600'
              }`}>
                This Month
              </span>
              <TrendingUp className={`w-4 h-4 ${
                isRevolutionary
                  ? 'text-cyan-400'
                  : isPremium 
                    ? 'text-green-400' 
                    : 'text-green-500'
              }`} />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className={
                  isRevolutionary 
                    ? 'text-white/70' 
                    : isPremium 
                      ? 'text-slate-400' 
                      : 'text-gray-500'
                }>
                  Profit
                </span>
                <span className={`font-semibold ${
                  isRevolutionary
                    ? 'text-cyan-400'
                    : isPremium 
                      ? 'text-green-400' 
                      : 'text-green-600'
                }`}>
                  +$2,847
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={
                  isRevolutionary 
                    ? 'text-white/70' 
                    : isPremium 
                      ? 'text-slate-400' 
                      : 'text-gray-500'
                }>
                  Orders
                </span>
                <span className={`font-semibold ${
                  isRevolutionary
                    ? 'text-purple-400'
                    : isPremium 
                      ? 'text-blue-400' 
                      : 'text-blue-600'
                }`}>
                  47
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={
                  isRevolutionary 
                    ? 'text-white/70' 
                    : isPremium 
                      ? 'text-slate-400' 
                      : 'text-gray-500'
                }>
                  Success Rate
                </span>
                <span className={`font-semibold ${
                  isRevolutionary
                    ? 'text-pink-400'
                    : isPremium 
                      ? 'text-purple-400' 
                      : 'text-indigo-600'
                }`}>
                  94%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar; 