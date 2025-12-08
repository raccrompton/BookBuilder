/**
 * =============================================================================
 * BookBuilder.js - Main orchestrator for chess opening repertoire generation
 * =============================================================================
 *
 * PURPOSE:
 * This is the "brain" of the entire application. It coordinates all the different
 * components to build a chess opening repertoire - a collection of recommended
 * moves for various chess positions.
 *
 * WHAT IS A CHESS REPERTOIRE?
 * Think of it like a playbook in sports. Instead of improvising every move,
 * chess players prepare specific responses to common opponent moves. This file
 * helps generate those responses by:
 * 1. Looking up what moves are popular in real games (via Lichess database)
 * 2. Analyzing which responses give the best winning chances
 * 3. Generating a PGN file (chess notation format) with all the recommended lines
 *
 * HOW IT WORKS (HIGH LEVEL):
 * 1. User provides a starting position (e.g., "1. e4" for King's Pawn opening)
 * 2. We query Lichess to see what opponents typically play
 * 3. For each opponent response, we find our best counter-move
 * 4. We continue this process, building a "tree" of variations
 * 5. Finally, we output everything as a PGN file
 *
 * ARCHITECTURE PATTERN:
 * This class follows the "Orchestrator" pattern - it doesn't do the actual work
 * itself, but coordinates other specialized classes:
 * - ChessEngine: Validates moves and tracks board state
 * - LichessClient: Fetches real game statistics from Lichess API
 * - MoveSelector: Chooses the best moves based on statistics
 * - PgnGenerator: Formats output into standard chess notation
 *
 * DEPENDENCIES (what other files this needs):
 * - DeterministicMode: Testing utility for reproducible results
 * - ChessEngine: Chess move validation using chess.js library
 * - LichessClient: HTTP client for Lichess Explorer API
 * - StockfishEngine: Optional computer analysis for deep positions
 * - Statistics: Win rate and probability calculations
 * - MoveSelector: Move selection algorithm
 * - PgnGenerator: PGN formatting utilities
 *
 * Based on comprehensive Python analysis and refactoring strategy from:
 * - @client/claudedocs/step6-analysis/python-bookbuilder-analysis.md
 * - @client/claudedocs/step6-analysis/javascript-refactoring-strategy.md
 * =============================================================================
 */

// =============================================================================
// IMPORTS - Loading the modules (classes) this file depends on
// =============================================================================

// DeterministicMode: Used for testing - makes random operations predictable
// In production: does nothing. In tests: ensures consistent, reproducible results
import { DeterministicMode } from './config/DeterministicMode.js';

// ChessEngine: Wrapper around chess.js library for move validation
// Tracks the board state, validates moves, generates FEN strings
import ChessEngine from './chess/ChessEngine.js';

// LichessClient: Makes HTTP requests to Lichess's game database API
// Returns statistics like "e4 was played in 1 million games with 55% white wins"
import LichessClient from './api/LichessClient.js';

// Note: StockfishEngine is now passed via config from FormController
// (FormController creates and initializes it, then passes to BookBuilder)

// Statistics: Mathematical calculations for win rates and confidence intervals
// Converts raw game counts into meaningful percentages
import Statistics from './stats/Statistics.js';

// MoveSelector: The "decision brain" - chooses which move to recommend
// Uses statistics + engine evaluation to pick the best response
import MoveSelector from './algorithm/MoveSelector.js';

// PgnGenerator: Formats our analysis into PGN (Portable Game Notation)
// PGN is the standard text format for sharing chess games

// Logger: Configurable logging - toggle with Logger.setEnabled('BookBuilder', true/false)
import Logger from './utils/Logger.js';
const log = Logger.get('BookBuilder');
import PgnGenerator from './pgn/PgnGenerator.js';

/**
 * =============================================================================
 * Main BookBuilder class that orchestrates all components
 * =============================================================================
 *
 * DESIGN PATTERN: Orchestrator / Facade
 * This class coordinates multiple specialized components without doing
 * the detailed work itself. Think of it as a "general manager" that
 * delegates tasks to specialists.
 *
 * REPLACES PYTHON CLASSES:
 * The original Python codebase had separate classes (Grower, Rooter, Leafer, Printer).
 * This JavaScript version consolidates them into one class for simplicity,
 * while keeping the same logical flow.
 */
class BookBuilder {
    /**
     * Constructor - Initialize the BookBuilder with configuration and dependencies
     *
     * WHAT IS A CONSTRUCTOR?
     * In JavaScript classes, the constructor() method runs automatically when you
     * create a new instance with "new BookBuilder(config)". It sets up the initial
     * state of the object.
     *
     * DESIGN PATTERN: Dependency Injection
     * Instead of creating dependencies inside methods (tight coupling), we create
     * them once in the constructor and store them as instance properties (this.xxx).
     * This makes the code easier to test and modify.
     *
     * @param {Object} config - Configuration object containing all user settings
     *   - speeds: Array of time controls to include (e.g., ['blitz', 'rapid'])
     *   - ratings: Array of rating bands to include (e.g., ['2000', '2200'])
     *   - DEPTHLIKELIHOOD: Minimum probability threshold for exploring moves
     *   - MINGAMES: Minimum games required for statistical significance
     *   - CAREABOUTENGINE: Boolean - whether to use Stockfish for analysis
     *   - etc.
     *
     * @param {Function|null} progressCallback - Optional callback function for progress updates
     *   Called with progress data object: {stage, current, total, percentage, message}
     *   Useful for updating a progress bar in the UI
     */
    constructor(config, progressCallback = null) {
        // ---------------------------------------------------------------------
        // STEP 1: Store configuration
        // ---------------------------------------------------------------------
        // "this.config" makes the config accessible to all methods in this class
        // The "this" keyword refers to the current instance of BookBuilder
        this.config = config;

        // ---------------------------------------------------------------------
        // STEP 2: Create helper instances (Dependency Injection)
        // ---------------------------------------------------------------------
        // Each of these is a specialized class that handles one responsibility

        // ChessEngine: Validates moves and tracks the board position
        // Used for the root position analysis at the start
        this.chessEngine = new ChessEngine();

        // LichessClient: HTTP client for fetching game statistics from Lichess API
        // Returns data like "1. e4 was played in 3 million games"
        this.lichessClient = new LichessClient();

        // MoveSelector: Algorithm that chooses the best move from candidates
        // Takes statistics and returns the recommended move
        this.moveSelector = new MoveSelector(config);

        // Statistics: Math utilities for win rate calculations
        // Converts game counts into percentages with confidence intervals
        this.statisticsEngine = new Statistics();

        // PgnGenerator: Formats output into PGN (chess notation) format
        // Creates properly formatted chess game records
        this.pgnGenerator = new PgnGenerator(config);

        // StockfishEngine: Chess computer for positions with no database data
        // Use the pre-initialized engine from FormController (passed via config)
        // This avoids creating and initializing a second engine instance
        this.stockfishEngine = config.stockfishEngine || null;

        // ---------------------------------------------------------------------
        // STEP 3: Progress tracking system
        // ---------------------------------------------------------------------
        // Allows the UI to show progress bars and status messages

        // Store the callback function for later use
        // A "callback" is a function passed as an argument to be called later
        this.progressCallback = progressCallback;

        // Debug logging helps developers understand what's happening
        log.log('🔧 [BookBuilder] Constructor called with progress callback:', {
            hasCallback: !!progressCallback,        // !! converts to boolean (true if exists)
            callbackType: typeof progressCallback,  // Should be 'function' or 'object'
            isFunction: typeof progressCallback === 'function'
        });

        // Initialize progress state object to track various metrics
        // This object gets updated as processing progresses
        this.progressState = {
            stage: 'Initializing',           // Current phase of processing
            currentPosition: 0,              // Which position we're analyzing
            totalEstimated: 0,               // Estimated total positions
            startTime: null,                 // When processing started (for ETA calc)
            lastUpdate: null,                // Timestamp of last progress update
            positionsProcessed: 0,           // Counter of positions analyzed
            linesGenerated: 0,               // Counter of complete lines created
            movesAnalyzed: 0,                // Counter of individual moves evaluated
            continuationsFound: 0            // Counter of valid continuations found
        };

        // ---------------------------------------------------------------------
        // STEP 4: Create Lichess API options from user configuration
        // ---------------------------------------------------------------------
        // These options are passed with every Lichess API request
        // They filter which games to include in the statistics

        this.lichessApiOptions = {
            // Array.isArray() checks if speeds is an array (could be string too)
            // .join(',') converts ['blitz', 'rapid'] to 'blitz,rapid' (API format)
            // The || operator provides a default value if the first part is falsy
            speeds: Array.isArray(config.speeds) ? config.speeds.join(',') : (config.speeds || 'blitz,rapid,classical,correspondence'),

            // Same pattern for ratings - convert array to comma-separated string
            ratings: Array.isArray(config.ratings) ? config.ratings.join(',') : (config.ratings || '1600,1800,2000,2200,2500'),

            // We only support standard chess (not Chess960, etc.)
            variant: 'standard'
        };

        log.log('🔧 [BookBuilder] Lichess API options created:', this.lichessApiOptions);

        // ---------------------------------------------------------------------
        // STEP 5: State management for processing
        // ---------------------------------------------------------------------
        // These arrays track our work as we build the repertoire

        // finalLines: Completed analysis lines ready for output
        // Each item contains: pgn, moves, statistics, etc.
        this.finalLines = [];

        // processingQueue: Lines that still need more analysis
        // We process this queue until it's empty (breadth-first search pattern)
        this.processingQueue = [];

    }

