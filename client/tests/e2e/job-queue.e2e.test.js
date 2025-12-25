/**
 * =============================================================================
 * job-queue.e2e.test.js - E2E Tests for Job Queue Functionality (Phase 5)
 * =============================================================================
 *
 * PURPOSE:
 * These E2E tests verify the job queue functionality including:
 * - Refresh mid-analysis recovery
 * - Cancel mid-analysis
 * - Double-submit prevention
 * - Cross-tab synchronization
 *
 * TEST MODE:
 * These tests use ?testMode=true to enable MockStockfishEngine for fast tests.
 * Job queue is enabled by default (disable with ?noJobQueue).
 *
 * HOW TO RUN:
 * npm run test:e2e                    # Runs all E2E tests including these
 * npm run test:e2e -- --grep "job"    # Run only job queue tests
 *
 * KEY CONCEPTS:
 * - IndexedDB: Browser-native key-value store for job persistence
 * - BroadcastChannel: Enables cross-tab communication
 * - State Machine: Jobs transition through pending → running → completed/failed/cancelled
 */

import { test, expect } from '@playwright/test';

/**
 * Timeout constants for job queue tests
 */
const TIMEOUTS = {
    UI_UPDATE: 100,
    RECOVERY_DIALOG: 5000,
    JOB_CREATION: 2000,
    PROGRESS_UPDATE: 10000
};

/**
 * Test data fixtures
 */
const TEST_PGN = {
    SICILIAN: '1. e4 c5'
};

/**
 * Mock Lichess API responses for the starting position
 * Using the same mock pattern as form-orchestration.e2e.test.js
 */
function createMockResponse() {
    return {
        opening: { eco: 'B20', name: 'Sicilian Defense' },
        white: 1000000,
        black: 1000000,
        draws: 500000,
        moves: [
            { uci: 'g1f3', san: 'Nf3', white: 400000, black: 400000, draws: 200000 },
            { uci: 'd2d4', san: 'd4', white: 300000, black: 350000, draws: 150000 },
            { uci: 'b1c3', san: 'Nc3', white: 200000, black: 200000, draws: 100000 }
        ]
    };
}

/**
 * Setup API mocking for all tests
 */
async function setupMocks(page) {
    await page.route('**/lichess.org/api/explorer/lichess**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(createMockResponse())
        });
    });
}

/**
 * Fill the form with valid PGN input
 */
async function fillForm(page, pgn = TEST_PGN.SICILIAN) {
    const pgnInput = page.locator('#pgn-input-text, [data-testid="pgn-input"]');
    await pgnInput.fill(pgn);
    await page.waitForTimeout(TIMEOUTS.UI_UPDATE);
}

/**
 * Submit the form
 */
async function submitForm(page) {
    const submitButton = page.locator('button[type="submit"], [data-testid="generate-button"]');
    await submitButton.click();
}

test.describe('Job Queue - Refresh Recovery', () => {
    test.beforeEach(async ({ page }) => {
        await setupMocks(page);
    });

    test('shows recovery dialog after page refresh during analysis', async ({ page }) => {
        // Navigate with job queue and slow scenario enabled
        await page.goto('/?testMode=true&useJobQueue=true&testScenario=slow');

        // Fill form and start analysis
        await fillForm(page);
        await submitForm(page);

        // Wait for progress tracker to appear (job is running)
        const progressTracker = page.locator('.progress-tracker, [data-testid="progress-tracker"]');

        // Give time for job to be created and start running
        await page.waitForTimeout(TIMEOUTS.JOB_CREATION);

        // Refresh the page mid-analysis
        await page.reload();

        // Wait for page to load and check for recovery dialog
        await page.waitForLoadState('networkidle');

        // Recovery dialog should appear
        const recoveryDialog = page.locator('[data-testid="recovery-dialog"]');
        await expect(recoveryDialog).toBeVisible({ timeout: TIMEOUTS.RECOVERY_DIALOG });

        // Dialog should have discard button
        const discardButton = page.locator('[data-testid="recovery-discard"]');
        await expect(discardButton).toBeVisible();
    });

    test('can discard interrupted job and start fresh', async ({ page }) => {
        // Navigate with job queue enabled
        await page.goto('/?testMode=true&useJobQueue=true&testScenario=slow');

        // Fill and submit
        await fillForm(page);
        await submitForm(page);

        // Wait for job to start
        await page.waitForTimeout(TIMEOUTS.JOB_CREATION);

        // Refresh
        await page.reload();
        await page.waitForLoadState('networkidle');

        // Wait for recovery dialog
        const recoveryDialog = page.locator('[data-testid="recovery-dialog"]');
        await expect(recoveryDialog).toBeVisible({ timeout: TIMEOUTS.RECOVERY_DIALOG });

        // Click discard
        const discardButton = page.locator('[data-testid="recovery-discard"]');
        await discardButton.click();

        // Dialog should close
        await expect(recoveryDialog).not.toBeVisible({ timeout: TIMEOUTS.UI_UPDATE * 5 });

        // Form should be available again
        const submitButton = page.locator('button[type="submit"], [data-testid="generate-button"]');
        await expect(submitButton).toBeEnabled();
    });
});

