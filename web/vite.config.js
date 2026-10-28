import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 网站路径：GitHub Pages 是 /SyCare/（默认）；Cloudflare Pages 用根路径，构建时设 BASE_PATH=/
export default defineConfig({
  base: process.env.BASE_PATH || '/SyCare/',
  plugins: [react()],
})
