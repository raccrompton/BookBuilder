/**
 * =============================================================================
 * ProgressTracker.js - Visual progress tracking and user feedback
 * =============================================================================
 *
 * PURPOSE:
 * When generating a chess repertoire, the process can take several minutes.
 * This class provides visual feedback so users know:
 * 1. The system is working (not frozen)
 * 2. How far along the process is
 * 3. Approximately how much longer it will take
 * 4. What's happening at each step
 *
 * WHY PROGRESS TRACKING MATTERS:
 * Without progress feedback, users might think the app is broken and
 * close it during a long operation. Good UX requires communicating
 * what's happening and setting expectations.
 *
 * FEATURES:
 * - Progress bar with percentage
 * - Phase-based updates ("Analyzing positions", "Generating output")
 * - Estimated time remaining (ETA) calculation
 * - Detailed log of operations
 * - Cancel button to abort long-running operations
 *
 * HOW ETA WORKS:
 * If we're 25% done after 30 seconds, we estimate total time as:
 * 30 seconds / 0.25 = 120 seconds total
 * So remaining time = 120 - 30 = 90 seconds
 * (This is a simple linear estimate - actual time may vary)
 *
 * DESIGN PATTERN:
 * This class manages the progress bar UI elements in the DOM.
 * It receives updates from BookBuilder as processing progresses.
 *
 * DOM REQUIREMENTS:
 * The HTML must have these elements:
 * - #progress-container: Main container div
 * - #progress-fill: The colored bar that shows percentage
 * - #progress-text: Text description of current operation
 *
 * EXAMPLE USAGE:
 * ```javascript
 * const tracker = new ProgressTracker();
 * tracker.start();
 * tracker.updatePhase('Processing Italian Game', 25);
 * tracker.updateProgress('Analyzing position 50 of 200');
 * tracker.complete('Generation complete!', { fileCount: 3 });
 * ```
 * =============================================================================
 */

/**
 * ProgressTracker Class - Manages progress bar UI and updates
 */
class ProgressTracker {
    /**
     * Constructor - Initialize progress tracker and find DOM elements
     */
    constructor() {
        // =====================================================================
        // Find DOM Elements
        // =====================================================================
        // These elements must exist in the HTML for the tracker to work

        // Main container that holds the entire progress UI
        this.container = document.getElementById('progress-container');

        // The colored bar element that expands to show percentage
        // We change its width: "width: 50%" for 50% progress
        this.fill = document.getElementById('progress-fill');

        // Text element showing current operation description
        this.text = document.getElementById('progress-text');

        // =====================================================================
        // State Tracking
        // =====================================================================

        // Whether progress tracking is currently active
        this.isActive = false;

        // When tracking started (for ETA calculations)
        // Stored as milliseconds since epoch (Date.now())
        this.startTime = null;

        // Current phase object {name, weight}
        this.currentPhase = null;

        // Array of phases with weights for progress calculation
        // Weight determines how much of total progress each phase represents
        this.phases = [];

        // Callback function to call if user clicks cancel
        // Set by the code that starts the operation
        this.cancelCallback = null;

        // Setup additional UI elements (cancel button, ETA, log)
        this.setupProgressUI();
    }

    /**
     * Setup enhanced progress UI with additional elements
     */
    setupProgressUI() {
        if (!this.container) return;

        // Add cancel button if it doesn't exist
        if (!this.container.querySelector('.progress-cancel')) {
            const cancelButton = document.createElement('button');
            cancelButton.className = 'progress-cancel btn btn-secondary';
            cancelButton.innerHTML = '⏹️ Cancel';
            cancelButton.style.display = 'none';
            cancelButton.onclick = () => this.cancel();
            this.container.appendChild(cancelButton);
        }

        // Add estimated time if it doesn't exist
        if (!this.container.querySelector('.progress-eta')) {
            const etaElement = document.createElement('div');
            etaElement.className = 'progress-eta';
            etaElement.style.cssText = `
                text-align: center;
                margin-top: 0.5rem;
                font-size: 0.875rem;
                color: var(--text-muted);
            `;
            this.container.appendChild(etaElement);
        }

        // Add detailed log if it doesn't exist
        if (!this.container.querySelector('.progress-log')) {
            const logElement = document.createElement('div');
            logElement.className = 'progress-log';
            logElement.style.cssText = `
                margin-top: 1rem;
                max-height: 150px;
                overflow-y: auto;
                background: #f8fafc;
                border: 1px solid var(--border);
                border-radius: 0.5rem;
                padding: 0.75rem;
                font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                font-size: 0.75rem;
                display: none;
            `;
            this.container.appendChild(logElement);
        }
    }

