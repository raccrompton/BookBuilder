/**
 * =============================================================================
 * Statistics.js - Statistical calculations for chess move selection
 * =============================================================================
 *
 * PURPOSE:
 * This file provides mathematical tools for analyzing chess move statistics.
 * When we query Lichess and get "e4 won 55% of 1 million games", we need
 * to turn that into useful decisions. That's what these functions do.
 *
 * KEY STATISTICAL CONCEPTS:
 *
 * 1. WIN RATE:
 *    Simple ratio: wins / total_games
 *    But what about draws? We can count them as 0.5 wins or ignore them.
 *
 * 2. CONFIDENCE INTERVALS:
 *    With 100 games showing 55% win rate, we're less confident than with
 *    100,000 games showing 55% win rate. Confidence intervals express this
 *    uncertainty as a range: "win rate is between 52% and 58% (95% confident)"
 *
 * 3. LOWER BOUND:
 *    When picking moves, we use the LOWER bound of the confidence interval.
 *    This is conservative - it accounts for uncertainty in the data.
 *    A move with 60% win rate from 100 games might have lower bound 50%.
 *    A move with 55% win rate from 10,000 games might have lower bound 54%.
 *    We'd prefer the second move despite its lower raw win rate!
 *
 * WHY THIS MATTERS FOR CHESS:
 * Imagine two moves:
 * - Move A: 70% win rate in 10 games
 * - Move B: 55% win rate in 100,000 games
 *
 * The raw win rate suggests Move A is better, but it's based on only 10 games!
 * That 70% could easily be random luck. Move B's 55% is much more reliable.
 * By using confidence intervals, we properly account for this.
 *
 * MATCHES PYTHON:
 * These calculations exactly match the Python legacy system's calc_percs
 * and calc_value functions. This ensures consistent behavior.
 *
 * DEPENDENCIES:
 * None - pure JavaScript math functions
 * =============================================================================
 */

// Logger: Configurable logging - toggle with Logger.setEnabled('Statistics', true/false)
import Logger from '../utils/Logger.js';
const log = Logger.get('Statistics');

/**
 * =============================================================================
 * Normal Distribution Inverse CDF (Quantile Function)
 * =============================================================================
 *
 * WHAT THIS DOES:
 * Given a probability p (like 0.025), returns the z-score where that much
 * of the normal distribution lies below.
 *
 * WHY WE NEED THIS:
 * For confidence intervals, we need "critical values" from the normal
 * distribution. For a 95% confidence interval:
 * - We want the middle 95% of the distribution
 * - That leaves 2.5% on each tail
 * - normalPPF(0.975) gives us z = 1.96 (the famous value!)
 *
 * WHAT IS THE NORMAL DISTRIBUTION?
 * The bell curve! Most natural phenomena cluster around an average,
 * with fewer extreme values. Chess statistics roughly follow this.
 *
 * TECHNICAL NOTE:
 * This uses Acklam's algorithm, which approximates scipy.stats.norm.ppf()
 * to very high precision (within 1e-6). This is a rational approximation
 * that's faster than iterative methods.
 *
 * @param {number} p - Probability (must be between 0 and 1, exclusive)
 *   Example: 0.975 for 95% confidence interval
 *
 * @returns {number} - Z-score (standard deviations from mean)
 *   Example: normalPPF(0.975) ≈ 1.96
 *
 * @throws {Error} If p is not in range (0, 1)
 */
function normalPPF(p) {
    // Guard clause: p must be between 0 and 1 (exclusive)
    // p=0 or p=1 would give infinite z-scores
    if (p <= 0 || p >= 1) {
        throw new Error('Probability must be between 0 and 1');
    }

    // =========================================================================
    // Acklam's Algorithm Coefficients
    // =========================================================================
    // These magic numbers are carefully calculated coefficients that make
    // the rational approximation accurate. Don't modify them!
    // Source: Peter J. Acklam's inverse normal approximation algorithm

    // Coefficients for central region (numerator)
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
        1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];

    // Coefficients for central region (denominator)
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
        6.680131188771972e+01, -1.328068155288572e+01];

    // Coefficients for tail regions (numerator)
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
        -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];

    // Coefficients for tail regions (denominator)
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
        3.754408661907416e+00];

    let x;  // Result z-score

    // =========================================================================
    // Three-Region Approximation
    // =========================================================================
    // The algorithm uses different formulas for different parts of the
    // probability range, which improves accuracy.

    if (p < 0.02425) {
        // LOWER TAIL (very small probabilities)
        // Uses a different formula optimized for this region
        const q = Math.sqrt(-2 * Math.log(p));  // Transform for numerical stability
        x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    } else if (p <= 0.97575) {
        // CENTRAL REGION (most common case)
        // This is where most probabilities fall
        const q = p - 0.5;  // Center around 0.5
        const r = q * q;    // Square for polynomial
        x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    } else {
        // UPPER TAIL (very large probabilities)
        // Mirror of lower tail calculation
        const q = Math.sqrt(-2 * Math.log(1 - p));
        x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
         ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }

    return x;
}

class Statistics {
    /**
   * Calculate win rate percentages matching Python calc_percs function exactly
   * @param {number} white - White wins
   * @param {number} black - Black wins
   * @param {number} draws - Draw games
   * @param {number} drawsAreHalf - 0 = draws count as losses, 1 = draws count as 0.5 points
   * @returns {object} { whitePerc, blackPerc, drawPerc, totalGames }
   */
    calculateWinRate(white, black, draws, drawsAreHalf) {
        const n = white + black + draws; // Total games after move was played

        if (n <= 0) {
            return { whitePerc: null, blackPerc: null, drawPerc: null, totalGames: 0 };
        }

        const totalGames = n;

        if (drawsAreHalf === 0) {
            // DRAWSAREHALF = 0: draws count as losses
            const whitePerc = white / n;
            const blackPerc = black / n;
            const drawPerc = draws / n;
            return { whitePerc, blackPerc, drawPerc, totalGames };
        } else if (drawsAreHalf === 1) {
            // DRAWSAREHALF = 1: draws count as half a win
            const whitePerc = (white + (0.5 * draws)) / n;
            const blackPerc = (black + (0.5 * draws)) / n;
            const drawPerc = draws / n;
            return { whitePerc, blackPerc, drawPerc, totalGames };
        } else {
            return { whitePerc: null, blackPerc: null, drawPerc: null, totalGames: 0 };
        }
    }

