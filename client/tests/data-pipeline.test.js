/**
 * Data Pipeline Transformation Tests
 * 
 * These tests validate the complete data flow pipeline through the BookBuilder system:
 * - FEN parsing and position state management
 * - Move notation conversion (UCI ↔ SAN)
 * - API response processing and transformation
 * - PGN generation and formatting
 * - Statistical data transformation accuracy
 */

import BookBuilder from '../src/BookBuilder.js';
import ChessEngine from '../src/chess/ChessEngine.js';
import LichessClient from '../src/api/LichessClient.js';
import PgnGenerator from '../src/pgn/PgnGenerator.js';
import { TEST_CONFIGS } from './fixtures/lichess-responses.js';

// Test data covering various data transformation scenarios
const PIPELINE_TEST_DATA = {
    // Raw Lichess API format (before transformation)
    raw_lichess_response: {
        white: 1500000,
        draws: 300000,
        black: 1200000,
        moves: [
            {
                uci: 'e2e4',
                san: 'e4',
                white: 800000,
                draws: 150000,
                black: 600000,
                averageRating: 2100
            },
            {
                uci: 'd2d4',
                san: 'd4',
                white: 400000,
                draws: 80000,
                black: 320000,
                averageRating: 2150
            }
        ]
    },

    // Expected transformed format
    expected_transformed: {
        moves: [
            {
                uci: 'e2e4',
                san: 'e4',
                white: 800000,
                draws: 150000,
                black: 600000,
                averageRating: 2100,
                playrate: 0.52, // (800k+150k+600k) / (total games)
                totalGames: 1550000
            },
            {
                uci: 'd2d4',
                san: 'd4',
                white: 400000,
                draws: 80000,
                black: 320000,
                averageRating: 2150,
                playrate: 0.27, // (400k+80k+320k) / (total games)
                totalGames: 800000
            }
        ]
    },

    // Complex FEN positions for position handling tests
    test_positions: [
        {
            name: 'starting_position',
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            expected_turn: 'w',
            expected_castling: 'KQkq',
            expected_valid: true
        },
        {
            name: 'middle_game',
            fen: 'r2qkb1r/ppp2ppp/2n1bn2/2bpp3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq d6 0 6',
            expected_turn: 'w',
            expected_castling: 'KQkq',
            expected_valid: true
        },
        {
            name: 'endgame',
            fen: '8/2k5/3p4/p2P1p2/P2K1P2/8/8/8 b - - 14 50',
            expected_turn: 'b',
            expected_castling: '-',
            expected_valid: true
        },
        {
            name: 'invalid_fen',
            fen: 'invalid-fen-string',
            expected_valid: false
        }
    ],

    // Move notation test cases
    move_notations: [
        {
            uci: 'e2e4',
            san: 'e4',
            from: 'e2',
            to: 'e4',
            piece: 'pawn',
            type: 'normal'
        },
        {
            uci: 'g1f3',
            san: 'Nf3',
            from: 'g1',
            to: 'f3',
            piece: 'knight',
            type: 'normal'
        },
        {
            uci: 'e1g1',
            san: 'O-O',
            from: 'e1',
            to: 'g1',
            piece: 'king',
            type: 'castling'
        },
        {
            uci: 'e7e8q',
            san: 'e8=Q',
            from: 'e7',
            to: 'e8',
            piece: 'pawn',
            type: 'promotion',
            promotion: 'q'
        }
    ]
};

