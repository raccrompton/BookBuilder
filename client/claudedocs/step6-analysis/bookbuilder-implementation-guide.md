# BookBuilder.js Implementation Guide

## Overview
This document provides a line-by-line understanding of the original Python BookBuilder implementation, with pseudocode ready for JavaScript translation. The system builds chess opening repertoires by analyzing Lichess database statistics and generating annotated PGN files.

## Core Architecture

### Main Components
1. **Grower** - Main orchestrator that processes each opening from config
2. **Rooter** - Analyzes initial PGN and calculates opponent move probabilities
3. **Leafer** - Core engine that finds continuations and generates responses
4. **Printer** - Outputs final annotated PGN files
5. **WorkerPlay** - API interface for Lichess statistics and move analysis

## Data Flow Pattern
```
Config Openings → Grower → Rooter → Leafer (iterative) → Printer → PGN Files
                                      ↑
                                  WorkerPlay (API)
```

## Detailed Implementation Analysis

### 1. Grower Class (Main Orchestrator)

**Purpose**: Top-level coordinator that processes each opening from configuration

**Python Code Analysis**:
```python
class Grower():
    def run(self):
        for chapter, opening in enumerate(config.OPENINGBOOK, 1):
            self.pgn = opening['pgn']
            self.iterator(chapter, opening['Name'])
```

**JavaScript Pseudocode**:
```javascript
class BookBuilder {
    constructor(config) {
        this.config = config;
        this.lichessClient = new LichessClient();
        this.chessEngine = new ChessEngine();
        this.moveSelector = new MoveSelector();
        this.pgnGenerator = new PgnGenerator();
        this.statisticsEngine = new Statistics();
    }

    async processOpening(config) {
        for (let chapter = 1; chapter <= config.openings.length; chapter++) {
            const opening = config.openings[chapter - 1];
            await this.generateChapter(opening, chapter);
        }
    }

    async generateChapter(opening, chapterNumber) {
        // Reset state for each chapter
        this.finalLines = [];
        this.processingQueue = [];

        // Start with root analysis
        const rootResults = await this.analyzeRoot(opening.fen);
        this.processingQueue.push(...rootResults);

        // Iterative expansion
        while (this.processingQueue.length > 0) {
            const batch = this.processingQueue.splice(0, 10); // Process in batches
            const newLines = await Promise.all(
                batch.map(line => this.expandLine(line))
            );
            this.processingQueue.push(...newLines.flat());
        }

        // Generate output
        await this.outputChapter(opening.name, chapterNumber);
    }
}
```

### 2. Rooter Class (Initial Analysis)

**Purpose**: Analyzes the starting PGN to determine perspective and initial likelihood calculations

**Python Code Analysis**:
```python
class Rooter():
    def __init__(self, pgn):
        self.pgn = pgn
        pgnList = self._calculate_pgns()

    def _calculate_pgns(self):
        game = chess.pgn.read_game(io.StringIO(self.pgn))
        board = game.board()
        moves = list(game.mainline_moves())

        if len(moves) % 2 == 0:
            perspective = chess.BLACK
        else:
            perspective = chess.WHITE
```

**JavaScript Pseudocode**:
```javascript
async analyzeRoot(fen) {
    try {
        // Parse initial position
        const position = this.chessEngine.parsePosition(fen);
        const moves = position.history();

        // Determine perspective
        const perspective = moves.length % 2 === 0 ? 'black' : 'white';

        // Get continuations from current position
        const continuations = await this.lichessClient.getPositionStats(fen);

        const validLines = [];
        for (const move of continuations.moves) {
            const playrate = move.white + move.draws + move.black;
            const totalGames = playrate;

            // Filter by minimum thresholds
            if (move.playrate >= this.config.DEPTHLIKELIHOOD &&
                totalGames > this.config.CONTINUATIONGAMES) {

                validLines.push({
                    fen: fen,
                    move: move,
                    perspective: perspective,
                    cumulativeLikelihood: move.playrate,
                    likelihoodPath: [{san: move.san, playrate: move.playrate}]
                });
            }
        }

        return validLines;
    } catch (error) {
        throw new Error(`Invalid PGN: ${fen}`);
    }
}
```

### 3. Leafer Class (Core Expansion Engine)

