/**
 * =============================================================================
 * Logger.js - Configurable logging system with category-based filtering
 * =============================================================================
 *
 * PURPOSE:
 * Provides a centralized logging system that allows toggling console output
 * on/off for different categories. This helps developers focus on specific
 * areas of the code without being overwhelmed by logs from other components.
 *
 * HOW IT WORKS:
 * 1. Each component uses a named logger: Logger.get('ChessEngine')
 * 2. The logger has the same API as console (log, warn, error, info, debug)
 * 3. Categories can be enabled/disabled individually or all at once
 * 4. Settings persist in localStorage so they survive page refreshes
 *
 * USAGE:
 * ```javascript
 * import Logger from './utils/Logger.js';
 * const log = Logger.get('MoveSelector');
 *
 * log.log('Starting analysis...');     // Only shows if 'MoveSelector' enabled
 * log.error('Something broke!');       // Errors always show by default
 * ```
 *
 * CONFIGURATION (in browser console):
 * ```javascript
 * Logger.setEnabled('ChessEngine', false);  // Disable one category
 * Logger.setAllEnabled(false);              // Disable all categories
 * Logger.setLevel('warn');                  // Only show warn and error
 * Logger.getConfig();                       // See current settings
 * Logger.reset();                           // Reset to defaults
 * ```
 *
 * =============================================================================
 */

// -----------------------------------------------------------------------------
// DEFAULT CATEGORY SETTINGS
// -----------------------------------------------------------------------------
// Set to `true` to enable logging for that category by default.
// Users can override via Logger.setEnabled() or localStorage persists changes.
// -----------------------------------------------------------------------------

const DEFAULT_CATEGORIES = {
    // === Core Algorithm ===
    MoveSelector: true,       // Move selection, statistical analysis
    Statistics: true,         // Data quality validation

    // === Chess Engines ===
    ChessEngine: true,        // chess.js operations, FEN, moves
    StockfishEngine: true,    // Stockfish analysis

    // === API & Network ===
    LichessClient: true,      // Lichess API calls

    // === PGN Processing ===
    PgnTreeMerger: true,      // PGN variation merging
    PgnGenerator: true,       // PGN output formatting
    PgnProcessor: true,       // PGN input parsing

    // === UI & Workflow ===
    FormController: true,     // Form handling, UI updates
    FileGenerator: true,      // File generation
    BookBuilder: true,        // Main workflow

    // === Debug ===
    DEBUG: true,              // General debug output
};

// -----------------------------------------------------------------------------
// LOG LEVELS - Lower number = higher priority
// -----------------------------------------------------------------------------

const LOG_LEVELS = {
    error: 0,   // Always show errors
    warn: 1,    // Warnings
    info: 2,    // Informational
    log: 3,     // Standard logging
    debug: 4,   // Verbose debugging
};

// localStorage key for persisting settings
const STORAGE_KEY = 'bookbuilder_logger_config';

// -----------------------------------------------------------------------------
// LoggerManager Class
// -----------------------------------------------------------------------------

class LoggerManager {
    constructor() {
        // Copy defaults (spread operator creates shallow copy)
        this.categories = { ...DEFAULT_CATEGORIES };

        // Master switch - false disables ALL logging except errors
        this.masterEnabled = true;

        // Minimum level to show (default: show everything except debug)
        this.level = 'log';

        // UI element reference for broadcasting logs to the progress overlay
        // When set, the latest log message will be displayed in this DOM element
        this.uiElementId = null;

        // Load saved preferences
        this._loadConfig();
    }

    /**
     * Get a logger instance for a specific category
     *
     * @param {string} category - Category name (e.g., 'MoveSelector')
     * @returns {Object} Logger object with log, warn, error, info, debug methods
     *
     * @example
     * const log = Logger.get('ChessEngine');
     * log.log('Parsing FEN:', fen);
     */
    get(category) {
        return {
            log: (...args) => this._emit(category, 'log', args),
            warn: (...args) => this._emit(category, 'warn', args),
            error: (...args) => this._emit(category, 'error', args),
            info: (...args) => this._emit(category, 'info', args),
            debug: (...args) => this._emit(category, 'debug', args),
            group: (...args) => this._emitGroup(category, 'group', args),
            groupCollapsed: (...args) => this._emitGroup(category, 'groupCollapsed', args),
            groupEnd: () => this._emitGroup(category, 'groupEnd', []),
        };
    }

    /**
     * Internal: Emit a log message after checking all filters
     * @private
     */
    _emit(category, level, args) {
        // Always broadcast to UI if element is set (regardless of category filtering)
        // This ensures the progress overlay shows all activity, even from disabled categories
        this._broadcastToUI(args);

        // Check 1: Master switch (errors bypass)
        if (!this.masterEnabled && level !== 'error') {
            return;
        }

        // Check 2: Log level threshold
        const levelValue = LOG_LEVELS[level] ?? LOG_LEVELS.log;
        const thresholdValue = LOG_LEVELS[this.level] ?? LOG_LEVELS.log;
        if (levelValue > thresholdValue) {
            return;
        }

        // Check 3: Category enabled (errors/warnings bypass)
        const categoryEnabled = this.categories[category] ?? true;
        const isCritical = level === 'error' || level === 'warn';

        if (!categoryEnabled && !isCritical) {
            return;
        }

        // All checks passed - emit with category prefix
        const prefix = `[${category}]`;
        console[level](prefix, ...args);
    }

