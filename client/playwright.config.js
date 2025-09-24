/**
 * Playwright Configuration for Browser-based Engine Testing
 */

module.exports = {
  // Test directory
  testDir: './tests/browser',

  // Test timeout (generous for engine performance tests)
  timeout: 6 * 60 * 1000, // 6 minutes

  // Expect timeout for assertions
  expect: {
    timeout: 30000 // 30 seconds
  },

  // Test execution settings
  fullyParallel: false, // Run tests sequentially to avoid resource conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1, // Retry failed tests in CI
  workers: 1, // Single worker to avoid WebAssembly conflicts

  // Reporter
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report' }]
  ],

  // Global test settings
  use: {
    // Browser settings
    headless: true,

    // Viewport
    viewport: { width: 1280, height: 720 },

    // Enable debugging features
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // Extended timeouts for engine operations
    actionTimeout: 60000, // 1 minute
    navigationTimeout: 60000 // 1 minute
  },

  // Browser projects
  projects: [
    {
      name: 'chromium',
      use: {
        ...require('@playwright/test').devices['Desktop Chrome'],
        // Enable WebAssembly features
        launchOptions: {
          args: [
            '--enable-features=SharedArrayBuffer',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--enable-experimental-web-platform-features'
          ]
        }
      }
    }
  ],

  // Development server (optional)
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
};