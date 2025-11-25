'use client';

import React, { useState, useEffect } from 'react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import { isMobilePlatform } from '../lib/utils/platformDetection';
import MobileBottomNav from './MobileBottomNav';
import MobileMenuModal from './MobileMenuModal';
import MobileBarcodeScanner from './MobileBarcodeScanner';

interface MobileLayoutProps {
  children: React.ReactNode;
  activeItem: string;
  onItemClick: (item: string) => void;
}

const MobileLayout: React.FC<MobileLayoutProps> = ({
  children,
  activeItem,
  onItemClick,
}) => {
  const { currentTheme } = useTheme();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Check if we're on mobile platform
    setIsMobile(isMobilePlatform());
  }, []);

  // Don't render mobile layout on web
  if (!isMobile) {
    return <>{children}</>;
  }

  return (
    <div
      className="flex flex-col h-screen"
      style={{
        backgroundColor: currentTheme === 'dark' ? '#111827' : '#f9fafb',
      }}
    >
      {/* Main Content Area */}
      <div
        className="flex-1 overflow-y-auto"
        style={{
          paddingTop: 'env(safe-area-inset-top)', // Handle iPhone notch at top
          paddingBottom: '4rem', // Space for bottom nav
        }}
      >
        {children}
      </div>

      {/* Bottom Navigation */}
      <MobileBottomNav
        activeItem={activeItem}
        onItemClick={onItemClick}
        onMenuClick={() => setMenuOpen(true)}
        onScanClick={() => setScannerOpen(true)}
      />

      {/* Full Menu Modal */}
      <MobileMenuModal
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        activeItem={activeItem}
        onItemClick={onItemClick}
      />

      {/* Barcode Scanner Modal */}
      <MobileBarcodeScanner
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        userId={user?.uid}
      />
    </div>
  );
};

export default MobileLayout;

