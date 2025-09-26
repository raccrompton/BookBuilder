/**
 * FormController.js - Form management and workflow coordination
 *
 * Handles form submission, validation, and orchestrates the complete
 * BookBuilder workflow with visual progress feedback.
 */

import BookBuilder from '../BookBuilder.js';
import LichessClient from '../api/LichessClient.js';
import StockfishEngine from '../engine/StockfishEngine.js';
import FileGenerator from './FileGenerator.js';
import PgnProcessor from '../utils/PgnProcessor.js';

class FormController {
    constructor() {
        // Initialize components
        this.configManager = new ConfigManager();
        this.progressTracker = new ProgressTracker();
        this.errorHandler = new ErrorHandler();

        // Initialize API components
        this.lichessClient = null;
        this.stockfishEngine = null;
        this.bookBuilder = null;

        this.setupEventListeners();
        this.setupRangeDisplays();
    }

    setupEventListeners() {
        // No tab switching needed - using single page layout

        // Form submission
        console.log('🔗 [DEBUG] Setting up form event listener...');
        const form = document.getElementById('bookbuilder-form');
        if (!form) {
            console.error('❌ [DEBUG] Form not found!');
            return;
        }
        
        form.addEventListener('submit', (e) => {
            console.log('📝 [DEBUG] Form submit event triggered');
            e.preventDefault();
            this.handleSubmit();
        });
        
        // Also add click listener to button specifically
        const submitButton = document.querySelector('button[type="submit"]');
        if (submitButton) {
            console.log('🔘 [DEBUG] Submit button found, adding click listener');
            submitButton.addEventListener('click', (e) => {
                console.log('🖱️ [DEBUG] Submit button clicked');
            });
        } else {
            console.error('❌ [DEBUG] Submit button not found!');
        }

        // Auto-save on input
        document.querySelectorAll('#bookbuilder-form input, #bookbuilder-form select, #bookbuilder-form textarea').forEach(element => {
            element.addEventListener('input', () => this.autoSave());
        });

        // Range input updates
        document.querySelectorAll('.form-range').forEach(range => {
            range.addEventListener('input', () => this.updateRangeDisplay(range));
        });

        // PGN input real-time validation and preview
        const pgnInput = document.getElementById('pgn-input-text');
        if (pgnInput) {
            console.log('📝 [DEBUG] PGN input found, adding event listeners');
            pgnInput.addEventListener('input', () => this.handlePgnInput());
            pgnInput.addEventListener('blur', () => this.validatePgnInput());
        }
    }

    setupRangeDisplays() {
        document.querySelectorAll('.form-range').forEach(range => {
            this.updateRangeDisplay(range);
        });
    }

    // switchTab method removed - using single page layout

    autoSave() {
        const config = this.configManager.getFormData();
        this.configManager.saveConfig(config);
    }

