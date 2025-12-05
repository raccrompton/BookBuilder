/**
 * PgnTreeMerger.js - Merge multiple PGN lines into a single tree with variations
 *
 * Uses chessops library to handle PGN parsing and generation.
 * Preserves all annotations ({...} comment blocks) during merge.
 *
 * PURPOSE:
 * Takes multiple individual PGN lines (each with their own annotations) and
 * combines them into a single PGN game with variations. Lines that share
 * common moves are merged at their divergence points.
 *
 * HOW IT FITS IN:
 * - Called by: FileGenerator.generateTreePGN()
 * - Replaces: The complex buildVariationTree/generateNestedPGN code
 * - Depends on: chessops library for PGN manipulation
 *
 * KEY CONCEPTS:
 * - Variation tree: A PGN structure where alternative moves are shown in parentheses
 * - Divergence point: The move where two lines differ
 * - Node: A position in the tree containing a move and optional comments
 */

import { parsePgn, makePgn } from 'chessops/pgn'; // Import chessops functions for parsing PGN strings into game objects and generating PGN strings from game objects

/**
 * PgnTreeMerger - Combines multiple PGN lines into a variation tree
 *
 * WHAT IT DOES:
 * Takes individual PGN lines (each representing one line of analysis) and
 * merges them into a single PGN with proper variation notation.
 *
 * EXAMPLE:
 * Input lines:
 *   1. e4 e5 2. Nf3 Nc6 {Line 1 stats}
 *   1. e4 e5 2. Bc4 Nf6 {Line 2 stats}
 *
 * Output:
 *   1. e4 e5 2. Nf3 (2. Bc4 Nf6 {Line 2 stats}) Nc6 {Line 1 stats}
 */
class PgnTreeMerger {
    /**
     * Create a new PgnTreeMerger instance
     *
     * HOW IT WORKS:
     * Initializes an empty tree structure that lines will be merged into.
     * The first line added becomes the mainline; subsequent lines are merged
     * as variations where they diverge.
     */
    constructor() {
        this.rootNode = { children: [] }; // Root of the merged tree - has no move itself, just children; children array holds first moves of all lines
        this.headers = new Map(); // PGN headers like Event, Site, etc. - Map allows easy key-value storage
        this.lineCount = 0; // Track how many lines have been added - used for logging and debugging
    }

    /**
     * Set a PGN header value
     *
     * WHAT IT DOES:
     * Sets standard PGN headers like Event, Site, Date, etc.
     *
     * PARAMETERS:
     * @param {string} key - Header name (e.g., "Event")
     * @param {string} value - Header value (e.g., "Sicilian Defense")
     */
    setHeader(key, value) {
        this.headers.set(key, value); // Store header in the Map - will be included in final PGN output
    }

    /**
     * Add a PGN line to the merged tree
     *
     * WHAT IT DOES:
     * Parses the PGN string and merges it into the existing tree structure.
     * The first line becomes the mainline. Subsequent lines are merged at
     * their divergence point (where they first differ from existing lines).
     *
     * PARAMETERS:
     * @param {string} pgnString - A complete PGN game string with headers and moves
     *
     * HOW IT WORKS:
     * 1. Parse the PGN string using chessops
     * 2. Extract the move sequence from the parsed game
     * 3. Find where this line diverges from existing lines
     * 4. Add new moves as a variation branch at the divergence point
     *
     * EXAMPLE:
     * merger.addLine('[Event "Test"]\n\n1. e4 e5 2. Nf3 Nc6 {stats}');
     */
    addLine(pgnString) {
        // Parse the PGN string into a game object
        const games = parsePgn(pgnString); // chessops parsePgn returns an array of games (PGN can contain multiple games)

        if (games.length === 0) { // Check if parsing succeeded
            console.warn('[PgnTreeMerger] Failed to parse PGN:', pgnString.substring(0, 50)); // Log warning with preview of failed input
            return; // Exit early if parsing failed
        }

        const game = games[0]; // Get the first game (we expect only one per line)
        this.lineCount++; // Increment our line counter

        console.log(`[PgnTreeMerger] Adding line ${this.lineCount}`); // Log which line number we're adding

        // Extract moves from the parsed game as an array of node data
        const moveNodes = this.extractMoveNodes(game.moves); // Convert chessops tree structure to flat array for easier processing

        if (moveNodes.length === 0) { // Check if there were any moves
            console.warn('[PgnTreeMerger] No moves found in PGN'); // Log warning
            return; // Exit if no moves
        }

        // Merge this line's moves into our tree
        this.mergeIntoTree(moveNodes); // This is where the actual merge logic happens
    }

