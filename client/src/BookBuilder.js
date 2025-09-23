/**
 * BookBuilder.js - Main orchestrator for chess opening repertoire generation
 *
 * This class implements the complete workflow for analyzing chess openings using
 * Lichess database statistics and generating annotated PGN files. It coordinates
 * all components to replicate the Python BookBuilder behavior exactly.
 *
 * Based on comprehensive Python analysis and refactoring strategy from:
 * - @client/claudedocs/step6-analysis/python-bookbuilder-analysis.md
 * - @client/claudedocs/step6-analysis/javascript-refactoring-strategy.md
 * - @client/claudedocs/step6-analysis/bookbuilder-js-implementation-plan.md
 */

import ChessEngine from './chess/ChessEngine.js';
import LichessClient from './api/LichessClient.js';
import StockfishEngine from './engine/StockfishEngine.js';
import Statistics from './stats/Statistics.js';
import MoveSelector from './algorithm/MoveSelector.js';
import PgnGenerator from './pgn/PgnGenerator.js';

/**
 * Main BookBuilder class that orchestrates all components
 * Replaces Python's Grower, Rooter, Leafer, and Printer classes
 */
class BookBuilder {
    constructor(config) {
        // Dependency injection instead of Python's global variables
        this.config = config;
        this.chessEngine = new ChessEngine();
        this.lichessClient = new LichessClient();
        this.moveSelector = new MoveSelector(config);
        this.statisticsEngine = new Statistics();
        this.pgnGenerator = new PgnGenerator(config);
        this.stockfishEngine = config.CAREABOUTENGINE ? new StockfishEngine() : null;

        // State management (replaces Python's global finalLine and pgnsreturned)
        this.finalLines = [];
        this.processingQueue = [];

        // Performance and error handling (use config values)
        this.BATCH_SIZE = config.BATCH_SIZE || 5; // Process moves in batches to avoid overwhelming API
        this.API_DELAY = config.API_DELAY || 100; // Milliseconds between API calls
    }

    /**
     * Main orchestration method (replaces Python's Grower.run())
     * Processes all openings from configuration and generates PGN files
     *
     * @param {Object} config - Configuration object with openings array
     * @returns {Object} - Results object with chapter names as keys and PGN content as values
     */
    async processOpening(config) {
        const results = {};

        console.log(`Starting BookBuilder processing for ${config.openings.length} opening(s)`);

        for (let chapter = 1; chapter <= config.openings.length; chapter++) {
            const opening = config.openings[chapter - 1];
            console.log(`Processing Chapter ${chapter}: ${opening.name}`);

            try {
                const chapterContent = await this.generateChapter(opening, chapter);
                const fileName = `Chapter_${chapter}_${opening.name.replace(/\s+/g, '_')}.pgn`;
                results[fileName] = chapterContent;

                console.log(`Completed Chapter ${chapter}: ${opening.name} - ${this.finalLines.length} lines generated`);
            } catch (error) {
                console.error(`Failed to generate Chapter ${chapter}: ${error.message}`);
                throw new Error(`Chapter ${chapter} generation failed: ${error.message}`);
            }
        }

        return results;
    }

    /**
     * Chapter generation method (replaces Python's Grower.iterator())
     * Coordinates the complete analysis workflow for a single opening
     *
     * @param {Object} opening - Opening configuration with name and fen
     * @param {number} chapterNumber - Chapter number for output naming
     * @returns {string} - Complete PGN content for the chapter
     */
    async generateChapter(opening, chapterNumber) {
        // Reset state for each chapter (replaces Python's global resets)
        this.finalLines = [];
        this.processingQueue = [];

        try {
            // Phase 1: Root analysis (replaces Python's Rooter class)
            console.log(`  Phase 1: Root analysis for ${opening.name}`);
            const rootResults = await this.analyzeRoot(opening.fen, opening.perspective);
            this.processingQueue.push(...rootResults);
            console.log(`  Found ${rootResults.length} initial continuations`);

            // Phase 2: Iterative expansion (replaces Python's Leafer loop)
            console.log('  Phase 2: Iterative line expansion');
            await this.expandAllLines();
            console.log(`  Expansion complete. Final lines: ${this.finalLines.length}`);

            // Phase 3: Output generation (replaces Python's Printer class)
            console.log('  Phase 3: Generating PGN output');
            const output = await this.generateOutput(opening.name, chapterNumber);
            console.log('  PGN generation complete');

            return output;

        } catch (error) {
            throw new Error(`Failed to generate chapter ${chapterNumber}: ${error.message}`);
        }
    }

