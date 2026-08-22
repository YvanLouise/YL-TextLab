import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4175',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], browserName: 'chromium', channel: 'chrome' },
    },
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        channel: 'chrome',
      },
    },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1',
    port: 4175,
    reuseExistingServer: true,
  },
})