**Purpose**: Iteratively finds opponent continuations and generates our best responses

**Python Code Analysis**:
```python
class Leafer():
    def _calculate_pgns(self):
        # Find all continuations
        self.workerPlay = WorkerPlay(board.fen(), move)
        continuations = self.workerPlay.find_move_tree()

        for move in continuations:
            continuationLikelihood = float(move['playrate']) * float(self.likelihood)
            if (continuationLikelihood >= float(config.DEPTHLIKELIHOOD)) and (move['total_games'] > config.CONTINUATIONGAMES):
                validContinuations.append(move)

        # Find our best response to each continuation
        for move in validContinuations:
            board.push_san(move['san'])
            self.workerPlay = WorkerPlay(board.fen(), lastmove = move)
            _, self.best_move, self.potency, self.potency_range, self.total_games = self.workerPlay.pick_candidate()

            if (move['playrate'] > config.MINPLAYRATE) and (self.total_games > config.MINGAMES) and (self.potency != 0):
                # Add to continuation list
                newpgn = self.pgn + " " + move['san'] + " " + self.best_move
                pgnList.append([newpgn, move['cumulativeLikelihood'], self.likelihood_path[:]])
            else:
                # No good response - finalize line
                finalLine.append(line)
```

**JavaScript Pseudocode**:
```javascript
async expandLine(lineData) {
    const { fen, cumulativeLikelihood, likelihoodPath, perspective } = lineData;

    try {
        // Get opponent continuations
        const position = this.chessEngine.parsePosition(fen);
        const continuations = await this.lichessClient.getPositionStats(fen);

        const validContinuations = continuations.moves.filter(move => {
            const continuationLikelihood = move.playrate * cumulativeLikelihood;
            return continuationLikelihood >= this.config.DEPTHLIKELIHOOD &&
                   move.totalGames > this.config.CONTINUATIONGAMES;
        });

        if (validContinuations.length === 0) {
            // No valid continuations - finalize line
            const stats = await this.lichessClient.getPositionStats(fen);
            const winRate = this.statisticsEngine.calculateWinRate(
                stats.white, stats.draws, stats.black, this.config.DRAWSAREHALF
            );

            this.finalLines.push({
                pgn: this.chessEngine.positionToPgn(position),
                cumulativeLikelihood,
                likelihoodPath,
                winRate,
                totalGames: stats.white + stats.draws + stats.black
            });
            return [];
        }

        const newLines = [];

        for (const move of validContinuations) {
            // Make opponent's move
            const newPosition = position.clone();
            newPosition.move(move.san);

            // Find our best response
            const candidates = await this.lichessClient.getMoveStats(newPosition.fen());
            const bestMove = await this.moveSelector.selectBestMove(
                newPosition, candidates, this.lichessClient, this.statisticsEngine
            );

            if (bestMove && this.isValidResponse(bestMove, move)) {
                // Make our response
                newPosition.move(bestMove.san);

                const newLikelihoodPath = [...likelihoodPath, {
                    san: move.san,
                    playrate: move.playrate
                }];

                newLines.push({
                    fen: newPosition.fen(),
                    cumulativeLikelihood: move.playrate * cumulativeLikelihood,
                    likelihoodPath: newLikelihoodPath,
                    perspective: perspective === 'white' ? 'black' : 'white'
                });
            } else {
                // No good response - try engine completion or finalize
                if (this.config.ENGINEFINISH && this.stockfishEngine) {
                    const engineMove = await this.stockfishEngine.getBestMove(
                        newPosition.fen(), this.config.ENGINEDEPTH
                    );
                    if (engineMove) {
                        newPosition.move(engineMove);
                        newLines.push({
                            fen: newPosition.fen(),
                            cumulativeLikelihood: move.playrate * cumulativeLikelihood,
                            likelihoodPath: newLikelihoodPath,
                            perspective: perspective === 'white' ? 'black' : 'white'
                        });
                    }
                } else {
                    // Finalize line here
                    this.finalLines.push({
                        pgn: this.chessEngine.positionToPgn(newPosition),
                        cumulativeLikelihood: move.playrate * cumulativeLikelihood,
                        likelihoodPath: newLikelihoodPath,
                        winRate: bestMove ? bestMove.winRate : 0,
                        totalGames: bestMove ? bestMove.totalGames : 0
                    });
                }
            }
        }

        return newLines;

    } catch (error) {
        console.error(`Error expanding line: ${error.message}`);
        return [];
    }
}

isValidResponse(bestMove, opponentMove) {
    return bestMove &&
           opponentMove.playrate > this.config.MINPLAYRATE &&
           bestMove.totalGames > this.config.MINGAMES &&
           bestMove.winRate > 0;
}
```

