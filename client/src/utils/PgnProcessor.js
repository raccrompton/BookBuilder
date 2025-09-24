/**
 * PgnProcessor.js - PGN parsing and mainline extraction utility
 *
 * Handles parsing of PGN (Portable Game Notation) input and extracts
 * mainline moves for chess opening repertoire generation.
 */

// Use a script tag to load the UMD module globally
let pgnParser = null;

async function loadParser() {
    if (pgnParser) {
        return pgnParser;
    }

    return new Promise((resolve, reject) => {
        // Check if already loaded globally
        if (window.PgnParser && window.PgnParser.parse) {
            pgnParser = window.PgnParser;
            resolve(pgnParser);
            return;
        }

        // Load via script tag
        const script = document.createElement('script');
        script.src = '/node_modules/@mliebelt/pgn-parser/lib/index.umd.js';
        script.onload = () => {
            if (window.PgnParser && window.PgnParser.parse) {
                pgnParser = window.PgnParser;
                resolve(pgnParser);
            } else {
                reject(new Error('PGN parser not found after loading'));
            }
        };
        script.onerror = () => reject(new Error('Failed to load PGN parser script'));
        document.head.appendChild(script);
    });
}

class PgnProcessor {
    /**
     * Process a single PGN string and extract opening information
     * @param {string} pgnString - The PGN input string
     * @returns {Object} Opening object with name, moves, and priority
     */
    static async processPgn(pgnString) {
        try {
            if (!pgnString || typeof pgnString !== 'string' || pgnString.trim() === '') {
                throw new Error('PGN input is empty or invalid');
            }

            // Preprocess and normalize the PGN input
            const normalizedPgn = this.preprocessPgn(pgnString.trim());

            // Parse the PGN using mliebelt's parser
            const parser = await loadParser();
            if (!parser || !parser.parse) {
                throw new Error('Failed to load PGN parser');
            }
            const game = parser.parse(normalizedPgn, { startRule: "game" });

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
    static async validatePgn(pgnString) {
        try {
            if (!pgnString || typeof pgnString !== 'string') {
                return { isValid: false, error: 'PGN input is required' };
            }

            const trimmed = pgnString.trim();
            if (trimmed === '') {
                return { isValid: false, error: 'PGN input cannot be empty' };
            }

            // Check for weak PGN format first (like "e4 e5")
            const hasHeaders = /\[\s*\w+\s*"[^"]*"\s*\]/.test(trimmed);
            const hasMoves = /\b[1-9]\d*\.\s*[a-zA-Z]/.test(trimmed);
            const hasWeakMoves = /^[a-zA-Z][a-zA-Z0-9+#=\-]*(\s+[a-zA-Z][a-zA-Z0-9+#=\-]*)*\s*$/.test(trimmed);

            if (!hasHeaders && !hasMoves && !hasWeakMoves) {
                return { isValid: false, error: 'Invalid PGN format - missing headers and moves' };
            }

            // Try actual parsing for more thorough validation
            const normalizedPgn = this.preprocessPgn(trimmed);
            const parser = await loadParser();
            if (!parser || !parser.parse) {
                return { isValid: false, error: 'Failed to load PGN parser' };
            }
            const game = parser.parse(normalizedPgn, { startRule: "game" });
            if (!game) {
                return { isValid: false, error: 'PGN parsing failed - invalid syntax' };
            }

            return { isValid: true, error: null };

        } catch (error) {
            return { isValid: false, error: `PGN validation error: ${error.message}` };
        }
    }

    /**
     * Preprocess and normalize PGN input for parsing
     * Handles weakly formatted input like "e4 e5" and converts to proper PGN
     * @param {string} pgnString - Raw PGN input
     * @returns {string} Normalized PGN string
     */
    static preprocessPgn(pgnString) {
        if (!pgnString) return '';

        let pgn = pgnString.trim();

        // Check if this looks like just moves without proper PGN structure
        const hasHeaders = /\[[\w\s]+\s*\"[^\"]*\"\s*\]/.test(pgn);
        const hasMoveNumbers = /\b\d+\.\s*[a-zA-Z]/.test(pgn);

        // If no headers and no move numbers, treat as simple move sequence
        if (!hasHeaders && !hasMoveNumbers) {
            // Split on whitespace and filter out empty strings
            const moves = pgn.split(/\s+/).filter(move => move.trim() !== '');

            if (moves.length > 0) {
                // Convert simple moves like "e4 e5 Nf3 Nc6" to proper PGN
                let formattedMoves = '';
                for (let i = 0; i < moves.length; i++) {
                    const moveNumber = Math.floor(i / 2) + 1;

                    if (i % 2 === 0) {
                        // White's move
                        formattedMoves += `${moveNumber}. ${moves[i]}`;
                    } else {
                        // Black's move
                        formattedMoves += ` ${moves[i]}`;
                        if (i < moves.length - 1) {
                            formattedMoves += ' ';
                        }
                    }
                }

                // Add minimal headers for a valid PGN
                pgn = `[Event "Opening Analysis"]
[Site "?"]
[Date "????.??.??"]
[Round "?"]
[White "?"]
[Black "?"]
[Result "*"]

${formattedMoves} *`;
            }
        }

        return this.cleanPgn(pgn);
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