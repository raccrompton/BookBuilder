/**
 * Format Toggle State Bug Tests
 *
 * This test file specifically targets a stale closure bug where running
 * multiple analyses causes the format toggle to display old analysis data.
 *
 * THE BUG:
 * When you run analysis 1, then analysis 2, and toggle between "Tree" and
 * "Individual" views, the content reverts to analysis 1 instead of showing
 * analysis 2's results.
 *
 * ROOT CAUSE:
 * - Each analysis creates a NEW FileGenerator instance (FormController.js:582)
 * - The first analysis creates toggle buttons with event listeners bound to instance A
 * - The second analysis's setupFormatToggle() sees buttons exist → early returns
 * - Toggle buttons still reference instance A's switchFormat() method
 * - Clicking toggle calls instanceA.switchFormat() which reads instanceA.currentFormats
 * - Result: Old analysis data is displayed instead of new analysis data
 *
 * WHAT THESE TESTS VERIFY:
 * 1. Basic toggle functionality works with a single analysis
 * 2. After running a second analysis, toggle shows the NEW analysis data
 * 3. The stale closure bug is caught when it exists
 */

import FileGenerator from '../src/ui/FileGenerator.js';

// ==================== MOCK BROWSER APIs ====================
// jsdom doesn't implement all browser APIs that FileGenerator uses
// We mock these at the module level so they're available for all tests

/**
 * Mock scrollIntoView - jsdom doesn't implement this
 *
 * scrollIntoView is called after displayPGN to scroll the user's viewport
 * to show the results. In tests, we just need it to not throw.
 */
Element.prototype.scrollIntoView = jest.fn();

/**
 * Mock lucide icons library - used to render icons in toggle buttons
 *
 * The real lucide library scans for <i data-lucide="..."> elements
 * and replaces them with SVG icons. We mock it to be a no-op.
 */
global.lucide = {
    createIcons: jest.fn()
};

// ==================== TEST SETUP HELPERS ====================

/**
 * Create DOM elements needed for FileGenerator's displayPGN method
 *
 * FileGenerator expects these elements to exist in the DOM:
 * - #pgn-display-container: Parent container for the display
 * - #pgn-content: Where PGN text is shown
 * - #pgn-display-stats: Statistics display area
 * - .pgn-display-actions: Container for buttons (toggle, copy, download)
 *
 * This mimics the structure in app.html
 */
const setupDisplayDOM = () => {
    // Set the innerHTML of document.body to create our test DOM structure
    // This is the minimal structure needed for displayPGN and format toggle
    document.body.innerHTML = `
        <div id="pgn-display-container" style="display: none;">
            <div class="pgn-display-header">
                <h3 class="pgn-display-title">Analysis Results</h3>
                <div class="pgn-display-actions">
                    <button id="copy-pgn-btn">Copy</button>
                    <button id="download-pgn-btn">Download</button>
                </div>
            </div>
            <div id="pgn-display-stats"></div>
            <pre id="pgn-content"></pre>
        </div>
    `;
};

/**
 * Create mock format data simulating analysis output
 *
 * Each analysis produces two PGN formats:
 * - individualPGN: Each line as a separate game entry
 * - treePGN: All lines merged with variation parentheses
 *
 * @param {string} identifier - Unique identifier to distinguish analyses
 * @returns {Object} Format object with { individualPGN, treePGN, chapterName }
 */
const createMockFormats = (identifier) => ({
    // Individual format: Each line is its own PGN "game"
    individualPGN: `[Event "Analysis ${identifier} - Individual"]
[White "Test ${identifier}"]
1. e4 e5 *

[Event "Analysis ${identifier} - Line 2"]
1. e4 c5 *`,

    // Tree format: Lines merged with variations in parentheses
    treePGN: `[Event "Analysis ${identifier} - Tree"]
[White "Test ${identifier}"]
1. e4 e5 (1... c5) *`,

    // Chapter name for display header
    chapterName: `Test Chapter ${identifier}`
});

/**
 * Simulate clicking a toggle button
 *
 * In a real browser, clicking dispatches a 'click' event that triggers
 * the event listener. We simulate this with dispatchEvent.
 *
 * @param {string} format - Either 'individual' or 'tree'
 */
