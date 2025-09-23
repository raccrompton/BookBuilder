/**
 * PgnGenerator Tests - Step 5 Implementation
 * Tests PGN output format matching golden master requirements
 */

import PgnGenerator from '../src/pgn/PgnGenerator.js';
import { TestUtils } from './testUtils.js';

// Mock engine client for PGN completion testing
class MockEngineForPgn {
    constructor(sequence = ['Nf3', 'Nc6', 'Bb5']) {
        this.moveSequence = sequence;
        this.moveIndex = 0;
    }

    async getBestMove(_fen, _depth) {
        if (this.moveIndex >= this.moveSequence.length) {
            return null;
        }
        return this.moveSequence[this.moveIndex++];
    }

    async evaluatePosition(_fen) {
        return 25 + (this.moveIndex * 10); // Slightly increasing advantage
    }
}

describe('PgnGenerator - Step 5: PGN Generation', () => {
    let pgnGenerator;

    beforeEach(() => {
        const config = TestUtils.createTestConfig({
            perspective: 'white',
            ENGINEFINISH: 1,
            ENGINEDEPTH: 15,
            DRAWSAREHALF: 0
        });

        pgnGenerator = new PgnGenerator(config);
    });

    describe('Event Header Generation', () => {
        test('generates correct event headers', () => {
            const header1 = pgnGenerator.generateEventHeaders('Ruy_Lopez', 1, 'white');
            expect(header1).toBe('[Event "Ruy_Lopez Line 1"]');

            const header2 = pgnGenerator.generateEventHeaders('Kings_Indian', 3, 'black');
            expect(header2).toBe('[Event "Kings_Indian Line 3"]');
        });
    });

    describe('Move Sequence Formatting', () => {
        test('formats move sequences correctly', async () => {
            const line = {
                moves: [
                    { san: 'e4' },
                    { san: 'e5' },
                    { san: 'Nf3' },
                    { san: 'Nc6' },
                    { san: 'Bb5' }
                ]
            };

            const sequence = await pgnGenerator.generateMoveSequence(line);
            expect(sequence).toBe('1. e4 e5 2. Nf3 Nc6 3. Bb5');
        });

        test('handles odd number of moves correctly', async () => {
            const line = {
                moves: [
                    { san: 'd4' },
                    { san: 'Nf6' },
                    { san: 'c4' }
                ]
            };

            const sequence = await pgnGenerator.generateMoveSequence(line);
            expect(sequence).toBe('1. d4 Nf6 2. c4');
        });

        test('completes lines with engine when configured', async () => {
            const mockEngine = new MockEngineForPgn(['Nf3', 'Nc6']);

            const line = {
                moves: [
                    { san: 'e4' },
                    { san: 'e5' }
                ],
                finalPosition: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2'
            };

            const sequence = await pgnGenerator.generateMoveSequence(line, mockEngine);
            expect(sequence).toContain('1. e4 e5');
            expect(sequence).toContain('Nf3'); // Engine completion
            expect(sequence).toContain('Nc6');
        });
    });

    describe('Move Annotations', () => {
        test('formats move annotations correctly', () => {
            const line = {
                moves: [
                    { san: 'e4', playrate: 0.4059 },
                    { san: 'e5', playrate: 0.6221 },
                    { san: 'Nf3', playrate: 0.2028 }
                ],
                statistics: {
                    cumulativePlayrate: 0.0512,
                    winrate: 0.5431,
                    totalGames: 9916238
                }
            };

            const annotations = pgnGenerator.formatMoveAnnotations(line);

            expect(annotations).toContain('{Move playrates:');
            expect(annotations).toContain('+40.59%\te4');
            expect(annotations).toContain('+62.21%\te5');
            expect(annotations).toContain('+20.28%\tNf3');
            expect(annotations).toContain('Line cumulative playrate: +5.12%');
            expect(annotations).toContain('Line winrate (excluding draws): +54.31% over 9,916,238 games');
            expect(annotations).toContain('}');
        });

        test('handles different DRAWSAREHALF settings', () => {
            const configWithDraws = TestUtils.createTestConfig({ DRAWSAREHALF: 1 });
            const generatorWithDraws = new PgnGenerator(configWithDraws);

            const line = {
                moves: [{ san: 'e4', playrate: 0.4 }],
                statistics: {
                    cumulativePlayrate: 0.05,
                    winrate: 0.55,
                    totalGames: 1000000
                }
            };

            const annotations = generatorWithDraws.formatMoveAnnotations(line);
            expect(annotations).toContain('Line winrate (draws as half points)');
        });
    });

    describe('Complete PGN Generation', () => {
        test('generates complete PGN for multiple lines', async () => {
            const lines = [
                {
                    moves: [
                        { san: 'e4', playrate: 0.4059 },
                        { san: 'e5', playrate: 0.6221 },
                        { san: 'Nf3', playrate: 0.2028 }
                    ],
                    statistics: {
                        cumulativePlayrate: 0.0512,
                        winrate: 0.5431,
                        totalGames: 9916238
                    }
                },
                {
                    moves: [
                        { san: 'e4', playrate: 0.4059 },
                        { san: 'e5', playrate: 0.6221 },
                        { san: 'Nf3', playrate: 0.6221 },
                        { san: 'd6', playrate: 0.2084 }
                    ],
                    statistics: {
                        cumulativePlayrate: 0.0526,
                        winrate: 0.5422,
                        totalGames: 8039492
                    }
                }
            ];

            const pgn = await pgnGenerator.generatePGN(lines, 'Ruy_Lopez');

            // Check structure
            expect(pgn).toContain('[Event "Ruy_Lopez Line 1"]');
            expect(pgn).toContain('[Event "Ruy_Lopez Line 2"]');
            expect(pgn).toContain('1. e4 e5 2. Nf3');
            expect(pgn).toContain('1. e4 e5 2. Nf3 d6');
            expect(pgn).toMatch(/\+40\.59%\s+e4/);
            expect(pgn).toContain('Line winrate (excluding draws)');
        });

        test('matches golden master format structure', async () => {
            // Test with data similar to golden master
            const ruyLopezLine = {
                moves: [
                    { san: 'e4', playrate: 0.4059 },
                    { san: 'e5', playrate: 0.6221 },
                    { san: 'Nf3', playrate: 0.6221 },
                    { san: 'Nc6', playrate: 0.2028 }
                ],
                statistics: {
                    cumulativePlayrate: 0.0512,
                    winrate: 0.5431,
                    totalGames: 9916238
                }
            };

            const pgn = await pgnGenerator.generatePGN([ruyLopezLine], 'Ruy_Lopez');

            // Validate using custom matcher
            expect(pgn).toBeValidPgn();

            // Check specific format requirements
            expect(pgn).toMatch(/^\[Event "Ruy_Lopez Line 1"\]$/m);
            expect(pgn).toMatch(/^1\. e4 e5 2\. Nf3 Nc6$/m);
            expect(pgn).toMatch(/^\{Move playrates:$/m);
            expect(pgn).toMatch(/^\+40\.59%\te4$/m);
            expect(pgn).toMatch(/^Line cumulative playrate: \+5\.12%$/m);
            expect(pgn).toMatch(/^Line winrate \(excluding draws\): \+54\.31% over 9,916,238 games\}$/m);
        });
    });

    describe('Engine Completion', () => {
        test('completes lines with engine analysis', async () => {
            const mockEngine = new MockEngineForPgn(['O-O', 'Be7', 'Re1']);

            const line = {
                moves: [
                    { san: 'e4' },
                    { san: 'e5' },
                    { san: 'Nf3' },
                    { san: 'Nc6' },
                    { san: 'Bb5' },
                    { san: 'Nf6' }
                ],
                finalPosition: 'r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'
            };

            const completion = await pgnGenerator.completeLineWithEngine(
                line.finalPosition,
                mockEngine
            );

            expect(completion).toHaveLength(3);
            expect(completion[0].san).toBe('O-O');
            expect(completion[1].san).toBe('Be7');
            expect(completion[2].san).toBe('Re1');
        });

        test('handles engine completion errors gracefully', async () => {
            const errorEngine = {
                getBestMove: async () => { throw new Error('Engine failed'); },
                evaluatePosition: async () => { throw new Error('Evaluation failed'); }
            };

            const completion = await pgnGenerator.completeLineWithEngine(
                'invalid-fen',
                errorEngine
            );

            expect(completion).toEqual([]); // Should return empty array on error
        });

        test('stops completion on game end or decisive advantage', async () => {
            const mockEngine = {
                getBestMove: async () => 'Qh5',
                evaluatePosition: async () => 600 // 6+ pawn advantage
            };

            const completion = await pgnGenerator.completeLineWithEngine(
                'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2',
                mockEngine
            );

            // Should stop due to decisive advantage
            expect(completion.length).toBeLessThanOrEqual(1);
        });
    });

    describe('PGN Validation', () => {
        test('validates correct PGN format', () => {
            const validPgn = `[Event "Test Line 1"]

1. e4 e5 2. Nf3 Nc6
{Move playrates:
+40.59%\te4
+62.21%\te5
Line cumulative playrate: +5.12%
Line winrate (excluding draws): +54.31% over 9,916,238 games}`;

            const validation = PgnGenerator.validatePgnFormat(validPgn);
            expect(validation.isValid).toBe(true);
            expect(validation.issues).toHaveLength(0);
        });

        test('identifies missing required elements', () => {
            const invalidPgn = 'Just some moves without proper format';

            const validation = PgnGenerator.validatePgnFormat(invalidPgn);
            expect(validation.isValid).toBe(false);
            expect(validation.issues.length).toBeGreaterThan(0);
            expect(validation.issues).toContain('Missing Event header');
            expect(validation.issues).toContain('No valid move notation found');
        });
    });

    describe('Integration with Golden Master Data', () => {
        test('single line generation matches expected format', () => {
            const testLine = {
                moves: [
                    { san: 'e4', playrate: 0.4059 },
                    { san: 'e5', playrate: 0.6221 },
                    { san: 'Nf3', playrate: 0.6221 },
                    { san: 'Nc6', playrate: 0.2028 }
                ],
                statistics: {
                    cumulativePlayrate: 0.0512,
                    winrate: 0.5431,
                    totalGames: 9916238
                }
            };

            const pgn = pgnGenerator.generateSingleLine(testLine, 'Ruy_Lopez Line 1');

            // Should match the expected golden master structure
            expect(pgn).toContain('[Event "Ruy_Lopez Line 1"]');
            expect(pgn).toContain('1. e4 e5 2. Nf3 Nc6');
            expect(pgn).toContain('{Move playrates:');
            expect(pgn).toContain('+40.59%\te4');
            expect(pgn).toContain('Line winrate (excluding draws): +54.31% over 9,916,238 games}');
        });

        test('output precision matches Python legacy system', () => {
            const line = {
                moves: [{ san: 'e4', playrate: 0.40593 }],
                statistics: {
                    cumulativePlayrate: 0.05123,
                    winrate: 0.54312,
                    totalGames: 9916238
                }
            };

            const annotations = pgnGenerator.formatMoveAnnotations(line);

            // Check precision (2 decimal places for percentages)
            expect(annotations).toContain('+40.59%'); // Properly rounded
            expect(annotations).toContain('+5.12%');  // Properly rounded
            expect(annotations).toContain('+54.31%'); // Properly rounded
            expect(annotations).toContain('9,916,238'); // Properly formatted number
        });
    });
});
