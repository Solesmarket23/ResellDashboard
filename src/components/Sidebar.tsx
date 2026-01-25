'use client';

import React, { useState, useEffect } from 'react';
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
  Tag,
  Bell,
  Activity,
  DollarSign,
  Truck,
  User,
  LogOut,
  Plus,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import { db } from '../lib/firebase/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface SidebarProps {
  activeItem: string;
  onItemClick: (item: string) => void;
  isOpen: boolean;
  onClose: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const PRICE_MONITOR_DISABLED = process.env.NEXT_PUBLIC_DISABLE_PRICE_MONITOR === 'true';

const navigationItems = [
  {
    section: 'OVERVIEW',
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
    section: 'ANALYTICS',
    items: [
      { id: 'analytics', label: 'Analytics', icon: BarChart3 },
      { id: 'cashflow', label: 'Cash Flow', icon: DollarSign },
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
      { id: 'stockx-arbitrage', label: 'StockX Arbitrage', icon: ArrowLeftRight },
      { id: 'ebay-stockx-arbitrage', label: 'eBay → StockX Deals', icon: Target },
      { id: 'stockx-listings', label: 'Create Listing', icon: Package },
      { id: 'stockx-repricing', label: 'Automated Repricing', icon: Activity },
      { id: 'stockx-sales', label: 'My Sales', icon: DollarSign },
      { id: 'stockx-coupons', label: 'Coupons', icon: Tag },
      ...(PRICE_MONITOR_DISABLED ? [] : [{ id: 'stockx-price-monitor', label: 'Price Monitor', icon: Monitor }]),
      { id: 'stockx-flex-ask-monitor', label: 'Flex Ask Monitor', icon: Bell },
    ]
  },
  {
    section: 'ALIAS INTEGRATION',
    items: [
      { id: 'alias-inventory', label: 'Inventory Manager', icon: Package },
      { id: 'alias-listings', label: 'Create Listing', icon: Plus },
      { id: 'alias-orders', label: 'Order Management', icon: Truck },
    ]
  },
  {
    section: 'SUPPORT',
    items: [
      { id: 'plans', label: 'Plans & Pricing', icon: CreditCard },
      { id: 'feature-requests', label: 'Feature Requests', icon: Zap },
      { id: 'faq', label: 'FAQ', icon: HelpCircle },
      { id: 'onboarding-questionnaire', label: 'Setup Wizard', icon: Zap },
    ]
  }
];

