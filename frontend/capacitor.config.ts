import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fuelrecords.app',
  appName: 'Fuel Records',
  webDir: 'dist',
  server: {
    // 联调时加载电脑上的 Vite 开发服务器，改代码即时生效
    url: 'http://172.25.156.68:5173',
    cleartext: true,  // 允许 HTTP（开发环境）
  },
};

export default config;