    /**
     * =========================================================================
     * Main orchestration method - Entry point for processing openings
     * =========================================================================
     *
     * WHAT THIS METHOD DOES:
     * This is the main entry point for generating a chess repertoire. It:
     * 1. Loops through all the openings the user wants to analyze
     * 2. Generates a "chapter" (PGN file) for each opening
     * 3. Returns all chapters as a results object
     *
     * REPLACES: Python's Grower.run() method
     *
     * WHY "async"?
     * The "async" keyword means this function can use "await" to pause for
     * asynchronous operations (like API calls) without blocking the browser.
     * Without async/await, we'd need complex callback chains or .then() calls.
     *
     * @param {Object} config - Configuration object containing:
     *   - openings: Array of opening objects, each with {name, moves, perspective}
     *   - Various threshold settings (MINGAMES, DEPTHLIKELIHOOD, etc.)
     *
     * @returns {Promise<Object>} - Results object where:
     *   - Keys are filename strings like "Chapter_1_Italian_Game.pgn"
     *   - Values are the PGN content for each chapter
     *
     * @example
     * const results = await bookBuilder.processOpening({
     *   openings: [{ name: 'Italian Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'] }]
     * });
     * // results = { 'Chapter_1_Italian_Game.pgn': '[Event "Italian Game"]\n1. e4 e5...' }
     */
    async processOpening(config) {
        // Initialize empty results object to collect all chapter outputs
        // JavaScript objects can use strings as keys, making them like dictionaries
        const results = {};

        // Log startup banner for debugging and user feedback
        // These logs appear in the browser's developer console (F12)
        log.log(`[BookBuilder] ========================================`);
        log.log(`[BookBuilder] STARTING CHESS ENGINE STATE FIXED VERSION`);
        log.log(`[BookBuilder] Processing ${config.openings.length} opening(s)`);
        log.log(`[BookBuilder] Enhanced with move validation & isolated engines`);
        log.log(`[BookBuilder] ========================================`);

        // Loop through each opening in the configuration
        // We start at chapter 1 (not 0) for human-readable chapter numbers
        for (let chapter = 1; chapter <= config.openings.length; chapter++) {
            // Array indices are 0-based, so subtract 1 to get correct opening
            // Example: chapter 1 → config.openings[0]
            const opening = config.openings[chapter - 1];
            log.log(`Processing Chapter ${chapter}: ${opening.name}`);

            try {
                // Generate the full analysis for this opening
                // "await" pauses here until generateChapter() completes
                const chapterContent = await this.generateChapter(opening, chapter);

                // Create a filename-safe version of the opening name
                // .replace(/\s+/g, '_') converts spaces to underscores
                // The 'g' flag means "global" - replace ALL spaces, not just first
                const fileName = `Chapter_${chapter}_${opening.name.replace(/\s+/g, '_')}.pgn`;

                // Store the chapter content in results object
                results[fileName] = chapterContent;

                log.log(`✅ Completed Chapter ${chapter}: ${opening.name} - ${this.finalLines.length} lines generated`);

            } catch (error) {
                // If anything goes wrong, log the error and re-throw
                // Re-throwing allows the calling code to handle the error too
                log.error(`❌ Failed to generate Chapter ${chapter}: ${error.message}`);
                throw new Error(`Chapter ${chapter} generation failed: ${error.message}`);
            }
        }

        // Log completion summary
        // Object.keys(results).length counts how many chapters we generated
        log.log(`[BookBuilder] ========================================`);
        log.log(`[BookBuilder] 🎉 ALL CHAPTERS COMPLETED SUCCESSFULLY!`);
        log.log(`[BookBuilder] ✅ Chess engine state fixes implemented`);
        log.log(`[BookBuilder] ✅ Move validation pipeline active`);
        log.log(`[BookBuilder] ✅ Engine isolation preventing contamination`);
        log.log(`[BookBuilder] Generated ${Object.keys(results).length} chapter files`);
        log.log(`[BookBuilder] ========================================`);

        // Return the complete results object with all chapters
        return results;
    }

    /**
     * =========================================================================
     * Chapter generation method - Creates one chapter of the repertoire
     * =========================================================================
     *
     * WHAT THIS METHOD DOES:
     * This is the core workflow for analyzing a single opening. It runs in
     * three phases, like building a tree:
     *
     * PHASE 1 - ROOT ANALYSIS:
     * Start from the user's input moves and find what opponents typically play.
     * Example: User inputs "1. e4" → We find that opponents play e5, c5, e6, etc.
     *
     * PHASE 2 - LINE EXPANSION:
     * For each opponent response, find our best counter-move, then find their
     * responses to that, and so on. This builds a "tree" of variations.
     *
     * PHASE 3 - OUTPUT GENERATION:
     * Convert all the analyzed lines into a structured format for the PGN generator.
     *
     * REPLACES: Python's Grower.iterator() method
     *
     * @param {Object} opening - Opening configuration containing:
     *   - name: Human-readable name like "Italian Game"
     *   - moves: Array of starting moves like ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']
     *   - perspective: 'white' or 'black' - which side we're building the repertoire for
     *
     * @param {number} chapterNumber - Chapter number (1-based) for labeling output
     *
     * @returns {Promise<Object>} - Chapter data object containing:
     *   - lines: Array of analyzed lines with statistics
     *   - openingName: The opening's name
     *   - metadata: Processing information
     */
    async generateChapter(opening, chapterNumber) {
        // =====================================================================
        // RESET STATE for each chapter
        // =====================================================================
        // Clear previous results - each chapter starts fresh
        // This prevents data from one opening "leaking" into another
        this.finalLines = [];       // Completed lines ready for output
        this.processingQueue = [];  // Lines waiting to be analyzed

        // Store the opening perspective at class level for consistent winrate calculations
        // "perspective" determines whose win rate we care about (white or black)
        this.openingPerspective = opening.perspective;

        // Initialize progress tracking for UI updates
        // We estimate how many positions we'll analyze to show progress %
        const estimatedPositions = this.estimatePositionCount(opening);
        this.initializeProgress(estimatedPositions);

        try {
            // =================================================================
            // PHASE 1: ROOT ANALYSIS
            // =================================================================
            // This phase processes the user's input moves and sets up the
            // initial position(s) for further analysis.
            // Equivalent to Python's Rooter class

            log.log(`  Phase 1: Root analysis for ${opening.name}`);

            // Emit progress update for UI
            // "emit" means "send out" - we're sending data to whoever is listening
            this.emitProgress({
                stage: 'Root Analysis',
                currentMessage: `Analyzing opening moves for ${opening.name}...`
            });

            // Analyze the root position and get initial continuations
            // opening.moves might be empty [] for starting position, or have moves
            const rootResults = await this.analyzeRoot(opening.moves || [], opening.perspective);

            // Add root results to processing queue using spread operator (...)
            // The spread operator "unpacks" the array: [a, b] → a, b
            this.processingQueue.push(...rootResults);
            log.log(`  Found ${rootResults.length} initial continuations`);

            // Update progress
            this.emitProgress({
                positionsProcessed: 1,
                currentMessage: `Root analysis complete. Found ${rootResults.length} continuations.`
            });

            // =================================================================
            // PHASE 2: ITERATIVE LINE EXPANSION
            // =================================================================
            // This phase repeatedly processes positions from the queue,
            // finding opponent responses and our counter-moves, until no
            // more valid continuations exist.
            // Equivalent to Python's Leafer loop

            log.log('  Phase 2: Iterative line expansion');
            this.emitProgress({
                stage: 'Line Expansion',
                currentMessage: 'Starting iterative position analysis...'
            });

            // expandAllLines() processes the queue until empty
            // Each processed line may add new lines to the queue
            await this.expandAllLines();
            log.log(`  Expansion complete. Final lines: ${this.finalLines.length}`);

            this.emitProgress({
                linesGenerated: this.finalLines.length,
                currentMessage: `Line expansion complete. Generated ${this.finalLines.length} lines.`
            });

            // =================================================================
            // PHASE 3: OUTPUT GENERATION
            // =================================================================
            // This phase prepares the analyzed lines for formatting.
            // Note: Actual PGN formatting is done by FileGenerator (separation of concerns)

            log.log('  Phase 3: Generating line data (NEW ARCHITECTURE)');
            this.emitProgress({
                stage: 'Output Generation',
                currentMessage: 'Generating final PGN output...'
            });

            // Generate structured output data (not formatted PGN yet)
            const output = await this.generateOutput(opening.name, chapterNumber);

            // Log output details for debugging
            // The ?. is "optional chaining" - safely access properties that might not exist
            log.log('  📊 BookBuilder.generateChapter() returning:', {
                type: typeof output,
                isObject: typeof output === 'object',
                hasLines: output?.lines ? true : false,
                linesCount: output?.lines?.length || 'N/A'
            });

            // Mark processing as 100% complete
            this.emitProgress({
                positionsProcessed: this.progressState.totalEstimated,
                percentage: 100,
                currentMessage: `Chapter generation complete! Generated ${output?.lines?.length || 0} lines.`
            });

            return output;

        } catch (error) {
            // Re-throw with additional context for debugging
            throw new Error(`Failed to generate chapter ${chapterNumber}: ${error.message}`);
        }
    }