    /**
     * Extract move nodes from a chessops game tree
     *
     * WHAT IT DOES:
     * Converts the chessops tree structure (nested nodes) into a flat array
     * of move data objects for easier processing.
     *
     * PARAMETERS:
     * @param {Object} rootNode - The root node of a chessops game (game.moves)
     *
     * RETURNS:
     * @returns {Array} Array of move data objects with san and comments
     *
     * HOW IT WORKS:
     * Walks the mainline of the game tree, collecting each move's SAN notation
     * and any comments attached to it.
     */
    extractMoveNodes(rootNode) {
        const nodes = []; // Array to collect all move data
        let currentNode = rootNode; // Start at the root node

        // Walk the mainline (first child of each node)
        while (currentNode.children && currentNode.children.length > 0) { // Continue while there are more moves
            const child = currentNode.children[0]; // Get the first child (mainline move)

            if (child.data) { // Check if this node has move data
                nodes.push({ // Add move data to our array
                    san: child.data.san, // The move in Standard Algebraic Notation (e.g., "e4", "Nf3")
                    comments: child.data.comments || [], // Comments after the move (our annotation blocks)
                    startingComments: child.data.startingComments || [], // Comments before the move (rare)
                    nags: child.data.nags || [] // Numeric Annotation Glyphs like !, ?, !!, ??
                });
            }

            currentNode = child; // Move to the next node in the mainline
        }

        return nodes; // Return the flat array of moves
    }

    /**
     * Merge a line's moves into the existing tree
     *
     * WHAT IT DOES:
     * Finds where this line diverges from existing lines and adds the
     * divergent moves as a new branch (variation).
     *
     * PARAMETERS:
     * @param {Array} moveNodes - Array of move data objects to merge
     *
     * HOW IT WORKS:
     * 1. Walk down the tree following matching moves
     * 2. When a move doesn't match any existing child, that's the divergence point
     * 3. Add the remaining moves as a new branch from that point
     */
    mergeIntoTree(moveNodes) {
        let currentNode = this.rootNode; // Start at the root of our merged tree
        let moveIndex = 0; // Track which move in the line we're processing

        // Walk down the tree following matching moves
        while (moveIndex < moveNodes.length) { // Continue while we have moves to process
            const moveData = moveNodes[moveIndex]; // Get the current move

            // Look for a matching child node (same move already exists)
            const matchingChild = currentNode.children.find( // Search children for matching move
                child => child.data && child.data.san === moveData.san // Compare SAN notation
            );

            if (matchingChild) { // If we found a matching move
                // Move exists, follow this branch
                currentNode = matchingChild; // Move down to the matching child
                moveIndex++; // Advance to next move
            } else { // If no matching move exists
                // Divergence point! Add remaining moves as new branch
                break; // Exit the loop - we'll add the rest as a variation
            }
        }

        // Add any remaining moves as a new branch
        if (moveIndex < moveNodes.length) { // If there are still moves to add
            this.addBranch(currentNode, moveNodes.slice(moveIndex)); // Add them as a new variation branch
        } else if (moveNodes.length > 0) { // If we matched all moves (duplicate line)
            // Line is a duplicate or subset - merge comments on last node
            const lastMove = moveNodes[moveNodes.length - 1]; // Get the last move's data
            if (lastMove.comments && lastMove.comments.length > 0) { // If it has comments
                // Append comments to existing node (don't overwrite)
                if (!currentNode.data.comments) { // If no existing comments
                    currentNode.data.comments = []; // Initialize comments array
                }
                // Only add if not already present (avoid duplicates)
                for (const comment of lastMove.comments) { // Check each comment
                    if (!currentNode.data.comments.includes(comment)) { // If not already there
                        currentNode.data.comments.push(comment); // Add the comment
                    }
                }
            }
        }
    }

