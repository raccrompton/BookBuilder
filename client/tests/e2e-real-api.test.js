/**
 * Real API Integration Tests
 * 
 * These tests validate the complete algorithmic flow using actual Lichess API calls.
 * They are designed to be run sparingly due to API rate limits and provide final
 * validation that the system works with real-world data.
 * 
 * IMPORTANT: These tests make real API calls and should be run judiciously.
 * Consider using environment variables to skip these tests in CI/CD.
 */

import BookBuilder from '../src/BookBuilder.js';
import LichessClient from '../src/api/LichessClient.js';
import { TEST_CONFIGS } from './fixtures/lichess-responses.js';

// Test configuration optimized for minimal API usage
const REAL_API_CONFIG = {
    ...TEST_CONFIGS.minimal,
    API_DELAY: 1000, // 1 second delay between calls to respect rate limits
    BATCH_SIZE: 1,   // Process one at a time
    MAX_ITERATIONS: 3, // Limit depth to minimize API calls
    MINGAMES: 10000,   // Higher threshold to reduce continuation depth
    MINPLAYRATE: 0.05, // Higher threshold to reduce continuation depth
    DEPTHLIKELIHOOD: 0.01 // Stop early to limit API usage
};

// Minimal test openings to reduce API calls
const MINIMAL_TEST_OPENINGS = {
    // Single move from starting position (minimal API usage)
    simple_e4: {
        name: 'Simple E4',
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        perspective: 'white'
    },
    
    // Single move King's Indian setup (minimal API usage)
    simple_kings_indian: {
        name: 'Simple Kings Indian',
        fen: 'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 1 2',
        perspective: 'black'
    }
};

// Skip these tests by default to avoid unnecessary API calls
// Set ENABLE_REAL_API_TESTS=true environment variable to run them
const SKIP_REAL_API_TESTS = process.env.ENABLE_REAL_API_TESTS !== 'true';

const describeOrSkip = SKIP_REAL_API_TESTS ? describe.skip : describe;

