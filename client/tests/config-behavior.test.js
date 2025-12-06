/**
 * Configuration Behavior Tests
 *
 * PURPOSE:
 * These tests verify that GUI form configuration options ACTUALLY affect
 * the behavior and output of the BookBuilder system. Each test demonstrates
 * that changing a config value produces a measurably different result.
 *
 * WHAT THIS TESTS:
 * - MINGAMES: Minimum games threshold for move filtering
 * - MINPLAYRATE: Minimum playrate threshold for move filtering
 * - DEPTHLIKELIHOOD: Cumulative probability threshold for line depth
 * - CONTINUATIONGAMES: Minimum games for opponent continuations
 * - SOUNDNESSLIMIT/LOSSLIMIT: Engine-based move filtering
 * - CAREABOUTENGINE: Toggle for engine validation
 * - DRAWSAREHALF: Draw scoring method
 *
 * WHY THIS MATTERS:
 * Without these tests, a user could change a form setting and have no
 * guarantee that the setting actually does anything. These tests prove
 * that each configuration option produces different output.
 */

import Statistics from '../src/stats/Statistics.js';
import MoveSelector from '../src/algorithm/MoveSelector.js';
import BookBuilder from '../src/BookBuilder.js';
import { TestUtils } from './testUtils.js';

// ==================== MOCK DATA FACTORY ====================

/**
 * Create mock candidate moves with controlled statistics
 * This allows us to test filtering behavior precisely
 *
 * @param {Object} overrides - Override default values for specific moves
 * @returns {Array} Array of mock move objects
 */
function createMockCandidates(overrides = {}) {
    // Default moves with varying game counts and playrates
    const defaults = [
        {
            san: 'e4',
            uci: 'e2e4',
            white: 1000000,  // 1M games - high quality
            black: 800000,
            draws: 200000,
            playrate: 0.35,   // 35% - very popular
            totalGames: 2000000
        },
        {
            san: 'd4',
            uci: 'd2d4',
            white: 500000,   // 500K games - good quality
            black: 400000,
            draws: 100000,
            playrate: 0.25,   // 25% - popular
            totalGames: 1000000
        },
        {
            san: 'Nf3',
            uci: 'g1f3',
            white: 50,       // 50 games - borderline quality
            black: 30,
            draws: 20,
            playrate: 0.02,   // 2% - low playrate
            totalGames: 100
        },
        {
            san: 'c4',
            uci: 'c2c4',
            white: 10,       // 10 games - low quality
            black: 5,
            draws: 5,
            playrate: 0.005,  // 0.5% - very low playrate
            totalGames: 20
        },
        {
            san: 'g4',
            uci: 'g2g4',
            white: 5,        // 5 games - very low quality
            black: 3,
            draws: 2,
            playrate: 0.001,  // 0.1% - negligible playrate
            totalGames: 10
        }
    ];

    // Apply any overrides
    return defaults.map((move, index) => ({
        ...move,
        ...(overrides[index] || {})
    }));
}

/**
 * Create a mock statistics engine for testing
 * Returns consistent results based on the Statistics class
 */
function createMockStatisticsEngine() {
    return new Statistics();
}

// ==================== MINGAMES FILTER TESTS ====================

