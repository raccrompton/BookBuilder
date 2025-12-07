/**
 * =============================================================================
 * MoveSelector.js - Move Selection Algorithm for BookBuilder
 * =============================================================================
 *
 * PURPOSE:
 * This class is the "brain" that decides which chess move to recommend in the
 * repertoire. Given a list of candidate moves (from the Lichess database),
 * it picks the best one using a combination of:
 *
 * 1. DATA QUALITY FILTERING: Remove moves with too few games (unreliable stats)
 * 2. ENGINE VALIDATION: Optionally check that moves aren't tactically bad
 * 3. STATISTICAL SELECTION: Pick the move with the best win rate confidence
 *
 * THE SELECTION PROBLEM:
 * How do you pick a chess move? There are competing factors:
 * - Popular moves: Played often, lots of data, but might be "safe" not "best"
 * - High win rate: Looks good, but might have few games (unreliable)
 * - Engine-approved: Computer says it's good, but might be unpractical for humans
 *
 * OUR APPROACH (matches Python legacy system):
 * 1. Filter out moves with poor data quality (too few games, too low play rate)
 * 2. If engine validation is enabled, filter out tactically unsound moves
 * 3. Among remaining moves, pick the one with the best "lower bound" win rate
 *    (Using confidence intervals - see Statistics.js for explanation)
 *
 * KEY CONCEPTS:
 * - SOUNDNESS LIMIT: Maximum allowed "centipawn loss" from the best move
 *   If engine says e4 is +50 and d4 is +20, d4 has 30 centipawn loss
 *   (100 centipawns = 1 pawn advantage in chess evaluation)
 *
 * - CONFIDENCE INTERVAL: Statistical range where the true win rate likely falls
 *   With few games, we're less confident, so the "lower bound" is lower
 *   This naturally prefers moves with more games (more confidence)
 *
 * DEPENDENCIES:
 * - DeterministicMode: For testing with reproducible results
 *
 * EXAMPLE USAGE:
 * ```javascript
 * const selector = new MoveSelector({ MINGAMES: 50, CAREABOUTENGINE: 1 });
 * const result = await selector.selectBestMove(
 *   { fen: '...', perspective: 'white' },
 *   candidateMoves,
 *   stockfishEngine,
 *   statisticsEngine
 * );
 * console.log(result.selectedMove.san);  // 'e4'
 * ```
 * =============================================================================
 */

// DeterministicMode: Used for testing to get reproducible results
// (Not actively used in current code but imported for future use)
import { DeterministicMode } from '../config/DeterministicMode.js';

// Logger: Configurable logging system - can be toggled on/off per category
// Use Logger.setEnabled('MoveSelector', true/false) in browser console to toggle
import Logger from '../utils/Logger.js';
const log = Logger.get('MoveSelector');

/**
 * MoveSelector Class - Picks the best move from candidates
 */
class MoveSelector {
    /**
     * Constructor - Initialize the move selector with configuration
     *
     * @param {Object} config - Configuration object with selection parameters
     *   @param {number} config.CAREABOUTENGINE - 1 to use engine validation, 0 to skip
     *   @param {number} config.SOUNDNESSLIMIT - Max centipawn loss allowed (negative = stricter)
     *   @param {number} config.LOSSLIMIT - Secondary loss threshold
     *   @param {number} config.IGNORELOSSLIMIT - Eval threshold above which loss limit is ignored
     *   @param {number} config.MINPLAYRATE - Minimum play rate for move consideration (0-1)
     *   @param {number} config.MINGAMES - Minimum games required for statistical significance
     *   @param {number} config.ALPHA - Confidence level for statistical intervals (e.g., 0.05 = 95%)
     */
    constructor(config = {}) {
        // Merge provided config with defaults
        // The spread operator (...config) at the end ensures user values override defaults
        this.config = {
            // ENGINE VALIDATION SETTINGS
            // ---------------------------
            CAREABOUTENGINE: config.CAREABOUTENGINE || 1,  // 1 = validate with engine, 0 = skip

            // Maximum allowed centipawn loss from best move
            // -99 means moves can be up to 99 centipawns worse than engine's best
            // Negative value is used because we compare: if (loss > Math.abs(SOUNDNESSLIMIT))
            SOUNDNESSLIMIT: config.SOUNDNESSLIMIT || -99,

            // Secondary loss limit (for moves that aren't the engine's best)
            LOSSLIMIT: config.LOSSLIMIT || -99,

            // Evaluation threshold where LOSSLIMIT is ignored
            // If position eval > 300 centipawns, we're winning so much that small losses don't matter
            IGNORELOSSLIMIT: config.IGNORELOSSLIMIT || 300,

            // DATA QUALITY THRESHOLDS
            // -----------------------
            // Minimum play rate (as decimal, not percentage)
            // 0.001 = 0.1% of games at this position must play this move
            MINPLAYRATE: config.MINPLAYRATE || 0.001,

            // Minimum number of games for statistical significance
            // With fewer games, win rate statistics are unreliable
            MINGAMES: config.MINGAMES || 19,

            // STATISTICAL SELECTION SETTINGS
            // ------------------------------
            // Alpha for confidence interval (0.001 = 99.9% confidence)
            // Lower alpha = wider confidence interval = more conservative
            ALPHA: config.ALPHA || 0.001,

            // Include all other config properties passed by user
            ...config
        };
    }

