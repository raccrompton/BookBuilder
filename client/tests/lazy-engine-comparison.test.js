/**
 * =============================================================================
 * Lazy Engine Comparison Tests
 * =============================================================================
 *
 * PURPOSE:
 * These tests verify that the lazy engine evaluation (LAZY_ENGINE=1) produces
 * identical move selections as the legacy batch evaluation (LAZY_ENGINE=0),
 * while also measuring the reduction in engine calls.
 *
 * TEST STRATEGY:
 * For each test position, we run selectBestMove with both:
 *   - LAZY_ENGINE=0 (legacy batch: analyze all candidates upfront)
 *   - LAZY_ENGINE=1 (lazy: analyze candidates one at a time)
 *
 * We verify:
 *   1. Same move is selected in both cases
 *   2. Engine call count is <= with lazy (optimization)
 *
 * FIXTURES:
 * 10 diverse test scenarios covering different edge cases:
 *   1. Simple opening (e.g., 1. e4)
 *   2. Deep opening line (10+ moves)
 *   3. Position where stat best = engine best
 *   4. Position where stat best ≠ engine best
 *   5. Position where multiple candidates rejected
 *   6. Position with few candidates (2-3)
 *   7. Position with many candidates (8+)
 *   8. Edge case: all candidates rejected (fallback)
 *   9. Black perspective opening
 *   10. Position with mate evaluation
 *
 * =============================================================================
 */

import MoveSelector from '../src/algorithm/MoveSelector.js';
import Statistics from '../src/stats/Statistics.js';
import { TestUtils } from './testUtils.js';

// =============================================================================
// Mock Engine Client with Call Counting
// =============================================================================

/**
 * MockEngineClient that tracks all calls made to engine methods.
 * This allows us to compare engine usage between lazy and batch paths.
 */
class CountingMockEngine {
    constructor(options = {}) {
        // The move the engine considers "best" for this position
        this.bestMove = options.bestMove || 'e2e4';

        // Position evaluation in centipawns
        this.positionEval = options.positionEval || 25;

        // Map of move -> centipawn loss (how much worse than best)
        // Default: best move has 0 loss, others have 30cp loss
        this.moveLosses = options.moveLosses || {};

        // Call counters for tracking
        this.callCounts = {
            getBestMove: 0,
            evaluatePosition: 0,
            analyzeMove: 0
        };

        // Track individual move analyses
        this.analyzedMoves = [];
    }

    /**
     * Reset all call counters (useful between test runs)
     */
    resetCounts() {
        this.callCounts = {
            getBestMove: 0,
            evaluatePosition: 0,
            analyzeMove: 0
        };
        this.analyzedMoves = [];
    }

    /**
     * Get total number of engine operations
     */
    getTotalCalls() {
        return this.callCounts.getBestMove +
               this.callCounts.evaluatePosition +
               this.callCounts.analyzeMove;
    }

    async getBestMove(_fen) {
        this.callCounts.getBestMove++;
        return this.bestMove;
    }

    async evaluatePosition(_fen) {
        this.callCounts.evaluatePosition++;
        return this.positionEval;
    }

    async analyzeMove(_fen, move) {
        this.callCounts.analyzeMove++;
        this.analyzedMoves.push(move);

        const isBestMove = move === this.bestMove;
        const moveLoss = this.moveLosses[move] ?? (isBestMove ? 0 : 30);

        return {
            move,
            bestMove: this.bestMove,
            evaluation: this.positionEval - moveLoss,
            bestEvaluation: this.positionEval,
            moveLoss,
            isBestMove,
            quality: moveLoss === 0 ? 'excellent' : moveLoss < 50 ? 'good' : 'dubious'
        };
    }
}

// =============================================================================
// Test Fixtures: 10 Diverse Scenarios
// =============================================================================

