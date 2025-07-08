'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
      router.push('/landing');
    }, 1000);

    return () => clearTimeout(timer);
  }, [router]);

  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px',
        fontFamily: 'system-ui'
      }}>
        <div>
          <div style={{ marginBottom: '20px', textAlign: 'center' }}>
            Loading Flip Flow...
          </div>
          <div style={{ 
            width: '50px', 
            height: '50px', 
            border: '3px solid #f3f3f3',
            borderTop: '3px solid #0070f3',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto'
          }}></div>
        </div>
        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return null;
}
