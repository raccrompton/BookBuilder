/**
 * Settings-Effect Tests for Opening Tree Generation
 *
 * Verifies that each tunable GUI setting actually changes the opening-tree
 * output in the expected direction, end-to-end through BookBuilder.
 *
 * Strategy (codex-recommended hybrid):
 *   1. Effect-presence — fixture with a deciding move at the threshold; flip the
 *      knob across it and assert the move enters/leaves the tree.
 *   2. Monotonic sweep — for cleanly directional pruning knobs, sweep ≥3 values
 *      and assert the resulting PGN set is non-increasing (or non-decreasing).
 *   3. Propagation — for knobs whose only effect is on an external call's args
 *      (speeds, ratings, ENGINEDEPTH), spy and assert call args.
 *
 * All Lichess and Stockfish calls are mocked so the setting is the only free
 * variable. A fresh BookBuilder is built per case to avoid BFS state leak.
 *
 * Sign convention reminder: SOUNDNESSLIMIT/LOSSLIMIT are stored negative and
 * compared via abs in MoveSelector. -50 is strict, -300 is permissive.
 */

import { Chess } from 'chess.js';
import BookBuilder from '../src/BookBuilder.js';
import FileGenerator from '../src/ui/FileGenerator.js';
import PgnGenerator from '../src/pgn/PgnGenerator.js';
import MoveSelector from '../src/algorithm/MoveSelector.js';
import Statistics from '../src/stats/Statistics.js';
import MockStockfishEngine from '../src/engine/MockStockfishEngine.js';
import { TestUtils } from './testUtils.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Canonical FEN after a sequence of SAN moves from the starting position. */
function fenAfter(moves) {
    const c = new Chess();
    for (const m of moves) {
        if (!c.move(m)) throw new Error(`Bad fixture move ${m} after ${moves.join(' ')}`);
    }
    return c.fen();
}

/**
 * Build a candidate move record matching the Lichess API shape consumed by
 * BookBuilder / MoveSelector. `winRate` is implicit in the white/black/draws
 * counts; tests that need a specific win rate should construct those directly.
 */
function move({ san, uci, white = 100, black = 100, draws = 100, playrate = 0.1 }) {
    return {
        san,
        uci,
        white,
        black,
        draws,
        playrate,
        totalGames: white + black + draws,
        // BookBuilder.isValidResponse() also reads .winRate — fill it in so any
        // move with games > 0 has a positive winRate, matching the live shape
        // produced by LichessClient internally.
        winRate: (white + 0.5 * draws) / Math.max(1, white + black + draws),
    };
}

/**
 * Map of canonical FEN → Lichess response. Unregistered FENs get a stub that
 * has zero continuations but enough stats for finalizeLine to record a line.
 */
class FixtureMap {
    constructor() { this.byFen = new Map(); }
    set(moves, response) {
        this.byFen.set(fenAfter(moves), response);
        return this;
    }
    get(fen) {
        if (this.byFen.has(fen)) return this.byFen.get(fen);
        return { white: 1, black: 1, draws: 1, moves: [] };
    }
}

// ---------------------------------------------------------------------------
// BookBuilder harness
// ---------------------------------------------------------------------------

/**
 * Run a single chapter end-to-end with mocked Lichess + (optionally) engine.
 * Returns { lines, lichessCalls, engine } — caller can inspect both the
 * generated tree and the exact API call args for propagation checks.
 *
 * Note: BookBuilder mutates its config (mainly building lichessApiOptions),
 * so we hand it a fresh config each time and never reuse instances.
 */
async function runChapter({
    openings,
    overrides = {},
    fixtures,
    engine = null,
}) {
    const baseConfig = TestUtils.createTestConfig(overrides);
    const config = {
        ...baseConfig,
        openings,
        // Strict defaults that the existing TestUtils config sets — re-apply
        // because spread doesn't re-merge engine fields after our overrides.
        stockfishEngine: engine,
    };

    const bb = new BookBuilder(config);

    // Intercept all Lichess traffic. The stub matches by canonical FEN; any
    // FEN we didn't register returns an empty-continuations placeholder.
    const stub = jest
        .spyOn(bb.lichessClient, 'getPositionStats')
        .mockImplementation(async (fen) => fixtures.get(fen));

    const output = await bb.generateChapter(openings[0], 1);
    return {
        lines: output.lines,
        lichessCalls: stub.mock.calls,
        bb,
    };
}

