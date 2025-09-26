/**
 * FileGenerator Configuration Matrix Tests
 * Tests all 4 configuration combinations for PGN output formats via FileGenerator
 */

import FileGenerator from '../src/ui/FileGenerator.js';
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
        ENGINEFINISH: 0  // Disable engine completion for tests
    });
};

describe('FileGenerator Configuration Matrix Tests (All 4 Combinations)', () => {
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

            // Note: Individual + Inline should still use endBlock format
            // since inline is primarily for tree mode
            expect(result).toMatch(/\{Move playrates:/);
            expect(result).toMatch(/\+25\.28%\s+c5/);

            // Should NOT have inline annotations in individual mode
            expect(result).not.toMatch(/c5\{[+]25\.28%\}/);
        });
    });

    describe('3. Tree + EndBlock (New Format)', () => {
        test('combines lines with variations and statistics blocks', async () => {
            const config = createConfigForTest('tree', 'endBlock');

            const result = await fileGenerator.generateConfiguredPGN(
                testLines,
                'Sicilian_Defense',
                config,
                pgnGenerator
            );

            console.log('Tree + EndBlock result:', result);

            // Single event header (combined tree)
            expect(result).toMatch(/\[Event "Sicilian_Defense Line 1"\]/);
            expect(result).not.toMatch(/\[Event "Sicilian_Defense Line 2"\]/);

            // Should have combined tree structure
            expect(result).toMatch(/1\.\s*e4\s+c5\s+2\.\s*Nf3/);

            // Should have move playrates section
            expect(result).toMatch(/\{Move playrates:/);
            expect(result).toMatch(/\+25\.28%\s+c5/);
            expect(result).toMatch(/\+65\.97%\s+d6/);
        });
    });

    describe('4. Tree + Inline (New Format)', () => {
        test('combines lines with variations and inline annotations', async () => {
            const config = createConfigForTest('tree', 'inline');

            const result = await fileGenerator.generateConfiguredPGN(
                testLines,
                'Sicilian_Defense',
                config,
                pgnGenerator
            );

            console.log('Tree + Inline result:', result);

            // Single event header (combined tree)
            expect(result).toMatch(/\[Event "Sicilian_Defense Line 1"\]/);
            expect(result).not.toMatch(/\[Event "Sicilian_Defense Line 2"\]/);

            // Should have combined tree structure
            expect(result).toMatch(/1\.\s*e4\s+c5\s+2\.\s*Nf3/);

            // NO traditional playrates blocks in inline mode
            expect(result).not.toMatch(/\{Move playrates:/);
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
            const config = createConfigForTest('tree', 'inline');

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
});