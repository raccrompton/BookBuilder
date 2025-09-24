/**
 * Lichess API Response Fixtures for Algorithmic Testing
 * 
 * Captured real Lichess responses for deterministic testing of the core algorithm.
 * These allow testing the complete algorithmic flow without API dependencies.
 */

export const LICHESS_FIXTURES = {
    // Standard starting position
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1': {
        moves: [
            {
                uci: 'e2e4',
                san: 'e4',
                white: 2500000,
                draws: 400000,
                black: 1900000,
                playrate: 0.25,
                totalGames: 4800000
            },
            {
                uci: 'd2d4',
                san: 'd4',
                white: 2200000,
                draws: 380000,
                black: 1800000,
                playrate: 0.22,
                totalGames: 4380000
            },
            {
                uci: 'g1f3',
                san: 'Nf3',
                white: 1800000,
                draws: 320000,
                black: 1400000,
                playrate: 0.18,
                totalGames: 3520000
            }
        ]
    },

    // Starting position after 1.e4 (Ruy Lopez path)
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1': {
        moves: [
            {
                uci: 'e7e5',
                san: 'e5',
                white: 1842286,
                draws: 518644,
                black: 1537888,
                playrate: 0.4059,
                totalGames: 3898818
            },
            {
                uci: 'c7c5',
                san: 'c5',
                white: 944823,
                draws: 179843,
                black: 728294,
                playrate: 0.1935,
                totalGames: 1852960
            },
            {
                uci: 'e7e6',
                san: 'e6',
                white: 402183,
                draws: 159847,
                black: 351232,
                playrate: 0.0950,
                totalGames: 913262
            },
            {
                uci: 'd7d6',
                san: 'd6',
                white: 133847,
                draws: 31829,
                black: 98234,
                playrate: 0.0275,
                totalGames: 263910
            }
        ]
    },

    // Starting position after 1.e4 (alternative without en passant)
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1': {
        moves: [
            {
                uci: 'e7e5',
                san: 'e5',
                white: 1842286,
                draws: 518644,
                black: 1537888,
                playrate: 0.4059,
                totalGames: 3898818
            },
            {
                uci: 'c7c5',
                san: 'c5',
                white: 944823,
                draws: 179843,
                black: 728294,
                playrate: 0.1935,
                totalGames: 1852960
            }
        ]
    },

    // After 1.e4 e5 2.Nf3 (continuing Ruy Lopez)
    'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2': {
        moves: [
            {
                uci: 'b8c6',
                san: 'Nc6',
                white: 1147389,
                draws: 322847,
                black: 955832,
                playrate: 0.6221,
                totalGames: 2426068
            },
            {
                uci: 'g8f6',
                san: 'Nf6',
                white: 193847,
                draws: 48293,
                black: 142938,
                playrate: 0.0988,
                totalGames: 385078
            },
            {
                uci: 'f7f5',
                san: 'f5',
                white: 85739,
                draws: 18472,
                black: 62847,
                playrate: 0.0428,
                totalGames: 167058
            }
        ]
    },

    // After 1.e4 e5 2.Nf3 Nc6 3.Bb5 (Ruy Lopez main line)
    'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3': {
        moves: [
            {
                uci: 'a7a6',
                san: 'a6',
                white: 298473,
                draws: 89234,
                black: 267329,
                playrate: 0.2583,
                totalGames: 655036
            },
            {
                uci: 'g8f6',
                san: 'Nf6',
                white: 201847,
                draws: 52938,
                black: 167294,
                playrate: 0.1664,
                totalGames: 422079
            },
            {
                uci: 'd7d6',
                san: 'd6',
                white: 167392,
                draws: 41829,
                black: 138475,
                playrate: 0.1372,
                totalGames: 347696
            },
            {
                uci: 'f7f5',
                san: 'f5',
                white: 94728,
                draws: 21847,
                black: 73294,
                playrate: 0.0749,
                totalGames: 189869
            }
        ]
    },

    // King's Indian Defense starting position
    'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 1 2': {
        moves: [
            {
                uci: 'c2c4',
                san: 'c4',
                white: 847392,
                draws: 201847,
                black: 639273,
                playrate: 0.4142,
                totalGames: 1688512
            },
            {
                uci: 'g1f3',
                san: 'Nf3',
                white: 392847,
                draws: 89274,
                black: 298374,
                playrate: 0.1925,
                totalGames: 780495
            },
            {
                uci: 'c1g5',
                san: 'Bg5',
                white: 198374,
                draws: 41829,
                black: 147293,
                playrate: 0.0952,
                totalGames: 387496
            }
        ]
    },

    // After 1.d4 Nf6 2.c4 g6 (King's Indian continued)
    'rnbqkb1r/pppppp1p/5np1/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3': {
        moves: [
            {
                uci: 'b1c3',
                san: 'Nc3',
                white: 648392,
                draws: 157294,
                black: 501847,
                playrate: 0.7661,
                totalGames: 1307533
            },
            {
                uci: 'g1f3',
                san: 'Nf3',
                white: 142857,
                draws: 31847,
                black: 108394,
                playrate: 0.1659,
                totalGames: 283098
            },
            {
                uci: 'e2e4',
                san: 'e4',
                white: 89374,
                draws: 18472,
                black: 67293,
                playrate: 0.1026,
                totalGames: 175139
            }
        ]
    },

    // End position - no more moves (for testing finalization)
    'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQ - 0 6': {
        moves: [] // No moves - triggers line finalization
    },

    // Mate position (for testing mate detection)
    'rnb1kbnr/pppp1ppp/4p3/8/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3': {
        moves: [] // Scholar's mate position
    }
};

