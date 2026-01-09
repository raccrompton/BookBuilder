/**
 * =============================================================================
 * MCP Server Index - BookBuilder Chess Analysis Tools
 * =============================================================================
 *
 * PURPOSE:
 * Entry point for the MCP server that exposes chess analysis tools.
 * This file exports the server factory and MCPServer class.
 *
 * HOW IT FITS IN:
 * - Used by: Claude Desktop/Code to analyze chess positions
 * - Depends on: LichessApi, StockfishEngine, MoveSelector, RepertoireGenerator
 *
 * KEY CONCEPTS:
 * - MCP (Model Context Protocol): Standard protocol for exposing tools to AI
 * - FEN: Forsyth-Edwards Notation for chess position representation
 * - Tool: A callable function with a defined schema that AI can invoke
 */

const { LichessApi } = require('./lichess-api.js'); // Client for Lichess opening statistics
const { StockfishEngine } = require('./stockfish-engine.js'); // Chess engine wrapper
const { MoveSelector } = require('./move-selector.js'); // Statistical move selection
const { RepertoireGenerator } = require('./repertoire-generator.js'); // Repertoire building

// Valid time control filters for Lichess API
const VALID_SPEEDS = ['ultraBullet', 'bullet', 'blitz', 'rapid', 'classical', 'correspondence'];

// Maximum depth allowed for engine analysis to prevent long-running requests
const MAX_ENGINE_DEPTH = 40;

// Default depth for engine analysis if not specified
const DEFAULT_ENGINE_DEPTH = 15;

/**
 * Custom error class with code property for structured error responses.
 *
 * WHAT IT DOES:
 * Extends the built-in Error class to include an error code for categorization.
 * This helps callers distinguish between validation errors and API failures.
 */
class MCPError extends Error {
    constructor(message, code = 'UNKNOWN_ERROR') {
        super(message); // Call parent constructor with error message
        this.name = 'MCPError'; // Set error name for identification
        this.code = code; // Error code for categorization (e.g., VALIDATION_ERROR)
    }
}

/**
 * Validates that a FEN string has the correct format.
 *
 * WHAT IT DOES:
 * Checks that the FEN string has 6 space-separated parts as required by the
 * Forsyth-Edwards Notation standard.
 *
 * PARAMETERS:
 * @param {string} fen - The FEN string to validate
 *
 * RETURNS:
 * @returns {boolean} True if the FEN appears valid, false otherwise
 *
 * HOW IT WORKS:
 * FEN strings have 6 parts: piece placement, active color, castling rights,
 * en passant square, halfmove clock, and fullmove number.
 */
function isValidFen(fen) {
    if (!fen || typeof fen !== 'string') { // Check for missing or non-string input
        return false; // Can't be valid if not a string
    }
    const parts = fen.trim().split(' '); // Split FEN into its 6 components
    return parts.length === 6; // Valid FEN must have exactly 6 parts
}

/**
 * Determines which side is to move from a FEN string.
 *
 * WHAT IT DOES:
 * Extracts the active color field from the FEN string.
 *
 * PARAMETERS:
 * @param {string} fen - A valid FEN string
 *
 * RETURNS:
 * @returns {string} 'white' if white to move, 'black' if black to move
 */
function getSideToMove(fen) {
    const parts = fen.split(' '); // Split into components
    return parts[1] === 'w' ? 'white' : 'black'; // 'w' means white to move
}

/**
 * Converts UCI move notation to SAN (Standard Algebraic Notation).
 *
 * WHAT IT DOES:
 * Transforms engine move format (e.g., 'e2e4') to human-readable format (e.g., 'e4').
 * This is a simplified conversion that handles common pawn moves.
 *
 * PARAMETERS:
 * @param {string} uciMove - Move in UCI format (e.g., 'e2e4')
 *
 * RETURNS:
 * @returns {string} Move in SAN format (e.g., 'e4')
 *
 * NOTE: This is a simplified implementation. A full implementation would need
 * the board position to properly handle piece moves and disambiguation.
 */
function uciToSan(uciMove) {
    if (!uciMove || uciMove.length < 4) { // UCI moves are at least 4 characters
        return uciMove; // Return as-is if format unexpected
    }
    // Extract destination square (characters 3 and 4, 0-indexed)
    const to = uciMove.slice(2, 4); // e.g., 'e2e4' -> 'e4'
    return to; // Return just the destination for pawn moves
}