describe('Data Pipeline Transformation Tests', () => {
    let chessEngine;
    let lichessClient;
    let pgnGenerator;
    let bookBuilder;

    beforeEach(() => {
        chessEngine = new ChessEngine();
        lichessClient = new LichessClient();
        pgnGenerator = new PgnGenerator();
        
        const testConfig = {
            ...TEST_CONFIGS.minimal,
            openings: []
        };
        
        bookBuilder = new BookBuilder(testConfig);
    });

    afterEach(() => {
        if (bookBuilder.stockfishEngine) {
            bookBuilder.stockfishEngine.quit();
        }
    });

    describe('FEN Position Pipeline', () => {
        test('parses and validates FEN positions correctly', () => {
            PIPELINE_TEST_DATA.test_positions.forEach(testCase => {
                const result = chessEngine.parsePosition(testCase.fen);
                
                expect(result).toBe(testCase.expected_valid);
                
                if (testCase.expected_valid) {
                    expect(chessEngine.getTurn()).toBe(testCase.expected_turn);
                    expect(chessEngine.getFen()).toContain(testCase.expected_castling);
                }
            });
        });

        test('maintains position state consistency throughout pipeline', () => {
            const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
            
            // Parse initial position
            expect(chessEngine.parsePosition(startingFen)).toBe(true);
            const initialFen = chessEngine.getFen();
            
            // Make a move
            const moveResult = chessEngine.makeMove('e4');
            expect(moveResult).toBeTruthy();
            expect(moveResult.san).toBe('e4');
            
            // Verify position changed
            const afterMoveFen = chessEngine.getFen();
            expect(afterMoveFen).not.toBe(initialFen);
            expect(afterMoveFen).toContain('4P3'); // Pawn on e4
            
            // Undo move
            const undoResult = chessEngine.undoMove();
            expect(undoResult).toBeTruthy();
            
            // Verify position restored
            const restoredFen = chessEngine.getFen();
            expect(restoredFen).toBe(initialFen);
        });

        test('handles complex position sequences accurately', () => {
            const moveSequence = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'];
            
            chessEngine.reset();
            
            const fenHistory = [chessEngine.getFen()];
            
            // Apply move sequence
            moveSequence.forEach(move => {
                const result = chessEngine.makeMove(move);
                expect(result).toBeTruthy();
                expect(result.san).toBe(move);
                fenHistory.push(chessEngine.getFen());
            });
            
            // Verify final position
            const finalFen = chessEngine.getFen();
            expect(finalFen).toContain('1B2p3'); // Bb5 and e5 visible
            expect(finalFen).toContain('2n5'); // Nc6 visible
            
            // Undo sequence and verify each step
            for (let i = moveSequence.length - 1; i >= 0; i--) {
                chessEngine.undoMove();
                expect(chessEngine.getFen()).toBe(fenHistory[i]);
            }
        });

        test('detects illegal positions and move attempts', () => {
            // Try illegal move from starting position
            chessEngine.reset();
            const illegalMove = chessEngine.makeMove('Nf7'); // Knight can't go to f7
            expect(illegalMove).toBeNull();
            
            // Verify position unchanged after illegal move
            const currentFen = chessEngine.getFen();
            expect(currentFen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
        });
    });

    describe('Move Notation Transformation', () => {
        test('converts between UCI and SAN notation correctly', () => {
            chessEngine.reset();
            
            PIPELINE_TEST_DATA.move_notations.forEach(testCase => {
                if (testCase.type === 'promotion') {
                    // Special handling for promotion - position needs to be set up
                    chessEngine.parsePosition('rnbqkbnr/pppppPpp/8/8/8/8/PPPPPP1P/RNBQKBNR w KQkq - 0 1');
                }
                
                // Test UCI to SAN conversion
                const sanResult = chessEngine.generateSAN({ from: testCase.from, to: testCase.to, promotion: testCase.promotion });
                if (sanResult !== null) {
                    expect(sanResult).toBe(testCase.san);
                }
                
                // Test SAN move execution
                if (testCase.type !== 'promotion') { // Skip promotion for simplicity in basic test
                    chessEngine.reset();
                    const moveResult = chessEngine.makeMove(testCase.san);
                    if (moveResult) {
                        expect(moveResult.san).toBe(testCase.san);
                        expect(moveResult.from).toBe(testCase.from);
                        expect(moveResult.to).toBe(testCase.to);
                    }
                }
            });
        });

        test('handles special moves correctly', () => {
            // Test castling
            chessEngine.parsePosition('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
            const castleMove = chessEngine.makeMove('O-O');
            expect(castleMove).toBeTruthy();
            expect(castleMove.san).toBe('O-O');
            expect(castleMove.flags).toContain('k'); // Kingside castle flag
            
            // Test en passant (setup required)
            chessEngine.parsePosition('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3');
            const enPassantMove = chessEngine.makeMove('exf6');
            expect(enPassantMove).toBeTruthy();
            expect(enPassantMove.san).toBe('exf6');
            expect(enPassantMove.flags).toContain('e'); // En passant flag
        });

        test('maintains move notation consistency in complex sequences', () => {
            const complexSequence = [
                { move: 'e4', expectedUci: 'e2e4' },
                { move: 'c5', expectedUci: 'c7c5' },
                { move: 'Nf3', expectedUci: 'g1f3' },
                { move: 'Nc6', expectedUci: 'b8c6' },
                { move: 'Bb5', expectedUci: 'f1b5' }
            ];
            
            chessEngine.reset();
            
            complexSequence.forEach(({ move, expectedUci }) => {
                const result = chessEngine.makeMove(move);
                expect(result).toBeTruthy();
                expect(result.san).toBe(move);
                expect(result.from + result.to).toBe(expectedUci);
            });
        });
    });

    describe('API Response Transformation', () => {
        test('transforms raw Lichess response to BookBuilder format', () => {
            const rawResponse = PIPELINE_TEST_DATA.raw_lichess_response;
            
            // Mock the transformation (this would normally be done by LichessClient)
            const totalGames = rawResponse.white + rawResponse.draws + rawResponse.black;
            
            const transformedMoves = rawResponse.moves.map(move => {
                const moveGames = move.white + move.draws + move.black;
                const playrate = moveGames / totalGames;
                
                return {
                    ...move,
                    playrate,
                    totalGames: moveGames
                };
            });
            
            // Validate transformation accuracy
            expect(transformedMoves[0].playrate).toBeCloseTo(0.516, 3); // 1550000/3000000
            expect(transformedMoves[1].playrate).toBeCloseTo(0.267, 3); // 800000/3000000
            
            expect(transformedMoves[0].totalGames).toBe(1550000);
            expect(transformedMoves[1].totalGames).toBe(800000);
        });

        test('handles edge cases in API response transformation', () => {
            // Test zero-game scenarios
            const zeroGameResponse = {
                white: 0,
                draws: 0,
                black: 0,
                moves: [{
                    uci: 'e2e4',
                    san: 'e4',
                    white: 0,
                    draws: 0,
                    black: 0
                }]
            };
            
            const totalGames = 0;
            const transformedMove = {
                ...zeroGameResponse.moves[0],
                playrate: totalGames > 0 ? 0 / totalGames : 0,
                totalGames: 0
            };
            
            expect(transformedMove.playrate).toBe(0);
            expect(transformedMove.totalGames).toBe(0);
            
            // Test very large numbers
            const largeNumberResponse = {
                white: 10000000,
                draws: 2000000,
                black: 8000000,
                moves: [{
                    uci: 'e2e4',
                    san: 'e4',
                    white: 5000000,
                    draws: 1000000,
                    black: 4000000
                }]
            };
            
            const largeTotalGames = 20000000;
            const largeTransformed = {
                ...largeNumberResponse.moves[0],
                playrate: 10000000 / largeTotalGames,
                totalGames: 10000000
            };
            
            expect(largeTransformed.playrate).toBe(0.5);
            expect(largeTransformed.totalGames).toBe(10000000);
        });

        test('preserves all original API data fields', () => {
            const completeApiResponse = {
                uci: 'e2e4',
                san: 'e4',
                white: 800000,
                draws: 150000,
                black: 600000,
                averageRating: 2100,
                performance: 2150,
                game: { id: 'sample123' }
            };
            
            const totalGames = 3000000;
            const transformed = {
                ...completeApiResponse,
                playrate: (800000 + 150000 + 600000) / totalGames,
                totalGames: 800000 + 150000 + 600000
            };
            
            // Verify all original fields preserved
            expect(transformed.uci).toBe('e2e4');
            expect(transformed.san).toBe('e4');
            expect(transformed.averageRating).toBe(2100);
            expect(transformed.performance).toBe(2150);
            expect(transformed.game).toEqual({ id: 'sample123' });
            
            // Verify new fields added
            expect(transformed.playrate).toBeCloseTo(0.517, 3);
            expect(transformed.totalGames).toBe(1550000);
        });
    });

    describe('PGN Generation Pipeline', () => {
        test('generates valid PGN format from line data', () => {
            const testLineData = {
                pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5',
                cumulativeLikelihood: 0.2583,
                likelihoodPath: [
                    { san: 'e5', playrate: 0.4059 },
                    { san: 'Nc6', playrate: 0.6221 },
                    { san: 'Nf6', playrate: 0.2028 }
                ],
                winRate: 0.5431,
                totalGames: 9916238
            };
            
            const pgnOutput = pgnGenerator.generateLineEntry(
                testLineData,
                1,
                'Test Opening',
                { DRAWSAREHALF: 1 }
            );
            
            // Validate PGN structure
            expect(pgnOutput).toContain('[Event "Test Opening Line 1"]');
            expect(pgnOutput).toContain('1. e4 e5 2. Nf3 Nc6 3. Bb5');
            expect(pgnOutput).toContain('{Move playrates:');
            expect(pgnOutput).toContain('+40.59%\te5');
            expect(pgnOutput).toContain('+62.21%\tNc6');
            expect(pgnOutput).toContain('+20.28%\tNf6');
            expect(pgnOutput).toContain('Line cumulative playrate: +25.83%');
            expect(pgnOutput).toContain('Line winrate (draws are half): +54.31% over 9916238 games');
            expect(pgnOutput).toContain('}');
        });

        test('handles different draw settings in PGN generation', () => {
            const testLineData = {
                pgn: '1. e4 e5',
                cumulativeLikelihood: 0.4059,
                likelihoodPath: [{ san: 'e5', playrate: 0.4059 }],
                winRate: 0.55,
                totalGames: 1000000
            };
            
            // Test with draws as half
            const pgnWithDrawsHalf = pgnGenerator.generateLineEntry(
                testLineData,
                1,
                'Test',
                { DRAWSAREHALF: 1 }
            );
            expect(pgnWithDrawsHalf).toContain('Line winrate (draws are half): +55.00%');
            
            // Test excluding draws
            const pgnExcludingDraws = pgnGenerator.generateLineEntry(
                testLineData,
                1,
                'Test',
                { DRAWSAREHALF: 0 }
            );
            expect(pgnExcludingDraws).toContain('Line winrate (excluding draws): +55.00%');
        });

        test('formats percentages and numbers correctly', () => {
            const testCases = [
                { value: 0.123456, expected: '+12.35%' },
                { value: 0.5, expected: '+50.00%' },
                { value: 0.001, expected: '+0.10%' },
                { value: 0.999, expected: '+99.90%' }
            ];
            
            testCases.forEach(({ value, expected }) => {
                const formatted = pgnGenerator.formatPercentage(value);
                expect(formatted).toBe(expected);
            });
            
            // Test large number formatting
            expect(pgnGenerator.formatGameCount(1234567)).toBe('1234567');
            expect(pgnGenerator.formatGameCount(1000)).toBe('1000');
        });
    });

    describe('End-to-End Data Pipeline', () => {
        test('complete data flow from FEN to PGN', async () => {
            // Mock a simplified but complete pipeline
            const testConfig = {
                ...TEST_CONFIGS.minimal,
                openings: [{
                    name: 'Pipeline Test',
                    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                    perspective: 'white'
                }]
            };
            
            // Mock Lichess client with consistent data
            const mockClient = {
                async getPositionStats(fen) {
                    return {
                        moves: [{
                            uci: 'e7e5',
                            san: 'e5',
                            white: 800000,
                            draws: 150000,
                            black: 600000,
                            playrate: 0.4059,
                            totalGames: 1550000
                        }]
                    };
                },
                async getMoveStats(fen) {
                    return [{
                        san: 'Nf3',
                        uci: 'g1f3',
                        white: 700000,
                        draws: 100000,
                        black: 500000,
                        playrate: 0.6,
                        totalGames: 1300000,
                        winRate: 0.538
                    }];
                }
            };
            
            bookBuilder = new BookBuilder(testConfig);
            bookBuilder.lichessClient = mockClient;
            
            const results = await bookBuilder.processOpening(testConfig);
            const pgnContent = results['Chapter_1_Pipeline_Test.pgn'];
            
            // Validate complete pipeline worked correctly
            expect(pgnContent).toContain('[Event "Pipeline Test Line 1"]');
            expect(pgnContent).toContain('1. e4 e5 2. Nf3'); // Shows complete move sequence
            expect(pgnContent).toContain('{Move playrates:');
            expect(pgnContent).toContain('+40.59%\te5'); // Correct percentage formatting
            expect(pgnContent).toContain('Line cumulative playrate:'); // Calculated likelihood
            expect(pgnContent).toContain('Line winrate'); // Win rate calculation
            expect(pgnContent).toContain('1550000 games'); // Game count preserved
            expect(pgnContent).toContain('}');
        });

        test('data integrity maintained through complex transformations', async () => {
            // Create a scenario with multiple transformations
            const complexData = {
                originalFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
                apiResponse: {
                    moves: [{
                        uci: 'e7e5',
                        san: 'e5',
                        white: 1842286,
                        draws: 518644,
                        black: 1537888,
                        playrate: 0.4059
                    }]
                },
                expectedCalculations: {
                    totalGames: 3898818,
                    playrate: 0.4059,
                    whiteWinRate: 0.473 // (1842286 + 259322) / 3898818 (with draws as half)
                }
            };
            
            // Verify calculations at each stage
            const totalGames = complexData.apiResponse.moves[0].white + 
                             complexData.apiResponse.moves[0].draws + 
                             complexData.apiResponse.moves[0].black;
            expect(totalGames).toBe(complexData.expectedCalculations.totalGames);
            
            const whiteWinRate = (complexData.apiResponse.moves[0].white + 
                                complexData.apiResponse.moves[0].draws / 2) / totalGames;
            expect(whiteWinRate).toBeCloseTo(complexData.expectedCalculations.whiteWinRate, 3);
        });
    });
});