    /**
     * =========================================================================
     * SELECT BEST MOVE - Main entry point for move selection
     * =========================================================================
     *
     * WHAT THIS METHOD DOES:
     * This is the main method that picks the best move from a list of candidates.
     * It runs through a pipeline of filters:
     *
     * STEP 1: DATA QUALITY FILTER
     * Remove moves with too few games or too low play rate.
     * Moves with sparse data have unreliable statistics.
     *
     * STEP 2: ENGINE VALIDATION (optional)
     * If CAREABOUTENGINE=1, ask Stockfish to evaluate moves.
     * Remove moves that are tactically unsound (too much centipawn loss).
     *
     * STEP 3: STATISTICAL SELECTION
     * Among remaining moves, pick the one with the highest "lower bound"
     * win rate from confidence interval analysis.
     *
     * @param {Object} position - Current chess position
     *   @param {string} position.fen - Position in FEN notation
     *   @param {string} position.perspective - 'white' or 'black' (whose repertoire)
     *
     * @param {Array} candidates - Array of candidate move objects from Lichess
     *   Each candidate has: {san, uci, white, black, draws, playrate, totalGames}
     *
     * @param {Object} engineClient - Stockfish engine instance (or null to skip engine)
     *   Should have methods: getBestMove(), analyzeMove(), evaluatePosition()
     *
     * @param {Object} statisticsEngine - Statistics calculation utility
     *   Should have methods: calculateWinRate(), calculateConfidenceInterval()
     *
     * @returns {Promise<Object>} Selection result containing:
     *   - selectedMove: The chosen move object with added statistics
     *   - engineAnalysis: Engine evaluation data (if used)
     *   - candidateCount: Original number of candidates
     *   - qualityFiltered: How many moves failed data quality check
     *   - engineFiltered: How many moves failed engine check
     *   - selectionReason: Human-readable explanation
     */
    async selectBestMove(position, candidates, engineClient, statisticsEngine) {
        // Log entry point for debugging
        log.log(`🎯 selectBestMove called with ${candidates?.length || 0} candidates for position:`, position?.fen || 'no-fen');

        // ---------------------------------------------------------------------
        // GUARD CLAUSE: Return early if no candidates
        // ---------------------------------------------------------------------
        // Guard clauses handle edge cases at the top of the function
        // This prevents nested if-statements and makes code cleaner
        if (!candidates || candidates.length === 0) {
            log.log(`❌ No candidates provided, returning null`);
            return null;
        }

        // Log overview of all candidates for debugging
        // .map() transforms each candidate into a simpler object for logging
        log.log(`📊 Candidate moves overview:`, candidates.map(c => ({
            san: c.san || c.uci,                                                   // Move notation
            games: c.white + c.black + c.draws,                                    // Total games
            playrate: c.playrate,                                                  // How often played (0-1)
            winRate: ((c.white || 0) / ((c.white || 0) + (c.black || 0) + (c.draws || 0))).toFixed(3)  // Quick win rate calc
        })));

        // =====================================================================
        // STEP 1: DATA QUALITY FILTERING
        // =====================================================================
        // Filter out moves that don't have enough data for reliable statistics.
        // This prevents recommending obscure moves based on just a few games.
        log.log(`🔍 Starting data quality validation...`);

        // .filter() creates a new array with only elements that pass the test
        // The callback receives (element, index) - we use both for logging
        const qualityCandidates = candidates.filter((move, index) => {
            // Check if this move meets minimum data quality thresholds
            const isValid = this._validateMoveDataQuality(move, statisticsEngine);

            // Log result for each candidate (helps debug why moves were rejected)
            log.log(`   ${isValid ? '✅' : '❌'} [MoveSelector] Candidate ${index + 1}: ${move.san || move.uci} - ${isValid ? 'PASSED' : 'FAILED'} quality check (games: ${move.white + move.black + move.draws}, playrate: ${move.playrate})`);

            return isValid;  // Return true to keep, false to filter out
        });

        log.log(`📊 Quality filter results: ${qualityCandidates.length}/${candidates.length} candidates passed`);

        // If all candidates failed quality check, we can't recommend anything
        if (qualityCandidates.length === 0) {
            log.log(`❌ No candidates passed quality filter, returning null`);
            return null;
        }

        // =====================================================================
        // ENGINE ANALYSIS PATH SELECTION
        // =====================================================================
        // We have two paths for engine analysis:
        // 1. LAZY_ENGINE=1 (default): Analyze moves one at a time, starting with
        //    the statistically best. This is much more efficient.
        // 2. LAZY_ENGINE=0 (legacy): Analyze ALL moves upfront. Kept for A/B testing
        //    and debugging to ensure lazy path produces identical results.

        log.log(`🔧 Engine configuration: CAREABOUTENGINE=${this.config.CAREABOUTENGINE}, LAZY_ENGINE=${this.config.LAZY_ENGINE}, engineClient=${!!engineClient}`);

        // =====================================================================
        // LAZY ENGINE PATH (LAZY_ENGINE=1, default)
        // =====================================================================
        // This path is more efficient: it ranks moves statistically first,
        // then only analyzes moves with the engine as needed.
        if (this.config.CAREABOUTENGINE === 1 && engineClient && this.config.LAZY_ENGINE !== 0) {
            log.log(`⚡ Using LAZY engine evaluation (LAZY_ENGINE=${this.config.LAZY_ENGINE})`);

            // Use the lazy evaluation method
            const lazyResult = await this._selectBestWithLazyEngine(
                position,
                qualityCandidates,
                engineClient,
                statisticsEngine
            );

            // Build result object matching the expected format
            const result = {
                selectedMove: lazyResult.selectedMove,
                engineAnalysis: lazyResult.engineAnalysis,
                candidateCount: candidates.length,
                qualityFiltered: candidates.length - qualityCandidates.length,
                engineFiltered: 0,  // Not directly applicable for lazy path
                selectionReason: this._getLazySelectionReason(lazyResult),
                engineCallCount: lazyResult.engineCallCount  // Extra metric for lazy path
            };

            log.log(`🎯 [LazyEngine] Final selection summary:`, {
                selectedMove: result.selectedMove?.san || result.selectedMove?.uci || 'NONE',
                candidateCount: result.candidateCount,
                qualityFiltered: result.qualityFiltered,
                selectionReason: result.selectionReason,
                engineCallCount: result.engineCallCount
            });

            return result;
        }

        // =====================================================================
        // LEGACY BATCH ENGINE PATH (LAZY_ENGINE=0)
        // =====================================================================
        // This path analyzes ALL moves upfront - kept for comparison testing.
        // To use: set LAZY_ENGINE=0 in config

        // Get engine evaluation if engine care is enabled
        let engineAnalysis = null;

        if (this.config.CAREABOUTENGINE === 1 && engineClient) {
            log.log(`🔧 Using LEGACY batch engine evaluation (LAZY_ENGINE=0)`);
            log.log(`⚙️ Starting engine analysis for position: ${position.fen}`);
            engineAnalysis = await this._getEngineAnalysis(position.fen, qualityCandidates, engineClient);

            if (engineAnalysis) {
                log.log(`✅ Engine analysis completed:`, {
                    bestMove: engineAnalysis.bestMove,
                    positionEval: engineAnalysis.positionEval,
                    analyzedMoves: Object.keys(engineAnalysis.moveAnalyses || {})
                });
            } else {
                log.log(`⚠️ Engine analysis failed or returned null`);
            }
        } else {
            log.log(`🚫 Skipping engine analysis (CAREABOUTENGINE=${this.config.CAREABOUTENGINE}, engineClient=${!!engineClient})`);
        }

        // Filter by engine soundness if engine analysis available
        let viableCandidates = qualityCandidates;
        if (engineAnalysis && this.config.CAREABOUTENGINE === 1) {
            log.log(`🔍 Starting engine soundness filtering...`);
            log.log(`   Engine best move: ${engineAnalysis.bestMove}`);
            log.log(`   Move analyses available for: ${Object.keys(engineAnalysis.moveAnalyses || {})}`);

            viableCandidates = this._filterCandidatesByEngine(
                qualityCandidates,
                engineAnalysis.bestMove,
                engineAnalysis.moveAnalyses
            );

            log.log(`📊 Engine filter results: ${viableCandidates.length}/${qualityCandidates.length} candidates passed soundness check`);
        } else {
            log.log(`🚫 Skipping engine filtering (no analysis or CAREABOUTENGINE != 1)`);
        }

        if (viableCandidates.length === 0) {
            // When CAREABOUTENGINE=1 and no moves pass engine validation, fall back to statistical selection
            if (this.config.CAREABOUTENGINE === 1 && engineAnalysis) {
                log.log(`⚠️ Engine rejected all ${qualityCandidates.length} candidate moves, falling back to statistical selection`);
            }
            // Fall back to statistical selection (non-blocking approach matching Python behavior)
            viableCandidates = qualityCandidates;
        }

        // Select best move based on win rate confidence intervals
        log.log(`📈 Starting statistical selection from ${viableCandidates.length} viable candidates...`);
        const selectedMove = this._selectByStatistics(position, viableCandidates, statisticsEngine);

        if (selectedMove) {
            log.log(`✅ Selected move: ${selectedMove.san || selectedMove.uci}`, {
                winRate: selectedMove.winRate?.toFixed(3),
                confidence: selectedMove.confidence,
                totalGames: selectedMove.totalGames,
                playrate: selectedMove.playrate
            });
        } else {
            log.log(`❌ Statistical selection failed to find a move`);
        }

        const result = {
            selectedMove,
            engineAnalysis,
            candidateCount: candidates.length,
            qualityFiltered: candidates.length - qualityCandidates.length,
            engineFiltered: qualityCandidates.length - viableCandidates.length,
            selectionReason: this._getSelectionReason(selectedMove, engineAnalysis)
        };

        log.log(`🎯 Final selection summary:`, {
            selectedMove: selectedMove?.san || selectedMove?.uci || 'NONE',
            candidateCount: result.candidateCount,
            qualityFiltered: result.qualityFiltered,
            engineFiltered: result.engineFiltered,
            selectionReason: result.selectionReason
        });

        return result;
    }

