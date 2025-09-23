# Cross-System Validation Tests

This directory contains comprehensive cross-system validation tests that ensure the JavaScript BookBuilder implementation produces identical results to the Python legacy system.

## Overview

The cross-system validation framework provides:

- **Direct comparison** between Python and JavaScript implementations
- **Real data pipeline testing** using actual Lichess API responses
- **Statistical precision validation** for mathematical calculations
- **Comprehensive reporting** with detailed difference analysis

## Test Architecture

### Core Components

1. **`PythonRunner.js`** - Executes Python BookBuilder system and normalizes output
2. **`CrossSystemValidator.js`** - Compares outputs with tolerance handling
3. **`cross-system-test-data.js`** - Curated test positions and configurations
4. **`cross-system-validation.test.js`** - Main test suite

### Test Execution Flow

```
Input Configuration
        ↓
    ┌─────────┐    ┌─────────────┐
    │ Python  │    │ JavaScript  │
    │ System  │    │ System      │
    └────┬────┘    └──────┬──────┘
         │                │
         └────┬───────────┘
              ↓
      CrossSystemValidator
              ↓
        Comparison Report
```

## Usage

### Basic Cross-System Validation

```bash
# Run all cross-system tests
npm run test:cross-system

# Run with coverage analysis
npm run test:cross-system:coverage

# Run complete validation suite
npm run test:validation
```

### Environment Setup

#### Prerequisites

1. **Python 3.x** installed and accessible via `python3` command
2. **Python dependencies**:
   ```bash
   pip install chess requests numpy scipy
   ```
3. **Legacy Python system** available in `../legacy/` directory

#### Environment Variables

```bash
# Enable real API tests (requires internet connection)
export ENABLE_REAL_API_TESTS=true

# Optional: Custom Python executable
export PYTHON_PATH=/usr/local/bin/python3
```

### Running Specific Tests

```bash
# Test specific opening
ENABLE_REAL_API_TESTS=true npm run test:cross-system -- --testNamePattern="Ruy Lopez"

# Test configuration variations
ENABLE_REAL_API_TESTS=true npm run test:cross-system -- --testNamePattern="configuration variation"

# Test statistical precision
npm run test:cross-system -- --testNamePattern="statistical precision"
```

## Test Categories

### 1. Basic Cross-System Validation
- **Ruy Lopez opening** - Standard test case with rich database coverage
- **King's Indian Defense** - Black perspective validation
- **Sicilian Dragon** - Complex tactical position testing

### 2. Configuration Parameter Validation
- **Strict filtering** - Higher quality thresholds
- **Permissive filtering** - Lower threshold testing
- **Draws as losses** - Alternative win rate calculation
- **Long to short ordering** - Output ordering validation

### 3. Statistical Precision Validation
- **Confidence intervals** - Mathematical precision testing
- **Wilson score intervals** - Statistical accuracy validation
- **Floating-point tolerance** - Numerical comparison handling

### 4. Edge Case Validation
- **Endgame positions** - Minimal database coverage scenarios
- **Error handling** - Consistent failure behavior
- **Invalid inputs** - Graceful error handling

### 5. Performance Comparison
- **Execution time analysis** - JavaScript vs Python performance
- **Memory usage** - Resource consumption comparison
- **API call efficiency** - Network request optimization

## Test Data

### Standard Test Positions

| Position | Description | Complexity | Expected Lines |
|----------|-------------|------------|----------------|
| `ruy_lopez` | Classical Ruy Lopez | Medium | 3-5 |
| `kings_indian` | King's Indian Defense | Medium | 2-4 |
| `sicilian_dragon` | Sicilian Dragon | High | 4-8 |
| `queens_gambit` | Queen's Gambit Declined | Medium | 3-5 |
| `endgame_position` | Late endgame | Low | 0-2 |

### Configuration Variations

- **`strict_filtering`** - Reduced line count, higher quality
- **`permissive_filtering`** - Increased line count, lower thresholds
- **`draws_as_losses`** - Alternative statistical calculation
- **`long_to_short`** - Reverse line ordering
- **`with_engine`** - Engine validation enabled

## Validation Criteria

### Success Criteria

✅ **Identical PGN Structure** - Same event count, move sequences, annotations
✅ **Statistical Precision** - Percentage values within 0.01% tolerance
✅ **Move Selection** - Identical move choices and ordering
✅ **Line Generation** - Same number and content of output lines
✅ **Error Handling** - Consistent failure behavior

### Tolerance Handling

- **Floating-point comparisons**: ±0.01% default tolerance
- **Percentage formatting**: Normalized to 2 decimal places
- **Move number formatting**: Standardized spacing
- **Line ending normalization**: Cross-platform compatibility

## Output Analysis

### Comparison Report Structure

```
# Cross-System Validation Report

## Summary
- Overall Match: ✅ PASS / ❌ FAIL
- Files Compared: N
- Successful Matches: N
- Structural Matches: N

## Execution Times
- Python System: Nms
- JavaScript System: Nms
- Performance Ratio: N.Nx

## Differences Found (if any)
- Type: difference_type
- Details: specific_differences

## File-by-File Analysis
- filename.pgn
  - Match: ✅/❌
  - Structural Match: ✅/❌
  - Statistics: {...}
```

### Debugging Failed Tests

1. **Check Python environment**:
   ```bash
   python3 --version
   python3 -c "import chess, requests, numpy, scipy; print('All packages available')"
   ```

2. **Verify file permissions**:
   ```bash
   ls -la ../legacy/core/BookBuilder.py
   ```

3. **Run individual components**:
   ```javascript
   const { runCrossSystemTest } = require('./tests/cross-system-validation.test.js');
   await runCrossSystemTest('ruy_lopez', 'standard');
   ```

4. **Enable verbose logging**:
   ```bash
   DEBUG=true npm run test:cross-system
   ```

## Known Limitations

- **Engine dependencies**: Engine validation tests require Stockfish installation
- **API rate limits**: Real API tests may hit Lichess rate limits
- **Platform differences**: Floating-point precision may vary across platforms
- **Timeout handling**: Large test cases may require timeout adjustments

## Contributing

### Adding New Test Cases

1. **Add position to test data**:
   ```javascript
   // In cross-system-test-data.js
   new_position: {
       name: 'New_Position',
       fen: 'position_fen',
       pgn: 'move_sequence',
       perspective: 'white/black',
       expectedLines: N
   }
   ```

2. **Create test scenario**:
   ```javascript
   // Add to TEST_SCENARIOS
   {
       name: 'new_position_test',
       position: TEST_POSITIONS.new_position,
       config: STANDARD_TEST_CONFIG,
       expectedBehavior: { shouldSucceed: true, minLines: 1, maxLines: 5 }
   }
   ```

3. **Add specific test**:
   ```javascript
   test('new position validation', async () => {
       // Implementation
   });
   ```

### Improving Validation Logic

- **Enhance comparison algorithms** in `CrossSystemValidator.js`
- **Add new statistical tests** for mathematical precision
- **Improve error handling** for edge cases
- **Optimize performance** for large test suites

## Troubleshooting

### Common Issues

1. **Python not found**: Ensure Python 3 is in PATH
2. **Missing packages**: Install required Python dependencies
3. **Permission errors**: Check file system permissions
4. **Timeout errors**: Increase timeout for complex positions
5. **API limits**: Reduce test frequency or use mock data

### Support

For issues with cross-system validation:

1. Check environment setup requirements
2. Review error messages and validation reports
3. Run individual test components for isolation
4. Consult test documentation and examples