/**
 * =============================================================================
 * ErrorHandler.js - User-friendly error display and debugging support
 * =============================================================================
 *
 * PURPOSE:
 * When something goes wrong in the application, this class:
 * 1. Shows user-friendly error messages (not cryptic developer text)
 * 2. Provides helpful suggestions for fixing the problem
 * 3. Logs detailed technical info for debugging
 * 4. Allows users to copy/download error reports for support
 *
 * WHY GOOD ERROR HANDLING MATTERS:
 * Users get frustrated by vague errors like "Something went wrong."
 * Good error handling:
 * - Tells users WHAT happened in plain language
 * - Suggests HOW to fix it
 * - Provides a way to get help (copy error details)
 *
 * ERROR TYPES WE HANDLE:
 * - Validation errors: Bad configuration input
 * - API errors: Lichess/Stockfish communication failures
 * - Progress errors: Failures during repertoire generation
 * - Global errors: Unexpected JavaScript exceptions
 *
 * DEBUG MODE:
 * When debug mode is enabled (localhost or ?debug=true in URL):
 * - Shows detailed stack traces
 * - Logs more information to console
 * - Useful for developers investigating issues
 *
 * DESIGN PATTERN:
 * This class manages UI state for the error display container.
 * It also hooks into global error events to catch unhandled exceptions.
 *
 * DOM REQUIREMENTS:
 * The HTML must have these elements:
 * - #error-container: Container div for error display
 * - #error-message: Inner element for error content
 *
 * EXAMPLE USAGE:
 * ```javascript
 * const errorHandler = new ErrorHandler();
 * errorHandler.showError('API Error', new Error('Connection failed'), [
 *   'Check your internet connection',
 *   'Try again in a few moments'
 * ]);
 * ```
 * =============================================================================
 */

// Import the Logger utility for consistent logging across the application
// Using Logger instead of console.log/console.error provides:
// - Consistent log formatting with timestamps and categories
// - Ability to filter logs by level (debug, info, warn, error)
// - Configurable output (can be disabled in production)
import Logger from '../utils/Logger.js';

// Create a logger instance for this module
// The 'ErrorHandler' tag helps identify where log messages came from
const log = Logger.get('ErrorHandler');

class ErrorHandler {
    /**
     * Constructor - Initialize error handler and find DOM elements
     *
     * WHY DOM ELEMENTS?
     * Instead of creating elements dynamically, we reference existing
     * elements in the HTML. This allows the HTML to control styling
     * and layout while JS controls content and visibility.
     */
    constructor() {
        // Reference to the main error display container
        // This gets shown/hidden when errors occur
        this.container = document.getElementById('error-container');

        // Reference to the element where error content is inserted
        this.message = document.getElementById('error-message');

        // Reference to the dark backdrop overlay behind the error modal
        // This dims the page to focus attention on the error
        this.overlay = document.getElementById('error-overlay');

        // Array to store error history for debugging
        // Useful for seeing patterns or multiple errors
        this.errorLog = [];

        // Check if we're in debug mode (shows extra technical info)
        this.debugMode = this.detectDebugMode();

        // Set up click handler to dismiss error when clicking the backdrop
        // This is a common UX pattern for modal dialogs
        if (this.overlay) {
            this.overlay.addEventListener('click', () => this.clearError());
        }
    }

    /**
     * Detect if we're in debug mode
     */
    detectDebugMode() {
        return window.location.hostname === 'localhost' ||
               window.location.search.includes('debug=true') ||
               localStorage.getItem('bookbuilder-debug') === 'true';
    }