### 4. Printer Class (Output Generation)

**Purpose**: Generates final annotated PGN files with move statistics and annotations

**Python Code Analysis**:
```python
class Printer():
    def print(self, pgn, cumulative, likelyPath, winRate, Games, lineNumber, openingName):
        pgnEvent = '[Event "' + openingName + " Line " + str(lineNumber) + '"]'
        file.write('\n' + '\n' + '\n' + pgnEvent + '\n')
        file.write('\n' + pgn)
        file.write('\n' + "{Move playrates:")

        for move, chance in likelyPath:
            moveAnnotation = str("{:+.2%}".format(chance)) + '\t' + move
            file.write('\n' + moveAnnotation)

        if config.DRAWSAREHALF == 1:
            lineAnnotations = "Line cumulative playrate: " + str("{:+.2%}".format(cumulative)) + '\n' + "Line winrate (draws are half): " + str("{:+.2%}".format(winRate)) + ' over ' + str(Games) + ' games'
        else:
            lineAnnotations = "Line cumulative playrate: " + str("{:+.2%}".format(cumulative)) + '\n' + "Line winrate (excluding draws): " + str("{:+.2%}".format(winRate)) + ' over ' + str(Games) + ' games'

        file.write('\n' + lineAnnotations + '\n' + "}")
```

**JavaScript Pseudocode**:
```javascript
async outputChapter(openingName, chapterNumber) {
    // Remove duplicates and subsets
    const uniqueLines = this.removeDuplicateLines(this.finalLines);

    // Sort by consecutive move probabilities
    const sortedLines = this.sortLinesByProbability(uniqueLines);

    // Generate PGN content
    const pgnContent = [];

    for (let i = 0; i < sortedLines.length; i++) {
        const line = sortedLines[i];
        const lineNumber = i + 1;

        const pgn = await this.pgnGenerator.generateSingleLine(line, `${openingName} Line ${lineNumber}`);
        pgnContent.push(pgn);
    }

    // Write to file
    const filename = `Chapter_${chapterNumber}_${openingName.replace(/\s+/g, '_')}.pgn`;
    const finalContent = pgnContent.join('\n\n');

    // Use Write tool or file system to save
    console.log(`Generated ${filename} with ${sortedLines.length} lines`);
    return finalContent;
}

removeDuplicateLines(lines) {
    const unique = [];
    const seen = new Set();

    for (const line of lines) {
        const key = line.pgn;
        if (!seen.has(key)) {
            seen.add(key);

            // Check if this line is a subset of another
            const isSubset = unique.some(existing =>
                existing.pgn.includes(key + " ")
            );

            if (!isSubset) {
                unique.push(line);
            }
        }
    }

    return unique;
}

sortLinesByProbability(lines) {
    return lines.sort((a, b) => {
        // Sort by consecutive move probabilities
        const aProbs = a.likelihoodPath.map(move => move.playrate);
        const bProbs = b.likelihoodPath.map(move => move.playrate);

        for (let i = 0; i < Math.min(aProbs.length, bProbs.length); i++) {
            if (aProbs[i] !== bProbs[i]) {
                return bProbs[i] - aProbs[i]; // Descending order
            }
        }

        return bProbs.length - aProbs.length;
    });
}
```

## Configuration Structure

