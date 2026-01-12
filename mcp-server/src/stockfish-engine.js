/**
 * =============================================================================
 * Stockfish Engine - Chess Position Evaluation
 * =============================================================================
 *
 * PURPOSE:
 * Standalone wrapper for the Stockfish chess engine to evaluate positions.
 * Provides position analysis with score, best move, and depth information.
 *
 * HOW IT FITS IN:
 * - Used by: MCP server's evaluate_position tool
 * - Depends on: stockfish npm package (via loadEngine.js)
 */

// Path module for resolving engine paths
const path = require('path'); // Node.js built-in module for file path manipulation

/**
 * StockfishEngine class - Wrapper for chess position analysis
 *
 * WHAT IT DOES:
 * Provides a simplified interface for analyzing chess positions using Stockfish.
 * Returns evaluation score, best move, and analysis depth.
 *
 * EXAMPLE:
 * const engine = new StockfishEngine();
 * await engine.initialize();
 * const result = await engine.analyze('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 10);
 * // result = { score: 25, bestMove: 'e2e4', depth: 10 }
 */
class StockfishEngine {
    /**
     * Constructor - Initialize engine wrapper
     *
     * Creates the wrapper state but does not start the engine
     * until initialize() is called.
     */
    constructor() {
        // The loadEngine wrapper around child_process
        this.engine = null; // Will hold the Stockfish engine instance after initialize()
        // Track initialization state
        this._isReady = false; // Will be true after successful initialize()
        // Stores the initialization Promise to prevent multiple init calls
        this.initializationPromise = null; // Prevents race conditions during initialization
        // Map of pending operations waiting for engine responses
        this.pendingOperations = new Map(); // Tracks async operations like getBestMove
        // Counter for generating unique operation IDs
        this.operationId = 0; // Incremented for each new operation
        // Timeout for operations in milliseconds (2 minutes)
        this.timeout = 120000; // Default timeout for engine operations
    }

    /**
     * Initialize the Stockfish engine
     *
     * WHAT IT DOES:
     * Starts the Stockfish process via loadEngine.js and prepares it for analysis.
     * Must be called before analyze() can be used.
     *
     * @returns {Promise<void>} Resolves when engine is ready
     */
    async initialize() {
        // If already initialized, return immediately
        if (this._isReady) {
            return; // Engine already running, no need to reinitialize
        }

        // If initialization is in progress, return the existing promise
        if (this.initializationPromise) {
            return this.initializationPromise; // Prevents multiple concurrent initializations
        }

        this.initializationPromise = new Promise((resolve, reject) => {
            try {
                // Load the engine utility from stockfish npm package
                // This handles spawning Stockfish as a child process
                const loadEngine = require('stockfish/examples/loadEngine.js'); // Utility to spawn Stockfish

                // Path to the stockfish JS file (single-threaded version)
                // loadEngine will spawn Node.js with this script
                const stockfishPath = path.join(
                    __dirname,
                    '../node_modules/stockfish/src/stockfish-17.1-lite-single-03e3232.js'
                ); // Points to the Stockfish WASM wrapper file

                // Create the engine instance
                // loadEngine returns an object with send(), stream, and quit() methods
                this.engine = loadEngine(stockfishPath); // Starts the Stockfish child process

                // Set up the stream handler to receive all UCI output
                // This is called for every line of output from Stockfish
                this.engine.stream = (line) => {
                    this.handleUCIMessage(line); // Process each line of UCI protocol output
                };

                // Store resolvers for initialization completion
                this.initResolver = resolve; // Called when engine is ready
                this.initRejecter = reject; // Called if initialization fails

                // Start UCI protocol by sending 'uci' command
                // Engine will respond with options and 'uciok'
                this.engine.send('uci'); // Begin UCI handshake

                // Timeout after 60 seconds (WASM loading can take time)
                setTimeout(() => {
                    if (!this._isReady) {
                        reject(new Error('Engine initialization timeout')); // Fail if engine takes too long
                    }
                }, 60000);

            } catch (error) {
                reject(new Error(`Failed to create Stockfish engine: ${error.message}`)); // Handle initialization errors
            }
        });

        return this.initializationPromise; // Return the promise for await
    }

    /**
     * Handle UCI messages from the engine
     *
     * WHAT IT DOES:
     * Processes UCI protocol messages from Stockfish and routes them
     * to appropriate handlers (initialization, best move, info).
     *
     * @param {string} message - UCI message from engine
     */
    handleUCIMessage(message) {
        // Ensure message is a string for consistent processing
        const messageStr = typeof message === 'string' ? message : String(message);

        // Handle UCI protocol responses based on message content
        if (messageStr.includes('uciok')) {
            this.handleEngineReady(); // Engine finished UCI initialization
        } else if (messageStr.includes('readyok')) {
            // Engine is ready for work after 'isready' command
            this._isReady = true; // Mark engine as operational

            if (this.initResolver) {
                this.initResolver(); // Resolve the initialization promise
                this.initResolver = null; // Clear reference to prevent memory leaks
                this.initRejecter = null; // Clear reference to prevent memory leaks
            }
        } else if (messageStr.includes('bestmove')) {
            this.handleBestMove(messageStr); // Process best move response
        } else if (messageStr.includes('info')) {
            this.handleEngineInfo(messageStr); // Process analysis info
        }
    }

    /**
     * Handle engine initialization completion (after 'uciok')
     *
     * WHAT IT DOES:
     * Sends 'isready' to confirm engine is ready for work after UCI handshake.
     */
    handleEngineReady() {
        // Send isready command to confirm engine is ready for work
        this.engine.send('isready'); // Request readiness confirmation from engine
    }

