# PGN Tree Merger Implementation Plan

## Overview

Convert multiple individual PGN lines into a single unified PGN tree with variations,
preserving all annotations (comments, NAGs, playrates). Uses **chessops** library
(same author as python-chess).

## Chessops API Summary

```javascript
// Core imports
import { parsePgn, makePgn, Node, ChildNode, extend, transform, walk } from 'chessops/pgn';
import { parseSan, makeSanAndPlay } from 'chessops/san';
import { Chess } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';

// Game structure
interface Game<T> {
  headers: Map<string, string>;
  comments?: string[];        // Game-level comments
  moves: Node<T>;             // Root of move tree
}

// Node structure
class Node<T> {
  children: ChildNode<T>[];   // Variations (first child = mainline)
  mainline(): Iterable<T>;    // Iterate mainline moves
  end(): Node<T>;             // Get final position
}

class ChildNode<T> extends Node<T> {
  data: T;  // Move data (san, comments, nags, etc.)
}

// PgnNodeData - what each node contains
interface PgnNodeData {
  san: string;                // "e4", "Nf3", etc.
  startingComments?: string[];
  comments?: string[];        // Comments after move
  nags?: number[];            // NAGs: 1=!, 2=?, 3=!!, 4=??, etc.
}

// Key functions
parsePgn(pgnString): Game<PgnNodeData>[]
makePgn(game): string
extend(node, dataArray): Node  // Add moves sequentially
transform(node, ctx, callback): Node  // Augment tree with data
walk(node, ctx, callback): void  // Visit all nodes
```

---

## Phase 1: PgnTreeMerger Class

### File: `client/src/pgn/PgnTreeMerger.js`

```javascript
/**
 * Merges multiple PGN lines into a single tree with variations.
 * Uses chessops for tree manipulation.
 */
class PgnTreeMerger {
  constructor() {
    this.root = new Node();           // Empty root node
    this.headers = new Map();         // Combined headers
    this.positionIndex = new Map();   // FEN -> node mapping for merge
  }

  /**
   * Add a line to the tree
   * @param {string} pgn - Single PGN game/line
   * @param {Object} metadata - Optional: playrate, winrate, etc.
   */
  addLine(pgn, metadata = {}) { ... }

  /**
   * Merge another tree into this one
   * @param {Node} otherRoot - Root of tree to merge
   */
  mergeTree(otherRoot) { ... }

  /**
   * Export as single PGN with variations
   * @returns {string} Combined PGN
   */
  toPgn() { ... }

  /**
   * Get node at specific position
   * @param {string} fen - Position FEN
   * @returns {Node|null}
   */
  getNodeAtPosition(fen) { ... }
}
```

---

## Phase 2: Merge Algorithm

### Core Logic

```
For each new line being added:
1. Parse line into move sequence
2. Start at root, current position = starting FEN
3. For each move in sequence:
   a. Check if move already exists in current node's children
   b. If YES: follow that branch, update position
   c. If NO: create new ChildNode, add to children
   d. Merge annotations (comments, NAGs) if duplicate
4. At leaf, attach line-specific metadata (playrate stats)
```

### Position-Based Indexing

```javascript
// Use FEN as unique position key
positionIndex: Map<string, Node[]>  // FEN -> nodes at that position

// When merging, check if position already exists
const existingNodes = this.positionIndex.get(fen);
if (existingNodes) {
  // Check if same move exists, merge if so
}
```

### Annotation Merging Rules

| Situation | Strategy |
|-----------|----------|
| Same move, both have comments | Concatenate with separator |
| Same move, both have NAGs | Union (deduplicate) |
| Same move, different playrates | Keep both in custom field |
| Transposition detected | Link via position index |

---

## Phase 3: BookBuilder Integration

### Modified PgnGenerator.js

```javascript
// New method to generate merged tree PGN
async generateMergedPGN(lines, chapterName) {
  const merger = new PgnTreeMerger();

  // Set headers for combined output
  merger.setHeaders({
    Event: chapterName,
    // ... other headers
  });

  // Add each line with its statistics
  for (const line of lines) {
    merger.addLine(line.pgn, {
      playrate: line.cumulativeLikelihood,
      winrate: line.statistics?.winrate,
      likelihoodPath: line.likelihoodPath
    });
  }

  return merger.toPgn();
}
```

### Annotation Format for Playrates

```pgn
1. e4 {[%playrate 35.5]} e5 {[%playrate 42.1]}
2. Nf3 (2. Bc4 {[%playrate 15.2]} Nc6 {Italian Game variation})
2... Nc6 {[%playrate 89.3]} *
```

---

## Phase 4: File Structure

```
client/src/pgn/
├── PgnGenerator.js          # Existing - add integration
├── PgnTreeMerger.js         # NEW - core merger logic
├── PgnAnnotations.js        # NEW - playrate/stat annotations
└── PLAN_PgnTreeMerger.md    # This plan
```

---

## Phase 5: Testing Strategy

### Test Cases

1. **Simple merge**: Two lines sharing first 3 moves, diverge at move 4
2. **Full overlap**: Same line added twice (should dedupe)
3. **No overlap**: Completely different openings
4. **Deep variations**: 3+ levels of nesting
5. **Annotations preserved**: Comments, NAGs survive merge
6. **Playrates preserved**: Statistics attached to correct nodes

### Example Test

```javascript
// Input:
// Line 1: 1. e4 e5 2. Nf3 Nc6 3. Bb5  (Ruy Lopez)
// Line 2: 1. e4 e5 2. Nf3 Nc6 3. Bc4  (Italian Game)
// Line 3: 1. e4 c5                     (Sicilian)

// Expected output:
// 1. e4 e5 (1... c5 {Sicilian})
// 2. Nf3 Nc6
// 3. Bb5 (3. Bc4 {Italian Game}) *
```

---

## Implementation Order

1. **PgnTreeMerger.js** - Core class with addLine(), toPgn()
2. **Position indexing** - FEN-based node lookup
3. **Annotation handling** - Playrate comment format
4. **PgnGenerator integration** - New generateMergedPGN() method
5. **Testing** - Unit tests for merge scenarios
6. **UI integration** - Option to export as tree vs individual lines

---

## Notes

- chessops is already installed: `node_modules/chessops`
- Import path: `import { parsePgn } from 'chessops/pgn'`
- ESM modules in `node_modules/chessops/dist/esm/`
- Types available for reference in `dist/types/`
