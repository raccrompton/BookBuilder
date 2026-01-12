/**
 * =============================================================================
 * mcp-server.test.js - Unit Tests for BookBuilder MCP Server
 * =============================================================================
 *
 * PURPOSE:
 * Tests the MCP (Model Context Protocol) server that exposes chess analysis tools.
 * The server provides tools for position analysis, move selection, engine evaluation,
 * and repertoire generation.
 *
 * KEY CONCEPTS:
 * - MCP Protocol: Standard protocol for tool exposure to AI assistants
 * - FEN: Forsyth-Edwards Notation for representing chess positions
 * - SAN: Standard Algebraic Notation for chess moves (e.g., 'e4', 'Nf3')
 * - Centipawn: Unit of chess evaluation (100 cp = 1 pawn advantage)
 *
 * HOW IT FITS IN:
 * - Used by: Claude Desktop/Code to analyze chess positions
 * - Depends on: Lichess API (for opening statistics), Stockfish (for engine evaluation)
 */

// =============================================================================
// Mock Dependencies - External services and chess engine
// =============================================================================

// Mock the Lichess API client for opening statistics
jest.mock('../src/lichess-api.js', () => ({
    LichessApi: jest.fn().mockImplementation(() => ({
        getOpeningStats: jest.fn() // Method to fetch position statistics from Lichess
    }))
}));

// Mock the Stockfish chess engine
jest.mock('../src/stockfish-engine.js', () => ({
    StockfishEngine: jest.fn().mockImplementation(() => ({
        analyze: jest.fn(), // Method to get engine evaluation
        isReady: jest.fn().mockResolvedValue(true), // Check if engine is initialized
        quit: jest.fn().mockResolvedValue(undefined) // Cleanup method
    }))
}));

// Mock the move selector for statistical analysis
jest.mock('../src/move-selector.js', () => ({
    MoveSelector: jest.fn().mockImplementation(() => ({
        selectBestMove: jest.fn() // Method to pick best move based on statistics
    }))
}));

// Mock the repertoire generator
jest.mock('../src/repertoire-generator.js', () => ({
    RepertoireGenerator: jest.fn().mockImplementation(() => ({
        generate: jest.fn() // Method to generate complete repertoire
    }))
}));

// Import the MCP server and tools (will be created during implementation)
const { createMcpServer, MCPServer } = require('../src/index.js');
const { LichessApi } = require('../src/lichess-api.js');
const { StockfishEngine } = require('../src/stockfish-engine.js');
const { MoveSelector } = require('../src/move-selector.js');
const { RepertoireGenerator } = require('../src/repertoire-generator.js');

// =============================================================================
// Test Constants - Valid test data for chess positions
// =============================================================================

const VALID_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'; // Starting position
const VALID_FEN_AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'; // After 1. e4
const INVALID_FEN = 'invalid-fen-string'; // Malformed FEN for error testing
const EMPTY_BOARD_FEN = '8/8/8/8/8/8/8/8 w - - 0 1'; // Empty board (valid but unusual)

// =============================================================================
// Test Suite: MCP Server
// =============================================================================

