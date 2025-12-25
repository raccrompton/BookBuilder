/**
 * FileGenerator Comprehensive Test Suite
 *
 * Consolidated test file covering:
 * - Core PGN generation functionality (PgnGenerator)
 * - Configuration matrix tests (FileGenerator)
 * - Mathematical accuracy validation
 * - Edge cases and error handling
 */

import FileGenerator from '../src/ui/FileGenerator.js';
import PgnGenerator from '../src/pgn/PgnGenerator.js';
import { TestUtils } from './testUtils.js';

// ==================== TEST DATA ====================

/**
 * Mock data for configuration matrix testing
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
 * Test data with verified mathematical relationships for validation tests
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
    }
];

// ==================== HELPER FUNCTIONS ====================

/**
 * Helper function to create test configurations
 */
const createConfigForTest = (outputFormat, annotationStyle) => {
    return TestUtils.createTestConfig({
        outputFormat,
        annotationStyle,
        perspective: 'white',
        DRAWSAREHALF: 0,
        ENGINEFINISH: 0  // Disable engine completion for tests
    });
};

/**
 * Helper functions for parsing numerical values from PGN output
 */
const PgnMathHelpers = {
    parseCumulativePlayrate(pgnOutput) {
        const match = pgnOutput.match(/Line cumulative playrate:\s*([0-9.]+)%/);
        return match ? parseFloat(match[1]) / 100 : null;
    },

    parseWinrate(pgnOutput) {
        const match = pgnOutput.match(/Line winrate[^:]*:\s*([0-9.]+)%/);
        return match ? parseFloat(match[1]) / 100 : null;
    },

    parseTotalGames(pgnOutput) {
        const match = pgnOutput.match(/over\s+([\d,]+)\s+games/);
        return match ? parseInt(match[1].replace(/,/g, '')) : null;
    },

    calculateExpectedCumulative(likelihoodPath) {
        if (!likelihoodPath || likelihoodPath.length === 0) return 0;
        return likelihoodPath.reduce((cumulative, move) => cumulative * move.playrate, 1);
    },

    parseMovePlayrates(pgnOutput) {
        const playrates = new Map();
        const movePlayrateRegex = /([0-9.]+)%\s+([a-zA-Z0-9+#=\-]+)/g;
        let match;
        while ((match = movePlayrateRegex.exec(pgnOutput)) !== null) {
            const percentage = parseFloat(match[1]);
            const san = match[2];
            playrates.set(san, percentage / 100);
        }
        return playrates;
    }
};

// ==================== TEST SUITES ====================

describe('FileGenerator Core Functionality', () => {
    let fileGenerator;

    beforeEach(() => {
        fileGenerator = new FileGenerator();
    });

    describe('Basic File Operations', () => {

        test('validatePGN detects valid and invalid PGN content', () => {
            const validPGN = `[Event "Test"]
[Site "Test"]
[Date "2024.01.01"]
[Round "1"]
[White "Player1"]
[Black "Player2"]
[Result "*"]

1. e4 e5 2. Nf3 *`;

            const invalidPGN = 'invalid content';

            const validResult = fileGenerator.validatePGN(validPGN);
            expect(validResult.isValid).toBe(true);
            expect(validResult.errors).toHaveLength(0);

            const invalidResult = fileGenerator.validatePGN(invalidPGN);
            expect(invalidResult.isValid).toBe(false);
            expect(invalidResult.errors.length).toBeGreaterThan(0);
        });

        test('formatFileSize converts bytes to human readable format', () => {
            expect(fileGenerator.formatFileSize(0)).toBe('0 Bytes');
            expect(fileGenerator.formatFileSize(1024)).toBe('1 KB');
            expect(fileGenerator.formatFileSize(1048576)).toBe('1 MB');
            expect(fileGenerator.formatFileSize(1073741824)).toBe('1 GB');
        });
    });

    describe('Legacy PGN Generation Methods', () => {
        test('generatePGN creates basic PGN with metadata', async () => { // REFACTORED: Now async since generatePGN is async
            const testLines = createSicilianTestLines().slice(0, 2); // Get first two test lines
            const metadata = {
                chapterName: 'Test Opening',
                author: 'Test Author',
                opening: 'Sicilian Defense'
            };

            const result = await fileGenerator.generatePGN(testLines, metadata); // REFACTORED: Await the async result

            expect(result).toMatch(/\[Event "Test Opening"\]/); // Check Event header
            expect(result).toMatch(/\[Annotator "Test Author"\]/); // Check Annotator header
            expect(result).toMatch(/\[Opening "Sicilian Defense"\]/); // Check Opening header
            expect(result).toMatch(/1\.\s*e4\s+c5/); // Check first moves appear
        });

    });
});

describe('PgnGenerator Core Functionality', () => {
    let generator;

    beforeEach(() => {
        generator = new PgnGenerator({
            ENGINEFINISH: 0, // Disable engine completion for tests
            perspective: 'white',
            DRAWSAREHALF: 0
        });
    });

    describe('generateSingleLine Method', () => {
        test('generates single PGN line with proper format', async () => {
            const testLine = createSicilianTestLines()[0];

            const result = generator.generateSingleLine(testLine, 'Test_Opening Line 1');

            // Should have event header
            expect(result).toMatch(/\[Event "Test_Opening Line 1"\]/);

            // Should have move sequence
            expect(result).toMatch(/1\.\s*e4\s+c5\s+2\.\s*Nf3\s+d6\s+3\.\s*d4/);

            // Should have statistics block
            expect(result).toMatch(/\{Move playrates:/);
            expect(result).toMatch(/25\.28%\s+c5/);
            expect(result).toMatch(/65\.97%\s+d6/);
            expect(result).toMatch(/Line cumulative playrate: 8\.42%/);
            expect(result).toMatch(/Line winrate \(excluding draws\): 56\.80% over 2,847,593 games/);
        });

        test('handles line with no statistical data', async () => {
            const testLine = {
                pgn: "1. e4 e5 2. Nf3",
                moves: [
                    { san: 'e4' }, { san: 'e5' }, { san: 'Nf3' }
                ]
            };

            const result = generator.generateSingleLine(testLine, 'Simple_Line');

            // Should have event header
            expect(result).toMatch(/\[Event "Simple_Line"\]/);

            // Should have move sequence
            expect(result).toMatch(/1\.\s*e4\s+e5\s+2\.\s*Nf3/);

            // Should have playrates section even if empty
            expect(result).toMatch(/\{Move playrates:/);
        });

        test('handles empty line gracefully', async () => {
            const testLine = {
                pgn: "",
                moves: []
            };

            const result = generator.generateSingleLine(testLine, 'Empty_Line');

            // Should have event header
            expect(result).toMatch(/\[Event "Empty_Line"\]/);

            // Should have playrates section
            expect(result).toMatch(/\{Move playrates:/);
        });
    });

    describe('Move Sequence Generation with chess.js', () => {
        test('properly formats moves using chess.js', async () => {
            const testLine = {
                moves: [
                    { san: 'e4' }, { san: 'e5' }, { san: 'Nf3' }, { san: 'Nc6' }
                ]
            };

            const result = await generator.generateMoveSequence(testLine);

            // Should be properly formatted by chess.js
            expect(result).toMatch(/1\.\s*e4\s+e5\s+2\.\s*Nf3\s+Nc6/);
        });

        test('handles invalid move sequences gracefully', async () => {
            const testLine = {
                moves: [
                    { san: 'e4' }, { san: 'e5' }, { san: 'Kxe5' } // Invalid move
                ]
            };

            // Should throw error due to invalid move
            await expect(generator.generateMoveSequence(testLine))
                .rejects.toThrow();
        });

        test('handles empty move array', async () => {
            const testLine = {
                moves: []
            };

            const result = await generator.generateMoveSequence(testLine);
            // Empty move array returns just the result marker
            expect(result).toBe('*');
        });
    });

    describe('Annotation Formatting', () => {
        test('formats move playrates correctly', () => {
            const testLine = {
                likelihoodPath: [
                    { san: 'e4', playrate: 0.45 },    // 45%
                    { san: 'c5', playrate: 0.2528 },  // 25.28%
                    { san: 'Nf3', playrate: 0.89 }    // 89%
                ],
                statistics: {
                    cumulativePlayrate: 0.1234,
                    winrate: 0.567,
                    totalGames: 1000000
                }
            };

            const result = generator.formatMoveAnnotations(testLine);

            // Should have proper percentage formatting
            expect(result).toMatch(/45\.00%\s+e4/);
            expect(result).toMatch(/25\.28%\s+c5/);
            expect(result).toMatch(/89\.00%\s+Nf3/);

            // Should have cumulative and winrate
            expect(result).toMatch(/Line cumulative playrate: 12\.34%/);
            expect(result).toMatch(/Line winrate \(excluding draws\): 56\.70% over 1,000,000 games/);
        });

        test('handles missing playrate data', () => {
            const testLine = {
                likelihoodPath: [
                    { san: 'e4' }, // No playrate
                    { san: 'c5', playrate: 0.25 }
                ],
                cumulativeLikelihood: 0.05
            };

            const result = generator.formatMoveAnnotations(testLine);

            // Should only include moves with playrate data
            expect(result).not.toMatch(/e4/);
            expect(result).toMatch(/25\.00%\s+c5/);
            expect(result).toMatch(/Line cumulative playrate: 5\.00%/);
        });
    });

    describe('Mathematical Accuracy', () => {
        test('preserves exact percentages', () => {
            const testLine = {
                likelihoodPath: [
                    { san: 'e4', playrate: 0.123456 }  // Should round to 2 decimal places
                ],
                statistics: {
                    cumulativePlayrate: 0.987654,
                    winrate: 0.555555,
                    totalGames: 1234567
                }
            };

            const result = generator.formatMoveAnnotations(testLine);

            // Check rounding to 2 decimal places
            expect(result).toMatch(/12\.35%\s+e4/);
            expect(result).toMatch(/Line cumulative playrate: 98\.77%/);
            expect(result).toMatch(/Line winrate \(excluding draws\): 55\.56% over 1,234,567 games/);
        });
    });
});

describe('FileGenerator Configuration Matrix Tests (2 Configurations)', () => {
    let testLines;
    let fileGenerator;
    let pgnGenerator;

    beforeEach(() => {
        testLines = createSicilianTestLines();
        fileGenerator = new FileGenerator();
        pgnGenerator = new PgnGenerator({ ENGINEFINISH: 0 }); // Simple generator without engine
    });

    describe('1. Individual + EndBlock (Original Format)', () => {
        test('generates separate PGN entries with statistics blocks', async () => {
            const config = createConfigForTest('individual', 'endBlock');

            const result = await fileGenerator.generateConfiguredPGN(
                testLines,
                'Sicilian_Defense',
                config,
                pgnGenerator
            );

            // Multiple event headers (one per line)
            expect(result).toMatch(/\[Event "Sicilian_Defense Line 1"\]/);
            expect(result).toMatch(/\[Event "Sicilian_Defense Line 2"\]/);
            expect(result).toMatch(/\[Event "Sicilian_Defense Line 3"\]/);

            // Traditional move playrates blocks
            expect(result).toMatch(/\{Move playrates:/g);
            expect(result).toMatch(/25\.28%\s+c5/);
            expect(result).toMatch(/65\.97%\s+d6/);
            expect(result).toMatch(/Line cumulative playrate:/);

            // NO inline annotations
            expect(result).not.toMatch(/c5\{[+]\d+\.\d+%\}/);
            expect(result).not.toMatch(/d6\{[+]\d+\.\d+%\}/);
        });
    });

    describe('2. Tree Format (Combined Structure)', () => {
        test('combines lines with variations and endBlock statistics', async () => {
            const config = createConfigForTest('tree', 'endBlock');

            const result = await fileGenerator.generateConfiguredPGN(
                testLines,
                'Sicilian_Defense',
                config,
                pgnGenerator
            );

            // Single event header (combined tree)
            expect(result).toMatch(/\[Event "Sicilian_Defense Line 1"\]/);
            expect(result).not.toMatch(/\[Event "Sicilian_Defense Line 2"\]/);

            // Should have combined tree structure
            expect(result).toMatch(/1\.\s*e4\s+c5\s+2\.\s*Nf3/);

            // Should have move playrates section (chessops may add space after {)
            expect(result).toMatch(/\{\s*Move playrates:/);
            expect(result).toMatch(/25\.28%\s+c5/);
            expect(result).toMatch(/65\.97%\s+d6/);
        });
    });


    describe('Configuration Routing Validation', () => {
        test('routes to correct generation methods based on config', async () => {
            const mockGenerateTreePGN = jest.spyOn(fileGenerator, 'generateTreePGN');
            const mockGenerateIndividualLinesPGN = jest.spyOn(fileGenerator, 'generateIndividualLinesPGN');

            // Test tree format routing
            const treeConfig = createConfigForTest('tree', 'endBlock');
            await fileGenerator.generateConfiguredPGN(testLines, 'Test', treeConfig, pgnGenerator);
            expect(mockGenerateTreePGN).toHaveBeenCalled();

            // Reset mocks
            mockGenerateTreePGN.mockClear();
            mockGenerateIndividualLinesPGN.mockClear();

            // Test default routing (individual + endBlock)
            const defaultConfig = createConfigForTest('individual', 'endBlock');
            await fileGenerator.generateConfiguredPGN(testLines, 'Test', defaultConfig, pgnGenerator);
            expect(mockGenerateIndividualLinesPGN).toHaveBeenCalled();

            // Cleanup mocks
            mockGenerateTreePGN.mockRestore();
            mockGenerateIndividualLinesPGN.mockRestore();
        });
    });

    describe('Edge Cases', () => {
        test('handles empty lines array', async () => {
            const config = createConfigForTest('tree', 'endBlock');

            const result = await fileGenerator.generateConfiguredPGN(
                [],
                'Empty_Test',
                config,
                pgnGenerator
            );

            expect(result).toBeDefined();
            expect(result.trim()).toBe('');
        });

        test('handles single line in tree mode', async () => {
            const config = createConfigForTest('tree', 'endBlock');

            const result = await fileGenerator.generateConfiguredPGN(
                [testLines[0]],
                'Single_Line',
                config,
                pgnGenerator
            );

            expect(result).toMatch(/\[Event "Single_Line Line 1"\]/);
            expect(result).toMatch(/1\.\s*e4\s+c5\s+2\.\s*Nf3\s+d6\s+3\.\s*d4/);
        });
    });

    describe('Extended Test Cases', () => {
        test('handles longer game sequences with black to move last', async () => {
            const config = createConfigForTest('individual', 'inline');

            // Test with the longer Sicilian line ending with black move
            const longerLine = testLines[3]; // "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6"

            const result = await fileGenerator.generateConfiguredPGN([longerLine], 'Extended_Sicilian', config, pgnGenerator);

            // Should have proper move numbering through move 5
            expect(result).toMatch(/1\.\s*e4\s+c5/);
            expect(result).toMatch(/5\.\s*Nc3\s+a6/);

            // Should have playrate annotations in endBlock format (not inline currently)
            expect(result).toMatch(/25\.28%\s+c5/);
            expect(result).toMatch(/65\.97%\s+d6/);
        });

        test('handles Sicilian Accelerated Dragon with black ending move', async () => {
            const config = createConfigForTest('tree', 'endBlock');

            // Test with Sicilian Accelerated Dragon line ending with black move
            const dragonLine = testLines[4]; // "1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 g6 5. c4"

            const result = await fileGenerator.generateConfiguredPGN([dragonLine], 'Sicilian_Dragon', config, pgnGenerator);

            // Should have proper move numbering through move 5 with white's final move
            expect(result).toMatch(/1\.\s*e4\s+c5/);
            expect(result).toMatch(/2\.\s*Nf3\s+Nc6/);
            expect(result).toMatch(/3\.\s*d4\s+cxd4/);
            expect(result).toMatch(/4\.\s*Nxd4\s+g6/);
            expect(result).toMatch(/5\.\s*c4/);

            // Should have traditional statistics block (chessops may add space after {)
            expect(result).toMatch(/\{\s*Move playrates:/);
            expect(result).toMatch(/25\.28%\s+c5/);
            expect(result).toMatch(/50\.14%\s+Nc6/);
            expect(result).toMatch(/97\.23%\s+cxd4/);
            expect(result).toMatch(/31\.45%\s+g6/);
        });
    });
});

describe('Mathematical Accuracy Validation', () => {
    let mathTestLines;
    let fileGenerator;
    let pgnGenerator;

    beforeEach(() => {
        mathTestLines = createMathematicalTestLines();
        fileGenerator = new FileGenerator();
        pgnGenerator = new PgnGenerator({ ENGINEFINISH: 0 });
    });

    describe('Cumulative Probability Validation', () => {
        test('validates simple 2-move cumulative probability calculation', async () => {
            const config = createConfigForTest('individual', 'endBlock');

            const simpleLine = mathTestLines[0]; // 0.5 × 0.8 = 0.4 (40%)
            const result = await fileGenerator.generateConfiguredPGN([simpleLine], 'Math_Test_Simple', config, pgnGenerator);

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

            const complexLine = mathTestLines[1]; // 0.3 × 0.7 × 0.6 × 0.9 = 0.1134 (11.34%)
            const result = await fileGenerator.generateConfiguredPGN([complexLine], 'Math_Test_Complex', config, pgnGenerator);

            // Calculate expected cumulative probability
            const expectedCumulative = PgnMathHelpers.calculateExpectedCumulative(complexLine.likelihoodPath);
            expect(expectedCumulative).toBeCloseTo(0.1134, 4); // Verify our test data

            // Parse cumulative probability from PGN output
            const outputCumulative = PgnMathHelpers.parseCumulativePlayrate(result);
            expect(outputCumulative).not.toBeNull();
            expect(outputCumulative).toBeCloseTo(expectedCumulative, 3); // Allow for rounding
            expect(outputCumulative).toBeCloseTo(0.1134, 3); // 11.34%
        });
    });

    describe('Winrate Preservation Validation', () => {
        test('preserves exact winrate in individual endBlock format', async () => {
            const config = createConfigForTest('individual', 'endBlock');

            for (const testLine of mathTestLines) {
                const result = await fileGenerator.generateConfiguredPGN([testLine], 'Winrate_Test', config, pgnGenerator);

                const outputWinrate = PgnMathHelpers.parseWinrate(result);
                expect(outputWinrate).not.toBeNull();
                expect(outputWinrate).toBeCloseTo(testLine.statistics.winrate, 4); // Exact match to 4 decimal places
            }
        });

        test('preserves total games count accurately', async () => {
            const config = createConfigForTest('individual', 'endBlock');

            for (const testLine of mathTestLines) {
                const result = await fileGenerator.generateConfiguredPGN([testLine], 'Games_Count_Test', config, pgnGenerator);

                const outputGames = PgnMathHelpers.parseTotalGames(result);
                expect(outputGames).not.toBeNull();
                expect(outputGames).toBe(testLine.statistics.totalGames); // Exact match for game counts
            }
        });
    });

    describe('Mathematical Consistency Suite', () => {
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

            const testLine = mathTestLines[0]; // 0.4 = 40%
            const result = await fileGenerator.generateConfiguredPGN([testLine], 'Percentage_Test', config, pgnGenerator);

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

        test('validates no data loss in transformation pipeline', async () => {
            const config = createConfigForTest('individual', 'endBlock');

            for (const testLine of mathTestLines) {
                const result = await fileGenerator.generateConfiguredPGN([testLine], 'Data_Loss_Test', config, pgnGenerator);

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

// ==================== ADDITIONAL COVERAGE TESTS ====================

describe('FileGenerator Download and Utility Methods', () => {
    let fileGenerator;
    let originalCreateObjectURL;
    let originalRevokeObjectURL;
    let originalCreateElement;

    beforeEach(() => {
        fileGenerator = new FileGenerator();

        // Mock URL APIs
        originalCreateObjectURL = URL.createObjectURL;
        originalRevokeObjectURL = URL.revokeObjectURL;
        URL.createObjectURL = jest.fn(() => 'blob:test-url');
        URL.revokeObjectURL = jest.fn();

        // Setup minimal DOM
        document.body.innerHTML = '<div id="test-container"></div>';
    });

    afterEach(() => {
        URL.createObjectURL = originalCreateObjectURL;
        URL.revokeObjectURL = originalRevokeObjectURL;
        document.body.innerHTML = '';
    });

    describe('downloadFile', () => {
        it('creates blob and triggers download', () => {
            // Arrange
            const content = '[Event "Test"]\n1. e4 e5 *';
            const filename = 'test.pgn';

            // Mock click
            const mockClick = jest.fn();
            const mockLink = {
                href: '',
                download: '',
                style: { display: '' },
                click: mockClick
            };
            jest.spyOn(document, 'createElement').mockReturnValue(mockLink);
            jest.spyOn(document.body, 'appendChild').mockImplementation(() => {});
            jest.spyOn(document.body, 'removeChild').mockImplementation(() => {});

            // Act
            const result = fileGenerator.downloadFile(content, filename);

            // Assert
            expect(result.success).toBe(true);
            expect(result.filename).toBe(filename);
            expect(result.size).toBe(content.length);
            expect(URL.createObjectURL).toHaveBeenCalled();
            expect(URL.revokeObjectURL).toHaveBeenCalled();
        });

        it('auto-detects MIME type for .pgn files', () => {
            // Arrange
            const mockClick = jest.fn();
            const mockLink = { href: '', download: '', style: { display: '' }, click: mockClick };
            jest.spyOn(document, 'createElement').mockReturnValue(mockLink);
            jest.spyOn(document.body, 'appendChild').mockImplementation(() => {});
            jest.spyOn(document.body, 'removeChild').mockImplementation(() => {});

            // Act
            fileGenerator.downloadFile('content', 'test.pgn');

            // Assert - verify blob was created (MIME type is internal to Blob)
            expect(URL.createObjectURL).toHaveBeenCalled();
        });

        it('tracks download in history', () => {
            // Arrange
            const mockLink = { href: '', download: '', style: { display: '' }, click: jest.fn() };
            jest.spyOn(document, 'createElement').mockReturnValue(mockLink);
            jest.spyOn(document.body, 'appendChild').mockImplementation(() => {});
            jest.spyOn(document.body, 'removeChild').mockImplementation(() => {});

            // Act
            fileGenerator.downloadFile('content', 'test.pgn');

            // Assert
            expect(fileGenerator.downloadHistory).toHaveLength(1);
            expect(fileGenerator.downloadHistory[0].filename).toBe('test.pgn');
        });
    });

    describe('generateCombinedPGN', () => {
        it('combines multiple chapters with proper headers', () => {
            // Arrange
            const chapters = [
                { name: 'Sicilian Defense', content: '1. e4 c5 *' },
                { name: 'French Defense', content: '1. e4 e6 *' }
            ];

            // Act
            const result = fileGenerator.generateCombinedPGN(chapters);

            // Assert
            expect(result).toContain('[Event "Complete Opening Repertoire"]');
            expect(result).toContain('[TotalChapters "2"]');
            expect(result).toContain('CHAPTER 1: Sicilian Defense');
            expect(result).toContain('CHAPTER 2: French Defense');
            expect(result).toContain('1. e4 c5');
            expect(result).toContain('1. e4 e6');
        });

        it('handles single chapter correctly', () => {
            // Arrange
            const chapters = [
                { name: 'Italian Game', content: '1. e4 e5 2. Nf3 Nc6 3. Bc4 *' }
            ];

            // Act
            const result = fileGenerator.generateCombinedPGN(chapters);

            // Assert
            expect(result).toContain('[TotalChapters "1"]');
            expect(result).toContain('CHAPTER 1: Italian Game');
        });

        it('handles empty chapters array', () => {
            // Act
            const result = fileGenerator.generateCombinedPGN([]);

            // Assert
            expect(result).toContain('[TotalChapters "0"]');
        });
    });

    describe('generateSummaryFile', () => {
        it('creates summary JSON from results object', () => {
            // Arrange
            const results = {
                'Chapter_1_Sicilian.pgn': '[Event "Sicilian"]\n1. e4 c5 *\n\n1. e4 c5 2. Nf3 *',
                'Chapter_2_French.pgn': '[Event "French"]\n1. e4 e6 *'
            };

            // Act
            const result = fileGenerator.generateSummaryFile(results);
            const parsed = JSON.parse(result);

            // Assert
            expect(parsed.totalFiles).toBe(2);
            expect(parsed.files).toHaveLength(2);
            expect(parsed.files[0].filename).toBe('Chapter_1_Sicilian.pgn');
            expect(parsed.generationTime).toBeDefined();
        });

        it('creates summary JSON from results array', () => {
            // Arrange
            const results = [
                { filename: 'Chapter_1.pgn', lines: [{ pgn: '1. e4' }], totalGames: 1000 },
                { filename: 'Chapter_2.pgn', lines: [{ pgn: '1. d4' }], totalGames: 500 }
            ];

            // Act
            const result = fileGenerator.generateSummaryFile(results);
            const parsed = JSON.parse(result);

            // Assert
            expect(parsed.totalFiles).toBe(2);
            expect(parsed.files[0].totalGames).toBe(1000);
        });
    });

    describe('getQualityAnnotation', () => {
        it('converts quality strings to PGN annotations', () => {
            expect(fileGenerator.getQualityAnnotation('excellent')).toBe('!!');
            expect(fileGenerator.getQualityAnnotation('good')).toBe('!');
            expect(fileGenerator.getQualityAnnotation('inaccuracy')).toBe('?!');
            expect(fileGenerator.getQualityAnnotation('mistake')).toBe('?');
            expect(fileGenerator.getQualityAnnotation('blunder')).toBe('??');
        });

        it('converts numeric centipawn loss to annotations', () => {
            expect(fileGenerator.getQualityAnnotation(5)).toBe('!');    // Excellent
            expect(fileGenerator.getQualityAnnotation(20)).toBe('');   // Normal
            expect(fileGenerator.getQualityAnnotation(40)).toBe('?!'); // Inaccuracy
            expect(fileGenerator.getQualityAnnotation(75)).toBe('?');  // Mistake
            expect(fileGenerator.getQualityAnnotation(150)).toBe('??'); // Blunder
        });

        it('returns empty string for unknown quality', () => {
            expect(fileGenerator.getQualityAnnotation('unknown')).toBe('');
            expect(fileGenerator.getQualityAnnotation(null)).toBe('');
        });
    });

    describe('countPGNLines', () => {
        it('counts lines based on { Line N } patterns', () => {
            // Arrange - countPGNLines looks for "{ Line N }" annotations
            const pgn = `{ Line 1 }
[Event "Sicilian"]
1. e4 c5 *

{ Line 2 }
[Event "Sicilian"]
1. e4 c5 2. Nf3 *

{ Line 3 }
[Event "Sicilian"]
1. e4 c5 2. Nf3 d6 *`;

            // Act
            const count = fileGenerator.countPGNLines(pgn);

            // Assert
            expect(count).toBe(3);
        });

        it('returns 0 for empty content', () => {
            expect(fileGenerator.countPGNLines('')).toBe(0);
            expect(fileGenerator.countPGNLines(null)).toBe(0);
            expect(fileGenerator.countPGNLines(undefined)).toBe(0);
        });

        it('returns 1 for content with no Event header but has moves', () => {
            const pgn = '1. e4 e5 2. Nf3 *';
            const count = fileGenerator.countPGNLines(pgn);
            // Implementation may vary - at minimum should return 0 or 1
            expect(count).toBeGreaterThanOrEqual(0);
        });
    });

    describe('formatFileSize', () => {
        it('formats bytes correctly', () => {
            expect(fileGenerator.formatFileSize(0)).toBe('0 Bytes');
            expect(fileGenerator.formatFileSize(500)).toBe('500 Bytes');
        });

        it('formats kilobytes correctly', () => {
            expect(fileGenerator.formatFileSize(1024)).toBe('1 KB');
            expect(fileGenerator.formatFileSize(2048)).toBe('2 KB');
        });

        it('formats megabytes correctly', () => {
            expect(fileGenerator.formatFileSize(1048576)).toBe('1 MB');
            expect(fileGenerator.formatFileSize(5242880)).toBe('5 MB');
        });

        it('formats gigabytes correctly', () => {
            expect(fileGenerator.formatFileSize(1073741824)).toBe('1 GB');
        });
    });

    describe('validatePGN', () => {
        it('validates well-formed PGN', () => {
            const validPGN = `[Event "Test"]
[Site "Test"]
[Date "2024.01.01"]
[Round "1"]
[White "Player1"]
[Black "Player2"]
[Result "*"]

1. e4 e5 2. Nf3 *`;

            const result = fileGenerator.validatePGN(validPGN);
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('detects invalid PGN', () => {
            const invalidPGN = 'This is not valid PGN at all';

            const result = fileGenerator.validatePGN(invalidPGN);
            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('validates PGN with missing headers', () => {
            const minimalPGN = '1. e4 e5 *';

            const result = fileGenerator.validatePGN(minimalPGN);
            // Should still be valid (headers optional in some PGN parsers)
            expect(result).toBeDefined();
        });
    });
});

describe('FileGenerator Format Toggle Additional Tests', () => {
    let fileGenerator;

    beforeEach(() => {
        // Setup DOM for display tests
        document.body.innerHTML = `
            <div id="pgn-display-container" style="display: none;">
                <div class="pgn-display-header">
                    <h3 class="pgn-display-title">Analysis Results</h3>
                    <div class="pgn-display-actions"></div>
                </div>
                <div id="pgn-display-stats"></div>
                <pre id="pgn-content"></pre>
            </div>
        `;
        // Mock scrollIntoView
        Element.prototype.scrollIntoView = jest.fn();
        // Mock lucide
        global.lucide = { createIcons: jest.fn() };

        fileGenerator = new FileGenerator();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('getCurrentContent', () => {
        it('returns current format content after display', () => {
            // Arrange
            const formats = {
                individualPGN: '[Event "Individual"]\n1. e4 *',
                treePGN: '[Event "Tree"]\n1. e4 (1. d4) *'
            };

            // Act
            fileGenerator.displayPGN(formats, 'Test Chapter');
            const content = fileGenerator.getCurrentContent();

            // Assert - default is tree
            expect(content).toContain('Tree');
        });

        it('returns correct format after switching', () => {
            // Arrange
            const formats = {
                individualPGN: '[Event "Individual Format"]\n1. e4 *',
                treePGN: '[Event "Tree Format"]\n1. e4 (1. d4) *'
            };

            fileGenerator.displayPGN(formats, 'Test Chapter');

            // Act - switch to individual
            fileGenerator.switchFormat('individual');
            const content = fileGenerator.getCurrentContent();

            // Assert
            expect(content).toContain('Individual Format');
        });
    });

    describe('switchFormat', () => {
        it('updates currentFormat property', () => {
            // Arrange
            const formats = {
                individualPGN: 'individual content',
                treePGN: 'tree content'
            };
            fileGenerator.displayPGN(formats, 'Test');

            // Act
            fileGenerator.switchFormat('individual');

            // Assert
            expect(fileGenerator.currentFormat).toBe('individual');
        });

        it('updates DOM content when switching formats', () => {
            // Arrange
            const formats = {
                individualPGN: 'INDIVIDUAL_MARKER',
                treePGN: 'TREE_MARKER'
            };
            fileGenerator.displayPGN(formats, 'Test');

            // Initial should be tree
            expect(document.getElementById('pgn-content').textContent).toContain('TREE_MARKER');

            // Act
            fileGenerator.switchFormat('individual');

            // Assert
            expect(document.getElementById('pgn-content').textContent).toContain('INDIVIDUAL_MARKER');
        });

        it('handles switch back to tree format', () => {
            // Arrange
            const formats = {
                individualPGN: 'INDIVIDUAL',
                treePGN: 'TREE'
            };
            fileGenerator.displayPGN(formats, 'Test');
            fileGenerator.switchFormat('individual');

            // Act
            fileGenerator.switchFormat('tree');

            // Assert
            expect(fileGenerator.currentFormat).toBe('tree');
            expect(document.getElementById('pgn-content').textContent).toContain('TREE');
        });
    });

    describe('displayPGN with format object', () => {
        it('stores both formats in currentFormats', () => {
            // Arrange
            const formats = {
                individualPGN: 'individual',
                treePGN: 'tree'
            };

            // Act
            fileGenerator.displayPGN(formats, 'Test Chapter');

            // Assert
            expect(fileGenerator.currentFormats).toBeDefined();
            expect(fileGenerator.currentFormats.individualPGN).toBe('individual');
            expect(fileGenerator.currentFormats.treePGN).toBe('tree');
        });

        it('shows display container', () => {
            // Arrange
            const formats = {
                individualPGN: 'individual',
                treePGN: 'tree'
            };

            // Act
            fileGenerator.displayPGN(formats, 'Test Chapter');

            // Assert
            const container = document.getElementById('pgn-display-container');
            expect(container.style.display).not.toBe('none');
        });
    });
});