**JavaScript Config Object**:
```javascript
const config = {
    // Depth and probability thresholds
    MINDEPTH: 4,
    MAXDEPTH: 15,
    MINPLAYRATE: 0.01,
    MINGAMES: 19,
    CONTINUATIONGAMES: 10,
    DEPTHLIKELIHOOD: 0.03,

    // Statistical analysis
    ALPHA: 0.001,
    DRAWSAREHALF: 0,

    // Engine configuration
    CAREABOUTENGINE: 1,
    ENGINEFINISH: 1,
    ENGINEDEPTH: 20,
    SOUNDNESSLIMIT: -99,
    LOSSLIMIT: -99,
    IGNORELOSSLIMIT: 300,

    // Output configuration
    LONGTOSHORT: 1,
    PRINT_INFO_TO_CONSOLE: true,

    // Opening definitions
    openings: [
        {
            name: "Ruy Lopez",
            fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
            perspective: "white"
        },
        {
            name: "Kings Indian",
            fen: "rnbqkb1r/pppppp1p/5np1/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3",
            perspective: "black"
        }
    ]
};
```

## Key Implementation Requirements

### 1. State Management
- **Global Variables**: Python uses `finalLine` and `pgnsreturned` globals - replace with class properties
- **Processing Queue**: Implement iterative expansion with async batching
- **Memory Management**: Clean up chess positions and API connections

### 2. API Integration
- **Rate Limiting**: Implement exponential backoff for Lichess API
- **Error Handling**: Handle API failures gracefully with retries
- **Response Caching**: Cache position statistics to reduce API calls

### 3. Chess Logic
- **Position Handling**: Use chess.js for board representation and move validation
- **PGN Generation**: Exact format matching with Python output
- **Move Numbering**: Maintain consistent move numbering for white/black perspectives

### 4. Statistical Precision
- **Floating Point**: Maintain precision in probability calculations
- **Confidence Intervals**: Use same normal distribution calculations as Python
- **Win Rate Calculation**: Exact replication of `calc_percs` function

### 5. Engine Integration
- **Stockfish.js**: Browser-compatible engine integration
- **Async Handling**: Convert blocking engine calls to async/await
- **Error Recovery**: Handle engine failures without crashing analysis

## Testing Strategy

### Golden Master Tests
```javascript
test('end-to-end: generates exact golden master output', async () => {
    const config = {
        openings: [
            { name: "Ruy Lopez", fen: "...", perspective: "white" },
            { name: "Kings Indian", fen: "...", perspective: "black" }
        ],
        // ... other config
    };

    const bookBuilder = new BookBuilder(config);
    const results = await bookBuilder.processOpening(config);

    // Compare with reference files
    expect(results['Chapter_1_Ruy_Lopez.pgn']).toEqual(GOLDEN_MASTER_RUY_LOPEZ);
    expect(results['Chapter_2_Kings_Indian.pgn']).toEqual(GOLDEN_MASTER_KINGS_INDIAN);
});
```

### Component Integration Tests
```javascript
test('component integration matches Python behavior', async () => {
    // Test each component in isolation and combination
    const position = chessEngine.parsePosition(TEST_FEN);
    const stats = await lichessClient.getPositionStats(TEST_FEN);
    const candidates = await lichessClient.getMoveStats(TEST_FEN);
    const bestMove = await moveSelector.selectBestMove(position, candidates);
    const pgn = await pgnGenerator.generateSingleLine(testLine);

    // Verify each step matches Python precision
    expect(stats.winRate).toBeCloseTo(PYTHON_WIN_RATE, 4);
    expect(bestMove.san).toEqual(PYTHON_BEST_MOVE);
    expect(pgn).toContain(EXPECTED_PGN_CONTENT);
});
```

## Implementation Plan

### Phase 1: Core BookBuilder Class
1. **Constructor**: Initialize all component dependencies
2. **processOpening()**: Main orchestration method
3. **generateChapter()**: Chapter-level processing with state management
4. **analyzeRoot()**: Initial position analysis (Rooter equivalent)
5. **expandLine()**: Iterative line expansion (Leafer equivalent)

### Phase 2: Integration and Testing
1. **Component Integration**: Connect all existing components
2. **State Management**: Implement proper async queue processing
3. **Error Handling**: Add comprehensive error recovery
4. **Golden Master Tests**: Ensure exact output matching

### Phase 3: Optimization and Production
1. **Performance**: Batch API calls and parallel processing
2. **Memory Management**: Optimize large opening analysis
3. **Configuration**: Flexible config validation and defaults
4. **Documentation**: Complete API documentation

This implementation guide provides the foundation for creating a JavaScript BookBuilder.js that maintains exact behavioral parity with the Python implementation while leveraging modern JavaScript patterns and async capabilities.