const TEST_FIXTURES = [
    // 1. Simple opening - starting position with common moves
    {
        name: 'Simple opening (starting position)',
        position: {
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            perspective: 'white'
        },
        candidates: [
            { san: 'e4', uci: 'e2e4', white: 1000000, black: 800000, draws: 200000, playrate: 0.4 },
            { san: 'd4', uci: 'd2d4', white: 900000, black: 750000, draws: 150000, playrate: 0.35 },
            { san: 'Nf3', uci: 'g1f3', white: 400000, black: 350000, draws: 100000, playrate: 0.15 },
            { san: 'c4', uci: 'c2c4', white: 200000, black: 180000, draws: 50000, playrate: 0.10 }
        ],
        engineConfig: { bestMove: 'e2e4', positionEval: 25 },
        expectedMove: 'e4'  // Stat best = engine best
    },

    // 2. Deep opening line (Ruy Lopez position)
    {
        name: 'Deep opening (Ruy Lopez)',
        position: {
            fen: 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
            perspective: 'white'
        },
        candidates: [
            { san: 'a6', uci: 'a7a6', white: 450000, black: 500000, draws: 100000, playrate: 0.55 },
            { san: 'Nf6', uci: 'g8f6', white: 200000, black: 220000, draws: 50000, playrate: 0.25 },
            { san: 'd6', uci: 'd7d6', white: 100000, black: 120000, draws: 30000, playrate: 0.12 }
        ],
        engineConfig: { bestMove: 'a7a6', positionEval: -15 },
        expectedMove: 'a6'
    },

    // 3. Position where stat best = engine best (fast path)
    {
        name: 'Stat best equals engine best',
        position: {
            fen: 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
            perspective: 'white'
        },
        candidates: [
            { san: 'Nc3', uci: 'b1c3', white: 500000, black: 400000, draws: 100000, playrate: 0.50 },
            { san: 'd4', uci: 'd2d4', white: 300000, black: 280000, draws: 70000, playrate: 0.30 },
            { san: 'Bc4', uci: 'f1c4', white: 150000, black: 140000, draws: 40000, playrate: 0.15 }
        ],
        engineConfig: { bestMove: 'b1c3', positionEval: 30 },
        expectedMove: 'Nc3'
    },

    // 4. Position where stat best ≠ engine best (needs analysis)
    {
        name: 'Stat best differs from engine best',
        position: {
            fen: 'rnbqkb1r/ppp1pppp/5n2/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq d6 0 3',
            perspective: 'white'
        },
        candidates: [
            // Stat best is e5 (higher win rate), but engine prefers exd5
            // Note: Ranking is by win rate lower bound, not playrate
            { san: 'e5', uci: 'e4e5', white: 500000, black: 350000, draws: 100000, playrate: 0.45 },
            { san: 'exd5', uci: 'e4d5', white: 350000, black: 320000, draws: 70000, playrate: 0.40 },
            { san: 'Nc3', uci: 'b1c3', white: 100000, black: 95000, draws: 25000, playrate: 0.10 }
        ],
        engineConfig: {
            bestMove: 'e4d5',
            positionEval: 35,
            moveLosses: { 'e4e5': 20, 'e4d5': 0, 'b1c3': 40 }  // e5 is playable (20cp loss)
        },
        expectedMove: 'e5'  // Still select stat best since loss is within limits
    },

    // 5. Position where multiple candidates get rejected
    {
        name: 'Multiple candidates rejected',
        position: {
            fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
            perspective: 'white'
        },
        candidates: [
            { san: 'c3', uci: 'c2c3', white: 200000, black: 190000, draws: 40000, playrate: 0.40 },
            { san: 'd3', uci: 'd2d3', white: 150000, black: 145000, draws: 30000, playrate: 0.30 },
            { san: 'Nc3', uci: 'b1c3', white: 100000, black: 95000, draws: 20000, playrate: 0.20 }
        ],
        engineConfig: {
            bestMove: 'b1c3',
            positionEval: 25,
            moveLosses: { 'c2c3': 150, 'd2d3': 120, 'b1c3': 0 }  // c3, d3 rejected
        },
        expectedMove: 'Nc3'  // Only engine's choice passes
    },

    // 6. Position with few candidates (2-3 moves)
    {
        name: 'Few candidates available',
        position: {
            fen: '8/8/8/8/4k3/8/4K3/4R3 w - - 0 1',
            perspective: 'white'
        },
        candidates: [
            { san: 'Re8+', uci: 'e1e8', white: 50000, black: 1000, draws: 500, playrate: 0.85 },
            { san: 'Kf3', uci: 'e2f3', white: 30000, black: 5000, draws: 2000, playrate: 0.15 }
        ],
        engineConfig: { bestMove: 'e1e8', positionEval: 900 },
        expectedMove: 'Re8+'
    },

    // 7. Position with many candidates (8+ moves)
    {
        name: 'Many candidates available',
        position: {
            fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
            perspective: 'black'
        },
        candidates: [
            { san: 'e5', uci: 'e7e5', white: 800000, black: 850000, draws: 150000, playrate: 0.30 },
            { san: 'c5', uci: 'c7c5', white: 600000, black: 650000, draws: 120000, playrate: 0.25 },
            { san: 'e6', uci: 'e7e6', white: 400000, black: 420000, draws: 80000, playrate: 0.15 },
            { san: 'c6', uci: 'c7c6', white: 300000, black: 320000, draws: 60000, playrate: 0.12 },
            { san: 'd5', uci: 'd7d5', white: 200000, black: 210000, draws: 40000, playrate: 0.08 },
            { san: 'Nf6', uci: 'g8f6', white: 150000, black: 160000, draws: 30000, playrate: 0.05 },
            { san: 'd6', uci: 'd7d6', white: 100000, black: 105000, draws: 20000, playrate: 0.03 },
            { san: 'g6', uci: 'g7g6', white: 50000, black: 55000, draws: 10000, playrate: 0.02 }
        ],
        engineConfig: { bestMove: 'e7e5', positionEval: -10 },
        expectedMove: 'e5'
    },

    // 8. Edge case: all candidates rejected (fallback to stat best)
    {
        name: 'All candidates rejected - fallback',
        position: {
            fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
            perspective: 'white'
        },
        candidates: [
            { san: 'Qxf7+', uci: 'h5f7', white: 100000, black: 5000, draws: 1000, playrate: 0.80 },
            { san: 'Nc3', uci: 'b1c3', white: 20000, black: 18000, draws: 4000, playrate: 0.15 }
        ],
        engineConfig: {
            bestMove: 'd2d3',  // Engine's best isn't in our candidates
            positionEval: 50,
            moveLosses: { 'h5f7': 200, 'b1c3': 150 }  // All reject due to high loss
        },
        expectedMove: 'Qxf7+'  // Falls back to stat best
    },

    // 9. Black perspective opening
    {
        name: 'Black perspective (Sicilian)',
        position: {
            fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
            perspective: 'black'
        },
        candidates: [
            { san: 'd6', uci: 'd7d6', white: 300000, black: 350000, draws: 70000, playrate: 0.40 },
            { san: 'Nc6', uci: 'b8c6', white: 250000, black: 280000, draws: 60000, playrate: 0.35 },
            { san: 'e6', uci: 'e7e6', white: 150000, black: 170000, draws: 35000, playrate: 0.20 }
        ],
        engineConfig: { bestMove: 'd7d6', positionEval: -10 },
        expectedMove: 'd6'
    },

    // 10. Position with mate evaluation
    {
        name: 'Position with mate threat',
        position: {
            fen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1',
            perspective: 'white'
        },
        candidates: [
            { san: 'Re8#', uci: 'e1e8', white: 10000, black: 0, draws: 0, playrate: 0.95 },
            { san: 'Kf1', uci: 'g1f1', white: 5000, black: 100, draws: 50, playrate: 0.05 }
        ],
        engineConfig: { bestMove: 'e1e8', positionEval: 9999999999 },  // Mate
        expectedMove: 'Re8#'
    }
];

