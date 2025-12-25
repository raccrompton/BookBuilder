/**
 * =============================================================================
 * ConfigManager.js - Browser storage for form settings
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
 *
 * DEPENDENCIES:
 * - PgnProcessor.js - For validating PGN input
 * - Logger.js - For debug logging
 * =============================================================================
 */

import PgnProcessor from '../utils/PgnProcessor.js';
import Logger from '../utils/Logger.js';

const log = Logger.get('ConfigManager');

/**
 * ConfigManager Class - Manages form configuration persistence
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
                const parsed = JSON.parse(saved);

                // Validate the parsed config before using it
                // This protects against malicious/corrupted data in storage
                if (this._isValidConfigObject(parsed)) {
                    this.config = this._sanitizeConfig(parsed);
                    // Fill in the form with saved values
                    this.populateForm();
                } else {
                    log.warn('Invalid config structure in storage, ignoring');
                    sessionStorage.removeItem('bookbuilder-config');
                }
            } catch (e) {
                // If parsing fails, just log it and continue with empty config
                log.warn('Failed to load saved configuration:', e);
                sessionStorage.removeItem('bookbuilder-config');
            }
        }
    }

    /**
     * Validate that a parsed config object has the expected structure
     * Protects against malicious or corrupted data in browser storage
     *
     * @param {*} config - Value parsed from JSON
     * @returns {boolean} - True if config appears valid
     * @private
     */
    _isValidConfigObject(config) {
        // Must be a plain object (not null, array, or primitive)
        if (!config || typeof config !== 'object' || Array.isArray(config)) {
            return false;
        }

        // Check for prototype pollution attempts
        // These keys should never appear in a legitimate config
        const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
        for (const key of dangerousKeys) {
            if (key in config) {
                log.warn(`Suspicious key "${key}" found in config, rejecting`);
                return false;
            }
        }

        // Config size sanity check (prevent DoS via huge configs)
        const keys = Object.keys(config);
        if (keys.length > 100) {
            log.warn('Config has too many keys, rejecting');
            return false;
        }

        return true;
    }

    /**
     * Sanitize config values to ensure they're safe to use
     * Removes any keys with unexpected types or values
     *
     * @param {Object} config - Config object to sanitize
     * @returns {Object} - Sanitized config object
     * @private
     */
    _sanitizeConfig(config) {
        const sanitized = {};

        for (const [key, value] of Object.entries(config)) {
            // Only allow string keys with alphanumeric/hyphen characters
            if (!/^[a-zA-Z0-9-]+$/.test(key)) {
                continue;
            }

            // Only allow primitive values (string, number, boolean)
            // Nested objects could hide malicious content
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                // String length limit to prevent memory issues
                if (typeof value === 'string' && value.length > 10000) {
                    continue;
                }
                sanitized[key] = value;
            }
        }

        return sanitized;
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

export default ConfigManager;
