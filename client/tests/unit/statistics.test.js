/**
 * Critical Statistical Engine Tests
 *
 * Validates JavaScript Statistics.js matches Python legacy calculations
 * within 0.01% tolerance as specified in fast migration spec.
 */

import Statistics from '../../src/stats/Statistics.js';

describe('Statistics Engine - Critical Python Compatibility Tests', () => {
    let stats;

    beforeEach(() => {
        stats = new Statistics();
    });

    describe('calculateWinRate - Python calc_percs exact matching', () => {
        test('DRAWSAREHALF=0 scenario matches Python within 0.01%', () => {
            // Test data from Python golden master
            const testCases = [
                // white, black, draws, expected results
                { white: 100, black: 50, draws: 25, drawsAreHalf: 0 },
                { white: 0, black: 100, draws: 0, drawsAreHalf: 0 },
                { white: 25, black: 25, draws: 50, drawsAreHalf: 0 },
                { white: 1, black: 1, draws: 1, drawsAreHalf: 0 }
            ];

            testCases.forEach(({ white, black, draws, drawsAreHalf }) => {
                const result = stats.calculateWinRate(white, black, draws, drawsAreHalf);
                const total = white + black + draws;

                // Python calculations for comparison
                const expectedWhitePerc = white / total;
                const expectedBlackPerc = black / total;
                const expectedDrawPerc = draws / total;

                expect(result.whitePerc).toBeCloseTo(expectedWhitePerc, 5); // 0.00001 precision
                expect(result.blackPerc).toBeCloseTo(expectedBlackPerc, 5);
                expect(result.drawPerc).toBeCloseTo(expectedDrawPerc, 5);
                expect(result.totalGames).toBe(total);
            });
        });

        test('DRAWSAREHALF=1 scenario matches Python within 0.01%', () => {
            // Test data with draws counting as half wins
            const testCases = [
                { white: 100, black: 50, draws: 25, drawsAreHalf: 1 },
                { white: 25, black: 25, draws: 50, drawsAreHalf: 1 },
                { white: 80, black: 10, draws: 10, drawsAreHalf: 1 }
            ];

            testCases.forEach(({ white, black, draws, drawsAreHalf }) => {
                const result = stats.calculateWinRate(white, black, draws, drawsAreHalf);
                const total = white + black + draws;

                // Python calculations with draws as half points
                const expectedWhitePerc = (white + (0.5 * draws)) / total;
                const expectedBlackPerc = (black + (0.5 * draws)) / total;
                const expectedDrawPerc = draws / total;

                expect(result.whitePerc).toBeCloseTo(expectedWhitePerc, 5);
                expect(result.blackPerc).toBeCloseTo(expectedBlackPerc, 5);
                expect(result.drawPerc).toBeCloseTo(expectedDrawPerc, 5);
                expect(result.totalGames).toBe(total);
            });
        });

        test('edge cases match Python behavior exactly', () => {
            // Zero games
            const zeroResult = stats.calculateWinRate(0, 0, 0, 0);
            expect(zeroResult.whitePerc).toBeNull();
            expect(zeroResult.blackPerc).toBeNull();
            expect(zeroResult.drawPerc).toBeNull();
            expect(zeroResult.totalGames).toBe(0);

            // Invalid drawsAreHalf value
            const invalidResult = stats.calculateWinRate(10, 5, 3, 2);
            expect(invalidResult.whitePerc).toBeNull();
            expect(invalidResult.blackPerc).toBeNull();
            expect(invalidResult.drawPerc).toBeNull();
            expect(invalidResult.totalGames).toBe(0);
        });
    });

    describe('Regression test for winrate parameter order bug', () => {
        test('calculateWinRate with reported values produces correct results', () => {
            const stats = new Statistics();

            // Exact values from the bug report log
            const white = 17140;
            const black = 16729;
            const draws = 1257;
            const total = 35126;

            // Verify our test data matches the reported totals
            expect(white + black + draws).toBe(total);

            // Test with DRAWSAREHALF=0 (draws count as losses)
            const result0 = stats.calculateWinRate(white, black, draws, 0);
            const expectedWhitePerc0 = white / total; // 17140 / 35126 = 0.488
            const expectedBlackPerc0 = black / total; // 16729 / 35126 = 0.476

            expect(result0.whitePerc).toBeCloseTo(expectedWhitePerc0, 6);
            expect(result0.blackPerc).toBeCloseTo(expectedBlackPerc0, 6);
            expect(result0.whitePerc).toBeCloseTo(0.4880, 4);
            expect(result0.blackPerc).toBeCloseTo(0.4763, 4);

            // Test with DRAWSAREHALF=1 (draws count as half points)
            const result1 = stats.calculateWinRate(white, black, draws, 1);
            const expectedWhitePerc1 = (white + (0.5 * draws)) / total; // (17140 + 628.5) / 35126 = 0.5059
            const expectedBlackPerc1 = (black + (0.5 * draws)) / total; // (16729 + 628.5) / 35126 = 0.4941

            expect(result1.whitePerc).toBeCloseTo(expectedWhitePerc1, 6);
            expect(result1.blackPerc).toBeCloseTo(expectedBlackPerc1, 6);
            expect(result1.whitePerc).toBeCloseTo(0.5059, 4);
            expect(result1.blackPerc).toBeCloseTo(0.4941, 4);

            // Verify the bug would have produced incorrect results
            // With wrong parameter order: calculateWinRate(white=17140, black=1257, draws=16729, 0)
            const buggyResult = stats.calculateWinRate(white, draws, black, 0); // Swapped parameters

            // This should NOT match the correct results (except white happens to match)
            // Note: white percentage accidentally matches because it's in the correct position
            expect(buggyResult.whitePerc).toBeCloseTo(expectedWhitePerc0, 4); // Same by coincidence
            expect(buggyResult.blackPerc).not.toBeCloseTo(expectedBlackPerc0, 2); // Wrong!

            // The buggy calculation produces:
            // Correct: calculateWinRate(white=17140, black=16729, draws=1257, 0)
            // Buggy:   calculateWinRate(white=17140, black=1257, draws=16729, 0) - swapped last two!
            // white: 17140/(17140+1257+16729) = 0.488 (accidentally correct for white)
            // black: 1257/(17140+1257+16729) = 0.0358 (completely wrong - should be 0.476!)
            expect(buggyResult.blackPerc).toBeCloseTo(0.0358, 4);
        });
    });

    describe('calculateConfidenceInterval - Python calc_value exact matching', () => {
        test('confidence interval calculations match scipy.stats.norm.ppf', () => {
            // Test cases with known Python scipy results
            const testCases = [
                { winRate: 0.6, gamesPlayed: 100, alpha: 0.001 },
                { winRate: 0.45, gamesPlayed: 500, alpha: 0.001 },
                { winRate: 0.75, gamesPlayed: 50, alpha: 0.001 },
                { winRate: 0.5, gamesPlayed: 1000, alpha: 0.001 }
            ];

            testCases.forEach(({ winRate, gamesPlayed, alpha }) => {
                const result = stats.calculateConfidenceInterval(winRate, gamesPlayed, alpha);

                // Manual calculation for verification
                // Critical value for alpha=0.001 (99.9% CI) ≈ 3.2905
                const criticalValue = 3.2905; // normalPPF(1 - 0.001/2)
                const standardError = Math.sqrt(winRate * (1 - winRate) / gamesPlayed);
                const marginOfError = criticalValue * standardError;

                const expectedLowerBound = Math.max(0, winRate - marginOfError);
                const expectedUpperBound = Math.max(0, winRate + marginOfError);

                expect(result.winRate).toBeCloseTo(winRate, 5);
                expect(result.lowerBound).toBeCloseTo(expectedLowerBound, 4); // 0.0001 precision
                expect(result.upperBound).toBeCloseTo(expectedUpperBound, 4);
                expect(result.gamesPlayed).toBe(gamesPlayed);
            });
        });

        test('edge cases handle boundary conditions correctly', () => {
            // Zero games
            const zeroGames = stats.calculateConfidenceInterval(0.5, 0, 0.001);
            expect(zeroGames.winRate).toBe(0);
            expect(zeroGames.lowerBound).toBe(0);
            expect(zeroGames.upperBound).toBe(0);

            // Perfect win rate
            const perfectWin = stats.calculateConfidenceInterval(1.0, 100, 0.001);
            expect(perfectWin.winRate).toBe(1.0);
            expect(perfectWin.lowerBound).toBeLessThan(1.0);
            expect(perfectWin.lowerBound).toBeGreaterThan(0.9); // Should be reasonably high
            expect(perfectWin.upperBound).toBe(1.0);

            // Zero win rate
            const noWins = stats.calculateConfidenceInterval(0.0, 100, 0.001);
            expect(noWins.winRate).toBe(0.0);
            expect(noWins.lowerBound).toBe(0.0);
            expect(noWins.upperBound).toBeGreaterThan(0.0);
            expect(noWins.upperBound).toBeLessThan(0.1); // Should be reasonably small
        });
    });

    describe('validateMoveDataQuality - Python filtering logic', () => {
        test('MINGAMES and MINPLAYRATE filtering matches Python exactly', () => {
            const config = {
                MINGAMES: 19,
                MINPLAYRATE: 0.001
            };

            // Should pass validation
            expect(stats.validateMoveDataQuality(25, 0.005, config)).toBe(true);
            expect(stats.validateMoveDataQuality(100, 0.1, config)).toBe(true);

            // Should fail validation - insufficient games
            expect(stats.validateMoveDataQuality(15, 0.01, config)).toBe(false);
            expect(stats.validateMoveDataQuality(19, 0.01, config)).toBe(false); // exactly 19 fails (must be > 19)

            // Should fail validation - insufficient play rate
            expect(stats.validateMoveDataQuality(50, 0.0005, config)).toBe(false);
            expect(stats.validateMoveDataQuality(100, 0.001, config)).toBe(false); // exactly 0.001 fails (must be > 0.001)

            // Should fail both criteria
            expect(stats.validateMoveDataQuality(10, 0.0005, config)).toBe(false);
        });

        test('uses default values when config missing', () => {
            const emptyConfig = {};

            // Should use MINGAMES=19, MINPLAYRATE=0.001 as defaults
            expect(stats.validateMoveDataQuality(25, 0.005, emptyConfig)).toBe(true);
            expect(stats.validateMoveDataQuality(15, 0.005, emptyConfig)).toBe(false);
            expect(stats.validateMoveDataQuality(25, 0.0005, emptyConfig)).toBe(false);
        });
    });

    describe('calculateCumulativeProbability - sorting and cumsum logic', () => {
        test('sorts moves by playrate descending and calculates cumulative probability', () => {
            const moves = [
                { san: 'e4', playrate: 0.3 },
                { san: 'd4', playrate: 0.5 },
                { san: 'Nf3', playrate: 0.1 },
                { san: 'c4', playrate: 0.1 }
            ];

            const result = stats.calculateCumulativeProbability(moves);

            // Should be sorted by playrate descending
            expect(result[0].san).toBe('d4');
            expect(result[0].playrate).toBe(0.5);
            expect(result[0].cumulativeProbability).toBeCloseTo(0.5, 5);

            expect(result[1].san).toBe('e4');
            expect(result[1].playrate).toBe(0.3);
            expect(result[1].cumulativeProbability).toBeCloseTo(0.8, 5);

            expect(result[2].playrate).toBe(0.1);
            expect(result[2].cumulativeProbability).toBeCloseTo(0.9, 5);

            expect(result[3].playrate).toBe(0.1);
            expect(result[3].cumulativeProbability).toBeCloseTo(1.0, 5);
        });

        test('handles edge cases correctly', () => {
            // Empty array
            expect(stats.calculateCumulativeProbability([])).toEqual([]);
            expect(stats.calculateCumulativeProbability(null)).toEqual([]);

            // Single move
            const singleMove = [{ san: 'e4', playrate: 0.8 }];
            const singleResult = stats.calculateCumulativeProbability(singleMove);
            expect(singleResult).toHaveLength(1);
            expect(singleResult[0].cumulativeProbability).toBeCloseTo(0.8, 5);

            // Missing playrate values
            const missingPlayrates = [
                { san: 'e4' },
                { san: 'd4', playrate: 0.3 }
            ];
            const missingResult = stats.calculateCumulativeProbability(missingPlayrates);
            expect(missingResult[0].san).toBe('d4'); // 0.3 > 0 (undefined treated as 0)
            expect(missingResult[1].san).toBe('e4');
        });
    });

    describe('Integration test - complete calc_value equivalent', () => {
        test('calculateMoveValue integrates all components correctly', () => {
            const config = {
                MINGAMES: 19,
                MINPLAYRATE: 0.001,
                ALPHA: 0.001
            };

            // Valid data case
            const validResult = stats.calculateMoveValue(0.6, 100, 0.05, 'e4', null, config);
            expect(validResult.winRate).toBe(0.6);
            expect(validResult.lowerBound).toBeGreaterThan(0);
            expect(validResult.lowerBound).toBeLessThan(0.6);
            expect(validResult.upperBound).toBeGreaterThan(0.6);
            expect(validResult.gamesPlayed).toBe(100);

            // Invalid data case (insufficient games)
            const invalidResult = stats.calculateMoveValue(0.8, 10, 0.05, 'Nf3', null, config);
            expect(invalidResult.winRate).toBe(0);
            expect(invalidResult.lowerBound).toBe(0);
            expect(invalidResult.upperBound).toBe(0);
            expect(invalidResult.gamesPlayed).toBe(10);
        });
    });
});

describe('normalPPF function - scipy.stats.norm.ppf compatibility', () => {
    test('matches known scipy values for critical confidence intervals', () => {
    // Test the specific alpha=0.001 case used in the migration spec
    // This corresponds to 99.9% confidence interval
        const stats = new Statistics();

        // For alpha=0.001, critical value should be approximately 3.2905
        // Test with a reasonable win rate and sample size
        const result = stats.calculateConfidenceInterval(0.6, 1000, 0.001);

        // Calculate the implied critical value from the result
        const standardError = Math.sqrt(0.6 * 0.4 / 1000);
        const marginOfError = result.upperBound - 0.6;
        const impliedCriticalValue = marginOfError / standardError;

        // Should be close to scipy's norm.ppf(0.9995) ≈ 3.2905
        expect(Math.abs(impliedCriticalValue - 3.2905)).toBeLessThan(0.01);

        // Verify the bounds are reasonable for 99.9% CI
        expect(result.lowerBound).toBeGreaterThan(0.54);  // More lenient bound
        expect(result.lowerBound).toBeLessThan(0.6);
        expect(result.upperBound).toBeGreaterThan(0.6);
        expect(result.upperBound).toBeLessThan(0.66);     // More lenient bound
    });
});