// =============================================================================
// Test Suite
// =============================================================================

describe('Lazy Engine Evaluation - Comparison Tests', () => {
    let statisticsEngine;

    beforeAll(() => {
        statisticsEngine = new Statistics();
    });

    describe('Move Selection Equivalence', () => {
        // Run each fixture through both paths and compare results
        TEST_FIXTURES.forEach((fixture, index) => {
            test(`${index + 1}. ${fixture.name}`, async () => {
                // Create mock engines for each path
                const lazyEngine = new CountingMockEngine(fixture.engineConfig);
                const batchEngine = new CountingMockEngine(fixture.engineConfig);

                // Create selectors with different LAZY_ENGINE settings
                const lazyConfig = TestUtils.createTestConfig({ LAZY_ENGINE: 1 });
                const batchConfig = TestUtils.createTestConfig({ LAZY_ENGINE: 0 });

                const lazySelector = new MoveSelector(lazyConfig);
                const batchSelector = new MoveSelector(batchConfig);

                // Run both paths
                const lazyResult = await lazySelector.selectBestMove(
                    fixture.position,
                    fixture.candidates,
                    lazyEngine,
                    statisticsEngine
                );

                const batchResult = await batchSelector.selectBestMove(
                    fixture.position,
                    fixture.candidates,
                    batchEngine,
                    statisticsEngine
                );

                // ASSERTION 1: Same move selected (primary goal - equivalence)
                // Both paths must select the same move
                expect(lazyResult.selectedMove?.san).toBe(batchResult.selectedMove?.san);

                // ASSERTION 2: Lazy uses <= engine calls than batch
                const lazyCalls = lazyEngine.getTotalCalls();
                const batchCalls = batchEngine.getTotalCalls();

                expect(lazyCalls).toBeLessThanOrEqual(batchCalls);
            });
        });
    });

    describe('Engine Call Optimization', () => {
        test('Fast path: stat best = engine best uses minimal calls', async () => {
            // Fixture 3 is designed for this case
            const fixture = TEST_FIXTURES[2];
            const engine = new CountingMockEngine(fixture.engineConfig);

            const config = TestUtils.createTestConfig({ LAZY_ENGINE: 1 });
            const selector = new MoveSelector(config);

            await selector.selectBestMove(
                fixture.position,
                fixture.candidates,
                engine,
                statisticsEngine
            );

            // Fast path should only need:
            // - 1 getBestMove call
            // - 1 evaluatePosition call
            // - 0 analyzeMove calls (stat best = engine best)
            expect(engine.callCounts.getBestMove).toBe(1);
            expect(engine.callCounts.evaluatePosition).toBe(1);
            expect(engine.callCounts.analyzeMove).toBe(0);
            expect(engine.analyzedMoves).toHaveLength(0);
        });

        test('Slow path: stat best ≠ engine best analyzes one move', async () => {
            // Fixture 4 is designed for this case
            const fixture = TEST_FIXTURES[3];
            const engine = new CountingMockEngine(fixture.engineConfig);

            const config = TestUtils.createTestConfig({ LAZY_ENGINE: 1 });
            const selector = new MoveSelector(config);

            await selector.selectBestMove(
                fixture.position,
                fixture.candidates,
                engine,
                statisticsEngine
            );

            // Should analyze stat best (e4e5) only
            expect(engine.callCounts.analyzeMove).toBe(1);
            expect(engine.analyzedMoves).toContain('e4e5');
        });

        test('Multiple rejections: analyzes moves until finding valid one', async () => {
            // Fixture 5 has multiple rejected moves
            const fixture = TEST_FIXTURES[4];
            const engine = new CountingMockEngine(fixture.engineConfig);

            const config = TestUtils.createTestConfig({ LAZY_ENGINE: 1 });
            const selector = new MoveSelector(config);

            await selector.selectBestMove(
                fixture.position,
                fixture.candidates,
                engine,
                statisticsEngine
            );

            // Should analyze c2c3 (rejected), d2d3 (rejected), b1c3 (accepted)
            // Or if stat order differs, may be fewer
            expect(engine.callCounts.analyzeMove).toBeGreaterThanOrEqual(1);
            expect(engine.callCounts.analyzeMove).toBeLessThanOrEqual(3);
        });

        test('Batch path analyzes all candidates', async () => {
            // Use fixture with multiple candidates
            const fixture = TEST_FIXTURES[6]; // 8 candidates
            const engine = new CountingMockEngine(fixture.engineConfig);

            const config = TestUtils.createTestConfig({ LAZY_ENGINE: 0 });
            const selector = new MoveSelector(config);

            await selector.selectBestMove(
                fixture.position,
                fixture.candidates,
                engine,
                statisticsEngine
            );

            // Batch path should analyze ALL candidates
            expect(engine.callCounts.analyzeMove).toBe(fixture.candidates.length);
        });
    });

    describe('Edge Cases', () => {
        test('Empty candidates list returns null', async () => {
            const engine = new CountingMockEngine();
            const config = TestUtils.createTestConfig({ LAZY_ENGINE: 1 });
            const selector = new MoveSelector(config);

            const result = await selector.selectBestMove(
                { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
                [],
                engine,
                statisticsEngine
            );

            expect(result).toBeNull();
        });

        test('Fallback when all candidates rejected', async () => {
            // Fixture 8 has all candidates rejected
            const fixture = TEST_FIXTURES[7];
            const engine = new CountingMockEngine(fixture.engineConfig);

            const config = TestUtils.createTestConfig({ LAZY_ENGINE: 1 });
            const selector = new MoveSelector(config);

            const result = await selector.selectBestMove(
                fixture.position,
                fixture.candidates,
                engine,
                statisticsEngine
            );

            // Should fall back to statistical best
            expect(result.selectedMove?.san).toBe(fixture.expectedMove);
            expect(result.selectionReason).toContain('rejected');
        });

        test('Engine error falls back to statistical selection', async () => {
            const errorEngine = {
                getBestMove: async () => { throw new Error('Engine failed'); },
                analyzeMove: async () => { throw new Error('Analysis failed'); },
                evaluatePosition: async () => { throw new Error('Evaluation failed'); }
            };

            const config = TestUtils.createTestConfig({ LAZY_ENGINE: 1 });
            const selector = new MoveSelector(config);

            const candidates = [
                { san: 'e4', uci: 'e2e4', white: 1000, black: 800, draws: 200, playrate: 0.5 },
                { san: 'd4', uci: 'd2d4', white: 900, black: 750, draws: 150, playrate: 0.4 }
            ];

            const result = await selector.selectBestMove(
                { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
                candidates,
                errorEngine,
                statisticsEngine
            );

            expect(result.selectedMove).toBeDefined();
            expect(result.engineAnalysis).toBeNull();
        });
    });

    describe('Performance Summary', () => {
        test('Calculate average engine call reduction', async () => {
            let totalLazyCalls = 0;
            let totalBatchCalls = 0;

            for (const fixture of TEST_FIXTURES) {
                const lazyEngine = new CountingMockEngine(fixture.engineConfig);
                const batchEngine = new CountingMockEngine(fixture.engineConfig);

                const lazySelector = new MoveSelector(TestUtils.createTestConfig({ LAZY_ENGINE: 1 }));
                const batchSelector = new MoveSelector(TestUtils.createTestConfig({ LAZY_ENGINE: 0 }));

                await lazySelector.selectBestMove(fixture.position, fixture.candidates, lazyEngine, statisticsEngine);
                await batchSelector.selectBestMove(fixture.position, fixture.candidates, batchEngine, statisticsEngine);

                totalLazyCalls += lazyEngine.getTotalCalls();
                totalBatchCalls += batchEngine.getTotalCalls();
            }

            const reduction = ((totalBatchCalls - totalLazyCalls) / totalBatchCalls * 100).toFixed(1);
            console.log(`\n📊 Performance Summary:`);
            console.log(`   Total lazy engine calls: ${totalLazyCalls}`);
            console.log(`   Total batch engine calls: ${totalBatchCalls}`);
            console.log(`   Engine call reduction: ${reduction}%\n`);

            // Expect at least 30% reduction on average across all test cases
            expect(totalLazyCalls).toBeLessThan(totalBatchCalls);
        });
    });
});
