/**
 * DeterministicMode Configuration
 *
 * Always throws explicit errors instead of silent failures for improved debugging.
 * This ensures predictable, fail-fast behavior throughout the application.
 */
export class DeterministicMode {
    /**
     * Always throw an error when a condition fails
     * @param {boolean} condition - Condition to check (true = success, false = failure)
     * @param {string} errorMessage - Error message to throw when condition fails
     * @returns {boolean} - true if condition passes
     * @throws {Error} - If condition fails
     */
    static throwOnFailure(condition, errorMessage) {
        if (!condition) {
            throw new Error(errorMessage);
        }
        return true;
    }

    /**
     * Validate input and throw descriptive error if invalid
     * @param {*} value - Value to validate
     * @param {string} valueName - Name of the value for error message
     * @param {function} validator - Function that returns true if value is valid
     * @returns {*} - The original value if valid
     * @throws {Error} - If validation fails
     */
    static validateInput(value, valueName, validator) {
        if (!validator(value)) {
            throw new Error(`Invalid ${valueName}: ${value}`);
        }
        return value;
    }
}