test.describe('Job Queue - Cancel Functionality', () => {
    test.beforeEach(async ({ page }) => {
        await setupMocks(page);
    });

    test('can cancel running analysis', async ({ page }) => {
        // Navigate with job queue and slow scenario
        await page.goto('/?testMode=true&useJobQueue=true&testScenario=slow');

        // Setup: expose cancel function to window for testing
        await page.evaluate(() => {
            // FormController's cancelCurrentJob should be accessible
            window.testCancelJob = async () => {
                const controller = window.formController;
                if (controller && controller.cancelCurrentJob) {
                    await controller.cancelCurrentJob();
                    return true;
                }
                return false;
            };
        });

        // Fill and submit
        await fillForm(page);
        await submitForm(page);

        // Wait for job to start running
        await page.waitForTimeout(TIMEOUTS.JOB_CREATION);

        // Cancel the job via exposed function
        const cancelled = await page.evaluate(() => window.testCancelJob());

        // Job should be cancelled successfully
        // UI should be restored (form visible, progress hidden)
        const submitButton = page.locator('button[type="submit"], [data-testid="generate-button"]');
        await expect(submitButton).toBeEnabled({ timeout: TIMEOUTS.PROGRESS_UPDATE });
    });
});

test.describe('Job Queue - State Persistence', () => {
    test.beforeEach(async ({ page }) => {
        await setupMocks(page);
    });

    test('job state persists in IndexedDB', async ({ page }) => {
        // Navigate with job queue enabled
        await page.goto('/?testMode=true&useJobQueue=true');

        // Fill and submit
        await fillForm(page);
        await submitForm(page);

        // Wait for job creation
        await page.waitForTimeout(TIMEOUTS.JOB_CREATION);

        // Check IndexedDB for job record
        const jobCount = await page.evaluate(async () => {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open('bookbuilder', 1);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const db = request.result;
                    const tx = db.transaction('jobs', 'readonly');
                    const store = tx.objectStore('jobs');
                    const countRequest = store.count();
                    countRequest.onsuccess = () => resolve(countRequest.result);
                    countRequest.onerror = () => reject(countRequest.error);
                };
            });
        });

        // Should have at least one job record
        expect(jobCount).toBeGreaterThanOrEqual(1);
    });

    test('creating new job cancels existing running job', async ({ page }) => {
        // Navigate with job queue and slow scenario
        await page.goto('/?testMode=true&useJobQueue=true&testScenario=slow');

        // Start first analysis
        await fillForm(page, '1. e4 e5');
        await submitForm(page);

        // Wait for first job to start
        await page.waitForTimeout(TIMEOUTS.JOB_CREATION);

        // Get first job ID from IndexedDB
        const firstJobId = await page.evaluate(async () => {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open('bookbuilder', 1);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const db = request.result;
                    const tx = db.transaction('jobs', 'readonly');
                    const store = tx.objectStore('jobs');
                    const allRequest = store.getAll();
                    allRequest.onsuccess = () => {
                        const jobs = allRequest.result;
                        const runningJob = jobs.find(j => j.status === 'running');
                        resolve(runningJob?.id || null);
                    };
                    allRequest.onerror = () => reject(allRequest.error);
                };
            });
        });

        expect(firstJobId).toBeTruthy();

        // Navigate away and back to reset (simulating new submission)
        await page.goto('/?testMode=true&useJobQueue=true');
        await setupMocks(page);

        // Handle any recovery dialog that appears
        const recoveryDialog = page.locator('[data-testid="recovery-dialog"]');
        if (await recoveryDialog.isVisible({ timeout: 1000 }).catch(() => false)) {
            const discardButton = page.locator('[data-testid="recovery-discard"]');
            await discardButton.click();
            await expect(recoveryDialog).not.toBeVisible();
        }

        // Start second analysis
        await fillForm(page, '1. d4 d5');
        await submitForm(page);

        await page.waitForTimeout(TIMEOUTS.JOB_CREATION);

        // Check that first job is now cancelled
        const firstJobStatus = await page.evaluate(async (jobId) => {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open('bookbuilder', 1);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    const db = request.result;
                    const tx = db.transaction('jobs', 'readonly');
                    const store = tx.objectStore('jobs');
                    const getRequest = store.get(jobId);
                    getRequest.onsuccess = () => resolve(getRequest.result?.status);
                    getRequest.onerror = () => reject(getRequest.error);
                };
            });
        }, firstJobId);

        expect(firstJobStatus).toBe('cancelled');
    });
});

