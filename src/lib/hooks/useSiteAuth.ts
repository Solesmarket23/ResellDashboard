'use client';

import { useState, useEffect } from 'react';

interface SiteUser {
  uid: string;
  email: string;
  displayName?: string;
}

export function useSiteAuth() {
  const [user, setUser] = useState<SiteUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is authenticated via site password
    const checkAuth = () => {
      // First check cookies
      const getCookie = (name: string) => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop()?.split(';').shift();
        return null;
      };

      const siteUserId = getCookie('site-user-id') || localStorage.getItem('siteUserId');
      const siteUserEmail = localStorage.getItem('siteUserEmail') || 'user@solesmarket.com';

      if (siteUserId) {
        setUser({
          uid: siteUserId,
          email: siteUserEmail,
          displayName: 'SolesMarket User'
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    };

    checkAuth();

    // Listen for storage events (in case auth changes in another tab)
    const handleStorageChange = () => {
      checkAuth();
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return { user, loading };
}