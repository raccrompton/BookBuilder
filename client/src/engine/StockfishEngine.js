/**
 * =============================================================================
 * StockfishEngine.js - Interface to Stockfish chess engine
 * =============================================================================
 *
 * PURPOSE:
 * This class provides an interface to Stockfish, one of the strongest chess
 * engines in the world. We use it to evaluate positions and find the best moves
 * when the Lichess database doesn't have enough data.
 *
 * WHAT IS STOCKFISH?
 * Stockfish is an open-source chess engine that can analyze positions and
 * calculate the best moves. It's so strong that it plays at a superhuman level.
 * We use it to ensure our recommended moves are tactically sound.
 *
 * HOW DOES IT RUN IN A BROWSER?
 * Stockfish is written in C++, but it's been compiled to WebAssembly (WASM).
 * WebAssembly is a binary format that runs at near-native speed in browsers.
 * We use the 'stockfish' npm package (by nmrugg/Chess.com) which provides
 * a single-threaded WASM build that works without SharedArrayBuffer/CORS.
 *
 * STOCKFISH NPM PACKAGE:
 * We use the official 'stockfish' npm package which is:
 * - Maintained by Chess.com
 * - Updated to Stockfish 17.1 (with NNUE neural network)
 * - Well-documented with browser examples
 * - Available in multiple variants (we use single-threaded for simplicity)
 * - Note: v17.1+ uses filename hashes that change per release
 * - Note: The large WASM files are split into parts (part-0.wasm, part-1.wasm, etc.)
 *
 * API (Stockfish 17.1):
 * The stockfish npm package v17.1 uses this factory-based API:
 * - Factory function accepts options: { listener: callback, locateFile: fn }
 * - listener: callback function that receives all UCI output messages
 * - locateFile: function to resolve paths for WASM part files
 * - engine.processCommand(command) - send UCI commands
 * - engine.terminate() - clean up resources
 *
 * UCI PROTOCOL:
 * Stockfish uses the UCI (Universal Chess Interface) protocol for communication.
 * It's a text-based protocol with commands like:
 * - "uci" - Initialize the engine
 * - "position fen ..." - Set up a position
 * - "go depth 20" - Calculate best move to depth 20
 * - "bestmove e2e4" - Engine's response with best move
 *
 * KEY FEATURES:
 * - Position evaluation (returns centipawn score)
 * - Best move calculation
 * - Move quality analysis (how much centipawn loss)
 * - Configurable depth and hash table size
 *
 * DEPENDENCIES:
 * - stockfish npm package (npm install stockfish)
 * - CSP must allow 'wasm-unsafe-eval' for WebAssembly compilation
 *
 * EXAMPLE USAGE:
 * ```javascript
 * const engine = new StockfishEngine({ depth: 20 });
 * await engine.initialize();
 * const bestMove = await engine.getBestMove(fenPosition);
 * const evaluation = await engine.evaluatePosition(fenPosition);
 * engine.shutdown();
 * ```
 * =============================================================================
 */

// Logger: Configurable logging - toggle with Logger.setEnabled('StockfishEngine', true/false)
import Logger from '../utils/Logger.js';
const log = Logger.get('StockfishEngine');

// Chess.js: Used for FEN validation before sending positions to Stockfish WASM
// Invalid FEN positions can crash the WASM engine with "RuntimeError: unreachable"
import { Chess } from '/node_modules/chess.js/dist/esm/chess.js';

