/**
 * Platform Detection Utilities
 * Detect if the app is running on mobile (Capacitor) or web
 */

import { Capacitor } from '@capacitor/core';

/**
 * Check if running on a native mobile platform (iOS or Android)
 */
export const isMobilePlatform = (): boolean => {
  return Capacitor.isNativePlatform();
};

/**
 * Check if running on iOS specifically
 */
export const isIOS = (): boolean => {
  return Capacitor.getPlatform() === 'ios';
};

/**
 * Check if running on Android specifically
 */
export const isAndroid = (): boolean => {
  return Capacitor.getPlatform() === 'android';
};

/**
 * Check if running on web
 */
export const isWeb = (): boolean => {
  return Capacitor.getPlatform() === 'web';
};

/**
 * Get the current platform name
 */
export const getPlatform = (): string => {
  return Capacitor.getPlatform();
};

/**
 * Check if the screen is mobile-sized (for responsive web)
 */
export const isMobileScreen = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768;
};

/**
 * Check if we should use mobile layout
 * (either native mobile app OR mobile-sized web browser)
 */
export const shouldUseMobileLayout = (): boolean => {
  return isMobilePlatform() || isMobileScreen();
};