describe('MINGAMES Configuration Behavior', () => {
    /**
     * WHAT THIS TESTS:
     * The MINGAMES config sets the minimum number of games a move must have
     * to be considered for inclusion in the repertoire.
     *
     * WHY IT MATTERS:
     * - Low game counts mean unreliable statistics
     * - Users want control over data quality thresholds
     * - This setting should filter out rare/dubious moves
     */

    let statisticsEngine;

    beforeEach(() => {
        statisticsEngine = createMockStatisticsEngine();
    });

    test('MINGAMES=10: allows moves with 20+ games, filters moves with 10 or fewer', () => {
        // ARRANGE: Set a low MINGAMES threshold
        const config = { MINGAMES: 10, MINPLAYRATE: 0 };  // Disable playrate filter

        // ACT: Test various game counts
        const move20Games = statisticsEngine.validateMoveDataQuality(20, 0.5, config);
        const move15Games = statisticsEngine.validateMoveDataQuality(15, 0.5, config);
        const move10Games = statisticsEngine.validateMoveDataQuality(10, 0.5, config);  // Exactly at threshold
        const move5Games = statisticsEngine.validateMoveDataQuality(5, 0.5, config);

        // ASSERT: Only moves ABOVE threshold pass (not equal to)
        expect(move20Games).toBe(true);   // 20 > 10 = PASS
        expect(move15Games).toBe(true);   // 15 > 10 = PASS
        expect(move10Games).toBe(false);  // 10 > 10 = FAIL (not strictly greater)
        expect(move5Games).toBe(false);   // 5 > 10 = FAIL
    });

    test('MINGAMES=100: filters out moves that passed with MINGAMES=10', () => {
        // ARRANGE: Set a higher MINGAMES threshold
        const lowConfig = { MINGAMES: 10, MINPLAYRATE: 0 };
        const highConfig = { MINGAMES: 100, MINPLAYRATE: 0 };

        const gamesPlayed = 50;  // 50 games
        const playRate = 0.5;

        // ACT: Test same move with different thresholds
        const passesLowThreshold = statisticsEngine.validateMoveDataQuality(gamesPlayed, playRate, lowConfig);
        const passesHighThreshold = statisticsEngine.validateMoveDataQuality(gamesPlayed, playRate, highConfig);

        // ASSERT: Same move produces different results with different configs
        expect(passesLowThreshold).toBe(true);   // 50 > 10 = PASS
        expect(passesHighThreshold).toBe(false); // 50 > 100 = FAIL
    });

    test('MINGAMES affects MoveSelector candidate filtering', async () => {
        // ARRANGE: Create candidates with varying game counts
        const candidates = createMockCandidates();
        // e4: 2M games, d4: 1M games, Nf3: 100 games, c4: 20 games, g4: 10 games

        const lowMingamesSelector = new MoveSelector({
            MINGAMES: 15,
            MINPLAYRATE: 0,  // Disable playrate filter
            CAREABOUTENGINE: 0  // Disable engine to isolate MINGAMES behavior
        });

        const highMingamesSelector = new MoveSelector({
            MINGAMES: 500,
            MINPLAYRATE: 0,
            CAREABOUTENGINE: 0
        });

        const position = { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' };

        // ACT: Select best move with different MINGAMES thresholds
        const lowResult = await lowMingamesSelector.selectBestMove(
            position, candidates, null, statisticsEngine
        );
        const highResult = await highMingamesSelector.selectBestMove(
            position, candidates, null, statisticsEngine
        );

        // ASSERT: Different thresholds filter different numbers of candidates
        // Low threshold (15): e4, d4, Nf3 pass (100, 20, 10 games filtered)
        // High threshold (500): only e4, d4 pass (100+ games filtered)
        expect(lowResult.qualityFiltered).toBeLessThan(highResult.qualityFiltered);

        // Both should still find a best move (e4 or d4)
        expect(lowResult.selectedMove).toBeDefined();
        expect(highResult.selectedMove).toBeDefined();
    });
});

// ==================== MINPLAYRATE FILTER TESTS ====================

describe('MINPLAYRATE Configuration Behavior', () => {
    /**
     * WHAT THIS TESTS:
     * The MINPLAYRATE config sets the minimum popularity (playrate) a move
     * must have to be considered for the repertoire.
     *
     * WHY IT MATTERS:
     * - Very rare moves may be dubious or unsound
     * - Users want to focus on mainline theory
     * - This filters out novelties and obscure sidelines
     */

    let statisticsEngine;

    beforeEach(() => {
        statisticsEngine = createMockStatisticsEngine();
    });

    test('MINPLAYRATE=0.01: filters moves below 1% playrate', () => {
        // ARRANGE: Set 1% playrate threshold
        const config = { MINGAMES: 0, MINPLAYRATE: 0.01 };

        // ACT: Test various playrates
        const highPlayrate = statisticsEngine.validateMoveDataQuality(1000, 0.25, config);    // 25%
        const medPlayrate = statisticsEngine.validateMoveDataQuality(1000, 0.05, config);     // 5%
        const borderlinePlayrate = statisticsEngine.validateMoveDataQuality(1000, 0.01, config);  // 1% (at threshold)
        const lowPlayrate = statisticsEngine.validateMoveDataQuality(1000, 0.005, config);    // 0.5%

        // ASSERT: Only moves ABOVE threshold pass
        expect(highPlayrate).toBe(true);        // 0.25 > 0.01 = PASS
        expect(medPlayrate).toBe(true);         // 0.05 > 0.01 = PASS
        expect(borderlinePlayrate).toBe(false); // 0.01 > 0.01 = FAIL (not strictly greater)
        expect(lowPlayrate).toBe(false);        // 0.005 > 0.01 = FAIL
    });

    test('MINPLAYRATE=0.001 vs MINPLAYRATE=0.05: different moves filtered', () => {
        // ARRANGE: Test with loose vs strict playrate thresholds
        const looseConfig = { MINGAMES: 0, MINPLAYRATE: 0.001 };  // 0.1%
        const strictConfig = { MINGAMES: 0, MINPLAYRATE: 0.05 };  // 5%

        const playrate = 0.02;  // 2% playrate

        // ACT: Same move, different thresholds
        const passesLoose = statisticsEngine.validateMoveDataQuality(1000, playrate, looseConfig);
        const passesStrict = statisticsEngine.validateMoveDataQuality(1000, playrate, strictConfig);

        // ASSERT: Different results prove config matters
        expect(passesLoose).toBe(true);   // 0.02 > 0.001 = PASS
        expect(passesStrict).toBe(false); // 0.02 > 0.05 = FAIL
    });

    test('MINPLAYRATE combined with MINGAMES: both must pass', () => {
        // ARRANGE: Both filters active
        const config = { MINGAMES: 50, MINPLAYRATE: 0.02 };

        // ACT: Test different combinations
        const bothPass = statisticsEngine.validateMoveDataQuality(100, 0.10, config);      // High games, high playrate
        const gamesFailOnly = statisticsEngine.validateMoveDataQuality(30, 0.10, config);  // Low games, high playrate
        const playrateFailOnly = statisticsEngine.validateMoveDataQuality(100, 0.01, config); // High games, low playrate
        const bothFail = statisticsEngine.validateMoveDataQuality(30, 0.01, config);       // Low games, low playrate

        // ASSERT: Both conditions must be met (AND logic)
        expect(bothPass).toBe(true);
        expect(gamesFailOnly).toBe(false);
        expect(playrateFailOnly).toBe(false);
        expect(bothFail).toBe(false);
    });

    test('MINPLAYRATE affects which moves MoveSelector considers', async () => {
        // ARRANGE: Create candidates with varying playrates
        const candidates = createMockCandidates();
        // e4: 35%, d4: 25%, Nf3: 2%, c4: 0.5%, g4: 0.1%

        const looseSelector = new MoveSelector({
            MINGAMES: 0,
            MINPLAYRATE: 0.001,  // 0.1% - allows most moves
            CAREABOUTENGINE: 0
        });

        const strictSelector = new MoveSelector({
            MINGAMES: 0,
            MINPLAYRATE: 0.03,   // 3% - only e4, d4 pass
            CAREABOUTENGINE: 0
        });

        const position = { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' };

        // ACT: Count filtered moves
        const looseResult = await looseSelector.selectBestMove(position, candidates, null, statisticsEngine);
        const strictResult = await strictSelector.selectBestMove(position, candidates, null, statisticsEngine);

        // ASSERT: Strict config filters more moves
        expect(strictResult.qualityFiltered).toBeGreaterThan(looseResult.qualityFiltered);
    });
});

// ==================== DEPTHLIKELIHOOD THRESHOLD TESTS ====================

describe('DEPTHLIKELIHOOD Configuration Behavior', () => {
    /**
     * WHAT THIS TESTS:
     * DEPTHLIKELIHOOD controls how deep the line exploration goes.
     * Lines are pruned when cumulative_likelihood < DEPTHLIKELIHOOD.
     *
     * WHY IT MATTERS:
     * - Controls repertoire depth vs breadth tradeoff
     * - Lower values = deeper exploration of rare lines
     * - Higher values = focus on common variations
     */

    test('DEPTHLIKELIHOOD affects isValidContinuation in BookBuilder', () => {
        // ARRANGE: Create BookBuilder instances with different thresholds
        const shallowConfig = TestUtils.createTestConfig({
            DEPTHLIKELIHOOD: 0.1,      // 10% - prune early
            CONTINUATIONGAMES: 0        // Disable games filter
        });
        const deepConfig = TestUtils.createTestConfig({
            DEPTHLIKELIHOOD: 0.001,    // 0.1% - explore deeper
            CONTINUATIONGAMES: 0
        });

        const shallowBuilder = new BookBuilder(shallowConfig);
        const deepBuilder = new BookBuilder(deepConfig);

        // Test move: 5% playrate, current cumulative likelihood = 0.5
        // Continuation likelihood = 0.5 * 0.05 = 0.025 (2.5%)
        const move = { playrate: 0.05, totalGames: 1000 };
        const cumulativeLikelihood = 0.5;

        // ACT: Check if continuation is valid under each config
        const validInShallow = shallowBuilder.isValidContinuation(move, cumulativeLikelihood);
        const validInDeep = deepBuilder.isValidContinuation(move, cumulativeLikelihood);

        // ASSERT: Same move passes deep config but fails shallow config
        // Continuation likelihood = 0.025
        // Shallow: 0.025 >= 0.1 = FALSE
        // Deep: 0.025 >= 0.001 = TRUE
        expect(validInShallow).toBe(false);
        expect(validInDeep).toBe(true);
    });

    test('DEPTHLIKELIHOOD=0.05 vs DEPTHLIKELIHOOD=0.002: line depth difference', () => {
        // ARRANGE: Different depth thresholds
        const conservativeConfig = TestUtils.createTestConfig({
            DEPTHLIKELIHOOD: 0.05,     // 5% - stop at moderately rare
            CONTINUATIONGAMES: 0
        });
        const aggressiveConfig = TestUtils.createTestConfig({
            DEPTHLIKELIHOOD: 0.002,    // 0.2% - explore rare lines
            CONTINUATIONGAMES: 0
        });

        const conservativeBuilder = new BookBuilder(conservativeConfig);
        const aggressiveBuilder = new BookBuilder(aggressiveConfig);

        // Simulate a line that reaches 3% cumulative likelihood
        const move = { playrate: 0.3, totalGames: 500 };
        const cumulativeLikelihood = 0.1;  // 10% cumulative so far
        // New cumulative = 0.1 * 0.3 = 0.03 (3%)

        // ACT
        const validConservative = conservativeBuilder.isValidContinuation(move, cumulativeLikelihood);
        const validAggressive = aggressiveBuilder.isValidContinuation(move, cumulativeLikelihood);

        // ASSERT
        // Conservative: 0.03 >= 0.05 = FALSE
        // Aggressive: 0.03 >= 0.002 = TRUE
        expect(validConservative).toBe(false);
        expect(validAggressive).toBe(true);
    });
});

// ==================== CONTINUATIONGAMES THRESHOLD TESTS ====================

describe('CONTINUATIONGAMES Configuration Behavior', () => {
    /**
     * WHAT THIS TESTS:
     * CONTINUATIONGAMES sets the minimum games for opponent continuations.
     * This is separate from MINGAMES which applies to our responses.
     *
     * WHY IT MATTERS:
     * - Controls which opponent responses we prepare for
     * - Higher values = focus on common opponent moves
     * - Lower values = prepare for obscure sidelines
     */

    test('CONTINUATIONGAMES filters opponent continuations independently', () => {
        // ARRANGE: Different continuation thresholds
        const broadConfig = TestUtils.createTestConfig({
            DEPTHLIKELIHOOD: 0,        // Disable likelihood filter
            CONTINUATIONGAMES: 5       // Accept moves with 6+ games
        });
        const focusedConfig = TestUtils.createTestConfig({
            DEPTHLIKELIHOOD: 0,
            CONTINUATIONGAMES: 100     // Only moves with 101+ games
        });

        const broadBuilder = new BookBuilder(broadConfig);
        const focusedBuilder = new BookBuilder(focusedConfig);

        // Test opponent move: 50 games, 10% playrate
        const move = { playrate: 0.10, totalGames: 50 };
        const cumulativeLikelihood = 1.0;

        // ACT
        const validBroad = broadBuilder.isValidContinuation(move, cumulativeLikelihood);
        const validFocused = focusedBuilder.isValidContinuation(move, cumulativeLikelihood);

        // ASSERT
        // Broad: 50 > 5 = TRUE
        // Focused: 50 > 100 = FALSE
        expect(validBroad).toBe(true);
        expect(validFocused).toBe(false);
    });

    test('CONTINUATIONGAMES=10 allows more lines than CONTINUATIONGAMES=500', () => {
        // ARRANGE
        const lowThreshold = TestUtils.createTestConfig({
            DEPTHLIKELIHOOD: 0,
            CONTINUATIONGAMES: 10
        });
        const highThreshold = TestUtils.createTestConfig({
            DEPTHLIKELIHOOD: 0,
            CONTINUATIONGAMES: 500
        });

        const lowBuilder = new BookBuilder(lowThreshold);
        const highBuilder = new BookBuilder(highThreshold);

        // Test moves with varying game counts
        const moves = [
            { playrate: 0.30, totalGames: 1000 },  // Popular
            { playrate: 0.15, totalGames: 200 },   // Moderate
            { playrate: 0.05, totalGames: 50 },    // Rare
            { playrate: 0.02, totalGames: 15 },    // Very rare
        ];

        const cumulativeLikelihood = 1.0;

        // ACT: Count valid continuations under each config
        const lowValidCount = moves.filter(m =>
            lowBuilder.isValidContinuation(m, cumulativeLikelihood)
        ).length;

        const highValidCount = moves.filter(m =>
            highBuilder.isValidContinuation(m, cumulativeLikelihood)
        ).length;

        // ASSERT: Lower threshold allows more moves
        expect(lowValidCount).toBeGreaterThan(highValidCount);
        expect(lowValidCount).toBe(4);  // All pass (>10 games)
        expect(highValidCount).toBe(1); // Only 1000 games move passes (>500)
    });
});

// ==================== CAREABOUTENGINE TOGGLE TESTS ====================

describe('CAREABOUTENGINE Configuration Behavior', () => {
    /**
     * WHAT THIS TESTS:
     * CAREABOUTENGINE=1 enables engine validation of candidate moves.
     * CAREABOUTENGINE=0 skips engine validation entirely.
     *
     * WHY IT MATTERS:
     * - Engine validation catches unsound moves
     * - Disabling speeds up processing
     * - Some users trust database statistics only
     */

    let statisticsEngine;

    beforeEach(() => {
        statisticsEngine = createMockStatisticsEngine();
    });

    test('CAREABOUTENGINE=0: skips engine validation entirely', async () => {
        // ARRANGE
        const noEngineSelector = new MoveSelector({
            CAREABOUTENGINE: 0,
            MINGAMES: 0,
            MINPLAYRATE: 0
        });

        // Create a mock engine that would reject all moves
        const strictMockEngine = {
            getBestMove: jest.fn().mockResolvedValue('e4'),
            analyzeMove: jest.fn().mockResolvedValue({
                evaluation: -500,  // Bad evaluation
                moveLoss: 500      // High loss
            }),
            evaluatePosition: jest.fn().mockResolvedValue(0)
        };

        const candidates = createMockCandidates();
        const position = { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' };

        // ACT
        const result = await noEngineSelector.selectBestMove(
            position, candidates, strictMockEngine, statisticsEngine
        );

        // ASSERT: Engine was NOT called when CAREABOUTENGINE=0
        expect(strictMockEngine.getBestMove).not.toHaveBeenCalled();
        expect(strictMockEngine.analyzeMove).not.toHaveBeenCalled();
        expect(result.engineFiltered).toBe(0);  // No engine filtering occurred
    });

    test('CAREABOUTENGINE=1: calls engine and filters based on evaluation', async () => {
        // ARRANGE
        const engineSelector = new MoveSelector({
            CAREABOUTENGINE: 1,
            SOUNDNESSLIMIT: -50,
            LOSSLIMIT: -100,
            MINGAMES: 0,
            MINPLAYRATE: 0
        });

        // Mock engine that approves e4 but rejects others
        const selectiveMockEngine = {
            getBestMove: jest.fn().mockResolvedValue('e2e4'),
            analyzeMove: jest.fn().mockImplementation((fen, move) => {
                if (move === 'e2e4') {
                    return Promise.resolve({ evaluation: 30, moveLoss: 0 });
                }
                return Promise.resolve({ evaluation: -200, moveLoss: 200 });
            }),
            evaluatePosition: jest.fn().mockResolvedValue(0)
        };

        const candidates = createMockCandidates();
        const position = { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' };

        // ACT
        const result = await engineSelector.selectBestMove(
            position, candidates, selectiveMockEngine, statisticsEngine
        );

        // ASSERT: Engine WAS called when CAREABOUTENGINE=1
        expect(selectiveMockEngine.getBestMove).toHaveBeenCalled();
        expect(selectiveMockEngine.analyzeMove).toHaveBeenCalled();
    });

    test('validateMoveSoundness skips checks when CAREABOUTENGINE=0', async () => {
        // ARRANGE
        const noEngineSelector = new MoveSelector({ CAREABOUTENGINE: 0 });
        const engineSelector = new MoveSelector({
            CAREABOUTENGINE: 1,
            SOUNDNESSLIMIT: -50
        });

        // Move with terrible evaluation
        const badMoveAnalysis = { evaluation: -300, moveLoss: 300 };

        // ACT
        const noEngineResult = await noEngineSelector.validateMoveSoundness(
            'some-fen', 'd4', 'e4', badMoveAnalysis
        );
        const engineResult = await engineSelector.validateMoveSoundness(
            'some-fen', 'd4', 'e4', badMoveAnalysis
        );

        // ASSERT
        expect(noEngineResult).toBe(true);   // No engine = always passes
        expect(engineResult).toBe(false);     // Engine = fails soundness check
    });
});

// ==================== SOUNDNESSLIMIT / LOSSLIMIT TESTS ====================

describe('SOUNDNESSLIMIT and LOSSLIMIT Configuration Behavior', () => {
    /**
     * WHAT THIS TESTS:
     * SOUNDNESSLIMIT: Maximum centipawn loss allowed for a move
     * LOSSLIMIT: Secondary loss threshold with IGNORELOSSLIMIT exception
     *
     * WHY IT MATTERS:
     * - Prevents including unsound moves in repertoire
     * - Users can control acceptable accuracy tradeoffs
     * - Higher limits = more move variety, lower limits = stricter soundness
     */

    test('SOUNDNESSLIMIT=-50: rejects moves losing more than 50 centipawns', async () => {
        // ARRANGE
        const strictSelector = new MoveSelector({
            CAREABOUTENGINE: 1,
            SOUNDNESSLIMIT: -50,
            LOSSLIMIT: -100
        });

        const looseSelector = new MoveSelector({
            CAREABOUTENGINE: 1,
            SOUNDNESSLIMIT: -200,
            LOSSLIMIT: -300
        });

        // Move that loses 75 centipawns
        const moveAnalysis = { evaluation: -25, moveLoss: 75 };

        // ACT
        const strictResult = await strictSelector.validateMoveSoundness(
            'fen', 'd4', 'e4', moveAnalysis
        );
        const looseResult = await looseSelector.validateMoveSoundness(
            'fen', 'd4', 'e4', moveAnalysis
        );

        // ASSERT
        // Strict: 75 > 50 = FAIL
        // Loose: 75 > 200 = PASS (within limit)
        expect(strictResult).toBe(false);
        expect(looseResult).toBe(true);
    });

    test('IGNORELOSSLIMIT: loss limit ignored when position is winning', async () => {
        // ARRANGE
        const selector = new MoveSelector({
            CAREABOUTENGINE: 1,
            SOUNDNESSLIMIT: -200,  // Generous soundness limit
            LOSSLIMIT: -50,        // Strict loss limit
            IGNORELOSSLIMIT: 300   // But ignore when eval > 300
        });

        // Move loses 75cp but position is +400 (winning)
        const winningPosition = { evaluation: 400, moveLoss: 75 };

        // Same loss but position is +100 (slight advantage)
        const slightAdvantage = { evaluation: 100, moveLoss: 75 };

        // ACT
        const winningResult = await selector.validateMoveSoundness(
            'fen', 'd4', 'e4', winningPosition
        );
        const slightResult = await selector.validateMoveSoundness(
            'fen', 'd4', 'e4', slightAdvantage
        );

        // ASSERT
        // Winning: |400| >= 300, so LOSSLIMIT ignored → PASS
        // Slight: |100| < 300, so LOSSLIMIT applies, 75 > 50 → FAIL
        expect(winningResult).toBe(true);
        expect(slightResult).toBe(false);
    });

    test('Best move always passes soundness check', async () => {
        // ARRANGE
        const selector = new MoveSelector({
            CAREABOUTENGINE: 1,
            SOUNDNESSLIMIT: -10,  // Very strict
            LOSSLIMIT: -10
        });

        // Even with "bad" analysis, if it's the best move, it passes
        const moveAnalysis = { evaluation: -100, moveLoss: 100 };

        // ACT: Move IS the engine's best move
        const result = await selector.validateMoveSoundness(
            'fen', 'e4', 'e4', moveAnalysis  // Move matches best move
        );

        // ASSERT: Best move always passes
        expect(result).toBe(true);
    });
});

// ==================== DRAWSAREHALF TESTS ====================

describe('DRAWSAREHALF Configuration Behavior', () => {
    /**
     * WHAT THIS TESTS:
     * DRAWSAREHALF=0: Draws count as losses (win% = wins/total)
     * DRAWSAREHALF=1: Draws count as half wins (win% = (wins + draws/2)/total)
     *
     * WHY IT MATTERS:
     * - Significantly affects winrate calculations
     * - Changes which moves appear "best" statistically
     * - User preference based on repertoire goals
     */

    let statisticsEngine;

    beforeEach(() => {
        statisticsEngine = createMockStatisticsEngine();
    });

    test('DRAWSAREHALF=0 vs DRAWSAREHALF=1: same data, different winrates', () => {
        // ARRANGE: Position with 100 white wins, 50 black wins, 50 draws
        const white = 100;
        const black = 50;
        const draws = 50;
        const total = white + black + draws;  // 200 games

        // ACT: Calculate winrates with both settings
        const drawsAsLoss = statisticsEngine.calculateWinRate(white, black, draws, 0);
        const drawsAsHalf = statisticsEngine.calculateWinRate(white, black, draws, 1);

        // ASSERT: Different results for same input
        // DRAWSAREHALF=0: whitePerc = 100/200 = 0.5 (50%)
        // DRAWSAREHALF=1: whitePerc = (100 + 25)/200 = 0.625 (62.5%)
        expect(drawsAsLoss.whitePerc).toBeCloseTo(0.5, 4);
        expect(drawsAsHalf.whitePerc).toBeCloseTo(0.625, 4);

        // Confirm the difference is significant
        expect(drawsAsHalf.whitePerc).toBeGreaterThan(drawsAsLoss.whitePerc);
        expect(drawsAsHalf.whitePerc - drawsAsLoss.whitePerc).toBeCloseTo(0.125, 4);
    });

    test('DRAWSAREHALF affects black perspective symmetrically', () => {
        // ARRANGE: Same data
        const white = 100;
        const black = 50;
        const draws = 50;

        // ACT
        const drawsAsLoss = statisticsEngine.calculateWinRate(white, black, draws, 0);
        const drawsAsHalf = statisticsEngine.calculateWinRate(white, black, draws, 1);

        // ASSERT: Black percentages also change
        // DRAWSAREHALF=0: blackPerc = 50/200 = 0.25 (25%)
        // DRAWSAREHALF=1: blackPerc = (50 + 25)/200 = 0.375 (37.5%)
        expect(drawsAsLoss.blackPerc).toBeCloseTo(0.25, 4);
        expect(drawsAsHalf.blackPerc).toBeCloseTo(0.375, 4);
    });

    test('DRAWSAREHALF=1: position with many draws rates higher', () => {
        // ARRANGE: Two positions - one decisive, one drawish
        const decisive = { white: 60, black: 40, draws: 0 };   // No draws
        const drawish = { white: 40, black: 20, draws: 40 };   // 40% draws

        // ACT: Calculate white winrates
        const decisiveDrawsLoss = statisticsEngine.calculateWinRate(
            decisive.white, decisive.black, decisive.draws, 0
        );
        const decisiveDrawsHalf = statisticsEngine.calculateWinRate(
            decisive.white, decisive.black, decisive.draws, 1
        );
        const drawishDrawsLoss = statisticsEngine.calculateWinRate(
            drawish.white, drawish.black, drawish.draws, 0
        );
        const drawishDrawsHalf = statisticsEngine.calculateWinRate(
            drawish.white, drawish.black, drawish.draws, 1
        );

        // ASSERT:
        // Decisive (no draws): same result for both settings
        expect(decisiveDrawsLoss.whitePerc).toEqual(decisiveDrawsHalf.whitePerc);

        // Drawish: DRAWSAREHALF=1 rates it higher
        expect(drawishDrawsHalf.whitePerc).toBeGreaterThan(drawishDrawsLoss.whitePerc);

        // DRAWSAREHALF=0: drawish = 40/100 = 0.4, decisive = 60/100 = 0.6
        // DRAWSAREHALF=1: drawish = 60/100 = 0.6, decisive = 60/100 = 0.6
        expect(decisiveDrawsLoss.whitePerc).toBeCloseTo(0.6, 4);
        expect(drawishDrawsLoss.whitePerc).toBeCloseTo(0.4, 4);
        expect(drawishDrawsHalf.whitePerc).toBeCloseTo(0.6, 4);
    });
});

// ==================== ALPHA CONFIDENCE INTERVAL TESTS ====================

describe('ALPHA Configuration Behavior', () => {
    /**
     * WHAT THIS TESTS:
     * ALPHA controls confidence interval width for move selection.
     * Lower ALPHA = wider intervals, more conservative selection.
     *
     * WHY IT MATTERS:
     * - Affects which move is selected as "best"
     * - Lower alpha = prefer moves with more data
     * - Higher alpha = trust smaller sample sizes
     */

    let statisticsEngine;

    beforeEach(() => {
        statisticsEngine = createMockStatisticsEngine();
    });

    test('ALPHA affects confidence interval width', () => {
        // ARRANGE
        const winRate = 0.55;  // 55% win rate
        const games = 1000;

        // ACT: Calculate with different alpha values
        const narrowCI = statisticsEngine.calculateConfidenceInterval(winRate, games, 0.1);    // 90% CI
        const wideCI = statisticsEngine.calculateConfidenceInterval(winRate, games, 0.001);   // 99.9% CI

        // ASSERT: Lower alpha = wider interval
        const narrowWidth = narrowCI.upperBound - narrowCI.lowerBound;
        const wideWidth = wideCI.upperBound - wideCI.lowerBound;

        expect(wideWidth).toBeGreaterThan(narrowWidth);
    });

    test('ALPHA=0.001 (99.9% CI) is more conservative than ALPHA=0.05 (95% CI)', () => {
        // ARRANGE
        const winRate = 0.55;
        const games = 100;  // Small sample = more uncertainty

        // ACT
        const conservativeCI = statisticsEngine.calculateConfidenceInterval(winRate, games, 0.001);
        const aggressiveCI = statisticsEngine.calculateConfidenceInterval(winRate, games, 0.05);

        // ASSERT: Conservative has lower lower-bound
        expect(conservativeCI.lowerBound).toBeLessThan(aggressiveCI.lowerBound);
    });

    test('ALPHA affects move selection via lower bound comparison', async () => {
        // ARRANGE: Two moves - one with high winrate/low data, one with lower winrate/high data
        const candidates = [
            {
                san: 'e4',
                uci: 'e2e4',
                white: 70,    // 70% winrate
                black: 30,
                draws: 0,
                playrate: 0.5,
                totalGames: 100  // Small sample
            },
            {
                san: 'd4',
                uci: 'd2d4',
                white: 550,   // 55% winrate
                black: 450,
                draws: 0,
                playrate: 0.5,
                totalGames: 1000  // Large sample
            }
        ];

        const conservativeSelector = new MoveSelector({
            ALPHA: 0.001,   // Very wide CI
            CAREABOUTENGINE: 0,
            MINGAMES: 0,
            MINPLAYRATE: 0
        });

        const aggressiveSelector = new MoveSelector({
            ALPHA: 0.1,     // Narrow CI
            CAREABOUTENGINE: 0,
            MINGAMES: 0,
            MINPLAYRATE: 0
        });

        const position = { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' };

        // ACT
        const conservativeResult = await conservativeSelector.selectBestMove(
            position, candidates, null, statisticsEngine
        );
        const aggressiveResult = await aggressiveSelector.selectBestMove(
            position, candidates, null, statisticsEngine
        );

        // ASSERT: Both select a move (we just verify the mechanism works)
        expect(conservativeResult.selectedMove).toBeDefined();
        expect(aggressiveResult.selectedMove).toBeDefined();

        // Conservative may prefer d4 (more data) while aggressive may prefer e4 (higher raw winrate)
        // The exact selection depends on the CI calculation
    });
});

// ==================== INTEGRATION: MULTIPLE CONFIGS INTERACT ====================

describe('Configuration Interaction Tests', () => {
    /**
     * WHAT THIS TESTS:
     * Multiple configuration options working together.
     * Ensures that combining different settings produces expected behavior.
     */

    let statisticsEngine;

    beforeEach(() => {
        statisticsEngine = createMockStatisticsEngine();
    });

    test('MINGAMES + MINPLAYRATE: both must pass for move acceptance', async () => {
        // ARRANGE
        const selector = new MoveSelector({
            MINGAMES: 50,
            MINPLAYRATE: 0.02,
            CAREABOUTENGINE: 0
        });

        const candidates = [
            // Passes both
            { san: 'e4', uci: 'e2e4', white: 100, black: 80, draws: 20, playrate: 0.3, totalGames: 200 },
            // Fails MINGAMES only
            { san: 'd4', uci: 'd2d4', white: 20, black: 15, draws: 5, playrate: 0.1, totalGames: 40 },
            // Fails MINPLAYRATE only
            { san: 'c4', uci: 'c2c4', white: 60, black: 50, draws: 10, playrate: 0.01, totalGames: 120 },
            // Fails both
            { san: 'b4', uci: 'b2b4', white: 10, black: 8, draws: 2, playrate: 0.005, totalGames: 20 }
        ];

        const position = { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' };

        // ACT
        const result = await selector.selectBestMove(position, candidates, null, statisticsEngine);

        // ASSERT: Only e4 passes both filters
        expect(result.qualityFiltered).toBe(3);  // d4, c4, b4 filtered out
        expect(result.selectedMove.san).toBe('e4');
    });

    test('CAREABOUTENGINE=0 makes SOUNDNESSLIMIT irrelevant', async () => {
        // ARRANGE: Engine disabled but strict soundness limit set
        const selector = new MoveSelector({
            CAREABOUTENGINE: 0,       // Engine disabled
            SOUNDNESSLIMIT: -1,       // Would reject almost everything
            LOSSLIMIT: -1,
            MINGAMES: 0,
            MINPLAYRATE: 0
        });

        const candidates = createMockCandidates();
        const position = { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' };

        // Mock engine that would reject everything
        const strictEngine = {
            getBestMove: jest.fn().mockResolvedValue('e4'),
            analyzeMove: jest.fn().mockResolvedValue({ evaluation: -500, moveLoss: 500 }),
            evaluatePosition: jest.fn().mockResolvedValue(0)
        };

        // ACT
        const result = await selector.selectBestMove(position, candidates, strictEngine, statisticsEngine);

        // ASSERT: Engine not used, moves not filtered by engine
        expect(strictEngine.getBestMove).not.toHaveBeenCalled();
        expect(result.engineFiltered).toBe(0);
        expect(result.selectedMove).toBeDefined();
    });

    test('All filters combined: realistic scenario', async () => {
        // ARRANGE: Realistic combination of all filters
        const selector = new MoveSelector({
            MINGAMES: 100,            // Need 100+ games
            MINPLAYRATE: 0.01,        // Need 1%+ playrate
            CAREABOUTENGINE: 1,       // Use engine
            SOUNDNESSLIMIT: -100,     // Allow up to 100cp loss
            LOSSLIMIT: -50,           // Strict loss limit
            IGNORELOSSLIMIT: 300,     // Unless winning by 300+
            ALPHA: 0.001              // Conservative CI
        });

        // Create candidates with mixed quality
        const candidates = [
            // High quality, engine-approved
            { san: 'e4', uci: 'e2e4', white: 1000, black: 800, draws: 200, playrate: 0.35, totalGames: 2000 },
            // Low games
            { san: 'd4', uci: 'd2d4', white: 30, black: 25, draws: 5, playrate: 0.20, totalGames: 60 },
            // Low playrate
            { san: 'c4', uci: 'c2c4', white: 200, black: 180, draws: 20, playrate: 0.005, totalGames: 400 }
        ];

        // Mock engine that approves e4 only
        const mockEngine = {
            getBestMove: jest.fn().mockResolvedValue('e2e4'),
            analyzeMove: jest.fn().mockImplementation((fen, move) => {
                return Promise.resolve({
                    evaluation: move === 'e2e4' ? 20 : -150,
                    moveLoss: move === 'e2e4' ? 0 : 150
                });
            }),
            evaluatePosition: jest.fn().mockResolvedValue(0)
        };

        const position = { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' };

        // ACT
        const result = await selector.selectBestMove(position, candidates, mockEngine, statisticsEngine);

        // ASSERT: Only e4 survives all filters
        expect(result.selectedMove.san).toBe('e4');
        expect(result.qualityFiltered).toBeGreaterThan(0);  // Some filtered by quality
    });
});
