# Strategy Comparison Goal Ranking Sub-Plan

> **For Hermes:** Use Codex as a scoped worker if helpful, but Hermes remains controller/reviewer. Do not commit or push without Clive approval.

**Goal:** Replace weak Strategy Impact Comparison ranking columns with goal-based ranking and income/capital/tax metrics that are meaningful for sequencing/blending strategies.

**Architecture:** Keep candidate generation unchanged. Add richer deterministic metrics in `src/engine/strategyComparison.ts`, then update `src/pages/Optimise.tsx` to rank by user goal rather than incidental events. Use “reference income” wording so portfolio-driven strategies such as ARVA are compared against a benchmark without implying they internally target it.

**Tech Stack:** React, TypeScript, Vitest, existing projection engine.

---

## Scope

Implement this checkpoint only:

1. Add deterministic comparison metrics:
   - average annual net income
   - minimum annual net income
   - years below reference income
   - total gap vs reference income
   - worst annual gap vs reference income
   - final flexible/end capital
   - total tax paid
   - optional first depleted source/age retained as explanatory note only
2. Add a Strategy page “Rank by goal” selector:
   - Balanced
   - Maximise spending
   - Preserve capital
   - Avoid income gaps
   - Smooth income
   - Minimise tax
3. Update Strategy Impact Comparison table columns and explanatory copy.
4. Remove `First income shortfall` / `First source depleted` as primary ranking columns.
5. Preserve “Update Current Plan” semantics: applying a selected row updates only drawdown stages / withdrawal priority.

Out of scope for this checkpoint:

- New stochastic ranking model.
- New strategy types.
- New TFC semantics.
- Single universal “best score” beyond deterministic sorting rules.
- Commit or push.

---

## Implementation tasks

### Task 1: Add RED engine metric expectations

**Files:**
- Modify: `src/engine/__tests__/strategyComparison.test.ts`

Add test coverage that `evaluateStrategyComparisonCandidate()` exposes the new metrics and reconciles them to `runProjection()`:

- `average_annual_net_income` = rounded average of `year.net_income_achieved`
- `minimum_annual_net_income` = rounded minimum of `year.net_income_achieved`
- `years_below_reference_income` = count where `net_income_achieved < reference - 1`
- `total_gap_vs_reference_income` = rounded sum of `max(0, reference - net_income_achieved)`
- `worst_annual_gap_vs_reference_income` = rounded max annual gap
- `income_volatility` = rounded standard deviation of annual net income
- `worst_annual_income_drop` = rounded largest year-on-year net income drop

Use each `YearRow`’s annual target/reference data already emitted by the projection, matching existing shortfall semantics.

Run:

`npx vitest run --config vitest.config.ts src/engine/__tests__/strategyComparison.test.ts`

Expected first: fail because fields do not exist.

### Task 2: Implement engine metrics

**Files:**
- Modify: `src/engine/strategyComparison.ts`

Add helper functions for sum/average/min/stddev and per-year reference gap calculations.

Keep old fields temporarily if needed for compatibility, but the UI should move to the new names.

Run focused engine test and expect pass.

### Task 3: Add RED Strategy page UI expectations

**Files:**
- Modify: `src/pages/__tests__/Optimise.test.tsx`

Update existing table test to expect:

- `Rank by goal:` selector
- `Balanced`
- `Maximise spending`
- `Preserve capital`
- `Avoid income gaps`
- `Smooth income`
- `Minimise tax`
- `Avg net income`
- `Min net income`
- `Years below reference`
- `Total gap`
- `Worst gap`
- `End capital`
- `Total tax`
- reference-income explanatory copy

Assert old main-column labels are absent:

- `Shortfall Age`
- `First Depleted Age`
- `Shortfall years`

Run:

`npx vitest run --config vitest.config.ts src/pages/__tests__/Optimise.test.tsx`

Expected first: fail until UI is updated.

### Task 4: Implement goal-based ranking UI

**Files:**
- Modify: `src/pages/Optimise.tsx`

Replace click-header multi-sort with a “Rank by goal” selector.

Recommended sort rules:

- Balanced: years below reference asc, total gap asc, average net income desc, end capital desc, total tax asc
- Maximise spending: average net income desc, minimum net income desc, total gap asc, end capital desc
- Preserve capital: end capital desc, years below reference asc, average net income desc
- Avoid income gaps: years below reference asc, total gap asc, worst gap asc, minimum net income desc
- Smooth income: income volatility asc, worst annual income drop asc, minimum net income desc, average net income desc
- Minimise tax: total tax asc, average net income desc, end capital desc

Display the selected ranking goal’s winner as `#1` / `Best for selected goal`.

Table columns:

- Rank
- Strategy pattern
- Avg net income
- Min net income
- Years below reference
- Total gap
- Worst gap
- End capital
- Total tax
- Notes

Notes should include first depleted source/age only as explanatory context, e.g. `ISA depleted at 74`, not as a ranking column.

Copy should say:

“Reference income is the Current Plan planning benchmark. Portfolio-driven strategies are compared against it for adequacy, but may not be targeting it internally.”

Run focused Optimise test and expect pass.

### Task 5: Verification bar

Run:

1. `npx vitest run --config vitest.config.ts src/engine/__tests__/strategyComparison.test.ts src/pages/__tests__/Optimise.test.tsx`
2. `npx vitest run --config vitest.config.ts`
3. `npx tsc -b`
4. `npm run build`

After type-check/build, inspect status and revert generated `tsconfig.*.tsbuildinfo` changes if touched.

### Task 6: Review and checkpoint summary

Hermes should inspect:

- `git diff -- src/engine/strategyComparison.ts src/engine/__tests__/strategyComparison.test.ts src/pages/Optimise.tsx src/pages/__tests__/Optimise.test.tsx docs/plans/2026-05-19-strategy-comparison-goal-ranking.md`
- changed-path status
- test/build results

Final response should include:

- what changed
- verification status
- branch/upstream status
- latest commits
- untouched untracked items
- approximate remaining implementation steps
- ask for approval before commit/push