    /**
     * Handle best move response from engine
     *
     * WHAT IT DOES:
     * Resolves pending operations when 'bestmove' is received.
     * Extracts the move and evaluation from stored operation data.
     *
     * @param {string} message - UCI message containing bestmove
     */
    handleBestMove(message) {
        // Extract bestmove from UCI response like "bestmove e2e4 ponder d7d5"
        const match = message.match(/bestmove\s+(\S+)/); // Regex to capture the move
        if (match) {
            const bestMove = match[1]; // The actual move in UCI format

            // Find and resolve the pending operation
            for (const [id, operation] of this.pendingOperations.entries()) {
                if (operation.type === 'analyze') {
                    // For analyze() - return full result object
                    operation.resolve({
                        score: operation.lastEvaluation !== undefined ? operation.lastEvaluation : 0, // Centipawn evaluation
                        bestMove: bestMove, // Best move in UCI format
                        depth: operation.targetDepth // Analysis depth that was requested
                    });
                    this.pendingOperations.delete(id); // Clean up completed operation
                    break; // Only resolve one operation per bestmove
                }
            }
        }
    }

    /**
     * Handle engine analysis info messages
     *
     * WHAT IT DOES:
     * Stores evaluation data from 'info' messages during analysis.
     * Resolution happens in handleBestMove() to prevent race conditions.
     *
     * @param {string} message - UCI info message
     */
    handleEngineInfo(message) {
        // Parse UCI info for score (centipawns or mate)
        const scoreMatch = message.match(/score\s+cp\s+(-?\d+)/); // Centipawn score
        const mateMatch = message.match(/score\s+mate\s+(-?\d+)/); // Mate score

        let evaluation = null; // Will hold the parsed evaluation

        if (scoreMatch) {
            evaluation = parseInt(scoreMatch[1]); // Parse centipawn value
        } else if (mateMatch) {
            // Convert mate score to high centipawn value for comparison
            const mateIn = parseInt(mateMatch[1]); // Number of moves to mate
            evaluation = mateIn > 0 ? 10000 - mateIn : -10000 - mateIn; // Large value for mate
        }

        // Store evaluation for pending operations
        if (evaluation !== null) {
            for (const operation of this.pendingOperations.values()) {
                if (operation.type === 'analyze') {
                    operation.lastEvaluation = evaluation; // Update with latest evaluation
                }
            }
        }
    }

    /**
     * Check if engine is ready for analysis
     *
     * WHAT IT DOES:
     * Returns whether the engine has been initialized and is ready to analyze.
     *
     * @returns {boolean} True if engine is initialized and ready
     */
    isReady() {
        return this._isReady; // Simple boolean check for readiness
    }

    /**
     * Analyze a chess position
     *
     * WHAT IT DOES:
     * Evaluates the given position at the specified depth.
     * Returns the engine's evaluation score, best move, and actual depth analyzed.
     *
     * PARAMETERS:
     * @param {string} fen - FEN string representing the chess position to analyze
     *   Example: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
     * @param {number} depth - How many moves ahead to analyze (higher = slower but better)
     *   Example: 10 for quick analysis, 20 for deeper analysis
     *
     * RETURNS:
     * @returns {Promise<Object>} Analysis result with:
     *   - score: number - Evaluation in centipawns (positive = white advantage)
     *   - bestMove: string - Best move in UCI format (e.g., 'e2e4')
     *   - depth: number - Actual depth analyzed
     */
    async analyze(fen, depth) {
        // Ensure engine is initialized before analysis
        if (!this._isReady) {
            throw new Error('Engine not initialized'); // Guard against use before initialize()
        }

        return new Promise((resolve, reject) => {
            const operationId = this.operationId++; // Generate unique ID for this operation

            // Store operation details for resolution when bestmove arrives
            this.pendingOperations.set(operationId, {
                type: 'analyze', // Operation type for handler routing
                targetDepth: depth, // Depth to search
                resolve, // Promise resolver
                reject, // Promise rejecter
                lastEvaluation: 0 // Will be updated by handleEngineInfo
            });

            // Set position and request analysis
            this.engine.send(`position fen ${fen}`); // Set the board position
            this.engine.send(`go depth ${depth}`); // Start analysis to specified depth

            // Timeout handling to prevent hanging operations
            setTimeout(() => {
                if (this.pendingOperations.has(operationId)) {
                    this.pendingOperations.delete(operationId); // Clean up timed out operation
                    reject(new Error('Position analysis timeout')); // Reject with timeout error
                }
            }, this.timeout);
        });
    }

    /**
     * Shutdown the engine and release resources
     *
     * WHAT IT DOES:
     * Terminates the Stockfish process and cleans up resources.
     * Should be called when done with the engine to prevent memory leaks.
     *
     * @returns {Promise<void>} Resolves when engine is shut down
     */
    async quit() {
        // Reject all pending operations before shutdown
        for (const [, operation] of this.pendingOperations.entries()) {
            operation.reject(new Error('Engine shutdown')); // Fail pending operations
        }
        this.pendingOperations.clear(); // Clear the map

        if (this.engine) {
            // Send quit command to terminate the engine gracefully
            this.engine.send('quit'); // UCI quit command

            // Call quit() to terminate the child process
            try {
                this.engine.quit(); // Terminate the child process
            } catch (e) {
                // Ignore errors during termination (process may already be dead)
            }

            this.engine = null; // Clear reference
        }

        this._isReady = false; // Mark as no longer ready
        this.initializationPromise = null; // Allow reinitialization
        this.initResolver = null; // Clear reference
        this.initRejecter = null; // Clear reference
    }
}

module.exports = { StockfishEngine }; // Export for use by MCP server and tests
