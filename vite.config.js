import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://45.126.208.136:7000',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://45.126.208.136:7000',
        changeOrigin: true,
      }
    }
  }
})
