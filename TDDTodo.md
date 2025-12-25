# TDD Testing Improvement Plan

> Generated from coverage analysis on 2025-12-25
> Goal: Improve test coverage following TDD principles

## Coverage Summary

| Component | Current | Target | Priority |
|-----------|---------|--------|----------|
| [FormController.js](client/src/ui/FormController.js) | 6.57% | 50%+ | ❌ Critical |
| [FileGenerator.js](client/src/ui/FileGenerator.js) | 26.01% | 60%+ | ⚠️ High |
| [ErrorHandler.js](client/src/ui/ErrorHandler.js) | 36.36% | 60%+ | ⚠️ High |
| [StockfishEngine.js](client/src/engine/StockfishEngine.js) | 52.24% | 70%+ | ⚠️ Moderate |
| [BookBuilder.js](client/src/BookBuilder.js) | 74.48% | 80%+ | ✅ Good |
| [MoveSelector.js](client/src/algorithm/MoveSelector.js) | 83.39% | 85%+ | ✅ Good |
| [LichessClient.js](client/src/api/LichessClient.js) | 87.20% | 90%+ | ✅ Strong |
| [Statistics.js](client/src/stats/Statistics.js) | 95.38% | 95%+ | ✅ Excellent |

---

## Critical: FormController.js (6.57% → 50%+)

The main UI orchestrator is almost completely untested. This is why the stale closure bug wasn't caught.

### Test File: `client/tests/formcontroller.test.js` (NEW)

#### 1. Configuration Conversion Tests
- [ ] `convertToBookBuilderConfig()` returns valid config object
- [ ] Time control checkboxes map to correct speed array
- [ ] Rating bracket checkboxes map to correct ratings array
- [ ] PGN input parsing extracts openings correctly
- [ ] Engine settings (depth, hash, variant) pass through correctly
- [ ] Invalid form data produces validation errors

#### 2. Event Handling Tests
- [ ] Form submission calls `handleSubmit()`
- [ ] Input changes trigger `autoSave()`
- [ ] Range sliders update display values
- [ ] PGN input triggers validation on blur
- [ ] Prevents default form submission (no page reload)

#### 3. State Management Tests
- [ ] Second analysis resets state from first analysis
- [ ] Progress tracker updates correctly during generation
- [ ] Error state clears on new submission
- [ ] Cancellation cleans up in-progress state

#### 4. Integration with Components Tests
- [ ] `initializeComponents()` creates LichessClient correctly
- [ ] `initializeComponents()` creates StockfishEngine when enabled
- [ ] Progress callback receives updates from BookBuilder
- [ ] Results pass correctly to FileGenerator.displayPGN()

---

## High: FileGenerator.js (26.01% → 60%+)

### Test File: `client/tests/file-generator.test.js` (EXISTS - expand)

#### Currently Tested
- [x] Basic PGN generation
- [x] Format toggle between tree/individual
- [x] Stale closure bug regression tests

#### Missing Tests
- [ ] `downloadFile()` creates correct Blob and triggers download
- [ ] `copyToClipboard()` copies correct content
- [ ] `getCurrentContent()` returns current format's content
- [ ] Statistics formatting in PGN headers
- [ ] Error handling for malformed input data
- [ ] `generateBothFormats()` produces valid tree and individual PGN
- [ ] Button state updates (active/inactive) on format switch
- [ ] Download history tracking

---

## High: ErrorHandler.js (36.36% → 60%+)

### Test File: `client/tests/unit/error-handler.test.js` (EXISTS - expand)

#### Currently Tested
- [x] Email report opening
- [x] Clipboard copy
- [x] Error display

#### Missing Tests
- [ ] `showValidationErrors()` displays multiple errors correctly
- [ ] `showError()` formats different error types correctly
- [ ] `clearError()` hides container and clears state
- [ ] Config capture includes all form fields
- [ ] Debug mode shows stack traces
- [ ] Error log maintains history of all errors
- [ ] Overlay click dismisses error modal
- [ ] Suggestions display based on error type

---

## Moderate: StockfishEngine.js (52.24% → 70%+)

### Test File: `client/tests/stockfish-engine.test.js` (NEW)

