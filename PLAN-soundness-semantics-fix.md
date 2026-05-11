# Plan: Restore Python soundness/move-loss semantics in the JS port

This plan addresses a semantic regression introduced during the Python-to-JS
port of BookBuilder's move selection algorithm. The user-facing **Soundness
Limit** and **Move Loss Limit** controls behave differently in the JS code
than in the Python original and than the HTML help text describes.

See also: PR #30, #31, #32 (Codex), which address related wiring bugs but
not the semantic regression covered here.

---

## Background — what the controls are supposed to mean

From `client/app.html:2103,2110` and the Python original
(`workerEngineReduce.py:268` on the `pythonlegacy` branch):

- **Soundness Limit** — absolute eval floor on the position *after* our move,
  in our perspective. "Never accept a position worse than this." Compared
  against `afterOurMoveScore` (signed, our POV).
- **Move Loss Limit** — relative drop vs. the engine's best move. "Tolerate
  losing up to this many centipawns vs. engine best." Compared against
  signed `moveLoss = afterOurMoveScore − bestEval` (negative = worse).
- **Ignore Loss Limit** — eval threshold above which both gates relax.
  "If we're winning by more than this, accept the move regardless."

Python condition (`workerEngineReduce.py:268`):

```python
if ( (afterOurMoveScore > soundness_limit) and (moveLoss > move_loss_limit) )
   or (afterOurMoveScore > ignore_loss_limit)
   or (moveLoss >= 0):
    # approve
```

Two orthogonal gates; two escapes.

---

## What the JS port actually does

`client/src/algorithm/MoveSelector.js:971-1008` (lazy path; legacy at
`:501-554` is identical):

```js
const centipawnLoss = analysis?.moveLoss || 0;
if (centipawnLoss > Math.abs(this.config.SOUNDNESSLIMIT)) return false;
if (centipawnLoss > Math.abs(this.config.LOSSLIMIT)) {
    const absoluteEval = Math.abs(analysis?.evaluation || 0);
    if (absoluteEval < this.config.IGNORELOSSLIMIT) return false;
}
return true;
```

Differences from Python:

| Concern | Python | JS port | Effect |
|---|---|---|---|
| Soundness Limit quantity checked | `afterOurMoveScore` (absolute) | `analysis.moveLoss` (relative) | Soundness is no longer an eval floor; just a stricter Move Loss Limit |
| Sign handling | Signed `>` comparison | `Math.abs(SOUNDNESSLIMIT)` etc. | User's typed sign is discarded; `+50` and `-50` behave identically |
| `moveLoss` sign | Signed; negative = worse | `Math.abs(moveLoss)`; positive magnitude | Loses information |
| `ignore_loss_limit` trigger | `afterOurMoveScore > ignore_loss_limit` | `Math.abs(evaluation) < IGNORELOSSLIMIT` | Fires symmetrically in deeply losing positions (wrong) |
| `moveLoss >= 0` escape | Explicit OR clause | Only `move === engineBestMove` fast path | Loses the "engine actually prefers our move on deeper analysis" case |
| Engine-best eval-floor pre-check | Present (`:205`) | Absent | Engine best move never validated against the floor |
| Two limits redundant? | No, orthogonal | Yes — both gate the same `centipawnLoss` | Soundness Limit slider is redundant |

Additionally, `analysis.afterEval` and `analysis.evaluation` are returned by
the engine wrappers from the **opponent's** perspective despite their names
(`client/src/engine/StockfishEngine.js:521-538` — only the local
`adjustedAfterEval` variable is in our POV, and it isn't exported). Any fix
that compares against an "after eval" must first expose a perspective-correct
field.

---

## Prerequisites & branch strategy

- **Wait for Codex PR #31 or #32 to merge into `web`.** They fix the form-key
  wiring that this work depends on (form ID `soundness-limit` →
  `formConfig['soundness-limit']`, and `MOVELOSSLIMIT` →`LOSSLIMIT` on the
  output object).
- Close the duplicate of #31/#32 and close **#30** (its added test
  contradicts its own code changes).
- Branch this work off the updated `web` as
  `claude/soundness-semantics-fix`. All changes go in one PR.
- Write failing tests **first** (Step 5), then make them pass.

---

## Step 1 — Normalize "after eval" perspective in the engine wrappers

**Files:**
- `client/src/engine/StockfishEngine.js`
- `client/src/engine/NodeStockfishEngine.js`
- `client/src/engine/MockStockfishEngine.js`

