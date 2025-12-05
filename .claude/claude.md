# BookBuilder Project Instructions

## PGN Handling Guidelines

This project uses two chess libraries for PGN (Portable Game Notation) operations. **Always use these libraries instead of manual string manipulation.**

### When to Use chess.js

Use `chess.js` for:
- **Parsing PGN strings**: `chess.loadPgn(pgnString)`
- **Extracting move lists**: `chess.history()` returns clean SAN array
- **Validating moves**: `chess.move(san)` returns null if invalid
- **Generating PGN output**: `chess.pgn()` produces properly formatted PGN
- **Position management**: FEN handling, turn tracking, move validation

```javascript
// CORRECT: Use chess.js for PGN parsing
const { Chess } = await import('chess.js');
const chess = new Chess();
chess.loadPgn(pgnString);
const moves = chess.history(); // ['e4', 'e5', 'Nf3', 'Nc6']

// WRONG: Manual string splitting
const moves = pgnString.split(' ').filter(m => !m.includes('.')); // Fragile!
```

### When to Use chessops

Use `chessops` for:
- **PGN tree operations**: Merging multiple lines into variation trees
- **Complex PGN structures**: Nested variations, annotations
- **PGN generation with variations**: `makePgn()` handles variation parentheses

```javascript
// CORRECT: Use chessops for tree merging
import { parsePgn, makePgn } from 'chessops/pgn';
const games = parsePgn(pgnString);
// ... tree manipulation
const output = makePgn(game);
```

### What NOT to Do

Never use these patterns for PGN operations:

```javascript
// BAD: String concatenation for PGN building
const newPgn = currentPgn + ' ' + move; // Can produce invalid PGN

// BAD: Regex for move extraction
const moves = pgn.match(/[NBRQK]?[a-h]?[1-8]?x?[a-h][1-8]/g); // Misses edge cases

// BAD: Split by space for move parsing
const tokens = pgn.split(' '); // Breaks with annotations, variations

// BAD: Manual move number formatting
const formatted = `${moveNum}. ${whiteMove} ${blackMove}`; // Use chess.pgn()
```

### Error Handling

- **Throw errors** instead of silently falling back to string concatenation
- Log warnings with context when parsing fails
- Return empty arrays for invalid input, not malformed data

```javascript
// CORRECT: Throw on failure
try {
    chess.loadPgn(pgn);
    return chess.history().map(san => ({ san }));
} catch (error) {
    throw new Error(`PGN parsing failed: ${error.message}`);
}

// WRONG: Silent fallback
try {
    chess.loadPgn(pgn);
} catch {
    return pgn.split(' '); // Silent degradation produces bad data
}
```

### Key Files

- `client/src/BookBuilder.js` - Uses chess.js for move extraction and PGN updates
- `client/src/ui/FileGenerator.js` - Uses chess.js for PGN parsing in annotations
- `client/src/pgn/PgnTreeMerger.js` - Uses chessops for variation tree merging
- `client/src/utils/PgnProcessor.js` - Uses chess.js for input normalization
