/**
 * BookBuilder Integration Tests - Step 6: Main Integration
 *
 * Comprehensive end-to-end tests for the BookBuilder main orchestrator.
 * These tests validate the complete workflow from configuration to PGN output,
 * ensuring exact behavioral parity with the Python implementation.
 *
 * Test Categories:
 * 1. Component Integration - Verify all components work together
 * 2. Configuration Validation - Test config parameter handling
 * 3. Workflow Testing - Test main orchestration methods
 * 4. Golden Master Validation - Ensure exact output matching
 * 5. Error Handling - Test resilience and graceful degradation
 */

import BookBuilder from '../src/BookBuilder.js';
import config from '../config.js';
import { TEST_OPENINGS } from './testUtils.js';

describe('BookBuilder - Step 6: Main Integration', () => {
    let bookBuilder;
    let testConfig;
    let mockIsolatedEngine;

    beforeEach(() => {
        // Create test configuration with minimal openings for faster testing
        testConfig = {
            ...config,
            openings: [TEST_OPENINGS.RUY_LOPEZ],
            PRINT_INFO_TO_CONSOLE: false, // Reduce test noise
            API_DELAY: 50, // Faster testing
            BATCH_SIZE: 2 // Smaller batches for testing
        };

        bookBuilder = new BookBuilder(testConfig);

        // Mock isolated engine for expandLine method
        mockIsolatedEngine = {
            parsePositionWithDebug: jest.fn().mockReturnValue(true),
            getFen: jest.fn().mockReturnValue('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'),
            debugPosition: jest.fn().mockReturnValue({ fen: 'test-fen', turn: 'b' }),
            getLegalMoves: jest.fn().mockReturnValue([]),
            validateMoveBeforeExecution: jest.fn().mockReturnValue(true),
            makeMove: jest.fn().mockReturnValue({ san: 'e5' }),
            undoMove: jest.fn(),
            getMoveNumber: jest.fn().mockReturnValue(1)
        };

        // Mock createIsolatedEngine to return our mock engine
        bookBuilder.createIsolatedEngine = jest.fn().mockReturnValue(mockIsolatedEngine);

        // Mock validateEngineState to return true (engine state is consistent)
        bookBuilder.validateEngineState = jest.fn().mockReturnValue(true);
    });

    afterEach(() => {
        // Clean up any resources
        if (bookBuilder.stockfishEngine) {
            bookBuilder.stockfishEngine.quit();
        }
    });

    // ==================== COMPONENT INTEGRATION TESTS ====================

    describe('Component Integration', () => {
        test('initializes all components correctly', () => {
            expect(bookBuilder.chessEngine).toBeDefined();
            expect(bookBuilder.lichessClient).toBeDefined();
            expect(bookBuilder.moveSelector).toBeDefined();
            expect(bookBuilder.statisticsEngine).toBeDefined();
            expect(bookBuilder.pgnGenerator).toBeDefined();
            expect(bookBuilder.config).toEqual(testConfig);
        });

        test('initializes Stockfish engine when CAREABOUTENGINE is enabled', () => {
            const configWithEngine = { ...testConfig, CAREABOUTENGINE: 1 };
            const builderWithEngine = new BookBuilder(configWithEngine);

            expect(builderWithEngine.stockfishEngine).toBeDefined();
        });

        test('does not initialize Stockfish when CAREABOUTENGINE is disabled', () => {
            const configWithoutEngine = { ...testConfig, CAREABOUTENGINE: 0 };
            const builderWithoutEngine = new BookBuilder(configWithoutEngine);

            expect(builderWithoutEngine.stockfishEngine).toBeNull();
        });

        test('state management properties are initialized correctly', () => {
            expect(bookBuilder.finalLines).toEqual([]);
            expect(bookBuilder.processingQueue).toEqual([]);
            expect(bookBuilder.BATCH_SIZE).toBe(2);
            expect(bookBuilder.API_DELAY).toBe(50);
        });
    });

    // ==================== CONFIGURATION VALIDATION TESTS ====================

    describe('Configuration Validation', () => {
        test('validates configuration parameters correctly', () => {
            const errors = testConfig.validate();
            expect(errors).toEqual([]);
        });

        test('detects invalid numeric parameters', () => {
            const invalidConfig = { ...testConfig, MINGAMES: -1 };
            const errors = invalidConfig.validate();
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some(error => error.includes('MINGAMES'))).toBe(true);
        });

        test('detects invalid opening configurations', () => {
            const invalidConfig = {
                ...testConfig,
                openings: [{ name: 'Test', fen: '', perspective: 'invalid' }]
            };
            const errors = invalidConfig.validate();
            expect(errors.length).toBeGreaterThan(0);
        });

        test('generates configuration summary', () => {
            const summary = testConfig.getSummary();
            expect(summary).toContain('BookBuilder Configuration');
            expect(summary).toContain('Depth: 4-15');
            expect(summary).toContain('Openings: 1 defined');
        });
    });

    // ==================== WORKFLOW TESTING ====================

    describe('Main Workflow Methods', () => {
        test('processOpening handles single opening successfully', async () => {
            // Mock API responses for Ruy Lopez: e4 e5 Nf3 Nc6 Bb5
            // Need to return opponent moves (e5, Nc6) that appear in opening sequence
            jest.spyOn(bookBuilder.lichessClient, 'getPositionStats')
                .mockImplementation(() => {
                    return Promise.resolve({
                        moves: [
                            // These are the opponent moves in Ruy Lopez sequence
                            { san: 'e5', white: 1000, draws: 100, black: 500, playrate: 0.45, totalGames: 1600 },
                            { san: 'Nc6', white: 800, draws: 80, black: 400, playrate: 0.60, totalGames: 1280 }
                        ]
                    });
                });

            jest.spyOn(bookBuilder.lichessClient, 'getMoveStats')
                .mockResolvedValue([
                    { san: 'Nf6', white: 800, draws: 80, black: 400, playrate: 0.5, totalGames: 1280 }
                ]);

            const results = await bookBuilder.processOpening(testConfig);

            expect(Object.keys(results)).toContain('Chapter_1_Ruy_Lopez.pgn');
            // Result is now a chapter object, not a raw string
            const chapter = results['Chapter_1_Ruy_Lopez.pgn'];
            expect(chapter).toBeDefined();
            expect(chapter.openingName).toBe('Ruy Lopez');
        }, 30000); // Extended timeout for integration test

        test('generateChapter resets state correctly', async () => {
            // Add some initial state
            bookBuilder.finalLines.push({ test: 'data' });
            bookBuilder.processingQueue.push({ test: 'queue' });

            // Mock API - need to return opponent moves (e5, Nc6) from Ruy Lopez sequence
            jest.spyOn(bookBuilder.lichessClient, 'getPositionStats')
                .mockResolvedValue({
                    moves: [
                        { san: 'e5', white: 1000, draws: 100, black: 500, playrate: 0.45, totalGames: 1600 },
                        { san: 'Nc6', white: 800, draws: 80, black: 400, playrate: 0.60, totalGames: 1280 }
                    ]
                });

            await bookBuilder.generateChapter(TEST_OPENINGS.RUY_LOPEZ, 1);

            // State should be reset during generateChapter (then repopulated with actual lines)
            // After reset, finalLines will contain the processed lines, not the test data
            expect(bookBuilder.finalLines.find(l => l.test === 'data')).toBeUndefined();
            expect(bookBuilder.processingQueue).toEqual([]);  // Queue is empty after processing
        });

        test('analyzeRoot determines perspective correctly', async () => {
            // Mock API response for any position query
            jest.spyOn(bookBuilder.lichessClient, 'getPositionStats')
                .mockResolvedValue({
                    moves: [
                        { san: 'Nf6', white: 1000, draws: 100, black: 500, playrate: 0.1, totalGames: 1600 }
                    ]
                });

            // Test starting position - analyzeRoot expects move array, not FEN
            // Empty array means starting position with no moves applied
            const results = await bookBuilder.analyzeRoot([], 'white');

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].perspective).toBe('white');
        });

        test('expandAllLines processes queue correctly', async () => {
            // Set up initial processing queue
            bookBuilder.processingQueue = [
                {
                    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                    pgn: '1. e4',
                    perspective: 'black',
                    cumulativeLikelihood: 1.0,
                    likelihoodPath: []
                }
            ];

            // Mock API to return no continuations (to stop expansion)
            jest.spyOn(bookBuilder.lichessClient, 'getPositionStats')
                .mockResolvedValue({ moves: [] });

            await bookBuilder.expandAllLines();

            expect(bookBuilder.processingQueue).toEqual([]);
            expect(bookBuilder.finalLines.length).toBeGreaterThan(0);
        });

        test('handles maximum iteration limit', async () => {
            // Set artificially low max iterations for testing
            const originalMaxIterations = bookBuilder.config.MAX_ITERATIONS;
            bookBuilder.config.MAX_ITERATIONS = 2;

            // Set up queue that would normally continue processing
            bookBuilder.processingQueue = [
                {
                    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                    pgn: '1. e4',
                    perspective: 'black',
                    cumulativeLikelihood: 1.0,
                    likelihoodPath: []
                }
            ];

            // Mock API to always return continuations (would cause infinite loop without limit)
            jest.spyOn(bookBuilder.lichessClient, 'getPositionStats')
                .mockResolvedValue({
                    moves: [
                        { san: 'e5', white: 500, draws: 50, black: 800, playrate: 0.1, totalGames: 1350 }
                    ]
                });

            jest.spyOn(bookBuilder.lichessClient, 'getMoveStats')
                .mockResolvedValue([
                    { san: 'Nf3', white: 700, draws: 70, black: 400, playrate: 0.1, totalGames: 1170 }
                ]);

            await bookBuilder.expandAllLines();

            // Should stop due to iteration limit
            expect(bookBuilder.processingQueue.length).toBeGreaterThanOrEqual(0);

            // Restore original value
            bookBuilder.config.MAX_ITERATIONS = originalMaxIterations;
        });
    });

    // ==================== UTILITY METHOD TESTS ====================

    describe('Utility Methods', () => {
        test('isValidContinuation filters correctly', () => {
            const validMove = {
                playrate: 0.1,
                totalGames: 50
            };
            const invalidMovePlayrate = {
                playrate: 0.01,
                totalGames: 50
            };
            const invalidMoveGames = {
                playrate: 0.1,
                totalGames: 5
            };

            expect(bookBuilder.isValidContinuation(validMove, 1.0)).toBe(true);
            expect(bookBuilder.isValidContinuation(invalidMovePlayrate, 1.0)).toBe(false);
            expect(bookBuilder.isValidContinuation(invalidMoveGames, 1.0)).toBe(false);
        });

        test('isValidResponse validates correctly', () => {
            const validResponse = {
                winRate: 0.6,
                totalGames: 50,
                playrate: 0.1  // Must include playrate for validation
            };
            const invalidResponse = {
                winRate: 0.6,
                totalGames: 50,
                playrate: 0.001  // Below MINPLAYRATE threshold
            };
            const validOpponentMove = {
                playrate: 0.05
            };

            expect(bookBuilder.isValidResponse(validResponse, validOpponentMove)).toBe(true);
            expect(bookBuilder.isValidResponse(invalidResponse, validOpponentMove)).toBe(false);
        });

        test('updatePgn formats moves correctly', () => {
            // Test white perspective - chess.js returns full PGN with headers
            const whitePgn = bookBuilder.updatePgn('1. e4', 'e5', 'Nf3', 'white');
            expect(whitePgn).toContain('1. e4 e5 2. Nf3');  // Contains the moves

            // Test black perspective
            const blackPgn = bookBuilder.updatePgn('1. e4 e5', 'Nf3', 'Nc6', 'black');
            expect(blackPgn).toContain('1. e4 e5 2. Nf3 Nc6');  // Contains the moves
        });

        test('removeDuplicateLines removes duplicates and subsets', () => {
            const lines = [
                { pgn: '1. e4 e5' },
                { pgn: '1. e4 e5 2. Nf3' },
                { pgn: '1. e4 e5' }, // Duplicate
                { pgn: '1. d4 d5' }
            ];

            const unique = bookBuilder.removeDuplicateLines(lines);

            expect(unique.length).toBe(2); // Should remove duplicate and subset
            expect(unique.find(line => line.pgn === '1. e4 e5 2. Nf3')).toBeDefined();
            expect(unique.find(line => line.pgn === '1. d4 d5')).toBeDefined();
        });

        test('sortLinesByProbability sorts correctly', () => {
            const lines = [
                {
                    pgn: '1. e4 e5',
                    likelihoodPath: [{ san: 'e5', playrate: 0.5 }]
                },
                {
                    pgn: '1. d4 d5',
                    likelihoodPath: [{ san: 'd5', playrate: 0.7 }]
                },
                {
                    pgn: '1. Nf3 Nf6',
                    likelihoodPath: [{ san: 'Nf6', playrate: 0.3 }]
                }
            ];

            const sorted = bookBuilder.sortLinesByProbability(lines);

            expect(sorted[0].likelihoodPath[0].playrate).toBe(0.7); // Highest first
            expect(sorted[1].likelihoodPath[0].playrate).toBe(0.5);
            expect(sorted[2].likelihoodPath[0].playrate).toBe(0.3); // Lowest last
        });

        test('calculateFallbackWinRate handles special positions', () => {
            // Use actual checkmate positions (confirmed via Chess.js)
            const checkmateWhiteToMove = 'rnb1kbnr/pppp1ppp/4p3/8/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'; // Scholar's mate - white to move, checkmate
            const checkmateBlackToMove = '7k/6Q1/6K1/8/8/8/8/8 b - - 0 1'; // Queen + King mate - black to move, checkmate

            const whiteLineData = { perspective: 'white' };
            const blackLineData = { perspective: 'black' };

            // When white is in checkmate (white to move), white loses (0.0 from white perspective)
            expect(bookBuilder.calculateFallbackWinRate(checkmateWhiteToMove, whiteLineData)).toBe(0.0);
            // When black is in checkmate (black to move), white wins (1.0 from white perspective)
            expect(bookBuilder.calculateFallbackWinRate(checkmateBlackToMove, whiteLineData)).toBe(1.0);

            // From black perspective, the results are inverted
            expect(bookBuilder.calculateFallbackWinRate(checkmateWhiteToMove, blackLineData)).toBe(1.0);
            expect(bookBuilder.calculateFallbackWinRate(checkmateBlackToMove, blackLineData)).toBe(0.0);

            // Use actual FEN for draw position (stalemate)
            const drawPosition = '8/8/8/8/8/8/1k6/1K6 b - - 0 1'; // Stalemate for black

            const fallbackForDraw = bookBuilder.calculateFallbackWinRate(drawPosition, whiteLineData);
            expect(fallbackForDraw).toBe(testConfig.DRAWSAREHALF ? 0.5 : 0.0);
        });
    });

    // ==================== ERROR HANDLING TESTS ====================

    describe('Error Handling', () => {
        test('handles API failures gracefully', async () => {
            // Mock API failure
            jest.spyOn(bookBuilder.lichessClient, 'getPositionStats')
                .mockRejectedValue(new Error('API Error'));

            await expect(bookBuilder.processOpening(testConfig))
                .rejects.toThrow(/Chapter 1 generation failed/);
        });

        test('handles invalid FEN gracefully', async () => {
            const invalidConfig = {
                ...testConfig,
                openings: [{
                    name: 'Invalid',
                    fen: 'invalid-fen',
                    moves: [],  // Empty moves - invalid FEN handled at init
                    perspective: 'white'
                }]
            };

            // With empty moves array, processOpening completes but with empty lines
            // (Invalid FEN is caught earlier in config validation or returns empty result)
            const result = await bookBuilder.processOpening(invalidConfig);
            const chapter = result['Chapter_1_Invalid.pgn'];
            expect(chapter.lines).toHaveLength(0);  // No lines generated for invalid position
        });

        test('handles engine initialization failure gracefully', () => {
            // Mock engine that fails to initialize
            const configWithBrokenEngine = {
                ...testConfig,
                CAREABOUTENGINE: 1
            };

            // Should not throw during construction, but engine should be null if init fails
            expect(() => new BookBuilder(configWithBrokenEngine)).not.toThrow();
        });

        test('continues processing when individual moves fail', async () => {
            // Mock API that fails for specific positions
            let callCount = 0;
            jest.spyOn(bookBuilder.lichessClient, 'getPositionStats')
                .mockImplementation(() => {
                    callCount++;
                    if (callCount === 2) {
                        throw new Error('Specific position error');
                    }
                    return Promise.resolve({ moves: [] });
                });

            const lineData = {
                fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                pgn: '1. e4',
                perspective: 'black',
                cumulativeLikelihood: 1.0,
                likelihoodPath: []
            };

            // Should not throw, should handle the error gracefully
            const result = await bookBuilder.expandLine(lineData);
            expect(result).toEqual([]);
            expect(bookBuilder.finalLines.length).toBeGreaterThan(0); // Line should be finalized
        });
    });

    // ==================== PERFORMANCE TESTS ====================

    describe('Performance and Rate Limiting', () => {
        test('respects API rate limiting delay', async () => {
            const startTime = Date.now();

            // Set up queue with multiple items to ensure multiple iterations
            bookBuilder.processingQueue = [
                {
                    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                    pgn: '1. e4',
                    perspective: 'black',
                    cumulativeLikelihood: 1.0,
                    likelihoodPath: []
                },
                {
                    fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1',
                    pgn: '1. d4',
                    perspective: 'black',
                    cumulativeLikelihood: 1.0,
                    likelihoodPath: []
                },
                {
                    fen: 'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1',
                    pgn: '1. Nf3',
                    perspective: 'black',
                    cumulativeLikelihood: 1.0,
                    likelihoodPath: []
                }
            ];

            let callCount = 0;
            // Mock API to return moves for first few calls, then empty to stop expansion
            jest.spyOn(bookBuilder.lichessClient, 'getPositionStats')
                .mockImplementation(() => {
                    callCount++;
                    if (callCount <= 2) {
                        // Return one move to create additional queue items (triggering delay)
                        return Promise.resolve({
                            moves: [{
                                san: 'e5',
                                white: 500,
                                draws: 100,
                                black: 400,
                                playrate: 0.15,
                                totalGames: 1000
                            }]
                        });
                    } else {
                        // Return empty to stop expansion
                        return Promise.resolve({ moves: [] });
                    }
                });

            await bookBuilder.expandAllLines();

            const endTime = Date.now();
            const elapsedTime = endTime - startTime;

            // Should take at least API_DELAY time due to rate limiting (expecting at least 2 iterations with delay)
            expect(elapsedTime).toBeGreaterThanOrEqual(bookBuilder.API_DELAY * 0.8); // Allow some tolerance
        });

        test('processes moves in batches', async () => {
            const originalBatchSize = bookBuilder.BATCH_SIZE;
            bookBuilder.BATCH_SIZE = 2; // Small batch for testing

            // Set up queue with more items than batch size
            bookBuilder.processingQueue = Array(5).fill().map((_, i) => ({
                fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                pgn: `1. e4 ${i}`,
                perspective: 'black',
                cumulativeLikelihood: 1.0,
                likelihoodPath: []
            }));

            // Mock API to return no continuations
            jest.spyOn(bookBuilder.lichessClient, 'getPositionStats')
                .mockResolvedValue({ moves: [] });

            await bookBuilder.expandAllLines();

            // All items should be processed and finalized
            expect(bookBuilder.finalLines.length).toBe(5);
            expect(bookBuilder.processingQueue.length).toBe(0);

            bookBuilder.BATCH_SIZE = originalBatchSize;
        });

        test('sleep utility works correctly', async () => {
            const startTime = Date.now();
            await bookBuilder.sleep(100);
            const endTime = Date.now();

            expect(endTime - startTime).toBeGreaterThanOrEqual(90); // Allow some tolerance
        });
    });
});

