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
            // New configuration options for enhanced PGN generation
            outputFormat: config.pgnConfig?.outputFormat || config.outputFormat || 'individual', // 'individual' | 'tree'
            annotationStyle: config.pgnConfig?.annotationStyle || config.annotationStyle || 'endBlock', // 'endBlock' | 'inline'
            ...config
        };

        // Debug logging to see what configuration we received
        console.log('🔧 [PgnGenerator] Constructor configuration:');
        console.log('   Raw config.pgnConfig:', config.pgnConfig);
        console.log('   Final outputFormat:', this.config.outputFormat);
        console.log('   Final annotationStyle:', this.config.annotationStyle);
    }

    /**
   * Generate complete PGN for a set of lines
   * @param {Array} lines - Array of line objects with moves and statistics
   * @param {string} chapterName - Base name for the chapter (e.g., "Ruy_Lopez")
   * @param {Object} engineClient - Optional engine for line completion
   * @returns {string} Complete PGN content
   */
    async generatePGN(lines, chapterName, engineClient = null) {
        // Debug logging to see routing decision
        console.log('🎯 [PgnGenerator] generatePGN routing decision:');
        console.log('   outputFormat:', this.config.outputFormat);
        console.log('   annotationStyle:', this.config.annotationStyle);
        console.log('   lines count:', lines.length);

        // Route to appropriate generation method based on configuration
        if (this.config.outputFormat === 'tree') {
            console.log('   → Taking TREE generation path');
            return await this.generateTreePGN(lines, chapterName, engineClient);
        } else if (this.config.annotationStyle === 'inline') {
            console.log('   → Taking INLINE annotation path');
            return await this.generateInlineAnnotatedPGN(lines, chapterName, engineClient);
        } else {
            console.log('   → Taking DEFAULT individual lines path');
            // Default behavior: individual lines with end-block annotations
            return await this.generateIndividualLinesPGN(lines, chapterName, engineClient);
        }

        /* ORIGINAL CODE (kept for reference):
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
        */
    }

    /**
   * Generate PGN with tree structure using variations (new feature)
   * Combines related lines into a single PGN with branching variations
   * @param {Array} lines - Array of line objects with moves and statistics
   * @param {string} chapterName - Base name for the chapter
   * @param {Object} engineClient - Optional engine for line completion
   * @returns {string} Tree-structured PGN content
   */
    async generateTreePGN(lines, chapterName, engineClient = null) {
        console.log(`📋 [PgnGenerator] Generating tree-structured PGN for ${lines.length} lines`);

        // Build tree structure from lines
        const variationTree = this.buildVariationTree(lines);

        // Generate event header for the tree
        const eventHeader = this.generateEventHeaders(chapterName, 1, this.config.perspective);

        // Generate tree PGN with variations
        const treePgn = await this.generateTreeMoveSequence(variationTree, engineClient);

        // Generate combined statistics for all lines
        const combinedAnnotations = this.formatCombinedAnnotations(lines);

        return `${eventHeader}\n\n${treePgn}\n${combinedAnnotations}`.trim();
    }

    /**
   * Generate PGN with inline move annotations (new feature)
   * Embeds playrate statistics directly in moves like "e4{+25.28%}"
   * @param {Array} lines - Array of line objects with moves and statistics
   * @param {string} chapterName - Base name for the chapter
   * @param {Object} engineClient - Optional engine for line completion
   * @returns {string} PGN content with inline annotations
   */
    async generateInlineAnnotatedPGN(lines, chapterName, engineClient = null) {
        console.log(`📋 [PgnGenerator] Generating inline-annotated PGN for ${lines.length} lines`);
        let pgnContent = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNumber = i + 1;

            // Generate event header
            const eventHeader = this.generateEventHeaders(chapterName, lineNumber, this.config.perspective);

            // Generate move sequence with inline annotations
            const moveSequence = await this.generateMoveSequenceWithInlineStats(line, engineClient);

            // Generate summary statistics (without individual move playrates since they're inline)
            const summaryAnnotations = this.formatSummaryAnnotations(line);

            // Combine into complete line
            pgnContent += eventHeader + '\n\n';
            pgnContent += moveSequence + '\n';
            pgnContent += summaryAnnotations + '\n\n';
        }

        return pgnContent.trim();
    }

    /**
   * Generate individual lines PGN (original behavior preserved)
   * @param {Array} lines - Array of line objects with moves and statistics
   * @param {string} chapterName - Base name for the chapter
   * @param {Object} engineClient - Optional engine for line completion
   * @returns {string} Individual lines PGN content
   */
    async generateIndividualLinesPGN(lines, chapterName, engineClient = null) {
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

    // ==================== HELPER METHODS FOR NEW FEATURES ====================

    /**
   * Build a tree structure from multiple lines for variation-based PGN
   * Uses the longest line as the main line, others as variations
   * @param {Array} lines - Array of line objects with moves and pgn
   * @returns {Object} Tree structure with main line and variations
   */
    buildVariationTree(lines) {
        console.log(`🌳 [PgnGenerator] Building variation tree from ${lines.length} lines`);

        if (lines.length === 0) {
            return { mainLine: '', variations: [] };
        }

        // Sort lines by length (longest first for main line)
        const sortedLines = lines.slice().sort((a, b) => {
            const aLength = (a.moves || this.extractMovesFromPgn(a.pgn)).length;
            const bLength = (b.moves || this.extractMovesFromPgn(b.pgn)).length;
            return bLength - aLength; // Longest first
        });

        // Use longest line as main line
        const mainLine = sortedLines[0];
        const variations = sortedLines.slice(1);

        console.log(`   Main line (longest): ${mainLine.pgn}`);
        console.log(`   Variations: ${variations.length}`);

        return {
            mainLine: mainLine,
            variations: variations,
            allLines: lines
        };
    }

    // _formatEngineCompletion method removed - now handled directly in generateMoveSequence using chess.js

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

    // _formatMovesOnly method removed - now handled directly in generateMoveSequence using chess.js

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
     * Generate tree-structured move sequence with variations
     * @param {Object} variationTree - Tree structure from buildVariationTree
     * @param {Object} engineClient - Optional engine for line completion
     * @returns {string} PGN formatted tree with variations
     */
    async generateTreeMoveSequence(variationTree, engineClient = null) {
        if (!variationTree || !variationTree.mainLine) {
            return '';
        }

        let pgn = '';
        const mainLine = variationTree.mainLine;

        // Generate main line moves
        for (let i = 0; i < mainLine.moves.length; i++) {
            const move = mainLine.moves[i];
            const moveNumber = Math.floor(i / 2) + 1;
            const isWhiteMove = i % 2 === 0;

            if (isWhiteMove) {
                pgn += `${moveNumber}. ${move.san}`;
            } else {
                pgn += ` ${move.san}`;
            }

            // Add variations at this position if any
            if (variationTree.variations && variationTree.variations[i]) {
                const variations = variationTree.variations[i];
                for (const variation of variations) {
                    pgn += ` (${variation.moves.map(m => m.san).join(' ')})`;
                }
            }

            pgn += ' ';
        }

        // Engine finishing if enabled
        if (engineClient && this.config.ENGINEFINISH) {
            try {
                const lastPosition = mainLine.fen || mainLine.moves[mainLine.moves.length - 1]?.fen;
                if (lastPosition) {
                    const engineMove = await engineClient.getBestMove(lastPosition, this.config.ENGINEDEPTH);
                    if (engineMove) {
                        const moveCount = Math.floor(mainLine.moves.length / 2) + 1;
                        const isWhite = mainLine.moves.length % 2 === 0;
                        if (isWhite) {
                            pgn += `${moveCount}. ${engineMove}`;
                        } else {
                            pgn += `${engineMove}`;
                        }
                    }
                }
            } catch (error) {
                console.warn('Engine completion failed:', error);
            }
        }

        return pgn.trim();
    }

    /**
     * Format combined annotations for tree structure
     * @param {Array} lines - Array of line objects
     * @returns {string} Combined statistics annotation
     */
    formatCombinedAnnotations(lines) {
        let annotations = '\n{';

        // Aggregate statistics across all lines
        let totalGames = 0;
        let totalWins = 0;
        let uniqueMoves = new Set();

        for (const line of lines) {
            if (line.totalGames) totalGames += line.totalGames;
            if (line.winRate && line.totalGames) {
                totalWins += line.winRate * line.totalGames;
            }
            if (line.moves) {
                line.moves.forEach(move => uniqueMoves.add(move.san || move));
            }
        }

        annotations += `\nTotal lines analyzed: ${lines.length}`;
        annotations += `\nTotal games: ${this.formatGameCount(totalGames)}`;

        if (totalGames > 0) {
            const avgWinRate = totalWins / totalGames;
            annotations += `\nAverage winrate: ${this.formatPercentage(avgWinRate)}`;
        }

        annotations += `\nUnique moves: ${uniqueMoves.size}`;
        annotations += '\n}';

        return annotations;
    }

    /**
     * Generate individual lines PGN (default behavior)
     * @param {Array} lines - Array of line objects
     * @param {string} chapterName - Chapter name
     * @param {Object} engineClient - Optional engine client
     * @returns {string} Individual lines PGN
     */
    async generateIndividualLinesPGN(lines, chapterName, engineClient = null) {
        console.log(`📋 [PgnGenerator] Generating individual lines PGN for ${lines.length} lines`);

        let pgnContent = '';
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNumber = i + 1;

            // Generate event header
            const eventHeader = this.generateEventHeaders(chapterName, lineNumber, this.config.perspective);

            // Generate move sequence with annotations
            const moveSequence = await this.generateMoveSequence(line, engineClient);
            const annotations = this.formatMoveAnnotations(line);

            pgnContent += `${eventHeader}\n\n${moveSequence}\n${annotations}\n\n`;
        }

        return pgnContent.trim();
    }

    /**
     * Generate inline annotated PGN
     * @param {Array} lines - Array of line objects
     * @param {string} chapterName - Chapter name
     * @param {Object} engineClient - Optional engine client
     * @returns {string} Inline annotated PGN
     */
    async generateInlineAnnotatedPGN(lines, chapterName, engineClient = null) {
        console.log(`📋 [PgnGenerator] Generating inline annotated PGN for ${lines.length} lines`);

        let pgnContent = '';
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNumber = i + 1;

            // Generate event header
            const eventHeader = this.generateEventHeaders(chapterName, lineNumber, this.config.perspective);

            // Generate move sequence with inline statistics
            const moveSequence = await this.generateMoveSequenceWithInlineStats(line, engineClient);

            // Generate summary annotations (shorter since stats are inline)
            const summaryAnnotations = this.formatSummaryAnnotations(line);

            pgnContent += `${eventHeader}\n\n${moveSequence}\n${summaryAnnotations}\n\n`;
        }

        return pgnContent.trim();
    }

    /**
     * Generate move sequence with inline statistics like "e4{+25.28%}"
     * @param {Object} line - Line object with moves and statistics
     * @param {Object} engineClient - Optional engine client
     * @returns {string} Move sequence with inline stats
     */
    async generateMoveSequenceWithInlineStats(line, engineClient = null) {
        if (!line.moves || line.moves.length === 0) {
            return '';
        }

        let moveSequence = '';

        for (let i = 0; i < line.moves.length; i++) {
            const move = line.moves[i];
            const moveNumber = Math.floor(i / 2) + 1;
            const isWhiteMove = i % 2 === 0;

            if (isWhiteMove) {
                moveSequence += `${moveNumber}. `;
            }

            // Add move with inline playrate if available
            if (move.playrate !== undefined) {
                const playrateFormatted = this.formatPercentage(move.playrate);
                moveSequence += `${move.san}{${playrateFormatted}}`;
            } else {
                moveSequence += move.san;
            }

            if (!isWhiteMove) {
                moveSequence += ' ';
            } else {
                moveSequence += ' ';
            }
        }

        // Engine finishing if enabled
        if (engineClient && this.config.ENGINEFINISH) {
            try {
                const lastPosition = line.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
                const engineMove = await engineClient.getBestMove(lastPosition, this.config.ENGINEDEPTH);
                if (engineMove) {
                    const nextMoveNumber = Math.floor(line.moves.length / 2) + 1;
                    const isWhite = line.moves.length % 2 === 0;
                    if (isWhite) {
                        moveSequence += `${nextMoveNumber}. ${engineMove}`;
                    } else {
                        moveSequence += engineMove;
                    }
                }
            } catch (error) {
                console.warn('Engine completion failed:', error);
            }
        }

        return moveSequence.trim();
    }

    /**
     * Format summary annotations (shorter version for inline mode)
     * @param {Object} line - Line object
     * @returns {string} Summary annotations
     */
    formatSummaryAnnotations(line) {
        let annotations = '\n{';

        if (line.totalGames !== undefined) {
            annotations += `\nTotal games: ${this.formatGameCount(line.totalGames)}`;
        }

        if (line.winRate !== undefined) {
            const winrateFormatted = this.formatPercentage(line.winRate);
            annotations += `\nLine winrate: ${winrateFormatted}`;
        }

        if (line.cumulativeLikelihood !== undefined) {
            const cumulativeFormatted = this.formatPercentage(line.cumulativeLikelihood);
            annotations += `\nCumulative playrate: ${cumulativeFormatted}`;
        }

        annotations += '\n}';
        return annotations;
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
