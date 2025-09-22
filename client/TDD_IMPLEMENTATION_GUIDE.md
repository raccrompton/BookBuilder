# TDD Implementation Guide for BookBuilder JavaScript Migration

## 🎯 Golden Master TDD Strategy

This guide provides a step-by-step approach to implementing the JavaScript BookBuilder using Test-Driven Development with golden master validation.

## 📊 Current Status

✅ **Phase 1: Golden Master Extraction - COMPLETE**
- ✅ Python reference data extracted for Ruy Lopez (White perspective)
- ✅ Python reference data extracted for King's Indian Defense (Black perspective)
- ✅ Test infrastructure set up with Jest and custom matchers
- ✅ Golden master files copied to `client/tests/golden-master/`

🔄 **Phase 2: TDD Implementation - NEXT**

## 🧪 Golden Master Files

### Generated Reference Data
```
client/tests/golden-master/
├── Chapter_1_Ruy_Lopez.pgn      # 635 bytes, 3 lines, White perspective
├── Chapter_2_Kings_Indian.pgn   # 228 bytes, 1 line, Black perspective
└── test_summary.json            # Test metadata and validation points
```

### Key Validation Points
- **PGN format correctness**: Event headers, move notation, annotations
- **Statistical precision**: Win rates, play rates, cumulative probabilities
- **Perspective handling**: White vs Black move counting
- **Line ordering**: Short to long line sorting
- **Annotation format**: Move playrates and statistical summaries

## 🚀 TDD Implementation Roadmap

### Step 1: Chess Foundation (Days 1-2)
**Goal**: Basic chess position handling and move validation

```bash
# Create failing tests
npm test -- --testNamePattern="chess position"

# Expected failures:
# ❌ chess position parsing
# ❌ move validation
# ❌ PGN parsing
```

**Implementation Tasks**:
1. Install chess.js: `npm install chess.js`
2. Create `src/chess/ChessEngine.js`
3. Implement position parsing and move validation
4. Make tests pass

**Test Coverage**:
- Parse starting positions for both openings
- Validate move sequences
- Handle illegal moves gracefully

### Step 2: Lichess API Client (Days 2-3)
**Goal**: API integration with proper error handling

```bash
# Create failing tests
npm test -- --testNamePattern="lichess api"

# Expected failures:
# ❌ API request formatting
# ❌ Response parsing
# ❌ Error handling
```

**Implementation Tasks**:
1. Create `src/api/LichessClient.js`
2. Implement position lookup and move statistics
3. Add retry logic and error handling
4. Mock API responses for testing

**Test Coverage**:
- API request formatting for chess positions
- Response parsing and validation
- Network error handling and retries

### Step 3: Statistical Calculations (Days 3-4)
**Goal**: Mathematical functions matching Python precision

```bash
# Create failing tests
npm test -- --testNamePattern="statistics"

# Expected failures:
# ❌ win rate calculations
# ❌ cumulative probability
# ❌ confidence intervals
```

**Implementation Tasks**:
1. Create `src/stats/Statistics.js`
2. Implement win rate calculations (with/without draws)
3. Implement cumulative probability calculations
4. Add confidence interval calculations

**Test Coverage**:
- Win rate calculations with `DRAWSAREHALF=0` and `DRAWSAREHALF=1`
- Cumulative probability calculations
- Statistical precision (within 0.01% of Python)

### Step 4: Move Selection (Days 4-5)
**Goal**: Best move selection algorithm

```bash
# Create failing tests
npm test -- --testNamePattern="move selection"

# Expected failures:
# ❌ candidate filtering
# ❌ best move selection
# ❌ depth likelihood
```

**Implementation Tasks**:
1. Create `src/algorithm/MoveSelector.js`
2. Implement candidate move filtering
3. Implement best move selection logic
4. Add depth likelihood calculations

**Test Coverage**:
- Candidate move filtering by play rate and game count
- Best move selection using statistical criteria
- Depth likelihood threshold enforcement

### Step 5: PGN Generation (Days 5-6)
**Goal**: Exact PGN format matching

```bash
# Create failing tests
npm test -- --testNamePattern="pgn generation"

# Expected failures:
# ❌ move notation formatting
# ❌ annotation generation
# ❌ event headers
```