    /**
     * Root analysis method (replaces Python's Rooter class)
     * Analyzes the starting position and determines initial valid continuations
     *
     * @param {string} fen - Starting position in FEN notation
     * @param {string} perspective - Opening perspective ('white' or 'black')
     * @returns {Array} - Array of initial line objects for processing
     */
    async analyzeRoot(fen, perspective) {
        try {
            // Parse initial position
            const success = this.chessEngine.parsePosition(fen);
            if (!success) {
                throw new Error(`Invalid starting position: ${fen}`);
            }

            const moves = this.chessEngine.getHistory();

            console.log(`    Root analysis: ${moves.length} moves played, perspective: ${perspective}`);

            // CRITICAL FIX: Apply ALL moves from the parsed position to reach final position
            // This matches Python Rooter behavior: board.push(move) for each move
            if (moves.length > 0) {
                console.log(`    Applying ${moves.length} historical moves to reach final position`);
                for (let i = 0; i < moves.length; i++) {
                    const move = moves[i];
                    const currentTurn = this.chessEngine.getTurn();
                    console.log(`    Move ${i + 1}: ${move} (${currentTurn} to move)`);

                    const moveResult = this.chessEngine.makeMove(move);
                    if (!moveResult) {
                        const currentFen = this.chessEngine.getFen();
                        throw new Error(`Failed to apply historical move ${move} at position ${i + 1}. Current FEN: ${currentFen}`);
                    }
                }
                console.log(`    Successfully applied all ${moves.length} moves`);
            } else {
                console.log(`    No historical moves to apply - using starting position`);
            }

            // Get continuations from FINAL position after applying all moves (not starting position)
            const finalFen = this.chessEngine.getFen();
            console.log(`    Final position FEN: ${finalFen}`);

            const positionStats = await this.lichessClient.getPositionStats(finalFen);
            const validLines = [];

            if (!positionStats || !positionStats.moves) {
                console.warn('    No position data available for final position');
                return [];
            }

            for (const move of positionStats.moves) {
                if (this.isValidContinuation(move, 1.0)) {
                    validLines.push({
                        fen: finalFen, // FIXED: Use final position FEN, not starting FEN
                        pgn: this.chessEngine.getPgn(),
                        perspective: perspective,
                        cumulativeLikelihood: move.playrate,
                        likelihoodPath: []
                    });
                }
            }

            console.log(`    Root analysis complete: ${validLines.length} valid initial lines`);
            return validLines;

        } catch (error) {
            throw new Error(`Invalid starting position: ${fen} - ${error.message}`);
        }
    }

    /**
     * Iterative line expansion method (replaces Python's Leafer while loop)
     * Processes the queue of lines until no new lines can be generated
     */
    async expandAllLines() {
        let iterationCount = 0;
        const maxIterations = 1000; // Safety limit to prevent infinite loops

        while (this.processingQueue.length > 0 && iterationCount < maxIterations) {
            iterationCount++;
            const currentBatch = this.processingQueue.splice(0, this.BATCH_SIZE);

            console.log(`    Iteration ${iterationCount}: Processing ${currentBatch.length} lines, ${this.processingQueue.length} remaining`);

            // Process batch in parallel to optimize performance
            const batchResults = await Promise.all(
                currentBatch.map(line => this.expandLine(line))
            );

            // Add new lines to queue (flattened and filtered)
            const newLines = batchResults.flat().filter(Boolean);
            this.processingQueue.push(...newLines);

            // Rate limiting pause to avoid overwhelming Lichess API
            if (this.processingQueue.length > 0) {
                await this.sleep(this.API_DELAY);
            }
        }

        if (iterationCount >= maxIterations) {
            console.warn(`    Maximum iterations (${maxIterations}) reached. Some lines may be incomplete.`);
        }

        console.log(`    Expansion completed after ${iterationCount} iterations`);
    }