    /**
     * Root analysis method (replaces Python's Rooter class)
     * Analyzes the move sequence and determines initial valid continuations
     *
     * This method now implements the Python iterative approach, calculating
     * cumulative likelihood by tracking opponent move probabilities only.
     *
     * @param {Array} moveSequence - Array of moves in SAN notation (e.g., ['e4', 'e5', 'Nf3'])
     * @param {string} perspective - Opening perspective ('white' or 'black')
     * @returns {Array} - Array of initial line objects for processing
     */
    async analyzeRoot(moveSequence, perspective) {
        try {
            // Start from the initial chess position
            const success = this.chessEngine.parsePosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
            if (!success) {
                throw new Error(`Failed to initialize starting position`);
            }

            log.log(`    Root analysis: ${moveSequence.length} moves in sequence, perspective: ${perspective}`);
            log.log(`    Move sequence:`, moveSequence);

            // Initialize probability tracking
            let cumulativeLikelihood = 1.0;
            let likelihoodPath = [];

            // Convert perspective to engine format for comparison
            const ourPerspectiveColor = perspective === 'white' ? 'w' : 'b';

            log.log(`    Calculating cumulative likelihood using Python iterative approach`);
            log.log(`    Our perspective: ${perspective} (${ourPerspectiveColor}), tracking opponent moves only`);

            // Iterate through each move in the sequence (Python Rooter approach)
            if (moveSequence.length > 0) {
                // Iterate through each move in the sequence (exact Python logic)
                for (let i = 0; i < moveSequence.length; i++) {
                    const move = moveSequence[i];
                    const currentTurn = this.chessEngine.getTurn();

                    log.log(`    Move ${i + 1}: ${move}, current turn: ${currentTurn}, our perspective: ${ourPerspectiveColor}`);

                    // Check if this is an opponent's move (matches Python: if board.turn != perspective)
                    if (currentTurn !== ourPerspectiveColor) {
                        log.log(`      → This is opponent's move, calculating probability`);

                        // Get position stats for current position (only for opponent moves)
                        const currentFen = this.chessEngine.getFen();
                        const positionStats = await this.lichessClient.getPositionStats(currentFen, this.lichessApiOptions);

                        if (!positionStats || !positionStats.moves) {
                            throw new Error(`Failed to get position stats for opponent move ${move} at FEN: ${currentFen}`);
                        }

                        // Find this move in the stats (equivalent to Python's find_opponent_move)
                        const moveProb = this.findMoveInStats(move, positionStats.moves);

                        if (moveProb === null) {
                            throw new Error(`Opponent move ${move} not found in Lichess database at position: ${currentFen}`);
                        }

                        cumulativeLikelihood *= moveProb;
                        likelihoodPath.push({
                            san: move,
                            playrate: moveProb
                        });
                        log.log(`      → Move probability: ${moveProb}, cumulative: ${cumulativeLikelihood}`);
                    } else {
                        log.log(`      → This is our move, skipping probability calculation (100%)`);
                    }

                    // Make the move on the board (equivalent to Python's board.push(move))
                    const moveResult = this.chessEngine.makeMove(move);
                    if (!moveResult) {
                        throw new Error(`Failed to make move: ${move} at position ${i + 1}`);
                    }

                    log.log(`      → Move ${move} executed successfully`);
                }
            } else {
                log.log(`    Starting position (no moves), using cumulative likelihood: 1.0`);
            }

            log.log(`    Final cumulative likelihood: ${cumulativeLikelihood}`);
            log.log(`    Likelihood path:`, likelihoodPath.map(p => `${p.san}(${p.playrate})`).join(' '));
            log.log(`    Opponent moves tracked: ${likelihoodPath.length}, Our moves skipped: ${moveSequence.length - likelihoodPath.length}`);

            // Create single line object representing the input sequence (matches Python Rooter behavior)
            const finalFen = this.chessEngine.getFen();
            const singleLine = {
                fen: finalFen,
                pgn: this.chessEngine.getPgn(),
                perspective: perspective,
                cumulativeLikelihood: cumulativeLikelihood,
                likelihoodPath: likelihoodPath
            };

            log.log(`    Root analysis complete: 1 initial line representing input sequence`);
            log.log(`    Line: "${singleLine.pgn}" with likelihood ${cumulativeLikelihood.toFixed(6)}`);
            return [singleLine];

        } catch (error) {
            throw new Error(`analyzeRoot failed: ${error.message}`); // Re-throw with context; original error contains FEN details if relevant
        }
    }

    /**
     * =========================================================================
     * Iterative line expansion - processes queued lines until complete
     * =========================================================================
     *
     * WHAT THIS METHOD DOES:
     * Takes lines from the processingQueue and expands each one by finding
     * opponent responses and our counter-moves. Continues until the queue is
     * empty (all lines are fully explored).
     *
     * WHY SEQUENTIAL PROCESSING?
     * The Lichess API has rate limits (~2 requests/second). Parallel processing
     * would cause multiple requests to fire simultaneously, triggering 429 errors.
     * Since the API is the bottleneck, sequential processing is just as fast
     * and avoids rate limiting issues. The 500ms throttle in LichessClient
     * handles the delay between requests.
     *
     * DESIGN PATTERN: Breadth-first search (BFS)
     * We use a queue (first-in-first-out) so we explore all variations at the
     * same depth before going deeper into the game tree.
     *
     * @returns {Promise<void>} - No return value; populates this.finalLines
     */
    async expandAllLines() {
        // Track how many lines we've processed for logging and user feedback
        let linesProcessed = 0;

        // Process one line at a time until the queue is empty
        // The while loop continues as long as the queue has items (.length > 0)
        while (this.processingQueue.length > 0) {
            // Take the first line from the queue using shift()
            // .shift() removes and returns the first element (like pop from the front)
            // This gives us FIFO (first-in-first-out) behavior - a queue, not a stack
            const lineData = this.processingQueue.shift();

            // Increment counter for user-facing progress messages
            linesProcessed++;

            // Log progress for developers debugging the process
            log.log(`    Processing line ${linesProcessed}, ${this.processingQueue.length} remaining in queue`);

            // Update progress message for the user (shown in the UI)
            this.emitProgress({
                currentMessage: `Processing line ${linesProcessed}, ${this.processingQueue.length} remaining...`
            });

            // Expand this line - find opponent responses and our replies
            // This makes Lichess API calls (throttled at 500ms each in LichessClient)
            // The await pauses here until expandLine completes (async operation)
            const newLines = await this.expandLine(lineData);

            // Add any new lines to the queue for further processing
            // expandLine returns an array of new lines (or empty array if line is complete)
            if (newLines && newLines.length > 0) {
                // The spread operator (...) unpacks the array elements
                // .push(...newLines) is like .push(newLines[0], newLines[1], ...)
                this.processingQueue.push(...newLines);
            }
        }

        // Log completion summary for developers
        log.log(`    Expansion completed after processing ${linesProcessed} lines`);
    }

