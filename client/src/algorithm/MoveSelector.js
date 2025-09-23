/**
 * Move Selection Algorithm for BookBuilder
 *
 * Implements engine-validated move filtering with soundness limits
 * matching the Python legacy system's move selection logic.
 */

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
        if (!candidates || candidates.length === 0) {
            return null;
        }

        // Filter candidates by data quality first
        const qualityCandidates = candidates.filter(move =>
            this._validateMoveDataQuality(move, statisticsEngine)
        );

        if (qualityCandidates.length === 0) {
            return null;
        }

        // Get engine evaluation if engine care is enabled
        let engineAnalysis = null;
        if (this.config.CAREABOUTENGINE === 1 && engineClient) {
            engineAnalysis = await this._getEngineAnalysis(position.fen, qualityCandidates, engineClient);
        }

        // Filter by engine soundness if engine analysis available
        let viableCandidates = qualityCandidates;
        if (engineAnalysis && this.config.CAREABOUTENGINE === 1) {
            viableCandidates = this._filterCandidatesByEngine(
                qualityCandidates,
                engineAnalysis.bestMove,
                engineAnalysis.moveAnalyses
            );
        }

        if (viableCandidates.length === 0) {
            // If no moves pass engine filtering, fall back to statistical selection
            viableCandidates = qualityCandidates;
        }

        // Select best move based on win rate confidence intervals
        const selectedMove = this._selectByStatistics(viableCandidates, statisticsEngine);

        return {
            selectedMove,
            engineAnalysis,
            candidateCount: candidates.length,
            qualityFiltered: candidates.length - qualityCandidates.length,
            engineFiltered: qualityCandidates.length - viableCandidates.length,
            selectionReason: this._getSelectionReason(selectedMove, engineAnalysis)
        };
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
        if (this.config.CAREABOUTENGINE !== 1) {
            return true; // Skip engine validation if not caring about engine
        }

        // Check if it's the engine's best move
        if (move === engineBestMove) {
            return true;
        }

        // Check centipawn loss against limits
        const centipawnLoss = moveAnalysis ? moveAnalysis.moveLoss : 0;

        // Handle mate scenarios specially
        if (this._isMateScore(moveAnalysis?.evaluation)) {
            return this._handleMateScenarios(moveAnalysis);
        }

        // Apply soundness limit
        if (centipawnLoss > Math.abs(this.config.SOUNDNESSLIMIT)) {
            return false;
        }

        // Apply loss limit with ignore threshold
        if (centipawnLoss > Math.abs(this.config.LOSSLIMIT)) {
            // Check if we're above ignore threshold (where loss limit doesn't apply)
            const absoluteEval = Math.abs(moveAnalysis?.evaluation || 0);
            if (absoluteEval < this.config.IGNORELOSSLIMIT) {
                return false;
            }
        }

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
        return candidates.filter(candidate => {
            const moveUci = candidate.uci || candidate.san;
            const analysis = moveAnalyses[moveUci];

            return this.validateMoveSoundness(
                null, // FEN not needed for this validation
                moveUci,
                engineBestMove,
                analysis
            );
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
            // Get best move for position
            const bestMove = await engineClient.getBestMove(fen);

            // Analyze each candidate move
            const moveAnalyses = {};
            for (const candidate of candidates) {
                const moveUci = candidate.uci || candidate.san;
                const analysis = await engineClient.analyzeMove(fen, moveUci);
                moveAnalyses[moveUci] = analysis;
            }

            return {
                bestMove,
                moveAnalyses,
                positionEval: await engineClient.evaluatePosition(fen)
            };
        } catch (error) {
            console.warn('Engine analysis failed:', error.message);
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
        let bestMove = null;
        let bestLowerBound = -1;

        for (const candidate of candidates) {
            // Calculate win rate based on perspective
            const totalGames = candidate.white + candidate.black + candidate.draws;
            let winRate;

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

            // Calculate confidence interval
            const confidence = statisticsEngine.calculateConfidenceInterval(
                winRate,
                totalGames,
                this.config.ALPHA
            );

            // Select move with highest lower bound (most conservative estimate)
            if (confidence.lowerBound > bestLowerBound) {
                bestLowerBound = confidence.lowerBound;
                bestMove = {
                    ...candidate,
                    winRate,
                    confidence,
                    totalGames
                };
            }
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
