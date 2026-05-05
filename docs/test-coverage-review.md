# Test Coverage Review

This document classifies the current tests by the kind of confidence they
provide. It should be updated as calculation assurance work progresses.

## Summary

The project has a useful test base, especially around regression protection and
internal arithmetic consistency. The main gap is independent domain correctness:
tests that prove the engine matches a written calculation spec and
hand-checkable adviser examples.

The new worked-example tests start filling that gap, but several high-risk
calculation behaviours still need explicit tests and/or engine changes.

## Test Categories

| Test file | Category | What it proves | What it does not prove |
| --- | --- | --- | --- |
| `src/engine/__tests__/workedExamples.test.ts` | Domain correctness | Small examples from `docs/calculation-worked-examples.md` match expected hand-checkable results, including mixed tax-free DC pots, fixed-target CPI display, mid-year guaranteed income, and depletion residual cleardown. | Jurisdiction-specific tax examples still need adviser-approved rules. |
| `src/engine/__tests__/tax.test.ts` | Domain/unit correctness | Generic banded tax calculator, gross-up solver, initial UK rule packs, and personal allowance taper behave as expected for focused examples. | Does not prove any jurisdiction-specific tax regime is complete. |
| `src/engine/__tests__/projection.test.ts` | Smoke/behaviour tests | Projection runs across strategies, creates rows, respects basic withdrawal order, detects depletion. | Mostly checks shape and broad behaviour, not exact correctness for edge cases. |
| `src/engine/__tests__/crosscheck.test.ts` | Cross-version regression | TypeScript engine matches selected V1 Python baseline values. | If V1 behaviour was wrong or simplified, this preserves that behaviour. |
| `src/engine/__tests__/golden.test.ts` | Golden regression | Strategy outputs stay stable unless intentionally changed. | Golden snapshots can lock in bugs; changed fixtures must be reviewed, not blindly regenerated. |
| `src/engine/__tests__/diagnostic.test.ts` | Diagnostic/parity | Compares fixture, UI default, and V1-active-style scenarios. | Large diagnostic tests can be hard to interpret as precise domain rules. |
| `src/engine/__tests__/strategies.test.ts` | Strategy unit tests | Strategy dispatch and target calculations work for representative cases. | Does not prove full real-world validity of strategy methodology. |
| `src/engine/__tests__/backtest.test.ts` | Backtest smoke tests | Historical window machinery produces plausible outputs and percentile ordering. | Does not independently validate historical assumptions or retirement strategy correctness. |
| `src/engine/__tests__/sanityChecks.test.ts` | Internal consistency | Sanity report checks pass and catch arithmetic identity concepts. | Internal consistency is not the same as real-world correctness. |
| `src/engine/__tests__/workings.test.ts` | Transparency consistency | Workings reports are produced and key cross-check deltas are small. | Does not prove formulas are the right formulas. |
| `src/engine/__tests__/growthSuggestions.test.ts` | Growth suggestion unit/range tests | Growth suggestion outputs are monotonic, in expected ranges, and mock data behaves predictably. | Does not prove future returns or suitability of suggested rates. |
| `src/store/__tests__/configStore.test.ts` | Store smoke tests | Basic localStorage presence/reset behaviour works. | Does not cover the provider first-run state machine. |
| `src/store/__tests__/ConfigProvider.test.tsx` | Store/import workflow | Empty storage starts first-run mode; stored legacy configs are migrated; import-style save plus mark-configured exits first-run mode; reset returns to first-run mode. | File picker/browser import UI still needs manual browser smoke testing. |

## Current Strengths

- There are regression tests for the main projection engine.
- There are golden outputs for multiple drawdown strategies.
- There are tax unit tests for simple banded tax cases.
- There are internal consistency checks for income identity, tax band sums, and
  pot P&L.
- There are now worked-example tests for simple hand-checkable scenarios.

## Current Gaps

### Calculation Correctness Gaps

- Jurisdiction-specific tax correctness has only initial UK pack coverage and
  has not been independently adviser-reviewed.

### Test Quality Gaps

- Some tests assert broad plausibility rather than exact expected values.
- Golden tests protect against accidental changes but can preserve wrong
  behaviour.
- Existing tests do not yet map cleanly back to calculation-spec sections.
- Imported-config shape validation needs more coverage.

### Tooling Gaps

- `npm run lint` currently needs an ESLint 9 flat config.
- Vitest may need a normal, non-sandboxed terminal because Vite/esbuild child
  process spawning can be blocked in some environments.

## Recommended Next Tests

1. Add stronger imported-config shape validation tests.
2. Add adviser-approved jurisdiction tax examples once tax rules are confirmed.
3. Add Isle of Man once official 2026-27 sources are pinned down.

## How To Use This Review

Before changing calculation logic:

1. Update `docs/calculation-spec.md`.
2. Add or update a worked example.
3. Add a focused test.
4. Change the engine.
5. Run TypeScript and relevant tests.
6. Review any changed golden outputs deliberately.