    /**
   * Validate move soundness against engine evaluation
   *
   * NOTE: This function was previously async but never awaited anything.
   * Changed to sync to fix bug where .filter() treated Promise as truthy.
   *
   * @param {string} fen - Position FEN (unused, kept for API compatibility)
   * @param {string} move - Move in UCI notation
   * @param {string} engineBestMove - Engine's best move
   * @param {Object} moveAnalysis - Engine analysis for the move
   * @returns {boolean} True if move passes soundness check
   */
    validateMoveSoundness(fen, move, engineBestMove, moveAnalysis) {
        log.log(`      🎯 [MoveSelector] validateMoveSoundness for ${move}:`);
        log.log(`         CAREABOUTENGINE: ${this.config.CAREABOUTENGINE}`);

        if (this.config.CAREABOUTENGINE !== 1) {
            log.log(`         ✅ Skipping engine validation (CAREABOUTENGINE != 1)`);
            return true; // Skip engine validation if not caring about engine
        }

        // Check if it's the engine's best move
        if (move === engineBestMove) {
            log.log(`         ✅ Move ${move} is engine's best move`);
            return true;
        }

        // Check centipawn loss against limits
        const centipawnLoss = moveAnalysis ? moveAnalysis.moveLoss : 0;
        log.log(`         Centipawn loss: ${centipawnLoss}, evaluation: ${moveAnalysis?.evaluation}`);
        log.log(`         Limits - SOUNDNESSLIMIT: ${this.config.SOUNDNESSLIMIT}, LOSSLIMIT: ${this.config.LOSSLIMIT}, IGNORELOSSLIMIT: ${this.config.IGNORELOSSLIMIT}`);

        // Handle mate scenarios specially
        if (this._isMateScore(moveAnalysis?.evaluation)) {
            log.log(`         🏁 Mate score detected, handling specially`);
            const mateResult = this._handleMateScenarios(moveAnalysis);
            log.log(`         Mate scenario result: ${mateResult ? '✅ ACCEPTED' : '❌ REJECTED'}`);
            return mateResult;
        }

        // Apply soundness limit
        if (centipawnLoss > Math.abs(this.config.SOUNDNESSLIMIT)) {
            log.log(`         ❌ Failed soundness limit: ${centipawnLoss} > ${Math.abs(this.config.SOUNDNESSLIMIT)}`);
            return false;
        }

        // Apply loss limit with ignore threshold
        if (centipawnLoss > Math.abs(this.config.LOSSLIMIT)) {
            // Check if we're above ignore threshold (where loss limit doesn't apply)
            const absoluteEval = Math.abs(moveAnalysis?.evaluation || 0);
            log.log(`         Loss limit check: ${centipawnLoss} > ${Math.abs(this.config.LOSSLIMIT)}, absoluteEval: ${absoluteEval}`);
            if (absoluteEval < this.config.IGNORELOSSLIMIT) {
                log.log(`         ❌ Failed loss limit (below ignore threshold): ${absoluteEval} < ${this.config.IGNORELOSSLIMIT}`);
                return false;
            } else {
                log.log(`         ✅ Loss limit ignored (above threshold): ${absoluteEval} >= ${this.config.IGNORELOSSLIMIT}`);
            }
        }

        log.log(`         ✅ Passed all soundness checks`);
        return true;
    }

