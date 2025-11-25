import type { CapacitorConfig } from '@capacitor/cli';

// Determine if we're in development mode
const isDev = process.env.NODE_ENV === 'development' || process.env.CAPACITOR_DEV === 'true';

const config: CapacitorConfig = {
  appId: 'com.flipflow.app',
  appName: 'Flip Flow',
  webDir: 'out', // Next.js output directory
  
  // Server configuration for live reload and updates
  server: isDev ? {
    // Development: Point to local dev server for live reload
    // Use your Mac's IP address so simulator can connect
    url: process.env.CAPACITOR_SERVER_URL || 'http://192.168.12.40:3000',
    cleartext: true, // Allow HTTP in development
    androidScheme: 'http'
  } : undefined,
  
  // Native plugin configuration
  plugins: {
    BarcodeScanning: {
      lensFacing: 'back'
    },
    // Add more plugin configs as needed
  },
  
  // iOS specific configuration
  ios: {
    contentInset: 'automatic',
    // Handle safe area for notched devices
    backgroundColor: '#111827', // Dark background to prevent white flash
    overrideUserInterfaceStyle: 'dark', // Force dark mode
  },
  
  // Android specific configuration  
  android: {
    allowMixedContent: isDev, // Allow HTTP in development
  }
};

export default config;
