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
 * HELPER CLASSES IN THIS FILE:
 * - ConfigManager: Saves/loads form settings to browser storage
 * - ProgressTracker: Updates the progress bar UI
 * - ErrorHandler: Displays errors to the user
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
import StockfishEngine from '../engine/StockfishEngine.js';
import FileGenerator from './FileGenerator.js';
import PgnProcessor from '../utils/PgnProcessor.js';

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
            element.addEventListener('input', () => this.updateRangeDisplay(range));
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

            await this.startGeneration(bookBuilderConfig);

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
     * Handle progress updates from BookBuilder
     * @param {Object} progressData - Progress data from BookBuilder
     */
    handleBookBuilderProgress(progressData) {
        log.log('📊 [FormController] BookBuilder progress:', progressData);

        // Update the simple generation status
        const count = progressData.current || progressData.positionsProcessed || 0;
        if (typeof updateGenerationStatus === 'function') {
            updateGenerationStatus(count);
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
            log.log('🔧 [FormController] Initializing Stockfish engine...');
            this.stockfishEngine = new StockfishEngine({
                depth: config.ENGINEDEPTH || 20,
                threads: config.ENGINETHREADS || 1,
                hash: config.ENGINEHASH || 128
            });

            this.progressTracker.updatePhase('Initializing Stockfish engine...', 8);
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
                this.errorHandler.logError(error, `Processing ${opening.name}`);

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

            // Prepare format object for display (contains both individual and tree formats)
            let formatData = null;
            let chapterName = 'Chess Repertoire';
            const metadata = {
                processingTime: null,
                totalGames: 0,
                totalLines: 0
            };

            // Handle single or multiple results
            if (Object.keys(results).length === 1) {
                // Single chapter - pass format object directly to displayPGN
                const [filename, bothFormats] = Object.entries(results)[0];
                formatData = bothFormats;
                chapterName = filename.replace(/\.pgn$/, '');

                // Count lines for metadata using individual format
                metadata.totalLines = fileGenerator.countPGNLines(bothFormats.individualPGN);

            } else {
                // Multiple chapters - combine both formats separately
                // This preserves the ability to toggle between formats even with multiple chapters
                const individualChapters = [];
                const treeChapters = [];

                for (const [filename, bothFormats] of Object.entries(results)) {
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
            ENGINEDEPTH: parseInt(formConfig['engine-depth']) || 20,
            ENGINEFINISH: parseInt(formConfig['engine-finishing']) || 1,
            SOUNDNESSLIMIT: parseInt(formConfig['soundness-limit-centipawns']) || -99,
            MOVELOSSLIMIT: parseInt(formConfig['move-loss-limit-centipawns']) || -99,
            IGNORELOSSLIMIT: parseInt(formConfig['ignore-loss-limit']) || 300,
            ENGINETHREADS: parseInt(formConfig['engine-threads']) || 1,
            ENGINEHASH: parseInt(formConfig['engine-hash']) || 320,

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
        log.log('🤖 ENGINE SETTINGS:');
        log.log(`   Engine Enabled: ${formData['engine-enabled'] ? '✓' : '✗'}`);
        log.log(`   Engine Depth: ${formData['engine-depth'] || 'N/A'}`);
        log.log(`   Engine Finishing: ${formData['engine-finishing'] ? '✓' : '✗'}`);
        log.log(`   Soundness Limit: ${formData['soundness-limit'] || 'N/A'} centipawns`);
        log.log(`   Move Loss Limit: ${formData['move-loss-limit'] || 'N/A'} centipawns`);
        log.log(`   Ignore Loss Limit: ${formData['ignore-loss-limit'] || 'N/A'}`);
        log.log(`   Engine Threads: ${formData['engine-threads'] || 'N/A'}`);
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
}

/**
 * =============================================================================
 * ConfigManager Class - Browser storage for form settings
 * =============================================================================
 *
 * PURPOSE:
 * Saves and loads form settings using the browser's sessionStorage API.
 * This means if you fill out the form and refresh the page, your settings
 * are restored automatically.
 *
 * WHAT IS SESSION STORAGE?
 * sessionStorage is a browser API that stores key-value pairs:
 * - Data persists until the browser tab is closed
 * - Each tab has its own storage (not shared between tabs)
 * - Storage limit is typically 5-10 MB
 * - Data is stored as strings (we use JSON.stringify/parse)
 *
 * ALTERNATIVE: localStorage
 * localStorage is similar but persists forever (until cleared).
 * We use sessionStorage because chess settings shouldn't persist forever.
 */
class ConfigManager {
    /**
     * Constructor - Initialize config manager and load any saved settings
     */
    constructor() {
        // Current configuration object (starts empty)
        this.config = {};

        // Try to load previously saved settings from browser storage
        this.loadFromSession();
    }

    /**
     * Save configuration to browser storage
     *
     * @param {Object} config - Form values to save
     *
     * The spread operator {...} merges objects:
     * { ...existing, ...new } = existing values + new values (new overwrites)
     */
    saveConfig(config) {
        // Merge new config with existing (keeps values not in new config)
        this.config = { ...this.config, ...config };

        // sessionStorage only stores strings, so we convert object to JSON
        // JSON.stringify() converts { foo: 1, bar: 2 } to '{"foo":1,"bar":2}'
        sessionStorage.setItem('bookbuilder-config', JSON.stringify(this.config));
    }

    /**
     * Load configuration from browser storage
     * Called automatically when ConfigManager is created
     */
    loadFromSession() {
        // sessionStorage.getItem() returns null if key doesn't exist
        const saved = sessionStorage.getItem('bookbuilder-config');

        if (saved) {
            try {
                // JSON.parse() converts JSON string back to object
                // Throws error if string isn't valid JSON
                this.config = JSON.parse(saved);

                // Fill in the form with saved values
                this.populateForm();
            } catch (e) {
                // If parsing fails, just log it and continue with empty config
                log.warn('Failed to load saved configuration:', e);
            }
        }
    }

    /**
     * Populate form fields with saved configuration values
     *
     * This iterates through all saved config keys and sets the corresponding
     * form element values. Handles different input types appropriately:
     * - Checkboxes use .checked property (boolean)
     * - Other inputs use .value property (string)
     */
    populateForm() {
        // Object.keys() returns array of object's property names
        // forEach() calls the function for each key
        Object.keys(this.config).forEach(key => {
            // Try to find form element with id matching the config key
            const element = document.getElementById(key);

            if (element) {
                // Different input types store values differently
                if (element.type === 'checkbox') {
                    // Checkboxes use .checked (true/false)
                    element.checked = this.config[key];
                } else {
                    // Text inputs, selects, etc. use .value (string)
                    element.value = this.config[key];
                }

                // Special handling for range sliders: update the display too
                if (element.type === 'range') {
                    // Convention: slider display element has id = slider-id + '-value'
                    const valueElement = document.getElementById(element.id + '-value');
                    if (valueElement) {
                        valueElement.textContent = element.value;
                    }
                }
            }
        });

        // Handle radio button groups specifically
        if (this.config['output-format']) {
            const outputFormatRadio = document.querySelector(`input[name="output-format"][value="${this.config['output-format']}"]`);
            if (outputFormatRadio) {
                outputFormatRadio.checked = true;
            }
        }

        if (this.config['annotation-style']) {
            const annotationStyleRadio = document.querySelector(`input[name="annotation-style"][value="${this.config['annotation-style']}"]`);
            if (annotationStyleRadio) {
                annotationStyleRadio.checked = true;
            }
        }
    }

    async validateConfig() {
        const errors = [];

        // Validate PGN input (with security limits)
        const pgnInput = document.getElementById('pgn-input-text').value;
        if (pgnInput.trim()) {
            try {
                // Security: Size limit check (100KB for PGN)
                if (pgnInput.length > 100000) {
                    errors.push('PGN input too large (max 100KB)');
                    return errors; // Don't process further if too large
                }

                // Validate PGN format and content
                const validation = await PgnProcessor.validatePgn(pgnInput);
                if (!validation.isValid) {
                    errors.push(`Invalid PGN: ${validation.error}`);
                } else {
                    // Process PGN to check for valid moves
                    try {
                        const processed = await PgnProcessor.processPgn(pgnInput);

                        // Security: Basic structure validation
                        if (processed.name && processed.name.length > 200) {
                            errors.push('Opening name too long (max 200 chars)');
                        }
                        if (processed.moves && processed.moves.length > 100) {
                            errors.push('Too many moves in PGN (max 100)');
                        }
                        if (processed.moves && processed.moves.length === 0) {
                            errors.push('PGN must contain at least one move');
                        }
                    } catch (processError) {
                        errors.push(`PGN processing failed: ${processError.message}`);
                    }
                }
            } catch (e) {
                errors.push(`PGN validation error: ${e.message}`);
            }
        } else {
            errors.push('PGN input is required');
        }


        // Validate at least one time control is selected
        const timeControls = ['time-bullet', 'time-blitz', 'time-rapid', 'time-classical', 'time-correspondence'];
        const selectedTimeControls = timeControls.filter(id => document.getElementById(id).checked);
        if (selectedTimeControls.length === 0) {
            errors.push('At least one time control must be selected');
        }

        // Chess variant validation removed - always using standard chess

        return errors;
    }

    getFormData() {
        const config = {};

        // Get all form elements
        document.querySelectorAll('#bookbuilder-form input, #bookbuilder-form select, #bookbuilder-form textarea').forEach(element => {
            if (element.type === 'checkbox') {
                config[element.id] = element.checked;
            } else if (element.type === 'range' || element.type === 'number') {
                config[element.id] = parseFloat(element.value);
            } else {
                config[element.id] = element.value;
            }
        });

        // Handle radio button groups specifically
        const outputFormatRadio = document.querySelector('input[name="output-format"]:checked');
        if (outputFormatRadio) {
            config['output-format'] = outputFormatRadio.value;
        }

        const annotationStyleRadio = document.querySelector('input[name="annotation-style"]:checked');
        if (annotationStyleRadio) {
            config['annotation-style'] = annotationStyleRadio.value;
        }

        return config;
    }
}

/**
 * =============================================================================
 * ProgressTracker Class - Visual progress feedback during generation
 * =============================================================================
 *
 * PURPOSE:
 * Shows a progress bar and status messages while repertoire generation runs.
 * This is important UX: without feedback, users might think the app froze!
 *
 * HOW PROGRESS BARS WORK:
 * A progress bar is typically a container div with a colored "fill" div inside.
 * We animate by changing the fill's width: width: "50%" = half done.
 *
 * CSS for this is usually:
 * .progress-container { width: 100%; background: gray; }
 * .progress-fill { width: 0%; background: blue; transition: width 0.3s; }
 *
 * WHY TRACK PROGRESS?
 * Repertoire generation can take minutes (many API calls). Users need to know:
 * 1. The app is working (not frozen)
 * 2. Approximately how far along it is
 * 3. What's currently happening
 */
class ProgressTracker {
    /**
     * Constructor - Find and store references to progress bar DOM elements
     */
    constructor() {
        // The outer container element (shows/hides entire progress UI)
        this.container = document.getElementById('progress-container');

        // The colored bar element that expands to show percentage
        this.fill = document.getElementById('progress-fill');

        // Text elements for status messages
        this.stageText = document.getElementById('progress-stage');      // Current phase name
        this.currentText = document.getElementById('progress-current');  // Detailed status

        // Whether we're currently showing progress
        this.isActive = false;
    }

    /**
     * Start showing progress bar
     * Called when generation begins
     */
    start() {
        this.isActive = true;

        // Show the progress container
        // typeof check: see if a function exists before calling it
        // This is defensive programming - the function might not be defined
        if (typeof showProgressContainer === 'function') {
            showProgressContainer();
        } else {
            // Fallback: add CSS class to show container
            this.container.classList.add('active');
        }

        // Initialize with "Starting..." message
        this.updatePhase('Starting...', 0);

        // Hide error and success containers (only show one at a time)
        const errorContainer = document.getElementById('error-container');
        const successContainer = document.getElementById('success-container');
        if (errorContainer) errorContainer.style.display = 'none';
        if (successContainer) successContainer.style.display = 'none';
    }

    /**
     * Update progress bar phase (main status and percentage)
     *
     * @param {string} text - Status message to display
     * @param {number} percentage - Progress percentage (0-100)
     */
    updatePhase(text, percentage) {
        // Don't update if we're not actively tracking
        if (!this.isActive) return;

        // Update the fill bar width
        if (this.fill) {
            // Math.max/min clamps value to 0-100 range (prevents overflow)
            // Template literal `${...}%` creates string like "50%"
            this.fill.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
        }

        // Update the stage text
        if (this.stageText) {
            this.stageText.textContent = text;
        }
    }

    /**
     * Update progress with additional detail text
     * Shows more specific info below the main status
     *
     * @param {string} additionalInfo - Detailed status message
     */
    updateProgress(additionalInfo) {
        if (!this.isActive) return;

        // Update the secondary/detail text
        if (this.currentText) {
            this.currentText.textContent = additionalInfo;
        }
    }

    /**
     * Update for the display preparation phase
     * Called near the end of generation when formatting results
     *
     * @param {string} message - Status message
     * @param {number} progress - Progress percentage (defaults to 90%)
     */
    updateDisplayPhase(message = 'Preparing PGN display...', progress = 90) {
        if (!this.isActive) return;
        this.updatePhase(message, progress);
    }

    /**
     * Mark progress as complete
     * Shows 100% progress and transitions to success state
     *
     * @param {string} message - Completion message to display
     * @param {Object} completionInfo - Optional info about what completed
     *   @param {string} completionInfo.displayMethod - 'browser' for in-page display
     */
    complete(message, completionInfo = null) {
        // Stop tracking progress
        this.isActive = false;

        // Fill the bar to 100%
        if (this.fill) {
            this.fill.style.width = '100%';
        }

        // Show completion message
        if (this.stageText) {
            this.stageText.textContent = message;
        }
        if (this.currentText) {
            this.currentText.textContent = 'Generation completed successfully!';
        }

        // Two modes: in-browser display vs traditional success message
        // setTimeout() delays execution - gives user time to see 100% before hiding
        if (completionInfo && completionInfo.displayMethod === 'browser') {
            // Browser display mode: just hide progress after delay
            // The PGN will be shown in the main content area
            setTimeout(() => {
                if (typeof hideProgressContainer === 'function') {
                    hideProgressContainer();
                } else {
                    this.container.classList.remove('active');
                }
            }, 1500);  // 1.5 second delay
        } else {
            // Traditional mode: show success container with message
            setTimeout(() => {
                if (typeof hideProgressContainer === 'function') {
                    hideProgressContainer();
                } else {
                    this.container.classList.remove('active');
                }

                // Show the success message container
                const successContainer = document.getElementById('success-container');
                const successMessage = document.getElementById('success-message');
                if (successContainer && successMessage) {
                    successContainer.style.display = 'block';
                    successMessage.textContent = message;
                }
            }, 1000);  // 1 second delay
        }
    }

    /**
     * Reset progress tracker to initial state
     * Called when generation fails or is cancelled
     */
    reset() {
        // Stop tracking
        this.isActive = false;

        // Hide the progress container
        if (typeof hideProgressContainer === 'function') {
            hideProgressContainer();
        } else {
            this.container.classList.remove('active');
        }

        // Reset the fill bar to 0%
        if (this.fill) {
            this.fill.style.width = '0%';
        }

        // Reset text to initial messages
        if (this.stageText) {
            this.stageText.textContent = 'Initializing...';
        }
        if (this.currentText) {
            this.currentText.textContent = 'Ready to begin analysis...';
        }
    }
}

/**
 * =============================================================================
 * ErrorHandler Class - User-friendly error display
 * =============================================================================
 *
 * PURPOSE:
 * Displays error messages to users in a friendly, understandable way.
 * Errors happen - the goal is to communicate them helpfully, not technically.
 *
 * WHY THIS MATTERS:
 * Raw JavaScript errors like "TypeError: Cannot read property 'x' of undefined"
 * are confusing to most users. This class:
 * 1. Shows a visible error container in the UI
 * 2. Provides a human-readable title and message
 * 3. Logs technical details to console for debugging
 *
 * ERROR TYPES HANDLED:
 * - System errors (API failures, engine errors)
 * - Validation errors (invalid form input)
 */
class ErrorHandler {
    /**
     * Constructor - Find error display elements in the DOM
     */
    constructor() {
        // Container div that holds the error message (hidden by default)
        this.container = document.getElementById('error-container');

        // Element where the error text is displayed
        this.message = document.getElementById('error-message');
    }

    /**
     * Show a system error to the user
     *
     * @param {string} title - User-friendly error title (e.g., "Connection Failed")
     * @param {Error} error - JavaScript Error object with details
     */
    showError(title, error) {
        // Always log to console for debugging
        log.error(title, error);

        // Show the error container
        this.container.style.display = 'block';

        // Build HTML for the error message
        // Template literal allows multi-line strings with ${} interpolation
        // innerHTML allows HTML tags (like <strong>, <br>)
        this.message.innerHTML = `
            <strong>${title}</strong><br>
            ${error.message}<br>
            <small>Check console for detailed error information.</small>
        `;

        // Hide other status containers (show only one at a time)
        document.getElementById('progress-container').style.display = 'none';
        document.getElementById('success-container').style.display = 'none';

        // Log detailed technical info to console
        this.logError(error, title);
    }

    /**
     * Show validation errors (form input problems)
     *
     * @param {Array<string>} errors - List of validation error messages
     */
    showValidationErrors(errors) {
        // Convert array of errors to bulleted HTML list
        // .map() transforms each error, .join('<br>') connects with line breaks
        const errorList = errors.map(error => `• ${error}`).join('<br>');

        this.container.style.display = 'block';
        this.message.innerHTML = `
            <strong>Configuration Validation Failed</strong><br>
            ${errorList}
        `;

        // Hide other containers
        document.getElementById('progress-container').style.display = 'none';
        document.getElementById('success-container').style.display = 'none';
    }

    /**
     * Log detailed error information to browser console
     * This is for developers debugging issues
     *
     * @param {Error} error - The error object
     * @param {string} context - Where the error occurred
     *
     * console.group() creates a collapsible section in browser dev tools
     */
    logError(error, context) {
        // console.group() starts a collapsible group in dev tools
        console.group(`🐛 Error in ${context}`);
        log.error('Message:', error.message);
        log.error('Stack:', error.stack);   // Stack trace shows where error originated
        log.error('Context:', context);
        console.groupEnd();  // End the collapsible group
    }
}

/**
 * File Generation and Download
 */
// Removed duplicate FileGenerator class - using imported version

export default FormController;
