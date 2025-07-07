import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.flipflow.app',
  appName: 'Flip Flow',
  webDir: 'public',
  server: {
    url: 'https://00fc-98-124-107-39.ngrok-free.app',
    cleartext: true
  },
  plugins: {
    BarcodeScanning: {
      lensFacing: 'back'
    }
  }
};

export default config;
