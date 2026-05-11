# Plan: Restore Python soundness/move-loss semantics in the JS port

## Context

`PLAN-soundness-semantics-fix.md` (committed in #33) lays out the fix for a
semantic regression introduced during the Python→JS port of BookBuilder's
move-selection algorithm. The user-facing **Soundness Limit** and **Move Loss
Limit** controls behave differently in the JS code than in the Python original
(`origin/pythonlegacy:workerEngineReduce.py:268`) and than the HTML help text
describes. Per the user's request, I asked Codex to review that plan against
the live code. This file folds Codex's findings into a revised plan ready to
execute. Goal: ship the fix in one PR off updated `web`, with failing tests
written first.

Codex flagged four substantive issues with the original plan. Each is
addressed below.

---

## Codex review findings (incorporated)

1. **No real "engine-best eval-floor pre-check" exists in Python.** The
   block at `origin/pythonlegacy:workerEngineReduce.py:205-212` only logs;
   every effect is commented out, and `:160-165` approves the top engine move
   immediately. The original plan's table overstated this. **Action:** drop
   the "engine-best eval-floor pre-check" row from the diff table; do not add
   such a check in the JS port.

2. **`?? 0` defaults silently approve stale analysis objects** because
   `signedMoveLoss >= 0` then passes. Existing mocks return only
   `moveLoss`/`evaluation` (e.g. `client/tests/lazy-engine-comparison.test.js:109-116`,
   `client/tests/move-selector.test.js:450-502`,
   `client/tests/perspective-invariants.test.js:372-405`). **Action:** fail
   closed when the new fields are missing, and update every mock/test in the
   same PR. See Step 2a + Step 5 below.

3. **Mate handling tests must match engine scale.** Real engines produce
   `±10000` for mate scores (`StockfishEngine.js:377-380`,
   `NodeStockfishEngine.js:293-297`), but `MATE_SCORE_THRESHOLD = 999999`
   (`MoveSelector.js:61-65`), so `_handleMateScenarios` is effectively dead
   for real engine output. **Action:** use `±10000` in mate tests, not
   `±9999999`; document that dropping `_handleMateScenarios` is safe because
   it is already unreachable for real engine output (only the Python parity
   path matters).

4. **Mate-against-us description was imprecise.** Python `:268` accepts a
   mate-against-us when the engine best is also mating against us
   (`moveLoss >= 0` clause). **Action:** clarify the comment in the new
   `_passesSoundnessCheck` so future readers know the `signedMoveLoss >= 0`
   escape covers this.

Minor accuracy fixups Codex caught:
- `NodeStockfishEngine.js:527-540` → actual block is `:526-539`.
- Always cite `origin/pythonlegacy:workerEngineReduce.py:268` (fully
  qualified) rather than bare `pythonlegacy:...`.

---

## Prerequisites

- Wait for Codex PR #31/#32 to merge into `web` (form-key wiring fixes).
- Close duplicate of #31/#32 and close #30 (its test contradicts its code).
- Branch off updated `web` as `claude/soundness-semantics-fix`.
- Write failing tests first (Step 5), then make them pass.

---

## Step 1 — Add perspective-correct fields in engine wrappers

**Files:**
- `client/src/engine/StockfishEngine.js` (block at `:521-538`)
- `client/src/engine/NodeStockfishEngine.js` (block at `:526-539`)
- `client/src/engine/MockStockfishEngine.js` (`:216-225`)

Add two new fields to the returned analysis object — do **not** rename
`evaluation` / `afterEval` (consumed by `_handleMateScenarios` and various
UI/quality paths; flipping sign would invert mate detection):

```js
const adjustedAfterEval = -afterEval;                  // our POV
const signedMoveLoss = adjustedAfterEval - beforeEval; // negative = worse
const moveLoss = beforeEval - adjustedAfterEval;       // legacy magnitude
const absMoveLoss = Math.abs(moveLoss);
const quality = this.calculateMoveQuality(absMoveLoss);

return {
    evaluation: afterEval,            // unchanged — raw, opponent POV
    moveLoss: absMoveLoss,            // unchanged — magnitude (quality UI)
    quality,
    beforeEval,                       // unchanged — our POV
    afterEval,                        // unchanged — raw, opponent POV
    afterEvalOurs: adjustedAfterEval, // NEW — our POV, signed
    signedMoveLoss                    // NEW — our POV, signed (neg = worse)
};
```

Mirror in `MockStockfishEngine.js`.

Document on the return-object JSDoc that `evaluation`/`afterEval` are
**opponent POV** while `afterEvalOurs`/`signedMoveLoss` are **our POV**.

---

## Step 2 — Rewrite the soundness check in `MoveSelector`

**File:** `client/src/algorithm/MoveSelector.js`.

### 2a. Replace `_passesSoundnessCheck` (lines 971-1008)

```js
_passesSoundnessCheck(moveUci, engineBestMove, analysis) {
    if (moveUci === engineBestMove) return true;

    this._validateMoveAnalysis(analysis, `_passesSoundnessCheck(${moveUci})`);

    // Fail closed: required fields must be present and finite.
    // (Per Codex review: defaulting to 0 silently approves stale objects
    // via the signedMoveLoss >= 0 escape.)
    const afterEval = analysis?.afterEvalOurs;
    const signedMoveLoss = analysis?.signedMoveLoss;
    if (!Number.isFinite(afterEval) || !Number.isFinite(signedMoveLoss)) {
        log.warn(
            `_passesSoundnessCheck(${moveUci}): missing afterEvalOurs/signedMoveLoss; rejecting`
        );
        return false;
    }

    // Mirror origin/pythonlegacy:workerEngineReduce.py:268 — three OR branches:
    //   1. Both individual gates pass (eval floor AND relative drop)
    //   2. Position is winning enough that we relax both gates
    //   3. signedMoveLoss >= 0: our move is at least as good as engine best.
    //      Also covers the "mate-against-us when engine best is equally mating
    //      against us" case (both eval to -mate, so signedMoveLoss == 0).
    if (afterEval > this.config.IGNORELOSSLIMIT) return true;
    if (signedMoveLoss >= 0) return true;

    return afterEval > this.config.SOUNDNESSLIMIT
        && signedMoveLoss > this.config.LOSSLIMIT;
}
```

### 2b. Collapse `validateMoveSoundness` (lines 501-554) onto the same helper

```js
validateMoveSoundness(fen, move, engineBestMove, moveAnalysis) {
    if (this.config.CAREABOUTENGINE !== 1) return true;
    return this._passesSoundnessCheck(move, engineBestMove, moveAnalysis);
}
```

### 2c. Remove every `Math.abs(this.config.SOUNDNESSLIMIT|LOSSLIMIT)`

Verify with:
```bash
git grep -n "Math.abs(this.config.SOUNDNESSLIMIT\|Math.abs(this.config.LOSSLIMIT)"
```
Must return zero hits.

### 2d. Drop `_handleMateScenarios` (lines 613-634)

Per Codex: with `MATE_SCORE_THRESHOLD = 999999` and engine mate values of
`±10000`, this branch is already unreachable for real engine output. With
signed `afterEvalOurs`, mate-for-us produces a large positive value (clears
every gate) and avoidable mate-against-us fails soundness naturally. Equal
mate-against-us is approved via the `signedMoveLoss >= 0` escape, matching
Python `:268`. Drop the function and its call sites for parity and dead-code
removal.

---

## Step 3 — Update comments / JSDoc

**File:** `client/src/algorithm/MoveSelector.js`.

- Lines **28-33** (header "KEY CONCEPTS"): rewrite Soundness Limit / Move
  Loss Limit definitions to match HTML help text and Python semantics.
- Lines **76-78** (constructor JSDoc): `SOUNDNESSLIMIT` = "absolute eval
  floor (our POV, centipawns)"; `LOSSLIMIT` = "max signed drop vs. engine
  best (negative = looser)".
- Lines **91-93** (inline comment): same.
- Lines **957-968** (`_passesSoundnessCheck` JSDoc): describe both gates +
  both escapes; cite `origin/pythonlegacy:workerEngineReduce.py:268`.

---

## Step 4 — Audit preset values in `sample-openings.js`

**File:** `client/src/config/sample-openings.js` (`:115,119,158,189`).

Numbers were tuned under broken semantics. Re-pick:
- "Relaxed": `soundnessLimit: -300, moveLossLimit: -100`.
- "Strict": `soundnessLimit: -50, moveLossLimit: -30`.

Cosmetic; call out in PR description.

---

## Step 5 — Tests (write BEFORE Step 1-2)

### `client/tests/move-selector-semantics.test.js` (new)

Table-driven cases against `_passesSoundnessCheck`. **Use ±10000 not
±9999999** for mate cases (matches engine output per Codex):

```js
const cases = [
    // [name, afterEvalOurs, signedMoveLoss, SOUND, LOSS, IGNORE, expect]
    ['within both limits',           -50,  -70,  -99,  -99, 300, true ],
    ['eval-floor violation',        -150, -170,  -99,  -99, 300, false], // smoking gun
    ['strict floor, lax move-loss',  -80,  -50,  -50,  -99, 300, false],
    ['move-loss violation',         -150, -200,  -99, -100, 300, false],
    ['IGNORELOSSLIMIT escape',      +400, +380,  -99,  -99, 300, true ],
    ['both gates fail',             -200, -220,  -99,  -99, 300, false],
    ['engine likes our move',        +50,  +30,  -99,  -99, 300, true ],
    ['mate for us',               +10000, +999,  -99,  -99, 300, true ],
    ['avoidable mate against us', -10000,-9000,  -99,  -99, 300, false],
    ['equal mate against us',     -10000,    0,  -99,  -99, 300, true ], // Python parity
    ['positive floor accepts',       +80,  +30,  +50,  -99, 300, true ],
    ['positive floor rejects',       +30,  -20,  +50,  -99, 300, false],
    ['missing fields → reject',     undefined, undefined, -99, -99, 300, false], // fail-closed
];
```

Run against both lazy-path and legacy-batch-path entries. Rows 2/11 are the
core regressions; row 12 catches the `Math.abs` sign-inversion bug; row 13
covers the Codex fail-closed fix.

### `client/tests/engine-perspective-contract.test.js` (new)

Using `MockStockfishEngine` (or real Stockfish gated behind
`RUN_ENGINE_TESTS=1`): on a known white-blunders position, assert
`analysis.afterEvalOurs < 0` and `analysis.signedMoveLoss < 0`. Pins the
perspective convention.

### `client/tests/python-parity.test.js` (new, optional but cheap)

Encode Python `:268` verbatim as a JS reference function. Property-test 1000
seeded random tuples; assert agreement with `_passesSoundnessCheck`.

### `client/tests/danish-gambit-regression.test.js` (new)

End-to-end with `MockStockfishEngine`. Mock lichess client to return
`[Nf3, d4, Bc4]` after `1.e4 e5`; mock engine evals so d4 produces
`signedMoveLoss ≈ -25`. Assert:
- `LOSSLIMIT = -10`: selected move is `Nf3` (d4 rejected).
- `LOSSLIMIT = -50`: selected move can be `d4`.

### Update existing mocks/tests in same PR

These return only `moveLoss`/`evaluation` and will fail-closed after Step
2a unless updated to include `afterEvalOurs`/`signedMoveLoss`:
- `client/tests/lazy-engine-comparison.test.js:109-116`
- `client/tests/move-selector.test.js:450-502`
- `client/tests/perspective-invariants.test.js:372-405`

### Keep
Form-wiring regression test from #31/#32
(`soundness-limit-config-regression.test.js`).

---

## Step 6 — UX/copy follow-up

`client/app.html:2103,2110`:
- **Soundness Limit** — keep wording; add "useful for avoiding objectively
  losing positions, not for choosing between two playable lines."
- **Move Loss Limit** — emphasize "this is the knob to make the algorithm
  prefer engine-best moves. Try -20 if you want to closely follow engine
  recommendations."

---

## Critical files modified

- `client/src/engine/StockfishEngine.js`
- `client/src/engine/NodeStockfishEngine.js`
- `client/src/engine/MockStockfishEngine.js`
- `client/src/algorithm/MoveSelector.js`
- `client/src/config/sample-openings.js`
- `client/app.html`
- `client/tests/move-selector-semantics.test.js` (new)
- `client/tests/engine-perspective-contract.test.js` (new)
- `client/tests/python-parity.test.js` (new)
- `client/tests/danish-gambit-regression.test.js` (new)
- `client/tests/lazy-engine-comparison.test.js` (update mocks)
- `client/tests/move-selector.test.js` (update mocks)
- `client/tests/perspective-invariants.test.js` (update mocks)

---

## Verification

- [ ] Failing tests in Step 5 land first; pass after Step 1-2.
- [ ] `git grep -n "Math.abs(this.config.SOUNDNESSLIMIT\|Math.abs(this.config.LOSSLIMIT)"` → empty.
- [ ] `git grep -n "centipawnLoss > Math.abs"` → empty.
- [ ] `git grep -n "_handleMateScenarios"` → empty (function and all call sites removed).
- [ ] `npm test` passes locally.
- [ ] Manual browser repro: `Move Loss Limit = -20`, generate from `1. e4`
      PGN, confirm Nf3 is chosen.

---

## Out of scope (flag in PR description)

- `analyzeMove` caps depth at `Math.min(this.depth, 15)`
  (`StockfishEngine.js:495`) — may underweight engine disagreement at
  deeper configured depths. Separate issue.
- `_handleMateScenarios` "avoidable mate" was a JS-only extension (and
  already dead for real engine output); removing for Python parity.
- IGNORELOSSLIMIT JS bug (`Math.abs(evaluation) < threshold` firing
  symmetrically in losing positions) — fixed as a side effect of Step 2a.
