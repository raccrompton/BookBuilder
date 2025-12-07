/**
 * =============================================================================
 * ErrorHandler Unit Tests
 * =============================================================================
 *
 * PURPOSE:
 * Tests the ErrorHandler class, specifically the error reporting features
 * like copying to clipboard and opening email reports.
 *
 * WHAT WE'RE TESTING:
 * - openEmailReport() method: copies error details to clipboard and opens mailto
 * - copyErrorToClipboard() method: formats and copies error details
 * - Error display and formatting
 *
 * MOCKING STRATEGY:
 * Browser APIs like clipboard and location.href don't exist in Node.js,
 * so we mock them to verify our code calls them correctly.
 * =============================================================================
 */

import { describe, it, beforeEach, afterEach, expect, jest } from '@jest/globals';
import ErrorHandler from '../../src/ui/ErrorHandler.js';

/**
 * Set up a minimal DOM environment for ErrorHandler
 *
 * WHY THIS IS NEEDED:
 * ErrorHandler looks for specific DOM elements in its constructor.
 * Without these elements, the class would fail to initialize because
 * document.getElementById() would return null.
 *
 * WHAT IT CREATES:
 * - error-container: The main div that shows/hides when errors occur
 * - error-message: Where the error content HTML gets inserted
 * - progress-container: Hidden by ErrorHandler when showing errors
 * - success-container: Hidden by ErrorHandler when showing errors
 *
 * HOW IT WORKS:
 * Jest uses jsdom to simulate a browser environment. We can set
 * document.body.innerHTML to create any HTML structure we need.
 */
const setupDOMEnvironment = () => {
    // Set the innerHTML of the document body to create our test DOM
    // This replaces any existing content with our test structure
    document.body.innerHTML = `
        <div id="error-container" style="display: none;">
            <div id="error-message"></div>
        </div>
        <div id="progress-container" style="display: none;"></div>
        <div id="success-container" style="display: none;"></div>
    `;
};

/**
 * Extract error ID from the error button's onclick attribute
 *
 * WHY THIS IS NEEDED:
 * When ErrorHandler displays an error, it creates buttons like:
 *   <button onclick="window.errorHandler.openEmailReport('error-1234')">
 * We need to extract that ID ('error-1234') to call the methods directly.
 *
 * HOW IT WORKS:
 * 1. Find the first button in the error-actions container
 * 2. Get its onclick attribute value as a string
 * 3. Use a regex to extract the error-XXXXX pattern
 *
 * @returns {string|null} The error ID like 'error-1234', or null if not found
 */
const extractErrorId = () => {
    // Find the first button in the error actions container
    const button = document.querySelector('.error-actions button');

    // Use optional chaining (?.) to safely access nested properties
    // If button is null, this returns undefined instead of throwing
    const onclickAttr = button?.getAttribute('onclick');

    // Use regex to find the error-XXXXX pattern in the onclick string
    // The regex /error-(\d+)/ captures the timestamp digits
    const errorIdMatch = onclickAttr?.match(/error-(\d+)/);

    // If we found a match, return the full error ID, otherwise null
    return errorIdMatch ? `error-${errorIdMatch[1]}` : null;
};

