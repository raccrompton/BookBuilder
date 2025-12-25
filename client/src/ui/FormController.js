/**
 * =============================================================================
 * FormController.js - Form management and workflow coordination
 * =============================================================================
 *
 * PURPOSE:
 * This is the "conductor" of the web interface. It connects the HTML form
 * to all the backend processing components. When a user clicks "Generate",
 * this class:
 * 1. Validates their input
 * 2. Converts form values to the config format BookBuilder expects
 * 3. Orchestrates the multi-step generation process
 * 4. Shows progress updates
 * 5. Displays results or errors
 *
 * ARCHITECTURE OVERVIEW:
 * The web app follows a typical MVC-ish pattern:
 * - View: HTML form (app.html)
 * - Controller: This class (FormController)
 * - Model/Services: BookBuilder, LichessClient, StockfishEngine, etc.
 *
 * WHY SEPARATE THE FORM FROM PROCESSING?
 * Separation of concerns! The form knows about UI elements (DOM, events),
 * while BookBuilder knows about chess logic. This class bridges them.
 * Benefits:
 * - BookBuilder can be tested without a browser
 * - The form can be changed without touching chess logic
 * - Each piece is simpler and focused
 *
 * KEY CONCEPTS USED:
 * - Event Listeners: Functions that run when user interacts (submit, click)
 * - DOM Manipulation: Reading form values, showing/hiding elements
 * - Async/Await: For long operations like API calls
 * - Progress Callbacks: Reporting status back to UI
 *
 * IMPORTED HELPERS:
 * - ConfigManager: Saves/loads form settings to browser storage (from ./ConfigManager.js)
 * - ErrorHandler: Displays errors to the user (from ./ErrorHandler.js)
 * - ProgressTracker: Updates the progress bar UI (from ./ProgressTracker.js)
 *
 * DEPENDENCIES:
 * - BookBuilder.js - Main repertoire generation logic
 * - LichessClient.js - API calls to Lichess
 * - StockfishEngine.js - Chess engine analysis
 * - FileGenerator.js - PGN file creation
 * - PgnProcessor.js - PGN input parsing
 * =============================================================================
 */

import BookBuilder from '../BookBuilder.js';
import LichessClient from '../api/LichessClient.js';
import { EngineFactory } from '../engine/EngineFactory.js';
import ConfigManager from './ConfigManager.js';
import ErrorHandler from './ErrorHandler.js';
import FileGenerator from './FileGenerator.js';
import ProgressTracker from './ProgressTracker.js';
import PgnProcessor from '../utils/PgnProcessor.js';
import { JobManager } from '../jobs/JobManager.js';
import { JOB_STATUS } from '../jobs/JobStore.js';

// Logger: Configurable logging - toggle with Logger.setEnabled('FormController', true/false)
import Logger from '../utils/Logger.js';
const log = Logger.get('FormController');

/**
 * =============================================================================
 * FormController Class - Main controller for the web interface
 * =============================================================================
 *
 * This class is instantiated when the page loads and manages all user
 * interactions with the BookBuilder form. It's the "glue" between the
 * HTML form and the JavaScript processing components.
 *
 * LIFECYCLE:
 * 1. Page loads → FormController created → event listeners attached
 * 2. User fills form → values auto-saved to browser storage
 * 3. User clicks Generate → handleSubmit() validates and starts generation
 * 4. Generation runs → progress updates shown
 * 5. Complete → results displayed or errors shown
 */
class FormController {
    /**
     * Constructor - Initialize the form controller
     *
     * Sets up three key things:
     * 1. Helper objects for config, progress, and errors
     * 2. Placeholders for API components (created later when needed)
     * 3. Event listeners for user interactions
     */
    constructor() {
        // =====================================================================
        // Helper Components
        // =====================================================================
        // These handle specific aspects of the UI

        // ConfigManager: Saves/loads form settings to browser's sessionStorage
        // This lets users refresh the page without losing their settings
        this.configManager = new ConfigManager();

        // ProgressTracker: Updates the progress bar during generation
        // Provides visual feedback so users know processing is happening
        this.progressTracker = new ProgressTracker();

        // ErrorHandler: Displays error messages to users
        // Formats technical errors into user-friendly messages
        this.errorHandler = new ErrorHandler();

        // =====================================================================
        // API Components (Lazy Initialization)
        // =====================================================================
        // These are null initially and created when generation starts
        // This is "lazy initialization" - don't create expensive objects until needed

        // LichessClient: HTTP client for Lichess API calls
        this.lichessClient = null;

        // StockfishEngine: Chess engine for move validation
        this.stockfishEngine = null;

        // BookBuilder: Main orchestrator for repertoire generation
        this.bookBuilder = null;

        // =====================================================================
        // Job Queue Feature Flag (Phase 4)
        // =====================================================================
        // Check URL for useJobQueue parameter to enable job persistence
        // This allows jobs to survive page refresh and enables cancellation
        const params = new URLSearchParams(location.search);
        this.useJobQueue = params.has('useJobQueue');

        // JobManager: Handles job persistence and state machine (if enabled)
        this.jobManager = null;
        this.currentJobId = null;

        if (this.useJobQueue) {
            log.log('🔧 [FormController] Job queue enabled via useJobQueue parameter');
            this.jobManager = new JobManager();
            this._setupJobRehydration();
        }

        // =====================================================================
        // Setup
        // =====================================================================
        // Attach event handlers and initialize UI elements

        this.setupEventListeners();  // Connect buttons/inputs to functions
        this.setupRangeDisplays();   // Show current values on slider inputs
    }