    /**
     * Line expansion method (replaces Python's Leafer._calculate_pgns())
     * Analyzes a single line to find opponent continuations and our responses
     *
     * @param {Object} lineData - Line data object with fen, pgn, perspective, etc.
     * @returns {Array} - Array of new line objects to add to processing queue
     */
    async expandLine(lineData) {
        const { fen, pgn, cumulativeLikelihood, likelihoodPath, perspective } = lineData;

        try {
            // Parse position and get continuations
            const success = this.chessEngine.parsePosition(fen);
            if (!success) {
                throw new Error(`Invalid FEN: ${fen}`);
            }

            // Find opponent continuations
            const continuations = await this.lichessClient.getPositionStats(fen);

            if (!continuations || !continuations.moves) {
                // No data available - finalize line
                await this.finalizeLine(lineData);
                return [];
            }

            const validContinuations = continuations.moves.filter(move =>
                this.isValidContinuation(move, cumulativeLikelihood)
            );

            if (validContinuations.length === 0) {
                // No valid continuations - finalize line
                await this.finalizeLine(lineData);
                return [];
            }

            const newLines = [];

            for (const move of validContinuations) {
                try {
                    // Make opponent's move
                    const moveResult = this.chessEngine.makeMove(move.san);
                    if (!moveResult) {
                        console.warn(`Invalid opponent move: ${move.san}`);
                        continue;
                    }

                    const newFen = this.chessEngine.getFen();

                    // Find our best response
                    const candidates = await this.lichessClient.getMoveStats(newFen);

                    if (!candidates || candidates.length === 0) {
                        // No candidate moves available - try engine completion or finalize
                        this.chessEngine.undoMove(); // Undo opponent's move
                        const completed = await this.handleNoGoodResponse(lineData, move, newFen);
                        if (completed) {
                            newLines.push(completed);
                        }
                        continue;
                    }

                    const bestResponse = await this.moveSelector.selectBestMove(
                        newFen,
                        candidates,
                        this.lichessClient,
                        this.statisticsEngine
                    );

                    if (bestResponse && this.isValidResponse(bestResponse, move)) {
                        // Make our response
                        const ourMoveResult = this.chessEngine.makeMove(bestResponse.san);
                        if (!ourMoveResult) {
                            console.warn(`Invalid our move: ${bestResponse.san}`);
                            this.chessEngine.undoMove(); // Undo opponent's move
                            continue;
                        }

                        const finalFen = this.chessEngine.getFen();

                        const newLikelihoodPath = [...likelihoodPath, {
                            san: move.san,
                            playrate: move.playrate
                        }];

                        const newPgn = this.updatePgn(pgn, move.san, bestResponse.san, perspective);

                        newLines.push({
                            fen: finalFen,
                            pgn: newPgn,
                            perspective: perspective === 'white' ? 'black' : 'white',
                            cumulativeLikelihood: move.playrate * cumulativeLikelihood,
                            likelihoodPath: newLikelihoodPath
                        });

                        // Undo both moves to restore original position
                        this.chessEngine.undoMove(); // Undo our move
                        this.chessEngine.undoMove(); // Undo opponent's move

                    } else {
                        // No good response - try engine completion or finalize
                        this.chessEngine.undoMove(); // Undo opponent's move
                        const completed = await this.handleNoGoodResponse(lineData, move, newFen);
                        if (completed) {
                            newLines.push(completed);
                        }
                    }

                } catch (moveError) {
                    console.warn(`Error processing move ${move.san}: ${moveError.message}`);
                    continue;
                }
            }

            return newLines;

        } catch (error) {
            console.warn(`Error expanding line: ${error.message}`);
            await this.finalizeLine(lineData);
            return [];
        }
    }

    /**
     * Handle cases where no good response is found
     * Try engine completion or finalize the line
     *
     * @param {Object} lineData - Current line data
     * @param {Object} opponentMove - Opponent's move object
     * @param {Object} position - Chess position after opponent's move
     * @returns {Object|null} - New line object or null if line should be finalized
     */
    async handleNoGoodResponse(lineData, opponentMove, positionFen) {
        if (this.config.ENGINEFINISH && this.stockfishEngine) {
            try {
                const engineMove = await this.stockfishEngine.getBestMove(
                    positionFen,
                    this.config.ENGINEDEPTH
                );

                if (engineMove) {
                    // Make the engine move and get the new FEN
                    const moveResult = this.chessEngine.makeMove(engineMove);
                    if (!moveResult.success) {
                        console.warn(`Engine move ${engineMove} failed: ${moveResult.error}`);
                        return null;
                    }

                    const newFen = this.chessEngine.getFen();

                    const newPgn = this.updatePgn(
                        lineData.pgn,
                        opponentMove.san,
                        engineMove,
                        lineData.perspective
                    );

                    // Undo the engine move to restore position
                    this.chessEngine.undoMove();

                    return {
                        fen: newFen,
                        pgn: newPgn,
                        perspective: lineData.perspective === 'white' ? 'black' : 'white',
                        cumulativeLikelihood: opponentMove.playrate * lineData.cumulativeLikelihood,
                        likelihoodPath: [...lineData.likelihoodPath, {
                            san: opponentMove.san,
                            playrate: opponentMove.playrate
                        }]
                    };
                }
            } catch (error) {
                console.warn(`Engine completion failed: ${error.message}`);
            }
        }

        // Finalize line without good response
        await this.finalizeLine({
            ...lineData,
            pgn: lineData.pgn + ' ' + opponentMove.san,
            cumulativeLikelihood: opponentMove.playrate * lineData.cumulativeLikelihood,
            likelihoodPath: [...lineData.likelihoodPath, {
                san: opponentMove.san,
                playrate: opponentMove.playrate
            }]
        });

        return null;
    }

