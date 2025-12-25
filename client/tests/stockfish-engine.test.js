/**
 * =============================================================================
 * StockfishEngine Unit Tests
 * =============================================================================
 *
 * PURPOSE:
 * Unit tests for StockfishEngine that don't require actual WASM execution.
 * Tests validation, configuration, and error handling logic.
 *
 * NOTE:
 * Tests requiring actual WASM engine operation are in:
 * tests/browser/stockfish-browser.test.js (uses Playwright for real browser)
 *
 * WHAT WE'RE TESTING:
 * - UCI format validation (isUciFormat)
 * - FEN validation (validateFen)
 * - Move quality calculation (calculateMoveQuality)
 * - Configuration management (getConfig, updateConfig)
 * - Error handling for uninitialized engine
 * =============================================================================
 */

import StockfishEngine from '../src/engine/StockfishEngine.js';

// ==================== MOCK SETUP ====================

// Mock the Web Worker since it doesn't exist in Node.js
global.Worker = jest.fn().mockImplementation(() => ({
    postMessage: jest.fn(),
    terminate: jest.fn(),
    onmessage: null,
    onerror: null
}));

// ==================== TEST SUITES ====================

describe('StockfishEngine', () => {
    let engine;

    beforeEach(() => {
        // Create engine with default config
        engine = new StockfishEngine();
    });

    afterEach(() => {
        // Clean up
        if (engine) {
            engine.shutdown();
        }
    });

    // ==================== CONFIGURATION TESTS ====================

    describe('Constructor and Configuration', () => {
        it('initializes with default configuration', () => {
            // Assert
            expect(engine.depth).toBe(20);
            expect(engine.hash).toBe(128);
            expect(engine.timeout).toBe(120000);
            expect(engine.variant).toBe('lite');
        });

        it('accepts custom configuration', () => {
            // Arrange & Act
            const customEngine = new StockfishEngine({
                depth: 25,
                hash: 256,
                timeout: 60000,
                variant: 'full'
            });

            // Assert
            expect(customEngine.depth).toBe(25);
            expect(customEngine.hash).toBe(256);
            expect(customEngine.timeout).toBe(60000);
            expect(customEngine.variant).toBe('full');

            customEngine.shutdown();
        });

        it('starts with isReady = false', () => {
            expect(engine.isReady).toBe(false);
            expect(engine.isEngineReady()).toBe(false);
        });
    });

    describe('getConfig', () => {
        it('returns current configuration', () => {
            // Act
            const config = engine.getConfig();

            // Assert
            expect(config).toEqual({
                depth: 20,
                hash: 128,
                timeout: 120000
            });
        });
    });

    describe('updateConfig', () => {
        it('updates depth setting', () => {
            // Act
            engine.updateConfig({ depth: 30 });

            // Assert
            expect(engine.depth).toBe(30);
        });

        it('updates hash setting', () => {
            // Act
            engine.updateConfig({ hash: 512 });

            // Assert
            expect(engine.hash).toBe(512);
        });

        it('updates timeout setting', () => {
            // Act
            engine.updateConfig({ timeout: 300000 });

            // Assert
            expect(engine.timeout).toBe(300000);
        });

        it('updates multiple settings at once', () => {
            // Act
            engine.updateConfig({
                depth: 15,
                hash: 64,
                timeout: 30000
            });

            // Assert
            expect(engine.depth).toBe(15);
            expect(engine.hash).toBe(64);
            expect(engine.timeout).toBe(30000);
        });
    });

    // ==================== UCI FORMAT VALIDATION TESTS ====================

    describe('isUciFormat', () => {
        /**
         * UCI format: [a-h][1-8][a-h][1-8][qrbn]?
         * Examples: e2e4, g1f3, e7e8q (pawn promotion)
         */

        it('accepts valid UCI moves', () => {
            expect(engine.isUciFormat('e2e4')).toBe(true);
            expect(engine.isUciFormat('g1f3')).toBe(true);
            expect(engine.isUciFormat('a7a8')).toBe(true);
            expect(engine.isUciFormat('h1h8')).toBe(true);
        });

        it('accepts promotion moves', () => {
            expect(engine.isUciFormat('e7e8q')).toBe(true); // Queen
            expect(engine.isUciFormat('a7a8r')).toBe(true); // Rook
            expect(engine.isUciFormat('b7b8b')).toBe(true); // Bishop
            expect(engine.isUciFormat('c7c8n')).toBe(true); // Knight
        });

        it('rejects SAN format moves', () => {
            expect(engine.isUciFormat('e4')).toBe(false);
            expect(engine.isUciFormat('Nf3')).toBe(false);
            expect(engine.isUciFormat('Bc4')).toBe(false);
            expect(engine.isUciFormat('O-O')).toBe(false);
            expect(engine.isUciFormat('O-O-O')).toBe(false);
        });

        it('rejects invalid square references', () => {
            expect(engine.isUciFormat('e9e4')).toBe(false);  // Invalid rank
            expect(engine.isUciFormat('i2e4')).toBe(false);  // Invalid file
            expect(engine.isUciFormat('e0e4')).toBe(false);  // Invalid rank
        });

        it('rejects malformed moves', () => {
            expect(engine.isUciFormat('')).toBe(false);
            expect(engine.isUciFormat('e2')).toBe(false);     // Too short
            expect(engine.isUciFormat('e2e4e6')).toBe(false); // Too long
            expect(engine.isUciFormat('e2e4k')).toBe(false);  // Invalid promotion
        });
    });

    // ==================== FEN VALIDATION TESTS ====================

    describe('validateFen', () => {
        /**
         * Uses chess.js to validate FEN strings.
         * Invalid FEN can crash Stockfish WASM.
         */

        it('accepts valid starting position FEN', () => {
            const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

            // Should not throw
            expect(() => engine.validateFen(startingFen)).not.toThrow();
        });

        it('accepts valid midgame FEN', () => {
            // Position after 1. e4 e5 2. Nf3 Nc6
            const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';

            expect(() => engine.validateFen(fen)).not.toThrow();
        });

        it('accepts valid endgame FEN', () => {
            // Simple king + pawn endgame
            const fen = '8/8/8/4k3/8/8/4P3/4K3 w - - 0 1';

            expect(() => engine.validateFen(fen)).not.toThrow();
        });

        it('throws error for FEN with missing king', () => {
            // No black king
            const invalidFen = 'rnbq1bnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

            expect(() => engine.validateFen(invalidFen)).toThrow();
        });

        it('throws error for FEN with pawn on first rank', () => {
            // Pawn on rank 1 (invalid)
            const invalidFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/PNBQKBNR w KQkq - 0 1';

            expect(() => engine.validateFen(invalidFen)).toThrow();
        });

        it('throws error for malformed FEN structure', () => {
            const invalidFens = [
                '',                           // Empty
                'not a fen',                 // Gibberish
                'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', // Missing parts
            ];

            for (const fen of invalidFens) {
                expect(() => engine.validateFen(fen)).toThrow();
            }
        });

        it('error message includes the invalid FEN', () => {
            const invalidFen = 'invalid-fen-string';

            try {
                engine.validateFen(invalidFen);
                fail('Expected an error to be thrown');
            } catch (error) {
                expect(error.message).toContain('Invalid FEN');
                expect(error.message).toContain(invalidFen);
            }
        });
    });

    // ==================== MOVE QUALITY CALCULATION TESTS ====================

    describe('calculateMoveQuality', () => {
        /**
         * Tests the centipawn loss to quality label conversion.
         * This is a pure function with no dependencies.
         */

        it('returns "excellent" for loss <= 10 centipawns', () => {
            expect(engine.calculateMoveQuality(0)).toBe('excellent');
            expect(engine.calculateMoveQuality(5)).toBe('excellent');
            expect(engine.calculateMoveQuality(10)).toBe('excellent');
        });

        it('returns "good" for loss 11-25 centipawns', () => {
            expect(engine.calculateMoveQuality(11)).toBe('good');
            expect(engine.calculateMoveQuality(20)).toBe('good');
            expect(engine.calculateMoveQuality(25)).toBe('good');
        });

        it('returns "inaccuracy" for loss 26-50 centipawns', () => {
            expect(engine.calculateMoveQuality(26)).toBe('inaccuracy');
            expect(engine.calculateMoveQuality(35)).toBe('inaccuracy');
            expect(engine.calculateMoveQuality(50)).toBe('inaccuracy');
        });

        it('returns "mistake" for loss 51-100 centipawns', () => {
            expect(engine.calculateMoveQuality(51)).toBe('mistake');
            expect(engine.calculateMoveQuality(75)).toBe('mistake');
            expect(engine.calculateMoveQuality(100)).toBe('mistake');
        });

        it('returns "blunder" for loss > 100 centipawns', () => {
            expect(engine.calculateMoveQuality(101)).toBe('blunder');
            expect(engine.calculateMoveQuality(200)).toBe('blunder');
            expect(engine.calculateMoveQuality(500)).toBe('blunder');
        });
    });

    // ==================== ERROR HANDLING TESTS ====================

    describe('Error Handling for Uninitialized Engine', () => {
        /**
         * Tests that methods throw appropriate errors when engine isn't ready.
         */

        it('getBestMove throws when engine not initialized', async () => {
            const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

            await expect(engine.getBestMove(fen))
                .rejects.toThrow('Engine not initialized');
        });

        it('evaluatePosition throws when engine not initialized', async () => {
            const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

            await expect(engine.evaluatePosition(fen))
                .rejects.toThrow('Engine not initialized');
        });

        it('analyzeMove throws when engine not initialized', async () => {
            const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

            await expect(engine.analyzeMove(fen, 'e2e4'))
                .rejects.toThrow('Engine not initialized');
        });
    });

    // ==================== CLEANUP TESTS ====================

    describe('shutdown', () => {
        it('resets isReady to false', () => {
            // Arrange - simulate initialized state
            engine.isReady = true;

            // Act
            engine.shutdown();

            // Assert
            expect(engine.isReady).toBe(false);
        });

        it('clears worker reference', () => {
            // Arrange - create a mock worker
            engine.worker = { terminate: jest.fn(), postMessage: jest.fn() };

            // Act
            engine.shutdown();

            // Assert
            expect(engine.worker).toBeNull();
        });

        it('clears initializationPromise', () => {
            // Arrange
            engine.initializationPromise = Promise.resolve();

            // Act
            engine.shutdown();

            // Assert
            expect(engine.initializationPromise).toBeNull();
        });

        it('clears progress callback', () => {
            // Arrange
            engine.progressCallback = jest.fn();

            // Act
            engine.shutdown();

            // Assert
            expect(engine.progressCallback).toBeNull();
        });
    });

    describe('quit and destroy aliases', () => {
        it('quit() calls shutdown', async () => {
            // Arrange
            const shutdownSpy = jest.spyOn(engine, 'shutdown');

            // Act
            await engine.quit();

            // Assert
            expect(shutdownSpy).toHaveBeenCalled();
        });

        it('destroy() calls shutdown', () => {
            // Arrange
            const shutdownSpy = jest.spyOn(engine, 'shutdown');

            // Act
            engine.destroy();

            // Assert
            expect(shutdownSpy).toHaveBeenCalled();
        });
    });

    // ==================== PROGRESS CALLBACK TESTS ====================

    describe('setProgressCallback', () => {
        it('sets the progress callback', () => {
            // Arrange
            const callback = jest.fn();

            // Act
            engine.setProgressCallback(callback);

            // Assert
            expect(engine.progressCallback).toBe(callback);
        });
    });

    // ==================== UCI MESSAGE HANDLING TESTS ====================

    describe('handleUCIMessage', () => {
        it('handles uciok message', () => {
            // Arrange
            engine.sendUCICommand = jest.fn();

            // Act
            engine.handleUCIMessage('uciok');

            // Assert - should send isready command
            expect(engine.sendUCICommand).toHaveBeenCalledWith('isready');
        });

        it('handles readyok message', () => {
            // Arrange
            let resolved = false;
            engine.initResolver = () => { resolved = true; };

            // Act
            engine.handleUCIMessage('readyok');

            // Assert
            expect(engine.isReady).toBe(true);
            expect(resolved).toBe(true);
        });

        it('handles bestmove message', () => {
            // Arrange
            let resolvedMove = null;
            engine.pendingOperations.set(1, {
                type: 'bestmove',
                resolve: (move) => { resolvedMove = move; },
                reject: jest.fn()
            });

            // Act
            engine.handleUCIMessage('bestmove e2e4 ponder e7e5');

            // Assert
            expect(resolvedMove).toBe('e2e4');
            expect(engine.pendingOperations.size).toBe(0);
        });

        it('handles info message with depth and score', () => {
            // Arrange
            const operation = {
                type: 'evaluation',
                targetDepth: 20,
                resolve: jest.fn(),
                reject: jest.fn()
            };
            engine.pendingOperations.set(1, operation);

            // Act
            engine.handleUCIMessage('info depth 15 score cp 35 pv e2e4 e7e5');

            // Assert - should store evaluation (not resolve)
            expect(operation.lastEvaluation).toBe(35);
            expect(engine.pendingOperations.size).toBe(1); // Still pending
        });

        it('handles mate score in info message', () => {
            // Arrange
            const operation = {
                type: 'evaluation',
                targetDepth: 20,
                resolve: jest.fn(),
                reject: jest.fn()
            };
            engine.pendingOperations.set(1, operation);

            // Act - mate in 3
            engine.handleUCIMessage('info depth 20 score mate 3');

            // Assert - should be very high positive evaluation
            expect(operation.lastEvaluation).toBe(10000 - 3);
        });
    });
});
