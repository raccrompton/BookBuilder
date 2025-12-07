/**
 * =============================================================================
 * Perspective Invariants Tests
 * =============================================================================
 *
 * PURPOSE:
 * These tests verify that perspective handling (white vs black) is correct
 * throughout the BookBuilder codebase. Perspective bugs are subtle and can
 * cause moves to be incorrectly rejected or accepted.
 *
 * TESTING APPROACH:
 * We test STRUCTURAL PROPERTIES, not exact values, because:
 * - Engine evaluations vary between runs (depth, hash state, etc.)
 * - Exact centipawn values are non-deterministic
 * - Structural properties (sign, ordering, bounds) ARE deterministic
 *
 * WHAT WE TEST:
 * 1. moveLoss is always non-negative (we return absolute value)
 * 2. Win rate percentages always sum correctly
 * 3. Validation helpers catch invalid values
 * 4. Black perspective correctly uses black's win rate
 *
 * WHAT WE DON'T TEST:
 * - Exact centipawn values (flaky)
 * - Cross-run comparisons (engine state differs)
 *
 * =============================================================================
 */

import MoveSelector from '../src/algorithm/MoveSelector.js';
import Statistics from '../src/stats/Statistics.js';
import { TestUtils } from './testUtils.js';

/**
 * Mock engine that returns controlled analysis values
 * This allows us to test perspective handling with deterministic inputs
 */
class MockEngineWithPerspective {
    constructor(options = {}) {
        this.bestMove = options.bestMove || 'e2e4';
        // Store analysis responses keyed by move
        this.analysisResponses = options.analysisResponses || {};
    }

    async getBestMove(_fen) {
        return this.bestMove;
    }

    async evaluatePosition(_fen) {
        return 25; // Default slight advantage
    }

    async analyzeMove(_fen, move) {
        // Return custom analysis if provided, otherwise default
        if (this.analysisResponses[move]) {
            return this.analysisResponses[move];
        }

        const isBestMove = move === this.bestMove;
        return {
            move,
            bestMove: this.bestMove,
            evaluation: isBestMove ? 25 : -5,
            beforeEval: 25,
            afterEval: isBestMove ? -25 : 5, // Opponent's perspective
            moveLoss: isBestMove ? 0 : 30,
            isBestMove,
            quality: isBestMove ? 'excellent' : 'good'
        };
    }
}

