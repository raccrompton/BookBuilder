/**
 * =============================================================================
 * PgnProcessor.js - PGN parsing and mainline extraction utility
 * =============================================================================
 *
 * PURPOSE:
 * This utility parses PGN (Portable Game Notation) input strings and extracts
 * the information needed to start repertoire generation. It answers:
 * - What moves did the user enter?
 * - What opening name should we use?
 * - Is the input valid?
 *
 * WHAT IS PGN?
 * PGN (Portable Game Notation) is a standard text format for recording chess
 * games. It looks like this:
 *
 * [Event "Tournament"]
 * [White "Player1"]
 * [Black "Player2"]
 *
 * 1. e4 e5 2. Nf3 Nc6 3. Bb5 *
 *
 * The headers in [brackets] are optional metadata.
 * The moves use SAN (Standard Algebraic Notation): e4, Nf3, Bb5, etc.
 *
 * WHY IS PARSING PGN TRICKY?
 * PGN has many optional features and formatting variations:
 * - Headers may or may not be present
 * - Move numbers can be formatted differently (1. e4 vs 1.e4 vs 1 e4)
 * - Comments can appear {like this}
 * - Variations can appear (in parentheses)
 * - Result markers: 1-0, 0-1, 1/2-1/2, *
 *
 * OUR APPROACH:
 * We use chess.js for robust move parsing (it handles all the edge cases)
 * and @mliebelt/pgn-parser for header extraction.
 *
 * DEPENDENCIES:
 * - chess.js - Core chess library for move validation
 * - @mliebelt/pgn-parser - PGN header extraction
 * =============================================================================
 */

// ============================================================================
// Parser Loading
// ============================================================================
// The @mliebelt/pgn-parser is loaded dynamically as a UMD module
// UMD = Universal Module Definition (works in browsers and Node.js)

// Module-level variable to cache the loaded parser
// 'let' allows reassignment (unlike 'const')
let pgnParser = null;

/**
 * Dynamically load the PGN parser library
 *
 * WHAT IS DYNAMIC LOADING?
 * Instead of loading the library when the page loads, we load it only
 * when first needed. This is called "lazy loading" and improves initial
 * page load time.
 *
 * HOW SCRIPT TAG LOADING WORKS:
 * 1. Create a <script> element programmatically
 * 2. Set its src to the library file
 * 3. Add it to the document's <head>
 * 4. Browser downloads and executes the script
 * 5. Library becomes available as window.PgnParser
 *
 * @returns {Promise<Object>} The loaded parser object
 */
async function loadParser() {
    // Return cached parser if already loaded (avoid reloading)
    if (pgnParser) {
        return pgnParser;
    }

    // Return a Promise that resolves when the script loads
    // Promise = object representing a future value (success or failure)
    return new Promise((resolve, reject) => {
        // Check if already loaded globally (e.g., by another script)
        // window is the global object in browsers
        if (window.PgnParser && window.PgnParser.parse) {
            pgnParser = window.PgnParser;
            resolve(pgnParser);
            return;  // Early return - no need to load again
        }

        // Create a new script element to load the library
        // document.createElement() creates an HTML element in memory
        const script = document.createElement('script');

        // Set the source URL to load
        script.src = '/node_modules/@mliebelt/pgn-parser/lib/index.umd.js';

        // onload callback: runs when script finishes loading successfully
        script.onload = () => {
            // After loading, the library should be available on window
            if (window.PgnParser && window.PgnParser.parse) {
                pgnParser = window.PgnParser;
                resolve(pgnParser);  // Fulfill the Promise with the parser
            } else {
                // Script loaded but parser not available - something's wrong
                reject(new Error('PGN parser not found after loading'));
            }
        };

        // onerror callback: runs if script fails to load (404, network error, etc.)
        script.onerror = () => reject(new Error('Failed to load PGN parser script'));

        // Add the script to the document to trigger loading
        // document.head is the <head> element
        document.head.appendChild(script);
    });
}

