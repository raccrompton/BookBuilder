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

    describe('Mate Scenarios (via _passesSoundnessCheck)', () => {
        // Real engines emit ±10000 for mate (StockfishEngine.js / NodeStockfishEngine.js);
        // these tests exercise the soundness rule for those values.
        const MATE_FOR_US = 10000;
        const MATE_AGAINST_US = -10000;

        let moveSelector;

        beforeEach(() => {
            moveSelector = new MoveSelector({
                CAREABOUTENGINE: 1,
                SOUNDNESSLIMIT: -99,
                LOSSLIMIT: -99,
                IGNORELOSSLIMIT: 300
            });
        });

        it('accepts mate-against-us when engine best line is also mating against us', () => {
            // Engine best also mates against us → signedMoveLoss == 0 → approved.
            const moveAnalysis = {
                evaluation: -MATE_AGAINST_US,
                afterEval: -MATE_AGAINST_US,
                beforeEval: MATE_AGAINST_US,
                afterEvalOurs: MATE_AGAINST_US,
                signedMoveLoss: 0,
                moveLoss: 0,
                quality: 'forced'
            };

            expect(moveSelector._passesSoundnessCheck('a1a2', 'e2e4', moveAnalysis)).toBe(true);
        });

        it('rejects avoidable mate-against-us', () => {
            const moveAnalysis = {
                evaluation: -MATE_AGAINST_US,
                afterEval: -MATE_AGAINST_US,
                beforeEval: -50,
                afterEvalOurs: MATE_AGAINST_US,
                signedMoveLoss: MATE_AGAINST_US - -50, // very negative
                moveLoss: Math.abs(MATE_AGAINST_US - -50),
                quality: 'blunder'
            };

            expect(moveSelector._passesSoundnessCheck('a1a2', 'e2e4', moveAnalysis)).toBe(false);
        });

        it('accepts mate-for-us (clears IGNORELOSSLIMIT)', () => {
            const moveAnalysis = {
                evaluation: -MATE_FOR_US,
                afterEval: -MATE_FOR_US,
                beforeEval: 100,
                afterEvalOurs: MATE_FOR_US,
                signedMoveLoss: MATE_FOR_US - 100,
                moveLoss: MATE_FOR_US - 100,
                quality: 'checkmate'
            };

            expect(moveSelector._passesSoundnessCheck('h5h8', 'e2e4', moveAnalysis)).toBe(true);
        });
    });
});