    /**
     * Add a branch of moves starting from a node
     *
     * WHAT IT DOES:
     * Creates a chain of new nodes for the remaining moves and attaches
     * it to the tree at the specified point.
     *
     * PARAMETERS:
     * @param {Object} parentNode - The node to attach the branch to
     * @param {Array} moveNodes - Array of move data to add
     *
     * HOW IT WORKS:
     * Creates a linked list of nodes for each move and attaches it as
     * a child of the parent. Preserves comments on the last move.
     */
    addBranch(parentNode, moveNodes) {
        let currentNode = parentNode; // Start at the parent where we'll attach

        for (let i = 0; i < moveNodes.length; i++) { // Iterate through moves to add
            const moveData = moveNodes[i]; // Get current move data
            const isLastMove = (i === moveNodes.length - 1); // Check if this is the final move

            // Create new node for this move
            const newNode = { // Create the node structure
                data: { // Move data object
                    san: moveData.san, // The move notation
                    // Only include comments on the last move (that's where our annotation block is)
                    comments: isLastMove ? moveData.comments : undefined, // Preserve final annotation
                    startingComments: moveData.startingComments.length > 0 ? moveData.startingComments : undefined, // Preserve if present
                    nags: moveData.nags.length > 0 ? moveData.nags : undefined // Preserve NAGs if present
                },
                children: [] // Initialize empty children array for potential sub-variations
            };

            // Attach to parent
            currentNode.children.push(newNode); // Add as child of current node
            currentNode = newNode; // Move down to the new node for next iteration
        }
    }

    /**
     * Export the merged tree as a PGN string
     *
     * WHAT IT DOES:
     * Converts the internal tree structure into a valid PGN string with
     * proper variation notation (parentheses).
     *
     * RETURNS:
     * @returns {string} Complete PGN string with headers and moves
     *
     * HOW IT WORKS:
     * Creates a game object in the format chessops expects and uses
     * makePgn() to generate the output.
     *
     * EXAMPLE:
     * const pgn = merger.toPgn();
     * // Returns: "[Event "..."]\n\n1. e4 e5 (1... c5) 2. Nf3 *"
     */
    toPgn() {
        // Build game object for chessops
        const game = { // Create game structure that chessops expects
            headers: this.headers, // Use our collected headers
            moves: this.rootNode // Use our merged tree as the move tree
        };

        // Generate PGN string using chessops
        const pgn = makePgn(game); // chessops handles all the formatting, move numbers, variation parentheses

        return pgn; // Return the generated PGN string
    }

    /**
     * Get the number of lines that have been added
     *
     * WHAT IT DOES:
     * Returns a count of how many PGN lines have been merged.
     * Useful for logging and verification.
     *
     * RETURNS:
     * @returns {number} Number of lines added to the tree
     */
    getLineCount() {
        return this.lineCount; // Return the counter we've been incrementing
    }

    /**
     * Clear the tree and start fresh
     *
     * WHAT IT DOES:
     * Resets the merger to its initial state, removing all merged lines.
     * Useful for reusing a merger instance for a new chapter.
     */
    clear() {
        this.rootNode = { children: [] }; // Reset to empty root node
        this.headers = new Map(); // Clear headers
        this.lineCount = 0; // Reset counter
    }
}

export default PgnTreeMerger; // Export the class for use in other modules