    /**
     * Setup Event Listeners - Connect DOM events to handler functions
     *
     * WHAT ARE EVENT LISTENERS?
     * Event listeners are functions that "wait" for something to happen in the
     * browser (like a button click or form submission), then run code in response.
     *
     * Pattern: element.addEventListener('eventName', handlerFunction)
     *
     * This method sets up listeners for:
     * 1. Form submission (main "Generate" action)
     * 2. Auto-save on any input change
     * 3. Range slider value display updates
     * 4. PGN input validation as user types
     */
    setupEventListeners() {
        // No tab switching needed - using single page layout

        // =====================================================================
        // Form Submission Handler
        // =====================================================================
        // When user clicks "Generate", we want to intercept the form submission
        // and handle it with JavaScript instead of the default browser behavior

        log.log('🔗 [DEBUG] Setting up form event listener...');

        // document.getElementById() finds an HTML element by its id attribute
        // Returns null if not found
        const form = document.getElementById('bookbuilder-form');
        if (!form) {
            log.error('❌ [DEBUG] Form not found!');
            return;
        }

        // The 'submit' event fires when user clicks submit button or presses Enter
        // The arrow function (e) => {...} is a modern way to write functions
        form.addEventListener('submit', (e) => {
            log.log('📝 [DEBUG] Form submit event triggered');

            // e.preventDefault() stops the browser's default behavior
            // Without this, the page would refresh (traditional form submission)
            e.preventDefault();

            // Call our custom submission handler instead
            this.handleSubmit();
        });

        // Also add click listener to button specifically (for debugging)
        // querySelector() finds the first element matching a CSS selector
        const submitButton = document.querySelector('button[type="submit"]');
        if (submitButton) {
            log.log('🔘 [DEBUG] Submit button found, adding click listener');
            submitButton.addEventListener('click', (e) => {
                log.log('🖱️ [DEBUG] Submit button clicked');
            });
        } else {
            log.error('❌ [DEBUG] Submit button not found!');
        }

        // =====================================================================
        // Auto-Save on Input Change
        // =====================================================================
        // querySelectorAll() returns ALL elements matching the CSS selector
        // We want to save form state whenever any input changes

        // This selector finds all inputs, selects, and textareas within the form
        document.querySelectorAll('#bookbuilder-form input, #bookbuilder-form select, #bookbuilder-form textarea').forEach(element => {
            // 'input' event fires whenever the value changes (real-time)
            // Arrow function () => this.autoSave() preserves 'this' context
            element.addEventListener('input', () => this.autoSave());
        });

        // =====================================================================
        // Range Slider Value Display
        // =====================================================================
        // Range inputs (sliders) don't show their value by default
        // We update a text display next to each slider as user drags

        document.querySelectorAll('.form-range').forEach(range => {
            range.addEventListener('input', () => this.updateRangeDisplay(range));
        });

        // =====================================================================
        // PGN Input Real-Time Validation
        // =====================================================================
        // Validate PGN as user types so they get immediate feedback

        const pgnInput = document.getElementById('pgn-input-text');
        if (pgnInput) {
            log.log('📝 [DEBUG] PGN input found, adding event listeners');

            // 'input' event: fires on every keystroke (real-time preview)
            pgnInput.addEventListener('input', () => this.handlePgnInput());

            // 'blur' event: fires when user clicks away (full validation)
            // More thorough validation when they're done typing
            pgnInput.addEventListener('blur', () => this.validatePgnInput());
        }
    }

    /**
     * Initialize range slider displays with their current values
     * Called once at startup to show initial slider positions
     */
    setupRangeDisplays() {
        document.querySelectorAll('.form-range').forEach(range => {
            this.updateRangeDisplay(range);
        });
    }

    // switchTab method removed - using single page layout

    /**
     * Auto-save form data to browser storage
     * Called on every input change so user doesn't lose their settings
     */
    autoSave() {
        // Get all current form values as an object
        const config = this.configManager.getFormData();

        // Save to sessionStorage (persists until tab is closed)
        this.configManager.saveConfig(config);
    }

    /**
     * Handle form submission - Main entry point for generation
     *
     * This is called when user clicks "Generate Repertoire". It:
     * 1. Validates the form input
     * 2. Converts form values to BookBuilder config format
     * 3. Starts the generation process
     * 4. Handles errors gracefully
     *
     * The 'async' keyword means this function can use 'await' to pause
     * while waiting for slow operations (like API calls) without blocking the UI.
     */
    async handleSubmit() {
        log.log('🚀 [DEBUG] Form submission started');

        try {
            // Log all current UI settings for debugging
            this.logCurrentSettings();

            // Validate form
            log.log('🔍 [DEBUG] Starting form validation...');
            const errors = await this.configManager.validateConfig();
            log.log('📊 [DEBUG] Validation errors:', errors);

            if (errors.length > 0) {
                log.log('❌ [DEBUG] Validation failed, showing errors');
                this.errorHandler.showValidationErrors(errors);
                return;
            }

            // Get configuration and prepare BookBuilder config
            log.log('⚙️ [DEBUG] Getting form data...');
            const formConfig = this.configManager.getFormData();
            log.log('📋 [DEBUG] Form config:', formConfig);

            log.log('🔧 [DEBUG] Converting to BookBuilder config...');
            const bookBuilderConfig = await this.convertToBookBuilderConfig(formConfig);
            log.log('🏗️ [DEBUG] BookBuilder config:', bookBuilderConfig);

            // Start repertoire generation
            log.log('🎯 [DEBUG] Starting generation process...');

            // Show simple generation status (hides form)
            if (typeof showGenerationStatus === 'function') {
                showGenerationStatus();
            }

            // Route to appropriate flow based on feature flag
            if (this.useJobQueue) {
                log.log('📋 [FormController] Using job queue flow');
                await this._handleSubmitWithJobs(bookBuilderConfig);
            } else {
                await this.startGeneration(bookBuilderConfig);
            }

        } catch (error) {
            log.error(`❌ [FormController] Error in handleSubmit:`, error);
            log.error(`   Submit error details:`, {
                message: error.message,
                stack: error.stack?.split('\n')[0] || 'no stack',
                timestamp: new Date().toISOString(),
                formData: {
                    pgn: document.getElementById('pgn-input-text')?.value?.substring(0, 50) || 'none',
                    hasTimeControls: !!document.querySelector('input[name^="time-"]:checked'),
                    hasVariants: !!document.querySelector('input[name^="variant-"]:checked')
                }
            });
            this.errorHandler.showError('Failed to start generation', error);

            // Restore form view on error
            log.log('🔄 [FormController] Restoring form view due to error...');
            if (typeof hideProgressContainer === 'function') {
                hideProgressContainer();
            }
        }
    }

