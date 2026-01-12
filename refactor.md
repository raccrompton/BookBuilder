# BookBuilder Codebase Refactoring Plan

> Goal: Improve code quality by splitting large files and enabling MCP server to be a thin wrapper around shared core logic.

---

## Summary

Split 4 large files (2000+ to 1000+ lines) into smaller, focused modules. Extract platform-agnostic core logic to a shared directory that both client and MCP server can import.

**Two-part strategy:**
1. **Shared core extraction** — Pure algorithmic code moves to `shared/` for cross-package reuse
2. **Client file splitting** — Large files decompose into focused classes

**Files to refactor (in order):**
1. Extract shared modules (enables MCP as thin wrapper)
2. FileGenerator.js (2,092 lines) → 4 smaller classes
3. BookBuilder.js (1,680 lines) → 3 smaller classes
4. FormController.js (1,477 lines) → 3 smaller classes
5. MoveSelector.js (1,123 lines) → 3 smaller classes (using shared core)

---

## Phase 0: Extract Shared Core Modules

> **Purpose:** Create platform-agnostic modules that both client and MCP server import, eliminating code duplication.

### 0.1 Create shared/ Directory Structure

```
shared/
├── package.json              # ES module config
├── index.js                  # Re-exports all modules
├── statistical-scorer.js     # Wilson confidence intervals
├── move-filter.js            # Candidate filtering logic
├── lichess-core.js           # API logic (no Logger dependency)
├── fen-utils.js              # FEN validation helpers
├── notation-utils.js         # UCI→SAN conversion
└── tests/
    ├── statistical-scorer.test.js
    ├── move-filter.test.js
    ├── lichess-core.test.js
    ├── fen-utils.test.js
    └── notation-utils.test.js
```

**Root package.json (npm workspaces):**
```json
{
  "name": "bookbuilder",
  "private": true,
  "workspaces": ["client", "mcp-server", "shared"]
}
```

**shared/package.json:**
```json
{
  "name": "@bookbuilder/shared",
  "type": "module",
  "main": "index.js",
  "exports": {
    ".": "./index.js",
    "./statistical-scorer": "./statistical-scorer.js",
    "./move-filter": "./move-filter.js",
    "./lichess-core": "./lichess-core.js",
    "./fen-utils": "./fen-utils.js",
    "./notation-utils": "./notation-utils.js"
  }
}
```

> **Note:** Run `npm install` from root after creating workspaces. This symlinks `@bookbuilder/shared` so both client and mcp-server can import it without publishing to npm.

### 0.2 Extract fen-utils.js
- **Source:** MCP `index.js` inline functions + client validation logic
- **Contents:**
  ```javascript
  export function isValidFen(fen)        // FEN format validation
  export function getSideToMove(fen)     // Extract active color
  export function isValidPgn(pgn)        // Basic PGN validation
  export function fenToPosition(fen)     // Parse FEN to components
  ```
- **Dependencies:** None (pure functions)
- **Lines:** ~40

### 0.3 Extract notation-utils.js
- **Source:** MCP `index.js` + client engine utilities
- **Contents:**
  ```javascript
  export function uciToSan(uciMove, fen)           // Convert engine notation
  export function sanToUci(sanMove, fen)           // Reverse conversion
  export function getQualityAssessment(centipawns) // Score to human text
  export function formatEvaluation(score)          // Display formatting
  ```
- **Dependencies:** `chess.js` (already used by both packages)
- **Lines:** ~80

### 0.4 Extract statistical-scorer.js
- **Source:** MCP `move-selector.js` Wilson logic + client scoring
- **Contents:**
  ```javascript
  export function calculateWilsonLowerBound(wins, total, z = 1.96)
  export function calculateWinRate(white, draws, black, perspective)
  export function rankMovesByConfidence(moves, perspective)
  export function selectBestByLowerBound(rankedMoves)
  ```
- **Dependencies:** None (pure math)
- **Lines:** ~100
- **Why shared:** This is the EXACT same algorithm in both implementations

### 0.5 Extract move-filter.js
- **Source:** Client `MoveSelector.js` filtering logic
- **Contents:**
  ```javascript
  export function filterByMinGames(moves, minGames)
  export function filterByPlayRate(moves, minPlayRate)
  export function filterByQuality(moves, maxCentipawnLoss)
  export function applyFilterPipeline(moves, filters)
  ```
- **Dependencies:** None (pure functions)
- **Lines:** ~80

### 0.6 Extract lichess-core.js
- **Source:** Client `LichessClient.js` + MCP `lichess-adapter.js`
- **Contents:**
  ```javascript
  export function buildExplorerUrl(fen, options)
  export function transformExplorerResponse(data)
  export function calculatePlayRates(moves)
  export async function fetchWithRetry(url, options, logger = null)
  export class LichessExplorerCore {
    constructor(options = {})  // Optional logger, timeout, baseUrl
    async getMoves(fen, config)
  }
  ```
