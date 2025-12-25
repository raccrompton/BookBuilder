/**
 * =============================================================================
 * MockStockfishEngine.js - Mock Stockfish Engine for Fast E2E Testing
 * =============================================================================
 *
 * PURPOSE:
 * This class provides a mock implementation of StockfishEngine that returns
 * instant, deterministic responses. It's designed for E2E testing where we
 * want to verify UI orchestration without waiting for real engine computation.
 *
 * WHY THIS EXISTS:
 * Real Stockfish analysis takes 1-30+ seconds per position at typical depths.
 * In E2E tests, we might analyze 10-50 positions, making tests take 3+ minutes.
 * This mock completes in milliseconds, reducing E2E test time to ~10 seconds.
 *
 * SAFETY:
 * This mock is ONLY activated when:
 * 1. Running on localhost (127.0.0.1 or localhost)
 * 2. URL contains ?testMode=true parameter
 * This prevents accidental use in production.
 *
 * SCENARIOS:
 * The mock supports multiple scenarios via URL parameter ?testScenario=name:
 * - default: Normal evaluation (~+30 centipawns, e2e4 best move)
 * - winning: High evaluation (+500 centipawns)
 * - losing: Negative evaluation (-250 centipawns)
 * - slow: Adds 2s delay (for testing progress UI)
 * - error: Throws error (for testing error handling)
 *
 * INTERFACE:
 * Implements the same public API as StockfishEngine.js to enable duck typing.
 * The EngineFactory decides which implementation to instantiate.
 */

import Logger from '../utils/Logger.js';
const log = Logger.get('MockStockfishEngine');

/**
 * Predefined scenarios for deterministic testing.
 * Each scenario provides canned responses for engine operations.
 */
const SCENARIOS = {
    default: {
        bestMove: 'e2e4',
        evaluation: 30,           // Slight advantage (centipawns)
        pv: ['e2e4', 'e7e5', 'g1f3'],
        delay: 20                 // Small delay to simulate some work
    },
    winning: {
        bestMove: 'd1h5',
        evaluation: 500,          // Winning position
        pv: ['d1h5', 'g7g6', 'd1d5'],
        delay: 20
    },
    losing: {
        bestMove: 'a2a3',
        evaluation: -250,         // Losing position
        pv: ['a2a3'],
        delay: 20
    },
    slow: {
        bestMove: 'e2e4',
        evaluation: 10,
        pv: ['e2e4'],
        delay: 2000               // 2 second delay for progress UI testing
    },
    error: {
        shouldError: true,
        errorMessage: 'Engine crashed (test scenario)'
    }
};

class MockStockfishEngine {
    /**
     * Constructor - Initialize mock engine configuration
     *
     * @param {Object} config - Configuration options (same as StockfishEngine)
     *   @param {string} config.variant - Ignored (mock doesn't load WASM)
     *   @param {number} config.depth - Stored but not used (instant responses)
     *   @param {number} config.hash - Stored but not used
     *   @param {number} config.timeout - Stored for compatibility
     */
    constructor(config = {}) {
        // Store configuration for compatibility
        this.depth = config.depth || 20;
        this.hash = config.hash || 128;
        this.timeout = config.timeout || 120000;
        this.variant = config.variant || 'lite';

        // Engine state
        this.isReady = false;
        this.progressCallback = null;

        // Scenario selection (can be set via URL or programmatically)
        this.currentScenario = null;

        // Track initialization to prevent duplicate calls
        this.initializationPromise = null;

        log.info('[MockStockfishEngine] Created (test mode engine)');
    }

    /**
     * Initialize the mock engine
     *
     * Unlike the real engine, this completes almost instantly.
     * We add a small delay (50ms) to simulate initialization.
     */
    async initialize() {
        if (this.isReady) {
            return;
        }

        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = new Promise((resolve, reject) => {
            // Simulate brief initialization delay
            setTimeout(() => {
                const scenario = this._getScenario();

                if (scenario.shouldError) {
                    this.initializationPromise = null;
                    reject(new Error(scenario.errorMessage));
                    return;
                }

                this.isReady = true;
                log.info('[MockStockfishEngine] Initialized (mock mode)');
                resolve();
            }, 50);
        });

        return this.initializationPromise;
    }

    /**
     * Get best move for position
     *
     * Returns a canned best move based on the current scenario.
     * Ignores the actual FEN and depth parameters.
     */
    async getBestMove(fen, depth = null) {
        if (!this.isReady) {
            throw new Error('Engine not initialized');
        }

        const scenario = this._getScenario();

        if (scenario.shouldError) {
            throw new Error(scenario.errorMessage);
        }

        // Emit progress events to test progress UI
        const targetDepth = depth || this.depth;
        await this._emitProgressEvents(targetDepth, scenario);

        // Small delay to simulate work
        await this._delay(scenario.delay || 20);

        return scenario.bestMove;
    }

    /**
     * Evaluate position in centipawns
     *
     * Returns a canned evaluation based on the current scenario.
     */
    async evaluatePosition(fen, depth = null) {
        if (!this.isReady) {
            throw new Error('Engine not initialized');
        }

        const scenario = this._getScenario();

        if (scenario.shouldError) {
            throw new Error(scenario.errorMessage);
        }

        // Emit progress events
        const targetDepth = depth || this.depth;
        await this._emitProgressEvents(targetDepth, scenario);

        // Small delay to simulate work
        await this._delay(scenario.delay || 20);

        return scenario.evaluation;
    }

