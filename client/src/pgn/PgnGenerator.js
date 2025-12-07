/**
 * =============================================================================
 * PgnGenerator.js - Generates PGN (Portable Game Notation) output
 * =============================================================================
 *
 * PURPOSE:
 * This class converts our analyzed chess lines into PGN format, the standard
 * text format for sharing chess games. The output can be imported into chess
 * software like Lichess, Chess.com, ChessBase, etc.
 *
 * WHAT IS PGN?
 * PGN (Portable Game Notation) is a standard text format for recording chess
 * games. It includes:
 * - Headers: [Event "Italian Game"], [White "Player1"], etc.
 * - Moves: 1. e4 e5 2. Nf3 Nc6 3. Bc4 ...
 * - Annotations: Comments in {curly braces} or variations in (parentheses)
 * - Result: 1-0, 0-1, 1/2-1/2, or *
 *
 * EXAMPLE PGN OUTPUT:
 * ```
 * [Event "Italian Game Line 1"]
 *
 * 1. e4 e5 2. Nf3 Nc6 3. Bc4
 * {Move playrates:
 * e4 55.79%, e5 48.12%, Nf3 62.34%, Nc6 51.23%, Bc4 45.67%.
 * Line cumulative playrate: 12.34%.
 * Line winrate (draws as half points): 55.23% over 1,234,567 games.}
 * ```
 *
 * KEY FEATURES:
 * - Generates PGN headers for each line
 * - Formats moves using chess.js for correctness
 * - Adds statistical annotations (playrates, win rates)
 * - Can optionally extend lines with engine analysis
 *
 * WHY ANNOTATIONS?
 * Our PGN isn't just game records - it's a study tool. The annotations
 * show how likely each move is to be played (playrate) and how successful
 * the resulting lines are (winrate). This helps users understand:
 * - Which moves are critical to prepare against
 * - Which lines have the best practical results
 *
 * MATCHES PYTHON:
 * The output format exactly matches the Python legacy system to ensure
 * backward compatibility with existing workflows and tools.
 *
 * DEPENDENCIES:
 * - chess.js: For proper PGN formatting (imported dynamically)
 *
 * EXAMPLE USAGE:
 * ```javascript
 * const generator = new PgnGenerator({ ENGINEFINISH: 0 });
 * const pgn = await generator.generatePGN(analyzedLines, 'Italian_Game');
 * ```
 * =============================================================================
 */

// Logger: Configurable logging - toggle with Logger.setEnabled('PgnGenerator', true/false)
import Logger from '../utils/Logger.js';
const log = Logger.get('PgnGenerator');

