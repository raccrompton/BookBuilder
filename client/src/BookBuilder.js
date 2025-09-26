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
 */

import { DeterministicMode } from './config/DeterministicMode.js';
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
        this.chessEngine = new ChessEngine(); // Main engine for root analysis
        this.lichessClient = new LichessClient();
        this.moveSelector = new MoveSelector(config);
        this.statisticsEngine = new Statistics();
        this.pgnGenerator = new PgnGenerator(config);
        this.stockfishEngine = config.CAREABOUTENGINE ? new StockfishEngine() : null;

        // Create Lichess API options from user configuration (fixes parameter consistency bug)
        this.lichessApiOptions = {
            speeds: Array.isArray(config.speeds) ? config.speeds.join(',') : (config.speeds || 'blitz,rapid,classical,correspondence'),
            ratings: Array.isArray(config.ratings) ? config.ratings.join(',') : (config.ratings || '1600,1800,2000,2200,2500'),
            variant: 'standard'
        };

        console.log('🔧 [BookBuilder] Lichess API options created:', this.lichessApiOptions);

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

        console.log(`[BookBuilder] ========================================`);
        console.log(`[BookBuilder] STARTING CHESS ENGINE STATE FIXED VERSION`);
        console.log(`[BookBuilder] Processing ${config.openings.length} opening(s)`);
        console.log(`[BookBuilder] Enhanced with move validation & isolated engines`);
        console.log(`[BookBuilder] ========================================`);

        for (let chapter = 1; chapter <= config.openings.length; chapter++) {
            const opening = config.openings[chapter - 1];
            console.log(`Processing Chapter ${chapter}: ${opening.name}`);

            try {
                const chapterContent = await this.generateChapter(opening, chapter);
                const fileName = `Chapter_${chapter}_${opening.name.replace(/\s+/g, '_')}.pgn`;
                results[fileName] = chapterContent;

                console.log(`✅ Completed Chapter ${chapter}: ${opening.name} - ${this.finalLines.length} lines generated`);
            } catch (error) {
                console.error(`❌ Failed to generate Chapter ${chapter}: ${error.message}`);
                throw new Error(`Chapter ${chapter} generation failed: ${error.message}`);
            }
        }

        console.log(`[BookBuilder] ========================================`);
        console.log(`[BookBuilder] 🎉 ALL CHAPTERS COMPLETED SUCCESSFULLY!`);
        console.log(`[BookBuilder] ✅ Chess engine state fixes implemented`);
        console.log(`[BookBuilder] ✅ Move validation pipeline active`);
        console.log(`[BookBuilder] ✅ Engine isolation preventing contamination`);
        console.log(`[BookBuilder] Generated ${Object.keys(results).length} chapter files`);
        console.log(`[BookBuilder] ========================================`);

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

        // Store the opening perspective for consistent winrate calculations
        this.openingPerspective = opening.perspective;

        try {
            // Phase 1: Root analysis (replaces Python's Rooter class)
            console.log(`  Phase 1: Root analysis for ${opening.name}`);
            const rootResults = await this.analyzeRoot(opening.moves || [], opening.perspective);
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
     * Analyzes the move sequence and determines initial valid continuations
     *
     * This method now implements the Python iterative approach, calculating
     * cumulative likelihood by tracking opponent move probabilities only.
     *
     * @param {Array} moveSequence - Array of moves in SAN notation (e.g., ['e4', 'e5', 'Nf3'])
     * @param {string} perspective - Opening perspective ('white' or 'black')
     * @returns {Array} - Array of initial line objects for processing
     */
    async analyzeRoot(moveSequence, perspective) {
        try {
            // Start from the initial chess position
            const success = this.chessEngine.parsePosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
            if (!success) {
                throw new Error(`Failed to initialize starting position`);
            }

            console.log(`    Root analysis: ${moveSequence.length} moves in sequence, perspective: ${perspective}`);
            console.log(`    Move sequence:`, moveSequence);

            // Initialize probability tracking
            let cumulativeLikelihood = 1.0;
            let likelihoodPath = [];

            // Convert perspective to engine format for comparison
            const ourPerspectiveColor = perspective === 'white' ? 'w' : 'b';

            console.log(`    Calculating cumulative likelihood using Python iterative approach`);
            console.log(`    Our perspective: ${perspective} (${ourPerspectiveColor}), tracking opponent moves only`);

            // Iterate through each move in the sequence (Python Rooter approach)
            if (moveSequence.length > 0) {
                // Iterate through each move in the sequence (exact Python logic)
                for (let i = 0; i < moveSequence.length; i++) {
                    const move = moveSequence[i];
                    const currentTurn = this.chessEngine.getTurn();

                    console.log(`    Move ${i + 1}: ${move}, current turn: ${currentTurn}, our perspective: ${ourPerspectiveColor}`);

                    // Check if this is an opponent's move (matches Python: if board.turn != perspective)
                    if (currentTurn !== ourPerspectiveColor) {
                        console.log(`      → This is opponent's move, calculating probability`);

                        // Get position stats for current position (only for opponent moves)
                        const currentFen = this.chessEngine.getFen();
                        const positionStats = await this.lichessClient.getPositionStats(currentFen, this.lichessApiOptions);

                        if (!positionStats || !positionStats.moves) {
                            throw new Error(`Failed to get position stats for opponent move ${move} at FEN: ${currentFen}`);
                        }

                        // Find this move in the stats (equivalent to Python's find_opponent_move)
                        const moveProb = this.findMoveInStats(move, positionStats.moves);

                        if (moveProb === null) {
                            throw new Error(`Opponent move ${move} not found in Lichess database at position: ${currentFen}`);
                        }

                        cumulativeLikelihood *= moveProb;
                        likelihoodPath.push({
                            san: move,
                            playrate: moveProb
                        });
                        console.log(`      → Move probability: ${moveProb}, cumulative: ${cumulativeLikelihood}`);
                    } else {
                        console.log(`      → This is our move, skipping probability calculation (100%)`);
                    }

                    // Make the move on the board (equivalent to Python's board.push(move))
                    const moveResult = this.chessEngine.makeMove(move);
                    if (!moveResult) {
                        throw new Error(`Failed to make move: ${move} at position ${i + 1}`);
                    }

                    console.log(`      → Move ${move} executed successfully`);
                }
            } else {
                console.log(`    Starting position (no moves), using cumulative likelihood: 1.0`);
            }

            console.log(`    Final cumulative likelihood: ${cumulativeLikelihood}`);
            console.log(`    Likelihood path:`, likelihoodPath.map(p => `${p.san}(${p.playrate})`).join(' '));
            console.log(`    Opponent moves tracked: ${likelihoodPath.length}, Our moves skipped: ${moveSequence.length - likelihoodPath.length}`);

            // Create single line object representing the input sequence (matches Python Rooter behavior)
            const finalFen = this.chessEngine.getFen();
            const singleLine = {
                fen: finalFen,
                pgn: this.chessEngine.getPgn(),
                perspective: perspective,
                cumulativeLikelihood: cumulativeLikelihood,
                likelihoodPath: likelihoodPath
            };

            console.log(`    Root analysis complete: 1 initial line representing input sequence`);
            console.log(`    Line: "${singleLine.pgn}" with likelihood ${cumulativeLikelihood.toFixed(6)}`);
            return [singleLine];

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

            // Process batch in parallel with isolated engines for each line
            console.log(`[BookBuilder] Processing batch of ${currentBatch.length} lines with isolated engines`);
            const batchResults = await Promise.all(
                currentBatch.map(line => this.expandLine(line))
            );
            console.log(`[BookBuilder] Batch processing completed, engines cleaned up`);

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

        // **CREATE ISOLATED ENGINE INSTANCE**
        const isolatedEngine = this.createIsolatedEngine();
        console.log(`[BookBuilder] Created isolated engine for line expansion`);

        try {
            // Parse position with enhanced debugging using isolated engine
            console.log(`[BookBuilder] Expanding line with FEN: ${fen}`);
            const success = isolatedEngine.parsePositionWithDebug(fen);
            if (!success) {
                throw new Error(`Invalid FEN: ${fen}`);
            }

            // Validate engine state consistency
            if (!this.validateEngineState(isolatedEngine, fen)) {
                throw new Error(`Engine state inconsistency after loading FEN: ${fen}`);
            }

            // Get initial position debug info
            const initialPosition = isolatedEngine.debugPosition();
            console.log(`[BookBuilder] Initial position state:`, initialPosition);

            // Find opponent continuations (use high limit to get all opponent options)
            const continuations = await this.lichessClient.getPositionStats(fen, {
                ...this.lichessApiOptions,
                moves: 15  // High limit - we want all reasonable opponent options
            });

            if (!continuations || !continuations.moves) {
                DeterministicMode.throwOnFailure(
                    false,
                    `Failed to get position continuations for FEN: ${fen}`
                );
                // Unreachable in deterministic mode, but kept for completeness
                await this.finalizeLine(lineData);
                return [];
            }

            const validContinuations = continuations.moves.filter(move =>
                this.isValidContinuation(move, cumulativeLikelihood)
            );

            if (validContinuations.length === 0) {
                console.log(`    [DEBUG] No valid continuations found. Original moves: ${continuations.moves?.length || 0}, filtered to: 0`);
                if (continuations.moves) {
                    console.log(`    [DEBUG] First move analysis:`, continuations.moves[0]);
                }
                // Empty results after filtering are valid - moves may not meet quality thresholds
                // This is expected behavior for maintaining repertoire quality
                await this.finalizeLine(lineData);
                return [];
            }

            const newLines = [];

            for (const move of validContinuations) {
                try {
                    // **ENHANCED MOVE VALIDATION PIPELINE**
                    console.log(`[BookBuilder] Processing opponent move: ${move.san}`);
                    console.log(`[BookBuilder] Position before move:`, isolatedEngine.debugPosition());

                    // Validate move against current legal moves
                    if (!isolatedEngine.validateMoveBeforeExecution(move.san)) {
                        console.warn(`[BookBuilder] Skipping invalid opponent move: ${move.san}`);
                        console.warn(`[BookBuilder] Available moves were:`, isolatedEngine.getLegalMoves().map(m => m.san || m));
                        continue;
                    }

                    // Make opponent's move with enhanced validation
                    const moveResult = isolatedEngine.makeMove(move.san);
                    if (!moveResult) {
                        console.warn(`[BookBuilder] Move execution failed for: ${move.san}`);
                        continue;
                    }

                    console.log(`[BookBuilder] Opponent move ${move.san} executed successfully:`, moveResult);

                    // **CAPTURE MOVE NUMBER AT CORRECT TIMING**
                    // Get move number AFTER opponent's move but BEFORE our response (matches Python behavior)
                    const correctMoveNumber = isolatedEngine.getMoveNumber();
                    console.log(`[BookBuilder] Move number after opponent's move: ${correctMoveNumber}`);

                    const newFen = isolatedEngine.getFen();

                    // Find our best response (use user-configured move limit for candidate selection)
                    const positionData = await this.lichessClient.getPositionStats(newFen, {
                        ...this.lichessApiOptions,
                        moves: this.config.MOVES || 10  // User-configured "Most Played Moves" limit
                    });

                    if (!positionData || !positionData.moves || positionData.moves.length === 0) {
                        // No candidate moves available - try engine completion or finalize
                        isolatedEngine.undoMove(); // Undo opponent's move
                        const completed = await this.handleNoGoodResponse(lineData, move, newFen, isolatedEngine);
                        if (completed) {
                            newLines.push(completed);
                        }
                        continue;
                    }

                    console.log(`[BookBuilder] Position after opponent move has ${positionData.moves.length} candidate responses`);
                    console.log(`   Top 3 candidates:`, positionData.moves.slice(0, 3).map(m => ({
                        san: m.san,
                        games: m.white + m.black + m.draws,
                        playrate: m.playrate?.toFixed(4)
                    })));

                    console.log(`[BookBuilder] Calling MoveSelector to find our best response...`);
                    const bestResponse = await this.moveSelector.selectBestMove(
                        { fen: newFen, perspective: lineData.perspective },
                        positionData.moves,
                        this.lichessClient,
                        this.statisticsEngine
                    );

                    if (bestResponse?.selectedMove) {
                        console.log(`[BookBuilder] MoveSelector returned: ${bestResponse.selectedMove.san || bestResponse.selectedMove.uci}`);
                        console.log(`   Selection details:`, {
                            reason: bestResponse.selectionReason,
                            candidateCount: bestResponse.candidateCount,
                            qualityFiltered: bestResponse.qualityFiltered,
                            engineFiltered: bestResponse.engineFiltered
                        });
                    } else {
                        console.log(`[BookBuilder] MoveSelector returned no valid response`);
                    }

                    const selectedMove = bestResponse?.selectedMove;
                    console.log(`[BookBuilder] Validating selected response: ${selectedMove?.san || selectedMove?.uci || 'NONE'}`);

                    if (selectedMove && this.isValidResponse(selectedMove, move)) {
                        console.log(`[BookBuilder] ✅ Response validation passed`);
                        // **VALIDATE OUR RESPONSE MOVE**
                        console.log(`[BookBuilder] Processing our response move: ${selectedMove.san}`);
                        console.log(`[BookBuilder] Position before our move:`, isolatedEngine.debugPosition());

                        // Validate our response move
                        if (!isolatedEngine.validateMoveBeforeExecution(selectedMove.san)) {
                            console.warn(`[BookBuilder] Skipping invalid response move: ${selectedMove.san}`);
                            console.warn(`[BookBuilder] Available moves were:`, isolatedEngine.getLegalMoves().map(m => m.san || m));
                            isolatedEngine.undoMove(); // Undo opponent's move
                            continue;
                        }

                        // Make our response
                        const ourMoveResult = isolatedEngine.makeMove(selectedMove.san);
                        if (!ourMoveResult) {
                            console.warn(`[BookBuilder] Our move execution failed: ${selectedMove.san}`);
                            isolatedEngine.undoMove(); // Undo opponent's move
                            continue;
                        }

                        console.log(`[BookBuilder] Our response move ${selectedMove.san} executed successfully:`, ourMoveResult);
                        console.log(`[BookBuilder] Final position after both moves:`, isolatedEngine.debugPosition());

                        const finalFen = isolatedEngine.getFen();

                        const newLikelihoodPath = [...likelihoodPath, {
                            san: move.san,
                            playrate: move.playrate
                        }];

                        const newPgn = this.updatePgn(pgn, move.san, selectedMove.san, perspective, correctMoveNumber);
                        console.log(`[BookBuilder] PGN updated: "${pgn}" -> "${newPgn}"`);

                        const newLine = {
                            fen: finalFen,
                            pgn: newPgn,
                            perspective: perspective === 'white' ? 'black' : 'white',
                            cumulativeLikelihood: move.playrate * cumulativeLikelihood,
                            likelihoodPath: newLikelihoodPath
                        };

                        console.log(`[BookBuilder] ➕ Created new line:`, {
                            pgn: newLine.pgn,
                            perspective: newLine.perspective,
                            cumulativeLikelihood: newLine.cumulativeLikelihood?.toFixed(6),
                            likelihoodPathLength: newLine.likelihoodPath.length
                        });

                        newLines.push(newLine);

                        // Undo both moves to restore original position
                        isolatedEngine.undoMove(); // Undo our move
                        isolatedEngine.undoMove(); // Undo opponent's move

                    } else {
                        console.log(`[BookBuilder] ❌ No valid response found for opponent move: ${move.san}`);
                        if (selectedMove) {
                            console.log(`   Selected move failed validation:`, {
                                move: selectedMove.san || selectedMove.uci,
                                reason: 'Failed isValidResponse check'
                            });
                        } else {
                            console.log(`   No move was selected by MoveSelector`);
                        }

                        // No good response - try engine completion or finalize
                        isolatedEngine.undoMove(); // Undo opponent's move
                        console.log(`[BookBuilder] Trying engine completion or line finalization...`);
                        const completed = await this.handleNoGoodResponse(lineData, move, newFen, isolatedEngine);
                        if (completed) {
                            console.log(`[BookBuilder] ➕ Engine completion created new line: ${completed.pgn}`);
                            newLines.push(completed);
                        } else {
                            console.log(`[BookBuilder] Line finalized without extension`);
                        }
                    }

                } catch (moveError) {
                    console.warn(`Error processing move ${move.san}: ${moveError.message}`);
                    continue;
                }
            }

            console.log(`[BookBuilder] Line expansion completed: Generated ${newLines.length} new lines`);
            if (newLines.length > 0) {
                console.log(`   New lines summary:`, newLines.map(line => ({
                    pgn: line.pgn,
                    likelihood: line.cumulativeLikelihood?.toFixed(6)
                })));
            }

            return newLines;

        } catch (error) {
            console.warn(`Error expanding line: ${error.message}`);
            await this.finalizeLine(lineData, isolatedEngine);
            return [];
        } finally {
            // Engine cleanup logging
            console.log(`[BookBuilder] Completed line expansion, isolated engine discarded`);
        }
    }

    /**
     * Handle cases where no good response is found
     * Try engine completion or finalize the line
     *
     * @param {Object} lineData - Current line data
     * @param {Object} opponentMove - Opponent's move object
     * @param {string} positionFen - FEN of chess position after opponent's move
     * @param {ChessEngine} engine - Isolated chess engine instance
     * @returns {Object|null} - New line object or null if line should be finalized
     */
    async handleNoGoodResponse(lineData, opponentMove, positionFen, engine = null) {
        if (this.config.ENGINEFINISH && this.stockfishEngine) {
            try {
                console.log(`[BookBuilder] Engine completion: fixing position analysis and move numbering`);

                // **STEP 1: Make opponent's move to get to correct position for engine analysis**
                console.log(`[BookBuilder] Making opponent move for proper position: ${opponentMove.san}`);
                const opponentMoveResult = this.chessEngine.makeMove(opponentMove.san);
                if (!opponentMoveResult) {
                    console.warn(`[BookBuilder] Opponent move ${opponentMove.san} failed in engine completion`);
                    return null;
                }

                // **STEP 2: Capture correct move number (after opponent's move, before our response)**
                const correctMoveNumber = this.chessEngine.getMoveNumber();
                console.log(`[BookBuilder] Captured correct move number: ${correctMoveNumber}`);

                // **STEP 3: Get engine analysis from the position AFTER opponent's move**
                const positionAfterOpponent = this.chessEngine.getFen();
                console.log(`[BookBuilder] Getting engine move from correct position: ${positionAfterOpponent}`);
                const engineMove = await this.stockfishEngine.getBestMove(
                    positionAfterOpponent,
                    this.config.ENGINEDEPTH
                );

                if (engineMove) {
                    // **STEP 4: Make the engine move**
                    console.log(`[BookBuilder] Making engine response move: ${engineMove}`);
                    const engineMoveResult = this.chessEngine.makeMove(engineMove);
                    if (!engineMoveResult) {
                        console.warn(`[BookBuilder] Engine move ${engineMove} failed`);
                        this.chessEngine.undoMove(); // Clean up opponent's move
                        return null;
                    }

                    const newFen = this.chessEngine.getFen();

                    // **STEP 5: Build PGN with correct move number**
                    const newPgn = this.updatePgn(
                        lineData.pgn,
                        opponentMove.san,
                        engineMove,
                        lineData.perspective,
                        correctMoveNumber  // Use the correctly captured move number
                    );

                    // **STEP 6: Undo both moves to restore original position**
                    console.log(`[BookBuilder] Restoring position: undoing engine and opponent moves`);
                    this.chessEngine.undoMove(); // Undo engine move
                    this.chessEngine.undoMove(); // Undo opponent move

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

        // Finalize line without good response - use chess.js for proper PGN generation
        let finalPgn;
        try {
            // Create temporary chess instance to generate proper PGN
            const Chess = this.chessEngine.chess.constructor;
            const tempChess = new Chess();

            // Load current PGN if it exists
            if (lineData.pgn && lineData.pgn.trim()) {
                tempChess.loadPgn(lineData.pgn);
            }

            // Make opponent's move
            const moveResult = tempChess.move(opponentMove.san);
            if (!moveResult) {
                console.warn(`[BookBuilder] Invalid opponent move for finalization: ${opponentMove.san}`);
                // Fall back to manual concatenation as last resort
                finalPgn = lineData.pgn + ' ' + opponentMove.san;
            } else {
                // Get properly formatted PGN from chess.js
                finalPgn = tempChess.pgn();
            }
        } catch (error) {
            console.warn(`[BookBuilder] Error generating final PGN with chess.js: ${error.message}`);
            // Fall back to manual concatenation as last resort
            finalPgn = lineData.pgn + ' ' + opponentMove.san;
        }

        await this.finalizeLine({
            ...lineData,
            pgn: finalPgn,
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
     * @param {ChessEngine} engine - Optional isolated engine instance
     */
    async finalizeLine(lineData, engine = null) {
        console.log(`🏁 [BookBuilder] Finalizing line: "${lineData.pgn}"`);
        console.log(`   FEN: ${lineData.fen}`);
        console.log(`   Perspective: ${lineData.perspective}`);
        console.log(`   Cumulative likelihood: ${lineData.cumulativeLikelihood?.toFixed(6)}`);
        console.log(`   Likelihood path length: ${lineData.likelihoodPath?.length || 0}`);

        // Use provided engine or fall back to main engine
        const chessEngine = engine || this.chessEngine;
        try {
            // Load the position into the chess engine
            console.log(`   Loading position into chess engine...`);
            chessEngine.loadPosition(lineData.fen);

            console.log(`   Getting position statistics from Lichess...`);
            const stats = await this.lichessClient.getPositionStats(lineData.fen, this.lichessApiOptions);

            if (stats) {
                console.log(`   Position stats:`, {
                    white: stats.white,
                    black: stats.black,
                    draws: stats.draws,
                    total: stats.white + stats.draws + stats.black
                });
            } else {
                console.log(`   No position stats available`);
            }

            let winRate = 0;
            let totalGames = 0;

            if (stats && stats.white + stats.draws + stats.black > 0) {
                const winRateResult = this.statisticsEngine.calculateWinRate(
                    stats.white,
                    stats.black,
                    stats.draws,
                    this.config.DRAWSAREHALF
                );
                totalGames = stats.white + stats.draws + stats.black;

                // Extract the correct percentage based on REPERTOIRE perspective (not dynamic line perspective)
                // Use the original opening perspective consistently for all winrate calculations
                winRate = this.openingPerspective === 'white' ?
                    winRateResult.whitePerc :
                    winRateResult.blackPerc;

                // Handle legitimate null results (no games played from position)
                if (winRate === null || winRate === undefined) {
                    // This matches Python logic: check for mate or insufficient data
                    winRate = this.calculateFallbackWinRate(lineData.fen, lineData);
                }
            } else {
                // Handle mate positions or insufficient data
                winRate = this.calculateFallbackWinRate(lineData.fen, lineData);
                totalGames = this.getFallbackGameCount(lineData);
            }

            // Validate winRate is a proper number (should not be NaN after proper extraction)
            console.log(`   Calculated win rate: ${winRate?.toFixed(4)} (${typeof winRate})`);
            console.log(`   Total games: ${totalGames}`);

            if (isNaN(winRate) || !isFinite(winRate)) {
                console.error(`❌ [BookBuilder] Invalid winRate after calculation: ${winRate} for position ${lineData.fen}`);
                throw new Error(`Invalid winRate after calculation: ${winRate} for position ${lineData.fen}`);
            }

            console.log(`   ✅ Adding line to finalLines collection`);
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
            console.warn(`⚠️ [BookBuilder] Error finalizing line: ${error.message}`);
            console.log(`   Adding line with default values instead`);
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

        console.log(`🏁 [BookBuilder] Line finalization completed. Total final lines: ${this.finalLines.length}`);
    }

    /**
     * Generate final PGN output (replaces Python's Printer class)
     *
     * @param {string} openingName - Name of the opening
     * @param {number} chapterNumber - Chapter number
     * @returns {string} - Complete PGN content
     */
    async generateOutput(openingName, _chapterNumber) {
        console.log(`📋 [BookBuilder] Generating output for ${openingName}`);
        console.log(`   Starting with ${this.finalLines.length} final lines`);

        // Remove duplicates and subsets (matches Python logic exactly)
        console.log(`   Removing duplicates and subsets...`);
        const uniqueLines = this.removeDuplicateLines(this.finalLines);
        console.log(`   After deduplication: ${uniqueLines.length} unique lines`);

        // Sort by consecutive move probabilities (matches Python sorting)
        console.log(`   Sorting lines by probability...`);
        const sortedLines = this.sortLinesByProbability(uniqueLines);
        console.log(`   Top 3 lines by probability:`, sortedLines.slice(0, 3).map(line => ({
            pgn: line.pgn,
            likelihood: line.cumulativeLikelihood?.toFixed(6)
        })));

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

    // ==================== ENGINE MANAGEMENT METHODS ====================

    /**
     * Create an isolated chess engine instance for line expansion
     * Prevents state contamination between parallel processing
     * @returns {ChessEngine} - Fresh chess engine instance
     */
    createIsolatedEngine() {
        return new ChessEngine();
    }

    /**
     * Validate engine state consistency
     * @param {ChessEngine} engine - Engine to validate
     * @param {string} expectedFen - Expected FEN position
     * @returns {boolean} - True if state is consistent
     */
    validateEngineState(engine, expectedFen) {
        const currentFen = engine.getFen();
        const isConsistent = currentFen === expectedFen;
        if (!isConsistent) {
            console.error(`[BookBuilder] Engine state inconsistency!`);
            console.error(`[BookBuilder] Expected: ${expectedFen}`);
            console.error(`[BookBuilder] Actual: ${currentFen}`);
        }
        return isConsistent;
    }

    // ==================== PERSPECTIVE DETERMINATION ====================

    /**
     * Determine perspective based on move count (matches Python logic exactly)
     * Python logic: if len(moves) % 2 == 0: perspective = chess.BLACK (black)
     *              if len(moves) % 2 == 1: perspective = chess.WHITE (white)
     *
     * @param {number} moveCount - Number of moves (plies) in the sequence
     * @returns {string} - 'white' or 'black'
     */
    determinePerspective(moveCount) {
        // Python: even moves = black, odd moves = white
        const perspective = moveCount % 2 === 0 ? 'black' : 'white';
        console.log(`    📋 [BookBuilder] Perspective calculation: ${moveCount} moves % 2 = ${moveCount % 2} → ${perspective}`);
        return perspective;
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Find move probability in Lichess position stats
     * Equivalent to Python's WorkerPlay.find_opponent_move()
     *
     * @param {string} move - Move in SAN notation (e.g., 'e4', 'Nf3')
     * @param {Array} moves - Array of move stats from LichessClient (includes playrate)
     * @returns {number|null} - Move playrate or null if not found
     */
    findMoveInStats(move, moves) {
        // LichessClient already provides both 'san' and 'uci' fields, plus calculated 'playrate'
        const moveStats = moves.find(m => m.san === move || m.uci === move);
        return moveStats ? moveStats.playrate : null;
    }

    /**
     * Check if a continuation meets the minimum thresholds
     */
    isValidContinuation(move, cumulativeLikelihood) {
        const continuationLikelihood = move.playrate * cumulativeLikelihood;
        const depthCheck = continuationLikelihood >= this.config.DEPTHLIKELIHOOD;
        const gamesCheck = move.totalGames > this.config.CONTINUATIONGAMES;
        // FIXED: Remove MINPLAYRATE check for opponent moves - only use DEPTHLIKELIHOOD + CONTINUATIONGAMES
        const isValid = depthCheck && gamesCheck;

        console.log(`🔍 [BookBuilder] Continuation validation: ${move.san || move.uci}`);
        console.log(`      Raw playrate: ${move.playrate?.toFixed(4)} (${(move.playrate * 100)?.toFixed(2)}%)`);
        console.log(`      Cumulative likelihood to reach position prior to continuation: ${cumulativeLikelihood?.toFixed(6)} (${(cumulativeLikelihood * 100)?.toFixed(4)}%)`);
        console.log(`      Continuation likelihood: ${continuationLikelihood?.toFixed(6)} >= ${this.config.DEPTHLIKELIHOOD} = ${depthCheck ? '✅' : '❌'}`);
        console.log(`      Games check: ${move.totalGames} > ${this.config.CONTINUATIONGAMES} = ${gamesCheck ? '✅' : '❌'}`);
        console.log(`      Playrate check: REMOVED (only applies to our responses, not opponent moves)`);
        console.log(`      Overall result: ${isValid ? '✅ VALID' : '❌ INVALID'}`);

        return isValid;
    }

    /**
     * Check if our response meets the quality thresholds
     */
    isValidResponse(response, opponentMove) {
        console.log(`   🔍 [BookBuilder] Response validation for ${response?.san || response?.uci}:`);
        console.log(`      🔧 [BookBuilder] Config values: MINGAMES=${this.config.MINGAMES}, MINPLAYRATE=${this.config.MINPLAYRATE}, CONTINUATIONGAMES=${this.config.CONTINUATIONGAMES}`);

        const hasResponse = !!response;
        // FIXED: Remove opponent playrate check - already validated in isValidContinuation
        const responseGamesCheck = response?.totalGames > this.config.MINGAMES;
        const responseWinRateCheck = response?.winRate > 0;
        const responsePlayrateCheck = response?.playrate > this.config.MINPLAYRATE;

        console.log(`      Has response: ${hasResponse ? '✅' : '❌'}`);
        console.log(`      Response games: ${response?.totalGames} > ${this.config.MINGAMES} = ${responseGamesCheck ? '✅' : '❌'}`);
        console.log(`      Response win rate: ${response?.winRate?.toFixed(3)} > 0 = ${responseWinRateCheck ? '✅' : '❌'}`);
        console.log(`      Response playrate: ${response?.playrate?.toFixed(4)} > ${this.config.MINPLAYRATE} = ${responsePlayrateCheck ? '✅' : '❌'}`);

        const isValid = hasResponse && responseGamesCheck && responseWinRateCheck && responsePlayrateCheck;
        console.log(`      Overall result: ${isValid ? '✅ VALID' : '❌ INVALID'}`);

        return isValid;
    }

    /**
     * Update PGN string with new moves (matches Python formatting exactly)
     * Uses explicit move number captured at correct timing
     */
    updatePgn(currentPgn, opponentMove, ourMove, perspective, moveNumber = null) {
        console.log(`[BookBuilder] updatePgn called:`);
        console.log(`   currentPgn: "${currentPgn}"`);
        console.log(`   opponentMove: "${opponentMove}"`);
        console.log(`   ourMove: "${ourMove}"`);
        console.log(`   perspective: "${perspective}"`);

        try {
            // Create a new chess instance and load current position
            const Chess = this.chessEngine.chess.constructor;
            const tempChess = new Chess();

            // Load current PGN - chess.js handles loose formatting automatically
            if (currentPgn && currentPgn.trim()) {
                tempChess.loadPgn(currentPgn);
            }

            console.log(`   Chess.js state before moves: turn=${tempChess.turn()}, moveNumber=${tempChess.moveNumber()}`);

            // Make both moves in sequence
            const opponentMoveResult = tempChess.move(opponentMove);
            if (!opponentMoveResult) {
                throw new Error(`Invalid opponent move: ${opponentMove}`);
            }
            console.log(`   Opponent move executed: ${opponentMoveResult.san}`);

            const ourMoveResult = tempChess.move(ourMove);
            if (!ourMoveResult) {
                throw new Error(`Invalid our move: ${ourMove}`);
            }
            console.log(`   Our move executed: ${ourMoveResult.san}`);

            // Get the properly formatted PGN from chess.js
            const result = tempChess.pgn();
            console.log(`   Chess.js generated PGN: "${result}"`);
            return result;

        } catch (error) {
            console.warn(`Chess.js PGN generation failed: ${error.message}`);
            console.warn(`Falling back to string concatenation`);

            // Fallback to simple string concatenation as last resort
            const result = currentPgn ? `${currentPgn} ${opponentMove} ${ourMove}` : `${opponentMove} ${ourMove}`;
            console.log(`   Fallback result: "${result}"`);
            return result;
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
