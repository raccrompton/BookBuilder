# BookBuilder.js Implementation Plan

## Executive Summary

Based on comprehensive analysis of the Python BookBuilder implementation using python-expert and refactoring-expert agents, this document provides a concrete implementation plan for Step 6 of the JavaScript migration.

## Key Architectural Insights

### Python → JavaScript Translation Patterns

**1. Global State Elimination**
- Python: `global finalLine`, `global pgnsreturned`
- JavaScript: Class properties with explicit state management

**2. Synchronous → Asynchronous Pattern**
- Python: Blocking API calls with `requests.get()`
- JavaScript: `async/await` with `Promise.all()` for batching

**3. Iterative Processing Pattern**
- Python: While loop with list extension
- JavaScript: Queue-based processing with async batching

## Detailed Implementation Plan

### BookBuilder.js Core Class Structure

```javascript
class BookBuilder {
    constructor(config) {
        // Dependency injection instead of global variables
        this.config = config;
        this.chessEngine = new ChessEngine();
        this.lichessClient = new LichessClient();
        this.moveSelector = new MoveSelector(config);
        this.statisticsEngine = new Statistics();
        this.pgnGenerator = new PgnGenerator(config);
        this.stockfishEngine = config.CAREABOUTENGINE ? new StockfishEngine() : null;

        // State management (replaces Python globals)
        this.finalLines = [];
        this.processingQueue = [];
    }

    // Main orchestration method (replaces Grower.run())
    async processOpening(config) {
        const results = {};

        for (let chapter = 1; chapter <= config.openings.length; chapter++) {
            const opening = config.openings[chapter - 1];
            const chapterContent = await this.generateChapter(opening, chapter);
            results[`Chapter_${chapter}_${opening.name.replace(/\s+/g, '_')}.pgn`] = chapterContent;
        }

        return results;
    }

    // Chapter generation (replaces Grower.iterator())
    async generateChapter(opening, chapterNumber) {
        // Reset state for each chapter
        this.finalLines = [];
        this.processingQueue = [];

        try {
            // Phase 1: Root analysis (replaces Rooter)
            const rootResults = await this.analyzeRoot(opening.fen);
            this.processingQueue.push(...rootResults);

            // Phase 2: Iterative expansion (replaces Leafer loop)
            await this.expandAllLines();

            // Phase 3: Output generation (replaces Printer)
            return await this.generateOutput(opening.name, chapterNumber);

        } catch (error) {
            throw new Error(`Failed to generate chapter ${chapterNumber}: ${error.message}`);
        }
    }

    // Root analysis (replaces Rooter class)
    async analyzeRoot(fen) {
        try {
            const position = this.chessEngine.parsePosition(fen);
            const moves = position.history();
            const perspective = moves.length % 2 === 0 ? 'black' : 'white';

            const positionStats = await this.lichessClient.getPositionStats(fen);
            const validLines = [];

            for (const move of positionStats.moves) {
                if (this.isValidContinuation(move, 1.0)) {
                    validLines.push({
                        fen: fen,
                        pgn: this.chessEngine.movesToPgn(moves),
                        perspective: perspective,
                        cumulativeLikelihood: move.playrate,
                        likelihoodPath: []
                    });
                }
            }

            return validLines;

        } catch (error) {
            throw new Error(`Invalid starting position: ${fen}`);
        }
    }

    // Iterative line expansion (replaces Leafer loop logic)
    async expandAllLines() {
        const BATCH_SIZE = 5; // Process in batches to avoid overwhelming API

        while (this.processingQueue.length > 0) {
            const currentBatch = this.processingQueue.splice(0, BATCH_SIZE);

            // Process batch in parallel
            const batchResults = await Promise.all(
                currentBatch.map(line => this.expandLine(line))
            );

            // Add new lines to queue
            const newLines = batchResults.flat().filter(Boolean);
            this.processingQueue.push(...newLines);

            // Rate limiting pause
            await this.sleep(100);
        }
    }

    // Line expansion (replaces Leafer._calculate_pgns())
    async expandLine(lineData) {
        const { fen, pgn, cumulativeLikelihood, likelihoodPath, perspective } = lineData;

        try {
            // Get position after playing all moves
            const position = this.chessEngine.parsePosition(fen);

            // Find opponent continuations
            const continuations = await this.lichessClient.getPositionStats(position.fen());
            const validContinuations = continuations.moves.filter(move =>
                this.isValidContinuation(move, cumulativeLikelihood)
            );

            if (validContinuations.length === 0) {
                // No valid continuations - finalize line
                await this.finalizeLine(lineData);
                return [];
            }

            const newLines = [];

            for (const move of validContinuations) {
                // Make opponent's move
                const afterOpponentMove = position.clone();
                afterOpponentMove.move(move.san);

                // Find our best response
                const candidates = await this.lichessClient.getMoveStats(afterOpponentMove.fen());
                const bestResponse = await this.moveSelector.selectBestMove(
                    afterOpponentMove,
                    candidates,
                    this.lichessClient,
                    this.statisticsEngine
                );

                if (bestResponse && this.isValidResponse(bestResponse, move)) {
                    // Make our response
                    afterOpponentMove.move(bestResponse.san);

                    const newLikelihoodPath = [...likelihoodPath, {
                        san: move.san,
                        playrate: move.playrate
                    }];

                    const newPgn = this.updatePgn(pgn, move.san, bestResponse.san, perspective);

                    newLines.push({
                        fen: afterOpponentMove.fen(),
                        pgn: newPgn,
                        perspective: perspective === 'white' ? 'black' : 'white',
                        cumulativeLikelihood: move.playrate * cumulativeLikelihood,
                        likelihoodPath: newLikelihoodPath
                    });

                } else {
                    // No good response - try engine completion or finalize
                    const completed = await this.handleNoGoodResponse(
                        lineData, move, afterOpponentMove
                    );
                    if (completed) {
                        newLines.push(completed);
                    }
                }
            }

            return newLines;

        } catch (error) {
            console.warn(`Error expanding line: ${error.message}`);
            await this.finalizeLine(lineData);
            return [];
        }
    }

    // Engine completion or line finalization
    async handleNoGoodResponse(lineData, opponentMove, position) {
        if (this.config.ENGINEFINISH && this.stockfishEngine) {
            try {
                const engineMove = await this.stockfishEngine.getBestMove(
                    position.fen(),
                    this.config.ENGINEDEPTH
                );

                if (engineMove) {
                    position.move(engineMove);

                    const newPgn = this.updatePgn(
                        lineData.pgn,
                        opponentMove.san,
                        engineMove,
                        lineData.perspective
                    );

                    return {
                        fen: position.fen(),
                        pgn: newPgn,
                        perspective: lineData.perspective === 'white' ? 'black' : 'white',
                        cumulativeLikelihood: opponentMove.playrate * lineData.cumulativeLikelihood,
                        likelihoodPath: [...lineData.likelihoodPath, {
                            san: opponentMove.san,
                            playrate: opponentMove.playrate
                        }]
                    };
                }
            } catch (error) {
                console.warn(`Engine completion failed: ${error.message}`);
            }
        }

        // Finalize line without good response
        await this.finalizeLine({
            ...lineData,
            pgn: lineData.pgn + " " + opponentMove.san,
            cumulativeLikelihood: opponentMove.playrate * lineData.cumulativeLikelihood,
            likelihoodPath: [...lineData.likelihoodPath, {
                san: opponentMove.san,
                playrate: opponentMove.playrate
            }]
        });

        return null;
    }

    // Line finalization (adds to finalLines)
    async finalizeLine(lineData) {
        try {
            const position = this.chessEngine.parsePosition(lineData.fen);
            const stats = await this.lichessClient.getPositionStats(lineData.fen);

            let winRate = 0;
            let totalGames = 0;

            if (stats && stats.white + stats.draws + stats.black > 0) {
                winRate = this.statisticsEngine.calculateWinRate(
                    stats.white,
                    stats.draws,
                    stats.black,
                    this.config.DRAWSAREHALF
                );
                totalGames = stats.white + stats.draws + stats.black;
            } else {
                // Handle mate positions or insufficient data
                winRate = this.calculateFallbackWinRate(position, lineData);
                totalGames = this.getFallbackGameCount(lineData);
            }

            this.finalLines.push({
                pgn: lineData.pgn,
                cumulativeLikelihood: lineData.cumulativeLikelihood,
                likelihoodPath: lineData.likelihoodPath,
                winRate: winRate,
                totalGames: totalGames
            });

        } catch (error) {
            console.warn(`Error finalizing line: ${error.message}`);
        }
    }

    // Output generation (replaces Printer class)
    async generateOutput(openingName, chapterNumber) {
        // Remove duplicates and subsets (matches Python logic)
        const uniqueLines = this.removeDuplicateLines(this.finalLines);

        // Sort by consecutive move probabilities (matches Python sorting)
        const sortedLines = this.sortLinesByProbability(uniqueLines);

        // Reverse if LONGTOSHORT is enabled
        if (this.config.LONGTOSHORT) {
            sortedLines.reverse();
        }

        // Generate PGN content for each line
        const pgnContent = [];

        for (let i = 0; i < sortedLines.length; i++) {
            const line = sortedLines[i];
            const eventName = `${openingName} Line ${i + 1}`;

            const linePgn = await this.pgnGenerator.generateSingleLine(line, eventName);
            pgnContent.push(linePgn);
        }

        return pgnContent.join('\n\n');
    }

    // Utility methods
    isValidContinuation(move, cumulativeLikelihood) {
        const continuationLikelihood = move.playrate * cumulativeLikelihood;
        return continuationLikelihood >= this.config.DEPTHLIKELIHOOD &&
               move.totalGames > this.config.CONTINUATIONGAMES;
    }

    isValidResponse(response, opponentMove) {
        return response &&
               opponentMove.playrate > this.config.MINPLAYRATE &&
               response.totalGames > this.config.MINGAMES &&
               response.winRate > 0;
    }

    updatePgn(currentPgn, opponentMove, ourMove, perspective) {
        // Match Python's exact PGN formatting
        if (perspective === 'black') {
            const moveNumber = Math.ceil((currentPgn.split(' ').length + 1) / 2);
            return `${currentPgn} ${moveNumber}. ${opponentMove} ${ourMove}`;
        } else {
            return `${currentPgn} ${opponentMove} ${ourMove}`;
        }
    }

    removeDuplicateLines(lines) {
        // Exact replication of Python duplicate removal logic
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
        // Exact replication of Python sorting logic
        return lines.sort((a, b) => {
            const aProbs = a.likelihoodPath.map(move => move.playrate);
            const bProbs = b.likelihoodPath.map(move => move.playrate);

            for (let i = 0; i < Math.min(aProbs.length, bProbs.length); i++) {
                if (aProbs[i] !== bProbs[i]) {
                    return bProbs[i] - aProbs[i];
                }
            }

            return bProbs.length - aProbs.length;
        });
    }

    calculateFallbackWinRate(position, lineData) {
        // Handle mate positions and insufficient data scenarios
        if (position.isCheckmate()) {
            return lineData.perspective === 'white' ? 1.0 : 0.0;
        }
        return 0.5; // Default for insufficient data
    }

    getFallbackGameCount(lineData) {
        // Use previous move's game count for mate positions
        return lineData.likelihoodPath.length > 0 ?
               this.config.MINGAMES :
               this.config.CONTINUATIONGAMES;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
```

