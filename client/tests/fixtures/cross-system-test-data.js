/**
 * Cross-System Test Data
 *
 * Curated test positions and configurations for comprehensive validation
 * between Python and JavaScript BookBuilder implementations.
 */

// Standard test configuration that both systems can handle
const STANDARD_TEST_CONFIG = {
    // API Configuration
    VARIANT: 'standard',
    SPEEDS: ['blitz', 'rapid', 'classical'],
    RATINGS: ['1600', '1800', '2000', '2200', '2500'],
    MOVES: 15,

    // Algorithm Parameters
    DEPTHLIKELIHOOD: 0.05,
    MINPLAYRATE: 0.01,
    CONTINUATIONGAMES: 1000,
    MINGAMES: 100,

    // Engine Configuration (disabled for testing to avoid engine dependencies)
    CAREABOUTENGINE: false,
    ENGINEFINISH: false,
    ENGINEPATH: '/usr/local/bin/stockfish',
    ENGINEDEPTH: 15,
    ENGINEHASH: 256,
    ENGINETHREADS: 1,

    // Statistical Configuration
    DRAWSAREHALF: true,
    ALPHA: 0.05,
    SOUNDNESSLIMIT: -200,
    MOVELOSSLIMIT: -50,
    IGNORELOSSLIMIT: 200,

    // Output Configuration
    LONGTOSHORT: false,
    PRINT_INFO_TO_CONSOLE: false
};

// Test positions with known characteristics
const TEST_POSITIONS = {
    // Opening positions with rich data
    ruy_lopez: {
        name: 'Ruy_Lopez',
        description: 'Classical Ruy Lopez opening with extensive database coverage',
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5',
        perspective: 'white',
        expectedLines: 3,
        expectedMoves: ['a6', 'Nf6', 'd6'],
        complexity: 'medium'
    },

    kings_indian: {
        name: 'Kings_Indian',
        description: 'King\'s Indian Defense from Black\'s perspective',
        fen: 'rnbqkb1r/pppppp1p/5np1/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 4',
        pgn: '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7',
        perspective: 'black',
        expectedLines: 2,
        expectedMoves: ['d6', 'O-O'],
        complexity: 'medium'
    },

    sicilian_dragon: {
        name: 'Sicilian_Dragon',
        description: 'Sicilian Dragon variation with tactical complexity',
        fen: 'rnbqk2r/pp2ppbp/3p1np1/8/2PP4/2N2N2/PP2PPPP/R1BQKB1R w KQkq - 0 6',
        pgn: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6',
        perspective: 'white',
        expectedLines: 4,
        expectedMoves: ['Be3', 'f3', 'Bc4', 'h3'],
        complexity: 'high'
    },

    queens_gambit: {
        name: 'Queens_Gambit',
        description: 'Queen\'s Gambit Declined mainline',
        fen: 'rnbqkb1r/ppp1pppp/5n2/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
        pgn: '1. d4 d5 2. c4 Nf6',
        perspective: 'white',
        expectedLines: 3,
        expectedMoves: ['Nc3', 'cxd5', 'Nf3'],
        complexity: 'medium'
    },

    // Edge case positions
    endgame_position: {
        name: 'Endgame_Test',
        description: 'Late endgame position with limited data',
        fen: '8/8/8/8/8/3k4/3P4/3K4 w - - 0 1',
        pgn: '', // Start from endgame position
        perspective: 'white',
        expectedLines: 1,
        expectedMoves: ['Kd2'],
        complexity: 'low'
    },

    mate_in_few: {
        name: 'Mate_Position',
        description: 'Position with forced mate sequences',
        fen: 'r1bqkb1r/pppp1ppp/2n2n2/1B2p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 0 4',
        pgn: '1. e4 e5 2. Bc4 Nc6 3. Bb5 Nf6',
        perspective: 'white',
        expectedLines: 2,
        expectedMoves: ['Qf3', 'Nc3'],
        complexity: 'high'
    }
};

// Configuration variations for testing different parameters
const CONFIG_VARIATIONS = {
    strict_filtering: {
        ...STANDARD_TEST_CONFIG,
        DEPTHLIKELIHOOD: 0.10,
        MINPLAYRATE: 0.02,
        CONTINUATIONGAMES: 2000,
        MINGAMES: 500,
        description: 'Strict filtering - fewer but higher quality lines'
    },

    permissive_filtering: {
        ...STANDARD_TEST_CONFIG,
        DEPTHLIKELIHOOD: 0.02,
        MINPLAYRATE: 0.005,
        CONTINUATIONGAMES: 500,
        MINGAMES: 50,
        description: 'Permissive filtering - more lines with lower thresholds'
    },

    draws_as_losses: {
        ...STANDARD_TEST_CONFIG,
        DRAWSAREHALF: false,
        description: 'Draws counted as losses for win rate calculations'
    },

    long_to_short: {
        ...STANDARD_TEST_CONFIG,
        LONGTOSHORT: true,
        description: 'Order lines from longest to shortest'
    },

    with_engine: {
        ...STANDARD_TEST_CONFIG,
        CAREABOUTENGINE: true,
        ENGINEFINISH: true,
        description: 'Engine validation and completion enabled'
    }
};

