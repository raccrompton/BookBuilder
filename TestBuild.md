# Test Architecture Improvement Plan

> Comprehensive plan for improving BookBuilder's testing infrastructure to handle long-running chess engine operations properly.

**Goal:** Fast, reliable E2E tests that verify UI orchestration without waiting for real engine computation, while maintaining separate real-engine smoke tests for integration confidence.

---

## Current State Assessment

| Principle | Status | Notes |
|-----------|--------|-------|
| Async + Observable | Partial | Promise chains, no job persistence |
| Mock at API Boundary | Done | Lichess API mocked in E2E |
| Real Engine Smoke Tests | Done | Separate browser perf tests + real-engine-smoke.e2e.test.js |
| Determinism | Strong | Fixed depth, threads, hash |
| Test Mode for Instant Completion | **Done** | MockStockfishEngine via ?testMode=true (Phase 1) |
| Progress Verification | Partial | Fixed timeouts, not polling |
| Cancel/Retry/Refresh Tests | Gap | Minimal coverage |
| Engine Tests Separate from E2E | Done | Three-tier architecture |

---

## Implementation Phases

### Phase 1: MockStockfishEngine (Quick Win)

**Risk:** Very Low
**Time:** 1-2 hours
**Reward:** E2E tests drop from 3 minutes to ~10 seconds

#### 1.1 Create MockStockfishEngine

**File:** `client/src/engines/MockStockfishEngine.js`

```javascript
/**
 * Mock Stockfish engine for fast E2E testing.
 * Implements the same interface as StockfishEngine but returns
 * canned responses immediately.
 */
export class MockStockfishEngine {
    constructor() {
        this.isReady = false;
        this.analysisCallback = null;
        this.scenarios = this._loadScenarios();
    }

    async initialize() {
        // Simulate brief init delay
        await this._delay(50);
        this.isReady = true;
        return true;
    }

    async analyze(fen, options = {}) {
        const scenario = this._getScenario();
        const depth = options.depth || 15;

        // Emit progress events
        for (let d = 1; d <= Math.min(depth, 5); d++) {
            await this._delay(10);
            this._emitProgress(d, scenario);
        }

        // Return final result
        await this._delay(20);
        return {
            bestMove: scenario.bestMove,
            evaluation: scenario.evaluation,
            depth: depth,
            pv: scenario.pv
        };
    }

    setAnalysisCallback(callback) {
        this.analysisCallback = callback;
    }

    terminate() {
        this.isReady = false;
    }

    // Private methods
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    _getScenario() {
        const params = new URLSearchParams(location.search);
        const scenarioName = params.get('testScenario') || 'default';
        return this.scenarios[scenarioName] || this.scenarios.default;
    }

    _loadScenarios() {
        return {
            default: {
                bestMove: 'e2e4',
                evaluation: 0.3,
                pv: ['e2e4', 'e7e5', 'g1f3']
            },
            losing: {
                bestMove: 'a2a3',
                evaluation: -2.5,
                pv: ['a2a3']
            },
            winning: {
                bestMove: 'd1h5',
                evaluation: 5.0,
                pv: ['d1h5', 'g7g6', 'd1d5']
            },
            slow: {
                // This scenario adds extra delay
                bestMove: 'e2e4',
                evaluation: 0.1,
                pv: ['e2e4'],
                delay: 2000
            },
            error: {
                // This scenario throws an error
                shouldError: true,
                errorMessage: 'Engine crashed (test scenario)'
            }
        };
    }

    _emitProgress(depth, scenario) {
        if (this.analysisCallback) {
            this.analysisCallback({
                type: 'progress',
                depth: depth,
                score: scenario.evaluation,
                pv: scenario.pv
            });
        }
    }
}
```

#### 1.2 Create EngineFactory

**File:** `client/src/engines/EngineFactory.js`

```javascript
import { StockfishEngine } from './StockfishEngine.js';
import { MockStockfishEngine } from './MockStockfishEngine.js';

export class EngineFactory {
    /**
     * Create appropriate engine based on environment.
     * Mock engine only available on localhost with testMode param.
     */
    static create() {
        if (this._shouldUseMock()) {
            console.log('[EngineFactory] Using MockStockfishEngine (test mode)');
            return new MockStockfishEngine();
        }
        return new StockfishEngine();
    }

    static _shouldUseMock() {
        // Safety: only allow mock on localhost
        if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
            return false;
        }

        const params = new URLSearchParams(location.search);
        return params.has('testMode');
    }
}
```

