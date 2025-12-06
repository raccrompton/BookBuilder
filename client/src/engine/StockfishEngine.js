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
 * We load Stockfish in a Web Worker to avoid blocking the main UI thread.
 *
 * WHAT IS A WEB WORKER?
 * Web Workers allow JavaScript to run in background threads. Since Stockfish
 * calculations are CPU-intensive (can take seconds), we run it in a Worker
 * so the UI stays responsive. Communication happens via message passing.
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
 * - Configurable depth, threads, and hash table size
 *
 * DEPENDENCIES:
 * - Web Worker API (built into browsers)
 * - Stockfish WASM file (in src/vendor/stockfish-web/)
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
class StockfishEngine {
    /**
     * Constructor - Initialize Stockfish engine configuration
     *
     * @param {Object} config - Configuration options
     *   @param {number} config.depth - Analysis depth (higher = stronger but slower)
     *   @param {number} config.threads - CPU threads to use (1 for single-core)
     *   @param {number} config.hash - Hash table size in MB (memory for positions)
     *   @param {number} config.timeout - Max time in ms for operations
     */
    constructor(config = {}) {
        // =====================================================================
        // Web Worker State
        // =====================================================================
        // The worker runs Stockfish in a background thread
        this.worker = null;           // Web Worker instance (null until initialized)
        this.isReady = false;         // True when engine is ready to accept commands

        // =====================================================================
        // Engine Configuration
        // =====================================================================

        // Analysis depth: Number of moves to look ahead
        // Depth 20 is strong but takes a few seconds per position
        // Each additional depth roughly doubles the calculation time
        this.depth = config.depth || 20;

        // Number of CPU threads for parallel search
        // More threads = faster, but 1 is safest for browser compatibility
        this.threads = config.threads || 1;

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
    }

    /**
     * Initialize the Stockfish engine via WebAssembly Worker
     */
    async initialize() {
        if (this.isReady) {
            return;
        }

        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = new Promise((resolve, reject) => {
            try {
                // Create Web Worker using Stockfish WebAssembly build directly
                this.worker = new Worker('./src/vendor/stockfish-web/sf171-79.js');

                // Set up direct UCI message handling
                this.worker.onmessage = (event) => {
                    this.handleUCIMessage(event.data);
                };

                this.worker.onerror = (error) => {
                    console.error('Stockfish WebAssembly worker error:', error);
                    reject(new Error(`WebAssembly worker error: ${error.message}`));
                };

                // Store initialization resolver
                this.initResolver = resolve;
                this.initRejecter = reject;

                // Initialize UCI protocol
                this.sendUCICommand('uci');

                // Timeout after 10 seconds
                setTimeout(() => {
                    if (!this.isReady) {
                        reject(new Error('Engine initialization timeout'));
                    }
                }, 10000);

            } catch (error) {
                reject(new Error(`Failed to create Stockfish WebAssembly worker: ${error.message}`));
            }
        });

        return this.initializationPromise;
    }

    /**
     * Send UCI command directly to WebAssembly engine
     */
    sendUCICommand(command) {
        if (this.worker) {
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
        // Configure engine settings
        if (this.threads > 1) {
            this.sendUCICommand(`setoption name Threads value ${this.threads}`);
        }
        if (this.hash !== 128) {
            this.sendUCICommand(`setoption name Hash value ${this.hash}`);
        }

        // Send isready command to confirm engine is ready for work
        this.sendUCICommand('isready');
    }

    /**
     * Handle best move response from engine
     */
    handleBestMove(message) {
        const match = message.match(/bestmove\s+(\S+)/);
        if (match) {
            const bestMove = match[1];

            // Find pending operation waiting for best move
            for (const [id, operation] of this.pendingOperations.entries()) {
                if (operation.type === 'bestmove') {
                    operation.resolve(bestMove);
                    this.pendingOperations.delete(id);
                    break;
                }
            }
        }
    }

    /**
     * Handle engine analysis info
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

            // Report progress for ongoing operations
            for (const [id, operation] of this.pendingOperations.entries()) {
                if (operation.type === 'evaluation' && evaluation !== null) {
                    if (this.progressCallback) {
                        this.progressCallback(`Analyzing depth ${depth}`, (depth / operation.targetDepth) * 100, {
                            depth,
                            evaluation,
                            pv: pvMatch ? pvMatch[1] : null
                        });
                    }

                    // Complete evaluation when target depth reached
                    if (depth >= operation.targetDepth) {
                        operation.resolve(evaluation);
                        this.pendingOperations.delete(id);
                    }
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
            const moveLoss = Math.abs(beforeEval - afterEval);
            const quality = this.calculateMoveQuality(moveLoss);

            return {
                evaluation: afterEval,
                moveLoss,
                quality,
                beforeEval,
                afterEval
            };

        } catch (error) {
            throw new Error(`Move analysis failed: ${error.message}`);
        }
    }

    /**
     * Evaluate position after a specific move
     */
    async evaluatePositionAfterMove(fen, move, depth) {
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
     */
    shutdown() {
        this.stopAnalysis();

        if (this.worker) {
            this.sendUCICommand('quit');
            this.worker.terminate();
            this.worker = null;
        }

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
            threads: this.threads,
            hash: this.hash,
            timeout: this.timeout
        };
    }

    /**
     * Update engine configuration
     */
    updateConfig(config) {
        if (config.depth !== undefined) this.depth = config.depth;
        if (config.threads !== undefined) this.threads = config.threads;
        if (config.hash !== undefined) this.hash = config.hash;
        if (config.timeout !== undefined) this.timeout = config.timeout;
    }
}

export default StockfishEngine;
