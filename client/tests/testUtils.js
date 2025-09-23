/**
 * Test Utilities for BookBuilder JavaScript Migration
 *
 * Provides helper functions and custom Jest matchers for testing
 * chess repertoire generation functionality.
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Test Configuration Objects
 */
const TEST_OPENINGS = {
    RUY_LOPEZ: {
        name: 'Ruy Lopez',
        fen: 'rnbqkbnr/pppp1ppp/5n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
        perspective: 'white',
        moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']
    },
    KINGS_INDIAN: {
        name: 'Kings Indian',
        fen: 'rnbqk2r/ppp1ppbp/3p1np1/8/2PPP3/2N5/PP3PPP/R1BQKBNR w KQkq - 0 5',
        perspective: 'black',
        moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6']
    }
};

/**
 * Test Utilities Class
 */
class TestUtils {
    /**
   * Load a golden master PGN file for comparison
   * @param {string} filename - Golden master filename
   * @returns {Promise<string>} File contents
   */
    static async loadGoldenMaster(filename) {
        const filePath = path.join(__dirname, 'golden-master', filename);
        return await fs.readFile(filePath, 'utf8');
    }

    /**
   * Create a test configuration object
   * @param {Object} overrides - Configuration overrides
   * @returns {Object} Test configuration
   */
    static createTestConfig(overrides = {}) {
        return {
            MINDEPTH: 4,
            MAXDEPTH: 15,
            MINPLAYRATE: 0.01,
            MINGAMES: 19,
            CONTINUATIONGAMES: 10,
            ALPHA: 0.001,
            DEPTHLIKELIHOOD: 0.03,
            DRAWSAREHALF: 0,
            // Engine settings
            CAREABOUTENGINE: 1,
            ENGINEDEPTH: 20,
            ENGINEFINISH: 1,
            SOUNDNESSLIMIT: -99,
            LOSSLIMIT: -99,
            IGNORELOSSLIMIT: 300,
            ...overrides
        };
    }

    /**
   * Create a test chess position
   * @param {string} type - Position type ('starting', 'ruy-lopez', 'kings-indian')
   * @returns {Object} Position object with FEN and metadata
   */
    static createTestPosition(type = 'starting') {
        const positions = {
            starting: {
                fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                description: 'Starting position'
            },
            'ruy-lopez': TEST_OPENINGS.RUY_LOPEZ,
            'kings-indian': TEST_OPENINGS.KINGS_INDIAN
        };

        return positions[type] || positions.starting;
    }

    /**
   * Mock Lichess API response for testing
   * @param {Object} overrides - Response overrides
   * @returns {Object} Mock API response
   */
    static mockLichessResponse(overrides = {}) {
        return {
            moves: [
                {
                    san: 'e4',
                    uci: 'e2e4',
                    white: 1000000,
                    black: 800000,
                    draws: 200000
                },
                {
                    san: 'd4',
                    uci: 'd2d4',
                    white: 900000,
                    black: 750000,
                    draws: 150000
                }
            ],
            white: 2000000,
            black: 1550000,
            draws: 350000,
            ...overrides
        };
    }

    /**
   * Compare two PGN strings with tolerance for floating point differences
   * @param {string} actual - Actual PGN output
   * @param {string} expected - Expected PGN output
   * @param {number} tolerance - Floating point tolerance (default 0.01%)
   * @returns {Object} Comparison result
   */
    static comparePgnWithTolerance(actual, expected, tolerance = 0.0001) {
    // Extract numeric values from both PGNs
        const numRegex = /(\d+\.\d+)%/g;

        const actualNumbers = [];
        const expectedNumbers = [];

        let match;
        while ((match = numRegex.exec(actual)) !== null) {
            actualNumbers.push(parseFloat(match[1]));
        }

        numRegex.lastIndex = 0;
        while ((match = numRegex.exec(expected)) !== null) {
            expectedNumbers.push(parseFloat(match[1]));
        }

        // Compare numbers with tolerance
        if (actualNumbers.length !== expectedNumbers.length) {
            return {
                match: false,
                reason: `Number count mismatch: ${actualNumbers.length} vs ${expectedNumbers.length}`
            };
        }

        for (let i = 0; i < actualNumbers.length; i++) {
            const diff = Math.abs(actualNumbers[i] - expectedNumbers[i]);
            if (diff > tolerance) {
                return {
                    match: false,
                    reason: `Number ${i} differs by ${diff}%: ${actualNumbers[i]} vs ${expectedNumbers[i]}`
                };
            }
        }

        // Compare structure without numbers
        const actualStructure = actual.replace(/\d+\.\d+%/g, 'X.XX%');
        const expectedStructure = expected.replace(/\d+\.\d+%/g, 'X.XX%');

        return {
            match: actualStructure === expectedStructure,
            reason: actualStructure === expectedStructure ? null : 'Structural differences found'
        };
    }

    /**
   * Validate PGN format
   * @param {string} pgn - PGN content to validate
   * @returns {boolean} True if valid PGN format
   */
    static isValidPgn(pgn) {
        if (!pgn || typeof pgn !== 'string') {
            return false;
        }

        // Check for required PGN elements
        const hasEvent = pgn.includes('[Event');
        const hasMoves = /\d+\.\s*\w+/.test(pgn);
        const hasAnnotations = pgn.includes('Move playrates:') || pgn.includes('{');

        return hasEvent && (hasMoves || hasAnnotations);
    }
}

/**
 * Custom Jest Matchers
 */
expect.extend({
    /**
   * Custom matcher for PGN validation
   */
    toBeValidPgn(received) {
        const pass = TestUtils.isValidPgn(received);

        if (pass) {
            return {
                message: () => `Expected ${received} not to be valid PGN`,
                pass: true,
            };
        } else {
            return {
                message: () => `Expected ${received} to be valid PGN format`,
                pass: false,
            };
        }
    },

    /**
   * Custom matcher for PGN comparison with tolerance
   */
    toMatchPgnWithTolerance(received, expected, tolerance = 0.0001) {
        const result = TestUtils.comparePgnWithTolerance(received, expected, tolerance);

        if (result.match) {
            return {
                message: () => `Expected PGNs not to match within ${tolerance}% tolerance`,
                pass: true,
            };
        } else {
            return {
                message: () => `Expected PGNs to match within ${tolerance}% tolerance. ${result.reason}`,
                pass: false,
            };
        }
    },

    /**
   * Custom matcher for statistical precision
   */
    toBeWithinStatisticalTolerance(received, expected, tolerance = 0.0001) {
        if (typeof received !== 'number' || typeof expected !== 'number') {
            return {
                message: () => `Expected numbers, got ${typeof received} and ${typeof expected}`,
                pass: false,
            };
        }

        const diff = Math.abs(received - expected);
        const pass = diff <= tolerance;

        if (pass) {
            return {
                message: () => `Expected ${received} not to be within ${tolerance} of ${expected}`,
                pass: true,
            };
        } else {
            return {
                message: () => `Expected ${received} to be within ${tolerance} of ${expected}, but difference was ${diff}`,
                pass: false,
            };
        }
    }
});

// Export utilities and constants
module.exports = {
    TestUtils,
    TEST_OPENINGS,
    testUtils: TestUtils  // Alias for backward compatibility
};