    /**
   * Filter candidate moves by engine validation
   * @param {Array} candidates - Candidate moves
   * @param {string} engineBestMove - Engine's recommended move
   * @param {Object} moveAnalyses - Engine analysis for each move
   * @returns {Array} Filtered candidate moves
   */
    _filterCandidatesByEngine(candidates, engineBestMove, moveAnalyses) {
        log.log(`🔧 Engine filtering: engineBestMove=${engineBestMove}`);
        log.log(`   Available analyses: ${Object.keys(moveAnalyses || {}).join(', ')}`);

        return candidates.filter((candidate, index) => {
            // IMPORTANT: Use UCI format only - SAN format crashes Stockfish WASM
            // Lichess API always provides .uci field, so this should always exist
            const moveUci = candidate.uci;
            if (!moveUci) {
                log.warn(`   ⚠️ Skipping candidate ${index + 1}: missing UCI format (san: ${candidate.san})`);
                return false;
            }
            const analysis = moveAnalyses[moveUci];

            log.log(`   🔍 [MoveSelector] Validating candidate ${index + 1}: ${moveUci}`);
            log.log(`      Analysis available: ${!!analysis}, centipawn loss: ${analysis?.moveLoss || 'N/A'}`);

            const isValid = this.validateMoveSoundness(
                null, // FEN not needed for this validation
                moveUci,
                engineBestMove,
                analysis
            );

            log.log(`      Result: ${isValid ? '✅ PASSED' : '❌ FAILED'} soundness check`);
            return isValid;
        });
    }