class StockfishEngine {
    /**
     * Constructor - Initialize Stockfish engine configuration
     *
     * @param {Object} config - Configuration options
     *   @param {string} config.variant - Engine build: 'lite' (7MB, ~3600 ELO) or 'full' (75MB, ~3700 ELO)
     *   @param {number} config.depth - Analysis depth (higher = stronger but slower)
     *   @param {number} config.hash - Hash table size in MB (memory for positions)
     *   @param {number} config.timeout - Max time in ms for operations
     */
    constructor(config = {}) {
        // =====================================================================
        // Engine State
        // =====================================================================
        // The Stockfish engine runs in a dedicated Web Worker
        this.worker = null;           // Web Worker instance (null until initialized)
        this.isReady = false;         // True when engine is ready to accept commands

        // =====================================================================
        // Engine Configuration
        // =====================================================================

        // Engine variant: determines which Stockfish WASM build to load
        // WHAT THIS CONTROLS: The stockfish npm package ships with multiple builds.
        // We support two single-threaded builds (no SharedArrayBuffer needed):
        //
        // 'lite' (default): stockfish-17.1-lite-single (7MB)
        //   - Uses a smaller neural network (NNUE)
        //   - ~3600 ELO playing strength
        //   - Loads quickly - ideal for most opening analysis
        //   - Recommended for mobile devices and slow connections
        //
        // 'full': stockfish-17.1-single (75MB, split into 6 WASM parts)
        //   - Uses the complete NNUE neural network
        //   - ~3700 ELO playing strength (~100 ELO stronger)
        //   - Requires 75MB download (browser caches it after first load)
        //   - Recommended for serious analysis where extra strength matters
        //
        // WHY DEFAULT TO 'lite': Most users don't need the extra 100 ELO.
        // The lite version is strong enough for opening analysis (both crush humans).
        // Users can opt-in to full version if they want maximum strength.
        this.variant = config.variant || 'lite';

        // Analysis depth: Number of moves to look ahead
        // Depth 20 is strong but takes a few seconds per position
        // Each additional depth roughly doubles the calculation time
        this.depth = config.depth || 20;

        // Hash table size in megabytes
        // Stores previously calculated positions to avoid redundant work
        // 128 MB is a reasonable default for browsers
        this.hash = config.hash || 128;

        // Timeout for operations in milliseconds
        // 2 minutes allows for deep analysis without hanging forever
        this.timeout = config.timeout || 120000;

        // =====================================================================
        // Asynchronous Operation Tracking
        // =====================================================================
        // Since UCI communication is async, we track pending requests

        // Map of operationId -> {type, resolve, reject, targetDepth}
        // When we get a response, we look up which operation it completes
        this.pendingOperations = new Map();

        // Counter for generating unique operation IDs
        this.operationId = 0;

        // Optional callback for progress updates (e.g., "Analyzing depth 15...")
        this.progressCallback = null;

        // Stores the initialization Promise to prevent multiple init calls
        this.initializationPromise = null;

        // Reference to our message handler function (needed for cleanup)
        this.messageHandler = null;
    }

