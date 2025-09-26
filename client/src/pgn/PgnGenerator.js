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
            console.log(`[PgnGenerator] Raw moves: ${movesOnly}`);

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
                            console.warn(`[PgnGenerator] Invalid engine completion move: ${completionMove.san}`);
                            break;
                        }
                    }
                }
            }

            // Get properly formatted PGN from chess.js
            const properPgn = chess.pgn();
            console.log(`[PgnGenerator] Chess.js formatted PGN: ${properPgn}`);
            return properPgn;

        } catch (error) {
            console.error(`[PgnGenerator] Error with chess.js PGN generation: ${error.message}`);
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
        console.log(`   📈 [PgnGenerator] formatMoveAnnotations called`);
        let annotations = '{Move playrates:\n';

        // Add individual move playrates from likelihoodPath (contains {san, playrate} objects)
        if (line.likelihoodPath && line.likelihoodPath.length > 0) {
            console.log(`      Processing ${line.likelihoodPath.length} moves from likelihood path:`);
            for (let i = 0; i < line.likelihoodPath.length; i++) {
                const move = line.likelihoodPath[i];
                console.log(`         Move ${i + 1}: ${move.san} (playrate: ${move.playrate?.toFixed(4)})`);
                if (move.playrate !== undefined && move.san) {
                    const playratePercent = (move.playrate * 100).toFixed(2);
                    const annotation = `+${playratePercent}%\t${move.san}\n`;
                    console.log(`            Adding annotation: "${annotation.trim()}"`);
                    annotations += annotation;
                }
            }
        } else {
            console.log(`      No likelihood path available (${line.likelihoodPath?.length || 0} moves)`);
        }

        // Add line statistics
        console.log(`      Adding line statistics...`);
        if (line.statistics) {
            console.log(`         Using line.statistics:`, line.statistics);
            const cumulativePlayrate = (line.statistics.cumulativePlayrate * 100).toFixed(2);
            const cumulativeAnnotation = `Line cumulative playrate: +${cumulativePlayrate}%\n`;
            console.log(`         Cumulative playrate annotation: "${cumulativeAnnotation.trim()}"`);
            annotations += cumulativeAnnotation;

            if (line.statistics.winrate !== undefined && line.statistics.totalGames !== undefined) {
                const winratePercent = (line.statistics.winrate * 100).toFixed(2);
                const gamesFormatted = line.statistics.totalGames.toLocaleString();
                console.log(`         Win rate: ${winratePercent}%, Games: ${gamesFormatted}`);

                let winrateDescription;
                if (this.config.DRAWSAREHALF === 0) {
                    winrateDescription = 'Line winrate (excluding draws)';
                } else {
                    winrateDescription = 'Line winrate (draws as half points)';
                }

                const winrateAnnotation = `${winrateDescription}: +${winratePercent}% over ${gamesFormatted} games`;
                console.log(`         Win rate annotation: "${winrateAnnotation}"`);
                annotations += winrateAnnotation;
            } else {
                console.log(`         Win rate data incomplete: winrate=${line.statistics.winrate}, games=${line.statistics.totalGames}`);
            }
        } else if (line.cumulativeLikelihood) {
            console.log(`         Using line.cumulativeLikelihood: ${line.cumulativeLikelihood}`);
            // Use cumulativeLikelihood from line object if no statistics
            const cumulativePlayrate = (line.cumulativeLikelihood * 100).toFixed(2);
            const cumulativeAnnotation = `Line cumulative playrate: +${cumulativePlayrate}%\n`;
            console.log(`         Cumulative playrate annotation: "${cumulativeAnnotation.trim()}"`);
            annotations += cumulativeAnnotation;
        } else {
            console.log(`         No statistics or cumulative likelihood available`);
        }

        annotations += '}';
        console.log(`      Final annotations block: ${annotations.split('\n').length} lines`);
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
            console.warn('Engine completion failed:', error.message);
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
        console.log(`📋 [PgnGenerator] generateSingleLine called:`);
        console.log(`   Event name: ${eventName}`);
        console.log(`   Line PGN: "${line.pgn || 'EMPTY'}"`);
        console.log(`   Line data:`, {
            cumulativeLikelihood: line.cumulativeLikelihood?.toFixed(6),
            likelihoodPathLength: line.likelihoodPath?.length || 0,
            hasStatistics: !!line.statistics
        });

        const header = `[Event "${eventName}"]`;
        console.log(`   Generated header: ${header}`);

        // Use the pgn string directly - it contains the actual move sequence
        const moves = line.pgn || '';
        console.log(`   Moves section: "${moves}"`);

        console.log(`   Generating move annotations...`);
        const annotations = this.formatMoveAnnotations(line);
        console.log(`   Generated annotations: ${annotations.split('\n')[0]}... (${annotations.split('\n').length} lines)`);

        const result = `${header}\n\n${moves}\n${annotations}`;
        console.log(`✅ [PgnGenerator] Single line generated (${result.length} characters)`);

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
   * Format a decimal value as a percentage with + prefix
   * @param {number} value - Decimal value (0-1)
   * @returns {string} Formatted percentage (e.g., "+25.83%")
   */
    formatPercentage(value) {
        const percentage = (value * 100).toFixed(2);
        return `+${percentage}%`;
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
