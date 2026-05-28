import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sikapos.portal',
  appName: 'Sika POS',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    Keyboard: {
      resize: 'none',
      scrollEnabled: true
    }
  }
};

export default config;