In `StockfishEngine.js:521-538` (and mirror at `NodeStockfishEngine.js:527-540`):

```js
const adjustedAfterEval = -afterEval;                  // our perspective
const signedMoveLoss = adjustedAfterEval - beforeEval; // negative = our move worse than best
const moveLoss = beforeEval - adjustedAfterEval;       // legacy magnitude
const absMoveLoss = Math.abs(moveLoss);
const quality = this.calculateMoveQuality(absMoveLoss);

return {
    evaluation: afterEval,            // unchanged — raw, opponent POV
    moveLoss: absMoveLoss,            // unchanged — magnitude (used by quality UI)
    quality,
    beforeEval,                       // unchanged — our POV
    afterEval,                        // unchanged — raw, opponent POV
    afterEvalOurs: adjustedAfterEval, // NEW — our POV, signed
    signedMoveLoss                    // NEW — our POV, signed (negative = worse)
};
```

Mirror in `MockStockfishEngine.js` (around line 216-225).

**Rationale:** add fields rather than rename. `analysis.evaluation` is
consumed by `_handleMateScenarios` (`MoveSelector.js:613-634`); flipping its
sign would invert mate detection. Adding new fields is non-breaking.

---

## Step 2 — Rewrite the soundness check in `MoveSelector`

**File:** `client/src/algorithm/MoveSelector.js`.

### 2a. Replace `_passesSoundnessCheck` (lines 971-1008)