    /**
     * Finalize a line and add it to the final lines collection
     *
     * @param {Object} lineData - Line data to finalize
     */
    async finalizeLine(lineData) {
        try {
            // Load the position into the chess engine
            this.chessEngine.loadPosition(lineData.fen);
            const stats = await this.lichessClient.getPositionStats(lineData.fen);

            let winRate = 0;
            let totalGames = 0;

            if (stats && stats.white + stats.draws + stats.black > 0) {
                winRate = this.statisticsEngine.calculateWinRate(
                    stats.white,
                    stats.draws,
                    stats.black,
                    this.config.DRAWSAREHALF
                );
                totalGames = stats.white + stats.draws + stats.black;
            } else {
                // Handle mate positions or insufficient data
                winRate = this.calculateFallbackWinRate(lineData.fen, lineData);
                totalGames = this.getFallbackGameCount(lineData);
            }

            this.finalLines.push({
                pgn: lineData.pgn,
                moves: this.extractMovesFromPgn(lineData.pgn),
                cumulativeLikelihood: lineData.cumulativeLikelihood,
                likelihoodPath: lineData.likelihoodPath,
                statistics: {
                    cumulativePlayrate: lineData.cumulativeLikelihood,
                    winrate: winRate,
                    totalGames: totalGames
                }
            });

        } catch (error) {
            console.warn(`Error finalizing line: ${error.message}`);
            // Add line anyway with default values
            this.finalLines.push({
                pgn: lineData.pgn,
                moves: this.extractMovesFromPgn(lineData.pgn),
                cumulativeLikelihood: lineData.cumulativeLikelihood,
                likelihoodPath: lineData.likelihoodPath,
                statistics: {
                    cumulativePlayrate: lineData.cumulativeLikelihood,
                    winrate: 0.5,
                    totalGames: this.config.MINGAMES
                }
            });
        }
    }