    /**
     * Line expansion method (replaces Python's Leafer._calculate_pgns())
     * Analyzes a single line to find opponent continuations and our responses
     *
     * @param {Object} lineData - Line data object with fen, pgn, perspective, etc.
     * @returns {Array} - Array of new line objects to add to processing queue
     */
    async expandLine(lineData) {
        const { fen, pgn, cumulativeLikelihood, likelihoodPath, perspective } = lineData;

        // **SIMPLE PROGRESS COUNTER**
        this.progressState.positionsProcessed++;
        this.emitProgress({
            positionsProcessed: this.progressState.positionsProcessed,
            currentMessage: `Processing position ${this.progressState.positionsProcessed}...`
        });

        // **CREATE ISOLATED ENGINE INSTANCE**
        const isolatedEngine = this.createIsolatedEngine();
        log.log(`[BookBuilder] Created isolated engine for line expansion`);

        try {
            // Parse position with enhanced debugging using isolated engine
            log.log(`[BookBuilder] Expanding line with FEN: ${fen}`);
            const success = isolatedEngine.parsePositionWithDebug(fen);
            if (!success) {
                throw new Error(`Invalid FEN: ${fen}`);
            }

            // Validate engine state consistency
            if (!this.validateEngineState(isolatedEngine, fen)) {
                throw new Error(`Engine state inconsistency after loading FEN: ${fen}`);
            }

            // Get initial position debug info
            const initialPosition = isolatedEngine.debugPosition();
            log.log(`[BookBuilder] Initial position state:`, initialPosition);

            // Find opponent continuations (use high limit to get all opponent options)
            const continuations = await this.lichessClient.getPositionStats(fen, {
                ...this.lichessApiOptions,
                moves: 15  // High limit - we want all reasonable opponent options
            });

            if (!continuations || !continuations.moves) {
                DeterministicMode.throwOnFailure(
                    false,
                    `Failed to get position continuations for FEN: ${fen}`
                );
            }

            // Count ALL moves returned by Lichess before filtering - the filtering itself
            // is analysis work (checking likelihood thresholds), so we count every move
            // we consider, not just those that pass. This makes the counter increment
            // faster, giving users better visual feedback that work is happening.
            this.progressState.movesAnalyzed += continuations.moves.length;

            // Emit progress immediately so the UI updates with the new moves count
            // This is especially important when engine is enabled - engine analysis is slow,
            // so we need to push updates at every opportunity to avoid UI appearing frozen
            this.emitProgress({
                movesAnalyzed: this.progressState.movesAnalyzed,
                currentMessage: `Analyzing ${continuations.moves.length} opponent continuations...`
            });

            const validContinuations = continuations.moves.filter(move =>
                this.isValidContinuation(move, cumulativeLikelihood)
            );

            if (validContinuations.length === 0) {
                log.log(`    [DEBUG] No valid continuations found. Original moves: ${continuations.moves?.length || 0}, filtered to: 0`);
                if (continuations.moves) {
                    log.log(`    [DEBUG] First move analysis:`, continuations.moves[0]);
                }
                // Empty results after filtering are valid - moves may not meet quality thresholds
                // This is expected behavior for maintaining repertoire quality
                await this.finalizeLine(lineData);
                return [];
            }

            const newLines = [];

            for (const move of validContinuations) {
                try {
                    // Track how many continuations we're processing in this position
                    this.progressState.continuationsFound = validContinuations.length;

                    // **ENHANCED MOVE VALIDATION PIPELINE**
                    log.log(`[BookBuilder] Processing opponent move: ${move.san}`);
                    log.log(`[BookBuilder] Position before move:`, isolatedEngine.debugPosition());

                    // Validate move against current legal moves
                    if (!isolatedEngine.validateMoveBeforeExecution(move.san)) {
                        log.warn(`[BookBuilder] Skipping invalid opponent move: ${move.san}`);
                        log.warn(`[BookBuilder] Available moves were:`, isolatedEngine.getLegalMoves().map(m => m.san || m));
                        continue;
                    }

                    // Make opponent's move with enhanced validation
                    const moveResult = isolatedEngine.makeMove(move.san);
                    if (!moveResult) {
                        log.warn(`[BookBuilder] Move execution failed for: ${move.san}`);
                        continue;
                    }

                    log.log(`[BookBuilder] Opponent move ${move.san} executed successfully:`, moveResult);

                    // **CAPTURE MOVE NUMBER AT CORRECT TIMING**
                    // Get move number AFTER opponent's move but BEFORE our response (matches Python behavior)
                    const correctMoveNumber = isolatedEngine.getMoveNumber();
                    log.log(`[BookBuilder] Move number after opponent's move: ${correctMoveNumber}`);

                    const newFen = isolatedEngine.getFen();

                    // Find our best response (use user-configured move limit for candidate selection)
                    const positionData = await this.lichessClient.getPositionStats(newFen, {
                        ...this.lichessApiOptions,
                        moves: this.config.MOVES || 10  // User-configured "Most Played Moves" limit
                    });

                    if (!positionData || !positionData.moves || positionData.moves.length === 0) {
                        // No candidate moves available - try engine completion or finalize
                        isolatedEngine.undoMove(); // Undo opponent's move
                        const completed = await this.handleNoGoodResponse(lineData, move, newFen, isolatedEngine);
                        if (completed) {
                            newLines.push(completed);
                        }
                        continue;
                    }

                    // Count our candidate response moves for progress tracking (mirrors line 690 for opponent moves)
                    // Why: movesAnalyzed tracks ALL moves we evaluate from Lichess API, not just those we use
                    // This gives users visual feedback that work is happening, even if filtering rejects many moves
                    // positionData.moves is the API response containing candidate moves for our repertoire
                    this.progressState.movesAnalyzed += positionData.moves.length;

                    // Emit progress immediately so the UI updates with the new moves count
                    // This is critical when engine is enabled - without this call, the UI would only update
                    // once per position (at the start of expandLine), making counters appear frozen
                    this.emitProgress({
                        movesAnalyzed: this.progressState.movesAnalyzed,
                        currentMessage: `Evaluating ${positionData.moves.length} candidate responses...`
                    });

                    log.log(`[BookBuilder] Position after opponent move has ${positionData.moves.length} candidate responses`);
                    log.log(`   Top 3 candidates:`, positionData.moves.slice(0, 3).map(m => ({
                        san: m.san,
                        games: m.white + m.black + m.draws,
                        playrate: m.playrate?.toFixed(4)
                    })));

                    log.log(`[BookBuilder] Calling MoveSelector to find our best response...`);
                    // Pass stockfishEngine for engine validation of candidate moves
                    // (was incorrectly passing lichessClient which doesn't have engine methods)
                    const bestResponse = await this.moveSelector.selectBestMove(
                        { fen: newFen, perspective: lineData.perspective },
                        positionData.moves,
                        this.stockfishEngine,
                        this.statisticsEngine
                    );

                    if (bestResponse?.selectedMove) {
                        log.log(`[BookBuilder] MoveSelector returned: ${bestResponse.selectedMove.san || bestResponse.selectedMove.uci}`);
                        log.log(`   Selection details:`, {
                            reason: bestResponse.selectionReason,
                            candidateCount: bestResponse.candidateCount,
                            qualityFiltered: bestResponse.qualityFiltered,
                            engineFiltered: bestResponse.engineFiltered
                        });
                    } else {
                        log.log(`[BookBuilder] MoveSelector returned no valid response`);
                    }

                    const selectedMove = bestResponse?.selectedMove;
                    log.log(`[BookBuilder] Validating selected response: ${selectedMove?.san || selectedMove?.uci || 'NONE'}`);

                    if (selectedMove && this.isValidResponse(selectedMove, move)) {
                        log.log(`[BookBuilder] ✅ Response validation passed`);
                        // **VALIDATE OUR RESPONSE MOVE**
                        log.log(`[BookBuilder] Processing our response move: ${selectedMove.san}`);
                        log.log(`[BookBuilder] Position before our move:`, isolatedEngine.debugPosition());

                        // Validate our response move
                        if (!isolatedEngine.validateMoveBeforeExecution(selectedMove.san)) {
                            log.warn(`[BookBuilder] Skipping invalid response move: ${selectedMove.san}`);
                            log.warn(`[BookBuilder] Available moves were:`, isolatedEngine.getLegalMoves().map(m => m.san || m));
                            isolatedEngine.undoMove(); // Undo opponent's move
                            continue;
                        }

                        // Make our response
                        const ourMoveResult = isolatedEngine.makeMove(selectedMove.san);
                        if (!ourMoveResult) {
                            log.warn(`[BookBuilder] Our move execution failed: ${selectedMove.san}`);
                            isolatedEngine.undoMove(); // Undo opponent's move
                            continue;
                        }

                        log.log(`[BookBuilder] Our response move ${selectedMove.san} executed successfully:`, ourMoveResult);
                        log.log(`[BookBuilder] Final position after both moves:`, isolatedEngine.debugPosition());

                        const finalFen = isolatedEngine.getFen();

                        const newLikelihoodPath = [...likelihoodPath, {
                            san: move.san,
                            playrate: move.playrate
                        }];

                        const newPgn = this.updatePgn(pgn, move.san, selectedMove.san, perspective, correctMoveNumber);
                        log.log(`[BookBuilder] PGN updated: "${pgn}" -> "${newPgn}"`);

                        const newLine = {
                            fen: finalFen,
                            pgn: newPgn,
                            perspective: perspective === 'white' ? 'black' : 'white',
                            cumulativeLikelihood: move.playrate * cumulativeLikelihood,
                            likelihoodPath: newLikelihoodPath
                        };

                        log.log(`[BookBuilder] ➕ Created new line:`, {
                            pgn: newLine.pgn,
                            perspective: newLine.perspective,
                            cumulativeLikelihood: newLine.cumulativeLikelihood?.toFixed(6),
                            likelihoodPathLength: newLine.likelihoodPath.length
                        });

                        newLines.push(newLine);

                        // Undo both moves to restore original position
                        isolatedEngine.undoMove(); // Undo our move
                        isolatedEngine.undoMove(); // Undo opponent's move

                    } else {
                        log.log(`[BookBuilder] ❌ No valid response found for opponent move: ${move.san}`);
                        if (selectedMove) {
                            log.log(`   Selected move failed validation:`, {
                                move: selectedMove.san || selectedMove.uci,
                                reason: 'Failed isValidResponse check'
                            });
                        } else {
                            log.log(`   No move was selected by MoveSelector`);
                        }

                        // No good response - try engine completion or finalize
                        isolatedEngine.undoMove(); // Undo opponent's move
                        log.log(`[BookBuilder] Trying engine completion or line finalization...`);
                        const completed = await this.handleNoGoodResponse(lineData, move, newFen, isolatedEngine);
                        if (completed) {
                            log.log(`[BookBuilder] ➕ Engine completion created new line: ${completed.pgn}`);
                            newLines.push(completed);
                        } else {
                            log.log(`[BookBuilder] Line finalized without extension`);
                        }
                    }

                } catch (moveError) {
                    log.warn(`Error processing move ${move.san}: ${moveError.message}`);
                    continue;
                }
            }

            log.log(`[BookBuilder] Line expansion completed: Generated ${newLines.length} new lines`);
            if (newLines.length > 0) {
                log.log(`   New lines summary:`, newLines.map(line => ({
                    pgn: line.pgn,
                    likelihood: line.cumulativeLikelihood?.toFixed(6)
                })));
            }

            return newLines;

        } catch (error) {
            // Infrastructure failures should be re-thrown (not silently swallowed)
            // These indicate real problems that need to be reported, not gracefully handled
            if (error.message.includes('Failed to get position continuations') ||
                error.message.includes('Invalid FEN') ||
                error.message.includes('Engine state inconsistency')) {
                throw error;
            }

            // Recoverable errors during line expansion (invalid moves, etc.)
            // Log warning and finalize the line gracefully
            log.warn(`Error expanding line: ${error.message}`);
            await this.finalizeLine(lineData, isolatedEngine);
            return [];
        } finally {
            // Engine cleanup logging
            log.log(`[BookBuilder] Completed line expansion, isolated engine discarded`);
        }
    }