/**
 * =============================================================================
 * PgnProcessor Class - Static utility for parsing PGN input
 * =============================================================================
 *
 * All methods are static (no instance needed):
 *   PgnProcessor.processPgn(pgn)  ✓
 *   new PgnProcessor().processPgn(pgn)  ✗ (not needed)
 *
 * WHY STATIC?
 * This class has no state - it just converts input to output.
 * Static methods are simpler: no constructor, no 'new', no 'this' confusion.
 */
class PgnProcessor {
    /**
     * Process a PGN string and extract opening information
     *
     * This is the main entry point. Given a PGN string, it returns:
     * - name: Opening name (from headers or generated from moves)
     * - moves: Array of SAN moves ['e4', 'e5', 'Nf3', ...]
     * - moveCount: How many moves in the sequence
     * - priority: Default 1 (for ordering multiple openings)
     *
     * APPROACH:
     * 1. Use chess.js to extract moves (most robust)
     * 2. Use @mliebelt/pgn-parser for headers (opening name, event, etc.)
     * 3. Generate name from moves if no headers found
     *
     * @param {string} pgnString - PGN input (with or without headers)
     * @returns {Promise<Object>} Opening object with name, moves, moveCount, priority
     *
     * @example
     * const opening = await PgnProcessor.processPgn('1. e4 e5 2. Nf3');
     * // Returns: { name: 'Opening: e4 e5 Nf3', moves: ['e4', 'e5', 'Nf3'], moveCount: 3, priority: 1 }
     *
     * @throws {Error} If PGN is invalid or contains no moves
     */
    static async processPgn(pgnString) {
        try {
            // =========================================================================
            // Input Validation
            // =========================================================================
            // Always validate input before processing - fail fast with clear message

            if (!pgnString || typeof pgnString !== 'string' || pgnString.trim() === '') {
                throw new Error('PGN input is empty or invalid');
            }

            // =========================================================================
            // Move Extraction using chess.js
            // =========================================================================
            // chess.js is the most robust way to parse PGN moves
            // It handles all the edge cases: comments, variations, formatting, etc.

            // Dynamic import - load chess.js only when needed
            // 'await import()' loads an ES module at runtime
            const { Chess } = await import('/node_modules/chess.js/dist/esm/chess.js');

            // Create a new chess game instance
            const chess = new Chess();

            // loadPgn() parses the PGN and plays all the moves on the board
            // It handles: headers, move numbers, comments, result markers
            chess.loadPgn(pgnString.trim());

            // history() returns the moves played as an array of SAN strings
            // Example: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']
            const moves = chess.history();

            // Validate we got at least one move
            if (moves.length === 0) {
                throw new Error('No moves found in PGN');
            }

            // =========================================================================
            // Header Extraction using @mliebelt/pgn-parser
            // =========================================================================
            // Headers like [Opening "Italian Game"] give us a nice name
            // We try to extract them, but it's optional

            let game = null;  // Will hold parsed game with headers

            try {
                // Load the parser library (lazy loading)
                const parser = await loadParser();

                if (parser && parser.parse) {
                    // Parse the PGN to extract headers
                    // { startRule: "game" } tells it to parse a single game
                    game = parser.parse(pgnString.trim(), { startRule: "game" });
                }
            } catch (headerError) {
                // Header parsing is optional - continue without it
                console.warn(`Header parsing failed, will generate name from moves: ${headerError.message}`);
            }

            // =========================================================================
            // Generate Opening Name
            // =========================================================================
            // Try to use headers, fall back to generating from moves

            const name = this.generateOpeningName(game, moves);

            // =========================================================================
            // Return Result
            // =========================================================================
            // Return a structured object with all the information we extracted

            return {
                name: name,           // Opening name (from headers or moves)
                moves: moves,         // Array of SAN moves from chess.js
                moveCount: moves.length,  // Track original move count
                priority: 1           // Default priority (for ordering)
            };

        } catch (error) {
            // Log error for debugging, then re-throw with context
            console.error('PGN Processing Error:', error);
            throw new Error(`PGN parsing failed: ${error.message}`);
        }
    }