    /**
     * Start progress tracking
     */
    start(phases = null, cancellable = true) {
        this.isActive = true;
        this.startTime = Date.now();
        this.currentPhase = null;

        if (phases) {
            this.phases = phases;
        } else {
            this.phases = [
                { name: 'Initializing', weight: 5 },
                { name: 'Validating', weight: 10 },
                { name: 'Processing', weight: 65 },
                { name: 'Generating', weight: 10 },
                { name: 'Preparing Display', weight: 5 },
                { name: 'Finalizing', weight: 5 }
            ];
        }

        this.container.style.display = 'block';
        this.updatePhase('Starting...', 0);

        // Show/hide cancel button
        const cancelButton = this.container.querySelector('.progress-cancel');
        if (cancelButton) {
            cancelButton.style.display = cancellable ? 'inline-block' : 'none';
        }

        // Hide other containers
        this.hideOtherContainers();

        // Clear previous log
        const logElement = this.container.querySelector('.progress-log');
        if (logElement) {
            logElement.innerHTML = '';
            logElement.style.display = 'none';
        }
    }

    /**
     * Update current phase
     */
    updatePhase(text, percentage, phaseData = null) {
        if (!this.isActive) return;

        const clampedPercentage = Math.max(0, Math.min(100, percentage));

        this.fill.style.width = `${clampedPercentage}%`;
        this.text.textContent = text;

        if (phaseData) {
            this.currentPhase = phaseData;
        }

        // Update ETA
        this.updateETA(clampedPercentage);

        // Log progress
        this.logProgress(text, clampedPercentage);
    }

    /**
     * Update estimated time remaining
     */
    updateETA(percentage) {
        const etaElement = this.container.querySelector('.progress-eta');
        if (!etaElement || !this.startTime || percentage <= 0) return;

        const elapsed = Date.now() - this.startTime;
        const estimatedTotal = (elapsed / percentage) * 100;
        const remaining = estimatedTotal - elapsed;

        if (remaining > 0 && percentage < 95) {
            const remainingSeconds = Math.ceil(remaining / 1000);
            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = remainingSeconds % 60;

            let etaText = '';
            if (minutes > 0) {
                etaText = `Estimated ${minutes}m ${seconds}s remaining`;
            } else {
                etaText = `Estimated ${seconds}s remaining`;
            }

            etaElement.textContent = etaText;
        } else {
            etaElement.textContent = 'Nearly complete...';
        }
    }

    /**
     * Log progress message
     */
    logProgress(message, percentage = null) {
        const logElement = this.container.querySelector('.progress-log');
        if (!logElement) return;

        // Show log if it's hidden
        if (logElement.style.display === 'none') {
            logElement.style.display = 'block';
        }

        const timestamp = new Date().toLocaleTimeString();
        const percentageText = percentage !== null ? ` (${percentage.toFixed(1)}%)` : '';

        const logEntry = document.createElement('div');
        logEntry.innerHTML = `
            <span style="color: var(--text-muted);">[${timestamp}]</span> 
            ${message}${percentageText}
        `;

        logElement.appendChild(logEntry);

        // Auto-scroll to bottom
        logElement.scrollTop = logElement.scrollHeight;

        // Limit log entries
        const entries = logElement.children;
        if (entries.length > 20) {
            logElement.removeChild(entries[0]);
        }
    }

    /**
     * Update progress with additional details
     */
    updateProgress(details, additionalData = null) {
        if (!this.isActive) return;

        this.logProgress(details);

        // If additional data provided, update display
        if (additionalData) {
            if (additionalData.linesGenerated) {
                this.logProgress(`Generated ${additionalData.linesGenerated} lines`);
            }
            if (additionalData.openingName) {
                this.logProgress(`Processing: ${additionalData.openingName}`);
            }
            if (additionalData.apiCalls) {
                this.logProgress(`API calls made: ${additionalData.apiCalls}`);
            }
        }
    }

    /**
     * Update progress for specific opening processing
     */
    updateOpeningProgress(openingName, openingIndex, totalOpenings, linesGenerated = 0) {
        if (!this.isActive) return;

        const baseProgress = 20; // After initialization
        const processingRange = 70; // 20% to 90%
        const openingProgress = (openingIndex / totalOpenings) * processingRange;
        const totalProgress = baseProgress + openingProgress;

        const message = `Processing ${openingName} (${openingIndex + 1}/${totalOpenings})`;
        this.updatePhase(message, totalProgress);

        if (linesGenerated > 0) {
            this.logProgress(`${openingName}: ${linesGenerated} lines generated`);
        }
    }

    /**
     * Show batch processing progress
     */
    updateBatchProgress(batchIndex, totalBatches, currentOperation) {
        if (!this.isActive) return;

        const batchProgress = (batchIndex / totalBatches) * 100;
        this.logProgress(`Batch ${batchIndex + 1}/${totalBatches}: ${currentOperation}`);

        // Update fill but don't change main message
        const currentWidth = parseFloat(this.fill.style.width) || 0;
        const batchIncrement = batchProgress * 0.1; // Small increment for batch progress
        this.fill.style.width = `${Math.min(95, currentWidth + batchIncrement)}%`;
    }