    /**
     * Internal: Handle console.group operations
     * @private
     */
    _emitGroup(category, method, args) {
        if (!this.masterEnabled) return;
        if (!(this.categories[category] ?? true)) return;

        if (args.length > 0) {
            console[method](`[${category}]`, ...args);
        } else {
            console[method]();
        }
    }

    // -------------------------------------------------------------------------
    // Configuration Methods
    // -------------------------------------------------------------------------

    /**
     * Enable or disable a specific category
     * @param {string} category - Category name
     * @param {boolean} enabled - true to enable, false to disable
     */
    setEnabled(category, enabled) {
        this.categories[category] = Boolean(enabled);
        this._saveConfig();
        console.info(`[Logger] ${category} ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Enable or disable ALL categories at once
     * @param {boolean} enabled - true for verbose, false for quiet
     */
    setAllEnabled(enabled) {
        const value = Boolean(enabled);
        for (const key of Object.keys(this.categories)) {
            this.categories[key] = value;
        }
        this._saveConfig();
        console.info(`[Logger] All categories ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Set the master switch (controls all logging globally)
     * @param {boolean} enabled - Master enable/disable
     */
    setMasterEnabled(enabled) {
        this.masterEnabled = Boolean(enabled);
        this._saveConfig();
        console.info(`[Logger] Master switch ${enabled ? 'ON' : 'OFF'}`);
    }

    /**
     * Set minimum log level to display
     * @param {string} level - 'error', 'warn', 'info', 'log', or 'debug'
     */
    setLevel(level) {
        if (LOG_LEVELS[level] !== undefined) {
            this.level = level;
            this._saveConfig();
            console.info(`[Logger] Level set to '${level}'`);
        } else {
            console.error(`[Logger] Invalid level: ${level}. Use: error, warn, info, log, debug`);
        }
    }

    /**
     * Get current configuration
     * @returns {Object} Current settings
     */
    getConfig() {
        return {
            masterEnabled: this.masterEnabled,
            level: this.level,
            categories: { ...this.categories },
        };
    }

    /**
     * Reset all settings to defaults
     */
    reset() {
        this.categories = { ...DEFAULT_CATEGORIES };
        this.masterEnabled = true;
        this.level = 'log';
        this._saveConfig();
        console.info('[Logger] Reset to defaults');
    }

    /**
     * Get list of all category names
     * @returns {string[]} Category names
     */
    getCategories() {
        return Object.keys(this.categories);
    }

    /**
     * Set a DOM element ID to receive the latest log messages.
     * Used to display real-time logging in the progress overlay during generation.
     *
     * @param {string|null} elementId - Element ID to update, or null to disable
     *
     * @example
     * // Enable UI broadcasting to progress overlay
     * Logger.setUIElement('progress-log');
     *
     * // Disable when done
     * Logger.setUIElement(null);
     */
    setUIElement(elementId) {
        this.uiElementId = elementId;
    }

    /**
     * Update the UI element with the latest log message.
     * Called automatically by _emit() when uiElementId is set.
     *
     * @param {Array} args - The arguments passed to the log call
     * @private
     */
    _broadcastToUI(args) {
        // Skip if no UI element is configured
        if (!this.uiElementId) return;

        // Find the DOM element by ID
        const element = document.getElementById(this.uiElementId);
        if (!element) return;

        // Format the message - convert all args to strings and join
        // Objects are JSON-stringified for readability
        const message = args.map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');

        // Truncate long messages to prevent overflow in the UI
        // 100 chars is enough to show meaningful info without breaking layout
        const displayMessage = message.length > 100
            ? message.substring(0, 97) + '...'
            : message;

        // Display the message directly - log calls often already include context
        element.textContent = displayMessage;
    }

    // -------------------------------------------------------------------------
    // Persistence
    // -------------------------------------------------------------------------

    /** @private */
    _saveConfig() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                masterEnabled: this.masterEnabled,
                level: this.level,
                categories: this.categories,
            }));
        } catch (e) {
            // localStorage unavailable - fail silently
        }
    }

    /** @private */
    _loadConfig() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const config = JSON.parse(saved);
                if (config.categories) {
                    this.categories = { ...DEFAULT_CATEGORIES, ...config.categories };
                }
                if (config.masterEnabled !== undefined) {
                    this.masterEnabled = config.masterEnabled;
                }
                if (config.level && LOG_LEVELS[config.level] !== undefined) {
                    this.level = config.level;
                }
            }
        } catch (e) {
            // Parse failed - use defaults
        }
    }
}

// -----------------------------------------------------------------------------
// Export singleton instance
// -----------------------------------------------------------------------------

const Logger = new LoggerManager();

// Expose on window for browser console access
if (typeof window !== 'undefined') {
    window.Logger = Logger;
}

export default Logger;
