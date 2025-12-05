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
     * REFACTORED: Simplified to use chess.js directly for move extraction instead of cascading parser fallbacks
     *
     * @param {string} pgnString - The PGN input string
     * @returns {Object} Opening object with name, moves, and priority
     */
    static async processPgn(pgnString) {
        try {
            if (!pgnString || typeof pgnString !== 'string' || pgnString.trim() === '') {
                throw new Error('PGN input is empty or invalid'); // Validate input before processing
            }

            // Use chess.js for robust move extraction - handles all PGN formats
            const { Chess } = await import('/node_modules/chess.js/dist/esm/chess.js'); // Dynamic import for ES module
            const chess = new Chess(); // Create chess instance for parsing

            // Load PGN - chess.js handles headers, loose formatting, etc.
            chess.loadPgn(pgnString.trim()); // loadPgn normalizes the input

            // Extract moves using chess.js history() - robust and canonical
            const moves = chess.history(); // Returns array of SAN moves: ['e4', 'e5', 'Nf3', ...]

            if (moves.length === 0) {
                throw new Error('No moves found in PGN'); // Validate we got moves
            }

            // Parse headers using mliebelt's parser (it's good at header extraction)
            // Only load parser if we need opening name from headers
            let game = null; // Will hold parsed game for header access
            try {
                const parser = await loadParser(); // Load mliebelt parser
                if (parser && parser.parse) {
                    game = parser.parse(pgnString.trim(), { startRule: "game" }); // Parse for headers only
                }
            } catch (headerError) {
                console.warn(`Header parsing failed, will generate name from moves: ${headerError.message}`);
                // Continue without headers - we can generate name from moves
            }

            // Generate opening name from headers or moves
            const name = this.generateOpeningName(game, moves); // Use parsed game for headers, or fall back to move-based name

            return {
                name: name, // Opening name from headers or moves
                moves: moves, // Array of SAN moves from chess.js
                moveCount: moves.length, // Track original move sequence length
                priority: 1 // Default priority for single PGN input
            };

        } catch (error) {
            console.error('PGN Processing Error:', error); // Log error for debugging
            throw new Error(`PGN parsing failed: ${error.message}`); // Re-throw with context
        }
    }

    /**
     * Extract mainline moves from parsed PGN game
     * @deprecated This method uses fragile cascading fallbacks. processPgn() now uses chess.js directly.
     * Kept for backward compatibility if any code still calls it directly.
     *
     * @param {Object} game - Parsed PGN game object from mliebelt parser
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
        console.log('🔍 [DEBUG] generateOpeningName called with:', {
            hasGame: !!game,
            hasTags: !!(game && game.tags),
            movesLength: moves ? moves.length : 0,
            moves: moves ? moves.slice(0, 4) : [],
            tags: game && game.tags ? Object.keys(game.tags) : []
        });

        // Try to use headers first
        if (game.tags) {
            // Look for common opening-related headers
            const openingHeaders = ['Opening', 'ECO', 'Event', 'White', 'Black'];

            for (const header of openingHeaders) {
                const value = game.tags[header];
                console.log(`🏷️ [DEBUG] Checking header '${header}': "${value}"`);

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
                        console.log(`✅ [DEBUG] Using header-based name: "${name}" from header '${header}'`);
                        return name;
                    } else {
                        console.log(`⚠️ [DEBUG] Header '${header}' name too short: "${name}"`);
                    }
                } else {
                    console.log(`⚠️ [DEBUG] Header '${header}' skipped: empty/placeholder value`);
                }
            }
        } else {
            console.log('⚠️ [DEBUG] No game.tags available for header-based naming');
        }

        // Fallback: Generate name from first few moves
        if (moves && moves.length > 0) {
            const moveCount = Math.min(4, moves.length);
            const firstMoves = moves.slice(0, moveCount).join(' ');
            const moveBased = `Opening: ${firstMoves}${moves.length > moveCount ? '...' : ''}`;
            console.log(`✅ [DEBUG] Using move-based name: "${moveBased}"`);
            return moveBased;
        } else {
            console.log('⚠️ [DEBUG] No moves available for move-based naming');
        }

        // Ultimate fallback
        console.log('🚨 [DEBUG] Using ultimate fallback: "Chess Opening"');
        return 'Chess Opening';
    }

    /**
     * Validate PGN format using chess.js for authoritative validation
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

            // Use chess.js for authoritative validation
            await this.preprocessPgn(trimmed);

            return { isValid: true, error: null };

        } catch (error) {
            return { isValid: false, error: `PGN validation error: ${error.message}` };
        }
    }

    /**
     * Preprocess and normalize PGN input using chess.js for robust parsing
     * Handles any valid PGN format and returns clean, standardized PGN
     * @param {string} pgnString - Raw PGN input
     * @returns {string} Normalized PGN string
     */
    static async preprocessPgn(pgnString) {
        if (!pgnString) return '';

        try {
            // Import chess.js for authoritative parsing
            const { Chess } = await import('/node_modules/chess.js/dist/esm/chess.js');
            const chess = new Chess();

            // Let chess.js handle any PGN format (with or without headers, loose notation, etc.)
            chess.loadPgn(pgnString.trim());

            // Return clean, standardized PGN without headers or result indicators
            return chess.pgn();

        } catch (error) {
            // If chess.js can't parse it, throw a clear error
            throw new Error(`Invalid chess moves: ${error.message}`);
        }
    }

}

export default PgnProcessor;