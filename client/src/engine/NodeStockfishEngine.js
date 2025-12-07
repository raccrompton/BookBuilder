/**
 * =============================================================================
 * NodeStockfishEngine.js - Node.js compatible Stockfish engine adapter
 * =============================================================================
 *
 * PURPOSE:
 * This class provides the same API as StockfishEngine.js but runs in Node.js
 * using child_process.spawn() instead of Web Workers. This allows running
 * BookBuilder tests with real Stockfish analysis without needing a browser.
 *
 * WHY THIS EXISTS:
 * When debugging issues with BookBuilder, we need to isolate whether problems
 * come from:
 * 1. Web Stockfish WASM/Worker issues (browser-specific)
 * 2. Algorithm/script issues in BookBuilder code (logic bugs)
 *
 * By running the same tests with this Node.js engine, we can compare results
 * and identify the source of problems.
 *
 * HOW IT WORKS:
 * - Uses the stockfish npm package's loadEngine.js utility
 * - loadEngine.js spawns Stockfish as a child process in Node.js
 * - Communication happens via stdin/stdout (same UCI protocol)
 * - We wrap the callback-based API with Promises to match StockfishEngine.js
 *
 * USAGE:
 * ```javascript
 * // In tests with USE_REAL_ENGINE=true
 * const NodeStockfishEngine = require('./NodeStockfishEngine.js');
 * const engine = new NodeStockfishEngine({ depth: 15 });
 * await engine.initialize();
 * const bestMove = await engine.getBestMove(fen);
 * engine.shutdown();
 * ```
 *
 * API COMPATIBILITY:
 * This class implements the exact same public API as StockfishEngine.js:
 * - initialize() → Promise<void>
 * - getBestMove(fen, depth) → Promise<string>
 * - evaluatePosition(fen, depth) → Promise<number>
 * - analyzeMove(fen, move, depth) → Promise<object>
 * - shutdown() / quit() / destroy() → void
 * - getConfig() → object
 * - updateConfig(config) → void
 * - isEngineReady() → boolean
 * - setProgressCallback(callback) → void
 *
 * =============================================================================
 */

// Path module for resolving stockfish paths
const path = require('path');

// Chess.js for FEN validation (same as browser version)
// We use dynamic require to handle both CommonJS and ES module contexts
let Chess;
try {
    // Try CommonJS require first
    Chess = require('chess.js').Chess;
} catch (e) {
    // Will be set during initialize() if needed
    Chess = null;
}

/**
 * Node.js compatible Stockfish engine that matches StockfishEngine.js API
 */
class NodeStockfishEngine {
    /**
     * Constructor - Initialize engine configuration
     *
     * @param {Object} config - Configuration options (same as StockfishEngine)
     *   @param {number} config.depth - Analysis depth (higher = stronger but slower)
     *   @param {number} config.threads - CPU threads to use
     *   @param {number} config.hash - Hash table size in MB
     *   @param {number} config.timeout - Max time in ms for operations
     */
    constructor(config = {}) {
        // =====================================================================
        // Engine State
        // =====================================================================
        // The loadEngine wrapper around child_process
        this.engine = null;

        // True when engine is ready to accept commands
        this.isReady = false;

        // =====================================================================
        // Engine Configuration (same defaults as StockfishEngine.js)
        // =====================================================================

        // Analysis depth: Number of moves to look ahead
        this.depth = config.depth || 20;

        // Number of CPU threads for parallel search
        this.threads = config.threads || 1;

        // Hash table size in megabytes
        this.hash = config.hash || 128;

        // Timeout for operations in milliseconds
        this.timeout = config.timeout || 120000;

        // =====================================================================
        // Asynchronous Operation Tracking (same pattern as StockfishEngine.js)
        // =====================================================================

        // Map of operationId -> {type, resolve, reject, targetDepth, lastEvaluation}
        this.pendingOperations = new Map();

        // Counter for generating unique operation IDs
        this.operationId = 0;

        // Optional callback for progress updates
        this.progressCallback = null;

        // Stores the initialization Promise to prevent multiple init calls
        this.initializationPromise = null;
    }

