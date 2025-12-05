# BookBuilder Client Architecture

> Data flow through `/client/src` - verified call chain.

---

## Actual Call Chain

```
FormController.handleSubmit()
    │
    ├──► PgnProcessor.processPgn()          // Parse user's PGN input
    │        └── Returns: { name, moves[], moveCount }
    │
    ├──► new BookBuilder(config)             // Create algorithm instance
    │
    └──► BookBuilder.generateChapter()       // Run algorithm
             │
             ├── analyzeRoot()               // Calculate initial likelihood
             │      └── LichessClient.getPositionStats()
             │      └── ChessEngine (validation)
             │
             ├── expandAllLines()            // BFS expansion loop
             │      └── expandLine() for each position
             │             ├── LichessClient.getPositionStats()
             │             ├── MoveSelector.selectBestMove()
             │             │      ├── Statistics.validateMoveDataQuality()
             │             │      ├── Statistics.calculateWinRate()
             │             │      ├── Statistics.calculateConfidenceInterval()
             │             │      └── StockfishEngine (optional)
             │             └── ChessEngine (make/undo moves)
             │
             └── generateOutput()            // Deduplicate, return data
                    └── Returns: { lines[], openingName, metadata }
                           │
                           ▼
         FormController receives line data object
                           │
                           ▼
         FileGenerator.generateConfiguredPGN(lines, ...)
             │
             ├── sortLinesByProbability()
             │
             └── Route by config.outputFormat:
                    │
                    ├── 'tree' ──► generateTreePGN()
                    │                 └── buildVariationTree()
                    │                 └── generateTreeMoveSequence()
                    │                 └── generateFullAnnotation()  // Tree annotations
                    │
                    └── 'individual' ──► generateIndividualLinesPGN()
                                            └── PgnGenerator.generateSingleLine()
                                                   └── formatMoveAnnotations()
                           │
                           ▼
         FileGenerator.displayPGN(content, chapterName, metadata)
             │
             ├── populateDisplayStats()      // Show line count, size, time
             ├── setupCopyButton()           // Clipboard functionality
             └── setupDownloadButton()       // Optional file download
```

---

## File Purposes

| File | Purpose | Called By |
|------|---------|-----------|
| **FormController.js** | UI orchestrator - connects form to algorithm | HTML form submit |
| **PgnProcessor.js** | Parse PGN input, extract moves | FormController |
| **BookBuilder.js** | Core algorithm - BFS expansion, returns line data | FormController |
| **LichessClient.js** | Fetch position stats from Lichess API | BookBuilder |
| **MoveSelector.js** | Select best move from candidates | BookBuilder |
| **Statistics.js** | Win rates, confidence intervals | MoveSelector, BookBuilder |
| **ChessEngine.js** | Position validation, move execution | BookBuilder |
| **StockfishEngine.js** | Engine soundness analysis (optional) | MoveSelector |
| **FileGenerator.js** | Sort lines, route format, display | FormController |
| **PgnGenerator.js** | Format individual PGN entries | FileGenerator (individual mode only) |

---

## Key Insight: Two Formatters

**FileGenerator** and **PgnGenerator** have overlapping but distinct roles:

| Aspect | FileGenerator | PgnGenerator |
|--------|--------------|--------------|
| **Tree format** | Handles entirely (via `generateFullAnnotation()`) | Not used |
| **Individual format** | Routes to PgnGenerator | Formats each line |
| **Sorting** | Yes (`sortLinesByProbability()`) | No |
| **Display** | Yes (`displayPGN()`) | No |
| **Annotations** | Tree mode (`generateFullAnnotation()`) | Individual mode (`formatMoveAnnotations()`) |
| **Copy/Download** | Yes (browser clipboard + file download) | No |

> **Note**: Both formatters produce identical annotation output format. FileGenerator's
> `generateFullAnnotation()` mirrors PgnGenerator's `formatMoveAnnotations()` to ensure
> consistent output regardless of output mode selected.

---

## Data Transformations

```
User PGN input (string)
    │
    ▼ PgnProcessor
{ name: "Philidor", moves: ["e4","e5","Nf3","d6"], moveCount: 4 }
    │
    ▼ BookBuilder (BFS expansion)
{
  lines: [
    { pgn: "1.e4 e5 2.Nf3 d6", cumulativeLikelihood: 0.18,
      likelihoodPath: [{san:"e5", playrate:0.65}, {san:"d6", playrate:0.28}],
      statistics: { winrate: 0.48, totalGames: 1250 } }
  ],
  openingName: "Philidor",
  metadata: { totalLines: 15 }
}
    │
    ▼ FileGenerator.generateConfiguredPGN() (sort + format)
"[Event \"Philidor Line 1\"]\n\n1.e4 e5 2.Nf3 d6\n{Move playrates:...}"
    │
    ▼ FileGenerator.displayPGN() (browser output)
┌─────────────────────────────────────────────┐
│  📈 15 lines generated  📄 2.5 KB           │
│  ⏱️ 12s processing time                     │
├─────────────────────────────────────────────┤
│  [Event "Philidor Line 1"]                  │
│  1.e4 e5 2.Nf3 d6                           │
│  {Move playrates: ...}                      │
├─────────────────────────────────────────────┤
│  [📋 Copy to Clipboard]  [⬇️ Download PGN]  │
└─────────────────────────────────────────────┘
```

---

## Line Object Structure

```javascript
{
  fen: "rnbqkb1r/ppp2ppp/3p4/4p2n/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 4",
  pgn: "1. e4 e5 2. Nf3 d6",
  perspective: "white",
  cumulativeLikelihood: 0.182,
  likelihoodPath: [
    { san: "e5", playrate: 0.65 },
    { san: "d6", playrate: 0.28 }
  ],
  statistics: {
    cumulativePlayrate: 0.182,
    winrate: 0.485,
    totalGames: 1250
  }
}
```

---

## Configuration Flow

```javascript
// FormController builds config from form
config = {
  openings: [{ name, moves, perspective }],
  speeds: ["blitz", "rapid"],
  ratings: ["1800", "2000", "2200"],
  MOVES: 10,              // → LichessClient
  DEPTHLIKELIHOOD: 0.002, // → BookBuilder
  CONTINUATIONGAMES: 10,  // → BookBuilder
  MINGAMES: 19,           // → MoveSelector
  MINPLAYRATE: 0.01,      // → MoveSelector
  ALPHA: 0.05,            // → Statistics
  DRAWSAREHALF: 1,        // → Statistics
  CAREABOUTENGINE: 1,     // → MoveSelector
  pgnConfig: {
    outputFormat: "tree", // → FileGenerator (tree | individual)
    annotationStyle: "endBlock"
  }
}
```

---

## Key FileGenerator Methods

| Method | Purpose | Called By |
|--------|---------|-----------|
| `generateConfiguredPGN()` | Main entry point - sorts lines, routes to format | FormController |
| `sortLinesByProbability()` | Sort by consecutive move probabilities (highest first) | generateConfiguredPGN |
| `generateTreePGN()` | Build variation tree with nested parentheses | generateConfiguredPGN |
| `generateIndividualLinesPGN()` | Generate separate PGN entries per line | generateConfiguredPGN |
| `generateFullAnnotation()` | Create stats block (playrates, winrate, games) | generateTreePGN |
| `displayPGN()` | Render output in browser with copy/download | FormController |
| `downloadFile()` | Trigger browser file download (fallback) | displayPGN |