    /**
     * Update progress for PGN display preparation phase
     */
    updateDisplayPhase(message = 'Preparing PGN display...', progress = 90) {
        if (!this.isActive) return;

        this.updatePhase(message, progress);
        this.logProgress('Formatting PGN content for display');
        this.logProgress('Setting up copy and download functionality');
    }

    /**
     * Complete progress tracking
     */
    complete(message, completionInfo = null) {
        this.isActive = false;
        this.fill.style.width = '100%';
        this.text.textContent = message;

        // Hide cancel button
        const cancelButton = this.container.querySelector('.progress-cancel');
        if (cancelButton) {
            cancelButton.style.display = 'none';
        }

        // Update ETA to completion message
        const etaElement = this.container.querySelector('.progress-eta');
        if (etaElement) {
            const elapsed = this.startTime ? Date.now() - this.startTime : 0;
            const elapsedSeconds = Math.ceil(elapsed / 1000);
            const minutes = Math.floor(elapsedSeconds / 60);
            const seconds = elapsedSeconds % 60;

            let timeText = '';
            if (minutes > 0) {
                timeText = `Completed in ${minutes}m ${seconds}s`;
            } else {
                timeText = `Completed in ${seconds}s`;
            }

            etaElement.textContent = timeText;
        }

        // Log completion
        this.logProgress(message);

        if (completionInfo) {
            // Handle both download and display info
            if (completionInfo.fileCount) {
                this.logProgress(`Generated ${completionInfo.fileCount} files`);
            }
            if (completionInfo.contentLength) {
                this.logProgress(`Generated content: ${this.formatFileSize(completionInfo.contentLength)}`);
            }
            if (completionInfo.displayMethod === 'browser') {
                this.logProgress('PGN displayed in browser with copy functionality');
            }
            if (completionInfo.totalSize) {
                this.logProgress(`Total size: ${completionInfo.totalSize}`);
            }
        }

        // Hide progress container after a short delay for display mode
        if (completionInfo && completionInfo.displayMethod === 'browser') {
            setTimeout(() => {
                this.container.style.display = 'none';
            }, 1500);
        } else {
            // Show traditional success container for download mode
            setTimeout(() => {
                this.showSuccessContainer(message, completionInfo);
            }, 1000);
        }
    }

    /**
     * Format file size for display
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Show success container with completion details
     */
    showSuccessContainer(message, downloadInfo) {
        this.container.style.display = 'none';

        const successContainer = document.getElementById('success-container');
        const successMessage = document.getElementById('success-message');

        if (successContainer && successMessage) {
            let fullMessage = message;

            if (downloadInfo) {
                fullMessage += '\n\n📊 Generation Summary:';
                fullMessage += `\n• Files generated: ${downloadInfo.fileCount || 'Unknown'}`;
                fullMessage += `\n• Total lines: ${downloadInfo.totalLines || 'Unknown'}`;
                fullMessage += `\n• Processing time: ${downloadInfo.processingTime || 'Unknown'}`;
            }

            successMessage.textContent = fullMessage;
            successContainer.style.display = 'block';
        }
    }

    /**
     * Handle cancellation
     */
    cancel() {
        if (!this.isActive) return;

        this.isActive = false;

        if (this.cancelCallback) {
            this.cancelCallback();
        }

        this.updatePhase('Cancelling operation...', 0);
        this.logProgress('❌ Operation cancelled by user');

        setTimeout(() => {
            this.reset();
        }, 1000);
    }

    /**
     * Set cancellation callback
     */
    setCancelCallback(callback) {
        this.cancelCallback = callback;
    }

    /**
     * Reset progress tracker
     */
    reset() {
        this.isActive = false;
        this.startTime = null;
        this.currentPhase = null;
        this.cancelCallback = null;

        if (this.container) {
            this.container.style.display = 'none';
        }

        if (this.fill) {
            this.fill.style.width = '0%';
        }

        if (this.text) {
            this.text.textContent = 'Initializing...';
        }

        // Reset ETA
        const etaElement = this.container?.querySelector('.progress-eta');
        if (etaElement) {
            etaElement.textContent = '';
        }

        // Hide log
        const logElement = this.container?.querySelector('.progress-log');
        if (logElement) {
            logElement.style.display = 'none';
            logElement.innerHTML = '';
        }

        // Hide cancel button
        const cancelButton = this.container?.querySelector('.progress-cancel');
        if (cancelButton) {
            cancelButton.style.display = 'none';
        }
    }

    /**
     * Hide other UI containers
     */
    hideOtherContainers() {
        const containers = [
            'error-container',
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
     * Get current progress data
     */
    getCurrentProgress() {
        return {
            isActive: this.isActive,
            startTime: this.startTime,
            currentPhase: this.currentPhase,
            percentage: parseFloat(this.fill?.style.width) || 0,
            elapsed: this.startTime ? Date.now() - this.startTime : 0
        };
    }

    /**
     * Check if progress is active
     */
    isProgressActive() {
        return this.isActive;
    }
}

export default ProgressTracker;