class PgnGenerator {
    /**
     * Constructor - Initialize PGN generator with configuration
     *
     * @param {Object} config - Configuration options
     *   @param {number} config.ENGINEFINISH - 1 to extend lines with engine, 0 to skip
     *   @param {number} config.ENGINEDEPTH - Depth for engine completion analysis
     *   @param {string} config.perspective - 'white' or 'black' (whose repertoire)
     *   @param {number} config.DRAWSAREHALF - How to describe draw handling in annotations
     */
    constructor(config = {}) {
        // Merge provided config with defaults
        this.config = {
            // ENGINEFINISH: Whether to extend incomplete lines with engine moves
            // 1 = yes (adds engine-calculated continuations)
            // 0 = no (lines end where database coverage ends)
            ENGINEFINISH: config.ENGINEFINISH || 1,

            // ENGINEDEPTH: How deep the engine analyzes when completing lines
            // Higher = stronger analysis but slower
            ENGINEDEPTH: config.ENGINEDEPTH || 20,

            // perspective: Which side we're building the repertoire for
            // Affects which win rate we report in annotations
            perspective: config.perspective || 'white',

            // Include all other config options passed in
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
    generateEventHeaders(chapterName, lineNumber, _perspective) {
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
        try {
            // Import chess.js for proper PGN generation
            const { Chess } = await import('/node_modules/chess.js/dist/esm/chess.js');
            const chess = new Chess();

            // Create a simple PGN string from moves array
            const movesOnly = line.moves.map(move => move.san).join(' ');
            log.log(`[PgnGenerator] Raw moves: ${movesOnly}`);

            // Let chess.js parse and reformat it properly
            if (movesOnly.trim()) {
                chess.loadPgn(movesOnly);
            }

            // Complete line with engine if configured
            if (this.config.ENGINEFINISH === 1 && engineClient && line.finalPosition) {
                const completion = await this.completeLineWithEngine(line.finalPosition, engineClient);
                if (completion && completion.length > 0) {
                    // Add engine completion moves to chess instance
                    for (const completionMove of completion) {
                        const result = chess.move(completionMove.san);
                        if (!result) {
                            log.warn(`[PgnGenerator] Invalid engine completion move: ${completionMove.san}`);
                            break;
                        }
                    }
                }
            }

            // Get properly formatted PGN from chess.js
            const properPgn = chess.pgn();
            log.log(`[PgnGenerator] Chess.js formatted PGN: ${properPgn}`);

            // Strip default headers - chess.js adds [Event "?"], [Site "?"], etc.
            // We only want the moves portion (starting with "1.")
            const strippedPgn = this.stripPgnHeaders(properPgn);
            log.log(`[PgnGenerator] Moves only: ${strippedPgn}`);
            return strippedPgn;

        } catch (error) {
            log.error(`[PgnGenerator] Error with chess.js PGN generation: ${error.message}`);
            // Re-throw to surface the error rather than falling back silently
            throw error;
        }
    }

    /**
   * Format move annotations with playrates and statistics
   * @param {Object} line - Line object with moves and statistics
   * @returns {string} Formatted annotations block
   */
    formatMoveAnnotations(line) {
        log.log(`   📈 [PgnGenerator] formatMoveAnnotations called`); // Log function entry for debugging
        let annotations = '{Move playrates:\n'; // Start annotation block with header

        // Add individual move playrates from likelihoodPath (contains {san, playrate} objects)
        // Format: "e4 55.79%, d4 48.12%." - readable on one line with commas between moves
        if (line.likelihoodPath && line.likelihoodPath.length > 0) { // Check if we have move data
            log.log(`      Processing ${line.likelihoodPath.length} moves from likelihood path:`); // Log move count
            const moveAnnotations = []; // Collect move annotations to join with commas
            for (let i = 0; i < line.likelihoodPath.length; i++) { // Loop through each move
                const move = line.likelihoodPath[i]; // Get current move object
                log.log(`         Move ${i + 1}: ${move.san} (playrate: ${move.playrate?.toFixed(4)})`); // Log move details
                if (move.playrate !== undefined && move.san) { // Only add if we have both playrate and move notation
                    const playratePercent = (move.playrate * 100).toFixed(2); // Convert decimal to percentage
                    const moveAnnotation = `${playratePercent}% ${move.san}`; // Format: "55.79% e4" (percentage before move)
                    log.log(`            Adding annotation: "${moveAnnotation}"`); // Log the annotation
                    moveAnnotations.push(moveAnnotation); // Add to collection
                }
            }
            // Join moves with ", " and end with "." then newline - readable on one line
            if (moveAnnotations.length > 0) { // Only add if we have moves
                annotations += moveAnnotations.join(', ') + '.\n'; // "e4 55.79%, d4 48.12%."
            }
        } else {
            log.log(`      No likelihood path available (${line.likelihoodPath?.length || 0} moves)`); // Log missing data
        }

        // Add line statistics - separated by period from move playrates
        log.log(`      Adding line statistics...`); // Log statistics section start
        if (line.statistics) { // Check if statistics object exists
            log.log(`         Using line.statistics:`, line.statistics); // Log raw statistics
            const cumulativePlayrate = (line.statistics.cumulativePlayrate * 100).toFixed(2); // Convert to percentage
            const cumulativeAnnotation = `Line cumulative playrate: ${cumulativePlayrate}%\n`; // No period after percentage
            log.log(`         Cumulative playrate annotation: "${cumulativeAnnotation.trim()}"`); // Log annotation
            annotations += cumulativeAnnotation; // Add to output

            if (line.statistics.winrate !== undefined && line.statistics.totalGames !== undefined) { // Check for winrate data
                const winratePercent = (line.statistics.winrate * 100).toFixed(2); // Convert to percentage
                const gamesFormatted = line.statistics.totalGames.toLocaleString(); // Format with commas (eg "1,234")
                log.log(`         Win rate: ${winratePercent}%, Games: ${gamesFormatted}`); // Log values

                let winrateDescription; // Build description based on draw handling setting
                if (this.config.DRAWSAREHALF === 0) { // If draws are excluded from winrate
                    winrateDescription = 'Line winrate (excluding draws)'; // Use excluding language
                } else { // If draws count as half points
                    winrateDescription = 'Line winrate (draws as half points)'; // Use half-point language
                }

                const winrateAnnotation = `${winrateDescription}: ${winratePercent}% over ${gamesFormatted} games`;
                log.log(`         Win rate annotation: "${winrateAnnotation}"`); // Log the annotation
                annotations += winrateAnnotation; // Add to output (no newline before closing brace)
            } else {
                log.log(`         Win rate data incomplete: winrate=${line.statistics.winrate}, games=${line.statistics.totalGames}`); // Log missing data
            }
        } else if (line.cumulativeLikelihood) { // Fallback if no statistics object but have cumulative likelihood
            log.log(`         Using line.cumulativeLikelihood: ${line.cumulativeLikelihood}`); // Log fallback source
            // Use cumulativeLikelihood from line object if no statistics
            const cumulativePlayrate = (line.cumulativeLikelihood * 100).toFixed(2); // Convert to percentage
            const cumulativeAnnotation = `Line cumulative playrate: ${cumulativePlayrate}%`;
            log.log(`         Cumulative playrate annotation: "${cumulativeAnnotation.trim()}"`); // Log annotation
            annotations += cumulativeAnnotation; // Add to output
        } else {
            log.log(`         No statistics or cumulative likelihood available`); // Log missing data
        }

        annotations += '}'; // Close annotation block
        log.log(`      Final annotations block: ${annotations.split('\n').length} lines`); // Log line count
        return annotations; // Return complete annotation string
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
            const { Chess } = await import('/node_modules/chess.js/dist/esm/chess.js');
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
            log.warn('Engine completion failed:', error.message);
        }

        return completionMoves;
    }


    /**
   * Generate single PGN line for testing
   * @param {Object} line - Line data with moves and statistics
   * @param {string} eventName - Event name for header
   * @returns {string} Single PGN line
   */
    generateSingleLine(line, eventName) {
        log.log(`📋 [PgnGenerator] generateSingleLine called:`);
        log.log(`   Event name: ${eventName}`);
        log.log(`   Line PGN: "${line.pgn || 'EMPTY'}"`);
        log.log(`   Line data:`, {
            cumulativeLikelihood: line.cumulativeLikelihood?.toFixed(6),
            likelihoodPathLength: line.likelihoodPath?.length || 0,
            hasStatistics: !!line.statistics
        });

        const header = `[Event "${eventName}"]`;
        log.log(`   Generated header: ${header}`);

        // Strip any existing headers from line.pgn - chess.js adds default headers
        // We only want the moves, we'll add our own Event header above
        const rawPgn = line.pgn || '';
        const moves = this.stripPgnHeaders(rawPgn);
        log.log(`   Moves section: "${moves}"`);

        log.log(`   Generating move annotations...`);
        const annotations = this.formatMoveAnnotations(line);
        log.log(`   Generated annotations: ${annotations.split('\n')[0]}... (${annotations.split('\n').length} lines)`);

        const result = `${header}\n\n${moves}\n${annotations}`;
        log.log(`✅ [PgnGenerator] Single line generated (${result.length} characters)`);

        return result;
    }


    /**
   * Generate a complete PGN line entry for testing and output
   * @param {Object} lineData - Line data with pgn, cumulativeLikelihood, likelihoodPath, winRate, totalGames
   * @param {number} lineNumber - Line number within opening
   * @param {string} openingName - Name of the opening
   * @param {Object} config - Configuration object with DRAWSAREHALF setting
   * @returns {string} Complete PGN line entry
   */
    generateLineEntry(lineData, lineNumber, openingName, config) {
        // Generate event header
        const eventHeader = `[Event "${openingName} Line ${lineNumber}"]`;

        // Use the PGN moves from lineData
        const moveSequence = lineData.pgn || '';

        // Generate move playrates annotations
        let annotations = '{Move playrates:\n';

        // Add individual move playrates from likelihoodPath
        if (lineData.likelihoodPath && lineData.likelihoodPath.length > 0) {
            for (const move of lineData.likelihoodPath) {
                if (move.playrate !== undefined) {
                    const playrateFormatted = this.formatPercentage(move.playrate);
                    annotations += `${playrateFormatted}\t${move.san}\n`;
                }
            }
        }

        // Add line cumulative playrate
        if (lineData.cumulativeLikelihood !== undefined) {
            const cumulativeFormatted = this.formatPercentage(lineData.cumulativeLikelihood);
            annotations += `Line cumulative playrate: ${cumulativeFormatted}\n`;
        }

        // Add line winrate information
        if (lineData.winRate !== undefined && lineData.totalGames !== undefined) {
            const winrateFormatted = this.formatPercentage(lineData.winRate);
            const gamesFormatted = this.formatGameCount(lineData.totalGames);

            let winrateDescription;
            if (config.DRAWSAREHALF === 0) {
                winrateDescription = 'Line winrate (excluding draws)';
            } else {
                winrateDescription = 'Line winrate (draws are half)';
            }

            annotations += `${winrateDescription}: ${winrateFormatted} over ${gamesFormatted} games`;
        }

        annotations += '}';

        return `${eventHeader}\n\n${moveSequence}\n${annotations}`;
    }

    /**
   * Format a decimal value as a percentage string
   * @param {number} value - Decimal value (0-1)
   * @returns {string} Formatted percentage (e.g., "25.83%")
   */
    formatPercentage(value) {
        const percentage = (value * 100).toFixed(2);
        return `${percentage}%`;
    }

    /**
   * Format game count as string
   * @param {number} count - Game count
   * @returns {string} Formatted game count
   */
    formatGameCount(count) {
        return count.toString();
    }

    /**
     * Strip PGN headers from a PGN string, returning only the moves
     * chess.js adds default headers like [Event "?"], [Site "?"], etc.
     * We want only the move text (e.g., "1. e4 e5 2. Nf3 Nc6")
     * @param {string} pgn - Full PGN string with headers
     * @returns {string} Just the moves portion without headers
     */
    stripPgnHeaders(pgn) {
        if (!pgn) return ''; // Handle empty input

        // PGN headers are lines starting with [ and ending with ]
        // Split into lines, filter out header lines, rejoin
        const lines = pgn.split('\n');
        const moveLines = lines.filter(line => {
            const trimmed = line.trim();
            // Skip header lines (start with [) and empty lines before moves
            return trimmed && !trimmed.startsWith('[');
        });

        return moveLines.join(' ').trim(); // Join with space for proper move formatting
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
