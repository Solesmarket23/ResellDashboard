'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader } from 'lucide-react';
import StockXListingCreator from '@/components/StockXListingCreator';
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
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <StockXListingCreator />
    </div>
  );
}