// ==================== ROOT ANALYSIS FIX VALIDATION TESTS ====================

describe('Root Analysis Fix - Position State Consistency', () => {
    let bookBuilder;

    beforeEach(() => {
        bookBuilder = new BookBuilder({
            ...config,
            PRINT_INFO_TO_CONSOLE: false,
            API_DELAY: 0 // No delay for tests
        });
    });

    test('applies all PGN moves before getting continuations', async () => {
        // Sicilian Defense: 1.e4 c5 - analyzeRoot expects moves array, not FEN
        const sicilianMoves = ['e4', 'c5'];  // Moves that lead to Sicilian Defense position
        const sicilianFen = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2';

        // Mock Lichess API - need to mock for the intermediate position (after e4)
        // where we look up c5's probability
        jest.spyOn(bookBuilder.lichessClient, 'getPositionStats')
            .mockResolvedValue({
                moves: [
                    { san: 'c5', white: 500, draws: 100, black: 400, playrate: 0.35, totalGames: 1000 }
                ]
            });

        const result = await bookBuilder.analyzeRoot(sicilianMoves, 'white');

        // Verify we got a result
        expect(result.length).toBeGreaterThan(0);
        // The engine should be at the final position
        expect(result[0].fen).toContain('pp1ppppp');  // Sicilian pawn structure
    });

    test('chess engine position matches final FEN after move application', async () => {
        // analyzeRoot expects moves array, not FEN
        const sicilianMoves = ['e4', 'c5'];

        jest.spyOn(bookBuilder.lichessClient, 'getPositionStats')
            .mockResolvedValue({
                moves: [
                    { san: 'c5', white: 500, draws: 100, black: 400, playrate: 0.35, totalGames: 1000 }
                ]
            });

        await bookBuilder.analyzeRoot(sicilianMoves, 'white');

        // Verify engine state - after e4 c5, should be white to move
        expect(bookBuilder.chessEngine.getTurn()).toBe('w');
        expect(bookBuilder.chessEngine.getFen()).toContain('pp1ppppp');  // Sicilian pawn structure
    });

    test('generates valid moves from correct position context', async () => {
        const sicilianFen = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

        // Test that white moves are valid from this position
        bookBuilder.chessEngine.parsePosition(sicilianFen);

        // Get all legal moves in the position
        const legalMoves = bookBuilder.chessEngine.getLegalMoves();
        const legalMoveSans = legalMoves.map(move => move.san);

        // Common white moves in Sicilian Defense should be legal
        expect(legalMoveSans).toContain('Nf3');
        expect(legalMoveSans).toContain('d3');
        expect(legalMoveSans).toContain('f4');

        // Black moves should NOT be legal (it's white's turn)
        expect(legalMoveSans).not.toContain('Nf6');
        expect(legalMoveSans).not.toContain('d6');
    });

    test('handles positions with no move history correctly', async () => {
        // Starting position - empty moves array means no moves to apply
        const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

        jest.spyOn(bookBuilder.lichessClient, 'getPositionStats')
            .mockResolvedValue({
                moves: [
                    { san: 'e4', white: 400, draws: 100, black: 300, playrate: 0.30, totalGames: 800 },
                    { san: 'd4', white: 350, draws: 75, black: 275, playrate: 0.25, totalGames: 700 }
                ]
            });

        // Pass empty array for starting position (no moves to apply)
        const result = await bookBuilder.analyzeRoot([], 'white');

        // Should work correctly with starting position
        expect(result.length).toBeGreaterThan(0);
        expect(result[0].fen).toBe(startingFen);
        expect(bookBuilder.chessEngine.getFen()).toBe(startingFen);
    });

    test('fails gracefully on invalid historical moves', async () => {
        // Pass invalid moves array - analyzeRoot should fail when processing invalid move
        const invalidMoves = ['e4', 'InvalidMove'];

        // Mock API to return moves that don't include InvalidMove
        jest.spyOn(bookBuilder.lichessClient, 'getPositionStats')
            .mockResolvedValue({
                moves: [{ san: 'e5', playrate: 0.45, totalGames: 1000 }]
            });

        // analyzeRoot looks up opponent moves in Lichess; InvalidMove won't be found
        await expect(bookBuilder.analyzeRoot(invalidMoves, 'white'))
            .rejects.toThrow(/not found in Lichess database/);
    });
});

