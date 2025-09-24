/**
 * Move Selection Algorithm for BookBuilder
 *
 * Implements engine-validated move filtering with soundness limits
 * matching the Python legacy system's move selection logic.
 */

import { DeterministicMode } from '../config/DeterministicMode.js';

class MoveSelector {
    constructor(config = {}) {
        this.config = {
            CAREABOUTENGINE: config.CAREABOUTENGINE || 1,
            SOUNDNESSLIMIT: config.SOUNDNESSLIMIT || -99,
            LOSSLIMIT: config.LOSSLIMIT || -99,
            IGNORELOSSLIMIT: config.IGNORELOSSLIMIT || 300,
            MINPLAYRATE: config.MINPLAYRATE || 0.001,
            MINGAMES: config.MINGAMES || 19,
            ALPHA: config.ALPHA || 0.001,
            ...config
        };
    }

    /**
   * Select the best move from candidates using statistics and engine validation
   * @param {Object} position - Current chess position with FEN
   * @param {Array} candidates - Array of candidate moves with statistics
   * @param {Object} engineClient - Stockfish engine client
   * @param {Object} statisticsEngine - Statistics calculation engine
   * @returns {Promise<Object>} Selected move with analysis
   */
    async selectBestMove(position, candidates, engineClient, statisticsEngine) {
        console.log(`🎯 [MoveSelector] selectBestMove called with ${candidates?.length || 0} candidates for position:`, position?.fen || 'no-fen');

        if (!candidates || candidates.length === 0) {
            console.log(`❌ [MoveSelector] No candidates provided, returning null`);
            return null;
        }

        console.log(`📊 [MoveSelector] Candidate moves overview:`, candidates.map(c => ({
            san: c.san || c.uci,
            games: c.white + c.black + c.draws,
            playrate: c.playrate,
            winRate: ((c.white || 0) / ((c.white || 0) + (c.black || 0) + (c.draws || 0))).toFixed(3)
        })));

        // Filter candidates by data quality first
        console.log(`🔍 [MoveSelector] Starting data quality validation...`);
        const qualityCandidates = candidates.filter((move, index) => {
            const isValid = this._validateMoveDataQuality(move, statisticsEngine);
            console.log(`   ${isValid ? '✅' : '❌'} [MoveSelector] Candidate ${index + 1}: ${move.san || move.uci} - ${isValid ? 'PASSED' : 'FAILED'} quality check (games: ${move.white + move.black + move.draws}, playrate: ${move.playrate})`);
            return isValid;
        });

        console.log(`📊 [MoveSelector] Quality filter results: ${qualityCandidates.length}/${candidates.length} candidates passed`);

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
            // When CAREABOUTENGINE=1 and no moves pass engine validation, this is problematic
            if (this.config.CAREABOUTENGINE === 1 && engineAnalysis) {
                DeterministicMode.throwOnFailure(
                    false,
                    `No moves passed engine validation despite CAREABOUTENGINE=1. Engine rejected all ${qualityCandidates.length} candidate moves.`
                );
            }
            // Fall back to statistical selection only if engine analysis wasn't required
            viableCandidates = qualityCandidates;
        }

        // Select best move based on win rate confidence intervals
        console.log(`📈 [MoveSelector] Starting statistical selection from ${viableCandidates.length} viable candidates...`);
        const selectedMove = this._selectByStatistics(viableCandidates, statisticsEngine);

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
    _selectByStatistics(candidates, statisticsEngine) {
        console.log(`📈 [MoveSelector] Statistical selection from ${candidates.length} candidates:`);
        console.log(`   Perspective: ${this.config.perspective}, DRAWSAREHALF: ${this.config.DRAWSAREHALF}, ALPHA: ${this.config.ALPHA}`);

        let bestMove = null;
        let bestLowerBound = -1;

        for (let i = 0; i < candidates.length; i++) {
            const candidate = candidates[i];
            // Calculate win rate based on perspective
            const totalGames = candidate.white + candidate.black + candidate.draws;
            let winRate;

            console.log(`   📋 [MoveSelector] Analyzing candidate ${i + 1}: ${candidate.san || candidate.uci}`);
            console.log(`      Games: W:${candidate.white} B:${candidate.black} D:${candidate.draws} (Total: ${totalGames})`);

            if (this.config.perspective === 'white') {
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

            console.log(`      Win rate (${this.config.perspective}): ${winRate?.toFixed(4)}`);

            // Calculate confidence interval
            const confidence = statisticsEngine.calculateConfidenceInterval(
                winRate,
                totalGames,
                this.config.ALPHA
            );

            console.log(`      Confidence interval: [${confidence.lowerBound?.toFixed(4)}, ${confidence.upperBound?.toFixed(4)}]`);

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
