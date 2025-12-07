/**
 * BookBuilder Configuration
 *
 * This configuration file contains all parameters needed for the BookBuilder
 * JavaScript implementation. Values are derived from the Python configuration
 * to ensure exact behavioral parity.
 *
 * Based on analysis from:
 * - @client/claudedocs/step6-analysis/python-bookbuilder-analysis.md
 * - @legacy/core/config.py structure and parameters
 */

const config = {
    // ==================== CORE ANALYSIS PARAMETERS ====================

    /**
     * Depth and move filtering thresholds
     * These control how deep the analysis goes and which moves are considered
     */
    MINDEPTH: 4,                    // Minimum depth for analysis
    MAXDEPTH: 15,                   // Maximum depth for analysis
    MINPLAYRATE: 0.01,              // Minimum play rate for moves (1%)
    MINGAMES: 19,                   // Minimum games required for statistical significance
    CONTINUATIONGAMES: 10,          // Minimum games for opponent continuations
    DEPTHLIKELIHOOD: 0.03,          // Cumulative likelihood threshold for depth (3%)

    // ==================== STATISTICAL ANALYSIS ====================

    /**
     * Statistical calculation parameters
     * These control confidence intervals and win rate calculations
     */
    ALPHA: 0.001,                   // Significance level for confidence intervals (99.9%)
    DRAWSAREHALF: 0,                // Whether draws count as half points (0=no, 1=yes)

    // ==================== ENGINE CONFIGURATION ====================

    /**
     * Stockfish engine integration settings
     * Controls when and how the chess engine is used
     */
    CAREABOUTENGINE: 1,             // Whether to use engine validation (0=no, 1=yes)
    ENGINEFINISH: 1,                // Use engine to complete lines when stats insufficient
    ENGINEDEPTH: 20,                // Engine analysis depth
    ENGINEHASH: 128,                // Engine hash table size (MB) - browser may ignore
    ENGINETHREADS: 1,               // Engine threads - set to 1 for browser compatibility

    /**
     * Lazy engine evaluation optimization
     * When enabled, performs statistical ranking first, then only analyzes moves as needed.
     * This can reduce engine calls by 85% in typical cases.
     * Set to 0 to use legacy batch evaluation (for A/B comparison testing).
     */
    LAZY_ENGINE: 1,                 // Use lazy engine evaluation (0=batch all, 1=lazy)

    /**
     * Engine move validation thresholds
     * These control how the engine evaluates move quality
     */
    SOUNDNESSLIMIT: -99,            // Maximum centipawn loss for sound moves
    LOSSLIMIT: -99,                 // Maximum centipawn loss threshold
    IGNORELOSSLIMIT: 300,           // Centipawn threshold to ignore loss limits

    // ==================== OUTPUT CONFIGURATION ====================

    /**
     * PGN output formatting options
     */
    LONGTOSHORT: 1,                 // Sort lines from longest to shortest (0=no, 1=yes)
    PRINT_INFO_TO_CONSOLE: true,    // Enable console logging

    // ==================== OPENING DEFINITIONS ====================

    /**
     * Opening book configuration
     * Each opening should have name, fen (starting position), and perspective
     */
    openings: [
        {
            name: "Ruy Lopez",
            fen: "rnbqkbnr/pppp1ppp/5n2/1B2p3/4P3/8/PPPP1PPP/RNBQK1NR b KQkq - 3 3",
            perspective: "white"
        },
        {
            name: "King's Indian Defense",
            fen: "rnbqkb1r/pppppp1p/5np1/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3",
            perspective: "black"
        }
    ],

    // ==================== API CONFIGURATION ====================

    /**
     * Lichess API settings
     * Controls rate limiting and request behavior
     */
    API_BASE_URL: "https://explorer.lichess.org",
    API_TIMEOUT: 10000,             // Request timeout in milliseconds
    API_RETRY_ATTEMPTS: 3,          // Number of retry attempts on failure
    API_RETRY_DELAY: 1000,          // Base delay between retries (ms)

    // ==================== PERFORMANCE SETTINGS ====================

    /**
     * Performance optimization parameters
     */
    BATCH_SIZE: 5,                  // Number of positions to process in parallel
    API_DELAY: 100,                 // Delay between API calls (ms) for rate limiting
    MAX_ITERATIONS: 1000,           // Safety limit for line expansion iterations

    // ==================== VALIDATION HELPERS ====================

    /**
     * Validate configuration parameters
     * @returns {Array} Array of validation errors, empty if valid
     */
    validate() {
        const errors = [];

        // Check required numeric parameters
        const numericParams = [
            'MINDEPTH', 'MAXDEPTH', 'MINPLAYRATE', 'MINGAMES',
            'CONTINUATIONGAMES', 'DEPTHLIKELIHOOD', 'ALPHA'
        ];

        for (const param of numericParams) {
            if (typeof this[param] !== 'number' || this[param] < 0) {
                errors.push(`${param} must be a positive number`);
            }
        }

        // Check depth parameters
        if (this.MINDEPTH >= this.MAXDEPTH) {
            errors.push('MINDEPTH must be less than MAXDEPTH');
        }

        // Check percentage parameters
        if (this.MINPLAYRATE > 1.0) {
            errors.push('MINPLAYRATE must be between 0 and 1');
        }

        if (this.DEPTHLIKELIHOOD > 1.0) {
            errors.push('DEPTHLIKELIHOOD must be between 0 and 1');
        }

        if (this.ALPHA > 1.0) {
            errors.push('ALPHA must be between 0 and 1');
        }

        // Check boolean parameters (0 or 1 values)
        const booleanParams = ['DRAWSAREHALF', 'CAREABOUTENGINE', 'ENGINEFINISH', 'LONGTOSHORT', 'LAZY_ENGINE'];
        for (const param of booleanParams) {
            if (this[param] !== 0 && this[param] !== 1) {
                errors.push(`${param} must be 0 or 1`);
            }
        }

        // Check openings array
        if (!Array.isArray(this.openings) || this.openings.length === 0) {
            errors.push('openings must be a non-empty array');
        } else {
            for (let i = 0; i < this.openings.length; i++) {
                const opening = this.openings[i];
                if (!opening.name || typeof opening.name !== 'string') {
                    errors.push(`Opening ${i + 1}: name is required and must be a string`);
                }
                if (!opening.fen || typeof opening.fen !== 'string') {
                    errors.push(`Opening ${i + 1}: fen is required and must be a string`);
                }
                if (!opening.perspective || !['white', 'black'].includes(opening.perspective)) {
                    errors.push(`Opening ${i + 1}: perspective must be 'white' or 'black'`);
                }
            }
        }

        return errors;
    },

    /**
     * Get configuration summary for logging
     * @returns {string} Human-readable configuration summary
     */
    getSummary() {
        return `BookBuilder Configuration:
  Depth: ${this.MINDEPTH}-${this.MAXDEPTH}
  Thresholds: MINPLAYRATE=${this.MINPLAYRATE}, MINGAMES=${this.MINGAMES}
  Engine: ${this.CAREABOUTENGINE ? 'enabled' : 'disabled'}
  Openings: ${this.openings.length} defined
  Draw handling: ${this.DRAWSAREHALF ? 'draws=0.5' : 'draws=0'}`;
    }
};

// Validate configuration on load
const validationErrors = config.validate();
if (validationErrors.length > 0) {
    console.error('Configuration validation failed:');
    validationErrors.forEach(error => console.error(`  - ${error}`));
    throw new Error('Invalid configuration');
}

// Log configuration summary if console logging is enabled
if (config.PRINT_INFO_TO_CONSOLE) {
    console.log(config.getSummary());
}

export default config;