const clickToggleButton = (format) => {
    // Find the button by its data-format attribute
    const button = document.querySelector(`[data-format="${format}"]`);

    // If button exists, dispatch a click event
    // The { bubbles: true } allows event to propagate up the DOM tree
    if (button) {
        button.dispatchEvent(new Event('click', { bubbles: true }));
    }
};

/**
 * Get the currently displayed PGN content from the DOM
 *
 * @returns {string} The text content of the PGN display element
 */
const getDisplayedContent = () => {
    // Get the pre element where PGN content is displayed
    const pgnContent = document.getElementById('pgn-content');
    return pgnContent ? pgnContent.textContent : '';
};

// ==================== TEST SUITES ====================

describe('Format Toggle State Management', () => {
    // Run before each test to set up a clean DOM environment
    beforeEach(() => {
        setupDisplayDOM();
    });

    // Clean up after each test
    afterEach(() => {
        document.body.innerHTML = '';
    });

    // ---------- BASELINE TESTS ----------
    // These verify basic toggle functionality works at all

    describe('Single Analysis Toggle', () => {
        /**
         * Baseline test: displayPGN should show tree format by default
         *
         * When displayPGN receives a format object, it should:
         * 1. Store both formats in currentFormats
         * 2. Set currentFormat to 'tree' (the default)
         * 3. Display the treePGN content
         */
        it('should display tree format by default when given format object', () => {
            // ARRANGE: Create instance and mock data
            const fileGenerator = new FileGenerator();
            const formats = createMockFormats('First');

            // ACT: Display the PGN
            fileGenerator.displayPGN(formats, 'Test Chapter');

            // ASSERT: Tree format should be displayed (it's the default)
            const displayed = getDisplayedContent();
            expect(displayed).toContain('Analysis First - Tree');
            expect(displayed).not.toContain('Analysis First - Individual');
        });

        /**
         * Test that clicking "Individual" button switches the view
         *
         * After displayPGN creates the toggle buttons, clicking "Individual"
         * should update the displayed content to show the individual format.
         */
        it('should switch to individual format when individual button clicked', () => {
            // ARRANGE: Set up display with format data
            const fileGenerator = new FileGenerator();
            const formats = createMockFormats('First');
            fileGenerator.displayPGN(formats, 'Test Chapter');

            // ACT: Click the individual toggle button
            clickToggleButton('individual');

            // ASSERT: Individual format should now be displayed
            const displayed = getDisplayedContent();
            expect(displayed).toContain('Analysis First - Individual');
            expect(displayed).not.toContain('Analysis First - Tree');
        });

        /**
         * Test switching back to tree format
         *
         * After switching to individual, clicking "Tree" should
         * switch back to the tree format.
         */
        it('should switch back to tree format when tree button clicked', () => {
            // ARRANGE: Set up and switch to individual first
            const fileGenerator = new FileGenerator();
            const formats = createMockFormats('First');
            fileGenerator.displayPGN(formats, 'Test Chapter');
            clickToggleButton('individual');

            // ACT: Click tree button to switch back
            clickToggleButton('tree');

            // ASSERT: Tree format should be displayed again
            const displayed = getDisplayedContent();
            expect(displayed).toContain('Analysis First - Tree');
        });
    });

    // ---------- STALE CLOSURE BUG TESTS ----------
    // These are the critical tests that catch the bug

    describe('Multiple Analysis Toggle (Stale Closure Bug)', () => {
        /**
         * CRITICAL TEST: Second analysis should be visible after toggle
         *
         * This test reproduces the exact bug scenario:
         * 1. Run first analysis (creates buttons bound to instance A)
         * 2. Run second analysis (instance B, but buttons still bound to A)
         * 3. Toggle between formats
         * 4. EXPECTED: See second analysis data
         * 5. BUG: See first analysis data instead
         *
         * The bug occurs because:
         * - Instance A creates event listeners: () => instanceA.switchFormat()
         * - Instance B's setupFormatToggle early-returns (buttons exist)
         * - Clicking calls instanceA.switchFormat() → reads instanceA.currentFormats
         */
        it('should display second analysis data after running two analyses and toggling', () => {
            // ARRANGE: Simulate running TWO analyses with different FileGenerator instances
            // (This is what FormController does - new FileGenerator each time)
            const firstFormats = createMockFormats('FIRST');
            const secondFormats = createMockFormats('SECOND');

            // First analysis - creates the toggle buttons with listeners bound to this instance
            const firstGenerator = new FileGenerator();
            firstGenerator.displayPGN(firstFormats, 'First Chapter');

            // Second analysis - new instance, but buttons already exist in DOM
            const secondGenerator = new FileGenerator();
            secondGenerator.displayPGN(secondFormats, 'Second Chapter');

            // After second analysis, tree format of SECOND should be shown
            expect(getDisplayedContent()).toContain('Analysis SECOND - Tree');

            // ACT: Toggle to individual format
            clickToggleButton('individual');

            // ASSERT: Should show SECOND analysis individual format, NOT FIRST
            const displayedAfterToggle = getDisplayedContent();

            // This assertion catches the stale closure bug:
            // If bug exists: displayedAfterToggle contains "FIRST" (wrong!)
            // If fixed: displayedAfterToggle contains "SECOND" (correct!)
            expect(displayedAfterToggle).toContain('Analysis SECOND - Individual');
            expect(displayedAfterToggle).not.toContain('FIRST');
        });

        /**
         * Test toggling back and forth after multiple analyses
         *
         * More thorough test of the toggle state after multiple analyses
         */
        it('should maintain correct state through multiple toggles after second analysis', () => {
            // ARRANGE: Two analyses
            const firstFormats = createMockFormats('OLD');
            const secondFormats = createMockFormats('NEW');

            const firstGenerator = new FileGenerator();
            firstGenerator.displayPGN(firstFormats, 'Old Chapter');

            const secondGenerator = new FileGenerator();
            secondGenerator.displayPGN(secondFormats, 'New Chapter');

            // ACT & ASSERT: Toggle multiple times, always showing NEW analysis
            clickToggleButton('individual');
            expect(getDisplayedContent()).toContain('NEW');
            expect(getDisplayedContent()).not.toContain('OLD');

            clickToggleButton('tree');
            expect(getDisplayedContent()).toContain('NEW');
            expect(getDisplayedContent()).not.toContain('OLD');

            clickToggleButton('individual');
            expect(getDisplayedContent()).toContain('NEW');
            expect(getDisplayedContent()).not.toContain('OLD');
        });

        /**
         * Test three consecutive analyses
         *
         * Ensures the bug doesn't manifest in chains of analyses
         */
        it('should always show most recent analysis after three analyses', () => {
            // ARRANGE: Three consecutive analyses
            const analysisA = createMockFormats('ANALYSIS_A');
            const analysisB = createMockFormats('ANALYSIS_B');
            const analysisC = createMockFormats('ANALYSIS_C');

            // Run three analyses (each creates new FileGenerator like FormController does)
            new FileGenerator().displayPGN(analysisA, 'A');
            new FileGenerator().displayPGN(analysisB, 'B');
            new FileGenerator().displayPGN(analysisC, 'C');

            // ASSERT: Initial view should show C's tree format
            expect(getDisplayedContent()).toContain('ANALYSIS_C - Tree');

            // ACT: Toggle to individual
            clickToggleButton('individual');

            // ASSERT: Should show C's individual format (not A or B)
            const displayed = getDisplayedContent();
            expect(displayed).toContain('ANALYSIS_C - Individual');
            expect(displayed).not.toContain('ANALYSIS_A');
            expect(displayed).not.toContain('ANALYSIS_B');
        });
    });

    // ---------- EDGE CASE TESTS ----------

    describe('Edge Cases', () => {
        /**
         * Test that getCurrentContent returns correct format after multiple analyses
         *
         * getCurrentContent is used by copy/download buttons
         */
        it('should return second analysis content from getCurrentContent after toggle', () => {
            // ARRANGE
            const firstFormats = createMockFormats('OLD');
            const secondFormats = createMockFormats('NEW');

            const firstGen = new FileGenerator();
            firstGen.displayPGN(firstFormats, 'Old');

            const secondGen = new FileGenerator();
            secondGen.displayPGN(secondFormats, 'New');

            // Toggle to individual
            clickToggleButton('individual');

            // ACT: Get content that would be copied/downloaded
            // NOTE: This tests the instance that should be "active"
            const content = secondGen.getCurrentContent();

            // ASSERT: Should be NEW analysis individual format
            expect(content).toContain('NEW');
            expect(content).not.toContain('OLD');
        });

        /**
         * Test clicking the same format button multiple times
         *
         * Should be a no-op, shouldn't break state
         */
        it('should handle repeated clicks on same format button', () => {
            // ARRANGE
            const formats = createMockFormats('Test');
            const generator = new FileGenerator();
            generator.displayPGN(formats, 'Test');

            // ACT: Click tree button multiple times (it's already on tree)
            clickToggleButton('tree');
            clickToggleButton('tree');
            clickToggleButton('tree');

            // ASSERT: Should still show tree format
            expect(getDisplayedContent()).toContain('Test - Tree');
        });

        /**
         * Test that button active states update correctly
         *
         * The currently selected format's button should have 'active' class
         */
        it('should update button active states on toggle', () => {
            // ARRANGE
            const formats = createMockFormats('Test');
            const generator = new FileGenerator();
            generator.displayPGN(formats, 'Test');

            // ASSERT: Tree button should be active initially
            const treeBtn = document.querySelector('[data-format="tree"]');
            const individualBtn = document.querySelector('[data-format="individual"]');

            expect(treeBtn.classList.contains('active')).toBe(true);
            expect(individualBtn.classList.contains('active')).toBe(false);

            // ACT: Switch to individual
            clickToggleButton('individual');

            // ASSERT: Individual button should now be active
            expect(treeBtn.classList.contains('active')).toBe(false);
            expect(individualBtn.classList.contains('active')).toBe(true);
        });
    });
});