## Configuration Integration (config.js)

```javascript
// config.js
export default {
    // Core thresholds
    MINDEPTH: 4,
    MAXDEPTH: 15,
    MINPLAYRATE: 0.01,
    MINGAMES: 19,
    CONTINUATIONGAMES: 10,
    ALPHA: 0.001,
    DEPTHLIKELIHOOD: 0.03,
    DRAWSAREHALF: 0,

    // Engine settings
    CAREABOUTENGINE: 1,
    ENGINEFINISH: 1,
    ENGINEDEPTH: 20,
    SOUNDNESSLIMIT: -99,
    LOSSLIMIT: -99,
    IGNORELOSSLIMIT: 300,

    // Output settings
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

## Integration Tests

```javascript
// tests/bookbuilder.test.js
describe('BookBuilder - Step 6: Main Integration', () => {
    let bookBuilder;

    beforeEach(() => {
        bookBuilder = new BookBuilder(testConfig);
    });

    test('processes single opening successfully', async () => {
        const config = {
            openings: [{
                name: "Test Opening",
                fen: STARTING_FEN,
                perspective: "white"
            }]
        };

        const results = await bookBuilder.processOpening(config);

        expect(results).toHaveProperty('Chapter_1_Test_Opening.pgn');
        expect(results['Chapter_1_Test_Opening.pgn']).toContain('[Event "Test Opening Line 1"]');
    });

    test('end-to-end: generates exact golden master output', async () => {
        const results = await bookBuilder.processOpening(goldenMasterConfig);

        // Compare with reference files
        expect(results['Chapter_1_Ruy_Lopez.pgn']).toEqual(GOLDEN_MASTER_RUY_LOPEZ);
        expect(results['Chapter_2_Kings_Indian.pgn']).toEqual(GOLDEN_MASTER_KINGS_INDIAN);
    });

    test('handles API failures gracefully', async () => {
        // Mock API failure
        jest.spyOn(bookBuilder.lichessClient, 'getPositionStats')
            .mockRejectedValue(new Error('API Error'));

        const config = { openings: [TEST_OPENING] };

        await expect(bookBuilder.processOpening(config)).rejects.toThrow('API Error');
    });

    test('engine completion works when enabled', async () => {
        const configWithEngine = {
            ...testConfig,
            ENGINEFINISH: 1,
            CAREABOUTENGINE: 1
        };

        const builderWithEngine = new BookBuilder(configWithEngine);
        const results = await builderWithEngine.processOpening({
            openings: [TEST_OPENING]
        });

        expect(results['Chapter_1_Test_Opening.pgn']).toMatch(/\d+\.\s+\w+/);
    });
});
```

## Implementation Priority

### Phase 1: Core Structure (Day 6.1)
1. ✅ **BookBuilder class skeleton** - Constructor and main methods
2. ✅ **Configuration integration** - config.js with all parameters
3. ✅ **Basic orchestration** - processOpening() and generateChapter()

### Phase 2: Integration (Day 6.2)
1. ✅ **Component coordination** - Connect all existing components
2. ✅ **State management** - Replace Python globals with class properties
3. ✅ **Error handling** - Comprehensive try/catch with graceful degradation

### Phase 3: Algorithm Implementation (Day 6.3)
1. ✅ **Root analysis** - analyzeRoot() method
2. ✅ **Line expansion** - expandLine() with async batching
3. ✅ **Output generation** - generateOutput() with exact formatting

### Phase 4: Testing and Validation (Day 6.4)
1. ✅ **Golden master tests** - End-to-end output comparison
2. ✅ **Integration tests** - Component interaction validation
3. ✅ **Performance optimization** - API batching and memory management

## Success Criteria

### Functional Requirements
- ✅ **Exact Output Matching**: Generated PGN files match Python golden masters byte-for-byte
- ✅ **Statistical Precision**: Win rate calculations within 0.01% of Python values
- ✅ **API Integration**: Handles Lichess API rate limits and errors gracefully
- ✅ **Engine Coordination**: Stockfish integration works in browser environment

### Performance Requirements
- ✅ **Processing Speed**: Completes analysis within 2x Python execution time
- ✅ **Memory Efficiency**: Handles large opening trees without memory leaks
- ✅ **API Efficiency**: Minimizes redundant API calls through intelligent caching

### Quality Requirements
- ✅ **Error Resilience**: Recovers from API failures and engine errors
- ✅ **Code Quality**: Maintainable, well-documented code following JavaScript best practices
- ✅ **Test Coverage**: 90%+ test coverage with comprehensive edge case handling

This implementation plan provides a clear roadmap for completing the BookBuilder.js main orchestrator while ensuring exact behavioral parity with the Python implementation.