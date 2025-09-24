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
                { san: 'e4', winrate: 0.55, playrate: 0.3 },
                { san: 'Nf3', winrate: 0.52, playrate: 0.2 }
            ];

            // Mock engine analysis that rejects all moves
            const mockEngineAnalysis = {
                bestMove: 'd4',
                moveAnalyses: [
                    { move: 'e4', centipawns: -200 }, // Below SOUNDNESSLIMIT
                    { move: 'Nf3', centipawns: -150 } // Below SOUNDNESSLIMIT
                ]
            };

            mockEngineClient.analyzePosition.mockResolvedValue(mockEngineAnalysis);

            const mockStatisticsEngine = {
                selectBestMove: jest.fn().mockReturnValue(mockCandidates[0])
            };

            const mockPosition = {
                fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
            };

            await expect(moveSelector.selectBestMove(mockPosition, mockCandidates, mockEngineClient, mockStatisticsEngine))
                .rejects.toThrow('No moves passed engine validation despite CAREABOUTENGINE=1');
        });

        it('includes candidate count in error message', async () => {
            const mockCandidates = [
                { san: 'e4', winrate: 0.55, playrate: 0.3 },
                { san: 'Nf3', winrate: 0.52, playrate: 0.2 },
                { san: 'd4', winrate: 0.51, playrate: 0.15 }
            ];

            const mockEngineAnalysis = {
                bestMove: 'a4',
                moveAnalyses: [
                    { move: 'e4', centipawns: -200 },
                    { move: 'Nf3', centipawns: -150 },
                    { move: 'd4', centipawns: -100 }
                ]
            };

            mockEngineClient.analyzePosition.mockResolvedValue(mockEngineAnalysis);

            const mockPosition = {
                fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
            };

            try {
                await moveSelector.selectBestMove(mockPosition, mockCandidates, mockEngineClient, {});
                expect(true).toBe(false); // Should not reach here
            } catch (error) {
                expect(error.message).toContain('3 candidate moves');
                expect(error.message).toContain('CAREABOUTENGINE=1');
            }
        });
    });

    describe('Valid Engine Scenarios When CAREABOUTENGINE=1', () => {
        beforeEach(() => {
            moveSelector = new MoveSelector({
                CAREABOUTENGINE: 1,
                SOUNDNESSLIMIT: -50
            });
        });

        it('accepts when some moves pass engine validation', async () => {
            const mockCandidates = [
                { san: 'e4', winrate: 0.55, playrate: 0.3 },
                { san: 'Nf3', winrate: 0.52, playrate: 0.2 }
            ];

            // One move passes engine validation
            const mockEngineAnalysis = {
                bestMove: 'e4',
                moveAnalyses: [
                    { move: 'e4', centipawns: -20 }, // Above SOUNDNESSLIMIT
                    { move: 'Nf3', centipawns: -100 } // Below SOUNDNESSLIMIT
                ]
            };

            moveSelector._getEngineAnalysis = jest.fn().mockResolvedValue(mockEngineAnalysis);
            moveSelector._filterCandidatesByEngine = jest.fn().mockReturnValue([mockCandidates[0]]);
            moveSelector._selectByStatistics = jest.fn().mockReturnValue(mockCandidates[0]);

            const result = await moveSelector.selectBestMove({ fen: 'test-fen' }, mockCandidates, mockEngineClient, {});

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
                { san: 'e4', winrate: 0.55, playrate: 0.3 },
                { san: 'Nf3', winrate: 0.52, playrate: 0.2 }
            ];

            moveSelector._selectByStatistics = jest.fn().mockReturnValue(mockCandidates[0]);

            const result = await moveSelector.selectBestMove({ fen: 'test-fen' }, mockCandidates, null, {});

            // Should not throw - engine analysis not required
            expect(result.selectedMove).toBe(mockCandidates[0]);
            expect(moveSelector._selectByStatistics).toHaveBeenCalled();
        });
    });
});