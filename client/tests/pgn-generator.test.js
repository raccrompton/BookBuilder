/**
 * DEPRECATED: PgnGenerator Configuration Matrix Tests
 *
 * ⚠️  ARCHITECTURAL CHANGE NOTICE ⚠️
 *
 * These tests have been split and updated to reflect the new architecture:
 *
 * 1. For PgnGenerator core functionality (generateSingleLine):
 *    → See: tests/pgn-generator-simple.test.js
 *
 * 2. For tree/config functionality (generateConfiguredPGN):
 *    → See: tests/file-generator-config.test.js
 *
 * This file is kept for reference but tests are now in separate files.
 */

import PgnGenerator from '../src/pgn/PgnGenerator.js';
import { TestUtils } from './testUtils.js';

// ==================== CONFIGURATION MATRIX TESTS ====================

/**
 * Mock data for testing all 4 configuration combinations
 * Sicilian Defense lines with shared prefixes to test tree building
 */
const createSicilianTestLines = () => [
    {
        pgn: "1. e4 c5 2. Nf3 d6 3. d4",
        moves: [
            { san: 'e4' }, { san: 'c5' }, { san: 'Nf3' },
            { san: 'd6' }, { san: 'd4' }
        ],
        cumulativeLikelihood: 0.0842,
        likelihoodPath: [
            { san: 'c5', playrate: 0.2528 },  // 25.28%
            { san: 'd6', playrate: 0.6597 }   // 65.97%
        ],
        statistics: {
            cumulativePlayrate: 0.0842,
            winrate: 0.5680,
            totalGames: 2847593
        }
    },
    {
        pgn: "1. e4 c5 2. Nf3 Nc6 3. d4",
        moves: [
            { san: 'e4' }, { san: 'c5' }, { san: 'Nf3' },
            { san: 'Nc6' }, { san: 'd4' }
        ],
        cumulativeLikelihood: 0.0639,
        likelihoodPath: [
            { san: 'c5', playrate: 0.2528 },  // 25.28%
            { san: 'Nc6', playrate: 0.5014 } // 50.14%
        ],
        statistics: {
            cumulativePlayrate: 0.0639,
            winrate: 0.5420,
            totalGames: 1849372
        }
    },
    {
        pgn: "1. e4 c5 2. Nf3 d6 3. Bb5+",
        moves: [
            { san: 'e4' }, { san: 'c5' }, { san: 'Nf3' },
            { san: 'd6' }, { san: 'Bb5+' }
        ],
        cumulativeLikelihood: 0.0294,
        likelihoodPath: [
            { san: 'c5', playrate: 0.2528 },  // 25.28%
            { san: 'd6', playrate: 0.6597 }   // 65.97%
        ],
        statistics: {
            cumulativePlayrate: 0.0294,
            winrate: 0.5890,
            totalGames: 582847
        }
    },
    {
        pgn: "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6",
        moves: [
            { san: 'e4' }, { san: 'c5' }, { san: 'Nf3' }, { san: 'd6' },
            { san: 'd4' }, { san: 'cxd4' }, { san: 'Nxd4' }, { san: 'Nf6' },
            { san: 'Nc3' }, { san: 'a6' }
        ],
        cumulativeLikelihood: 0.0187,
        likelihoodPath: [
            { san: 'c5', playrate: 0.2528 },    // 25.28%
            { san: 'd6', playrate: 0.6597 },    // 65.97%
            { san: 'cxd4', playrate: 0.9834 },  // 98.34%
            { san: 'Nf6', playrate: 0.7156 },   // 71.56%
            { san: 'a6', playrate: 0.4892 }     // 48.92%
        ],
        statistics: {
            cumulativePlayrate: 0.0187,
            winrate: 0.5445,
            totalGames: 1253847
        }
    },
    {
        pgn: "1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 g6 5. c4",
        moves: [
            { san: 'e4' }, { san: 'c5' }, { san: 'Nf3' }, { san: 'Nc6' },
            { san: 'd4' }, { san: 'cxd4' }, { san: 'Nxd4' }, { san: 'g6' },
            { san: 'c4' }
        ],
        cumulativeLikelihood: 0.0156,
        likelihoodPath: [
            { san: 'c5', playrate: 0.2528 },    // 25.28%
            { san: 'Nc6', playrate: 0.5014 },   // 50.14%
            { san: 'cxd4', playrate: 0.9723 },  // 97.23%
            { san: 'g6', playrate: 0.3145 },    // 31.45%
        ],
        statistics: {
            cumulativePlayrate: 0.0156,
            winrate: 0.5298,
            totalGames: 987654
        }
    }
];

