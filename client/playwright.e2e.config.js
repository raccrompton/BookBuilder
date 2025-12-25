/**
 * =============================================================================
 * Playwright Configuration for E2E Form Orchestration Tests
 * =============================================================================
 *
 * PURPOSE:
 * This config runs E2E tests for FormController orchestration - testing the
 * complete user flow from form input through generation to results display.
 *
 * DIFFERS FROM playwright.config.js:
 * - Tests are in ./tests/e2e (not ./tests/browser)
 * - Longer timeouts for full generation cycles
 * - Uses app.html as the main entry point
 * - Focused on UI interaction testing vs engine testing
 *
 * RUN WITH:
 *   npx playwright test --config=playwright.e2e.config.js
 *   npm run test:e2e
 *   npm run test:e2e:headed (with browser visible)
 *   npm run test:e2e:debug (step-by-step debugging)
 * =============================================================================
 */

module.exports = {
    // E2E tests are in the e2e subdirectory
    testDir: './tests/e2e',

    // Test timeout - generous for full generation cycles
    // Generation involves: API calls + PGN processing + engine analysis (if enabled)
    timeout: 3 * 60 * 1000, // 3 minutes per test

    // Assertion timeout
    expect: {
        timeout: 30000 // 30 seconds for expect() assertions
    },

    // Test execution settings
    fullyParallel: false, // Sequential to avoid race conditions with shared resources
    forbidOnly: !!process.env.CI, // Fail CI if test.only() is left in code
    retries: process.env.CI ? 2 : 1, // Retry failed tests
    workers: 1, // Single worker for deterministic behavior

    // Reporters - list shows progress, html generates detailed report
    reporter: [
        ['list'],
        ['html', { outputFolder: 'playwright-report-e2e' }]
    ],

    // Global test settings
    use: {
        // Base URL for navigation (from webServer below)
        baseURL: 'http://localhost:8081',

        // Run headless in CI, can override with --headed flag
        headless: true,

        // Viewport matching common desktop resolution
        viewport: { width: 1280, height: 720 },

        // Debugging artifacts - capture on failure for debugging
        trace: 'on-first-retry', // Capture trace on retry
        screenshot: 'only-on-failure', // Screenshot on test failure
        video: 'retain-on-failure', // Video of failed tests

        // Timeouts for individual actions
        actionTimeout: 30000, // 30 seconds for clicks, fills, etc.
        navigationTimeout: 30000 // 30 seconds for page.goto()
    },

    // Browser projects - Chromium only for consistency
    projects: [
        {
            name: 'chromium',
            use: {
                ...require('@playwright/test').devices['Desktop Chrome'],
                // Enable features needed by the app
                launchOptions: {
                    args: [
                        // SharedArrayBuffer needed for Stockfish WASM
                        '--enable-features=SharedArrayBuffer',
                        // Disable web security for CORS (local dev)
                        '--disable-web-security',
                        // Disable some compositor features that can cause flakiness
                        '--disable-features=VizDisplayCompositor',
                        // Enable experimental features used by modern JS
                        '--enable-experimental-web-platform-features'
                    ]
                }
            }
        }
    ],

    // Web server configuration - serves the app for testing
    webServer: {
        // http-server serves static files from current directory
        // -p 8081: Port 8081
        // --cors: Enable CORS headers
        // -c-1: Disable caching (always serve fresh files)
        command: 'npx http-server . -p 8081 --cors -c-1',
        url: 'http://localhost:8081',
        // Reuse existing server in development (faster iteration)
        reuseExistingServer: !process.env.CI,
        // Timeout waiting for server to start
        timeout: 30000
    }
};
