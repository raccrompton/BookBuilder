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
        console.log(`🎯 [MoveSelector] selectBestMove called with ${candidates?.length || 0} candidates for position:`, position?.fen || 'no-fen');

        // ---------------------------------------------------------------------
        // GUARD CLAUSE: Return early if no candidates
        // ---------------------------------------------------------------------
        // Guard clauses handle edge cases at the top of the function
        // This prevents nested if-statements and makes code cleaner
        if (!candidates || candidates.length === 0) {
            console.log(`❌ [MoveSelector] No candidates provided, returning null`);
            return null;
        }

        // Log overview of all candidates for debugging
        // .map() transforms each candidate into a simpler object for logging
        console.log(`📊 [MoveSelector] Candidate moves overview:`, candidates.map(c => ({
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
        console.log(`🔍 [MoveSelector] Starting data quality validation...`);

        // .filter() creates a new array with only elements that pass the test
        // The callback receives (element, index) - we use both for logging
        const qualityCandidates = candidates.filter((move, index) => {
            // Check if this move meets minimum data quality thresholds
            const isValid = this._validateMoveDataQuality(move, statisticsEngine);

            // Log result for each candidate (helps debug why moves were rejected)
            console.log(`   ${isValid ? '✅' : '❌'} [MoveSelector] Candidate ${index + 1}: ${move.san || move.uci} - ${isValid ? 'PASSED' : 'FAILED'} quality check (games: ${move.white + move.black + move.draws}, playrate: ${move.playrate})`);

            return isValid;  // Return true to keep, false to filter out
        });

        console.log(`📊 [MoveSelector] Quality filter results: ${qualityCandidates.length}/${candidates.length} candidates passed`);

        // If all candidates failed quality check, we can't recommend anything
        if (qualityCandidates.length === 0) {
            console.log(`❌ [MoveSelector] No candidates passed quality filter, returning null`);
            return null;
        }

        // Get engine evaluation if engine care is enabled
        let engineAnalysis = null;
        console.log(`🔧 [MoveSelector] Engine configuration: CAREABOUTENGINE=${this.config.CAREABOUTENGINE}, engineClient=${!!engineClient}`);

        if (this.config.CAREABOUTENGINE === 1 && engineClient) {
            console.log(`⚙️ [MoveSelector] Starting engine analysis for position: ${position.fen}`);
            engineAnalysis = await this._getEngineAnalysis(position.fen, qualityCandidates, engineClient);

            if (engineAnalysis) {
                console.log(`✅ [MoveSelector] Engine analysis completed:`, {
                    bestMove: engineAnalysis.bestMove,
                    positionEval: engineAnalysis.positionEval,
                    analyzedMoves: Object.keys(engineAnalysis.moveAnalyses || {})
                });
            } else {
                console.log(`⚠️ [MoveSelector] Engine analysis failed or returned null`);
            }
        } else {
            console.log(`🚫 [MoveSelector] Skipping engine analysis (CAREABOUTENGINE=${this.config.CAREABOUTENGINE}, engineClient=${!!engineClient})`);
        }

        // Filter by engine soundness if engine analysis available
        let viableCandidates = qualityCandidates;
        if (engineAnalysis && this.config.CAREABOUTENGINE === 1) {
            console.log(`🔍 [MoveSelector] Starting engine soundness filtering...`);
            console.log(`   Engine best move: ${engineAnalysis.bestMove}`);
            console.log(`   Move analyses available for: ${Object.keys(engineAnalysis.moveAnalyses || {})}`);

            viableCandidates = this._filterCandidatesByEngine(
                qualityCandidates,
                engineAnalysis.bestMove,
                engineAnalysis.moveAnalyses
            );

            console.log(`📊 [MoveSelector] Engine filter results: ${viableCandidates.length}/${qualityCandidates.length} candidates passed soundness check`);
        } else {
            console.log(`🚫 [MoveSelector] Skipping engine filtering (no analysis or CAREABOUTENGINE != 1)`);
        }

        if (viableCandidates.length === 0) {
            // When CAREABOUTENGINE=1 and no moves pass engine validation, fall back to statistical selection
            if (this.config.CAREABOUTENGINE === 1 && engineAnalysis) {
                console.log(`⚠️ [MoveSelector] Engine rejected all ${qualityCandidates.length} candidate moves, falling back to statistical selection`);
            }
            // Fall back to statistical selection (non-blocking approach matching Python behavior)
            viableCandidates = qualityCandidates;
        }

        // Select best move based on win rate confidence intervals
        console.log(`📈 [MoveSelector] Starting statistical selection from ${viableCandidates.length} viable candidates...`);
        const selectedMove = this._selectByStatistics(position, viableCandidates, statisticsEngine);

        if (selectedMove) {
            console.log(`✅ [MoveSelector] Selected move: ${selectedMove.san || selectedMove.uci}`, {
                winRate: selectedMove.winRate?.toFixed(3),
                confidence: selectedMove.confidence,
                totalGames: selectedMove.totalGames,
                playrate: selectedMove.playrate
            });
        } else {
            console.log(`❌ [MoveSelector] Statistical selection failed to find a move`);
        }

        const result = {
            selectedMove,
            engineAnalysis,
            candidateCount: candidates.length,
            qualityFiltered: candidates.length - qualityCandidates.length,
            engineFiltered: qualityCandidates.length - viableCandidates.length,
            selectionReason: this._getSelectionReason(selectedMove, engineAnalysis)
        };

        console.log(`🎯 [MoveSelector] Final selection summary:`, {
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
   * @param {string} fen - Position FEN
   * @param {string} move - Move in UCI notation
   * @param {string} engineBestMove - Engine's best move
   * @param {Object} moveAnalysis - Engine analysis for the move
   * @returns {boolean} True if move passes soundness check
   */
    async validateMoveSoundness(fen, move, engineBestMove, moveAnalysis) {
        console.log(`      🎯 [MoveSelector] validateMoveSoundness for ${move}:`);
        console.log(`         CAREABOUTENGINE: ${this.config.CAREABOUTENGINE}`);

        if (this.config.CAREABOUTENGINE !== 1) {
            console.log(`         ✅ Skipping engine validation (CAREABOUTENGINE != 1)`);
            return true; // Skip engine validation if not caring about engine
        }

        // Check if it's the engine's best move
        if (move === engineBestMove) {
            console.log(`         ✅ Move ${move} is engine's best move`);
            return true;
        }

        // Check centipawn loss against limits
        const centipawnLoss = moveAnalysis ? moveAnalysis.moveLoss : 0;
        console.log(`         Centipawn loss: ${centipawnLoss}, evaluation: ${moveAnalysis?.evaluation}`);
        console.log(`         Limits - SOUNDNESSLIMIT: ${this.config.SOUNDNESSLIMIT}, LOSSLIMIT: ${this.config.LOSSLIMIT}, IGNORELOSSLIMIT: ${this.config.IGNORELOSSLIMIT}`);

        // Handle mate scenarios specially
        if (this._isMateScore(moveAnalysis?.evaluation)) {
            console.log(`         🏁 Mate score detected, handling specially`);
            const mateResult = this._handleMateScenarios(moveAnalysis);
            console.log(`         Mate scenario result: ${mateResult ? '✅ ACCEPTED' : '❌ REJECTED'}`);
            return mateResult;
        }

        // Apply soundness limit
        if (centipawnLoss > Math.abs(this.config.SOUNDNESSLIMIT)) {
            console.log(`         ❌ Failed soundness limit: ${centipawnLoss} > ${Math.abs(this.config.SOUNDNESSLIMIT)}`);
            return false;
        }

        // Apply loss limit with ignore threshold
        if (centipawnLoss > Math.abs(this.config.LOSSLIMIT)) {
            // Check if we're above ignore threshold (where loss limit doesn't apply)
            const absoluteEval = Math.abs(moveAnalysis?.evaluation || 0);
            console.log(`         Loss limit check: ${centipawnLoss} > ${Math.abs(this.config.LOSSLIMIT)}, absoluteEval: ${absoluteEval}`);
            if (absoluteEval < this.config.IGNORELOSSLIMIT) {
                console.log(`         ❌ Failed loss limit (below ignore threshold): ${absoluteEval} < ${this.config.IGNORELOSSLIMIT}`);
                return false;
            } else {
                console.log(`         ✅ Loss limit ignored (above threshold): ${absoluteEval} >= ${this.config.IGNORELOSSLIMIT}`);
            }
        }

        console.log(`         ✅ Passed all soundness checks`);
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
        console.log(`🔧 [MoveSelector] Engine filtering: engineBestMove=${engineBestMove}`);
        console.log(`   Available analyses: ${Object.keys(moveAnalyses || {}).join(', ')}`);

        return candidates.filter((candidate, index) => {
            const moveUci = candidate.uci || candidate.san;
            const analysis = moveAnalyses[moveUci];

            console.log(`   🔍 [MoveSelector] Validating candidate ${index + 1}: ${moveUci}`);
            console.log(`      Analysis available: ${!!analysis}, centipawn loss: ${analysis?.moveLoss || 'N/A'}`);

            const isValid = this.validateMoveSoundness(
                null, // FEN not needed for this validation
                moveUci,
                engineBestMove,
                analysis
            );

            console.log(`      Result: ${isValid ? '✅ PASSED' : '❌ FAILED'} soundness check`);
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
            console.log(`⚙️ [MoveSelector] Starting engine analysis for ${candidates.length} candidates`);

            // Get best move for position
            console.log(`   Getting engine best move for position...`);
            const bestMove = await engineClient.getBestMove(fen);
            console.log(`   Engine best move: ${bestMove}`);

            // Analyze each candidate move
            const moveAnalyses = {};
            console.log(`   Analyzing individual candidate moves...`);
            for (let i = 0; i < candidates.length; i++) {
                const candidate = candidates[i];
                const moveUci = candidate.uci || candidate.san;
                console.log(`      Analyzing move ${i + 1}/${candidates.length}: ${moveUci}`);
                const analysis = await engineClient.analyzeMove(fen, moveUci);
                console.log(`         Analysis result:`, analysis);
                moveAnalyses[moveUci] = analysis;
            }

            console.log(`   Getting position evaluation...`);
            const positionEval = await engineClient.evaluatePosition(fen);
            console.log(`   Position evaluation: ${positionEval}`);

            const result = {
                bestMove,
                moveAnalyses,
                positionEval
            };

            console.log(`✅ [MoveSelector] Engine analysis completed successfully`);
            return result;
        } catch (error) {
            console.warn(`❌ [MoveSelector] Engine analysis failed:`, error.message);
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
        console.log(`📈 [MoveSelector] Statistical selection from ${candidates.length} candidates:`);
        // Extract current turn from FEN (3rd field after spaces)
        const currentTurn = position.fen.split(' ')[1]; // 'w' or 'b'
        console.log(`   Current turn: ${currentTurn}, DRAWSAREHALF: ${this.config.DRAWSAREHALF}, ALPHA: ${this.config.ALPHA}`);

        let bestMove = null;
        let bestLowerBound = -1;

        for (let i = 0; i < candidates.length; i++) {
            const candidate = candidates[i];
            // Calculate win rate based on perspective
            const totalGames = candidate.white + candidate.black + candidate.draws;
            let winRate;

            console.log(`   📋 [MoveSelector] Analyzing candidate ${i + 1}: ${candidate.san || candidate.uci}`);
            console.log(`      Games: W:${candidate.white} B:${candidate.black} D:${candidate.draws} (Total: ${totalGames})`);

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

            console.log(`      Win rate (${currentTurn === 'w' ? 'white' : 'black'} to move): ${winRate?.toFixed(4)}`);

            // Calculate confidence interval
            const confidence = statisticsEngine.calculateConfidenceInterval(
                winRate,
                totalGames,
                this.config.ALPHA
            );

            console.log(`      Confidence interval: [${confidence.lowerBound?.toFixed(6)}, ${confidence.upperBound?.toFixed(6)}] (α=${this.config.ALPHA})`);

            // Select move with highest lower bound (most conservative estimate)
            if (confidence.lowerBound > bestLowerBound) {
                console.log(`      🎆 New best candidate! Lower bound: ${confidence.lowerBound?.toFixed(4)} > ${bestLowerBound?.toFixed(4)}`);
                bestLowerBound = confidence.lowerBound;
                bestMove = {
                    ...candidate,
                    winRate,
                    confidence,
                    totalGames
                };
            } else {
                console.log(`      Lower bound: ${confidence.lowerBound?.toFixed(4)} <= ${bestLowerBound?.toFixed(4)} (not better)`);
            }
        }

        if (bestMove) {
            console.log(`✅ [MoveSelector] Statistical winner: ${bestMove.san || bestMove.uci} with lower bound ${bestLowerBound?.toFixed(4)}`);
        } else {
            console.log(`❌ [MoveSelector] No statistical winner found`);
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
}

export default MoveSelector;