- **Dependencies:** None (fetch is global in both environments)
- **Lines:** ~150
- **Key design:** Logger is optional parameter, not required dependency

### 0.7 Add Shared Module Tests
- **File:** `shared/tests/*.test.js`
- **Coverage:** All exported functions
- **Strategy:** These become the single source of truth for algorithm correctness

---

## Phase 1: Add Safety Net Tests

Before any refactoring, add characterization tests for undertested code.

### 1.1 PgnTreeMerger Unit Tests (HIGH PRIORITY)
- **File:** `client/tests/unit/pgn-tree-merger.test.js`
- **Why:** 250 lines of complex merge logic with no unit tests
- **Tests to add:**
  - Merge two trees with overlapping moves
  - Merge trees with conflicting variations
  - Handle empty trees
  - Preserve move annotations during merge
  - Deep nested variation merging

### 1.2 ConfigManager Unit Tests
- **File:** `client/tests/unit/config-manager.test.js`
- **Why:** Persistence logic only tested via integration
- **Tests to add:**
  - Save/load configuration to localStorage
  - Handle corrupted storage gracefully
  - Default values when storage empty

### 1.3 Golden Master Snapshots for Large Functions
- **File:** `client/tests/golden-master-enhanced.test.js` (extend existing)
- **Why:** Capture exact output of functions being refactored
- **Note:** `golden-master-enhanced.test.js` already exists with Python reference validation. Add a new `describe('Refactor Safety Snapshots', ...)` block rather than creating a separate file.
- **Capture snapshots for:**
  - `FileGenerator.generateNestedPGNFromStructure()`
  - `FileGenerator.buildNestedVariationTree()`
  - `BookBuilder.expandLine()` (with mock data)

---

## Phase 2: Refactor FileGenerator.js (2,092 → ~500 each)

### 2.1 Extract PGNFormatter Class
- **New file:** `client/src/ui/PGNFormatter.js`
- **Move methods:**
  - `generateConfiguredPGN()` (lines 533-573)
  - `generateBothFormats()` (lines 593-637)
  - `generateNestedPGNFromStructure()` (lines 1158-1213)
  - `generateContinuationMoves()` (lines 1262-1325)
  - Related helper methods for PGN string building

### 2.2 Extract VariationTreeBuilder Class
- **New file:** `client/src/ui/VariationTreeBuilder.js`
- **Move methods:**
  - `buildNestedVariationTree()` (lines 903-953)
  - `buildNestedStructureAtPoint()` (lines 961-1000)
  - `buildSubVariationStructure()` (recursive tree building)
  - Tree traversal utilities

### 2.3 Extract DisplayController Class
- **New file:** `client/src/ui/DisplayController.js`
- **Move methods:**
  - `displayPGN()` (lines 1672-1762)
  - Format toggle logic
  - DOM update methods

### 2.4 Keep FileGenerator as Facade
- **Modify:** `client/src/ui/FileGenerator.js`
- FileGenerator becomes thin orchestrator that delegates to:
  - `PGNFormatter` for generation
  - `VariationTreeBuilder` for tree construction
  - `DisplayController` for UI updates
- Public API remains unchanged

---

## Phase 3: Refactor BookBuilder.js (1,680 → ~400 each)

### 3.1 Extract MoveExpander Class
- **New file:** `client/src/algorithm/MoveExpander.js`
- **Move from `expandLine()` (282 lines):**
  - Position analysis logic
  - Move validation
  - Move execution and undo
  - Error recovery

### 3.2 Extract PositionAnalyzer Class
- **New file:** `client/src/algorithm/PositionAnalyzer.js`
- **Imports:** `@bookbuilder/shared/lichess-core`
- **Move methods:**
  - Lichess API call logic from `expandLine()`
  - Move filtering by player color
  - Statistics processing
- **Change:** Use `LichessExplorerCore` from shared, wrap with Logger

### 3.3 Keep BookBuilder as Orchestrator
- **Modify:** `client/src/BookBuilder.js`
- Coordinates `MoveExpander`, `PositionAnalyzer`, `MoveSelector`
- `generateChapter()` becomes sequence of delegated calls
- Public API remains unchanged

---

## Phase 4: Refactor FormController.js (1,477 → ~400 each)

### 4.1 Extract ConfigConverter Class
- **New file:** `client/src/ui/ConfigConverter.js`
- **Move methods:**
  - `convertToBookBuilderConfig()` (lines 819-935)
  - Form data validation helpers
  - Option mapping logic