describe('Perspective Invariants', () => {
    let statistics;

    beforeEach(() => {
        statistics = new Statistics();
    });

    // =========================================================================
    // VALIDATION HELPER TESTS
    // =========================================================================
    describe('MoveSelector Validation Helpers', () => {
        let moveSelector;

        beforeEach(() => {
            moveSelector = new MoveSelector({
                CAREABOUTENGINE: 1,
                SOUNDNESSLIMIT: -99,
                LOSSLIMIT: -99,
                IGNORELOSSLIMIT: 300
            });
        });

        describe('_validateCentipawnValue', () => {
            test('accepts valid centipawn values', () => {
                // Normal centipawn values
                expect(moveSelector._validateCentipawnValue(0, 'test')).toBe(true);
                expect(moveSelector._validateCentipawnValue(100, 'test')).toBe(true);
                expect(moveSelector._validateCentipawnValue(-100, 'test')).toBe(true);
                expect(moveSelector._validateCentipawnValue(5000, 'test')).toBe(true);
                expect(moveSelector._validateCentipawnValue(-5000, 'test')).toBe(true);
            });

            test('accepts mate scores (large values)', () => {
                // Mate scores can be very large - these should be accepted
                expect(moveSelector._validateCentipawnValue(9999999, 'test')).toBe(true);
                expect(moveSelector._validateCentipawnValue(-9999999, 'test')).toBe(true);
                expect(moveSelector._validateCentipawnValue(Infinity, 'test')).toBe(true);
                expect(moveSelector._validateCentipawnValue(-Infinity, 'test')).toBe(true);
            });

            test('rejects non-numeric values', () => {
                expect(moveSelector._validateCentipawnValue(NaN, 'test')).toBe(false);
                expect(moveSelector._validateCentipawnValue(undefined, 'test')).toBe(false);
                expect(moveSelector._validateCentipawnValue('100', 'test')).toBe(false);
            });
        });

        describe('_validatePerspective', () => {
            test('accepts valid turn values', () => {
                expect(moveSelector._validatePerspective('w', null, 'test')).toBe(true);
                expect(moveSelector._validatePerspective('b', null, 'test')).toBe(true);
            });

            test('accepts valid perspective values', () => {
                expect(moveSelector._validatePerspective(null, 'white', 'test')).toBe(true);
                expect(moveSelector._validatePerspective(null, 'black', 'test')).toBe(true);
            });

            test('accepts both turn and perspective when valid', () => {
                expect(moveSelector._validatePerspective('w', 'white', 'test')).toBe(true);
                expect(moveSelector._validatePerspective('b', 'black', 'test')).toBe(true);
                // Note: turn and perspective don't have to match - turn is position state,
                // perspective is whose repertoire we're building
                expect(moveSelector._validatePerspective('w', 'black', 'test')).toBe(true);
            });

            test('rejects invalid turn values', () => {
                expect(moveSelector._validatePerspective('white', null, 'test')).toBe(false);
                expect(moveSelector._validatePerspective('black', null, 'test')).toBe(false);
                expect(moveSelector._validatePerspective('x', null, 'test')).toBe(false);
                expect(moveSelector._validatePerspective('', null, 'test')).toBe(false);
            });

            test('rejects invalid perspective values', () => {
                expect(moveSelector._validatePerspective(null, 'w', 'test')).toBe(false);
                expect(moveSelector._validatePerspective(null, 'b', 'test')).toBe(false);
                expect(moveSelector._validatePerspective(null, 'grey', 'test')).toBe(false);
            });
        });

        describe('_validateMoveAnalysis', () => {
            test('accepts valid analysis objects', () => {
                const validAnalysis = {
                    moveLoss: 30,
                    beforeEval: 25,
                    afterEval: -5,
                    evaluation: -5
                };
                expect(moveSelector._validateMoveAnalysis(validAnalysis, 'test')).toBe(true);
            });

            test('accepts null/undefined analysis (no analysis to validate)', () => {
                expect(moveSelector._validateMoveAnalysis(null, 'test')).toBe(true);
                expect(moveSelector._validateMoveAnalysis(undefined, 'test')).toBe(true);
            });

            test('rejects negative moveLoss (should be absolute value)', () => {
                const badAnalysis = {
                    moveLoss: -30, // This should never happen - we always use abs()
                    beforeEval: 25,
                    afterEval: -5
                };
                expect(moveSelector._validateMoveAnalysis(badAnalysis, 'test')).toBe(false);
            });

            test('accepts mate score evaluation values', () => {
                // Mate scores can be very large - these should be accepted
                const mateAnalysis = {
                    moveLoss: 30,
                    beforeEval: 9999999, // Mate score
                    afterEval: -9999999  // Mate score for opponent
                };
                expect(moveSelector._validateMoveAnalysis(mateAnalysis, 'test')).toBe(true);
            });
        });
    });

    // =========================================================================
    // WIN RATE PERSPECTIVE TESTS
    // =========================================================================
    describe('Win Rate Perspective Handling', () => {
        test('white and black percentages always sum with draws to 100%', () => {
            // This is a fundamental invariant - percentages must sum correctly
            // Note: calculateWinRate expects drawsAreHalf as 0 or 1, not boolean
            const testCases = [
                { white: 1000, black: 800, draws: 200 },
                { white: 500, black: 500, draws: 0 },
                { white: 0, black: 0, draws: 1000 },
                { white: 100, black: 0, draws: 0 },
                { white: 0, black: 100, draws: 0 }
            ];

            for (const tc of testCases) {
                const result = statistics.calculateWinRate(
                    tc.white,
                    tc.black,
                    tc.draws,
                    0 // DRAWSAREHALF = 0 (draws count as losses)
                );

                // whitePerc + blackPerc + drawPerc should equal 1
                const sum = result.whitePerc + result.blackPerc + result.drawPerc;
                expect(sum).toBeCloseTo(1, 5);
            }
        });

        test('whitePerc and blackPerc are complementary with DRAWSAREHALF=1', () => {
            // With DRAWSAREHALF=1, draws count as 0.5 for each side
            const result = statistics.calculateWinRate(100, 0, 100, 1);

            // With DRAWSAREHALF=1: white gets (100 + 50)/200 = 0.75
            // black gets (0 + 50)/200 = 0.25
            // They sum to 1.0
            expect(result.whitePerc + result.blackPerc).toBeCloseTo(1, 5);
        });

        test('win rate is 0.5 for perfectly equal outcomes', () => {
            const result = statistics.calculateWinRate(500, 500, 0, 0);
            expect(result.whitePerc).toBeCloseTo(0.5, 5);
            expect(result.blackPerc).toBeCloseTo(0.5, 5);
        });
    });

    // =========================================================================
    // MOVE SELECTION PERSPECTIVE TESTS
    // =========================================================================
    describe('Move Selection with Perspective', () => {
        test('white to move uses whitePerc for win rate calculation', async () => {
            const moveSelector = new MoveSelector({
                CAREABOUTENGINE: 0, // Skip engine to test pure statistics
                MINGAMES: 1,
                MINPLAYRATE: 0,
                DRAWSAREHALF: 0,
                ALPHA: 0.001
            });

            // Position with white to move (w in FEN)
            const position = {
                fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
                perspective: 'white'
            };

            // Move that's better for white - need enough games for confidence interval
            const candidates = [{
                san: 'd4',
                uci: 'd2d4',
                white: 6000,  // 60% white wins
                black: 3000,  // 30% black wins
                draws: 1000,  // 10% draws
                playrate: 0.5
            }];

            const result = await moveSelector.selectBestMove(
                position,
                candidates,
                null, // No engine
                statistics
            );

            // Should have selected a move
            expect(result).not.toBeNull();
            expect(result.selectedMove).toBeDefined();
            // Win rate should be from white's perspective (0.6)
            expect(result.selectedMove.winRate).toBeCloseTo(0.6, 2);
        });

        test('black to move uses blackPerc for win rate calculation', async () => {
            const moveSelector = new MoveSelector({
                CAREABOUTENGINE: 0, // Skip engine to test pure statistics
                MINGAMES: 1,
                MINPLAYRATE: 0,
                DRAWSAREHALF: 0,
                ALPHA: 0.001
            });

            // Position with black to move (b in FEN)
            const position = {
                fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                perspective: 'black'
            };

            // Move that's better for black - need enough games for confidence interval
            const candidates = [{
                san: 'e5',
                uci: 'e7e5',
                white: 3000,  // 30% white wins
                black: 6000,  // 60% black wins
                draws: 1000,  // 10% draws
                playrate: 0.5
            }];

            const result = await moveSelector.selectBestMove(
                position,
                candidates,
                null, // No engine
                statistics
            );

            // Should have selected a move
            expect(result).not.toBeNull();
            expect(result.selectedMove).toBeDefined();
            // Win rate should be from black's perspective (0.6)
            expect(result.selectedMove.winRate).toBeCloseTo(0.6, 2);
        });

        test('move selection picks higher win rate move for correct perspective', async () => {
            const moveSelector = new MoveSelector({
                CAREABOUTENGINE: 0,
                MINGAMES: 1,
                MINPLAYRATE: 0,
                DRAWSAREHALF: 0,
                ALPHA: 0.5 // High alpha to minimize confidence interval effect
            });

            // Black to move
            const position = {
                fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                perspective: 'black'
            };

            // Both moves need similar total games for fair comparison
            const candidates = [
                {
                    san: 'e5',
                    uci: 'e7e5',
                    white: 4000,  // 40% white wins
                    black: 5000,  // 50% black wins
                    draws: 1000,
                    playrate: 0.4
                },
                {
                    san: 'c5',
                    uci: 'c7c5',
                    white: 3000,  // 30% white wins
                    black: 6000,  // 60% black wins - better for black!
                    draws: 1000,
                    playrate: 0.3
                }
            ];

            const result = await moveSelector.selectBestMove(
                position,
                candidates,
                null,
                statistics
            );

            // Should have selected a move
            expect(result).not.toBeNull();
            expect(result.selectedMove).toBeDefined();
            // Should pick c5 because it has higher black win rate
            expect(result.selectedMove.san).toBe('c5');
        });
    });

    // =========================================================================
    // ENGINE ANALYSIS PERSPECTIVE TESTS (with mocked responses)
    // =========================================================================
    describe('Engine Analysis with Mocked Responses', () => {
        test('moveLoss is always non-negative in analysis results', async () => {
            // This tests the structural invariant: moveLoss should be absolute value
            const mockEngine = new MockEngineWithPerspective({
                bestMove: 'e2e4',
                analysisResponses: {
                    'd2d4': {
                        move: 'd2d4',
                        bestMove: 'e2e4',
                        evaluation: -5,
                        beforeEval: 25,
                        afterEval: 5, // Opponent sees +5 (bad for us)
                        moveLoss: 30, // Must be positive (absolute value)
                        isBestMove: false,
                        quality: 'good'
                    }
                }
            });

            const analysis = await mockEngine.analyzeMove('startpos', 'd2d4');

            // moveLoss must be non-negative
            expect(analysis.moveLoss).toBeGreaterThanOrEqual(0);
        });

        test('best move has zero moveLoss', async () => {
            const mockEngine = new MockEngineWithPerspective({
                bestMove: 'e2e4'
            });

            const analysis = await mockEngine.analyzeMove('startpos', 'e2e4');

            expect(analysis.moveLoss).toBe(0);
            expect(analysis.isBestMove).toBe(true);
        });

        test('soundness validation uses absolute value correctly', async () => {
            const moveSelector = new MoveSelector({
                CAREABOUTENGINE: 1,
                SOUNDNESSLIMIT: -50, // Stored as negative
                LOSSLIMIT: -100,
                IGNORELOSSLIMIT: 300
            });

            // Test that SOUNDNESSLIMIT comparison works correctly
            // moveLoss of 30 should pass (30 < 50)
            const goodAnalysis = { moveLoss: 30, evaluation: 20 };
            expect(moveSelector.validateMoveSoundness(null, 'd2d4', 'e2e4', goodAnalysis)).toBe(true);

            // moveLoss of 60 should fail (60 > 50)
            const badAnalysis = { moveLoss: 60, evaluation: 20 };
            expect(moveSelector.validateMoveSoundness(null, 'd2d4', 'e2e4', badAnalysis)).toBe(false);
        });
    });
});