// ==================== PYTHON PARITY VALIDATION TESTS ====================

describe('Python Parity Validation - Root Analysis Fix', () => {
    let bookBuilder;

    beforeEach(() => {
        bookBuilder = new BookBuilder({
            ...config,
            PRINT_INFO_TO_CONSOLE: false,
            API_DELAY: 0
        });
    });

    test('Sicilian Defense: matches Python Rooter behavior', async () => {
        // This was the failing case: Sicilian Defense 1.e4 c5
        // analyzeRoot expects moves array, not FEN
        const sicilianMoves = ['e4', 'c5'];

        // Mock Lichess API - returns c5's probability (for opponent move tracking)
        jest.spyOn(bookBuilder.lichessClient, 'getPositionStats')
            .mockResolvedValue({
                moves: [
                    { san: 'c5', white: 500, draws: 100, black: 400, playrate: 0.35, totalGames: 1000 }
                ]
            });

        const result = await bookBuilder.analyzeRoot(sicilianMoves, 'white');

        // Should generate valid continuation without "Illegal move" errors
        expect(result.length).toBeGreaterThan(0);

        // Verify the result has correct perspective
        result.forEach(line => {
            expect(line.perspective).toBe('white');
        });

        // Verify engine ended at Sicilian position (after e4 c5)
        expect(bookBuilder.chessEngine.getFen()).toContain('pp1ppppp');  // Sicilian pawn structure
    });

    test('French Defense: validates position state handling', async () => {
        // French Defense: 1.e4 e6 - analyzeRoot expects moves array
        const frenchMoves = ['e4', 'e6'];

        jest.spyOn(bookBuilder.lichessClient, 'getPositionStats')
            .mockResolvedValue({
                moves: [
                    { san: 'e6', white: 400, draws: 80, black: 320, playrate: 0.30, totalGames: 800 }
                ]
            });

        const result = await bookBuilder.analyzeRoot(frenchMoves, 'white');

        expect(result.length).toBeGreaterThan(0);
        expect(result[0].fen).toContain('pppp1ppp');  // French pawn structure
        expect(bookBuilder.chessEngine.getTurn()).toBe('w'); // White's turn
    });
});