    /**
     * Start the repertoire generation process
     *
     * This is the main orchestration method. It runs the generation in phases:
     * 1. Initialize API clients and engine
     * 2. Validate connections work
     * 3. Create BookBuilder with progress callback
     * 4. Process each opening
     * 5. Generate display output
     *
     * Each phase updates the progress bar so users know what's happening.
     *
     * @param {Object} config - Configuration object from convertToBookBuilderConfig()
     */
    async startGeneration(config) {
        try {
            // Start progress tracking - shows the progress bar UI
            this.progressTracker.start();

            // =========================================================================
            // Phase 1: Initialize Components (5% progress)
            // =========================================================================
            // Create the API clients and optionally the chess engine

            this.progressTracker.updatePhase('Initializing components...', 5);
            await this.initializeComponents(config);

            // Update config with the initialized engine instance
            // (config was created before initializeComponents, so stockfishEngine was null)
            // Now that the engine is initialized, we need to pass it to BookBuilder
            if (this.stockfishEngine) {
                config.stockfishEngine = this.stockfishEngine;
                log.log('✅ [FormController] Engine attached to config for BookBuilder');
            }

            // =========================================================================
            // Phase 2: Validate Connections (10% progress)
            // =========================================================================
            // Test that we can actually reach the APIs before starting real work

            this.progressTracker.updatePhase('Validating configuration...', 10);
            await this.validateConnections(config);

            // =========================================================================
            // Phase 3: Create BookBuilder (15% progress)
            // =========================================================================
            // BookBuilder is the main orchestrator for repertoire generation

            this.progressTracker.updatePhase('Creating BookBuilder instance...', 15);

            // Create a callback function that BookBuilder will call with progress updates
            // This lets us show real-time feedback as it processes positions
            const progressCallback = (progressData) => {
                this.handleBookBuilderProgress(progressData);
            };

            // Create BookBuilder with our config and progress callback
            this.bookBuilder = new BookBuilder(config, progressCallback);

            // =========================================================================
            // Phase 4: Process Openings (20-90% progress)
            // =========================================================================
            // This is where the bulk of the work happens - iterating through
            // positions, calling Lichess API, selecting moves, etc.

            this.progressTracker.updatePhase('Processing openings...', 20);
            const results = await this.processOpenings(config);

            // =========================================================================
            // Phase 5: Prepare Display (90-100% progress)
            // =========================================================================
            // Format the results and show them to the user

            this.progressTracker.updateDisplayPhase('Preparing PGN display...', 90);
            const displayResult = await this.generateDisplay(results);

            // Hide generation status before showing results
            if (typeof hideGenerationStatus === 'function') {
                hideGenerationStatus();
            }

            this.progressTracker.complete('Repertoire generated successfully!', displayResult);

        } catch (error) {
            log.error(`❌ [FormController] Generation failed in startGeneration:`, error);
            log.error(`   Error details:`, {
                message: error.message,
                stack: error.stack?.split('\n').slice(0, 3) || 'no stack',
                timestamp: new Date().toISOString(),
                phase: this.progressTracker?.currentPhase || 'unknown'
            });
            log.error(`   Config at time of error:`, config);
            this.errorHandler.showError('Generation failed', error);
            this.progressTracker.reset();

            // Restore form view on generation error
            log.log('🔄 [FormController] Restoring form view due to generation error...');
            if (typeof hideGenerationStatus === 'function') {
                hideGenerationStatus();
            }
            if (typeof hideProgressContainer === 'function') {
                hideProgressContainer();
            }
        }
    }

    /**
     * Handle progress updates from BookBuilder and update the UI
     *
     * Acts as a bridge between BookBuilder (which tracks chess processing) and the UI
     * (which shows progress to the user). Extracts position and move counts from the
     * progress data and displays them in the generation status overlay.
     *
     * @param {Object} progressData - Progress data object from BookBuilder
     * @param {number} [progressData.current] - Current position count (newer property)
     * @param {number} [progressData.positionsProcessed] - Position count (legacy property)
     * @param {number} [progressData.moves] - Number of individual moves analyzed
     *
     * @example
     * // progressData = { current: 42, moves: 387 }
     * // Updates UI to show "42 positions, 387 moves analyzed"
     */
    handleBookBuilderProgress(progressData) {
        // Log the raw progress data object so we can debug what BookBuilder is sending us
        log.log('📊 [FormController] BookBuilder progress:', progressData);

        // Extract position count from the progress data using the fallback pattern
        // We check progressData.current first (newer property), then positionsProcessed (legacy)
        // The || operator means "use the first truthy value, or 0 if both are missing/falsy"
        // This defensive pattern ensures we always have a valid number to display
        const positions = progressData.current || progressData.positionsProcessed || 0;

        // Extract moves count with a default of 0 if not provided
        // "moves" represents individual move candidates analyzed - it increments faster than
        // positions because each position may have many candidate moves being evaluated
        const moves = progressData.moves || 0;

        // Update the UI if the global function exists (defensive programming)
        // The typeof check prevents errors if updateGenerationStatus isn't defined yet
        // This can happen if app.html hasn't fully loaded, or in test environments
        if (typeof updateGenerationStatus === 'function') {
            // Call the global UI function with both metrics
            // WHY TWO METRICS: positions increment slowly (every few seconds), but moves
            // increment rapidly - this creates constant visual activity so users know
            // the app is actively working and hasn't frozen
            updateGenerationStatus(positions, moves);
        }
    }

    async initializeComponents(config) {
        // Initialize Lichess client
        this.lichessClient = new LichessClient({
            maxRetries: 3,
            retryDelay: 1000,
            timeout: 10000
        });

        // Initialize Stockfish engine if enabled
        // Note: config here is bookBuilderConfig which uses CAREABOUTENGINE (not engine-enabled)
        if (config.CAREABOUTENGINE) {
            // Determine engine variant from config
            // WHAT THIS DOES: Reads the user's engine variant preference from the config.
            // The variant controls which Stockfish WASM build to load:
            //   - 'lite' (default): 7MB download, ~3600 ELO - fast loading, great for most users
            //   - 'full': 75MB download, ~3700 ELO - stronger but takes longer to load
            // The || 'lite' provides a fallback: if ENGINEVARIANT is undefined/null, use 'lite'
            const engineVariant = config.ENGINEVARIANT || 'lite';
            log.log(`🔧 [FormController] Initializing Stockfish engine (variant: ${engineVariant})...`);

            // Create the engine instance via EngineFactory
            // EngineFactory returns MockStockfishEngine for fast E2E tests (on localhost with testMode)
            // or real StockfishEngine for production use
            this.stockfishEngine = EngineFactory.create({
                depth: config.ENGINEDEPTH || 20,   // How many moves ahead to analyze
                hash: config.ENGINEHASH || 128,    // Memory for position cache (MB)
                variant: engineVariant              // Which Stockfish build: 'lite' or 'full'
            });

            this.progressTracker.updatePhase(`Initializing Stockfish engine (${engineVariant})...`, 8);
            await this.stockfishEngine.initialize();
            log.log('✅ [FormController] Stockfish engine ready');
        } else {
            log.log('ℹ️ [FormController] Engine disabled, skipping initialization');
        }
    }

    async validateConnections(config) {
        // Test Lichess API connection using actual user configuration
        try {
            const startingPosition = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

            // Use the same API options format as BookBuilder
            const validationOptions = {
                speeds: Array.isArray(config.speeds) ? config.speeds.join(',') : (config.speeds || 'blitz,rapid,classical,correspondence'),
                ratings: Array.isArray(config.ratings) ? config.ratings.join(',') : (config.ratings || '1600,1800,2000,2200,2500'),
                variant: 'standard',
                moves: 3
            };

            log.log('🔍 [FormController] Validating Lichess API with user settings:', validationOptions);
            await this.lichessClient.getPositionStats(startingPosition, validationOptions);
        } catch (error) {
            throw new Error(`Lichess API connection failed: ${error.message}`);
        }

        // Test engine if enabled
        if (this.stockfishEngine) {
            try {
                const startingPosition = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
                await this.stockfishEngine.getBestMove(startingPosition, 10);
            } catch (error) {
                throw new Error(`Stockfish engine test failed: ${error.message}`);
            }
        }
    }

