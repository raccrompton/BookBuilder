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
import { Chess } from '/node_modules/chess.js/dist/esm/chess.js';

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
            console.error('💥 [DEBUG] Error in handleSubmit:', error);
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
            await this.validateConnections();

            // Phase 3: Create BookBuilder instance
            this.progressTracker.updatePhase('Creating BookBuilder instance...', 15);
            this.bookBuilder = new BookBuilder(config);

            // Phase 4: Process openings
            this.progressTracker.updatePhase('Processing openings...', 20);
            const results = await this.processOpenings(config);

            // Phase 5: Generate downloads
            this.progressTracker.updatePhase('Preparing downloads...', 95);
            await this.generateDownloads(results);

            this.progressTracker.complete('Repertoire generated successfully!');

        } catch (error) {
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

    async validateConnections() {
        // Test Lichess API connection
        try {
            const startingPosition = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
            await this.lichessClient.getPositionStats(startingPosition, {
                speeds: 'blitz,rapid,classical',
                ratings: '2000,2200,2500',
                moves: 3
            });
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

            try {
                const chapterContent = await this.bookBuilder.generateChapter(opening, i + 1);
                const safeName = opening.name.replace(/\s+/g, '_');
                const fileName = `Chapter_${i + 1}_${safeName}.pgn`;
                results[fileName] = chapterContent;

                // Update progress with intermediate results
                const linesGenerated = this.bookBuilder.finalLines?.length || 0;
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
                    moveCount: processedOpening.moves.length,
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
        return {
            // Opening configuration
            openings: openings.map(opening => ({
                name: opening.name,
                fen: this.convertMovesToFen(opening.moves || []),
                perspective: 'white', // Default perspective for PGN input
                priority: opening.priority || 1
            })),

            // Lichess API settings
            speeds: this.getSelectedSpeeds(formConfig),
            variants: ['standard'], // Always use standard chess
            ratingRange: [
                parseInt(formConfig['rating-min']) || 1600,
                parseInt(formConfig['rating-max']) || 2500
            ],

            // Move selection parameters
            DEPTHLIKELIHOOD: parseFloat(formConfig['depth-threshold']) || 0.05,
            STATISTICALALPHA: parseFloat(formConfig['statistical-alpha']) || 0.05,
            MINPLAYRATE: parseFloat(formConfig['min-play-rate']) || 0.01,
            MINGAMES: parseInt(formConfig['min-games']) || 10,
            CONTINUATIONGAMES: parseInt(formConfig['continuation-games']) || 5,
            DRAWSAREHALF: formConfig['draw-scoring'] !== 'exclude',

            // Engine settings
            CAREABOUTENGINE: formConfig['engine-enabled'] || false,
            ENGINEDEPTH: parseInt(formConfig['engine-depth']) || 20,
            ENGINEFINISH: formConfig['engine-finishing'] !== 'disabled',
            SOUNDNESSLIMIT: parseInt(formConfig['soundness-limit']) || 50,
            MOVELOSSLIMIT: parseInt(formConfig['move-loss-limit']) || 30,

            // Processing settings
            LONGTOSHORT: false, // Default: priority order
            BATCH_SIZE: 5,
            API_DELAY: 150
        };
    }

    getSelectedSpeeds(formConfig) {
        const speeds = [];
        if (formConfig['time-blitz']) speeds.push('blitz');
        if (formConfig['time-rapid']) speeds.push('rapid');
        if (formConfig['time-classical']) speeds.push('classical');
        if (formConfig['time-correspondence']) speeds.push('correspondence');
        return speeds.length > 0 ? speeds : ['blitz', 'rapid', 'classical'];
    }

    // getSelectedVariants method removed - always use standard chess

    convertMovesToFen(moves) {
        console.log('🔧 [DEBUG] Converting moves to FEN:', moves);
        
        if (!moves || moves.length === 0) {
            console.log('📍 [DEBUG] No moves provided, returning starting position');
            return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        }

        try {
            // Use chess.js to play through the moves and get resulting FEN
            const chess = new Chess();
            
            // Play each move in sequence
            for (let i = 0; i < moves.length; i++) {
                const move = moves[i];
                console.log(`🎯 [DEBUG] Playing move ${i + 1}: ${move}`);
                
                const moveResult = chess.move(move);
                if (!moveResult) {
                    console.error(`❌ [DEBUG] Invalid move: ${move} at position ${i + 1}`);
                    // Return starting position if any move is invalid
                    return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
                }
            }
            
            const resultFen = chess.fen();
            console.log('✅ [DEBUG] Successfully converted moves to FEN:', resultFen);
            return resultFen;
            
        } catch (error) {
            console.error('💥 [DEBUG] Error converting moves to FEN:', error);
            return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        }
    }

    updateRangeDisplay(rangeElement) {
        const valueElement = document.getElementById(rangeElement.id + '-value');
        if (valueElement) {
            valueElement.textContent = rangeElement.value;
        }
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

        // Validate rating ranges
        const ratingMin = parseInt(document.getElementById('rating-min').value);
        const ratingMax = parseInt(document.getElementById('rating-max').value);
        if (ratingMin >= ratingMax) {
            errors.push('Minimum rating must be less than maximum rating');
        }

        // Validate at least one time control is selected
        const timeControls = ['time-blitz', 'time-rapid', 'time-classical', 'time-correspondence'];
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

    complete(message) {
        this.isActive = false;
        this.fill.style.width = '100%';
        this.text.textContent = message;

        // Show success container after a delay
        setTimeout(() => {
            this.container.style.display = 'none';
            const successContainer = document.getElementById('success-container');
            const successMessage = document.getElementById('success-message');
            successContainer.style.display = 'block';
            successMessage.textContent = message;
        }, 1000);
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
