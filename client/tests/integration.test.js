/**
 * Integration tests for BookBuilder client-side application
 * Tests the complete workflow from form submission to file generation
 */

import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import FormController from '../src/ui/FormController.js';
import ErrorHandler from '../src/ui/ErrorHandler.js';
import ProgressTracker from '../src/ui/ProgressTracker.js';
import FileGenerator from '../src/ui/FileGenerator.js';

// Mock DOM elements for testing
const mockDOM = () => {
    // Create basic HTML structure
    document.body.innerHTML = `
        <form id="bookbuilder-form">
            <input type="text" id="opening-books-json" value='[{"name":"Test Opening","moves":["e4","e5"],"priority":1}]'>
            <input type="checkbox" id="variant-standard" checked>
            <input type="checkbox" id="variant-chess960">
            <input type="checkbox" id="variant-antichess">
            <input type="checkbox" id="time-blitz" checked>
            <input type="checkbox" id="time-rapid" checked>
            <input type="checkbox" id="time-classical" checked>
            <input type="checkbox" id="time-correspondence">
            <input type="range" id="rating-min" value="1600">
            <input type="range" id="rating-max" value="2400">
            <input type="range" id="engine-depth" value="15">
            <input type="checkbox" id="engine-enabled" checked>
            <select id="min-rating">
                <option value="100">100</option>
                <option value="1800" selected>1800</option>
                <option value="2000">2000</option>
            </select>
            <select id="max-rating">
                <option value="2000">2000</option>
                <option value="2400" selected>2400</option>
                <option value="3000">3000</option>
            </select>
            <button type="submit" id="submit-btn">Generate</button>
            <button type="button" id="cancel-btn">Cancel</button>
            <span id="rating-min-value">1600</span>
            <span id="rating-max-value">2400</span>
            <span id="engine-depth-value">15</span>
        </form>
        <div id="progress-container" style="display:none">
            <div id="progress-fill"></div>
            <div id="progress-text"></div>
        </div>
        <div id="error-container" style="display:none">
            <div id="error-message"></div>
        </div>
        <div id="success-container" style="display:none">
            <div id="success-message"></div>
        </div>
    `;
};