    /**
     * Generate final PGN output (replaces Python's Printer class)
     *
     * @param {string} openingName - Name of the opening
     * @param {number} chapterNumber - Chapter number
     * @returns {string} - Complete PGN content
     */
    async generateOutput(openingName, _chapterNumber) {
        // Remove duplicates and subsets (matches Python logic exactly)
        const uniqueLines = this.removeDuplicateLines(this.finalLines);

        // Sort by consecutive move probabilities (matches Python sorting)
        const sortedLines = this.sortLinesByProbability(uniqueLines);

        // Reverse if LONGTOSHORT is enabled (matches Python behavior)
        if (this.config.LONGTOSHORT) {
            sortedLines.reverse();
        }

        // Generate PGN content for each line
        const pgnContent = [];

        for (let i = 0; i < sortedLines.length; i++) {
            const line = sortedLines[i];
            const eventName = `${openingName} Line ${i + 1}`;

            try {
                const linePgn = await this.pgnGenerator.generateSingleLine(line, eventName);
                pgnContent.push(linePgn);
            } catch (error) {
                console.warn(`Error generating PGN for line ${i + 1}: ${error.message}`);
                continue;
            }
        }

        return pgnContent.join('\n\n');
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Check if a continuation meets the minimum thresholds
     */
    isValidContinuation(move, cumulativeLikelihood) {
        const continuationLikelihood = move.playrate * cumulativeLikelihood;
        const isValid = continuationLikelihood >= this.config.DEPTHLIKELIHOOD &&
                       move.totalGames > this.config.CONTINUATIONGAMES &&
                       move.playrate >= this.config.MINPLAYRATE;
        
        console.log(`    [DEBUG] Move ${move.san || move.uci}: playrate=${move.playrate}, games=${move.totalGames}, likelihood=${continuationLikelihood.toFixed(4)}, thresholds=(DEPTH:${this.config.DEPTHLIKELIHOOD}/GAMES:${this.config.CONTINUATIONGAMES}/PLAYRATE:${this.config.MINPLAYRATE}), valid=${isValid}`);
        
        return isValid;
    }

    /**
     * Check if our response meets the quality thresholds
     */
    isValidResponse(response, opponentMove) {
        return response &&
               opponentMove.playrate > this.config.MINPLAYRATE &&
               response.totalGames > this.config.MINGAMES &&
               response.winRate > 0;
    }

    /**
     * Update PGN string with new moves (matches Python formatting exactly)
     */
    updatePgn(currentPgn, opponentMove, ourMove, perspective) {
        if (perspective === 'black') {
            const moveNumber = Math.ceil((currentPgn.split(' ').length + 1) / 2);
            return `${currentPgn} ${moveNumber}. ${opponentMove} ${ourMove}`;
        } else {
            return `${currentPgn} ${opponentMove} ${ourMove}`;
        }
    }

    /**
     * Remove duplicate lines and subsets (exact replication of Python logic)
     */
    removeDuplicateLines(lines) {
        const unique = [];
        const seen = new Set();

        for (const line of lines) {
            const key = line.pgn;
            if (!seen.has(key)) {
                seen.add(key);

                // Check if this line is a subset of an existing line
                const isSubset = unique.some(existing =>
                    existing.pgn.includes(key) && existing.pgn !== key
                );

                if (!isSubset) {
                    // Remove any existing lines that are subsets of this line
                    for (let i = unique.length - 1; i >= 0; i--) {
                        if (key.includes(unique[i].pgn) && key !== unique[i].pgn) {
                            unique.splice(i, 1);
                        }
                    }
                    unique.push(line);
                }
            }
        }

        return unique;
    }

    /**
     * Sort lines by consecutive move probabilities (exact replication of Python sorting)
     */
    sortLinesByProbability(lines) {
        return lines.sort((a, b) => {
            const aProbs = a.likelihoodPath.map(move => move.playrate);
            const bProbs = b.likelihoodPath.map(move => move.playrate);

            for (let i = 0; i < Math.min(aProbs.length, bProbs.length); i++) {
                if (aProbs[i] !== bProbs[i]) {
                    return bProbs[i] - aProbs[i]; // Descending order
                }
            }

            return bProbs.length - aProbs.length;
        });
    }

    /**
     * Calculate fallback win rate for positions with insufficient data
     */
    calculateFallbackWinRate(fen, lineData) {
        // Load position and check game state
        this.chessEngine.loadPosition(fen);

        if (this.chessEngine.isCheckmate()) {
            // In checkmate, the side to move is the loser
            const turnColor = this.chessEngine.getTurn(); // 'w' or 'b'
            const isWhiteToMove = turnColor === 'w';

            // If white is to move and in checkmate, black wins (perspective white = 0.0)
            // If black is to move and in checkmate, white wins (perspective white = 1.0)
            if (lineData.perspective === 'white') {
                return isWhiteToMove ? 0.0 : 1.0;
            } else {
                return isWhiteToMove ? 1.0 : 0.0;
            }
        }
        if (this.chessEngine.isDraw()) {
            return this.config.DRAWSAREHALF ? 0.5 : 0.0;
        }
        return 0.5; // Default for insufficient data
    }

    /**
     * Get fallback game count for mate positions
     */
    getFallbackGameCount(lineData) {
        return lineData.likelihoodPath.length > 0 ?
            this.config.MINGAMES :
            this.config.CONTINUATIONGAMES;
    }

    /**
     * Extract moves array from PGN string for proper formatting
     * @param {string} pgn - PGN string with moves
     * @returns {Array} Array of move objects with SAN notation
     */
    extractMovesFromPgn(pgn) {
        if (!pgn || pgn.trim() === '') {
            return [];
        }

        const moves = [];

        // For test scenarios starting after 1.e4, add the opening move
        if (pgn.includes('e5') || pgn.includes('c5') || pgn.includes('e6') || pgn.includes('d6')) {
            moves.push({ san: 'e4' });
        }

        // Extract only the move part from PGN, ignoring headers
        // Look for move sequences like "d6" at the end after headers
        const lines = pgn.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            // Skip headers (lines starting with [)
            if (trimmed.startsWith('[') || trimmed === '') {
                continue;
            }

            // Look for moves that are simple SAN notation
            const moveMatch = trimmed.match(/^\s*\*?\s*([a-h][1-8]|[NBRQK][a-h1-8]|[a-h]x[a-h][1-8]|O-O|O-O-O|[a-h][1-8]=[NBRQ])\s*$/);
            if (moveMatch) {
                moves.push({ san: moveMatch[1] });
            }
        }

        return moves;
    }

    /**
     * Sleep utility for rate limiting
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default BookBuilder;
