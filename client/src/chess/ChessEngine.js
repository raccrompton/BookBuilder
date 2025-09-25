import { Chess } from '/node_modules/chess.js/dist/esm/chess.js';

/**
 * Chess engine wrapper providing position handling and move validation
 * Wraps chess.js library for BookBuilder compatibility
 */
export class ChessEngine {
    constructor() {
        this.chess = new Chess();
    }

    /**
   * Parse and load a chess position from FEN notation
   * @param {string} fen - FEN string representing the position
   * @returns {boolean} - True if position loaded successfully
   */
    parsePosition(fen) {
        console.log(`📋 [ChessJS] parsePosition called with FEN: ${fen}`);
        try {
            if (!fen) {
                console.error(`[ChessJS] No FEN provided`);
                return false;
            }

            console.log(`   Loading FEN into chess.js engine...`);
            this.chess.load(fen);
            console.log(`✅ [ChessJS] FEN loaded successfully`);
            console.log(`   Resulting position: ${this.chess.fen()}`);
            console.log(`   Turn: ${this.chess.turn()}, Legal moves: ${this.chess.moves().length}`);
            return true; // chess.js load() throws on error, success is silent
        } catch (error) {
            console.error(`❌ [ChessJS] Failed to parse FEN: ${fen}`, error);
            return false;
        }
    }

    /**
   * Validate if a move is legal in the current position
   * @param {string} from - Source square (e.g., 'e2')
   * @param {string} to - Target square (e.g., 'e4')
   * @returns {boolean} - True if move is legal
   */
    validateMove(from, to) {
        try {
            const move = this.chess.move({ from, to });
            if (move) {
                this.chess.undo(); // Undo the move to keep position unchanged
                return true;
            }
            return false;
        } catch (error) {
            return false;
        }
    }

    /**
   * Generate Standard Algebraic Notation (SAN) for a move
   * @param {Object} move - Move object with from/to properties
   * @returns {string} - SAN notation (e.g., 'Nf3', 'exd5')
   */
    generateSAN(move) {
        try {
            const moveObj = this.chess.move(move);
            if (moveObj) {
                const san = moveObj.san;
                this.chess.undo(); // Undo to keep position unchanged
                return san;
            }
            return null;
        } catch (error) {
            console.error('Failed to generate SAN:', move, error);
            return null;
        }
    }

    /**
   * Get current FEN string
   * @returns {string} - Current position in FEN notation
   */
    getFEN() {
        return this.chess.fen();
    }

    /**
   * Get legal moves from current position
   * @returns {Array} - Array of legal move objects
   */
    getLegalMoves() {
        const moves = this.chess.moves({ verbose: true });
        console.log(`📋 [ChessJS] getLegalMoves: Found ${moves.length} legal moves`);
        console.log(`   Moves: [${this.chess.moves().join(', ')}]`);
        return moves;
    }

    /**
   * Validate if a move is legal before execution
   * @param {string} moveString - Move in SAN notation (e.g., 'Nf3', 'e4')
   * @returns {boolean} - True if move is legal in current position
   */
    validateMoveBeforeExecution(moveString) {
        console.log(`🔍 [ChessJS] Validating move: ${moveString}`);
        try {
            const legalMoves = this.chess.moves();
            console.log(`   Available legal moves: [${legalMoves.join(', ')}]`);
            const isLegal = legalMoves.includes(moveString);
            console.log(`   Move ${moveString} is ${isLegal ? '✅ LEGAL' : '❌ ILLEGAL'}`);

            if (!isLegal) {
                console.error(`[ChessJS] Move validation failed: ${moveString} not in legal moves`);
                console.error(`   Position: ${this.chess.fen()}`);
                console.error(`   Turn: ${this.chess.turn()}`);
            }
            return isLegal;
        } catch (error) {
            console.error(`[ChessJS] Error validating move ${moveString}:`, error);
            return false;
        }
    }

    /**
   * Make a move on the board with enhanced validation
   * @param {Object|string} move - Move in object form or SAN
   * @returns {Object} - Result object with success flag and move data or error
   */
    makeMove(move) {
        console.log(`🏁 [ChessJS] makeMove called with: ${JSON.stringify(move)}`);
        console.log(`   Position before move: ${this.chess.fen()}`);
        console.log(`   Turn: ${this.chess.turn()}, Move number: ${this.chess.moveNumber ? this.chess.moveNumber() : 'N/A'}`);

        try {
            // For string moves, validate before attempting
            if (typeof move === 'string') {
                console.log(`   Validating string move: ${move}`);
                if (!this.validateMoveBeforeExecution(move)) {
                    console.error(`[ChessJS] Pre-validation failed for move: ${move}`);
                    return null;
                }
                console.log(`   ✅ String move validation passed`);
            }

            console.log(`   Attempting to execute move...`);
            const moveResult = this.chess.move(move);
            if (moveResult) {
                console.log(`✅ [ChessJS] Move executed successfully:`, {
                    from: moveResult.from,
                    to: moveResult.to,
                    san: moveResult.san,
                    piece: moveResult.piece,
                    captured: moveResult.captured,
                    promotion: moveResult.promotion
                });
                console.log(`   Position after move: ${this.chess.fen()}`);
                return moveResult; // Return the move object directly like python-chess
            } else {
                console.error(`❌ [ChessJS] Move failed to execute: ${JSON.stringify(move)}`);
                return null; // Return null for invalid moves like python-chess
            }
        } catch (error) {
            console.error(`❌ [ChessJS] Exception during move execution:`, move, error);
            return null; // Return null for exceptions like python-chess
        }
    }