    /**
   * Calculate move loss compared to engine best move
   * @param {number} ourMoveScore - Score of our move
   * @param {number} engineMoveScore - Score of engine's best move
   * @returns {number} Centipawn loss (positive = loss)
   */
    evaluateMoveLoss(ourMoveScore, engineMoveScore) {
    // Handle mate scores specially
        if (this._isMateScore(ourMoveScore) || this._isMateScore(engineMoveScore)) {
            return this._compareMateScores(ourMoveScore, engineMoveScore);
        }

        // Normal centipawn comparison
        return engineMoveScore - ourMoveScore;
    }

    /**
   * Handle mate scenario evaluation
   * @param {Object} moveAnalysis - Engine analysis with mate information
   * @returns {boolean} True if mate scenario is acceptable
   */
    _handleMateScenarios(moveAnalysis) {
        if (!moveAnalysis || !this._isMateScore(moveAnalysis.evaluation)) {
            return true;
        }

        // If we have mate in our favor, always accept
        if (moveAnalysis.evaluation > 999999) {
            return true;
        }

        // If we're getting mated, check if it's forced or avoidable
        if (moveAnalysis.evaluation < -999999) {
            // If best move also leads to mate, accept (forced mate)
            if (this._isMateScore(moveAnalysis.bestEvaluation) && moveAnalysis.bestEvaluation < -999999) {
                return true;
            }
            return false; // Avoidable mate
        }

        return true;
    }

    /**
   * Get engine analysis for position and candidate moves
   * @private
   */
    async _getEngineAnalysis(fen, candidates, engineClient) {
        try {
            log.log(`⚙️ Starting engine analysis for ${candidates.length} candidates`);

            // Get best move for position
            log.log(`   Getting engine best move for position...`);
            const bestMove = await engineClient.getBestMove(fen);
            log.log(`   Engine best move: ${bestMove}`);

            // Analyze each candidate move
            const moveAnalyses = {};
            log.log(`   Analyzing individual candidate moves...`);
            for (let i = 0; i < candidates.length; i++) {
                const candidate = candidates[i];
                // IMPORTANT: Use UCI format only - SAN format crashes Stockfish WASM
                // Lichess API always provides .uci field, so this should always exist
                const moveUci = candidate.uci;
                if (!moveUci) {
                    log.warn(`      ⚠️ Skipping candidate ${i + 1}: missing UCI format (san: ${candidate.san})`);
                    continue;
                }
                log.log(`      Analyzing move ${i + 1}/${candidates.length}: ${moveUci}`);
                const analysis = await engineClient.analyzeMove(fen, moveUci);
                log.log(`         Analysis result:`, analysis);
                moveAnalyses[moveUci] = analysis;
            }

            log.log(`   Getting position evaluation...`);
            const positionEval = await engineClient.evaluatePosition(fen);
            log.log(`   Position evaluation: ${positionEval}`);

            const result = {
                bestMove,
                moveAnalyses,
                positionEval
            };

            log.log(`✅ Engine analysis completed successfully`);
            return result;
        } catch (error) {
            log.warn(`❌ Engine analysis failed:`, error.message);
            return null;
        }
    }

    /**
   * Validate move data quality using statistics
   * @private
   */
    _validateMoveDataQuality(move, statisticsEngine) {
        const totalGames = move.white + move.black + move.draws;
        const playRate = move.playrate || 0;

        return statisticsEngine.validateMoveDataQuality(
            totalGames,
            playRate,
            this.config
        );
    }

