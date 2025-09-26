/**
 * PgnGenerator Simple Tests
 * Tests core PGN line generation functionality (generateSingleLine)
 */

import PgnGenerator from '../src/pgn/PgnGenerator.js';
import { TestUtils } from './testUtils.js';

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
            const testLine = {
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
            };

            const result = generator.generateSingleLine(testLine, 'Test_Opening Line 1');

            // Should have event header
            expect(result).toMatch(/\[Event "Test_Opening Line 1"\]/);

            // Should have move sequence
            expect(result).toMatch(/1\.\s*e4\s+c5\s+2\.\s*Nf3\s+d6\s+3\.\s*d4/);

            // Should have statistics block
            expect(result).toMatch(/\{Move playrates:/);
            expect(result).toMatch(/\+25\.28%\s+c5/);
            expect(result).toMatch(/\+65\.97%\s+d6/);
            expect(result).toMatch(/Line cumulative playrate: \+8\.42%/);
            expect(result).toMatch(/Line winrate \(excluding draws\): \+56\.80% over 2,847,593 games/);
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
            // Chess.js generates a full PGN header even for empty games
            expect(result).toMatch(/\[Event "\?"\]/);
            expect(result).toMatch(/\[Result "\*"\]/);
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
            expect(result).toMatch(/\+45\.00%\s+e4/);
            expect(result).toMatch(/\+25\.28%\s+c5/);
            expect(result).toMatch(/\+89\.00%\s+Nf3/);

            // Should have cumulative and winrate
            expect(result).toMatch(/Line cumulative playrate: \+12\.34%/);
            expect(result).toMatch(/Line winrate \(excluding draws\): \+56\.70% over 1,000,000 games/);
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
            expect(result).toMatch(/\+25\.00%\s+c5/);
            expect(result).toMatch(/Line cumulative playrate: \+5\.00%/);
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
            expect(result).toMatch(/\+12\.35%\s+e4/);
            expect(result).toMatch(/Line cumulative playrate: \+98\.77%/);
            expect(result).toMatch(/Line winrate \(excluding draws\): \+55\.56% over 1,234,567 games/);
        });
    });
});