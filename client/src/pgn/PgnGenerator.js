/**
 * PGN Generator for BookBuilder
 * 
 * Generates PGN output matching exact format from Python legacy system
 * with move annotations, playrate statistics, and engine completion.
 */

class PgnGenerator {
  constructor(config = {}) {
    this.config = {
      ENGINEFINISH: config.ENGINEFINISH || 1,
      ENGINEDEPTH: config.ENGINEDEPTH || 20,
      perspective: config.perspective || 'white',
      ...config
    };
  }

  /**
   * Generate complete PGN for a set of lines
   * @param {Array} lines - Array of line objects with moves and statistics
   * @param {string} chapterName - Base name for the chapter (e.g., "Ruy_Lopez")
   * @param {Object} engineClient - Optional engine for line completion
   * @returns {string} Complete PGN content
   */
  async generatePGN(lines, chapterName, engineClient = null) {
    let pgnContent = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Generate event header
      const eventHeader = this.generateEventHeaders(chapterName, lineNumber, this.config.perspective);
      
      // Generate move sequence with annotations
      const moveSequence = await this.generateMoveSequence(line, engineClient);
      
      // Generate statistical annotations
      const annotations = this.formatMoveAnnotations(line);

      // Combine into complete line
      pgnContent += eventHeader + '\n\n';
      pgnContent += moveSequence + '\n';
      pgnContent += annotations + '\n\n';
    }

