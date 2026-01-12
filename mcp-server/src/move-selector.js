/**
 * =============================================================================
 * Move Selector - Statistical Move Selection
 * =============================================================================
 *
 * PURPOSE:
 * Selects the best move from a position based on statistical analysis.
 * Uses Lichess opening statistics and Wilson confidence intervals to recommend
 * the move with the best expected win rate.
 *
 * HOW IT FITS IN:
 * - Used by: MCP server's select_best_move tool
 * - Depends on: LichessApi for position statistics
 *
 * KEY CONCEPTS:
 * - Win Rate: Probability of winning (0-1 scale), calculated from perspective
 * - Wilson Confidence Interval: Statistical bounds on win rate estimate
 * - Perspective: Which side's repertoire we're building ('white' or 'black')
 */

const { LichessApi } = require('./lichess-api.js'); // API client for fetching position statistics

// Z-score for 95% confidence interval (standard value used in statistics)
const Z_SCORE = 1.96; // 95% confidence level; higher values give wider intervals

/**
 * MoveSelector class - Recommends best move based on statistics
 *
 * WHAT IT DOES:
 * Analyzes available moves in a position and recommends the one with the
 * highest lower bound of the confidence interval (most reliable win rate).
 *
 * EXAMPLE:
 * const selector = new MoveSelector();
 * const result = await selector.selectBestMove(
 *   'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
 *   'white'
 * );
 */
class MoveSelector {
    constructor() {
        this.lichessApi = new LichessApi(); // Create API client for fetching statistics
    }

    /**
     * Select the best move for a given position and perspective
     *
     * WHAT IT DOES:
     * Fetches position statistics from Lichess, calculates win rates and
     * confidence intervals, and selects the move with the best lower bound.
     *
     * PARAMETERS:
     * @param {string} fen - Chess position in FEN notation
     * @param {string} perspective - Which side's repertoire ('white' or 'black')
     * @param {Object} config - Optional configuration
     *   @param {string[]} config.speeds - Time controls (e.g., ['rapid', 'classical'])
     *   @param {number[]} config.ratings - Rating bands (e.g., [1800, 2000])
     *
     * RETURNS:
     * @returns {Promise<Object>} Selection result containing:
     *   - move: Best move in SAN notation (e.g., 'e4')
     *   - winRate: Expected win rate (0-1 scale)
     *   - confidence: { lower, upper } bounds (0-1 scale)
     *   - reasoning: Explanation of why this move was selected
     *
     * HOW IT WORKS:
     * 1. Fetch position statistics from Lichess API
     * 2. Calculate win rate for each move based on perspective
     * 3. Calculate Wilson confidence interval for each win rate
     * 4. Select the move with the highest lower confidence bound
     */
    async selectBestMove(fen, perspective, config = {}) {
        // Build options object for Lichess API - pass through speeds and ratings filters
        const options = {}; // Start with empty options
        if (config.speeds) {
            options.speeds = config.speeds; // Add speed filter if provided
        }
        if (config.ratings) {
            options.ratings = config.ratings; // Add rating filter if provided
        }

        // Fetch position statistics from Lichess
        const stats = await this.lichessApi.getOpeningStats(fen, options); // Get move statistics

        // Check if there are any moves to analyze
        if (!stats.moves || stats.moves.length === 0) {
            return {
                move: null, // No move available
                winRate: null, // No win rate to report
                confidence: null, // No confidence interval
                reasoning: 'No moves found in the position' // Explain why no move selected
            };
        }

        // Calculate win rate and confidence for each move
        const movesWithStats = stats.moves.map(move => {
            // Calculate total games for this move
            const totalGames = move.white + move.draws + move.black; // Sum all outcomes

            // Calculate win rate based on perspective
            // For white: wins = white wins; for black: wins = black wins
            const wins = perspective === 'white' ? move.white : move.black; // Count wins for our side
            const winRate = totalGames > 0 ? wins / totalGames : 0; // Win probability (0-1)

            // Calculate Wilson confidence interval for the win rate
            const confidence = this._calculateWilsonInterval(winRate, totalGames); // Get bounds

            return {
                san: move.san, // Move notation
                winRate, // Calculated win rate (0-1)
                confidence, // Confidence bounds { lower, upper }
                totalGames // Sample size for reasoning
            };
        });

        // Select move with highest lower confidence bound (most reliable)
        // This favors moves with good win rates AND sufficient sample sizes
        const bestMove = movesWithStats.reduce((best, current) => {
            if (!best || current.confidence.lower > best.confidence.lower) {
                return current; // Current move has higher lower bound
            }
            return best; // Keep current best
        }, null);

        // Build reasoning string explaining the selection
        const reasoning = `Selected ${bestMove.san} with ${(bestMove.winRate * 100).toFixed(1)}% win rate ` +
            `(${(bestMove.confidence.lower * 100).toFixed(1)}-${(bestMove.confidence.upper * 100).toFixed(1)}% confidence) ` +
            `based on ${bestMove.totalGames} games`; // Human-readable explanation

        return {
            move: bestMove.san, // Best move in SAN notation
            winRate: bestMove.winRate, // Expected win rate (0-1)
            confidence: bestMove.confidence, // Confidence interval { lower, upper }
            reasoning // Explanation of selection
        };
    }

    /**
     * Calculate Wilson score confidence interval
     *
     * WHAT IT DOES:
     * Computes the confidence interval for a proportion (win rate) using the
     * Wilson score interval formula. This is more accurate than the normal
     * approximation, especially for small sample sizes or extreme proportions.
     *
     * PARAMETERS:
     * @param {number} p - Observed proportion (win rate, 0-1)
     * @param {number} n - Sample size (total games)
     *
     * RETURNS:
     * @returns {Object} Confidence interval { lower, upper } (0-1 scale)
     *
     * FORMULA:
     * Wilson interval: (p + z²/2n ± z*sqrt(p(1-p)/n + z²/4n²)) / (1 + z²/n)
     *
     * @private
     */
    _calculateWilsonInterval(p, n) {
        // Handle edge case of zero games - return wide interval
        if (n === 0) {
            return { lower: 0, upper: 1 }; // No data means complete uncertainty
        }

        // Pre-calculate z-squared for reuse
        const z2 = Z_SCORE * Z_SCORE; // z² = 1.96² = 3.8416

        // Calculate the denominator: 1 + z²/n
        const denominator = 1 + z2 / n; // Adjustment factor for sample size

        // Calculate the center of the interval: (p + z²/2n) / denominator
        const center = (p + z2 / (2 * n)) / denominator; // Adjusted proportion

        // Calculate the spread: z * sqrt(p(1-p)/n + z²/4n²) / denominator
        const variance = (p * (1 - p)) / n; // Sample variance of proportion
        const correction = z2 / (4 * n * n); // Continuity correction term
        const spread = (Z_SCORE * Math.sqrt(variance + correction)) / denominator; // Half-width of interval

        // Calculate lower and upper bounds, clamped to [0, 1]
        const lower = Math.max(0, center - spread); // Lower bound, at least 0
        const upper = Math.min(1, center + spread); // Upper bound, at most 1

        return { lower, upper }; // Return confidence interval
    }
}

module.exports = { MoveSelector };