### 4.2 Extract GenerationOrchestrator Class
- **New file:** `client/src/ui/GenerationOrchestrator.js`
- **Move methods:**
  - `startGeneration()` (lines 367-457)
  - `processOpenings()` (lines 569-662)
  - Progress coordination logic

### 4.3 Keep FormController for Events
- **Modify:** `client/src/ui/FormController.js`
- Handles DOM events only
- Delegates to `ConfigConverter` and `GenerationOrchestrator`
- Public API remains unchanged

---

## Phase 5: Refactor MoveSelector.js (1,123 → ~350 each)

### 5.1 Import MoveFilter from shared/
- **Instead of:** Creating new `client/src/algorithm/MoveFilter.js`
- **Do:** Import `@bookbuilder/shared/move-filter`
- Client's MoveSelector uses shared filtering functions
- MCP's move-selector uses same shared functions

### 5.2 Import StatisticalScorer from shared/
- **Instead of:** Creating new `client/src/algorithm/StatisticalScorer.js`
- **Do:** Import `@bookbuilder/shared/statistical-scorer`
- Both client and MCP use identical Wilson confidence logic
- Single source of truth for the algorithm

### 5.3 Keep MoveSelector as Pipeline
- **Modify:** `client/src/algorithm/MoveSelector.js`
- Orchestrates: Filter (shared) → Score (shared) → Validate (client-specific) → Select
- Client adds engine validation layer on top of shared scoring
- Public API remains unchanged

---

## Phase 6: Simplify MCP Server

> **Purpose:** Reduce MCP server to thin wrappers around shared modules.

### 6.1 Update MCP move-selector.js
- **Before:** 192 lines with reimplemented Wilson logic
- **After:** ~50 lines importing from shared
  ```javascript
  import { rankMovesByConfidence, selectBestByLowerBound } from '@bookbuilder/shared/statistical-scorer';
  import { filterByMinGames } from '@bookbuilder/shared/move-filter';
  ```

### 6.2 Update MCP lichess-adapter.js
- **Before:** 211 lines with reimplemented API logic
- **After:** ~30 lines importing from shared
  ```javascript
  import { LichessExplorerCore } from '@bookbuilder/shared/lichess-core';

  export class LichessAdapter {
    constructor() {
      this.core = new LichessExplorerCore();
    }
    async getMoves(fen, config) {
      return this.core.getMoves(fen, config);
    }
  }
  ```

### 6.3 Update MCP index.js
- **Before:** Inline validation helpers
- **After:** Import from shared
  ```javascript
  import { isValidFen, getSideToMove } from '@bookbuilder/shared/fen-utils';
  import { uciToSan, getQualityAssessment } from '@bookbuilder/shared/notation-utils';
  ```

### 6.4 Delete Redundant MCP Code
- Remove duplicated logic from MCP files
- Keep only: tool handlers, Stockfish wrapper (platform-specific), MCP SDK integration

---

## Verification Strategy

### After Each Phase

```bash
# 1. Run shared module tests
cd shared && npm test

# 2. Run full client test suite
cd client && npm test

# 3. Run E2E tests
npm run test:e2e

# 4. Run MCP tests
cd ../mcp-server && npm test

# 5. Check for circular dependencies
npx madge --circular client/src/ shared/

# 6. Manual smoke test
npm run dev  # Start app
# Test: Generate a repertoire with 2-3 openings
# Verify: PGN output matches expected format
```

### Regression Checklist
- [ ] All shared module tests pass
- [ ] All 127 MCP tests pass
- [ ] All client unit tests pass
- [ ] All E2E tests pass (form-orchestration, job-queue)
- [ ] Golden master snapshots unchanged
- [ ] PGN contract tests pass
- [ ] No new ESLint warnings
- [ ] No circular dependencies (madge check passes)

---

## Files to Modify

### New Files - Shared (6 + tests)
```
shared/package.json
shared/index.js
shared/statistical-scorer.js
shared/move-filter.js
shared/lichess-core.js
shared/fen-utils.js
shared/notation-utils.js
shared/tests/statistical-scorer.test.js
shared/tests/move-filter.test.js
shared/tests/lichess-core.test.js
shared/tests/fen-utils.test.js
shared/tests/notation-utils.test.js
```

### New Files - Client (9)
```
client/src/ui/PGNFormatter.js
client/src/ui/VariationTreeBuilder.js
client/src/ui/DisplayController.js
client/src/ui/ConfigConverter.js
client/src/ui/GenerationOrchestrator.js
client/src/algorithm/MoveExpander.js
client/src/algorithm/PositionAnalyzer.js
client/tests/unit/pgn-tree-merger.test.js
client/tests/unit/config-manager.test.js
```

