/**
 * Test suite for BookBuilder error handling - Infrastructure Failures Only
 */

import BookBuilder from '../../src/BookBuilder.js';

describe('BookBuilder Error Handling - Infrastructure Failures', () => {
    let bookBuilder;
    let mockLichessClient;

    beforeEach(() => {
        // Mock Lichess client
        mockLichessClient = {
            getPositionStats: jest.fn()
        };

        const config = {
            CAREABOUTENGINE: 0,
            STOCKFISH_DEPTH: 10,
            LICHESS_DELAY: 0
        };

        bookBuilder = new BookBuilder(config);
        bookBuilder.lichessClient = mockLichessClient;
    });

    describe('API Infrastructure Failures', () => {
        it('throws error when API returns null', async () => {
            mockLichessClient.getPositionStats.mockResolvedValue(null);

            const lineData = {
                fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                cumulativeLikelihood: 1.0
            };

            await expect(bookBuilder.expandLine(lineData))
                .rejects.toThrow('Failed to get position continuations for FEN');
        });

        it('throws error when API returns undefined', async () => {
            mockLichessClient.getPositionStats.mockResolvedValue(undefined);

            const lineData = {
                fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                cumulativeLikelihood: 1.0
            };

            await expect(bookBuilder.expandLine(lineData))
                .rejects.toThrow('Failed to get position continuations for FEN');
        });

        it('throws error when API returns object without moves property', async () => {
            mockLichessClient.getPositionStats.mockResolvedValue({
                // Missing moves property - malformed response
                white: 100,
                draws: 50,
                black: 75
            });

            const lineData = {
                fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                cumulativeLikelihood: 1.0
            };

            await expect(bookBuilder.expandLine(lineData))
                .rejects.toThrow('Failed to get position continuations for FEN');
        });

        it('includes FEN in error message for debugging', async () => {
            const testFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
            mockLichessClient.getPositionStats.mockResolvedValue(null);

            const lineData = {
                fen: testFen,
                cumulativeLikelihood: 1.0
            };

            try {
                await bookBuilder.expandLine(lineData);
                expect(true).toBe(false); // Should not reach here
            } catch (error) {
                expect(error.message).toContain(testFen);
                expect(error.message).toContain('Failed to get position continuations');
            }
        });
    });

    describe('Valid Empty Data Scenarios', () => {
        it('accepts empty moves array from API', async () => {
            // Valid API response with no moves - this is normal for unpopular positions
            mockLichessClient.getPositionStats.mockResolvedValue({
                moves: [],
                white: 0,
                draws: 0,
                black: 0
            });

            bookBuilder.finalizeLine = jest.fn();

            const lineData = {
                fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                cumulativeLikelihood: 1.0
            };

            // Should not throw - empty moves array is valid
            const result = await bookBuilder.expandLine(lineData);
            expect(result).toEqual([]);
            expect(bookBuilder.finalizeLine).toHaveBeenCalled();
        });

        it('accepts moves that get filtered out by quality thresholds', async () => {
            mockLichessClient.getPositionStats.mockResolvedValue({
                moves: [
                    { san: 'e5', playrate: 0.001, winrate: 0.3 },
                    { san: 'Nf6', playrate: 0.002, winrate: 0.25 }
                ]
            });

            // Mock filtering to reject all moves
            bookBuilder.isValidContinuation = jest.fn().mockReturnValue(false);
            bookBuilder.finalizeLine = jest.fn();

            const lineData = {
                fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                cumulativeLikelihood: 1.0
            };

            // Should not throw - filtering out low-quality moves is expected
            const result = await bookBuilder.expandLine(lineData);
            expect(result).toEqual([]);
            expect(bookBuilder.finalizeLine).toHaveBeenCalled();
        });
    });
});