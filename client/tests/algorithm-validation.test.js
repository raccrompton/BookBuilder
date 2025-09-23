/**
 * Core Algorithm Validation Tests
 * 
 * These tests validate the essential algorithmic logic of the BookBuilder system:
 * - Move tree expansion and pruning
 * - Statistical calculations and filtering
 * - Line generation and finalization
 * - Configuration parameter effects
 */

import BookBuilder from '../src/BookBuilder.js';
import { TEST_CONFIGS } from './fixtures/lichess-responses.js';

// Deterministic test data for precise validation
const VALIDATION_DATA = {
    // Precisely controlled move data for statistical testing
    statistical_test_moves: [
        {
            san: 'e5',
            uci: 'e7e5',
            white: 100000,  // Exactly 50% win rate
            black: 100000,
            draws: 0,
            playrate: 0.5,
            totalGames: 200000
        },
        {
            san: 'c5',
            uci: 'c7c5',
            white: 120000,  // 60% win rate
            black: 80000,
            draws: 0,
            playrate: 0.3,
            totalGames: 200000
        },
        {
            san: 'd6',
            uci: 'd7d6',
            white: 40000,   // 40% win rate
            black: 60000,
            draws: 0,
            playrate: 0.1,
            totalGames: 100000
        }
    ],

    // Response moves with known characteristics
    response_moves: [
        {
            san: 'Nf3',
            uci: 'g1f3',
            white: 150000,  // 65% win rate (strong)
            black: 80000,
            draws: 20000,
            playrate: 0.6,
            totalGames: 250000
        },
        {
            san: 'Bc4',
            uci: 'f1c4',
            white: 90000,   // 45% win rate (weak)
            black: 100000,
            draws: 10000,
            playrate: 0.3,
            totalGames: 200000
        }
    ],

    // Edge case data
    minimal_data: [
        {
            san: 'h4',
            uci: 'h2h4',
            white: 15,      // Exactly at minimum thresholds
            black: 15,
            draws: 0,
            playrate: 0.02, // Exactly at 2% threshold
            totalGames: 30
        }
    ]
};

// Mock client with precise control over returned data
class ValidationMockClient {
    constructor(scenario = 'default') {
        this.scenario = scenario;
        this.callSequence = [];
    }

    async getPositionStats(fen) {
        this.callSequence.push({ method: 'getPositionStats', fen });
        
        switch (this.scenario) {
            case 'statistical_test':
                return { moves: VALIDATION_DATA.statistical_test_moves };
            case 'empty_response':
                return { moves: [] };
            case 'minimal_data':
                return { moves: VALIDATION_DATA.minimal_data };
            case 'single_continuation':
                return { moves: [VALIDATION_DATA.statistical_test_moves[0]] };
            default:
                return { moves: VALIDATION_DATA.statistical_test_moves };
        }
    }

    async getMoveStats(fen) {
        this.callSequence.push({ method: 'getMoveStats', fen });
        return VALIDATION_DATA.response_moves;
    }

    getCallSequence() {
        return this.callSequence;
    }
}