    async processOpenings(config) {
        const results = {};
        const openings = config.openings;

        for (let i = 0; i < openings.length; i++) {
            const opening = openings[i];
            const progress = 20 + (i / openings.length) * 70; // 20% to 90%

            this.progressTracker.updatePhase(
                `Processing ${opening.name}... (${i + 1}/${openings.length})`,
                progress
            );

            log.log(`\n🚀 [FormController] === STARTING ${opening.name} with NEW ARCHITECTURE ===`);
            log.log(`📋 [FormController] Config outputFormat: "${config.pgnConfig?.outputFormat || config.outputFormat || 'MISSING'}"`);
            log.log(`🔍 [FormController] Full config.pgnConfig:`, config.pgnConfig);

            try {
                log.log(`🔄 [FormController] About to call bookBuilder.generateChapter()`);

                // BookBuilder now returns line data instead of formatted PGN
                const chapterData = await this.bookBuilder.generateChapter(opening, i + 1);

                log.log(`📊 [FormController] BookBuilder returned:`, {
                    type: typeof chapterData,
                    isString: typeof chapterData === 'string',
                    hasLines: chapterData?.lines ? true : false,
                    linesCount: chapterData.lines?.length || 'N/A',
                    openingName: chapterData.openingName || 'MISSING',
                    metadata: chapterData.metadata || 'MISSING'
                });

                // Check if BookBuilder returned old format (string) or new format (object)
                if (typeof chapterData === 'string') {
                    log.log(`❌ [FormController] ERROR: BookBuilder returned STRING (old format)!`);
                    log.log(`   This means the new architecture isn't working.`);
                    results[`Chapter_${i + 1}_${opening.name.replace(/\s+/g, '_')}.pgn`] = chapterData;
                    continue;
                }

                log.log(`✅ [FormController] BookBuilder returned OBJECT (new format)`);
                log.log(`🎯 [FormController] About to call FileGenerator.generateBothFormats()`);

                // Use FileGenerator to generate BOTH formats (individual + tree)
                // This allows post-generation toggling between formats
                const fileGenerator = new FileGenerator();
                const bothFormats = await fileGenerator.generateBothFormats(
                    chapterData.lines,
                    chapterData.openingName,
                    config.pgnConfig || config, // Pass the PGN config specifically
                    this.bookBuilder.pgnGenerator // Pass PgnGenerator instance
                );

                log.log(`✅ [FormController] FileGenerator returned both formats`);
                log.log(`   Individual: ${bothFormats.individualPGN.length} chars`);
                log.log(`   Tree: ${bothFormats.treePGN.length} chars`);

                const safeName = opening.name.replace(/\s+/g, '_');
                const fileName = `Chapter_${i + 1}_${safeName}.pgn`;
                // Store the format object (with both formats) instead of a single string
                results[fileName] = bothFormats;

                // Update progress with intermediate results
                const linesGenerated = chapterData.lines?.length || 0;
                this.progressTracker.updateProgress(
                    `Completed ${opening.name}: ${linesGenerated} lines generated`
                );

            } catch (error) {
                log.error(`Failed to process ${opening.name}:`, error);
                this.errorHandler.logDetailedError(error, `Processing ${opening.name}`);

                // Create error report
                const errorReport = `# Error Report for ${opening.name}

` +
                    `**Error**: ${error.message}

` +
                    `**Timestamp**: ${new Date().toISOString()}

` +
                    `**Configuration**: ${JSON.stringify(opening, null, 2)}

` +
                    `**Stack Trace**: ${error.stack || 'Not available'}`;

                const sanitizedName = opening.name.replace(/[^a-zA-Z0-9]/g, '_');
                results[`Error_${sanitizedName}.md`] = errorReport;
            }
        }

        return results;
    }

