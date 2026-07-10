// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  // sirve el proyecto estático mientras corren los tests
  webServer: {
    command: 'npx --yes http-server -p 8000 -c-1 --silent .',
    url: 'http://127.0.0.1:8000/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