    /**
     * Capture the current configuration values from the form
     *
     * WHY THIS IS IMPORTANT:
     * When a user reports an error, we need to know their exact settings
     * to reproduce the issue. This captures all form values at the moment
     * the error occurred, so the developer can recreate the same conditions.
     *
     * @returns {Object} Current configuration values or empty object if unavailable
     */
    captureCurrentConfig() {
        try {
            // Try to get form data from the global formController
            // FormController is initialized in app.html and stored on window
            if (window.formController && window.formController.configManager) {
                const formData = window.formController.configManager.getFormData();

                // Return a clean, readable config object
                // Organized by category for easy reading in error reports
                return {
                    // PGN Input (truncated to avoid huge reports)
                    pgnInput: this.truncateString(formData['pgn-input-text'] || '', 500),

                    // Time Controls
                    timeControls: {
                        bullet: !!formData['time-bullet'],
                        blitz: !!formData['time-blitz'],
                        rapid: !!formData['time-rapid'],
                        classical: !!formData['time-classical'],
                        correspondence: !!formData['time-correspondence']
                    },

                    // Rating Brackets
                    ratings: {
                        '1600': !!formData['rating-1600'],
                        '1800': !!formData['rating-1800'],
                        '2000': !!formData['rating-2000'],
                        '2200': !!formData['rating-2200'],
                        '2500': !!formData['rating-2500']
                    },

                    // Opponent Move Settings
                    opponentMoves: {
                        gamesLikelihood: formData['games-likelihood'],
                        minGames: formData['opponent-min-games']
                    },

                    // Candidate Move Settings
                    candidateMoves: {
                        mostPlayedMoves: formData['most-played-moves'],
                        minPlayrate: formData['min-playrate-percent'],
                        minGames: formData['candidate-min-games'],
                        confidence: formData['confidence-percent'],
                        drawsHalfPoint: !!formData['draws-half-point']
                    },

                    // Engine Settings
                    engine: {
                        enabled: !!formData['engine-enabled'],
                        fullEngine: !!formData['engine-full'],
                        depth: formData['engine-depth'],
                        finishing: !!formData['engine-finishing'],
                        soundnessLimit: formData['soundness-limit'],
                        moveLossLimit: formData['move-loss-limit'],
                        ignoreLossLimit: formData['ignore-loss-limit'],
                        hashSize: formData['engine-hash']
                    },

                    // Output Settings
                    output: {
                        perspective: formData['perspective']
                    }
                };
            }
        } catch (e) {
            // If we can't get config, log it but don't break error handling
            console.warn('Failed to capture config for error report:', e);
        }

        // Return empty object if we couldn't get the config
        return { note: 'Configuration could not be captured' };
    }

    /**
     * Truncate a string to a maximum length
     *
     * Used to prevent huge PGN inputs from bloating error reports
     *
     * @param {string} str - String to truncate
     * @param {number} maxLength - Maximum length
     * @returns {string} Truncated string with ellipsis if needed
     */
    truncateString(str, maxLength) {
        if (!str || str.length <= maxLength) return str;
        return str.substring(0, maxLength) + '... [truncated]';
    }

    /**
     * Show general error with detailed information
     */
    showError(title, error, suggestions = []) {
        console.error(title, error);

        // Log error to internal log
        this.logToInternalLog(title, error);

        // Display user-friendly error
        this.displayError(title, error, suggestions);

        // Hide other UI containers
        this.hideOtherContainers();

        // Log detailed error to console
        this.logDetailedError(error, title);
    }

    /**
     * Show validation errors from form validation
     */
    showValidationErrors(errors) {
        const errorList = errors.map(error => `• ${error}`).join('<br>');

        // Show the dark backdrop overlay
        if (this.overlay) {
            this.overlay.style.display = 'block';
        }

        this.container.style.display = 'block';
        // IMPORTANT: Button must have type="button" to prevent form submission
        this.message.innerHTML = `
            <div class="error-title">
                <strong>⚠️ Configuration Validation Failed</strong>
            </div>
            <div class="error-content">
                ${errorList}
            </div>
            <div class="error-actions">
                <button type="button" onclick="window.errorHandler.clearError()"
                        class="btn btn-secondary">
                    Dismiss
                </button>
            </div>
        `;

        this.hideOtherContainers();
        this.logToInternalLog('Validation Error', { message: errors.join(', ') });
    }

