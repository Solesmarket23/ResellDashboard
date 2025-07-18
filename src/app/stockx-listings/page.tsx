'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package } from 'lucide-react';
import StockXListingCreator from '@/components/StockXListingCreator';
import LoadingOverlay from '@/components/LoadingOverlay';
import { useSiteAuth } from '@/lib/hooks/useSiteAuth';

export default function StockXListingsPage() {
  const router = useRouter();
  const { isAuthenticated } = useSiteAuth();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is authenticated
    if (!isAuthenticated) {
      router.push('/password-protect');
      return;
    }
    setIsLoading(false);
  }, [isAuthenticated, router]);

  if (isLoading) {
    return <LoadingOverlay />;
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <StockXListingCreator />
    </div>
  );
}