    /**
     * Handle cases where no good response is found
     * Try engine completion or finalize the line
     *
     * @param {Object} lineData - Current line data
     * @param {Object} opponentMove - Opponent's move object
     * @param {string} positionFen - FEN of chess position after opponent's move
     * @param {ChessEngine} engine - Isolated chess engine instance
     * @returns {Object|null} - New line object or null if line should be finalized
     */
    async handleNoGoodResponse(lineData, opponentMove, positionFen, engine = null) {
        if (this.config.ENGINEFINISH && this.stockfishEngine) {
            try {
                log.log(`[BookBuilder] Engine completion: fixing position analysis and move numbering`);

                // **STEP 1: Make opponent's move to get to correct position for engine analysis**
                log.log(`[BookBuilder] Making opponent move for proper position: ${opponentMove.san}`);
                const opponentMoveResult = this.chessEngine.makeMove(opponentMove.san);
                if (!opponentMoveResult) {
                    log.warn(`[BookBuilder] Opponent move ${opponentMove.san} failed in engine completion`);
                    return null;
                }

                // **STEP 2: Capture correct move number (after opponent's move, before our response)**
                const correctMoveNumber = this.chessEngine.getMoveNumber();
                log.log(`[BookBuilder] Captured correct move number: ${correctMoveNumber}`);

                // **STEP 3: Get engine analysis from the position AFTER opponent's move**
                const positionAfterOpponent = this.chessEngine.getFen();
                log.log(`[BookBuilder] Getting engine move from correct position: ${positionAfterOpponent}`);
                const engineMove = await this.stockfishEngine.getBestMove(
                    positionAfterOpponent,
                    this.config.ENGINEDEPTH
                );

                if (engineMove) {
                    // **STEP 4: Make the engine move**
                    log.log(`[BookBuilder] Making engine response move: ${engineMove}`);
                    const engineMoveResult = this.chessEngine.makeMove(engineMove);
                    if (!engineMoveResult) {
                        log.warn(`[BookBuilder] Engine move ${engineMove} failed`);
                        this.chessEngine.undoMove(); // Clean up opponent's move
                        return null;
                    }

                    const newFen = this.chessEngine.getFen();

                    // **STEP 5: Build PGN with correct move number**
                    const newPgn = this.updatePgn(
                        lineData.pgn,
                        opponentMove.san,
                        engineMove,
                        lineData.perspective,
                        correctMoveNumber  // Use the correctly captured move number
                    );

                    // **STEP 6: Undo both moves to restore original position**
                    // CRITICAL: Check undo results to prevent state corruption!
                    // If undoMove() fails (returns null), the chess engine state becomes
                    // corrupted and subsequent FEN positions will be invalid/impossible.
                    // This can cause Stockfish WASM to crash with "RuntimeError: unreachable".
                    log.log(`[BookBuilder] Restoring position: undoing engine and opponent moves`);
                    const undoEngine = this.chessEngine.undoMove(); // Undo engine move
                    const undoOpponent = this.chessEngine.undoMove(); // Undo opponent move

                    // If either undo failed, reset to known-good position
                    if (!undoEngine || !undoOpponent) {
                        log.error(`[BookBuilder] Undo failed (engine: ${!!undoEngine}, opponent: ${!!undoOpponent}) - resetting to known state`);
                        log.error(`[BookBuilder] Restoring position from lineData.fen: ${lineData.fen}`);
                        this.chessEngine.parsePosition(lineData.fen);
                    }

                    return {
                        fen: newFen,
                        pgn: newPgn,
                        perspective: lineData.perspective === 'white' ? 'black' : 'white',
                        cumulativeLikelihood: opponentMove.playrate * lineData.cumulativeLikelihood,
                        likelihoodPath: [...lineData.likelihoodPath, {
                            san: opponentMove.san,
                            playrate: opponentMove.playrate
                        }]
                    };
                }
            } catch (error) {
                log.warn(`Engine completion failed: ${error.message}`);
            }
        }

        // Finalize line without good response - use chess.js for proper PGN generation
        // REFACTORED: Removed string concatenation fallbacks - throw errors instead for transparency
        const Chess = this.chessEngine.chess.constructor; // Get the Chess constructor from the engine
        const tempChess = new Chess(); // Create temporary instance for PGN manipulation

        // Load current PGN if it exists
        if (lineData.pgn && lineData.pgn.trim()) {
            tempChess.loadPgn(lineData.pgn); // Load existing moves into temp instance
        }

        // Make opponent's move - must succeed since we're finalizing with a valid opponent continuation
        const moveResult = tempChess.move(opponentMove.san); // Attempt to make the opponent's move
        if (!moveResult) {
            // REFACTORED: Throw instead of falling back to string concatenation
            throw new Error(`Invalid opponent move for finalization: ${opponentMove.san} at position after "${lineData.pgn}"`);
        }

        // Get properly formatted PGN from chess.js
        const finalPgn = tempChess.pgn(); // Extract canonical PGN with proper move numbers

        await this.finalizeLine({
            ...lineData,
            pgn: finalPgn,
            cumulativeLikelihood: opponentMove.playrate * lineData.cumulativeLikelihood,
            likelihoodPath: [...lineData.likelihoodPath, {
                san: opponentMove.san,
                playrate: opponentMove.playrate
            }]
        });

        return null;
    }

