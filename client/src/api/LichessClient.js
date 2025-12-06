/**
 * =============================================================================
 * LichessClient.js - HTTP client for Lichess Opening Explorer API
 * =============================================================================
 *
 * PURPOSE:
 * This class fetches chess game statistics from Lichess's massive database.
 * Lichess has billions of games played, and this API lets us see how often
 * each move is played and what the results are.
 *
 * WHAT IS LICHESS?
 * Lichess.org is a free, open-source chess website. Their "Opening Explorer"
 * shows statistics like:
 * - "After 1. e4, Black responded with e5 in 3,145,678 games"
 * - "White won 55%, Black won 42%, 3% were draws"
 *
 * WHY THIS CLASS EXISTS:
 * Instead of scattering API calls throughout the codebase, we centralize
 * all Lichess communication here. This pattern is called a "Service" or
 * "Repository" pattern - it abstracts away the HTTP details.
 *
 * KEY FEATURES:
 * - Automatic retry with exponential backoff (if request fails, wait longer)
 * - Rate limiting handling (Lichess limits requests to prevent abuse)
 * - Response validation (makes sure API returned expected data format)
 * - Data transformation (converts API response to our internal format)
 *
 * API DOCUMENTATION:
 * https://lichess.org/api#tag/Opening-Explorer
 *
 * DEPENDENCIES:
 * - fetch: Built-in browser API for HTTP requests (no external library needed)
 *
 * EXAMPLE USAGE:
 * ```javascript
 * const client = new LichessClient();
 * const stats = await client.getPositionStats(
 *   'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',  // Starting FEN
 *   { speeds: 'blitz,rapid', ratings: '2000,2200' }
 * );
 * log.log(stats.moves);  // Array of moves with statistics
 * ```
 * =============================================================================
 */

// Logger: Configurable logging - toggle with Logger.setEnabled('LichessClient', true/false)
import Logger from '../utils/Logger.js';
const log = Logger.get('LichessClient');

class LichessClient {
    /**
     * Constructor - Initialize the Lichess API client
     *
     * WHAT IS A CONSTRUCTOR?
     * The constructor runs when you create a new instance: new LichessClient()
     * It sets up initial values that the client will use for all requests.
     *
     * @param {Object} config - Optional configuration object
     *   @param {string} config.baseUrl - API base URL (default: Lichess explorer)
     *   @param {number} config.maxRetries - How many times to retry failed requests
     *   @param {number} config.retryDelay - Milliseconds to wait before first retry
     *   @param {number} config.rateLimitDelay - Milliseconds to wait when rate limited
     *   @param {number} config.timeout - Request timeout in milliseconds
     */
    constructor(config = {}) {
        // ---------------------------------------------------------------------
        // API Configuration
        // ---------------------------------------------------------------------

        // Base URL for the Lichess Opening Explorer API
        // This is different from the main lichess.org API - it's a specialized
        // service that returns game statistics for positions
        this.baseUrl = config.baseUrl || 'https://explorer.lichess.ovh';

        // ---------------------------------------------------------------------
        // Retry Configuration
        // ---------------------------------------------------------------------
        // Network requests can fail for many reasons (network issues, server
        // overload, temporary errors). Instead of giving up immediately,
        // we retry a few times before declaring failure.

        // Maximum number of retry attempts before giving up
        this.maxRetries = config.maxRetries || 3;

        // Initial delay between retries (in milliseconds)
        // We use "exponential backoff" - each retry waits longer
        // Retry 1: 1000ms, Retry 2: 2000ms, Retry 3: 4000ms
        this.retryDelay = config.retryDelay || 1000;

        // Delay when rate-limited (HTTP 429 response)
        // Rate limiting means "you're making too many requests too fast"
        // 60 seconds is the recommended wait time from Lichess
        this.rateLimitDelay = config.rateLimitDelay || 60000;

        // Request timeout - how long to wait before giving up on a request
        // 10 seconds is usually enough; if it takes longer, something is wrong
        this.timeout = config.timeout || 10000;
    }

