/**
 * =============================================================================
 * uci-to-san.test.js - Unit Tests for UCI to SAN Move Conversion
 * =============================================================================
 *
 * PURPOSE:
 * Tests the uciToSan function that converts UCI format moves (e.g., "e2e4") to
 * Standard Algebraic Notation (e.g., "e4", "Nf3", "O-O"). Proper conversion
 * requires board position context to determine piece type and handle special
 * moves like castling.
 *
 * KEY CONCEPTS:
 * - UCI: Universal Chess Interface format (e.g., "e2e4", "g1f3", "e1g1")
 * - SAN: Standard Algebraic Notation used in chess literature (e.g., "e4", "Nf3", "O-O")
 * - FEN: Position string needed for context (which piece is on which square)
 *
 * HOW IT FITS IN:
 * - Used by: MCP server's evaluate_position tool to display best moves
 * - Depends on: chess.js library for position context and move validation
 */

// Import the function to test
const { uciToSan } = require('../src/index.js');

// =============================================================================
// Test Constants - FEN positions for various test scenarios
// =============================================================================

// Starting position - white to move
const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// After 1.e4 - black to move
const AFTER_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

// Position where white can castle kingside (after 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5)
const CASTLING_READY_FEN = 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';

// Position where white can castle queenside
const QUEENSIDE_CASTLE_FEN = 'r3kbnr/ppp1pppp/2nqb3/3p4/3P4/2NQBN2/PPP1PPPP/R3KB1R w KQkq - 6 6';

// Pawn promotion position - white pawn on d7
const PROMOTION_FEN = '8/3P4/8/8/8/8/8/4K2k w - - 0 1';

// =============================================================================
// Test Suite: uciToSan
// =============================================================================

describe('uciToSan', () => {
    // =========================================================================
    // Pawn Moves
    // =========================================================================

    describe('pawn moves', () => {
        test('converts e2e4 to e4 from starting position', () => {
            // Arrange
            const uciMove = 'e2e4';
            const fen = STARTING_FEN;

            // Act
            const result = uciToSan(uciMove, fen);

            // Assert - pawn moves don't include piece letter
            expect(result).toBe('e4');
        });

        test('converts d7d5 to d5 for black pawn', () => {
            // Arrange
            const uciMove = 'd7d5';
            const fen = AFTER_E4_FEN;

            // Act
            const result = uciToSan(uciMove, fen);

            // Assert
            expect(result).toBe('d5');
        });
    });

    // =========================================================================
    // Piece Moves
    // =========================================================================

    describe('piece moves', () => {
        test('converts g1f3 to Nf3 (knight move)', () => {
            // Arrange
            const uciMove = 'g1f3';
            const fen = STARTING_FEN;

            // Act
            const result = uciToSan(uciMove, fen);

            // Assert - knight moves prefixed with 'N'
            expect(result).toBe('Nf3');
        });

        test('converts f1c4 to Bc4 (bishop move)', () => {
            // Arrange - after 1.e4 e5 2.Nf3 Nc6
            const uciMove = 'f1c4';
            const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';

            // Act
            const result = uciToSan(uciMove, fen);

            // Assert - bishop moves prefixed with 'B'
            expect(result).toBe('Bc4');
        });
    });

    // =========================================================================
    // Castling
    // =========================================================================

    describe('castling', () => {
        test('converts e1g1 to O-O (kingside castling)', () => {
            // Arrange - position where kingside castle is legal
            const uciMove = 'e1g1';
            const fen = CASTLING_READY_FEN;

            // Act
            const result = uciToSan(uciMove, fen);

            // Assert - kingside castle notation
            expect(result).toBe('O-O');
        });

        test('converts e1c1 to O-O-O (queenside castling)', () => {
            // Arrange - position where queenside castle is legal
            const uciMove = 'e1c1';
            const fen = QUEENSIDE_CASTLE_FEN;

            // Act
            const result = uciToSan(uciMove, fen);

            // Assert - queenside castle notation
            expect(result).toBe('O-O-O');
        });
    });

    // =========================================================================
    // Pawn Promotion
    // =========================================================================

    describe('pawn promotion', () => {
        test('converts d7d8q to d8=Q (promotion to queen)', () => {
            // Arrange - pawn on 7th rank about to promote
            const uciMove = 'd7d8q';
            const fen = PROMOTION_FEN;

            // Act
            const result = uciToSan(uciMove, fen);

            // Assert - promotion notation includes = and piece
            expect(result).toBe('d8=Q');
        });
    });

    // =========================================================================
    // Error Handling
    // =========================================================================

    describe('error handling', () => {
        test('returns original move if conversion fails', () => {
            // Arrange - invalid UCI move that cannot be converted
            const invalidMove = 'invalid';
            const fen = STARTING_FEN;

            // Act
            const result = uciToSan(invalidMove, fen);

            // Assert - should return original move rather than throw
            expect(result).toBe('invalid');
        });

        test('returns original move for malformed UCI input', () => {
            // Arrange - too short to be valid UCI
            const shortMove = 'e2';
            const fen = STARTING_FEN;

            // Act
            const result = uciToSan(shortMove, fen);

            // Assert - should return as-is
            expect(result).toBe('e2');
        });
    });
});