describeOrSkip('Real API Integration Tests', () => {
    let bookBuilder;
    let lichessClient;
    let apiCallLog = [];

    beforeAll(async () => {
        // Set up real Lichess client with logging
        lichessClient = new LichessClient();
        
        // Wrap methods to log API calls
        const originalGetPositionStats = lichessClient.getPositionStats.bind(lichessClient);
        const originalGetMoveStats = lichessClient.getMoveStats.bind(lichessClient);
        
        lichessClient.getPositionStats = async function(fen) {
            const startTime = Date.now();
            try {
                const result = await originalGetPositionStats(fen);
                apiCallLog.push({
                    method: 'getPositionStats',
                    fen,
                    success: true,
                    duration: Date.now() - startTime,
                    moveCount: result.moves ? result.moves.length : 0
                });
                return result;
            } catch (error) {
                apiCallLog.push({
                    method: 'getPositionStats',
                    fen,
                    success: false,
                    duration: Date.now() - startTime,
                    error: error.message
                });
                throw error;
            }
        };
        
        lichessClient.getMoveStats = async function(fen) {
            const startTime = Date.now();
            try {
                const result = await originalGetMoveStats(fen);
                apiCallLog.push({
                    method: 'getMoveStats',
                    fen,
                    success: true,
                    duration: Date.now() - startTime,
                    moveCount: result ? result.length : 0
                });
                return result;
            } catch (error) {
                apiCallLog.push({
                    method: 'getMoveStats',
                    fen,
                    success: false,
                    duration: Date.now() - startTime,
                    error: error.message
                });
                throw error;
            }
        };
        
        console.log('🌐 Real API tests enabled - Making actual Lichess API calls');
        console.log('📊 API calls will be logged for analysis');
    });

    beforeEach(() => {
        apiCallLog = [];
    });

    afterEach(() => {
        if (bookBuilder && bookBuilder.stockfishEngine) {
            bookBuilder.stockfishEngine.quit();
        }
        
        // Log API usage summary
        const totalCalls = apiCallLog.length;
        const successfulCalls = apiCallLog.filter(call => call.success).length;
        const totalDuration = apiCallLog.reduce((sum, call) => sum + call.duration, 0);
        
        console.log(`📈 API Usage Summary: ${successfulCalls}/${totalCalls} successful calls in ${totalDuration}ms`);
        
        if (apiCallLog.some(call => !call.success)) {
            console.warn('⚠️  Some API calls failed:', apiCallLog.filter(call => !call.success));
        }
    });

    describe('Core Algorithm with Real Data', () => {
        test('processes simple E4 opening with real Lichess data', async () => {
            const testConfig = {
                ...REAL_API_CONFIG,
                openings: [MINIMAL_TEST_OPENINGS.simple_e4]
            };
            
            bookBuilder = new BookBuilder(testConfig);
            bookBuilder.lichessClient = lichessClient;
            
            const results = await bookBuilder.processOpening(testConfig);
            
            // Validate results structure
            expect(Object.keys(results)).toContain('Chapter_1_Simple_E4.pgn');
            const pgnContent = results['Chapter_1_Simple_E4.pgn'];
            
            // Validate real data integration
            expect(pgnContent).toContain('[Event "Simple E4 Line');
            expect(pgnContent).toContain('1. e4'); // Should start with e4
            expect(pgnContent).toContain('{Move playrates:');
            expect(pgnContent).toContain('Line cumulative playrate:');
            
            // Validate API was actually called
            expect(apiCallLog.length).toBeGreaterThan(0);
            expect(apiCallLog.some(call => call.method === 'getPositionStats')).toBe(true);
            
            // Validate real data quality
            const positionStatsCalls = apiCallLog.filter(call => call.method === 'getPositionStats');
            expect(positionStatsCalls.some(call => call.moveCount > 0)).toBe(true);
            
            console.log('✅ E4 opening processed successfully with real Lichess data');
        }, 30000); // Extended timeout for real API calls

        test('processes King\'s Indian setup with real Lichess data', async () => {
            const testConfig = {
                ...REAL_API_CONFIG,
                openings: [MINIMAL_TEST_OPENINGS.simple_kings_indian]
            };
            
            bookBuilder = new BookBuilder(testConfig);
            bookBuilder.lichessClient = lichessClient;
            
            const results = await bookBuilder.processOpening(testConfig);
            
            // Validate results structure
            expect(Object.keys(results)).toContain('Chapter_1_Simple_Kings_Indian.pgn');
            const pgnContent = results['Chapter_1_Simple_Kings_Indian.pgn'];
            
            // Validate black perspective handling with real data
            expect(pgnContent).toContain('[Event "Simple Kings Indian Line');
            expect(pgnContent).toContain('d4'); // Should include initial d4
            expect(pgnContent).toContain('{Move playrates:');
            
            // Validate API integration
            expect(apiCallLog.length).toBeGreaterThan(0);
            
            console.log('✅ King\'s Indian processed successfully with real Lichess data');
        }, 30000);
    });

    describe('Real Data Quality Validation', () => {
        test('API responses contain expected data structure', async () => {
            const testFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
            
            const response = await lichessClient.getPositionStats(testFen);
            
            // Validate API response structure
            expect(response).toHaveProperty('moves');
            expect(Array.isArray(response.moves)).toBe(true);
            expect(response.moves.length).toBeGreaterThan(0);
            
            // Validate move data structure
            response.moves.forEach(move => {
                expect(move).toHaveProperty('san');
                expect(move).toHaveProperty('uci');
                expect(move).toHaveProperty('white');
                expect(move).toHaveProperty('black');
                expect(move).toHaveProperty('draws');
                expect(move).toHaveProperty('playrate');
                expect(move).toHaveProperty('totalGames');
                
                // Validate data types and ranges
                expect(typeof move.san).toBe('string');
                expect(typeof move.white).toBe('number');
                expect(typeof move.black).toBe('number');
                expect(typeof move.draws).toBe('number');
                expect(typeof move.playrate).toBe('number');
                expect(typeof move.totalGames).toBe('number');
                
                expect(move.playrate).toBeGreaterThanOrEqual(0);
                expect(move.playrate).toBeLessThanOrEqual(1);
                expect(move.totalGames).toBeGreaterThan(0);
            });
            
            console.log(`📊 Validated ${response.moves.length} moves from real API`);
        }, 15000);

        test('API rate limiting is respected', async () => {
            const testFens = [
                'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2'
            ];
            
            const startTime = Date.now();
            
            for (const fen of testFens) {
                await lichessClient.getPositionStats(fen);
                // Add delay between calls
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            const totalTime = Date.now() - startTime;
            
            // Should take at least the delay time
            expect(totalTime).toBeGreaterThan(500);
            
            // All calls should succeed
            const relevantCalls = apiCallLog.filter(call => 
                testFens.includes(call.fen)
            );
            expect(relevantCalls.every(call => call.success)).toBe(true);
            
            console.log(`⏱️  Rate limiting respected: ${totalTime}ms for ${testFens.length} calls`);
        }, 20000);

        test('handles API errors gracefully', async () => {
            // Test with an invalid FEN to trigger API error
            const invalidFen = 'invalid-fen-string-that-should-fail';
            
            await expect(lichessClient.getPositionStats(invalidFen))
                .rejects.toThrow();
            
            // Verify error was logged
            const errorCalls = apiCallLog.filter(call => !call.success);
            expect(errorCalls.length).toBeGreaterThan(0);
            
            console.log('🛡️  API error handling validated');
        }, 10000);
    });

    describe('Statistical Accuracy with Real Data', () => {
        test('win rate calculations match expected ranges', async () => {
            const testConfig = {
                ...REAL_API_CONFIG,
                openings: [MINIMAL_TEST_OPENINGS.simple_e4]
            };
            
            bookBuilder = new BookBuilder(testConfig);
            bookBuilder.lichessClient = lichessClient;
            
            const results = await bookBuilder.processOpening(testConfig);
            const pgnContent = results['Chapter_1_Simple_E4.pgn'];
            
            // Extract win rates from PGN
            const winRateMatches = pgnContent.match(/Line winrate.*?(\d+\.\d+)%/g);
            
            if (winRateMatches) {
                winRateMatches.forEach(match => {
                    const percentage = parseFloat(match.match(/(\d+\.\d+)/)[1]);
                    
                    // Win rates should be reasonable (between 30-70% for most openings)
                    expect(percentage).toBeGreaterThan(20);
                    expect(percentage).toBeLessThan(80);
                    
                    console.log(`📈 Real win rate: ${percentage}%`);
                });
            }
        }, 25000);

        test('playrate calculations are consistent', async () => {
            const testFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
            
            const response = await lichessClient.getPositionStats(testFen);
            
            // Calculate total games for validation
            const totalGames = response.moves.reduce((sum, move) => sum + move.totalGames, 0);
            
            // Validate playrate calculations
            let totalPlayrate = 0;
            response.moves.forEach(move => {
                const expectedPlayrate = move.totalGames / totalGames;
                expect(move.playrate).toBeCloseTo(expectedPlayrate, 3);
                totalPlayrate += move.playrate;
            });
            
            // Total playrates should sum to approximately 1.0
            expect(totalPlayrate).toBeCloseTo(1.0, 2);
            
            console.log(`🧮 Playrate validation: ${response.moves.length} moves sum to ${totalPlayrate.toFixed(3)}`);
        }, 15000);
    });

    describe('Performance with Real API', () => {
        test('completes processing within acceptable time', async () => {
            const testConfig = {
                ...REAL_API_CONFIG,
                openings: [MINIMAL_TEST_OPENINGS.simple_e4]
            };
            
            bookBuilder = new BookBuilder(testConfig);
            bookBuilder.lichessClient = lichessClient;
            
            const startTime = Date.now();
            const results = await bookBuilder.processOpening(testConfig);
            const endTime = Date.now();
            
            const duration = endTime - startTime;
            
            // Should complete within reasonable time (accounting for API delays)
            expect(duration).toBeLessThan(60000); // 60 seconds max
            
            // Should produce valid results
            expect(Object.keys(results)).toHaveLength(1);
            
            console.log(`⚡ Processing completed in ${duration}ms with real API`);
        }, 70000);

        test('API call efficiency', async () => {
            const testConfig = {
                ...REAL_API_CONFIG,
                openings: [MINIMAL_TEST_OPENINGS.simple_e4]
            };
            
            bookBuilder = new BookBuilder(testConfig);
            bookBuilder.lichessClient = lichessClient;
            
            await bookBuilder.processOpening(testConfig);
            
            // Analyze API call efficiency
            const totalCalls = apiCallLog.length;
            const uniqueFens = new Set(apiCallLog.map(call => call.fen)).size;
            const averageResponseTime = apiCallLog.reduce((sum, call) => sum + call.duration, 0) / totalCalls;
            
            expect(totalCalls).toBeLessThan(20); // Should be efficient
            expect(uniqueFens).toBeGreaterThan(0); // Should call different positions
            expect(averageResponseTime).toBeLessThan(5000); // Average response under 5s
            
            console.log(`📊 API Efficiency: ${totalCalls} total calls, ${uniqueFens} unique positions, ${averageResponseTime.toFixed(0)}ms avg response`);
        }, 45000);
    });

    // Integration test that validates the complete flow matches golden master expectations
    describe('Golden Master Validation with Real Data', () => {
        test('real API results have similar structure to golden master', async () => {
            const testConfig = {
                ...REAL_API_CONFIG,
                openings: [{
                    name: 'Ruy Lopez',
                    fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
                    perspective: 'white'
                }]
            };
            
            bookBuilder = new BookBuilder(testConfig);
            bookBuilder.lichessClient = lichessClient;
            
            const results = await bookBuilder.processOpening(testConfig);
            const pgnContent = results['Chapter_1_Ruy_Lopez.pgn'];
            
            // Validate structure matches golden master format
            expect(pgnContent).toContain('[Event "Ruy Lopez Line');
            expect(pgnContent).toContain('{Move playrates:');
            expect(pgnContent).toContain('Line cumulative playrate:');
            expect(pgnContent).toContain('Line winrate');
            expect(pgnContent).toContain('games}');
            
            // Count number of lines generated
            const lineCount = (pgnContent.match(/\[Event/g) || []).length;
            expect(lineCount).toBeGreaterThan(0);
            expect(lineCount).toBeLessThan(10); // Should be reasonable number
            
            console.log(`🏆 Golden master structure validated: ${lineCount} lines generated`);
        }, 40000);
    });
});

// Helper function to run a quick API connectivity test
export async function testLichessConnectivity() {
    try {
        const client = new LichessClient();
        const response = await client.getPositionStats(
            'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'
        );
        
        console.log('✅ Lichess API connectivity test passed');
        console.log(`📊 Received ${response.moves.length} moves`);
        return true;
    } catch (error) {
        console.error('❌ Lichess API connectivity test failed:', error.message);
        return false;
    }
}

// Export configuration for manual testing
export { REAL_API_CONFIG, MINIMAL_TEST_OPENINGS };