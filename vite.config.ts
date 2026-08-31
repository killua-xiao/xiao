/**
 * @fileoverview vite.config.ts
 * 
 * Vite 构建配置。
 * 包含 React 插件配置、开发服务器端口定义以及环境变量的注入规则。
 */

import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});
