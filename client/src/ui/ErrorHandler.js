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

        // Array to store error history for debugging
        // Useful for seeing patterns or multiple errors
        this.errorLog = [];

        // Check if we're in debug mode (shows extra technical info)
        this.debugMode = this.detectDebugMode();
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

        this.container.style.display = 'block';
        this.message.innerHTML = `
            <div class="error-title">
                <strong>⚠️ Configuration Validation Failed</strong>
            </div>
            <div class="error-content">
                ${errorList}
            </div>
            <div class="error-actions">
                <button onclick="this.parentElement.parentElement.parentElement.style.display='none'" 
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

        this.container.style.display = 'block';
        this.message.innerHTML = `
            <div class="error-header">
                <div class="error-title">
                    <strong>❌ ${title}</strong>
                    <button class="error-close" onclick="document.getElementById('error-container').style.display='none'">
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
                <button onclick="window.errorHandler.copyErrorToClipboard('${errorId}')" class="btn btn-secondary">
                    Copy Error Details
                </button>
                <button onclick="window.errorHandler.downloadErrorLog()" class="btn btn-secondary">
                    Download Error Log
                </button>
                <button onclick="window.errorHandler.openEmailReport('${errorId}')" class="btn btn-secondary">
                    Report via Email
                </button>
                <button onclick="document.getElementById('error-container').style.display='none'" class="btn btn-primary">
                    Dismiss
                </button>
            </div>
        `;

        // Store error details for clipboard/download
        window[`errorDetails_${errorId}`] = {
            title,
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
            suggestions
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
     */
    copyErrorToClipboard(errorId) {
        const errorDetails = window[`errorDetails_${errorId}`];
        if (!errorDetails) {
            console.warn('Error details not found');
            return;
        }

        const textToCopy = `
BookBuilder Error Report
=======================
Title: ${errorDetails.title}
Timestamp: ${errorDetails.timestamp}
Error: ${errorDetails.error}

Stack Trace:
${errorDetails.stack || 'No stack trace available'}

Suggestions:
${errorDetails.suggestions.map(s => `- ${s}`).join('\n')}

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
     */
    clearError() {
        if (this.container) {
            this.container.style.display = 'none';
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
}

// Add global error handlers
window.addEventListener('error', (event) => {
    if (window.errorHandler) {
        window.errorHandler.logToInternalLog('Global Error', {
            message: event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            stack: event.error?.stack
        });
    }
    console.error('Global error:', event);
});

window.addEventListener('unhandledrejection', (event) => {
    if (window.errorHandler) {
        window.errorHandler.logToInternalLog('Unhandled Promise Rejection', {
            message: event.reason?.message || event.reason,
            stack: event.reason?.stack
        });
    }
    console.error('Unhandled promise rejection:', event);
});

export default ErrorHandler;
