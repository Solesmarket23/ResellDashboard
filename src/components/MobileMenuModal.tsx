'use client';

import React from 'react';
import { 
  X,
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
  Search,
  Archive,
  ArrowLeftRight,
  Calendar,
  Monitor,
  LineChart,
  Bell,
  Activity,
  DollarSign,
  Tag,
  Truck,
  User,
  Plus,
  HelpCircle,
  CreditCard,
  Zap,
  LogOut
} from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';

interface MobileMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeItem: string;
  onItemClick: (item: string) => void;
}

const PRICE_MONITOR_DISABLED = process.env.NEXT_PUBLIC_DISABLE_PRICE_MONITOR === 'true';

// Organized menu sections for mobile
const menuSections = [
  {
    title: 'MAIN',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: Home },
      { id: 'purchases', label: 'Purchases', icon: ShoppingCart },
      { id: 'deliveries', label: 'Deliveries', icon: Truck },
      { id: 'sales', label: 'Sales', icon: TrendingUp },
      { id: 'sales-2-0', label: 'Sales 2.0', icon: TrendingUp },
      { id: 'purchase-linking', label: 'Purchase Linking', icon: ArrowLeftRight },
    ]
  },
  {
    title: 'STOCKX',
    items: [
      { id: 'stockx-listings', label: 'Create Listing', icon: Plus },
      { id: 'stockx-arbitrage', label: 'Arbitrage', icon: ArrowLeftRight },
      { id: 'ebay-stockx-arbitrage', label: 'eBay Deals', icon: Target },
      { id: 'stockx-repricing', label: 'Repricing', icon: Activity },
      { id: 'stockx-coupons', label: 'Coupons', icon: Tag },
      ...(PRICE_MONITOR_DISABLED ? [] : [{ id: 'stockx-price-monitor', label: 'Price Monitor', icon: Monitor }]),
    ]
  },
  {
    title: 'ALIAS',
    items: [
      { id: 'alias-inventory', label: 'Inventory', icon: Package },
      { id: 'alias-listings', label: 'Create Listing', icon: Plus },
      { id: 'alias-orders', label: 'Orders', icon: Truck },
    ]
  },
  {
    title: 'TOOLS',
    items: [
      { id: 'failed-verifications', label: 'Failed Verifications', icon: AlertTriangle },
      { id: 'market-alerts', label: 'Market Alerts', icon: Bell },
      { id: 'analytics', label: 'Analytics', icon: BarChart3 },
      { id: 'cashflow', label: 'Cash Flow', icon: DollarSign },
    ]
  },
  {
    title: 'ACCOUNT',
    items: [
      { id: 'profile', label: 'Profile', icon: User },
      { id: 'plans', label: 'Plans & Billing', icon: CreditCard },
      { id: 'faq', label: 'Help & FAQ', icon: HelpCircle },
    ]
  }
];

const MobileMenuModal: React.FC<MobileMenuModalProps> = ({
  isOpen,
  onClose,
  activeItem,
  onItemClick,
}) => {
  const { currentTheme } = useTheme();
  const { user, logout } = useAuth();

  if (!isOpen) return null;

  const handleItemClick = (itemId: string) => {
    onItemClick(itemId);
    onClose();
  };

  const handleLogout = async () => {
    await logout();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{
        backgroundColor: currentTheme === 'dark' ? '#111827' : '#ffffff',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 border-b"
        style={{
          borderBottomColor: currentTheme === 'dark' ? '#374151' : '#e5e7eb',
          paddingTop: 'calc(env(safe-area-inset-top) + 1rem)',
        }}
      >
        <h2
          className="text-xl font-bold"
          style={{
            color: currentTheme === 'dark' ? '#ffffff' : '#111827',
          }}
        >
          Menu
        </h2>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <X
            size={24}
            style={{
              color: currentTheme === 'dark' ? '#9ca3af' : '#6b7280',
            }}
          />
        </button>
      </div>

      {/* User Info */}
      {user && (
        <div
          className="p-4 border-b"
          style={{
            borderBottomColor: currentTheme === 'dark' ? '#374151' : '#e5e7eb',
          }}
        >
          <div className="flex items-center space-x-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: '#3b82f6',
              }}
            >
              <User size={24} color="#ffffff" />
            </div>
            <div>
              <p
                className="font-semibold"
                style={{
                  color: currentTheme === 'dark' ? '#ffffff' : '#111827',
                }}
              >
                {user.email}
              </p>
              <p
                className="text-sm"
                style={{
                  color: currentTheme === 'dark' ? '#9ca3af' : '#6b7280',
                }}
              >
                Flip Flow Pro
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Scrollable Menu */}
      <div
        className="flex-1 overflow-y-auto"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 4rem)',
        }}
      >
        {menuSections.map((section) => (
          <div key={section.title} className="py-4">
            <h3
              className="px-4 mb-2 text-xs font-semibold tracking-wider"
              style={{
                color: currentTheme === 'dark' ? '#6b7280' : '#9ca3af',
              }}
            >
              {section.title}
            </h3>
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeItem === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item.id)}
                    className="w-full flex items-center space-x-3 px-4 py-3 transition-colors"
                    style={{
                      backgroundColor: isActive
                        ? currentTheme === 'dark'
                          ? '#1e3a8a'
                          : '#dbeafe'
                        : 'transparent',
                      color: isActive
                        ? '#3b82f6'
                        : currentTheme === 'dark'
                        ? '#d1d5db'
                        : '#374151',
                    }}
                  >
                    <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                    <span
                      className="text-sm font-medium"
                      style={{
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Logout Button */}
        <div className="px-4 py-4">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-lg transition-colors"
            style={{
              backgroundColor: '#ef4444',
              color: '#ffffff',
            }}
          >
            <LogOut size={20} />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MobileMenuModal;






