/**
 * Stockfish Engine wrapper for position analysis and move evaluation
 * Handles engine communication and centipawn evaluation
 */
class StockfishEngine {
    constructor(config = {}) {
        this.worker = null;
        this.isReady = false;
        this.depth = config.depth || 20;
        this.threads = config.threads || 1;
        this.hash = config.hash || 128;
        this.timeout = config.timeout || 30000;
        
        this.pendingCallbacks = new Map();
        this.callbackId = 0;
        this.progressCallback = null;
    }

    /**
     * Initialize the Stockfish engine via Web Worker
     */
    async initialize() {
        if (this.isReady) {
            return;
        }

        return new Promise((resolve, reject) => {
            try {
                // Create Web Worker for Stockfish
                this.worker = new Worker('./src/workers/stockfish-worker.js');
                
                // Set up message handling
                this.worker.onmessage = (event) => {
                    this.handleWorkerMessage(event.data);
                };
                
                this.worker.onerror = (error) => {
                    console.error('Stockfish worker error:', error);
                    reject(new Error(`Worker error: ${error.message}`));
                };
                
                // Initialize engine in worker
                const callbackId = this.callbackId++;
                this.pendingCallbacks.set(callbackId, { resolve, reject });
                
                this.worker.postMessage({
                    type: 'initialize',
                    data: {
                        threads: this.threads,
                        hash: this.hash
                    },
                    callbackId
                });
                
                // Timeout after 10 seconds
                setTimeout(() => {
                    if (this.pendingCallbacks.has(callbackId)) {
                        this.pendingCallbacks.delete(callbackId);
                        reject(new Error('Engine initialization timeout'));
                    }
                }, 10000);
                
            } catch (error) {
                reject(new Error(`Failed to create Stockfish worker: ${error.message}`));
            }
        });
    }

    /**
     * Handle messages from Web Worker
     */
    handleWorkerMessage(message) {
        const { type, callbackId, data } = message;
        
        switch (type) {
            case 'response':
                this.handleResponse(callbackId, data);
                break;
            case 'progress':
                this.handleProgress(callbackId, data);
                break;
            case 'error':
                this.handleError(callbackId, data);
                break;
        }
    }

    handleResponse(callbackId, data) {
        const callback = this.pendingCallbacks.get(callbackId);
        if (callback) {
            this.pendingCallbacks.delete(callbackId);
            
            if (data.success !== undefined) {
                this.isReady = data.success;
            }
            
            callback.resolve(data);
        }
    }

    handleProgress(callbackId, data) {
        if (this.progressCallback) {
            this.progressCallback(data.message, data.percentage, data.details);
        }
    }

    handleError(callbackId, data) {
        console.error('Stockfish worker error:', data);
        
        const callback = this.pendingCallbacks.get(callbackId);
        if (callback) {
            this.pendingCallbacks.delete(callbackId);
            callback.reject(new Error(data.message || 'Unknown engine error'));
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
            const callbackId = this.callbackId++;
            this.pendingCallbacks.set(callbackId, { 
                resolve: (data) => resolve(data.bestMove),
                reject 
            });
            
            this.worker.postMessage({
                type: 'getBestMove',
                data: { fen, depth: targetDepth },
                callbackId
            });
            
            // Timeout
            setTimeout(() => {
                if (this.pendingCallbacks.has(callbackId)) {
                    this.pendingCallbacks.delete(callbackId);
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
            const callbackId = this.callbackId++;
            this.pendingCallbacks.set(callbackId, { 
                resolve: (data) => resolve(data.evaluation),
                reject 
            });
            
            this.worker.postMessage({
                type: 'evaluatePosition',
                data: { fen, depth: targetDepth },
                callbackId
            });
            
            // Timeout
            setTimeout(() => {
                if (this.pendingCallbacks.has(callbackId)) {
                    this.pendingCallbacks.delete(callbackId);
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
        
        return new Promise((resolve, reject) => {
            const callbackId = this.callbackId++;
            this.pendingCallbacks.set(callbackId, { resolve, reject });
            
            this.worker.postMessage({
                type: 'analyzeMove',
                data: { fen, move, depth: targetDepth },
                callbackId
            });
            
            // Timeout
            setTimeout(() => {
                if (this.pendingCallbacks.has(callbackId)) {
                    this.pendingCallbacks.delete(callbackId);
                    reject(new Error('Move analysis timeout'));
                }
            }, this.timeout);
        });
    }

    /**
     * Stop any ongoing analysis
     */
    stopAnalysis() {
        if (this.worker) {
            this.worker.postMessage({ type: 'stopAnalysis' });
        }
        
        // Reject all pending callbacks
        for (const [id, callback] of this.pendingCallbacks.entries()) {
            callback.reject(new Error('Analysis stopped'));
        }
        this.pendingCallbacks.clear();
    }

    /**
     * Shutdown engine and clean up resources
     */
    shutdown() {
        this.stopAnalysis();
        
        if (this.worker) {
            this.worker.postMessage({ type: 'shutdown' });
            this.worker.terminate();
            this.worker = null;
        }
        
        this.isReady = false;
        this.progressCallback = null;
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