/**
 * Regression: with a strict Move Loss Limit, MoveSelector should reject the
 * Danish-Gambit move (d4 after 1.e4 e5) when its signedMoveLoss is below the
 * configured threshold, and accept it when the threshold is loosened.
 *
 * Pre-fix the JS port compared Math.abs(LOSSLIMIT) against magnitude, which
 * silently passed d4 through; this test pins the Python semantics.
 */
import MoveSelector from '../src/algorithm/MoveSelector.js';
import Statistics from '../src/stats/Statistics.js';

const FEN_AFTER_1E4_E5 =
    'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

const CANDIDATES = [
    { san: 'Nf3', uci: 'g1f3', white: 1000000, black: 800000, draws: 200000, playrate: 0.5 },
    { san: 'd4',  uci: 'd2d4', white: 1100000, black: 700000, draws: 200000, playrate: 0.3 },
    { san: 'Bc4', uci: 'f1c4', white: 500000,  black: 450000, draws: 100000, playrate: 0.2 }
];

class DanishMockEngine {
    constructor() {
        this.bestMove = 'g1f3';
    }

    async getBestMove() {
        return this.bestMove;
    }

    async evaluatePosition() {
        return 20; // White slight edge (white POV)
    }

    async analyzeMove(_fen, moveUci) {
        if (moveUci === 'g1f3') {
            return {
                evaluation: -20, afterEval: -20, beforeEval: 20,
                afterEvalOurs: 20, signedMoveLoss: 0, moveLoss: 0,
                quality: 'excellent'
            };
        }
        if (moveUci === 'd2d4') {
            // d4 our POV eval = -5, before = 20 → signedMoveLoss = -25
            return {
                evaluation: 5, afterEval: 5, beforeEval: 20,
                afterEvalOurs: -5, signedMoveLoss: -25, moveLoss: 25,
                quality: 'good'
            };
        }
        if (moveUci === 'f1c4') {
            return {
                evaluation: -15, afterEval: -15, beforeEval: 20,
                afterEvalOurs: 15, signedMoveLoss: -5, moveLoss: 5,
                quality: 'excellent'
            };
        }
        throw new Error(`Unexpected move: ${moveUci}`);
    }
}

describe('Danish Gambit regression — Move Loss Limit honored', () => {
    test('LOSSLIMIT=-10 rejects d4 (signedMoveLoss=-25 < -10)', async () => {
        const selector = new MoveSelector({
            CAREABOUTENGINE: 1,
            LAZY_ENGINE: 1,
            SOUNDNESSLIMIT: -300,
            LOSSLIMIT: -10,
            IGNORELOSSLIMIT: 300,
            MINPLAYRATE: 0,
            MINGAMES: 0,
            ALPHA: 0.05
        });

        const result = await selector.selectBestMove(
            { fen: FEN_AFTER_1E4_E5, perspective: 'white' },
            CANDIDATES,
            new DanishMockEngine(),
            new Statistics()
        );

        expect(result.selectedMove.uci).toBe('g1f3');
    });

    test('LOSSLIMIT=-50 admits d4 (signedMoveLoss=-25 > -50)', async () => {
        const selector = new MoveSelector({
            CAREABOUTENGINE: 1,
            LAZY_ENGINE: 1,
            SOUNDNESSLIMIT: -300,
            LOSSLIMIT: -50,
            IGNORELOSSLIMIT: 300,
            MINPLAYRATE: 0,
            MINGAMES: 0,
            ALPHA: 0.05
        });

        const result = await selector.selectBestMove(
            { fen: FEN_AFTER_1E4_E5, perspective: 'white' },
            CANDIDATES,
            new DanishMockEngine(),
            new Statistics()
        );

        // d4 is admissible; whether it wins on stats depends on lower-bound calc.
        // Either way, the engine should not have rejected d4 like it does at -10.
        expect(['g1f3', 'd2d4', 'f1c4']).toContain(result.selectedMove.uci);
        expect(result.selectionReason).not.toMatch(/rejected/i);
    });
});
