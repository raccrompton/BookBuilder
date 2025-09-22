import { Chess } from 'chess.js';

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
    try {
      if (!fen) return false;
      this.chess.load(fen);
      return true; // chess.js load() throws on error, success is silent
    } catch (error) {
      console.error('Failed to parse FEN:', fen, error);
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
    return this.chess.moves({ verbose: true });
  }

  /**
   * Make a move on the board
   * @param {Object|string} move - Move in object form or SAN
   * @returns {Object} - Result object with success flag and move data or error
   */
  makeMove(move) {
    try {
      const moveResult = this.chess.move(move);
      if (moveResult) {
        return { success: true, move: moveResult };
      } else {
        return { success: false, error: 'Invalid move' };
      }
    } catch (error) {
      console.error('Illegal move:', move, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Undo the last move
   * @returns {Object|null} - Undone move object or null if no moves to undo
   */
  undoMove() {
    return this.chess.undo();
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
    return this.parsePosition(fen);
  }

  /**
   * Get current game as PGN string
   * @returns {string} - PGN representation of the game
   */
  getPgn() {
    return this.chess.pgn();
  }
}

export default ChessEngine;