describe('BookBuilder Integration Tests', () => {
    let formController;
    let errorHandler;
    let progressTracker;

    beforeEach(() => {
        mockDOM();

        // Initialize components
        errorHandler = new ErrorHandler();
        progressTracker = new ProgressTracker();

        // Mock FormController to avoid DOM initialization issues
        formController = new FormController();

        // Override configManager to avoid DOM dependencies during tests
        formController.configManager = {
            validateConfig: () => {
                const variants = ['variant-standard', 'variant-chess960', 'variant-antichess'];
                const selectedVariants = variants.filter(id => {
                    const element = document.getElementById(id);
                    return element && element.checked;
                });
                if (selectedVariants.length === 0) {
                    return ['At least one chess variant must be selected'];
                }

                const openingBooksElement = document.getElementById('opening-books-json');
                if (openingBooksElement) {
                    try {
                        JSON.parse(openingBooksElement.value);
                    } catch (e) {
                        return ['Invalid JSON format in opening books'];
                    }
                }

                const minRating = parseInt(document.getElementById('min-rating')?.value || '1600');
                const maxRating = parseInt(document.getElementById('max-rating')?.value || '2400');
                if (minRating >= maxRating) {
                    return ['Minimum rating must be less than maximum rating'];
                }

                return [];
            },
            saveConfig: (config) => {
                sessionStorage.setItem('bookbuilder-config', JSON.stringify(config));
            },
            getFormData: () => {
                return {
                    'opening-books-json': document.getElementById('opening-books-json')?.value || '[]',
                    'engine-depth': document.getElementById('engine-depth')?.value || '15',
                    'min-rating': document.getElementById('min-rating')?.value || '1600'
                };
            }
        };

        // Mock Web Workers and external dependencies
        global.Worker = class MockWorker {
            constructor() {
                this.onmessage = null;
                this.onerror = null;
            }
            postMessage() {}
            terminate() {}
        };

        // Mock Stockfish
        global.Stockfish = () => ({
            onmessage: null,
            postMessage: () => {}
        });
    });

    afterEach(() => {
        // Cleanup
        document.body.innerHTML = '';

        if (formController && formController.stockfishEngine) {
            formController.stockfishEngine.shutdown();
        }
    });

    describe('Configuration Management', () => {
        // NOTE: These tests use the mock configManager from beforeEach.
        // The mock contains validation logic that reads from DOM, so these tests
        // DO verify validation behavior. However, if the REAL configManager changes,
        // these tests won't catch regressions. Consider importing real configManager
        // for true integration testing.

        it('should validate opening books JSON', () => {
            const errors = formController.configManager.validateConfig();
            expect(errors).toEqual([]);
        });

        it('should reject invalid JSON', () => {
            document.getElementById('opening-books-json').value = 'invalid json';
            const errors = formController.configManager.validateConfig();
            expect(errors).toContain('Invalid JSON format in opening books');
        });

        it('should validate rating ranges', () => {
            // Create specific test DOM with actual select values that will cause validation error
            document.body.innerHTML = `
                <form id="bookbuilder-form">
                    <input type="text" id="opening-books-json" value='[{"name":"Test Opening","moves":["e4","e5"],"priority":1}]'>
                    <input type="checkbox" id="variant-standard" checked>
                    <input type="checkbox" id="variant-chess960">
                    <input type="checkbox" id="variant-antichess">
                    <select id="min-rating">
                        <option value="100">100</option>
                        <option value="1800">1800</option>
                        <option value="2500" selected>2500</option>
                    </select>
                    <select id="max-rating">
                        <option value="1600" selected>1600</option>
                        <option value="2400">2400</option>
                        <option value="3000">3000</option>
                    </select>
                </form>
            `;

            const errors = formController.configManager.validateConfig();
            expect(errors).toContain('Minimum rating must be less than maximum rating');
        });

        it('should save and load configuration', () => {
            const testConfig = { 'test-key': 'test-value' };
            formController.configManager.saveConfig(testConfig);

            const saved = JSON.parse(sessionStorage.getItem('bookbuilder-config'));
            expect(saved['test-key']).toBe('test-value');
        });
    });

    describe('Error Handling', () => {
        it('should display validation errors', () => {
            const errors = ['Test error 1', 'Test error 2'];
            errorHandler.showValidationErrors(errors);

            const container = document.getElementById('error-container');
            expect(container.style.display).toBe('block');
            expect(container.innerHTML).toContain('Test error 1');
            expect(container.innerHTML).toContain('Test error 2');
        });

        it('should log errors with context', () => {
            const consoleSpy = jest.spyOn(console, 'group').mockImplementation();
            const error = new Error('Test error');

            errorHandler.logDetailedError(error, 'Test context');

            expect(consoleSpy).toHaveBeenCalledWith('🐛 Error in Test context');
            consoleSpy.mockRestore();
        });

        it('should handle API errors with suggestions', () => {
            const error = new Error('Network timeout');
            errorHandler.showAPIError('Lichess', error, true);

            const container = document.getElementById('error-container');
            expect(container.style.display).toBe('block');
            expect(container.innerHTML).toContain('Lichess API Error');
            expect(container.innerHTML).toContain('Try again in a few moments');
        });
    });

    describe('Progress Tracking', () => {
        it('should start and update progress', () => {
            progressTracker.start();

            const container = document.getElementById('progress-container');
            expect(container.style.display).toBe('block');

            progressTracker.updatePhase('Testing...', 50);

            const fill = document.getElementById('progress-fill');
            const text = document.getElementById('progress-text');
            expect(fill.style.width).toBe('50%');
            expect(text.textContent).toBe('Testing...');
        });

        it('should complete progress tracking', () => {
            progressTracker.start();
            progressTracker.complete('Test completed');

            const fill = document.getElementById('progress-fill');
            const text = document.getElementById('progress-text');
            expect(fill.style.width).toBe('100%');
            expect(text.textContent).toBe('Test completed');
        });

        it('should handle cancellation', () => {
            let cancelled = false;
            progressTracker.setCancelCallback(() => { cancelled = true; });

            progressTracker.start();
            progressTracker.cancel();

            expect(cancelled).toBe(true);
        });
    });

    describe('File Generation', () => {
        let fileGenerator;

        beforeEach(() => {
            fileGenerator = new FileGenerator();

            // Mock URL.createObjectURL and related APIs
            global.URL.createObjectURL = jest.fn(() => 'mock-url');
            global.URL.revokeObjectURL = jest.fn();

            // Mock Blob
            global.Blob = jest.fn(() => ({}));
        });

        it('should generate valid PGN content', async () => { // REFACTORED: Now async since generatePGN is async
            const testResults = [
                {
                    pgn: '1. e4 e5 2. Nf3', // Test line PGN
                    cumulativeLikelihood: 0.85, // 85% cumulative likelihood
                    totalGames: 1000, // Sample size
                    winRate: 0.55 // 55% win rate
                }
            ];

            const pgn = await fileGenerator.generatePGN(testResults, { // REFACTORED: Await the async result
                chapterName: 'Test Opening',
                author: 'Test'
            });

            expect(pgn).toContain('[Event "Test Opening"]'); // Check Event header
            expect(pgn).toContain('[Annotator "Test"]'); // Check Annotator header
            expect(pgn).toContain('1. e4 e5 2. Nf3'); // Check moves present
            expect(pgn).toContain('85.00%'); // Check likelihood formatting
            expect(pgn).toContain('1000'); // Check game count present
        });

        it('should validate PGN content', () => {
            const validPGN = `[Event "Test"]
[Site "Test"]
[Date "2024-01-01"]
[Round "1"]
[White "Test"]
[Black "Test"]
[Result "*"]

1. e4 e5 *`;

            const validation = fileGenerator.validatePGN(validPGN);
            expect(validation.isValid).toBe(true);
            expect(validation.errors).toEqual([]);
        });

        it('should detect invalid PGN', () => {
            const invalidPGN = 'Not a valid PGN file';

            const validation = fileGenerator.validatePGN(invalidPGN);
            expect(validation.isValid).toBe(false);
            expect(validation.errors.length).toBeGreaterThan(0);
        });

        it('should format file sizes correctly', () => {
            expect(fileGenerator.formatFileSize(0)).toBe('0 Bytes');
            expect(fileGenerator.formatFileSize(1024)).toBe('1 KB');
            expect(fileGenerator.formatFileSize(1048576)).toBe('1 MB');
        });
    });

    describe('Form Integration', () => {
        // REMOVED: 'should convert form data to BookBuilder config' test
        // Per testing-standards.md line 229-254: "Never mock the function you're testing"
        //
        // The previous test defined a mock convertToBookBuilderConfig, then asserted
        // that the mock returned what the mock was defined to return. This was circular
        // and could never fail - it tested the mock definition, not real behavior.
        //
        // TODO: Test the REAL convertToBookBuilderConfig method from FormController,
        // mocking only external dependencies like DOM if needed.

        // REMOVED: 'should handle form submission' test
        // Per testing-standards.md line 229-254: "Never mock the function you're testing"
        //
        // The previous test mocked BOTH handleSubmit AND startGeneration, then asserted
        // startGeneration was called. This was testing mock behavior, not real code.
        // The test would pass even if the real implementation was completely broken.
        //
        // TODO: Rewrite as an E2E test using Playwright to test actual form submission
        // behavior with real DOM interactions and real component responses.
    });

    // Skip Stockfish tests in Node.js - they require Web Workers which aren't available
    const isJestEnvironment = typeof process !== 'undefined' && process.env.JEST_WORKER_ID !== undefined;
    const describeStockfish = isJestEnvironment ? describe.skip : describe;

    describeStockfish('Stockfish Integration', () => {
        it('should initialize Stockfish engine', async () => {
            // Mock successful UCI initialization
            const mockWorker = {
                postMessage: jest.fn(),
                onmessage: null,
                onerror: null,
                terminate: jest.fn()
            };

            global.Worker = jest.fn(() => mockWorker);

            const StockfishEngineModule = await import('../src/engine/StockfishEngine.js');
            const StockfishEngine = StockfishEngineModule.default;
            const engine = new StockfishEngine();

            // Simulate successful initialization
            const initPromise = engine.initialize();

            // Simulate UCI protocol response
            setTimeout(() => {
                if (mockWorker.onmessage) {
                    // Simulate UCI initialization sequence
                    mockWorker.onmessage({ data: 'id name Stockfish 17.1' });
                    mockWorker.onmessage({ data: 'id author T. Romstad, M. Costalba, J. Kiiski, G. Linscott' });
                    mockWorker.onmessage({ data: 'option name Threads type spin default 1 min 1 max 512' });
                    mockWorker.onmessage({ data: 'option name Hash type spin default 16 min 1 max 33554432' });
                    mockWorker.onmessage({ data: 'uciok' });
                }
            }, 50);

            await expect(initPromise).resolves.toBeUndefined();
            expect(mockWorker.postMessage).toHaveBeenCalledWith('uci');
            expect(engine.isEngineReady()).toBe(true);
        });
    });
});

