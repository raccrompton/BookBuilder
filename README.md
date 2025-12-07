# BookBuilder

An automatic practical chess opening repertoire builder - running entirely in your browser.

## Quick Start

```bash
cd client
npm install
npm run dev
# Open http://localhost:3000/app.html
```

Or open `client/app.html` directly in a modern browser.

## Features

- **Lichess Database** - Query millions of games for opening statistics
- **Stockfish Analysis** - Engine-validated move selection via WebAssembly
- **Smart Move Selection** - Statistical algorithms to find practical moves
- **PGN Export** - Download files for Chessable, ChessTempo, etc.

## Configuration

| Setting | Description |
|---------|-------------|
| Rating Range | Filter games by player rating (1000-2800+) |
| Time Controls | Blitz, Rapid, Classical, Correspondence |
| Analysis Depth | How many moves deep to analyze |
| Engine Depth | Stockfish analysis depth (10-40) |
| Soundness Limit | Maximum centipawn loss allowed |

## Development

```bash
npm test              # Run 349 tests across 21 suites
npm run test:coverage # With coverage report
npm run validate      # Lint + all tests
```

## Architecture

```
client/
├── app.html                    # Main application
├── src/
│   ├── BookBuilder.js          # Core orchestration
│   ├── algorithm/
│   │   └── MoveSelector.js     # Move selection with statistics
│   ├── api/
│   │   └── LichessClient.js    # Lichess API integration
│   ├── chess/
│   │   └── ChessEngine.js      # Position validation (chess.js)
│   ├── engine/
│   │   ├── StockfishEngine.js  # Browser Stockfish (WebAssembly)
│   │   └── NodeStockfishEngine.js  # Node.js Stockfish (testing)
│   ├── pgn/
│   │   ├── PgnGenerator.js     # PGN output formatting
│   │   └── PgnTreeMerger.js    # Variation tree merging
│   ├── stats/
│   │   └── Statistics.js       # Win rate calculations
│   ├── ui/
│   │   ├── FormController.js   # Form management
│   │   ├── FileGenerator.js    # Download handling
│   │   ├── ProgressTracker.js  # Progress display
│   │   └── ErrorHandler.js     # Error display
│   └── utils/
│       ├── Logger.js           # Configurable logging
│       └── PgnProcessor.js     # PGN input parsing
└── tests/                      # Jest test suite
```

## Browser Support

Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

## Learn More

https://www.alexcrompton.com/blog/automatically-creating-a-practical-opening-repertoire-or-why-your-chess-openings-suck

## Contact

Bugs or requests: alex@alexcrompton.com