    /**
   * Select best move based on statistical analysis
   * @private
   */
    _selectByStatistics(position, candidates, statisticsEngine) {
        log.log(`📈 Statistical selection from ${candidates.length} candidates:`);
        // Extract current turn from FEN (3rd field after spaces)
        const currentTurn = position.fen.split(' ')[1]; // 'w' or 'b'
        log.log(`   Current turn: ${currentTurn}, DRAWSAREHALF: ${this.config.DRAWSAREHALF}, ALPHA: ${this.config.ALPHA}`);

        let bestMove = null;
        let bestLowerBound = -1;

        for (let i = 0; i < candidates.length; i++) {
            const candidate = candidates[i];
            // Calculate win rate based on perspective
            const totalGames = candidate.white + candidate.black + candidate.draws;
            let winRate;

            log.log(`   📋 [MoveSelector] Analyzing candidate ${i + 1}: ${candidate.san || candidate.uci}`);
            log.log(`      Games: W:${candidate.white} B:${candidate.black} D:${candidate.draws} (Total: ${totalGames})`);

            if (currentTurn === 'w') {
                winRate = statisticsEngine.calculateWinRate(
                    candidate.white,
                    candidate.black,
                    candidate.draws,
                    this.config.DRAWSAREHALF
                ).whitePerc;
            } else { // currentTurn === 'b'
                winRate = statisticsEngine.calculateWinRate(
                    candidate.white,
                    candidate.black,
                    candidate.draws,
                    this.config.DRAWSAREHALF
                ).blackPerc;
            }

            log.log(`      Win rate (${currentTurn === 'w' ? 'white' : 'black'} to move): ${winRate?.toFixed(4)}`);

            // Calculate confidence interval
            const confidence = statisticsEngine.calculateConfidenceInterval(
                winRate,
                totalGames,
                this.config.ALPHA
            );

            log.log(`      Confidence interval: [${confidence.lowerBound?.toFixed(6)}, ${confidence.upperBound?.toFixed(6)}] (α=${this.config.ALPHA})`);

            // Select move with highest lower bound (most conservative estimate)
            if (confidence.lowerBound > bestLowerBound) {
                log.log(`      🎆 New best candidate! Lower bound: ${confidence.lowerBound?.toFixed(4)} > ${bestLowerBound?.toFixed(4)}`);
                bestLowerBound = confidence.lowerBound;
                bestMove = {
                    ...candidate,
                    winRate,
                    confidence,
                    totalGames
                };
            } else {
                log.log(`      Lower bound: ${confidence.lowerBound?.toFixed(4)} <= ${bestLowerBound?.toFixed(4)} (not better)`);
            }
        }

        if (bestMove) {
            log.log(`✅ Statistical winner: ${bestMove.san || bestMove.uci} with lower bound ${bestLowerBound?.toFixed(4)}`);
        } else {
            log.log(`❌ No statistical winner found`);
        }

        return bestMove;
    }

    /**
   * Check if score represents mate
   * @private
   */
    _isMateScore(score) {
        return Math.abs(score) > 999999;
    }

    /**
   * Compare mate scores
   * @private
   */
    _compareMateScores(ourScore, engineScore) {
        if (this._isMateScore(ourScore) && this._isMateScore(engineScore)) {
            // Both are mate scores - compare mate distances
            return Math.abs(engineScore) - Math.abs(ourScore);
        }

        if (this._isMateScore(ourScore)) {
            return ourScore > 0 ? -1000 : 1000; // Our mate vs normal score
        }

        if (this._isMateScore(engineScore)) {
            return engineScore > 0 ? 1000 : -1000; // Engine mate vs normal score
        }

        return 0;
    }

    /**
   * Get human-readable selection reason
   * @private
   */
    _getSelectionReason(selectedMove, engineAnalysis) {
        if (!selectedMove) {
            return 'No valid moves found';
        }

        if (engineAnalysis && selectedMove.uci === engineAnalysis.bestMove) {
            return 'Engine best move with strong statistics';
        }

        if (engineAnalysis && this.config.CAREABOUTENGINE === 1) {
            return 'Statistically best move passing engine validation';
        }

        return 'Statistically best move (no engine validation)';
    }

    /**
     * Get human-readable selection reason for lazy engine path
     *
     * @param {Object} lazyResult - Result from _selectBestWithLazyEngine
     * @returns {string} Human-readable explanation
     * @private
     */
    _getLazySelectionReason(lazyResult) {
        // Map internal reason codes to human-readable explanations
        switch (lazyResult.reason) {
            case 'matches-engine-best':
                return 'Engine best move with strong statistics (fast path)';
            case 'passed-soundness':
                return 'Statistically best move passing engine validation';
            case 'fallback-all-rejected':
                return 'Statistical best (all moves rejected by engine)';
            case 'no-candidates':
                return 'No valid moves found';
            case 'engine-error':
                return 'Statistical best (engine error, no engine validation)';
            default:
                return `Selected via lazy engine evaluation (${lazyResult.reason})`;
        }
    }

    // =========================================================================
    // LAZY ENGINE EVALUATION METHODS
    // =========================================================================
    // These methods implement a more efficient engine analysis strategy.
    // Instead of analyzing ALL candidate moves upfront, we:
    // 1. Rank moves by statistics first (cheap - no engine calls)
    // 2. Check if the statistical best matches engine's best move
    // 3. If not, analyze moves one at a time until we find a sound one
    //
    // This can reduce engine calls by 85% in typical cases where the
    // statistically best move is also the engine's choice or passes soundness.
    // =========================================================================

