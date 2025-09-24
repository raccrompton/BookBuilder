# Engine Performance Testing

This document describes the engine performance testing framework for benchmarking Stockfish engine timing at different depth levels.

## Overview

The performance testing suite measures engine response times at depths 5, 10, 15, and 20 to establish baselines and detect performance regressions.

## Test Structure

### Main Test: `engine-performance.test.js`

**Key Features:**
- ✅ Depth timing at [5, 10, 15, 20]
- ✅ Multiple position types (opening, middlegame, tactical, endgame)
- ✅ Consistency validation across multiple runs
- ✅ Performance regression detection
- ✅ Detailed console reporting with timing analysis

### Test Configurations

```javascript
const DEPTH_CONFIGS = [5, 10, 15, 20];

const TEST_POSITIONS = {
    starting: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    middlegame: 'r1bq1rk1/pp2nppp/2np1n2/2p1p3/2P1P3/2NP1N2/PP2QPPP/R1B1R1K1 w - - 0 9',
    tactical: 'r2qkb1r/pp2nppp/3p1n2/2pNp3/2B1P3/3P1N2/PPP2PPP/R1BQK2R w KQkq - 1 7',
    endgame: '4k3/8/4K3/8/8/8/8/4R3 w - - 0 1'
};
```

## Running Performance Tests

### Quick Performance Test
```bash
npm run test:performance:quick
```
Runs only the main depth timing test (5/10/15/20 depths).

### Full Performance Suite
```bash
npm run test:performance
```
Runs all performance tests including position comparisons and consistency checks.

### Integration with Main Test Suite
```bash
npm test
# Includes performance tests in full test run
```

## Performance Metrics

### Expected Timing Ranges

| Depth | Expected Range | Validation |
|-------|----------------|------------|
| 5     | 50-500ms      | < 1000ms max |
| 10    | 200-2000ms    | < 5000ms max |
| 15    | 1000-8000ms   | < 15000ms max |
| 20    | 3000-20000ms  | < 40000ms max |

### Performance Analysis Features

- **Timing Trend Analysis**: Validates that timing generally increases with depth
- **Position Comparison**: Compares performance across different chess positions
- **Consistency Validation**: Ensures engine provides consistent results
- **Regression Detection**: Establishes baselines for CI/CD monitoring

## Console Output Example

```
🔥 Initializing Stockfish engine for performance testing...
✅ Engine ready for performance benchmarking

📊 Running depth performance benchmark...
Position: Starting position
Depths: [5, 10, 15, 20]
──────────────────────────────────────────────────
⏱️  Testing depth 5...
   Depth 5: 234ms → e2e4
⏱️  Testing depth 10...
   Depth 10: 891ms → e2e4
⏱️  Testing depth 15...
   Depth 15: 3456ms → e2e4
⏱️  Testing depth 20...
   Depth 20: 12789ms → e2e4
──────────────────────────────────────────────────
📈 Performance Analysis:
   Timing trend: Increasing with depth ✅
   Fastest: Depth 5 (234ms)
   Slowest: Depth 20 (12789ms)
   Total benchmark time: 17370ms
```

## Baseline Establishment

The test suite includes baseline establishment for CI/CD integration:

```
🏆 PERFORMANCE_BASELINE_DEPTH_12: 2341ms
```

This output can be captured by CI systems for performance regression monitoring.

## Test Timeouts

- **Main depth test**: 120 seconds (2 minutes)
- **Position comparison**: 90 seconds
- **Consistency test**: 60 seconds
- **Baseline test**: 45 seconds

## Integration Notes

- Compatible with existing Jest test framework
- Uses same StockfishEngine class as production code
- Includes proper setup/teardown for engine lifecycle
- Provides detailed logging for performance analysis
- Can be run independently or as part of full test suite

## CI/CD Integration

For continuous integration, use the quick performance test:

```yaml
# Example GitHub Actions step
- name: Run Performance Tests
  run: npm run test:performance:quick
  timeout-minutes: 5
```

The full performance suite should be run periodically (e.g., nightly) due to longer execution times.