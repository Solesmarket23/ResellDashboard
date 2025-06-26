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
  Volume2
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
        { id: 'inventory', label: 'Inventory', icon: Package },
        { id: 'purchases', label: 'Purchases', icon: ShoppingCart },
        { id: 'sales', label: 'Sales', icon: TrendingUp },
        { id: 'listings', label: 'Listings', icon: List },
      ]
    },
    {
      section: 'OPERATIONS',
      items: [
        { id: 'deliveries', label: 'Deliveries', icon: Truck },
        { id: 'failed-verifications', label: 'Failed Verifications', icon: AlertTriangle },
      ]
    },
    {
      section: 'FINANCIALS',
      items: [
        { id: 'financial-overview', label: 'Financial Overview', icon: PieChart },
        { id: 'cash-flow', label: 'Cash Flow', icon: DollarSign },
        { id: 'performance', label: 'Performance', icon: Activity },
        { id: 'expenses', label: 'Expenses', icon: CreditCard },
      ]
    },
    {
      section: 'ANALYTICS',
      items: [
        { id: 'analytics', label: 'Analytics', icon: BarChart3 },
      ]
    },
    {
      section: 'TOOLS',
      items: [
        { id: 'profit-calculator', label: 'Profit Calculator', icon: Calculator },
        { id: 'price-tracker', label: 'Price Tracker', icon: Target },
        { id: 'flip-finder', label: 'Flip Finder', icon: Flash },
        { id: 'market-alerts', label: 'Market Alerts', icon: Bell },
        { id: 'loss-tracker', label: 'Loss Tracker', icon: TrendingDown },
        { id: 'audio-preview', label: 'Audio Preview', icon: Volume2 },
      ]
    }
  ];

  return (
    <div className={`w-72 ${currentTheme.colors.background} ${currentTheme.colors.border} border-r h-screen flex flex-col`}>
      {/* Header */}
      <div className={`p-6 ${currentTheme.colors.border} border-b`}>
        <div className="flex items-center space-x-3">
          <div className={`w-8 h-8 ${currentTheme.colors.primary} rounded-lg flex items-center justify-center relative overflow-hidden`}>
            <Zap className="w-5 h-5 text-white" />
            <ArrowUpRight className="w-3 h-3 text-white absolute top-0.5 right-0.5 opacity-75" />
          </div>
          <div>
            <h1 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>FlipFlow</h1>
            <p className={`text-sm ${currentTheme.colors.textSecondary}`}>Resell Intelligence</p>
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
                    className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                      isActive
                        ? `${currentTheme.colors.primary} text-white`
                        : `${currentTheme.colors.textSecondary} hover:bg-gray-100`
                    }`}
                  >
                    <Icon className="w-5 h-5 mr-3 flex-shrink-0" />
                    {item.label}
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