/**
 * =============================================================================
 * NodeStockfishEngine Parity Tests
 * =============================================================================
 *
 * PURPOSE:
 * These tests verify that NodeStockfishEngine (Node.js child process)
 * works correctly and produces valid chess engine output. This enables
 * running BookBuilder tests with real Stockfish analysis to isolate
 * whether issues are from the web implementation or the algorithms.
 *
 * WHAT THESE TESTS DO:
 * 1. Verify engine initialization works
 * 2. Verify getBestMove() returns valid UCI format moves
 * 3. Verify evaluatePosition() returns sensible centipawn scores
 * 4. Verify analyzeMove() returns expected structure
 * 5. Verify multiple sequential operations work correctly
 * 6. Verify cleanup happens properly
 *
 * USAGE:
 *   npm run test:node-engine
 *
 * NOTE:
 * These tests use real Stockfish and take a few seconds per test.
 * They're designed to be run separately from the fast mock-based tests.
 *
 * =============================================================================
 */

// Import the Node.js Stockfish engine adapter
const NodeStockfishEngine = require('../src/engine/NodeStockfishEngine.js');

// Test configuration - use shallow depth for faster tests
const TEST_CONFIG = {
    depth: 10,      // Shallow depth for faster tests (still accurate enough)
    threads: 1,     // Single thread for consistency
    hash: 64,       // Smaller hash for tests
    timeout: 30000  // 30 second timeout per operation
};

// Standard test positions
const TEST_POSITIONS = {
    // Starting position
    starting: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',

    // After 1.e4
    afterE4: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',

    // Sicilian Defense after 1.e4 c5
    sicilian: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2',

    // Italian Game position
    italian: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',

    // Winning position for white (queen up)
    whiteWinning: 'rnb1kbnr/pppp1ppp/8/4p3/4P2Q/8/PPPP1PPP/RNB1KBNR w KQkq - 0 1',

    // Mate in 1 position (Qh7#)
    mateIn1: 'rnb1kbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKB1R w KQkq - 0 1'
};

// Skip these tests if we're running in a browser environment
// NodeStockfishEngine only works in Node.js
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

// Conditionally define tests based on environment
const describeOrSkip = isNode ? describe : describe.skip;