// ==================== REGRESSION TESTS ====================

describe('Format Toggle Regression Tests', () => {
    beforeEach(() => {
        setupDisplayDOM();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    /**
     * Regression test: Ensure old listeners are removed or updated
     *
     * This tests the specific fix: when a new analysis runs,
     * the toggle should use the NEW instance's data, not the old one's.
     */
    it('should not retain stale event listeners from previous analysis', () => {
        // ARRANGE: Track which instance's switchFormat is called
        const callLog = [];

        // First analysis
        const firstGen = new FileGenerator();
        const originalSwitch1 = firstGen.switchFormat.bind(firstGen);
        firstGen.switchFormat = (format) => {
            callLog.push({ instance: 'first', format });
            return originalSwitch1(format);
        };
        firstGen.displayPGN(createMockFormats('FIRST'), 'First');

        // Second analysis
        const secondGen = new FileGenerator();
        const originalSwitch2 = secondGen.switchFormat.bind(secondGen);
        secondGen.switchFormat = (format) => {
            callLog.push({ instance: 'second', format });
            return originalSwitch2(format);
        };
        secondGen.displayPGN(createMockFormats('SECOND'), 'Second');

        // ACT: Click toggle
        clickToggleButton('individual');

        // ASSERT: The click should invoke the SECOND instance's method
        // If bug exists, it will call 'first' instance instead
        const individualCalls = callLog.filter(c => c.format === 'individual');

        // At least one call should be to the second instance
        // (The bug would show only 'first' instance being called)
        expect(individualCalls.some(c => c.instance === 'second')).toBe(true);
    });

    /**
     * Test that displayPGN updates the DOM content, not just internal state
     *
     * After second analysis, the DOM should show second analysis data
     * BEFORE any toggle occurs.
     */
    it('should update DOM content when second analysis runs', () => {
        // ARRANGE: First analysis
        new FileGenerator().displayPGN(createMockFormats('FIRST'), 'First');

        // ASSERT: First analysis shown
        expect(getDisplayedContent()).toContain('FIRST');

        // ACT: Second analysis
        new FileGenerator().displayPGN(createMockFormats('SECOND'), 'Second');

        // ASSERT: DOM should now show second analysis (before any toggle)
        expect(getDisplayedContent()).toContain('SECOND');
        expect(getDisplayedContent()).not.toContain('FIRST');
    });
});
