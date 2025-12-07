/**
 * =============================================================================
 * ChessEngine.js - Chess board state management and move validation
 * =============================================================================
 *
 * PURPOSE:
 * This class wraps the chess.js library to provide a clean interface for
 * managing chess positions and validating moves. Think of it as a "virtual
 * chess board" that the application can use to track game state.
 *
 * WHAT IS chess.js?
 * chess.js is a popular JavaScript library for chess move generation/validation.
 * It handles all the complex rules of chess:
 * - Legal move generation (including castling, en passant, promotions)
 * - Check and checkmate detection
 * - FEN parsing and generation
 * - PGN reading and writing
 *
 * WHY A WRAPPER CLASS?
 * Instead of using chess.js directly throughout the app, we wrap it here:
 * 1. ENCAPSULATION: Hide chess.js implementation details
 * 2. LOGGING: Add debug logging to track state changes
 * 3. SIMPLIFICATION: Provide simpler methods for common operations
 * 4. FLEXIBILITY: Easy to swap chess.js for another library if needed
 *
 * KEY CONCEPTS:
 * - FEN: A string that describes a complete chess position
 *   Format: "pieces turn castling en-passant halfmove fullmove"
 *   Example: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
 *
 * - SAN (Standard Algebraic Notation): Human-readable move format
 *   Examples: "e4", "Nf3", "O-O" (castling), "exd5" (capture)
 *
 * - UCI (Universal Chess Interface): Machine-friendly move format
 *   Format: "from_square" + "to_square" + optional "promotion"
 *   Examples: "e2e4", "g1f3", "e7e8q" (promotion to queen)
 *
 * DEPENDENCIES:
 * - chess.js: The underlying chess library (imported from node_modules)
 *
 * EXAMPLE USAGE:
 * ```javascript
 * const engine = new ChessEngine();
 * engine.parsePosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
 * engine.makeMove('e4');       // White plays e2-e4
 * console.log(engine.getFen()); // Shows updated position
 * engine.undoMove();           // Take back the move
 * ```
 * =============================================================================
 */

// Import the Chess class from chess.js library
// The path points to the ES module version in node_modules
import { Chess } from '/node_modules/chess.js/dist/esm/chess.js';

// Logger: Configurable logging - toggle with Logger.setEnabled('ChessEngine', true/false)
import Logger from '../utils/Logger.js';
const log = Logger.get('ChessEngine');

/**
 * ChessEngine Class - Virtual chess board for tracking game state
 *
 * DESIGN PATTERN: Adapter
 * This class adapts the chess.js interface to our application's needs,
 * adding logging and simplifying method names.
 */
export class ChessEngine {
    /**
     * Constructor - Create a new chess engine instance
     *
     * WHAT HAPPENS:
     * Creates a new chess.js Chess object which starts at the standard
     * chess starting position. The board is ready to accept moves.
     */
    constructor() {
        // Create a new chess.js instance - starts at standard starting position
        // The Chess class handles all the rules and state management
        this.chess = new Chess();
    }

    /**
   * Parse and load a chess position from FEN notation
   * @param {string} fen - FEN string representing the position
   * @returns {boolean} - True if position loaded successfully
   */
    parsePosition(fen) {
        log.log(`📋 [ChessJS] parsePosition called with FEN: ${fen}`);
        try {
            if (!fen) {
                log.error(`[ChessJS] No FEN provided`);
                return false;
            }

            log.log(`   Loading FEN into chess.js engine...`);
            this.chess.load(fen);
            log.log(`✅ [ChessJS] FEN loaded successfully`);
            log.log(`   Resulting position: ${this.chess.fen()}`);
            log.log(`   Turn: ${this.chess.turn()}, Legal moves: ${this.chess.moves().length}`);
            return true; // chess.js load() throws on error, success is silent
        } catch (error) {
            log.error(`❌ [ChessJS] Failed to parse FEN: ${fen}`, error);
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
            log.error('Failed to generate SAN:', move, error);
            return null;
        }
    }

    /**
   * Get current FEN string
   * @returns {string} - Current position in FEN notation
   */
    getFen() {
        return this.chess.fen();
    }

