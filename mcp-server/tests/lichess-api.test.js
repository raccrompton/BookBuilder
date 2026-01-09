/**
 * =============================================================================
 * lichess-api.test.js - Unit Tests for LichessApi Wrapper
 * =============================================================================
 *
 * PURPOSE:
 * Tests the LichessApi wrapper class that fetches opening statistics from Lichess.
 * The wrapper provides position data including win/draw/loss counts and move statistics.
 *
 * KEY CONCEPTS:
 * - FEN: Forsyth-Edwards Notation for representing chess positions
 * - Opening Statistics: Aggregated game outcomes for a given position
 * - Playrate: Percentage of games where a specific move was played
 *
 * HOW IT FITS IN:
 * - Used by: MCP server's analyze_position tool
 * - Depends on: Lichess Opening Explorer API (external)
 */

// Import the LichessApi class to test - DO NOT mock this, we test the real implementation
const { LichessApi } = require('../src/lichess-api.js');

// =============================================================================
// Test Constants - Valid test data for chess positions
// =============================================================================

const VALID_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'; // Starting position
const VALID_FEN_AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'; // After 1. e4
const INVALID_FEN = 'invalid-fen-string'; // Malformed FEN for error testing

// =============================================================================
// Test Suite: LichessApi
// =============================================================================

