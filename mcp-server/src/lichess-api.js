/**
 * =============================================================================
 * Lichess API Client - Opening Statistics
 * =============================================================================
 *
 * PURPOSE:
 * Client for fetching position statistics from the Lichess Opening Explorer API.
 * Wraps the Lichess explorer API to provide move statistics for chess positions.
 *
 * HOW IT FITS IN:
 * - Used by: MCP server's analyze_position tool
 * - Depends on: Lichess Opening Explorer API (https://explorer.lichess.ovh)
 *
 * KEY CONCEPTS:
 * - FEN: Forsyth-Edwards Notation for representing chess positions
 * - Opening Statistics: Aggregated game outcomes for a given position
 * - Playrate: Percentage of games where a specific move was played
 */

// Base URL for the Lichess Opening Explorer API
const BASE_URL = 'https://explorer.lichess.ovh'; // Lichess explorer endpoint for position statistics

/**
 * LichessApi class - Fetches opening statistics from Lichess
 *
 * WHAT IT DOES:
 * Provides a simple interface to query the Lichess Opening Explorer API
 * for statistics about chess positions.
 *
 * EXAMPLE:
 * const api = new LichessApi();
 * const stats = await api.getOpeningStats('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
 */
class LichessApi {
    /**
     * Get opening statistics for a chess position
     *
     * WHAT IT DOES:
     * Fetches aggregated game statistics from Lichess for a given position.
     * Returns win/draw/loss counts and move statistics.
     *
     * PARAMETERS:
     * @param {string} fen - Chess position in FEN notation
     *   Example: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
     * @param {Object} options - Optional query parameters
     *   @param {string[]} options.speeds - Time controls to include (e.g., ['rapid', 'classical'])
     *   @param {number[]} options.ratings - Rating bands to include (e.g., [1800, 2000])
     *
     * RETURNS:
     * @returns {Promise<Object>} Statistics object containing:
     *   - white: Number of games won by white
     *   - draws: Number of drawn games
     *   - black: Number of games won by black
     *   - moves: Array of move objects with statistics
     *
     * THROWS:
     * @throws {Error} If FEN is missing, empty, null, undefined, or invalid format
     */
    async getOpeningStats(fen, options = {}) {
        // Validate FEN parameter - FEN is required for the API call
        if (fen === undefined || fen === null) {
            throw new Error('FEN is required'); // FEN must be provided
        }

        if (typeof fen !== 'string' || fen.trim() === '') {
            throw new Error('FEN must be a non-empty string'); // FEN must be a valid string
        }

        // Basic FEN validation - check for required parts (6 space-separated fields)
        const fenParts = fen.trim().split(' '); // FEN has 6 space-separated parts
        if (fenParts.length < 2) {
            throw new Error('Invalid FEN format'); // FEN must have at least board and turn
        }

        // Check board part has 8 ranks separated by /
        const boardPart = fenParts[0]; // First part is the board position
        const ranks = boardPart.split('/'); // Each rank separated by forward slash
        if (ranks.length !== 8) {
            throw new Error('Invalid FEN format: must have 8 ranks'); // Chess board has 8 ranks
        }

        // Build URL parameters for the API request
        const params = new URLSearchParams(); // URLSearchParams handles URL encoding
        params.set('fen', fen); // Add FEN to query parameters

        // Add speeds parameter if provided - controls which time controls to include
        if (options.speeds && Array.isArray(options.speeds)) {
            params.set('speeds', options.speeds.join(',')); // Convert array to comma-separated string
        }

        // Add ratings parameter if provided - controls which rating bands to include
        if (options.ratings && Array.isArray(options.ratings)) {
            params.set('ratings', options.ratings.join(',')); // Convert array to comma-separated string
        }

        // Construct full API URL with query parameters
        const url = `${BASE_URL}/lichess?${params.toString()}`; // Full URL for API request

        // Make HTTP request to Lichess API
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json' // Request JSON response format
            }
        });

        // Check if request was successful (status 200-299)
        if (!response.ok) {
            throw new Error(`Lichess API error: ${response.status} ${response.statusText}`); // API returned error
        }

        // Parse JSON response from API
        const data = await response.json(); // Convert response body to JavaScript object

        // Transform response to match expected format with playrate and totalGames
        return this._transformResponse(data); // Add calculated fields to each move
    }

    /**
     * Transform Lichess API response to add calculated fields
     *
     * WHAT IT DOES:
     * Adds playrate and totalGames to each move in the response.
     * Playrate is the percentage of games where this move was played.
     *
     * @param {Object} data - Raw API response from Lichess
     * @returns {Object} Transformed data with playrate and totalGames added
     * @private
     */
    _transformResponse(data) {
        // Calculate total games across all moves (denominator for playrate)
        const totalGamesInPosition = data.moves.reduce((sum, move) => {
            return sum + move.white + move.draws + move.black; // Sum all outcomes for each move
        }, 0); // Start with sum = 0

        // Transform each move to add calculated fields
        const transformedMoves = data.moves.map(move => {
            // Total games for this specific move
            const moveTotal = move.white + move.draws + move.black; // Sum outcomes for this move

            // Calculate playrate as percentage (0-100)
            const playrate = totalGamesInPosition > 0
                ? (moveTotal / totalGamesInPosition) * 100 // Percentage of games with this move
                : 0; // Avoid division by zero

            // Return move with added fields
            return {
                san: move.san, // Standard algebraic notation (e.g., 'e4')
                white: move.white, // Games won by white after this move
                draws: move.draws, // Drawn games after this move
                black: move.black, // Games won by black after this move
                playrate: playrate, // Percentage of games with this move (0-100)
                totalGames: moveTotal // Total games where this move was played
            };
        });

        // Return transformed response with same structure but enhanced moves
        return {
            white: data.white, // Total white wins in this position
            draws: data.draws, // Total draws in this position
            black: data.black, // Total black wins in this position
            moves: transformedMoves // Enhanced move array with playrate and totalGames
        };
    }
}

module.exports = { LichessApi };