```js
_passesSoundnessCheck(moveUci, engineBestMove, analysis) {
    if (moveUci === engineBestMove) return true;

    const afterEval = analysis?.afterEvalOurs ?? 0;
    const signedMoveLoss = analysis?.signedMoveLoss ?? 0;

    this._validateMoveAnalysis(analysis, `_passesSoundnessCheck(${moveUci})`);

    // Mirror Python workerEngineReduce.py:268 — three OR branches:
    //   1. Both individual gates pass
    //   2. Position is winning enough that we relax both gates
    //   3. Our move is at least as good as engine's best
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

### 2c. Remove every `Math.abs(this.config.SOUNDNESSLIMIT)` and `Math.abs(this.config.LOSSLIMIT)`

After this step:

```bash
git grep -n "Math.abs(this.config.SOUNDNESSLIMIT\|Math.abs(this.config.LOSSLIMIT)"
```

should return zero hits.

### 2d. Drop `_handleMateScenarios` (lines 613-634)

With signed `afterEvalOurs`, mate-for-us produces a large positive value that
naturally clears every gate, and mate-against-us produces a large negative
value that naturally fails soundness. The Python original has no equivalent of
the "avoidable mate" branch — drop it for parity.

---

## Step 3 — Update comments, JSDoc, and inline docs

**File:** `client/src/algorithm/MoveSelector.js`.

- Lines **28-33** (header "KEY CONCEPTS") — rewrite Soundness Limit and Move
  Loss Limit definitions to match HTML help text and Python semantics.
- Lines **76-78** (constructor param JSDoc) — `SOUNDNESSLIMIT` is "absolute
  eval floor (our perspective, centipawns)"; `LOSSLIMIT` is "max centipawn
  drop vs. engine best (signed, negative = looser)".
- Lines **91-93** (inline comment) — same.
- Lines **957-968** (`_passesSoundnessCheck` JSDoc) — describe both gates and
  both escapes explicitly. Reference `workerEngineReduce.py:268` so future
  readers can verify against the Python original.

---

## Step 4 — Audit preset values in `sample-openings.js`

**File:** `client/src/config/sample-openings.js`.

Presets at `:115,119,158,189` were tuned under broken semantics where
SOUNDNESSLIMIT was effectively another move-loss cap. With the fix the
numbers mean different things (eval floor vs. relative drop). Re-pick per
preset intent:

- "Relaxed" preset: `soundnessLimit: -300, moveLossLimit: -100`.
- "Strict" preset: `soundnessLimit: -50, moveLossLimit: -30`.

Cosmetic, not behavioral; keep minimal and call out in the PR description.

---

## Step 5 — Tests (write these BEFORE Step 1-2 so they fail first)

### `client/tests/move-selector-semantics.test.js` (new)

Table-driven cases against `_passesSoundnessCheck` with synthetic `analysis`
objects:

```js
const cases = [
    // [name, afterEvalOurs, signedMoveLoss, SOUND, LOSS, IGNORE, expectApprove]
    ['within both limits',           -50,  -70,  -99,  -99, 300, true ],
    ['eval-floor violation',        -150, -170,  -99,  -99, 300, false], // smoking gun
    ['strict floor, lax move-loss',  -80,  -50,  -50,  -99, 300, false],
    ['move-loss violation',         -150, -200,  -99, -100, 300, false],
    ['IGNORELOSSLIMIT escape',      +400, +380,  -99,  -99, 300, true ],
    ['both gates fail',             -200, -220,  -99,  -99, 300, false],
    ['engine likes our move',       +50,   +30,  -99,  -99, 300, true ],
    ['mate for us',            +9999999, +999,  -99,  -99, 300, true ],
    ['mate against us',        -9999999, -999,  -99,  -99, 300, false],
    ['positive floor accepts',      +80,   +30, +50,  -99, 300, true ],
    ['positive floor rejects',      +30,   -20, +50,  -99, 300, false],
];
```

Run the table against both the lazy-path entry and the legacy-batch-path
entry. Row 2 and row 10 are the regressions; row 11 catches the `Math.abs`
sign-inversion bug.

### `client/tests/engine-perspective-contract.test.js` (new)

One test using `MockStockfishEngine` (or real Stockfish gated behind
`RUN_ENGINE_TESTS=1`): on a known white-blunders position, assert
`analysis.afterEvalOurs < 0` and `analysis.signedMoveLoss < 0`. Pins the
perspective convention.

### `client/tests/python-parity.test.js` (new, optional but cheap)

Encode the Python expression verbatim as a JS reference function.
Property-test 1000 seeded random tuples; assert agreement with
`_passesSoundnessCheck`. Catches any future semantic drift.

### `client/tests/danish-gambit-regression.test.js` (new)

End-to-end with `MockStockfishEngine`. Mock the lichess client to return
candidates `[Nf3, d4, Bc4]` after `1.e4 e5`; mock engine evals so d4 produces
`signedMoveLoss ≈ -25`. Assert:

- With `LOSSLIMIT = -10`: selected move is `Nf3` (d4 rejected).
- With `LOSSLIMIT = -50`: selected move can be `d4`.

This test demonstrably reproduces and fixes the original report.

### Keep

The form-wiring regression test added in Codex PR #31/#32
(`soundness-limit-config-regression.test.js`).

---

## Step 6 — UX/copy follow-up

After the semantic fix, **Soundness Limit alone won't address the original
poster's "avoid Danish" goal** — d4 doesn't leave white in a worse position,
so no eval floor short of +0.30 would reject it, and a +30 floor would also
reject most reasonable openings. The right knob is **Move Loss Limit ≈ -10 to
-20**.

Update `client/app.html:2103,2110` help text:

- **Soundness Limit** — keep current wording; add "useful for avoiding
  objectively losing positions, not for choosing between two playable lines."
- **Move Loss Limit** — emphasize "this is the knob to make the algorithm
  prefer engine-best moves. Try -20 if you want to closely follow engine
  recommendations."

---

## Verification checklist

- [ ] All four pre-existing bugs (form key typo, MOVELOSSLIMIT vs LOSSLIMIT,
      `||` falsy-zero, `Math.abs` sign-inversion) have explicit regression
      tests.
- [ ] `git grep -n "Math.abs(this.config.SOUNDNESSLIMIT\|Math.abs(this.config.LOSSLIMIT)"`
      returns nothing.
- [ ] `git grep -n "centipawnLoss > Math.abs"` returns nothing.
- [ ] `npm test` passes locally including new test files.
- [ ] Manually reproduce the user's scenario in the browser: load with
      `Move Loss Limit = -20`, generate from `1. e4` PGN, confirm Nf3 is
      chosen.

---

## Out of scope (flag in the PR description, don't fix here)

- `analyzeMove` caps depth at `Math.min(this.depth, 15)`
  (`StockfishEngine.js:495`), which may underweight engine disagreement at
  the configured deeper depths. Separate issue.
- `_handleMateScenarios` "avoidable mate" branch was a JS-only extension;
  removing it for Python parity. If users relied on it (probably not — it's
  undocumented), revisit.
- IGNORELOSSLIMIT itself was buggy in the JS port (used
  `Math.abs(evaluation) < threshold` which fires symmetrically in losing
  positions). The rewrite fixes it as a side effect.
