/**
 * Soundness/move-loss semantic regression tests.
 *
 * Mirrors origin/pythonlegacy:workerEngineReduce.py:268. Verifies that:
 *   - SOUNDNESSLIMIT acts as an absolute eval floor (our POV)
 *   - LOSSLIMIT acts as a signed delta vs engine-best (negative = looser)
 *   - IGNORELOSSLIMIT escape only kicks in when we are actually winning that much
 *   - signedMoveLoss >= 0 escape approves moves at least as good as engine-best
 *   - missing afterEvalOurs/signedMoveLoss → reject (fail closed)
 */
import MoveSelector from '../src/algorithm/MoveSelector.js';

const CONFIG_DEFAULTS = {
    CAREABOUTENGINE: 1,
    MINPLAYRATE: 0,
    MINGAMES: 0,
    ALPHA: 0.05,
    LAZY_ENGINE: 1
};

function makeSelector({ SOUNDNESSLIMIT, LOSSLIMIT, IGNORELOSSLIMIT }) {
    return new MoveSelector({
        ...CONFIG_DEFAULTS,
        SOUNDNESSLIMIT,
        LOSSLIMIT,
        IGNORELOSSLIMIT
    });
}

describe('_passesSoundnessCheck — Python parity semantics', () => {
    const cases = [
        // [name, afterEvalOurs, signedMoveLoss, SOUND, LOSS, IGNORE, expect]
        ['within both limits',           -50,  -70,  -99,  -99, 300, true],
        ['eval-floor violation',        -150, -170,  -99,  -99, 300, false],
        ['strict floor, lax move-loss',  -80,  -50,  -50,  -99, 300, false],
        ['move-loss violation',         -150, -200,  -99, -100, 300, false],
        ['IGNORELOSSLIMIT escape',      +400, +380,  -99,  -99, 300, true],
        ['both gates fail',             -200, -220,  -99,  -99, 300, false],
        ['engine likes our move',        +50,  +30,  -99,  -99, 300, true],
        ['mate for us',               +10000, +999,  -99,  -99, 300, true],
        ['avoidable mate against us', -10000, -9000, -99,  -99, 300, false],
        ['equal mate against us',     -10000,    0,  -99,  -99, 300, true],
        ['positive floor accepts',       +80,  +30,  +50,  -99, 300, true],
        ['positive floor rejects',       +30,  -20,  +50,  -99, 300, false]
    ];

    test.each(cases)(
        '%s',
        (_name, afterEvalOurs, signedMoveLoss, SOUND, LOSS, IGNORE, expected) => {
            const selector = makeSelector({
                SOUNDNESSLIMIT: SOUND,
                LOSSLIMIT: LOSS,
                IGNORELOSSLIMIT: IGNORE
            });

            const analysis = {
                afterEvalOurs,
                signedMoveLoss,
                evaluation: -afterEvalOurs,
                afterEval: -afterEvalOurs,
                moveLoss: Math.abs(signedMoveLoss),
                beforeEval: afterEvalOurs - signedMoveLoss
            };

            expect(
                selector._passesSoundnessCheck('d2d4', 'e2e4', analysis)
            ).toBe(expected);
        }
    );

    test('fails closed when afterEvalOurs/signedMoveLoss missing', () => {
        const selector = makeSelector({
            SOUNDNESSLIMIT: -99,
            LOSSLIMIT: -99,
            IGNORELOSSLIMIT: 300
        });

        const staleAnalysis = { evaluation: -50, moveLoss: 30 };

        expect(
            selector._passesSoundnessCheck('d2d4', 'e2e4', staleAnalysis)
        ).toBe(false);
    });

    test('engine best move always passes (no analysis needed)', () => {
        const selector = makeSelector({
            SOUNDNESSLIMIT: -10,
            LOSSLIMIT: -5,
            IGNORELOSSLIMIT: 1000
        });

        expect(selector._passesSoundnessCheck('e2e4', 'e2e4', null)).toBe(true);
    });

    test('validateMoveSoundness delegates to _passesSoundnessCheck', () => {
        const selector = makeSelector({
            SOUNDNESSLIMIT: -99,
            LOSSLIMIT: -99,
            IGNORELOSSLIMIT: 300
        });

        const analysis = {
            afterEvalOurs: -150,
            signedMoveLoss: -170,
            evaluation: 150,
            afterEval: 150,
            moveLoss: 170,
            beforeEval: 20
        };

        expect(
            selector.validateMoveSoundness(null, 'd2d4', 'e2e4', analysis)
        ).toBe(false);
    });

    test('CAREABOUTENGINE=0 bypasses all checks via validateMoveSoundness', () => {
        const selector = new MoveSelector({
            ...CONFIG_DEFAULTS,
            CAREABOUTENGINE: 0,
            SOUNDNESSLIMIT: -10,
            LOSSLIMIT: -5,
            IGNORELOSSLIMIT: 1000
        });

        expect(
            selector.validateMoveSoundness(null, 'd2d4', 'e2e4', null)
        ).toBe(true);
    });
});