    /**
     * Finalize a line and add it to the final lines collection
     *
     * @param {Object} lineData - Line data to finalize
     * @param {ChessEngine} engine - Optional isolated engine instance
     */
    async finalizeLine(lineData, engine = null) {
        log.log(`🏁 [BookBuilder] Finalizing line: "${lineData.pgn}"`);
        log.log(`   FEN: ${lineData.fen}`);
        log.log(`   Perspective: ${lineData.perspective}`);
        log.log(`   Cumulative likelihood: ${lineData.cumulativeLikelihood?.toFixed(6)}`);
        log.log(`   Likelihood path length: ${lineData.likelihoodPath?.length || 0}`);

        // Use provided engine or fall back to main engine
        const chessEngine = engine || this.chessEngine;

        // Load the position into the chess engine
        log.log(`   Loading position into chess engine...`);
        chessEngine.loadPosition(lineData.fen);

        log.log(`   Getting position statistics from Lichess...`);
        const stats = await this.lichessClient.getPositionStats(lineData.fen, this.lichessApiOptions);

        if (stats) {
            log.log(`   Position stats:`, {
                white: stats.white,
                black: stats.black,
                draws: stats.draws,
                total: stats.white + stats.draws + stats.black
            });
        } else {
            log.log(`   No position stats available`);
        }

        // Initialize statistics tracking variables
        let winRate = 0;
        let totalGames = 0;
        // Track if this is a terminal position (checkmate/draw) vs real database stats
        // This allows the UI to display honest labels instead of fake percentages
        let isTerminalPosition = false;
        let terminalType = null;

        if (stats && stats.white + stats.draws + stats.black > 0) {
            // We have real Lichess database statistics for this position
            const winRateResult = this.statisticsEngine.calculateWinRate(
                stats.white,
                stats.black,
                stats.draws,
                this.config.DRAWSAREHALF
            );
            totalGames = stats.white + stats.draws + stats.black;

            // Extract the correct percentage based on REPERTOIRE perspective (not dynamic line perspective)
            // Use the original opening perspective consistently for all winrate calculations
            winRate = this.openingPerspective === 'white' ?
                winRateResult.whitePerc :
                winRateResult.blackPerc;

            // Handle legitimate null results (no games played from position)
            if (winRate === null || winRate === undefined) {
                // This matches Python logic: check for mate or insufficient data
                // calculateFallbackWinRate now returns an object with winRate and terminalType
                const fallbackResult = this.calculateFallbackWinRate(lineData.fen, lineData);
                winRate = fallbackResult.winRate;
                isTerminalPosition = true;
                terminalType = fallbackResult.terminalType;
                // Override totalGames since this is a terminal position, not real database stats
                totalGames = 1;
            }
        } else {
            // No database stats - handle terminal positions (checkmate/draw)
            // calculateFallbackWinRate throws if position is not terminal (no fake stats)
            const fallbackResult = this.calculateFallbackWinRate(lineData.fen, lineData);
            winRate = fallbackResult.winRate;
            isTerminalPosition = true;
            terminalType = fallbackResult.terminalType;
            // For terminal positions, use 1 game since outcome is deterministic
            totalGames = 1;
        }

        // Validate winRate is a proper number (should not be NaN after proper extraction)
        log.log(`   Calculated win rate: ${winRate?.toFixed(4)} (${typeof winRate})`);
        log.log(`   Total games: ${totalGames}`);
        // Log terminal position info for debugging
        if (isTerminalPosition) {
            log.log(`   Terminal position: ${terminalType}`);
        }

        if (isNaN(winRate) || !isFinite(winRate)) {
            log.error(`❌ [BookBuilder] Invalid winRate after calculation: ${winRate} for position ${lineData.fen}`);
            throw new Error(`Invalid winRate after calculation: ${winRate} for position ${lineData.fen}`);
        }

        log.log(`   ✅ Adding line to finalLines collection`);
        // Build statistics object with all required fields
        // isTerminalPosition and terminalType allow UI to display honest labels
        const statisticsObj = {
            cumulativePlayrate: lineData.cumulativeLikelihood,
            winrate: winRate,
            totalGames: totalGames
        };
        // Only add terminal position fields if this is actually a terminal position
        // This keeps the statistics object clean for normal positions
        if (isTerminalPosition) {
            statisticsObj.isTerminalPosition = true;
            statisticsObj.terminalType = terminalType;
        }

        this.finalLines.push({
            pgn: lineData.pgn,
            moves: this.extractMovesFromPgn(lineData.pgn),
            cumulativeLikelihood: lineData.cumulativeLikelihood,
            likelihoodPath: lineData.likelihoodPath,
            statistics: statisticsObj
        });

        log.log(`🏁 [BookBuilder] Line finalization completed. Total final lines: ${this.finalLines.length}`);
    }

    /**
     * Generate clean line data for formatting (data generation only)
     *
     * @param {string} openingName - Name of the opening
     * @param {number} chapterNumber - Chapter number
     * @returns {Object} - Clean line data for FileGenerator formatting
     */
    async generateOutput(openingName, _chapterNumber) {
        log.log(`📋 [BookBuilder] generateOutput() - DATA GENERATION ONLY`);
        log.log(`   📖 Opening: ${openingName}`);
        log.log(`   📊 Starting with ${this.finalLines.length} final lines`);

        // Remove duplicates and subsets (essential for preventing loops)
        log.log(`   🧹 Deduplicating lines (prevents infinite loops)...`);
        const uniqueLines = this.removeDuplicateLines(this.finalLines);
        log.log(`   ✅ After deduplication: ${uniqueLines.length} unique lines`);

        log.log(`   📦 Returning clean line data for FileGenerator`);
        log.log(`   🎯 BookBuilder role: DATA GENERATION complete`);
        log.log(`   ➡️  Next: FileGenerator will handle SORTING + FORMATTING`);

        // Return clean line data - all sorting and formatting handled by FileGenerator
        const result = {
            lines: uniqueLines,
            openingName: openingName,
            chapterNumber: _chapterNumber,
            metadata: {
                totalLines: uniqueLines.length,
                originalLines: this.finalLines.length
            }
        };

        log.log(`   📋 Returning clean line data:`, {
            linesCount: result.lines.length,
            openingName: result.openingName,
            metadata: result.metadata
        });

        return result;
    }

    // ==================== ENGINE MANAGEMENT METHODS ====================

    /**
     * Create an isolated chess engine instance for line expansion
     * Prevents state contamination between parallel processing
     * @returns {ChessEngine} - Fresh chess engine instance
     */
    createIsolatedEngine() {
        return new ChessEngine();
    }

    /**
     * Validate engine state consistency
     * @param {ChessEngine} engine - Engine to validate
     * @param {string} expectedFen - Expected FEN position
     * @returns {boolean} - True if state is consistent
     */
    validateEngineState(engine, expectedFen) {
        const currentFen = engine.getFen();
        const isConsistent = currentFen === expectedFen;
        if (!isConsistent) {
            log.error(`[BookBuilder] Engine state inconsistency!`);
            log.error(`[BookBuilder] Expected: ${expectedFen}`);
            log.error(`[BookBuilder] Actual: ${currentFen}`);
        }
        return isConsistent;
    }

    // ==================== PERSPECTIVE DETERMINATION ====================

    /**
     * Determine perspective based on move count (matches Python logic exactly)
     * Python logic: if len(moves) % 2 == 0: perspective = chess.BLACK (black)
     *              if len(moves) % 2 == 1: perspective = chess.WHITE (white)
     *
     * @param {number} moveCount - Number of moves (plies) in the sequence
     * @returns {string} - 'white' or 'black'
     */
    determinePerspective(moveCount) {
        // Python: even moves = black, odd moves = white
        const perspective = moveCount % 2 === 0 ? 'black' : 'white';
        log.log(`    📋 [BookBuilder] Perspective calculation: ${moveCount} moves % 2 = ${moveCount % 2} → ${perspective}`);
        return perspective;
    }

