/**
 * =============================================================================
 * stockfish-browser.test.js - Browser tests for StockfishEngine using Playwright
 * =============================================================================
 *
 * PURPOSE:
 * These tests run the StockfishEngine in a real browser environment where
 * Web Workers and WebAssembly are fully supported. This is necessary because
 * Stockfish uses a Web Worker with WASM, which Jest's jsdom doesn't support.
 *
 * HOW IT WORKS:
 * 1. Starts a local HTTP server to serve the client files
 * 2. Launches a real browser using Playwright
 * 3. Navigates to the test page which runs StockfishEngine tests
 * 4. Collects and reports the test results
 *
 * RUN WITH:
 * npm run test:performance:browser
 *
 * DEPENDENCIES:
 * - playwright (installed as dev dependency)
 * - http-server (for serving files locally)
 * =============================================================================
 */

import { test, expect } from '@playwright/test';

/**
 * Test suite for StockfishEngine browser tests
 * These tests verify that the engine works correctly in a real browser
 */
test.describe('StockfishEngine Browser Tests', () => {
    // Increase timeout for engine operations (WASM loading + analysis)
    test.setTimeout(60000);

    /**
     * Test: Engine initialization
     * Verifies that Stockfish WASM loads and initializes correctly
     */
    test('should initialize engine successfully', async ({ page }) => {
        // Navigate to the test page
        await page.goto('/browser-tests.html');

        // Wait for tests to complete (max 45 seconds for WASM load + tests)
        await page.waitForFunction(() => window.testsComplete === true, {
            timeout: 45000
        });

        // Get the test results from the page
        const results = await page.evaluate(() => window.testResults);

        // Find the initialization test result
        const initTest = results.tests.find(t => t.name === 'Engine initialization');
        expect(initTest).toBeDefined();
        expect(initTest.passed).toBe(true);
    });

    /**
     * Test: Best move calculation
     * Verifies the engine can calculate best moves correctly
     */
    test('should calculate best moves', async ({ page }) => {
        await page.goto('/browser-tests.html');

        await page.waitForFunction(() => window.testsComplete === true, {
            timeout: 45000
        });

        const results = await page.evaluate(() => window.testResults);
        const bestMoveTest = results.tests.find(t => t.name === 'Best move calculation');

        expect(bestMoveTest).toBeDefined();
        expect(bestMoveTest.passed).toBe(true);
        // Verify the move is in UCI format (e.g., 'e2e4')
        expect(bestMoveTest.value).toMatch(/^[a-h][1-8][a-h][1-8]/);
    });

    /**
     * Test: Position evaluation
     * Verifies the engine evaluates positions correctly in centipawns
     */
    test('should evaluate positions correctly', async ({ page }) => {
        await page.goto('/browser-tests.html');

        await page.waitForFunction(() => window.testsComplete === true, {
            timeout: 45000
        });

        const results = await page.evaluate(() => window.testResults);
        const evalTest = results.tests.find(t => t.name === 'Position evaluation');

        expect(evalTest).toBeDefined();
        expect(evalTest.passed).toBe(true);
        // Starting position should be roughly equal (within 100 centipawns)
        expect(Math.abs(evalTest.value)).toBeLessThan(100);
    });

    /**
     * Test: Move analysis
     * Verifies the engine can analyze move quality with centipawn loss
     */
    test('should analyze move quality', async ({ page }) => {
        await page.goto('/browser-tests.html');

        await page.waitForFunction(() => window.testsComplete === true, {
            timeout: 45000
        });

        const results = await page.evaluate(() => window.testResults);
        const analysisTest = results.tests.find(t => t.name === 'Move analysis');

        expect(analysisTest).toBeDefined();
        expect(analysisTest.passed).toBe(true);
        // Verify analysis has expected properties
        expect(analysisTest.value).toHaveProperty('evaluation');
        expect(analysisTest.value).toHaveProperty('moveLoss');
        expect(analysisTest.value).toHaveProperty('quality');
    });

    /**
     * Test: Mate detection
     * Verifies the engine correctly identifies mate positions
     */
    test('should detect mate scenarios', async ({ page }) => {
        await page.goto('/browser-tests.html');

        await page.waitForFunction(() => window.testsComplete === true, {
            timeout: 45000
        });

        const results = await page.evaluate(() => window.testResults);
        const mateTest = results.tests.find(t => t.name === 'Mate detection');

        expect(mateTest).toBeDefined();
        expect(mateTest.passed).toBe(true);
        // Mate should be detected (very high absolute evaluation)
        expect(Math.abs(mateTest.value)).toBeGreaterThan(9000);
    });

    /**
     * Test: Engine configuration
     * Verifies the engine respects configuration settings
     */
    test('should configure engine settings correctly', async ({ page }) => {
        await page.goto('/browser-tests.html');

        await page.waitForFunction(() => window.testsComplete === true, {
            timeout: 45000
        });

        const results = await page.evaluate(() => window.testResults);
        const configTest = results.tests.find(t => t.name === 'Engine configuration');

        expect(configTest).toBeDefined();
        expect(configTest.passed).toBe(true);
    });

    /**
     * Test: Evaluation consistency
     * Verifies the engine produces consistent evaluations
     */
    test('should produce consistent evaluations', async ({ page }) => {
        await page.goto('/browser-tests.html');

        await page.waitForFunction(() => window.testsComplete === true, {
            timeout: 45000
        });

        const results = await page.evaluate(() => window.testResults);
        const consistencyTest = results.tests.find(t => t.name === 'Evaluation consistency');

        expect(consistencyTest).toBeDefined();
        expect(consistencyTest.passed).toBe(true);
        // Evaluations should be within 5 centipawns of each other
        expect(consistencyTest.value).toBeLessThanOrEqual(5);
    });

    /**
     * Test: Full test summary
     * Verifies all browser tests pass
     */
    test('should pass all browser tests', async ({ page }) => {
        await page.goto('/browser-tests.html');

        await page.waitForFunction(() => window.testsComplete === true, {
            timeout: 45000
        });

        const results = await page.evaluate(() => window.testResults);

        // Log summary for visibility
        console.log(`Browser tests: ${results.passed} passed, ${results.failed} failed`);

        // All tests should pass
        expect(results.failed).toBe(0);
        expect(results.passed).toBeGreaterThan(0);
    });
});
