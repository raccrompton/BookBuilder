# BookBuilder JavaScript Migration Spec

## File Structure
```
client/
├── src/
│   ├── chess/ChessEngine.js          # Chess.js wrapper
│   ├── api/LichessClient.js          # API integration
│   ├── engine/StockfishEngine.js     # Stockfish.js wrapper
│   ├── stats/Statistics.js           # Win rate calculations
│   ├── algorithm/MoveSelector.js     # Engine-validated move selection
│   ├── pgn/PgnGenerator.js           # PGN output formatting
│   └── BookBuilder.js                # Main orchestrator
├── tests/
│   ├── golden-master/                # Reference data (existing)
│   └── integration.test.js           # End-to-end validation
├── config.js                         # Configuration
└── index.html                        # Simple UI
```

## Step 1: Chess Foundation (Day 1)
**Implement**: Basic chess position handling
**File**: `src/chess/ChessEngine.js`
```javascript
// Minimal wrapper around chess.js
class ChessEngine {
  parsePosition(fen) { /* chess.js integration */ }
  validateMove(from, to) { /* move validation */ }
  generateSAN(move) { /* algebraic notation */ }
}
```
**Critical Test**:
```javascript
test('parses starting positions for Ruy Lopez and Kings Indian', () => {
  // Verify both openings from golden master can be parsed
});
```

## Step 2: Lichess API + Stockfish Engine (Day 2)
**Implement**: Position lookup and engine evaluation
**Files**:
- `src/api/LichessClient.js` - API integration
- `src/engine/StockfishEngine.js` - Engine wrapper

```javascript
class LichessClient {
  async getPositionStats(fen) { /* API call with retry */ }
  async getMoveStats(fen, move) { /* move statistics */ }
}

class StockfishEngine {
  async getBestMove(fen, depth) { /* stockfish.js integration */ }
  async evaluatePosition(fen, depth) { /* centipawn evaluation */ }
  async analyzeMove(fen, move, depth) { /* move quality check */ }
}
```
**Critical Tests**:
```javascript
test('fetches real position data from Lichess API', async () => {
  // Test actual API call with known position
});

test('stockfish evaluates positions and suggests moves', async () => {
  // Test engine integration with known positions
  // Verify centipawn scores and move suggestions
});
```

## Step 3: Statistical Engine (Day 3)
**Implement**: Win rate calculations matching Python precision
**File**: `src/stats/Statistics.js`
```javascript
class Statistics {
  calculateWinRate(white, draws, black, drawsAreHalf) { /* exact Python logic */ }
  calculateCumulativeProbability(moves) { /* sorting + cumsum */ }
}
```
**Critical Test**:
```javascript
test('win rate calculations match Python within 0.01%', () => {
  // Use exact test data from golden master
  // Verify DRAWSAREHALF=0 and DRAWSAREHALF=1 scenarios
});
```

## Step 4: Move Selection Algorithm (Day 4)
**Implement**: Engine-validated move filtering
**File**: `src/algorithm/MoveSelector.js`
```javascript
class MoveSelector {
  async selectBestMove(position, candidates, config) { /* statistics + engine */ }
  async validateMoveSoundness(fen, move, engineMove, config) { /* centipawn loss check */ }
  filterCandidatesByEngine(candidates, engineBest, config) { /* soundness limits */ }
}
```
**Critical Test**:
```javascript
test('move selection matches Python logic with engine validation', async () => {
  // Test candidate filtering, soundness checking, loss limits
  // Verify engine integration in move selection process
});
```

## Step 5: PGN Generator (Day 5)
**Implement**: Exact PGN format matching with engine completion
**File**: `src/pgn/PgnGenerator.js`
```javascript
class PgnGenerator {
  generateEventHeaders(chapterName, perspective) { /* event naming */ }
  formatMoveAnnotations(move, stats) { /* playrate annotations */ }
  generatePGN(lines, config) { /* complete PGN output */ }
  async completeLineWithEngine(position, config) { /* engine finishing */ }
}
```
**Critical Test**:
```javascript
test('PGN output matches golden master format', () => {
  // Byte-for-byte comparison with reference files
  // Verify move notation, annotations, headers, engine completion
});
```

## Step 6: Main Integration (Day 6)
**Implement**: Orchestrate all components
**File**: `src/BookBuilder.js`
```javascript
class BookBuilder {
  async processOpening(config) { /* main workflow */ }
  async generateChapter(opening, perspective) { /* chapter logic */ }
}
```
**Critical Test**:
```javascript
test('end-to-end: generates exact golden master output', async () => {
  // Full integration test
  // Input: Ruy Lopez config → Output: matches Chapter_1_Ruy_Lopez.pgn
  // Input: Kings Indian config → Output: matches Chapter_2_Kings_Indian.pgn
});
```

## Configuration
**File**: `config.js`
```javascript
export default {
  MINDEPTH: 4,
  MAXDEPTH: 15,
  MINPLAYRATE: 0.01,
  MINGAMES: 500,
  DEPTHLIKELIHOOD: 0.8,
  DRAWSAREHALF: 0,
  // Engine settings
  CAREABOUTENGINE: 1,          // Use Stockfish validation
  ENGINEDEPTH: 20,             // Analysis depth
  ENGINEFINISH: 1,             // Complete lines with engine
  SOUNDNESSLIMIT: -50,         // Max centipawn loss
  LOSSLIMIT: 25,               // Move loss threshold
  IGNORELOSSLIMIT: 50,         // Override threshold
  openings: [
    { name: "Ruy Lopez", fen: "...", perspective: "white" },
    { name: "Kings Indian", fen: "...", perspective: "black" }
  ]
};
```

## Quality Gates
- ✅ All 6 component tests pass
- ✅ Golden master validation passes (<0.01% tolerance)
- ✅ Stockfish engine integration works
- ✅ No console errors in browser
- ✅ Generates identical PGN output to Python version

## Deployment
**File**: `index.html` - Simple file upload interface
**Hosting**: GitHub Pages (free, instant)
**Dependencies**: Add `chess.js` and `stockfish.js` via CDN
**Rollback**: Keep Python version as backup

**Total Timeline**: 6 days development + 1 day deployment = **7 days to production**

This spec prioritizes speed by:
- Skipping complex UI (file upload only)
- Using golden master tests as acceptance criteria
- Minimal error handling (fail fast)
- Direct API integration (no caching initially)
- Static hosting (zero infrastructure)