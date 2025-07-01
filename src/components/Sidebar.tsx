'use client';

import React from 'react';
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
  CreditCard
} from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

interface SidebarProps {
  activeItem: string;
  onItemClick: (item: string) => void;
}

const Sidebar = ({ activeItem, onItemClick }: SidebarProps) => {
  const { currentTheme } = useTheme();

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
      section: 'SUPPORT',
      items: [
        { id: 'plans', label: 'Plans & Pricing', icon: CreditCard },
      ]
    }
  ];

  return (
    <div className={`w-72 ${currentTheme.colors.background} h-screen flex flex-col border-r border-gray-700/20`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-700/20">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">⚡</span>
          </div>
          <div>
            <h1 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>Resell Dashboard</h1>
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
                        ? currentTheme.name === 'Premium'
                          ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 text-cyan-400 border border-cyan-500/30'
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
    </div>
  );
};

export default Sidebar; 