### Modified Files - Client (5)
```
client/src/ui/FileGenerator.js (2092 → ~300 lines)
client/src/BookBuilder.js (1680 → ~400 lines)
client/src/ui/FormController.js (1477 → ~300 lines)
client/src/algorithm/MoveSelector.js (1123 → ~250 lines)
client/tests/golden-master-enhanced.test.js (add refactor snapshots)
```

### Modified Files - MCP (4)
```
mcp-server/src/index.js (674 → ~500 lines)
mcp-server/src/lichess-adapter.js (211 → ~30 lines)
mcp-server/src/move-selector.js (192 → ~50 lines)
mcp-server/package.json (add shared dependency)
```

---

## Execution Order

| Step | Task | Risk | Verification |
|------|------|------|--------------|
| 0a | Create shared/ directory structure | None | Directory exists |
| 0b | Extract fen-utils.js | Low | Shared tests pass |
| 0c | Extract notation-utils.js | Low | Shared tests pass |
| 0d | Extract statistical-scorer.js | Low | Shared tests pass |
| 0e | Extract move-filter.js | Low | Shared tests pass |
| 0f | Extract lichess-core.js | Medium | Shared tests pass |
| 1 | Add PgnTreeMerger tests | None | Tests pass |
| 2 | Add ConfigManager tests | None | Tests pass |
| 3 | Add golden master snapshots | None | Snapshots created |
| 4 | Update MCP to use shared/ | Medium | MCP tests pass |
| 5 | Extract PGNFormatter | Low | All tests pass |
| 6 | Extract VariationTreeBuilder | Low | All tests pass |
| 7 | Extract DisplayController | Low | All tests pass + E2E |
| 8 | Extract MoveExpander | Medium | All tests pass |
| 9 | Update PositionAnalyzer (use shared) | Medium | All tests pass |
| 10 | Extract ConfigConverter | Low | E2E tests pass |
| 11 | Extract GenerationOrchestrator | Low | E2E tests pass |
| 12 | Update MoveSelector (use shared) | Medium | Algorithm tests pass |
| 13 | Final verification | - | Full suite + manual |

---

## Success Criteria

1. **No functionality changes** - All existing tests pass without modification
2. **No file > 500 lines** - All refactored files under limit
3. **No function > 50 lines** - Large functions decomposed
4. **Test coverage maintained** - No decrease in coverage
5. **Clean imports** - No circular dependencies introduced
6. **MCP simplified** - MCP-specific code reduced from ~750 to ~200 lines
7. **Single source of truth** - Core algorithms exist in shared/ only
8. **Cross-package tests** - Shared modules tested independently

---

## Architecture After Refactoring

```
┌─────────────────────────────────────────────────────────────────┐
│                         shared/                                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐ │
│  │ statistical │ │ move-filter │ │lichess-core │ │ fen-utils  │ │
│  │   -scorer   │ │             │ │             │ │notation-   │ │
│  │             │ │             │ │             │ │   utils    │ │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └─────┬──────┘ │
└─────────┼───────────────┼───────────────┼──────────────┼────────┘
          │               │               │              │
    ┌─────┴───────────────┴───────────────┴──────────────┴─────┐
    │                                                           │
    ▼                                                           ▼
┌─────────────────────────────────┐   ┌─────────────────────────────┐
│           client/               │   │        mcp-server/          │
│                                 │   │                             │
│  ┌─────────────────────────┐   │   │  ┌─────────────────────┐   │
│  │     MoveSelector        │   │   │  │   move-selector     │   │
│  │  (shared + engine       │   │   │  │   (thin wrapper)    │   │
│  │   validation)           │   │   │  └─────────────────────┘   │
│  └─────────────────────────┘   │   │                             │
│                                 │   │  ┌─────────────────────┐   │
│  ┌─────────────────────────┐   │   │  │  lichess-adapter    │   │
│  │   PositionAnalyzer      │   │   │  │   (thin wrapper)    │   │
│  │  (shared + Logger)      │   │   │  └─────────────────────┘   │
│  └─────────────────────────┘   │   │                             │
│                                 │   │  ┌─────────────────────┐   │
│  ┌─────────────────────────┐   │   │  │  stockfish-engine   │   │
│  │   StockfishEngine       │   │   │  │  (Node.js-specific) │   │
│  │   (Web Worker)          │   │   │  └─────────────────────┘   │
│  └─────────────────────────┘   │   │                             │
└─────────────────────────────────┘   └─────────────────────────────┘
```

---

## Impact Summary

| Metric | Before | After |
|--------|--------|-------|
| MCP-specific code | ~750 lines | ~200 lines |
| Duplicated logic | ~400 lines | ~0 lines |
| Largest client file | 2,092 lines | ~500 lines |
| Test isolation | Separate suites | Shared core tests |
| Maintenance burden | 2 implementations | 1 source of truth |
