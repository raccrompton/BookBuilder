# BookBuilder

An automatic practical chess opening repertoire builder - now running entirely in your browser.

## Quick Start

```bash
cd client
npm install
npm run dev
# Open http://localhost:3000/app.html
```

Or just open `client/app.html` directly in your browser.

## Features

- **Lichess Database Integration** - Query millions of games for opening statistics
- **Stockfish Analysis** - Engine-validated move selection via WebAssembly
- **Smart Move Selection** - Statistical algorithms to find practical moves
- **PGN Export** - Download repertoire files for Chessable, ChessTempo, etc.

## Configuration

### Opening Books
- Define your repertoire starting positions
- Support for multiple openings per file
- Priority-based line ordering

### Database Settings
- Rating range filtering (1000-2800+)
- Time control selection (Blitz, Rapid, Classical)
- Analysis depth configuration

### Engine Settings
- Stockfish depth (10-40)
- Soundness limits (centipawn tolerance)
- Engine finishing for incomplete lines

## Development

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Lint and validate
npm run validate
```

## Architecture

```
client/
├── app.html              # Main application
├── src/
│   ├── BookBuilder.js    # Core orchestration
│   ├── api/              # Lichess API client
│   ├── engine/           # Stockfish integration
│   ├── pgn/              # PGN generation
│   ├── ui/               # Form and progress UI
│   └── utils/            # Logging, utilities
└── tests/                # Jest test suite
```

## Browser Support

- Chrome 90+ (recommended)
- Firefox 88+
- Safari 14+
- Edge 90+

## Acknowledgements

- [Lichess.org](https://lichess.org) for the chess database API
- [Stockfish](https://stockfishchess.org) for the chess engine
- [chess.js](https://github.com/jhlywa/chess.js) for move validation

## Learn More

https://www.alexcrompton.com/blog/automatically-creating-a-practical-opening-repertoire-or-why-your-chess-openings-suck

## Contact

Bugs or requests: alex@alexcrompton.com