test.describe('Job Queue - Cross-Tab Sync', () => {
    test('BroadcastChannel syncs job state across tabs', async ({ browser }) => {
        // Create a browser context (shared storage between pages)
        const context = await browser.newContext();
        const page1 = await context.newPage();
        const page2 = await context.newPage();

        // Setup mocks for both pages
        await setupMocks(page1);
        await setupMocks(page2);

        // Navigate both pages with job queue enabled
        await page1.goto('/?testMode=true&useJobQueue=true');
        await page2.goto('/?testMode=true&useJobQueue=true');

        // Setup event listener on page2 to capture broadcast messages
        await page2.evaluate(() => {
            window.receivedMessages = [];
            const channel = new BroadcastChannel('bookbuilder-jobs');
            channel.onmessage = (event) => {
                window.receivedMessages.push(event.data);
            };
        });

        // Start job on page1
        await fillForm(page1);
        await submitForm(page1);

        // Wait for job creation and broadcast
        await page1.waitForTimeout(TIMEOUTS.JOB_CREATION);

        // Check if page2 received the broadcast message
        const receivedMessages = await page2.evaluate(() => window.receivedMessages);

        // Should have received at least one message (JOB_CREATED or JOB_RUNNING)
        expect(receivedMessages.length).toBeGreaterThanOrEqual(1);
        expect(receivedMessages.some(m => m.type === 'JOB_CREATED' || m.type === 'JOB_RUNNING')).toBe(true);

        await context.close();
    });
});

test.describe('Job Queue - Feature Flag', () => {
    test('job queue is enabled by default', async ({ page }) => {
        await setupMocks(page);

        // Navigate without any job queue parameter (default behavior)
        await page.goto('/?testMode=true');

        // Wait for FormController to initialize
        await page.waitForTimeout(TIMEOUTS.UI_UPDATE * 5);

        // Check that JobManager is initialized by default
        const hasJobManager = await page.evaluate(() => {
            const controller = window.formController;
            return controller && controller.jobManager !== null;
        });

        // JobManager should be initialized by default
        expect(hasJobManager).toBe(true);
    });

    test('job queue is disabled with noJobQueue parameter', async ({ page }) => {
        await setupMocks(page);

        // Navigate WITH noJobQueue to disable
        await page.goto('/?testMode=true&noJobQueue=true');

        // Check that JobManager is not initialized
        const hasJobManager = await page.evaluate(() => {
            const controller = window.formController;
            return controller && controller.jobManager !== null;
        });

        // JobManager should be null when explicitly disabled
        expect(hasJobManager).toBeFalsy();
    });
});
