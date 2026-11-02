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
          // 不要再把 drei / three-stdlib / maath 另外分一包：U6 之後 @react-three/postprocessing（在 vendor）也用到它們，
          // 兩包互相 import 會變成循環載入，drei 那包啟動時拿到的 React 是 undefined（forwardRef 錯誤，整個畫面白掉）。
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
