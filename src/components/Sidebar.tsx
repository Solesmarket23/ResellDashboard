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
  CreditCard,
  HelpCircle,
  Zap,
  Search,
  Archive,
  ArrowLeftRight,
  Calendar,
  Monitor,
  LineChart,
  Bell,
  Activity,
  DollarSign,
  Truck,
  User,
  LogOut
} from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';

interface SidebarProps {
  activeItem: string;
  onItemClick: (item: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

const navigationItems = [
  {
    section: 'OVERVIEW',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: Home },
      { id: 'purchases', label: 'Purchases', icon: ShoppingCart },
      { id: 'deliveries', label: 'Deliveries', icon: Truck },
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
      { id: 'stockx-order-management', label: 'Order Management', icon: Package },
      { id: 'stockx-market-research', label: 'Market Research', icon: Search },
      { id: 'stockx-inventory', label: 'Inventory Manager', icon: Archive },
      { id: 'stockx-arbitrage', label: 'Arbitrage Finder', icon: ArrowLeftRight },
      { id: 'stockx-repricing', label: 'Automated Repricing', icon: Activity },
      { id: 'stockx-sales', label: 'My Sales', icon: DollarSign },
      { id: 'stockx-releases', label: 'Release Calendar', icon: Calendar },
      { id: 'stockx-price-monitor', label: 'Price Monitor', icon: Monitor },
      { id: 'stockx-flex-ask-monitor', label: 'Flex Ask Monitor', icon: Bell },
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

const Sidebar = ({ activeItem, onItemClick, isOpen, onClose }: SidebarProps) => {
  const { currentTheme } = useTheme();
  const { user, signOut } = useAuth();

  const handleItemClick = (item: string) => {
    // Call the parent's click handler
    onItemClick(item);
    
    // Close sidebar on mobile after item click
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      onClose();
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      if (typeof window !== 'undefined') {
        window.location.href = '/landing';
      }
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <>
      {/* Backdrop for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm lg:hidden z-40"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed lg:static inset-y-0 left-0 w-64 bg-gray-900 transform ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0 transition-transform duration-200 ease-in-out z-50 flex flex-col`}>
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
                      onClick={() => handleItemClick(item.id)}
                      className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap border ${
                        isActive
                          ? currentTheme.name === 'Neon'
                            ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 text-cyan-400 border-cyan-500/30'
                            : `${currentTheme.colors.primary} text-white border-transparent`
                          : `${currentTheme.colors.textSecondary} hover:bg-white/5 hover:text-white border-transparent`
                      } transition-colors duration-150`}
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

        {/* User Profile Section */}
        <div className="p-4 border-t border-gray-800">
          {user ? (
            <div className="space-y-3">
              {/* User Info */}
              <div className="flex items-center space-x-3">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                    className="w-10 h-10 rounded-full"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
                    <User className="w-6 h-6 text-gray-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {user.displayName || 'User'}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    Pro Member
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                <button
                  onClick={() => handleItemClick('profile')}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg border ${
                    activeItem === 'profile'
                      ? currentTheme.name === 'Neon'
                        ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 text-cyan-400 border-cyan-500/30'
                        : `${currentTheme.colors.primary} text-white border-transparent`
                      : `${currentTheme.colors.textSecondary} hover:bg-white/5 hover:text-white border-transparent`
                  } transition-colors duration-150`}
                >
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </button>
                <button
                  onClick={handleLogout}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${currentTheme.colors.textSecondary} hover:bg-white/5 hover:text-white`}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleLogout}
              className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${currentTheme.colors.textSecondary} hover:bg-white/5 hover:text-white`}
            >
              <LogOut className="w-4 h-4 mr-2" />
              <span>Logout</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
};

export default Sidebar; 