    /**
     * Initialize the Stockfish engine via Web Worker
     *
     * Stockfish 17.1 npm package is designed to run as a Web Worker in browsers.
     * The JS file self-initializes when loaded as a worker and communicates via:
     * - worker.postMessage(command) - send UCI commands
     * - worker.onmessage = (e) => {} - receive UCI responses in e.data
     *
     * We use the single-threaded version which doesn't require SharedArrayBuffer/CORS.
     */
    async initialize() {
        // If already initialized, return immediately
        if (this.isReady) {
            return;
        }

        // If initialization is in progress, return the existing promise
        // This prevents multiple simultaneous initialization attempts
        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = new Promise((resolve, reject) => {
            try {
                log.info(`Loading Stockfish via Web Worker (stockfish npm package v17.1, variant: ${this.variant})...`);

                // Store initialization resolver for later (called when 'readyok' received)
                this.initResolver = resolve;
                this.initRejecter = reject;

                // Create a Web Worker with the Stockfish JS file
                // The stockfish npm package is designed to self-initialize when loaded as a worker
                //
                // STOCKFISH FILENAME CONVENTION:
                // The stockfish npm package names files with a hash suffix that changes per release.
                // Example: stockfish-17.1-lite-single-03e3232.js where '03e3232' is the version hash.
                // This ensures cache invalidation when Stockfish is updated.
                //
                // We support two variants based on user preference (this.variant):
                // - 'lite' (default): stockfish-17.1-lite-single-*.js loads a 7MB WASM (~3600 ELO)
                // - 'full': stockfish-17.1-single-*.js loads 6 WASM parts totaling 75MB (~3700 ELO)
                //
                // Both builds are single-threaded and don't require SharedArrayBuffer/CORS headers.
                // The full version loads its 6 WASM parts automatically - Stockfish's JS loader
                // handles the multi-part assembly internally.
                const stockfishPath = this.variant === 'full'
                    ? '/node_modules/stockfish/src/stockfish-17.1-single-a496a04.js'
                    : '/node_modules/stockfish/src/stockfish-17.1-lite-single-03e3232.js';

                this.worker = new Worker(stockfishPath);

                // Set up message handler to receive UCI responses from the worker
                this.worker.onmessage = (event) => {
                    // The worker sends UCI output as message data
                    const message = event.data;
                    this.handleUCIMessage(message);
                };

                // Handle worker errors
                // When the WASM crashes (e.g., illegal move), we need to:
                // 1. Reject all pending operations so they don't hang
                // 2. Mark engine as not ready so it can be reinitialized
                // 3. Reset initializationPromise so re-init creates a fresh worker
                this.worker.onerror = (error) => {
                    log.error('Stockfish worker error:', error);

                    // Reject initialization if still in progress
                    if (this.initRejecter) {
                        this.initRejecter(new Error(`Worker error: ${error.message}`));
                    }

                    // Reject all pending operations to prevent hanging promises
                    // This is critical - WASM crashes leave operations unresolved
                    for (const [id, operation] of this.pendingOperations.entries()) {
                        log.warn(`Rejecting pending operation ${id} due to worker crash`);
                        operation.reject(new Error(`Worker crashed: ${error.message || 'unknown error'}`));
                    }
                    this.pendingOperations.clear();

                    // Mark engine as not ready - it needs reinitialization
                    this.isReady = false;

                    // Reset initializationPromise so subsequent initialize() calls
                    // create a new worker instead of returning the rejected promise
                    this.initializationPromise = null;
                };

                log.info('Stockfish worker created, initializing UCI protocol...');

                // Initialize UCI protocol by sending 'uci' command
                // Engine will respond with 'uciok' when ready
                this.sendUCICommand('uci');

                // Timeout after 2 minutes (WASM loading can take time, especially
                // for the full version which is ~80MB split into 6 parts)
                setTimeout(() => {
                    if (!this.isReady) {
                        reject(new Error('Engine initialization timeout'));
                    }
                }, 120000);

            } catch (error) {
                log.error('Failed to initialize Stockfish:', error);
                reject(new Error(`Failed to create Stockfish engine: ${error.message}`));
            }
        });

        return this.initializationPromise;
    }

    /**
     * Send UCI command to the Stockfish engine
     *
     * Uses the Web Worker's postMessage() to send commands to Stockfish.
     * The worker will process the command and respond via onmessage.
     *
     * @param {string} command - UCI command to send (e.g., "go depth 20")
     */
    sendUCICommand(command) {
        if (this.worker) {
            // postMessage(cmd) sends a UCI command string to the worker
            // The worker will process it and send responses via onmessage
            this.worker.postMessage(command);
        }
    }

    /**
     * Handle UCI messages from WebAssembly engine
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
     * Handle engine initialization completion
     */
    handleEngineReady() {
        // Configure engine hash setting if different from Stockfish default
        // Note: We use single-threaded WASM build, so no Threads setting needed
        if (this.hash !== 128) {
            this.sendUCICommand(`setoption name Hash value ${this.hash}`);
        }

        // Send isready command to confirm engine is ready for work
        this.sendUCICommand('isready');
    }

