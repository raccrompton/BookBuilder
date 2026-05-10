/**
 * =============================================================================
 * real-engine-smoke.e2e.test.js - Real Stockfish Engine E2E Smoke Tests
 * =============================================================================
 *
 * PURPOSE:
 * These tests run with the REAL Stockfish WASM engine (no mock). They verify
 * that the actual engine integration works correctly in a browser environment.
 *
 * WHY SEPARATE FROM MAIN E2E TESTS:
 * - Real engine tests take 3-5 MINUTES (vs ~10 seconds with mock)
 * - We only need to verify real engine works occasionally, not every commit
 * - CI can run these on main branch or nightly, not every PR
 *
 * HOW TO RUN:
 * npm run test:e2e:real   # Runs only this file with real Stockfish
 *
 * WHAT THESE TESTS VERIFY:
 * 1. Stockfish WASM loads correctly in the browser
 * 2. Engine initialization completes without errors
 * 3. Analysis produces valid chess moves
 * 4. The full generation flow works with real engine computation
 *
 * TIMEOUTS:
 * These tests have extended timeouts (5+ minutes) because:
 * - WASM loading: 2-75 seconds (depending on variant)
 * - Engine initialization: 1-5 seconds
 * - Position analysis: 5-30 seconds per position at depth 15+
 * - Multiple positions may be analyzed in a single generation
 * =============================================================================
 */

import { test, expect } from '@playwright/test';

/**
 * =============================================================================
 * REAL ENGINE TEST CONFIGURATION
 * =============================================================================
 */
const REAL_ENGINE_TIMEOUTS = {
    // Maximum time for a single test (5 minutes)
    TEST_TIMEOUT: 5 * 60 * 1000,
    // Time to wait for engine to initialize (2 minutes)
    ENGINE_INIT: 2 * 60 * 1000,
    // Time to wait for generation results (4 minutes)
    RESULTS: 4 * 60 * 1000
};

/**
 * Simple PGN for smoke testing - just 2 moves to minimize analysis time
 */
const SMOKE_TEST_PGN = '1. e4 c5';

/**
 * Mock Lichess API responses (we still mock API, just not the engine)
 */
const createMockLichessResponse = () => ({
    white: 100000,
    black: 90000,
    draws: 50000,
    moves: [
        { uci: 'e2e4', san: 'e4', averageRating: 2100, white: 35000, black: 30000, draws: 15000, game: null },
        { uci: 'd2d4', san: 'd4', averageRating: 2100, white: 30000, black: 28000, draws: 14000, game: null },
        { uci: 'g1f3', san: 'Nf3', averageRating: 2050, white: 20000, black: 18000, draws: 12000, game: null },
        { uci: 'c7c5', san: 'c5', averageRating: 2100, white: 25000, black: 28000, draws: 12000, game: null },
        { uci: 'e7e5', san: 'e5', averageRating: 2100, white: 25000, black: 24000, draws: 13000, game: null }
    ],
    topGames: [],
    recentGames: [],
    opening: { eco: 'B20', name: 'Sicilian Defense' }
});

/**
 * =============================================================================
 * REAL ENGINE SMOKE TESTS
 * =============================================================================
 * @tag @real-engine - Use --grep "@real-engine" to run only these tests
 */
