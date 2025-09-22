/**
 * Stockfish Engine wrapper for position analysis and move evaluation
 * Handles engine communication and centipawn evaluation
 */
class StockfishEngine {
  constructor(config = {}) {
    this.engine = null;
    this.isReady = false;
    this.depth = config.depth || 20;
    this.threads = config.threads || 1;
    this.hash = config.hash || 128;
    this.timeout = config.timeout || 30000;
    this.pendingCommands = new Map();
    this.commandId = 0;
  }

  /**
   * Initialize the Stockfish engine
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isReady) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        // Import Stockfish (assuming it's available via CDN or npm)
        if (typeof Stockfish === 'undefined') {
          throw new Error('Stockfish engine not loaded. Include stockfish.js in your HTML or install via npm.');
        }

        this.engine = new Stockfish();

        this.engine.onmessage = (message) => {
          this._handleEngineMessage(message);
        };

        // Configure engine settings
        this.engine.postMessage('uci');
        this.engine.postMessage(`setoption name Threads value ${this.threads}`);
        this.engine.postMessage(`setoption name Hash value ${this.hash}`);
        this.engine.postMessage('isready');

        // Wait for engine to be ready
        this._waitForReady().then(() => {
          this.isReady = true;
          console.log('Stockfish engine initialized successfully');
          resolve();
        }).catch(reject);

      } catch (error) {
        reject(new Error(`Failed to initialize Stockfish: ${error.message}`));
      }
    });
  }

  /**
   * Get the best move for a position
   * @param {string} fen - Position in FEN notation
   * @param {number} depth - Analysis depth (optional, uses default)
   * @returns {Promise<string>} Best move in UCI notation
   */
  async getBestMove(fen, depth = null) {
    await this._ensureReady();

    const analysisDepth = depth || this.depth;
    const commandId = ++this.commandId;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Error(`Engine timeout after ${this.timeout}ms`));
      }, this.timeout);

      this.pendingCommands.set(commandId, {
        type: 'bestmove',
        resolve: (result) => {
          clearTimeout(timeoutId);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        }
      });

      // Send commands to engine
      this.engine.postMessage(`position fen ${fen}`);
      this.engine.postMessage(`go depth ${analysisDepth}`);
    });
  }

  /**
   * Evaluate a position and return centipawn score
   * @param {string} fen - Position in FEN notation
   * @param {number} depth - Analysis depth (optional)
   * @returns {Promise<number>} Centipawn evaluation (positive = white advantage)
   */
  async evaluatePosition(fen, depth = null) {
    await this._ensureReady();

    const analysisDepth = depth || this.depth;
    const commandId = ++this.commandId;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Error(`Engine timeout after ${this.timeout}ms`));
      }, this.timeout);

      this.pendingCommands.set(commandId, {
        type: 'evaluation',
        resolve: (result) => {
          clearTimeout(timeoutId);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        }
      });

      // Send commands to engine
      this.engine.postMessage(`position fen ${fen}`);
      this.engine.postMessage(`go depth ${analysisDepth}`);
    });
  }

  /**
   * Analyze a specific move and return its evaluation
   * @param {string} fen - Position in FEN notation before move
   * @param {string} move - Move in UCI notation
   * @param {number} depth - Analysis depth (optional)
   * @returns {Promise<Object>} Analysis result with evaluation and move quality
   */
  async analyzeMove(fen, move, depth = null) {
    await this._ensureReady();

    try {
      // First get the best move for comparison
      const bestMove = await this.getBestMove(fen, depth);

      // Get evaluation after the proposed move
      const moveEval = await this._getEvaluationAfterMove(fen, move, depth);

      // Get evaluation after the best move
      const bestEval = await this._getEvaluationAfterMove(fen, bestMove, depth);

      // Calculate move loss (difference in centipawns)
      const moveLoss = bestEval - moveEval;

      return {
        move: move,
        bestMove: bestMove,
        evaluation: moveEval,
        bestEvaluation: bestEval,
        moveLoss: moveLoss,
        isBestMove: move === bestMove,
        isMate: this._isMateScore(moveEval),
        quality: this._evaluateMoveQuality(moveLoss)
      };

    } catch (error) {
      throw new Error(`Move analysis failed: ${error.message}`);
    }
  }

  /**
   * Get evaluation after making a specific move
   * @private
   */
  async _getEvaluationAfterMove(fen, move, depth) {
    // Create a new position with the move applied
    const Chess = window.Chess || require('chess.js').Chess;
    const chess = new Chess(fen);

    if (!chess.move(move)) {
      throw new Error(`Invalid move: ${move}`);
    }

    return await this.evaluatePosition(chess.fen(), depth);
  }

  /**
   * Handle engine messages
   * @private
   */
  _handleEngineMessage(event) {
    const message = event.data || event;

    if (message.includes('readyok')) {
      // Engine is ready
      return;
    }

    if (message.includes('bestmove')) {
      this._handleBestMoveResponse(message);
      return;
    }

    if (message.includes('info') && message.includes('score')) {
      this._handleEvaluationResponse(message);
      return;
    }
  }

  /**
   * Handle best move response
   * @private
   */
  _handleBestMoveResponse(message) {
    const match = message.match(/bestmove (\w+)/);
    if (match) {
      const bestMove = match[1];

      // Find pending command expecting bestmove
      for (const [commandId, command] of this.pendingCommands.entries()) {
        if (command.type === 'bestmove') {
          this.pendingCommands.delete(commandId);
          command.resolve(bestMove);
          break;
        }
      }
    }
  }

  /**
   * Handle evaluation response
   * @private
   */
  _handleEvaluationResponse(message) {
    // Parse score from info string
    const score = this._parseScore(message);

    if (score !== null) {
      // Find pending command expecting evaluation
      for (const [commandId, command] of this.pendingCommands.entries()) {
        if (command.type === 'evaluation') {
          this.pendingCommands.delete(commandId);
          command.resolve(score);
          break;
        }
      }
    }
  }

  /**
   * Parse score from engine info message
   * @private
   */
  _parseScore(message) {
    // Handle mate scores
    const mateMatch = message.match(/score mate (-?\d+)/);
    if (mateMatch) {
      const mateIn = parseInt(mateMatch[1]);
      return mateIn > 0 ? 9999999999 : -9999999999;
    }

    // Handle centipawn scores
    const cpMatch = message.match(/score cp (-?\d+)/);
    if (cpMatch) {
      return parseInt(cpMatch[1]);
    }

    return null;
  }

  /**
   * Check if score represents mate
   * @private
   */
  _isMateScore(score) {
    return Math.abs(score) > 999999;
  }

  /**
   * Evaluate move quality based on centipawn loss
   * @private
   */
  _evaluateMoveQuality(moveLoss) {
    if (moveLoss <= 0) return 'excellent';
    if (moveLoss <= 25) return 'good';
    if (moveLoss <= 50) return 'inaccuracy';
    if (moveLoss <= 100) return 'mistake';
    return 'blunder';
  }

  /**
   * Wait for engine ready signal
   * @private
   */
  _waitForReady() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Engine failed to initialize within timeout'));
      }, 10000);

      const checkReady = () => {
        if (this.engine) {
          const originalHandler = this.engine.onmessage;
          this.engine.onmessage = (event) => {
            const message = event.data || event;
            if (message.includes('readyok')) {
              clearTimeout(timeout);
              this.engine.onmessage = originalHandler;
              resolve();
            } else if (originalHandler) {
              originalHandler(event);
            }
          };
        }
      };

      checkReady();
    });
  }

  /**
   * Ensure engine is ready before operations
   * @private
   */
  async _ensureReady() {
    if (!this.isReady) {
      await this.initialize();
    }
  }

  /**
   * Clean up engine resources
   */
  destroy() {
    if (this.engine) {
      this.engine.postMessage('quit');
      this.engine = null;
    }
    this.isReady = false;
    this.pendingCommands.clear();
  }

  /**
   * Alias for destroy() for compatibility
   */
  quit() {
    this.destroy();
  }
}

export default StockfishEngine;