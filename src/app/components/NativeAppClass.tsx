'use client';

import { useEffect } from 'react';
import { isMobilePlatform } from '@/lib/utils/platformDetection';

/**
 * Adds a class to <html> (and <body>) when running inside a native Capacitor shell.
 * We use this to scope "scroll lock" CSS to native only, so web can scroll normally.
 */
export default function NativeAppClass() {
  useEffect(() => {
    try {
      const isNative = isMobilePlatform();
      const root = document.documentElement;
      const body = document.body;

      if (isNative) {
        root.classList.add('native-app');
        body.classList.add('native-app');
      } else {
        root.classList.remove('native-app');
        body.classList.remove('native-app');
      }
    } catch {
      // If Capacitor isn't available for some reason, default to web behavior (scroll enabled).
      document.documentElement.classList.remove('native-app');
      document.body.classList.remove('native-app');
    }
  }, []);

  return null;
}