    // ==================== PROGRESS TRACKING METHODS ====================

    /**
     * Emit progress update to callback function
     * @param {Object} updates - Progress state updates
     */
    emitProgress(updates = {}) {
        // DEBUG: Always log that emitProgress was called
        log.log('🚀 [BookBuilder] emitProgress called:', {
            hasCallback: !!this.progressCallback,
            callbackType: typeof this.progressCallback,
            updates
        });

        if (!this.progressCallback) {
            log.warn('⚠️ [BookBuilder] No progress callback available - skipping emit');
            return;
        }

        // Update progress state
        this.progressState = { ...this.progressState, ...updates };

        const now = Date.now();
        this.progressState.lastUpdate = now;

        // Calculate processing speed and ETA
        let speed = 0;
        let eta = '--:--';

        if (this.progressState.startTime && this.progressState.positionsProcessed > 0) {
            const elapsedSeconds = (now - this.progressState.startTime) / 1000;
            speed = this.progressState.positionsProcessed / elapsedSeconds;

            if (speed > 0 && this.progressState.totalEstimated > 0) {
                const remainingPositions = Math.max(0, this.progressState.totalEstimated - this.progressState.positionsProcessed);
                const remainingSeconds = remainingPositions / speed;
                eta = this.formatTime(remainingSeconds);
            }
        }

        // Calculate percentage
        const percentage = this.progressState.totalEstimated > 0
            ? (this.progressState.positionsProcessed / this.progressState.totalEstimated) * 100
            : 0;

        // Emit progress data
        const progressData = {
            stage: this.progressState.stage,
            current: this.progressState.positionsProcessed,
            total: this.progressState.totalEstimated,
            percentage: Math.min(percentage, 100),
            speed: speed,
            eta: eta,
            currentMessage: updates.currentMessage || this.progressState.currentMessage || 'Processing...',
            lines: this.progressState.linesGenerated,
            moves: this.progressState.movesAnalyzed,
            continuations: this.progressState.continuationsFound
        };

        log.log(`📊 [BookBuilder] Progress: ${progressData.stage} - ${progressData.current}/${progressData.total} (${progressData.percentage.toFixed(1)}%)`);

        try {
            this.progressCallback(progressData);
        } catch (error) {
            log.warn('Progress callback error:', error.message);
        }
    }

    /**
     * Initialize progress tracking for a new chapter
     * @param {number} estimatedPositions - Estimated total positions to process
     */
    initializeProgress(estimatedPositions = 100) {
        this.progressState.startTime = Date.now();
        this.progressState.totalEstimated = estimatedPositions;
        this.progressState.positionsProcessed = 0;
        this.progressState.linesGenerated = 0;
        this.progressState.movesAnalyzed = 0;
        this.progressState.continuationsFound = 0;

        this.emitProgress({
            stage: 'Root Analysis',
            currentMessage: 'Starting opening analysis...'
        });
    }

    /**
     * Estimate the number of positions that will be processed
     * @param {Object} opening - Opening configuration
     * @returns {number} - Estimated position count
     */
    estimatePositionCount(opening) {
        // Base estimate starts with opening depth
        const openingDepth = (opening.moves || []).length;

        // Rough estimates based on typical chess tree growth
        // These are conservative estimates for progress display
        let estimate = 20; // Base minimum for any opening

        if (openingDepth <= 2) {
            estimate = 50; // Many possibilities from starting positions
        } else if (openingDepth <= 4) {
            estimate = 30; // Moderate tree growth
        } else {
            estimate = 20; // Deeper positions have fewer valid continuations
        }

        // Adjust based on configuration complexity
        const depthLikelihood = this.config.DEPTHLIKELIHOOD || 0.002;
        if (depthLikelihood < 0.001) {
            estimate *= 2; // Very thorough analysis = more positions
        } else if (depthLikelihood > 0.005) {
            estimate = Math.max(10, estimate * 0.5); // Quick analysis = fewer positions
        }

        log.log(`📊 [BookBuilder] Estimated ${estimate} positions for opening: ${opening.name}`);
        return Math.round(estimate);
    }

