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
        const afterEvalOurs = isBestMove ? baseEval : baseEval - 30;
        const signedMoveLoss = afterEvalOurs - baseEval;

        return {
            move,
            bestMove: this.bestMove,
            evaluation: -afterEvalOurs,
            afterEval: -afterEvalOurs,
            beforeEval: baseEval,
            afterEvalOurs,
            signedMoveLoss,
            bestEvaluation: baseEval,
            moveLoss: Math.abs(signedMoveLoss),
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

            // Engine-best always passes regardless of analysis content.
            const goodAnalysis = {
                evaluation: -25, afterEval: -25, beforeEval: 25,
                afterEvalOurs: 25, signedMoveLoss: 0,
                bestEvaluation: 30, moveLoss: 0
            };

            const isGoodSound = await moveSelector.validateMoveSoundness(
                fen,
                'e2e4',
                'e2e4',
                goodAnalysis
            );
            expect(isGoodSound).toBe(true);

            // Non-best move with afterEvalOurs below SOUNDNESSLIMIT (-50) → fail.
            const badAnalysis = {
                evaluation: 60, afterEval: 60, beforeEval: 10,
                afterEvalOurs: -60, signedMoveLoss: -70,
                bestEvaluation: 30, moveLoss: 70
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

            // signedMoveLoss -50 < LOSSLIMIT -30, afterEvalOurs 50 below IGNORE → fail.
            const lowEvalAnalysis = {
                evaluation: -50, afterEval: -50, beforeEval: 100,
                afterEvalOurs: 50, signedMoveLoss: -50,
                bestEvaluation: 100, moveLoss: 50
            };

            const shouldFail = await selector.validateMoveSoundness(
                'test-fen',
                'move1',
                'best-move',
                lowEvalAnalysis
            );
            expect(shouldFail).toBe(false);

            // afterEvalOurs 250 > IGNORELOSSLIMIT 200 → all gates relaxed.
            const highEvalAnalysis = {
                evaluation: -250, afterEval: -250, beforeEval: 300,
                afterEvalOurs: 250, signedMoveLoss: -50,
                bestEvaluation: 300, moveLoss: 50
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
    // SOUNDNESS BOUNDARY EDGE CASES
    // =========================================================================
    // Verifies the new Python-parity semantics:
    //   SOUNDNESSLIMIT = absolute eval floor (our POV; negative = looser)
    //   LOSSLIMIT     = signed delta vs engine-best (negative = looser)
    //   IGNORELOSSLIMIT = if afterEvalOurs > this, relax all gates
    describe('Soundness Boundary Edge Cases', () => {

        const makeAnalysis = (afterEvalOurs, signedMoveLoss) => ({
            afterEvalOurs,
            signedMoveLoss,
            evaluation: -afterEvalOurs,
            afterEval: -afterEvalOurs,
            beforeEval: afterEvalOurs - signedMoveLoss,
            moveLoss: Math.abs(signedMoveLoss)
        });

        describe('SOUNDNESSLIMIT (eval floor)', () => {
            test('afterEvalOurs above floor passes', () => {
                const selector = new MoveSelector({
                    CAREABOUTENGINE: 1,
                    SOUNDNESSLIMIT: -50, LOSSLIMIT: -100, IGNORELOSSLIMIT: 300
                });
                expect(selector.validateMoveSoundness(null, 'd2d4', 'e2e4',
                    makeAnalysis(-40, -30))).toBe(true);
            });

            test('afterEvalOurs at floor fails (strict >)', () => {
                const selector = new MoveSelector({
                    CAREABOUTENGINE: 1,
                    SOUNDNESSLIMIT: -50, LOSSLIMIT: -100, IGNORELOSSLIMIT: 300
                });
                expect(selector.validateMoveSoundness(null, 'd2d4', 'e2e4',
                    makeAnalysis(-50, -30))).toBe(false);
            });

            test('afterEvalOurs below floor fails', () => {
                const selector = new MoveSelector({
                    CAREABOUTENGINE: 1,
                    SOUNDNESSLIMIT: -50, LOSSLIMIT: -100, IGNORELOSSLIMIT: 300
                });
                expect(selector.validateMoveSoundness(null, 'd2d4', 'e2e4',
                    makeAnalysis(-80, -30))).toBe(false);
            });
        });

        describe('LOSSLIMIT with IGNORELOSSLIMIT', () => {
            test('signedMoveLoss below LOSSLIMIT fails when not winning', () => {
                const selector = new MoveSelector({
                    CAREABOUTENGINE: 1,
                    SOUNDNESSLIMIT: -50, LOSSLIMIT: -30, IGNORELOSSLIMIT: 300
                });
                expect(selector.validateMoveSoundness(null, 'd2d4', 'e2e4',
                    makeAnalysis(-40, -40))).toBe(false);
            });

            test('LOSSLIMIT ignored when afterEvalOurs > IGNORELOSSLIMIT', () => {
                const selector = new MoveSelector({
                    CAREABOUTENGINE: 1,
                    SOUNDNESSLIMIT: -50, LOSSLIMIT: -30, IGNORELOSSLIMIT: 300
                });
                expect(selector.validateMoveSoundness(null, 'd2d4', 'e2e4',
                    makeAnalysis(350, -40))).toBe(true);
            });

            test('large negative eval does NOT trigger IGNORELOSSLIMIT (sign-correct)', () => {
                const selector = new MoveSelector({
                    CAREABOUTENGINE: 1,
                    SOUNDNESSLIMIT: -50, LOSSLIMIT: -30, IGNORELOSSLIMIT: 300
                });
                expect(selector.validateMoveSoundness(null, 'd2d4', 'e2e4',
                    makeAnalysis(-350, -40))).toBe(false);
            });
        });

        describe('Engine best move bypass', () => {
            test('engine best move always passes regardless of config', () => {
                const strictSelector = new MoveSelector({
                    CAREABOUTENGINE: 1,
                    SOUNDNESSLIMIT: -10, LOSSLIMIT: -5, IGNORELOSSLIMIT: 1000
                });
                expect(strictSelector.validateMoveSoundness(null, 'e2e4', 'e2e4',
                    makeAnalysis(-500, -100))).toBe(true);
            });
        });

        describe('CAREABOUTENGINE=0 bypass', () => {
            test('all moves pass when CAREABOUTENGINE is 0', () => {
                const noEngineSelector = new MoveSelector({
                    CAREABOUTENGINE: 0,
                    SOUNDNESSLIMIT: -10, LOSSLIMIT: -5, IGNORELOSSLIMIT: 1000
                });
                expect(noEngineSelector.validateMoveSoundness(null, 'd2d4', 'e2e4',
                    makeAnalysis(-1000, -500))).toBe(true);
            });
        });

        describe('Missing analysis handling (fail-closed)', () => {
            test('null analysis rejects when not engine-best', () => {
                const selector = new MoveSelector({
                    CAREABOUTENGINE: 1,
                    SOUNDNESSLIMIT: -50, LOSSLIMIT: -100, IGNORELOSSLIMIT: 300
                });
                expect(selector.validateMoveSoundness(null, 'd2d4', 'e2e4', null)).toBe(false);
            });

            test('undefined analysis rejects when not engine-best', () => {
                const selector = new MoveSelector({
                    CAREABOUTENGINE: 1,
                    SOUNDNESSLIMIT: -50, LOSSLIMIT: -100, IGNORELOSSLIMIT: 300
                });
                expect(selector.validateMoveSoundness(null, 'd2d4', 'e2e4', undefined)).toBe(false);
            });

            test('analysis missing new fields rejects (fail-closed)', () => {
                const selector = new MoveSelector({
                    CAREABOUTENGINE: 1,
                    SOUNDNESSLIMIT: -50, LOSSLIMIT: -100, IGNORELOSSLIMIT: 300
                });
                expect(selector.validateMoveSoundness(null, 'd2d4', 'e2e4',
                    { moveLoss: 10, evaluation: 20 })).toBe(false);
            });
        });
    });
});