    /**
     * =========================================================================
     * Get position statistics from Lichess opening explorer
     * =========================================================================
     *
     * WHAT THIS METHOD DOES:
     * Queries the Lichess database for statistics about a specific chess position.
     * Returns information about all moves played from that position, including:
     * - How many games featured each move
     * - Win/draw/loss percentages
     * - Move popularity (play rate)
     *
     * WHAT IS FEN?
     * FEN (Forsyth-Edwards Notation) is a standard way to describe a chess position.
     * It's a single string that captures the entire board state.
     * Example: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
     *          ^board layout                                  ^whose turn
     *
     * @param {string} fen - Chess position in FEN notation
     *   Example: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
     *
     * @param {Object} options - Query filtering options
     *   @param {string} options.variant - Chess variant ('standard', 'chess960')
     *   @param {string} options.speeds - Time controls to include ('blitz,rapid')
     *   @param {string} options.ratings - Rating bands to include ('2000,2200')
     *   @param {string} options.moves - Maximum number of moves to return
     *
     * @returns {Promise<Object>} Position statistics object containing:
     *   - white: Number of games where white won
     *   - black: Number of games where black won
     *   - draws: Number of draws
     *   - moves: Array of move objects, each with {san, uci, white, black, draws, playrate}
     *
     * @example
     * const stats = await client.getPositionStats(startingFen, {
     *   speeds: 'rapid,classical',
     *   ratings: '2000,2200,2500'
     * });
     * // stats.moves[0] = { san: 'e4', uci: 'e2e4', white: 1500000, black: 1200000, ... }
     */
    async getPositionStats(fen, options = {}) {
        // ---------------------------------------------------------------------
        // Build URL Parameters
        // ---------------------------------------------------------------------
        // URLSearchParams is a built-in browser class that handles URL encoding
        // It converts { key: 'value with spaces' } to 'key=value%20with%20spaces'
        const params = new URLSearchParams({
            fen: fen,                                                           // The position to query
            variant: options.variant || 'standard',                             // Chess variant (we only use standard)
            speeds: options.speeds || 'blitz,rapid,classical,correspondence',   // Time controls to include
            ratings: options.ratings || '1600,1800,2000,2200,2500',             // Rating bands to include
            moves: options.moves || '10'                                        // Max moves to return
        });

        // Construct the full API URL
        // Template literal (backticks) allows embedding variables with ${...}
        const url = `${this.baseUrl}/lichess?${params}`;

        // ---------------------------------------------------------------------
        // Debug Logging
        // ---------------------------------------------------------------------
        // Detailed logging helps developers debug API issues
        // These logs appear in browser's developer console (F12 → Console tab)
        log.log('🌐 [LichessClient] API Call Details:');
        log.log('═'.repeat(60));  // .repeat() creates a string of repeated characters
        log.log(`📍 FEN Position: ${fen}`);
        log.log(`🎯 Full URL: ${url}`);
        log.log('📊 Parameters Breakdown:');
        log.log(`   • Variant: ${params.get('variant')}`);     // .get() retrieves a parameter value
        log.log(`   • Speeds: ${params.get('speeds')}`);
        log.log(`   • Ratings: ${params.get('ratings')}`);
        log.log(`   • Max Moves: ${params.get('moves')}`);
        log.log('🔧 Options Object Received:');
        log.log(`   • Raw Options:`, options);
        log.log('═'.repeat(60));

        // Make the actual HTTP request with retry logic
        // The underscore prefix (_makeRequestWithRetry) indicates a "private" method
        // by convention - it's meant to be used only within this class
        return this._makeRequestWithRetry(url, 'getPositionStats');
    }

    /**
     * =========================================================================
     * Get statistics for a specific move from a position
     * =========================================================================
     *
     * WHAT THIS METHOD DOES:
     * Fetches statistics for ONE specific move (e.g., "What are the stats for e4?")
     * This is a convenience method - it internally calls getPositionStats() and
     * then filters the results to find the requested move.
     *
     * @param {string} fen - Chess position in FEN notation
     * @param {string} move - Move in UCI notation (e.g., 'e2e4') or SAN (e.g., 'e4')
     *   UCI = Universal Chess Interface: 'e2e4' means piece on e2 moves to e4
     *   SAN = Standard Algebraic Notation: 'e4' is human-readable notation
     * @param {Object} options - Query options (same as getPositionStats)
     *
     * @returns {Promise<Object>} Statistics for the specific move
     *
     * @throws {Error} If the move is not found in the position statistics
     */
    async getMoveStats(fen, move, options = {}) {
        // First get ALL position stats (returns array of all played moves)
        const positionStats = await this.getPositionStats(fen, options);

        // Validate that we got valid data back
        // !positionStats.moves checks if moves is undefined, null, or doesn't exist
        // !Array.isArray() checks if it's actually an array (not a string or object)
        if (!positionStats.moves || !Array.isArray(positionStats.moves)) {
            throw new Error('Invalid position data returned from API');
        }

        // Find the specific move in the results
        // .find() returns the first element that matches the condition, or undefined
        // We check both UCI and SAN formats since users might provide either
        const moveStats = positionStats.moves.find(m => m.uci === move || m.san === move);

        // If move wasn't found, throw an error
        // This could happen if the move was never played in Lichess games
        if (!moveStats) {
            throw new Error(`Move ${move} not found in position statistics`);
        }

        return moveStats;
    }

