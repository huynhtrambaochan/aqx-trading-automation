import fs from 'node:fs';

import { defineConfig, devices } from '@playwright/test';

import { resolveBaseUrl } from './utils/env';

const storagePath = process.env.STORAGE_STATE?.trim();
if (storagePath && !fs.existsSync(storagePath)) {
  throw new Error(`STORAGE_STATE is set to "${storagePath}", and that file does not exist.`);
}

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'test-results/junit-results.xml' }],
  ],
  outputDir: 'test-results',
  use: {
    // Navigation uses this absolute URL. Do not call page.goto('/'): a leading slash drops the path.
    baseURL: resolveBaseUrl(),
    ...(storagePath ? { storageState: storagePath } : {}),
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    locale: 'en-US',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