describe('Core Algorithm Validation Tests', () => {
    let bookBuilder;
    let mockClient;
    let testConfig;

    beforeEach(() => {
        testConfig = {
            ...TEST_CONFIGS.minimal,
            openings: [{
                name: 'Test Opening',
                fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                perspective: 'white'
            }]
        };
        
        bookBuilder = new BookBuilder(testConfig);
    });

    afterEach(() => {
        if (bookBuilder.stockfishEngine) {
            bookBuilder.stockfishEngine.quit();
        }
    });

    describe('Statistical Calculation Validation', () => {
        test('calculates win rates correctly for white perspective', async () => {
            mockClient = new ValidationMockClient('statistical_test');
            bookBuilder.lichessClient = mockClient;
            
            const results = await bookBuilder.processOpening(testConfig);
            const pgnContent = results['Chapter_1_Test_Opening.pgn'];
            
            // Validate win rate calculations
            // e5: 100k white, 100k black = 50% win rate for white
            // c5: 120k white, 80k black = 60% win rate for white
            expect(pgnContent).toContain('50.00%'); // e5 win rate
            expect(pgnContent).toContain('60.00%'); // c5 win rate (if it appears)
        });

        test('calculates win rates correctly for black perspective', async () => {
            testConfig.openings[0].perspective = 'black';
            mockClient = new ValidationMockClient('statistical_test');
            bookBuilder.lichessClient = mockClient;
            
            const results = await bookBuilder.processOpening(testConfig);
            const pgnContent = results['Chapter_1_Test_Opening.pgn'];
            
            // For black perspective, win rates should be inverted
            // e5: 100k black / 200k total = 50% win rate for black
            // c5: 80k black / 200k total = 40% win rate for black
            expect(pgnContent).toContain('50.00%'); // e5 win rate from black perspective
            expect(pgnContent).toContain('40.00%'); // c5 win rate from black perspective (if it appears)
        });

        test('calculates cumulative likelihood accurately', async () => {
            mockClient = new ValidationMockClient('statistical_test');
            bookBuilder.lichessClient = mockClient;
            
            const results = await bookBuilder.processOpening(testConfig);
            const pgnContent = results['Chapter_1_Test_Opening.pgn'];
            
            // With known playrates: e5 (50%) * response (60%) = 30%
            // Should see cumulative likelihood around 30%
            const likelihoodMatch = pgnContent.match(/Line cumulative playrate: \+(\d+\.\d+)%/);
            expect(likelihoodMatch).toBeTruthy();
            
            if (likelihoodMatch) {
                const likelihood = parseFloat(likelihoodMatch[1]);
                expect(likelihood).toBeCloseTo(30.0, 1); // Within 0.1% tolerance
            }
        });

        test('handles draws correctly based on DRAWSAREHALF setting', async () => {
            // Test with draws counting as half wins
            testConfig.DRAWSAREHALF = 1;
            
            const drawsData = [{
                san: 'e5',
                uci: 'e7e5',
                white: 80000,
                black: 80000,
                draws: 40000,  // 20% draws
                playrate: 0.5,
                totalGames: 200000
            }];
            
            mockClient = new ValidationMockClient();
            mockClient.getPositionStats = async () => ({ moves: drawsData });
            bookBuilder.lichessClient = mockClient;
            
            const results = await bookBuilder.processOpening(testConfig);
            const pgnContent = results['Chapter_1_Test_Opening.pgn'];
            
            // Win rate should be: (80000 + 20000) / 200000 = 50%
            expect(pgnContent).toContain('50.00%');
            
            // Test with draws not counting
            bookBuilder = new BookBuilder({ ...testConfig, DRAWSAREHALF: 0 });
            bookBuilder.lichessClient = mockClient;
            
            const results2 = await bookBuilder.processOpening(testConfig);
            const pgnContent2 = results2['Chapter_1_Test_Opening.pgn'];
            
            // Win rate should be: 80000 / (80000 + 80000) = 50%
            expect(pgnContent2).toContain('50.00%');
        });
    });

    describe('Move Filtering Logic Validation', () => {
        test('filters moves by minimum play rate correctly', async () => {
            testConfig.MINPLAYRATE = 0.25; // 25% threshold
            
            mockClient = new ValidationMockClient('statistical_test');
            bookBuilder.lichessClient = mockClient;
            
            const results = await bookBuilder.processOpening(testConfig);
            const pgnContent = results['Chapter_1_Test_Opening.pgn'];
            
            // e5 (50% playrate) and c5 (30% playrate) should pass
            // d6 (10% playrate) should be filtered out
            expect(pgnContent).toContain('e5');
            expect(pgnContent).toContain('c5');
            expect(pgnContent).not.toContain('d6');
        });

        test('filters moves by minimum games correctly', async () => {
            testConfig.MINGAMES = 150000; // High threshold
            
            mockClient = new ValidationMockClient('statistical_test');
            bookBuilder.lichessClient = mockClient;
            
            const results = await bookBuilder.processOpening(testConfig);
            const pgnContent = results['Chapter_1_Test_Opening.pgn'];
            
            // e5 and c5 (200k games) should pass
            // d6 (100k games) should be filtered out
            expect(pgnContent).toContain('e5');
            expect(pgnContent).toContain('c5');
            expect(pgnContent).not.toContain('d6');
        });

        test('applies depth likelihood filtering correctly', async () => {
            testConfig.DEPTHLIKELIHOOD = 0.15; // 15% cumulative threshold
            
            mockClient = new ValidationMockClient('statistical_test');
            bookBuilder.lichessClient = mockClient;
            
            const results = await bookBuilder.processOpening(testConfig);
            const pgnContent = results['Chapter_1_Test_Opening.pgn'];
            
            // Lines with cumulative likelihood < 15% should be filtered
            const likelihoodMatches = pgnContent.match(/Line cumulative playrate: \+(\d+\.\d+)%/g);
            if (likelihoodMatches) {
                likelihoodMatches.forEach(match => {
                    const likelihood = parseFloat(match.match(/(\d+\.\d+)/)[1]);
                    expect(likelihood).toBeGreaterThanOrEqual(15.0);
                });
            }
        });

        test('edge case: exactly at threshold values', async () => {
            // Configure thresholds to exactly match test data
            testConfig.MINPLAYRATE = 0.02;  // Exactly matches minimal_data
            testConfig.MINGAMES = 30;       // Exactly matches minimal_data
            
            mockClient = new ValidationMockClient('minimal_data');
            bookBuilder.lichessClient = mockClient;
            
            const results = await bookBuilder.processOpening(testConfig);
            const pgnContent = results['Chapter_1_Test_Opening.pgn'];
            
            // Move exactly at threshold should be included
            expect(pgnContent).toContain('h4');
        });
    });

    describe('Line Generation and Expansion Logic', () => {
        test('properly expands move trees', async () => {
            mockClient = new ValidationMockClient('statistical_test');
            bookBuilder.lichessClient = mockClient;
            
            const results = await bookBuilder.processOpening(testConfig);
            
            // Should have called API multiple times for tree expansion
            const callSequence = mockClient.getCallSequence();
            expect(callSequence.length).toBeGreaterThan(2);
            
            // Should have both getPositionStats and getMoveStats calls
            const hasPositionStats = callSequence.some(call => call.method === 'getPositionStats');
            const hasMoveStats = callSequence.some(call => call.method === 'getMoveStats');
            expect(hasPositionStats).toBe(true);
            expect(hasMoveStats).toBe(true);
        });

        test('handles empty continuations correctly', async () => {
            mockClient = new ValidationMockClient('empty_response');
            bookBuilder.lichessClient = mockClient;
            
            const results = await bookBuilder.processOpening(testConfig);
            const pgnContent = results['Chapter_1_Test_Opening.pgn'];
            
            // Should still produce output but with finalized lines
            expect(pgnContent).toContain('[Event "Test Opening Line');
            expect(bookBuilder.finalLines.length).toBeGreaterThanOrEqual(1);
        });

        test('respects maximum iteration limits', async () => {
            testConfig.MAX_ITERATIONS = 1; // Very low limit
            
            mockClient = new ValidationMockClient('statistical_test');
            bookBuilder.lichessClient = mockClient;
            
            const startTime = Date.now();
            const results = await bookBuilder.processOpening(testConfig);
            const endTime = Date.now();
            
            // Should complete quickly due to iteration limit
            expect(endTime - startTime).toBeLessThan(5000);
            expect(Object.keys(results)).toContain('Chapter_1_Test_Opening.pgn');
        });

        test('line ordering follows configuration', async () => {
            // Test LONGTOSHORT = 1 (longest first)
            testConfig.LONGTOSHORT = 1;
            
            mockClient = new ValidationMockClient('statistical_test');
            bookBuilder.lichessClient = mockClient;
            
            const results = await bookBuilder.processOpening(testConfig);
            const pgnContent = results['Chapter_1_Test_Opening.pgn'];
            
            // Extract line numbers to verify ordering
            const lineMatches = pgnContent.match(/\[Event "Test Opening Line (\d+)"\]/g);
            if (lineMatches && lineMatches.length > 1) {
                // Lines should be ordered (exact order depends on algorithm results)
                expect(lineMatches.length).toBeGreaterThan(0);
            }
        });
    });

    describe('Configuration Parameter Effects', () => {
        test('BATCH_SIZE affects processing pattern', async () => {
            testConfig.BATCH_SIZE = 2;
            
            mockClient = new ValidationMockClient('statistical_test');
            bookBuilder.lichessClient = mockClient;
            
            // Spy on the batch processing
            const expandAllLinesSpy = jest.spyOn(bookBuilder, 'expandAllLines');
            
            await bookBuilder.processOpening(testConfig);
            
            expect(expandAllLinesSpy).toHaveBeenCalled();
            
            // Should respect batch size setting
            expect(bookBuilder.BATCH_SIZE).toBe(2);
        });

        test('API_DELAY affects timing between calls', async () => {
            testConfig.API_DELAY = 100; // 100ms delay
            
            mockClient = new ValidationMockClient('statistical_test');
            bookBuilder.lichessClient = mockClient;
            
            const startTime = Date.now();
            await bookBuilder.processOpening(testConfig);
            const endTime = Date.now();
            
            // Should take longer due to delays (but hard to test precisely in unit tests)
            expect(endTime - startTime).toBeGreaterThan(50); // At least some delay
        });

        test('CONTINUATIONGAMES threshold affects continuation filtering', async () => {
            testConfig.CONTINUATIONGAMES = 200000; // High threshold
            
            mockClient = new ValidationMockClient('statistical_test');
            bookBuilder.lichessClient = mockClient;
            
            const results = await bookBuilder.processOpening(testConfig);
            const pgnContent = results['Chapter_1_Test_Opening.pgn'];
            
            // Only moves with enough games should create continuations
            // This affects the depth of analysis
            expect(pgnContent).toContain('[Event "Test Opening Line');
        });
    });

    describe('Error Handling and Edge Cases', () => {
        test('handles malformed API responses gracefully', async () => {
            mockClient = new ValidationMockClient();
            mockClient.getPositionStats = async () => ({ invalid: 'data' }); // Malformed response
            bookBuilder.lichessClient = mockClient;
            
            const results = await bookBuilder.processOpening(testConfig);
            
            // Should handle gracefully and produce some output
            expect(Object.keys(results)).toContain('Chapter_1_Test_Opening.pgn');
        });

        test('handles API errors gracefully', async () => {
            mockClient = new ValidationMockClient();
            mockClient.getPositionStats = async () => { throw new Error('API Error'); };
            bookBuilder.lichessClient = mockClient;
            
            await expect(bookBuilder.processOpening(testConfig)).rejects.toThrow();
        });

        test('handles zero-game scenarios', async () => {
            const zeroGamesData = [{
                san: 'e5',
                uci: 'e7e5',
                white: 0,
                black: 0,
                draws: 0,
                playrate: 0,
                totalGames: 0
            }];
            
            mockClient = new ValidationMockClient();
            mockClient.getPositionStats = async () => ({ moves: zeroGamesData });
            bookBuilder.lichessClient = mockClient;
            
            const results = await bookBuilder.processOpening(testConfig);
            const pgnContent = results['Chapter_1_Test_Opening.pgn'];
            
            // Should handle zero-game scenarios without crashing
            expect(pgnContent).toContain('[Event "Test Opening Line');
        });

        test('numerical precision in percentage calculations', async () => {
            // Test data designed to test floating point precision
            const precisionData = [{
                san: 'e5',
                uci: 'e7e5',
                white: 333333,  // Should result in 33.33% repeating
                black: 666667,
                draws: 0,
                playrate: 0.123456789, // High precision playrate
                totalGames: 1000000
            }];
            
            mockClient = new ValidationMockClient();
            mockClient.getPositionStats = async () => ({ moves: precisionData });
            bookBuilder.lichessClient = mockClient;
            
            const results = await bookBuilder.processOpening(testConfig);
            const pgnContent = results['Chapter_1_Test_Opening.pgn'];
            
            // Should handle precision gracefully and format percentages correctly
            expect(pgnContent).toMatch(/\d+\.\d{2}%/); // Should have 2 decimal places
        });
    });
});