    /**
     * Analyze move quality
     *
     * Returns mock analysis data based on the scenario.
     */
    async analyzeMove(fen, move, depth = null) {
        if (!this.isReady) {
            throw new Error('Engine not initialized');
        }

        const scenario = this._getScenario();

        if (scenario.shouldError) {
            throw new Error(scenario.errorMessage);
        }

        const targetDepth = depth || Math.min(this.depth, 15);

        // Simulate two evaluations (before and after move)
        await this._delay(scenario.delay || 20);

        const beforeEval = scenario.evaluation;
        const afterEval = -(scenario.evaluation - 5); // Slight change after move

        // Calculate move quality (mock values)
        const moveLoss = Math.abs(5); // Small loss for mock
        const quality = this._calculateMoveQuality(moveLoss);

        return {
            evaluation: afterEval,
            moveLoss: moveLoss,
            quality: quality,
            beforeEval: beforeEval,
            afterEval: afterEval
        };
    }

    /**
     * Set progress callback for engine operations
     */
    setProgressCallback(callback) {
        this.progressCallback = callback;
    }

    /**
     * Set scenario programmatically (for testing)
     *
     * @param {string} scenarioName - Name of scenario (default, winning, losing, slow, error)
     */
    setScenario(scenarioName) {
        if (!SCENARIOS[scenarioName]) {
            throw new Error(`Unknown scenario: ${scenarioName}. Available: ${Object.keys(SCENARIOS).join(', ')}`);
        }
        this.currentScenario = scenarioName;
    }

    /**
     * Stop any ongoing analysis
     */
    stopAnalysis() {
        // No-op for mock - analysis completes instantly
        log.info('[MockStockfishEngine] stopAnalysis called (no-op in mock)');
    }

    /**
     * Shutdown engine and clean up resources
     */
    shutdown() {
        this.isReady = false;
        this.progressCallback = null;
        this.initializationPromise = null;
        log.info('[MockStockfishEngine] Shutdown');
    }

    /**
     * Alias for shutdown (compatibility with StockfishEngine)
     */
    quit() {
        return this.shutdown();
    }

    /**
     * Alias for shutdown (compatibility with StockfishEngine)
     */
    destroy() {
        return this.shutdown();
    }

    /**
     * Check if engine is ready
     */
    isEngineReady() {
        return this.isReady;
    }

    /**
     * Get engine configuration
     */
    getConfig() {
        return {
            depth: this.depth,
            hash: this.hash,
            timeout: this.timeout
        };
    }

    /**
     * Update engine configuration
     */
    updateConfig(config) {
        if (config.depth !== undefined) this.depth = config.depth;
        if (config.hash !== undefined) this.hash = config.hash;
        if (config.timeout !== undefined) this.timeout = config.timeout;
    }

    // =========================================================================
    // PRIVATE HELPER METHODS
    // =========================================================================

    /**
     * Get the current scenario configuration
     *
     * Checks (in order):
     * 1. Programmatically set scenario via setScenario()
     * 2. URL parameter ?testScenario=name
     * 3. Default scenario
     */
    _getScenario() {
        // Check programmatically set scenario first
        if (this.currentScenario && SCENARIOS[this.currentScenario]) {
            return SCENARIOS[this.currentScenario];
        }

        // Check URL parameter (if in browser environment)
        if (typeof window !== 'undefined' && window.location) {
            try {
                const params = new URLSearchParams(window.location.search);
                const scenarioName = params.get('testScenario');
                if (scenarioName && SCENARIOS[scenarioName]) {
                    return SCENARIOS[scenarioName];
                }
            } catch (error) {
                // URL not available in Node.js test environment - use default scenario
                log.debug('[MockStockfishEngine] URL access error:', error.message);
            }
        }

        // Default scenario
        return SCENARIOS.default;
    }

    /**
     * Promise-based delay helper
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Emit progress events to simulate engine analysis
     *
     * The real engine emits progress at each depth level.
     * We simulate this with quick progress updates.
     */
    async _emitProgressEvents(targetDepth, scenario) {
        if (!this.progressCallback) {
            return;
        }

        // Emit a few progress updates
        const progressDepths = [1, Math.floor(targetDepth / 2), targetDepth];

        for (const depth of progressDepths) {
            await this._delay(5); // Brief pause between updates
            this.progressCallback(
                `Analyzing depth ${depth}`,
                (depth / targetDepth) * 100,
                {
                    depth: depth,
                    evaluation: scenario.evaluation,
                    pv: scenario.pv ? scenario.pv.join(' ') : null
                }
            );
        }
    }

    /**
     * Calculate move quality based on centipawn loss
     * (Same logic as StockfishEngine for consistency)
     */
    _calculateMoveQuality(moveLoss) {
        if (moveLoss <= 10) return 'excellent';
        if (moveLoss <= 25) return 'good';
        if (moveLoss <= 50) return 'inaccuracy';
        if (moveLoss <= 100) return 'mistake';
        return 'blunder';
    }
}

export { MockStockfishEngine };
export default MockStockfishEngine;