    /**
     * Initialize the Stockfish engine via Node.js child process
     *
     * Uses the stockfish npm package's loadEngine.js utility which
     * spawns Stockfish as a child process and communicates via stdin/stdout.
     *
     * @returns {Promise<void>} Resolves when engine is ready
     */
    async initialize() {
        // If already initialized, return immediately
        if (this.isReady) {
            return;
        }

        // If initialization is in progress, return the existing promise
        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = new Promise((resolve, reject) => {
            try {
                console.log('[NodeStockfishEngine] Loading Stockfish via child process...');

                // Load the engine utility from stockfish npm package
                // This handles spawning the child process correctly
                const loadEngine = require('stockfish/examples/loadEngine.js');

                // Path to the stockfish JS file (single-threaded version)
                // loadEngine will spawn Node.js with this script
                const stockfishPath = path.join(
                    __dirname,
                    '../../node_modules/stockfish/src/stockfish-17.1-lite-single-03e3232.js'
                );

                // Create the engine instance
                // loadEngine returns an object with send(), stream, and quit() methods
                this.engine = loadEngine(stockfishPath);

                // Set up the stream handler to receive all UCI output
                // This is called for every line of output from Stockfish
                this.engine.stream = (line) => {
                    this.handleUCIMessage(line);
                };

                // Store resolvers for initialization completion
                this.initResolver = resolve;
                this.initRejecter = reject;

                // Start UCI protocol by sending 'uci' command
                // Engine will respond with options and 'uciok'
                this.engine.send('uci', () => {
                    // Callback fires when 'uciok' received
                    // We handle the actual initialization in handleEngineReady()
                });

                // Timeout after 60 seconds (WASM loading can take time)
                setTimeout(() => {
                    if (!this.isReady) {
                        reject(new Error('[NodeStockfishEngine] Engine initialization timeout'));
                    }
                }, 60000);

            } catch (error) {
                console.error('[NodeStockfishEngine] Failed to initialize:', error);
                reject(new Error(`Failed to create Stockfish engine: ${error.message}`));
            }
        });

        return this.initializationPromise;
    }

    /**
     * Handle UCI messages from the engine
     *
     * @param {string} message - UCI message from engine
     */
    handleUCIMessage(message) {
        // Ensure message is a string
        const messageStr = typeof message === 'string' ? message : String(message);

        // Handle UCI protocol responses
        if (messageStr.includes('uciok')) {
            this.handleEngineReady();
        } else if (messageStr.includes('readyok')) {
            // Engine is ready for work
            this.isReady = true;

            if (this.initResolver) {
                console.log('[NodeStockfishEngine] Engine ready');
                this.initResolver();
                this.initResolver = null;
                this.initRejecter = null;
            }
        } else if (messageStr.includes('bestmove')) {
            this.handleBestMove(messageStr);
        } else if (messageStr.includes('info')) {
            this.handleEngineInfo(messageStr);
        }
    }

    /**
     * Handle engine initialization completion (after 'uciok')
     */
    handleEngineReady() {
        // Configure engine settings
        if (this.threads > 1) {
            this.engine.send(`setoption name Threads value ${this.threads}`);
        }
        if (this.hash !== 128) {
            this.engine.send(`setoption name Hash value ${this.hash}`);
        }

        // Send isready command to confirm engine is ready for work
        this.engine.send('isready', () => {
            // Callback fires when 'readyok' received
        });
    }

    /**
     * Handle best move response from engine
     *
     * This resolves pending operations when 'bestmove' is received.
     * Same logic as StockfishEngine.js.
     *
     * @param {string} message - UCI message containing bestmove
     */
    handleBestMove(message) {
        const match = message.match(/bestmove\s+(\S+)/);
        if (match) {
            const bestMove = match[1];

            // Find and resolve the pending operation
            for (const [id, operation] of this.pendingOperations.entries()) {
                if (operation.type === 'bestmove') {
                    // For getBestMove() - return the move
                    operation.resolve(bestMove);
                    this.pendingOperations.delete(id);
                    break;
                } else if (operation.type === 'evaluation') {
                    // For evaluatePosition() - return the stored evaluation
                    const evaluation = operation.lastEvaluation !== undefined
                        ? operation.lastEvaluation
                        : 0;
                    operation.resolve(evaluation);
                    this.pendingOperations.delete(id);
                    break;
                }
            }
        }
    }

    /**
     * Handle engine analysis info messages
     *
     * Stores evaluation data but does NOT resolve operations here.
     * Resolution happens in handleBestMove() to prevent race conditions.
     *
     * @param {string} message - UCI info message
     */
    handleEngineInfo(message) {
        // Parse UCI info for depth, score, and principal variation
        const depthMatch = message.match(/depth\s+(\d+)/);
        const scoreMatch = message.match(/score\s+cp\s+(-?\d+)/);
        const mateMatch = message.match(/score\s+mate\s+(-?\d+)/);
        const pvMatch = message.match(/pv\s+(.+)/);

        if (depthMatch) {
            const depth = parseInt(depthMatch[1]);
            let evaluation = null;

            if (scoreMatch) {
                evaluation = parseInt(scoreMatch[1]);
            } else if (mateMatch) {
                // Convert mate score to high centipawn value
                const mateIn = parseInt(mateMatch[1]);
                evaluation = mateIn > 0 ? 10000 - mateIn : -10000 - mateIn;
            }

            // Store evaluation for pending operations
            for (const operation of this.pendingOperations.values()) {
                if (operation.type === 'evaluation' && evaluation !== null) {
                    operation.lastEvaluation = evaluation;

                    // Report progress if callback is set
                    if (this.progressCallback) {
                        this.progressCallback(
                            `Analyzing depth ${depth}`,
                            (depth / operation.targetDepth) * 100,
                            { depth, evaluation, pv: pvMatch ? pvMatch[1] : null }
                        );
                    }
                }
            }
        }
    }

