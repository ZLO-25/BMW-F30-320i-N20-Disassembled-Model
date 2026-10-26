import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' 讓打包後的檔案能放在 GitHub Pages 的子路徑下
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    // 分包：函式庫（很少變）和我們的程式（常改）分開，改版後瀏覽器只要重抓小的那包
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          // 只把 three 本體分出來；React 和 R3F 互相依賴，硬拆會讓初始化順序出錯
          if (/node_modules\/three\//.test(id)) return 'three'
          return 'vendor'
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
} as any)