/** Canonical white repertoire seed: one move deep, perspective=white. */
const WHITE_AFTER_E4 = {
    name: 'TestOpening',
    moves: ['e4'],
    perspective: 'white',
};

/**
 * Normalised view of the generated tree: a sorted set of "moves" strings.
 * Stable across BFS visit order so set-comparisons are robust.
 */
function pgnSet(lines) {
    return new Set(
        lines.map((l) => l.moves.map((m) => m.san).join(' ')),
    );
}

// ---------------------------------------------------------------------------
// MINGAMES
// ---------------------------------------------------------------------------

describe('MINGAMES — minimum games for our response moves', () => {
    /**
     * One opponent move (e5), two of our candidate responses (Nf3, Nc3). Nf3
     * has lots of games and is the engine + statistical favourite. Nc3 sits
     * at exactly 40 games. Raising MINGAMES across 40 should evict the Nc3
     * line (BookBuilder.isValidResponse uses `totalGames > MINGAMES`).
     */
    const fixtures = new FixtureMap()
        .set(['e4'], { moves: [
            move({ san: 'e5', uci: 'e7e5', white: 1000, black: 1000, draws: 200, playrate: 0.6 }),
        ] })
        .set(['e4', 'e5'], { moves: [
            move({ san: 'Nf3', uci: 'g1f3', white: 500, black: 400, draws: 100, playrate: 0.55 }),
        ] });

    test('presence: MINGAMES below candidate games includes the line; above evicts it', async () => {
        const candidateBelow = move({ san: 'Nf3', uci: 'g1f3', white: 30, black: 30, draws: 20, playrate: 0.4 });
        // totalGames = 80
        const fx = new FixtureMap()
            .set(['e4'], { moves: [move({ san: 'e5', uci: 'e7e5', white: 1000, black: 1000, draws: 200, playrate: 0.6 })] })
            .set(['e4', 'e5'], { moves: [candidateBelow] });

        const loose = await runChapter({
            openings: [WHITE_AFTER_E4],
            overrides: { MINGAMES: 50, MINPLAYRATE: 0, CAREABOUTENGINE: 0, DEPTHLIKELIHOOD: 0.0001, CONTINUATIONGAMES: 0 },
            fixtures: fx,
        });
        const strict = await runChapter({
            openings: [WHITE_AFTER_E4],
            overrides: { MINGAMES: 100, MINPLAYRATE: 0, CAREABOUTENGINE: 0, DEPTHLIKELIHOOD: 0.0001, CONTINUATIONGAMES: 0 },
            fixtures: fx,
        });

        const looseSet = pgnSet(loose.lines);
        const strictSet = pgnSet(strict.lines);

        // Loose includes the Nf3 line (totalGames=80 > MINGAMES=50)
        expect([...looseSet].some((s) => s.includes('Nf3'))).toBe(true);
        // Strict drops the Nf3 line (80 is not > 100). The opponent line still
        // finalizes (e4 e5), so we expect the strict tree to be a proper subset.
        expect([...strictSet].some((s) => s.includes('Nf3'))).toBe(false);
    });

    test('monotonic: raising MINGAMES never adds lines', async () => {
        const fx = new FixtureMap()
            .set(['e4'], { moves: [
                move({ san: 'e5', uci: 'e7e5', white: 2000, black: 2000, draws: 400, playrate: 0.55 }),
                move({ san: 'c5', uci: 'c7c5', white: 1000, black: 1000, draws: 200, playrate: 0.30 }),
            ] })
            .set(['e4', 'e5'], { moves: [
                move({ san: 'Nf3', uci: 'g1f3', white: 600, black: 500, draws: 100, playrate: 0.65 }),
            ] })
            .set(['e4', 'c5'], { moves: [
                move({ san: 'Nf3', uci: 'g1f3', white: 80, black: 70, draws: 30, playrate: 0.45 }),
            ] });

        const sweeps = [];
        for (const mg of [50, 200, 1000]) {
            const r = await runChapter({
                openings: [WHITE_AFTER_E4],
                overrides: { MINGAMES: mg, MINPLAYRATE: 0, CAREABOUTENGINE: 0, DEPTHLIKELIHOOD: 0.0001, CONTINUATIONGAMES: 0 },
                fixtures: fx,
            });
            sweeps.push(pgnSet(r.lines));
        }
        // Subset property: each step must be a subset of the previous.
        for (let i = 1; i < sweeps.length; i++) {
            for (const s of sweeps[i]) {
                expect(sweeps[i - 1].has(s)).toBe(true);
            }
        }
        // Non-trivial: somewhere along the sweep the set must actually shrink.
        // A passing monotone with three identical sets would be evidence-free
        // (the setting could be ignored). The fixture is designed so the c5
        // sub-line drops out as MINGAMES rises past 180.
        expect(sweeps[0].size).toBeGreaterThan(sweeps[sweeps.length - 1].size);
    });
});