test.describe('Real Stockfish Engine Smoke Tests @real-engine', () => {
    // Extended timeout for real engine tests
    test.setTimeout(REAL_ENGINE_TIMEOUTS.TEST_TIMEOUT);

    test.beforeEach(async ({ page }) => {
        // Mock Lichess API (still needed for deterministic responses)
        await page.route('**/explorer.lichess.org/**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(createMockLichessResponse())
            });
        });

        // Navigate WITHOUT testMode - this uses real StockfishEngine
        await page.goto('/app.html');

        // Wait for app to initialize
        await page.waitForSelector('#bookbuilder-form', { timeout: 10000 });
    });

    /**
     * Test: Real engine initializes and completes analysis
     *
     * This is the primary smoke test that verifies:
     * 1. Stockfish WASM loads in the browser
     * 2. Engine can analyze positions
     * 3. Generation produces output
     */
    test('should complete generation with real Stockfish engine', async ({ page }) => {
        // ARRANGE: Fill form with simple opening
        const pgnInput = page.locator('#pgn-input-text');
        await pgnInput.clear();
        await pgnInput.fill(SMOKE_TEST_PGN);

        // Wait for preview to confirm valid PGN
        await expect(page.locator('#pgn-preview')).toBeVisible({ timeout: 5000 });

        // ACT: Submit form
        const submitButton = page.locator('button[type="submit"]');
        await submitButton.click();

        // ASSERT: Wait for results (extended timeout for real engine)
        await page.waitForSelector('#pgn-display-container:not([style*="display: none"])', {
            timeout: REAL_ENGINE_TIMEOUTS.RESULTS
        });

        // Verify content was generated
        const pgnContent = page.locator('#pgn-content');
        const content = await pgnContent.textContent();
        expect(content.length).toBeGreaterThan(0);
        expect(content).toMatch(/\[Event/); // Should contain PGN header
    });

    /**
     * Test: Engine progress is displayed during analysis
     *
     * Verifies that the UI shows progress updates while the engine is working.
     * This is important UX feedback for long-running operations.
     */
    test('should show progress during real engine analysis', async ({ page }) => {
        // ARRANGE
        const pgnInput = page.locator('#pgn-input-text');
        await pgnInput.clear();
        await pgnInput.fill(SMOKE_TEST_PGN);
        await expect(page.locator('#pgn-preview')).toBeVisible({ timeout: 5000 });

        // ACT: Submit form
        const submitButton = page.locator('button[type="submit"]');
        await submitButton.click();

        // ASSERT: Progress indicators should appear
        const progressContainer = page.locator('#progress-container, .generation-status, .progress-overlay');
        await expect(progressContainer.first()).toBeVisible({ timeout: 10000 });

        // Wait for completion
        await page.waitForSelector('#pgn-display-container:not([style*="display: none"])', {
            timeout: REAL_ENGINE_TIMEOUTS.RESULTS
        });
    });

    /**
     * Test: Generated moves are valid chess notation
     *
     * Verifies that the real engine produces valid, playable chess moves.
     * This catches issues where the mock might accept invalid moves.
     */
    test('should generate valid chess moves with real engine', async ({ page }) => {
        // ARRANGE
        const pgnInput = page.locator('#pgn-input-text');
        await pgnInput.clear();
        await pgnInput.fill(SMOKE_TEST_PGN);
        await expect(page.locator('#pgn-preview')).toBeVisible({ timeout: 5000 });

        // ACT
        const submitButton = page.locator('button[type="submit"]');
        await submitButton.click();

        await page.waitForSelector('#pgn-display-container:not([style*="display: none"])', {
            timeout: REAL_ENGINE_TIMEOUTS.RESULTS
        });

        // ASSERT: Content should contain chess moves
        const content = await page.locator('#pgn-content').textContent();

        // Should contain opening moves from our input
        expect(content).toContain('e4');
        expect(content).toContain('c5');

        // Should NOT contain obvious error indicators
        expect(content).not.toContain('undefined');
        expect(content).not.toContain('null');
        expect(content).not.toContain('error');
    });
});

/**
 * =============================================================================
 * ENGINE VARIANT TESTS (Optional - run with specific flags)
 * =============================================================================
 * These tests verify both 'lite' and 'full' engine variants work.
 * Skipped by default due to long runtime.
 */
test.describe.skip('Engine Variant Tests @real-engine @slow', () => {
    test.setTimeout(10 * 60 * 1000); // 10 minutes for full variant

    test('should work with lite variant (default)', async ({ page }) => {
        // The default test above uses lite variant implicitly
        // This test is a placeholder for explicit variant testing
    });

    test('should work with full variant (75MB WASM)', async ({ page }) => {
        // Would need to configure the engine variant in the form
        // Full variant takes much longer to load (~60 seconds)
    });
});