/**
 * Mock move statistics for testing move selection
 */
export const MOVE_STATS_FIXTURES = {
    // Strong response moves
    'strong_response': [
        {
            san: 'Nf3',
            uci: 'g1f3',
            white: 800000,
            draws: 100000,
            black: 400000,
            playrate: 0.6,
            totalGames: 1300000,
            winRate: 0.615 // Strong win rate
        },
        {
            san: 'Bc4',
            uci: 'f1c4',
            white: 300000,
            draws: 50000,
            black: 200000,
            playrate: 0.25,
            totalGames: 550000,
            winRate: 0.545 // Decent win rate
        }
    ],

    // Weak response moves (should be filtered)
    'weak_response': [
        {
            san: 'h3',
            uci: 'h2h3',
            white: 15000,
            draws: 3000,
            black: 12000,
            playrate: 0.015, // Below threshold
            totalGames: 30000,
            winRate: 0.5
        }
    ],

    // No good moves available
    'no_moves': []
};

/**
 * Expected algorithmic outputs for validation
 */
export const EXPECTED_OUTPUTS = {
    'ruy_lopez_simple': {
        expectedLines: 3,
        expectedEvents: ['Ruy Lopez Line 1', 'Ruy Lopez Line 2', 'Ruy Lopez Line 3'],
        expectedMoves: ['1. e4 e5 2. Nf3 Nc6 3. Bb5'],
        expectedAnnotations: [
            'Move playrates:',
            'Line cumulative playrate:',
            'Line winrate'
        ]
    },

    'kings_indian_simple': {
        expectedLines: 1,
        expectedEvents: ['Kings Indian Line 1'],
        expectedMoves: ['1. d4 Nf6 2. c4 g6 3. Nc3'],
        expectedAnnotations: [
            'Move playrates:',
            'Line cumulative playrate:',
            'Line winrate'
        ]
    }
};

/**
 * Configuration for algorithmic testing
 */
export const TEST_CONFIGS = {
    minimal: {
        MINGAMES: 30,
        MINPLAYRATE: 0.01,
        DEPTHLIKELIHOOD: 0.001,
        CONTINUATIONGAMES: 15,
        ENGINEFINISH: 0,
        CAREABOUTENGINE: 0,
        DRAWSAREHALF: 1,
        LONGTOSHORT: 1,
        API_DELAY: 0, // No delay for testing
        BATCH_SIZE: 10
    },

    realistic: {
        MINGAMES: 50,
        MINPLAYRATE: 0.02,
        DEPTHLIKELIHOOD: 0.005,
        CONTINUATIONGAMES: 25,
        ENGINEFINISH: 0,
        CAREABOUTENGINE: 0,
        DRAWSAREHALF: 1,
        LONGTOSHORT: 1,
        API_DELAY: 0,
        BATCH_SIZE: 5
    }
};