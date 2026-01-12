/**
 * =============================================================================
 * repertoire-generator.test.js - Unit Tests for RepertoireGenerator Wrapper
 * =============================================================================
 *
 * PURPOSE:
 * Tests the RepertoireGenerator wrapper class that generates complete chess
 * opening repertoires from a starting PGN. The wrapper analyzes positions
 * recursively to build a tree of recommended moves.
 *
 * KEY CONCEPTS:
 * - PGN: Portable Game Notation for recording chess games/lines
 * - Perspective: Whose repertoire we are building ('white' or 'black')
 * - linesAnalyzed: Number of move sequences explored during generation
 * - annotations: Comments and evaluations added to moves
 *
 * HOW IT FITS IN:
 * - Used by: MCP server's generate_repertoire tool
 * - Depends on: Lichess API for position statistics, Stockfish for evaluation
 */

// Import the RepertoireGenerator class to test - DO NOT mock this, we test the real implementation
const { RepertoireGenerator } = require('../src/repertoire-generator.js');

// Set longer timeout since repertoire generation can be slow
jest.setTimeout(60000);

// =============================================================================
// Test Constants - Valid test data for chess positions
// =============================================================================

const SIMPLE_PGN = '1. e4'; // Simple starting PGN for faster tests

// =============================================================================
// Test Suite: RepertoireGenerator
// =============================================================================

describe('RepertoireGenerator', () => {
    let generator; // Generator instance for tests

    beforeEach(() => {
        // Create fresh generator instance before each test
        generator = new RepertoireGenerator();
    });

    // =========================================================================
    // Basic Instantiation
    // =========================================================================

    describe('instantiation', () => {
        test('can create a RepertoireGenerator instance', () => {
            // Arrange & Act - instance created in beforeEach

            // Assert - should be defined and be an instance of RepertoireGenerator
            expect(generator).toBeDefined();
            expect(generator).toBeInstanceOf(RepertoireGenerator);
        });

        test('has generate method', () => {
            // Assert - should have the required method
            expect(generator.generate).toBeDefined();
            expect(typeof generator.generate).toBe('function');
        });
    });

    // =========================================================================
    // generate Return Structure
    // =========================================================================

    describe('generate return structure', () => {
        test('returns object with pgn property', async () => {
            // Act
            const result = await generator.generate(SIMPLE_PGN, 'white');

            // Assert - should have pgn property
            expect(result).toHaveProperty('pgn');
        });

        test('returns object with linesAnalyzed property', async () => {
            // Act
            const result = await generator.generate(SIMPLE_PGN, 'white');

            // Assert - should have linesAnalyzed property
            expect(result).toHaveProperty('linesAnalyzed');
        });

        test('returns object with annotations property', async () => {
            // Act
            const result = await generator.generate(SIMPLE_PGN, 'white');

            // Assert - should have annotations property
            expect(result).toHaveProperty('annotations');
        });
    });

    // =========================================================================
    // Property Types and Values
    // =========================================================================

    describe('property types and values', () => {
        test('pgn is a string containing chess notation', async () => {
            // Act
            const result = await generator.generate(SIMPLE_PGN, 'white');

            // Assert - pgn should be a string containing moves
            expect(typeof result.pgn).toBe('string');
            expect(result.pgn.length).toBeGreaterThan(0);
        });

        test('linesAnalyzed is a non-negative number', async () => {
            // Act
            const result = await generator.generate(SIMPLE_PGN, 'white');

            // Assert - linesAnalyzed counts how many lines were explored
            expect(typeof result.linesAnalyzed).toBe('number');
            expect(result.linesAnalyzed).toBeGreaterThanOrEqual(0);
        });

        test('annotations is an array', async () => {
            // Act
            const result = await generator.generate(SIMPLE_PGN, 'white');

            // Assert - annotations is an array (may be empty)
            expect(Array.isArray(result.annotations)).toBe(true);
        });
    });

    // =========================================================================
    // Perspective Parameter
    // =========================================================================

    describe('perspective parameter', () => {
        test('accepts white perspective', async () => {
            // Act & Assert - should not throw for white
            await expect(
                generator.generate(SIMPLE_PGN, 'white')
            ).resolves.toBeDefined();
        });

        test('accepts black perspective', async () => {
            // Act & Assert - should not throw for black
            await expect(
                generator.generate(SIMPLE_PGN, 'black')
            ).resolves.toBeDefined();
        });
    });

    // =========================================================================
    // Optional Config Parameter
    // =========================================================================

    describe('config parameter', () => {
        test('accepts config with depth', async () => {
            // Arrange - limit depth to speed up test
            const config = { depth: 1 };

            // Act & Assert - should not throw when config provided
            await expect(
                generator.generate(SIMPLE_PGN, 'white', config)
            ).resolves.toBeDefined();
        });

        test('onProgress callback is called when provided', async () => {
            // Arrange - create mock callback
            const onProgress = jest.fn();
            const config = { depth: 1, onProgress };

            // Act
            await generator.generate(SIMPLE_PGN, 'white', config);

            // Assert - callback should have been called at least once
            expect(onProgress).toHaveBeenCalled();
        });
    });
});