/**
 * Determines the quality description based on centipawn evaluation.
 *
 * WHAT IT DOES:
 * Converts a numeric evaluation to a human-readable assessment string.
 *
 * PARAMETERS:
 * @param {number|string} score - Centipawn score or mate string
 *
 * RETURNS:
 * @returns {string} Human-readable position assessment
 *
 * HOW IT WORKS:
 * Uses standard chess evaluation thresholds:
 * - Within 50cp: Equal/balanced
 * - 50-150cp: Slight advantage
 * - 150-500cp: Clear advantage
 * - 500+cp: Winning/decisive
 */
function getQualityAssessment(score) {
    if (typeof score === 'string' && score.includes('mate')) { // Check for mate score
        return 'Mate found'; // Position has forced checkmate
    }

    const cp = Math.abs(score); // Get absolute value for threshold comparison

    if (cp < 50) { // Very close to equal
        return 'Equal/balanced position'; // Neither side has significant advantage
    } else if (cp < 150) { // Small advantage
        if (score > 0) { // Positive means white is better
            return 'Slight advantage for white';
        } else { // Negative means black is better
            return 'Slight advantage for black';
        }
    } else if (cp < 500) { // Clear advantage
        if (score > 0) {
            return 'White has clear advantage';
        } else {
            return 'Black has clear advantage';
        }
    } else { // Decisive advantage
        if (score > 0) {
            return 'White is winning/decisive advantage';
        } else {
            return 'Black is winning/decisive advantage';
        }
    }
}

/**
 * Validates PGN format with basic checks.
 *
 * WHAT IT DOES:
 * Performs basic validation to ensure PGN doesn't contain obviously invalid content.
 *
 * PARAMETERS:
 * @param {string} pgn - The PGN string to validate
 *
 * RETURNS:
 * @returns {boolean} True if PGN appears valid, false otherwise
 */