    /**
   * Get legal moves from current position
   * @returns {Array} - Array of legal move objects
   */
    getLegalMoves() {
        const moves = this.chess.moves({ verbose: true });
        log.log(`📋 [ChessJS] getLegalMoves: Found ${moves.length} legal moves`);
        log.log(`   Moves: [${this.chess.moves().join(', ')}]`);
        return moves;
    }

    /**
   * Validate if a move is legal before execution
   * @param {string} moveString - Move in SAN notation (e.g., 'Nf3', 'e4')
   * @returns {boolean} - True if move is legal in current position
   */
    validateMoveBeforeExecution(moveString) {
        log.log(`🔍 [ChessJS] Validating move: ${moveString}`);
        try {
            const legalMoves = this.chess.moves();
            log.log(`   Available legal moves: [${legalMoves.join(', ')}]`);
            const isLegal = legalMoves.includes(moveString);
            log.log(`   Move ${moveString} is ${isLegal ? '✅ LEGAL' : '❌ ILLEGAL'}`);

            if (!isLegal) {
                log.error(`[ChessJS] Move validation failed: ${moveString} not in legal moves`);
                log.error(`   Position: ${this.chess.fen()}`);
                log.error(`   Turn: ${this.chess.turn()}`);
            }
            return isLegal;
        } catch (error) {
            log.error(`[ChessJS] Error validating move ${moveString}:`, error);
            return false;
        }
    }

    /**
   * Make a move on the board with enhanced validation
   * @param {Object|string} move - Move in object form or SAN
   * @returns {Object} - Result object with success flag and move data or error
   */
    makeMove(move) {
        log.log(`🏁 [ChessJS] makeMove called with: ${JSON.stringify(move)}`);
        log.log(`   Position before move: ${this.chess.fen()}`);
        log.log(`   Turn: ${this.chess.turn()}, Move number: ${this.chess.moveNumber ? this.chess.moveNumber() : 'N/A'}`);

        try {
            // For string moves, validate before attempting
            if (typeof move === 'string') {
                log.log(`   Validating string move: ${move}`);
                if (!this.validateMoveBeforeExecution(move)) {
                    log.error(`[ChessJS] Pre-validation failed for move: ${move}`);
                    return null;
                }
                log.log(`   ✅ String move validation passed`);
            }

            log.log(`   Attempting to execute move...`);
            const moveResult = this.chess.move(move);
            if (moveResult) {
                log.log(`✅ [ChessJS] Move executed successfully:`, {
                    from: moveResult.from,
                    to: moveResult.to,
                    san: moveResult.san,
                    piece: moveResult.piece,
                    captured: moveResult.captured,
                    promotion: moveResult.promotion
                });
                log.log(`   Position after move: ${this.chess.fen()}`);
                return moveResult; // Return the move object directly like python-chess
            } else {
                log.error(`❌ [ChessJS] Move failed to execute: ${JSON.stringify(move)}`);
                return null; // Return null for invalid moves like python-chess
            }
        } catch (error) {
            log.error(`❌ [ChessJS] Exception during move execution:`, move, error);
            return null; // Return null for exceptions like python-chess
        }
    }

    /**
   * Undo the last move
   * @returns {Object|null} - Undone move object or null if no moves to undo
   */
    undoMove() {
        log.log(`⏪ [ChessJS] undoMove called`);
        log.log(`   Position before undo: ${this.chess.fen()}`);
        const undoneMove = this.chess.undo();
        if (undoneMove) {
            log.log(`✅ [ChessJS] Move undone successfully:`, {
                san: undoneMove.san,
                from: undoneMove.from,
                to: undoneMove.to
            });
            log.log(`   Position after undo: ${this.chess.fen()}`);
        } else {
            log.log(`⚠️ [ChessJS] No move to undo`);
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
   * Load position from FEN (alias for parsePosition)
   * @param {string} fen - FEN string representing the position
   * @returns {boolean} - True if position loaded successfully
   */
    loadPosition(fen) {
        log.log(`🔄 [ChessJS] loadPosition (alias for parsePosition)`);
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
            log.error('[ChessJS] Error getting debug position:', error);
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
        log.log(`[ChessJS] Loading position: ${fen}`);
        const success = this.parsePosition(fen);
        if (success) {
            const debug = this.debugPosition();
            log.log(`[ChessJS] Position loaded successfully:`, debug);
        } else {
            log.error(`[ChessJS] Failed to load position: ${fen}`);
        }
        return success;
    }
}

export default ChessEngine;
