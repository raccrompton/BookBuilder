/**
 * Lichess API Client for position and move statistics
 * Handles API calls with retry logic and error handling
 */
class LichessClient {
  constructor(config = {}) {
    this.baseUrl = 'https://explorer.lichess.ovh';
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
    this.timeout = config.timeout || 10000;
  }

  /**
   * Get position statistics from Lichess opening explorer
   * @param {string} fen - Position in FEN notation
   * @param {Object} options - Query options (speeds, ratings, variant)
   * @returns {Promise<Object>} Position statistics with moves array
   */
  async getPositionStats(fen, options = {}) {
    const params = new URLSearchParams({
      fen: fen,
      variant: options.variant || 'standard',
      speeds: options.speeds || 'blitz,rapid,classical,correspondence',
      ratings: options.ratings || '1600,1800,2000,2200,2500',
      moves: options.moves || '10'
    });

    const url = `${this.baseUrl}/lichess?${params}`;

    return this._makeRequestWithRetry(url, 'getPositionStats');
  }

  /**
   * Get statistics for a specific move from a position
   * @param {string} fen - Position in FEN notation
   * @param {string} move - Move in UCI notation (e.g., 'e2e4')
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Move-specific statistics
   */
  async getMoveStats(fen, move, options = {}) {
    // First get position stats, then filter for the specific move
    const positionStats = await this.getPositionStats(fen, options);

    if (!positionStats.moves || !Array.isArray(positionStats.moves)) {
      throw new Error('Invalid position data returned from API');
    }

    const moveStats = positionStats.moves.find(m => m.uci === move || m.san === move);

    if (!moveStats) {
      throw new Error(`Move ${move} not found in position statistics`);
    }

    return moveStats;
  }

  /**
   * Make HTTP request with retry logic
   * @private
   */
  async _makeRequestWithRetry(url, operation) {
    let lastError;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`Lichess API ${operation}: Attempt ${attempt}/${this.maxRetries}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'BookBuilder-JS/1.0'
          }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Validate response structure
        this._validateResponse(data, operation);

        console.log(`Lichess API ${operation}: Success`);
        return data;

      } catch (error) {
        lastError = error;
        console.warn(`Lichess API ${operation}: Attempt ${attempt} failed:`, error.message);

        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`Retrying in ${delay}ms...`);
          await this._sleep(delay);
        }
      }
    }

    throw new Error(`Lichess API ${operation} failed after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Validate API response structure
   * @private
   */
  _validateResponse(data, operation) {
    if (!data || typeof data !== 'object') {
      throw new Error(`Invalid response format from ${operation}`);
    }

    if (operation === 'getPositionStats') {
      if (!Array.isArray(data.moves)) {
        throw new Error('Response missing moves array');
      }

      // Validate move structure
      for (const move of data.moves) {
        if (!move.san || typeof move.white !== 'number' || typeof move.black !== 'number' || typeof move.draws !== 'number') {
          throw new Error('Invalid move structure in response');
        }
      }
    }
  }

  /**
   * Sleep utility for retry delays
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate play rate percentage for a move
   * @param {Object} move - Move object from API response
   * @param {number} totalGames - Total games in position
   * @returns {number} Play rate as decimal (0.0 to 1.0)
   */
  static calculatePlayRate(move, totalGames) {
    const moveGames = move.white + move.black + move.draws;
    return totalGames > 0 ? moveGames / totalGames : 0;
  }

  /**
   * Get total games for a position from API response
   * @param {Object} positionData - Response from getPositionStats
   * @returns {number} Total number of games
   */
  static getTotalGames(positionData) {
    if (!positionData.moves || !Array.isArray(positionData.moves)) {
      return 0;
    }

    return positionData.moves.reduce((total, move) => {
      return total + move.white + move.black + move.draws;
    }, 0);
  }
}

export default LichessClient;