    /**
     * Show API-specific errors with retry suggestions
     */
    showAPIError(apiName, error, retryable = true) {
        const suggestions = [];

        if (retryable) {
            suggestions.push('Try again in a few moments');
        }

        if (apiName === 'Lichess') {
            suggestions.push('Check your internet connection');
            suggestions.push('Verify Lichess.org is accessible');
            if (error.message.includes('rate limit')) {
                suggestions.push('Wait for rate limit to reset (usually 1 minute)');
            }
        }

        if (apiName === 'Stockfish') {
            suggestions.push('Try reducing engine depth in settings');
            suggestions.push('Check if browser supports Web Workers');
        }

        this.showError(`${apiName} API Error`, error, suggestions);
    }

    /**
     * Show progress-related errors
     */
    showProgressError(phase, error, currentStep = null) {
        const title = `Error in ${phase}`;
        const suggestions = [
            'Check the error details below',
            'Try adjusting configuration settings',
            'Contact support if the issue persists'
        ];

        if (currentStep) {
            suggestions.unshift(`Error occurred at step: ${currentStep}`);
        }

        this.showError(title, error, suggestions);
    }

    /**
     * Display error in UI with enhanced formatting
     */
    displayError(title, error, suggestions = []) {
        const errorId = `error-${Date.now()}`;

        let suggestionHtml = '';
        if (suggestions.length > 0) {
            suggestionHtml = `
                <div class="error-suggestions">
                    <strong>Suggestions:</strong>
                    <ul>
                        ${suggestions.map(s => `<li>${s}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        let debugInfo = '';
        if (this.debugMode) {
            debugInfo = `
                <div class="error-debug">
                    <details>
                        <summary>Debug Information</summary>
                        <div class="debug-content">
                            <strong>Error Message:</strong> ${error.message}<br>
                            <strong>Timestamp:</strong> ${new Date().toISOString()}<br>
                            <strong>Stack Trace:</strong><br>
                            <pre>${error.stack || 'No stack trace available'}</pre>
                            ${error.cause ? `<strong>Caused by:</strong> ${error.cause}` : ''}
                        </div>
                    </details>
                </div>
            `;
        }

        // Show the dark backdrop overlay behind the modal
        // This dims the page to focus user attention on the error
        if (this.overlay) {
            this.overlay.style.display = 'block';
        }

        // Show the error modal container
        this.container.style.display = 'block';

        // Build the error popup HTML content
        // Uses onclick handlers that call window.errorHandler methods
        // so they work even when called from inline HTML attributes
        // IMPORTANT: All buttons must have type="button" to prevent form submission
        // (the error container is inside the form element in the HTML)
        this.message.innerHTML = `
            <div class="error-header">
                <div class="error-title">
                    <strong>❌ ${title}</strong>
                    <button type="button" class="error-close" onclick="window.errorHandler.clearError()">
                        ×
                    </button>
                </div>
            </div>
            <div class="error-content">
                <div class="error-message">${this.sanitizeErrorMessage(error.message)}</div>
                ${suggestionHtml}
                ${debugInfo}
            </div>
            <div class="error-actions">
                <button type="button" onclick="window.errorHandler.copyErrorToClipboard('${errorId}')" class="btn btn-secondary">
                    Copy Error Details
                </button>
                <button type="button" onclick="window.errorHandler.downloadErrorLog()" class="btn btn-secondary">
                    Download Error Log
                </button>
                <button type="button" onclick="window.errorHandler.openEmailReport('${errorId}')" class="btn btn-secondary">
                    Report via Email
                </button>
                <button type="button" onclick="window.errorHandler.clearError()" class="btn btn-primary">
                    Dismiss
                </button>
            </div>
        `;

        // Store error details for clipboard/download
        // Capture the current config so developers can reproduce the issue
        window[`errorDetails_${errorId}`] = {
            title,
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
            suggestions,
            // Capture all form settings at the time of the error
            config: this.captureCurrentConfig()
        };
    }

    /**
     * Log error to internal error log
     */
    logToInternalLog(title, error) {
        this.errorLog.push({
            timestamp: new Date().toISOString(),
            title,
            message: error.message,
            stack: error.stack,
            url: window.location.href,
            userAgent: navigator.userAgent
        });

        // Limit log size
        if (this.errorLog.length > 50) {
            this.errorLog = this.errorLog.slice(-25);
        }

        // Store in localStorage for persistence
        try {
            localStorage.setItem('bookbuilder-error-log', JSON.stringify(this.errorLog));
        } catch (e) {
            console.warn('Failed to store error log:', e);
        }
    }

    /**
     * Log detailed error information to console
     */
    logDetailedError(error, context) {
        console.group(`🐛 Error in ${context}`);
        console.error('Message:', error.message);
        console.error('Stack:', error.stack);
        console.error('Context:', context);
        console.error('Timestamp:', new Date().toISOString());
        console.error('URL:', window.location.href);

        if (error.cause) {
            console.error('Caused by:', error.cause);
        }

        // Log any additional error properties
        Object.keys(error).forEach(key => {
            if (!['message', 'stack', 'name'].includes(key)) {
                console.error(`${key}:`, error[key]);
            }
        });

        console.groupEnd();
    }

    /**
     * Hide other UI containers when showing error
     */
    hideOtherContainers() {
        const containers = [
            'progress-container',
            'success-container'
        ];

        containers.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.style.display = 'none';
            }
        });
    }

    /**
     * Sanitize error message for HTML display
     */
    sanitizeErrorMessage(message) {
        if (!message) return 'Unknown error occurred';

        return message
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
    }

    /**
     * Copy error details to clipboard
     *
     * Formats all error information including the user's configuration
     * into a readable text format that can be pasted into an email.
     */
    copyErrorToClipboard(errorId) {
        const errorDetails = window[`errorDetails_${errorId}`];
        if (!errorDetails) {
            console.warn('Error details not found');
            return;
        }

        // Format the config object into readable text
        // This makes it easy to see exactly what settings were used
        const configText = this.formatConfigForReport(errorDetails.config);

        const textToCopy = `
BookBuilder Error Report
========================
Title: ${errorDetails.title}
Timestamp: ${errorDetails.timestamp}
Error: ${errorDetails.error}

Stack Trace:
${errorDetails.stack || 'No stack trace available'}

Suggestions:
${errorDetails.suggestions.map(s => `- ${s}`).join('\n')}

Configuration at Time of Error:
${configText}

Environment:
- URL: ${window.location.href}
- User Agent: ${navigator.userAgent}
- Debug Mode: ${this.debugMode}
        `.trim();

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                this.showTemporaryMessage('Error details copied to clipboard');
            }).catch(err => {
                console.error('Failed to copy to clipboard:', err);
                this.fallbackCopyToClipboard(textToCopy);
            });
        } else {
            this.fallbackCopyToClipboard(textToCopy);
        }
    }

    /**
     * Format configuration object into readable text for error reports
     *
     * Takes the structured config object and converts it to a
     * human-readable format with clear labels and indentation.
     *
     * @param {Object} config - Configuration object from captureCurrentConfig()
     * @returns {string} Formatted text representation
     */
    formatConfigForReport(config) {
        if (!config || config.note) {
            return config?.note || 'Configuration not available';
        }

        // Build readable sections for each config category
        const lines = [];

        // PGN Input
        if (config.pgnInput) {
            lines.push(`PGN Input: ${config.pgnInput}`);
        }

        // Time Controls
        if (config.timeControls) {
            const activeTimeControls = Object.entries(config.timeControls)
                .filter(([, enabled]) => enabled)
                .map(([name]) => name);
            lines.push(`Time Controls: ${activeTimeControls.join(', ') || 'none selected'}`);
        }

        // Rating Brackets
        if (config.ratings) {
            const activeRatings = Object.entries(config.ratings)
                .filter(([, enabled]) => enabled)
                .map(([rating]) => rating);
            lines.push(`Ratings: ${activeRatings.join(', ') || 'none selected'}`);
        }

        // Opponent Move Settings
        if (config.opponentMoves) {
            lines.push(`Opponent Moves:`);
            lines.push(`  - Games Likelihood: ${config.opponentMoves.gamesLikelihood || 'N/A'}`);
            lines.push(`  - Min Games: ${config.opponentMoves.minGames || 'N/A'}`);
        }

        // Candidate Move Settings
        if (config.candidateMoves) {
            lines.push(`Candidate Moves:`);
            lines.push(`  - Most Played Moves: ${config.candidateMoves.mostPlayedMoves || 'N/A'}`);
            lines.push(`  - Min Playrate: ${config.candidateMoves.minPlayrate || 'N/A'}%`);
            lines.push(`  - Min Games: ${config.candidateMoves.minGames || 'N/A'}`);
            lines.push(`  - Confidence: ${config.candidateMoves.confidence || 'N/A'}%`);
            lines.push(`  - Draws Half Point: ${config.candidateMoves.drawsHalfPoint ? 'Yes' : 'No'}`);
        }

        // Engine Settings
        if (config.engine) {
            lines.push(`Engine:`);
            lines.push(`  - Enabled: ${config.engine.enabled ? 'Yes' : 'No'}`);
            if (config.engine.enabled) {
                lines.push(`  - Full Engine: ${config.engine.fullEngine ? 'Yes (75MB)' : 'No (Lite 7MB)'}`);
                lines.push(`  - Depth: ${config.engine.depth || 'N/A'}`);
                lines.push(`  - Finishing: ${config.engine.finishing ? 'Yes' : 'No'}`);
                lines.push(`  - Soundness Limit: ${config.engine.soundnessLimit || 'N/A'} cp`);
                lines.push(`  - Move Loss Limit: ${config.engine.moveLossLimit || 'N/A'} cp`);
                lines.push(`  - Ignore Loss Limit: ${config.engine.ignoreLossLimit || 'N/A'}`);
                lines.push(`  - Hash Size: ${config.engine.hashSize || 'N/A'} MB`);
            }
        }

        // Output Settings
        if (config.output) {
            lines.push(`Output:`);
            lines.push(`  - Perspective: ${config.output.perspective || 'N/A'}`);
        }

        return lines.join('\n');
    }

    /**
     * Fallback clipboard method for older browsers
     */
    fallbackCopyToClipboard(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();

        try {
            document.execCommand('copy');
            this.showTemporaryMessage('Error details copied to clipboard');
        } catch (err) {
            console.error('Fallback copy failed:', err);
            this.showTemporaryMessage('Failed to copy. Please copy manually from console.');
            console.log('Error details to copy:', text);
        }

        document.body.removeChild(textArea);
    }

    /**
     * Download complete error log
     */
    downloadErrorLog() {
        const logData = {
            exportTime: new Date().toISOString(),
            errorLog: this.errorLog,
            environment: {
                url: window.location.href,
                userAgent: navigator.userAgent,
                debugMode: this.debugMode,
                timestamp: new Date().toISOString()
            }
        };

        const blob = new Blob([JSON.stringify(logData, null, 2)], {
            type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bookbuilder-error-log-${new Date().toISOString().slice(0, 10)}.json`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showTemporaryMessage('Error log downloaded');
    }

    /**
     * Open email client with error report
     *
     * WHY THIS APPROACH?
     * mailto URLs have length limits (~2000 chars), so we can't include
     * the full error details in the URL. Instead, we:
     * 1. Copy the full error details to clipboard
     * 2. Open email with subject line and paste instructions
     *
     * This gives the user a pre-addressed email and the error data
     * ready to paste in one click.
     *
     * @param {string} errorId - The error ID to report
     */
    openEmailReport(errorId) {
        // First, copy the full error details to clipboard
        // This ensures user has all the data ready to paste
        this.copyErrorToClipboard(errorId);

        // Get error details to create a meaningful subject line
        // The displayError() method stores error data as window[`errorDetails_${errorId}`]
        // so we can retrieve it later for clipboard/email features
        const errorDetails = window[`errorDetails_${errorId}`];

        // Build the subject line with error title for easy identification
        // encodeURIComponent ensures special characters don't break the URL
        const subject = encodeURIComponent(
            `BookBuilder Error Report - ${errorDetails?.title || 'Unknown Error'}`
        );

        // Body contains simple instructions - the actual error data is in clipboard
        const body = encodeURIComponent(
            'Please paste the error details from your clipboard below:\n\n'
        );

        // Open the user's default email client with pre-filled fields
        // Using window.location.href ensures it works across all browsers
        window.location.href = `mailto:alex@alexcrompton.com?subject=${subject}&body=${body}`;
    }

    /**
     * Show temporary success/info message
     */
    showTemporaryMessage(message, duration = 3000) {
        const messageEl = document.createElement('div');
        messageEl.className = 'temporary-message';
        messageEl.textContent = message;
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #10b981;
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 0.5rem;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            z-index: 10000;
            transition: opacity 0.3s ease;
        `;

        document.body.appendChild(messageEl);

        setTimeout(() => {
            messageEl.style.opacity = '0';
            setTimeout(() => {
                if (messageEl.parentNode) {
                    messageEl.parentNode.removeChild(messageEl);
                }
            }, 300);
        }, duration);
    }

    /**
     * Clear error display
     *
     * Hides both the error modal and the backdrop overlay.
     * Called when user clicks Dismiss, the X button, or the backdrop.
     */
    clearError() {
        // Hide the error modal
        if (this.container) {
            this.container.style.display = 'none';
        }

        // Hide the dark backdrop overlay
        if (this.overlay) {
            this.overlay.style.display = 'none';
        }
    }

    /**
     * Get error log for debugging
     */
    getErrorLog() {
        return this.errorLog;
    }

    /**
     * Clear error log
     */
    clearErrorLog() {
        this.errorLog = [];
        try {
            localStorage.removeItem('bookbuilder-error-log');
        } catch (e) {
            console.warn('Failed to clear error log from localStorage:', e);
        }
    }

    /**
     * Enable/disable debug mode
     */
    setDebugMode(enabled) {
        this.debugMode = enabled;
        try {
            if (enabled) {
                localStorage.setItem('bookbuilder-debug', 'true');
            } else {
                localStorage.removeItem('bookbuilder-debug');
            }
        } catch (e) {
            console.warn('Failed to set debug mode in localStorage:', e);
        }
    }

    /**
     * Test error popups - useful for verifying the email report feature works
     *
     * WHY THIS EXISTS:
     * During development and QA, we need a way to trigger error popups
     * without actually breaking anything. This method lets you test:
     * - That popups appear correctly
     * - That the "Report via Email" button works
     * - That error details are copied to clipboard properly
     *
     * USAGE (from browser console):
     * ```javascript
     * // Run all tests sequentially (2 second delay between each)
     * window.errorHandler.testErrors();
     *
     * // Run a specific test
     * window.errorHandler.testErrors('api');
     * window.errorHandler.testErrors('validation');
     * window.errorHandler.testErrors('generation');
     * window.errorHandler.testErrors('uncaught');
     * window.errorHandler.testErrors('promise');
     * ```
     *
     * @param {string} [testType] - Optional: run only a specific test type
     */
    testErrors(testType = 'all') {
        // Define all test scenarios
        // Each scenario simulates a real error that could happen in the app
        const tests = {
            // API Error: Simulates Lichess being down or rate limited
            api: () => {
                this.showAPIError('Lichess', new Error('Test: API rate limit exceeded - too many requests'));
            },

            // Validation Error: Simulates user entering bad config values
            validation: () => {
                this.showValidationErrors([
                    'Test: Depth must be between 1 and 20',
                    'Test: PGN input is required',
                    'Test: Invalid move format in line 3'
                ]);
            },

            // Generation Error: Simulates a failure during repertoire building
            generation: () => {
                const error = new Error('Test: Engine analysis timed out after 30 seconds');
                error.stack = `Error: Test: Engine analysis timed out after 30 seconds
    at StockfishEngine.analyze (StockfishEngine.js:245)
    at BookBuilder.analyzePosition (BookBuilder.js:412)
    at BookBuilder.generateChapter (BookBuilder.js:289)`;
                this.showProgressError('Repertoire Generation', error, 'Analyzing position e4 e5 Nf3');
            },

            // Uncaught Error: Simulates an unexpected bug in the code
            // Uses setTimeout so it goes through the global error handler
            uncaught: () => {
                // This will be caught by window.addEventListener('error', ...)
                setTimeout(() => {
                    throw new Error('Test: Uncaught error - simulating a bug in the code');
                }, 100);
            },

            // Promise Rejection: Simulates an unhandled async failure
            // Uses setTimeout so it goes through the global unhandledrejection handler
            promise: () => {
                // This will be caught by window.addEventListener('unhandledrejection', ...)
                setTimeout(() => {
                    Promise.reject(new Error('Test: Unhandled promise rejection - async operation failed'));
                }, 100);
            }
        };

        // Helper to run a single test
        const runTest = (name) => {
            if (tests[name]) {
                log.info(`Running error test: ${name}`);
                tests[name]();
                return true;
            }
            return false;
        };

        // Run specific test or all tests
        if (testType !== 'all') {
            if (!runTest(testType)) {
                log.warn(`Unknown test type: ${testType}`);
                log.info('Available tests: ' + Object.keys(tests).join(', '));
            }
            return;
        }

        // Run all tests with delays so user can see each popup
        const testNames = Object.keys(tests);
        let index = 0;

        log.info('Starting error popup tests. Each popup will appear with a 2 second delay.');
        log.info('Click "Report via Email" on any popup to test the email feature.');

        const runNext = () => {
            if (index < testNames.length) {
                const name = testNames[index];
                log.info(`\n--- Test ${index + 1}/${testNames.length}: ${name} ---`);
                runTest(name);
                index++;
                // Wait 2 seconds before showing the next error
                // This gives time to test the popup before the next one appears
                setTimeout(runNext, 2000);
            } else {
                log.info('\n--- All error tests complete ---');
                log.info('Check that each popup appeared and the email button works.');
            }
        };

        runNext();
    }
}

// Add global error handlers
// These catch any JavaScript errors that weren't caught by try-catch blocks
// By showing the popup, users can report unexpected errors via email

/**
 * Global error handler for uncaught JavaScript exceptions
 *
 * WHY THIS MATTERS:
 * Not all errors happen inside try-catch blocks. When an unexpected error
 * occurs (like a typo in code, or a null reference), this handler catches it
 * and shows the user a helpful popup with the email report option.
 *
 * Without this, users would just see a broken page with no way to report it.
 */
window.addEventListener('error', (event) => {
    // Check if our error handler is ready (it's created on page load)
    if (window.errorHandler) {
        // Create an Error object with the details from the event
        // The event contains: message, filename, line number, column number
        const error = event.error || new Error(event.message);

        // Add location info to help with debugging
        // This tells developers exactly where the error occurred
        error.location = `${event.filename}:${event.lineno}:${event.colno}`;

        // Show the popup with helpful suggestions for unexpected errors
        window.errorHandler.showError(
            'Unexpected Error',
            error,
            [
                'This was an unexpected error - please report it via email',
                'Try refreshing the page',
                'If the problem persists, try clearing your browser cache'
            ]
        );
    }
    // Also log to console for developers debugging in dev tools
    log.error('Global error:', event);
});

/**
 * Global handler for unhandled Promise rejections
 *
 * WHY THIS MATTERS:
 * Modern JavaScript uses Promises heavily (async/await, fetch, etc.).
 * If a Promise fails and nobody handles the error, it's called an
 * "unhandled rejection." This catches those and shows the popup.
 *
 * Example: If an API call fails and the code forgot to add .catch(),
 * this handler ensures the user still sees an error message.
 */
window.addEventListener('unhandledrejection', (event) => {
    // Check if our error handler is ready
    if (window.errorHandler) {
        // The rejection reason might be an Error object or just a string/value
        // We need to handle both cases
        const reason = event.reason;
        const error = reason instanceof Error
            ? reason
            : new Error(reason?.message || String(reason) || 'Promise rejected');

        // Copy the stack trace if available
        if (reason?.stack && !(reason instanceof Error)) {
            error.stack = reason.stack;
        }

        // Show the popup with suggestions specific to async errors
        window.errorHandler.showError(
            'Unexpected Async Error',
            error,
            [
                'An asynchronous operation failed unexpectedly',
                'Please report this via email so we can fix it',
                'Try refreshing the page and attempting the operation again'
            ]
        );
    }
    // Also log to console for developers
    log.error('Unhandled promise rejection:', event);
});

export default ErrorHandler;