    /**
     * Extract mainline moves from parsed PGN game object
     *
     * @deprecated This method is kept for backward compatibility only.
     * Use processPgn() instead, which uses chess.js for more robust parsing.
     *
     * WHAT IS "MAINLINE"?
     * In chess notation, the mainline is the primary sequence of moves.
     * Variations (alternative moves) appear in parentheses:
     *   1. e4 e5 (1...c5 {Sicilian}) 2. Nf3
     * Here, e4 e5 Nf3 is the mainline. c5 is a variation.
     *
     * WHAT IS RAV?
     * RAV = Recursive Annotation Variation - the PGN standard for variations.
     * RAVs appear in parentheses and can be nested.
     *
     * @param {Object} game - Parsed game object from @mliebelt/pgn-parser
     * @returns {Array<string>} Array of mainline moves in SAN notation
     */
    static extractMainlineMoves(game) {
        const moves = [];

        // Guard clause: return empty if no moves array
        if (!game.moves || !Array.isArray(game.moves)) {
            return moves;
        }

        // Process each move entry from the parser
        // The parser returns a complex structure with metadata for each move
        for (const moveEntry of game.moves) {
            // Skip variations (RAV) - we only want mainline moves
            if (moveEntry.variation) {
                continue;
            }

            // Extract the move notation
            // The parser can return moves in different formats depending on the PGN
            let move;
            if (moveEntry.notation && moveEntry.notation.notation) {
                // Standard format: { notation: { notation: 'e4' } }
                move = moveEntry.notation.notation;
            } else if (moveEntry.move) {
                // Alternative format: { move: 'e4' }
                move = moveEntry.move;
            } else if (typeof moveEntry === 'string') {
                // Simple format: just the move string
                move = moveEntry;
            }

            // Add to results if we got a valid move
            if (move && move.trim() !== '') {
                moves.push(move.trim());
            }
        }

        return moves;
    }