    /**
     * Rank candidates by statistical confidence interval
     *
     * This is a pure statistical ranking - no engine calls.
     * Returns candidates sorted by lower bound of win rate confidence interval.
     *
     * WHY LOWER BOUND?
     * The lower bound is the conservative estimate of true win rate.
     * Moves with more games have tighter confidence intervals, so their
     * lower bounds are closer to their actual win rate. This naturally
     * prefers moves with more data while still considering win rate.
     *
     * @param {Object} position - Position with FEN string
     * @param {Array} candidates - Array of candidate move objects
     * @param {Object} statisticsEngine - Statistics utility
     * @returns {Array} Candidates sorted by lower bound (descending)
     * @private
     */
    _rankByStatistics(position, candidates, statisticsEngine) {
        // Extract whose turn it is from the FEN string
        // FEN format: "pieces active castling en-passant halfmove fullmove"
        // The second field (index 1) is 'w' for white or 'b' for black
        const currentTurn = position.fen.split(' ')[1];

        log.log(`📊 [LazyEngine] Ranking ${candidates.length} candidates by statistics (turn: ${currentTurn})`);

        // Transform each candidate to include statistical measures
        // .map() creates a new array where each element is transformed
        const rankedCandidates = candidates.map((candidate, index) => {
            // Calculate total games for this move
            const totalGames = candidate.white + candidate.black + candidate.draws;

            // Calculate win rate from the perspective of the player to move
            // If it's white's turn, we want white's win percentage
            // If it's black's turn, we want black's win percentage
            let winRate;
            if (currentTurn === 'w') {
                winRate = statisticsEngine.calculateWinRate(
                    candidate.white,
                    candidate.black,
                    candidate.draws,
                    this.config.DRAWSAREHALF
                ).whitePerc;
            } else {
                winRate = statisticsEngine.calculateWinRate(
                    candidate.white,
                    candidate.black,
                    candidate.draws,
                    this.config.DRAWSAREHALF
                ).blackPerc;
            }

            // Calculate confidence interval for this win rate
            // Uses ALPHA from config (e.g., 0.001 = 99.9% confidence)
            const confidence = statisticsEngine.calculateConfidenceInterval(
                winRate,
                totalGames,
                this.config.ALPHA
            );

            log.log(`   ${index + 1}. ${candidate.san || candidate.uci}: winRate=${winRate?.toFixed(4)}, lowerBound=${confidence.lowerBound?.toFixed(4)}, games=${totalGames}`);

            // Return the candidate with added statistical information
            // The spread operator (...candidate) copies all existing properties
            return {
                ...candidate,
                winRate,
                confidence,
                totalGames,
                lowerBound: confidence.lowerBound
            };
        });

        // Sort by lower bound in descending order (highest first)
        // .sort() modifies the array in place and returns it
        rankedCandidates.sort((a, b) => b.lowerBound - a.lowerBound);

        log.log(`   Winner: ${rankedCandidates[0]?.san || rankedCandidates[0]?.uci} with lowerBound=${rankedCandidates[0]?.lowerBound?.toFixed(4)}`);

        return rankedCandidates;
    }

    /**
     * Check if a move passes soundness thresholds
     *
     * A move is "sound" if it doesn't lose too much compared to the engine's best.
     * This reuses the logic from validateMoveSoundness but is simplified for
     * the lazy evaluation path.
     *
     * SOUNDNESS CRITERIA:
     * 1. If the move IS the engine's best move → always sound
     * 2. If centipawn loss > SOUNDNESSLIMIT → reject
     * 3. If centipawn loss > LOSSLIMIT AND position isn't very winning → reject
     * 4. Otherwise → sound
     *
     * @param {string} moveUci - Move in UCI format (e.g., 'e2e4')
     * @param {string} engineBestMove - Engine's recommended move in UCI format
     * @param {Object} analysis - Engine analysis for this move
     *   @param {number} analysis.moveLoss - Centipawn loss vs best move
     *   @param {number} analysis.evaluation - Position evaluation after move
     * @returns {boolean} True if move passes soundness check
     * @private
     */
    _passesSoundnessCheck(moveUci, engineBestMove, analysis) {
        // Fast path: engine's best move is always sound
        if (moveUci === engineBestMove) {
            log.log(`      ✅ ${moveUci} is engine's best move - automatically sound`);
            return true;
        }

        // Get centipawn loss from analysis (default to 0 if missing)
        const centipawnLoss = analysis?.moveLoss || 0;

        log.log(`      🔍 Checking soundness for ${moveUci}: loss=${centipawnLoss}cp, eval=${analysis?.evaluation}`);

        // Check SOUNDNESSLIMIT (strictest threshold)
        // Note: SOUNDNESSLIMIT is stored as negative (e.g., -99) so we use Math.abs
        if (centipawnLoss > Math.abs(this.config.SOUNDNESSLIMIT)) {
            log.log(`      ❌ Failed SOUNDNESSLIMIT: ${centipawnLoss} > ${Math.abs(this.config.SOUNDNESSLIMIT)}`);
            return false;
        }

        // Check LOSSLIMIT (can be ignored if position is very winning)
        if (centipawnLoss > Math.abs(this.config.LOSSLIMIT)) {
            const absoluteEval = Math.abs(analysis?.evaluation || 0);

            // If we're already winning by a lot, ignore the loss limit
            if (absoluteEval < this.config.IGNORELOSSLIMIT) {
                log.log(`      ❌ Failed LOSSLIMIT: ${centipawnLoss} > ${Math.abs(this.config.LOSSLIMIT)} and eval ${absoluteEval} < ${this.config.IGNORELOSSLIMIT}`);
                return false;
            } else {
                log.log(`      ✅ LOSSLIMIT exceeded but ignored (eval ${absoluteEval} >= ${this.config.IGNORELOSSLIMIT})`);
            }
        }

        log.log(`      ✅ Passed all soundness checks`);
        return true;
    }

