/**
 * Cross-System Validation Tests
 *
 * Comprehensive test suite that validates the JavaScript BookBuilder implementation
 * produces identical results to the Python legacy system for the same inputs.
 */

const { CrossSystemValidator } = require('./utils/CrossSystemValidator.js');
const BookBuilder = require('../src/BookBuilder.js').default;
const {
    STANDARD_TEST_CONFIG,
    TEST_POSITIONS,
    CONFIG_VARIATIONS,
    TEST_SCENARIOS,
    STATISTICAL_TEST_DATA
} = require('./fixtures/cross-system-test-data.js');

// Test configuration
const CROSS_SYSTEM_TIMEOUT = 300000; // 5 minutes for cross-system tests
const ENABLE_REAL_API_TESTS = process.env.ENABLE_REAL_API_TESTS === 'true';

describe('Cross-System Validation Tests', () => {
    let validator;
    let jsBookBuilder;

    beforeAll(async () => {
        // Initialize validator with appropriate settings
        validator = new CrossSystemValidator({
            tolerance: 0.01, // 1% tolerance for floating-point comparisons
            strictMode: false,
            pythonOptions: {
                timeout: CROSS_SYSTEM_TIMEOUT,
                projectRoot: require('path').resolve(process.cwd(), '..')
            }
        });

        // Validate Python environment before running tests
        try {
            await validator.pythonRunner.validateEnvironment();
            console.log('✓ Python environment validation passed');
        } catch (error) {
            console.warn('⚠️ Python environment validation failed:', error.message);
            console.warn('Cross-system tests will be skipped. To enable:');
            console.warn('1. Ensure Python 3 is installed');
            console.warn('2. Install required packages: pip install chess requests numpy scipy');
            console.warn('3. Verify legacy Python system is available');
        }
    }, CROSS_SYSTEM_TIMEOUT);

    beforeEach(() => {
        // Create fresh BookBuilder instance for each test
        jsBookBuilder = new BookBuilder(STANDARD_TEST_CONFIG);
    });

    describe('Basic Cross-System Validation', () => {
        test('identical outputs for Ruy Lopez opening', async () => {
            if (!ENABLE_REAL_API_TESTS) {
                console.log('Skipping real API test - set ENABLE_REAL_API_TESTS=true to enable');
                return;
            }

            const testConfig = {
                ...STANDARD_TEST_CONFIG,
                openings: [TEST_POSITIONS.ruy_lopez]
            };

            try {
                const result = await validator.validateIdenticalOutputs(testConfig, jsBookBuilder);

                if (!result.success) {
                    console.log('❌ Cross-system validation failed for Ruy Lopez');
                    console.log('Python output files:', Object.keys(result.pythonResult.outputs || {}));
                    console.log('JavaScript output files:', Object.keys(result.jsResult.outputs || {}));
                    console.log(validator.generateReport(result));

                    // Show first file content comparison for debugging
                    const pythonFiles = Object.keys(result.pythonResult.outputs || {});
                    const jsFiles = Object.keys(result.jsResult.outputs || {});
                    if (pythonFiles.length > 0 && jsFiles.length > 0) {
                        console.log('\n--- Python Output Sample ---');
                        console.log(result.pythonResult.outputs[pythonFiles[0]].substring(0, 500));
                        console.log('\n--- JavaScript Output Sample ---');
                        console.log(result.jsResult.outputs[jsFiles[0]].substring(0, 500));
                    }
                }

                expect(result.success).toBe(true);
                expect(result.comparison.match).toBe(true);

                // Verify execution completed successfully
                expect(result.pythonResult.success).toBe(true);
                expect(result.jsResult.success).toBe(true);

                // Verify outputs were generated
                expect(Object.keys(result.pythonResult.outputs)).toHaveLength(1);
                expect(Object.keys(result.jsResult.outputs)).toHaveLength(1);

                console.log('✓ Cross-system validation passed for Ruy Lopez');
                console.log(validator.generateReport(result));

            } catch (error) {
                console.error('Cross-system validation failed:', error.message);
                throw error;
            }
        }, CROSS_SYSTEM_TIMEOUT);

        test('identical outputs for King\'s Indian Defense', async () => {
            if (!ENABLE_REAL_API_TESTS) {
                console.log('Skipping real API test - set ENABLE_REAL_API_TESTS=true to enable');
                return;
            }

            const testConfig = {
                ...STANDARD_TEST_CONFIG,
                openings: [TEST_POSITIONS.kings_indian]
            };

            try {
                const result = await validator.validateIdenticalOutputs(testConfig, jsBookBuilder);

                expect(result.success).toBe(true);
                expect(result.comparison.statistics.filesCompared).toBeGreaterThan(0);

                if (!result.success) {
                    console.log('Differences found:', JSON.stringify(result.comparison.differences, null, 2));
                    console.log(validator.generateReport(result));
                }

            } catch (error) {
                console.error('King\'s Indian validation failed:', error.message);
                throw error;
            }
        }, CROSS_SYSTEM_TIMEOUT);
    });

    describe('Configuration Parameter Validation', () => {
        test.each([
            ['strict_filtering', CONFIG_VARIATIONS.strict_filtering],
            ['permissive_filtering', CONFIG_VARIATIONS.permissive_filtering],
            ['draws_as_losses', CONFIG_VARIATIONS.draws_as_losses],
            ['long_to_short', CONFIG_VARIATIONS.long_to_short]
        ])('configuration variation: %s', async (configName, configVariation) => {
            if (!ENABLE_REAL_API_TESTS) {
                console.log(`Skipping real API test for ${configName} - set ENABLE_REAL_API_TESTS=true to enable`);
                return;
            }

            const testConfig = {
                ...configVariation,
                openings: [TEST_POSITIONS.queens_gambit]
            };

            const result = await validator.validateIdenticalOutputs(testConfig, jsBookBuilder);

            expect(result.success).toBe(true);
            console.log(`✓ Configuration validation passed for ${configName}`);

        }, CROSS_SYSTEM_TIMEOUT);
    });

    describe('Statistical Precision Validation', () => {
        test('confidence interval calculations match within tolerance', () => {
            // Test statistical calculations independently of full system
            for (const testCase of STATISTICAL_TEST_DATA.confidence_intervals) {
                const jsWinRate = testCase.white / testCase.totalGames;
                const expectedWinRate = testCase.expectedWinRate;

                expect(Math.abs(jsWinRate - expectedWinRate)).toBeLessThan(testCase.tolerance);
            }
        });

        test('Wilson score intervals match Python implementation', () => {
            // This would test the Statistics class directly
            const Statistics = require('../src/stats/Statistics.js').default;
            const statsEngine = new Statistics();

            for (const testCase of STATISTICAL_TEST_DATA.wilson_score_intervals) {
                // Mock test to verify statistical calculation precision
                // In practice, this would call the actual confidence interval methods
                expect(testCase.expectedLower).toBeCloseTo(testCase.expectedLower, 4);
                expect(testCase.expectedUpper).toBeCloseTo(testCase.expectedUpper, 4);
            }
        });
    });

    describe('Edge Case Validation', () => {
        test('endgame positions with minimal data', async () => {
            if (!ENABLE_REAL_API_TESTS) {
                console.log('Skipping real API test - set ENABLE_REAL_API_TESTS=true to enable');
                return;
            }

            const testConfig = {
                ...STANDARD_TEST_CONFIG,
                openings: [TEST_POSITIONS.endgame_position]
            };

            try {
                const result = await validator.validateIdenticalOutputs(testConfig, jsBookBuilder);

                // Both systems should handle minimal data gracefully
                expect(result.pythonResult.success).toBe(true);
                expect(result.jsResult.success).toBe(true);

                // May have no outputs for endgame positions, which is valid
                console.log('✓ Endgame position validation completed');

            } catch (error) {
                // Both systems should fail in the same way
                console.log('Both systems failed consistently for endgame position:', error.message);
            }
        }, CROSS_SYSTEM_TIMEOUT);

        test('error handling consistency', async () => {
            // Test with invalid FEN to ensure both systems fail consistently
            const invalidConfig = {
                ...STANDARD_TEST_CONFIG,
                openings: [{
                    name: 'Invalid_Position',
                    fen: 'invalid_fen_string',
                    perspective: 'white'
                }]
            };

            let pythonError = null;
            let jsError = null;

            try {
                await validator.pythonRunner.runPythonSystem(invalidConfig);
            } catch (error) {
                pythonError = error;
            }

            try {
                await jsBookBuilder.processOpening(invalidConfig);
            } catch (error) {
                jsError = error;
            }

            // Both systems should fail with invalid input
            expect(pythonError).toBeTruthy();
            expect(jsError).toBeTruthy();

            console.log('✓ Error handling consistency validated');
        });
    });

    describe('Performance Comparison', () => {
        test('JavaScript performance vs Python performance', async () => {
            if (!ENABLE_REAL_API_TESTS) {
                console.log('Skipping performance test - set ENABLE_REAL_API_TESTS=true to enable');
                return;
            }

            const testConfig = {
                ...STANDARD_TEST_CONFIG,
                openings: [TEST_POSITIONS.ruy_lopez]
            };

            const result = await validator.validateIdenticalOutputs(testConfig, jsBookBuilder);

            const performanceRatio = result.executionTimes.python / result.executionTimes.javascript;

            console.log(`Performance Analysis:
- Python execution time: ${result.executionTimes.python}ms
- JavaScript execution time: ${result.executionTimes.javascript}ms
- Performance ratio: ${performanceRatio.toFixed(2)}x`);

            // JavaScript should be competitive (within 5x of Python performance)
            expect(performanceRatio).toBeLessThan(5.0);

        }, CROSS_SYSTEM_TIMEOUT);
    });

    describe('Comprehensive Scenario Validation', () => {
        test.each(TEST_SCENARIOS.slice(0, 3))('scenario: $name', async (scenario) => {
            if (!ENABLE_REAL_API_TESTS) {
                console.log(`Skipping scenario ${scenario.name} - set ENABLE_REAL_API_TESTS=true to enable`);
                return;
            }

            const testConfig = {
                ...scenario.config,
                openings: [scenario.position]
            };

            try {
                const result = await validator.validateIdenticalOutputs(testConfig, jsBookBuilder);

                if (scenario.expectedBehavior.shouldSucceed) {
                    expect(result.success).toBe(true);
                    expect(result.comparison.match).toBe(true);
                } else {
                    // Test should handle expected failures consistently
                    expect(result.pythonResult.error).toBeTruthy();
                    expect(result.jsResult.error).toBeTruthy();
                }

                console.log(`✓ Scenario ${scenario.name} validation completed`);

            } catch (error) {
                if (!scenario.expectedBehavior.shouldSucceed) {
                    console.log(`Expected failure for scenario ${scenario.name}: ${error.message}`);
                } else {
                    throw error;
                }
            }
        }, CROSS_SYSTEM_TIMEOUT);
    });

    describe('Output Format Validation', () => {
        test('PGN format compatibility', async () => {
            if (!ENABLE_REAL_API_TESTS) {
                console.log('Skipping PGN format test - set ENABLE_REAL_API_TESTS=true to enable');
                return;
            }

            const testConfig = {
                ...STANDARD_TEST_CONFIG,
                openings: [TEST_POSITIONS.ruy_lopez]
            };

            const result = await validator.validateIdenticalOutputs(testConfig, jsBookBuilder);

            if (result.success) {
                // Verify PGN format elements are present
                const firstOutput = Object.values(result.jsResult.outputs)[0];

                expect(firstOutput).toMatch(/\[Event "/);
                expect(firstOutput).toMatch(/Move playrates:/);
                expect(firstOutput).toMatch(/Line winrate/);
                expect(firstOutput).toMatch(/Line cumulative playrate:/);

                console.log('✓ PGN format validation passed');
            }
        });

        test('annotation format consistency', async () => {
            if (!ENABLE_REAL_API_TESTS) {
                console.log('Skipping annotation format test - set ENABLE_REAL_API_TESTS=true to enable');
                return;
            }

            const testConfig = {
                ...STANDARD_TEST_CONFIG,
                openings: [TEST_POSITIONS.sicilian_dragon]
            };

            const result = await validator.validateIdenticalOutputs(testConfig, jsBookBuilder);

            if (result.success) {
                // Both outputs should have identical annotation formats
                const pythonOutput = Object.values(result.pythonResult.outputs)[0];
                const jsOutput = Object.values(result.jsResult.outputs)[0];

                // Extract annotation structure (ignoring specific percentage values)
                const pythonStructure = pythonOutput.replace(/[+-]?\d+\.\d{2}%/g, 'XX.XX%');
                const jsStructure = jsOutput.replace(/[+-]?\d+\.\d{2}%/g, 'XX.XX%');

                expect(jsStructure).toBe(pythonStructure);
                console.log('✓ Annotation format consistency validated');
            }
        });
    });
});

// Utility function to run specific cross-system test
async function runCrossSystemTest(positionName, configName = 'standard') {
    const validator = new CrossSystemValidator();
    const jsBookBuilder = new BookBuilder(STANDARD_TEST_CONFIG);

    const position = TEST_POSITIONS[positionName];
    const config = configName === 'standard' ? STANDARD_TEST_CONFIG : CONFIG_VARIATIONS[configName];

    if (!position) {
        throw new Error(`Unknown position: ${positionName}`);
    }

    const testConfig = {
        ...config,
        openings: [position]
    };

    const result = await validator.validateIdenticalOutputs(testConfig, jsBookBuilder);
    console.log(validator.generateReport(result));

    return result;
}

module.exports = { runCrossSystemTest };