    /**
     * Handle best move response from engine
     *
     * This is the UCI completion signal for ANY `go` command.
     * We resolve ALL pending operations here (both 'bestmove' and 'evaluation')
     * to ensure we fully consume engine output before starting next operation.
     */
    handleBestMove(message) {
        const match = message.match(/bestmove\s+(\S+)/);
        if (match) {
            const bestMove = match[1];

            // Find and resolve the pending operation (should only be one at a time)
            for (const [id, operation] of this.pendingOperations.entries()) {
                if (operation.type === 'bestmove') {
                    // For getBestMove() - return the move
                    operation.resolve(bestMove);
                    this.pendingOperations.delete(id);
                    break;
                } else if (operation.type === 'evaluation') {
                    // For evaluatePosition() - return the stored evaluation
                    // lastEvaluation was set by handleEngineInfo as info messages arrived
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
     * Handle engine analysis info
     *
     * IMPORTANT: We do NOT resolve operations here!
     * After `go depth N`, the engine sends info messages THEN `bestmove`.
     * If we resolve on info, the bestmove arrives after we start the next
     * operation and gets matched to the WRONG operation (causing bugs).
     *
     * We store the evaluation here; resolution happens in handleBestMove.
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
                const mateIn = parseInt(mateMatch[1]);
                evaluation = mateIn > 0 ? 10000 - mateIn : -10000 - mateIn;
            }

            // Store evaluation for pending operations (resolved in handleBestMove)
            for (const operation of this.pendingOperations.values()) {
                if (operation.type === 'evaluation' && evaluation !== null) {
                    // Store the latest evaluation - used when bestmove arrives
                    operation.lastEvaluation = evaluation;

                    // Report progress
                    if (this.progressCallback) {
                        this.progressCallback(`Analyzing depth ${depth}`, (depth / operation.targetDepth) * 100, {
                            depth,
                            evaluation,
                            pv: pvMatch ? pvMatch[1] : null
                        });
                    }
                    // NOTE: Do NOT resolve here - wait for bestmove in handleBestMove
                }
            }
        }
    }

    /**
     * Set progress callback for engine operations
     */
    setProgressCallback(callback) {
        this.progressCallback = callback;
    }

    /**
     * Get best move for position
     */
    async getBestMove(fen, depth = null) {
        if (!this.isReady) {
            throw new Error('Engine not initialized');
        }

        // Validate FEN before sending to WASM to prevent crashes
        // Invalid positions can cause "RuntimeError: unreachable"
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
            this.sendUCICommand(`position fen ${fen}`);
            this.sendUCICommand(`go depth ${targetDepth}`);

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
     */
    async evaluatePosition(fen, depth = null) {
        if (!this.isReady) {
            throw new Error('Engine not initialized');
        }

        // Validate FEN before sending to WASM to prevent crashes
        // Invalid positions can cause "RuntimeError: unreachable"
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
            this.sendUCICommand(`position fen ${fen}`);
            this.sendUCICommand(`go depth ${targetDepth}`);

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
     * Analyze move quality
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
            // Flip perspective: negate afterEval so both values are from the same side's POV
            const adjustedAfterEval = -afterEval;
            // Calculate how much the position changed (positive = got worse for the moving side)
            const moveLoss = beforeEval - adjustedAfterEval;

            // Use absolute value for quality assessment (we care about magnitude, not direction)
            // A loss of 30cp and a gain of 30cp should both map to the same quality tier
            const absMoveLoss = Math.abs(moveLoss);
            // Convert centipawn loss to human-readable quality label ('excellent', 'good', 'poor', etc.)
            const quality = this.calculateMoveQuality(absMoveLoss);

            // Return analysis results with all the data callers might need
            return {
                evaluation: afterEval,      // Position score after move (opponent's perspective)
                moveLoss: absMoveLoss,      // Centipawn loss magnitude (always positive)
                quality,                    // Human-readable quality rating
                beforeEval,                 // Position score before move (our perspective)
                afterEval                   // Raw after-move score (for debugging)
            };

        } catch (error) {
            throw new Error(`Move analysis failed: ${error.message}`);
        }
    }

    /**
     * Validate that a move is in UCI format
     *
     * UCI format: source square + destination square + optional promotion
     * Examples: e2e4, g1f3, e7e8q (pawn promotion to queen)
     *
     * This is a defense-in-depth check to prevent WASM crashes when
     * SAN format moves (like "e4", "Nf3", "O-O") are accidentally passed.
     *
     * @param {string} move - Move string to validate
     * @returns {boolean} True if move is in valid UCI format
     */
    isUciFormat(move) {
        // UCI format: [a-h][1-8][a-h][1-8][qrbn]?
        // Examples: e2e4, g1f3, e7e8q, a7a8n
        return /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move);
    }