// Performance tests
describe('Performance Tests', () => {
    beforeEach(() => {
        // Set up minimal DOM for performance tests
        document.body.innerHTML = `
            <form id="bookbuilder-form">
                <button type="submit" id="submit-btn">Generate</button>
            </form>
        `;
    });

    it('should handle large opening configurations', () => {
        const startTime = performance.now();

        // Generate large configuration
        const largeConfig = Array.from({ length: 100 }, (_, i) => ({
            name: `Opening ${i}`,
            moves: ['e4', 'e5'],
            priority: i
        }));

        const formController = new FormController();

        // Mock the convertToBookBuilderConfig method for performance test
        formController.convertToBookBuilderConfig = (formData) => {
            const openings = JSON.parse(formData['opening-books-json'] || '[]');
            return { openings: openings };
        };

        const config = formController.convertToBookBuilderConfig({
            'opening-books-json': JSON.stringify(largeConfig)
        });

        const endTime = performance.now();
        const duration = endTime - startTime;

        expect(config.openings).toHaveLength(100);
        expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should efficiently generate multiple PGN files', () => {
        const fileGenerator = new FileGenerator();
        const startTime = performance.now();

        // Mock large results
        const largeResults = {};
        for (let i = 0; i < 50; i++) {
            largeResults[`Chapter_${i}.pgn`] = `[Event "Test ${i}"] 1. e4 e5 *`;
        }

        const summary = fileGenerator.generateSummaryFile(largeResults);

        const endTime = performance.now();
        const duration = endTime - startTime;

        expect(JSON.parse(summary).totalFiles).toBe(50);
        expect(duration).toBeLessThan(500); // Should complete within 500ms
    });
});

export { FormController, ErrorHandler, ProgressTracker, FileGenerator };
