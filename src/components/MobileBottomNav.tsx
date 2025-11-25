'use client';

import React, { useState } from 'react';
import { 
  Home, 
  Package, 
  ShoppingCart, 
  TrendingUp,
  User,
  BarChart3,
  Calculator,
  Search,
  Menu,
  Scan
} from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

interface MobileBottomNavProps {
  activeItem: string;
  onItemClick: (item: string) => void;
  onMenuClick: () => void;
  onScanClick: () => void;
}

// Define the 5 main navigation items for mobile
const mobileNavItems = [
  { id: 'dashboard', label: 'Home', icon: Home },
  { id: 'purchases', label: 'Purchases', icon: ShoppingCart },
  { id: 'scan', label: 'Scan', icon: Scan, isSpecial: true }, // Special scan button
  { id: 'sales', label: 'Sales', icon: TrendingUp },
  { id: 'menu', label: 'More', icon: Menu }, // Opens full menu
];

const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeItem,
  onItemClick,
  onMenuClick,
  onScanClick,
}) => {
  const { currentTheme } = useTheme();
  const [isPulsing, setIsPulsing] = useState(false);

  const handleItemClick = async (itemId: string) => {
    // Trigger haptic feedback
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (error) {
      console.log('Haptics not available');
    }

    if (itemId === 'menu') {
      onMenuClick();
    } else if (itemId === 'scan') {
      // Trigger stronger haptic for scan button
      try {
        await Haptics.impact({ style: ImpactStyle.Medium });
      } catch (error) {
        console.log('Haptics not available');
      }
      setIsPulsing(true);
      setTimeout(() => setIsPulsing(false), 300);
      onScanClick();
    } else {
      onItemClick(itemId);
    }
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t"
      style={{
        backgroundColor: currentTheme === 'dark' ? '#1f2937' : '#ffffff',
        borderTopColor: currentTheme === 'dark' ? '#374151' : '#e5e7eb',
        paddingBottom: 'env(safe-area-inset-bottom)', // Handle iPhone notch
      }}
    >
      <nav className="flex items-center justify-around h-16 px-2 relative">
        {mobileNavItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = activeItem === item.id;
          const isSpecial = item.isSpecial;

          // Special styling for scan button (middle button)
          if (isSpecial) {
            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className="flex flex-col items-center justify-center flex-1 h-full relative"
                style={{
                  marginTop: '-20px', // Raise it above the nav bar
                }}
              >
                <div
                  className={`
                    w-16 h-16 rounded-full flex items-center justify-center
                    transition-all duration-300 shadow-lg
                    ${isPulsing ? 'scale-95' : 'scale-100'}
                  `}
                  style={{
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    boxShadow: isPulsing
                      ? '0 0 30px rgba(59, 130, 246, 0.8), 0 0 60px rgba(59, 130, 246, 0.4)'
                      : '0 8px 20px rgba(59, 130, 246, 0.4), 0 0 40px rgba(59, 130, 246, 0.2)',
                  }}
                >
                  <Icon
                    size={28}
                    strokeWidth={2.5}
                    color="#ffffff"
                  />
                </div>
                <span
                  className="text-xs font-semibold mt-1"
                  style={{
                    color: '#3b82f6',
                  }}
                >
                  {item.label}
                </span>
                
                {/* Continuous pulse animation */}
                <div
                  className="absolute w-16 h-16 rounded-full animate-ping opacity-20"
                  style={{
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    top: '0',
                    animationDuration: '2s',
                  }}
                />
              </button>
            );
          }

          // Regular buttons
          return (
            <button
              key={item.id}
              onClick={() => handleItemClick(item.id)}
              className="flex flex-col items-center justify-center flex-1 h-full transition-colors"
              style={{
                color: isActive
                  ? '#3b82f6' // Blue for active
                  : currentTheme === 'dark'
                  ? '#9ca3af' // Gray for inactive dark
                  : '#6b7280', // Gray for inactive light
              }}
            >
              <Icon
                size={24}
                strokeWidth={isActive ? 2.5 : 2}
                className="mb-1"
              />
              <span
                className="text-xs font-medium"
                style={{
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default MobileBottomNav;

