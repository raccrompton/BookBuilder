/**
 * =============================================================================
 * DeterministicMode.js - Error handling utilities for predictable behavior
 * =============================================================================
 *
 * PURPOSE:
 * This class provides utilities for handling errors in a "fail-fast" manner.
 * Instead of silently ignoring errors or returning undefined values, these
 * methods throw explicit errors with clear messages.
 *
 * WHY "FAIL-FAST"?
 * In software development, there are two approaches to error handling:
 *
 * 1. FAIL-SILENT: Ignore errors and try to continue
 *    - Pros: App doesn't crash
 *    - Cons: Bugs hide, causing mysterious problems later
 *
 * 2. FAIL-FAST: Throw errors immediately when something goes wrong
 *    - Pros: Bugs are caught early, clear error messages
 *    - Cons: App crashes (but at least you know why!)
 *
 * For development and debugging, fail-fast is usually better because it
 * makes problems obvious and easy to fix. This class implements fail-fast.
 *
 * WHAT IS "DETERMINISTIC"?
 * Deterministic means "the same input always produces the same output."
 * By throwing errors instead of returning random defaults, this class
 * ensures consistent, predictable behavior.
 *
 * DESIGN PATTERN: Static Helper Class
 * All methods are static - you don't create instances of this class.
 * Call methods directly: DeterministicMode.throwOnFailure(condition, message)
 *
 * EXAMPLE USAGE:
 * ```javascript
 * // Assert that a condition is true, throw if not
 * DeterministicMode.throwOnFailure(user !== null, 'User not found');
 *
 * // Validate input with custom validator function
 * DeterministicMode.validateInput(age, 'age', (v) => v > 0 && v < 150);
 * ```
 * =============================================================================
 */
export class DeterministicMode {
    /**
     * =========================================================================
     * Assert a condition and throw if it fails
     * =========================================================================
     *
     * WHAT THIS METHOD DOES:
     * Checks if a condition is true. If not, throws an error with the
     * provided message. This is like an "assert" in other languages.
     *
     * WHEN TO USE:
     * Use this when you expect something to be true and want to fail
     * immediately if it's not. Good for catching programming errors.
     *
     * @param {boolean} condition - Condition to check (true = success, false = failure)
     *   This should be a boolean expression like: (user !== null)
     *
     * @param {string} errorMessage - Error message to throw when condition fails
     *   Make this descriptive so developers know what went wrong
     *
     * @returns {boolean} - Always returns true (only reached if condition passes)
     *
     * @throws {Error} - Throws if condition is false (falsy)
     *
     * @example
     * // Basic usage - assert user exists
     * DeterministicMode.throwOnFailure(user !== null, 'User not found');
     *
     * @example
     * // Checking API response
     * DeterministicMode.throwOnFailure(
     *   response.status === 200,
     *   `API error: status ${response.status}`
     * );
     */
    static throwOnFailure(condition, errorMessage) {
        // If condition is falsy (false, null, undefined, 0, ''), throw error
        // The ! operator converts to boolean and negates: !false = true
        if (!condition) {
            throw new Error(errorMessage);
        }
        // Only reached if condition was truthy - return true to confirm
        return true;
    }

    /**
     * =========================================================================
     * Validate an input value using a custom validator function
     * =========================================================================
     *
     * WHAT THIS METHOD DOES:
     * Takes a value and a validator function, then either returns the value
     * (if valid) or throws an error (if invalid). This is useful for validating
     * function arguments or user input.
     *
     * WHAT IS A VALIDATOR FUNCTION?
     * A validator is a function that takes a value and returns true/false.
     * Examples:
     * - (v) => v > 0          // Positive number
     * - (v) => v !== null     // Not null
     * - (v) => typeof v === 'string' && v.length > 0  // Non-empty string
     *
     * @param {*} value - The value to validate (can be any type)
     *
     * @param {string} valueName - Name of the value for error messages
     *   Example: 'age', 'username', 'config.timeout'
     *
     * @param {function} validator - Function that takes value and returns boolean
     *   Signature: (value) => boolean
     *
     * @returns {*} - Returns the original value if validation passes
     *   This allows chaining: const validAge = validateInput(age, 'age', isPositive);
     *
     * @throws {Error} - If validator returns false
     *
     * @example
     * // Validate age is a positive number under 150
     * const age = DeterministicMode.validateInput(
     *   userAge,
     *   'age',
     *   (v) => typeof v === 'number' && v > 0 && v < 150
     * );
     *
     * @example
     * // Validate required string field
     * const name = DeterministicMode.validateInput(
     *   userName,
     *   'userName',
     *   (v) => typeof v === 'string' && v.trim().length > 0
     * );
     */
    static validateInput(value, valueName, validator) {
        // Call the validator function with the value
        // If it returns false (or any falsy value), the input is invalid
        if (!validator(value)) {
            // Throw error with clear message including the actual value
            // Template literal embeds valueName and value in the message
            throw new Error(`Invalid ${valueName}: ${value}`);
        }
        // Validation passed - return the original value for convenience
        // This allows: const x = validateInput(y, 'y', fn);
        return value;
    }
}
