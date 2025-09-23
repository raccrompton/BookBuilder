/**
 * stockfish-worker.js - Web Worker for Stockfish engine operations
 * 
 * Handles Stockfish engine operations in a separate thread to keep the UI responsive
 * during intensive chess analysis operations.
 */

// Import Stockfish from CDN
importScripts('https://cdn.jsdelivr.net/npm/stockfish@16.0.0/src/stockfish.js');

class StockfishWorker {
    constructor() {
        this.engine = null;
        this.isReady = false;
        this.pendingCallbacks = new Map();
        this.callbackId = 0;
        this.currentPosition = null;
        
        this.setupEngine();
        this.setupMessageHandling();
    }

    setupEngine() {
        try {
            // Initialize Stockfish engine
            this.engine = new Worker ? Stockfish() : null;
            
            if (!this.engine) {
                throw new Error('Failed to initialize Stockfish engine');
            }

            // Set up engine event handlers
            this.engine.onmessage = (event) => {
                this.handleEngineMessage(event.data);
            };

            // Initialize engine
            this.sendEngineCommand('uci');
            
        } catch (error) {
            this.reportError('Engine initialization failed', error);
        }
    }

    setupMessageHandling() {
        // Handle messages from main thread
        self.onmessage = (event) => {
            const { type, data, callbackId } = event.data;
            
            try {
                switch (type) {
                    case 'initialize':
                        this.initialize(data, callbackId);
                        break;
                    case 'analyzePosition':
                        this.analyzePosition(data, callbackId);
                        break;
                    case 'getBestMove':
                        this.getBestMove(data, callbackId);
                        break;
                    case 'evaluatePosition':
                        this.evaluatePosition(data, callbackId);
                        break;
                    case 'analyzeMove':
                        this.analyzeMove(data, callbackId);
                        break;
                    case 'stopAnalysis':
                        this.stopAnalysis();
                        break;
                    case 'shutdown':
                        this.shutdown();
                        break;
                    default:
                        this.reportError('Unknown command type', { type });
                }
            } catch (error) {
                this.reportError(`Error handling ${type}`, error, callbackId);
            }
        };
    }

    handleEngineMessage(message) {
        if (message.includes('uciok')) {
            this.isReady = true;
            this.reportProgress('Engine initialized', 100);
        } else if (message.includes('readyok')) {
            // Engine is ready for next command
        } else if (message.includes('bestmove')) {
            this.handleBestMoveResponse(message);
        } else if (message.includes('info')) {
            this.handleInfoResponse(message);
        }
    }

    handleBestMoveResponse(message) {
        const match = message.match(/bestmove\s+(\S+)/);
        if (match) {
            const bestMove = match[1];
            
            // Find pending callback for best move request
            for (const [id, callback] of this.pendingCallbacks.entries()) {
                if (callback.type === 'bestmove') {
                    this.respondToCallback(id, { bestMove });
                    break;
                }
            }
        }
    }

