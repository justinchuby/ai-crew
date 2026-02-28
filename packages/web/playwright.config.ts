import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: process.env.CI
        ? 'AUTH=none node packages/server/dist/index.js'
        : 'npm run dev --workspace=packages/server',
      port: 3001,
      cwd: '../..',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { AUTH: 'none' },
    },
    {
      command: 'npm run dev --workspace=packages/web',
      port: 5173,
      cwd: '../..',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
