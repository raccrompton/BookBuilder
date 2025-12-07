/**
 * MoveSelector Tests - Step 4 Implementation
 * Tests engine-validated move filtering and selection logic
 */

import MoveSelector from '../src/algorithm/MoveSelector.js';
import Statistics from '../src/stats/Statistics.js';
import { TestUtils } from './testUtils.js';

// Mock engine client for testing
class MockEngineClient {
    constructor(bestMove = 'e2e4', evaluations = {}) {
        this.bestMove = bestMove;
        this.evaluations = evaluations;
    }

    async getBestMove(_fen) {
        return this.bestMove;
    }

    async evaluatePosition(fen) {
        return this.evaluations[fen] || 25; // Slight advantage
    }

    async analyzeMove(fen, move) {
        const baseEval = this.evaluations[fen] || 25;
        const isBestMove = move === this.bestMove;

        return {
            move,
            bestMove: this.bestMove,
            evaluation: isBestMove ? baseEval : baseEval - 30,
            bestEvaluation: baseEval,
            moveLoss: isBestMove ? 0 : 30,
            isBestMove,
            quality: isBestMove ? 'excellent' : 'good'
        };
    }
}

describe('MoveSelector - Step 4: Move Selection Algorithm', () => {
    let moveSelector;
    let statistics;
    let mockEngine;

    beforeEach(() => {
        const config = TestUtils.createTestConfig({
            CAREABOUTENGINE: 1,
            SOUNDNESSLIMIT: -50,
            LOSSLIMIT: -100,
            IGNORELOSSLIMIT: 300,
            perspective: 'white'
        });

        moveSelector = new MoveSelector(config);
        statistics = new Statistics();
        mockEngine = new MockEngineClient('e2e4');
    });

    describe('Basic Move Selection', () => {
        test('selects best statistical move with engine validation', async () => {
            const position = { fen: TestUtils.createTestPosition('starting').fen };
            const candidates = [
                {
                    san: 'e4',
                    uci: 'e2e4',
                    white: 1000000,
                    black: 800000,
                    draws: 200000,
                    playrate: 0.4
                },
                {
                    san: 'd4',
                    uci: 'd2d4',
                    white: 900000,
                    black: 750000,
                    draws: 150000,
                    playrate: 0.35
                },
                {
                    san: 'Nf3',
                    uci: 'g1f3',
                    white: 500000,
                    black: 450000,
                    draws: 50000,
                    playrate: 0.2
                }
            ];

            const result = await moveSelector.selectBestMove(
                position,
                candidates,
                mockEngine,
                statistics
            );

            expect(result).toBeDefined();
            expect(result.selectedMove).toBeDefined();
            expect(result.selectedMove.san).toBe('e4'); // Should select engine's best move
            expect(result.engineAnalysis).toBeDefined();
            expect(result.candidateCount).toBe(3);
            expect(result.selectionReason).toContain('Engine best move');
        });

        test('selects statistically best move when engine disabled', async () => {
            const config = TestUtils.createTestConfig({
                CAREABOUTENGINE: 0,
                perspective: 'white'
            });
            const selector = new MoveSelector(config);

            const position = { fen: TestUtils.createTestPosition('starting').fen };
            const candidates = [
                {
                    san: 'e4',
                    uci: 'e2e4',
                    white: 1000000,
                    black: 700000,
                    draws: 100000,
                    playrate: 0.4
                },
                {
                    san: 'd4',
                    uci: 'd2d4',
                    white: 1200000, // Higher win rate
                    black: 600000,
                    draws: 100000,
                    playrate: 0.35
                }
            ];

            const result = await selector.selectBestMove(
                position,
                candidates,
                null, // No engine
                statistics
            );

            expect(result.selectedMove.san).toBe('d4'); // Better statistical choice
            expect(result.engineAnalysis).toBeNull();
            expect(result.selectionReason).toContain('no engine validation');
        });
    });

    describe('Engine Validation', () => {
        test('validates move soundness against engine limits', async () => {
            const fen = TestUtils.createTestPosition('starting').fen;

            // Test move that passes soundness check
            const goodAnalysis = {
                evaluation: 25,
                bestEvaluation: 30,
                moveLoss: 5
            };

            const isGoodSound = await moveSelector.validateMoveSoundness(
                fen,
                'e2e4',
                'e2e4',
                goodAnalysis
            );
            expect(isGoodSound).toBe(true);

            // Test move that fails soundness check
            const badAnalysis = {
                evaluation: -25,
                bestEvaluation: 30,
                moveLoss: 55 // Exceeds SOUNDNESSLIMIT of 50
            };

            const isBadSound = await moveSelector.validateMoveSoundness(
                fen,
                'a2a4',
                'e2e4',
                badAnalysis
            );
            expect(isBadSound).toBe(false);
        });

        test('handles mate scenarios correctly', async () => {
            const mateEngine = new MockEngineClient('h5h8', {
                'test-fen': 9999999999 // Mate score
            });

            const position = { fen: 'test-fen' };
            const candidates = [
                {
                    san: 'Qh8#',
                    uci: 'h5h8',
                    white: 100,
                    black: 0,
                    draws: 0,
                    playrate: 1.0
                }
            ];

            const result = await moveSelector.selectBestMove(
                position,
                candidates,
                mateEngine,
                statistics
            );

            expect(result.selectedMove.san).toBe('Qh8#');
            expect(result.engineAnalysis.positionEval).toBe(9999999999);
        });

        test('applies loss limit with ignore threshold', async () => {
            const config = TestUtils.createTestConfig({
                LOSSLIMIT: -30,
                IGNORELOSSLIMIT: 200,
                SOUNDNESSLIMIT: -99
            });
            const selector = new MoveSelector(config);

            // Move with high loss but below ignore threshold - should fail
            const lowEvalAnalysis = {
                evaluation: 50, // Below ignore threshold
                bestEvaluation: 100,
                moveLoss: 50 // Exceeds loss limit
            };

            const shouldFail = await selector.validateMoveSoundness(
                'test-fen',
                'move1',
                'best-move',
                lowEvalAnalysis
            );
            expect(shouldFail).toBe(false);

            // Move with high loss but above ignore threshold - should pass
            const highEvalAnalysis = {
                evaluation: 250, // Above ignore threshold
                bestEvaluation: 300,
                moveLoss: 50 // Same loss but threshold applies
            };

            const shouldPass = await selector.validateMoveSoundness(
                'test-fen',
                'move2',
                'best-move',
                highEvalAnalysis
            );
            expect(shouldPass).toBe(true);
        });
    });

    describe('Data Quality Filtering', () => {
        test('filters moves by minimum games and play rate', async () => {
            const position = { fen: TestUtils.createTestPosition('starting').fen };
            const candidates = [
                {
                    san: 'e4',
                    uci: 'e2e4',
                    white: 100000,
                    black: 80000,
                    draws: 20000,
                    playrate: 0.5 // Good play rate
                },
                {
                    san: 'a3',
                    uci: 'a2a3',
                    white: 10, // Too few games
                    black: 5,
                    draws: 0,
                    playrate: 0.002 // Too low play rate
                }
            ];

            const result = await moveSelector.selectBestMove(
                position,
                candidates,
                mockEngine,
                statistics
            );

            expect(result.qualityFiltered).toBe(1); // One move filtered out
            expect(result.selectedMove.san).toBe('e4'); // Only valid move
        });
    });

    describe('Statistical Analysis', () => {
        test('calculates confidence intervals for move selection', async () => {
            const config = TestUtils.createTestConfig({
                CAREABOUTENGINE: 0,
                ALPHA: 0.001,
                perspective: 'white'
            });
            const selector = new MoveSelector(config);

            const position = { fen: TestUtils.createTestPosition('starting').fen };
            const candidates = [
                {
                    san: 'e4',
                    uci: 'e2e4',
                    white: 100000,
                    black: 80000,
                    draws: 20000,
                    playrate: 0.4
                }
            ];

            const result = await selector.selectBestMove(
                position,
                candidates,
                null,
                statistics
            );

            expect(result.selectedMove.confidence).toBeDefined();
            expect(result.selectedMove.confidence.winRate).toBeCloseTo(0.5, 2); // 100k/(100k+80k+20k)
            expect(result.selectedMove.confidence.lowerBound).toBeLessThan(result.selectedMove.winRate);
            expect(result.selectedMove.confidence.upperBound).toBeGreaterThan(result.selectedMove.winRate);
        });

        test('handles perspective correctly for black moves', async () => {
            const config = TestUtils.createTestConfig({
                CAREABOUTENGINE: 0,
                perspective: 'black'
            });
            const selector = new MoveSelector(config);

            // Use a FEN where black is to move (note 'b' for black's turn)
            // Position after 1.e4 - black to respond
            const position = { fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1' };
            const candidates = [
                {
                    san: 'e5',
                    uci: 'e7e5',
                    white: 800000, // White wins
                    black: 1000000, // Black wins - what we care about from black's perspective
                    draws: 200000,
                    playrate: 0.4
                }
            ];

            const result = await selector.selectBestMove(
                position,
                candidates,
                null,
                statistics
            );

            // Should calculate win rate from black's perspective (black to move)
            // blackPerc = 1M/(0.8M+1M+0.2M) = 0.5
            expect(result.selectedMove.winRate).toBeCloseTo(0.5, 2);
        });
    });

    describe('Error Handling', () => {
        test('handles empty candidate list gracefully', async () => {
            const position = { fen: TestUtils.createTestPosition('starting').fen };
            const result = await moveSelector.selectBestMove(
                position,
                [],
                mockEngine,
                statistics
            );

            expect(result).toBeNull();
        });

        test('propagates engine errors to caller', async () => {
            // Engine errors should propagate - no silent fallback
            const errorEngine = {
                getBestMove: async () => { throw new Error('Engine failed'); },
                analyzeMove: async () => { throw new Error('Analysis failed'); },
                evaluatePosition: async () => { throw new Error('Evaluation failed'); }
            };

            const position = { fen: TestUtils.createTestPosition('starting').fen };
            const candidates = [
                {
                    san: 'e4',
                    uci: 'e2e4',
                    white: 100000,
                    black: 80000,
                    draws: 20000,
                    playrate: 0.4
                }
            ];

            // Engine errors should now throw instead of silently falling back
            await expect(
                moveSelector.selectBestMove(
                    position,
                    candidates,
                    errorEngine,
                    statistics
                )
            ).rejects.toThrow('Engine failed');
        });
    });

    describe('Integration with Golden Master Logic', () => {
        test('move selection matches Python logic patterns', async () => {
            // Test using realistic data from golden master
            const position = { fen: TestUtils.createTestPosition('ruy-lopez').fen };
            const candidates = [
                {
                    san: 'Nf6',
                    uci: 'g8f6',
                    white: 995618,
                    black: 831254,
                    draws: 199380,
                    playrate: 0.2028
                },
                {
                    san: 'a6',
                    uci: 'a7a6',
                    white: 1121054,
                    black: 917236,
                    draws: 508652,
                    playrate: 0.2583
                }
            ];

            const result = await moveSelector.selectBestMove(
                position,
                candidates,
                mockEngine,
                statistics
            );

            // Should select move with better confidence interval lower bound
            expect(result.selectedMove).toBeDefined();
            expect(['Nf6', 'a6']).toContain(result.selectedMove.san);
            expect(result.selectedMove.confidence.lowerBound).toBeGreaterThan(0.4);
        });
    });

    // =========================================================================
    // CENTIPAWN BOUNDARY EDGE CASES
    // =========================================================================
    // These tests verify the soundness limit logic handles boundary conditions
    // correctly. We use mocked analysis to get deterministic results.
    describe('Centipawn Boundary Edge Cases', () => {

        describe('SOUNDNESSLIMIT boundary', () => {
            test('moveLoss exactly at SOUNDNESSLIMIT passes', () => {
                // SOUNDNESSLIMIT is -50, so Math.abs gives 50
                // moveLoss of exactly 50 should pass (not greater than 50)
                const selectorWithLimit = new MoveSelector({
                    CAREABOUTENGINE: 1,
                    SOUNDNESSLIMIT: -50,
                    LOSSLIMIT: -100,
                    IGNORELOSSLIMIT: 300
                });

                const analysis = { moveLoss: 50, evaluation: 20 };
                const result = selectorWithLimit.validateMoveSoundness(
                    null, 'd2d4', 'e2e4', analysis
                );

                expect(result).toBe(true);
            });

            test('moveLoss just above SOUNDNESSLIMIT fails', () => {
                const selectorWithLimit = new MoveSelector({
                    CAREABOUTENGINE: 1,
                    SOUNDNESSLIMIT: -50,
                    LOSSLIMIT: -100,
                    IGNORELOSSLIMIT: 300
                });

                const analysis = { moveLoss: 51, evaluation: 20 };
                const result = selectorWithLimit.validateMoveSoundness(
                    null, 'd2d4', 'e2e4', analysis
                );

                expect(result).toBe(false);
            });

            test('moveLoss of zero always passes SOUNDNESSLIMIT', () => {
                const selectorWithLimit = new MoveSelector({
                    CAREABOUTENGINE: 1,
                    SOUNDNESSLIMIT: -50,
                    LOSSLIMIT: -100,
                    IGNORELOSSLIMIT: 300
                });

                const analysis = { moveLoss: 0, evaluation: 20 };
                const result = selectorWithLimit.validateMoveSoundness(
                    null, 'd2d4', 'e2e4', analysis
                );

                expect(result).toBe(true);
            });
        });

        describe('LOSSLIMIT with IGNORELOSSLIMIT', () => {
            test('moveLoss above LOSSLIMIT fails when eval below IGNORELOSSLIMIT', () => {
                const selector = new MoveSelector({
                    CAREABOUTENGINE: 1,
                    SOUNDNESSLIMIT: -50,
                    LOSSLIMIT: -30, // Stricter than SOUNDNESSLIMIT
                    IGNORELOSSLIMIT: 300
                });

                // moveLoss 40 > LOSSLIMIT 30, but passes SOUNDNESSLIMIT 50
                // eval 100 < IGNORELOSSLIMIT 300, so should fail
                const analysis = { moveLoss: 40, evaluation: 100 };
                const result = selector.validateMoveSoundness(
                    null, 'd2d4', 'e2e4', analysis
                );

                expect(result).toBe(false);
            });

            test('moveLoss above LOSSLIMIT passes when eval above IGNORELOSSLIMIT', () => {
                const selector = new MoveSelector({
                    CAREABOUTENGINE: 1,
                    SOUNDNESSLIMIT: -50,
                    LOSSLIMIT: -30,
                    IGNORELOSSLIMIT: 300
                });

                // moveLoss 40 > LOSSLIMIT 30, but passes SOUNDNESSLIMIT 50
                // eval 350 > IGNORELOSSLIMIT 300, so should pass (we're winning big)
                const analysis = { moveLoss: 40, evaluation: 350 };
                const result = selector.validateMoveSoundness(
                    null, 'd2d4', 'e2e4', analysis
                );

                expect(result).toBe(true);
            });

            test('negative eval magnitude is used for IGNORELOSSLIMIT check', () => {
                // When we're losing badly, absolute value of eval is compared
                const selector = new MoveSelector({
                    CAREABOUTENGINE: 1,
                    SOUNDNESSLIMIT: -50,
                    LOSSLIMIT: -30,
                    IGNORELOSSLIMIT: 300
                });

                // eval -350 has absolute value 350 > 300, so should pass
                const analysis = { moveLoss: 40, evaluation: -350 };
                const result = selector.validateMoveSoundness(
                    null, 'd2d4', 'e2e4', analysis
                );

                expect(result).toBe(true);
            });
        });

        describe('Engine best move bypass', () => {
            test('engine best move always passes regardless of config', () => {
                const strictSelector = new MoveSelector({
                    CAREABOUTENGINE: 1,
                    SOUNDNESSLIMIT: -10, // Very strict
                    LOSSLIMIT: -5,
                    IGNORELOSSLIMIT: 1000
                });

                // Even with "bad" analysis, if it's the best move, it passes
                const analysis = { moveLoss: 100, evaluation: -500 };
                const result = strictSelector.validateMoveSoundness(
                    null, 'e2e4', 'e2e4', analysis // move === engineBestMove
                );

                expect(result).toBe(true);
            });
        });

        describe('CAREABOUTENGINE=0 bypass', () => {
            test('all moves pass when CAREABOUTENGINE is 0', () => {
                const noEngineSelector = new MoveSelector({
                    CAREABOUTENGINE: 0, // Skip engine validation
                    SOUNDNESSLIMIT: -10,
                    LOSSLIMIT: -5,
                    IGNORELOSSLIMIT: 1000
                });

                // Even terrible analysis should pass
                const terribleAnalysis = { moveLoss: 500, evaluation: -1000 };
                const result = noEngineSelector.validateMoveSoundness(
                    null, 'd2d4', 'e2e4', terribleAnalysis
                );

                expect(result).toBe(true);
            });
        });

        describe('Missing analysis handling', () => {
            test('null analysis treated as zero moveLoss', () => {
                const selector = new MoveSelector({
                    CAREABOUTENGINE: 1,
                    SOUNDNESSLIMIT: -50,
                    LOSSLIMIT: -100,
                    IGNORELOSSLIMIT: 300
                });

                // null analysis means moveLoss defaults to 0
                const result = selector.validateMoveSoundness(
                    null, 'd2d4', 'e2e4', null
                );

                expect(result).toBe(true);
            });

            test('undefined analysis treated as zero moveLoss', () => {
                const selector = new MoveSelector({
                    CAREABOUTENGINE: 1,
                    SOUNDNESSLIMIT: -50,
                    LOSSLIMIT: -100,
                    IGNORELOSSLIMIT: 300
                });

                const result = selector.validateMoveSoundness(
                    null, 'd2d4', 'e2e4', undefined
                );

                expect(result).toBe(true);
            });
        });
    });
});
