/**
 * =============================================================================
 * move-selector.test.js - Unit Tests for MoveSelector Wrapper
 * =============================================================================
 *
 * PURPOSE:
 * Tests the MoveSelector wrapper class that recommends the best move from a position
 * based on statistical analysis. The wrapper provides move recommendations with
 * win rates, confidence intervals, and reasoning.
 *
 * KEY CONCEPTS:
 * - FEN: Forsyth-Edwards Notation for representing chess positions
 * - SAN: Standard Algebraic Notation for chess moves (e.g., 'e4', 'Nf3')
 * - Win Rate: Percentage of games won from a given position (0-1 scale)
 * - Confidence Interval: Statistical bounds on the win rate estimate
 * - Perspective: Which side's repertoire we are building ('white' or 'black')
 *
 * HOW IT FITS IN:
 * - Used by: MCP server's select_best_move tool
 * - Depends on: Lichess API for position statistics
 */

// Import the MoveSelector class to test - DO NOT mock this, we test the real implementation
const { MoveSelector } = require('../src/move-selector.js');

// Set longer timeout for API calls to Lichess
jest.setTimeout(30000);

// =============================================================================
// Test Constants - Valid test data for chess positions
// =============================================================================

const VALID_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'; // Starting position
const VALID_FEN_AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'; // After 1. e4

// =============================================================================
// Test Suite: MoveSelector
// =============================================================================

describe('MoveSelector', () => {
    let selector; // Selector instance for tests

    beforeEach(() => {
        // Create fresh selector instance before each test
        selector = new MoveSelector();
    });

    // =========================================================================
    // Basic Instantiation
    // =========================================================================

    describe('instantiation', () => {
        test('can create a MoveSelector instance', () => {
            // Arrange & Act - instance created in beforeEach

            // Assert - should be defined and be an instance of MoveSelector
            expect(selector).toBeDefined();
            expect(selector).toBeInstanceOf(MoveSelector);
        });

        test('has selectBestMove method', () => {
            // Assert - should have the required method
            expect(selector.selectBestMove).toBeDefined();
            expect(typeof selector.selectBestMove).toBe('function');
        });
    });

    // =========================================================================
    // selectBestMove Return Structure
    // =========================================================================

    describe('selectBestMove return structure', () => {
        test('returns object with move property', async () => {
            // Arrange - use starting position for white

            // Act
            const result = await selector.selectBestMove(VALID_FEN, 'white');

            // Assert - should have move property
            expect(result).toHaveProperty('move');
        });

        test('returns object with winRate property', async () => {
            // Act
            const result = await selector.selectBestMove(VALID_FEN, 'white');

            // Assert - should have winRate property
            expect(result).toHaveProperty('winRate');
        });

        test('returns object with confidence property', async () => {
            // Act
            const result = await selector.selectBestMove(VALID_FEN, 'white');

            // Assert - should have confidence property
            expect(result).toHaveProperty('confidence');
        });

        test('returns object with reasoning property', async () => {
            // Act
            const result = await selector.selectBestMove(VALID_FEN, 'white');

            // Assert - should have reasoning property
            expect(result).toHaveProperty('reasoning');
        });
    });

    // =========================================================================
    // Property Types and Values
    // =========================================================================

    describe('property types and values', () => {
        test('move is a string (SAN notation)', async () => {
            // Act
            const result = await selector.selectBestMove(VALID_FEN, 'white');

            // Assert - move should be a string like "e4", "d4", "Nf3"
            expect(typeof result.move).toBe('string');
            expect(result.move.length).toBeGreaterThan(0);
        });

        test('winRate is a number between 0 and 1', async () => {
            // Act
            const result = await selector.selectBestMove(VALID_FEN, 'white');

            // Assert - winRate is a probability (0 to 1 scale)
            expect(typeof result.winRate).toBe('number');
            expect(result.winRate).toBeGreaterThanOrEqual(0);
            expect(result.winRate).toBeLessThanOrEqual(1);
        });

        test('confidence has lower and upper properties', async () => {
            // Act
            const result = await selector.selectBestMove(VALID_FEN, 'white');

            // Assert - confidence should have bounds
            expect(result.confidence).toHaveProperty('lower');
            expect(result.confidence).toHaveProperty('upper');
        });

        test('confidence.lower is a number between 0 and 1', async () => {
            // Act
            const result = await selector.selectBestMove(VALID_FEN, 'white');

            // Assert - lower bound of confidence interval
            expect(typeof result.confidence.lower).toBe('number');
            expect(result.confidence.lower).toBeGreaterThanOrEqual(0);
            expect(result.confidence.lower).toBeLessThanOrEqual(1);
        });

        test('confidence.upper is a number between 0 and 1', async () => {
            // Act
            const result = await selector.selectBestMove(VALID_FEN, 'white');

            // Assert - upper bound of confidence interval
            expect(typeof result.confidence.upper).toBe('number');
            expect(result.confidence.upper).toBeGreaterThanOrEqual(0);
            expect(result.confidence.upper).toBeLessThanOrEqual(1);
        });

        test('reasoning is a string explaining the selection', async () => {
            // Act
            const result = await selector.selectBestMove(VALID_FEN, 'white');

            // Assert - reasoning should explain why this move was selected
            expect(typeof result.reasoning).toBe('string');
            expect(result.reasoning.length).toBeGreaterThan(0);
        });
    });

    // =========================================================================
    // Perspective Parameter
    // =========================================================================

    describe('perspective parameter', () => {
        test('accepts white perspective', async () => {
            // Act & Assert - should not throw for white
            await expect(
                selector.selectBestMove(VALID_FEN, 'white')
            ).resolves.toBeDefined();
        });

        test('accepts black perspective', async () => {
            // Act & Assert - should not throw for black
            await expect(
                selector.selectBestMove(VALID_FEN_AFTER_E4, 'black')
            ).resolves.toBeDefined();
        });
    });

    // =========================================================================
    // Optional Config Parameter
    // =========================================================================

    describe('config parameter', () => {
        test('accepts config with speeds array', async () => {
            // Arrange
            const config = { speeds: ['rapid', 'classical'] };

            // Act & Assert - should not throw when config provided
            await expect(
                selector.selectBestMove(VALID_FEN, 'white', config)
            ).resolves.toBeDefined();
        });

        test('accepts config with ratings array', async () => {
            // Arrange
            const config = { ratings: [1800, 2000, 2200] };

            // Act & Assert - should not throw when config provided
            await expect(
                selector.selectBestMove(VALID_FEN, 'white', config)
            ).resolves.toBeDefined();
        });

        test('works without config (uses defaults)', async () => {
            // Act & Assert - should work when config omitted
            await expect(
                selector.selectBestMove(VALID_FEN, 'white')
            ).resolves.toBeDefined();
        });
    });
});