    /**
     * =========================================================================
     * Make HTTP request with retry logic (PRIVATE METHOD)
     * =========================================================================
     *
     * WHAT THIS METHOD DOES:
     * Makes the actual HTTP request to Lichess, with automatic retry on failure.
     * This is a "private" method (indicated by _ prefix) - it's only meant to
     * be called by other methods in this class, not from outside code.
     *
     * DESIGN PATTERN: Retry with Exponential Backoff
     * If a request fails, we don't give up immediately. Instead:
     * 1. First retry: Wait 1 second
     * 2. Second retry: Wait 2 seconds (2x longer)
     * 3. Third retry: Wait 4 seconds (2x longer again)
     * This "backs off" exponentially to avoid overwhelming a struggling server.
     *
     * WHY RETRY?
     * Network requests fail for many temporary reasons:
     * - Brief network interruption
     * - Server temporarily overloaded
     * - Request timed out
     * Usually, trying again in a few seconds works.
     *
     * @param {string} url - Full URL to fetch
     * @param {string} operation - Name of operation for logging (e.g., 'getPositionStats')
     *
     * @returns {Promise<Object>} Parsed JSON response from the API
     *
     * @throws {Error} If all retry attempts fail
     * @private - This method should only be called within this class
     */
    async _makeRequestWithRetry(url, operation) {
        // Track the last error so we can report it if all attempts fail
        let lastError;

        // Start at attempt 1 (not 0) for human-readable logging
        let attempt = 1;

        // Keep trying until we've exhausted all retry attempts
        while (attempt <= this.maxRetries) {
            try {
                log.log(`Lichess API ${operation}: Attempt ${attempt}/${this.maxRetries}`);

                // -------------------------------------------------------------
                // Create Timeout Controller
                // -------------------------------------------------------------
                // AbortController is a browser API that lets us cancel fetch requests
                // If the request takes too long, we "abort" it (cancel it)
                const controller = new AbortController();

                // setTimeout returns a timeout ID we can use to cancel later
                // If this fires, it calls controller.abort() which cancels the fetch
                const timeoutId = setTimeout(() => controller.abort(), this.timeout);

                // -------------------------------------------------------------
                // Make the HTTP Request
                // -------------------------------------------------------------
                // fetch() is the modern browser API for HTTP requests
                // It returns a Promise that resolves to a Response object
                const response = await fetch(url, {
                    signal: controller.signal,  // Link abort controller to this request
                    headers: {
                        'Accept': 'application/json'  // Tell server we want JSON back
                    }
                });

                // Cancel the timeout since request completed (success or error)
                clearTimeout(timeoutId);

                // -------------------------------------------------------------
                // Handle Rate Limiting (HTTP 429)
                // -------------------------------------------------------------
                // Rate limiting is when the server says "slow down, too many requests"
                // HTTP 429 is the standard status code for this
                if (response.status === 429) {
                    log.log(`🚨 [LichessClient] Rate limited - waiting ${this.rateLimitDelay/1000}s...`);
                    await this._sleep(this.rateLimitDelay);
                    continue; // "continue" skips to next loop iteration WITHOUT incrementing attempt
                }

                // -------------------------------------------------------------
                // Check for Other HTTP Errors
                // -------------------------------------------------------------
                // response.ok is true for status codes 200-299, false otherwise
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                // -------------------------------------------------------------
                // Parse JSON Response
                // -------------------------------------------------------------
                // .json() returns a Promise that parses the response body as JSON
                const data = await response.json();

                // Validate that the response has the expected structure
                this._validateResponse(data, operation);

                // Transform data to add calculated fields (like playrate)
                let transformedData = data;
                if (operation === 'getPositionStats') {
                    transformedData = this._transformPositionStats(data);
                }

                log.log(`Lichess API ${operation}: Success`);
                return transformedData;  // SUCCESS! Return the data

            } catch (error) {
                // -------------------------------------------------------------
                // Handle Request Failure
                // -------------------------------------------------------------
                lastError = error;  // Store for final error message

                // Log detailed error information for debugging
                log.warn(`❌ [LichessClient] ${operation}: Attempt ${attempt}/${this.maxRetries} failed:`, error.message);
                log.warn(`   Error details:`, {
                    url: url,
                    status: error.status || 'unknown',
                    statusText: error.statusText || 'unknown',
                    errorType: error.name || 'unknown',
                    stack: error.stack?.split('\n')[0] || 'no stack'  // Just first line of stack trace
                });

                // If we have retries left, wait and try again
                if (attempt < this.maxRetries) {
                    // Calculate delay with exponential backoff
                    // Math.pow(2, attempt-1) = 2^(attempt-1): 1, 2, 4, 8, 16...
                    const delay = this.retryDelay * Math.pow(2, attempt - 1);
                    log.log(`   🔄 Retrying in ${delay}ms... (exponential backoff, attempt ${attempt + 1}/${this.maxRetries})`);
                    await this._sleep(delay);
                } else {
                    log.error(`❌ [LichessClient] ${operation}: All ${this.maxRetries} attempts exhausted!`);
                }
                attempt++;  // Increment attempt counter for next iteration
            }
        }

        // If we get here, all attempts failed - throw the final error
        log.error(`❌ [LichessClient] ${operation}: Final failure after ${this.maxRetries} attempts`);
        log.error(`   Last error:`, lastError.message);
        log.error(`   Request details:`, { url, operation });
        throw new Error(`Lichess API ${operation} failed after ${this.maxRetries} attempts: ${lastError.message}`);
    }

