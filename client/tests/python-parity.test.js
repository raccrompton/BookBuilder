/**
 * Property test that _passesSoundnessCheck matches the Python reference at
 * origin/pythonlegacy:workerEngineReduce.py:268 across many random tuples.
 *
 * Reference (Python, paraphrased and POV-normalized to our POV):
 *
 *   def python_passes(after_eval_ours, signed_move_loss, S, L, I):
 *       if after_eval_ours > I:
 *           return True
 *       if signed_move_loss >= 0:
 *           return True
 *       return (after_eval_ours > S) and (signed_move_loss > L)
 */
import MoveSelector from '../src/algorithm/MoveSelector.js';

function pythonReference(afterEvalOurs, signedMoveLoss, SOUND, LOSS, IGNORE) {
    if (afterEvalOurs > IGNORE) return true;
    if (signedMoveLoss >= 0) return true;
    return afterEvalOurs > SOUND && signedMoveLoss > LOSS;
}

// Deterministic seeded RNG (mulberry32).
function rng(seed) {
    let t = seed >>> 0;
    return () => {
        t += 0x6D2B79F5;
        let x = t;
        x = Math.imul(x ^ (x >>> 15), x | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}

describe('JS soundness check ↔ Python reference parity', () => {
    test('agrees on 1000 seeded random tuples', () => {
        const rand = rng(0xC0FFEE);
        const range = (r, min, max) => Math.floor(min + r() * (max - min + 1));

        for (let i = 0; i < 1000; i++) {
            const afterEvalOurs = range(rand, -800, 800);
            const signedMoveLoss = range(rand, -800, 200);
            const SOUND = range(rand, -300, 100);
            const LOSS = range(rand, -300, 0);
            const IGNORE = range(rand, 100, 600);

            const selector = new MoveSelector({
                CAREABOUTENGINE: 1,
                SOUNDNESSLIMIT: SOUND,
                LOSSLIMIT: LOSS,
                IGNORELOSSLIMIT: IGNORE,
                MINPLAYRATE: 0,
                MINGAMES: 0,
                ALPHA: 0.05
            });

            const analysis = {
                afterEvalOurs,
                signedMoveLoss,
                evaluation: -afterEvalOurs,
                afterEval: -afterEvalOurs,
                moveLoss: Math.abs(signedMoveLoss),
                beforeEval: afterEvalOurs - signedMoveLoss
            };

            const js = selector._passesSoundnessCheck('d2d4', 'e2e4', analysis);
            const py = pythonReference(afterEvalOurs, signedMoveLoss, SOUND, LOSS, IGNORE);

            if (js !== py) {
                throw new Error(
                    `Disagreement at iter=${i}: afterEvalOurs=${afterEvalOurs}, signedMoveLoss=${signedMoveLoss}, ` +
                    `SOUND=${SOUND}, LOSS=${LOSS}, IGNORE=${IGNORE} → js=${js}, py=${py}`
                );
            }
        }
    });
});
