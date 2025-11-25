'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader } from 'lucide-react';
import { useSiteAuth } from '@/lib/hooks/useSiteAuth';

const AutoRepricingSettings = dynamic(
  () => import('@/components/AutoRepricingSettings'),
  { ssr: false }
);

export default function AutoRepricingSettingsPage() {
  const router = useRouter();
  const { isAuthenticated } = useSiteAuth();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
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
    <div className="min-h-screen bg-gray-900 py-8">
      <AutoRepricingSettings />
    </div>
  );
}

