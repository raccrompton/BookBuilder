# Real Browser Engine Performance Testing

This directory contains tests that run **actual Stockfish WebAssembly** in a real browser environment to measure genuine engine performance.

## Overview

Unlike the mock tests in the main test suite, these tests:

- ✅ **Use real Stockfish WebAssembly** (sf171-79.js + sf171-79.wasm)
- ✅ **Run in actual browser environment** (headless Chrome via Playwright)
- ✅ **Measure real engine computation time** at depths [5, 10, 15, 20]
- ✅ **Validate against 60-second time limits** for each depth
- ✅ **Integrate with Jest test framework** for CI/CD compatibility

## Files

### `engine-browser-performance.test.js`
Main Playwright test suite that:
- Launches headless Chrome browser
- Serves test page via HTTP server
- Runs real engine performance tests
- Validates timing limits and functionality

### `stockfish-test-page.html`
Browser test page that:
- Loads actual Stockfish WebAssembly
- Provides interactive performance testing UI
- Exposes testing functions for Playwright automation
- Displays real-time performance results

### `jest.browser.config.js`
Separate Jest configuration for browser tests:
- Node environment (not jsdom)
- Extended timeouts for engine operations
- No mock setup files
- Isolated from main test suite

## Usage

### Quick Performance Test
```bash
npm run test:performance:real
```
Runs only the main engine performance validation test.

### Full Browser Test Suite
```bash
npm run test:performance:browser
```
Runs all browser-based tests including initialization and page validation.

### Manual Browser Testing
```bash
npm run dev
# Navigate to: http://localhost:3000/tests/browser/stockfish-test-page.html
```

## Performance Expectations

| Depth | Expected Range | Limit |
|-------|----------------|-------|
| 5     | 100-2000ms    | <60s  |
| 10    | 500-8000ms    | <60s  |
| 15    | 2000-25000ms  | <60s  |
| 20    | 5000-50000ms  | <60s  |

**Note**: Actual timing depends on:
- Hardware capabilities
- WebAssembly threading support
- Browser optimization level
- System resource availability

## Test Output Example

```
🚀 Setting up browser-based engine performance testing...
Test server running at http://localhost:3001
✅ Browser and test server ready
🔥 Starting real engine performance test...
⏱️ Running performance tests...
📊 Performance test completed
──────────────────────────────────────────────────
   Depth 5: 234ms → e2e4 ✅
   Depth 10: 891ms → e2e4 ✅
   Depth 15: 3456ms → e2e4 ✅
   Depth 20: 12789ms → e2e4 ✅
──────────────────────────────────────────────────
📈 Total test time: 17370ms
🎯 All depths completed: PASSED
🏆 REAL ENGINE PERFORMANCE SUMMARY:
   DEPTH_5_TIMING: 234ms
   DEPTH_10_TIMING: 891ms
   DEPTH_15_TIMING: 3456ms
   DEPTH_20_TIMING: 12789ms
```

## Technical Details

### WebAssembly Loading
The test page uses ES6 modules to load Stockfish:
```javascript
import('../../src/vendor/stockfish-web/sf171-79.js').then(module => {
    window.Sf17179Web = module.default || module.Sf17179Web;
    window.dispatchEvent(new Event('stockfish-loaded'));
});
```

### UCI Protocol Communication
Direct UCI command communication with real engine:
```javascript
stockfishEngine.uci('position fen [position]');
stockfishEngine.uci('go depth [depth]');
// Listens for 'bestmove' response with timing measurement
```

### Browser Configuration
Playwright launches Chrome with WebAssembly optimizations:
```javascript
args: [
    '--enable-features=SharedArrayBuffer',
    '--disable-web-security',
    '--enable-experimental-web-platform-features'
]
```

## Troubleshooting

### Common Issues

**Module Loading Errors**
If you see "Cannot use 'import.meta' outside a module":
- Ensure the test server is serving files with correct MIME types
- Check that sf171-79.js exists in `/src/vendor/stockfish-web/`

**Engine Initialization Timeout**
If engine fails to initialize within 45 seconds:
- Check browser console for WebAssembly loading errors
- Verify Stockfish files are accessible via HTTP server
- Ensure browser supports SharedArrayBuffer

**Performance Test Failures**
If tests exceed 60-second limits:
- Check system resource availability
- Verify hardware meets WebAssembly performance requirements
- Consider increasing timeout limits for slower systems

### Debug Mode

To see the browser in action (non-headless):
```javascript
// In engine-browser-performance.test.js
browser = await chromium.launch({
    headless: false, // Set to false for debugging
    // ...
});
```

## Integration with CI/CD

For automated testing environments:

```yaml
# Example GitHub Actions step
- name: Install Playwright
  run: npx playwright install chromium

- name: Run Real Engine Performance Tests
  run: npm run test:performance:real
  timeout-minutes: 10
```

The tests are designed to be reliable in headless environments while providing meaningful performance validation of the actual engine implementation your users will experience.