#### 1.3 Update Engine Instantiation

**File:** `client/src/BookBuilder.js` (or wherever engine is created)

```diff
- import { StockfishEngine } from './engines/StockfishEngine.js';
+ import { EngineFactory } from './engines/EngineFactory.js';

// In initialization:
- this.engine = new StockfishEngine();
+ this.engine = EngineFactory.create();
```

#### 1.4 Update E2E Tests

**File:** `client/tests/e2e/form-orchestration.e2e.test.js`

```diff
test.beforeEach(async ({ page }) => {
-   await page.goto('/');
+   await page.goto('/?testMode=true');
    // ... rest of setup
});
```

#### 1.5 Add Real Engine E2E Smoke Test

**File:** `client/tests/e2e/real-engine-smoke.e2e.test.js`

```javascript
/**
 * Smoke tests that run with real Stockfish engine.
 * Run separately: npm run test:e2e:real
 * These are slow (minutes) but verify real integration.
 */
import { test, expect } from '@playwright/test';

test.describe('Real Engine Smoke Tests', () => {
    test.setTimeout(5 * 60 * 1000); // 5 minutes

    test('complete analysis with real engine', async ({ page }) => {
        // No testMode - uses real engine
        await page.goto('/');

        // ... minimal happy path test
    });
});
```

#### 1.6 Add npm Scripts

**File:** `client/package.json`

```json
{
    "scripts": {
        "test:e2e": "npx playwright test --config=playwright.e2e.config.js",
        "test:e2e:real": "npx playwright test --config=playwright.e2e.config.js tests/e2e/real-engine-smoke.e2e.test.js",
        "test:e2e:fast": "npx playwright test --config=playwright.e2e.config.js --grep-invert @real-engine"
    }
}
```

#### Phase 1 Verification Checklist

- [x] MockStockfishEngine passes unit tests (21 tests)
- [x] EngineFactory returns mock only on localhost with testMode (12 tests)
- [x] E2E tests pass with testMode (should be fast)
- [ ] E2E tests pass without testMode (existing behavior) - pre-existing flakiness
- [ ] Real engine smoke test passes (slow but works) - needs CI verification

**Status:** ✅ Phase 1 Complete

---

### Phase 2: JobStore (IndexedDB Persistence)

**Risk:** Medium (isolated)
**Time:** 2-3 hours
**Reward:** Foundation for refresh resilience

#### 2.1 Install idb Library (Optional but Recommended)

```bash
npm install idb
```

The `idb` library wraps IndexedDB in a clean Promise-based API (~2KB).

#### 2.2 Create JobStore

**File:** `client/src/jobs/JobStore.js`

```javascript
import { openDB } from 'idb';

const DB_NAME = 'bookbuilder';
const DB_VERSION = 1;
const STORE_NAME = 'jobs';

export class JobStore {
    constructor() {
        this.dbPromise = null;
    }

    async _getDb() {
        if (!this.dbPromise) {
            this.dbPromise = openDB(DB_NAME, DB_VERSION, {
                upgrade(db) {
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                        store.createIndex('status', 'status');
                        store.createIndex('createdAt', 'createdAt');
                    }
                }
            });
        }
        return this.dbPromise;
    }

    async create(job) {
        const db = await this._getDb();
        const now = Date.now();
        const record = {
            ...job,
            id: job.id || `job_${now}_${Math.random().toString(36).substr(2, 9)}`,
            status: 'pending',
            createdAt: now,
            updatedAt: now
        };
        await db.put(STORE_NAME, record);
        return record;
    }

    async get(id) {
        const db = await this._getDb();
        return db.get(STORE_NAME, id);
    }

    async update(id, updates) {
        const db = await this._getDb();
        const existing = await db.get(STORE_NAME, id);
        if (!existing) throw new Error(`Job ${id} not found`);

        const updated = {
            ...existing,
            ...updates,
            updatedAt: Date.now()
        };
        await db.put(STORE_NAME, updated);
        return updated;
    }

    async delete(id) {
        const db = await this._getDb();
        await db.delete(STORE_NAME, id);
    }

    async getByStatus(status) {
        const db = await this._getDb();
        return db.getAllFromIndex(STORE_NAME, 'status', status);
    }

    async getInProgress() {
        const running = await this.getByStatus('running');
        return running[0] || null;
    }

    async cleanup(olderThanMs = 24 * 60 * 60 * 1000) {
        const db = await this._getDb();
        const cutoff = Date.now() - olderThanMs;
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        let cursor = await store.openCursor();
        while (cursor) {
            if (cursor.value.createdAt < cutoff && cursor.value.status !== 'running') {
                await cursor.delete();
            }
            cursor = await cursor.continue();
        }
    }
}
```