    /**
     * Validate that a FEN string represents a legal chess position
     *
     * This is a defense-in-depth check to prevent WASM crashes when
     * corrupted or impossible positions are passed to the engine.
     * Invalid FEN can cause Stockfish WASM to crash with "RuntimeError: unreachable".
     *
     * Common causes of invalid FEN in BookBuilder:
     * - ChessEngine.undoMove() failing silently, leaving state corrupted
     * - Race conditions in position tracking during line expansion
     *
     * @param {string} fen - FEN string to validate
     * @throws {Error} If the FEN is invalid or represents an illegal position
     */
    validateFen(fen) {
        // Use chess.js load() to validate the FEN
        // load() throws an error if the FEN is invalid, checking:
        // - Basic FEN structure (8 ranks, valid piece characters)
        // - King placement (exactly one king per side)
        // - Pawn placement (no pawns on 1st or 8th rank)
        // - Castling rights consistency
        // - En passant square validity
        try {
            // Create a temporary Chess instance to validate the FEN
            // This doesn't affect any game state - it's just for validation
            const tempChess = new Chess();
            tempChess.load(fen);
        } catch (error) {
            // load() throws with a descriptive error message
            log.error(`Invalid FEN detected: ${fen}`);
            log.error(`Validation error: ${error.message}`);
            throw new Error(
                `Invalid FEN position cannot be analyzed: ${error.message}. ` +
                `FEN: ${fen}. This may indicate a bug in position tracking.`
            );
        }
    }

    /**
     * Evaluate position after a specific move
     */
    async evaluatePositionAfterMove(fen, move, depth) {
        // Validate FEN before sending to WASM to prevent crashes
        // Invalid positions can cause "RuntimeError: unreachable"
        this.validateFen(fen);

        // Validate move format before sending to Stockfish
        // SAN format (e.g., "e4", "Nf3", "O-O") will crash Stockfish WASM!
        if (!this.isUciFormat(move)) {
            throw new Error(
                `Invalid move format: expected UCI (e.g., 'e2e4'), got '${move}'. ` +
                `SAN format moves like 'e4' or 'Nf3' are not supported by Stockfish UCI.`
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
            this.sendUCICommand(`position fen ${fen} moves ${move}`);
            this.sendUCICommand(`go depth ${depth}`);

            setTimeout(() => {
                if (this.pendingOperations.has(operationId)) {
                    this.pendingOperations.delete(operationId);
                    reject(new Error('Position evaluation timeout'));
                }
            }, this.timeout);
        });
    }

    /**
     * Calculate move quality based on centipawn loss
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
        if (this.worker) {
            this.sendUCICommand('stop');
        }

        // Reject all pending operations
        for (const [, operation] of this.pendingOperations.entries()) {
            operation.reject(new Error('Analysis stopped'));
        }
        this.pendingOperations.clear();
    }

    /**
     * Shutdown engine and clean up resources
     *
     * Properly cleans up by:
     * 1. Stopping any ongoing analysis
     * 2. Sending 'quit' command to terminate the engine gracefully
     * 3. Terminating the Web Worker
     * 4. Clearing all references
     */
    shutdown() {
        // Stop any ongoing analysis first
        this.stopAnalysis();

        if (this.worker) {
            // Send quit command to terminate the engine gracefully
            // This tells Stockfish to stop all processing and exit
            this.sendUCICommand('quit');

            // Terminate the Web Worker to release resources
            // This immediately stops all worker execution
            try {
                this.worker.terminate();
            } catch (e) {
                // Ignore errors during termination - worker may already be stopped
            }

            // Clear our reference to the worker
            this.worker = null;
        }

        // Reset all state
        this.isReady = false;
        this.progressCallback = null;
        this.initializationPromise = null;
        this.initResolver = null;
        this.initRejecter = null;
    }

    /**
     * Alias for shutdown() method (for test compatibility)
     */
    async quit() {
        return this.shutdown();
    }

    /**
     * Another alias for shutdown() method (for test compatibility)
     */
    destroy() {
        return this.shutdown();
    }

    /**
     * Check if engine is ready
     */
    isEngineReady() {
        return this.isReady;
    }

    /**
     * Get engine configuration
     */
    getConfig() {
        return {
            depth: this.depth,
            hash: this.hash,
            timeout: this.timeout
        };
    }

    /**
     * Update engine configuration
     */
    updateConfig(config) {
        if (config.depth !== undefined) this.depth = config.depth;
        if (config.hash !== undefined) this.hash = config.hash;
        if (config.timeout !== undefined) this.timeout = config.timeout;
    }
}

export default StockfishEngine;
