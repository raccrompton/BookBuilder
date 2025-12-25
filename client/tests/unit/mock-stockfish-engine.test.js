/**
 * =============================================================================
 * mock-stockfish-engine.test.js - Unit Tests for MockStockfishEngine
 * =============================================================================
 *
 * PURPOSE:
 * Tests that MockStockfishEngine implements the same interface as StockfishEngine
 * and returns deterministic, instant responses for E2E testing.
 *
 * WHAT THIS ENABLES:
 * - E2E tests can run in seconds instead of minutes
 * - Deterministic behavior for reproducible tests
 * - Scenario-based testing (default, slow, error, winning, losing)
 */

import { MockStockfishEngine } from '../../src/engine/MockStockfishEngine.js';

describe('MockStockfishEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new MockStockfishEngine();
    });

    afterEach(() => {
        if (engine) {
            engine.shutdown();
        }
    });

    describe('Interface Compatibility', () => {
        test('has same public methods as StockfishEngine', () => {
            // Core methods that must exist
            expect(typeof engine.initialize).toBe('function');
            expect(typeof engine.getBestMove).toBe('function');
            expect(typeof engine.evaluatePosition).toBe('function');
            expect(typeof engine.analyzeMove).toBe('function');
            expect(typeof engine.setProgressCallback).toBe('function');
            expect(typeof engine.shutdown).toBe('function');
            expect(typeof engine.quit).toBe('function');
            expect(typeof engine.destroy).toBe('function');
            expect(typeof engine.isEngineReady).toBe('function');
            expect(typeof engine.getConfig).toBe('function');
            expect(typeof engine.updateConfig).toBe('function');
            expect(typeof engine.stopAnalysis).toBe('function');
        });

        test('constructor accepts same config options as StockfishEngine', () => {
            const customEngine = new MockStockfishEngine({
                depth: 25,
                hash: 256,
                variant: 'full',
                timeout: 60000
            });

            const config = customEngine.getConfig();
            expect(config.depth).toBe(25);
            expect(config.hash).toBe(256);
            expect(config.timeout).toBe(60000);

            customEngine.shutdown();
        });
    });

    describe('Initialization', () => {
        test('initialize() resolves quickly', async () => {
            const start = Date.now();
            await engine.initialize();
            const elapsed = Date.now() - start;

            // Should complete in under 200ms (real engine takes seconds)
            expect(elapsed).toBeLessThan(200);
            expect(engine.isEngineReady()).toBe(true);
        });

        test('isReady is false before initialize', () => {
            expect(engine.isEngineReady()).toBe(false);
        });

        test('multiple initialize calls are safe', async () => {
            await engine.initialize();
            await engine.initialize();
            await engine.initialize();

            expect(engine.isEngineReady()).toBe(true);
        });
    });

    describe('getBestMove', () => {
        beforeEach(async () => {
            await engine.initialize();
        });

        test('returns a valid UCI move format', async () => {
            const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
            const move = await engine.getBestMove(fen);

            // UCI format: e2e4, g1f3, etc.
            expect(move).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
        });

        test('completes quickly (under 100ms)', async () => {
            const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
            const start = Date.now();
            await engine.getBestMove(fen);
            const elapsed = Date.now() - start;

            expect(elapsed).toBeLessThan(100);
        });

        test('throws if engine not initialized', async () => {
            const uninitializedEngine = new MockStockfishEngine();
            const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

            await expect(uninitializedEngine.getBestMove(fen)).rejects.toThrow('Engine not initialized');
        });
    });

    describe('evaluatePosition', () => {
        beforeEach(async () => {
            await engine.initialize();
        });

        test('returns a numeric evaluation', async () => {
            const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
            const evaluation = await engine.evaluatePosition(fen);

            expect(typeof evaluation).toBe('number');
        });

        test('completes quickly (under 100ms)', async () => {
            const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
            const start = Date.now();
            await engine.evaluatePosition(fen);
            const elapsed = Date.now() - start;

            expect(elapsed).toBeLessThan(100);
        });

        test('throws if engine not initialized', async () => {
            const uninitializedEngine = new MockStockfishEngine();
            const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

            await expect(uninitializedEngine.evaluatePosition(fen)).rejects.toThrow('Engine not initialized');
        });
    });

    describe('analyzeMove', () => {
        beforeEach(async () => {
            await engine.initialize();
        });

        test('returns move analysis object with expected properties', async () => {
            const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
            const move = 'e2e4';
            const analysis = await engine.analyzeMove(fen, move);

            expect(analysis).toHaveProperty('evaluation');
            expect(analysis).toHaveProperty('moveLoss');
            expect(analysis).toHaveProperty('quality');
            expect(analysis).toHaveProperty('beforeEval');
            expect(analysis).toHaveProperty('afterEval');

            expect(typeof analysis.evaluation).toBe('number');
            expect(typeof analysis.moveLoss).toBe('number');
            expect(['excellent', 'good', 'inaccuracy', 'mistake', 'blunder']).toContain(analysis.quality);
        });
    });

    describe('Progress Callback', () => {
        test('progress callback is called during analysis', async () => {
            await engine.initialize();

            const progressUpdates = [];
            engine.setProgressCallback((message, percentage, data) => {
                progressUpdates.push({ message, percentage, data });
            });

            const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
            await engine.evaluatePosition(fen);

            // Should have received some progress updates
            expect(progressUpdates.length).toBeGreaterThan(0);
        });
    });

    describe('Shutdown', () => {
        test('shutdown marks engine as not ready', async () => {
            await engine.initialize();
            expect(engine.isEngineReady()).toBe(true);

            engine.shutdown();
            expect(engine.isEngineReady()).toBe(false);
        });

        test('quit is alias for shutdown', async () => {
            await engine.initialize();
            engine.quit();
            expect(engine.isEngineReady()).toBe(false);
        });

        test('destroy is alias for shutdown', async () => {
            await engine.initialize();
            engine.destroy();
            expect(engine.isEngineReady()).toBe(false);
        });
    });

    describe('Configuration', () => {
        test('getConfig returns current configuration', () => {
            const config = engine.getConfig();

            expect(config).toHaveProperty('depth');
            expect(config).toHaveProperty('hash');
            expect(config).toHaveProperty('timeout');
        });

        test('updateConfig modifies configuration', () => {
            engine.updateConfig({ depth: 30 });
            const config = engine.getConfig();

            expect(config.depth).toBe(30);
        });
    });

    describe('Scenarios (URL Parameter Based)', () => {
        test('default scenario returns reasonable values', async () => {
            await engine.initialize();

            const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
            const move = await engine.getBestMove(fen);
            const evaluation = await engine.evaluatePosition(fen);

            expect(move).toBeTruthy();
            expect(typeof evaluation).toBe('number');
        });

        test('setScenario allows programmatic scenario selection', async () => {
            engine.setScenario('winning');
            await engine.initialize();

            const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
            const evaluation = await engine.evaluatePosition(fen);

            // Winning scenario should have high positive evaluation
            expect(evaluation).toBeGreaterThan(100);
        });

        test('losing scenario returns negative evaluation', async () => {
            engine.setScenario('losing');
            await engine.initialize();

            const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
            const evaluation = await engine.evaluatePosition(fen);

            // Losing scenario should have negative evaluation
            expect(evaluation).toBeLessThan(0);
        });
    });
});