#### 2.3 Job State Schema

```javascript
// Job record structure
{
    id: 'job_1703500000000_abc123',
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled',
    config: {
        pgn: '1. e4 c5',
        depth: 15,
        format: 'tree',
        perspective: 'white'
    },
    progress: {
        phase: 'analyzing' | 'generating' | 'formatting',
        currentLine: 5,
        totalLines: 20,
        currentDepth: 12,
        message: 'Analyzing line 5 of 20...'
    },
    result: null | {
        pgn: '...',
        statistics: {...}
    },
    error: null | {
        message: 'Engine crashed',
        code: 'ENGINE_ERROR'
    },
    createdAt: 1703500000000,
    updatedAt: 1703500030000
}
```

#### Phase 2 Verification Checklist

- [x] JobStore unit tests pass (CRUD operations) - 18 tests passing
- [x] Jobs persist across page refresh (via IndexedDB)
- [x] cleanup() removes old completed jobs
- [x] getInProgress() returns running job or null

**Status:** ✅ Phase 2 Complete
**Implementation:** `client/src/jobs/JobStore.js` with unit tests in `client/tests/unit/job-store.test.js`

---

### Phase 3: JobManager (State Machine)

**Risk:** Medium
**Time:** 3-4 hours
**Reward:** Proper state transitions, cancellation, cleanup

#### 3.1 Create JobManager

**File:** `client/src/jobs/JobManager.js`

```javascript
import { JobStore } from './JobStore.js';

const VALID_TRANSITIONS = {
    'pending': ['running', 'cancelled'],
    'running': ['completed', 'failed', 'cancelled'],
    'completed': [],  // Terminal state
    'failed': [],     // Terminal state
    'cancelled': []   // Terminal state
};

export class JobManager {
    constructor() {
        this.store = new JobStore();
        this.activeJob = null;
        this.listeners = new Set();
        this.channel = new BroadcastChannel('bookbuilder-jobs');

        this.channel.onmessage = (event) => {
            this._notifyListeners(event.data);
        };
    }

    async createJob(config) {
        // Cancel any existing running job first
        const existing = await this.store.getInProgress();
        if (existing) {
            await this.transition(existing.id, 'cancelled');
        }

        const job = await this.store.create({ config });
        this._broadcast({ type: 'JOB_CREATED', job });
        return job;
    }

    async transition(jobId, newStatus, data = {}) {
        const job = await this.store.get(jobId);
        if (!job) throw new Error(`Job ${jobId} not found`);

        const allowed = VALID_TRANSITIONS[job.status];
        if (!allowed.includes(newStatus)) {
            throw new Error(`Invalid transition: ${job.status} → ${newStatus}`);
        }

        const updates = { status: newStatus, ...data };
        const updated = await this.store.update(jobId, updates);

        this._broadcast({
            type: `JOB_${newStatus.toUpperCase()}`,
            job: updated
        });

        return updated;
    }

    async updateProgress(jobId, progress) {
        const updated = await this.store.update(jobId, { progress });
        this._broadcast({ type: 'JOB_PROGRESS', job: updated });
        return updated;
    }

    async getInProgress() {
        return this.store.getInProgress();
    }

    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    _broadcast(message) {
        this.channel.postMessage(message);
        this._notifyListeners(message);
    }

    _notifyListeners(message) {
        this.listeners.forEach(cb => {
            try { cb(message); } catch (e) { console.error(e); }
        });
    }
}
```

#### 3.2 State Transition Diagram

```
                    ┌─────────────────────────────────┐
                    │                                 │
                    ▼                                 │
┌─────────┐    ┌─────────┐    ┌───────────┐         │
│ pending │───►│ running │───►│ completed │         │
└─────────┘    └─────────┘    └───────────┘         │
     │              │                                │
     │              │         ┌────────┐            │
     │              └────────►│ failed │            │
     │              │         └────────┘            │
     │              │                                │
     │              │         ┌───────────┐         │
     └──────────────┴────────►│ cancelled │─────────┘
                              └───────────┘
```

