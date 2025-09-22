/**
 * Critical tests for Lichess API and Stockfish Engine integration
 * Tests Step 2 requirements from FAST_MIGRATION_SPEC.md
 */

import LichessClient from '../src/api/LichessClient.js';
import StockfishEngine from '../src/engine/StockfishEngine.js';

describe('Step 2: Lichess API + Stockfish Engine Integration', () => {
  let lichessClient;
  let stockfishEngine;

  beforeAll(async () => {
    lichessClient = new LichessClient({
      maxRetries: 2,
      retryDelay: 500,
      timeout: 5000
    });

    stockfishEngine = new StockfishEngine({
      depth: 15, // Reduced for testing speed
      threads: 1,
      hash: 64
    });
  });

  afterAll(async () => {
    if (stockfishEngine) {
      stockfishEngine.destroy();
    }
  });

  describe('LichessClient Integration', () => {
    test('fetches real position data from Lichess API', async () => {
      const startingPosition = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

      const positionStats = await lichessClient.getPositionStats(startingPosition, {
        speeds: 'blitz,rapid,classical',
        ratings: '2000,2200,2500',
        moves: 5
      });

      // Validate response structure
      expect(positionStats).toBeDefined();
      expect(Array.isArray(positionStats.moves)).toBe(true);
      expect(positionStats.moves.length).toBeGreaterThan(0);

      // Validate move structure
      const firstMove = positionStats.moves[0];
      expect(firstMove).toHaveProperty('san');
      expect(firstMove).toHaveProperty('white');
      expect(firstMove).toHaveProperty('black');
      expect(firstMove).toHaveProperty('draws');
      expect(typeof firstMove.white).toBe('number');
      expect(typeof firstMove.black).toBe('number');
      expect(typeof firstMove.draws).toBe('number');

      // Verify popular opening moves are present
      const moveNames = positionStats.moves.map(m => m.san);
      expect(moveNames).toContain('e4'); // Most popular opening move

      console.log(`✅ Lichess API test: Retrieved ${positionStats.moves.length} moves for starting position`);
    }, 15000); // 15 second timeout for API call

    test('handles API retry logic on network errors', async () => {
      const invalidClient = new LichessClient({
        baseUrl: 'https://invalid-domain-that-does-not-exist.com',
        maxRetries: 2,
        retryDelay: 100,
        timeout: 1000
      });

      await expect(
        invalidClient.getPositionStats('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
      ).rejects.toThrow(/failed after 2 attempts/);
    }, 10000);

    test('calculates play rates correctly', () => {
      const move = { white: 1000, black: 500, draws: 100 };
      const totalGames = 2000;

      const playRate = LichessClient.calculatePlayRate(move, totalGames);

      expect(playRate).toBeCloseTo(0.8, 3); // (1000+500+100)/2000 = 0.8
    });

    test('gets move-specific statistics', async () => {
      const startingPosition = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

      const moveStats = await lichessClient.getMoveStats(startingPosition, 'e4');

      expect(moveStats).toBeDefined();
      expect(moveStats.san).toBe('e4');
      expect(typeof moveStats.white).toBe('number');
      expect(typeof moveStats.black).toBe('number');
      expect(typeof moveStats.draws).toBe('number');

      console.log(`✅ Move stats test: e4 played in ${moveStats.white + moveStats.black + moveStats.draws} games`);
    }, 10000);
  });

  describe('StockfishEngine Integration', () => {
    test('initializes engine successfully', async () => {
      await stockfishEngine.initialize();

      expect(stockfishEngine.isReady).toBe(true);
      console.log('✅ Stockfish engine initialized successfully');
    }, 15000);

    test('evaluates positions and suggests moves', async () => {
      await stockfishEngine.initialize();

      const startingPosition = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

      // Test best move suggestion
      const bestMove = await stockfishEngine.getBestMove(startingPosition, 12);
      expect(bestMove).toBeDefined();
      expect(typeof bestMove).toBe('string');
      expect(bestMove.length).toBeGreaterThanOrEqual(4); // UCI format like 'e2e4'

      // Test position evaluation
      const evaluation = await stockfishEngine.evaluatePosition(startingPosition, 12);
      expect(typeof evaluation).toBe('number');
      expect(Math.abs(evaluation)).toBeLessThan(100); // Starting position should be roughly equal

      console.log(`✅ Engine test: Best move ${bestMove}, evaluation ${evaluation} centipawns`);
    }, 20000);

    test('analyzes move quality with centipawn scores', async () => {
      await stockfishEngine.initialize();

      const testPosition = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'; // After 1.e4

      // Analyze a good move (e5) vs a poor move (a6)
      const goodMoveAnalysis = await stockfishEngine.analyzeMove(testPosition, 'e7e5', 10);
      const poorMoveAnalysis = await stockfishEngine.analyzeMove(testPosition, 'a7a6', 10);

      expect(goodMoveAnalysis).toHaveProperty('move');
      expect(goodMoveAnalysis).toHaveProperty('evaluation');
      expect(goodMoveAnalysis).toHaveProperty('moveLoss');
      expect(goodMoveAnalysis).toHaveProperty('quality');

      expect(poorMoveAnalysis).toHaveProperty('move');
      expect(poorMoveAnalysis).toHaveProperty('evaluation');
      expect(poorMoveAnalysis).toHaveProperty('moveLoss');
      expect(poorMoveAnalysis).toHaveProperty('quality');

      // Good move should have better quality rating
      expect(goodMoveAnalysis.moveLoss).toBeLessThanOrEqual(poorMoveAnalysis.moveLoss);

      console.log(`✅ Move analysis: e5 quality=${goodMoveAnalysis.quality} loss=${goodMoveAnalysis.moveLoss}cp`);
      console.log(`✅ Move analysis: a6 quality=${poorMoveAnalysis.quality} loss=${poorMoveAnalysis.moveLoss}cp`);
    }, 25000);

    test('detects mate scenarios correctly', async () => {
      await stockfishEngine.initialize();

      // Position with forced mate
      const matePosition = '8/8/8/8/8/2K5/1Q6/7k b - - 0 1'; // Black to move, mate in 1

      const evaluation = await stockfishEngine.evaluatePosition(matePosition, 8);

      expect(Math.abs(evaluation)).toBeGreaterThan(999999); // Should be mate score
      console.log(`✅ Mate detection: Position evaluated as ${evaluation} (mate score)`);
    }, 15000);
  });

  describe('Integration Testing', () => {
    test('combines API data with engine analysis', async () => {
      await stockfishEngine.initialize();

      const position = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

      // Get position data from Lichess
      const positionStats = await lichessClient.getPositionStats(position, {
        moves: 3,
        speeds: 'classical',
        ratings: '2200,2500'
      });

      expect(positionStats.moves.length).toBeGreaterThan(0);

      // Analyze top moves with engine
      const topMove = positionStats.moves[0];
      const moveAnalysis = await stockfishEngine.analyzeMove(position, topMove.uci || topMove.san, 10);

      expect(moveAnalysis).toBeDefined();
      expect(moveAnalysis.move).toBeDefined();

      // Calculate statistics
      const totalGames = LichessClient.getTotalGames(positionStats);
      const playRate = LichessClient.calculatePlayRate(topMove, totalGames);

      console.log(`✅ Integration test: ${topMove.san} - ${totalGames} games, ${(playRate*100).toFixed(1)}% play rate, ${moveAnalysis.quality} quality`);

      expect(totalGames).toBeGreaterThan(0);
      expect(playRate).toBeGreaterThan(0);
      expect(playRate).toBeLessThanOrEqual(1);
    }, 30000);

    test('validates engine settings match legacy configuration', async () => {
      await stockfishEngine.initialize();

      // Test that engine respects configuration
      expect(stockfishEngine.depth).toBe(15); // Test depth
      expect(stockfishEngine.threads).toBe(1);
      expect(stockfishEngine.hash).toBe(64);

      // Test evaluation consistency
      const testPosition = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

      const eval1 = await stockfishEngine.evaluatePosition(testPosition, 10);
      const eval2 = await stockfishEngine.evaluatePosition(testPosition, 10);

      // Evaluations should be consistent
      expect(Math.abs(eval1 - eval2)).toBeLessThanOrEqual(5); // Allow small variance

      console.log(`✅ Engine consistency: ${eval1}cp vs ${eval2}cp (difference: ${Math.abs(eval1-eval2)}cp)`);
    }, 20000);
  });
});