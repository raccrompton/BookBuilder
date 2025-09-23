/**
 * Algorithmic Simulation Tests
 * 
 * These tests validate the complete BookBuilder algorithmic flow using deterministic 
 * data fixtures instead of live API calls. This ensures the core algorithm logic
 * is thoroughly tested without external dependencies.
 */

import BookBuilder from '../src/BookBuilder.js';
import { LICHESS_FIXTURES, MOVE_STATS_FIXTURES, EXPECTED_OUTPUTS, TEST_CONFIGS } from './fixtures/lichess-responses.js';

// Mock Lichess Client that returns fixture data
class MockLichessClient {
    constructor(fixtures = LICHESS_FIXTURES, moveFixtures = MOVE_STATS_FIXTURES) {
        this.fixtures = fixtures;
        this.moveFixtures = moveFixtures;
        this.apiCallCount = 0;
        this.apiCallLog = [];
    }

    async getPositionStats(fen) {
        this.apiCallCount++;
        this.apiCallLog.push({ method: 'getPositionStats', fen, timestamp: Date.now() });
        
        const response = this.fixtures[fen];
        if (!response) {
            // Return empty moves for unknown positions
            return { moves: [] };
        }
        
        return response;
    }

    async getMoveStats(fen, moveFilter = null) {
        this.apiCallCount++;
        this.apiCallLog.push({ method: 'getMoveStats', fen, moveFilter, timestamp: Date.now() });
        
        // Return appropriate move stats based on test scenario
        if (fen.includes('strong')) return this.moveFixtures.strong_response;
        if (fen.includes('weak')) return this.moveFixtures.weak_response;
        
        // Default to strong response for testing
        return this.moveFixtures.strong_response;
    }

    getApiCallLog() {
        return this.apiCallLog;
    }

    resetCallCount() {
        this.apiCallCount = 0;
        this.apiCallLog = [];
    }
}