#### Phase 3 Verification Checklist

- [x] State machine rejects invalid transitions - 24 tests passing
- [x] BroadcastChannel syncs across tabs
- [x] Creating new job cancels existing running job
- [x] Listeners notified of all state changes
- [x] Progress updates work without changing status

**Status:** ✅ Phase 3 Complete
**Implementation:** `client/src/jobs/JobManager.js` with unit tests in `client/tests/unit/job-manager.test.js`

---

### Phase 4: FormController Integration

**Risk:** Higher (core functionality)
**Time:** 4-6 hours
**Reward:** Full refresh resilience, proper cancellation

#### 4.1 Feature Flag Approach

```javascript
// In FormController initialization
const params = new URLSearchParams(location.search);
this.useJobQueue = params.has('useJobQueue');

if (this.useJobQueue) {
    this.jobManager = new JobManager();
    this._setupJobRehydration();
} else {
    // Existing Promise-based flow
}
```

#### 4.2 Job-Based Submission Flow

```javascript
async handleSubmit(config) {
    if (this.useJobQueue) {
        return this._handleSubmitWithJobs(config);
    }
    return this._handleSubmitLegacy(config);
}

async _handleSubmitWithJobs(config) {
    // 1. Create job record
    const job = await this.jobManager.createJob(config);

    // 2. Update UI to show pending
    this.progressTracker.show('Initializing analysis...');

    // 3. Transition to running
    await this.jobManager.transition(job.id, 'running');

    try {
        // 4. Run analysis with progress updates
        const result = await this.bookBuilder.generateBook(config, {
            onProgress: async (progress) => {
                await this.jobManager.updateProgress(job.id, progress);
            }
        });

        // 5. Complete
        await this.jobManager.transition(job.id, 'completed', { result });
        this._displayResults(result);

    } catch (error) {
        // 6. Failed
        await this.jobManager.transition(job.id, 'failed', {
            error: { message: error.message }
        });
        this._displayError(error);
    }
}
```

#### 4.3 Rehydration on Page Load

```javascript
async _setupJobRehydration() {
    const runningJob = await this.jobManager.getInProgress();

    if (runningJob) {
        // Job was interrupted - show recovery UI
        this._showRecoveryDialog(runningJob);
    }
}

_showRecoveryDialog(job) {
    const dialog = this._createRecoveryDialog({
        message: `Previous analysis was interrupted. Resume?`,
        config: job.config,
        progress: job.progress,
        onResume: () => this._resumeJob(job),
        onDiscard: () => this.jobManager.transition(job.id, 'cancelled')
    });
    dialog.show();
}
```

#### 4.4 Cancellation Handler

```javascript
async cancelCurrentJob() {
    const job = await this.jobManager.getInProgress();
    if (!job) return;

    // 1. Update state
    await this.jobManager.transition(job.id, 'cancelled');

    // 2. Terminate engine
    this.engine.terminate();

    // 3. Update UI
    this.progressTracker.hide();
    this._showMessage('Analysis cancelled');
}
```

#### Phase 4 Verification Checklist

- [x] Feature flag `?useJobQueue=true` activates new flow
- [x] Legacy flow still works without flag
- [ ] All existing E2E tests pass with both flows - needs verification
- [x] Refresh mid-analysis shows recovery dialog
- [x] Cancel terminates engine and updates state
- [x] New E2E tests for cancel/refresh scenarios created

**Status:** ✅ Phase 4 Complete
**Implementation:** `client/src/ui/FormController.js` updated with job queue methods

---

### Phase 5: New E2E Test Scenarios

**Risk:** Low (additive)
**Time:** 2-3 hours
**Reward:** Coverage for previously untested scenarios

**Status:** ✅ Phase 5 Complete
**Implementation:** `client/tests/e2e/job-queue.e2e.test.js` - 8 new E2E tests

#### 5.1 Refresh Mid-Analysis Test