    /**
     * =========================================================================
     * Validate API response structure (PRIVATE METHOD)
     * =========================================================================
     *
     * WHAT THIS METHOD DOES:
     * Checks that the API response has the expected format before we try to
     * use it. This prevents cryptic errors later if the API returns unexpected data.
     *
     * WHY VALIDATE?
     * APIs can change, have bugs, or return errors in unexpected formats.
     * Validating early means we can give clear error messages about what's wrong.
     *
     * @param {Object} data - The parsed JSON response from the API
     * @param {string} operation - Name of the operation for error messages
     *
     * @throws {Error} If the response doesn't match expected structure
     * @private
     */
    _validateResponse(data, operation) {
        // Check that we got an object (not null, undefined, or primitive type)
        if (!data || typeof data !== 'object') {
            throw new Error(`Invalid response format from ${operation}`);
        }

        // Specific validation for position statistics
        if (operation === 'getPositionStats') {
            // Must have a moves array
            if (!Array.isArray(data.moves)) {
                throw new Error('Response missing moves array');
            }

            // Each move must have required fields with correct types
            // This catches corrupted or malformed API responses
            for (const move of data.moves) {
                // move.san: Standard algebraic notation (e.g., "e4")
                // move.white/black/draws: Game counts, must be numbers
                if (!move.san || typeof move.white !== 'number' || typeof move.black !== 'number' || typeof move.draws !== 'number') {
                    throw new Error('Invalid move structure in response');
                }
            }
        }
    }

