# BookBuilder Client

A modern, client-side chess opening repertoire generator built with vanilla JavaScript. Features Lichess API integration, Stockfish engine analysis, and PGN file generation.

## Quick Start

### Option 1: Direct Browser
Open `app.html` directly in your browser - no build step required.

### Option 2: Development Server
```bash
npm install
npm run dev
# Open http://localhost:3000/app.html
```

## Features

- Modern responsive configuration form with 15+ settings
- Lichess API integration for opening statistics
- Stockfish WebAssembly for engine analysis
- Client-side PGN generation and download
- Real-time progress tracking
- Comprehensive error handling

## Configuration Options

### Lichess Database
- **Variants**: Standard, Chess960, Antichess
- **Time Controls**: Blitz, Rapid, Classical, Correspondence
- **Rating Ranges**: 1000-2800+ (configurable)
- **Analysis Depth**: 5-50 moves per line

### Move Selection
- **Depth Likelihood**: 0.001-0.5 (minimum move probability)
- **Statistical Alpha**: 0.01-0.2 (confidence intervals)
- **Minimum Play Rate**: 0.001-0.1 (percentage of games)
- **Game Thresholds**: 1-100 (minimum games required)

### Engine Settings
- **Enable/Disable**: Toggle Stockfish analysis
- **Depth**: 10-40 (higher = more accurate, slower)
- **Soundness Limit**: 10-200 centipawns tolerance

## Architecture

```
src/
├── BookBuilder.js              # Core orchestration (BFS expansion)
├── algorithm/
│   └── MoveSelector.js         # Statistical move selection
├── api/
│   └── LichessClient.js        # Lichess API with retry/rate limiting
├── chess/
│   └── ChessEngine.js          # chess.js wrapper for validation
├── config/
│   ├── DeterministicMode.js    # Test mode utilities
│   └── sample-openings.js      # Example opening configurations
├── engine/
│   ├── StockfishEngine.js      # Browser Stockfish (WebAssembly)
│   └── NodeStockfishEngine.js  # Node.js Stockfish (for tests)
├── pgn/
│   ├── PgnGenerator.js         # PGN output with annotations
│   └── PgnTreeMerger.js        # Variation tree merging (chessops)
├── stats/
│   └── Statistics.js           # Win rate & confidence calculations
├── ui/
│   ├── FormController.js       # Form state and validation
│   ├── FileGenerator.js        # PGN download handling
│   ├── ProgressTracker.js      # Visual progress display
│   └── ErrorHandler.js         # Error display management
└── utils/
    ├── Logger.js               # Configurable logging system
    └── PgnProcessor.js         # PGN input parsing
```

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
npm run test:integration  # Integration tests only
```

**Test Status**: 21 suites, 349 tests passing

## NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (port 3000) |
| `npm test` | Run Jest tests |
| `npm run build` | Build for production |
| `npm run serve` | Serve production build |
| `npm run validate` | Lint + all tests |

## Deployment

### GitHub Pages
Push to `main` branch - GitHub Actions deploys automatically.

### Manual
```bash
npm run build
# Deploy dist/ to any static host
```

## Troubleshooting

**Engine not loading**
- Check browser supports Web Workers
- Check console for errors
- Try disabling engine temporarily

**Lichess API timeout**
- Check internet connection
- Reduce analysis depth
- Check Lichess.org status

**No PGN generated**
- Verify opening configuration format
- Check at least one time control selected
- Review error messages

### Debug Mode
```javascript
localStorage.setItem('bookbuilder-debug', 'true');
```

## Browser Support

- Chrome 90+ (recommended)
- Firefox 88+
- Safari 14+
- Edge 90+

**Requirements**: ES6 modules, Web Workers, File APIs

## Dependencies

- **chess.js** - Move validation and PGN parsing
- **chessops** - PGN tree operations
- **stockfish** - Chess engine (WebAssembly)

## License

MIT License
