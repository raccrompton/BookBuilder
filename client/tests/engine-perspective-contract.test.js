/**
 * Engine perspective contract: the analyzeMove() return must include
 * afterEvalOurs and signedMoveLoss in our POV, with the right sign for
 * a position where the moving side blunders.
 */
import { MockStockfishEngine } from '../src/engine/MockStockfishEngine.js';

describe('engine analyzeMove() perspective contract', () => {
    test('returns afterEvalOurs and signedMoveLoss in our POV (losing scenario)', async () => {
        const engine = new MockStockfishEngine();
        await engine.initialize();
        engine.setScenario('losing'); // negative evaluation for side to move

        const analysis = await engine.analyzeMove(
            'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            'a2a4'
        );

        expect(Number.isFinite(analysis.afterEvalOurs)).toBe(true);
        expect(Number.isFinite(analysis.signedMoveLoss)).toBe(true);
        expect(analysis.afterEvalOurs).toBeLessThan(0);
        expect(analysis.signedMoveLoss).toBeLessThanOrEqual(0);

        // Backward-compat fields preserved.
        expect(analysis.moveLoss).toBeGreaterThanOrEqual(0);
        expect(typeof analysis.evaluation).toBe('number');

        await engine.shutdown();
    });

    test('our POV winning scenario produces positive afterEvalOurs', async () => {
        const engine = new MockStockfishEngine();
        await engine.initialize();
        engine.setScenario('winning');

        const analysis = await engine.analyzeMove(
            'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            'e2e4'
        );

        expect(analysis.afterEvalOurs).toBeGreaterThan(0);

        await engine.shutdown();
    });
});