    /**
     * Select best move using lazy engine evaluation
     *
     * LAZY EVALUATION STRATEGY:
     * Instead of analyzing all moves upfront (expensive), we:
     * 1. Rank moves by statistics (free - no engine calls)
     * 2. Get engine's best move (1 engine call)
     * 3. Check candidates in statistical order:
     *    - If it matches engine best → approve immediately (0 more calls)
     *    - Otherwise, analyze just that move (1 call)
     *    - If it passes soundness → approve
     *    - If rejected → try next statistical best
     *
     * PERFORMANCE COMPARISON:
     * - Old approach: Always 2N+1 engine calls (N = candidates)
     * - Lazy approach: Best case 1 call, worst case N+1 calls
     *
     * @param {Object} position - Position with FEN and perspective
     * @param {Array} qualityCandidates - Pre-filtered candidate moves
     * @param {Object} engineClient - Stockfish engine instance
     * @param {Object} statisticsEngine - Statistics utility
     * @returns {Promise<Object>} Selection result with move and analysis
     * @private
     */
    async _selectBestWithLazyEngine(position, qualityCandidates, engineClient, statisticsEngine) {
        log.log(`⚡ [LazyEngine] Starting lazy engine evaluation for ${qualityCandidates.length} candidates`);

        // STEP 1: Rank all candidates by statistics (no engine calls - cheap!)
        const rankedCandidates = this._rankByStatistics(position, qualityCandidates, statisticsEngine);

        if (rankedCandidates.length === 0) {
            log.log(`❌ [LazyEngine] No candidates to evaluate`);
            return {
                selectedMove: null,
                engineAnalysis: null,
                reason: 'no-candidates'
            };
        }

        // STEP 2: Get engine's best move (1 engine call)
        // Wrap in try-catch to handle engine errors gracefully
        let engineBestMove;
        let positionEval;
        try {
            log.log(`   Getting engine's best move for position...`);
            engineBestMove = await engineClient.getBestMove(position.fen);
            log.log(`   Engine's best move: ${engineBestMove}`);

            // Also get position evaluation for consistency with legacy path
            positionEval = await engineClient.evaluatePosition(position.fen);
            log.log(`   Position evaluation: ${positionEval}`);
        } catch (error) {
            // Engine failed - fall back to pure statistical selection
            log.warn(`   ⚠️ Engine error: ${error.message}, falling back to statistical selection`);
            return {
                selectedMove: rankedCandidates[0],
                engineAnalysis: null,
                reason: 'engine-error',
                engineCallCount: 0
            };
        }

        // STEP 3: Try candidates in statistical order (lazy evaluation)
        let engineCallCount = 2; // We made calls for getBestMove + evaluatePosition

        for (let i = 0; i < rankedCandidates.length; i++) {
            const candidate = rankedCandidates[i];
            log.log(`   Trying candidate ${i + 1}/${rankedCandidates.length}: ${candidate.san || candidate.uci}`);

            // FAST PATH: If this move is the engine's best, approve immediately
            // No need to analyze - engine already said this is best!
            if (candidate.uci === engineBestMove) {
                log.log(`   ⚡ FAST PATH: ${candidate.uci} matches engine best move - approved with ${engineCallCount} engine call(s)`);
                return {
                    selectedMove: candidate,
                    engineAnalysis: {
                        bestMove: engineBestMove,
                        positionEval,  // Include for consistency with legacy path
                        moveAnalyses: {}  // No individual analysis needed
                    },
                    reason: 'matches-engine-best',
                    engineCallCount
                };
            }

            // SLOW PATH: Analyze just this one move
            log.log(`   Analyzing ${candidate.uci}...`);
            const analysis = await engineClient.analyzeMove(position.fen, candidate.uci);
            engineCallCount++;

            // Check if this move passes soundness thresholds
            if (this._passesSoundnessCheck(candidate.uci, engineBestMove, analysis)) {
                log.log(`   ✅ ${candidate.uci} passed soundness check - approved with ${engineCallCount} engine call(s)`);
                return {
                    selectedMove: candidate,
                    engineAnalysis: {
                        bestMove: engineBestMove,
                        positionEval,  // Include for consistency with legacy path
                        moveAnalyses: { [candidate.uci]: analysis }
                    },
                    reason: 'passed-soundness',
                    engineCallCount
                };
            }

            log.log(`   ❌ ${candidate.uci} rejected by engine, trying next candidate...`);
        }

        // FALLBACK: All candidates rejected by engine
        // Match Python behavior: use statistical best anyway (non-blocking)
        log.log(`   ⚠️ All ${rankedCandidates.length} candidates rejected by engine, falling back to statistical best`);
        return {
            selectedMove: rankedCandidates[0],  // Best statistical move
            engineAnalysis: {
                bestMove: engineBestMove,
                positionEval,  // Include for consistency with legacy path
                moveAnalyses: {}
            },
            reason: 'fallback-all-rejected',
            engineCallCount
        };
    }
}

export default MoveSelector;