    /**
     * Generate opening name from PGN headers or moves
     *
     * NAMING PRIORITY:
     * 1. [Opening] header - "Italian Game"
     * 2. [ECO] header - "C50" (Eco codes are chess opening classifications)
     * 3. [Event] header - Tournament name
     * 4. [White] vs [Black] - Player names
     * 5. Move-based name - "Opening: e4 e5 Nf3..."
     * 6. Ultimate fallback - "Chess Opening"
     *
     * @param {Object} game - Parsed PGN game object with tags property
     * @param {Array<string>} moves - Array of SAN moves
     * @returns {string} Generated opening name
     */
    static generateOpeningName(game, moves) {
        // Debug logging to help troubleshoot naming issues
        console.log('🔍 [DEBUG] generateOpeningName called with:', {
            hasGame: !!game,
            hasTags: !!(game && game.tags),
            movesLength: moves ? moves.length : 0,
            moves: moves ? moves.slice(0, 4) : [],
            tags: game && game.tags ? Object.keys(game.tags) : []
        });

        // =====================================================================
        // Strategy 1: Try to extract name from PGN headers
        // =====================================================================
        // Headers are the [Key "Value"] lines at the start of a PGN

        if (game.tags) {
            // List of headers to check, in priority order
            const openingHeaders = ['Opening', 'ECO', 'Event', 'White', 'Black'];

            for (const header of openingHeaders) {
                const value = game.tags[header];
                console.log(`🏷️ [DEBUG] Checking header '${header}': "${value}"`);

                // Check if header has a useful value
                // '?' and '-' are standard PGN placeholders for unknown values
                if (value && value !== '?' && value !== '-' && value.length > 0) {
                    // Clean up the header value (remove quotes)
                    let name = value.replace(/['"]/g, '').trim();

                    // Special handling for Event headers
                    // Remove year and tournament-specific info: "Tata Steel 2023" → "Tata Steel"
                    if (header === 'Event') {
                        name = name.replace(/\d{4}.*$/, '').trim();
                    }

                    // Special handling for player names
                    // If we found White, combine with Black: "Carlsen vs Nepomniachtchi"
                    if (header === 'White' && game.tags.Black) {
                        name = `${value} vs ${game.tags.Black}`;
                    }

                    // Only use name if it's long enough to be meaningful
                    if (name.length > 3) {
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

        // =====================================================================
        // Strategy 2: Generate name from first few moves
        // =====================================================================
        // If no headers, create a name like "Opening: e4 e5 Nf3 Nc6"

        if (moves && moves.length > 0) {
            // Show first 4 moves maximum
            const moveCount = Math.min(4, moves.length);

            // .slice() extracts a portion of array, .join() combines with separator
            const firstMoves = moves.slice(0, moveCount).join(' ');

            // Add "..." if there are more moves not shown
            const moveBased = `Opening: ${firstMoves}${moves.length > moveCount ? '...' : ''}`;
            console.log(`✅ [DEBUG] Using move-based name: "${moveBased}"`);
            return moveBased;
        } else {
            console.log('⚠️ [DEBUG] No moves available for move-based naming');
        }

        // =====================================================================
        // Strategy 3: Ultimate fallback
        // =====================================================================
        // If all else fails, use a generic name

        console.log('🚨 [DEBUG] Using ultimate fallback: "Chess Opening"');
        return 'Chess Opening';
    }

    /**
     * Validate PGN format
     *
     * Checks if a PGN string contains valid chess moves.
     * Uses chess.js for authoritative validation - if chess.js can play
     * the moves, the PGN is valid.
     *
     * @param {string} pgnString - The PGN input string to validate
     * @returns {Promise<Object>} Validation result
     *   @returns {boolean} .isValid - True if PGN is valid
     *   @returns {string|null} .error - Error message if invalid, null if valid
     *
     * @example
     * const result = await PgnProcessor.validatePgn('1. e4 e5');
     * // Returns: { isValid: true, error: null }
     *
     * @example
     * const result = await PgnProcessor.validatePgn('1. e4 e9'); // invalid move
     * // Returns: { isValid: false, error: 'PGN validation error: ...' }
     */
    static async validatePgn(pgnString) {
        try {
            // =========================================================================
            // Basic Input Validation
            // =========================================================================
            // Check for obvious problems before trying to parse

            if (!pgnString || typeof pgnString !== 'string') {
                return { isValid: false, error: 'PGN input is required' };
            }

            const trimmed = pgnString.trim();
            if (trimmed === '') {
                return { isValid: false, error: 'PGN input cannot be empty' };
            }

            // =========================================================================
            // Chess Move Validation
            // =========================================================================
            // Use preprocessPgn which loads into chess.js
            // If it throws, the moves are invalid

            await this.preprocessPgn(trimmed);

            // If we get here, validation passed
            return { isValid: true, error: null };

        } catch (error) {
            // Return validation failure with error message
            return { isValid: false, error: `PGN validation error: ${error.message}` };
        }
    }

    /**
     * Preprocess and normalize PGN input
     *
     * Takes any PGN format and returns a clean, standardized version.
     * chess.js handles the messy work of parsing various PGN styles.
     *
     * INPUT EXAMPLES:
     * - "1. e4 e5 2. Nf3"
     * - "e4 e5 Nf3" (no move numbers)
     * - "1.e4 e5 2.Nf3" (no space after number)
     * - Full PGN with headers
     *
     * OUTPUT:
     * Clean moves like "1. e4 e5 2. Nf3 Nc6"
     *
     * @param {string} pgnString - Raw PGN input (any format)
     * @returns {Promise<string>} Normalized PGN string
     * @throws {Error} If the PGN contains invalid moves
     */
    static async preprocessPgn(pgnString) {
        // Handle empty input
        if (!pgnString) return '';

        try {
            // Import chess.js for authoritative parsing
            const { Chess } = await import('/node_modules/chess.js/dist/esm/chess.js');
            const chess = new Chess();

            // loadPgn() accepts many PGN formats:
            // - With or without headers
            // - With or without move numbers
            // - Various spacing conventions
            // It validates that all moves are legal and playable
            chess.loadPgn(pgnString.trim());

            // pgn() returns a clean, standardized PGN string
            // Just the moves, properly formatted
            return chess.pgn();

        } catch (error) {
            // chess.js throws if moves are invalid
            // Re-throw with clearer message
            throw new Error(`Invalid chess moves: ${error.message}`);
        }
    }

}

export default PgnProcessor;