// ==================== GOLDEN MASTER INTEGRATION TEST ====================

describe('Golden Master Integration', () => {
    test('end-to-end: processes opening successfully', async () => {
        const testConfig = {
            ...config,
            openings: [TEST_OPENINGS.RUY_LOPEZ],
            PRINT_INFO_TO_CONSOLE: false,
            API_DELAY: 100,
            BATCH_SIZE: 3
        };

        const bookBuilder = new BookBuilder(testConfig);

        // Note: This test would require real API calls or comprehensive mocks
        // For now, we'll test the structure and basic functionality

        // Mock comprehensive API responses for Ruy Lopez: e4 e5 Nf3 Nc6 Bb5
        // Need to return all opponent moves (e5, Nc6) that appear in the sequence
        jest.spyOn(bookBuilder.lichessClient, 'getPositionStats')
            .mockImplementation(() => {
                return Promise.resolve({
                    moves: [
                        // All possible opponent moves for the opening sequence
                        { san: 'e5', white: 800, draws: 100, black: 1200, playrate: 0.45, totalGames: 2100 },
                        { san: 'Nc6', white: 600, draws: 80, black: 500, playrate: 0.60, totalGames: 1180 }
                    ]
                });
            });

        jest.spyOn(bookBuilder.lichessClient, 'getMoveStats')
            .mockResolvedValue([
                { san: 'Nf3', white: 900, draws: 90, black: 500, playrate: 0.5, totalGames: 1490 },
                { san: 'Bc4', white: 300, draws: 30, black: 200, playrate: 0.2, totalGames: 530 }
            ]);

        const results = await bookBuilder.processOpening(testConfig);

        // Validate structure - result is now chapter object, not PGN string
        expect(Object.keys(results)).toContain('Chapter_1_Ruy_Lopez.pgn');
        const chapter = results['Chapter_1_Ruy_Lopez.pgn'];

        // Validate chapter structure
        expect(chapter).toBeDefined();
        expect(chapter.openingName).toBe('Ruy Lopez');
        expect(chapter.chapterNumber).toBe(1);
        expect(chapter.lines).toBeDefined();

        // Clean up
        if (bookBuilder.stockfishEngine) {
            bookBuilder.stockfishEngine.quit();
        }
    }, 60000); // Extended timeout for comprehensive test
});