describe('LichessApi', () => {
    let api; // API instance for tests

    beforeEach(() => {
        // Create fresh API instance before each test
        api = new LichessApi();
    });

    // =========================================================================
    // Basic Instantiation
    // =========================================================================

    describe('instantiation', () => {
        test('can create a LichessApi instance', () => {
            // Arrange & Act - instance created in beforeEach

            // Assert - should be defined and be an instance of LichessApi
            expect(api).toBeDefined();
            expect(api).toBeInstanceOf(LichessApi);
        });

        test('has getOpeningStats method', () => {
            // Assert - should have the required method
            expect(api.getOpeningStats).toBeDefined();
            expect(typeof api.getOpeningStats).toBe('function');
        });
    });

    // =========================================================================
    // getOpeningStats Return Structure
    // =========================================================================

    describe('getOpeningStats return structure', () => {
        test('returns object with white, draws, black properties', async () => {
            // Arrange - use starting position

            // Act
            const result = await api.getOpeningStats(VALID_FEN);

            // Assert - should have all required win/draw/loss count properties
            expect(result).toHaveProperty('white');
            expect(result).toHaveProperty('draws');
            expect(result).toHaveProperty('black');
        });

        test('returns object with moves array', async () => {
            // Arrange - use starting position

            // Act
            const result = await api.getOpeningStats(VALID_FEN);

            // Assert - should have moves as an array
            expect(result).toHaveProperty('moves');
            expect(Array.isArray(result.moves)).toBe(true);
        });

        test('white, draws, black are numbers', async () => {
            // Act
            const result = await api.getOpeningStats(VALID_FEN);

            // Assert - game counts should be numeric
            expect(typeof result.white).toBe('number');
            expect(typeof result.draws).toBe('number');
            expect(typeof result.black).toBe('number');
        });

        test('white, draws, black are non-negative', async () => {
            // Act
            const result = await api.getOpeningStats(VALID_FEN);

            // Assert - game counts cannot be negative
            expect(result.white).toBeGreaterThanOrEqual(0);
            expect(result.draws).toBeGreaterThanOrEqual(0);
            expect(result.black).toBeGreaterThanOrEqual(0);
        });
    });

    // =========================================================================
    // Move Object Structure
    // =========================================================================

    describe('moves array structure', () => {
        test('each move has san property (move notation)', async () => {
            // Act
            const result = await api.getOpeningStats(VALID_FEN);

            // Assert - each move should have SAN notation
            // Skip if no moves (could be rare position)
            if (result.moves.length > 0) {
                result.moves.forEach(move => {
                    expect(move).toHaveProperty('san');
                    expect(typeof move.san).toBe('string');
                    expect(move.san.length).toBeGreaterThan(0);
                });
            }
        });

        test('each move has white, draws, black counts', async () => {
            // Act
            const result = await api.getOpeningStats(VALID_FEN);

            // Assert - each move should have outcome counts
            if (result.moves.length > 0) {
                result.moves.forEach(move => {
                    expect(move).toHaveProperty('white');
                    expect(move).toHaveProperty('draws');
                    expect(move).toHaveProperty('black');
                    expect(typeof move.white).toBe('number');
                    expect(typeof move.draws).toBe('number');
                    expect(typeof move.black).toBe('number');
                });
            }
        });

        test('each move has playrate property', async () => {
            // Act
            const result = await api.getOpeningStats(VALID_FEN);

            // Assert - each move should have a playrate
            if (result.moves.length > 0) {
                result.moves.forEach(move => {
                    expect(move).toHaveProperty('playrate');
                    expect(typeof move.playrate).toBe('number');
                });
            }
        });

        test('each move has totalGames property', async () => {
            // Act
            const result = await api.getOpeningStats(VALID_FEN);

            // Assert - each move should have total games count
            if (result.moves.length > 0) {
                result.moves.forEach(move => {
                    expect(move).toHaveProperty('totalGames');
                    expect(typeof move.totalGames).toBe('number');
                    expect(move.totalGames).toBeGreaterThanOrEqual(0);
                });
            }
        });

        test('playrate values are between 0 and 100', async () => {
            // Act
            const result = await api.getOpeningStats(VALID_FEN);

            // Assert - playrate is a percentage
            if (result.moves.length > 0) {
                result.moves.forEach(move => {
                    expect(move.playrate).toBeGreaterThanOrEqual(0);
                    expect(move.playrate).toBeLessThanOrEqual(100);
                });
            }
        });
    });

    // =========================================================================
    // Options Handling
    // =========================================================================

    describe('options handling', () => {
        test('accepts options with speeds array', async () => {
            // Arrange
            const options = { speeds: ['rapid', 'classical'] };

            // Act & Assert - should not throw when options provided
            await expect(
                api.getOpeningStats(VALID_FEN, options)
            ).resolves.toBeDefined();
        });

        test('accepts options with ratings array', async () => {
            // Arrange
            const options = { ratings: [1800, 2000, 2200] };

            // Act & Assert - should not throw when options provided
            await expect(
                api.getOpeningStats(VALID_FEN, options)
            ).resolves.toBeDefined();
        });

        test('accepts options with both speeds and ratings', async () => {
            // Arrange
            const options = {
                speeds: ['blitz', 'rapid'],
                ratings: [1600, 1800]
            };

            // Act & Assert - should not throw with combined options
            await expect(
                api.getOpeningStats(VALID_FEN, options)
            ).resolves.toBeDefined();
        });

        test('works without options (defaults)', async () => {
            // Act & Assert - should work when options omitted
            await expect(
                api.getOpeningStats(VALID_FEN)
            ).resolves.toBeDefined();
        });

        test('returns valid structure with empty options', async () => {
            // Act
            const result = await api.getOpeningStats(VALID_FEN, {});

            // Assert - should still return valid structure
            expect(result).toHaveProperty('white');
            expect(result).toHaveProperty('draws');
            expect(result).toHaveProperty('black');
            expect(result).toHaveProperty('moves');
        });
    });

    // =========================================================================
    // Error Handling
    // =========================================================================

    describe('error handling', () => {
        test('throws error for invalid FEN format', async () => {
            // Act & Assert - should reject malformed FEN
            await expect(
                api.getOpeningStats(INVALID_FEN)
            ).rejects.toThrow();
        });

        test('throws error for empty FEN string', async () => {
            // Act & Assert - empty string is not valid
            await expect(
                api.getOpeningStats('')
            ).rejects.toThrow();
        });

        test('throws error when FEN is missing', async () => {
            // Act & Assert - FEN is required
            await expect(
                api.getOpeningStats()
            ).rejects.toThrow();
        });

        test('throws error when FEN is null', async () => {
            // Act & Assert - null is not valid
            await expect(
                api.getOpeningStats(null)
            ).rejects.toThrow();
        });

        test('throws error when FEN is undefined', async () => {
            // Act & Assert - undefined is not valid
            await expect(
                api.getOpeningStats(undefined)
            ).rejects.toThrow();
        });
    });
});
