/**
 * =============================================================================
 * stockfish-engine.test.js - Unit Tests for StockfishEngine Wrapper
 * =============================================================================
 *
 * PURPOSE:
 * Tests the StockfishEngine wrapper class that analyzes chess positions using Stockfish.
 * The wrapper provides position evaluation including score, best move, and analysis depth.
 *
 * KEY CONCEPTS:
 * - FEN: Forsyth-Edwards Notation for representing chess positions
 * - UCI: Universal Chess Interface notation for moves (e.g., "e2e4")
 * - Centipawn: Unit of chess evaluation (100 cp = 1 pawn advantage)
 * - Depth: How many half-moves (plies) the engine searches ahead
 *
 * HOW IT FITS IN:
 * - Used by: MCP server's evaluate_position tool
 * - Depends on: Stockfish chess engine (via node-stockfish-threading or similar)
 */

// Import the StockfishEngine class to test - DO NOT mock this, we test the real implementation
const { StockfishEngine } = require('../src/stockfish-engine.js');

// =============================================================================
// Test Constants - Valid test data for chess positions
// =============================================================================

const VALID_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'; // Starting position

// =============================================================================
// Test Configuration - Stockfish requires longer timeouts
// =============================================================================

// Stockfish initialization and analysis take time - use longer timeout
jest.setTimeout(30000);

// =============================================================================
// Test Suite: StockfishEngine
// =============================================================================

describe('StockfishEngine', () => {
    let engine; // Engine instance for tests

    beforeEach(() => {
        // Create fresh engine instance before each test
        engine = new StockfishEngine();
    });

    afterEach(async () => {
        // Cleanup engine resources after each test
        if (engine && typeof engine.quit === 'function') {
            await engine.quit();
        }
    });

    // =========================================================================
    // Basic Instantiation
    // =========================================================================

    describe('instantiation', () => {
        test('can create a StockfishEngine instance', () => {
            // Arrange & Act - instance created in beforeEach

            // Assert - should be defined and be an instance of StockfishEngine
            expect(engine).toBeDefined();
            expect(engine).toBeInstanceOf(StockfishEngine);
        });

        test('has analyze method', () => {
            // Assert - should have the analyze method
            expect(engine.analyze).toBeDefined();
            expect(typeof engine.analyze).toBe('function');
        });

        test('has isReady method', () => {
            // Assert - should have the isReady method
            expect(engine.isReady).toBeDefined();
            expect(typeof engine.isReady).toBe('function');
        });

        test('has quit method', () => {
            // Assert - should have the quit method for cleanup
            expect(engine.quit).toBeDefined();
            expect(typeof engine.quit).toBe('function');
        });
    });

    // =========================================================================
    // isReady Method
    // =========================================================================

    describe('isReady', () => {
        test('returns a boolean', async () => {
            // Act
            const result = await engine.isReady();

            // Assert - should return boolean indicating engine readiness
            expect(typeof result).toBe('boolean');
        });
    });

    // =========================================================================
    // analyze Method - Return Structure
    // =========================================================================

    describe('analyze return structure', () => {
        test('returns object with score property', async () => {
            // Arrange - ensure engine is ready (may need initialization)
            if (typeof engine.initialize === 'function') {
                await engine.initialize();
            }

            // Act - analyze starting position at low depth
            const result = await engine.analyze(VALID_FEN, 10);

            // Assert - should have score property
            expect(result).toHaveProperty('score');
        });

        test('returns object with bestMove property', async () => {
            // Arrange - ensure engine is ready
            if (typeof engine.initialize === 'function') {
                await engine.initialize();
            }

            // Act
            const result = await engine.analyze(VALID_FEN, 10);

            // Assert - should have bestMove property
            expect(result).toHaveProperty('bestMove');
        });

        test('returns object with depth property', async () => {
            // Arrange - ensure engine is ready
            if (typeof engine.initialize === 'function') {
                await engine.initialize();
            }

            // Act
            const result = await engine.analyze(VALID_FEN, 10);

            // Assert - should have depth property
            expect(result).toHaveProperty('depth');
        });

        test('score is a number (centipawns)', async () => {
            // Arrange - ensure engine is ready
            if (typeof engine.initialize === 'function') {
                await engine.initialize();
            }

            // Act
            const result = await engine.analyze(VALID_FEN, 10);

            // Assert - score should be numeric (centipawn value)
            expect(typeof result.score).toBe('number');
        });

        test('bestMove is in UCI format (e.g., "e2e4")', async () => {
            // Arrange - ensure engine is ready
            if (typeof engine.initialize === 'function') {
                await engine.initialize();
            }

            // Act
            const result = await engine.analyze(VALID_FEN, 10);

            // Assert - bestMove should be string in UCI format (4-5 characters: from-square + to-square + optional promotion)
            expect(typeof result.bestMove).toBe('string');
            expect(result.bestMove.length).toBeGreaterThanOrEqual(4);
            expect(result.bestMove.length).toBeLessThanOrEqual(5);
            // UCI format: letter (a-h) + digit (1-8) + letter (a-h) + digit (1-8) + optional promotion piece
            expect(result.bestMove).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
        });

        test('depth is a number', async () => {
            // Arrange - ensure engine is ready
            if (typeof engine.initialize === 'function') {
                await engine.initialize();
            }

            // Act
            const result = await engine.analyze(VALID_FEN, 10);

            // Assert - depth should be numeric
            expect(typeof result.depth).toBe('number');
        });
    });

    // =========================================================================
    // quit Method
    // =========================================================================

    describe('quit', () => {
        test('can be called without error', async () => {
            // Arrange - create a fresh engine for this test
            const engineToQuit = new StockfishEngine();

            // Act & Assert - quit should not throw
            await expect(engineToQuit.quit()).resolves.not.toThrow();
        });
    });
});
