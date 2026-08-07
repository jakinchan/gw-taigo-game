import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

/**
 * 管理画面は PC 専用なので、商城（Taro）とはビルドを完全に分ける。
 * 共有するのは @hfs/shared のドメイン型だけ。
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@hfs/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  server: {
    // scripts/dev.js が空きポートを選んで渡してくる
    port: Number(process.env.ADMIN_PORT) || 5200,
    strictPort: false,
    proxy: {
      /**
       * API へはプロキシ経由で繋ぐ。
       * こうすると管理画面から見て同一オリジンになり、CORS の設定と
       * ポートのズレでハマる余地が無くなる。
       */
      '/api': {
        target: process.env.API_ORIGIN || 'http://127.0.0.1:3100',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