    /**
     * Set progress callback for engine operations
     *
     * @param {Function} callback - Progress callback function
     */
    setProgressCallback(callback) {
        this.progressCallback = callback;
    }

    /**
     * Validate that a FEN string represents a legal chess position
     *
     * Same validation as StockfishEngine.js to prevent engine crashes.
     *
     * @param {string} fen - FEN string to validate
     * @throws {Error} If the FEN is invalid
     */
    validateFen(fen) {
        try {
            // Dynamically load Chess if not already loaded
            if (!Chess) {
                Chess = require('chess.js').Chess;
            }
            const tempChess = new Chess();
            tempChess.load(fen);
        } catch (error) {
            console.error(`[NodeStockfishEngine] Invalid FEN: ${fen}`);
            throw new Error(
                `Invalid FEN position cannot be analyzed: ${error.message}. ` +
                `FEN: ${fen}. This may indicate a bug in position tracking.`
            );
        }
    }

    /**
     * Validate that a move is in UCI format
     *
     * @param {string} move - Move string to validate
     * @returns {boolean} True if move is valid UCI format
     */
    isUciFormat(move) {
        return /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move);
    }

    /**
     * Get best move for position
     *
     * @param {string} fen - FEN string of position to analyze
     * @param {number} depth - Analysis depth (optional, uses config default)
     * @returns {Promise<string>} Best move in UCI format (e.g., "e2e4")
     */
    async getBestMove(fen, depth = null) {
        if (!this.isReady) {
            throw new Error('Engine not initialized');
        }

        // Validate FEN to prevent crashes
        this.validateFen(fen);

        const targetDepth = depth || this.depth;

        return new Promise((resolve, reject) => {
            const operationId = this.operationId++;

            // Store operation details
            this.pendingOperations.set(operationId, {
                type: 'bestmove',
                targetDepth,
                resolve,
                reject
            });

            // Set position and request best move
            this.engine.send(`position fen ${fen}`);
            this.engine.send(`go depth ${targetDepth}`);

            // Timeout handling
            setTimeout(() => {
                if (this.pendingOperations.has(operationId)) {
                    this.pendingOperations.delete(operationId);
                    reject(new Error('Best move calculation timeout'));
                }
            }, this.timeout);
        });
    }

    /**
     * Evaluate position in centipawns
     *
     * @param {string} fen - FEN string of position to evaluate
     * @param {number} depth - Analysis depth (optional)
     * @returns {Promise<number>} Evaluation in centipawns (positive = white better)
     */
    async evaluatePosition(fen, depth = null) {
        if (!this.isReady) {
            throw new Error('Engine not initialized');
        }

        // Validate FEN to prevent crashes
        this.validateFen(fen);

        const targetDepth = depth || this.depth;

        return new Promise((resolve, reject) => {
            const operationId = this.operationId++;

            // Store operation details
            this.pendingOperations.set(operationId, {
                type: 'evaluation',
                targetDepth,
                resolve,
                reject
            });

            // Set position and start evaluation
            this.engine.send(`position fen ${fen}`);
            this.engine.send(`go depth ${targetDepth}`);

            // Timeout handling
            setTimeout(() => {
                if (this.pendingOperations.has(operationId)) {
                    this.pendingOperations.delete(operationId);
                    reject(new Error('Position evaluation timeout'));
                }
            }, this.timeout);
        });
    }

    /**
     * Evaluate position after a specific move
     *
     * @param {string} fen - Starting FEN
     * @param {string} move - Move in UCI format
     * @param {number} depth - Analysis depth
     * @returns {Promise<number>} Evaluation after the move
     */
    async evaluatePositionAfterMove(fen, move, depth) {
        // Validate FEN
        this.validateFen(fen);

        // Validate move format
        if (!this.isUciFormat(move)) {
            throw new Error(
                `Invalid move format: expected UCI (e.g., 'e2e4'), got '${move}'. ` +
                `SAN format moves like 'e4' or 'Nf3' are not supported.`
            );
        }

        return new Promise((resolve, reject) => {
            const operationId = this.operationId++;

            this.pendingOperations.set(operationId, {
                type: 'evaluation',
                targetDepth: depth,
                resolve,
                reject
            });

            // Set position with move and evaluate
            this.engine.send(`position fen ${fen} moves ${move}`);
            this.engine.send(`go depth ${depth}`);

            setTimeout(() => {
                if (this.pendingOperations.has(operationId)) {
                    this.pendingOperations.delete(operationId);
                    reject(new Error('Position evaluation timeout'));
                }
            }, this.timeout);
        });
    }

    /**
     * Analyze move quality
     *
     * @param {string} fen - Position FEN before the move
     * @param {string} move - Move in UCI format
     * @param {number} depth - Analysis depth (optional)
     * @returns {Promise<Object>} Analysis result with evaluation, moveLoss, quality
     */
    async analyzeMove(fen, move, depth = null) {
        if (!this.isReady) {
            throw new Error('Engine not initialized');
        }

        const targetDepth = depth || Math.min(this.depth, 15);

        try {
            // Evaluate position before move
            const beforeEval = await this.evaluatePosition(fen, targetDepth);

            // Evaluate position after move
            const afterEval = await this.evaluatePositionAfterMove(fen, move, targetDepth);

            // Calculate move quality
            // IMPORTANT: Stockfish evaluates from the side-to-move's perspective.
            // After a move, it's the opponent's turn, so afterEval is from their POV.
            // We negate afterEval to get both evaluations from the same perspective.
            //
            // Example: White plays e4
            // - beforeEval = +30 (white to move, white is +30 cp better)
            // - afterEval = -25 (black to move, black is -25 cp = white is +25 cp)
            // - adjustedAfterEval = -(-25) = +25 (from white's perspective)
            // - moveLoss = 30 - 25 = 5 cp (white lost 5 cp, acceptable)
            //
            // Example: White plays a blunder
            // - beforeEval = +30 (white was winning)
            // - afterEval = +200 (black is now +200 = white is -200)
            // - adjustedAfterEval = -200 (from white's perspective)
            // - moveLoss = 30 - (-200) = 230 cp (white lost 230 cp, blunder!)
            const adjustedAfterEval = -afterEval;
            const moveLoss = beforeEval - adjustedAfterEval;

            // Use absolute value for quality assessment (we care about magnitude)
            const absMoveLoss = Math.abs(moveLoss);
            const quality = this.calculateMoveQuality(absMoveLoss);

            return {
                evaluation: afterEval,
                moveLoss: absMoveLoss,
                quality,
                beforeEval,
                afterEval
            };

        } catch (error) {
            throw new Error(`Move analysis failed: ${error.message}`);
        }
    }

    /**
     * Calculate move quality based on centipawn loss
     *
     * @param {number} moveLoss - Centipawn loss
     * @returns {string} Quality rating
     */
    calculateMoveQuality(moveLoss) {
        if (moveLoss <= 10) return 'excellent';
        if (moveLoss <= 25) return 'good';
        if (moveLoss <= 50) return 'inaccuracy';
        if (moveLoss <= 100) return 'mistake';
        return 'blunder';
    }

    /**
     * Stop any ongoing analysis
     */
    stopAnalysis() {
        if (this.engine) {
            this.engine.send('stop');
        }

        // Reject all pending operations
        for (const [, operation] of this.pendingOperations.entries()) {
            operation.reject(new Error('Analysis stopped'));
        }
        this.pendingOperations.clear();
    }

    /**
     * Shutdown engine and clean up resources
     */
    shutdown() {
        // Stop any ongoing analysis first
        this.stopAnalysis();

        if (this.engine) {
            // Send quit command to terminate the engine
            this.engine.send('quit');

            // Call quit() to terminate the child process
            try {
                this.engine.quit();
            } catch (e) {
                // Ignore errors during termination
            }

            this.engine = null;
        }

        // Reset all state
        this.isReady = false;
        this.progressCallback = null;
        this.initializationPromise = null;
        this.initResolver = null;
        this.initRejecter = null;

        console.log('[NodeStockfishEngine] Shutdown complete');
    }

    /**
     * Alias for shutdown() (for API compatibility)
     */
    async quit() {
        return this.shutdown();
    }

    /**
     * Another alias for shutdown() (for API compatibility)
     */
    destroy() {
        return this.shutdown();
    }

    /**
     * Check if engine is ready
     *
     * @returns {boolean} True if engine is initialized and ready
     */
    isEngineReady() {
        return this.isReady;
    }

    /**
     * Get engine configuration
     *
     * @returns {Object} Current configuration
     */
    getConfig() {
        return {
            depth: this.depth,
            threads: this.threads,
            hash: this.hash,
            timeout: this.timeout
        };
    }

    /**
     * Update engine configuration
     *
     * @param {Object} config - New configuration values
     */
    updateConfig(config) {
        if (config.depth !== undefined) this.depth = config.depth;
        if (config.threads !== undefined) this.threads = config.threads;
        if (config.hash !== undefined) this.hash = config.hash;
        if (config.timeout !== undefined) this.timeout = config.timeout;
    }
}

// Export for CommonJS (Node.js)
module.exports = NodeStockfishEngine;