    return pgnContent.trim();
  }

  /**
   * Generate event headers for PGN line
   * @param {string} chapterName - Chapter name (e.g., "Ruy_Lopez")
   * @param {number} lineNumber - Line number within chapter
   * @param {string} perspective - "white" or "black"
   * @returns {string} PGN event header
   */
  generateEventHeaders(chapterName, lineNumber, perspective) {
    const eventName = `${chapterName} Line ${lineNumber}`;
    
    return `[Event "${eventName}"]`;
  }

  /**
   * Generate move sequence with proper PGN formatting
   * @param {Object} line - Line object with moves array
   * @param {Object} engineClient - Optional engine for completion
   * @returns {Promise<string>} Formatted move sequence
   */
  async generateMoveSequence(line, engineClient = null) {
    let moveSequence = '';
    let moveNumber = 1;
    let isWhiteMove = true;

    // Process main line moves
    for (let i = 0; i < line.moves.length; i++) {
      const move = line.moves[i];

      if (isWhiteMove) {
        // Add space before move number if not first move
        if (i > 0) {
          moveSequence += ' ';
        }
        moveSequence += `${moveNumber}. ${move.san}`;
      } else {
        moveSequence += ` ${move.san}`;
        moveNumber++;
      }

      isWhiteMove = !isWhiteMove;
    }

    // Complete line with engine if configured
    if (this.config.ENGINEFINISH === 1 && engineClient && line.finalPosition) {
      const completion = await this.completeLineWithEngine(line.finalPosition, engineClient);
      if (completion && completion.length > 0) {
        moveSequence += this._formatEngineCompletion(completion, moveNumber, isWhiteMove);
      }
    }

    return moveSequence;
  }

  /**
   * Format move annotations with playrates and statistics
   * @param {Object} line - Line object with moves and statistics
   * @returns {string} Formatted annotations block
   */
  formatMoveAnnotations(line) {
    let annotations = '{Move playrates:\n';

    // Add individual move playrates from likelihoodPath or moves
    const movesData = line.moves || line.likelihoodPath || [];
    if (movesData.length > 0) {
      for (const move of movesData) {
        if (move.playrate !== undefined) {
          const playratePercent = (move.playrate * 100).toFixed(2);
          annotations += `+${playratePercent}%\t${move.san}\n`;
        }
      }
    }

    // Add line statistics
    if (line.statistics) {
      const cumulativePlayrate = (line.statistics.cumulativePlayrate * 100).toFixed(2);
      annotations += `Line cumulative playrate: +${cumulativePlayrate}%\n`;

      if (line.statistics.winrate !== undefined && line.statistics.totalGames !== undefined) {
        const winratePercent = (line.statistics.winrate * 100).toFixed(2);
        const gamesFormatted = line.statistics.totalGames.toLocaleString();

        let winrateDescription;
        if (this.config.DRAWSAREHALF === 0) {
          winrateDescription = "Line winrate (excluding draws)";
        } else {
          winrateDescription = "Line winrate (draws as half points)";
        }

        annotations += `${winrateDescription}: +${winratePercent}% over ${gamesFormatted} games`;
      }
    } else if (line.cumulativeLikelihood) {
      // Use cumulativeLikelihood from line object if no statistics
      const cumulativePlayrate = (line.cumulativeLikelihood * 100).toFixed(2);
      annotations += `Line cumulative playrate: +${cumulativePlayrate}%\n`;
    }

    annotations += '}';
    return annotations;
  }

  /**
   * Complete a line using engine analysis
   * @param {string} fen - Position to complete from
   * @param {Object} engineClient - Stockfish engine client
   * @returns {Promise<Array>} Array of completion moves
   */
  async completeLineWithEngine(fen, engineClient) {
    const completionMoves = [];
    let currentFen = fen;
    let moveCount = 0;
    const maxMoves = 10; // Limit completion length

    try {
      // Import chess.js for position manipulation
      const { Chess } = await import('chess.js');
      const chess = new Chess(currentFen);

      while (moveCount < maxMoves && !chess.isGameOver()) {
        // Get engine's best move
        const bestMove = await engineClient.getBestMove(currentFen, this.config.ENGINEDEPTH);
        if (!bestMove) break;

        // Make the move
        const moveObj = chess.move(bestMove);
        if (!moveObj) break;

        completionMoves.push({
          san: moveObj.san,
          uci: bestMove
        });

        currentFen = chess.fen();
        moveCount++;

        // Stop if game ends or position is decisive
        if (chess.isGameOver()) break;

        // Optional: Stop if evaluation becomes too decisive
        const evaluation = await engineClient.evaluatePosition(currentFen);
        if (Math.abs(evaluation) > 500) { // 5+ pawn advantage
          break;
        }
      }
    } catch (error) {
      console.warn('Engine completion failed:', error.message);
    }

    return completionMoves;
  }

  /**
   * Format engine completion moves
   * @private
   */
  _formatEngineCompletion(completionMoves, startMoveNumber, isWhiteToMove) {
    if (!completionMoves || completionMoves.length === 0) {
      return '';
    }

    let completion = ' ';
    let moveNumber = startMoveNumber;
    let isWhiteMove = isWhiteToMove;

    for (let i = 0; i < completionMoves.length; i++) {
      const move = completionMoves[i];

      if (isWhiteMove) {
        completion += `${moveNumber}. ${move.san}`;
      } else {
        completion += ` ${move.san}`;
        moveNumber++;
      }

      // Add space between moves (except last)
      if (i < completionMoves.length - 1) {
        completion += ' ';
      }

      isWhiteMove = !isWhiteMove;
    }

    return completion;
  }

  /**
   * Generate single PGN line for testing
   * @param {Object} line - Line data with moves and statistics
   * @param {string} eventName - Event name for header
   * @returns {string} Single PGN line
   */
  generateSingleLine(line, eventName) {
    const header = `[Event "${eventName}"]`;
    // Use pgn property if available, otherwise format moves
    const moves = line.pgn || (line.moves ? this._formatMovesOnly(line.moves) : '');
    const annotations = this.formatMoveAnnotations(line);

    return `${header}\n\n${moves}\n${annotations}`;
  }

  /**
   * Format moves without engine completion
   * @private
   */
  _formatMovesOnly(moves) {
    let moveSequence = '';
    let moveNumber = 1;
    let isWhiteMove = true;

    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];

      if (isWhiteMove) {
        // Add space before move number if not first move
        if (i > 0) {
          moveSequence += ' ';
        }
        moveSequence += `${moveNumber}. ${move.san}`;
      } else {
        moveSequence += ` ${move.san}`;
        moveNumber++;
      }

      isWhiteMove = !isWhiteMove;
    }

    return moveSequence;
  }

  /**
   * Validate PGN format
   * @param {string} pgn - PGN content to validate
   * @returns {Object} Validation result
   */
  static validatePgnFormat(pgn) {
    const issues = [];

    // Check for required elements
    if (!pgn.includes('[Event')) {
      issues.push('Missing Event header');
    }

    if (!/\d+\.\s*\w+/.test(pgn)) {
      issues.push('No valid move notation found');
    }

    if (!pgn.includes('Move playrates:')) {
      issues.push('Missing move playrates annotation');
    }

    if (!pgn.includes('Line winrate')) {
      issues.push('Missing line winrate annotation');
    }

    // Check playrate format
    const playrateMatches = pgn.match(/\+\d+\.\d+%\t\w+/g);
    if (!playrateMatches || playrateMatches.length === 0) {
      issues.push('Playrate annotations not properly formatted');
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }
}

export default PgnGenerator;