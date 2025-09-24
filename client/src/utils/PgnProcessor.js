/**
 * PgnProcessor.js - PGN parsing and mainline extraction utility
 *
 * Handles parsing of PGN (Portable Game Notation) input and extracts
 * mainline moves for chess opening repertoire generation.
 */

import { parse } from '/node_modules/@mliebelt/pgn-parser/lib/index.umd.js';

class PgnProcessor {
    /**
     * Process a single PGN string and extract opening information
     * @param {string} pgnString - The PGN input string
     * @returns {Object} Opening object with name, moves, and priority
     */
    static processPgn(pgnString) {
        try {
            if (!pgnString || typeof pgnString !== 'string' || pgnString.trim() === '') {
                throw new Error('PGN input is empty or invalid');
            }

            // Parse the PGN using mliebelt's parser
            const game = parse(pgnString.trim(), { startRule: "game" });

            if (!game) {
                throw new Error('Failed to parse PGN - invalid format');
            }

            // Extract mainline moves (ignore variations)
            const moves = this.extractMainlineMoves(game);

            if (moves.length === 0) {
                throw new Error('No moves found in PGN');
            }

            // Generate opening name from headers or moves
            const name = this.generateOpeningName(game, moves);

            return {
                name: name,
                moves: moves,
                priority: 1 // Default priority for single PGN input
            };

        } catch (error) {
            console.error('PGN Processing Error:', error);
            throw new Error(`PGN parsing failed: ${error.message}`);
        }
    }

    /**
     * Extract mainline moves from parsed PGN game
     * @param {Object} game - Parsed PGN game object
     * @returns {Array<string>} Array of mainline moves in SAN notation
     */
    static extractMainlineMoves(game) {
        const moves = [];

        if (!game.moves || !Array.isArray(game.moves)) {
            return moves;
        }

        // Process moves and filter out variations
        for (const moveEntry of game.moves) {
            // Skip if this is a variation (RAV)
            if (moveEntry.variation) {
                continue;
            }

            // Extract the actual move notation
            let move;
            if (moveEntry.notation && moveEntry.notation.notation) {
                move = moveEntry.notation.notation;
            } else if (moveEntry.move) {
                move = moveEntry.move;
            } else if (typeof moveEntry === 'string') {
                move = moveEntry;
            }

            if (move && move.trim() !== '') {
                moves.push(move.trim());
            }
        }

        return moves;
    }

    /**
     * Generate opening name from PGN headers or moves
     * @param {Object} game - Parsed PGN game object
     * @returns {string} Generated opening name
     */
    static generateOpeningName(game, moves) {
        // Try to use headers first
        if (game.tags) {
            // Look for common opening-related headers
            const openingHeaders = ['Opening', 'ECO', 'Event', 'White', 'Black'];

            for (const header of openingHeaders) {
                const value = game.tags[header];
                if (value && value !== '?' && value !== '-' && value.length > 0) {
                    // Clean up the header value
                    let name = value.replace(/['"]/g, '').trim();

                    // For Event headers, clean up tournament info
                    if (header === 'Event') {
                        name = name.replace(/\d{4}.*$/, '').trim();
                    }

                    // For player names, format as "White vs Black"
                    if (header === 'White' && game.tags.Black) {
                        name = `${value} vs ${game.tags.Black}`;
                    }

                    if (name.length > 3) { // Avoid very short names
                        return name;
                    }
                }
            }
        }

        // Fallback: Generate name from first few moves
        if (moves && moves.length > 0) {
            const moveCount = Math.min(4, moves.length);
            const firstMoves = moves.slice(0, moveCount).join(' ');
            return `Opening: ${firstMoves}${moves.length > moveCount ? '...' : ''}`;
        }

        // Ultimate fallback
        return 'Chess Opening';
    }

    /**
     * Validate PGN format without full parsing
     * @param {string} pgnString - The PGN input string
     * @returns {Object} Validation result with isValid boolean and error message
     */
    static validatePgn(pgnString) {
        try {
            if (!pgnString || typeof pgnString !== 'string') {
                return { isValid: false, error: 'PGN input is required' };
            }

            const trimmed = pgnString.trim();
            if (trimmed === '') {
                return { isValid: false, error: 'PGN input cannot be empty' };
            }

            // Quick validation - check for basic PGN structure
            const hasHeaders = /\[\s*\w+\s*"[^"]*"\s*\]/.test(trimmed);
            const hasMoves = /\b[1-9]\d*\.\s*[a-zA-Z]/.test(trimmed);

            if (!hasHeaders && !hasMoves) {
                return { isValid: false, error: 'Invalid PGN format - missing headers and moves' };
            }

            // Try actual parsing for more thorough validation
            const game = parse(trimmed, { startRule: "game" });
            if (!game) {
                return { isValid: false, error: 'PGN parsing failed - invalid syntax' };
            }

            return { isValid: true, error: null };

        } catch (error) {
            return { isValid: false, error: `PGN validation error: ${error.message}` };
        }
    }

    /**
     * Clean and format PGN string
     * @param {string} pgnString - Raw PGN input
     * @returns {string} Cleaned PGN string
     */
    static cleanPgn(pgnString) {
        if (!pgnString) return '';

        return pgnString
            .replace(/\r\n/g, '\n')           // Normalize line endings
            .replace(/\n\s*\n/g, '\n\n')      // Remove excessive blank lines
            .replace(/\s+/g, ' ')             // Normalize spaces in moves
            .replace(/\[\s*(\w+)\s*"([^"]*)"\s*\]/g, '[$1 "$2"]') // Clean headers
            .trim();
    }
}

export default PgnProcessor;