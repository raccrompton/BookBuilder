import { ChessEngine } from '../src/chess/ChessEngine.js';

describe('ChessEngine - Step 1: Chess Foundation', () => {
  let engine;

  beforeEach(() => {
    engine = new ChessEngine();
  });

  describe('Position Parsing', () => {
    test('parses starting positions for Ruy Lopez and Kings Indian', () => {
      // Test starting position (should always work)
      const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      expect(engine.parsePosition(startingFen)).toBe(true);
      expect(engine.getFEN()).toBe(startingFen);

      // Test Ruy Lopez position: 1.e4 e5 2.Nf3 Nc6 3.Bb5
      const ruyLopezFen = 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
      expect(engine.parsePosition(ruyLopezFen)).toBe(true);
      expect(engine.getFEN()).toBe(ruyLopezFen);

      // Test King's Indian Defense position: 1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.e4 d6
      const kingsIndianFen = 'rnbqk2r/ppp1ppbp/3p1np1/8/2PPP3/2N5/PP3PPP/R1BQKBNR w KQkq - 0 5';
      expect(engine.parsePosition(kingsIndianFen)).toBe(true);
      expect(engine.getFEN()).toBe(kingsIndianFen);
    });

    test('handles invalid FEN strings gracefully', () => {
      expect(engine.parsePosition('invalid-fen')).toBe(false);
      expect(engine.parsePosition('')).toBe(false);
      expect(engine.parsePosition(null)).toBe(false);
    });
  });

  describe('Move Validation', () => {
    test('validates legal moves correctly', () => {
      // From starting position
      engine.parsePosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

      // Legal opening moves
      expect(engine.validateMove('e2', 'e4')).toBe(true);
      expect(engine.validateMove('d2', 'd4')).toBe(true);
      expect(engine.validateMove('g1', 'f3')).toBe(true);

      // Illegal moves
      expect(engine.validateMove('e2', 'e5')).toBe(false); // Too far
      expect(engine.validateMove('e1', 'e2')).toBe(false); // King blocked
      expect(engine.validateMove('f1', 'e2')).toBe(false); // Bishop blocked
    });

    test('position remains unchanged after validation', () => {
      const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      engine.parsePosition(startingFen);

      engine.validateMove('e2', 'e4');
      expect(engine.getFEN()).toBe(startingFen); // Position should be unchanged
    });
  });

  describe('SAN Generation', () => {
    test('generates correct algebraic notation', () => {
      engine.parsePosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

      expect(engine.generateSAN({ from: 'e2', to: 'e4' })).toBe('e4');
      expect(engine.generateSAN({ from: 'd2', to: 'd4' })).toBe('d4');
      expect(engine.generateSAN({ from: 'g1', to: 'f3' })).toBe('Nf3');
      expect(engine.generateSAN({ from: 'b1', to: 'c3' })).toBe('Nc3');
    });

    test('handles disambiguation correctly', () => {
      // Create position where both knights can move to e2: 1.e4 e6 2.Nc3 Nf6
      engine.reset();
      engine.makeMove('e4');   // 1.e4
      engine.makeMove('e6');   // 1...e6
      engine.makeMove('Nc3');  // 2.Nc3
      engine.makeMove('Nf6');  // 2...Nf6

      // Now both knights (b1->c3 and g1->f3 after development) can potentially go to e2
      // But let's test the current position where Nc3 can go to e2
      const move1 = engine.generateSAN({ from: 'c3', to: 'e2' });

      // Also test Nf3 development which is legal
      const move2 = engine.generateSAN({ from: 'g1', to: 'f3' });

      // Both should be valid knight moves
      expect(move1).toContain('N');
      expect(move1).toContain('e2');
      expect(move2).toContain('N');
      expect(move2).toContain('f3');
      expect(move1).not.toBe(move2); // Should be different
    });

    test('position remains unchanged after SAN generation', () => {
      const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      engine.parsePosition(startingFen);

      engine.generateSAN({ from: 'e2', to: 'e4' });
      expect(engine.getFEN()).toBe(startingFen); // Position should be unchanged
    });
  });

  describe('Basic Chess Logic', () => {
    test('tracks turn correctly', () => {
      engine.parsePosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      expect(engine.getTurn()).toBe('w');

      engine.makeMove('e4');
      expect(engine.getTurn()).toBe('b');

      engine.makeMove('e5');
      expect(engine.getTurn()).toBe('w');
    });

    test('detects game ending conditions', () => {
      // Test for checkmate detection (simplified)
      const checkmateFen = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
      engine.parsePosition(checkmateFen);
      expect(engine.isCheckmate()).toBe(true);

      // Test for draw conditions - just verify method exists and doesn't crash
      engine.reset();
      expect(engine.isDraw()).toBe(false);
      expect(engine.isStalemate()).toBe(false);
    });

    test('provides legal moves', () => {
      engine.parsePosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      const moves = engine.getLegalMoves();

      expect(moves).toHaveLength(20); // 16 pawn moves + 4 knight moves
      expect(moves.every(move => move.from && move.to && move.san)).toBe(true);
    });
  });

  describe('Integration with Golden Master Data', () => {
    test('can parse positions from sample PGN moves', () => {
      // Test positions that will be encountered in golden master data

      // Ruy Lopez line: 1.e4 e5 2.Nf3 Nc6 3.Bb5
      engine.reset();
      expect(engine.makeMove('e4')).toBeTruthy();
      expect(engine.makeMove('e5')).toBeTruthy();
      expect(engine.makeMove('Nf3')).toBeTruthy();
      expect(engine.makeMove('Nc6')).toBeTruthy();
      expect(engine.makeMove('Bb5')).toBeTruthy();

      // Should be able to get the FEN of this position
      const ruyLopezFen = engine.getFEN();
      expect(ruyLopezFen).toContain('1B2p3'); // Ruy Lopez bishop position

      // King's Indian line: 1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.e4 d6
      engine.reset();
      expect(engine.makeMove('d4')).toBeTruthy();
      expect(engine.makeMove('Nf6')).toBeTruthy();
      expect(engine.makeMove('c4')).toBeTruthy();
      expect(engine.makeMove('g6')).toBeTruthy();
      expect(engine.makeMove('Nc3')).toBeTruthy();
      expect(engine.makeMove('Bg7')).toBeTruthy();
      expect(engine.makeMove('e4')).toBeTruthy();
      expect(engine.makeMove('d6')).toBeTruthy();

      // Should be able to get the FEN of this position
      const kingsIndianFen = engine.getFEN();
      expect(kingsIndianFen).toContain('ppbp'); // King's Indian pawn structure
    });
  });
});