**Implementation Tasks**:
1. Create `src/pgn/PgnGenerator.js`
2. Implement move notation formatting
3. Implement annotation generation
4. Implement event header formatting

**Test Coverage**:
- Move notation accuracy (SAN format)
- Annotation format matching Python exactly
- Event header format and numbering

### Step 6: Main BookBuilder (Days 6-7)
**Goal**: Orchestrate all components

```bash
# Create failing tests
npm test -- --testNamePattern="bookbuilder main"

# Expected failures:
# ❌ opening processing
# ❌ line generation
# ❌ output formatting
```

**Implementation Tasks**:
1. Create `src/BookBuilder.js`
2. Implement main orchestration logic
3. Integrate all components
4. Add configuration handling

**Test Coverage**:
- End-to-end opening processing
- Configuration parameter handling
- Error handling and edge cases

### Step 7: Golden Master Validation (Day 8)
**Goal**: 100% functional parity

```bash
# Enable golden master tests
# Edit tests/golden-master.test.js - remove .skip from describe blocks

npm test -- --testNamePattern="golden master"

# Target results:
# ✅ Ruy Lopez output matches Python exactly
# ✅ King's Indian output matches Python exactly
# ✅ Statistical precision within tolerance
```

**Validation Criteria**:
- Byte-for-byte PGN matching (with floating-point tolerance)
- All annotation formats identical
- Statistical calculations within 0.01% tolerance
- Event naming and numbering consistent

## 🛠️ Development Workflow

### Daily TDD Cycle
```bash
# 1. Run failing tests
npm test

# 2. Implement minimal code to pass
# Write only enough code to make tests pass

# 3. Refactor while keeping tests green
# Clean up code without changing behavior

# 4. Commit progress
git add -A && git commit -m "TDD: Implement [component] - [tests passing]"

# 5. Run golden master tests to check progress
npm run test:golden
```

### Test Commands
```bash
npm test                    # Run all tests
npm run test:watch         # Watch mode for development
npm run test:coverage      # Coverage report
npm run test:golden        # Golden master tests only
npm test -- --verbose      # Detailed test output
```

## 📋 Success Criteria

### Phase 2 Complete When:
- [ ] All component tests pass
- [ ] Golden master tests pass with <0.01% tolerance
- [ ] Test coverage >95% for all source files
- [ ] No console errors or warnings
- [ ] Performance within 5x of Python version

### Quality Gates
1. **Zero test failures**: All tests must pass
2. **Golden master parity**: Outputs match reference data
3. **Statistical precision**: Calculations within tolerance
4. **Error handling**: Graceful handling of edge cases
5. **Performance**: Acceptable speed for client-side execution

## 🚨 Common Pitfalls to Avoid

1. **Floating-point precision**: Use tolerance-based comparisons for percentages
2. **Move notation**: Ensure SAN (Standard Algebraic Notation) accuracy
3. **Perspective handling**: Correctly identify White vs Black moves
4. **API rate limiting**: Implement proper request throttling
5. **Async handling**: Proper Promise/async-await usage
6. **Error propagation**: Don't silently swallow errors

## 📚 Key References

- **Golden Master Files**: `client/tests/golden-master/*.pgn`
- **Python Implementation**: `legacy/core/BookBuilder.py`
- **Test Utilities**: `client/tests/setup.js`
- **Chess.js Documentation**: https://github.com/jhlywa/chess.js
- **Stockfish.js Documentation**: https://github.com/nmrugg/stockfish.js

## 🎯 Next Steps

1. **Set up development environment**:
   ```bash
   cd client
   npm install
   npm test
   ```

2. **Start with Step 1**: Chess Foundation
   - Create `src/chess/ChessEngine.js`
   - Write failing tests for chess position handling
   - Implement minimal code to pass tests

3. **Follow TDD cycle**: Red → Green → Refactor → Commit

4. **Track progress**: Use golden master tests to validate functional parity

The goal is to achieve 100% functional parity with the Python version while maintaining the benefits of client-side execution (zero hosting costs, unlimited users, better API rate limiting).