'use client';

import { useState, useRef, useEffect } from 'react';
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
  Palette,
  Check,
  Zap,
  ArrowUpRight
} from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

interface SidebarProps {
  activeItem: string;
  onItemClick: (item: string) => void;
}

const Sidebar = ({ activeItem, onItemClick }: SidebarProps) => {
  const [showMoodThemes, setShowMoodThemes] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { currentTheme, setTheme, themes } = useTheme();

  const moodThemes = Object.values(themes);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowMoodThemes(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleThemeSelect = (themeName: string) => {
    setTheme(themeName);
    setShowMoodThemes(false);
    console.log(`Selected theme: ${themeName}`);
  };

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
    }
  ];

  return (
    <div className={`w-64 ${currentTheme.colors.background} border-r border-gray-200 h-screen flex flex-col`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-8 h-8 ${currentTheme.colors.primary} rounded-lg flex items-center justify-center relative overflow-hidden`}>
              <Zap className="w-5 h-5 text-white" />
              <ArrowUpRight className="w-3 h-3 text-white absolute top-0.5 right-0.5 opacity-75" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">FlipFlow</h1>
              <p className="text-sm text-gray-500">Resell Intelligence</p>
            </div>
          </div>
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowMoodThemes(!showMoodThemes)}
              className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-full transition-colors"
            >
              <Palette className="w-4 h-4 text-black" />
            </button>
            
            {showMoodThemes && (
              <div className="absolute right-0 top-10 w-48 bg-gradient-to-br from-slate-100 to-gray-200 rounded-lg shadow-lg border border-gray-300 py-2 z-50">
                <div className="px-4 py-2 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900">Mood Themes</h3>
                </div>
                <div className="py-1">
                  {moodThemes.map((theme) => (
                    <button
                      key={theme.name}
                      onClick={() => handleThemeSelect(theme.name)}
                      className={`w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors ${
                        currentTheme.name === theme.name ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full ${theme.dotColor} mr-3`}></div>
                      {theme.name}
                      {currentTheme.name === theme.name && (
                        <div className={`ml-auto w-6 h-6 ${currentTheme.colors.primary} rounded-full flex items-center justify-center`}>
                          <Check className="w-4 h-4 text-white font-bold" strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto">
        {navigationItems.map((section) => (
          <div key={section.section} className="p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
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
                    className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      isActive
                        ? `${currentTheme.colors.primary} text-white`
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-5 h-5 mr-3" />
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