    /**
   * Calculate cumulative probability with sorting and cumulative sum
   * Used for determining line depth based on DEPTHLIKELIHOOD threshold
   * @param {Array} moves - Array of moves with playrate property
   * @returns {Array} Moves sorted by playrate descending with cumulative probability
   */
    calculateCumulativeProbability(moves) {
        if (!moves || moves.length === 0) {
            return [];
        }

        // Sort moves by playrate in descending order (highest probability first)
        const sortedMoves = [...moves].sort((a, b) => (b.playrate || 0) - (a.playrate || 0));

        // Calculate cumulative sum of play rates
        let cumulativeSum = 0;
        return sortedMoves.map(move => {
            cumulativeSum += (move.playrate || 0);
            return {
                ...move,
                cumulativeProbability: cumulativeSum
            };
        });
    }

    /**
   * Calculate confidence interval matching Python calc_value function exactly
   * @param {number} winRate - Win rate (0-1)
   * @param {number} gamesPlayed - Total games played
   * @param {number} alpha - Confidence level (e.g., 0.001 for 99.9% CI)
   * @returns {object} { winRate, lowerBound, upperBound, gamesPlayed }
   */
    calculateConfidenceInterval(winRate, gamesPlayed, alpha) {
        if (gamesPlayed <= 0 || winRate < 0 || winRate > 1) {
            return { winRate: 0, lowerBound: 0, upperBound: 0, gamesPlayed };
        }

        // Handle edge cases for perfect win/loss rates
        if (winRate === 0 || winRate === 1) {
            // For perfect rates, use Wilson score interval approach
            const z = normalPPF(1 - alpha / 2);
            const n = gamesPlayed;

            if (winRate === 0) {
                // For 0% win rate, lower bound is 0, calculate upper bound
                const upperBound = Math.min(1, (z * z) / (2 * n + z * z));
                return { winRate: 0, lowerBound: 0, upperBound, gamesPlayed };
            } else {
                // For 100% win rate, upper bound is 1, calculate lower bound
                const lowerBound = Math.max(0, 1 - (z * z) / (2 * n + z * z));
                return { winRate: 1, lowerBound, upperBound: 1, gamesPlayed };
            }
        }

        // Calculate critical value for confidence interval
        // st.norm.ppf(1 - alpha/2) from Python scipy.stats
        const criticalValue = normalPPF(1 - alpha / 2);

        // Calculate standard error: sqrt(p * (1-p) / n)
        const standardError = Math.sqrt(winRate * (1 - winRate) / gamesPlayed);

        // Calculate margin of error
        const marginOfError = criticalValue * standardError;

        // Calculate bounds (ensure within [0,1] range)
        const lowerBound = Math.max(0, winRate - marginOfError);
        const upperBound = Math.min(1, winRate + marginOfError);

        return { winRate, lowerBound, upperBound, gamesPlayed };
    }

    /**
   * Validate move data quality using MINGAMES and MINPLAYRATE filtering
   * Matches the validation logic from Python calc_value function
   * @param {number} gamesPlayed - Total games where move was played
   * @param {number} playRate - Play rate percentage (0-1)
   * @param {object} config - Configuration with MINGAMES and MINPLAYRATE
   * @returns {boolean} True if data meets quality criteria
   */
    validateMoveDataQuality(gamesPlayed, playRate, config) {
        const minGames = config.MINGAMES || 19;
        const minPlayRate = config.MINPLAYRATE || 0.001;

        log.log(`📊 [Statistics] Quality validation: games=${gamesPlayed} > ${minGames}, playRate=${playRate?.toFixed(4)} > ${minPlayRate}`);
        log.log(`📊 [Statistics] Config values: MINGAMES=${config.MINGAMES}, MINPLAYRATE=${config.MINPLAYRATE}`);

        // Total games move was played must be more than min games
        // AND min percentage play rate (otherwise data is bad)
        const result = (gamesPlayed > minGames) && (playRate > minPlayRate);
        log.log(`📊 [Statistics] Validation result: ${result ? 'PASSED' : 'FAILED'}`);
        return result;
    }

    /**
   * Calculate move value with confidence interval (complete calc_value equivalent)
   * @param {number} winRate - Win rate (0-1)
   * @param {number} gamesPlayed - Total games played
   * @param {number} playRate - Play rate (0-1)
   * @param {string} san - Move in algebraic notation
   * @param {object} board - Chess board position (for logging)
   * @param {object} config - Configuration object
   * @returns {object} { winRate, lowerBound, upperBound, gamesPlayed }
   */
    calculateMoveValue(winRate, gamesPlayed, playRate, san, board, config) {
    // Validate data quality first
        if (this.validateMoveDataQuality(gamesPlayed, playRate, config)) {
            // Data meets quality criteria - calculate confidence interval
            return this.calculateConfidenceInterval(winRate, gamesPlayed, config.ALPHA || 0.001);
        } else {
            // Data doesn't meet quality criteria - return zeros
            return { winRate: 0, lowerBound: 0, upperBound: 0, gamesPlayed };
        }
    }
}

export default Statistics;