#### 1. Initialization Tests
- [ ] `initialize()` resolves when engine ready
- [ ] Multiple `initialize()` calls reuse same promise
- [ ] Failed init rejects with meaningful error
- [ ] `initializationPromise` resets on WASM crash (bug fix validation)

#### 2. Position Evaluation Tests
- [ ] `evaluatePosition()` returns centipawn score
- [ ] `evaluatePosition()` handles invalid FEN gracefully
- [ ] Evaluation timeout triggers rejection

#### 3. Best Move Tests
- [ ] `getBestMove()` returns valid UCI move
- [ ] `getBestMove()` respects depth setting
- [ ] `getBestMove()` handles checkmate positions

#### 4. Cleanup Tests
- [ ] `shutdown()` terminates worker
- [ ] `quit()` cleans up pending operations
- [ ] Resources released on engine restart

---

## Good: BookBuilder.js (74.48% → 80%+)

### Test File: `client/tests/bookbuilder.test.js` (EXISTS - minor gaps)

#### Missing Tests
- [ ] `expandLine()` edge cases with no API data
- [ ] Engine fallback when Lichess has no games
- [ ] Rate limiting respects configured delays
- [ ] Depth limits prevent infinite recursion
- [ ] Lines 844-886: uncovered engine evaluation path
- [ ] Lines 1278-1322: uncovered validation path

---

## Good: MoveSelector.js (83.39% → 85%+)

### Test File: `client/tests/move-selector.test.js` (EXISTS - minor gaps)

#### Missing Tests
- [ ] Lines 335-336: edge case in move scoring
- [ ] Lines 591-596: uncovered filtering logic
- [ ] Lines 784-797: uncovered sorting edge case

---

## Strong: LichessClient.js (87.20% → 90%+)

### Test File: `client/tests/api-engine.test.js` (EXISTS - minor gaps)

#### Missing Tests
- [ ] Rate limit 429 response handling
- [ ] Retry logic with exponential backoff
- [ ] Timeout handling
- [ ] Lines 309-311, 477, 560: uncovered error paths

---

## Excellent: Statistics.js (95.38% → 95%+)

### Test File: `client/tests/unit/statistics.test.js` (EXISTS - complete)

No additional tests needed. Maintain current coverage.

---

## Implementation Order

### Phase 1: Critical (FormController)
Write tests that would have caught the stale closure bug and similar state management issues.

### Phase 2: High Priority (FileGenerator, ErrorHandler)
Fill in UI component gaps that affect user experience.

### Phase 3: Moderate (StockfishEngine)
Add robustness tests for engine initialization and error recovery.

### Phase 4: Refinement (BookBuilder, MoveSelector, LichessClient)
Close minor coverage gaps in already well-tested components.

---

## TDD Workflow Reminder

For each new test:

1. **RED**: Write the test first, watch it fail
2. **GREEN**: Write minimal code to make it pass
3. **REFACTOR**: Clean up while tests stay green
4. **VERIFY**: Run full suite to catch regressions

---

## Progress Tracking

| Phase | Component | Tests Added | Coverage Before | Coverage After | Status |
|-------|-----------|-------------|-----------------|----------------|--------|
| 1 | FormController | 47 | 6.57% | 34.04% | ✅ Improved (+27.5%) |
| 2 | FileGenerator | 54 | 26.01% | 32.74% | ✅ Improved (+6.7%) |
| 2 | ErrorHandler | 27 | 36.36% | 42.56% | ✅ Improved (+6.2%) |
| 3 | StockfishEngine | 40 | 52.24% | 55.13% | ✅ Improved (+2.9%) |
| 4 | BookBuilder | - | 74.48% | - | 🟡 Already good |
| 4 | MoveSelector | - | 83.39% | - | 🟡 Already good |
| 4 | LichessClient | - | 87.20% | - | 🟡 Already good |

### Summary
- **Total new tests added:** 168
- **All tests passing:** ✅ Yes
- **Key improvements:**
  - FormController: Critical gap addressed, now tests config conversion and validation
  - FileGenerator: Download, combined PGN, and format toggle tests added
  - ErrorHandler: Validation errors, API errors, and state management tested
  - StockfishEngine: UCI validation, FEN validation, and move quality tested