/**
 * Helper function to create test configurations
 * @param {string} outputFormat - 'individual' | 'tree'
 * @param {string} annotationStyle - 'endBlock' | 'inline'
 * @returns {Object} Test configuration
 */
const createConfigForTest = (outputFormat, annotationStyle) => {
    return TestUtils.createTestConfig({
        outputFormat,
        annotationStyle,
        perspective: 'white',
        DRAWSAREHALF: 0,
        ENGINEFINISH: 0    // Disable for cleaner test output
    });
};

/**
 * Helper functions for parsing numerical values from PGN output
 */
const PgnMathHelpers = {
    /**
     * Parse cumulative playrate percentage from PGN annotations
     * @param {string} pgnOutput - Generated PGN content
     * @returns {number} Cumulative playrate as decimal (e.g., 0.0842 for 8.42%)
     */
    parseCumulativePlayrate(pgnOutput) {
        const match = pgnOutput.match(/Line cumulative playrate:\s*\+([0-9.]+)%/);
        return match ? parseFloat(match[1]) / 100 : null;
    },

    /**
     * Parse winrate percentage from PGN annotations
     * @param {string} pgnOutput - Generated PGN content
     * @returns {number} Winrate as decimal (e.g., 0.5680 for 56.80%)
     */
    parseWinrate(pgnOutput) {
        const match = pgnOutput.match(/Line winrate[^:]*:\s*\+([0-9.]+)%/);
        return match ? parseFloat(match[1]) / 100 : null;
    },

    /**
     * Parse total games count from PGN annotations
     * @param {string} pgnOutput - Generated PGN content
     * @returns {number} Total games count
     */
    parseTotalGames(pgnOutput) {
        const match = pgnOutput.match(/over\s+([\d,]+)\s+games/);
        return match ? parseInt(match[1].replace(/,/g, '')) : null;
    },

    /**
     * Calculate expected cumulative probability from likelihood path
     * @param {Array} likelihoodPath - Array of {san, playrate} objects
     * @returns {number} Expected cumulative probability as decimal
     */
    calculateExpectedCumulative(likelihoodPath) {
        if (!likelihoodPath || likelihoodPath.length === 0) return 0;
        return likelihoodPath.reduce((cumulative, move) => cumulative * move.playrate, 1);
    },

    /**
     * Parse individual move playrates from PGN annotations
     * @param {string} pgnOutput - Generated PGN content
     * @returns {Object} Map of move san to playrate decimal
     */
    parseMovePlayrates(pgnOutput) {
        const playrates = new Map();
        const movePlayrateRegex = /\+([0-9.]+)%\s+([a-zA-Z0-9+#=\-]+)/g;
        let match;
        while ((match = movePlayrateRegex.exec(pgnOutput)) !== null) {
            const percentage = parseFloat(match[1]);
            const san = match[2];
            playrates.set(san, percentage / 100);
        }
        return playrates;
    }
};

/**
 * Create test data with verified mathematical relationships for validation tests
 */
const createMathematicalTestLines = () => [
    {
        // Simple 2-move test: 0.5 × 0.8 = 0.4 (40%)
        pgn: "1. e4 e5 2. Nf3",
        moves: [
            { san: 'e4' }, { san: 'e5' }, { san: 'Nf3' }
        ],
        cumulativeLikelihood: 0.4000, // 40% - should match calculation
        // Top-level properties for inline format compatibility
        winRate: 0.5500,  // 55% - for inline format
        totalGames: 1000000, // for inline format
        likelihoodPath: [
            { san: 'e5', playrate: 0.5000 },  // 50%
            { san: 'Nf3', playrate: 0.8000 }   // 80%
        ],
        statistics: {
            cumulativePlayrate: 0.4000,
            winrate: 0.5500,  // 55% - should be preserved exactly
            totalGames: 1000000
        }
    },
    {
        // Complex 4-move test: 0.3 × 0.7 × 0.6 × 0.9 = 0.1134 (11.34%)
        pgn: "1. d4 d5 2. c4 dxc4 3. Nf3 Nf6 4. e3",
        moves: [
            { san: 'd4' }, { san: 'd5' }, { san: 'c4' }, { san: 'dxc4' },
            { san: 'Nf3' }, { san: 'Nf6' }, { san: 'e3' }
        ],
        cumulativeLikelihood: 0.1134, // 11.34% - should match calculation
        // Top-level properties for inline format compatibility
        winRate: 0.6789,  // 67.89% - for inline format
        totalGames: 555555, // for inline format
        likelihoodPath: [
            { san: 'd5', playrate: 0.3000 },    // 30%
            { san: 'dxc4', playrate: 0.7000 },  // 70%
            { san: 'Nf6', playrate: 0.6000 },   // 60%
            { san: 'e3', playrate: 0.9000 }     // 90%
        ],
        statistics: {
            cumulativePlayrate: 0.1134,
            winrate: 0.6789,  // 67.89% - precise decimal test
            totalGames: 555555
        }
    },
    {
        // Edge case: Very small probabilities - 0.1 × 0.2 × 0.15 = 0.003 (0.3%)
        pgn: "1. h3 h6 2. g3 g6 3. Bg2",
        moves: [
            { san: 'h3' }, { san: 'h6' }, { san: 'g3' }, { san: 'g6' }, { san: 'Bg2' }
        ],
        cumulativeLikelihood: 0.0030, // 0.3% - should match calculation
        // Top-level properties for inline format compatibility
        winRate: 0.0000,  // 0% - for inline format
        totalGames: 12345, // for inline format
        likelihoodPath: [
            { san: 'h6', playrate: 0.1000 },    // 10%
            { san: 'g6', playrate: 0.2000 },    // 20%
            { san: 'Bg2', playrate: 0.1500 }    // 15%
        ],
        statistics: {
            cumulativePlayrate: 0.0030,
            winrate: 0.0000,  // 0% - edge case test
            totalGames: 12345
        }
    },
    {
        // Perfect probability test: 1.0 × 0.5 = 0.5 (50%)
        pgn: "1. e4 e5 2. Ke2",
        moves: [
            { san: 'e4' }, { san: 'e5' }, { san: 'Ke2' }
        ],
        cumulativeLikelihood: 0.5000, // 50% - should match calculation
        // Top-level properties for inline format compatibility
        winRate: 1.0000,  // 100% - for inline format
        totalGames: 999999, // for inline format
        likelihoodPath: [
            { san: 'e5', playrate: 1.0000 },    // 100%
            { san: 'Ke2', playrate: 0.5000 }    // 50%
        ],
        statistics: {
            cumulativePlayrate: 0.5000,
            winrate: 1.0000,  // 100% - edge case test
            totalGames: 999999
        }
    }
];

describe('Configuration Matrix Tests (All 4 Combinations)', () => {
    let testLines;

    beforeEach(() => {
        testLines = createSicilianTestLines();
    });

    describe('1. Individual + EndBlock (Original Format)', () => {
        test('generates separate PGN entries with statistics blocks', async () => {
            const config = createConfigForTest('individual', 'endBlock');
            const generator = new PgnGenerator(config);

            const result = await generator.generatePGN(testLines, 'Sicilian_Defense');

            // Multiple event headers (one per line)
            expect(result).toMatch(/\[Event "Sicilian_Defense Line 1"\]/);
            expect(result).toMatch(/\[Event "Sicilian_Defense Line 2"\]/);
            expect(result).toMatch(/\[Event "Sicilian_Defense Line 3"\]/);

            // Traditional move playrates blocks
            expect(result).toMatch(/\{Move playrates:/g);
            expect(result).toMatch(/\+25\.28%\s+c5/);
            expect(result).toMatch(/\+65\.97%\s+d6/);
            expect(result).toMatch(/Line cumulative playrate:/);

            // NO inline annotations
            expect(result).not.toMatch(/c5\{[+]\d+\.\d+%\}/);
            expect(result).not.toMatch(/d6\{[+]\d+\.\d+%\}/);
        });
    });

    describe('2. Individual + Inline (New Format)', () => {
        test('generates separate PGN entries with inline move annotations', async () => {
            const config = createConfigForTest('individual', 'inline');
            const generator = new PgnGenerator(config);

            const result = await generator.generatePGN(testLines, 'Sicilian_Defense');

            // Multiple event headers (one per line)
            expect(result).toMatch(/\[Event "Sicilian_Defense Line 1"\]/);
            expect(result).toMatch(/\[Event "Sicilian_Defense Line 2"\]/);
            expect(result).toMatch(/\[Event "Sicilian_Defense Line 3"\]/);

            // Inline move annotations
            expect(result).toMatch(/c5\{[+]25\.28%\}/);
            expect(result).toMatch(/d6\{[+]65\.97%\}/);
            expect(result).toMatch(/Nc6\{[+]50\.14%\}/);

            // NO traditional playrates blocks
            expect(result).not.toMatch(/\{Move playrates:/);
            expect(result).not.toMatch(/\+25\.28%\s+c5/);
        });
    });

    describe('3. Tree + EndBlock (New Format)', () => {
        test('combines lines with variations and statistics blocks', async () => {
            const config = createConfigForTest('tree', 'endBlock');
            const generator = new PgnGenerator(config);

            const result = await generator.generatePGN(testLines, 'Sicilian_Defense');

            // Single event header (combined tree)
            expect(result).toMatch(/\[Event "Sicilian_Defense Line 1"\]/);
            expect(result).not.toMatch(/\[Event "Sicilian_Defense Line 2"\]/);

            // Tree structure with variations
            expect(result).toMatch(/1\.\s*e4\s+c5\s+2\.\s*Nf3\s+d6/);
            expect(result).toMatch(/\(\s*2\.\.\.\s*Nc6\s+3\.\s*d4\s*\)/); // Complete variation syntax
            expect(result).toMatch(/3\.\s*d4/);
            expect(result).toMatch(/\(\s*3\.\s*Bb5\+\s*\)/); // Another variation

            // Traditional statistics blocks
            expect(result).toMatch(/\{Move playrates:/);
            expect(result).toMatch(/Line cumulative playrate:/);

            // NO inline annotations in tree
            expect(result).not.toMatch(/c5\{[+]\d+\.\d+%\}/);
        });
    });

    describe('4. Tree + Inline (New Format)', () => {
        test('combines lines with variations and inline annotations', async () => {
            const config = createConfigForTest('tree', 'inline');
            const generator = new PgnGenerator(config);

            const result = await generator.generatePGN(testLines, 'Sicilian_Defense');

            // Single event header (combined tree)
            expect(result).toMatch(/\[Event "Sicilian_Defense Line 1"\]/);
            expect(result).not.toMatch(/\[Event "Sicilian_Defense Line 2"\]/);

            // Tree structure with inline annotations
            expect(result).toMatch(/1\.\s*e4\s+c5\{[+]25\.28%\}/);
            expect(result).toMatch(/2\.\s*Nf3\s+d6\{[+]65\.97%\}/);
            expect(result).toMatch(/\(\s*2\.\.\.\s*Nc6\{[+]50\.14%\}\s+3\.\s*d4\s*\)/); // Complete variation with inline

            // NO traditional playrates blocks
            expect(result).not.toMatch(/\{Move playrates:/);
            expect(result).not.toMatch(/Line cumulative playrate:/);
        });
    });

    describe('Configuration Routing Validation', () => {
        test('routes to correct generation methods based on config', async () => {
            const mockGenerateTreePGN = jest.spyOn(PgnGenerator.prototype, 'generateTreePGN');
            const mockGenerateInlineAnnotatedPGN = jest.spyOn(PgnGenerator.prototype, 'generateInlineAnnotatedPGN');
            const mockGenerateIndividualLinesPGN = jest.spyOn(PgnGenerator.prototype, 'generateIndividualLinesPGN');

            // Test tree format routing
            const treeConfig = createConfigForTest('tree', 'endBlock');
            const treeGenerator = new PgnGenerator(treeConfig);
            await treeGenerator.generatePGN(testLines, 'Test');
            expect(mockGenerateTreePGN).toHaveBeenCalled();

            // Test inline annotation routing (individual + inline)
            const inlineConfig = createConfigForTest('individual', 'inline');
            const inlineGenerator = new PgnGenerator(inlineConfig);
            await inlineGenerator.generatePGN(testLines, 'Test');
            expect(mockGenerateInlineAnnotatedPGN).toHaveBeenCalled();

            // Test default routing (individual + endBlock)
            const defaultConfig = createConfigForTest('individual', 'endBlock');
            const defaultGenerator = new PgnGenerator(defaultConfig);
            await defaultGenerator.generatePGN(testLines, 'Test');
            expect(mockGenerateIndividualLinesPGN).toHaveBeenCalled();

            // Cleanup mocks
            mockGenerateTreePGN.mockRestore();
            mockGenerateInlineAnnotatedPGN.mockRestore();
            mockGenerateIndividualLinesPGN.mockRestore();
        });
    });

    describe('Edge Cases', () => {
        test('handles empty lines array', async () => {
            const config = createConfigForTest('tree', 'inline');
            const generator = new PgnGenerator(config);

            const result = await generator.generatePGN([], 'Empty_Test');
            expect(result).toBeDefined();
            expect(result.trim()).toBe('');
        });

        test('handles single line in tree mode', async () => {
            const config = createConfigForTest('tree', 'endBlock');
            const generator = new PgnGenerator(config);

            const result = await generator.generatePGN([testLines[0]], 'Single_Line');
            expect(result).toMatch(/\[Event "Single_Line Line 1"\]/);
            expect(result).toMatch(/1\.\s*e4\s+c5\s+2\.\s*Nf3\s+d6\s+3\.\s*d4/);
        });

        test('validates configuration precedence', async () => {
            // Tree format should take precedence over inline when both are specified
            const config = createConfigForTest('tree', 'inline');
            const generator = new PgnGenerator(config);

            const mockGenerateTreePGN = jest.spyOn(generator, 'generateTreePGN').mockResolvedValue('mocked tree result');
            const mockGenerateInlineAnnotatedPGN = jest.spyOn(generator, 'generateInlineAnnotatedPGN');

            await generator.generatePGN(testLines, 'Test');

            // Tree should be called, inline should not
            expect(mockGenerateTreePGN).toHaveBeenCalled();
            expect(mockGenerateInlineAnnotatedPGN).not.toHaveBeenCalled();

            mockGenerateTreePGN.mockRestore();
            mockGenerateInlineAnnotatedPGN.mockRestore();
        });
    });

    describe('Extended Test Cases', () => {
        test('handles longer game sequences with black to move last', async () => {
            const config = createConfigForTest('individual', 'inline');
            const generator = new PgnGenerator(config);

            // Test with the longer Sicilian line ending with black move
            const longerLine = testLines[3]; // "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6"

            const result = await generator.generatePGN([longerLine], 'Extended_Sicilian');

            // Should have proper move numbering through move 5
            expect(result).toMatch(/1\.\s*e4\s+c5/);
            expect(result).toMatch(/5\.\s*Nc3\s+a6/);

            // Should have inline annotations for tracked moves
            expect(result).toMatch(/c5\{[+]25\.28%\}/);
            expect(result).toMatch(/d6\{[+]65\.97%\}/);
            expect(result).toMatch(/cxd4\{[+]98\.34%\}/);
            expect(result).toMatch(/Nf6\{[+]71\.56%\}/);
            expect(result).toMatch(/a6\{[+]48\.92%\}/);
        });

        test('handles Sicilian Accelerated Dragon with black ending move', async () => {
            const config = createConfigForTest('tree', 'endBlock');
            const generator = new PgnGenerator(config);

            // Test with Sicilian Accelerated Dragon line ending with black move
            const dragonLine = testLines[4]; // "1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 g6 5. c4"

            const result = await generator.generatePGN([dragonLine], 'Sicilian_Dragon');

            // Should have proper move numbering through move 5 with white's final move
            expect(result).toMatch(/1\.\s*e4\s+c5/);
            expect(result).toMatch(/2\.\s*Nf3\s+Nc6/);
            expect(result).toMatch(/3\.\s*d4\s+cxd4/);
            expect(result).toMatch(/4\.\s*Nxd4\s+g6/);
            expect(result).toMatch(/5\.\s*c4/);

            // Should have traditional statistics block
            expect(result).toMatch(/\{Move playrates:/);
            expect(result).toMatch(/\+25\.28%\s+c5/);
            expect(result).toMatch(/\+50\.14%\s+Nc6/);
            expect(result).toMatch(/\+97\.23%\s+cxd4/);
            expect(result).toMatch(/\+31\.45%\s+g6/);
        });

        test('creates proper tree structure with Sicilian variations', async () => {
            const config = createConfigForTest('tree', 'inline');
            const generator = new PgnGenerator(config);

            // Mix shorter and longer Sicilian lines to test variation tree building
            const sicilianLines = [
                testLines[0], // 3-move line: "1. e4 c5 2. Nf3 d6 3. d4"
                testLines[1], // 3-move variation: "1. e4 c5 2. Nf3 Nc6 3. d4"
                testLines[3]  // 5-move continuation: "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6"
            ];

            const result = await generator.generatePGN(sicilianLines, 'Sicilian_Variations');

            // Longest line should be main line (5-move line)
            expect(result).toMatch(/1\.\s*e4\s+c5/);
            expect(result).toMatch(/5\.\s*Nc3\s+a6/);

            // Should have variations for different 2nd black moves
            expect(result).toMatch(/\(\s*2\.\.\.\s*Nc6/); // Knight variation

            // Should have inline annotations
            expect(result).toMatch(/c5\{[+]25\.28%\}/);
            expect(result).toMatch(/d6\{[+]65\.97%\}/);
            expect(result).toMatch(/Nc6\{[+]50\.14%\}/);

            // No traditional statistics blocks in inline tree mode
            expect(result).not.toMatch(/\{Move playrates:/);
        });
    });

    describe('Mathematical Accuracy Validation', () => {
        let mathTestLines;

        beforeEach(() => {
            mathTestLines = createMathematicalTestLines();
        });

        describe('Test A: Cumulative Probability Validation', () => {
            test('validates simple 2-move cumulative probability calculation', async () => {
                const config = createConfigForTest('individual', 'endBlock');
                const generator = new PgnGenerator(config);

                const simpleLine = mathTestLines[0]; // 0.5 × 0.8 = 0.4 (40%)
                const result = await generator.generatePGN([simpleLine], 'Math_Test_Simple');

                // Calculate expected cumulative probability
                const expectedCumulative = PgnMathHelpers.calculateExpectedCumulative(simpleLine.likelihoodPath);
                expect(expectedCumulative).toBeCloseTo(0.4000, 4); // Verify our test data

                // Parse cumulative probability from PGN output
                const outputCumulative = PgnMathHelpers.parseCumulativePlayrate(result);
                expect(outputCumulative).not.toBeNull();
                expect(outputCumulative).toBeCloseTo(expectedCumulative, 3); // Allow for rounding
                expect(outputCumulative).toBeCloseTo(0.4000, 3); // 40%
            });

            test('validates complex 4-move cumulative probability calculation', async () => {
                const config = createConfigForTest('individual', 'endBlock');
                const generator = new PgnGenerator(config);

                const complexLine = mathTestLines[1]; // 0.3 × 0.7 × 0.6 × 0.9 = 0.1134 (11.34%)
                const result = await generator.generatePGN([complexLine], 'Math_Test_Complex');

                // Calculate expected cumulative probability
                const expectedCumulative = PgnMathHelpers.calculateExpectedCumulative(complexLine.likelihoodPath);
                expect(expectedCumulative).toBeCloseTo(0.1134, 4); // Verify our test data

                // Parse cumulative probability from PGN output
                const outputCumulative = PgnMathHelpers.parseCumulativePlayrate(result);
                expect(outputCumulative).not.toBeNull();
                expect(outputCumulative).toBeCloseTo(expectedCumulative, 3); // Allow for rounding
                expect(outputCumulative).toBeCloseTo(0.1134, 3); // 11.34%
            });

            test('validates edge case: very small probabilities', async () => {
                const config = createConfigForTest('individual', 'endBlock');
                const generator = new PgnGenerator(config);

                const edgeLine = mathTestLines[2]; // 0.1 × 0.2 × 0.15 = 0.003 (0.3%)
                const result = await generator.generatePGN([edgeLine], 'Math_Test_Edge');

                // Calculate expected cumulative probability
                const expectedCumulative = PgnMathHelpers.calculateExpectedCumulative(edgeLine.likelihoodPath);
                expect(expectedCumulative).toBeCloseTo(0.0030, 4); // Verify our test data

                // Parse cumulative probability from PGN output
                const outputCumulative = PgnMathHelpers.parseCumulativePlayrate(result);
                expect(outputCumulative).not.toBeNull();
                expect(outputCumulative).toBeCloseTo(expectedCumulative, 3); // Allow for rounding
                expect(outputCumulative).toBeCloseTo(0.0030, 3); // 0.3%
            });

            test('validates edge case: perfect probabilities', async () => {
                const config = createConfigForTest('individual', 'endBlock');
                const generator = new PgnGenerator(config);

                const perfectLine = mathTestLines[3]; // 1.0 × 0.5 = 0.5 (50%)
                const result = await generator.generatePGN([perfectLine], 'Math_Test_Perfect');

                // Calculate expected cumulative probability
                const expectedCumulative = PgnMathHelpers.calculateExpectedCumulative(perfectLine.likelihoodPath);
                expect(expectedCumulative).toBeCloseTo(0.5000, 4); // Verify our test data

                // Parse cumulative probability from PGN output
                const outputCumulative = PgnMathHelpers.parseCumulativePlayrate(result);
                expect(outputCumulative).not.toBeNull();
                expect(outputCumulative).toBeCloseTo(expectedCumulative, 3); // Allow for rounding
                expect(outputCumulative).toBeCloseTo(0.5000, 3); // 50%
            });

            test('validates cumulative probability consistency across output formats', async () => {
                const testLine = mathTestLines[0]; // Simple test case
                const expectedCumulative = PgnMathHelpers.calculateExpectedCumulative(testLine.likelihoodPath);

                // Test all 4 configurations
                const configs = [
                    { format: 'individual', style: 'endBlock' },
                    { format: 'individual', style: 'inline' },
                    { format: 'tree', style: 'endBlock' },
                    { format: 'tree', style: 'inline' }
                ];

                for (const { format, style } of configs) {
                    const config = createConfigForTest(format, style);
                    const generator = new PgnGenerator(config);
                    const result = await generator.generatePGN([testLine], `Math_Test_${format}_${style}`);

                    const outputCumulative = PgnMathHelpers.parseCumulativePlayrate(result);
                    if (outputCumulative !== null) { // Some formats might not include cumulative playrate
                        expect(outputCumulative).toBeCloseTo(expectedCumulative, 3);
                    }
                }
            });
        });

        describe('Test B: Winrate Preservation Validation', () => {
            test('preserves exact winrate in individual endBlock format', async () => {
                const config = createConfigForTest('individual', 'endBlock');
                const generator = new PgnGenerator(config);

                for (const testLine of mathTestLines) {
                    const result = await generator.generatePGN([testLine], 'Winrate_Test');

                    const outputWinrate = PgnMathHelpers.parseWinrate(result);
                    expect(outputWinrate).not.toBeNull();
                    expect(outputWinrate).toBeCloseTo(testLine.statistics.winrate, 4); // Exact match to 4 decimal places
                }
            });

            test('preserves exact winrate in individual inline format', async () => {
                const config = createConfigForTest('individual', 'inline');
                const generator = new PgnGenerator(config);

                for (const testLine of mathTestLines) {
                    const result = await generator.generatePGN([testLine], 'Winrate_Test');

                    const outputWinrate = PgnMathHelpers.parseWinrate(result);
                    expect(outputWinrate).not.toBeNull();
                    expect(outputWinrate).toBeCloseTo(testLine.statistics.winrate, 4); // Exact match to 4 decimal places
                }
            });

            test('preserves exact winrate across all configurations', async () => {
                const testLine = mathTestLines[1]; // Complex line with precise decimal (67.89%)

                const configs = [
                    { format: 'individual', style: 'endBlock' },
                    { format: 'individual', style: 'inline' },
                    { format: 'tree', style: 'endBlock' },
                    { format: 'tree', style: 'inline' }
                ];

                for (const { format, style } of configs) {
                    const config = createConfigForTest(format, style);
                    const generator = new PgnGenerator(config);
                    const result = await generator.generatePGN([testLine], `Winrate_Test_${format}_${style}`);

                    const outputWinrate = PgnMathHelpers.parseWinrate(result);
                    if (outputWinrate !== null) { // Some formats might not include winrate
                        expect(outputWinrate).toBeCloseTo(testLine.statistics.winrate, 4);
                        expect(outputWinrate).toBeCloseTo(0.6789, 4); // 67.89%
                    }
                }
            });

            test('handles edge case winrates correctly', async () => {
                const config = createConfigForTest('individual', 'endBlock');
                const generator = new PgnGenerator(config);

                // Test 0% winrate
                const zeroWinrateLine = mathTestLines[2]; // 0% winrate
                const zeroResult = await generator.generatePGN([zeroWinrateLine], 'Zero_Winrate_Test');
                const zeroWinrate = PgnMathHelpers.parseWinrate(zeroResult);
                expect(zeroWinrate).toBeCloseTo(0.0000, 4);

                // Test 100% winrate
                const perfectWinrateLine = mathTestLines[3]; // 100% winrate
                const perfectResult = await generator.generatePGN([perfectWinrateLine], 'Perfect_Winrate_Test');
                const perfectWinrate = PgnMathHelpers.parseWinrate(perfectResult);
                expect(perfectWinrate).toBeCloseTo(1.0000, 4);
            });

            test('preserves total games count accurately', async () => {
                const config = createConfigForTest('individual', 'endBlock');
                const generator = new PgnGenerator(config);

                for (const testLine of mathTestLines) {
                    const result = await generator.generatePGN([testLine], 'Games_Count_Test');

                    const outputGames = PgnMathHelpers.parseTotalGames(result);
                    expect(outputGames).not.toBeNull();
                    expect(outputGames).toBe(testLine.statistics.totalGames); // Exact match for game counts
                }
            });
        });

        describe('Test C: Mathematical Consistency Suite', () => {
            test('validates input test data mathematical consistency', () => {
                // Verify that our test data itself is mathematically consistent
                for (let i = 0; i < mathTestLines.length; i++) {
                    const line = mathTestLines[i];
                    const expectedCumulative = PgnMathHelpers.calculateExpectedCumulative(line.likelihoodPath);

                    expect(expectedCumulative).toBeCloseTo(line.cumulativeLikelihood, 4);
                    expect(expectedCumulative).toBeCloseTo(line.statistics.cumulativePlayrate, 4);
                }
            });

            test('validates percentage formatting consistency', async () => {
                const config = createConfigForTest('individual', 'endBlock');
                const generator = new PgnGenerator(config);

                const testLine = mathTestLines[0]; // 0.4 = 40%
                const result = await generator.generatePGN([testLine], 'Percentage_Test');

                // Parse all percentage values from output
                const cumulativePlayrate = PgnMathHelpers.parseCumulativePlayrate(result);
                const winrate = PgnMathHelpers.parseWinrate(result);
                const movePlayrates = PgnMathHelpers.parseMovePlayrates(result);

                // Verify percentage formatting (×100, proper decimal places)
                expect(cumulativePlayrate).toBeCloseTo(0.4000, 3); // 40.00%
                expect(winrate).toBeCloseTo(0.5500, 3); // 55.00%

                // Verify individual move playrates
                expect(movePlayrates.get('e5')).toBeCloseTo(0.5000, 3); // 50.00%
                expect(movePlayrates.get('Nf3')).toBeCloseTo(0.8000, 3); // 80.00%
            });

            test('validates cross-format numerical consistency', async () => {
                const testLine = mathTestLines[1]; // Complex test case

                const configs = [
                    { format: 'individual', style: 'endBlock' },
                    { format: 'individual', style: 'inline' }
                ];

                const results = [];
                for (const { format, style } of configs) {
                    const config = createConfigForTest(format, style);
                    const generator = new PgnGenerator(config);
                    const result = await generator.generatePGN([testLine], `Consistency_Test_${format}_${style}`);

                    results.push({
                        format: `${format}_${style}`,
                        cumulative: PgnMathHelpers.parseCumulativePlayrate(result),
                        winrate: PgnMathHelpers.parseWinrate(result),
                        games: PgnMathHelpers.parseTotalGames(result)
                    });
                }

                // Verify all formats produce identical numerical results
                const [first, ...rest] = results;
                for (const result of rest) {
                    if (first.cumulative !== null && result.cumulative !== null) {
                        expect(result.cumulative).toBeCloseTo(first.cumulative, 4);
                    }
                    if (first.winrate !== null && result.winrate !== null) {
                        expect(result.winrate).toBeCloseTo(first.winrate, 4);
                    }
                    if (first.games !== null && result.games !== null) {
                        expect(result.games).toBe(first.games);
                    }
                }
            });

            test('validates rounding behavior consistency', async () => {
                const config = createConfigForTest('individual', 'endBlock');
                const generator = new PgnGenerator(config);

                // Create test case with values that test rounding behavior
                const roundingTestLine = {
                    pgn: "1. e4 e5 2. Nf3 Nc6",
                    moves: [
                        { san: 'e4' }, { san: 'e5' }, { san: 'Nf3' }, { san: 'Nc6' }
                    ],
                    cumulativeLikelihood: 0.123456789, // Many decimal places
                    likelihoodPath: [
                        { san: 'e5', playrate: 0.3333333 },  // 1/3 = repeating decimal
                        { san: 'Nc6', playrate: 0.3703703 } // Result should be ~0.123456789
                    ],
                    statistics: {
                        cumulativePlayrate: 0.123456789,
                        winrate: 0.555555555, // 5/9 = repeating decimal
                        totalGames: 123456
                    }
                };

                const result = await generator.generatePGN([roundingTestLine], 'Rounding_Test');

                // Verify consistent rounding to 2 decimal places for percentages
                const outputCumulative = PgnMathHelpers.parseCumulativePlayrate(result);
                const outputWinrate = PgnMathHelpers.parseWinrate(result);

                expect(outputCumulative).toBeCloseTo(0.123456789, 2); // Should round consistently
                expect(outputWinrate).toBeCloseTo(0.555555555, 2); // Should round consistently

                // Check that output contains properly formatted percentages (12.35%, not 12.345678%)
                expect(result).toMatch(/12\.35%/); // Cumulative should be rounded to 2 decimal places
                expect(result).toMatch(/55\.56%/); // Winrate should be rounded to 2 decimal places
            });

            test('validates no data loss in transformation pipeline', async () => {
                const config = createConfigForTest('individual', 'endBlock');
                const generator = new PgnGenerator(config);

                for (const testLine of mathTestLines) {
                    const result = await generator.generatePGN([testLine], 'Data_Loss_Test');

                    // Verify all input data appears correctly in output
                    const outputCumulative = PgnMathHelpers.parseCumulativePlayrate(result);
                    const outputWinrate = PgnMathHelpers.parseWinrate(result);
                    const outputGames = PgnMathHelpers.parseTotalGames(result);
                    const outputMovePlayrates = PgnMathHelpers.parseMovePlayrates(result);

                    // Check for data loss (null values indicate missing data)
                    expect(outputCumulative).not.toBeNull();
                    expect(outputWinrate).not.toBeNull();
                    expect(outputGames).not.toBeNull();

                    // Check individual move playrates are preserved
                    for (const move of testLine.likelihoodPath) {
                        expect(outputMovePlayrates.has(move.san)).toBe(true);
                        expect(outputMovePlayrates.get(move.san)).toBeCloseTo(move.playrate, 3);
                    }

                    // Check numerical accuracy within acceptable tolerance
                    expect(outputCumulative).toBeCloseTo(testLine.cumulativeLikelihood, 3);
                    expect(outputWinrate).toBeCloseTo(testLine.statistics.winrate, 4);
                    expect(outputGames).toBe(testLine.statistics.totalGames);
                }
            });
        });
    });
});
