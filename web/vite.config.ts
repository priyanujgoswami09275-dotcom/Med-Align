import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Shared pure modules live in the repo-root src/ (untouched plain JS).
      '@shared': fileURLToPath(new URL('../src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      // Dev only: forward API calls to the zero-dependency Node server on 3000.
      '/api': 'http://localhost:3000',
    },
    fs: {
      // Allow serving the shared modules from one level up (../src).
      allow: ['..'],
    },
  },
})
