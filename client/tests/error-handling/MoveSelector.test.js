/**
 * Test suite for MoveSelector error handling - Engine Validation Failures
 */

import MoveSelector from '../../src/algorithm/MoveSelector.js';

describe('MoveSelector Error Handling', () => {
    let moveSelector;
    let mockEngineClient;

    beforeEach(() => {
        mockEngineClient = {
            analyzePosition: jest.fn()
        };
    });

    describe('Engine Validation Failures When CAREABOUTENGINE=1', () => {
        beforeEach(() => {
            moveSelector = new MoveSelector({
                CAREABOUTENGINE: 1,
                SOUNDNESSLIMIT: -50
            });
        });

        it('throws error when all moves fail engine validation', async () => {
            const mockCandidates = [
                { san: 'e4', uci: 'e2e4', winrate: 0.55, playrate: 0.3, white: 100, black: 80, draws: 20 },
                { san: 'Nf3', uci: 'g1f3', winrate: 0.52, playrate: 0.2, white: 80, black: 70, draws: 10 }
            ];

            // Mock engine with proper methods that rejects all candidate moves
            const mockEngine = {
                getBestMove: jest.fn().mockResolvedValue('d2d4'),  // Engine best is different from candidates
                evaluatePosition: jest.fn().mockResolvedValue(50),
                analyzeMove: jest.fn().mockResolvedValue({ moveLoss: 200, evaluation: -150 })  // High loss = rejected
            };

            // Mock statisticsEngine with validateMoveDataQuality method
            const mockStatisticsEngine = {
                selectBestMove: jest.fn().mockReturnValue(mockCandidates[0]),
                validateMoveDataQuality: jest.fn().mockReturnValue(true),
                calculateWinRate: jest.fn().mockReturnValue({ whitePerc: 0.5, blackPerc: 0.4, drawPerc: 0.1 }),
                calculateConfidenceInterval: jest.fn().mockReturnValue({ lowerBound: 0.45, upperBound: 0.55 })
            };

            const mockPosition = {
                fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
            };

            // MoveSelector now throws when all candidates are rejected by engine
            // (removed silent fallback behavior)
            await expect(
                moveSelector.selectBestMove(mockPosition, mockCandidates, mockEngine, mockStatisticsEngine)
            ).rejects.toThrow('Engine rejected all');
        });

        it('includes candidate count in result when engine filters moves', async () => {
            const mockCandidates = [
                { san: 'e4', winrate: 0.55, playrate: 0.3, white: 100, black: 80, draws: 20 },
                { san: 'Nf3', winrate: 0.52, playrate: 0.2, white: 80, black: 70, draws: 10 },
                { san: 'd4', winrate: 0.51, playrate: 0.15, white: 70, black: 60, draws: 15 }
            ];

            // Mock statisticsEngine with validateMoveDataQuality method
            const mockStatisticsEngine = {
                validateMoveDataQuality: jest.fn().mockReturnValue(true),
                calculateWinRate: jest.fn().mockReturnValue({ whitePerc: 0.5, blackPerc: 0.4, drawPerc: 0.1 }),
                calculateConfidenceInterval: jest.fn().mockReturnValue({ lowerBound: 0.45, upperBound: 0.55 })
            };

            const mockPosition = {
                fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
            };

            // The implementation falls back to statistical selection, so verify the result structure
            const result = await moveSelector.selectBestMove(mockPosition, mockCandidates, null, mockStatisticsEngine);

            expect(result).toBeDefined();
            expect(result.candidateCount).toBe(3);
        });
    });

    describe('Valid Engine Scenarios When CAREABOUTENGINE=1', () => {
        beforeEach(() => {
            moveSelector = new MoveSelector({
                CAREABOUTENGINE: 1,
                SOUNDNESSLIMIT: -50,
                LAZY_ENGINE: 0  // Use legacy batch path for these tests (they mock internal methods)
            });
        });

        it('accepts when some moves pass engine validation', async () => {
            const mockCandidates = [
                { san: 'e4', winrate: 0.55, playrate: 0.3, white: 100, black: 80, draws: 20 },
                { san: 'Nf3', winrate: 0.52, playrate: 0.2, white: 80, black: 70, draws: 10 }
            ];

            // One move passes engine validation
            const mockEngineAnalysis = {
                bestMove: 'e4',
                moveAnalyses: [
                    { move: 'e4', centipawns: -20 }, // Above SOUNDNESSLIMIT
                    { move: 'Nf3', centipawns: -100 } // Below SOUNDNESSLIMIT
                ]
            };

            // Mock statisticsEngine with validateMoveDataQuality method
            const mockStatisticsEngine = {
                validateMoveDataQuality: jest.fn().mockReturnValue(true),
                calculateWinRate: jest.fn().mockReturnValue({ whitePerc: 0.5, blackPerc: 0.4, drawPerc: 0.1 }),
                calculateConfidenceInterval: jest.fn().mockReturnValue({ lowerBound: 0.45, upperBound: 0.55 })
            };

            moveSelector._getEngineAnalysis = jest.fn().mockResolvedValue(mockEngineAnalysis);
            moveSelector._filterCandidatesByEngine = jest.fn().mockReturnValue([mockCandidates[0]]);
            moveSelector._selectByStatistics = jest.fn().mockReturnValue(mockCandidates[0]);

            const result = await moveSelector.selectBestMove({ fen: 'test-fen' }, mockCandidates, mockEngineClient, mockStatisticsEngine);

            expect(result.selectedMove).toBe(mockCandidates[0]);
            expect(moveSelector._filterCandidatesByEngine).toHaveBeenCalled();
        });
    });

    describe('Valid Fallback When CAREABOUTENGINE=0', () => {
        beforeEach(() => {
            moveSelector = new MoveSelector({
                CAREABOUTENGINE: 0,
                SOUNDNESSLIMIT: -50
            });
        });

        it('accepts statistical selection when engine analysis disabled', async () => {
            const mockCandidates = [
                { san: 'e4', winrate: 0.55, playrate: 0.3, white: 100, black: 80, draws: 20 },
                { san: 'Nf3', winrate: 0.52, playrate: 0.2, white: 80, black: 70, draws: 10 }
            ];

            // Mock statisticsEngine with validateMoveDataQuality method
            const mockStatisticsEngine = {
                validateMoveDataQuality: jest.fn().mockReturnValue(true),
                calculateWinRate: jest.fn().mockReturnValue({ whitePerc: 0.5, blackPerc: 0.4, drawPerc: 0.1 }),
                calculateConfidenceInterval: jest.fn().mockReturnValue({ lowerBound: 0.45, upperBound: 0.55 })
            };

            moveSelector._selectByStatistics = jest.fn().mockReturnValue(mockCandidates[0]);

            const result = await moveSelector.selectBestMove({ fen: 'test-fen' }, mockCandidates, null, mockStatisticsEngine);

            // Should not throw - engine analysis not required
            expect(result.selectedMove).toBe(mockCandidates[0]);
            expect(moveSelector._selectByStatistics).toHaveBeenCalled();
        });
    });

    describe('Mate Scenario Handling', () => {
        let moveSelector;

        beforeEach(() => {
            moveSelector = new MoveSelector({
                CAREABOUTENGINE: 1,
                SOUNDNESSLIMIT: -99
            });
        });

        it('accepts move leading to mate when position was already a forced mate', () => {
            // Scenario: Position is already lost (forced mate against us).
            // Our move also leads to mate, but that's fine - we can't do better.
            // The bug: code referenced moveAnalysis.bestEvaluation which doesn't exist.
            // Fix: should use moveAnalysis.beforeEval instead.

            const MATE_SCORE = -10000000; // Represents mate against us

            const moveAnalysis = {
                evaluation: MATE_SCORE,      // After our move: we get mated
                beforeEval: MATE_SCORE,      // Before our move: already forced mate
                moveLoss: 0,                 // No loss - position was already lost
                quality: 'forced'
            };

            // This should return true: forced mate, nothing we can do
            const result = moveSelector._handleMateScenarios(moveAnalysis);

            expect(result).toBe(true);
        });

        it('rejects move leading to mate when mate was avoidable', () => {
            // Scenario: Position was fine, but our move blunders into mate.
            // beforeEval is normal (not mate), but evaluation after move is mate.

            const MATE_SCORE = -10000000;
            const NORMAL_EVAL = -50; // Slightly worse but not mate

            const moveAnalysis = {
                evaluation: MATE_SCORE,      // After our move: we get mated
                beforeEval: NORMAL_EVAL,     // Before our move: position was fine
                moveLoss: 9999950,           // Huge loss
                quality: 'blunder'
            };

            // This should return false: we blundered into an avoidable mate
            const result = moveSelector._handleMateScenarios(moveAnalysis);

            expect(result).toBe(false);
        });

        it('accepts move that gives us mate', () => {
            // Scenario: Our move delivers checkmate. Always accept!

            const MATE_SCORE = 10000000; // Mate in our favor

            const moveAnalysis = {
                evaluation: MATE_SCORE,      // After our move: we deliver mate
                beforeEval: 100,             // Before: we were winning
                moveLoss: 0,
                quality: 'checkmate'
            };

            const result = moveSelector._handleMateScenarios(moveAnalysis);

            expect(result).toBe(true);
        });
    });
});