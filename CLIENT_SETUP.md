# BookBuilder Client - Local Development Setup

## Quick Start

1. **Navigate to client directory**
   ```bash
   cd client
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Open in browser**
   - Navigate to: http://localhost:3000/app.html
   - The application will be running on port 3000

## Manual Testing Guide

### Basic Functionality Test

1. **PGN Input Testing**
   - Paste a sample PGN game in the text area
   - Use the provided sample or any valid PGN format
   - Check that the PGN preview appears below the input

2. **Configuration Testing**
   - Adjust rating ranges (1600-2500 default)
   - Modify move analysis depth (15 moves default)
   - Test different time controls (Blitz, Rapid, Classical)
   - Configure move selection thresholds

3. **Engine Settings Testing**
   - Enable/disable Stockfish analysis
   - Adjust engine depth (20 default)
   - Test different finishing preferences
   - Modify soundness limits

4. **Form Submission**
   - Click "Generate Repertoire" button
   - Monitor progress indicator
   - Check for error/success messages

### Sample PGN for Testing

```pgn
[Event "Rated Blitz game"]
[Site "https://lichess.org/"]
[Date "2023.12.01"]
[White "Player1"]
[Black "Player2"]
[Result "1-0"]
[WhiteElo "1850"]
[BlackElo "1820"]
[Opening "Sicilian Defense: Accelerated Dragon"]

1. e4 c5 2. Nf3 g6 3. d4 cxd4 4. Nxd4 Bg7 5. Be3 Nc6 6. c4 f5
7. Nc3 Nf6 8. exf5 gxf5 9. Be2 O-O 10. O-O e5 *
```

## Available NPM Scripts

```bash
# Development
npm run dev              # Start development server (port 3000)
npm run test:manual      # Start dev server with manual testing message

# Testing
npm run test             # Run unit tests
npm run test:watch       # Run tests in watch mode
npm run test:integration # Run integration tests
npm run test:all         # Run all test suites
npm run test:performance # Run performance tests

# Build & Deploy
npm run build            # Build for production
npm run serve            # Serve production build (port 8080)

# Code Quality
npm run lint             # Run ESLint
npm run format           # Format code with Prettier
npm run validate         # Run lint + all tests
```

## Development Environment

### Required Dependencies
- Node.js (v14+ recommended)
- Modern browser with ES6 module support
- Internet connection (for Lichess API and Stockfish CDN)

### Browser Compatibility
- Chrome/Chromium (recommended)
- Firefox (modern versions)
- Safari (modern versions)
- Edge (Chromium-based)

### Network Requirements
- Access to `lichess.org` and `explorer.lichess.ovh` for database queries
- Access to `cdn.jsdelivr.net` for Stockfish engine loading

## Troubleshooting

### Common Issues

1. **Module Loading Errors**
   - Ensure you're accessing via `app.html`, not `index.html`
   - Check browser console for specific import errors
   - Verify all dependencies are installed

2. **CORS Issues**
   - Use the development server (`npm run dev`)
   - Don't open `app.html` directly in browser
   - Check Content Security Policy in browser console

3. **Stockfish Engine Fails to Load**
   - Check internet connection
   - Verify CDN access to jsdelivr.net
   - Try disabling engine analysis temporarily

4. **PGN Processing Errors**
   - Ensure PGN format is valid
   - Check for special characters or encoding issues
   - Try with the provided sample PGN

### Debug Mode

Enable debug logging by opening browser console before starting the application. The app logs initialization steps and errors.

### Performance Notes

- Engine analysis can be CPU intensive
- Reduce engine depth for faster testing
- Lichess API calls may have rate limits
- Progress tracking provides real-time feedback

## Architecture Overview

The client-side application is built with:
- **Vanilla JavaScript** (ES6 modules)
- **No build tools** (direct browser execution)
- **Modular architecture** with service separation
- **Progressive web app** capabilities

### Key Components
- `FormController.js` - Form validation and submission
- `BookBuilder.js` - Core repertoire generation logic
- `StockfishEngine.js` - Chess engine integration
- `LichessClient.js` - Database API client
- `PgnProcessor.js` - PGN parsing and validation

### File Structure
```
client/
├── app.html              # Main application HTML
├── src/                  # Source code
│   ├── ui/              # User interface components
│   ├── api/             # External API clients
│   ├── chess/           # Chess logic and validation
│   ├── engine/          # Stockfish engine interface
│   └── utils/           # Utility functions
├── tests/               # Test suites
└── package.json         # Dependencies and scripts
```

## Next Steps

After successful local setup:
1. Test core functionality with sample data
2. Experiment with different configuration parameters
3. Run the test suite to verify system health
4. Explore the codebase structure for modifications
5. Consider production deployment requirements