    async handleSubmit() {
        console.log('🚀 [DEBUG] Form submission started');

        try {
            // Log all current UI settings for debugging
            this.logCurrentSettings();

            // Validate form
            console.log('🔍 [DEBUG] Starting form validation...');
            const errors = await this.configManager.validateConfig();
            console.log('📊 [DEBUG] Validation errors:', errors);
            
            if (errors.length > 0) {
                console.log('❌ [DEBUG] Validation failed, showing errors');
                this.errorHandler.showValidationErrors(errors);
                return;
            }

            // Get configuration and prepare BookBuilder config
            console.log('⚙️ [DEBUG] Getting form data...');
            const formConfig = this.configManager.getFormData();
            console.log('📋 [DEBUG] Form config:', formConfig);
            
            console.log('🔧 [DEBUG] Converting to BookBuilder config...');
            const bookBuilderConfig = await this.convertToBookBuilderConfig(formConfig);
            console.log('🏗️ [DEBUG] BookBuilder config:', bookBuilderConfig);

            // Start repertoire generation
            console.log('🎯 [DEBUG] Starting generation process...');
            await this.startGeneration(bookBuilderConfig);

        } catch (error) {
            console.error(`❌ [FormController] Error in handleSubmit:`, error);
            console.error(`   Submit error details:`, {
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
        }
    }

    async startGeneration(config) {
        try {
            this.progressTracker.start();

            // Phase 1: Initialize components
            this.progressTracker.updatePhase('Initializing components...', 5);
            await this.initializeComponents(config);

            // Phase 2: Validate configuration and connections
            this.progressTracker.updatePhase('Validating configuration...', 10);
            await this.validateConnections(config);

            // Phase 3: Create BookBuilder instance
            this.progressTracker.updatePhase('Creating BookBuilder instance...', 15);
            this.bookBuilder = new BookBuilder(config);

            // Phase 4: Process openings
            this.progressTracker.updatePhase('Processing openings...', 20);
            const results = await this.processOpenings(config);

            // Phase 5: Prepare display
            this.progressTracker.updateDisplayPhase('Preparing PGN display...', 90);
            const displayResult = await this.generateDisplay(results);

            this.progressTracker.complete('Repertoire generated successfully!', displayResult);

        } catch (error) {
            console.error(`❌ [FormController] Generation failed in startGeneration:`, error);
            console.error(`   Error details:`, {
                message: error.message,
                stack: error.stack?.split('\n').slice(0, 3) || 'no stack',
                timestamp: new Date().toISOString(),
                phase: this.progressTracker?.currentPhase || 'unknown'
            });
            console.error(`   Config at time of error:`, config);
            this.errorHandler.showError('Generation failed', error);
            this.progressTracker.reset();
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
        if (config['engine-enabled']) {
            this.stockfishEngine = new StockfishEngine({
                depth: config['engine-depth'],
                threads: 1,
                hash: 128
            });

            this.progressTracker.updatePhase('Initializing Stockfish engine...', 8);
            await this.stockfishEngine.initialize();
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

            console.log('🔍 [FormController] Validating Lichess API with user settings:', validationOptions);
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

            console.log(`\n🚀 [FormController] === STARTING ${opening.name} with NEW ARCHITECTURE ===`);
            console.log(`📋 [FormController] Config outputFormat: "${config.pgnConfig?.outputFormat || config.outputFormat || 'MISSING'}"`);
            console.log(`🔍 [FormController] Full config.pgnConfig:`, config.pgnConfig);

            try {
                console.log(`🔄 [FormController] About to call bookBuilder.generateChapter()`);

                // BookBuilder now returns line data instead of formatted PGN
                const chapterData = await this.bookBuilder.generateChapter(opening, i + 1);

                console.log(`📊 [FormController] BookBuilder returned:`, {
                    type: typeof chapterData,
                    isString: typeof chapterData === 'string',
                    hasLines: chapterData?.lines ? true : false,
                    linesCount: chapterData.lines?.length || 'N/A',
                    openingName: chapterData.openingName || 'MISSING',
                    metadata: chapterData.metadata || 'MISSING'
                });

                // Check if BookBuilder returned old format (string) or new format (object)
                if (typeof chapterData === 'string') {
                    console.log(`❌ [FormController] ERROR: BookBuilder returned STRING (old format)!`);
                    console.log(`   This means the new architecture isn't working.`);
                    results[`Chapter_${i + 1}_${opening.name.replace(/\s+/g, '_')}.pgn`] = chapterData;
                    continue;
                }

                console.log(`✅ [FormController] BookBuilder returned OBJECT (new format)`);
                console.log(`🎯 [FormController] About to call FileGenerator.generateConfiguredPGN()`);

                // Use FileGenerator to format the line data based on config
                const fileGenerator = new FileGenerator();
                const chapterContent = await fileGenerator.generateConfiguredPGN(
                    chapterData.lines,
                    chapterData.openingName,
                    config.pgnConfig || config, // Pass the PGN config specifically
                    this.bookBuilder.pgnGenerator // Pass PgnGenerator instance
                );

                console.log(`✅ [FormController] FileGenerator returned content (${chapterContent.length} chars)`);

                const safeName = opening.name.replace(/\s+/g, '_');
                const fileName = `Chapter_${i + 1}_${safeName}.pgn`;
                results[fileName] = chapterContent;

                // Update progress with intermediate results
                const linesGenerated = chapterData.lines?.length || 0;
                this.progressTracker.updateProgress(
                    `Completed ${opening.name}: ${linesGenerated} lines generated`
                );

            } catch (error) {
                console.error(`Failed to process ${opening.name}:`, error);
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
            console.log(`📋 [FormController] generateDisplay called with ${Object.keys(results).length} results`);

            // Prepare content for display
            let displayContent = '';
            let chapterName = 'Chess Repertoire';
            const metadata = {
                processingTime: null,
                totalGames: 0,
                totalLines: 0
            };

            // Handle single or multiple results
            if (Object.keys(results).length === 1) {
                // Single chapter - display directly
                const [filename, content] = Object.entries(results)[0];
                displayContent = content;
                chapterName = filename.replace(/\.pgn$/, '');

                // Count lines for metadata
                metadata.totalLines = fileGenerator.countPGNLines(content);

            } else {
                // Multiple chapters - create combined display
                const chapters = Object.entries(results).map(([filename, content]) => ({
                    name: filename.replace(/\.pgn$/, ''),
                    content: content
                }));

                displayContent = fileGenerator.generateCombinedPGN(chapters);
                chapterName = 'Complete Chess Repertoire';

                // Aggregate metadata
                metadata.totalLines = chapters.reduce((sum, chapter) =>
                    sum + fileGenerator.countPGNLines(chapter.content), 0);
            }

            // Calculate processing time
            if (this.progressTracker.startTime) {
                const elapsed = Date.now() - this.progressTracker.startTime;
                const minutes = Math.floor(elapsed / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                metadata.processingTime = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
            }

            console.log(`📊 [FormController] Displaying content:`, {
                chapterName,
                contentLength: displayContent.length,
                metadata
            });

            // Display the PGN content
            const displayResult = fileGenerator.displayPGN(displayContent, chapterName, metadata);

            console.log(`✅ [FormController] PGN displayed successfully`);

            return displayResult;

        } catch (error) {
            console.error(`❌ [FormController] Display generation failed:`, error);
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

                console.log('✅ [DEBUG] PGN processing validation passed:', {
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

                console.log(`    🎯 [FormController] Calculated perspective: ${moveCount} moves % 2 = ${moveCount % 2} → ${perspective}`);

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
            CAREABOUTENGINE: formConfig['engine-on'] || false,
            ENGINEDEPTH: parseInt(formConfig['engine-depth']) || 20,
            ENGINEFINISH: parseInt(formConfig['engine-finishing']) || 1,
            SOUNDNESSLIMIT: parseInt(formConfig['soundness-limit-centipawns']) || -99,
            MOVELOSSLIMIT: parseInt(formConfig['move-loss-limit-centipawns']) || -99,
            IGNORELOSSLIMIT: parseInt(formConfig['ignore-loss-limit']) || 300,
            ENGINETHREADS: parseInt(formConfig['engine-threads']) || 1,
            ENGINEHASH: parseInt(formConfig['engine-hash']) || 320,

            // Processing settings
            LONGTOSHORT: false, // Default: priority order
            BATCH_SIZE: 5,
            API_DELAY: 150
        };

        // Log configuration for debugging
        console.log('🔧 [FormController] Configuration Summary:');
        console.log('═'.repeat(50));
        console.log(`🏁 Selected Speeds: ${JSON.stringify(config.speeds)}`);
        console.log(`📊 Selected Ratings: ${JSON.stringify(config.ratings)}`);
        console.log(`🎮 Variant: ${config.variants[0]}`);
        console.log(`📄 PGN Output Format: ${config.pgnConfig.outputFormat}`);
        console.log(`🎯 Annotation Style: ${config.pgnConfig.annotationStyle}`);
        console.log('═'.repeat(50));

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
        // Convert dropdown values like "1 in 50" to decimal
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
        console.log('🎛️ [SETTINGS] Current UI Configuration:');
        console.log('═'.repeat(60));

        const formData = this.configManager.getFormData();

        // PGN Section
        console.log('📝 PGN INPUT:');
        const pgnInput = formData['pgn-input-text'] || '';
        const pgnPreview = pgnInput.length > 100 ? pgnInput.substring(0, 100) + '...' : pgnInput;
        console.log(`   PGN Content: ${pgnPreview || '(empty)'}`);
        console.log(`   PGN Length: ${pgnInput.length} characters`);
        console.log('');

        // Lichess Database Settings
        console.log('🌐 LICHESS DATABASE SETTINGS:');
        console.log('   Time Controls:');
        console.log(`     • Bullet: ${formData['time-bullet'] ? '✓' : '✗'}`);
        console.log(`     • Blitz: ${formData['time-blitz'] ? '✓' : '✗'}`);
        console.log(`     • Rapid: ${formData['time-rapid'] ? '✓' : '✗'}`);
        console.log(`     • Classical: ${formData['time-classical'] ? '✓' : '✗'}`);
        console.log(`     • Correspondence: ${formData['time-correspondence'] ? '✓' : '✗'}`);
        console.log('   Rating Bands:');
        console.log(`     • 1600: ${formData['rating-1600'] ? '✓' : '✗'}`);
        console.log(`     • 1800: ${formData['rating-1800'] ? '✓' : '✗'}`);
        console.log(`     • 2000: ${formData['rating-2000'] ? '✓' : '✗'}`);
        console.log(`     • 2200: ${formData['rating-2200'] ? '✓' : '✗'}`);
        console.log(`     • 2500: ${formData['rating-2500'] ? '✓' : '✗'}`);
        console.log('');

        // Opponent Move Filters
        console.log('🛡️ OPPONENT MOVE FILTERS:');
        console.log(`   Games Likelihood: ${formData['games-likelihood'] || 'N/A'}`);
        console.log(`   Minimum Games: ${formData['opponent-min-games'] || 'N/A'}`);
        console.log('');

        // Candidate Move Selectors
        console.log('🎯 CANDIDATE MOVE SELECTORS:');
        console.log(`   Most Played Moves: ${formData['most-played-moves'] || 'N/A'}`);
        console.log(`   Minimum Playrate: ${formData['min-playrate-percent'] || 'N/A'}%`);
        console.log(`   Minimum Games: ${formData['candidate-min-games'] || 'N/A'}`);
        console.log(`   Confidence: ${formData['confidence-percent'] || 'N/A'}%`);
        console.log(`   Draws Are Half Point: ${formData['draws-half-point'] ? '✓' : '✗'}`);
        console.log('');

        // Engine Settings
        console.log('🤖 ENGINE SETTINGS:');
        console.log(`   Engine Enabled: ${formData['engine-enabled'] ? '✓' : '✗'}`);
        console.log(`   Engine Depth: ${formData['engine-depth'] || 'N/A'}`);
        console.log(`   Engine Finishing: ${formData['engine-finishing'] ? '✓' : '✗'}`);
        console.log(`   Soundness Limit: ${formData['soundness-limit'] || 'N/A'} centipawns`);
        console.log(`   Move Loss Limit: ${formData['move-loss-limit'] || 'N/A'} centipawns`);
        console.log(`   Ignore Loss Limit: ${formData['ignore-loss-limit'] || 'N/A'}`);
        console.log(`   Engine Threads: ${formData['engine-threads'] || 'N/A'}`);
        console.log(`   Engine Hash: ${formData['engine-hash'] || 'N/A'} MB`);
        console.log('');

        // Summary
        console.log('📊 CONFIGURATION SUMMARY:');
        const enabledTimeControls = ['time-bullet', 'time-blitz', 'time-rapid', 'time-classical', 'time-correspondence']
            .filter(id => formData[id]).map(id => id.replace('time-', '')).join(', ');
        const enabledRatings = ['rating-1600', 'rating-1800', 'rating-2000', 'rating-2200', 'rating-2500']
            .filter(id => formData[id]).map(id => id.replace('rating-', '')).join(', ');

        console.log(`   Active Time Controls: ${enabledTimeControls || 'None'}`);
        console.log(`   Active Ratings: ${enabledRatings || 'None'}`);
        console.log(`   Engine: ${formData['engine-enabled'] ? 'Enabled' : 'Disabled'}`);
        console.log(`   PGN Status: ${pgnInput.trim() ? 'Provided' : 'Empty'}`);

        console.log('═'.repeat(60));
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
 * Configuration Management
 */
class ConfigManager {
    constructor() {
        this.config = {};
        this.loadFromSession();
    }

    saveConfig(config) {
        this.config = { ...this.config, ...config };
        sessionStorage.setItem('bookbuilder-config', JSON.stringify(this.config));
    }

    loadFromSession() {
        const saved = sessionStorage.getItem('bookbuilder-config');
        if (saved) {
            try {
                this.config = JSON.parse(saved);
                this.populateForm();
            } catch (e) {
                console.warn('Failed to load saved configuration:', e);
            }
        }
    }

    populateForm() {
        Object.keys(this.config).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = this.config[key];
                } else {
                    element.value = this.config[key];
                }
                // Update range displays
                if (element.type === 'range') {
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
 * Progress Tracking
 */
class ProgressTracker {
    constructor() {
        this.container = document.getElementById('progress-container');
        this.fill = document.getElementById('progress-fill');
        this.text = document.getElementById('progress-text');
        this.isActive = false;
    }

    start() {
        this.isActive = true;
        this.container.style.display = 'block';
        this.updatePhase('Starting...', 0);

        // Hide other containers
        document.getElementById('error-container').style.display = 'none';
        document.getElementById('success-container').style.display = 'none';
    }

    updatePhase(text, percentage) {
        if (!this.isActive) return;

        this.fill.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
        this.text.textContent = text;
    }

    updateProgress(additionalInfo) {
        if (!this.isActive) return;

        // Add additional info without changing main progress
        const currentText = this.text.textContent;
        this.text.textContent = `${currentText}\n${additionalInfo}`;
    }

    updateDisplayPhase(message = 'Preparing PGN display...', progress = 90) {
        if (!this.isActive) return;

        this.updatePhase(message, progress);
    }

    complete(message, completionInfo = null) {
        this.isActive = false;
        this.fill.style.width = '100%';
        this.text.textContent = message;

        // Handle display mode vs traditional success mode
        if (completionInfo && completionInfo.displayMethod === 'browser') {
            // Hide progress container for display mode
            setTimeout(() => {
                this.container.style.display = 'none';
            }, 1500);
        } else {
            // Show traditional success container
            setTimeout(() => {
                this.container.style.display = 'none';
                const successContainer = document.getElementById('success-container');
                const successMessage = document.getElementById('success-message');
                successContainer.style.display = 'block';
                successMessage.textContent = message;
            }, 1000);
        }
    }

    reset() {
        this.isActive = false;
        this.container.style.display = 'none';
        this.fill.style.width = '0%';
        this.text.textContent = 'Initializing...';
    }
}

/**
 * Error Handling
 */
class ErrorHandler {
    constructor() {
        this.container = document.getElementById('error-container');
        this.message = document.getElementById('error-message');
    }

    showError(title, error) {
        console.error(title, error);

        this.container.style.display = 'block';
        this.message.innerHTML = `
            <strong>${title}</strong><br>
            ${error.message}<br>
            <small>Check console for detailed error information.</small>
        `;

        // Hide other containers
        document.getElementById('progress-container').style.display = 'none';
        document.getElementById('success-container').style.display = 'none';

        // Log detailed error to console
        this.logError(error, title);
    }

    showValidationErrors(errors) {
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

    logError(error, context) {
        console.group(`🐛 Error in ${context}`);
        console.error('Message:', error.message);
        console.error('Stack:', error.stack);
        console.error('Context:', context);
        console.groupEnd();
    }
}

/**
 * File Generation and Download
 */
// Removed duplicate FileGenerator class - using imported version

export default FormController;