// Comprehensive test scenarios combining positions and configurations
const TEST_SCENARIOS = [
    {
        name: 'ruy_lopez_standard',
        description: 'Ruy Lopez with standard configuration',
        position: TEST_POSITIONS.ruy_lopez,
        config: STANDARD_TEST_CONFIG,
        expectedBehavior: {
            shouldSucceed: true,
            minLines: 2,
            maxLines: 5,
            shouldHaveWinrates: true,
            shouldHavePlayrates: true
        }
    },

    {
        name: 'kings_indian_strict',
        description: 'King\'s Indian with strict filtering',
        position: TEST_POSITIONS.kings_indian,
        config: CONFIG_VARIATIONS.strict_filtering,
        expectedBehavior: {
            shouldSucceed: true,
            minLines: 1,
            maxLines: 3,
            shouldHaveWinrates: true,
            shouldHavePlayrates: true
        }
    },

    {
        name: 'sicilian_permissive',
        description: 'Sicilian Dragon with permissive filtering',
        position: TEST_POSITIONS.sicilian_dragon,
        config: CONFIG_VARIATIONS.permissive_filtering,
        expectedBehavior: {
            shouldSucceed: true,
            minLines: 3,
            maxLines: 8,
            shouldHaveWinrates: true,
            shouldHavePlayrates: true
        }
    },

    {
        name: 'queens_gambit_draws_losses',
        description: 'Queen\'s Gambit with draws counted as losses',
        position: TEST_POSITIONS.queens_gambit,
        config: CONFIG_VARIATIONS.draws_as_losses,
        expectedBehavior: {
            shouldSucceed: true,
            minLines: 2,
            maxLines: 4,
            shouldHaveWinrates: true,
            shouldHavePlayrates: true
        }
    },

    {
        name: 'endgame_minimal_data',
        description: 'Endgame position with minimal database coverage',
        position: TEST_POSITIONS.endgame_position,
        config: STANDARD_TEST_CONFIG,
        expectedBehavior: {
            shouldSucceed: true,
            minLines: 0,
            maxLines: 2,
            shouldHaveWinrates: false,
            shouldHavePlayrates: false
        }
    }
];

// Mock Lichess API responses for deterministic testing
const MOCK_API_RESPONSES = {
    ruy_lopez_after_bb5: {
        white: 125000,
        black: 95000,
        draws: 30000,
        moves: [
            {
                san: 'a6',
                uci: 'a7a6',
                white: 45000,
                black: 35000,
                draws: 10000,
                averageRating: 2100
            },
            {
                san: 'Nf6',
                uci: 'g8f6',
                white: 35000,
                black: 28000,
                draws: 7000,
                averageRating: 2150
            },
            {
                san: 'd6',
                uci: 'd7d6',
                white: 25000,
                black: 18000,
                draws: 7000,
                averageRating: 2050
            }
        ]
    },

    kings_indian_main: {
        white: 85000,
        black: 95000,
        draws: 20000,
        moves: [
            {
                san: 'd6',
                uci: 'd7d6',
                white: 30000,
                black: 35000,
                draws: 8000,
                averageRating: 2200
            },
            {
                san: 'O-O',
                uci: 'e8g8',
                white: 25000,
                black: 30000,
                draws: 6000,
                averageRating: 2250
            }
        ]
    }
};

// Statistical validation data for precision testing
const STATISTICAL_TEST_DATA = {
    confidence_intervals: [
        {
            white: 100000,
            black: 100000,
            draws: 0,
            totalGames: 200000,
            expectedWinRate: 0.5000,
            expectedLowerBound: 0.4978,
            expectedUpperBound: 0.5022,
            tolerance: 0.0001
        },
        {
            white: 120000,
            black: 80000,
            draws: 0,
            totalGames: 200000,
            expectedWinRate: 0.6000,
            expectedLowerBound: 0.5978,
            expectedUpperBound: 0.6022,
            tolerance: 0.0001
        }
    ],

    wilson_score_intervals: [
        {
            successes: 60,
            trials: 100,
            confidence: 0.95,
            expectedLower: 0.4972,
            expectedUpper: 0.6936,
            tolerance: 0.0001
        }
    ]
};

module.exports = {
    STANDARD_TEST_CONFIG,
    TEST_POSITIONS,
    CONFIG_VARIATIONS,
    TEST_SCENARIOS,
    MOCK_API_RESPONSES,
    STATISTICAL_TEST_DATA
};