/**
 * Jest test setup for BookBuilder Client
 *
 * This file runs before all tests and sets up global test utilities
 * for golden master testing and chess domain validation.
 */

// Custom matchers for chess domain testing
expect.extend({
  /**
   * Compare two PGN strings with tolerance for floating-point differences
   */
  toMatchPgnWithTolerance(received, expected, tolerance = 0.01) {
    if (typeof received !== 'string' || typeof expected !== 'string') {
      return {
        pass: false,
        message: () => 'Both arguments must be strings'
      };
    }

    // Normalize whitespace
    const normalizeWhitespace = (str) => str.replace(/\s+/g, ' ').trim();
    const receivedNorm = normalizeWhitespace(received);
    const expectedNorm = normalizeWhitespace(expected);

    // Check if they're exactly equal first
    if (receivedNorm === expectedNorm) {
      return { pass: true };
    }

    // Extract and compare percentages with tolerance
    const percentageRegex = /([+-]?\d+\.?\d*)%/g;
    const receivedPercentages = [...receivedNorm.matchAll(percentageRegex)].map(m => parseFloat(m[1]));
    const expectedPercentages = [...expectedNorm.matchAll(percentageRegex)].map(m => parseFloat(m[1]));

    if (receivedPercentages.length !== expectedPercentages.length) {
      return {
        pass: false,
        message: () => `Different number of percentages: ${receivedPercentages.length} vs ${expectedPercentages.length}`
      };
    }

    // Check each percentage within tolerance
    for (let i = 0; i < receivedPercentages.length; i++) {
      const diff = Math.abs(receivedPercentages[i] - expectedPercentages[i]);
      if (diff > tolerance) {
        return {
          pass: false,
          message: () => `Percentage ${i} differs by ${diff}%: ${receivedPercentages[i]} vs ${expectedPercentages[i]}`
        };
      }
    }

    // Replace percentages with placeholders and compare structure
    const stripPercentages = (str) => str.replace(percentageRegex, 'XX.XX%');
    const receivedStructure = stripPercentages(receivedNorm);
    const expectedStructure = stripPercentages(expectedNorm);

    if (receivedStructure !== expectedStructure) {
      return {
        pass: false,
        message: () => `PGN structure differs:\nReceived: ${receivedStructure}\nExpected: ${expectedStructure}`
      };
    }

    return { pass: true };
  },

  /**
   * Validate chess position is legal
   */
  toBeValidChessPosition(received) {
    try {
      const { Chess } = require('chess.js');
      const chess = new Chess(received);
      return { pass: true };
    } catch (error) {
      return {
        pass: false,
        message: () => `Invalid chess position: ${error.message}`
      };
    }
  },

  /**
   * Check if PGN follows proper format
   */
  toBeValidPgn(received) {
    if (typeof received !== 'string') {
      return {
        pass: false,
        message: () => 'PGN must be a string'
      };
    }

    const hasEvent = /\[Event\s+"[^"]+"\]/.test(received);
    const hasMoves = /\d+\.\s*[a-zA-Z][a-zA-Z0-9\-\+\#\=]*/.test(received);
    const hasAnnotations = received.includes('{') && received.includes('}');

    if (!hasEvent) {
      return {
        pass: false,
        message: () => 'PGN missing Event header'
      };
    }

    if (!hasMoves) {
      return {
        pass: false,
        message: () => 'PGN missing valid moves'
      };
    }

    if (!hasAnnotations) {
      return {
        pass: false,
        message: () => 'PGN missing annotations'
      };
    }

    return { pass: true };
  }
});

// Global test utilities
global.testUtils = {
  /**
   * Load golden master file content
   */
  loadGoldenMaster: async (filename) => {
    const fs = require('fs').promises;
    const path = require('path');
    const goldenPath = path.join(__dirname, 'golden-master', filename);
    return await fs.readFile(goldenPath, 'utf8');
  },

  /**
   * Create test chess position
   */
  createTestPosition: (moves = []) => {
    const { Chess } = require('chess.js');
    const chess = new Chess();
    moves.forEach(move => chess.move(move));
    return chess;
  },

  /**
   * Mock Lichess API response
   */
  mockLichessResponse: (fen, moves) => ({
    white: Math.floor(Math.random() * 1000000),
    black: Math.floor(Math.random() * 1000000),
    draws: Math.floor(Math.random() * 100000),
    moves: moves || []
  }),

  /**
   * Generate test opening config
   */
  createTestConfig: (options = {}) => ({
    DEPTHLIKELIHOOD: 0.05,
    MINPLAYRATE: 0.005,
    MINGAMES: 15,
    CONTINUATIONGAMES: 8,
    DRAWSAREHALF: 0,
    ...options
  })
};

// Console output control for cleaner test output
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeEach(() => {
  // Suppress console.log during tests unless running with --verbose
  if (!process.argv.includes('--verbose')) {
    console.log = jest.fn();
  }
});

afterEach(() => {
  // Restore console.log
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});

// Global test constants
global.TEST_OPENINGS = {
  RUY_LOPEZ: {
    name: 'Ruy_Lopez',
    pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5',
    perspective: 'white'
  },
  KINGS_INDIAN: {
    name: 'Kings_Indian',
    pgn: '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6',
    perspective: 'black'
  }
};

console.log('✓ BookBuilder test environment initialized');