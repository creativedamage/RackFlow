// RackFlow Viewer: the web app people you share projects with open in their browser.
// Build: npm run build:viewer  →  out/viewer (static files for Vercel / Netlify / any host).
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const root = fileURLToPath(new URL('.', import.meta.url))
export default defineConfig({
  root,
  base: './',
  plugins: [react()],
  resolve: { alias: { '@core': resolve(root, '../src/core') } },
  build: { outDir: resolve(root, '../out/viewer'), emptyOutDir: true },
})