describe('MCPServer', () => {
    let mcpServer; // Server instance for tests
    let mockLichessApi; // Mock API instance
    let mockStockfishEngine; // Mock engine instance
    let mockMoveSelector; // Mock selector instance
    let mockRepertoireGenerator; // Mock generator instance

    beforeEach(() => {
        // Reset all mocks before each test to ensure test isolation
        jest.clearAllMocks();

        // Create fresh MCP server instance
        mcpServer = createMcpServer();

        // Get mock instances for assertions
        mockLichessApi = LichessApi.mock.results[0]?.value || LichessApi.mock.instances[0];
        mockStockfishEngine = StockfishEngine.mock.results[0]?.value || StockfishEngine.mock.instances[0];
        mockMoveSelector = MoveSelector.mock.results[0]?.value || MoveSelector.mock.instances[0];
        mockRepertoireGenerator = RepertoireGenerator.mock.results[0]?.value || RepertoireGenerator.mock.instances[0];
    });

    afterEach(async () => {
        // Cleanup server resources
        if (mcpServer && typeof mcpServer.shutdown === 'function') {
            await mcpServer.shutdown();
        }
    });

    // =========================================================================
    // Server Lifecycle Tests
    // =========================================================================

    describe('Server Lifecycle', () => {
        test('creates server instance with stdio transport', () => {
            // Arrange & Act - server created in beforeEach

            // Assert - server should be a valid MCP server instance
            expect(mcpServer).toBeDefined();
            expect(mcpServer).toBeInstanceOf(MCPServer);
        });

        test('exposes required tools', () => {
            // Arrange - server created in beforeEach

            // Act - get list of available tools
            const tools = mcpServer.getTools();

            // Assert - all four tools should be available
            expect(tools).toContainEqual(expect.objectContaining({ name: 'analyze_position' }));
            expect(tools).toContainEqual(expect.objectContaining({ name: 'select_best_move' }));
            expect(tools).toContainEqual(expect.objectContaining({ name: 'evaluate_position' }));
            expect(tools).toContainEqual(expect.objectContaining({ name: 'generate_repertoire' }));
        });

        test('gracefully shuts down when requested', async () => {
            // Arrange - server created in beforeEach

            // Act
            await mcpServer.shutdown();

            // Assert - engine should be quit
            expect(mockStockfishEngine.quit).toHaveBeenCalled();
        });

        test('handles shutdown when engine is not initialized', async () => {
            // Arrange - create server but engine not ready
            const freshServer = createMcpServer();

            // Act & Assert - should not throw even if engine not initialized
            await expect(freshServer.shutdown()).resolves.not.toThrow();
        });
    });

    // =========================================================================
    // Tool: analyze_position
    // =========================================================================

    describe('analyze_position', () => {
        describe('successful analysis', () => {
            test('returns position statistics for valid FEN', async () => {
                // Arrange - mock Lichess API response with opening statistics
                const mockStats = {
                    white: 45000, // Games won by white
                    draws: 30000, // Games drawn
                    black: 25000, // Games won by black
                    moves: [
                        { san: 'e4', white: 20000, draws: 12000, black: 10000 },
                        { san: 'd4', white: 15000, draws: 10000, black: 8000 },
                        { san: 'Nf3', white: 5000, draws: 4000, black: 3000 }
                    ]
                };
                mockLichessApi.getOpeningStats.mockResolvedValue(mockStats);

                // Act - call analyze_position tool
                const result = await mcpServer.callTool('analyze_position', {
                    fen: VALID_FEN
                });

                // Assert - should return formatted statistics
                expect(result.totalGames).toBe(100000); // Sum of white + draws + black
                expect(result.wins).toEqual({ white: 45000, draws: 30000, black: 25000 });
                expect(result.moves).toHaveLength(3);
                expect(result.moves[0]).toMatchObject({
                    san: 'e4',
                    playRate: expect.any(Number), // Percentage of games this move was played
                    winRate: expect.any(Number), // Win percentage for the side to move
                    gameCount: 42000 // Total games where this move was played
                });
            });

            test('calculates correct playrate percentages', async () => {
                // Arrange - specific numbers to verify calculation
                const mockStats = {
                    white: 50, draws: 30, black: 20, // Total 100 games
                    moves: [
                        { san: 'e4', white: 25, draws: 15, black: 10 } // 50 games = 50% playrate
                    ]
                };
                mockLichessApi.getOpeningStats.mockResolvedValue(mockStats);

                // Act
                const result = await mcpServer.callTool('analyze_position', {
                    fen: VALID_FEN
                });

                // Assert - playrate should be 50% (50/100)
                expect(result.moves[0].playRate).toBeCloseTo(50, 1);
            });

            test('calculates win rate from white perspective in starting position', async () => {
                // Arrange - white to move, so win rate is white wins / total
                const mockStats = {
                    white: 40, draws: 30, black: 30, // 40% white wins
                    moves: [
                        { san: 'e4', white: 20, draws: 15, black: 15 } // 40% win rate
                    ]
                };
                mockLichessApi.getOpeningStats.mockResolvedValue(mockStats);

                // Act
                const result = await mcpServer.callTool('analyze_position', {
                    fen: VALID_FEN // White to move
                });

                // Assert - win rate should reflect white's perspective
                expect(result.moves[0].winRate).toBeCloseTo(40, 1);
            });

            test('calculates win rate from black perspective after 1. e4', async () => {
                // Arrange - black to move, so win rate is black wins / total
                const mockStats = {
                    white: 30, draws: 30, black: 40, // 40% black wins
                    moves: [
                        { san: 'e5', white: 15, draws: 15, black: 20 } // 40% win rate for black
                    ]
                };
                mockLichessApi.getOpeningStats.mockResolvedValue(mockStats);

                // Act
                const result = await mcpServer.callTool('analyze_position', {
                    fen: VALID_FEN_AFTER_E4 // Black to move
                });

                // Assert - win rate should reflect black's perspective
                expect(result.moves[0].winRate).toBeCloseTo(40, 1);
            });

            test('applies speed filter when provided', async () => {
                // Arrange
                const mockStats = { white: 10, draws: 5, black: 5, moves: [] };
                mockLichessApi.getOpeningStats.mockResolvedValue(mockStats);

                // Act
                await mcpServer.callTool('analyze_position', {
                    fen: VALID_FEN,
                    speeds: ['rapid', 'classical'] // Only rapid and classical games
                });

                // Assert - API should be called with speed filter
                expect(mockLichessApi.getOpeningStats).toHaveBeenCalledWith(
                    VALID_FEN,
                    expect.objectContaining({ speeds: ['rapid', 'classical'] })
                );
            });

            test('applies rating filter when provided', async () => {
                // Arrange
                const mockStats = { white: 10, draws: 5, black: 5, moves: [] };
                mockLichessApi.getOpeningStats.mockResolvedValue(mockStats);

                // Act
                await mcpServer.callTool('analyze_position', {
                    fen: VALID_FEN,
                    ratings: [1800, 2000, 2200] // Games from 1800-2200 rated players
                });

                // Assert - API should be called with rating filter
                expect(mockLichessApi.getOpeningStats).toHaveBeenCalledWith(
                    VALID_FEN,
                    expect.objectContaining({ ratings: [1800, 2000, 2200] })
                );
            });

            test('returns empty moves array when position has no data', async () => {
                // Arrange - novel position with no games
                const mockStats = { white: 0, draws: 0, black: 0, moves: [] };
                mockLichessApi.getOpeningStats.mockResolvedValue(mockStats);

                // Act
                const result = await mcpServer.callTool('analyze_position', {
                    fen: EMPTY_BOARD_FEN
                });

                // Assert
                expect(result.totalGames).toBe(0);
                expect(result.moves).toEqual([]);
            });
        });

        describe('input validation', () => {
            test('throws error for missing FEN parameter', async () => {
                // Arrange & Act & Assert
                await expect(
                    mcpServer.callTool('analyze_position', {})
                ).rejects.toThrow(/fen.*required/i);
            });

            test('throws error for invalid FEN format', async () => {
                // Arrange & Act & Assert
                await expect(
                    mcpServer.callTool('analyze_position', { fen: INVALID_FEN })
                ).rejects.toThrow(/invalid.*fen/i);
            });

            test('throws error for empty FEN string', async () => {
                // Arrange & Act & Assert
                await expect(
                    mcpServer.callTool('analyze_position', { fen: '' })
                ).rejects.toThrow(/fen.*required/i);
            });

            test('throws error for invalid speed values', async () => {
                // Arrange & Act & Assert
                await expect(
                    mcpServer.callTool('analyze_position', {
                        fen: VALID_FEN,
                        speeds: ['invalid_speed']
                    })
                ).rejects.toThrow(/invalid.*speed/i);
            });
        });

        describe('error handling', () => {
            test('handles Lichess API failure gracefully', async () => {
                // Arrange - API returns error
                mockLichessApi.getOpeningStats.mockRejectedValue(
                    new Error('API rate limited')
                );

                // Act & Assert - should propagate meaningful error
                await expect(
                    mcpServer.callTool('analyze_position', { fen: VALID_FEN })
                ).rejects.toThrow(/lichess.*api|rate.*limit/i);
            });

            test('handles network timeout', async () => {
                // Arrange - API times out
                mockLichessApi.getOpeningStats.mockRejectedValue(
                    new Error('Network timeout')
                );

                // Act & Assert
                await expect(
                    mcpServer.callTool('analyze_position', { fen: VALID_FEN })
                ).rejects.toThrow(/timeout|network/i);
            });
        });
    });

    // =========================================================================
    // Tool: select_best_move
    // =========================================================================

    describe('select_best_move', () => {
        describe('successful selection', () => {
            test('returns best move recommendation for white', async () => {
                // Arrange - mock move selector response
                const mockSelection = {
                    move: 'e4', // Best move in SAN notation
                    winRate: 54.5, // Expected win rate
                    confidence: { lower: 52.0, upper: 57.0 }, // Confidence interval
                    reasoning: 'Highest win rate with sufficient sample size'
                };
                mockMoveSelector.selectBestMove.mockResolvedValue(mockSelection);

                // Act
                const result = await mcpServer.callTool('select_best_move', {
                    fen: VALID_FEN,
                    perspective: 'white'
                });

                // Assert
                expect(result.move).toBe('e4');
                expect(result.winRate).toBeCloseTo(54.5, 1);
                expect(result.confidence).toMatchObject({
                    lower: expect.any(Number),
                    upper: expect.any(Number)
                });
                expect(result.reasoning).toBeDefined();
                expect(typeof result.reasoning).toBe('string');
            });

            test('returns best move recommendation for black', async () => {
                // Arrange
                const mockSelection = {
                    move: 'c5', // Sicilian Defense
                    winRate: 35.5, // Black's expected score
                    confidence: { lower: 33.0, upper: 38.0 },
                    reasoning: 'Fighting reply with good winning chances'
                };
                mockMoveSelector.selectBestMove.mockResolvedValue(mockSelection);

                // Act
                const result = await mcpServer.callTool('select_best_move', {
                    fen: VALID_FEN_AFTER_E4,
                    perspective: 'black'
                });

                // Assert
                expect(result.move).toBe('c5');
                expect(result.perspective).toBe('black');
            });

            test('applies config overrides when provided', async () => {
                // Arrange
                const mockSelection = {
                    move: 'd4',
                    winRate: 53.0,
                    confidence: { lower: 51.0, upper: 55.0 },
                    reasoning: 'Selected with stricter criteria'
                };
                mockMoveSelector.selectBestMove.mockResolvedValue(mockSelection);

                const configOverrides = {
                    minGames: 1000, // Require more games for selection
                    minWinRate: 50 // Minimum acceptable win rate
                };

                // Act
                await mcpServer.callTool('select_best_move', {
                    fen: VALID_FEN,
                    perspective: 'white',
                    config: configOverrides
                });

                // Assert - config should be passed to selector
                expect(mockMoveSelector.selectBestMove).toHaveBeenCalledWith(
                    VALID_FEN,
                    'white',
                    expect.objectContaining(configOverrides)
                );
            });

            test('returns null move when no suitable move found', async () => {
                // Arrange - no moves meet criteria
                mockMoveSelector.selectBestMove.mockResolvedValue({
                    move: null,
                    winRate: null,
                    confidence: null,
                    reasoning: 'No moves meet minimum sample size requirements'
                });

                // Act
                const result = await mcpServer.callTool('select_best_move', {
                    fen: EMPTY_BOARD_FEN,
                    perspective: 'white'
                });

                // Assert
                expect(result.move).toBeNull();
                expect(result.reasoning).toMatch(/no.*move/i);
            });
        });

        describe('input validation', () => {
            test('throws error for missing FEN parameter', async () => {
                // Arrange & Act & Assert
                await expect(
                    mcpServer.callTool('select_best_move', { perspective: 'white' })
                ).rejects.toThrow(/fen.*required/i);
            });

            test('throws error for missing perspective parameter', async () => {
                // Arrange & Act & Assert
                await expect(
                    mcpServer.callTool('select_best_move', { fen: VALID_FEN })
                ).rejects.toThrow(/perspective.*required/i);
            });

            test('throws error for invalid perspective value', async () => {
                // Arrange & Act & Assert
                await expect(
                    mcpServer.callTool('select_best_move', {
                        fen: VALID_FEN,
                        perspective: 'red' // Invalid - must be 'white' or 'black'
                    })
                ).rejects.toThrow(/perspective.*white.*black/i);
            });

            test('throws error for invalid FEN format', async () => {
                // Arrange & Act & Assert
                await expect(
                    mcpServer.callTool('select_best_move', {
                        fen: INVALID_FEN,
                        perspective: 'white'
                    })
                ).rejects.toThrow(/invalid.*fen/i);
            });
        });

        describe('error handling', () => {
            test('handles selector failure gracefully', async () => {
                // Arrange
                mockMoveSelector.selectBestMove.mockRejectedValue(
                    new Error('Analysis failed')
                );

                // Act & Assert
                await expect(
                    mcpServer.callTool('select_best_move', {
                        fen: VALID_FEN,
                        perspective: 'white'
                    })
                ).rejects.toThrow(/analysis.*failed/i);
            });
        });
    });

    // =========================================================================
    // Tool: evaluate_position
    // =========================================================================

    describe('evaluate_position', () => {
        describe('successful evaluation', () => {
            test('returns engine evaluation with default depth', async () => {
                // Arrange - mock Stockfish response
                const mockEvaluation = {
                    score: 30, // Centipawn score (positive = white advantage)
                    bestMove: 'e2e4', // Best move in UCI notation
                    depth: 15 // Analysis depth
                };
                mockStockfishEngine.analyze.mockResolvedValue(mockEvaluation);

                // Act
                const result = await mcpServer.callTool('evaluate_position', {
                    fen: VALID_FEN
                });

                // Assert
                expect(result.centipawns).toBe(30);
                expect(result.bestMove).toBe('e4'); // Should convert UCI to SAN
                expect(result.depth).toBe(15);
                expect(result.quality).toBeDefined(); // Quality assessment string
            });

            test('uses custom depth when provided', async () => {
                // Arrange
                const mockEvaluation = { score: 25, bestMove: 'd2d4', depth: 20 };
                mockStockfishEngine.analyze.mockResolvedValue(mockEvaluation);

                // Act
                await mcpServer.callTool('evaluate_position', {
                    fen: VALID_FEN,
                    depth: 20
                });

                // Assert
                expect(mockStockfishEngine.analyze).toHaveBeenCalledWith(
                    VALID_FEN,
                    20
                );
            });

            test('returns quality assessment for equal position', async () => {
                // Arrange - roughly equal position
                const mockEvaluation = { score: 15, bestMove: 'e2e4', depth: 15 };
                mockStockfishEngine.analyze.mockResolvedValue(mockEvaluation);

                // Act
                const result = await mcpServer.callTool('evaluate_position', {
                    fen: VALID_FEN
                });

                // Assert - score near 0 should be "equal"
                expect(result.quality).toMatch(/equal|balanced/i);
            });

            test('returns quality assessment for white advantage', async () => {
                // Arrange - clear white advantage (150 cp = 1.5 pawns)
                const mockEvaluation = { score: 150, bestMove: 'e2e4', depth: 15 };
                mockStockfishEngine.analyze.mockResolvedValue(mockEvaluation);

                // Act
                const result = await mcpServer.callTool('evaluate_position', {
                    fen: VALID_FEN
                });

                // Assert
                expect(result.quality).toMatch(/white.*advantage|better.*white/i);
            });

            test('returns quality assessment for black advantage', async () => {
                // Arrange - black advantage (negative score)
                const mockEvaluation = { score: -200, bestMove: 'e7e5', depth: 15 };
                mockStockfishEngine.analyze.mockResolvedValue(mockEvaluation);

                // Act
                const result = await mcpServer.callTool('evaluate_position', {
                    fen: VALID_FEN_AFTER_E4
                });

                // Assert
                expect(result.quality).toMatch(/black.*advantage|better.*black/i);
            });

            test('returns quality assessment for winning position', async () => {
                // Arrange - decisive advantage (500+ cp)
                const mockEvaluation = { score: 600, bestMove: 'e2e4', depth: 15 };
                mockStockfishEngine.analyze.mockResolvedValue(mockEvaluation);

                // Act
                const result = await mcpServer.callTool('evaluate_position', {
                    fen: VALID_FEN
                });

                // Assert
                expect(result.quality).toMatch(/winning|decisive/i);
            });

            test('handles mate scores', async () => {
                // Arrange - mate in 3
                const mockEvaluation = {
                    score: 'mate 3', // Mate score format
                    bestMove: 'e2e4',
                    depth: 15
                };
                mockStockfishEngine.analyze.mockResolvedValue(mockEvaluation);

                // Act
                const result = await mcpServer.callTool('evaluate_position', {
                    fen: VALID_FEN
                });

                // Assert
                expect(result.centipawns).toBe('mate 3');
                expect(result.quality).toMatch(/mate/i);
            });
        });

        describe('input validation', () => {
            test('throws error for missing FEN parameter', async () => {
                // Arrange & Act & Assert
                await expect(
                    mcpServer.callTool('evaluate_position', {})
                ).rejects.toThrow(/fen.*required/i);
            });

            test('throws error for invalid FEN format', async () => {
                // Arrange & Act & Assert
                await expect(
                    mcpServer.callTool('evaluate_position', { fen: INVALID_FEN })
                ).rejects.toThrow(/invalid.*fen/i);
            });

            test('throws error for invalid depth value', async () => {
                // Arrange & Act & Assert
                await expect(
                    mcpServer.callTool('evaluate_position', {
                        fen: VALID_FEN,
                        depth: -5 // Invalid - must be positive
                    })
                ).rejects.toThrow(/depth.*positive/i);
            });

            test('throws error for depth exceeding maximum', async () => {
                // Arrange & Act & Assert
                await expect(
                    mcpServer.callTool('evaluate_position', {
                        fen: VALID_FEN,
                        depth: 100 // Too deep - may take too long
                    })
                ).rejects.toThrow(/depth.*maximum/i);
            });
        });

        describe('error handling', () => {
            test('handles engine not ready', async () => {
                // Arrange
                mockStockfishEngine.isReady.mockResolvedValue(false);

                // Act & Assert
                await expect(
                    mcpServer.callTool('evaluate_position', { fen: VALID_FEN })
                ).rejects.toThrow(/engine.*not.*ready/i);
            });

            test('handles engine analysis failure', async () => {
                // Arrange
                mockStockfishEngine.analyze.mockRejectedValue(
                    new Error('Engine crashed')
                );

                // Act & Assert
                await expect(
                    mcpServer.callTool('evaluate_position', { fen: VALID_FEN })
                ).rejects.toThrow(/engine.*error|analysis.*failed/i);
            });
        });
    });

    // =========================================================================
    // Tool: generate_repertoire
    // =========================================================================

    describe('generate_repertoire', () => {
        describe('successful generation', () => {
            test('generates repertoire for white with default config', async () => {
                // Arrange
                const mockRepertoire = {
                    pgn: '[Event "Generated Repertoire"]\n1. e4 e5 2. Nf3 *',
                    linesAnalyzed: 10,
                    annotations: ['1. e4 {54% win rate}', '1... e5 {40% win rate}']
                };
                mockRepertoireGenerator.generate.mockResolvedValue(mockRepertoire);

                // Act
                const result = await mcpServer.callTool('generate_repertoire', {
                    pgn: '1. e4 e5',
                    perspective: 'white'
                });

                // Assert
                expect(result.pgn).toContain('[Event');
                expect(result.pgn).toContain('e4');
                expect(result.linesAnalyzed).toBeGreaterThan(0);
                expect(result.annotations).toBeDefined();
            });

            test('generates repertoire for black', async () => {
                // Arrange
                const mockRepertoire = {
                    pgn: '[Event "Generated Repertoire"]\n1. e4 c5 *',
                    linesAnalyzed: 15,
                    annotations: []
                };
                mockRepertoireGenerator.generate.mockResolvedValue(mockRepertoire);

                // Act
                const result = await mcpServer.callTool('generate_repertoire', {
                    pgn: '1. e4',
                    perspective: 'black'
                });

                // Assert
                expect(result.pgn).toContain('e4');
            });

            test('applies config options when provided', async () => {
                // Arrange
                const config = {
                    maxDepth: 20, // Maximum moves deep
                    minGames: 500, // Minimum games for inclusion
                    includeEngine: true // Include engine evaluations
                };
                const mockRepertoire = { pgn: '...', linesAnalyzed: 5, annotations: [] };
                mockRepertoireGenerator.generate.mockResolvedValue(mockRepertoire);

                // Act
                await mcpServer.callTool('generate_repertoire', {
                    pgn: '1. e4',
                    perspective: 'white',
                    config
                });

                // Assert
                expect(mockRepertoireGenerator.generate).toHaveBeenCalledWith(
                    '1. e4',
                    'white',
                    expect.objectContaining(config)
                );
            });

            test('invokes progress callback during generation', async () => {
                // Arrange - generator calls progress callback during work
                mockRepertoireGenerator.generate.mockImplementation(
                    async (pgn, perspective, config) => {
                        // Simulate progress updates
                        if (config.onProgress) {
                            config.onProgress({ current: 1, total: 10, line: '1. e4' });
                            config.onProgress({ current: 5, total: 10, line: '1. e4 e5' });
                            config.onProgress({ current: 10, total: 10, line: '1. e4 c5' });
                        }
                        return { pgn: '...', linesAnalyzed: 10, annotations: [] };
                    }
                );

                const progressUpdates = [];

                // Act
                await mcpServer.callTool('generate_repertoire', {
                    pgn: '1. e4',
                    perspective: 'white',
                    config: {
                        onProgress: (progress) => progressUpdates.push(progress)
                    }
                });

                // Assert - progress should be reported
                expect(progressUpdates.length).toBeGreaterThan(0);
                expect(progressUpdates[progressUpdates.length - 1].current).toBe(10);
            });
        });

        describe('input validation', () => {
            test('throws error for missing PGN parameter', async () => {
                // Arrange & Act & Assert
                await expect(
                    mcpServer.callTool('generate_repertoire', { perspective: 'white' })
                ).rejects.toThrow(/pgn.*required/i);
            });

            test('throws error for missing perspective parameter', async () => {
                // Arrange & Act & Assert
                await expect(
                    mcpServer.callTool('generate_repertoire', { pgn: '1. e4' })
                ).rejects.toThrow(/perspective.*required/i);
            });

            test('throws error for invalid perspective value', async () => {
                // Arrange & Act & Assert
                await expect(
                    mcpServer.callTool('generate_repertoire', {
                        pgn: '1. e4',
                        perspective: 'invalid'
                    })
                ).rejects.toThrow(/perspective.*white.*black/i);
            });

            test('throws error for invalid PGN format', async () => {
                // Arrange & Act & Assert
                await expect(
                    mcpServer.callTool('generate_repertoire', {
                        pgn: 'not valid pgn @#$%',
                        perspective: 'white'
                    })
                ).rejects.toThrow(/invalid.*pgn/i);
            });
        });

        describe('error handling', () => {
            test('handles generator failure gracefully', async () => {
                // Arrange
                mockRepertoireGenerator.generate.mockRejectedValue(
                    new Error('Generation failed')
                );

                // Act & Assert
                await expect(
                    mcpServer.callTool('generate_repertoire', {
                        pgn: '1. e4',
                        perspective: 'white'
                    })
                ).rejects.toThrow(/generation.*failed/i);
            });

            test('handles cancellation during long-running generation', async () => {
                // Arrange - generator takes long time but gets cancelled
                mockRepertoireGenerator.generate.mockImplementation(
                    async () => {
                        throw new Error('Operation cancelled');
                    }
                );

                // Act & Assert
                await expect(
                    mcpServer.callTool('generate_repertoire', {
                        pgn: '1. e4 e5 2. Nf3',
                        perspective: 'white'
                    })
                ).rejects.toThrow(/cancel/i);
            });
        });
    });

    // =========================================================================
    // Tool Schema Validation
    // =========================================================================

    describe('Tool Schema', () => {
        test('analyze_position has correct input schema', () => {
            // Arrange
            const tools = mcpServer.getTools();
            const analyzeTool = tools.find(t => t.name === 'analyze_position');

            // Assert - schema should define required parameters
            expect(analyzeTool.inputSchema).toMatchObject({
                type: 'object',
                properties: {
                    fen: { type: 'string' },
                    speeds: { type: 'array' },
                    ratings: { type: 'array' }
                },
                required: ['fen']
            });
        });

        test('select_best_move has correct input schema', () => {
            // Arrange
            const tools = mcpServer.getTools();
            const selectTool = tools.find(t => t.name === 'select_best_move');

            // Assert
            expect(selectTool.inputSchema).toMatchObject({
                type: 'object',
                properties: {
                    fen: { type: 'string' },
                    perspective: { type: 'string', enum: ['white', 'black'] },
                    config: { type: 'object' }
                },
                required: ['fen', 'perspective']
            });
        });

        test('evaluate_position has correct input schema', () => {
            // Arrange
            const tools = mcpServer.getTools();
            const evalTool = tools.find(t => t.name === 'evaluate_position');

            // Assert
            expect(evalTool.inputSchema).toMatchObject({
                type: 'object',
                properties: {
                    fen: { type: 'string' },
                    depth: { type: 'number' }
                },
                required: ['fen']
            });
        });

        test('generate_repertoire has correct input schema', () => {
            // Arrange
            const tools = mcpServer.getTools();
            const genTool = tools.find(t => t.name === 'generate_repertoire');

            // Assert
            expect(genTool.inputSchema).toMatchObject({
                type: 'object',
                properties: {
                    pgn: { type: 'string' },
                    perspective: { type: 'string', enum: ['white', 'black'] },
                    config: { type: 'object' }
                },
                required: ['pgn', 'perspective']
            });
        });
    });

    // =========================================================================
    // Error Response Format
    // =========================================================================

    describe('Error Response Format', () => {
        test('returns structured error for validation failures', async () => {
            // Arrange & Act
            try {
                await mcpServer.callTool('analyze_position', { fen: INVALID_FEN });
                fail('Expected error to be thrown');
            } catch (error) {
                // Assert - error should have structured format
                expect(error.code).toBeDefined();
                expect(error.message).toBeDefined();
                expect(typeof error.message).toBe('string');
            }
        });

        test('returns structured error for API failures', async () => {
            // Arrange
            mockLichessApi.getOpeningStats.mockRejectedValue(
                new Error('Service unavailable')
            );

            // Act
            try {
                await mcpServer.callTool('analyze_position', { fen: VALID_FEN });
                fail('Expected error to be thrown');
            } catch (error) {
                // Assert
                expect(error.code).toBeDefined();
                expect(error.message).toMatch(/service|unavailable|api/i);
            }
        });

        test('does not expose internal error details', async () => {
            // Arrange - internal error with sensitive info
            mockStockfishEngine.analyze.mockRejectedValue(
                new Error('Internal path: /secret/path/engine.exe crashed')
            );

            // Act
            try {
                await mcpServer.callTool('evaluate_position', { fen: VALID_FEN });
                fail('Expected error to be thrown');
            } catch (error) {
                // Assert - should not contain internal paths
                expect(error.message).not.toMatch(/\/secret\/path/);
            }
        });
    });
});