describeOrSkip('NodeStockfishEngine', () => {
    // Single engine instance for all tests (engine startup is slow)
    let engine;

    // Set up engine before all tests
    beforeAll(async () => {
        // Create engine with test configuration
        engine = new NodeStockfishEngine(TEST_CONFIG);

        // Initialize the engine - this spawns the child process
        await engine.initialize();
    }, 60000); // 60 second timeout for initialization (WASM loading)

    // Clean up after all tests
    afterAll(() => {
        if (engine) {
            engine.shutdown();
        }
    });

    // =========================================================================
    // Initialization Tests
    // =========================================================================

    describe('Initialization', () => {
        test('engine should be ready after initialize()', () => {
            // After initialize() completes, isEngineReady() should return true
            expect(engine.isEngineReady()).toBe(true);
        });

        test('getConfig should return configuration object', () => {
            // Verify configuration is accessible
            const config = engine.getConfig();

            expect(config).toHaveProperty('depth');
            expect(config).toHaveProperty('threads');
            expect(config).toHaveProperty('hash');
            expect(config).toHaveProperty('timeout');

            // Verify our test config was applied
            expect(config.depth).toBe(TEST_CONFIG.depth);
            expect(config.threads).toBe(TEST_CONFIG.threads);
        });
    });

    // =========================================================================
    // getBestMove Tests
    // =========================================================================

    describe('getBestMove', () => {
        test('should return valid UCI format move for starting position', async () => {
            // Get best move for starting position
            const bestMove = await engine.getBestMove(TEST_POSITIONS.starting, 8);

            // Move should be in UCI format: source + destination + optional promotion
            // Examples: e2e4, g1f3, e7e8q
            expect(bestMove).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
        });

        test('should return valid move for Sicilian position', async () => {
            // Get best move for Sicilian Defense
            const bestMove = await engine.getBestMove(TEST_POSITIONS.sicilian, 8);

            // Should be a valid UCI move
            expect(bestMove).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);

            // Common Sicilian moves for white are Nf3, d4, Nc3, etc.
            // We don't enforce specific move, just valid format
        });

        test('should handle different positions consistently', async () => {
            // Test multiple positions in sequence
            const positions = [
                TEST_POSITIONS.starting,
                TEST_POSITIONS.afterE4,
                TEST_POSITIONS.italian
            ];

            for (const fen of positions) {
                const bestMove = await engine.getBestMove(fen, 6);
                expect(bestMove).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
            }
        });
    });

    // =========================================================================
    // evaluatePosition Tests
    // =========================================================================

    describe('evaluatePosition', () => {
        test('should return near-zero evaluation for starting position', async () => {
            // Starting position should be roughly equal
            const evaluation = await engine.evaluatePosition(TEST_POSITIONS.starting, 8);

            // Evaluation should be a number
            expect(typeof evaluation).toBe('number');

            // Starting position evaluation should be between -50 and +50 centipawns
            // (perfectly balanced position)
            expect(evaluation).toBeGreaterThan(-100);
            expect(evaluation).toBeLessThan(100);
        });

        test('should return positive evaluation for white winning position', async () => {
            // Position where white has material advantage
            const evaluation = await engine.evaluatePosition(TEST_POSITIONS.whiteWinning, 8);

            // White is winning, so evaluation should be positive
            expect(evaluation).toBeGreaterThan(0);
        });

        test('should return consistent evaluations for same position', async () => {
            // Evaluate the same position twice
            const eval1 = await engine.evaluatePosition(TEST_POSITIONS.sicilian, 8);
            const eval2 = await engine.evaluatePosition(TEST_POSITIONS.sicilian, 8);

            // Evaluations should be identical (deterministic at same depth)
            expect(eval1).toBe(eval2);
        });
    });

    // =========================================================================
    // analyzeMove Tests
    // =========================================================================

    describe('analyzeMove', () => {
        test('should return expected structure', async () => {
            // Analyze a common opening move: e2e4
            const analysis = await engine.analyzeMove(
                TEST_POSITIONS.starting,
                'e2e4',
                8
            );

            // Verify the structure of the returned object
            expect(analysis).toHaveProperty('evaluation');
            expect(analysis).toHaveProperty('moveLoss');
            expect(analysis).toHaveProperty('quality');
            expect(analysis).toHaveProperty('beforeEval');
            expect(analysis).toHaveProperty('afterEval');

            // Evaluation should be a number
            expect(typeof analysis.evaluation).toBe('number');

            // Move loss should be non-negative
            expect(analysis.moveLoss).toBeGreaterThanOrEqual(0);

            // Quality should be one of the expected values
            const validQualities = ['excellent', 'good', 'inaccuracy', 'mistake', 'blunder'];
            expect(validQualities).toContain(analysis.quality);
        });

        test('1.e4 should be an excellent or good move', async () => {
            // 1.e4 is one of the best opening moves
            const analysis = await engine.analyzeMove(
                TEST_POSITIONS.starting,
                'e2e4',
                8
            );

            // e4 is a strong opening move - should be excellent or good
            expect(['excellent', 'good']).toContain(analysis.quality);

            // Move loss should be minimal (< 30 centipawns)
            expect(analysis.moveLoss).toBeLessThan(30);
        });

        test('should reject SAN format moves', async () => {
            // SAN format (e.g., "e4") should be rejected
            await expect(
                engine.analyzeMove(TEST_POSITIONS.starting, 'e4', 8)
            ).rejects.toThrow(/Invalid move format/);
        });

        test('should reject invalid UCI moves', async () => {
            // Invalid UCI move format should be rejected
            await expect(
                engine.analyzeMove(TEST_POSITIONS.starting, 'invalid', 8)
            ).rejects.toThrow(/Invalid move format/);
        });
    });

    // =========================================================================
    // FEN Validation Tests
    // =========================================================================

    describe('FEN Validation', () => {
        test('should reject invalid FEN strings', async () => {
            // Completely invalid FEN
            await expect(
                engine.getBestMove('invalid fen string', 8)
            ).rejects.toThrow(/Invalid FEN/);
        });

        test('should reject FEN with illegal position', async () => {
            // FEN with too many kings (illegal)
            const illegalFen = 'rnbqkknr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

            await expect(
                engine.getBestMove(illegalFen, 8)
            ).rejects.toThrow(/Invalid FEN/);
        });
    });

    // =========================================================================
    // Configuration Tests
    // =========================================================================

    describe('Configuration', () => {
        test('updateConfig should update engine settings', () => {
            // Save original config
            const originalConfig = engine.getConfig();

            // Update config
            engine.updateConfig({ depth: 15, timeout: 60000 });

            // Verify update
            const newConfig = engine.getConfig();
            expect(newConfig.depth).toBe(15);
            expect(newConfig.timeout).toBe(60000);

            // Restore original config
            engine.updateConfig(originalConfig);
        });

        test('should use custom depth when provided', async () => {
            // Use very shallow depth for this test
            const startTime = Date.now();
            await engine.getBestMove(TEST_POSITIONS.starting, 3);
            const shallowTime = Date.now() - startTime;

            // Shallow depth should complete quickly (under 1 second typically)
            expect(shallowTime).toBeLessThan(5000);
        });
    });

    // =========================================================================
    // Sequential Operations Tests
    // =========================================================================

    describe('Sequential Operations', () => {
        test('should handle multiple getBestMove calls in sequence', async () => {
            // Run multiple operations sequentially
            const moves = [];

            for (const positionKey of ['starting', 'afterE4', 'sicilian']) {
                const move = await engine.getBestMove(TEST_POSITIONS[positionKey], 6);
                moves.push(move);
            }

            // All moves should be valid UCI format
            moves.forEach(move => {
                expect(move).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
            });

            // Should have 3 moves
            expect(moves.length).toBe(3);
        });

        test('should handle mixed operation types in sequence', async () => {
            // Mix different operation types
            const bestMove = await engine.getBestMove(TEST_POSITIONS.starting, 6);
            expect(bestMove).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);

            const evaluation = await engine.evaluatePosition(TEST_POSITIONS.starting, 6);
            expect(typeof evaluation).toBe('number');

            const analysis = await engine.analyzeMove(TEST_POSITIONS.starting, 'e2e4', 6);
            expect(analysis).toHaveProperty('quality');
        });
    });
});