    /**
   * Undo the last move
   * @returns {Object|null} - Undone move object or null if no moves to undo
   */
    undoMove() {
        console.log(`⏪ [ChessJS] undoMove called`);
        console.log(`   Position before undo: ${this.chess.fen()}`);
        const undoneMove = this.chess.undo();
        if (undoneMove) {
            console.log(`✅ [ChessJS] Move undone successfully:`, {
                san: undoneMove.san,
                from: undoneMove.from,
                to: undoneMove.to
            });
            console.log(`   Position after undo: ${this.chess.fen()}`);
        } else {
            console.log(`⚠️ [ChessJS] No move to undo`);
        }
        return undoneMove;
    }

    /**
   * Reset to starting position
   */
    reset() {
        this.chess.reset();
    }

    /**
   * Check if position is checkmate
   * @returns {boolean}
   */
    isCheckmate() {
        return this.chess.isCheckmate();
    }

    /**
   * Check if position is stalemate
   * @returns {boolean}
   */
    isStalemate() {
        return this.chess.isStalemate();
    }

    /**
   * Check if position is draw
   * @returns {boolean}
   */
    isDraw() {
        return this.chess.isDraw();
    }

    /**
   * Get current turn
   * @returns {string} - 'w' for white, 'b' for black
   */
    getTurn() {
        return this.chess.turn();
    }

    /**
   * Get move history
   * @returns {Array} - Array of moves in SAN notation
   */
    getHistory() {
        return this.chess.history();
    }

    /**
   * Get current FEN string (alias for getFEN)
   * @returns {string} - Current position in FEN notation
   */
    getFen() {
        return this.chess.fen();
    }

    /**
   * Load position from FEN (alias for parsePosition)
   * @param {string} fen - FEN string representing the position
   * @returns {boolean} - True if position loaded successfully
   */
    loadPosition(fen) {
        console.log(`🔄 [ChessJS] loadPosition (alias for parsePosition)`);
        return this.parsePosition(fen);
    }

    /**
   * Get current game as PGN string
   * @returns {string} - PGN representation of the game
   */
    getPgn() {
        return this.chess.pgn();
    }

    /**
   * Get current move number (fullmove number)
   * @returns {number} - Current fullmove number (starts at 1, increments after black's move)
   */
    getMoveNumber() {
        if (this.chess.moveNumber && typeof this.chess.moveNumber === 'function') {
            return this.chess.moveNumber();
        }
        // Fallback: parse from FEN if chess.js doesn't have moveNumber method
        const fen = this.chess.fen();
        const fenParts = fen.split(' ');
        return parseInt(fenParts[5]) || 1; // 6th field in FEN is fullmove number
    }

    /**
   * Debug method to get comprehensive position information
   * @returns {Object} - Complete position state for debugging
   */
    debugPosition() {
        try {
            return {
                fen: this.chess.fen(),
                legalMoves: this.chess.moves(),
                turn: this.chess.turn(),
                inCheck: this.chess.inCheck(),
                isCheckmate: this.chess.isCheckmate(),
                isStalemate: this.chess.isStalemate(),
                isDraw: this.chess.isDraw(),
                moveHistory: this.chess.history(),
                moveNumber: this.chess.moveNumber ? this.chess.moveNumber() : 'N/A'
            };
        } catch (error) {
            console.error('[ChessJS] Error getting debug position:', error);
            return {
                error: error.message,
                fen: 'ERROR',
                legalMoves: []
            };
        }
    }

    /**
   * Enhanced position parsing with debugging
   * @param {string} fen - FEN string representing the position
   * @returns {boolean} - True if position loaded successfully
   */
    parsePositionWithDebug(fen) {
        console.log(`[ChessJS] Loading position: ${fen}`);
        const success = this.parsePosition(fen);
        if (success) {
            const debug = this.debugPosition();
            console.log(`[ChessJS] Position loaded successfully:`, debug);
        } else {
            console.error(`[ChessJS] Failed to load position: ${fen}`);
        }
        return success;
    }
}

export default ChessEngine;
