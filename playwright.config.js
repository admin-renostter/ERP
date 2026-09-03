const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests-e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'retain-on-failure',
    screenshot: 'on',
    viewport: { width: 1280, height: 720 },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: [
    {
      command: 'npm run start:frontend',
      port: 8080,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run start:backend',
      port: 3000,
      reuseExistingServer: !process.env.CI,
    }
  ],
});