describe('ErrorHandler', () => {
    // Store original values so we can restore them after tests
    // This prevents tests from affecting each other
    let errorHandler;
    let originalClipboard;
    let originalLocation;

    beforeEach(() => {
        // STEP 1: Set up DOM before each test
        // ErrorHandler needs these elements to exist before it initializes
        setupDOMEnvironment();

        // STEP 2: Save original browser APIs before mocking
        // We'll restore these in afterEach() to prevent test pollution
        originalClipboard = navigator.clipboard;
        originalLocation = window.location;

        // STEP 3: Mock navigator.clipboard
        // WHY: The clipboard API doesn't exist in Node.js/jsdom
        // HOW: Object.defineProperty lets us add/replace properties on built-in objects
        // writeText returns a Promise in real browsers, so mockResolvedValue simulates that
        Object.defineProperty(navigator, 'clipboard', {
            value: {
                // jest.fn() creates a mock function we can spy on later
                // mockResolvedValue(undefined) makes it return a resolved Promise
                writeText: jest.fn().mockResolvedValue(undefined)
            },
            writable: true,     // Allows the property to be changed later
            configurable: true  // Allows the property to be deleted/redefined
        });

        // STEP 4: Mock window.location
        // WHY: In browsers, setting location.href navigates the page
        // We want to capture what URL would be opened without actually navigating
        // HOW: Delete the existing location object and replace with a simple object
        delete window.location;
        window.location = {
            href: '',           // We'll check this to see what mailto URL was opened
            hostname: 'localhost',  // ErrorHandler checks this for debug mode
            search: ''          // URL query string (used for ?debug=true)
        };

        // STEP 5: Create ErrorHandler instance
        // IMPORTANT: This must happen AFTER DOM setup and mocks are in place
        // because the constructor reads from DOM and checks location
        errorHandler = new ErrorHandler();

        // STEP 6: Make errorHandler available globally
        // The real app does this so onclick handlers can call window.errorHandler.method()
        window.errorHandler = errorHandler;
    });

    afterEach(() => {
        // CLEANUP STEP 1: Restore original clipboard API
        // WHY: If we don't restore this, the mock could leak into other test files
        Object.defineProperty(navigator, 'clipboard', {
            value: originalClipboard,
            writable: true,
            configurable: true
        });

        // CLEANUP STEP 2: Remove global errorHandler reference
        // WHY: Prevents the mock instance from being used in other tests
        delete window.errorHandler;

        // CLEANUP STEP 3: Clear all Jest mock call history
        // WHY: Each test should start fresh without seeing calls from previous tests
        // This resets things like mockFn.mock.calls to an empty array
        jest.clearAllMocks();
    });

    describe('openEmailReport', () => {
        /**
         * Test: Verify clipboard is populated before email opens
         *
         * WHY THIS MATTERS:
         * The mailto link only contains instructions to paste. If we don't
         * copy to clipboard first, the user would have nothing to paste.
         */
        it('should copy error details to clipboard before opening email', async () => {
            // ARRANGE: Create a test error with a stack trace
            // In real code, errors come from try/catch blocks with real stack traces
            const testError = new Error('Test error message');
            testError.stack = 'Error: Test error message\n    at test.js:1:1';

            // Display the error in the UI - this stores error details in window object
            // and creates the buttons we'll interact with
            errorHandler.displayError('Test Error Title', testError, ['Try again']);

            // Extract the errorId using our helper function
            // This ID is needed to retrieve the stored error details
            const errorId = extractErrorId();
            expect(errorId).toBeTruthy(); // Verify we found the ID

            // ACT: Call the method we're testing
            errorHandler.openEmailReport(errorId);

            // ASSERT: Verify clipboard was called
            // WHY setTimeout? clipboard.writeText returns a Promise that resolves async
            // We need to give it time to complete before checking the mock
            const ASYNC_DELAY_MS = 10; // Small delay for Promise to resolve
            await new Promise(resolve => setTimeout(resolve, ASYNC_DELAY_MS));

            // Check that writeText was called at least once
            expect(navigator.clipboard.writeText).toHaveBeenCalled();

            // Get the actual text that was passed to writeText
            // mock.calls[0][0] = first call, first argument
            const copiedText = navigator.clipboard.writeText.mock.calls[0][0];

            // Verify the copied text contains the error information
            expect(copiedText).toContain('Test Error Title');
            expect(copiedText).toContain('Test error message');
        });

        /**
         * Test: Verify the mailto URL is correctly formatted
         *
         * WHAT WE'RE CHECKING:
         * - Correct recipient email address
         * - Subject line contains error title
         * - URL is properly encoded (spaces become %20)
         */
        it('should open mailto link with correct recipient and subject', () => {
            // ARRANGE: Create and display an error
            const testError = new Error('Connection failed');
            errorHandler.displayError('API Error', testError);

            // Get the errorId that was generated
            const errorId = extractErrorId();

            // ACT: Open the email report
            errorHandler.openEmailReport(errorId);

            // ASSERT: Check the mailto URL that was set
            // window.location.href now contains the mailto: URL
            expect(window.location.href).toContain('mailto:alex@alexcrompton.com');

            // Check subject parameter exists and contains our error title
            // URL encoding: spaces become %20, so "API Error" becomes "API%20Error"
            expect(window.location.href).toContain('subject=');
            expect(window.location.href).toContain('BookBuilder%20Error%20Report');
            expect(window.location.href).toContain('API%20Error');
        });

        /**
         * Test: Verify email body contains paste instructions
         *
         * WHY INSTRUCTIONS?
         * Since we can't fit the full error in the mailto URL (length limits),
         * we put paste instructions in the body instead.
         */
        it('should include paste instructions in email body', () => {
            // ARRANGE: Create and display an error
            const testError = new Error('Something went wrong');
            errorHandler.displayError('General Error', testError);

            // Get the errorId
            const errorId = extractErrorId();

            // ACT: Open the email report
            errorHandler.openEmailReport(errorId);

            // ASSERT: Check the body parameter contains paste instructions
            // The word "paste" should appear somewhere in the URL-encoded body
            expect(window.location.href).toContain('body=');
            expect(window.location.href).toContain('paste');
        });

        /**
         * Test: Graceful handling when error details are missing
         *
         * WHY THIS EDGE CASE?
         * If JavaScript has a race condition or the error display is cleared,
         * we don't want openEmailReport to crash. It should still open
         * a usable email with "Unknown Error" in the subject.
         */
        it('should handle missing error details gracefully', () => {
            // ARRANGE: Use a fake errorId that doesn't exist in window
            // This simulates a race condition or stale reference
            const fakeErrorId = 'error-nonexistent';

            // ACT & ASSERT: Should not throw an exception
            // expect().not.toThrow() wraps the call and catches any errors
            expect(() => {
                errorHandler.openEmailReport(fakeErrorId);
            }).not.toThrow();

            // ASSERT: Should still open a valid mailto link
            // The subject should say "Unknown Error" as a fallback
            expect(window.location.href).toContain('mailto:alex@alexcrompton.com');
            expect(window.location.href).toContain('Unknown%20Error');
        });
    });

    describe('copyErrorToClipboard', () => {
        /**
         * Test: Verify the clipboard text has all required sections
         *
         * WHAT'S IN THE ERROR REPORT:
         * - Title and timestamp for identification
         * - Error message and stack trace for debugging
         * - Suggestions for user guidance
         * - Environment info (URL, browser) for reproducing issues
         */
        it('should format error details correctly for clipboard', async () => {
            // ARRANGE: Create a detailed error with suggestions
            // This simulates a real database error with troubleshooting tips
            const testError = new Error('Database connection failed');
            testError.stack = 'Error: Database connection failed\n    at db.js:42:10';

            // Display the error with two suggestion strings
            // These appear in the UI as a bulleted list
            errorHandler.displayError('Database Error', testError, [
                'Check your connection',
                'Verify database is running'
            ]);

            // Extract the generated errorId using our helper
            const errorId = extractErrorId();

            // ACT: Copy error details to clipboard
            errorHandler.copyErrorToClipboard(errorId);

            // Wait for the async clipboard operation to complete
            const ASYNC_DELAY_MS = 10;
            await new Promise(resolve => setTimeout(resolve, ASYNC_DELAY_MS));

            // ASSERT: Verify clipboard was called
            expect(navigator.clipboard.writeText).toHaveBeenCalled();

            // Get the actual text that was copied
            const copiedText = navigator.clipboard.writeText.mock.calls[0][0];

            // Verify all sections of the error report are present
            expect(copiedText).toContain('BookBuilder Error Report'); // Header
            expect(copiedText).toContain('Title: Database Error');    // Error title
            expect(copiedText).toContain('Error: Database connection failed'); // Message
            expect(copiedText).toContain('Stack Trace:');             // Stack section
            expect(copiedText).toContain('Suggestions:');             // Suggestions section
            expect(copiedText).toContain('Check your connection');    // First suggestion
            expect(copiedText).toContain('Environment:');             // Environment section
            expect(copiedText).toContain('User Agent:');              // Browser info
        });
    });

    describe('displayError', () => {
        /**
         * Test: Verify the "Report via Email" button is rendered
         *
         * WHY THIS TEST?
         * If the button HTML is wrong, users can't report errors.
         * We verify both that the button exists and has correct onclick.
         */
        it('should render Report via Email button', () => {
            // ARRANGE & ACT: Display an error (these happen in one step)
            const testError = new Error('Test error');
            errorHandler.displayError('Test Title', testError);

            // ASSERT: Find the email button in the DOM
            // querySelectorAll returns all buttons, we filter to find ours
            const buttons = document.querySelectorAll('.error-actions button');

            // Array.from converts NodeList to array so we can use .find()
            const emailButton = Array.from(buttons).find(btn =>
                btn.textContent.includes('Report via Email')
            );

            // Verify the button exists
            expect(emailButton).toBeTruthy();

            // Verify the onclick handler calls the correct method
            expect(emailButton.getAttribute('onclick')).toContain('openEmailReport');
        });

        /**
         * Test: Verify all four action buttons are present
         *
         * EXPECTED BUTTONS:
         * 1. Copy Error Details - copies to clipboard
         * 2. Download Error Log - downloads JSON file
         * 3. Report via Email - opens mailto with instructions
         * 4. Dismiss - hides the error display
         */
        it('should render all action buttons', () => {
            // ARRANGE & ACT: Display an error
            const testError = new Error('Test error');
            errorHandler.displayError('Test Title', testError);

            // ASSERT: Get all button text contents
            // .map extracts just the text, .trim removes whitespace
            const buttonTexts = Array.from(
                document.querySelectorAll('.error-actions button')
            ).map(btn => btn.textContent.trim());

            // Verify each expected button is present
            expect(buttonTexts).toContain('Copy Error Details');
            expect(buttonTexts).toContain('Download Error Log');
            expect(buttonTexts).toContain('Report via Email');
            expect(buttonTexts).toContain('Dismiss');
        });
    });
});
