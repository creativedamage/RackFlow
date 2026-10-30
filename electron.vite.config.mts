import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const alias = { '@core': resolve(root, 'src/core') }

export default defineConfig({
  main: { resolve: { alias } },
  preload: { resolve: { alias } },
  renderer: {
    resolve: { alias },
    plugins: [react()],
  },
})
