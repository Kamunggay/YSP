import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env['YSP_BROWSER_URL'] ?? 'http://127.0.0.1:8080',
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
});