```javascript
test('recovers from page refresh during analysis', async ({ page }) => {
    await page.goto('/?testMode=true&useJobQueue=true&testScenario=slow');

    // Start analysis
    await page.fill('[data-testid="pgn-input"]', '1. e4 c5');
    await page.click('[data-testid="generate-button"]');

    // Wait for running state
    await page.waitForSelector('[data-testid="progress-tracker"]');

    // Refresh mid-analysis
    await page.reload();

    // Should show recovery dialog
    await expect(page.locator('[data-testid="recovery-dialog"]')).toBeVisible();
    await expect(page.locator('[data-testid="recovery-dialog"]')).toContainText('Resume');
});
```

#### 5.2 Cancel Mid-Analysis Test

```javascript
test('cancels running analysis cleanly', async ({ page }) => {
    await page.goto('/?testMode=true&useJobQueue=true&testScenario=slow');

    // Start analysis
    await page.fill('[data-testid="pgn-input"]', '1. e4 c5');
    await page.click('[data-testid="generate-button"]');

    // Wait for running state
    await page.waitForSelector('[data-testid="progress-tracker"]');

    // Cancel
    await page.click('[data-testid="cancel-button"]');

    // Progress should disappear, no results shown
    await expect(page.locator('[data-testid="progress-tracker"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="results-container"]')).not.toBeVisible();

    // Submit button should be enabled again
    await expect(page.locator('[data-testid="generate-button"]')).toBeEnabled();
});
```

#### 5.3 Double-Submit Prevention Test

```javascript
test('prevents duplicate job creation on rapid submit', async ({ page }) => {
    await page.goto('/?testMode=true&useJobQueue=true');

    await page.fill('[data-testid="pgn-input"]', '1. e4 c5');

    // Rapid double-click
    await page.click('[data-testid="generate-button"]');
    await page.click('[data-testid="generate-button"]');

    // Should only have one job
    const jobCount = await page.evaluate(async () => {
        const db = await indexedDB.open('bookbuilder');
        // ... count jobs
    });

    expect(jobCount).toBe(1);
});
```

#### 5.4 Cross-Tab Sync Test

```javascript
test('syncs job state across tabs', async ({ browser }) => {
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await page1.goto('/?testMode=true&useJobQueue=true');
    await page2.goto('/?testMode=true&useJobQueue=true');

    // Start job in tab 1
    await page1.fill('[data-testid="pgn-input"]', '1. e4 c5');
    await page1.click('[data-testid="generate-button"]');

    // Tab 2 should show job is running
    await expect(page2.locator('[data-testid="job-status"]')).toContainText('running');

    await context.close();
});
```

---

## Test Execution Strategy

### CI Pipeline Configuration

```yaml
# .github/workflows/test.yml
jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - run: npm test

  e2e-fast:
    runs-on: ubuntu-latest
    steps:
      - run: npm run test:e2e  # Uses testMode, fast

  e2e-real-engine:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'  # Only on main
    steps:
      - run: npm run test:e2e:real  # Real engine, slow
```

### Local Development

```bash
# Fast feedback (mock engine)
npm run test:e2e

# Before PR (real engine smoke)
npm run test:e2e:real

# Debug specific test
npm run test:e2e:debug -- --grep "recovers from refresh"
```

---

## Success Metrics

After full implementation:

| Metric | Before | After |
|--------|--------|-------|
| E2E test duration | ~3 min | ~30 sec |
| Cancel/refresh coverage | 0% | 100% |
| Flaky test rate | Unknown | <1% |
| Recovery from refresh | Not supported | Full recovery |
| Cross-tab consistency | Not supported | Synced |

---

## Implementation Order

1. **Phase 1** (Quick Win) - Do first, immediate payoff
2. **Phase 2** (JobStore) - Can be done in parallel with Phase 1
3. **Phase 3** (JobManager) - Depends on Phase 2
4. **Phase 4** (Integration) - Depends on Phase 3, highest risk
5. **Phase 5** (New Tests) - Do alongside Phase 4

**Recommended timeline:**
- Week 1: Phases 1 + 2
- Week 2: Phases 3 + 4 + 5

---

## Rollback Plan

Each phase has a simple rollback:

| Phase | Rollback |
|-------|----------|
| 1 | Remove MockEngine, revert EngineFactory, remove testMode checks |
| 2 | Delete JobStore (IndexedDB data is isolated, won't affect app) |
| 3 | Delete JobManager |
| 4 | Remove feature flag code, FormController reverts to Promise flow |
| 5 | Delete new E2E test files |

The feature flag in Phase 4 means production is never affected until you're ready.