    /**
     * =========================================================================
     * Sleep utility for retry delays (PRIVATE METHOD)
     * =========================================================================
     *
     * WHAT THIS METHOD DOES:
     * Creates a Promise that resolves after a specified time. Used for
     * waiting between retry attempts.
     *
     * HOW IT WORKS:
     * JavaScript's setTimeout() calls a function after a delay.
     * We wrap it in a Promise so we can "await" it, making the code wait.
     *
     * @param {number} ms - Milliseconds to sleep (1000ms = 1 second)
     *
     * @returns {Promise<void>} Resolves after the specified time
     *
     * @example
     * await this._sleep(1000);  // Pause for 1 second
     * log.log('One second later...');
     *
     * @private
     */
    _sleep(ms) {
        // new Promise() creates a Promise that we control
        // The function inside receives "resolve" - calling it fulfills the Promise
        // setTimeout calls resolve after "ms" milliseconds
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * =========================================================================
     * Transform Lichess API response to BookBuilder format (PRIVATE METHOD)
     * =========================================================================
     *
     * WHAT THIS METHOD DOES:
     * The raw Lichess API response doesn't include some fields we need
     * (like playrate). This method adds those calculated fields.
     *
     * TRANSFORMATIONS:
     * - Calculates "playrate" for each move (how often it's played, as decimal)
     * - Adds "totalGames" for each move (sum of wins/draws/losses)
     *
     * WHY TRANSFORM HERE?
     * Centralizing the transformation ensures consistent data format throughout
     * the application. Other code doesn't need to know the raw API format.
     *
     * @param {Object} data - Raw API response with moves array
     *
     * @returns {Object} Transformed data with playrate and totalGames added
     *
     * @private
     */
    _transformPositionStats(data) {
        // Guard clause: return as-is if no valid moves array
        if (!data.moves || !Array.isArray(data.moves)) {
            return data;
        }

        // Calculate total games across ALL moves in the position
        // This is the denominator for playrate calculations
        const totalGames = LichessClient.getTotalGames(data);

        // Transform each move object to add calculated fields
        // .map() creates a new array by transforming each element
        const transformedMoves = data.moves.map(move => {
            // Count games where this specific move was played
            const moveGames = move.white + move.black + move.draws;

            // Calculate what percentage of games used this move
            const playrate = LichessClient.calculatePlayRate(move, totalGames);

            // Return a new object with all original properties plus new ones
            // The spread operator (...move) copies all properties from move
            return {
                ...move,            // Copy san, uci, white, black, draws, etc.
                playrate: playrate, // Add playrate (0.0 to 1.0)
                totalGames: moveGames // Add total games for this move
            };
        });

        // Return new data object with transformed moves
        // Again, spread operator copies all other properties (like opening name)
        return {
            ...data,
            moves: transformedMoves
        };
    }

    /**
     * =========================================================================
     * Calculate play rate percentage for a move (STATIC METHOD)
     * =========================================================================
     *
     * WHAT IS A STATIC METHOD?
     * Static methods belong to the CLASS, not instances. You call them as
     * LichessClient.calculatePlayRate(), not client.calculatePlayRate().
     * They're useful for pure calculations that don't need instance state.
     *
     * WHAT THIS METHOD DOES:
     * Calculates what percentage of games at this position used this move.
     * Example: If e4 was played in 1,000,000 games out of 2,000,000 total,
     * the play rate is 0.5 (50%).
     *
     * @param {Object} move - Move object with white, black, draws counts
     * @param {number} totalGames - Total games played from this position
     *
     * @returns {number} Play rate as decimal (0.0 to 1.0, not percentage)
     *   0.5 means 50% of games used this move
     */
    static calculatePlayRate(move, totalGames) {
        // Total games where this move was played
        const moveGames = move.white + move.black + move.draws;

        // Calculate ratio (with guard against division by zero)
        // The ternary operator (? :) checks if totalGames > 0
        return totalGames > 0 ? moveGames / totalGames : 0;
    }

    /**
     * =========================================================================
     * Get total games for a position from API response (STATIC METHOD)
     * =========================================================================
     *
     * WHAT THIS METHOD DOES:
     * Sums up all games played from a given position by adding up the games
     * for each possible move.
     *
     * @param {Object} positionData - Response from getPositionStats
     *
     * @returns {number} Total number of games played from this position
     *
     * @example
     * const total = LichessClient.getTotalGames(positionStats);
     * // If position has 3 moves with 100, 200, 300 games, returns 600
     */
    static getTotalGames(positionData) {
        // Guard clause: return 0 if no valid moves array
        if (!positionData.moves || !Array.isArray(positionData.moves)) {
            return 0;
        }

        // .reduce() combines all array elements into a single value
        // Arguments: (accumulator function, initial value)
        // For each move, add its game count to the running total
        return positionData.moves.reduce((total, move) => {
            // Add white wins + black wins + draws for this move
            return total + move.white + move.black + move.draws;
        }, 0);  // Start with total = 0
    }
}

// =============================================================================
// MODULE EXPORT
// =============================================================================
// "export default" makes this class available for import in other files
// Other files can import it with: import LichessClient from './api/LichessClient.js'
export default LichessClient;
