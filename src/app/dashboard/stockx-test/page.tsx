'use client';

import StockXTest from '../../../components/StockXTest';
import { useTheme } from '../../../lib/contexts/ThemeContext';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export default function StockXTestPage() {
  const { currentTheme } = useTheme();

  return (
    <div className={`min-h-screen ${currentTheme.colors.background} p-6`}>
      <StockXTest />
    </div>
  );
} 