    /**
     * Format time in MM:SS format
     * @param {number} seconds - Seconds to format
     * @returns {string} - Formatted time string
     */
    formatTime(seconds) {
        if (!seconds || seconds < 0) return '--:--';

        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Find move probability in Lichess position stats
     * Equivalent to Python's WorkerPlay.find_opponent_move()
     *
     * @param {string} move - Move in SAN notation (e.g., 'e4', 'Nf3')
     * @param {Array} moves - Array of move stats from LichessClient (includes playrate)
     * @returns {number|null} - Move playrate or null if not found
     */
    findMoveInStats(move, moves) {
        // LichessClient already provides both 'san' and 'uci' fields, plus calculated 'playrate'
        const moveStats = moves.find(m => m.san === move || m.uci === move);
        return moveStats ? moveStats.playrate : null;
    }

    /**
     * Check if a continuation meets the minimum thresholds
     */
    isValidContinuation(move, cumulativeLikelihood) {
        const continuationLikelihood = move.playrate * cumulativeLikelihood;
        const depthCheck = continuationLikelihood >= this.config.DEPTHLIKELIHOOD;
        const gamesCheck = move.totalGames > this.config.CONTINUATIONGAMES;
        // FIXED: Remove MINPLAYRATE check for opponent moves - only use DEPTHLIKELIHOOD + CONTINUATIONGAMES
        const isValid = depthCheck && gamesCheck;

        log.log(`🔍 [BookBuilder] Continuation validation: ${move.san || move.uci}`);
        log.log(`      Raw playrate: ${move.playrate?.toFixed(4)} (${(move.playrate * 100)?.toFixed(2)}%)`);
        log.log(`      Cumulative likelihood to reach position prior to continuation: ${cumulativeLikelihood?.toFixed(6)} (${(cumulativeLikelihood * 100)?.toFixed(4)}%)`);
        log.log(`      Continuation likelihood: ${continuationLikelihood?.toFixed(6)} >= ${this.config.DEPTHLIKELIHOOD} = ${depthCheck ? '✅' : '❌'}`);
        log.log(`      Games check: ${move.totalGames} > ${this.config.CONTINUATIONGAMES} = ${gamesCheck ? '✅' : '❌'}`);
        log.log(`      Playrate check: REMOVED (only applies to our responses, not opponent moves)`);
        log.log(`      Overall result: ${isValid ? '✅ VALID' : '❌ INVALID'}`);

        return isValid;
    }

    /**
     * Check if our response meets the quality thresholds
     */
    isValidResponse(response, opponentMove) {
        log.log(`   🔍 [BookBuilder] Response validation for ${response?.san || response?.uci}:`);
        log.log(`      🔧 [BookBuilder] Config values: MINGAMES=${this.config.MINGAMES}, MINPLAYRATE=${this.config.MINPLAYRATE}, CONTINUATIONGAMES=${this.config.CONTINUATIONGAMES}`);

        const hasResponse = !!response;
        // FIXED: Remove opponent playrate check - already validated in isValidContinuation
        const responseGamesCheck = response?.totalGames > this.config.MINGAMES;
        const responseWinRateCheck = response?.winRate > 0;
        const responsePlayrateCheck = response?.playrate > this.config.MINPLAYRATE;

        log.log(`      Has response: ${hasResponse ? '✅' : '❌'}`);
        log.log(`      Response games: ${response?.totalGames} > ${this.config.MINGAMES} = ${responseGamesCheck ? '✅' : '❌'}`);
        log.log(`      Response win rate: ${response?.winRate?.toFixed(3)} > 0 = ${responseWinRateCheck ? '✅' : '❌'}`);
        log.log(`      Response playrate: ${response?.playrate?.toFixed(4)} > ${this.config.MINPLAYRATE} = ${responsePlayrateCheck ? '✅' : '❌'}`);

        const isValid = hasResponse && responseGamesCheck && responseWinRateCheck && responsePlayrateCheck;
        log.log(`      Overall result: ${isValid ? '✅ VALID' : '❌ INVALID'}`);

        return isValid;
    }

    /**
     * Update PGN string with new moves (matches Python formatting exactly)
     * Uses explicit move number captured at correct timing
     */
    updatePgn(currentPgn, opponentMove, ourMove, perspective, moveNumber = null) {
        log.log(`[BookBuilder] updatePgn called:`);
        log.log(`   currentPgn: "${currentPgn}"`);
        log.log(`   opponentMove: "${opponentMove}"`);
        log.log(`   ourMove: "${ourMove}"`);
        log.log(`   perspective: "${perspective}"`);

        try {
            // Create a new chess instance and load current position
            const Chess = this.chessEngine.chess.constructor;
            const tempChess = new Chess();

            // Load current PGN - chess.js handles loose formatting automatically
            if (currentPgn && currentPgn.trim()) {
                tempChess.loadPgn(currentPgn);
            }

            log.log(`   Chess.js state before moves: turn=${tempChess.turn()}, moveNumber=${tempChess.moveNumber()}`);

            // Make both moves in sequence
            const opponentMoveResult = tempChess.move(opponentMove);
            if (!opponentMoveResult) {
                throw new Error(`Invalid opponent move: ${opponentMove}`);
            }
            log.log(`   Opponent move executed: ${opponentMoveResult.san}`);

            const ourMoveResult = tempChess.move(ourMove);
            if (!ourMoveResult) {
                throw new Error(`Invalid our move: ${ourMove}`);
            }
            log.log(`   Our move executed: ${ourMoveResult.san}`);

            // Get the properly formatted PGN from chess.js
            const result = tempChess.pgn();
            log.log(`   Chess.js generated PGN: "${result}"`);
            return result;

        } catch (error) {
            // REFACTORED: Throw error instead of silently falling back to string concatenation
            // String concatenation can produce invalid PGN that breaks downstream processing
            throw new Error(`PGN update failed: ${error.message}. Input: currentPgn="${currentPgn}", opponentMove="${opponentMove}", ourMove="${ourMove}"`);
        }
    }

    /**
     * Remove duplicate lines and subsets (exact replication of Python logic)
     */
    removeDuplicateLines(lines) {
        const unique = [];
        const seen = new Set();

        for (const line of lines) {
            const key = line.pgn;
            if (!seen.has(key)) {
                seen.add(key);

                // Check if this line is a subset of an existing line
                const isSubset = unique.some(existing =>
                    existing.pgn.includes(key) && existing.pgn !== key
                );

                if (!isSubset) {
                    // Remove any existing lines that are subsets of this line
                    for (let i = unique.length - 1; i >= 0; i--) {
                        if (key.includes(unique[i].pgn) && key !== unique[i].pgn) {
                            unique.splice(i, 1);
                        }
                    }
                    unique.push(line);
                }
            }
        }

        return unique;
    }

    /**
     * Sort lines by consecutive move probabilities (exact replication of Python sorting)
     */
    sortLinesByProbability(lines) {
        return lines.sort((a, b) => {
            const aProbs = a.likelihoodPath.map(move => move.playrate);
            const bProbs = b.likelihoodPath.map(move => move.playrate);

            for (let i = 0; i < Math.min(aProbs.length, bProbs.length); i++) {
                if (aProbs[i] !== bProbs[i]) {
                    return bProbs[i] - aProbs[i]; // Descending order
                }
            }

            return bProbs.length - aProbs.length;
        });
    }

    /**
     * Calculate fallback win rate for terminal positions (checkmate/draw)
     *
     * WHAT IT DOES:
     * Determines the win rate for positions that have no Lichess database statistics
     * because they are terminal positions (checkmate or draw). Returns both the
     * calculated win rate and the type of terminal position for transparent display.
     *
     * WHY WE RETURN AN OBJECT:
     * We need to know whether this was a checkmate or draw so the UI can display
     * an honest label like "Position outcome: Checkmate (win)" instead of fake
     * statistics like "100% over 1 games".
     *
     * PARAMETERS:
     * @param {string} fen - The FEN string of the position to evaluate
     * @param {Object} lineData - Contains perspective info for determining win/loss
     *
     * RETURNS:
     * @returns {{winRate: number, terminalType: string}} Object containing:
     *   - winRate: 0.0, 0.5, or 1.0 based on position outcome
     *   - terminalType: 'checkmate' or 'draw' for display purposes
     *
     * THROWS:
     * Error if position is not terminal (no fake stats for normal positions)
     */
    calculateFallbackWinRate(fen, lineData) {
        // Load the position into the chess engine to check game state
        this.chessEngine.loadPosition(fen);

        // Check if position is checkmate - the side to move has been mated
        if (this.chessEngine.isCheckmate()) {
            // Get whose turn it is - they are the side that got mated
            const turnColor = this.chessEngine.getTurn(); // 'w' or 'b'
            const isWhiteToMove = turnColor === 'w';

            // Determine win rate based on who got mated and our perspective:
            // - If white to move and in checkmate: black wins (white perspective = 0.0 loss)
            // - If black to move and in checkmate: white wins (white perspective = 1.0 win)
            let winRate;
            if (lineData.perspective === 'white') {
                winRate = isWhiteToMove ? 0.0 : 1.0;
            } else {
                winRate = isWhiteToMove ? 1.0 : 0.0;
            }
            // Return object with winRate and terminalType for transparent display
            return { winRate, terminalType: 'checkmate' };
        }

        // Check if position is a draw (stalemate, insufficient material, etc.)
        if (this.chessEngine.isDraw()) {
            // DRAWSAREHALF config controls how draws are scored:
            // - 1: Draws count as 0.5 (half a win, like tournament scoring)
            // - 0: Draws count as 0.0 (treated as losses for repertoire purposes)
            const winRate = this.config.DRAWSAREHALF ? 0.5 : 0.0;
            return { winRate, terminalType: 'draw' };
        }

        // Position is not terminal - we should never reach here with real data
        // Throw error rather than silently manufacturing fake statistics
        throw new Error(`No statistics available for position: ${fen}`);
    }

    /**
     * Extract moves array from PGN string for proper formatting
     *
     * WHAT IT DOES:
     * Takes a PGN string (with or without headers) and extracts all moves
     * as an array of move objects. Uses chess.js for robust parsing.
     *
     * PARAMETERS:
     * @param {string} pgn - PGN string with moves (e.g., "1. e4 e5 2. Nf3 Nc6")
     *
     * RETURNS:
     * @returns {Array<{san: string}>} Array of move objects with SAN notation
     *   Example: [{san: 'e4'}, {san: 'e5'}, {san: 'Nf3'}, {san: 'Nc6'}]
     *
     * HOW IT WORKS:
     * 1. Check for empty input - return empty array
     * 2. Create a chess.js instance via our engine's constructor
     * 3. Load the PGN using chess.js's robust parser
     * 4. Extract move history as canonical SAN notation
     * 5. Convert to array of {san: string} objects
     *
     * NOTE: Uses chess.js for robust parsing that handles:
     * - Standard PGN format ("1. e4 e5 2. Nf3 Nc6")
     * - Check/checkmate symbols ("Qxf7+", "Qxf7#")
     * - Disambiguation ("N1f3", "Rae1")
     * - Castling ("O-O", "O-O-O")
     * - Promotions ("e8=Q")
     * - PGN with headers
     */
    extractMovesFromPgn(pgn) {
        // Guard clause: handle empty/null/undefined input
        if (!pgn || pgn.trim() === '') {
            return []; // Return empty array for empty input
        }

        try {
            // Get the Chess constructor from our engine's chess.js instance
            // This avoids importing chess.js again and keeps the dependency centralized
            const Chess = this.chessEngine.chess.constructor; // Get Chess class from existing instance
            const tempChess = new Chess(); // Create fresh instance for parsing

            // Load the PGN string - chess.js handles all valid PGN formats
            // including headers, annotations, variations, and various notation styles
            tempChess.loadPgn(pgn); // Throws if PGN is invalid

            // Extract move history as canonical SAN notation
            // chess.js's history() returns moves in standardized form
            const history = tempChess.history(); // ['e4', 'e5', 'Nf3', 'Nc6']

            // Convert to array of {san: string} objects to match contract
            return history.map(san => ({ san })); // [{san: 'e4'}, {san: 'e5'}, ...]

        } catch (error) {
            // Log warning but return empty array to maintain backwards compatibility
            // This prevents crashes when encountering malformed PGN
            log.warn(`[BookBuilder] Failed to parse PGN: ${error.message}`);
            log.warn(`[BookBuilder] PGN input was: "${pgn.substring(0, 100)}..."`);
            return []; // Return empty array as fallback
        }
    }

    /**
     * Sleep utility for rate limiting
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default BookBuilder;