    handleInfoResponse(message) {
        // Parse info response for evaluation and progress
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
            
            // Report progress for ongoing analysis
            for (const [id, callback] of this.pendingCallbacks.entries()) {
                if (callback.type === 'analysis' || callback.type === 'evaluation') {
                    this.reportProgress(`Analyzing depth ${depth}`, (depth / callback.targetDepth) * 100, {
                        depth,
                        evaluation,
                        pv: pvMatch ? pvMatch[1] : null
                    });
                    
                    // If we've reached target depth, complete the analysis
                    if (depth >= callback.targetDepth && evaluation !== null) {
                        this.respondToCallback(id, { 
                            evaluation, 
                            depth, 
                            pv: pvMatch ? pvMatch[1] : null 
                        });
                    }
                }
            }
        }
    }

    sendEngineCommand(command) {
        if (this.engine) {
            this.engine.postMessage(command);
        }
    }

    async initialize(config, callbackId) {
        try {
            this.reportProgress('Initializing engine...', 10, null, callbackId);
            
            // Wait for engine to be ready
            while (!this.isReady) {
                await this.sleep(100);
            }
            
            // Configure engine settings
            if (config.threads) {
                this.sendEngineCommand(`setoption name Threads value ${config.threads}`);
            }
            if (config.hash) {
                this.sendEngineCommand(`setoption name Hash value ${config.hash}`);
            }
            
            this.reportProgress('Engine configuration complete', 100, null, callbackId);
            this.respondToCallback(callbackId, { success: true });
            
        } catch (error) {
            this.reportError('Engine initialization failed', error, callbackId);
        }
    }

    async analyzePosition(data, callbackId) {
        const { fen, depth = 15 } = data;
        
        try {
            this.reportProgress('Starting position analysis...', 0, null, callbackId);
            
            // Set up position
            this.sendEngineCommand(`position fen ${fen}`);
            
            // Store callback info
            this.pendingCallbacks.set(callbackId, {
                type: 'analysis',
                targetDepth: depth
            });
            
            // Start analysis
            this.sendEngineCommand(`go depth ${depth}`);
            
        } catch (error) {
            this.reportError('Position analysis failed', error, callbackId);
        }
    }

    async getBestMove(data, callbackId) {
        const { fen, depth = 15 } = data;
        
        try {
            this.reportProgress('Finding best move...', 0, null, callbackId);
            
            // Set up position
            this.sendEngineCommand(`position fen ${fen}`);
            
            // Store callback info
            this.pendingCallbacks.set(callbackId, {
                type: 'bestmove',
                targetDepth: depth
            });
            
            // Get best move
            this.sendEngineCommand(`go depth ${depth}`);
            
        } catch (error) {
            this.reportError('Best move calculation failed', error, callbackId);
        }
    }

    async evaluatePosition(data, callbackId) {
        const { fen, depth = 15 } = data;
        
        try {
            this.reportProgress('Evaluating position...', 0, null, callbackId);
            
            // Set up position
            this.sendEngineCommand(`position fen ${fen}`);
            
            // Store callback info
            this.pendingCallbacks.set(callbackId, {
                type: 'evaluation',
                targetDepth: depth
            });
            
            // Start evaluation
            this.sendEngineCommand(`go depth ${depth}`);
            
        } catch (error) {
            this.reportError('Position evaluation failed', error, callbackId);
        }
    }

    async analyzeMove(data, callbackId) {
        const { fen, move, depth = 12 } = data;
        
        try {
            this.reportProgress('Analyzing move quality...', 0, null, callbackId);
            
            // Analyze position before move
            const beforeEval = await this.getPositionEvaluation(fen, depth);
            
            // Make the move and analyze resulting position
            this.sendEngineCommand(`position fen ${fen} moves ${move}`);
            const afterEval = await this.getPositionEvaluation(null, depth);
            
            // Calculate move quality
            const moveLoss = beforeEval - afterEval;
            const quality = this.calculateMoveQuality(moveLoss);
            
            this.respondToCallback(callbackId, {
                evaluation: afterEval,
                moveLoss: Math.abs(moveLoss),
                quality: quality,
                beforeEval: beforeEval,
                afterEval: afterEval
            });
            
        } catch (error) {
            this.reportError('Move analysis failed', error, callbackId);
        }
    }

    async getPositionEvaluation(fen, depth) {
        return new Promise((resolve, reject) => {
            const tempId = this.callbackId++;
            
            if (fen) {
                this.sendEngineCommand(`position fen ${fen}`);
            }
            
            this.pendingCallbacks.set(tempId, {
                type: 'evaluation',
                targetDepth: depth,
                resolve: resolve,
                reject: reject
            });
            
            this.sendEngineCommand(`go depth ${depth}`);
            
            // Timeout after 30 seconds
            setTimeout(() => {
                if (this.pendingCallbacks.has(tempId)) {
                    this.pendingCallbacks.delete(tempId);
                    reject(new Error('Evaluation timeout'));
                }
            }, 30000);
        });
    }

    calculateMoveQuality(moveLoss) {
        const absLoss = Math.abs(moveLoss);
        
        if (absLoss <= 10) return 'excellent';
        if (absLoss <= 25) return 'good';
        if (absLoss <= 50) return 'inaccuracy';
        if (absLoss <= 100) return 'mistake';
        return 'blunder';
    }

    stopAnalysis() {
        this.sendEngineCommand('stop');
        this.pendingCallbacks.clear();
    }

    shutdown() {
        this.stopAnalysis();
        if (this.engine) {
            this.sendEngineCommand('quit');
            this.engine = null;
        }
        self.close();
    }

    respondToCallback(callbackId, data) {
        if (this.pendingCallbacks.has(callbackId)) {
            const callback = this.pendingCallbacks.get(callbackId);
            this.pendingCallbacks.delete(callbackId);
            
            if (callback.resolve) {
                callback.resolve(data.evaluation || data);
            } else {
                this.postMessage({
                    type: 'response',
                    callbackId,
                    data
                });
            }
        }
    }

    reportProgress(message, percentage, details = null, callbackId = null) {
        this.postMessage({
            type: 'progress',
            callbackId,
            data: {
                message,
                percentage,
                details
            }
        });
    }

    reportError(message, error, callbackId = null) {
        this.postMessage({
            type: 'error',
            callbackId,
            data: {
                message,
                error: error.message || error.toString(),
                stack: error.stack
            }
        });
    }

    postMessage(data) {
        self.postMessage(data);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize worker
const stockfishWorker = new StockfishWorker();