// ---------------------------------------------------------------------------
// MINPLAYRATE
// ---------------------------------------------------------------------------

describe('MINPLAYRATE — minimum playrate for our response moves', () => {
    test('presence: response with playrate at threshold is included loose, excluded strict', async () => {
        // Our response candidate has playrate=0.02 (2%). Loose MINPLAYRATE=0.01
        // accepts it; strict MINPLAYRATE=0.05 rejects it.
        const fx = new FixtureMap()
            .set(['e4'], { moves: [move({ san: 'e5', uci: 'e7e5', white: 1000, black: 1000, draws: 200, playrate: 0.6 })] })
            .set(['e4', 'e5'], { moves: [
                move({ san: 'Nf3', uci: 'g1f3', white: 500, black: 400, draws: 100, playrate: 0.02 }),
            ] });

        const loose = await runChapter({
            openings: [WHITE_AFTER_E4],
            overrides: { MINGAMES: 0, MINPLAYRATE: 0.01, CAREABOUTENGINE: 0, DEPTHLIKELIHOOD: 0.0001, CONTINUATIONGAMES: 0 },
            fixtures: fx,
        });
        const strict = await runChapter({
            openings: [WHITE_AFTER_E4],
            overrides: { MINGAMES: 0, MINPLAYRATE: 0.05, CAREABOUTENGINE: 0, DEPTHLIKELIHOOD: 0.0001, CONTINUATIONGAMES: 0 },
            fixtures: fx,
        });

        expect([...pgnSet(loose.lines)].some((s) => s.includes('Nf3'))).toBe(true);
        expect([...pgnSet(strict.lines)].some((s) => s.includes('Nf3'))).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// CONTINUATIONGAMES + DEPTHLIKELIHOOD
// ---------------------------------------------------------------------------

describe('CONTINUATIONGAMES — minimum games for an opponent continuation', () => {
    test('presence: opponent move at games threshold included loose, excluded strict', async () => {
        // Opponent has two responses; c5 has totalGames=30. CONTINUATIONGAMES=10
        // admits it (30 > 10), CONTINUATIONGAMES=100 prunes it (30 not > 100).
        const fx = new FixtureMap()
            .set(['e4'], { moves: [
                move({ san: 'e5', uci: 'e7e5', white: 1000, black: 1000, draws: 200, playrate: 0.6 }),
                move({ san: 'c5', uci: 'c7c5', white: 10, black: 15, draws: 5, playrate: 0.30 }), // 30 games
            ] })
            .set(['e4', 'e5'], { moves: [move({ san: 'Nf3', uci: 'g1f3', white: 600, black: 500, draws: 100, playrate: 0.65 })] })
            .set(['e4', 'c5'], { moves: [move({ san: 'Nf3', uci: 'g1f3', white: 600, black: 500, draws: 100, playrate: 0.65 })] });

        const loose = await runChapter({
            openings: [WHITE_AFTER_E4],
            overrides: { MINGAMES: 0, MINPLAYRATE: 0, CAREABOUTENGINE: 0, DEPTHLIKELIHOOD: 0.0001, CONTINUATIONGAMES: 10 },
            fixtures: fx,
        });
        const strict = await runChapter({
            openings: [WHITE_AFTER_E4],
            overrides: { MINGAMES: 0, MINPLAYRATE: 0, CAREABOUTENGINE: 0, DEPTHLIKELIHOOD: 0.0001, CONTINUATIONGAMES: 100 },
            fixtures: fx,
        });

        expect([...pgnSet(loose.lines)].some((s) => /\bc5\b/.test(s))).toBe(true);
        expect([...pgnSet(strict.lines)].some((s) => /\bc5\b/.test(s))).toBe(false);
    });
});

describe('DEPTHLIKELIHOOD — minimum cumulative playrate to keep expanding', () => {
    test('presence: continuation likelihood at threshold included loose, excluded strict', async () => {
        // Cumulative likelihood entering e5 is 1.0. The continuation likelihood
        // = playrate(c5) * 1.0 = 0.02. Loose 0.001 admits it, strict 0.05
        // prunes it.
        const fx = new FixtureMap()
            .set(['e4'], { moves: [
                move({ san: 'e5', uci: 'e7e5', white: 1000, black: 1000, draws: 200, playrate: 0.6 }),
                move({ san: 'c5', uci: 'c7c5', white: 300, black: 300, draws: 50, playrate: 0.02 }),
            ] })
            .set(['e4', 'e5'], { moves: [move({ san: 'Nf3', uci: 'g1f3', white: 600, black: 500, draws: 100, playrate: 0.65 })] })
            .set(['e4', 'c5'], { moves: [move({ san: 'Nf3', uci: 'g1f3', white: 600, black: 500, draws: 100, playrate: 0.65 })] });

        const loose = await runChapter({
            openings: [WHITE_AFTER_E4],
            overrides: { MINGAMES: 0, MINPLAYRATE: 0, CAREABOUTENGINE: 0, DEPTHLIKELIHOOD: 0.001, CONTINUATIONGAMES: 0 },
            fixtures: fx,
        });
        const strict = await runChapter({
            openings: [WHITE_AFTER_E4],
            overrides: { MINGAMES: 0, MINPLAYRATE: 0, CAREABOUTENGINE: 0, DEPTHLIKELIHOOD: 0.05, CONTINUATIONGAMES: 0 },
            fixtures: fx,
        });

        expect([...pgnSet(loose.lines)].some((s) => /\bc5\b/.test(s))).toBe(true);
        expect([...pgnSet(strict.lines)].some((s) => /\bc5\b/.test(s))).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// MOVES (max candidates for our response, passed as Lichess `moves` param)
// ---------------------------------------------------------------------------

describe('MOVES — limit on candidate responses fetched from Lichess', () => {
    test('propagation: config.MOVES is passed as the `moves` param when fetching our response', async () => {
        const fx = new FixtureMap()
            .set(['e4'], { moves: [move({ san: 'e5', uci: 'e7e5', white: 1000, black: 1000, draws: 200, playrate: 0.6 })] })
            .set(['e4', 'e5'], { moves: [move({ san: 'Nf3', uci: 'g1f3', white: 500, black: 400, draws: 100, playrate: 0.55 })] });

        const r = await runChapter({
            openings: [WHITE_AFTER_E4],
            overrides: { MOVES: 7, MINGAMES: 0, MINPLAYRATE: 0, CAREABOUTENGINE: 0, DEPTHLIKELIHOOD: 0.0001, CONTINUATIONGAMES: 0 },
            fixtures: fx,
        });

        // First call to expandLine fetches opponent continuations with moves:15
        // (hard-coded). The follow-up fetch for our response should use
        // config.MOVES=7. Confirm at least one call carried our value.
        const moveLimits = r.lichessCalls.map(([, opts]) => opts && opts.moves);
        expect(moveLimits).toContain(7);
        // And the opponent-continuation call still uses 15.
        expect(moveLimits).toContain(15);
    });
});

// ---------------------------------------------------------------------------
// CAREABOUTENGINE
// ---------------------------------------------------------------------------

describe('CAREABOUTENGINE — engine validation toggle', () => {
    test('presence: with engine on, an unsound popular move is rejected; with engine off, it is selected', async () => {
        // Single candidate response per side. Engine mock rejects every move
        // that is not its bestMove ('e2e4'). So if our only candidate is 'Nf3',
        // engine-on will throw "Engine rejected all candidate moves"; engine-off
        // will accept the line.
        const fx = new FixtureMap()
            .set(['e4'], { moves: [move({ san: 'e5', uci: 'e7e5', white: 1000, black: 1000, draws: 200, playrate: 0.6 })] })
            .set(['e4', 'e5'], { moves: [move({ san: 'Nf3', uci: 'g1f3', white: 500, black: 400, draws: 100, playrate: 0.55 })] });

        const mock = new MockStockfishEngine();
        await mock.initialize();
        // Default scenario's bestMove is 'e2e4' (illegal here, never matches),
        // and analyzeMove returns afterEvalOurs ≈ -25, signedMoveLoss ≈ -55 →
        // not winning enough and signedMoveLoss < LOSSLIMIT(-50) so REJECTED.
        // Use strict LOSSLIMIT to force rejection.
        const offResult = await runChapter({
            openings: [WHITE_AFTER_E4],
            overrides: { MINGAMES: 0, MINPLAYRATE: 0, CAREABOUTENGINE: 0, DEPTHLIKELIHOOD: 0.0001, CONTINUATIONGAMES: 0 },
            fixtures: fx,
        });
        expect([...pgnSet(offResult.lines)].some((s) => s.includes('Nf3'))).toBe(true);

        // Engine-on with a SOUNDNESSLIMIT above the mock's afterEvalOurs (25)
        // rejects Nf3: the floor gate (afterEvalOurs > SOUNDNESSLIMIT) fails,
        // and IGNORELOSSLIMIT is set high enough that the "we're winning"
        // relaxation does not kick in. MoveSelector then throws "Engine
        // rejected all candidate moves", which BookBuilder catches in
        // expandLine and finalises the line without the Nf3 extension.
        const onResult = await runChapter({
            openings: [WHITE_AFTER_E4],
            overrides: {
                MINGAMES: 0,
                MINPLAYRATE: 0,
                CAREABOUTENGINE: 1,
                DEPTHLIKELIHOOD: 0.0001,
                CONTINUATIONGAMES: 0,
                // Mock returns afterEvalOurs=25, signedMoveLoss=-5 for any move.
                // Floor=50 → 25 > 50 false → rejected by floor gate.
                SOUNDNESSLIMIT: 50,
                LOSSLIMIT: -200,
                IGNORELOSSLIMIT: 1000,
                ENGINEFINISH: 0, // disable engine completion so rejection ends the line
            },
            fixtures: fx,
            engine: mock,
        });
        expect([...pgnSet(onResult.lines)].some((s) => s.includes('Nf3'))).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// SOUNDNESSLIMIT / LOSSLIMIT / IGNORELOSSLIMIT (engine soundness gates)
// ---------------------------------------------------------------------------

describe('soundness gates — direct MoveSelector behavior', () => {
    /**
     * These tests poke _passesSoundnessCheck through validateMoveSoundness so
     * the sign/threshold semantics are pinned without the BFS overhead. Mirrors
     * the existing tests in move-selector-semantics.test.js but adds boundary
     * presence assertions across the LOSSLIMIT axis.
     */
    const engineBest = 'd2d4';
    const otherMove = 'g1f3';
    const baseConfig = { CAREABOUTENGINE: 1, SOUNDNESSLIMIT: -99, LOSSLIMIT: -99, IGNORELOSSLIMIT: 300 };
    const analysis = { afterEvalOurs: 20, signedMoveLoss: -80 };

    test('LOSSLIMIT presence: -50 rejects (|−80| > 50), -100 accepts (|−80| < 100)', () => {
        const strict = new MoveSelector({ ...baseConfig, LOSSLIMIT: -50 });
        const loose = new MoveSelector({ ...baseConfig, LOSSLIMIT: -100 });
        expect(strict.validateMoveSoundness(null, otherMove, engineBest, analysis)).toBe(false);
        expect(loose.validateMoveSoundness(null, otherMove, engineBest, analysis)).toBe(true);
    });

    test('SOUNDNESSLIMIT presence: tighter floor rejects a barely-positive position', () => {
        const tightFloor = new MoveSelector({ ...baseConfig, SOUNDNESSLIMIT: 50, LOSSLIMIT: -200 });
        const looseFloor = new MoveSelector({ ...baseConfig, SOUNDNESSLIMIT: -50, LOSSLIMIT: -200 });
        // afterEvalOurs=20: tight floor (50) → 20 > 50 false → fails; loose floor (-50) → 20 > -50 true → passes
        expect(tightFloor.validateMoveSoundness(null, otherMove, engineBest, analysis)).toBe(false);
        expect(looseFloor.validateMoveSoundness(null, otherMove, engineBest, analysis)).toBe(true);
    });

    test('IGNORELOSSLIMIT presence: if afterEvalOurs > threshold, all other gates relax', () => {
        const huge = { afterEvalOurs: 500, signedMoveLoss: -9999 };
        const ignoreLow = new MoveSelector({ ...baseConfig, IGNORELOSSLIMIT: 400, LOSSLIMIT: -50, SOUNDNESSLIMIT: 0 });
        const ignoreHigh = new MoveSelector({ ...baseConfig, IGNORELOSSLIMIT: 9999, LOSSLIMIT: -50, SOUNDNESSLIMIT: 0 });
        // 500 > 400 → relaxed → accepted; 500 < 9999 → not relaxed → rejected by LOSSLIMIT
        expect(ignoreLow.validateMoveSoundness(null, otherMove, engineBest, huge)).toBe(true);
        expect(ignoreHigh.validateMoveSoundness(null, otherMove, engineBest, huge)).toBe(false);
    });

    test('LOSSLIMIT monotonic: looser (more negative) values never reject more moves', () => {
        const selectors = [-25, -75, -200].map((ll) =>
            new MoveSelector({ ...baseConfig, LOSSLIMIT: ll }),
        );
        const losses = [-10, -50, -100, -150, -250];
        const results = selectors.map((sel) =>
            losses.map((sml) => sel.validateMoveSoundness(null, otherMove, engineBest, { afterEvalOurs: 20, signedMoveLoss: sml })),
        );
        // Each subsequent (looser) selector must accept everything its
        // predecessor accepted.
        for (let i = 1; i < results.length; i++) {
            for (let j = 0; j < losses.length; j++) {
                if (results[i - 1][j]) expect(results[i][j]).toBe(true);
            }
        }
        // Non-trivial: the strictest config must reject some loss the loosest
        // accepts — otherwise the monotone property would be evidence-free.
        const acceptedByLoosest = results[results.length - 1].filter(Boolean).length;
        const acceptedByStrictest = results[0].filter(Boolean).length;
        expect(acceptedByLoosest).toBeGreaterThan(acceptedByStrictest);
    });
});

// ---------------------------------------------------------------------------
// ENGINEDEPTH (propagation)
// ---------------------------------------------------------------------------

describe('ENGINEDEPTH — depth value flows to the engine', () => {
    test('propagation: handleNoGoodResponse calls getBestMove with config.ENGINEDEPTH', async () => {
        // Configure so all opponent moves are valid continuations but our
        // response is filtered (MINGAMES too high) → handleNoGoodResponse path
        // → calls stockfishEngine.getBestMove(fen, ENGINEDEPTH).
        const fx = new FixtureMap()
            .set(['e4'], { moves: [move({ san: 'e5', uci: 'e7e5', white: 1000, black: 1000, draws: 200, playrate: 0.6 })] })
            .set(['e4', 'e5'], { moves: [move({ san: 'Nf3', uci: 'g1f3', white: 1, black: 1, draws: 1, playrate: 0.01 })] });

        const engine = new MockStockfishEngine();
        await engine.initialize();
        const getBestSpy = jest.spyOn(engine, 'getBestMove');

        await runChapter({
            openings: [WHITE_AFTER_E4],
            overrides: {
                MINGAMES: 100, // will reject our only response → engine completion path
                MINPLAYRATE: 0,
                CAREABOUTENGINE: 1,
                ENGINEFINISH: 1,
                ENGINEDEPTH: 13,
                DEPTHLIKELIHOOD: 0.0001,
                CONTINUATIONGAMES: 0,
                LOSSLIMIT: -999,
                SOUNDNESSLIMIT: -999,
                IGNORELOSSLIMIT: 9999,
            },
            fixtures: fx,
            engine,
        });

        // At least one getBestMove call should have been made by the engine
        // completion path with depth=13. (MoveSelector's lazy path also calls
        // getBestMove, but without an explicit depth.)
        const depthArgs = getBestSpy.mock.calls.map((c) => c[1]);
        expect(depthArgs).toContain(13);
    });
});

// ---------------------------------------------------------------------------
// ENGINEFINISH
// ---------------------------------------------------------------------------

describe('ENGINEFINISH — engine completion when no good response found', () => {
    test('propagation: handleNoGoodResponse only invokes the engine when ENGINEFINISH=1', async () => {
        // Force the no-good-response branch: our only candidate response is
        // filtered out by MINGAMES. With ENGINEFINISH=1 + a Stockfish instance,
        // BookBuilder calls stockfishEngine.getBestMove inside the completion
        // path. With ENGINEFINISH=0 (and engine validation off), it must not.
        const fx = new FixtureMap()
            .set(['e4'], { moves: [move({ san: 'e5', uci: 'e7e5', white: 1000, black: 1000, draws: 200, playrate: 0.6 })] })
            .set(['e4', 'e5'], { moves: [move({ san: 'Nf3', uci: 'g1f3', white: 1, black: 1, draws: 1, playrate: 0.01 })] });

        const baseOverrides = {
            MINGAMES: 100,
            MINPLAYRATE: 0,
            CAREABOUTENGINE: 0,
            ENGINEDEPTH: 5,
            DEPTHLIKELIHOOD: 0.0001,
            CONTINUATIONGAMES: 0,
        };

        const onEngine = new MockStockfishEngine();
        await onEngine.initialize();
        const onSpy = jest.spyOn(onEngine, 'getBestMove');
        await runChapter({
            openings: [WHITE_AFTER_E4],
            overrides: { ...baseOverrides, ENGINEFINISH: 1 },
            fixtures: fx,
            engine: onEngine,
        });
        expect(onSpy.mock.calls.length).toBeGreaterThan(0);

        const offEngine = new MockStockfishEngine();
        await offEngine.initialize();
        const offSpy = jest.spyOn(offEngine, 'getBestMove');
        await runChapter({
            openings: [WHITE_AFTER_E4],
            overrides: { ...baseOverrides, ENGINEFINISH: 0 },
            fixtures: fx,
            engine: offEngine,
        });
        expect(offSpy.mock.calls.length).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// ALPHA / DRAWSAREHALF (ranking-affecting)
// ---------------------------------------------------------------------------

describe('ALPHA — confidence level can flip statistical ranking', () => {
    test('two candidates with different sample sizes swap preference across ALPHA', () => {
        // Move A: 60% winrate over 30 games (small sample → wide CI)
        // Move B: 53% winrate over 5000 games (large sample → tight CI)
        //
        // Tight CI (low α, e.g. 0.001 — 99.9%): B's lower bound is high; A's
        // is dragged low by uncertainty → B wins.
        // Loose CI (high α, e.g. 0.5 — 50%): A's lower bound barely shrinks;
        // A's raw 60% beats B's 53% → A wins.
        const stats = new Statistics();
        const candidates = [
            // A: 60% white winrate
            { san: 'A', uci: 'a1a2', white: 18, black: 8, draws: 4, playrate: 0.5 },
            // B: 53% white winrate
            { san: 'B', uci: 'b1b2', white: 2650, black: 2150, draws: 200, playrate: 0.5 },
        ];
        const position = { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', perspective: 'white' };

        function pick(alpha) {
            const sel = new MoveSelector({ ALPHA: alpha, MINGAMES: 0, MINPLAYRATE: 0, CAREABOUTENGINE: 0, DRAWSAREHALF: 1 });
            return sel._selectByStatistics(position, candidates, stats);
        }

        const tight = pick(0.001);
        const loose = pick(0.5);
        expect(tight.san).toBe('B');
        expect(loose.san).toBe('A');
    });
});

describe('DRAWSAREHALF — draw scoring can flip statistical ranking', () => {
    test('candidate-with-many-draws preferred only when draws count as half', () => {
        const stats = new Statistics();
        // A: 40 wins, 30 losses, 30 draws — wins-only=40%, with-draws=55%
        // B: 50 wins, 45 losses,  5 draws — wins-only=50%, with-draws=52.5%
        const candidates = [
            { san: 'A', uci: 'a1a2', white: 40, black: 30, draws: 30, playrate: 0.5 },
            { san: 'B', uci: 'b1b2', white: 50, black: 45, draws: 5, playrate: 0.5 },
        ];
        const position = { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', perspective: 'white' };

        function pick(drawsAreHalf) {
            const sel = new MoveSelector({ MINGAMES: 0, MINPLAYRATE: 0, CAREABOUTENGINE: 0, ALPHA: 0.05, DRAWSAREHALF: drawsAreHalf });
            return sel._selectByStatistics(position, candidates, stats);
        }

        const drawsHalf = pick(1);
        const drawsLoss = pick(0);
        expect(drawsHalf.san).toBe('A'); // draws as half pushes A's win share up
        expect(drawsLoss.san).toBe('B'); // pure wins favour B
    });
});

// ---------------------------------------------------------------------------
// speeds / ratings (Lichess query propagation)
// ---------------------------------------------------------------------------

describe('speeds & ratings — propagation to Lichess query', () => {
    test('selected speeds/ratings are joined and passed to every getPositionStats call', async () => {
        const fx = new FixtureMap()
            .set(['e4'], { moves: [move({ san: 'e5', uci: 'e7e5', white: 1000, black: 1000, draws: 200, playrate: 0.6 })] })
            .set(['e4', 'e5'], { moves: [move({ san: 'Nf3', uci: 'g1f3', white: 500, black: 400, draws: 100, playrate: 0.55 })] });

        const r = await runChapter({
            openings: [WHITE_AFTER_E4],
            overrides: {
                MINGAMES: 0,
                MINPLAYRATE: 0,
                CAREABOUTENGINE: 0,
                DEPTHLIKELIHOOD: 0.0001,
                CONTINUATIONGAMES: 0,
                speeds: ['blitz', 'rapid'],
                ratings: ['2000', '2200'],
            },
            fixtures: fx,
        });

        for (const [, opts] of r.lichessCalls) {
            expect(opts.speeds).toBe('blitz,rapid');
            expect(opts.ratings).toBe('2000,2200');
        }
    });
});

// ---------------------------------------------------------------------------
// outputFormat — structural test on synthetic lines
// ---------------------------------------------------------------------------

describe('outputFormat — tree vs individual PGN structure', () => {
    const lines = [
        {
            pgn: '1. e4 e5 2. Nf3 Nc6',
            moves: [{ san: 'e4' }, { san: 'e5' }, { san: 'Nf3' }, { san: 'Nc6' }],
            cumulativeLikelihood: 0.3,
            likelihoodPath: [{ san: 'e5', playrate: 0.6 }, { san: 'Nc6', playrate: 0.5 }],
            statistics: { cumulativePlayrate: 0.3, winrate: 0.55, totalGames: 1000 },
        },
        {
            pgn: '1. e4 e5 2. Nf3 d6',
            moves: [{ san: 'e4' }, { san: 'e5' }, { san: 'Nf3' }, { san: 'd6' }],
            cumulativeLikelihood: 0.1,
            likelihoodPath: [{ san: 'e5', playrate: 0.6 }, { san: 'd6', playrate: 0.16 }],
            statistics: { cumulativePlayrate: 0.1, winrate: 0.52, totalGames: 500 },
        },
    ];

    test('individual: one [Event] header per line', async () => {
        const fg = new FileGenerator();
        const pg = new PgnGenerator({ DRAWSAREHALF: 1 });
        const out = await fg.generateConfiguredPGN(lines, 'TestOpening', { outputFormat: 'individual' }, pg);
        const eventCount = (out.match(/\[Event /g) || []).length;
        expect(eventCount).toBe(lines.length);
    });

    test('tree: a single [Event] header and balanced variation parentheses', async () => {
        const fg = new FileGenerator();
        const pg = new PgnGenerator({ DRAWSAREHALF: 1 });
        const out = await fg.generateConfiguredPGN(lines, 'TestOpening', { outputFormat: 'tree' }, pg);
        const eventCount = (out.match(/\[Event /g) || []).length;
        expect(eventCount).toBe(1);
        const opens = (out.match(/\(/g) || []).length;
        const closes = (out.match(/\)/g) || []).length;
        expect(opens).toBe(closes);
        // Tree must contain the divergence move from the second line as a variation.
        expect(out).toMatch(/d6/);
    });
});