const Sidebar = ({ activeItem, onItemClick, isOpen, onClose, isCollapsed = false, onToggleCollapse }: SidebarProps) => {
  const { currentTheme } = useTheme();
  const { user, signOut } = useAuth();
  const [profileData, setProfileData] = useState<{ firstName?: string; lastName?: string } | null>(null);
  const [memberSince, setMemberSince] = useState<string>('');

  // Load user profile data
  useEffect(() => {
    const loadProfileData = async () => {
      if (!user) return;
      
      try {
        const profileRef = doc(db, 'profiles', user.uid);
        const profileDoc = await getDoc(profileRef);
        
        if (profileDoc.exists()) {
          const data = profileDoc.data();
          setProfileData({
            firstName: data.firstName || '',
            lastName: data.lastName || ''
          });
        }
        
        // Format member since date
        const creationTime = user.metadata?.creationTime;
        if (creationTime) {
          const date = new Date(creationTime);
          const formattedDate = date.toLocaleDateString('en-US', {
            month: 'numeric',
            day: 'numeric',
            year: 'numeric'
          });
          setMemberSince(formattedDate);
        }
      } catch (error) {
        console.error('Error loading profile data:', error);
      }
    };

    loadProfileData();
  }, [user]);

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
      <div 
        className={`fixed lg:static inset-y-0 left-0 bg-gray-900 transform ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 transition-all duration-200 ease-in-out z-50 flex flex-col overflow-hidden`}
        style={{
          width: isCollapsed ? '4rem' : '16rem'
        }}
      >
        <div className="flex-1 overflow-y-auto">
          {navigationItems.map((section) => (
            <div key={section.section} className={`${isCollapsed ? 'p-2' : 'p-4'}`}>
              {!isCollapsed && (
                <h3 className={`text-xs font-semibold ${currentTheme.colors.textSecondary} uppercase tracking-wider mb-3`}>
                  {section.section}
                </h3>
              )}
              <nav className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeItem === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleItemClick(item.id)}
                      className={`w-full flex items-center ${isCollapsed ? 'px-2 py-3 justify-center' : 'px-3 py-2'} text-sm font-medium rounded-lg whitespace-nowrap border ${
                        isActive
                          ? currentTheme.name === 'Neon'
                            ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 text-cyan-400 border-cyan-500/30'
                            : `${currentTheme.colors.primary} text-white border-transparent`
                          : `${currentTheme.colors.textSecondary} hover:bg-white/5 hover:text-white border-transparent`
                      } transition-colors duration-150`}
                      title={isCollapsed ? item.label : undefined}
                    >
                      <Icon className={`${isCollapsed ? 'w-5 h-5' : 'w-5 h-5 mr-3'} flex-shrink-0`} />
                      {!isCollapsed && (
                        <>
                          {item.label}
                          {isActive && (
                            <div className="ml-auto w-2 h-2 bg-current rounded-full"></div>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        {/* User Profile Section */}
        <div className={`${isCollapsed ? 'p-2' : 'p-4'} border-t border-gray-800`}>
          {/* Hide/Show Menu Button */}
          {onToggleCollapse && (
            <div className="mb-3">
              <button
                onClick={onToggleCollapse}
                // Keep layout stable between collapsed/expanded to avoid the brief “label jump” some browsers show.
                // Fixed height + consistent padding prevents vertical reflow during the width transition.
                className={`w-full h-12 flex items-center ${isCollapsed ? 'justify-center' : ''} px-3 text-sm font-medium rounded-lg transition-colors ${currentTheme.colors.textSecondary} hover:bg-white/5 hover:text-white leading-none`}
                // Only use `title` when collapsed (tooltip needed). When expanded, the visible text is enough and
                // some browsers briefly flash the tooltip on click ("Hide Menu"), which feels like flicker.
                title={isCollapsed ? 'Show menu' : undefined}
                aria-label={isCollapsed ? 'Show menu' : 'Hide menu'}
              >
                <span className={`inline-flex items-center ${isCollapsed ? '' : 'justify-start'}`}>
                  {isCollapsed ? (
                    <ChevronRight className="w-5 h-5" />
                  ) : (
                    <ChevronLeft className="w-5 h-5" />
                  )}
                  {/* Avoid swapping visible wording between states (prevents “Hide menu” flicker). */}
                  <span className={isCollapsed ? 'sr-only' : 'ml-2'}>Menu</span>
                </span>
              </button>
            </div>
          )}

          {user ? (
            <div className="space-y-3">
              {/* User Info */}
              {!isCollapsed && (
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center shadow-lg">
                    <User className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {profileData?.firstName && profileData?.lastName 
                        ? `${profileData.firstName} ${profileData.lastName}`
                        : user.displayName || user.email?.split('@')[0] || 'User'
                      }
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      Pro Member {memberSince && `since ${memberSince}`}
                    </p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2">
                <button
                  onClick={() => handleItemClick('profile')}
                  className={`w-full flex items-center ${isCollapsed ? 'px-2 py-3 justify-center' : 'px-3 py-2'} text-sm font-medium rounded-lg border ${
                    activeItem === 'profile'
                      ? currentTheme.name === 'Neon'
                        ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 text-cyan-400 border-cyan-500/30'
                        : `${currentTheme.colors.primary} text-white border-transparent`
                      : `${currentTheme.colors.textSecondary} hover:bg-white/5 hover:text-white border-transparent`
                  } transition-colors duration-150`}
                  title={isCollapsed ? 'Profile' : undefined}
                >
                  <User className={`${isCollapsed ? 'w-5 h-5' : 'w-4 h-4 mr-2'}`} />
                  {!isCollapsed && 'Profile'}
                </button>
                <button
                  onClick={handleLogout}
                  className={`w-full flex items-center ${isCollapsed ? 'px-2 py-3 justify-center' : 'px-3 py-2'} text-sm font-medium rounded-lg transition-colors ${currentTheme.colors.textSecondary} hover:bg-white/5 hover:text-white`}
                  title={isCollapsed ? 'Logout' : undefined}
                >
                  <LogOut className={`${isCollapsed ? 'w-5 h-5' : 'w-4 h-4 mr-2'}`} />
                  {!isCollapsed && 'Logout'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleLogout}
              className={`w-full flex items-center ${isCollapsed ? 'px-2 py-3 justify-center' : 'px-3 py-2'} text-sm font-medium rounded-lg transition-colors ${currentTheme.colors.textSecondary} hover:bg-white/5 hover:text-white`}
              title={isCollapsed ? 'Logout' : undefined}
            >
              <LogOut className={`${isCollapsed ? 'w-5 h-5' : 'w-4 h-4 mr-2'}`} />
              {!isCollapsed && <span>Logout</span>}
            </button>
          )}
        </div>
      </div>
    </>
  );
};

export default Sidebar; 