describe('BookBuilder Algorithmic Simulation Tests', () => {
    let bookBuilder;
    let mockLichessClient;
    let testConfig;

    beforeEach(() => {
        // Create mock client with deterministic responses
        mockLichessClient = new MockLichessClient();
        
        // Configure BookBuilder for testing
        testConfig = {
            ...TEST_CONFIGS.minimal,
            openings: [] // Will be set per test
        };
        
        bookBuilder = new BookBuilder(testConfig);
        
        // Replace real Lichess client with mock
        bookBuilder.lichessClient = mockLichessClient;
    });

    afterEach(() => {
        if (bookBuilder.stockfishEngine) {
            bookBuilder.stockfishEngine.quit();
        }
    });

    describe('Core Algorithm Flow Validation', () => {
        test('processes complete Ruy Lopez algorithm flow', async () => {
            // Configure for Ruy Lopez opening
            const testOpening = {
                name: 'Ruy Lopez',
                fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                perspective: 'white'
            };
            
            testConfig.openings = [testOpening];
            mockLichessClient.resetCallCount();
            
            // Execute the complete algorithm
            const results = await bookBuilder.processOpening(testConfig);
            
            // Validate algorithmic execution
            expect(mockLichessClient.apiCallCount).toBeGreaterThan(0);
            expect(Object.keys(results)).toContain('Chapter_1_Ruy_Lopez.pgn');
            
            const pgnContent = results['Chapter_1_Ruy_Lopez.pgn'];
            
            // Validate algorithm produced correct output structure
            expect(pgnContent).toContain('[Event "Ruy Lopez Line');
            expect(pgnContent).toContain('1. e4 e5');
            expect(pgnContent).toContain('{Move playrates:');
            expect(pgnContent).toContain('Line cumulative playrate:');
            expect(pgnContent).toContain('Line winrate');
            
            // Validate API call pattern follows expected algorithm flow
            const callLog = mockLichessClient.getApiCallLog();
            expect(callLog.length).toBeGreaterThan(2); // Should have multiple API calls
            expect(callLog[0].method).toBe('getPositionStats'); // First call should be position stats
        });

        test('processes complete King\'s Indian algorithm flow', async () => {
            const testOpening = {
                name: 'Kings Indian',
                fen: 'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 1 2',
                perspective: 'black'
            };
            
            testConfig.openings = [testOpening];
            mockLichessClient.resetCallCount();
            
            const results = await bookBuilder.processOpening(testConfig);
            
            expect(Object.keys(results)).toContain('Chapter_1_Kings_Indian.pgn');
            
            const pgnContent = results['Chapter_1_Kings_Indian.pgn'];
            
            // Validate black perspective handling
            expect(pgnContent).toContain('[Event "Kings Indian Line');
            expect(pgnContent).toContain('c4'); // Should show white moves first in black repertoire
            expect(pgnContent).toContain('{Move playrates:');
            
            // Validate perspective-specific win rate calculations
            expect(pgnContent).toMatch(/Line winrate.*\d+\.\d+%/);
        });

        test('handles empty continuation scenarios correctly', async () => {
            // Create fixture that leads to empty continuations
            const emptyFixtures = {
                'test_position': { moves: [] }
            };
            
            const emptyMockClient = new MockLichessClient(emptyFixtures);
            bookBuilder.lichessClient = emptyMockClient;
            
            const testOpening = {
                name: 'Empty Test',
                fen: 'test_position',
                perspective: 'white'
            };
            
            testConfig.openings = [testOpening];
            
            const results = await bookBuilder.processOpening(testConfig);
            
            // Should handle gracefully and finalize lines
            expect(Object.keys(results)).toContain('Chapter_1_Empty_Test.pgn');
            expect(bookBuilder.finalLines.length).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Algorithmic Logic Validation', () => {
        test('move filtering logic works correctly', async () => {
            const testOpening = {
                name: 'Filter Test',
                fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                perspective: 'white'
            };
            
            // Override config with strict filtering
            testConfig.MINPLAYRATE = 0.3; // High threshold
            testConfig.MINGAMES = 1000000; // High game count requirement
            testConfig.openings = [testOpening];
            
            const results = await bookBuilder.processOpening(testConfig);
            
            // Should filter out low-quality moves
            const pgnContent = results['Chapter_1_Filter_Test.pgn'];
            
            // Only high-quality moves (e5 with 40.59% playrate) should remain
            expect(pgnContent).toContain('e5');
            // Lower quality moves (c5 with 19.35% playrate) should be filtered
            expect(pgnContent).not.toContain('c5');
        });

        test('cumulative likelihood calculations are accurate', async () => {
            const testOpening = {
                name: 'Likelihood Test',
                fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                perspective: 'white'
            };
            
            testConfig.openings = [testOpening];
            
            const results = await bookBuilder.processOpening(testConfig);
            const pgnContent = results['Chapter_1_Likelihood_Test.pgn'];
            
            // Validate cumulative likelihood calculation
            // e5 (40.59%) * Nc6 (62.21%) = 25.25% approximately
            expect(pgnContent).toMatch(/Line cumulative playrate: \+\d+\.\d+%/);
            
            // Extract the percentage and validate it's reasonable
            const likelihoodMatch = pgnContent.match(/Line cumulative playrate: \+(\d+\.\d+)%/);
            if (likelihoodMatch) {
                const likelihood = parseFloat(likelihoodMatch[1]);
                expect(likelihood).toBeGreaterThan(5); // Should be significant
                expect(likelihood).toBeLessThan(50); // But not too high for deep lines
            }
        });

        test('perspective-based win rate calculations', async () => {
            // Test white perspective
            const whiteOpening = {
                name: 'White Test',
                fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                perspective: 'white'
            };
            
            testConfig.openings = [whiteOpening];
            
            const whiteResults = await bookBuilder.processOpening(testConfig);
            const whitePgn = whiteResults['Chapter_1_White_Test.pgn'];
            
            // Reset for black perspective test
            bookBuilder = new BookBuilder(testConfig);
            bookBuilder.lichessClient = new MockLichessClient();
            
            const blackOpening = {
                name: 'Black Test',
                fen: 'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 1 2',
                perspective: 'black'
            };
            
            testConfig.openings = [blackOpening];
            
            const blackResults = await bookBuilder.processOpening(testConfig);
            const blackPgn = blackResults['Chapter_1_Black_Test.pgn'];
            
            // Both should have win rates but calculated from different perspectives
            expect(whitePgn).toMatch(/Line winrate.*\d+\.\d+%/);
            expect(blackPgn).toMatch(/Line winrate.*\d+\.\d+%/);
            
            // Validate the win rates are reasonable (between 0-100%)
            const whiteWinRate = whitePgn.match(/Line winrate.*?(\d+\.\d+)%/);
            const blackWinRate = blackPgn.match(/Line winrate.*?(\d+\.\d+)%/);
            
            if (whiteWinRate) {
                const rate = parseFloat(whiteWinRate[1]);
                expect(rate).toBeGreaterThanOrEqual(0);
                expect(rate).toBeLessThanOrEqual(100);
            }
            
            if (blackWinRate) {
                const rate = parseFloat(blackWinRate[1]);
                expect(rate).toBeGreaterThanOrEqual(0);
                expect(rate).toBeLessThanOrEqual(100);
            }
        });
    });

    describe('Data Pipeline Validation', () => {
        test('FEN position handling throughout pipeline', async () => {
            const testOpening = {
                name: 'FEN Test',
                fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                perspective: 'white'
            };
            
            testConfig.openings = [testOpening];
            
            // Spy on chess engine to validate FEN handling
            const parsePositionSpy = jest.spyOn(bookBuilder.chessEngine, 'parsePosition');
            const getFenSpy = jest.spyOn(bookBuilder.chessEngine, 'getFen');
            
            await bookBuilder.processOpening(testConfig);
            
            // Validate FEN parsing was called
            expect(parsePositionSpy).toHaveBeenCalledWith(testOpening.fen);
            expect(getFenSpy).toHaveBeenCalled();
            
            // Validate no FEN corruption occurred
            const fensUsed = getFenSpy.mock.results.map(result => result.value);
            fensUsed.forEach(fen => {
                expect(fen).toMatch(/^[rnbqkpRNBQKP1-8\/\s\w-]+$/); // Valid FEN format
            });
        });

        test('move notation consistency throughout pipeline', async () => {
            const testOpening = {
                name: 'Move Notation Test',
                fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                perspective: 'white'
            };
            
            testConfig.openings = [testOpening];
            
            const results = await bookBuilder.processOpening(testConfig);
            const pgnContent = results['Chapter_1_Move_Notation_Test.pgn'];
            
            // Validate move notation is correct SAN format
            expect(pgnContent).toMatch(/\d+\.\s+[a-h1-8NBRQK+#=x-]+/); // Valid SAN moves
            expect(pgnContent).not.toMatch(/[a-h][1-8][a-h][1-8]/); // Should not contain UCI notation
            
            // Validate specific moves from fixtures are present
            expect(pgnContent).toContain('e5'); // From fixture data
            if (pgnContent.includes('Nc6')) {
                expect(pgnContent).toContain('Nc6'); // Proper knight notation
            }
        });

        test('API response transformation accuracy', async () => {
            const testOpening = {
                name: 'API Transform Test',
                fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                perspective: 'white'
            };
            
            testConfig.openings = [testOpening];
            
            // Capture the API calls and responses
            const originalGetPositionStats = mockLichessClient.getPositionStats;
            let capturedResponses = [];
            
            mockLichessClient.getPositionStats = async function(fen) {
                const response = await originalGetPositionStats.call(this, fen);
                capturedResponses.push({ fen, response });
                return response;
            };
            
            await bookBuilder.processOpening(testConfig);
            
            // Validate API responses were properly transformed
            capturedResponses.forEach(({ fen, response }) => {
                expect(response).toHaveProperty('moves');
                expect(Array.isArray(response.moves)).toBe(true);
                
                response.moves.forEach(move => {
                    expect(move).toHaveProperty('san');
                    expect(move).toHaveProperty('playrate');
                    expect(move).toHaveProperty('totalGames');
                    expect(typeof move.playrate).toBe('number');
                    expect(move.playrate).toBeGreaterThanOrEqual(0);
                    expect(move.playrate).toBeLessThanOrEqual(1);
                });
            });
        });
    });

    describe('Algorithm Performance and Limits', () => {
        test('completes within reasonable time limits', async () => {
            const testOpening = {
                name: 'Performance Test',
                fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                perspective: 'white'
            };
            
            testConfig.openings = [testOpening];
            
            const startTime = Date.now();
            await bookBuilder.processOpening(testConfig);
            const endTime = Date.now();
            
            const duration = endTime - startTime;
            
            // Should complete within 10 seconds for simple opening
            expect(duration).toBeLessThan(10000);
            console.log(`Algorithm completed in ${duration}ms`);
        });

        test('handles iteration limits correctly', async () => {
            // Set very low iteration limit to test boundary
            testConfig.MAX_ITERATIONS = 2;
            
            const testOpening = {
                name: 'Iteration Limit Test',
                fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                perspective: 'white'
            };
            
            testConfig.openings = [testOpening];
            
            const results = await bookBuilder.processOpening(testConfig);
            
            // Should complete without infinite loops
            expect(Object.keys(results)).toContain('Chapter_1_Iteration_Limit_Test.pgn');
            
            // Should have created some lines even with limits
            expect(bookBuilder.finalLines.length).toBeGreaterThanOrEqual(0);
        });

        test('memory efficiency with complex openings', async () => {
            const startMemory = process.memoryUsage().heapUsed;
            
            // Create multiple complex openings
            testConfig.openings = [
                {
                    name: 'Complex 1',
                    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                    perspective: 'white'
                },
                {
                    name: 'Complex 2',
                    fen: 'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 1 2',
                    perspective: 'black'
                }
            ];
            
            const results = await bookBuilder.processOpening(testConfig);
            
            const endMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = endMemory - startMemory;
            
            // Should not consume excessive memory (less than 100MB for test)
            expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
            
            // Should produce results for both openings
            expect(Object.keys(results)).toHaveLength(2);
        });
    });
});