function isValidPgn(pgn) {
    if (!pgn || typeof pgn !== 'string') { // Check for missing input
        return false;
    }
    // Check for obviously invalid characters that shouldn't appear in PGN
    if (/[@#$%]/.test(pgn)) { // Special characters not valid in PGN
        return false;
    }
    return true; // Passes basic validation
}

/**
 * MCPServer - Main server class for chess analysis tools.
 *
 * WHAT IT DOES:
 * - Manages chess analysis tool instances (LichessApi, StockfishEngine, etc.)
 * - Exposes tool definitions with schemas
 * - Routes tool calls to appropriate handlers
 * - Handles graceful shutdown
 *
 * EXAMPLE USAGE:
 * const server = createMcpServer();
 * const tools = server.getTools(); // Get available tools
 * const result = await server.callTool('analyze_position', { fen: '...' });
 * await server.shutdown(); // Clean up resources
 */
class MCPServer {
    /**
     * Creates a new MCPServer instance.
     *
     * WHAT IT DOES:
     * Initializes all the chess analysis services (API clients, engine, etc.)
     * that the tools will use.
     */
    constructor() {
        // Initialize chess analysis services
        this.lichessApi = new LichessApi(); // For opening statistics
        this.stockfishEngine = new StockfishEngine(); // For engine evaluation
        this.moveSelector = new MoveSelector(); // For move selection
        this.repertoireGenerator = new RepertoireGenerator(); // For repertoire building

        // Define tool schemas for MCP protocol
        this.tools = [
            {
                name: 'analyze_position', // Tool identifier
                description: 'Analyze a chess position using Lichess opening statistics',
                inputSchema: {
                    type: 'object',
                    properties: {
                        fen: { type: 'string', description: 'FEN string of the position' },
                        speeds: { type: 'array', description: 'Time control filters' },
                        ratings: { type: 'array', description: 'Rating range filters' }
                    },
                    required: ['fen'] // FEN is mandatory
                }
            },
            {
                name: 'select_best_move', // Tool identifier
                description: 'Select the best move based on statistical analysis',
                inputSchema: {
                    type: 'object',
                    properties: {
                        fen: { type: 'string', description: 'FEN string of the position' },
                        perspective: {
                            type: 'string',
                            enum: ['white', 'black'], // Only these values allowed
                            description: 'Which side to find best move for'
                        },
                        config: { type: 'object', description: 'Selection configuration' }
                    },
                    required: ['fen', 'perspective'] // Both are mandatory
                }
            },
            {
                name: 'evaluate_position', // Tool identifier
                description: 'Evaluate a position using the Stockfish chess engine',
                inputSchema: {
                    type: 'object',
                    properties: {
                        fen: { type: 'string', description: 'FEN string of the position' },
                        depth: { type: 'number', description: 'Analysis depth (1-40)' }
                    },
                    required: ['fen'] // Depth is optional, has default
                }
            },
            {
                name: 'generate_repertoire', // Tool identifier
                description: 'Generate a chess opening repertoire from a starting position',
                inputSchema: {
                    type: 'object',
                    properties: {
                        pgn: { type: 'string', description: 'Starting PGN for repertoire' },
                        perspective: {
                            type: 'string',
                            enum: ['white', 'black'],
                            description: 'Which side to build repertoire for'
                        },
                        config: { type: 'object', description: 'Generation configuration' }
                    },
                    required: ['pgn', 'perspective'] // Both are mandatory
                }
            }
        ];
    }

    /**
     * Returns the list of available tools with their schemas.
     *
     * WHAT IT DOES:
     * Provides tool definitions that callers can use to understand what tools
     * are available and what parameters they accept.
     *
     * RETURNS:
     * @returns {Array} Array of tool definitions with name and inputSchema
     */
    getTools() {
        return this.tools; // Return the array of tool definitions
    }

    /**
     * Calls a tool by name with the provided parameters.
     *
     * WHAT IT DOES:
     * Routes the tool call to the appropriate handler method based on the tool name.
     *
     * PARAMETERS:
     * @param {string} name - Name of the tool to call
     * @param {Object} params - Parameters to pass to the tool
     *
     * RETURNS:
     * @returns {Promise<Object>} Tool-specific result object
     *
     * THROWS:
     * @throws {MCPError} If tool not found or parameters invalid
     */
    async callTool(name, params) {
        // Route to appropriate handler based on tool name
        switch (name) {
            case 'analyze_position':
                return this._analyzePosition(params); // Handle position analysis
            case 'select_best_move':
                return this._selectBestMove(params); // Handle move selection
            case 'evaluate_position':
                return this._evaluatePosition(params); // Handle engine evaluation
            case 'generate_repertoire':
                return this._generateRepertoire(params); // Handle repertoire generation
            default:
                throw new MCPError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL'); // Tool not found
        }
    }

    /**
     * Gracefully shuts down the server and releases resources.
     *
     * WHAT IT DOES:
     * Cleans up the Stockfish engine process to prevent resource leaks.
     *
     * RETURNS:
     * @returns {Promise<void>} Resolves when shutdown is complete
     */
    async shutdown() {
        // Only quit engine if it exists and has the quit method
        if (this.stockfishEngine && typeof this.stockfishEngine.quit === 'function') {
            await this.stockfishEngine.quit(); // Stop the engine process
        }
    }

    /**
     * Handles the analyze_position tool.
     *
     * WHAT IT DOES:
     * Fetches opening statistics from Lichess and formats them for the response.
     *
     * PARAMETERS:
     * @param {Object} params - Tool parameters
     * @param {string} params.fen - FEN string of position to analyze
     * @param {Array} [params.speeds] - Optional time control filters
     * @param {Array} [params.ratings] - Optional rating filters
     *
     * RETURNS:
     * @returns {Promise<Object>} Position statistics with moves and win rates
     * @private
     */
    async _analyzePosition(params) {
        const { fen, speeds, ratings } = params; // Extract parameters

        // Validate required FEN parameter
        if (!fen) {
            throw new MCPError('FEN is required', 'VALIDATION_ERROR'); // Missing required field
        }

        // Validate FEN format
        if (!isValidFen(fen)) {
            throw new MCPError('Invalid FEN format', 'VALIDATION_ERROR'); // Malformed FEN
        }

        // Validate speed filters if provided
        if (speeds) {
            for (const speed of speeds) { // Check each speed value
                if (!VALID_SPEEDS.includes(speed)) { // Not in allowed list
                    throw new MCPError(`Invalid speed value: ${speed}`, 'VALIDATION_ERROR');
                }
            }
        }

        // Build options object for API call
        const options = {};
        if (speeds) options.speeds = speeds; // Add speed filter if provided
        if (ratings) options.ratings = ratings; // Add rating filter if provided

        // Call Lichess API
        let stats;
        try {
            stats = await this.lichessApi.getOpeningStats(fen, options); // Fetch statistics
        } catch (error) {
            // Re-throw with structured error
            throw new MCPError(
                `Lichess API error: ${error.message}`, // Include original message
                'API_ERROR'
            );
        }

        // Calculate total games from win/draw/loss counts
        const totalGames = stats.white + stats.draws + stats.black;

        // Determine which side is to move for win rate calculation
        const sideToMove = getSideToMove(fen);

        // Format moves with calculated statistics
        const moves = stats.moves.map(move => {
            const moveTotal = move.white + move.draws + move.black; // Games for this move
            const playRate = totalGames > 0 ? (moveTotal / totalGames) * 100 : 0; // Percentage

            // Win rate from perspective of side to move
            const winRate = moveTotal > 0
                ? ((sideToMove === 'white' ? move.white : move.black) / moveTotal) * 100
                : 0;

            return {
                san: move.san, // Move in Standard Algebraic Notation
                playRate, // How often this move is played
                winRate, // Win rate for the side making the move
                gameCount: moveTotal // Total games where this move was played
            };
        });

        return {
            totalGames, // Total games in database for this position
            wins: { white: stats.white, draws: stats.draws, black: stats.black }, // Win breakdown
            moves // Array of move statistics
        };
    }

    /**
     * Handles the select_best_move tool.
     *
     * WHAT IT DOES:
     * Selects the statistically best move for a given position and perspective.
     *
     * PARAMETERS:
     * @param {Object} params - Tool parameters
     * @param {string} params.fen - FEN string of position
     * @param {string} params.perspective - 'white' or 'black'
     * @param {Object} [params.config] - Optional configuration overrides
     *
     * RETURNS:
     * @returns {Promise<Object>} Best move with win rate and confidence
     * @private
     */
    async _selectBestMove(params) {
        const { fen, perspective, config = {} } = params; // Extract parameters

        // Validate required FEN parameter
        if (!fen) {
            throw new MCPError('FEN is required', 'VALIDATION_ERROR');
        }

        // Validate required perspective parameter
        if (!perspective) {
            throw new MCPError('Perspective is required', 'VALIDATION_ERROR');
        }

        // Validate perspective value
        if (perspective !== 'white' && perspective !== 'black') {
            throw new MCPError('Perspective must be white or black', 'VALIDATION_ERROR');
        }

        // Validate FEN format
        if (!isValidFen(fen)) {
            throw new MCPError('Invalid FEN format', 'VALIDATION_ERROR');
        }

        // Call move selector
        let result;
        try {
            result = await this.moveSelector.selectBestMove(fen, perspective, config);
        } catch (error) {
            // Re-throw with structured error
            throw new MCPError(
                `Analysis failed: ${error.message}`,
                'ANALYSIS_ERROR'
            );
        }

        return {
            move: result.move, // Best move in SAN notation
            winRate: result.winRate, // Expected win rate
            confidence: result.confidence, // Confidence interval
            reasoning: result.reasoning, // Explanation of selection
            perspective // Echo back the perspective used
        };
    }

    /**
     * Handles the evaluate_position tool.
     *
     * WHAT IT DOES:
     * Evaluates a position using the Stockfish chess engine.
     *
     * PARAMETERS:
     * @param {Object} params - Tool parameters
     * @param {string} params.fen - FEN string of position
     * @param {number} [params.depth] - Analysis depth (default 15, max 40)
     *
     * RETURNS:
     * @returns {Promise<Object>} Engine evaluation with score and best move
     * @private
     */
    async _evaluatePosition(params) {
        const { fen, depth } = params; // Extract parameters

        // Validate required FEN parameter
        if (!fen) {
            throw new MCPError('FEN is required', 'VALIDATION_ERROR');
        }

        // Validate FEN format
        if (!isValidFen(fen)) {
            throw new MCPError('Invalid FEN format', 'VALIDATION_ERROR');
        }

        // Validate depth if provided
        if (depth !== undefined) {
            if (depth <= 0) { // Must be positive
                throw new MCPError('Depth must be positive', 'VALIDATION_ERROR');
            }
            if (depth > MAX_ENGINE_DEPTH) { // Can't exceed maximum
                throw new MCPError(`Depth exceeds maximum of ${MAX_ENGINE_DEPTH}`, 'VALIDATION_ERROR');
            }
        }

        // Use default depth if not specified
        const analysisDepth = depth || DEFAULT_ENGINE_DEPTH;

        // Check if engine is ready
        const isReady = await this.stockfishEngine.isReady();
        if (!isReady) {
            throw new MCPError('Engine is not ready', 'ENGINE_ERROR');
        }

        // Run engine analysis
        let evaluation;
        try {
            evaluation = await this.stockfishEngine.analyze(fen, analysisDepth);
        } catch (error) {
            // Sanitize error message to not expose internal details
            const safeMessage = error.message.replace(/\/[^\s]+/g, '[path]'); // Remove paths
            throw new MCPError(
                `Engine error: ${safeMessage}`,
                'ENGINE_ERROR'
            );
        }

        // Convert UCI move to SAN format
        const bestMoveSan = uciToSan(evaluation.bestMove);

        // Get human-readable quality assessment
        const quality = getQualityAssessment(evaluation.score);

        return {
            centipawns: evaluation.score, // Numeric evaluation (or mate string)
            bestMove: bestMoveSan, // Best move in SAN format
            depth: evaluation.depth, // Actual analysis depth
            quality // Human-readable assessment
        };
    }

    /**
     * Handles the generate_repertoire tool.
     *
     * WHAT IT DOES:
     * Generates a chess opening repertoire from a starting PGN.
     *
     * PARAMETERS:
     * @param {Object} params - Tool parameters
     * @param {string} params.pgn - Starting PGN for repertoire
     * @param {string} params.perspective - 'white' or 'black'
     * @param {Object} [params.config] - Optional configuration
     *
     * RETURNS:
     * @returns {Promise<Object>} Generated repertoire with PGN and annotations
     * @private
     */
    async _generateRepertoire(params) {
        const { pgn, perspective, config = {} } = params; // Extract parameters

        // Validate required PGN parameter
        if (!pgn) {
            throw new MCPError('PGN is required', 'VALIDATION_ERROR');
        }

        // Validate required perspective parameter
        if (!perspective) {
            throw new MCPError('Perspective is required', 'VALIDATION_ERROR');
        }

        // Validate perspective value
        if (perspective !== 'white' && perspective !== 'black') {
            throw new MCPError('Perspective must be white or black', 'VALIDATION_ERROR');
        }

        // Validate PGN format
        if (!isValidPgn(pgn)) {
            throw new MCPError('Invalid PGN format', 'VALIDATION_ERROR');
        }

        // Extract progress callback if provided
        const progressCallback = config.onProgress || null;

        // Build config for generator
        const genConfig = { ...config };
        if (progressCallback) {
            genConfig.onProgress = progressCallback; // Pass through progress callback
        }

        // Generate repertoire
        let result;
        try {
            result = await this.repertoireGenerator.generate(pgn, perspective, genConfig);
        } catch (error) {
            // Re-throw with structured error
            throw new MCPError(
                `Generation failed: ${error.message}`,
                'GENERATION_ERROR'
            );
        }

        return {
            pgn: result.pgn, // Generated PGN
            linesAnalyzed: result.linesAnalyzed, // Number of lines analyzed
            annotations: result.annotations // Move annotations
        };
    }
}

/**
 * Factory function to create a new MCP server instance.
 *
 * WHAT IT DOES:
 * Creates and returns a new MCPServer instance. This is the main entry point
 * for creating a server.
 *
 * RETURNS:
 * @returns {MCPServer} A new MCP server instance
 *
 * EXAMPLE:
 * const server = createMcpServer();
 * const tools = server.getTools();
 */
function createMcpServer() {
    return new MCPServer(); // Create and return a new instance
}

module.exports = { createMcpServer, MCPServer }; // Export factory and class
