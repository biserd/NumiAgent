import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { publicPages } from './scripts/public-pages'
export default defineConfig({
  plugins: [vue(),publicPages()],
  css: { postcss: { plugins: [] } }
})
