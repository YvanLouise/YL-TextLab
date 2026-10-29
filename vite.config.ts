import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { pdfAssets } from './build/pdfAssets'

export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/YL-TextLab/' : '/',
  plugins: [react(), pdfAssets()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    include: ['src/**/*.test.{ts,tsx}'],
    // Each jsdom/FFmpeg worker is memory-heavy; bound concurrency on high-core hosts.
    maxWorkers: 4,
  },
}))