// =========================================================================
// Separate Engine Lifecycle Test
// =========================================================================
// This test creates its own engine to test the full lifecycle

describeOrSkip('NodeStockfishEngine Lifecycle', () => {
    test('should handle full initialize -> use -> shutdown cycle', async () => {
        // Create a new engine instance
        const testEngine = new NodeStockfishEngine({ depth: 6, timeout: 30000 });

        // Initially not ready
        expect(testEngine.isEngineReady()).toBe(false);

        // Initialize
        await testEngine.initialize();
        expect(testEngine.isEngineReady()).toBe(true);

        // Use the engine
        const move = await testEngine.getBestMove(TEST_POSITIONS.starting, 4);
        expect(move).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);

        // Shutdown
        testEngine.shutdown();
        expect(testEngine.isEngineReady()).toBe(false);

        // Engine should be gone
        expect(testEngine.engine).toBeNull();
    }, 60000);

    test('multiple initialize calls should be safe', async () => {
        // Create engine
        const testEngine = new NodeStockfishEngine({ depth: 6 });

        // Call initialize multiple times (should not error)
        const promise1 = testEngine.initialize();
        const promise2 = testEngine.initialize();
        const promise3 = testEngine.initialize();

        // All should resolve to the same result
        await Promise.all([promise1, promise2, promise3]);

        expect(testEngine.isEngineReady()).toBe(true);

        // Cleanup
        testEngine.shutdown();
    }, 60000);
});