    async generateDisplay(results) {
        const fileGenerator = new FileGenerator();

        try {
            log.log(`📋 [FormController] generateDisplay called with ${Object.keys(results).length} results`);

            // Filter out error reports (strings) - only process format objects
            // Error reports are stored as strings with filenames like "Error_*.md"
            const validResults = {};
            for (const [filename, data] of Object.entries(results)) {
                if (typeof data === 'object' && data.individualPGN !== undefined) {
                    validResults[filename] = data;
                } else {
                    log.warn(`⚠️ [FormController] Skipping non-format entry: ${filename}`);
                }
            }

            if (Object.keys(validResults).length === 0) {
                throw new Error('No valid PGN content was generated. Check if the opening position and Lichess API responses are valid.');
            }

            // Prepare format object for display (contains both individual and tree formats)
            let formatData = null;
            let chapterName = 'Chess Repertoire';
            const metadata = {
                processingTime: null,
                totalGames: 0,
                totalLines: 0
            };

            // Handle single or multiple results (using filtered validResults)
            if (Object.keys(validResults).length === 1) {
                // Single chapter - pass format object directly to displayPGN
                const [filename, bothFormats] = Object.entries(validResults)[0];
                formatData = bothFormats;
                chapterName = filename.replace(/\.pgn$/, '');

                // Count lines for metadata using individual format
                metadata.totalLines = fileGenerator.countPGNLines(bothFormats.individualPGN);

            } else {
                // Multiple chapters - combine both formats separately
                // This preserves the ability to toggle between formats even with multiple chapters
                const individualChapters = [];
                const treeChapters = [];

                for (const [filename, bothFormats] of Object.entries(validResults)) {
                    const name = filename.replace(/\.pgn$/, '');
                    individualChapters.push({ name, content: bothFormats.individualPGN });
                    treeChapters.push({ name, content: bothFormats.treePGN });
                }

                // Create combined format object with both combined formats
                formatData = {
                    individualPGN: fileGenerator.generateCombinedPGN(individualChapters),
                    treePGN: fileGenerator.generateCombinedPGN(treeChapters),
                    chapterName: 'Complete Chess Repertoire'
                };
                chapterName = 'Complete Chess Repertoire';

                // Aggregate metadata
                metadata.totalLines = individualChapters.reduce((sum, chapter) =>
                    sum + fileGenerator.countPGNLines(chapter.content), 0);
            }

            // Calculate processing time
            if (this.progressTracker.startTime) {
                const elapsed = Date.now() - this.progressTracker.startTime;
                const minutes = Math.floor(elapsed / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                metadata.processingTime = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
            }

            log.log(`📊 [FormController] Displaying format object:`, {
                chapterName,
                individualLength: formatData.individualPGN.length,
                treeLength: formatData.treePGN.length,
                metadata
            });

            // Display the PGN content with format toggle capability
            // Pass format object so user can toggle between individual and tree views
            const displayResult = fileGenerator.displayPGN(formatData, chapterName, metadata);

            log.log(`✅ [FormController] PGN displayed successfully`);

            return displayResult;

        } catch (error) {
            log.error(`❌ [FormController] Display generation failed:`, error);
            throw new Error(`Display generation failed: ${error.message}`);
        }
    }

    // Keep the original generateDownloads method as legacy/fallback option
    async generateDownloads(results) {
        const fileGenerator = new FileGenerator();
        const downloadResults = [];

        try {
            // Prepare files for download
            const files = [];

            // Create individual PGN files
            for (const [filename, content] of Object.entries(results)) {
                files.push({
                    filename: filename,
                    content: content,
                    mimeType: 'application/x-chess-pgn'
                });
            }

            // Create combined file if multiple chapters
            if (Object.keys(results).length > 1) {
                const chapters = Object.entries(results).map(([filename, content]) => ({
                    name: filename.replace(/\.pgn$/, ''),
                    content: content
                }));

                const combinedContent = fileGenerator.generateCombinedPGN(chapters);
                files.push({
                    filename: 'Complete_Repertoire.pgn',
                    content: combinedContent,
                    mimeType: 'application/x-chess-pgn'
                });
            }

            // Generate summary file
            const summaryContent = fileGenerator.generateSummaryFile(results);
            files.push({
                filename: 'Generation_Summary.json',
                content: summaryContent,
                mimeType: 'application/json'
            });

            // Download all files
            for (const file of files) {
                const result = fileGenerator.downloadFile(file.content, file.filename, file.mimeType);
                downloadResults.push(result);

                // Small delay between downloads
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            return {
                fileCount: downloadResults.length,
                totalSize: downloadResults.reduce((sum, r) => sum + (r.size || 0), 0),
                success: downloadResults.every(r => r.success)
            };

        } catch (error) {
            throw new Error(`Download generation failed: ${error.message}`);
        }
    }

    async convertToBookBuilderConfig(formConfig) {
        // Process PGN input
        let openings = [];
        try {
            const pgnInput = formConfig['pgn-input-text'] || '';
            if (pgnInput.trim()) {
                const processedOpening = await PgnProcessor.processPgn(pgnInput);

                // Validate processed opening - PgnProcessor should always return valid data
                if (!processedOpening || typeof processedOpening !== 'object') {
                    throw new Error('PGN processing returned invalid result (not an object)');
                }
                if (!processedOpening.name || typeof processedOpening.name !== 'string') {
                    throw new Error(`PGN processing failed to generate opening name. Result: ${JSON.stringify(processedOpening)}`);
                }
                if (!Array.isArray(processedOpening.moves)) {
                    throw new Error(`PGN processing failed to extract moves. Result: ${JSON.stringify(processedOpening)}`);
                }

                log.log('✅ [DEBUG] PGN processing validation passed:', {
                    name: processedOpening.name,
                    moveCount: processedOpening.moveCount || processedOpening.moves.length,
                    moves: processedOpening.moves.slice(0, 4) // First 4 moves for debugging
                });

                openings = [processedOpening]; // Single opening from PGN
            } else {
                throw new Error('PGN input is required');
            }
        } catch (error) {
            throw new Error(`PGN processing failed: ${error.message}`);
        }

        // Build comprehensive configuration object
        const config = {
            // Opening configuration
            openings: openings.map(opening => {
                // Calculate perspective based on move count (matches Python logic)
                const moveCount = opening.moveCount || opening.moves.length;
                const perspective = moveCount % 2 === 0 ? 'black' : 'white';

                log.log(`    🎯 [FormController] Calculated perspective: ${moveCount} moves % 2 = ${moveCount % 2} → ${perspective}`);

                return {
                    name: opening.name,
                    moves: opening.moves || [], // Original move sequence for iterative approach
                    perspective: perspective, // Calculated perspective based on move count
                    moveCount: moveCount, // Original move count for accurate display
                    priority: opening.priority || 1
                };
            }),

            // PGN Output Configuration
            pgnConfig: {
                outputFormat: formConfig['output-format'] || 'individual',
                annotationStyle: formConfig['annotation-style'] || 'endBlock'
            },

            // Lichess API settings
            speeds: this.getSelectedSpeeds(formConfig),
            variants: ['standard'], // Always use standard chess
            ratings: this.getSelectedRatings(formConfig),

            // Move selection parameters (mapped to new form fields)
            MOVES: parseInt(formConfig['most-played-moves']) || 10,
            DEPTHLIKELIHOOD: this.convertGamesProbability(formConfig['games-likelihood']) || 0.02,
            CONTINUATIONGAMES: parseInt(formConfig['opponent-min-games']) || 10, // Opponent move minimum games filter
            MINPLAYRATE: this.convertPercentage(formConfig['min-playrate-percent']) || 0.01,
            MINGAMES: parseInt(formConfig['candidate-min-games']) || 19, // Our candidate move minimum games filter
            ALPHA: this.convertConfidence(formConfig['confidence-percent']) || 0.05,
            DRAWSAREHALF: formConfig['draws-half-point'] ? 1 : 0,

            // Engine settings (mapped to new form fields)
            // Note: checkbox is named 'engine-enabled' in HTML, converts to 1/0 for legacy compat
            CAREABOUTENGINE: formConfig['engine-enabled'] ? 1 : 0,

            // Engine variant: Convert checkbox state to variant string
            // HOW THIS WORKS: formConfig['engine-full'] is a boolean from the HTML checkbox
            // The ternary operator (condition ? valueIfTrue : valueIfFalse) converts it:
            //   - If checkbox is checked (true): use 'full' (75MB, ~3700 ELO)
            //   - If checkbox is unchecked (false): use 'lite' (7MB, ~3600 ELO)
            // This string gets passed to StockfishEngine which uses it to select the WASM file
            ENGINEVARIANT: formConfig['engine-full'] ? 'full' : 'lite',
            ENGINEDEPTH: parseInt(formConfig['engine-depth']) || 20,
            ENGINEFINISH: parseInt(formConfig['engine-finishing']) || 1,
            SOUNDNESSLIMIT: parseInt(formConfig['soundness-limit-centipawns']) || -99,
            MOVELOSSLIMIT: parseInt(formConfig['move-loss-limit-centipawns']) || -99,
            IGNORELOSSLIMIT: parseInt(formConfig['ignore-loss-limit']) || 300,
            ENGINEHASH: parseInt(formConfig['engine-hash']) || 320,

            // Lazy engine evaluation: analyze moves one at a time starting with highest probability
            // 1 = lazy (default, more efficient), 0 = batch all candidates upfront (legacy)
            LAZY_ENGINE: 1,

            // Pass the initialized StockfishEngine instance to BookBuilder
            // (FormController already initialized it, so don't create a second one)
            stockfishEngine: this.stockfishEngine,

            // Processing settings
            LONGTOSHORT: false, // Default: priority order
            BATCH_SIZE: 5,
            API_DELAY: 150
        };

        // Log configuration for debugging
        log.log('🔧 [FormController] Configuration Summary:');
        log.log('═'.repeat(50));
        log.log(`🏁 Selected Speeds: ${JSON.stringify(config.speeds)}`);
        log.log(`📊 Selected Ratings: ${JSON.stringify(config.ratings)}`);
        log.log(`🎮 Variant: ${config.variants[0]}`);
        log.log(`📄 PGN Output Format: ${config.pgnConfig.outputFormat}`);
        log.log(`🎯 Annotation Style: ${config.pgnConfig.annotationStyle}`);
        log.log('═'.repeat(50));

        return config;
    }

    getSelectedRatings(formConfig) {
        const ratings = [];
        if (formConfig['rating-1600']) ratings.push('1600');
        if (formConfig['rating-1800']) ratings.push('1800');
        if (formConfig['rating-2000']) ratings.push('2000');
        if (formConfig['rating-2200']) ratings.push('2200');
        if (formConfig['rating-2500']) ratings.push('2500');
        return ratings.length > 0 ? ratings : ['1600', '1800', '2000', '2200', '2500'];
    }

    convertGamesProbability(dropdownValue) {
        // Handle both decimal string values (from HTML) and legacy text values
        // First try parsing as decimal (current HTML format: "0.002")
        const parsedDecimal = parseFloat(dropdownValue);
        if (!isNaN(parsedDecimal) && parsedDecimal > 0 && parsedDecimal <= 1) {
            return parsedDecimal;
        }

        // Fall back to text-based mapping for backward compatibility
        const probabilityMap = {
            '1 in 50': 0.02,
            '1 in 100': 0.01,
            '1 in 200': 0.005,
            '1 in 300': 0.0033,
            '1 in 500': 0.002,
            '1 in 1000': 0.001
        };
        return probabilityMap[dropdownValue] || 0.02;
    }

    convertPercentage(percentValue) {
        // Convert percentage input (1%) to decimal (0.01)
        if (typeof percentValue === 'string' && percentValue.includes('%')) {
            return parseFloat(percentValue.replace('%', '')) / 100;
        }
        return parseFloat(percentValue) / 100;
    }

    convertConfidence(percentValue) {
        // Convert confidence percentage (95%) to alpha value (0.05)
        let percent = percentValue;
        if (typeof percentValue === 'string' && percentValue.includes('%')) {
            percent = parseFloat(percentValue.replace('%', ''));
        } else {
            percent = parseFloat(percentValue);
        }
        return (100 - percent) / 100; // 95% confidence = 0.05 alpha
    }

    getSelectedSpeeds(formConfig) {
        const speeds = [];
        if (formConfig['time-bullet']) speeds.push('bullet');
        if (formConfig['time-blitz']) speeds.push('blitz');
        if (formConfig['time-rapid']) speeds.push('rapid');
        if (formConfig['time-classical']) speeds.push('classical');
        if (formConfig['time-correspondence']) speeds.push('correspondence');
        return speeds.length > 0 ? speeds : ['bullet', 'blitz', 'rapid', 'classical'];
    }

    // getSelectedVariants method removed - always use standard chess


    updateRangeDisplay(rangeElement) {
        const valueElement = document.getElementById(rangeElement.id + '-value');
        if (valueElement) {
            valueElement.textContent = rangeElement.value;
        }
    }

    logCurrentSettings() {
        log.log('🎛️ [SETTINGS] Current UI Configuration:');
        log.log('═'.repeat(60));

        const formData = this.configManager.getFormData();

        // PGN Section
        log.log('📝 PGN INPUT:');
        const pgnInput = formData['pgn-input-text'] || '';
        const pgnPreview = pgnInput.length > 100 ? pgnInput.substring(0, 100) + '...' : pgnInput;
        log.log(`   PGN Content: ${pgnPreview || '(empty)'}`);
        log.log(`   PGN Length: ${pgnInput.length} characters`);
        log.log('');

        // Lichess Database Settings
        log.log('🌐 LICHESS DATABASE SETTINGS:');
        log.log('   Time Controls:');
        log.log(`     • Bullet: ${formData['time-bullet'] ? '✓' : '✗'}`);
        log.log(`     • Blitz: ${formData['time-blitz'] ? '✓' : '✗'}`);
        log.log(`     • Rapid: ${formData['time-rapid'] ? '✓' : '✗'}`);
        log.log(`     • Classical: ${formData['time-classical'] ? '✓' : '✗'}`);
        log.log(`     • Correspondence: ${formData['time-correspondence'] ? '✓' : '✗'}`);
        log.log('   Rating Bands:');
        log.log(`     • 1600: ${formData['rating-1600'] ? '✓' : '✗'}`);
        log.log(`     • 1800: ${formData['rating-1800'] ? '✓' : '✗'}`);
        log.log(`     • 2000: ${formData['rating-2000'] ? '✓' : '✗'}`);
        log.log(`     • 2200: ${formData['rating-2200'] ? '✓' : '✗'}`);
        log.log(`     • 2500: ${formData['rating-2500'] ? '✓' : '✗'}`);
        log.log('');

        // Opponent Move Filters
        log.log('🛡️ OPPONENT MOVE FILTERS:');
        log.log(`   Games Likelihood: ${formData['games-likelihood'] || 'N/A'}`);
        log.log(`   Minimum Games: ${formData['opponent-min-games'] || 'N/A'}`);
        log.log('');

        // Candidate Move Selectors
        log.log('🎯 CANDIDATE MOVE SELECTORS:');
        log.log(`   Most Played Moves: ${formData['most-played-moves'] || 'N/A'}`);
        log.log(`   Minimum Playrate: ${formData['min-playrate-percent'] || 'N/A'}%`);
        log.log(`   Minimum Games: ${formData['candidate-min-games'] || 'N/A'}`);
        log.log(`   Confidence: ${formData['confidence-percent'] || 'N/A'}%`);
        log.log(`   Draws Are Half Point: ${formData['draws-half-point'] ? '✓' : '✗'}`);
        log.log('');

        // Engine Settings
        // Log engine settings for debugging - helps users understand their configuration
        log.log('🤖 ENGINE SETTINGS:');
        log.log(`   Engine Enabled: ${formData['engine-enabled'] ? '✓' : '✗'}`);
        // Show which Stockfish variant will be used: Full (75MB, stronger) or Lite (7MB, faster)
        log.log(`   Full Engine: ${formData['engine-full'] ? '✓ (75MB)' : '✗ (Lite 7MB)'}`);
        log.log(`   Engine Depth: ${formData['engine-depth'] || 'N/A'}`);
        log.log(`   Engine Finishing: ${formData['engine-finishing'] ? '✓' : '✗'}`);
        log.log(`   Soundness Limit: ${formData['soundness-limit'] || 'N/A'} centipawns`);
        log.log(`   Move Loss Limit: ${formData['move-loss-limit'] || 'N/A'} centipawns`);
        log.log(`   Ignore Loss Limit: ${formData['ignore-loss-limit'] || 'N/A'}`);
        log.log(`   Engine Hash: ${formData['engine-hash'] || 'N/A'} MB`);
        log.log('');

        // Summary
        log.log('📊 CONFIGURATION SUMMARY:');
        const enabledTimeControls = ['time-bullet', 'time-blitz', 'time-rapid', 'time-classical', 'time-correspondence']
            .filter(id => formData[id]).map(id => id.replace('time-', '')).join(', ');
        const enabledRatings = ['rating-1600', 'rating-1800', 'rating-2000', 'rating-2200', 'rating-2500']
            .filter(id => formData[id]).map(id => id.replace('rating-', '')).join(', ');

        log.log(`   Active Time Controls: ${enabledTimeControls || 'None'}`);
        log.log(`   Active Ratings: ${enabledRatings || 'None'}`);
        log.log(`   Engine: ${formData['engine-enabled'] ? 'Enabled' : 'Disabled'}`);
        log.log(`   PGN Status: ${pgnInput.trim() ? 'Provided' : 'Empty'}`);

        log.log('═'.repeat(60));
    }

    // PGN Input Handling Methods
    async handlePgnInput() {
        const pgnInput = document.getElementById('pgn-input-text');
        const pgnPreview = document.getElementById('pgn-preview');
        const pgnPreviewText = document.getElementById('pgn-preview-text');

        if (!pgnInput || !pgnPreview || !pgnPreviewText) return;

        const pgnValue = pgnInput.value.trim();

        if (pgnValue === '') {
            pgnPreview.style.display = 'none';
            return;
        }

        try {
            // Quick validation and preview generation
            const validation = await PgnProcessor.validatePgn(pgnValue);

            if (validation.isValid) {
                // Generate preview
                const processed = await PgnProcessor.processPgn(pgnValue);
                const movesPreview = processed.moves.slice(0, 8).join(' ');
                const movesSuffix = processed.moves.length > 8 ? '...' : '';

                pgnPreviewText.textContent = `${processed.name}: ${movesPreview}${movesSuffix} (${processed.moves.length} moves)`;
                pgnPreview.style.display = 'block';

                // Clear any error styling
                pgnInput.classList.remove('error');
            } else {
                pgnPreview.style.display = 'none';
            }
        } catch (error) {
            pgnPreview.style.display = 'none';
        }
    }

    async validatePgnInput() {
        const pgnInput = document.getElementById('pgn-input-text');
        const errorElement = document.getElementById('pgn-input-error');

        if (!pgnInput || !errorElement) return;

        const pgnValue = pgnInput.value.trim();

        if (pgnValue === '') {
            errorElement.textContent = '';
            pgnInput.classList.remove('error');
            return;
        }

        try {
            const validation = await PgnProcessor.validatePgn(pgnValue);

            if (validation.isValid) {
                errorElement.textContent = '';
                pgnInput.classList.remove('error');
            } else {
                errorElement.textContent = validation.error;
                pgnInput.classList.add('error');
            }
        } catch (error) {
            errorElement.textContent = `Validation error: ${error.message}`;
            pgnInput.classList.add('error');
        }
    }

    // =========================================================================
    // Job Queue Methods (Phase 4)
    // =========================================================================
    // These methods provide job persistence and recovery capabilities
    // Only active when ?useJobQueue=true is in the URL

    /**
     * Handle form submission using job queue for persistence.
     *
     * WHAT IT DOES:
     * 1. Creates a job record in IndexedDB
     * 2. Transitions job through states (pending → running → completed/failed)
     * 3. Updates progress in the job record for recovery
     * 4. On error, marks job as failed with error details
     *
     * WHY USE THIS:
     * If the page is refreshed during analysis, the job can be recovered
     * because its state is persisted in IndexedDB.
     *
     * @param {Object} config - BookBuilder configuration object
     * @private
     */
    async _handleSubmitWithJobs(config) {
        try {
            // 1. Create job record with configuration
            const job = await this.jobManager.createJob(config);
            this.currentJobId = job.id;
            log.log(`📋 [FormController] Created job ${job.id}`);

            // 2. Update UI to show pending
            this.progressTracker.start();
            this.progressTracker.updatePhase('Initializing analysis...', 5);

            // 3. Transition to running
            await this.jobManager.transition(job.id, 'running');
            log.log(`▶️ [FormController] Job ${job.id} now running`);

            // 4. Initialize components with progress updates
            this.progressTracker.updatePhase('Initializing components...', 10);
            await this.initializeComponents(config);

            // Update config with initialized engine
            if (this.stockfishEngine) {
                config.stockfishEngine = this.stockfishEngine;
            }

            // 5. Validate connections
            this.progressTracker.updatePhase('Validating configuration...', 15);
            await this.validateConnections(config);

            // 6. Create BookBuilder with progress tracking
            this.progressTracker.updatePhase('Creating BookBuilder instance...', 20);

            const progressCallback = async (progressData) => {
                this.handleBookBuilderProgress(progressData);

                // Persist progress to job record for recovery
                if (this.jobManager && this.currentJobId) {
                    await this.jobManager.updateProgress(this.currentJobId, {
                        phase: 'analyzing',
                        current: progressData.current || progressData.positionsProcessed || 0,
                        moves: progressData.moves || 0,
                        message: `Analyzing positions...`
                    });
                }
            };

            this.bookBuilder = new BookBuilder(config, progressCallback);

            // 7. Process openings
            this.progressTracker.updatePhase('Processing openings...', 25);
            const results = await this.processOpenings(config);

            // 8. Generate display
            this.progressTracker.updateDisplayPhase('Preparing PGN display...', 90);
            const displayResult = await this.generateDisplay(results);

            // Hide generation status before showing results
            if (typeof hideGenerationStatus === 'function') {
                hideGenerationStatus();
            }

            // 9. Mark job as completed
            await this.jobManager.transition(job.id, 'completed', {
                result: { displayResult }
            });
            this.currentJobId = null;
            log.log(`✅ [FormController] Job ${job.id} completed successfully`);

            this.progressTracker.complete('Repertoire generated successfully!', displayResult);

        } catch (error) {
            log.error(`❌ [FormController] Job failed:`, error);

            // Mark job as failed if we have a job ID
            if (this.currentJobId && this.jobManager) {
                try {
                    await this.jobManager.transition(this.currentJobId, 'failed', {
                        error: { message: error.message, stack: error.stack }
                    });
                } catch (transitionError) {
                    log.error('Failed to mark job as failed:', transitionError);
                }
            }
            this.currentJobId = null;

            this.errorHandler.showError('Generation failed', error);
            this.progressTracker.reset();

            // Restore form view
            if (typeof hideGenerationStatus === 'function') {
                hideGenerationStatus();
            }
            if (typeof hideProgressContainer === 'function') {
                hideProgressContainer();
            }
        }
    }

    /**
     * Setup job rehydration on page load.
     *
     * WHAT IT DOES:
     * Checks if there was a running job when the page was last closed.
     * If found, shows a recovery dialog asking user if they want to resume.
     *
     * @private
     */
    async _setupJobRehydration() {
        try {
            const runningJob = await this.jobManager.getInProgress();

            if (runningJob) {
                log.log(`🔄 [FormController] Found interrupted job: ${runningJob.id}`);
                this._showRecoveryDialog(runningJob);
            }
        } catch (error) {
            log.error('Failed to check for interrupted jobs:', error);
        }
    }

    /**
     * Show recovery dialog for interrupted job.
     *
     * WHAT IT DOES:
     * Displays a dialog asking user if they want to resume the interrupted
     * analysis or discard it and start fresh.
     *
     * @param {Object} job - The interrupted job record
     * @private
     */
    _showRecoveryDialog(job) {
        // Create recovery dialog
        // SECURITY: Using DOM manipulation instead of innerHTML to prevent XSS
        // Job data could contain malicious content, so we use textContent for user data
        const dialog = document.createElement('div');
        dialog.id = 'recovery-dialog';
        dialog.setAttribute('data-testid', 'recovery-dialog');
        dialog.className = 'recovery-dialog-overlay';

        // Build dialog content safely using DOM APIs
        const content = document.createElement('div');
        content.className = 'recovery-dialog-content';

        const heading = document.createElement('h3');
        heading.textContent = 'Analysis Interrupted';
        content.appendChild(heading);

        const description = document.createElement('p');
        description.textContent = 'A previous analysis was interrupted. Would you like to discard it and start fresh?';
        content.appendChild(description);

        const infoDiv = document.createElement('div');
        infoDiv.className = 'recovery-dialog-info';

        const jobIdP = document.createElement('p');
        const jobIdLabel = document.createElement('strong');
        jobIdLabel.textContent = 'Job ID: ';
        jobIdP.appendChild(jobIdLabel);
        // SECURITY: Use textContent to safely display job.id (prevents XSS)
        jobIdP.appendChild(document.createTextNode(job.id || 'Unknown'));
        infoDiv.appendChild(jobIdP);

        const progressP = document.createElement('p');
        const progressLabel = document.createElement('strong');
        progressLabel.textContent = 'Progress: ';
        progressP.appendChild(progressLabel);
        // SECURITY: Use textContent to safely display progress message (prevents XSS)
        progressP.appendChild(document.createTextNode(job.progress?.message || 'Unknown'));
        infoDiv.appendChild(progressP);

        content.appendChild(infoDiv);

        const buttonsDiv = document.createElement('div');
        buttonsDiv.className = 'recovery-dialog-buttons';

        const discardButton = document.createElement('button');
        discardButton.setAttribute('data-testid', 'recovery-discard');
        discardButton.className = 'btn btn-secondary';
        discardButton.textContent = 'Discard & Start Fresh';
        buttonsDiv.appendChild(discardButton);

        content.appendChild(buttonsDiv);
        dialog.appendChild(content);

        // Add styles if not already present
        if (!document.getElementById('recovery-dialog-styles')) {
            const styles = document.createElement('style');
            styles.id = 'recovery-dialog-styles';
            styles.textContent = `
                .recovery-dialog-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.7);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                }
                .recovery-dialog-content {
                    background: #1a1a2e;
                    border: 1px solid #333;
                    border-radius: 8px;
                    padding: 24px;
                    max-width: 400px;
                    color: #fff;
                }
                .recovery-dialog-content h3 {
                    margin: 0 0 16px;
                    color: #ff6b6b;
                }
                .recovery-dialog-info {
                    background: #0a0a15;
                    padding: 12px;
                    border-radius: 4px;
                    margin: 16px 0;
                    font-size: 14px;
                }
                .recovery-dialog-info p {
                    margin: 4px 0;
                }
                .recovery-dialog-buttons {
                    display: flex;
                    gap: 12px;
                    justify-content: flex-end;
                }
                .recovery-dialog-buttons button {
                    padding: 8px 16px;
                    border-radius: 4px;
                    border: none;
                    cursor: pointer;
                    font-size: 14px;
                }
                .recovery-dialog-buttons .btn-primary {
                    background: #4CAF50;
                    color: white;
                }
                .recovery-dialog-buttons .btn-secondary {
                    background: #666;
                    color: white;
                }
            `;
            document.head.appendChild(styles);
        }

        // Handle discard button click
        discardButton.addEventListener('click', async () => {
            try {
                await this.jobManager.transition(job.id, 'cancelled');
                log.log(`🗑️ [FormController] Discarded interrupted job ${job.id}`);
            } catch (error) {
                log.error('Failed to cancel interrupted job:', error);
            }
            dialog.remove();
        });

        document.body.appendChild(dialog);
    }

    /**
     * Cancel the currently running job.
     *
     * WHAT IT DOES:
     * 1. Transitions the job to 'cancelled' state
     * 2. Terminates the Stockfish engine
     * 3. Resets the UI
     *
     * @returns {Promise<void>}
     */
    async cancelCurrentJob() {
        if (!this.currentJobId || !this.jobManager) {
            log.log('ℹ️ [FormController] No job to cancel');
            return;
        }

        try {
            log.log(`🛑 [FormController] Cancelling job ${this.currentJobId}`);

            // 1. Update job state
            await this.jobManager.transition(this.currentJobId, 'cancelled');

            // 2. Terminate engine if running
            if (this.stockfishEngine) {
                this.stockfishEngine.shutdown();
                this.stockfishEngine = null;
            }

            // 3. Reset UI
            this.progressTracker.reset();
            if (typeof hideGenerationStatus === 'function') {
                hideGenerationStatus();
            }
            if (typeof hideProgressContainer === 'function') {
                hideProgressContainer();
            }

            this.currentJobId = null;
            log.log('✅ [FormController] Job cancelled successfully');

        } catch (error) {
            log.error('Failed to cancel job:', error);
            this.errorHandler.showError('Failed to cancel', error);
        }
    }
}

export default FormController;
